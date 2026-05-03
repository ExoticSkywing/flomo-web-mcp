import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


@dataclass(frozen=True)
class AuthorizationCandidate:
    url: str
    value: str


@dataclass(frozen=True)
class HarReport:
    entries: int
    flomo_api_requests: int
    preflight_authorization_requests: int
    candidates: list[AuthorizationCandidate]


def analyze_har(har: dict[str, Any]) -> HarReport:
    entries = har.get("log", {}).get("entries", [])
    candidates: list[AuthorizationCandidate] = []
    flomo_api_requests = 0
    preflight_authorization_requests = 0
    seen_values: set[str] = set()

    for entry in entries:
        request = entry.get("request", {})
        url = request.get("url", "")
        if not is_flomo_api_url(url):
            continue

        flomo_api_requests += 1
        headers = request.get("headers", [])

        if has_preflight_authorization_header(headers):
            preflight_authorization_requests += 1

        for header in headers:
            name = header.get("name", "")
            value = header.get("value", "")
            if name.lower() != "authorization" or not value:
                continue
            if value in seen_values:
                continue
            seen_values.add(value)
            candidates.append(AuthorizationCandidate(url=url, value=value))

    return HarReport(
        entries=len(entries),
        flomo_api_requests=flomo_api_requests,
        preflight_authorization_requests=preflight_authorization_requests,
        candidates=candidates,
    )


def is_flomo_api_url(url: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if host not in {"flomoapp.com", "v.flomoapp.com"}:
        return False
    return "/api/" in parsed.path


def has_preflight_authorization_header(headers: list[dict[str, str]]) -> bool:
    for header in headers:
        name = header.get("name", "").lower()
        value = header.get("value", "").lower()
        if name == "access-control-request-headers" and "authorization" in value:
            return True
    return False


def mask_secret(value: str) -> str:
    if len(value) <= 20:
        return value[:6] + "..."
    return value[:15] + "..." + value[-6:]


def load_har(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract FLOMO_AUTHORIZATION from a HAR file exported from browser DevTools.",
    )
    parser.add_argument("har", type=Path, help="Path to the exported .har file.")
    parser.add_argument(
        "--show",
        action="store_true",
        help="Print the full Authorization value instead of a masked value.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = analyze_har(load_har(args.har))

    print(f"entries={report.entries}")
    print(f"flomo_api_requests={report.flomo_api_requests}")
    print(f"preflight_authorization_requests={report.preflight_authorization_requests}")
    print(f"authorization_candidates={len(report.candidates)}")

    if not report.candidates:
        print()
        print("No real Authorization request header value was found in this HAR.")
        if report.preflight_authorization_requests:
            print("The HAR only shows CORS preflight references to the authorization header.")
            print("Re-export with sensitive headers enabled, or copy an actual flomo API request as cURL.")
        return 2

    selected = report.candidates[0]
    value = selected.value if args.show else mask_secret(selected.value)
    print()
    print(f"FLOMO_AUTHORIZATION={value}")
    print(f"source_url={selected.url}")

    if not args.show:
        print()
        print("Run again with --show only if you intentionally want to print the full secret locally.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnvConfig } from "../src/config/env.js";
import { FlomoHttpClient } from "../src/clients/http.js";
import { FlomoAuthError, FlomoRequestError } from "../src/utils/errors.js";

describe("FlomoHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses flomo web origin headers separately from the API base URL", async () => {
    let capturedUrl = "";
    let capturedHeaders = new Headers();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });

    const client = new FlomoHttpClient(makeConfig());

    await client.requestJson("/api/v1/memo/latest_updated_desc");

    expect(capturedUrl).toBe("https://flomoapp.com/api/v1/memo/latest_updated_desc");
    expect(capturedHeaders.get("Origin")).toBe("https://v.flomoapp.com");
    expect(capturedHeaders.get("Referer")).toBe("https://v.flomoapp.com/");
    expect(capturedHeaders.get("platform")).toBe("Web");
    expect(capturedHeaders.get("device-model")).toBe("Other");
    expect(capturedHeaders.get("device-id")).toBe("device-123");
  });

  it("maps common HTTP failures to public flomo error codes", async () => {
    await expectRequestFailure(400, { code: "BAD_REQUEST" });
    await expectRequestFailure(401, FlomoAuthError);
    await expectRequestFailure(403, FlomoAuthError);
    await expectRequestFailure(429, { code: "RATE_LIMITED" });
  });

  it("maps flomo API sign and business failures from JSON responses", async () => {
    await expectApiFailure({ code: -20, message: "sign invalid" }, { code: "SIGN_INVALID" });
    await expectApiFailure({ code: -1, message: "bad payload" }, { code: "BAD_REQUEST" });
  });
});

async function expectRequestFailure(
  status: number,
  expectation: typeof FlomoAuthError | Partial<FlomoRequestError>,
): Promise<void> {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ code: status, message: "failure" }), {
        status,
        headers: {
          "Content-Type": "application/json",
        },
      }),
  );

  const assertion = expect(new FlomoHttpClient(makeConfig()).requestJson("/api/v1/test")).rejects;
  if (typeof expectation === "function") {
    await assertion.toBeInstanceOf(expectation);
    return;
  }

  await assertion.toMatchObject(expectation);
}

async function expectApiFailure(body: unknown, expectation: Partial<FlomoRequestError>): Promise<void> {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
  );

  await expect(new FlomoHttpClient(makeConfig()).requestJson("/api/v1/test")).rejects.toMatchObject(expectation);
}

function makeConfig(): EnvConfig {
  return {
    authorization: "Bearer test",
    userAgent: "test-agent",
    baseUrl: "https://flomoapp.com",
    webBaseUrl: "https://v.flomoapp.com",
    timezone: "Asia/Shanghai",
    logLevel: "info",
    debugRawResponse: false,
    deviceId: "device-123",
    deviceModel: "Other",
    webPlatform: "Web",
  };
}

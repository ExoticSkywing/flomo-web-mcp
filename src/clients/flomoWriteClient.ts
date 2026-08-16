import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import { parseMemo } from "../parsers/memoParser.js";
import { normalizeTags } from "../parsers/tagParser.js";
import type { FlomoWriteClient } from "../types/flomo.js";
import { FlomoRequestError } from "../utils/errors.js";
import { buildFlomoWebQuery, getFlomoTz } from "./flomoWeb.js";
import type { FlomoHttpClient } from "./http.js";

const DEFAULT_WRITE_ENDPOINT = "/api/v1/memo";

export class BearerFlomoWriteClient implements FlomoWriteClient {
  constructor(
    private readonly config: EnvConfig,
    private readonly httpClient: FlomoHttpClient,
    private readonly onCreated?: (memo: Memo) => void,
  ) {}

  async create(input: { content: string; tags?: string[] }): Promise<Memo> {
    if (!input.content.trim()) {
      throw new FlomoRequestError("BAD_REQUEST", "memo content 不能为空。");
    }

    const content = formatCreateContent(input.content, input.tags);
    const payload = buildFlomoWebQuery({
      content,
      created_at: formatFlomoLocalDateTime(this.config.timezone),
      source: "web",
      memo_from: "human",
      file_ids: [],
      tz: getFlomoTz(this.config.timezone),
    });

    const raw = await this.httpClient.requestJson<unknown>(this.config.writeEndpoint ?? DEFAULT_WRITE_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawMemo = extractCreatedMemo(raw);
    const memo = parseMemo(rawMemo, this.config.webBaseUrl ?? this.config.baseUrl);
    this.onCreated?.(memo);
    return memo;
  }
}

export function formatCreateContent(content: string, tags: string[] | undefined): string {
  const normalizedTags = normalizeTags(tags);
  const trimmedContent = formatContentHtml(content);
  if (normalizedTags.length === 0) {
    return trimmedContent;
  }

  return `${trimmedContent}<p>${escapeHtml(normalizedTags.join(" "))}</p>`;
}

function extractCreatedMemo(raw: unknown): unknown {
  if (isMemoLike(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    throw new FlomoRequestError("PARSER_FAILED", "写入接口返回体不是对象。");
  }

  const candidates = [raw.memo, raw.data, raw.item, raw.result];
  for (const candidate of candidates) {
    if (isMemoLike(candidate)) {
      return candidate;
    }
    if (isRecord(candidate)) {
      const nested = [candidate.memo, candidate.data, candidate.item, candidate.result].find(isMemoLike);
      if (nested) {
        return nested;
      }
    }
  }

  throw new FlomoRequestError("PARSER_FAILED", "写入接口返回体中找不到创建后的 memo 对象。");
}

function isMemoLike(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && ("content" in value || "text" in value || "html" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatContentHtml(content: string): string {
  const trimmed = content.trim();
  const paragraphs = trimmed
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`);

  return paragraphs.join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatFlomoLocalDateTime(timezone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));
  return [
    values.get("year"),
    values.get("month"),
    values.get("day"),
  ].join("-") + ` ${values.get("hour")}:${values.get("minute")}:${values.get("second")}`;
}

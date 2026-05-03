import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import { parseMemo } from "../parsers/memoParser.js";
import { normalizeTags } from "../parsers/tagParser.js";
import type { FlomoWriteClient } from "../types/flomo.js";
import { FlomoRequestError } from "../utils/errors.js";
import { buildFlomoWebQuery, getLocalFlomoTz } from "./flomoWeb.js";
import type { FlomoHttpClient } from "./http.js";

const DEFAULT_WRITE_ENDPOINT = "/api/v1/memo";

export class BearerFlomoWriteClient implements FlomoWriteClient {
  constructor(
    private readonly config: EnvConfig,
    private readonly httpClient: FlomoHttpClient,
    private readonly onCreated?: () => void,
  ) {}

  async create(input: { content: string; tags?: string[] }): Promise<Memo> {
    if (!input.content.trim()) {
      throw new FlomoRequestError("BAD_REQUEST", "memo content 不能为空。");
    }

    const content = formatCreateContent(input.content, input.tags);
    const payload = buildFlomoWebQuery({
      content,
      created_at: formatCurrentLocalDateTime(),
      source: "web",
      memo_from: "human",
      file_ids: [],
      tz: getLocalFlomoTz(),
    });

    const raw = await this.httpClient.requestJson<unknown>(this.config.writeEndpoint ?? DEFAULT_WRITE_ENDPOINT, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawMemo = extractCreatedMemo(raw);
    this.onCreated?.();
    return parseMemo(rawMemo, this.config.webBaseUrl ?? this.config.baseUrl);
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
  if (looksLikeHtml(trimmed)) {
    return trimmed;
  }

  const paragraphs = trimmed
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`);

  return paragraphs.join("");
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrentLocalDateTime(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join("-") + ` ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

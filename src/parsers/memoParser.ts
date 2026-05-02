import type { Memo } from "../models/memo.js";
import { FlomoParseError } from "../utils/errors.js";
import { sha256Short } from "../utils/hash.js";
import { htmlToText, normalizeWhitespace } from "../utils/text.js";
import { extractInlineTags, normalizeTags } from "./tagParser.js";

export function parseMemo(raw: unknown, baseUrl = "https://flomoapp.com"): Memo {
  if (!isRecord(raw)) {
    throw new FlomoParseError("memo 不是对象，无法解析。");
  }

  const html = pickString(raw, ["html", "content", "rich_text", "source_content"]);
  const plainText = pickString(raw, ["plain_text", "text", "summary"]);
  const contentSource = plainText ?? html ?? "";
  const content = looksLikeHtml(contentSource) ? htmlToText(contentSource) : normalizeWhitespace(contentSource);
  const slug = pickString(raw, ["slug", "memo_slug", "memo_id", "id"]) ?? sha256Short(JSON.stringify(raw));
  const tags = normalizeTags(raw.tags ?? raw.tag_names ?? raw.labels);
  const inlineTags = extractInlineTags(content);
  const mergedTags = normalizeTags([...tags, ...inlineTags]);
  const url = pickString(raw, ["url", "link", "share_url"]) ?? buildMemoUrl(baseUrl, slug);
  const createdAt = normalizeDate(raw.created_at ?? raw.createdAt ?? raw.created_time ?? raw.created);
  const updatedAt = normalizeDate(raw.updated_at ?? raw.updatedAt ?? raw.updated_time ?? raw.modified_at ?? raw.modified);

  if (!content && !html) {
    throw new FlomoParseError("memo 缺少 content/html/text 字段。");
  }

  return {
    slug,
    content,
    html,
    tags: mergedTags,
    url,
    createdAt,
    updatedAt: updatedAt || createdAt,
  };
}

function buildMemoUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/mine/?memo_id=${encodeURIComponent(slug)}`;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function normalizeDate(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }

  return "";
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

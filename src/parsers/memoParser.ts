import type { Memo, MemoImage } from "../models/memo.js";
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
  const images = extractMemoImages(raw, html);

  if (!content && images.length === 0) {
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
    images,
    imageCount: images.length,
  };
}

const ATTACHMENT_KEYS = ["images", "files", "attachments", "resources", "media"];
const IMAGE_URL_KEYS = ["url", "download_url", "downloadUrl", "src", "source", "thumbnail", "thumbnail_url", "thumbnailUrl"];
const FULL_IMAGE_URL_KEYS = ["url", "download_url", "downloadUrl", "src", "source"];

function extractMemoImages(raw: Record<string, unknown>, html: string | undefined): MemoImage[] {
  const candidates: Array<Omit<MemoImage, "index">> = [];
  if (html) {
    for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
      const url = extractHtmlAttribute(tag, "src") ?? extractHtmlAttribute(tag, "data-src");
      if (!url) {
        continue;
      }
      candidates.push({
        url: decodeHtmlAttribute(url),
        ...optionalField("alt", extractHtmlAttribute(tag, "alt")),
      });
    }
  }

  for (const key of ATTACHMENT_KEYS) {
    collectAttachmentImages(raw[key], candidates);
  }

  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const url = normalizeImageUrl(candidate.url);
    if (!url || seen.has(url)) {
      return [];
    }
    seen.add(url);
    return [{ ...candidate, url, index: seen.size }];
  });
}

function collectAttachmentImages(value: unknown, target: Array<Omit<MemoImage, "index">>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAttachmentImages(item, target);
    }
    return;
  }
  if (typeof value === "string") {
    if (looksLikeImageUrl(value)) {
      target.push({ url: value });
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }

  const url = pickString(value, FULL_IMAGE_URL_KEYS) ?? pickString(value, IMAGE_URL_KEYS);
  const mimeType = pickString(value, ["mime_type", "mimeType", "content_type", "contentType", "type"]);
  const fileName = pickString(value, ["name", "file_name", "fileName", "filename"]);
  if (url && (looksLikeImageUrl(url) || mimeType?.toLowerCase().startsWith("image/"))) {
    target.push({
      url,
      ...optionalField("fileName", fileName),
      ...optionalField("mimeType", mimeType?.toLowerCase()),
    });
  }
}

function extractHtmlAttribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&#38;/g, "&");
}

function normalizeImageUrl(value: string): string | undefined {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function looksLikeImageUrl(value: string): boolean {
  try {
    const pathname = new URL(value).pathname;
    return /\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname);
  } catch {
    return false;
  }
}

function optionalField<Key extends string>(key: Key, value: string | undefined): Partial<Record<Key, string>> {
  const normalized = value?.trim();
  return normalized ? ({ [key]: normalized } as Record<Key, string>) : {};
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

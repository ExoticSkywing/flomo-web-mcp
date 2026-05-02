import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import { parseMemo } from "../parsers/memoParser.js";
import { normalizeTags } from "../parsers/tagParser.js";
import type { FlomoWriteClient } from "../types/flomo.js";
import { FlomoRequestError } from "../utils/errors.js";
import type { FlomoHttpClient } from "./http.js";

export class BearerFlomoWriteClient implements FlomoWriteClient {
  constructor(
    private readonly config: EnvConfig,
    private readonly httpClient: FlomoHttpClient,
  ) {}

  async create(input: { content: string; tags?: string[] }): Promise<Memo> {
    if (!this.config.writeEndpoint) {
      throw new FlomoRequestError(
        "REMOTE_CHANGED",
        "未配置 FLOMO_WRITE_ENDPOINT，请先用 DevTools 抓取 flomo 新建 memo 的内部接口。",
      );
    }

    const content = formatCreateContent(input.content, input.tags);
    const raw = await this.httpClient.requestJson<unknown>(this.config.writeEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    });

    const rawMemo = extractCreatedMemo(raw);
    return parseMemo(rawMemo, this.config.baseUrl);
  }
}

export function formatCreateContent(content: string, tags: string[] | undefined): string {
  const normalizedTags = normalizeTags(tags);
  const trimmedContent = content.trim();
  if (normalizedTags.length === 0) {
    return trimmedContent;
  }

  return `${trimmedContent}\n\n${normalizedTags.join(" ")}`;
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

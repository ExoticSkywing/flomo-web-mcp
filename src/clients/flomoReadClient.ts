import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import { parseMemo } from "../parsers/memoParser.js";
import type { FlomoReadClient } from "../types/flomo.js";
import { FlomoRequestError } from "../utils/errors.js";
import type { FlomoHttpClient } from "./http.js";

const CACHE_TTL_MS = 45_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class BearerFlomoReadClient implements FlomoReadClient {
  private cache?: { expiresAt: number; items: Memo[] };

  constructor(
    private readonly config: EnvConfig,
    private readonly httpClient: FlomoHttpClient,
  ) {}

  async list(limit = DEFAULT_LIMIT): Promise<Memo[]> {
    const items = await this.getRecentBatch();
    return items.slice(0, normalizeLimit(limit));
  }

  async search(query: string, limit = DEFAULT_LIMIT): Promise<Memo[]> {
    const items = await this.getRecentBatch();
    return filterMemos(items, query, normalizeLimit(limit));
  }

  async getBySlug(slug: string): Promise<Memo | null> {
    const items = await this.getRecentBatch();
    return items.find((item) => item.slug === slug) ?? null;
  }

  async getRecentBatch(_cursor?: string): Promise<Memo[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.items;
    }

    if (!this.config.readEndpoint) {
      throw new FlomoRequestError(
        "REMOTE_CHANGED",
        "未配置 FLOMO_READ_ENDPOINT，请先用 DevTools 抓取 flomo 最近 memo 的内部接口。",
      );
    }

    const raw = await this.httpClient.requestJson<unknown>(this.config.readEndpoint);
    const rawItems = extractMemoArray(raw);
    const items = rawItems.map((item) => parseMemo(item, this.config.baseUrl));
    this.cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      items,
    };
    return items;
  }
}

export function filterMemos(items: Memo[], query: string, limit = DEFAULT_LIMIT): Memo[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return items
    .filter((item) => {
      const haystack = `${item.content}\n${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, normalizeLimit(limit));
}

function extractMemoArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    throw new FlomoRequestError("PARSER_FAILED", "读取接口返回体不是对象或数组。");
  }

  const candidates = [raw.memos, raw.memo_list, raw.items, raw.list, raw.data, raw.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (isRecord(candidate)) {
      const nested = tryExtractMemoArray(candidate);
      if (nested) {
        return nested;
      }
    }
  }

  throw new FlomoRequestError("PARSER_FAILED", "读取接口返回体中找不到 memo 数组字段。");
}

function tryExtractMemoArray(raw: Record<string, unknown>): unknown[] | undefined {
  const candidates = [raw.memos, raw.memo_list, raw.items, raw.list, raw.data, raw.result];
  return candidates.find(Array.isArray);
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

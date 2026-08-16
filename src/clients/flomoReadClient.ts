import type { EnvConfig } from "../config/env.js";
import type { Memo } from "../models/memo.js";
import { parseMemo } from "../parsers/memoParser.js";
import type {
  FlomoReadClient,
  FreshnessResult,
  MemoPageCursor,
  SyncNotesOptions,
  SyncNotesResult,
  SyncNotesStatus,
  RawFlomoMemo,
} from "../types/flomo.js";
import { FlomoParseError, FlomoRequestError } from "../utils/errors.js";
import { appendQueryString, buildFlomoWebQuery, getFlomoTz } from "./flomoWeb.js";
import type { FlomoHttpClient } from "./http.js";

const CACHE_TTL_MS = 45_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_SYNC_PAGE_SIZE = 200;
const MAX_SYNC_PAGE_SIZE = 200;
const DEFAULT_SYNC_MAX_PAGES = 50;
const MAX_SYNC_MAX_PAGES = 100;
const INCREMENTAL_OVERLAP_SECONDS = 2;
const ZERO_CURSOR: MemoPageCursor = { latestUpdatedAt: 0, latestSlug: "" };
const DEFAULT_READ_ENDPOINT = "/api/v1/memo/latest_updated_desc";
const DEFAULT_SYNC_ENDPOINT = "/api/v1/memo/updated/";

interface SyncedCache {
  complete: boolean;
  items: Map<string, Memo>;
  syncedAt: string;
  watermark?: MemoPageCursor;
  nextCursor?: MemoPageCursor;
}

interface RawSyncPage {
  rawItems: RawFlomoMemo[];
  rawCount: number;
  nextCursor?: MemoPageCursor;
}

function requireNextCursorForFullPage(page: RawSyncPage, pageSize: number): MemoPageCursor | undefined {
  if (page.rawCount < pageSize) {
    return page.nextCursor;
  }
  if (!page.nextCursor || !page.nextCursor.latestSlug || page.nextCursor.latestUpdatedAt <= 0) {
    throw new FlomoParseError("flomo 同步返回了完整分页，但末行缺少有效的 updated_at + slug 游标，拒绝提交不完整快照。");
  }
  return page.nextCursor;
}

interface FullSyncCollection {
  items: Map<string, Memo>;
  pages: number;
  complete: boolean;
  watermark?: MemoPageCursor;
  nextCursor?: MemoPageCursor;
}

interface IncrementalCollection {
  changes: Map<string, unknown>;
  pages: number;
  complete: boolean;
  watermark?: MemoPageCursor;
}

export class BearerFlomoReadClient implements FlomoReadClient {
  private cache?: { expiresAt: number; items: Memo[] };
  private syncedCache?: SyncedCache;
  private freshnessInFlight?: Promise<FreshnessResult>;

  constructor(
    private readonly config: EnvConfig,
    private readonly httpClient: FlomoHttpClient,
  ) {}

  async list(limit = DEFAULT_LIMIT): Promise<Memo[]> {
    const items = await this.getRecentBatch();
    return items.slice(0, normalizeLimit(limit));
  }

  async search(query = "", limit = DEFAULT_LIMIT, tag?: string): Promise<Memo[]> {
    const items = await this.getRecentBatch();
    return filterMemos(items, query, normalizeLimit(limit), tag);
  }

  async getBySlug(slug: string): Promise<Memo | null> {
    const items = await this.getRecentBatch();
    return items.find((item) => item.slug === slug) ?? null;
  }

  async refreshBySlug(slug: string): Promise<Memo | null> {
    this.cache = undefined;
    const items = await this.getRecentBatch();
    const memo = items.find((item) => item.slug === slug) ?? null;
    if (memo && this.syncedCache?.complete) {
      this.syncedCache.items.set(memo.slug, memo);
      this.syncedCache.watermark = newestCursor(this.syncedCache.watermark, cursorFromMemo(memo));
    }
    return memo;
  }

  async getRecentBatch(_cursor?: string): Promise<Memo[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.items;
    }

    const endpoint = this.buildReadEndpoint(this.config.readEndpoint ?? DEFAULT_READ_ENDPOINT);
    const raw = await this.httpClient.requestJson<unknown>(endpoint);
    const rawItems = extractMemoArray(raw);
    const items = rawItems.map((item) => parseMemo(item, this.config.webBaseUrl ?? this.config.baseUrl));
    this.cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      items,
    };
    return items;
  }

  async syncAll(options: SyncNotesOptions = {}): Promise<SyncNotesResult> {
    const pageSize = normalizeBoundedInteger(options.pageSize, DEFAULT_SYNC_PAGE_SIZE, MAX_SYNC_PAGE_SIZE);
    const maxPages = normalizeBoundedInteger(options.maxPages, DEFAULT_SYNC_MAX_PAGES, MAX_SYNC_MAX_PAGES);
    const collected = await this.collectFullSync(pageSize, maxPages);
    const syncedAt = new Date().toISOString();

    if (collected.complete) {
      this.syncedCache = {
        complete: true,
        items: collected.items,
        syncedAt,
        watermark: collected.watermark ?? ZERO_CURSOR,
      };
      this.cache = undefined;
    }

    return {
      synced: collected.items.size,
      totalCached: collected.complete ? collected.items.size : (this.syncedCache?.items.size ?? collected.items.size),
      pages: collected.pages,
      complete: collected.complete,
      syncedAt,
      ...(collected.nextCursor ? { nextCursor: collected.nextCursor } : {}),
    };
  }

  async ensureFresh(options: SyncNotesOptions = {}): Promise<FreshnessResult> {
    if (this.freshnessInFlight) {
      return this.freshnessInFlight;
    }

    const operation = this.runEnsureFresh(options);
    this.freshnessInFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.freshnessInFlight === operation) {
        this.freshnessInFlight = undefined;
      }
    }
  }

  async listSynced(limit = DEFAULT_LIMIT): Promise<Memo[]> {
    return sortMemosByUpdatedAt(this.requireSyncedItems()).slice(0, normalizeLimit(limit));
  }

  async searchSynced(query = "", limit = DEFAULT_LIMIT, tag?: string): Promise<Memo[]> {
    return filterMemos(this.requireSyncedItems(), query, normalizeLimit(limit), tag);
  }

  async getSyncedBySlug(slug: string): Promise<Memo | null> {
    return this.requireSyncedMap().get(slug) ?? null;
  }

  getSyncStatus(): SyncNotesStatus {
    if (!this.syncedCache) {
      return {
        synced: false,
        totalCached: 0,
        complete: false,
      };
    }

    return {
      synced: true,
      totalCached: this.syncedCache.items.size,
      complete: this.syncedCache.complete,
      syncedAt: this.syncedCache.syncedAt,
      ...(this.syncedCache.nextCursor ? { nextCursor: this.syncedCache.nextCursor } : {}),
    };
  }

  recordCreated(memo: Memo): void {
    this.cache = undefined;
    if (!this.syncedCache?.complete) {
      return;
    }
    this.syncedCache.items.set(memo.slug, memo);
    this.syncedCache.watermark = newestCursor(this.syncedCache.watermark, cursorFromMemo(memo));
  }

  clearCache(): void {
    this.cache = undefined;
    this.syncedCache = undefined;
  }

  private async runEnsureFresh(options: SyncNotesOptions): Promise<FreshnessResult> {
    const pageSize = normalizeBoundedInteger(options.pageSize, DEFAULT_SYNC_PAGE_SIZE, MAX_SYNC_PAGE_SIZE);
    const maxPages = normalizeBoundedInteger(options.maxPages, DEFAULT_SYNC_MAX_PAGES, MAX_SYNC_MAX_PAGES);

    if (!this.syncedCache?.complete) {
      const result = await this.syncAll({ pageSize, maxPages });
      if (!result.complete) {
        this.syncedCache = undefined;
        throw new FlomoRequestError(
          "REMOTE_CHANGED",
          "flomo 全量同步未到达末尾，拒绝使用不完整缓存回答。请提高 maxPages 后重试。",
        );
      }
      return {
        initialized: true,
        mode: "full",
        changed: result.totalCached,
        added: result.totalCached,
        updated: 0,
        deleted: 0,
        totalCached: result.totalCached,
        pages: result.pages,
        complete: true,
        syncedAt: result.syncedAt,
      };
    }

    const current = this.syncedCache;
    const collected = await this.collectIncremental(current.watermark, pageSize, maxPages);
    if (!collected.complete) {
      throw new FlomoRequestError(
        "REMOTE_CHANGED",
        "flomo 增量同步未覆盖到上次同步边界，拒绝返回可能过期的结果。请提高 maxPages 后重试。",
      );
    }

    const nextItems = new Map(current.items);
    let added = 0;
    let updated = 0;
    let deleted = 0;
    for (const raw of collected.changes.values()) {
      const slug = extractMemoSlug(raw);
      if (!slug) {
        continue;
      }
      if (isDeletedMemo(raw)) {
        if (nextItems.delete(slug)) {
          deleted += 1;
        }
        continue;
      }

      const memo = parseMemo(raw, this.config.webBaseUrl ?? this.config.baseUrl);
      const previous = nextItems.get(slug);
      if (!previous) {
        nextItems.set(slug, memo);
        added += 1;
      } else if (!sameMemo(previous, memo)) {
        nextItems.set(slug, memo);
        updated += 1;
      }
    }

    const syncedAt = new Date().toISOString();
    this.syncedCache = {
      complete: true,
      items: nextItems,
      syncedAt,
      watermark: newestCursor(current.watermark, collected.watermark),
    };
    this.cache = undefined;

    return {
      initialized: false,
      mode: "incremental",
      changed: added + updated + deleted,
      added,
      updated,
      deleted,
      totalCached: nextItems.size,
      pages: collected.pages,
      complete: true,
      syncedAt,
    };
  }

  private async collectFullSync(pageSize: number, maxPages: number): Promise<FullSyncCollection> {
    const items = new Map<string, Memo>();
    let cursor: MemoPageCursor | undefined = { latestUpdatedAt: 0, latestSlug: "" };
    let nextCursor: MemoPageCursor | undefined;
    let watermark: MemoPageCursor | undefined;
    let complete = false;
    let pages = 0;

    while (pages < maxPages) {
      const page = await this.requestSyncPage(cursor ?? ZERO_CURSOR, pageSize);
      pages += 1;
      watermark = newestCursor(watermark, newestRawCursor(page.rawItems));

      for (const raw of page.rawItems) {
        const slug = extractMemoSlug(raw);
        if (!slug || items.has(slug) || isDeletedMemo(raw)) {
          continue;
        }
        items.set(slug, parseMemo(raw, this.config.webBaseUrl ?? this.config.baseUrl));
      }

      nextCursor = requireNextCursorForFullPage(page, pageSize);
      if (page.rawCount === 0 || page.rawCount < pageSize || !nextCursor) {
        complete = true;
        nextCursor = undefined;
        break;
      }
      cursor = nextCursor;
    }

    return { items, pages, complete, watermark, nextCursor };
  }

  private async collectIncremental(
    watermark: MemoPageCursor | undefined,
    pageSize: number,
    maxPages: number,
  ): Promise<IncrementalCollection> {
    if (!watermark) {
      return this.collectIncremental(ZERO_CURSOR, pageSize, maxPages);
    }

    const changes = new Map<string, unknown>();
    const overlapStart: MemoPageCursor = {
      latestUpdatedAt: Math.max(0, watermark.latestUpdatedAt - INCREMENTAL_OVERLAP_SECONDS),
      latestSlug: "",
    };
    let cursor: MemoPageCursor | undefined = { latestUpdatedAt: 0, latestSlug: "" };
    let newest: MemoPageCursor | undefined;
    let complete = false;
    let pages = 0;

    while (pages < maxPages) {
      const page = await this.requestSyncPage(cursor ?? ZERO_CURSOR, pageSize);
      pages += 1;
      newest = newestCursor(newest, newestRawCursor(page.rawItems));
      let crossedBoundary = false;

      for (const raw of page.rawItems) {
        const rawCursor = cursorFromRaw(raw);
        if (rawCursor && rawCursor.latestUpdatedAt < overlapStart.latestUpdatedAt) {
          crossedBoundary = true;
          break;
        }
        const slug = extractMemoSlug(raw);
        if (slug && !changes.has(slug)) {
          changes.set(slug, raw);
        }
      }

      const nextCursor = requireNextCursorForFullPage(page, pageSize);
      if (crossedBoundary || page.rawCount === 0 || page.rawCount < pageSize || !nextCursor) {
        complete = true;
        break;
      }
      cursor = nextCursor;
    }

    return { changes, pages, complete, watermark: newest };
  }

  private buildReadEndpoint(endpoint: string): string {
    if (/[?&]sign=/.test(endpoint)) {
      return endpoint;
    }

    const params = buildFlomoWebQuery({
      tz: getFlomoTz(this.config.timezone),
    });
    return appendQueryString(endpoint, params);
  }

  private async requestSyncPage(cursor: MemoPageCursor, pageSize: number): Promise<RawSyncPage> {
    const endpoint = this.buildSyncEndpoint(this.config.syncEndpoint ?? DEFAULT_SYNC_ENDPOINT, cursor, pageSize);
    const raw = await this.httpClient.requestJson<unknown>(endpoint);
    const rawItems = extractMemoArray(raw);
    return {
      rawItems,
      rawCount: rawItems.length,
      nextCursor: extractNextCursor(rawItems),
    };
  }

  private buildSyncEndpoint(endpoint: string, cursor: MemoPageCursor | undefined, pageSize: number): string {
    if (/[?&]sign=/.test(endpoint)) {
      return endpoint;
    }

    const params = buildFlomoWebQuery({
      limit: pageSize,
      latest_updated_at: cursor?.latestUpdatedAt ?? 0,
      latest_slug: cursor?.latestSlug ?? "",
      tz: getFlomoTz(this.config.timezone),
    });
    return appendQueryString(endpoint, params);
  }

  private requireSyncedMap(): Map<string, Memo> {
    if (!this.syncedCache) {
      throw new FlomoRequestError("BAD_REQUEST", "尚未建立 flomo 内存快照，请先刷新。");
    }
    return this.syncedCache.items;
  }

  private requireSyncedItems(): Memo[] {
    return [...this.requireSyncedMap().values()];
  }
}

export function filterMemos(items: Memo[], query = "", limit = DEFAULT_LIMIT, tag?: string): Memo[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTag = normalizeTagKey(tag);
  if (!normalizedQuery && !normalizedTag) {
    return [];
  }

  return sortMemosByUpdatedAt(items)
    .filter((item) => {
      if (normalizedTag && !item.tags.some((itemTag) => normalizeTagKey(itemTag) === normalizedTag)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      const haystack = `${item.content}\n${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, normalizeLimit(limit));
}

function normalizeTagKey(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^#+/, "").toLowerCase();
  return normalized || undefined;
}

function sortMemosByUpdatedAt(items: Memo[]): Memo[] {
  return [...items].sort((left, right) => {
    const timeDifference = dateMilliseconds(right.updatedAt) - dateMilliseconds(left.updatedAt);
    return timeDifference || right.slug.localeCompare(left.slug);
  });
}

function dateMilliseconds(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractMemoArray(raw: unknown): RawFlomoMemo[] {
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

function tryExtractMemoArray(raw: Record<string, unknown>): RawFlomoMemo[] | undefined {
  const candidates = [raw.memos, raw.memo_list, raw.items, raw.list, raw.data, raw.result];
  return candidates.find(Array.isArray);
}

function normalizeLimit(limit: number): number {
  return normalizeBoundedInteger(limit, DEFAULT_LIMIT, MAX_LIMIT);
}

function normalizeBoundedInteger(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.trunc(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDeletedMemo(raw: unknown): boolean {
  if (!isRecord(raw) || !Object.hasOwn(raw, "deleted_at")) {
    return false;
  }

  const deletedAt = raw.deleted_at;
  return deletedAt !== null && deletedAt !== undefined && String(deletedAt).trim() !== "";
}

function extractMemoSlug(raw: unknown): string | undefined {
  return isRecord(raw) ? pickString(raw, ["slug", "memo_slug", "memo_id", "id"]) : undefined;
}

function extractNextCursor(rawItems: unknown[]): MemoPageCursor | undefined {
  return cursorFromRaw(rawItems.at(-1));
}

function newestRawCursor(rawItems: unknown[]): MemoPageCursor | undefined {
  return rawItems.reduce<MemoPageCursor | undefined>((newest, raw) => newestCursor(newest, cursorFromRaw(raw)), undefined);
}

function cursorFromRaw(raw: unknown): MemoPageCursor | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const latestSlug = pickString(raw, ["slug", "memo_slug", "memo_id", "id"]);
  const latestUpdatedAt = pickUnixSeconds(raw.updated_at ?? raw.updatedAt ?? raw.updated_time ?? raw.modified_at ?? raw.modified);
  if (!latestSlug || latestUpdatedAt === undefined) {
    return undefined;
  }
  return { latestUpdatedAt, latestSlug };
}

function cursorFromMemo(memo: Memo): MemoPageCursor | undefined {
  const latestUpdatedAt = pickUnixSeconds(memo.updatedAt);
  return latestUpdatedAt === undefined ? undefined : { latestUpdatedAt, latestSlug: memo.slug };
}

function newestCursor(
  left: MemoPageCursor | undefined,
  right: MemoPageCursor | undefined,
): MemoPageCursor | undefined {
  if (!left) return right;
  if (!right) return left;
  if (right.latestUpdatedAt !== left.latestUpdatedAt) {
    return right.latestUpdatedAt > left.latestUpdatedAt ? right : left;
  }
  return right.latestSlug.localeCompare(left.latestSlug) > 0 ? right : left;
}

function sameMemo(left: Memo, right: Memo): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function pickUnixSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? Math.trunc(value) : Math.trunc(value / 1000);
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return pickUnixSeconds(numeric);
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed / 1000);
    }
  }

  return undefined;
}

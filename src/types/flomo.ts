import type { Memo } from "../models/memo.js";

export type NotesScopeSource = "recent_notes" | "all_synced_notes";

export interface MemoPageCursor {
  latestUpdatedAt: number;
  latestSlug: string;
}

export interface SyncNotesOptions {
  pageSize?: number;
  maxPages?: number;
}

export interface SyncNotesResult {
  synced: number;
  totalCached: number;
  pages: number;
  complete: boolean;
  syncedAt: string;
  nextCursor?: MemoPageCursor;
}

export interface SyncNotesStatus {
  synced: boolean;
  totalCached: number;
  complete: boolean;
  syncedAt?: string;
  nextCursor?: MemoPageCursor;
}

export interface FreshnessResult {
  initialized: boolean;
  mode: "full" | "incremental";
  changed: number;
  added: number;
  updated: number;
  deleted: number;
  totalCached: number;
  pages: number;
  complete: true;
  syncedAt: string;
}

export interface FlomoReadClient {
  list(limit?: number): Promise<Memo[]>;
  search(query?: string, limit?: number, tag?: string): Promise<Memo[]>;
  getBySlug(slug: string): Promise<Memo | null>;
  getRecentBatch(cursor?: string): Promise<Memo[]>;
  syncAll(options?: SyncNotesOptions): Promise<SyncNotesResult>;
  ensureFresh?(options?: SyncNotesOptions): Promise<FreshnessResult>;
  listSynced?(limit?: number): Promise<Memo[]>;
  searchSynced(query?: string, limit?: number, tag?: string): Promise<Memo[]>;
  getSyncedBySlug(slug: string): Promise<Memo | null>;
  getSyncStatus(): SyncNotesStatus;
  refreshBySlug(slug: string): Promise<Memo | null>;
  recordCreated?(memo: Memo): void;
}

export interface MemoImageFailure {
  index: number;
  code: string;
  message: string;
}

export interface DownloadedMemoImage {
  index: number;
  data: string;
  mimeType: string;
  size: number;
}

export interface MemoImageLoadResult {
  images: DownloadedMemoImage[];
  failures: MemoImageFailure[];
}

export interface MemoImageLoader {
  load(memo: Memo): Promise<MemoImageLoadResult>;
}

export interface FlomoWriteClient {
  create(input: { content: string; tags?: string[] }): Promise<Memo>;
}

export type RawFlomoMemo = Record<string, unknown>;

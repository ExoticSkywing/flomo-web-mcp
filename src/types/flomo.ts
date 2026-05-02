import type { Memo } from "../models/memo.js";

export interface FlomoReadClient {
  list(limit?: number): Promise<Memo[]>;
  search(query: string, limit?: number): Promise<Memo[]>;
  getBySlug(slug: string): Promise<Memo | null>;
  getRecentBatch(cursor?: string): Promise<Memo[]>;
}

export interface FlomoWriteClient {
  create(input: { content: string; tags?: string[] }): Promise<Memo>;
}

export type RawFlomoMemo = Record<string, unknown>;

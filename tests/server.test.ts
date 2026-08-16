import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { EnvConfig } from "../src/config/env.js";
import type { FlomoReadClient, MemoImageLoader } from "../src/types/flomo.js";
import { createFlomoMcpServer } from "../src/server.js";
import { registerGetNoteTool } from "../src/tools/getNote.js";
import { registerSearchNotesTool } from "../src/tools/searchNotes.js";
import { registerSyncNotesTool } from "../src/tools/syncNotes.js";

describe("createFlomoMcpServer", () => {
  it("loads over MCP transport, lists tools, and serves the ping tool without flomo credentials", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createFlomoMcpServer(makeConfig());
    const client = new Client({
      name: "flomo-web-mcp-test",
      version: "0.0.0",
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "create_note",
        "get_note",
        "list_notes",
        "ping",
        "search_notes",
        "sync_notes",
      ]);
      expect(tools.tools.find((tool) => tool.name === "search_notes")?.description).toMatch(/refresh/i);
      expect(tools.tools.find((tool) => tool.name === "get_note")?.description).toMatch(/refresh/i);

      const result = await client.callTool({ name: "ping", arguments: {} });
      const payload = parseToolJson(result);

      expect(payload).toMatchObject({
        ok: true,
        name: "flomo-web-mcp",
        version: "0.1.0",
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("uses fresh all-notes scope for search and get results", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({
      name: "flomo-web-mcp-tool-test",
      version: "0.0.0",
    });
    const client = new Client({
      name: "flomo-web-mcp-tool-client",
      version: "0.0.0",
    });
    const readClient = {
      async list() {
        return [];
      },
      async search() {
        return [];
      },
      async getBySlug() {
        return null;
      },
      async refreshBySlug() {
        return null;
      },
      async getRecentBatch() {
        return [];
      },
      async syncAll() {
        return {
          synced: 0,
          totalCached: 0,
          pages: 0,
          complete: true,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
      async ensureFresh() {
        return {
          initialized: false,
          mode: "incremental" as const,
          changed: 0,
          added: 0,
          updated: 0,
          deleted: 0,
          totalCached: 0,
          pages: 1,
          complete: true as const,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
      async listSynced() {
        return [];
      },
      async searchSynced() {
        return [];
      },
      async getSyncedBySlug() {
        return null;
      },
      getSyncStatus() {
        return {
          synced: true,
          totalCached: 0,
          complete: true,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
    } satisfies FlomoReadClient;

    registerSearchNotesTool(server, readClient);
    registerGetNoteTool(server, readClient, emptyImageLoader());

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const searchResult = await client.callTool({ name: "search_notes", arguments: { query: "missing" } });
      const searchPayload = parseToolJson(searchResult);
      expect(searchPayload).toMatchObject({
        ok: true,
        items: [],
        scope: {
          source: "all_synced_notes",
          complete: true,
        },
      });

      const getResult = await client.callTool({ name: "get_note", arguments: { slug: "missing" } });
      const getPayload = parseToolJson(getResult);
      expect(getPayload).toMatchObject({
        ok: true,
        memo: null,
        scope: {
          source: "all_synced_notes",
          complete: true,
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("refreshes the full in-memory snapshot before searching and supports one exact tag query", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({
      name: "flomo-web-mcp-fresh-search-test",
      version: "0.0.0",
    });
    const client = new Client({
      name: "flomo-web-mcp-fresh-search-client",
      version: "0.0.0",
    });
    const calls: string[] = [];
    const readClient = {
      async ensureFresh() {
        calls.push("ensureFresh");
        return {
          initialized: false,
          changed: 1,
          added: 0,
          updated: 1,
          deleted: 0,
          totalCached: 500,
          pages: 1,
          complete: true,
          syncedAt: "2026-08-15T00:00:00.000Z",
        };
      },
      async searchSynced(query: string, _limit?: number, tag?: string) {
        calls.push(`search:${query}:${tag}`);
        return [makeMemo("agent", 0)];
      },
      getSyncStatus() {
        return { synced: true, totalCached: 500, complete: true, syncedAt: "2026-08-15T00:00:00.000Z" };
      },
    } as unknown as FlomoReadClient;

    registerSearchNotesTool(server, readClient);
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "search_notes", arguments: { tag: "#Agent", limit: 20 } });
      expect(parseToolJson(result)).toMatchObject({
        ok: true,
        items: [{ slug: "agent" }],
        freshness: { complete: true, changed: 1, totalCached: 500 },
        scope: { source: "all_synced_notes", complete: true },
      });
      expect(calls).toEqual(["ensureFresh", "search:undefined:#Agent"]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("fails closed instead of returning stale search results when freshness sync fails", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({ name: "freshness-failure-server", version: "0.0.0" });
    const client = new Client({ name: "freshness-failure-client", version: "0.0.0" });
    let searched = false;
    const readClient = {
      async ensureFresh() {
        throw new Error("network unavailable");
      },
      async searchSynced() {
        searched = true;
        return [makeMemo("stale", 0)];
      },
    } as unknown as FlomoReadClient;
    registerSearchNotesTool(server, readClient);

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "search_notes", arguments: { query: "agent" } });
      expect(result.isError).toBe(true);
      expect(parseToolJson(result)).toMatchObject({ ok: false, error: { message: "network unavailable" } });
      expect(searched).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("syncs all notes without returning memo contents and searches the synced cache when requested", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({
      name: "flomo-web-mcp-sync-tool-test",
      version: "0.0.0",
    });
    const client = new Client({
      name: "flomo-web-mcp-sync-tool-client",
      version: "0.0.0",
    });
    const readClient = {
      async list() {
        return [];
      },
      async search() {
        return [];
      },
      async getBySlug() {
        return null;
      },
      async refreshBySlug() {
        return null;
      },
      async getRecentBatch() {
        return [];
      },
      async syncAll() {
        return {
          synced: 12,
          totalCached: 12,
          pages: 2,
          complete: true,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
      async ensureFresh() {
        return {
          initialized: false,
          mode: "incremental" as const,
          changed: 0,
          added: 0,
          updated: 0,
          deleted: 0,
          totalCached: 12,
          pages: 1,
          complete: true as const,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
      async listSynced() {
        return [];
      },
      async searchSynced() {
        return [
          {
            slug: "synced-note",
            content: "Synced search result",
            tags: ["#sync"],
            url: "https://v.flomoapp.com/mine/?memo_id=synced-note",
            createdAt: "",
            updatedAt: "",
            images: [],
            imageCount: 0,
          },
        ];
      },
      async getSyncedBySlug() {
        return null;
      },
      getSyncStatus() {
        return {
          synced: true,
          totalCached: 12,
          complete: true,
          syncedAt: "2026-05-03T00:00:00.000Z",
        };
      },
    } satisfies FlomoReadClient;

    registerSyncNotesTool(server, readClient);
    registerSearchNotesTool(server, readClient);

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const syncResult = await client.callTool({ name: "sync_notes", arguments: { pageSize: 200, maxPages: 3 } });
      const syncPayload = parseToolJson(syncResult);
      expect(syncPayload).toMatchObject({
        ok: true,
        synced: 12,
        totalCached: 12,
        pages: 2,
        complete: true,
        scope: {
          source: "all_synced_notes",
          complete: true,
        },
      });
      expect(syncPayload.items).toBeUndefined();
      expect(syncPayload.memos).toBeUndefined();

      const searchResult = await client.callTool({
        name: "search_notes",
        arguments: { query: "sync", scope: "all_synced_notes" },
      });
      const searchPayload = parseToolJson(searchResult);
      expect(searchPayload).toMatchObject({
        ok: true,
        items: [{ slug: "synced-note" }],
        scope: {
          source: "all_synced_notes",
          complete: true,
        },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("returns ordered ImageContent blocks and explicit complete metadata", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({ name: "multimodal-server", version: "0.0.0" });
    const client = new Client({ name: "multimodal-client", version: "0.0.0" });
    const memo = makeMemo("with-images", 2);
    const imageLoader: MemoImageLoader = {
      async load() {
        return {
          images: [
            { index: 1, data: "aW1hZ2Utb25l", mimeType: "image/png", size: 9 },
            { index: 2, data: "aW1hZ2UtdHdv", mimeType: "image/jpeg", size: 9 },
          ],
          failures: [],
        };
      },
    };
    registerGetNoteTool(server, makeReadClient(memo), imageLoader);

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "get_note", arguments: { slug: memo.slug } });
      const content = Array.isArray(result.content) ? result.content : [];

      expect(parseToolJson(result)).toMatchObject({
        ok: true,
        status: "complete",
        memo: { slug: "with-images", imageCount: 2 },
        images: { declared: 2, loaded: 2, failed: [] },
      });
      expect(content.slice(1)).toEqual([
        { type: "image", data: "aW1hZ2Utb25l", mimeType: "image/png" },
        { type: "image", data: "aW1hZ2UtdHdv", mimeType: "image/jpeg" },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("marks a memo partial and retains successful images when one fails", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({ name: "partial-server", version: "0.0.0" });
    const client = new Client({ name: "partial-client", version: "0.0.0" });
    const memo = makeMemo("partial", 2);
    registerGetNoteTool(server, makeReadClient(memo), {
      async load() {
        return {
          images: [{ index: 1, data: "aW1hZ2U=", mimeType: "image/png", size: 5 }],
          failures: [{ index: 2, code: "IMAGE_TIMEOUT", message: "图片请求超时。" }],
        };
      },
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "get_note", arguments: { slug: memo.slug } });

      expect(parseToolJson(result)).toMatchObject({
        status: "partial",
        images: {
          declared: 2,
          loaded: 1,
          failed: [{ index: 2, code: "IMAGE_TIMEOUT" }],
        },
      });
      expect(Array.isArray(result.content) ? result.content : []).toHaveLength(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("refreshes memo attachment URLs once after a 403 and retries image loading", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer({ name: "refresh-server", version: "0.0.0" });
    const client = new Client({ name: "refresh-client", version: "0.0.0" });
    const staleMemo = makeMemo("refresh", 1);
    const freshMemo = {
      ...staleMemo,
      images: [{ index: 1, url: "https://static.flomoapp.com/fresh.png" }],
    };
    const readClient = makeReadClient(staleMemo);
    let refreshed = 0;
    readClient.refreshBySlug = async () => {
      refreshed += 1;
      return freshMemo;
    };
    let loaded = 0;
    registerGetNoteTool(server, readClient, {
      async load() {
        loaded += 1;
        return loaded === 1
          ? { images: [], failures: [{ index: 1, code: "IMAGE_AUTH_EXPIRED", message: "图片请求失败，HTTP 403。" }] }
          : { images: [{ index: 1, data: "ZnJlc2g=", mimeType: "image/png", size: 5 }], failures: [] };
      },
    });

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({ name: "get_note", arguments: { slug: staleMemo.slug } });
      expect(parseToolJson(result)).toMatchObject({ status: "complete", images: { loaded: 1, failed: [] } });
      expect(refreshed).toBe(1);
      expect(loaded).toBe(2);
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function makeConfig(): EnvConfig {
  return {
    userAgent: "test-agent",
    baseUrl: "https://flomoapp.com",
    webBaseUrl: "https://v.flomoapp.com",
    timezone: "Asia/Shanghai",
    logLevel: "info",
  };
}

function emptyImageLoader(): MemoImageLoader {
  return { async load() { return { images: [], failures: [] }; } };
}

function makeMemo(slug: string, imageCount: number) {
  return {
    slug,
    content: "Text and images belong to this memo",
    tags: [],
    url: `https://v.flomoapp.com/mine/?memo_id=${slug}`,
    createdAt: "",
    updatedAt: "",
    images: Array.from({ length: imageCount }, (_, offset) => ({
      index: offset + 1,
      url: `https://static.flomoapp.com/${offset + 1}.png`,
    })),
    imageCount,
  };
}

function makeReadClient(memo: ReturnType<typeof makeMemo>): FlomoReadClient {
  return {
    async list() { return []; },
    async search() { return []; },
    async getBySlug() { return memo; },
    async refreshBySlug() { return memo; },
    async getRecentBatch() { return []; },
    async syncAll() { return { synced: 0, totalCached: 0, pages: 0, complete: true, syncedAt: "" }; },
    async ensureFresh() { return { initialized: false, mode: "incremental", changed: 0, added: 0, updated: 0, deleted: 0, totalCached: 1, pages: 1, complete: true, syncedAt: "2026-08-15T00:00:00.000Z" }; },
    async listSynced() { return [memo]; },
    async searchSynced() { return []; },
    async getSyncedBySlug() { return memo; },
    getSyncStatus() { return { synced: false, totalCached: 0, complete: false }; },
  };
}

function parseToolJson(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.find(isTextContent)?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function isTextContent(value: unknown): value is { type: "text"; text: string } {
  return isRecord(value) && value.type === "text" && typeof value.text === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

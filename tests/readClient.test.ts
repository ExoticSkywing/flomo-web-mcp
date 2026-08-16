import { describe, expect, it } from "vitest";
import type { EnvConfig } from "../src/config/env.js";
import type { FlomoHttpClient } from "../src/clients/http.js";
import type { Memo } from "../src/models/memo.js";
import { BearerFlomoReadClient, filterMemos } from "../src/clients/flomoReadClient.js";

const memos: Memo[] = [
  {
    slug: "1",
    content: "MCP 写入测试",
    tags: ["#flomo", "#mcp"],
    url: "",
    createdAt: "",
    updatedAt: "",
    images: [],
    imageCount: 0,
  },
  {
    slug: "2",
    content: "普通笔记",
    tags: ["#daily"],
    url: "",
    createdAt: "",
    updatedAt: "",
    images: [],
    imageCount: 0,
  },
];

describe("filterMemos", () => {
  it("matches content and tags locally", () => {
    expect(filterMemos(memos, "mcp")).toHaveLength(1);
    expect(filterMemos(memos, "daily")[0]?.slug).toBe("2");
  });

  it("matches tags exactly while normalizing # and case", () => {
    const tagged = [
      ...memos,
      { ...memos[0], slug: "3", tags: ["#Agentic"] },
    ];

    expect(filterMemos(tagged, "", 20, "agent")).toEqual([]);
    expect(filterMemos(tagged, "", 20, "#MCP")).toMatchObject([{ slug: "1" }]);
    expect(filterMemos(tagged, "", 20, "mcp")).toMatchObject([{ slug: "1" }]);
  });
});

describe("BearerFlomoReadClient", () => {
  it("uses the default signed flomo web endpoint and parses response data", async () => {
    let capturedEndpoint = "";
    const httpClient = {
      async requestJson(endpoint: string): Promise<unknown> {
        capturedEndpoint = endpoint;
        return {
          code: 0,
          message: "ok",
          data: [
            {
              slug: "abc123",
              content: "<p>Hello #flomo</p>",
              tags: "MCP",
              created_at: "2026-05-03 12:00:00",
              updated_at: "2026-05-03 12:01:00",
            },
          ],
        };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig({ timezone: "UTC" }), httpClient);

    const items = await client.list();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      slug: "abc123",
      content: "Hello #flomo",
      tags: ["#MCP", "#flomo"],
      url: "https://v.flomoapp.com/mine/?memo_id=abc123",
    });
    expect(capturedEndpoint).toContain("/api/v1/memo/latest_updated_desc?");

    const query = new URL(`https://example.test${capturedEndpoint}`).searchParams;
    expect(query.get("api_key")).toBe("flomo_web");
    expect(query.get("app_version")).toBe("4.0");
    expect(query.get("platform")).toBe("web");
    expect(query.get("tz")).toBe("0:0");
    expect(query.get("timestamp")).toMatch(/^\d+$/);
    expect(query.get("sign")).toMatch(/^[a-f0-9]{32}$/);
  });

  it("searches and gets notes from the cached recent batch", async () => {
    let calls = 0;
    const httpClient = {
      async requestJson(): Promise<unknown> {
        calls += 1;
        return {
          code: 0,
          data: [
            {
              slug: "mcp-note",
              content: "MCP cache test",
              tags: ["flomo"],
              created_at: 1_710_000_000,
              updated_at: 1_710_000_001,
            },
            {
              slug: "daily-note",
              content: "Daily note",
              tags: ["daily"],
              created_at: 1_710_000_002,
              updated_at: 1_710_000_003,
            },
          ],
        };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await expect(client.search("mcp")).resolves.toMatchObject([{ slug: "mcp-note" }]);
    await expect(client.search("missing")).resolves.toEqual([]);
    await expect(client.getBySlug("daily-note")).resolves.toMatchObject({ slug: "daily-note" });
    await expect(client.getBySlug("missing")).resolves.toBeNull();
    expect(calls).toBe(1);
  });

  it("syncs paged notes into a local cache without duplicating cursor rows", async () => {
    const capturedEndpoints: string[] = [];
    const httpClient = {
      async requestJson(endpoint: string): Promise<unknown> {
        capturedEndpoints.push(endpoint);
        if (capturedEndpoints.length === 1) {
          return {
            code: 0,
            data: [
              {
                slug: "new-note",
                content: "New full sync note",
                tags: ["sync"],
                created_at: 300,
                updated_at: 300,
              },
              {
                slug: "cursor-note",
                content: "Cursor full sync note",
                tags: ["sync"],
                created_at: 200,
                updated_at: 200,
              },
            ],
          };
        }

        return {
          code: 0,
          data: [
            {
              slug: "cursor-note",
              content: "Cursor full sync note",
              tags: ["sync"],
              created_at: 200,
              updated_at: 200,
            },
            {
              slug: "old-note",
              content: "Old full sync note",
              tags: ["archive"],
              created_at: 100,
              updated_at: 100,
            },
          ],
        };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await expect(client.syncAll({ pageSize: 2, maxPages: 2 })).resolves.toMatchObject({
      synced: 3,
      totalCached: 3,
      pages: 2,
      complete: false,
    });
    await expect(client.searchSynced("archive")).resolves.toMatchObject([{ slug: "old-note" }]);
    await expect(client.getSyncedBySlug("new-note")).resolves.toMatchObject({ slug: "new-note" });

    expect(capturedEndpoints).toHaveLength(2);
    expect(capturedEndpoints[0]).toContain("/api/v1/memo/updated/?");
    expect(new URL(`https://example.test${capturedEndpoints[0]}`).searchParams.get("latest_updated_at")).toBe("0");
    expect(new URL(`https://example.test${capturedEndpoints[0]}`).searchParams.get("latest_slug")).toBe("");
    expect(new URL(`https://example.test${capturedEndpoints[0]}`).searchParams.get("limit")).toBe("2");
    expect(new URL(`https://example.test${capturedEndpoints[1]}`).searchParams.get("latest_updated_at")).toBe("200");
    expect(new URL(`https://example.test${capturedEndpoints[1]}`).searchParams.get("latest_slug")).toBe("cursor-note");
  });

  it("excludes deleted notes returned by the sync endpoint", async () => {
    const httpClient = {
      async requestJson(): Promise<unknown> {
        return {
          code: 0,
          data: [
            {
              slug: "active-note",
              content: "Active full sync note #active",
              tags: ["active"],
              created_at: 100,
              updated_at: 100,
              deleted_at: null,
            },
            {
              slug: "deleted-note",
              content: "Deleted full sync note #deleted",
              tags: ["deleted"],
              created_at: 90,
              updated_at: 90,
              deleted_at: "2026-04-17 17:04:37",
            },
          ],
        };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await expect(client.syncAll({ pageSize: 200, maxPages: 1 })).resolves.toMatchObject({
      synced: 1,
      totalCached: 1,
      pages: 1,
      complete: true,
    });
    await expect(client.searchSynced("active")).resolves.toMatchObject([{ slug: "active-note" }]);
    await expect(client.searchSynced("deleted")).resolves.toEqual([]);
  });

  it("does not mark sync complete when a full raw page only shrinks after deleted-note filtering", async () => {
    const httpClient = {
      async requestJson(): Promise<unknown> {
        return {
          code: 0,
          data: [
            {
              slug: "active-note",
              content: "Active full sync note",
              tags: ["active"],
              created_at: 100,
              updated_at: 100,
              deleted_at: null,
            },
            {
              slug: "deleted-cursor-note",
              content: "Deleted cursor row",
              tags: ["deleted"],
              created_at: 90,
              updated_at: 90,
              deleted_at: "2026-04-17 17:04:37",
            },
          ],
        };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await expect(client.syncAll({ pageSize: 2, maxPages: 1 })).resolves.toMatchObject({
      synced: 1,
      totalCached: 1,
      pages: 1,
      complete: false,
      nextCursor: {
        latestUpdatedAt: 90,
        latestSlug: "deleted-cursor-note",
      },
    });
  });

  it("refreshes an existing in-memory snapshot with new, edited, and deleted memos", async () => {
    const capturedEndpoints: string[] = [];
    let phase: "initial" | "incremental" = "initial";
    const httpClient = {
      async requestJson(endpoint: string): Promise<unknown> {
        capturedEndpoints.push(endpoint);
        if (phase === "initial") {
          return {
            code: 0,
            data: [
              { slug: "edited", content: "old text", tags: ["old"], created_at: 100, updated_at: 100 },
              { slug: "deleted", content: "delete me", tags: ["old"], created_at: 90, updated_at: 90 },
            ],
          };
        }
        return {
          code: 0,
          data: [
            { slug: "new", content: "brand new", tags: ["new"], created_at: 130, updated_at: 130 },
            { slug: "edited", content: "new text", tags: ["changed"], created_at: 100, updated_at: 120 },
            { slug: "deleted", content: "delete me", tags: ["old"], created_at: 90, updated_at: 110, deleted_at: "2026-08-15 00:00:00" },
          ],
        };
      },
    } as unknown as FlomoHttpClient;
    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await client.syncAll({ pageSize: 200, maxPages: 1 });
    phase = "incremental";
    const refreshed = await client.ensureFresh({ pageSize: 200, maxPages: 1 });

    expect(refreshed).toMatchObject({ initialized: false, changed: 3, totalCached: 2, complete: true });
    await expect(client.getSyncedBySlug("edited")).resolves.toMatchObject({ content: "new text", tags: ["#changed"] });
    await expect(client.getSyncedBySlug("new")).resolves.toMatchObject({ slug: "new" });
    await expect(client.getSyncedBySlug("deleted")).resolves.toBeNull();
    const incrementalUrl = new URL(`https://example.test${capturedEndpoints.at(-1)}`);
    expect(incrementalUrl.searchParams.get("latest_updated_at")).toBe("0");
    expect(incrementalUrl.searchParams.get("latest_slug")).toBe("");
  });

  it("starts each incremental refresh at the newest page and stops after crossing the overlap boundary", async () => {
    const capturedEndpoints: string[] = [];
    let phase: "initial" | "incremental" = "initial";
    const httpClient = {
      async requestJson(endpoint: string): Promise<unknown> {
        capturedEndpoints.push(endpoint);
        if (phase === "initial") {
          return {
            code: 0,
            data: [
              { slug: "current", content: "current", created_at: 100, updated_at: 100 },
            ],
          };
        }
        return {
          code: 0,
          data: [
            { slug: "newest", content: "newest", created_at: 120, updated_at: 120 },
            { slug: "current", content: "current edited", created_at: 100, updated_at: 110 },
            { slug: "overlap", content: "overlap boundary", created_at: 98, updated_at: 98 },
            { slug: "older", content: "must not be collected", created_at: 97, updated_at: 97 },
          ],
        };
      },
    } as unknown as FlomoHttpClient;
    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await client.syncAll({ pageSize: 200, maxPages: 1 });
    phase = "incremental";
    await expect(client.ensureFresh({ pageSize: 200, maxPages: 1 })).resolves.toMatchObject({
      initialized: false,
      added: 2,
      updated: 1,
      totalCached: 3,
      complete: true,
    });

    const incrementalUrl = new URL(`https://example.test${capturedEndpoints.at(-1)}`);
    expect(incrementalUrl.searchParams.get("latest_updated_at")).toBe("0");
    expect(incrementalUrl.searchParams.get("latest_slug")).toBe("");
    await expect(client.getSyncedBySlug("newest")).resolves.toMatchObject({ slug: "newest" });
    await expect(client.getSyncedBySlug("current")).resolves.toMatchObject({ content: "current edited" });
    await expect(client.getSyncedBySlug("overlap")).resolves.toMatchObject({ slug: "overlap" });
    await expect(client.getSyncedBySlug("older")).resolves.toBeNull();
  });

  it("fails closed and keeps the previous snapshot if incremental pagination cannot reach the overlap boundary", async () => {
    let phase: "initial" | "incremental" = "initial";
    let incrementalCalls = 0;
    const httpClient = {
      async requestJson(): Promise<unknown> {
        if (phase === "initial") {
          return {
            code: 0,
            data: [{ slug: "stable", content: "stable", created_at: 100, updated_at: 100 }],
          };
        }
        incrementalCalls += 1;
        return {
          code: 0,
          data: [
            { slug: `new-${incrementalCalls}-a`, content: "new a", created_at: 200, updated_at: 200 },
            { slug: `new-${incrementalCalls}-b`, content: "new b", created_at: 199, updated_at: 199 },
          ],
        };
      },
    } as unknown as FlomoHttpClient;
    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await client.syncAll({ pageSize: 200, maxPages: 1 });
    phase = "incremental";
    await expect(client.ensureFresh({ pageSize: 2, maxPages: 1 })).rejects.toMatchObject({ code: "REMOTE_CHANGED" });
    await expect(client.getSyncedBySlug("stable")).resolves.toMatchObject({ slug: "stable" });
    await expect(client.getSyncedBySlug("new-1-a")).resolves.toBeNull();
  });

  it("requires a sync before searching the full local cache", async () => {
    const httpClient = {
      async requestJson(): Promise<unknown> {
        return { code: 0, data: [] };
      },
    } as unknown as FlomoHttpClient;

    const client = new BearerFlomoReadClient(makeConfig(), httpClient);

    await expect(client.searchSynced("missing")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

function makeConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    authorization: "Bearer test",
    userAgent: "test-agent",
    baseUrl: "https://flomoapp.com",
    webBaseUrl: "https://v.flomoapp.com",
    timezone: "Asia/Shanghai",
    logLevel: "info",
    ...overrides,
  };
}

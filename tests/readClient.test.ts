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
  },
  {
    slug: "2",
    content: "普通笔记",
    tags: ["#daily"],
    url: "",
    createdAt: "",
    updatedAt: "",
  },
];

describe("filterMemos", () => {
  it("matches content and tags locally", () => {
    expect(filterMemos(memos, "mcp")).toHaveLength(1);
    expect(filterMemos(memos, "daily")[0]?.slug).toBe("2");
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
});

function makeConfig(overrides: Partial<EnvConfig> = {}): EnvConfig {
  return {
    authorization: "Bearer test",
    userAgent: "test-agent",
    baseUrl: "https://flomoapp.com",
    webBaseUrl: "https://v.flomoapp.com",
    timezone: "Asia/Shanghai",
    logLevel: "info",
    debugRawResponse: false,
    ...overrides,
  };
}

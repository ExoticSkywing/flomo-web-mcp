import { describe, expect, it } from "vitest";
import type { Memo } from "../src/models/memo.js";
import { filterMemos } from "../src/clients/flomoReadClient.js";

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

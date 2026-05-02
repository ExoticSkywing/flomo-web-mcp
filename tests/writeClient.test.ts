import { describe, expect, it } from "vitest";
import { formatCreateContent } from "../src/clients/flomoWriteClient.js";

describe("formatCreateContent", () => {
  it("appends normalized tags after note content", () => {
    expect(formatCreateContent("MCP 写入测试", ["flomo", "#mcp"])).toBe("MCP 写入测试\n\n#flomo #mcp");
  });
});

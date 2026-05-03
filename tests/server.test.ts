import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { EnvConfig } from "../src/config/env.js";
import { createFlomoMcpServer } from "../src/server.js";

describe("createFlomoMcpServer", () => {
  it("loads over MCP transport, lists tools, and serves the ping tool without flomo credentials", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createFlomoMcpServer(makeConfig());
    const client = new Client({
      name: "flomo-mcp-test",
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
      ]);

      const result = await client.callTool({ name: "ping", arguments: {} });
      const text = result.content.find((item) => item.type === "text")?.text;

      expect(JSON.parse(text ?? "{}")).toMatchObject({
        ok: true,
        name: "flomo-mcp",
        version: "0.1.0",
      });
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
    debugRawResponse: false,
  };
}

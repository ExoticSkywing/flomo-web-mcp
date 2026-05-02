import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { runJsonTool } from "./common.js";

export function registerSearchNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "search_notes",
    "Search flomo notes by keyword.",
    {
      query: z.string().min(1),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ query, limit }) =>
      runJsonTool(async () => ({
        ok: true,
        items: await readClient.search(query, limit),
      })),
  );
}

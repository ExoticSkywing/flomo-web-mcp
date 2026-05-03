import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { recentNotesScope, runJsonTool } from "./common.js";

export function registerListNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "list_notes",
    "List recent notes from flomo.",
    {
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ limit }) =>
      runJsonTool(async () => ({
        ok: true,
        items: await readClient.list(limit),
        scope: recentNotesScope(),
      })),
  );
}

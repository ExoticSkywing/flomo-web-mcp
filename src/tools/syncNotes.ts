import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { allSyncedNotesScope, runJsonTool } from "./common.js";

export function registerSyncNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "sync_notes",
    "Sync flomo notes into a local all-notes cache without returning note contents.",
    {
      pageSize: z.number().int().positive().max(200).optional(),
      maxPages: z.number().int().positive().max(100).optional(),
    },
    async ({ pageSize, maxPages }) =>
      runJsonTool(async () => {
        const result = await readClient.syncAll({ pageSize, maxPages });
        return {
          ok: true,
          ...result,
          scope: allSyncedNotesScope(result.complete, result.syncedAt),
        };
      }),
  );
}

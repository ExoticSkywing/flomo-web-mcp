import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { allSyncedNotesScope, recentNotesScope, runJsonTool } from "./common.js";

export function registerSearchNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "search_notes",
    "Search recent flomo notes by keyword, or the local all-notes sync cache when requested.",
    {
      query: z.string().min(1),
      limit: z.number().int().positive().max(100).optional(),
      scope: z.enum(["recent_notes", "all_synced_notes"]).optional(),
    },
    async ({ query, limit, scope }) =>
      runJsonTool(async () => {
        if (scope === "all_synced_notes") {
          const items = await readClient.searchSynced(query, limit);
          const status = readClient.getSyncStatus();
          return {
            ok: true,
            items,
            scope: allSyncedNotesScope(status.complete, status.syncedAt),
          };
        }

        return {
          ok: true,
          items: await readClient.search(query, limit),
          scope: recentNotesScope(),
        };
      }),
  );
}

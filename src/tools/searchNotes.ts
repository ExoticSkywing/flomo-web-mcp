import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { allSyncedNotesScope, runJsonTool } from "./common.js";

export function registerSearchNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "search_notes",
    "Refresh the complete in-memory flomo snapshot, then search it once by keyword and/or one exact tag. Do not call sync_notes first or repeat case/# variants.",
    {
      query: z.string().min(1).optional(),
      tag: z.string().min(1).optional(),
      limit: z.number().int().positive().max(100).optional(),
      scope: z.enum(["recent_notes", "all_synced_notes"]).optional(),
    },
    async ({ query, tag, limit }) =>
      runJsonTool(async () => {
        if (!query && !tag) {
          throw new Error("query 或 tag 至少提供一个。");
        }
        if (!readClient.ensureFresh) {
          throw new Error("read client 不支持自动新鲜同步。");
        }
        const freshness = await readClient.ensureFresh();
        const items = await readClient.searchSynced(query, limit, tag);
        return {
          ok: true,
          items,
          freshness,
          scope: allSyncedNotesScope(true, freshness.syncedAt),
        };
      }),
  );
}

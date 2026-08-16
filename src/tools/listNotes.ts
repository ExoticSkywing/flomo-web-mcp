import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { allSyncedNotesScope, runJsonTool } from "./common.js";

export function registerListNotesTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "list_notes",
    "Refresh the complete in-memory flomo snapshot, then list the newest memos without omitting newly added or edited entries.",
    {
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ limit }) =>
      runJsonTool(async () => {
        if (!readClient.ensureFresh || !readClient.listSynced) {
          throw new Error("read client 不支持自动新鲜同步。");
        }
        const freshness = await readClient.ensureFresh();
        return {
          ok: true,
          items: await readClient.listSynced(limit),
          freshness,
          scope: allSyncedNotesScope(true, freshness.syncedAt),
        };
      }),
  );
}

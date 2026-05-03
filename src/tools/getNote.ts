import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { allSyncedNotesScope, recentNotesScope, runJsonTool } from "./common.js";

export function registerGetNoteTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "get_note",
    "Get a single flomo note by slug from recent notes, or from the local all-notes sync cache when requested.",
    {
      slug: z.string().min(1),
      scope: z.enum(["recent_notes", "all_synced_notes"]).optional(),
    },
    async ({ slug, scope }) =>
      runJsonTool(async () => {
        if (scope === "all_synced_notes") {
          const status = readClient.getSyncStatus();
          return {
            ok: true,
            memo: await readClient.getSyncedBySlug(slug),
            scope: allSyncedNotesScope(status.complete, status.syncedAt),
          };
        }

        return {
          ok: true,
          memo: await readClient.getBySlug(slug),
          scope: recentNotesScope(),
        };
      }),
  );
}

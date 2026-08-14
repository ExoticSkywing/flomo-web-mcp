import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient, MemoImageLoader } from "../types/flomo.js";
import { toPublicError } from "../utils/errors.js";
import { allSyncedNotesScope, jsonToolResponse, recentNotesScope } from "./common.js";

export function registerGetNoteTool(server: McpServer, readClient: FlomoReadClient, imageLoader: MemoImageLoader): void {
  server.tool(
    "get_note",
    "Get a single flomo note by slug from recent notes, or from the local all-notes sync cache when requested.",
    {
      slug: z.string().min(1),
      scope: z.enum(["recent_notes", "all_synced_notes"]).optional(),
    },
    async ({ slug, scope }) => {
      try {
        let memo;
        let resolvedScope;
        if (scope === "all_synced_notes") {
          const status = readClient.getSyncStatus();
          memo = await readClient.getSyncedBySlug(slug);
          resolvedScope = allSyncedNotesScope(status.complete, status.syncedAt);
        } else {
          memo = await readClient.getBySlug(slug);
          resolvedScope = recentNotesScope();
        }

        if (!memo) {
          return jsonToolResponse({ ok: true, status: "complete", memo: null, scope: resolvedScope });
        }

        let loaded = await imageLoader.load(memo);
        if (loaded.failures.some((failure) => failure.code === "IMAGE_AUTH_EXPIRED")) {
          const refreshedMemo = await readClient.refreshBySlug(memo.slug);
          if (refreshedMemo) {
            memo = refreshedMemo;
            loaded = await imageLoader.load(memo);
          }
        }
        const status = loaded.failures.length > 0 ? "partial" : "complete";
        const metadata = {
          ok: true,
          status,
          memo,
          images: {
            declared: memo.imageCount,
            loaded: loaded.images.length,
            failed: loaded.failures,
          },
          scope: resolvedScope,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(metadata, null, 2) },
            ...loaded.images.map((image) => ({
              type: "image" as const,
              data: image.data,
              mimeType: image.mimeType,
            })),
          ],
        };
      } catch (error) {
        return jsonToolResponse({ ok: false, error: toPublicError(error) }, true);
      }
    },
  );
}

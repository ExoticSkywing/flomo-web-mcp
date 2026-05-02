import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoReadClient } from "../types/flomo.js";
import { runJsonTool } from "./common.js";

export function registerGetNoteTool(server: McpServer, readClient: FlomoReadClient): void {
  server.tool(
    "get_note",
    "Get a single flomo note by slug.",
    {
      slug: z.string().min(1),
    },
    async ({ slug }) =>
      runJsonTool(async () => ({
        ok: true,
        memo: await readClient.getBySlug(slug),
      })),
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { FlomoWriteClient } from "../types/flomo.js";
import { runJsonTool } from "./common.js";

export function registerCreateNoteTool(server: McpServer, writeClient: FlomoWriteClient): void {
  server.tool(
    "create_note",
    "Create a new note in flomo.",
    {
      content: z.string().min(1),
      tags: z.array(z.string()).optional(),
    },
    async ({ content, tags }) =>
      runJsonTool(async () => ({
        ok: true,
        memo: await writeClient.create({ content, tags }),
      })),
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EnvConfig } from "./config/env.js";
import { FlomoHttpClient } from "./clients/http.js";
import { BearerFlomoReadClient } from "./clients/flomoReadClient.js";
import { BearerFlomoWriteClient } from "./clients/flomoWriteClient.js";
import { registerCreateNoteTool } from "./tools/createNote.js";
import { registerGetNoteTool } from "./tools/getNote.js";
import { jsonToolResponse } from "./tools/common.js";
import { registerListNotesTool } from "./tools/listNotes.js";
import { registerSearchNotesTool } from "./tools/searchNotes.js";
import { registerSyncNotesTool } from "./tools/syncNotes.js";

export function createFlomoMcpServer(config: EnvConfig): McpServer {
  const server = new McpServer({
    name: "flomo-web-mcp",
    version: "0.1.0",
  });

  const httpClient = new FlomoHttpClient(config);
  const readClient = new BearerFlomoReadClient(config, httpClient);
  const writeClient = new BearerFlomoWriteClient(config, httpClient, () => readClient.clearCache());

  server.tool("ping", "Check whether the flomo MCP server is reachable.", {}, async () =>
    jsonToolResponse({
      ok: true,
      name: "flomo-web-mcp",
      version: "0.1.0",
    }),
  );

  registerCreateNoteTool(server, writeClient);
  registerListNotesTool(server, readClient);
  registerSyncNotesTool(server, readClient);
  registerSearchNotesTool(server, readClient);
  registerGetNoteTool(server, readClient);

  return server;
}

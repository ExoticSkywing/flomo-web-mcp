#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createFlomoMcpServer } from "./server.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadEnv();
  const logger = createLogger(config.logLevel);
  const server = createFlomoMcpServer(config);
  const transport = new StdioServerTransport();

  logger.info("Starting flomo MCP server over stdio");
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ level: "error", message }));
  process.exit(1);
});

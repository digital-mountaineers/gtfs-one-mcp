#!/usr/bin/env node
/**
 * GTFS One MCP server — stdio entry point.
 *
 * Loads configuration, builds the server, and speaks MCP over stdio (the
 * transport Claude Desktop / Cursor / ChatGPT desktop use to launch a local
 * server). For the hosted/remote transport see `http.ts`. All diagnostics go to
 * stderr so they never corrupt the stdout JSON-RPC stream.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Visible in the client's MCP logs; harmless on stderr.
  console.error(
    `gtfs-one-mcp ready (stdio) — agency: ${config.agencyName}, site: ${config.gtfsOneUrl}, ` +
      `default feed: ${config.feedId}`
  );
}

main().catch((err) => {
  console.error(`gtfs-one-mcp failed to start: ${(err as Error).message}`);
  process.exit(1);
});

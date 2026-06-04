#!/usr/bin/env node
/**
 * GTFS Pro MCP server — entry point.
 *
 * Loads configuration, builds the API client, registers the nine transit tools,
 * and speaks MCP over stdio (the transport Claude Desktop / ChatGPT desktop use
 * to launch a local server). All diagnostics go to stderr so they never corrupt
 * the stdout JSON-RPC stream.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { ApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const api = new ApiClient(config);

  const instructions =
    `This server provides real-time transit information for ${config.agencyName}.` +
    (config.agencyDescription ? ` ${config.agencyDescription}` : "") +
    ` Use the tools to look up bus stops, schedules, routes, live vehicle positions, ` +
    `and service alerts. Always use the tools for schedule and stop data — never guess ` +
    `times. Note: realtime tools (get_service_alerts, get_live_vehicles) returning an ` +
    `empty result is normal and means "nothing active right now," not "no service."`;

  const server = new McpServer(
    { name: "gtfs-pro-transit", version: "1.0.0" },
    { instructions }
  );

  registerTools(server, api);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Visible in the client's MCP logs; harmless on stderr.
  console.error(
    `gtfs-pro-mcp ready — agency: ${config.agencyName}, site: ${config.gtfsProUrl}, ` +
      `default feed: ${config.feedId}`
  );
}

main().catch((err) => {
  console.error(`gtfs-pro-mcp failed to start: ${(err as Error).message}`);
  process.exit(1);
});

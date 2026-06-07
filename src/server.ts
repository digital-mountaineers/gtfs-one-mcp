/**
 * Shared MCP server factory. Both transports — stdio (`index.ts`) and
 * Streamable HTTP (`http.ts`) — build their server through here, so the two
 * surfaces expose the identical 9 tools and instructions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "./config.js";
import { ApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";

/** The server-level instructions shown to the AI client. */
export function buildInstructions(config: Config): string {
  return (
    `This server provides real-time transit information for ${config.agencyName}.` +
    (config.agencyDescription ? ` ${config.agencyDescription}` : "") +
    ` Use the tools to look up bus stops, schedules, routes, live vehicle positions, ` +
    `and service alerts. Always use the tools for schedule and stop data — never guess ` +
    `times. Note: realtime tools (get_service_alerts, get_live_vehicles) returning an ` +
    `empty result is normal and means "nothing active right now," not "no service."`
  );
}

/**
 * Create a fully-wired McpServer. Pass a shared ApiClient so multiple HTTP
 * sessions reuse one response cache; omit it for a standalone (stdio) process.
 */
export function createServer(config: Config, api: ApiClient = new ApiClient(config)): McpServer {
  const server = new McpServer(
    { name: "gtfs-one-transit", version: "1.0.0" },
    { instructions: buildInstructions(config) }
  );
  registerTools(server, api);
  return server;
}

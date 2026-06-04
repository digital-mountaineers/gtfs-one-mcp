#!/usr/bin/env node
/**
 * GTFS Pro MCP server — Streamable HTTP entry point (remote / hosted transport).
 *
 * This lets the server run as a public service that AI clients add as a "custom
 * connector" by URL — Claude (desktop + web), ChatGPT, etc. — with no local
 * install. It implements the MCP Streamable HTTP transport with per-client
 * sessions, exposes a single `/mcp` endpoint (POST to send, GET for the SSE
 * stream, DELETE to end a session), plus `/healthz`.
 *
 * Config is the same as the stdio server (GTFS_PRO_URL, etc.). Extra env:
 *   PORT             - listen port (default 3000; most hosts inject this)
 *   MCP_AUTH_TOKEN   - optional. If set, clients must send `Authorization:
 *                      Bearer <token>`. Leave unset for an open server (the
 *                      underlying transit data is public anyway).
 */

import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from "./config.js";
import { ApiClient } from "./api-client.js";
import { createServer } from "./server.js";

const config = loadConfig();
const api = new ApiClient(config); // shared across sessions → shared response cache
const PORT = Number(process.env.PORT || 3000);
const AUTH = (process.env.MCP_AUTH_TOKEN || "").trim();

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS — required for browser-based MCP clients (e.g. claude.ai web). The
// session id travels in the `mcp-session-id` header, so it must be allowed and
// exposed. Data is public, so origin is open.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  res.setHeader("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/** Optional bearer-token gate. Returns true if the request may proceed. */
function authorized(req: Request, res: Response): boolean {
  if (!AUTH) return true;
  if (req.headers.authorization === `Bearer ${AUTH}`) return true;
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
  return false;
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, agency: config.agencyName, site: config.gtfsProUrl });
});

app.get("/", (_req, res) => {
  res.type("text/plain").send(
    `gtfs-pro-mcp (Streamable HTTP) for ${config.agencyName}. ` +
      `MCP endpoint: POST ${"/mcp"}. Add this server's URL as a custom connector in your AI client.`
  );
});

// Live sessions, keyed by the transport's session id.
const transports = new Map<string, StreamableHTTPServerTransport>();

const sid = (req: Request): string | undefined => {
  const h = req.headers["mcp-session-id"];
  return Array.isArray(h) ? h[0] : h;
};

// POST /mcp — client → server messages. An initialize request with no session
// id spins up a fresh session+server; everything else must carry a known id.
app.post("/mcp", async (req, res) => {
  if (!authorized(req, res)) return;

  const id = sid(req);
  let transport = id ? transports.get(id) : undefined;

  if (!transport) {
    if (id || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID for a non-initialize request" },
        id: null,
      });
      return;
    }
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newId) => {
        transports.set(newId, transport!);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    const server = createServer(config, api);
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// GET /mcp (open the SSE stream) and DELETE /mcp (end the session) both operate
// on an existing session.
async function existingSession(req: Request, res: Response): Promise<void> {
  if (!authorized(req, res)) return;
  const id = sid(req);
  const transport = id ? transports.get(id) : undefined;
  if (!transport) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transport.handleRequest(req, res);
}

app.get("/mcp", existingSession);
app.delete("/mcp", existingSession);

app.listen(PORT, () => {
  console.error(
    `gtfs-pro-mcp ready (http) — listening on :${PORT}, agency: ${config.agencyName}, ` +
      `site: ${config.gtfsProUrl}${AUTH ? " [auth required]" : ""}`
  );
});

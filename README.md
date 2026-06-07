# gtfs-one-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that turns any
[GTFS One](https://gtfs.one) transit site into a set of tools for AI
assistants. Point it at an agency's WordPress site and Claude, ChatGPT, or any
other MCP-compatible client can answer rider questions from the agency's **live**
GTFS and GTFS-Realtime data — nearest stops, next departures, routes, live bus
positions, and service alerts.

It talks to the site's public REST API (`/wp-json/gtfs-one/v1/*`) — no plugins,
no database access, no credentials required. One MCP server covers one transit site
(which may host multiple agency feeds).

> **Why this exists:** the only other transit MCP servers are single-agency,
> hard-coded hobby projects. This one works with *any* GTFS One install, driven
> entirely by configuration.

## Tools

| Tool | What it does |
|------|--------------|
| `list_feeds` | List the transit feeds (agencies) configured on the site |
| `find_nearby_stops` | Nearest stops to a lat/lon, with serving routes and next departures |
| `search_stops` | Find stops by name, landmark, or stop code |
| `get_stop_departures` | Next departures from a specific stop, across all routes |
| `get_route_map` | A route's shape (path geometry) and the stops it serves |
| `get_system_map` | Every route in the system with its stops |
| `get_service_alerts` | Active GTFS-Realtime service alerts (empty = no active alerts) |
| `get_live_vehicles` | Real-time vehicle positions (empty = none reporting right now) |
| `geocode_address` | Address / place name → coordinates, biased to the service area |

The realtime tools (`get_service_alerts`, `get_live_vehicles`) **never error on
missing data** — an empty result means "nothing active right now," not "no
service." The tool descriptions tell the AI this explicitly.

## Requirements

- Node.js 18 or newer
- A transit website running GTFS One 1.5+ with its REST API publicly reachable

## Configuration

Provide settings via a JSON config file **or** environment variables (env vars win
where both are set). Only the site URL is required.

```jsonc
// gtfs-one.config.json
{
  "gtfs_one_url": "https://your-agency-site.org",
  "feed_id": "default",
  "cache_ttl_seconds": 30,
  "agency_name": "Your Transit Agency",
  "agency_description": "Public transit serving ... (cities, landmarks, region)."
}
```

| Setting | Env var | Default | Notes |
|---------|---------|---------|-------|
| `gtfs_one_url` | `GTFS_ONE_URL` | — (required) | Base URL of the GTFS One site |
| `feed_id` | `GTFS_ONE_FEED_ID` | `default` | Default feed so the AI needn't pass one each call |
| `cache_ttl_seconds` | `GTFS_ONE_CACHE_TTL` | `30` | Local response cache; protects the WP site |
| `agency_name` | `GTFS_ONE_AGENCY_NAME` | — | Shown in server metadata |
| `agency_description` | `GTFS_ONE_AGENCY_DESCRIPTION` | — | Service-area context for the AI |

Pass a non-default config path with `--config /path/to/config.json` or the
`GTFS_ONE_CONFIG` env var.

## Use with Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "gtfs-one-transit": {
      "command": "npx",
      "args": ["-y", "gtfs-one-mcp"],
      "env": {
        "GTFS_ONE_URL": "https://your-agency-site.org",
        "GTFS_ONE_FEED_ID": "default",
        "GTFS_ONE_AGENCY_NAME": "Your Transit Agency"
      }
    }
  }
}
```

Restart Claude Desktop, then ask: *"What bus stops are near \<a place in the
service area\>?"* or *"When's the next bus from \<stop name\>?"*

> **Windows users:** Claude Desktop on Windows can't launch `npx` directly (it's a
> `.cmd` shim, not an executable), so the server silently fails to start and Claude
> falls back to web search. Wrap the command in `cmd` instead:
>
> ```json
> {
>   "mcpServers": {
>     "gtfs-one-transit": {
>       "command": "cmd",
>       "args": ["/c", "npx", "-y", "gtfs-one-mcp"],
>       "env": {
>         "GTFS_ONE_URL": "https://your-agency-site.org",
>         "GTFS_ONE_FEED_ID": "default",
>         "GTFS_ONE_AGENCY_NAME": "Your Transit Agency"
>       }
>     }
>   }
> }
> ```
>
> After editing, fully **quit** Claude Desktop (right-click the system-tray icon →
> Quit — closing the window isn't enough) and reopen it.

## Use with ChatGPT / other MCP clients

Any client that launches a local stdio MCP server works the same way — run
`npx -y gtfs-one-mcp` with the same environment variables, or install globally:

```bash
npm install -g gtfs-one-mcp
GTFS_ONE_URL=https://your-agency-site.org gtfs-one-mcp
```

## Remote / hosted connector (Streamable HTTP)

The stdio setup above only works in clients that launch a **local process** (classic
Claude Desktop, Cursor, etc.). The **Claude apps that use remote connectors** — the
newer desktop app and **claude.ai on the web** — instead add an MCP server by **URL**.
For those, run the server in **HTTP mode** and host it somewhere with a public HTTPS
address; then add that URL as a custom connector.

Run it in HTTP mode:

```bash
GTFS_ONE_URL=https://your-agency-site.org \
GTFS_ONE_AGENCY_NAME="Your Transit Agency" \
PORT=3000 \
gtfs-one-mcp-http        # or: npm run start:http
```

This serves the MCP endpoint at **`/mcp`** (and a `/healthz` check). Extra env:

| Env | Default | Notes |
|-----|---------|-------|
| `PORT` | `3000` | Most hosts inject this automatically |
| `MCP_AUTH_TOKEN` | — | Optional. If set, clients must send `Authorization: Bearer <token>`. Leave unset for an open server — the transit data is public. |

### Deploy

- **Docker:** a `Dockerfile` is included — `docker build -t gtfs-one-mcp . && docker run -p 3000:3000 -e GTFS_ONE_URL=… -e GTFS_ONE_AGENCY_NAME=… gtfs-one-mcp`
- **Render / Railway / Fly.io (Node):** build `npm install && npm run build`, start `npm run start:http`, set the env vars. A `render.yaml` blueprint is included; Render gives you HTTPS automatically.
- **Your own VPS:** run behind nginx/Caddy with TLS, proxying to the Node port.

The data is public and read-only, so an open endpoint is fine; add `MCP_AUTH_TOKEN`
if you'd rather gate it.

### Add it to Claude

In the Claude desktop app or claude.ai: **Settings → Connectors → Add custom
connector**, give it a name, and paste your server's URL ending in **`/mcp`**
(e.g. `https://gtfs-one-mcp.onrender.com/mcp`). Then ask a transit question and
you'll see the `gtfs-one-transit` tools used.

## Local development

```bash
npm install
npm run build       # compile TypeScript to dist/
node test/smoke.mjs # exercise all 9 tools against a live site
```

## How it fits together

```
Local (stdio):
AI client  ──MCP/stdio──►  gtfs-one-mcp  ──HTTPS──►  GTFS One REST API
(Desktop)                  (local process)           /wp-json/gtfs-one/v1/*

Remote (Streamable HTTP):
AI client  ──MCP/HTTPS──►  gtfs-one-mcp-http  ──HTTPS──►  GTFS One REST API
(web/app)                  (hosted service /mcp)          /wp-json/gtfs-one/v1/*
```

Both transports share the same nine tools and config — pick stdio for local
clients (Claude Desktop, Cursor) or HTTP for connector-based clients (the Claude
app, claude.ai web, ChatGPT).

## License

GPL-2.0-or-later © Digital Mountaineers

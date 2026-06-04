# gtfs-pro-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that turns any
[WP GTFS Pro](https://devbydm.com) transit site into a set of tools for AI
assistants. Point it at an agency's WordPress site and Claude, ChatGPT, or any
other MCP-compatible client can answer rider questions from the agency's **live**
GTFS and GTFS-Realtime data — nearest stops, next departures, routes, live bus
positions, and service alerts.

It talks to the site's public REST API (`/wp-json/wp-gtfs-pro/v1/*`) — no plugins,
no database access, no credentials required. One MCP server covers one transit site
(which may host multiple agency feeds).

> **Why this exists:** the only other transit MCP servers are single-agency,
> hard-coded hobby projects. This one works with *any* GTFS Pro install, driven
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
- A transit website running WP GTFS Pro 1.5+ with its REST API publicly reachable

## Configuration

Provide settings via a JSON config file **or** environment variables (env vars win
where both are set). Only the site URL is required.

```jsonc
// gtfs-pro.config.json
{
  "gtfs_pro_url": "https://your-agency-site.org",
  "feed_id": "default",
  "cache_ttl_seconds": 30,
  "agency_name": "Your Transit Agency",
  "agency_description": "Public transit serving ... (cities, landmarks, region)."
}
```

| Setting | Env var | Default | Notes |
|---------|---------|---------|-------|
| `gtfs_pro_url` | `GTFS_PRO_URL` | — (required) | Base URL of the WP GTFS Pro site |
| `feed_id` | `GTFS_PRO_FEED_ID` | `default` | Default feed so the AI needn't pass one each call |
| `cache_ttl_seconds` | `GTFS_PRO_CACHE_TTL` | `30` | Local response cache; protects the WP site |
| `agency_name` | `GTFS_PRO_AGENCY_NAME` | — | Shown in server metadata |
| `agency_description` | `GTFS_PRO_AGENCY_DESCRIPTION` | — | Service-area context for the AI |

Pass a non-default config path with `--config /path/to/config.json` or the
`GTFS_PRO_CONFIG` env var.

## Use with Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "gtfs-pro-transit": {
      "command": "npx",
      "args": ["-y", "gtfs-pro-mcp"],
      "env": {
        "GTFS_PRO_URL": "https://your-agency-site.org",
        "GTFS_PRO_FEED_ID": "default",
        "GTFS_PRO_AGENCY_NAME": "Your Transit Agency"
      }
    }
  }
}
```

Restart Claude Desktop, then ask: *"What bus stops are near \<a place in the
service area\>?"* or *"When's the next bus from \<stop name\>?"*

## Use with ChatGPT / other MCP clients

Any client that launches a local stdio MCP server works the same way — run
`npx -y gtfs-pro-mcp` with the same environment variables, or install globally:

```bash
npm install -g gtfs-pro-mcp
GTFS_PRO_URL=https://your-agency-site.org gtfs-pro-mcp
```

## Local development

```bash
npm install
npm run build       # compile TypeScript to dist/
node test/smoke.mjs # exercise all 9 tools against a live site
```

## How it fits together

```
AI assistant  ──MCP/stdio──►  gtfs-pro-mcp  ──HTTPS──►  WP GTFS Pro REST API
(Claude, GPT)                 (this package)            /wp-json/wp-gtfs-pro/v1/*
```

A future release adds a Streamable-HTTP transport so the server can run as a
hosted remote service (one endpoint per agency) instead of a local process.

## License

GPL-2.0-or-later © Digital Mountaineers

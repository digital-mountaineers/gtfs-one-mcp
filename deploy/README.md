# Deploying the remote MCP connector

Runs the HTTP server behind Caddy (automatic Let's Encrypt HTTPS) via Docker
Compose. Written for `dm-1` (Hetzner), which already has Docker.

## Prerequisites
- A host with Docker + Docker Compose
- Ports **80** and **443** free on the host
- A DNS **A record** for your subdomain pointing at the host's public IP

## Steps

1. **DNS** — add an A record, e.g. `mcp.devbydm.com` → `5.78.81.3` (the dm-1 IP).
   Wait for it to resolve (`dig +short mcp.devbydm.com`).

2. **SSH in** and confirm ports 80/443 are free (Uptime Kuma uses 3001, so they
   usually are):
   ```bash
   sudo ss -tlnp | grep -E ':80 |:443 ' || echo "80/443 free"
   docker ps
   ```

3. **Clone + configure:**
   ```bash
   git clone https://github.com/digital-mountaineers/gtfs-pro-mcp.git
   cd gtfs-pro-mcp/deploy
   cp .env.example .env
   nano .env   # set MCP_DOMAIN, ACME_EMAIL, GTFS_PRO_URL, GTFS_PRO_AGENCY_NAME
   ```

4. **Launch:**
   ```bash
   docker compose up -d --build
   ```

5. **Verify** (Caddy fetches the cert on first hit — allow ~30s):
   ```bash
   curl https://mcp.devbydm.com/healthz      # → {"ok":true,...}
   ```

6. **Add to Claude** — Settings → Connectors → Add custom connector → URL:
   `https://mcp.devbydm.com/mcp`

## Operating

- Update:  `git pull && docker compose up -d --build`
- Logs:    `docker compose logs -f`
- Stop:    `docker compose down`

## Hosting multiple agencies on one box

Add another `gtfs-pro-mcp-<agency>` service (its own `GTFS_PRO_URL` /
`GTFS_PRO_AGENCY_NAME`) and a matching site block in the `Caddyfile`
(`mcp-<agency>.devbydm.com { reverse_proxy gtfs-pro-mcp-<agency>:3000 }`). One
Caddy fronts them all, each with its own auto-provisioned cert.

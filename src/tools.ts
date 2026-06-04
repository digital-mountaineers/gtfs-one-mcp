/**
 * The nine GTFS Pro MCP tools. Each wraps one REST endpoint, formats the result
 * as readable text (IDs included so the AI can chain calls), and surfaces failures
 * as prose. Tool descriptions are written for the *model* — they spell out when an
 * empty result is normal so the AI never reads "no alerts" as "no service."
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ApiClient, GtfsApiError } from "./api-client.js";
import type {
  AlertsResponse,
  DeparturesResponse,
  Feed,
  GeocodeResponse,
  NearbyStopsResponse,
  RouteMapResponse,
  SearchStopsResponse,
  SystemMapResponse,
  VehiclesResponse,
} from "./types.js";

/* ----------------------------- GTFS-RT enum maps ----------------------------- */
// https://gtfs.org/realtime/reference/ — surface human labels, never raw integers.

const CAUSE: Record<number, string> = {
  1: "Unknown cause", 2: "Other cause", 3: "Technical problem", 4: "Strike",
  5: "Demonstration", 6: "Accident", 7: "Holiday", 8: "Weather",
  9: "Maintenance", 10: "Construction", 11: "Police activity", 12: "Medical emergency",
};
const EFFECT: Record<number, string> = {
  1: "No service", 2: "Reduced service", 3: "Significant delays", 4: "Detour",
  5: "Additional service", 6: "Modified service", 7: "Other effect",
  8: "Unknown effect", 9: "Stop moved", 10: "No effect", 11: "Accessibility issue",
};
const SEVERITY: Record<number, string> = {
  1: "Unknown severity", 2: "Info", 3: "Warning", 4: "Severe",
};

/* --------------------------------- helpers ---------------------------------- */

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const errText = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
  isError: true,
});

/** Run a tool body, converting GtfsApiError into a visible (isError) tool result. */
async function guard(run: () => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>) {
  try {
    return await run();
  } catch (err) {
    if (err instanceof GtfsApiError) return errText(err.message);
    return errText(
      `Something went wrong reaching the transit data service: ${(err as Error).message}`
    );
  }
}

const fmtCoord = (n: number) => n.toFixed(5);

/* --------------------------------- tools ------------------------------------ */

export function registerTools(server: McpServer, api: ApiClient): void {
  const feedArg = {
    feed_id: z
      .string()
      .optional()
      .describe(
        `Feed identifier for multi-agency sites. Defaults to "${api.defaultFeedId}". ` +
          `Call list_feeds first if unsure which feeds exist.`
      ),
  };
  const feed = (id?: string) => id || api.defaultFeedId;

  /* 1. list_feeds */
  server.registerTool(
    "list_feeds",
    {
      title: "List transit feeds",
      description:
        "List all transit feeds (agencies) configured on this GTFS Pro site. Most " +
        "sites have a single feed. Use this to discover feed_id values when a site " +
        "serves more than one agency.",
      inputSchema: {},
    },
    () =>
      guard(async () => {
        const feeds = await api.get<Feed[]>("/feeds");
        if (!feeds.length) return text("No transit feeds are configured on this site.");
        const lines = feeds.map(
          (f) =>
            `• ${f.name} — feed_id: "${f.id}"${f.active ? "" : " (inactive)"}` +
            (f.url ? `\n  GTFS source: ${f.url}` : "")
        );
        return text(`Configured transit feeds:\n${lines.join("\n")}`);
      })
  );

  /* 2. find_nearby_stops */
  server.registerTool(
    "find_nearby_stops",
    {
      title: "Find nearby stops",
      description:
        "Find the nearest transit stops to a latitude/longitude. Returns each stop " +
        "with its distance, the routes that serve it, and the next scheduled " +
        "departure times per route. If you only have an address or place name, call " +
        "geocode_address first to get coordinates.",
      inputSchema: {
        latitude: z.number().min(-90).max(90).describe("Latitude (-90 to 90)."),
        longitude: z.number().min(-180).max(180).describe("Longitude (-180 to 180)."),
        radius_meters: z
          .number()
          .int()
          .positive()
          .max(5000)
          .optional()
          .describe("Search radius in meters (default 800, max 5000)."),
        limit: z
          .number()
          .int()
          .positive()
          .max(10)
          .optional()
          .describe("Max stops to return (default 5, max 10)."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<NearbyStopsResponse>("/stops/nearby", {
          lat: args.latitude,
          lon: args.longitude,
          radius: args.radius_meters ?? 800,
          limit: args.limit ?? 5,
          feed_id: feed(args.feed_id),
        });
        if (!data.stops?.length) {
          return text(
            "No transit stops were found within the search radius. Try a larger " +
              "radius_meters, or confirm the coordinates are inside the agency's service area."
          );
        }
        const blocks = data.stops.map((s) => {
          const head = `${s.name} (stop_id: ${s.id}${s.code ? `, code ${s.code}` : ""}) — ${s.distance_text}`;
          const routes = s.routes.length
            ? s.routes
                .map((r) => {
                  const next = r.next.length ? r.next.join(", ") : "no upcoming scheduled departures";
                  return `    - Route ${r.name} (route_id: ${r.route_id}): ${next}`;
                })
                .join("\n")
            : "    - No routes currently scheduled here.";
          return `${head}\n${routes}`;
        });
        return text(`Nearest stops:\n${blocks.join("\n")}`);
      })
  );

  /* 3. search_stops */
  server.registerTool(
    "search_stops",
    {
      title: "Search stops by name",
      description:
        "Search for transit stops by name, landmark, or stop code. Use this when the " +
        "rider names a place (\"Big Bear Village\", \"Goodwin's Market\") rather than " +
        "giving coordinates. Returns matching stops with their stop_id, which you can " +
        "pass to get_stop_departures.",
      inputSchema: {
        query: z.string().min(2).describe("Stop name, landmark, or stop code (min 2 chars)."),
        limit: z.number().int().positive().max(12).optional().describe("Max results (default 6, max 12)."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<SearchStopsResponse>("/stops/search", {
          q: args.query,
          limit: args.limit ?? 6,
          feed_id: feed(args.feed_id),
        });
        if (!data.stops?.length) {
          return text(
            `No stops matched "${args.query}". Try a shorter or different term, or use ` +
              `find_nearby_stops with coordinates from geocode_address.`
          );
        }
        const lines = data.stops.map(
          (s) =>
            `• ${s.label || s.name} — stop_id: ${s.id}` +
            `, location: ${fmtCoord(s.lat)}, ${fmtCoord(s.lon)}`
        );
        return text(`Matching stops:\n${lines.join("\n")}`);
      })
  );

  /* 4. get_stop_departures */
  server.registerTool(
    "get_stop_departures",
    {
      title: "Get stop departures",
      description:
        "Get the next departures from a specific stop, merged across all routes that " +
        "serve it. Use after finding a stop via find_nearby_stops or search_stops. " +
        "Times are in the agency's local timezone; 'minutes' is minutes from now.",
      inputSchema: {
        stop_id: z.string().min(1).describe("GTFS stop_id (from a stop search/nearby result)."),
        limit: z.number().int().positive().max(20).optional().describe("Max departures (default 8, max 20)."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<DeparturesResponse>("/stops/departures", {
          stop_id: args.stop_id,
          limit: args.limit ?? 8,
          feed_id: feed(args.feed_id),
        });
        const stopName = data.stop?.name || `stop ${args.stop_id}`;
        if (!data.departures?.length) {
          return text(
            `No upcoming departures are scheduled from ${stopName} right now. There may ` +
              `be no more service today — suggest checking the agency website for the full schedule.`
          );
        }
        const lines = data.departures.map(
          (d) =>
            `• ${d.time} (in ${d.minutes} min) — Route ${d.name}` +
            `${d.headsign ? ` toward ${d.headsign}` : ""} (route_id: ${d.route_id})`
        );
        return text(`Next departures from ${stopName}:\n${lines.join("\n")}`);
      })
  );

  /* 5. get_route_map */
  server.registerTool(
    "get_route_map",
    {
      title: "Get route map data",
      description:
        "Get geographic data for a single route: its shape (an ordered list of " +
        "lat/lon points forming the path) and the stops it serves. Useful for " +
        "describing where a route goes. The shape can be long; the summary reports " +
        "its size and lists the stops.",
      inputSchema: {
        route_id: z.string().min(1).describe("GTFS route_id."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<RouteMapResponse>(
          `/map/route/${encodeURIComponent(args.route_id)}`,
          { feed_id: feed(args.feed_id) }
        );
        const stops = data.stops || [];
        if (!stops.length && !(data.shapes || []).length) {
          return text(`No map data was found for route_id "${args.route_id}".`);
        }
        const stopLines = stops.map(
          (s) => `  - ${s.name} (stop_id: ${s.id}) at ${fmtCoord(s.lat)}, ${fmtCoord(s.lon)}`
        );
        return text(
          `Route ${args.route_id} has ${stops.length} stops and a path of ` +
            `${(data.shapes || []).length} shape points.\nStops:\n${stopLines.join("\n")}`
        );
      })
  );

  /* 6. get_system_map */
  server.registerTool(
    "get_system_map",
    {
      title: "Get system map",
      description:
        "Get every route in the transit system with its name, color, and the stops it " +
        "serves. Use when the rider asks what routes exist or wants an overview of the " +
        "network. Shape geometry is omitted from the summary to keep it readable.",
      inputSchema: { ...feedArg },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<SystemMapResponse>("/map/system", {
          feed_id: feed(args.feed_id),
        });
        if (!data.routes?.length) return text("No routes are configured for this feed.");
        const lines = data.routes.map((r) => {
          const label = r.long_name && r.long_name !== r.name ? `${r.name} — ${r.long_name}` : r.name;
          return `• Route ${label} (route_id: ${r.route_id}) — ${r.stops?.length ?? 0} stops`;
        });
        return text(`The system has ${data.routes.length} routes:\n${lines.join("\n")}`);
      })
  );

  /* 7. get_service_alerts */
  server.registerTool(
    "get_service_alerts",
    {
      title: "Get service alerts",
      description:
        "Get active service alerts (delays, detours, cancellations) from GTFS-Realtime. " +
        "IMPORTANT: an empty result is normal and means there are currently NO active " +
        "alerts — it does NOT mean buses aren't running. Many agencies have no alerts " +
        "most of the time, and some have no realtime feed at all.",
      inputSchema: {
        route_id: z.string().optional().describe("Optional: filter alerts to one route_id."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<AlertsResponse>("/rt/alerts", {
          feed_id: feed(args.feed_id),
          route_id: args.route_id,
        });
        const alerts = data.alerts || [];
        if (!alerts.length) {
          return text(
            "There are no active service alerts right now. Normal service is in effect " +
              "(no delays, detours, or cancellations are being reported)."
          );
        }
        const blocks = alerts.map((a) => {
          const tags = [
            a.severity != null ? SEVERITY[a.severity] : null,
            a.effect != null ? EFFECT[a.effect] : null,
            a.cause != null ? CAUSE[a.cause] : null,
          ].filter(Boolean);
          const head = `⚠ ${a.header || "Service alert"}${tags.length ? ` [${tags.join(" · ")}]` : ""}`;
          const body = a.description ? `\n  ${a.description}` : "";
          const routes = a.routes?.length ? `\n  Affected routes: ${a.routes.join(", ")}` : "";
          const more = a.url ? `\n  More info: ${a.url}` : "";
          return head + body + routes + more;
        });
        return text(`Active service alerts:\n${blocks.join("\n\n")}`);
      })
  );

  /* 8. get_live_vehicles */
  server.registerTool(
    "get_live_vehicles",
    {
      title: "Get live vehicles",
      description:
        "Get real-time vehicle positions from GTFS-Realtime: each bus's location, " +
        "heading, the route it's on, and its next stop. IMPORTANT: an empty result is " +
        "normal — it means no vehicles are currently reporting (off-hours, or the " +
        "agency has no realtime vehicle feed). It does NOT imply the schedule is wrong.",
      inputSchema: {
        route_id: z.string().optional().describe("Optional: filter to vehicles on one route_id."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<VehiclesResponse>("/rt/vehicles", {
          feed_id: feed(args.feed_id),
          route_id: args.route_id,
        });
        const vehicles = data.vehicles || [];
        if (!vehicles.length) {
          return text(
            "No vehicles are reporting their position right now. This is normal outside " +
              "service hours or for agencies without a realtime vehicle feed; it doesn't " +
              "mean scheduled service isn't running. Use get_stop_departures for the schedule."
          );
        }
        const lines = vehicles.map((v) => {
          const where = v.next_stop
            ? ` — next stop: ${v.next_stop}${v.next_eta != null ? ` (~${v.next_eta} min)` : ""}`
            : "";
          return (
            `• Route ${v.route_name || v.route_id} bus ${v.id} at ` +
            `${fmtCoord(v.lat)}, ${fmtCoord(v.lon)}` +
            `${v.bearing != null ? `, heading ${Math.round(v.bearing)}°` : ""}${where}`
          );
        });
        return text(`Live vehicles (${vehicles.length}):\n${lines.join("\n")}`);
      })
  );

  /* 9. geocode_address */
  server.registerTool(
    "geocode_address",
    {
      title: "Geocode an address",
      description:
        "Convert an address, landmark, or place name into coordinates, biased to the " +
        "agency's service area. Use this to get a latitude/longitude you can then pass " +
        "to find_nearby_stops.",
      inputSchema: {
        address: z.string().min(1).describe("Address, landmark, or place name."),
        ...feedArg,
      },
    },
    (args) =>
      guard(async () => {
        const data = await api.get<GeocodeResponse>("/geocode", {
          q: args.address,
          feed_id: feed(args.feed_id),
        });
        if (data == null || typeof data.lat !== "number" || typeof data.lon !== "number") {
          return text(
            `Could not find coordinates for "${args.address}". Try a more specific or ` +
              `nearby place name, or search by stop name with search_stops.`
          );
        }
        return text(
          `${data.label || args.address}\nCoordinates: ${fmtCoord(data.lat)}, ${fmtCoord(data.lon)}\n` +
            `Pass these to find_nearby_stops to find the closest stops.`
        );
      })
  );
}

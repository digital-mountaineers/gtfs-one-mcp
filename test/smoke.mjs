// Smoke test: spawn the built server over stdio and exercise tools against the
// live staging site. Not part of the published package — a manual sanity check.
//   node test/smoke.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: {
    ...process.env,
    GTFS_ONE_URL: "https://staging8.mountaintransit.org",
    GTFS_ONE_FEED_ID: "default",
    GTFS_ONE_AGENCY_NAME: "Mountain Transit",
  },
  stderr: "inherit",
});

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`\n=== ${tools.length} tools ===`);
console.log(tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const body = r.content.map((c) => c.text).join("\n");
  console.log(`\n=== ${name}(${JSON.stringify(args)})${r.isError ? " [isError]" : ""} ===\n${body}`);
  return body;
}

await call("list_feeds", {});
await call("search_stops", { query: "goodwin" });
await call("get_stop_departures", { stop_id: "9283893", limit: 3 });
await call("geocode_address", { address: "Big Bear Village" });
await call("find_nearby_stops", { latitude: 34.2425, longitude: -116.911, limit: 2 });
await call("get_system_map", {});
await call("get_service_alerts", {});
await call("get_live_vehicles", {});
await call("get_stop_departures", { stop_id: "does-not-exist" }); // error/empty path

await client.close();
console.log("\nSmoke test complete.");
process.exit(0);

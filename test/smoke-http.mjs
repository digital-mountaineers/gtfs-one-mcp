// HTTP transport smoke test: connect a real MCP client over Streamable HTTP to a
// running `npm run start:http` server and exercise tools.
//   node test/smoke-http.mjs   (server must be listening on MCP_URL)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL || "http://localhost:3000/mcp");
const transport = new StreamableHTTPClientTransport(url);
const client = new Client({ name: "smoke-http", version: "1.0.0" });

await client.connect(transport);
console.log(`connected to ${url} (session: ${transport.sessionId || "n/a"})`);

const { tools } = await client.listTools();
console.log(`\n=== ${tools.length} tools ===\n${tools.map((t) => t.name).join(", ")}`);

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n=== ${name}(${JSON.stringify(args)})${r.isError ? " [isError]" : ""} ===\n${r.content.map((c) => c.text).join("\n")}`);
}

await call("search_stops", { query: "goodwin" });
await call("find_nearby_stops", { latitude: 34.2425, longitude: -116.911, limit: 2 });
await call("get_live_vehicles", {});

await client.close();
console.log("\nHTTP smoke test complete.");
process.exit(0);

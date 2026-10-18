import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output)
  throw new Error("Usage: node scripts/capture-cpu.mjs output/cpu.json");
const metrics = {};
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "tail",
    "our-little-world",
    "--format",
    "json",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let buffer = "";
child.stdout.on("data", (data) => {
  buffer += data.toString();
  let end;
  while ((end = buffer.indexOf("\n}\n")) >= 0) {
    const part = buffer.slice(0, end + 2);
    buffer = buffer.slice(end + 3);
    const root = part.lastIndexOf("\n{\n");
    const start = root >= 0 ? root + 1 : part.indexOf("{");
    if (start < 0) continue;
    let event;
    try {
      event = JSON.parse(part.slice(start));
    } catch {
      child.kill();
      throw new Error("Cannot decode Tail event; CPU capture is incomplete");
    }
    const version = event.scriptVersion?.id || "unknown";
    const row = (metrics[version] ||= {
      requests: 0,
      outcomes: {},
      routes: {},
    });
    row.requests++;
    row.outcomes[event.outcome] = (row.outcomes[event.outcome] || 0) + 1;
    const route = event.event?.request
      ? new URL(event.event.request.url).pathname
      : "rpc:" +
        (event.event?.rpcMethod || event.event?.methodName || "unknown");
    const kind =
      event.durableObjectId || event.entrypoint === "AccountBackend"
        ? "durable"
        : "worker";
    const result = (row.routes[route] ||= {
      requests: 0,
      cpuTotal: 0,
      cpuMax: 0,
      samples: [],
      kind,
    });
    if (!Number.isFinite(event.cpuTime) || event.cpuTime < 0)
      throw new Error("Tail event missing CPU measurement");
    result.requests++;
    result.cpuTotal += event.cpuTime;
    result.cpuMax = Math.max(result.cpuMax, event.cpuTime);
    result.samples.push(event.cpuTime);
    // Never persist request headers, cookies, bodies, logs, or RPC arguments.
    writeFileSync(output, JSON.stringify(metrics, null, 2));
    if (event.outcome !== "ok")
      console.error("Invocation failed:", event.outcome);
  }
});
child.stderr.on("data", (data) => process.stderr.write(data));
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill());

import { readFileSync } from "node:fs";
const [file, version] = process.argv.slice(2);
if (!file || !version)
  throw new Error(
    "Usage: node scripts/check-cpu.mjs output/cpu.json deployed-version-id",
  );
const result = JSON.parse(readFileSync(file, "utf8"))[version];
if (!result) throw new Error("No measurements for deployed version");
let failed = Object.keys(result.outcomes).some((outcome) => outcome !== "ok"),
  http = 0,
  rpc = 0;
for (const [route, data] of Object.entries(result.routes)) {
  const isRpc = data.kind ? data.kind === "durable" : route === "rpc:handleApi",
    budget = isRpc ? 30000 : 10;
  if (!data.kind && route.startsWith("rpc:") && route !== "rpc:handleApi") {
    console.log("Unknown execution context; enforce conservative 10 ms budget:", route);
  }
  if (isRpc) {
    if (route === "rpc:handleApi") rpc += data.requests;
  }
  else if (route.startsWith("/")) http += data.requests;
  const sorted = [...data.samples].sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  console.log(
    `${route}: n=${data.requests}, mean=${(data.cpuTotal / data.requests).toFixed(2)} ms, p95=${p95} ms, max=${data.cpuMax} ms, budget=${budget} ms`,
  );
  if (data.cpuMax > budget) failed = true;
}
// Both sides must be observed; a missing backend trace must never masquerade as a pass.
if (http < 24 || rpc < 24) {
  console.error("Need at least 24 HTTP and 24 Durable Object RPC samples");
  failed = true;
}
if (failed) process.exitCode = 1;
else console.log("CPU budgets passed; all captured invocations succeeded.");

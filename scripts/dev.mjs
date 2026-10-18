import { spawn } from "node:child_process";
const children = [];
function start(args) {
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (code && !stopping) stop(code);
  });
  return child;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
start([
  "node_modules/wrangler/bin/wrangler.js",
  "dev",
  "--ip",
  "127.0.0.1",
  "--port",
  "3019",
  "--assets",
  "public",
]);
let ready = false;
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try {
    await fetch("http://127.0.0.1:3019/api/account/context");
    ready = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
if (ready)
  start([
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "::",
    ...process.argv.slice(2),
  ]);
else {
  console.error("Local API did not start on port 3019.");
  stop(1);
}

import { webcrypto } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";

const mode = process.argv[2];
if (!["local", "remote"].includes(mode))
  throw Error("Usage: node scripts/setup-push.mjs local|remote");
const wrangler = "node_modules/wrangler/bin/wrangler.js";
if (mode === "remote") {
  const secrets = JSON.parse(
    execFileSync(process.execPath, [wrangler, "secret", "list"], {
      encoding: "utf8",
    }),
  );
  if (secrets.some((secret) => secret.name === "PUSH_VAPID_JWK")) {
    console.log("Existing Push key preserved.");
    process.exit(0);
  }
} else if (/^PUSH_VAPID_JWK=/m.test(readFileSync(".dev.vars", "utf8"))) {
  console.log("Existing local Push key preserved.");
  process.exit(0);
}
const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const key = JSON.stringify(
  await webcrypto.subtle.exportKey("jwk", pair.privateKey),
);
if (mode === "remote") {
  // Feed the secret through stdin. Never echo it or include it in command arguments/artifacts.
  execFileSync(
    process.execPath,
    [wrangler, "secret", "put", "PUSH_VAPID_JWK"],
    { input: key, stdio: ["pipe", "pipe", "pipe"] },
  );
} else appendFileSync(".dev.vars", "\nPUSH_VAPID_JWK='" + key + "'\n");
console.log("Push key configured; private material was not printed.");

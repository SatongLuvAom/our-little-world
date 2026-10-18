import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nAPP_URL=http://localhost:3017\n`,
    { flag: "wx" },
  );
  console.log("Created .dev.vars with a random local-only session secret.");
} else console.log("Kept existing .dev.vars.");

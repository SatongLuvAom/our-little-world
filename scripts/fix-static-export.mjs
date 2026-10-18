import { copyFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
// Next.js emits nested RSC segment files on Windows, but its router requests dotted names.
// https://github.com/vercel/next.js/issues/85374
const root = path.resolve("out");
let copied = 0;
for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith(".txt")) continue;
  const source = path.join(entry.parentPath, entry.name);
  const parts = path.relative(root, source).split(path.sep);
  const segment = parts.findIndex(part => part.startsWith("__next."));
  if (segment < 0 || segment === parts.length - 1) continue;
  const target = path.resolve(root, ...parts.slice(0, segment), parts.slice(segment).join("."));
  if (!target.startsWith(root + path.sep)) throw new Error("RSC path escaped export directory");
  if (existsSync(target)) {
    if (!readFileSync(source).equals(readFileSync(target))) throw new Error("RSC filename collision: " + target);
    continue;
  }
  copyFileSync(source, target);
  copied++;
}
console.log(`Prepared ${copied} static RSC segment aliases.`);

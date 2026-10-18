import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const files = readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) =>
    path
      .relative(root, path.join(entry.parentPath, entry.name))
      .split(path.sep)
      .join("/"),
  )
  .filter(
    (name) =>
      name.startsWith("_next/static/") ||
      /\.(?:html|txt|png|svg|webmanifest)$/.test(name),
  )
  .filter((name) => !name.startsWith("api/") && !name.startsWith("_not-found/"))
  .filter(
    (name) => !["404.html", "_not-found.html", "_not-found.txt"].includes(name),
  )
  .sort();
const routes = Object.fromEntries(
  files
    .filter((name) => name.endsWith(".html"))
    .flatMap((name) => {
      const route = name === "index.html" ? "/" : "/" + name.slice(0, -5);
      return [
        [route, "/" + name],
        ...(route === "/" ? [] : [[route + "/", "/" + name]]),
      ];
    }),
);
const template = readFileSync("scripts/service-worker.js", "utf8");
const urls = files.map(
  (name) => "/" + name.split("/").map(encodeURIComponent).join("/"),
);
const hash = createHash("sha256")
  .update(template)
  .update(JSON.stringify(urls))
  .update(JSON.stringify(routes));
const integrity = {};
for (let i = 0; i < files.length; i++) {
  const content = readFileSync(path.join(root, files[i]));
  hash.update(files[i]).update(content);
  integrity[urls[i]] =
    "sha256-" + createHash("sha256").update(content).digest("base64");
}
const version = hash.digest("hex").slice(0, 20);
writeFileSync(
  path.join(root, "sw.js"),
  template
    .replace("__VERSION__", version)
    .replace("__FILES__", JSON.stringify(urls))
    .replace("__ROUTES__", JSON.stringify(routes))
    .replace("__INTEGRITY__", JSON.stringify(integrity)),
);
console.log(
  `Prepared PWA ${version}: ${files.length} public assets, ${Object.keys(routes).length} routes.`,
);

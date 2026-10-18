import { readFileSync } from "node:fs";
const files = process.argv.slice(2);
if (!files.length)
  throw Error(
    "Usage: node scripts/check-mobile-budget.mjs <Lighthouse JSON> [...]",
  );
// A cold mobile lab budget, not a claim about real-user INP or WCAG conformance.
const limits = {
  performanceMin: 0.85,
  accessibilityMin: 1,
  lcpMaxMs: 4000,
  tbtMaxMs: 200,
  clsMax: 0.1,
  transferMaxBytes: 500000,
};
let failed = false;
for (const file of files) {
  const r = JSON.parse(readFileSync(file, "utf8"));
  const values = {
    performance: r.categories.performance.score,
    accessibility: r.categories.accessibility.score,
    lcpMs: r.audits["largest-contentful-paint"].numericValue,
    tbtMs: r.audits["total-blocking-time"].numericValue,
    cls: r.audits["cumulative-layout-shift"].numericValue,
    transferBytes: r.audits["total-byte-weight"].numericValue,
  };
  const pass =
    !r.runtimeError &&
    Object.values(values).every(Number.isFinite) &&
    values.performance >= limits.performanceMin &&
    values.accessibility >= limits.accessibilityMin &&
    values.lcpMs <= limits.lcpMaxMs &&
    values.tbtMs <= limits.tbtMaxMs &&
    values.cls <= limits.clsMax &&
    values.transferBytes <= limits.transferMaxBytes;
  console.log(JSON.stringify({ file, pass, values, limits }));
  if (!pass) failed = true;
}
if (failed) process.exitCode = 1;

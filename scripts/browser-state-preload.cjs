/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin;
  const checks = [];
  const check = (ok, label) => {
    if (!ok) throw Error(label);
    checks.push(label);
  };
  for (const path of ["/quests", "/savings"]) {
    const context = await page.context().browser().newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    try {
      const p = await context.newPage();
      const errors = [], requests = [];
      p.on("pageerror", () => errors.push(true));
      p.on("request", (r) => {
        if (new URL(r.url()).pathname === "/api/quests/state") requests.push(r.url());
      });
      let release;
      const barrier = new Promise((resolve) => { release = resolve; });
      let first = true;
      await p.route("**/api/quests/state?*", async (route) => {
        if (first) {
          first = false;
          await barrier;
        }
        await route.continue();
      });
      await p.goto(origin + path, { waitUntil: "domcontentloaded" });
      await p.getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true }).waitFor();
      check(await p.getByText("DEMO MODE", { exact: true }).count() === 0,
        path + " keeps Demo hidden while authorization is pending");
      check(await p.locator(".goal-amount, .quest-row").count() === 0,
        path + " keeps records hidden while authorization is pending");
      release();
      await p.getByText("DEMO MODE", { exact: true }).waitFor();
      check(requests.length === 1, path + " consumes one initial state request");
      const response = await p.evaluate(async () => {
        const r = await fetch("/api/quests/state?planning=1&journal=1&pet=1", { cache: "no-store" });
        await r.arrayBuffer();
        return { status: r.status, cache: r.headers.get("Cache-Control") };
      });
      check(requests.length === 2 && response.status === 401 && response.cache.includes("no-store"),
        path + " a later no-store read reaches the server again");
      const refreshed = p.waitForResponse((r) => new URL(r.url()).pathname === "/api/quests/state");
      await p.evaluate(() => window.dispatchEvent(new Event("focus")));
      await refreshed;
      check(requests.length === 3, path + " focus refresh does not reuse initial state");
      if (path === "/quests") {
        await p.goto(origin + "/quests?tab=rewards");
        await p.getByRole("button", { name: "ร้านรางวัล", exact: true }).waitFor();
        check(await p.getByRole("button", { name: "ร้านรางวัล", exact: true }).getAttribute("aria-pressed") === "true",
          "rewards deep link survives route splitting");
      }
      check(errors.length === 0, path + " has no hydration or runtime errors");
    } finally {
      await context.close();
    }
  }
  return { passed: checks.length, checks };
}

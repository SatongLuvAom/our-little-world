/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
// Local preview only: open the previous build first, then serve the new build before running.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://localhost:3018")
    throw Error("Update fixture is restricted to local preview");
  const checks = [];
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const workerResponse = await page.request.get(origin + "/sw.js", {
    headers: { "Cache-Control": "no-cache" },
  });
  if (workerResponse.status() !== 200) throw Error("New build worker is unavailable");
  const workerSource = await workerResponse.text();
  const cacheMatch = workerSource.match(/^const CACHE = ("[^"]+");$/m);
  const filesMatch = workerSource.match(/^const FILES = (\[[^\n]+\]);$/m);
  if (!cacheMatch || !filesMatch) throw Error("New build public manifest is missing");
  const expectedCache = JSON.parse(cacheMatch[1]);
  const expectedFiles = JSON.parse(filesMatch[1]);
  const initial = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      controlled: !!navigator.serviceWorker.controller,
      active: reg?.active?.state,
      caches: await caches.keys(),
    };
  });
  const previousCaches = initial.caches.filter((key) => key.startsWith("olw-static-") && key !== expectedCache);
  check(initial.controlled && initial.active === "activated" && previousCaches.length > 0,
    "update starts from an active controller and a different previous public cache");
  await page.locator(".loading-screen").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "เรื่องของเราสองคน", exact: true }).waitFor();
  await page.getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true }).waitFor({ state: "hidden" });
  const second = await page.context().newPage();
  try {
    await second.goto(origin + "/us");
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    await page
      .getByRole("button", { name: "อัปเดตแอป", exact: true })
      .waitFor({ timeout: 60000 });
    check(
      await page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
      ),
      "new build waits without replacing the active app",
    );
    await page.getByRole("button", { name: "อัปเดตแอป", exact: true }).click();
    await page
      .getByText("ปิดแท็บหรือหน้าต่างอื่นของแอปนี้ก่อน แล้วกดอัปเดตอีกครั้ง", {
        exact: true,
      })
      .waitFor();
    check(
      await page.evaluate(
        async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
      ),
      "update is blocked while another app window remains open",
    );
    await second.close();
    await page
      .getByRole("button", { name: "แก้ไขข้อมูลของเรา", exact: true })
      .click();
    await page.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent.includes("อัปเดตแอป"))
        .click(),
    );
    await page
      .getByText("บันทึกหรือปิดแบบฟอร์มก่อนอัปเดตแอป", { exact: true })
      .waitFor();
    check(
      await page.getByRole("dialog").isVisible(),
      "an open form blocks reload and keeps its contents",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "ปิด", exact: true })
      .click();
    await page.evaluate(() =>
      localStorage.setItem(
        "olw:pending-reward:qa-update:massage",
        "original-update-receipt",
      ),
    );
    await Promise.all([
      page.waitForEvent("load"),
      page.getByRole("button", { name: "อัปเดตแอป", exact: true }).click(),
    ]);
    await page.waitForFunction(
      async () => !(await navigator.serviceWorker.getRegistration()).waiting,
    );
    check(
      await page.evaluate(
        () =>
          localStorage.getItem("olw:pending-reward:qa-update:massage") ===
          "original-update-receipt",
      ),
      "explicit update reload preserves the original pending financial receipt",
    );
    const publicCache = await page.evaluate(async ({ expectedCache, expectedFiles }) => {
      if (!(await caches.keys()).includes(expectedCache)) return { complete: false, privatePaths: [] };
      const current = await caches.open(expectedCache);
      const paths = (await current.keys()).map((request) => new URL(request.url).pathname);
      const fonts = expectedFiles.filter((path) => path.startsWith("/_next/static/media/") && /\.(woff2?|ttf|otf)$/.test(path));
      const required = ["/savings.html", "/quests.html", ...fonts];
      const responses = await Promise.all(required.map((path) => current.match(path)));
      const privatePaths = [];
      for (const key of await caches.keys())
        for (const request of await (await caches.open(key)).keys())
          if (new URL(request.url).pathname.startsWith("/api/")) privatePaths.push(request.url);
      return {
        complete: paths.length === expectedFiles.length && expectedFiles.every((path) => paths.includes(path)) && fonts.length > 0 && responses.every((response) => response?.status === 200),
        privatePaths,
        assets: paths.length,
        fonts: fonts.length,
      };
    }, { expectedCache, expectedFiles });
    check(publicCache.complete, "updated worker activates the new build's complete public cache including Savings, Quests and fonts");
    check(publicCache.privatePaths.length === 0, "current and previous public caches contain no private API response");
    await page.context().setOffline(true);
    await page.reload();
    await page
      .getByRole("heading", { name: "เรื่องของเราสองคน", exact: true })
      .waitFor();
    const privateOffline = await page.evaluate(async () => {
      try {
        await fetch("/api/quests/state", { cache: "no-store" });
        return false;
      } catch {
        return true;
      }
    });
    check(
      privateOffline &&
        (await page
          .getByRole("button", { name: "สำรองข้อมูลจริง", exact: true })
          .isDisabled()),
      "updated build cold-starts with a disconnected network and private writes disabled",
    );
    return { passed: checks.length, checks, expectedCache, previousCaches, publicAssets: publicCache.assets, fontAssets: publicCache.fonts };
  } finally {
    await page.context().setOffline(false);
    await page.evaluate(() =>
      localStorage.removeItem("olw:pending-reward:qa-update:massage"),
    );
    if (!second.isClosed()) await second.close();
  }
}

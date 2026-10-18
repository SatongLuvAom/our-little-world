/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
// Local preview only: serve the built worker with a different QA cache version before running.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://localhost:3018")
    throw Error("Update fixture is restricted to local preview");
  const checks = [];
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
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
    check(
      (await page.evaluate(() => caches.keys())).some((key) =>
        key.endsWith("-qa-update"),
      ),
      "updated worker activates its complete public cache",
    );
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
    return { passed: checks.length, checks };
  } finally {
    await page.context().setOffline(false);
    await page.evaluate(() =>
      localStorage.removeItem("olw:pending-reward:qa-update:massage"),
    );
    if (!second.isClosed()) await second.close();
  }
}

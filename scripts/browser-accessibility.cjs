/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const base = new URL(page.url()).origin,
    rows = [],
    issues = []
  const context = await page.context().browser().newContext()
  page = await context.newPage()
  try {
    const routes = [
      "/",
      "/quests",
      "/savings",
      "/explore",
      "/us",
      "/explore/dates",
      "/explore/wishlist",
      "/explore/calendar",
      "/explore/memories",
      "/explore/letters",
      "/explore/mood",
      "/explore/roulette",
      "/explore/pet",
      "/login",
      "/register",
      "/account",
      "/pairing",
    ]
    await page.setViewportSize({ width: 390, height: 844 })
    for (const { path, width } of [
      ...routes.map((path) => ({ path, width: 390 })),
      ...["/", "/quests", "/us", "/register"].map((path) => ({
        path,
        width: 1440,
      })),
    ]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(base + path)
      if (path === "/account" || path === "/pairing")
        await page.waitForURL(base + "/login")
      await page.locator("main h1").waitFor()
      await page
        .getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true })
        .waitFor({ state: "hidden" })
      await page.addScriptTag({ path: "output/axe.min.js" })
      const audit = async (state) => {
        const result = await page.evaluate(async () => {
          const r = await axe.run(document, {
            runOnly: {
              type: "tag",
              values: [
                "wcag2a",
                "wcag2aa",
                "wcag21a",
                "wcag21aa",
                "wcag22aa",
                "best-practice",
              ],
            },
          })
          return {
            violations: r.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              nodes: v.nodes.map((n) => ({
                target: n.target,
                summary: n.failureSummary,
                html: n.html.slice(0, 220),
              })),
            })),
            incomplete: r.incomplete.map((v) => ({
              id: v.id,
              nodes: v.nodes.length,
            })),
          }
        })
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        )
        rows.push({
          path,
          width,
          state,
          overflow,
          violations: result.violations,
          incomplete: result.incomplete,
        })
      }
      await audit("page")
      const trigger = page.getByRole("button", {
        name: {
          "/quests": "เพิ่มภารกิจ",
          "/savings": "สร้างเป้าหมาย",
          "/explore/dates": "วางแผนเดต",
          "/explore/memories": "เพิ่มความทรงจำ",
          "/explore/letters": "เขียนจดหมาย",
          "/explore/wishlist": "เพิ่ม Wishlist",
          "/us": "แก้ไขข้อมูลของเรา",
        }[path],
        exact: true,
      })
      if (
        [
          "/quests",
          "/savings",
          "/explore/dates",
          "/explore/memories",
          "/explore/letters",
          "/explore/wishlist",
          "/us",
        ].includes(path) &&
        (await trigger.count()) &&
        (await trigger.isEnabled())
      ) {
        await trigger.click()
        await page.getByRole("dialog").waitFor()
        await page
          .getByRole("dialog")
          .evaluate((el) =>
            Promise.all(el.getAnimations().map((a) => a.finished)),
          )
        await audit("dialog")
        await page.keyboard.press("Escape")
        await page.getByRole("dialog").waitFor({ state: "hidden" })
        issues.push({
          path,
          focusRestored: await trigger.evaluate(
            (el) => el === document.activeElement,
          ),
        })
      }
    }
    if (
      rows.some((row) => row.violations.length || row.overflow) ||
      issues.some((issue) => !issue.focusRestored)
    )
      throw Error(
        "Accessibility regression: " +
          JSON.stringify({
            rows: rows.filter((row) => row.violations.length || row.overflow),
            issues: issues.filter((issue) => !issue.focusRestored),
          }),
      )
    return { rows, issues }
  } finally {
    await context.close()
  }
}

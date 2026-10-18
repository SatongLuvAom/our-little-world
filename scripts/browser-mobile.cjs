/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    cohort = Date.now().toString(36),
    contexts = [],
    pages = [],
    accounts = [],
    checks = [],
    violations = []
  const check = (ok, name) => {
    if (!ok) throw Error(name)
    checks.push(name)
  }
  const post = (p, path, body = {}) =>
    p.request.post(origin + "/api/" + path, {
      headers: { Origin: origin },
      data: body,
    })
  const state = async (p) =>
    (await p.request.get(origin + "/api/quests/state?planning=1&pet=1")).json()
  const audit = async (p, label) => {
    await p.addScriptTag({ path: "output/axe.min.js" })
    const result = await p.evaluate(async () => {
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
      return r.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      }))
    })
    if (result.length) violations.push({ label, result })
    if (result.length === 0)
      checks.push("axe WCAG A/AA + best practice: " + label)
  }
  try {
    let unexpected = 0
    for (let i = 0; i < 4; i++) {
      const context = await page
        .context()
        .browser()
        .newContext({ viewport: { width: 390, height: 844 } })
      contexts.push(context)
      const p = await context.newPage()
      pages.push(p)
      p.on("pageerror", (e) => {
        if (!e.message.includes("DIAGNOSTIC-QA-PRIVATE-CONTENT")) unexpected++
      })
      const cdp = await context.newCDPSession(p)
      await cdp.send("WebAuthn.enable")
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      })
      await p.goto(origin + "/register")
      await p.waitForFunction(
        () =>
          Object.keys(document.querySelector("form") || {}).some((k) =>
            k.startsWith("__reactProps$"),
          ),
        null,
        { timeout: 45000 },
      )
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Mobile QA " + i)
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i)
      await p
        .getByRole("button", { name: "สมัครด้วย Passkey", exact: true })
        .click()
      await p.waitForURL(origin + "/account")
      const { profile } = await (
        await p.request.get(origin + "/api/account/context")
      ).json()
      accounts.push({ id: profile.id, username: profile.username })
    }
    const [a, b, c, d] = pages
    await a.goto(origin + "/pairing")
    await a
      .getByRole("button", { name: "สร้างคู่ของเรา", exact: true })
      .waitFor()
    await audit(a, "unpaired pairing forms")
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (
          await post(owner, "account/couple", { anniversary: "2024-02-14" })
        ).ok(),
        "create QA couple",
      )
      const invite = await (await post(owner, "account/invitation")).json()
      check(
        (await post(partner, "account/accept", { token: invite.token })).ok(),
        "pair QA partners",
      )
    }
    const before = await state(a)
    await a.goto(origin + "/us?secret=DIAGNOSTIC-QA-PRIVATE-CONTENT")
    await a.getByRole("button", { name: "ดูสถานะแอป", exact: true }).waitFor()
    const reportResponse = a.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/diagnostics/report",
    )
    await a.evaluate(() =>
      setTimeout(() => {
        throw Error("DIAGNOSTIC-QA-PRIVATE-CONTENT")
      }, 0),
    )
    const response = await reportResponse,
      payload = response.request().postDataJSON()
    check(
      response.ok(),
      "actual uncaught browser error reaches authenticated diagnostics endpoint",
    )
    check(
      Object.keys(payload).sort().join(",") === "code,route" &&
        payload.code === "runtime" &&
        payload.route === "/us",
      "browser report excludes message/stack/query/fragment/user data",
    )
    const own = await (
      await a.request.get(origin + "/api/diagnostics/state")
    ).json()
    check(
      own.totalCount === 1 &&
        own.events[0].last_id === response.headers()["x-olw-request-id"],
      "stored signal matches response correlation ID",
    )
    check(
      !JSON.stringify(own).includes("PRIVATE"),
      "stored diagnostics contain no exception text or URL secrets",
    )
    check(
      (await (await b.request.get(origin + "/api/diagnostics/state")).json())
        .totalCount === 1,
      "partner can see the same couple's diagnostics",
    )
    check(
      (await (await c.request.get(origin + "/api/diagnostics/state")).json())
        .totalCount === 0,
      "other couple cannot see the signal",
    )
    check(
      (
        await post(a, "diagnostics/report", {
          route: "/us",
          code: "runtime",
          couple_id: before.couple.id,
          message: "PRIVATE",
        })
      ).status() === 400,
      "extra private data and forged scope are rejected",
    )
    const forged = await a.request.post(origin + "/api/diagnostics/report", {
      headers: {
        Origin: origin,
        "X-OLW-Request-ID": "DIAGNOSTIC-QA-PRIVATE-CONTENT",
      },
      data: { route: "/us", code: "asset" },
    })
    check(
      forged.ok() &&
        /^[0-9a-f-]{36}$/.test(forged.headers()["x-olw-request-id"]),
      "edge replaces caller-supplied diagnostic IDs",
    )
    await a.getByRole("button", { name: "ดูสถานะแอป", exact: true }).click()
    await a
      .getByText("พบสัญญาณปัญหา 2 ครั้งใน 7 วันที่ผ่านมา", { exact: true })
      .waitFor()
    check(true, "Us displays the true seven-day total and support ID")
    await audit(a, "paired Us with diagnostics, Push and backup controls")
    const after = await state(b)
    check(
      after.balance === before.balance &&
        after.planning.history.entries.length ===
          before.planning.history.entries.length &&
        after.gamification.pet.feeds === before.gamification.pet.feeds,
      "monitoring leaves money/hearts/pet state unchanged",
    )
    for (const path of [
      "/account",
      "/pairing",
      "/quests",
      "/savings",
      "/explore/mood",
    ]) {
      await a.goto(origin + path)
      if (path === "/pairing") await a.waitForURL(origin + "/account")
      await a.locator("main h1").waitFor()
      await a.locator(".loading-screen").waitFor({ state: "hidden" })
      if (path !== "/account" && path !== "/pairing")
        await a.getByText("SHARED · D1", { exact: true }).waitFor()
      await audit(a, "paired " + path)
    }
    await a.goto(origin + "/quests")
    await a.getByText("SHARED · D1", { exact: true }).waitFor()
    const performanceSession = await a.context().newCDPSession(a)
    await performanceSession.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await a.evaluate(() => {
      window.__auditInteractions = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.interactionId)
            window.__auditInteractions.push(entry.duration)
      }).observe({ type: "event", buffered: true, durationThreshold: 16 })
    })
    await a.keyboard.press("Tab")
    check(
      await a
        .getByRole("link", { name: "ข้ามไปเนื้อหา", exact: true })
        .evaluate((el) => el === document.activeElement),
      "skip link is first in keyboard order",
    )
    await a.keyboard.press("Enter")
    check(
      await a.locator("main").evaluate((el) => el === document.activeElement),
      "skip link moves actual keyboard focus to main",
    )
    const trigger = a.getByRole("button", { name: "เพิ่มภารกิจ", exact: true })
    await trigger.evaluate((el) =>
      el.setAttribute("data-qa-focus", "quest-trigger"),
    )
    await trigger.click()
    const dialog = a.getByRole("dialog")
    await dialog.waitFor()
    await dialog.evaluate((el) =>
      Promise.all(el.getAnimations().map((a) => a.finished)),
    )
    for (let i = 0; i < 16; i++) {
      await a.keyboard.press(i % 2 ? "Shift+Tab" : "Tab")
      check(
        await a.evaluate(
          () => !!document.activeElement?.closest('[role="dialog"]'),
        ),
        "dialog traps keyboard focus step " + i,
      )
    }
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click()
    check(
      (await dialog.locator('[aria-invalid="true"]').count()) > 0,
      "invalid form exposes aria-invalid",
    )
    check(
      await dialog
        .locator('[aria-invalid="true"]')
        .first()
        .evaluate(
          (el) =>
            !!document.getElementById(el.getAttribute("aria-describedby")),
        ),
      "invalid field has linked error description",
    )
    await a.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    await a.waitForFunction(() => window.__auditInteractions.length > 0)
    const labInteractionMaxMs = await a.evaluate(() =>
      Math.max(...window.__auditInteractions),
    )
    check(
      labInteractionMaxMs <= 200,
      "measured keyboard/form interactions stay within 200 ms under 4x CPU slowdown",
    )
    await performanceSession.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await audit(a, "invalid quest editor")
    await a.keyboard.press("Escape")
    await dialog.waitFor({ state: "hidden" })
    await a.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-qa-focus") ===
        "quest-trigger",
    )
    check(true, "Escape restores focus to opener")
    check(
      (await a
        .getByRole("button", { name: "ภารกิจ", exact: true })
        .getAttribute("aria-pressed")) === "true",
      "selected section is exposed to assistive technology",
    )
    const focusQuest = {
      id: crypto.randomUUID(),
      version: 0,
      title: "QA focus after delete",
      assignee_id: null,
      due: before.day,
      repeat: "ครั้งเดียว",
      hearts: 1,
    }
    check(
      (await post(a, "quests/save", focusQuest)).ok(),
      "seed only QA quest for removed-opener focus test",
    )
    await a.reload()
    await a.getByText(focusQuest.title, { exact: true }).waitFor()
    await a.getByRole("button", { name: "ลบภารกิจ", exact: true }).click()
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "ยืนยันการลบ", exact: true })
      .click()
    await a.getByRole("dialog").waitFor({ state: "hidden" })
    await a.waitForFunction(() => document.activeElement?.id === "main")
    check(
      true,
      "deleting the opener restores focus to main instead of the document body",
    )
    for (const width of [320, 390, 430]) {
      await a.setViewportSize({ width, height: 844 })
      for (const path of [
        "/quests",
        "/savings",
        "/us",
        "/explore",
        "/explore/calendar",
        "/explore/memories",
      ]) {
        await a.goto(origin + path)
        await a.getByText("SHARED · D1", { exact: true }).waitFor()
        check(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "no horizontal overflow " + width + " " + path,
        )
      }
    }
    await a.setViewportSize({ width: 390, height: 844 })
    await a.goto(origin + "/us")
    await a.getByText("SHARED · D1", { exact: true }).waitFor()
    for (const path of ["/quests", "/savings", "/us"]) {
      await a.goto(origin + path)
      await a.getByText("SHARED · D1", { exact: true }).waitFor()
      await a.evaluate(() => {
        const sizes = [...document.querySelectorAll("main *")]
          .filter((el) => el instanceof HTMLElement)
          .map((el) => [el, parseFloat(getComputedStyle(el).fontSize)])
        for (const [el, size] of sizes) el.style.fontSize = size * 2 + "px"
      })
      check(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "main text at 200 percent has no horizontal overflow " + path,
      )
    }
    await a.goto(origin + "/us")
    await a.getByText("SHARED · D1", { exact: true }).waitFor()
    await a.emulateMedia({ reducedMotion: "reduce" })
    check(
      await a.evaluate(() =>
        document
          .getAnimations()
          .every((a) => a.effect.getComputedTiming().duration <= 1),
      ),
      "reduced motion removes long or repeating animations",
    )
    await a.screenshot({
      path: "output/playwright/phase6-mobile.png",
      animations: "disabled",
    })
    check(unexpected === 0, "no unexpected browser runtime errors")
    check(violations.length === 0, "all audited states have no axe violations")
    return {
      passed: checks.length,
      checks,
      accounts,
      cohort,
      violations,
      labInteractionMaxMs,
      diagnosticId: own.events[0].last_id,
    }
  } catch (error) {
    throw Error(
      error.message +
        "; QA accounts=" +
        JSON.stringify(accounts) +
        "; cohort=" +
        cohort +
        "; violations=" +
        JSON.stringify(violations),
    )
  } finally {
    for (const context of contexts) await context.close()
  }
}

/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    browser = page.context().browser();
  const contexts = [],
    accounts = [],
    checks = [],
    errors = [],
    cohort = Date.now().toString(36);
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const api = (p, family, op, body = {}) =>
    p.request.post(origin + "/api/" + family + "/" + op, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) =>
    (
      await p.request.get(
        origin + "/api/quests/state?planning=1&journal=1&pet=1",
      )
    ).json();
  const go = async (p, path) => {
    await p.goto(origin + path);
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  const ready = async (p) => {
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
      timeout: 60000,
    });
    await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  };
  const item = (p) =>
    p.locator(".pet-shop-item").filter({ hasText: "หมวกใบโปรด" });
  try {
    const pages = [];
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
      });
      contexts.push(context);
      const p = await context.newPage();
      pages.push(p);
      p.setDefaultTimeout(30000);
      p.on("pageerror", (e) => errors.push(e.message));
      const cdp = await context.newCDPSession(p);
      await cdp.send("WebAuthn.enable");
      await cdp.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await p.goto(origin + "/register");
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("PWA QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const contextData = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({
        id: contextData.profile.id,
        username: contextData.profile.username,
      });
      await ready(p);
    }
    let [a, b, c, d] = pages;
    const ac = contexts[0];
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (
          await api(owner, "account", "couple", { anniversary: "2024-02-14" })
        ).ok(),
        "create QA couple",
      );
      const invitation = await (
        await api(owner, "account", "invitation")
      ).json();
      check(
        (
          await api(partner, "account", "accept", { token: invitation.token })
        ).ok(),
        "pair QA partners",
      );
    }
    let s = await state(a);
    const quest = crypto.randomUUID(),
      goal = crypto.randomUUID();
    check(
      (
        await api(a, "quests", "save", {
          id: quest,
          version: 0,
          title: "PWA shared quest",
          assignee_id: null,
          due: s.day,
          repeat: "ครั้งเดียว",
          hearts: 500,
        })
      ).ok(),
      "seed shared quest",
    );
    const requestId = crypto.randomUUID();
    const completed = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        api(i % 2 ? a : b, "quests", "complete", {
          id: quest,
          request_id: requestId,
        }).then((r) => r.json()),
      ),
    );
    check(
      completed.filter((r) => r.applied).length === 1 &&
        (await state(a)).balance === 500,
      "same quest retry across both partners awards hearts once",
    );
    check(
      (
        await api(a, "planning", "save", {
          kind: "goal",
          id: goal,
          version: 0,
          title: "PWA shared goal",
          target_cents: 100000,
          due: "2099-12-31",
        })
      ).ok(),
      "seed shared savings goal",
    );
    await go(a, "/quests?tab=rewards");
    let resolveReward;
    const lostReward = new Promise((resolve) => {
      resolveReward = resolve;
    });
    await a.route("**/api/quests/redeem", async (route) => {
      const r = await route.fetch();
      resolveReward({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    const reward = a
      .locator(".reward-card")
      .filter({ hasText: "คูปองนวดไหล่" });
    await reward.getByRole("button").click();
    await click(a, "ยืนยันแลกรางวัล");
    const spent = await lostReward;
    check(
      spent.status === 200 && spent.body.applied,
      "reward commits before response is lost",
    );
    await a.close();
    a = await ac.newPage();
    a.setDefaultTimeout(30000);
    await go(a, "/quests?tab=rewards");
    check(
      await a
        .locator(".reward-card")
        .filter({ hasText: "คูปองนวดไหล่" })
        .getByRole("button", { name: /ตรวจสอบรายการเดิม/ })
        .isEnabled(),
      "pending reward survives a fully closed window with empty sessionStorage",
    );
    const afterSpend = (await state(a)).balance;
    await a
      .locator(".reward-card")
      .filter({ hasText: "คูปองนวดไหล่" })
      .getByRole("button")
      .click();
    await click(a, "ยืนยันแลกรางวัล");
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      (await state(a)).balance === afterSpend,
      "reward receipt retry never deducts hearts twice",
    );
    await go(a, "/savings");
    let resolveDeposit;
    const lostDeposit = new Promise((resolve) => {
      resolveDeposit = resolve;
    });
    await a.route("**/api/planning/deposit", async (route) => {
      const r = await route.fetch();
      resolveDeposit({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    await click(a, "บันทึกเงินออม");
    await a
      .getByRole("dialog")
      .getByLabel("ยอดที่ออม (บาท)", { exact: true })
      .fill("12.34");
    await a
      .getByRole("dialog")
      .getByLabel("ใครเป็นคนออม", { exact: true })
      .selectOption({ label: "PWA QA 1" });
    await a
      .getByRole("dialog")
      .getByLabel("บันทึกช่วยจำ", { exact: true })
      .fill("PWA receipt");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    const deposited = await lostDeposit;
    check(
      deposited.status === 200 && deposited.body.applied,
      "deposit commits before response is lost",
    );
    await a.close();
    a = await ac.newPage();
    a.setDefaultTimeout(30000);
    await go(a, "/savings");
    await a
      .getByRole("button", { name: "ตรวจสอบรายการออมเดิม", exact: true })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "บันทึกเงินออม", exact: true })
        .isDisabled(),
      "uncertain deposit blocks a replacement deposit after app restart",
    );
    await click(a, "ตรวจสอบรายการออมเดิม");
    await a
      .getByRole("button", { name: "ตรวจสอบรายการออมเดิม", exact: true })
      .waitFor({ state: "hidden" });
    s = await state(a);
    check(
      s.planning.goals[0].total_cents === 1234 &&
        s.planning.history.entries.length === 1 &&
        s.planning.goals[0].contributions[accounts[1].id] === 1234,
      "deposit keeps original amount and contributor and credits exactly once",
    );
    await go(a, "/explore/pet");
    let resolvePurchase;
    const lostPurchase = new Promise((resolve) => {
      resolvePurchase = resolve;
    });
    await a.route("**/api/pet/purchase", async (route) => {
      const r = await route.fetch();
      resolvePurchase({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    await item(a).getByRole("button", { name: "ซื้อ", exact: true }).click();
    const purchased = await lostPurchase;
    check(
      purchased.status === 200 && purchased.body.applied,
      "pet purchase commits before response is lost",
    );
    await a.close();
    a = await ac.newPage();
    a.setDefaultTimeout(30000);
    await go(a, "/explore/pet");
    await item(a)
      .getByRole("button", { name: "ตรวจสอบรายการเดิม", exact: true })
      .waitFor();
    const beforeRetry = (await state(a)).balance;
    await item(a)
      .getByRole("button", { name: "ตรวจสอบรายการเดิม", exact: true })
      .click();
    await item(a).getByRole("button", { name: "ถอด", exact: true }).waitFor();
    check(
      (await state(a)).balance === beforeRetry,
      "pet purchase retry after restart never spends twice",
    );
    await go(a, "/savings");
    await ready(a);
    let posts = 0;
    a.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/api/"))
        posts++;
    });
    await ac.setOffline(true);
    await a.getByText(/ออฟไลน์ · อ่านข้อมูลที่โหลดไว้ในรอบนี้ได้/).waitFor();
    check(
      await a
        .getByRole("heading", { name: "PWA shared goal", exact: true })
        .isVisible(),
      "offline retains already loaded shared data for read-only viewing",
    );
    check(
      await a
        .getByRole("button", { name: "บันทึกเงินออม", exact: true })
        .isDisabled(),
      "offline savings button is disabled",
    );
    await a
      .locator(".bottom-nav")
      .getByRole("link", { name: "Quest", exact: true })
      .click();
    await a
      .getByRole("heading", { name: "ภารกิจของเรา", exact: true })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "เพิ่มภารกิจ", exact: true })
        .isDisabled(),
      "offline client navigation and chunks work while writes stay disabled",
    );
    check(
      (await a.locator(".summary-strip").innerText()).includes(
        String(beforeRetry),
      ),
      "offline navigation preserves shared wallet in memory",
    );
    const cachePaths = await a.evaluate(async () => {
      const paths = [];
      for (const key of await caches.keys())
        for (const request of await (await caches.open(key)).keys())
          paths.push(new URL(request.url).pathname);
      return paths;
    });
    check(
      cachePaths.length > 100 &&
        cachePaths.every((path) => !path.startsWith("/api/")),
      "Cache Storage contains public build assets only",
    );
    const privateResult = await a.evaluate(async () => {
      try {
        await fetch("/api/quests/state", { cache: "no-store" });
        return "unexpected";
      } catch {
        return "network-only";
      }
    });
    check(
      privateResult === "network-only",
      "private API cannot be read from an offline cache",
    );
    const cold = await ac.newPage();
    for (const path of [
      "/",
      "/quests",
      "/savings",
      "/explore",
      "/explore/dates",
      "/explore/wishlist",
      "/explore/calendar",
      "/explore/memories",
      "/explore/letters",
      "/explore/mood",
      "/explore/pet",
      "/us",
    ]) {
      await cold.goto(origin + path);
      await cold
        .getByText(/ออฟไลน์ · อ่านข้อมูลที่โหลดไว้ในรอบนี้ได้/)
        .waitFor();
      check(
        !(await cold.getByText("DEMO MODE", { exact: true }).isVisible()),
        "offline cold start never impersonates Demo: " + path,
      );
    }
    check(
      !(await cold.getByText("PWA shared goal", { exact: true }).isVisible()),
      "closed/reopened offline app cannot reveal another cached account snapshot",
    );
    await cold.close();
    await ac.setOffline(false);
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    check(posts === 0, "reconnect sends no automatic POST or financial replay");
    s = await state(a);
    check(
      s.balance === beforeRetry && s.planning.goals[0].total_cents === 1234,
      "offline and reconnect leave D1 money and hearts unchanged",
    );
    const other = await state(c);
    check(
      other.balance === 0 &&
        other.planning.goals.length === 0 &&
        other.quests.length === 0,
      "other couple never receives this couple's shared data",
    );
    await go(a, "/us");
    // Avoid a native install dialog during automation; manual iPhone/Android guidance is still available.
    await a.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    check(
      !(await a
        .getByRole("button", { name: "ติดตั้งแอป", exact: true })
        .isVisible()),
      "standalone installation state hides install action",
    );
    const cdp = await ac.newCDPSession(a);
    const manifest = await cdp.send("Page.getAppManifest");
    check(
      !manifest.errors.length && manifest.url.endsWith("manifest.webmanifest"),
      "Chromium parses the web app manifest without errors",
    );
    const installability = await cdp.send("Page.getInstallabilityErrors");
    check(
      installability.installabilityErrors.every(
        (error) => error.errorId === "in-incognito",
      ),
      "Chromium finds no app installability errors (test contexts are incognito): " +
        JSON.stringify(installability.installabilityErrors),
    );
    for (const width of [375, 390, 1440]) {
      await a.setViewportSize({ width, height: 844 });
      check(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "PWA controls fit viewport " + width,
      );
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: "output/playwright/phase6-pwa.png",
      animations: "disabled",
    });
    check(!errors.length, "no browser runtime errors");
    return { passed: checks.length, checks, accounts };
  } catch (error) {
    throw Error(
      error.message +
        "; QA accounts=" +
        JSON.stringify(accounts) +
        "; diagnostics=" +
        JSON.stringify(errors),
    );
  } finally {
    for (const context of contexts) await context.close();
  }
}

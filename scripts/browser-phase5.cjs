/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    browser = page.context().browser(),
    contexts = [],
    pages = [],
    accounts = [],
    checks = [],
    diagnostics = [],
    cohort = Date.now().toString(36);
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const api = (p, family, op, body) =>
    p.request.post(origin + "/api/" + family + "/" + op, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) => {
    const r = await p.request.get(origin + "/api/pet/state");
    if (!r.ok()) throw Error("Pet state HTTP " + r.status());
    return r.json();
  };
  const quests = async (p) =>
    (await p.request.get(origin + "/api/quests/state")).json();
  const go = async (p, path) => {
    await p.goto(origin + path);
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  const credit = async (p, hearts) => {
    const id = crypto.randomUUID(),
      day = (await quests(p)).day;
    check(
      (
        await api(p, "quests", "save", {
          id,
          title: "Pet QA hearts",
          version: 0,
          assignee_id: null,
          due: day,
          repeat: "ครั้งเดียว",
          hearts,
        })
      ).ok(),
      "create real quest for pet hearts",
    );
    check(
      (
        await api(p, "quests", "complete", {
          id,
          request_id: crypto.randomUUID(),
        })
      ).ok(),
      "earn hearts from server quest operation",
    );
  };
  const itemCard = (p, title) =>
    p.locator(".pet-shop-item").filter({ hasText: title });
  try {
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      contexts.push(context);
      const p = await context.newPage();
      pages.push(p);
      p.setDefaultTimeout(20000);
      p.on("pageerror", (error) =>
        diagnostics.push({ page: i, error: error.message }),
      );
      p.on("requestfailed", (r) => {
        if (r.resourceType() === "script")
          diagnostics.push({
            page: i,
            path: new URL(r.url()).pathname,
            error: r.failure()?.errorText,
          });
      });
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
      await p.waitForFunction(
        () =>
          Object.keys(document.querySelector("form") || {}).some((k) =>
            k.startsWith("__reactProps$"),
          ),
        null,
        { timeout: 45000 },
      );
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Phase 5 QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p5_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const data = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({ id: data.profile.id, username: data.profile.username });
    }
    check(accounts.length === 4, "four real WebAuthn accounts");
    const [a, b, c, d] = pages;
    await a.goto(origin + "/explore/pet");
    await a
      .getByText("สร้างคู่หรือรับคำเชิญก่อนเริ่มใช้ข้อมูลร่วมกัน", {
        exact: false,
      })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "ให้อาหารโมจิ", exact: true })
        .isDisabled(),
      "unpaired feed is disabled",
    );
    check(
      (await a.request.get(origin + "/api/pet/state")).status() === 403,
      "unpaired pet API denied",
    );
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
      const invite = await (
        await api(owner, "account", "invitation", {})
      ).json();
      check(
        (await api(partner, "account", "accept", { token: invite.token })).ok(),
        "partner joins QA couple",
      );
    }
    const initial = await state(a);
    check(
      initial.pet.feeds === 0 &&
        initial.pet.wearing === null &&
        initial.items.every((i) => !i.owned) &&
        initial.achievements.every((x) => x.unlocked_at === null),
      "real pet starts clean without Demo seeds",
    );
    await go(a, "/explore/pet");
    let resolveFeed;
    const lostFeed = new Promise((resolve) => {
      resolveFeed = resolve;
    });
    await a.route("**/api/pet/feed", async (route) => {
      const r = await route.fetch();
      resolveFeed({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    await click(a, "ให้อาหารโมจิ");
    const feedCommitted = await lostFeed;
    check(
      feedCommitted.status === 200 && feedCommitted.body.applied,
      "feed commits before simulated lost response",
    );
    await a.unroute("**/api/pet/feed");
    await a.reload();
    await a
      .getByRole("button", { name: "ตรวจสอบมื้อเดิม", exact: true })
      .waitFor();
    await click(a, "ตรวจสอบมื้อเดิม");
    await a
      .getByRole("button", {
        name: "อิ่มแล้ว · ให้อีกครั้งเมื่อครบ 4 ชม.",
        exact: true,
      })
      .waitFor();
    check(
      (await state(a)).pet.feeds === 1,
      "feed retry survives reload without a second meal",
    );
    await go(b, "/explore/pet");
    check(
      await b
        .getByRole("button", {
          name: "อิ่มแล้ว · ให้อีกครั้งเมื่อครบ 4 ชม.",
          exact: true,
        })
        .isDisabled(),
      "partner shares the same four-hour cooldown",
    );
    await b.evaluate(() => {
      Date.now = () => 4102444800000;
    });
    check(
      (
        await api(b, "pet", "feed", { request_id: crypto.randomUUID() })
      ).status() === 409,
      "client clock cannot bypass server cooldown",
    );
    check(
      (await state(a)).pet.feeds === 1,
      "rejected partner feed keeps count unchanged",
    );
    check(
      (await state(c)).pet.feeds === 0,
      "other couple has independent feeding state",
    );
    check(
      (
        await api(c, "pet", "feed", {
          request_id: crypto.randomUUID(),
          couple_id: (await quests(a)).couple.id,
        })
      ).status() === 400,
      "forged couple cannot select another cat",
    );
    check(
      (
        await api(c, "pet", "equip", { item_id: "mint-hat", version: 0 })
      ).status() === 409,
      "other couple cannot wear an unowned item",
    );
    await credit(a, 50);
    await click(a, "โหลดข้อมูลล่าสุด");
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ซื้อ", exact: true })
      .waitFor();
    let resolvePurchase;
    const lostPurchase = new Promise((resolve) => {
      resolvePurchase = resolve;
    });
    await a.route("**/api/pet/purchase", async (route) => {
      const r = await route.fetch();
      resolvePurchase({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ซื้อ", exact: true })
      .click();
    const committed = await lostPurchase;
    check(
      committed.status === 200 && committed.body.applied,
      "purchase commits before simulated lost response",
    );
    await a.unroute("**/api/pet/purchase");
    await a.reload();
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ตรวจสอบรายการเดิม", exact: true })
      .waitFor();
    check(
      (await quests(a)).balance === 0,
      "purchase spends exact server price to zero",
    );
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ตรวจสอบรายการเดิม", exact: true })
      .click();
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ถอด", exact: true })
      .waitFor();
    check(
      (await quests(a)).balance === 0 &&
        (await state(a)).items.filter((i) => i.owned).length === 1,
      "pending purchase survives reload and retries successfully at zero balance",
    );
    await go(b, "/explore/pet");
    check(
      await itemCard(b, "หมวกใบโปรด")
        .getByRole("button", { name: "ถอด", exact: true })
        .isVisible(),
      "partner sees shared inventory and equipped hat",
    );
    const ownedRetries = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        api(i % 2 ? a : b, "pet", "purchase", {
          item_id: "mint-hat",
          request_id: crypto.randomUUID(),
        }),
      ),
    );
    check(
      ownedRetries.every((r) => r.status() === 200) &&
        (await quests(a)).balance === 0,
      "different request IDs cannot repurchase an owned item",
    );
    await credit(a, 70);
    const race = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        api(i % 2 ? a : b, "pet", "purchase", {
          item_id: "rose-rug",
          request_id: crypto.randomUUID(),
        }),
      ),
    );
    const bodies = await Promise.all(race.map((r) => r.json()));
    check(
      race.every((r) => r.status() === 200) &&
        bodies.filter((r) => r.applied).length === 1,
      "simultaneous partners buy the same rug exactly once",
    );
    check(
      (await quests(a)).balance === 0 &&
        (await state(b)).items.every((i) => i.owned),
      "wallet and shared inventory agree after competing buys",
    );
    check(
      (await state(c)).items.every((i) => !i.owned) &&
        (await quests(c)).balance === 0,
      "other couple shares neither inventory nor wallet",
    );
    check(
      (
        await api(c, "pet", "purchase", {
          item_id: "mint-hat",
          request_id: crypto.randomUUID(),
        })
      ).status() === 400,
      "other couple cannot spend first couple's hearts",
    );
    check(
      (
        await api(a, "pet", "purchase", {
          item_id: "mint-hat",
          request_id: crypto.randomUUID(),
          cost: 0,
        })
      ).status() === 400,
      "client cannot forge the item price",
    );
    let s = await state(a);
    const oldVersion = s.pet.version;
    check(
      (
        await api(b, "pet", "equip", {
          item_id: "mint-hat",
          version: oldVersion,
        })
      ).status() === 200,
      "partner can equip a shared owned item",
    );
    check(
      (
        await api(a, "pet", "equip", {
          item_id: "rose-rug",
          version: oldVersion,
        })
      ).status() === 409,
      "stale equipment edit cannot overwrite partner",
    );
    s = await state(a);
    await api(a, "pet", "equip", { item_id: null, version: s.pet.version });
    check((await state(b)).pet.wearing === null, "explicit unequip is shared");
    await go(a, "/explore/pet");
    await click(a, "ตั้งชื่อแมว");
    await a
      .getByRole("dialog")
      .getByLabel("ชื่อแมวของเรา", { exact: true })
      .fill("ชื่อเก่าจากฟอร์ม QA");
    s = await state(b);
    await api(b, "pet", "rename", { name: "มะลิ QA", version: s.pet.version });
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await a
      .getByText("ข้อมูลแมวเปลี่ยนแล้ว กรุณาโหลดล่าสุด", { exact: true })
      .waitFor();
    check(
      (await a.getByRole("dialog").isVisible()) &&
        (await state(a)).pet.name === "มะลิ QA",
      "rename form preserves original version and cannot overwrite partner",
    );
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "ปิด", exact: true })
      .click();
    await go(a, "/");
    check(
      await a
        .getByText("มะลิ QA · เจ้าของบ้านตัวจริง", { exact: true })
        .isVisible(),
      "Home uses real shared cat name",
    );
    for (let i = 0; i < 8; i++) await credit(a, 5);
    const earned = await state(b);
    check(
      earned.achievements.find((x) => x.id === "first-quest").unlocked_at !==
        null &&
        earned.achievements.find((x) => x.id === "team-ten").unlocked_at !==
          null,
      "server unlocks first and tenth quest achievements",
    );
    check(
      earned.achievements.find((x) => x.id === "pet-favorite").unlocked_at ===
        null,
      "one meal cannot unlock three-meal achievement",
    );
    check(
      (await state(c)).achievements.every((x) => x.unlocked_at === null),
      "achievements remain isolated from other couple",
    );
    const qs = await quests(a);
    check(
      qs.balance === 40 &&
        qs.history.entries.filter((e) => e.category === "pet").length === 2 &&
        qs.rewards.length === 3,
      "badges do not mint extra hearts and purchases stay separate from reward catalog",
    );
    check(
      (
        await api(a, "quests", "redeem", {
          reward_id: "massage",
          request_id: crypto.randomUUID(),
        })
      ).status() === 200,
      "existing reward redemption still works after pet purchase",
    );
    await go(a, "/quests?tab=rewards");
    const coupons = a
      .locator("section")
      .filter({
        has: a.getByRole("heading", { name: "คูปองที่แลกแล้ว", exact: true }),
      });
    check(
      (await coupons.getByText("คูปองนวดไหล่", { exact: true }).isVisible()) &&
        !(await coupons.textContent()).includes("หมวกใบโปรด") &&
        !(await coupons.textContent()).includes("พรมสีชมพู"),
      "pet purchases never appear as reward coupons",
    );
    await go(a, "/us");
    await click(a, "ล้างข้อมูล");
    await click(a, "ยืนยันล้างข้อมูล");
    check(
      (await state(a)).pet.feeds === 1,
      "Demo reset cannot clear D1 pet state",
    );
    await a.evaluate(() => {
      const w = JSON.parse(localStorage.getItem("our-little-world:v1"));
      w.pet.feeds = 999;
      w.pet.wearing = "rose-rug";
      w.profile.petName = "ปลอม QA";
      localStorage.setItem("our-little-world:v1", JSON.stringify(w));
    });
    await go(a, "/us");
    const petBadge = a
      .locator(".achievement")
      .filter({ hasText: "คนโปรดของโมจิ" });
    check(
      await petBadge
        .getByText("กำลังสะสมเรื่องราว", { exact: true })
        .isVisible(),
      "Demo tampering cannot unlock D1 achievement",
    );
    check(
      (await a.locator(".achievement.unlocked").count()) === 2,
      "Us displays exactly the two real quest achievements",
    );
    check(
      await a
        .getByRole("heading", {
          name: "Phase 5 QA 0 & Phase 5 QA 1",
          exact: true,
        })
        .isVisible(),
      "Us displays real couple names",
    );
    check(
      await a
        .getByRole("heading", {
          name: "ส่งออกข้อมูล Demo ในเครื่อง",
          exact: true,
        })
        .isVisible(),
      "Demo export stays clearly separate from D1 data",
    );
    await go(a, "/explore/pet");
    await a.route("**/api/quests/state*", (route) => route.abort("failed"));
    await click(a, "โหลดข้อมูลล่าสุด");
    await a
      .getByRole("alert")
      .filter({ hasText: /fetch|โหลด|เชื่อมต่อ/i })
      .first()
      .waitFor();
    check(
      (await a
        .getByRole("button", { name: "ตั้งชื่อแมว", exact: true })
        .isDisabled()) &&
        (await itemCard(a, "หมวกใบโปรด").getByRole("button").isDisabled()),
      "network failure disables pet writes rather than falling back to Demo",
    );
    await a.unroute("**/api/quests/state*");
    await click(a, "โหลดข้อมูลล่าสุด");
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    for (const path of ["/explore/pet", "/us"]) {
      await go(a, path);
      for (const width of [375, 390, 1440]) {
        await a.setViewportSize({ width, height: 844 });
        check(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "no overflow " + path + " at " + width,
        );
      }
    }
    await go(a, "/explore/pet");
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ใส่เลย", exact: true })
      .click();
    await itemCard(a, "หมวกใบโปรด")
      .getByRole("button", { name: "ถอด", exact: true })
      .waitFor();
    await a.screenshot({
      path: "output/playwright/phase5-pet.png",
      fullPage: true,
    });
    await go(b, "/us");
    await api(b, "auth", "sign-out", {});
    await click(b, "โหลดข้อมูลล่าสุด");
    await b
      .getByText("เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง", { exact: true })
      .waitFor();
    check(
      (await b.request.get(origin + "/api/pet/state")).status() === 401,
      "revoked session cannot read pet or achievements",
    );
    check(
      (
        await api(b, "pet", "purchase", {
          item_id: "mint-hat",
          request_id: crypto.randomUUID(),
        })
      ).status() === 401,
      "revoked session cannot spend hearts",
    );
    check(!diagnostics.length, "no browser runtime or script errors");
    return { passed: checks.length, checks, accounts };
  } catch (error) {
    const p = pages.at(-1);
    if (p && !p.isClosed())
      diagnostics.push(
        await p.evaluate(() => ({
          path: location.pathname,
          heading: document.querySelector("h1")?.textContent,
          forms: document.querySelectorAll("form").length,
        })),
      );
    throw Error(
      error.message +
        "; QA accounts=" +
        JSON.stringify(accounts) +
        "; diagnostics=" +
        JSON.stringify(diagnostics.slice(-8)),
    );
  } finally {
    for (const context of contexts) await context.close();
  }
}

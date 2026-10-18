/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    browser = page.context().browser();
  const contexts = [],
    pages = [],
    accounts = [],
    checks = [],
    diagnostics = [];
  const cohort = Date.now().toString(36);
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const api = (p, operation, body) =>
    p.request.post(origin + "/api/planning/" + operation, {
      headers: { Origin: origin },
      data: body,
    });
  const accountApi = (p, operation, body = {}) =>
    p.request.post(origin + "/api/account/" + operation, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) => {
    const r = await p.request.get(origin + "/api/planning/state");
    if (!r.ok()) throw Error("Planning state HTTP " + r.status());
    return r.json();
  };
  const go = async (p, path) => {
    await p.goto(origin + path);
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  const save = async (p) => {
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const fill = (p, name, value) =>
    p.getByRole("dialog").getByLabel(name, { exact: true }).fill(value);
  const cents = (s, id) => s.goals.find((g) => g.id === id).total_cents;
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
          Object.keys(document.querySelector("form") || {}).some((key) =>
            key.startsWith("__reactProps$"),
          ),
        null,
        { timeout: 45000 },
      );
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Phase 3 QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p3_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const data = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({ id: data.profile.id, username: data.profile.username });
    }
    check(
      accounts.length === 4,
      "four browser accounts register via real WebAuthn",
    );
    const [a, b, c, d] = pages;
    await a.goto(origin + "/savings");
    await a
      .getByText("สร้างคู่หรือรับคำเชิญก่อนเริ่มใช้ข้อมูลร่วมกัน", {
        exact: false,
      })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "สร้างเป้าหมาย", exact: true })
        .isDisabled(),
      "unpaired account cannot write shared savings",
    );
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (await accountApi(owner, "couple", { anniversary: "2024-02-14" })).ok(),
        "create isolated QA couple",
      );
      const invite = await (await accountApi(owner, "invitation")).json();
      check(
        (await accountApi(partner, "accept", { token: invite.token })).ok(),
        "second member joins QA couple",
      );
    }
    const initial = await state(a);
    check(
      !initial.goals.length &&
        !initial.dates.length &&
        !initial.wishes.length &&
        !initial.events.length &&
        !initial.history.entries.length,
      "real savings/plans start empty without Demo seed upload",
    );
    await go(a, "/savings");
    for (const [title, amount] of [
      ["ทริปจริง QA", "1000.55"],
      ["เป้าหมายที่สอง QA", "20.01"],
    ]) {
      await click(a, "สร้างเป้าหมาย");
      await fill(a, "เราอยากเก็บเงินเพื่ออะไร", title);
      await fill(a, "ยอดเป้าหมาย (บาท)", amount);
      await save(a);
    }
    const goals = (await state(a)).goals,
      g = goals.find((g) => g.title === "ทริปจริง QA");
    check(
      goals.length === 2 &&
        new Set(goals.map((g) => g.id)).size === 2 &&
        g.target_cents === 100055,
      "UI creates distinct goals and stores exact target satang",
    );
    await go(b, "/savings");
    check(
      await b.getByRole("heading", { name: g.title, exact: true }).isVisible(),
      "partner sees the shared savings goal",
    );
    let lostResolve;
    const lost = new Promise((resolve) => {
      lostResolve = resolve;
    });
    await a.route("**/api/planning/deposit", async (route) => {
      const response = await route.fetch();
      lostResolve({ status: response.status(), ...(await response.json()) });
      await route.abort("failed");
    });
    const goalCard = a.locator(".goal-card").filter({ hasText: g.title });
    await goalCard
      .getByRole("button", { name: "บันทึกเงินออม", exact: true })
      .click();
    await fill(a, "ยอดที่ออม (บาท)", "1.01");
    await a
      .getByRole("dialog")
      .getByLabel("ใครเป็นคนออม", { exact: true })
      .selectOption({ label: "Phase 3 QA 1" });
    await fill(a, "บันทึกช่วยจำ", "เริ่มก้อนแรก QA");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    const committed = await lost;
    check(
      committed.status === 200 && committed.applied,
      "server commits deposit before the simulated lost response",
    );
    await a.waitForFunction(() =>
      Array.from(document.querySelectorAll('[role="dialog"] button')).some(
        (b) => b.textContent === "บันทึก" && !b.disabled,
      ),
    );
    await a.unroute("**/api/planning/deposit");
    await go(a, "/savings");
    check(
      cents(await state(a), g.id) === 101,
      "lost response records exactly 1.01 baht",
    );
    check(
      await a
        .getByRole("button", { name: "ตรวจสอบรายการออมเดิม", exact: true })
        .isEnabled(),
      "pending amount/contributor/request survive reload",
    );
    await click(a, "ตรวจสอบรายการออมเดิม");
    await a
      .getByRole("button", { name: "ตรวจสอบรายการออมเดิม", exact: true })
      .waitFor({ state: "hidden" });
    const recovered = await state(a);
    check(
      cents(recovered, g.id) === 101 &&
        recovered.history.entries.length === 1 &&
        recovered.goals.find((row) => row.id === g.id).contributions[
          accounts[1].id
        ] === 101,
      "retry restores one deposit with its original contributor and no duplicate credit",
    );
    const entry = {
      id: crypto.randomUUID(),
      goal_id: g.id,
      contributor_id: accounts[0].id,
      amount_cents: 10010,
      note: "duplicate QA",
    };
    const duplicated = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const r = await api(i % 2 ? a : b, "deposit", entry);
        return { status: r.status(), ...(await r.json()) };
      }),
    );
    check(
      duplicated.every((r) => r.status === 200) &&
        duplicated.filter((r) => r.applied).length === 1,
      "eight concurrent duplicate deposits across partners credit once",
    );
    await Promise.all([
      api(a, "deposit", {
        ...entry,
        id: crypto.randomUUID(),
        amount_cents: 1,
        note: "A 0.01",
      }),
      api(b, "deposit", {
        ...entry,
        id: crypto.randomUUID(),
        amount_cents: 2,
        contributor_id: accounts[1].id,
        note: "B 0.02",
      }),
    ]);
    check(
      cents(await state(a), g.id) === 10114,
      "distinct concurrent deposits total exactly 101.14 baht",
    );
    const reversals = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const r = await api(i % 2 ? a : b, "reverse", {
          id: crypto.randomUUID(),
          entry_id: entry.id,
          note: "รายการซ้ำ QA",
        });
        return { status: r.status(), ...(await r.json()) };
      }),
    );
    check(
      reversals.every((r) => r.status === 200) &&
        reversals.filter((r) => r.applied).length === 1 &&
        cents(await state(a), g.id) === 104,
      "competing reversal IDs subtract the original amount once",
    );
    await go(b, "/savings");
    const originalRow = b
      .locator(".history-row")
      .filter({ hasText: "เริ่มก้อนแรก QA" });
    await originalRow
      .getByRole("button", { name: "หักล้างรายการออม", exact: true })
      .click();
    await fill(b, "เหตุผลที่หักล้าง", "แก้ยอดผิด QA");
    await save(b);
    const corrected = await state(b);
    check(
      cents(corrected, g.id) === 3 &&
        corrected.history.entries.filter((e) => e.kind === "reversal")
          .length === 2,
      "UI correction preserves original entries and leaves exact member totals",
    );
    check(
      corrected.goals.find((row) => row.id === g.id).contributions[
        accounts[0].id
      ] === 1 &&
        corrected.goals.find((row) => row.id === g.id).contributions[
          accounts[1].id
        ] === 2,
      "contribution totals remain separate after correction",
    );
    await go(a, "/savings");
    await a
      .locator(".goal-card")
      .filter({ hasText: g.title })
      .getByRole("button", { name: "แก้ไขเป้าหมาย", exact: true })
      .click();
    await fill(a, "เราอยากเก็บเงินเพื่ออะไร", "ชื่อจากฟอร์มเก่า QA");
    check(
      (
        await api(b, "save", {
          kind: "goal",
          id: g.id,
          title: "ชื่อจากอีกคน QA",
          target_cents: g.target_cents,
          due: g.due,
          version: 1,
        })
      ).ok(),
      "partner updates a goal while the first form is open",
    );
    await a.evaluate(() => window.dispatchEvent(new Event("focus")));
    await a
      .getByRole("heading", {
        name: "ชื่อจากอีกคน QA",
        exact: true,
        includeHidden: true,
      })
      .waitFor();
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await a
      .getByText(
        "ข้อมูลเปลี่ยนแล้วหรือมีครบ 200 รายการ กรุณาโหลดล่าสุดก่อนบันทึกใหม่",
        { exact: true },
      )
      .waitFor();
    check(
      (await state(a)).goals.find((row) => row.id === g.id).title ===
        "ชื่อจากอีกคน QA" && (await a.getByRole("dialog").isVisible()),
      "stale UI form retains its original version and cannot overwrite partner changes",
    );
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "ปิด", exact: true })
      .click();
    await a
      .locator(".goal-card")
      .filter({ hasText: "ชื่อจากอีกคน QA" })
      .getByRole("button", { name: "แก้ไขเป้าหมาย", exact: true })
      .click();
    await fill(a, "เราอยากเก็บเงินเพื่ออะไร", "ทริปร่วมจริง QA");
    await fill(a, "ยอดเป้าหมาย (บาท)", "2000.01");
    await save(a);
    check(
      (await state(a)).goals.find((row) => row.id === g.id).target_cents ===
        200001 && cents(await state(a), g.id) === 3,
      "fresh goal edit changes target without rewriting savings history",
    );
    for (const amount of [-1, 0, 1.5, "100", 1000000001])
      check(
        (
          await api(a, "deposit", {
            ...entry,
            id: crypto.randomUUID(),
            amount_cents: amount,
          })
        ).status() === 400,
        "reject invalid satang " + amount,
      );
    check(
      (
        await api(a, "deposit", {
          ...entry,
          id: crypto.randomUUID(),
          contributor_id: accounts[2].id,
        })
      ).status() === 400,
      "cannot credit a member of another couple",
    );
    check(
      (
        await api(c, "deposit", { ...entry, id: crypto.randomUUID() })
      ).status() === 400,
      "another couple cannot deposit to a known goal ID",
    );
    check(
      (
        await api(c, "reverse", {
          id: crypto.randomUUID(),
          entry_id: entry.id,
          note: "forged",
        })
      ).status() === 404,
      "another couple cannot reverse a known entry ID",
    );
    check(
      (
        await api(c, "save", {
          kind: "goal",
          ...g,
          title: "forged",
          version: 3,
        })
      ).status() === 400,
      "server rejects extra client totals on a forged goal save",
    );
    await go(a, "/explore/dates");
    for (const [title, time, budget] of [
      ["เดตเย็น QA", "18:00", "100.01"],
      ["เดตเช้า QA", "08:00", "0.10"],
    ]) {
      await click(a, "วางแผนเดต");
      await fill(a, "ชื่อเดตของเรา", title);
      await fill(a, "สถานที่", "คาเฟ่ QA");
      await fill(a, "เวลา", time);
      await fill(a, "งบประมาณ (บาท)", budget);
      await save(a);
    }
    const plans = (await state(a)).dates;
    check(
      plans.length === 2 &&
        plans[0].title === "เดตเช้า QA" &&
        plans[0].budget_cents === 10 &&
        plans[1].budget_cents === 10001,
      "date planner persists exact budgets and sorts by day/time",
    );
    await go(b, "/explore/calendar");
    check(
      (await b.getByText("เดตเช้า QA", { exact: true }).isVisible()) &&
        (await b.getByText("เดตเย็น QA", { exact: true }).isVisible()),
      "partner calendar derives date plans from D1",
    );
    await click(b, "เพิ่มกิจกรรม");
    await fill(b, "ชื่อกิจกรรม", "กิจกรรมร่วม QA");
    await save(b);
    check(
      (await state(a)).events.length === 1,
      "calendar activity persists to the shared couple",
    );
    await go(a, "/explore/calendar");
    await a
      .locator(".history-row")
      .filter({ hasText: "กิจกรรมร่วม QA" })
      .getByRole("button", { name: "ลบกิจกรรม", exact: true })
      .click();
    await click(a, "ยืนยันการลบ");
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    check(
      !(await state(b)).events.length && (await state(b)).dates.length === 2,
      "deleting a manual activity preserves derived date plans",
    );
    await go(a, "/explore/wishlist");
    await click(a, "เพิ่ม Wishlist");
    await fill(a, "สิ่งที่อยากทำด้วยกัน", "ความฝันร่วม QA");
    await save(a);
    await go(b, "/explore/wishlist");
    await click(b, "ทำสำเร็จ: ความฝันร่วม QA");
    await b
      .getByRole("button", {
        name: "ยกเลิกสำเร็จ: ความฝันร่วม QA",
        exact: true,
      })
      .waitFor();
    check(
      (await state(a)).wishes[0].done,
      "partner completes the same shared Wishlist item",
    );
    await b
      .getByRole("button", { name: "แก้ไข Wishlist", exact: true })
      .click();
    await fill(b, "สิ่งที่อยากทำด้วยกัน", "ความฝันที่แก้แล้ว QA");
    await save(b);
    check(
      (await state(a)).wishes[0].title === "ความฝันที่แก้แล้ว QA" &&
        (await state(a)).wishes[0].done,
      "Wishlist edit preserves explicit completion state",
    );
    const isolated = await state(c);
    check(
      !isolated.goals.length &&
        !isolated.dates.length &&
        !isolated.wishes.length &&
        !isolated.events.length &&
        !isolated.history.entries.length,
      "all Phase 3 data remains isolated from the second couple",
    );
    const wish = (await state(a)).wishes[0];
    check(
      (await api(c, "delete", { kind: "wish", id: wish.id })).status() ===
        404 &&
        (await api(c, "delete", { kind: "date", id: plans[0].id })).status() ===
          404,
      "other couple cannot delete known plan/Wishlist IDs",
    );
    await go(a, "/");
    check(
      (await a.getByText("ทริปร่วมจริง QA", { exact: true }).isVisible()) &&
        (await a.getByText("เดตเช้า QA", { exact: true }).isVisible()),
      "Home shows real shared savings and next date",
    );
    await a.goto(origin + "/us");
    await click(a, "ล้างข้อมูล");
    await click(a, "ยืนยันล้างข้อมูล");
    await a.evaluate(() => {
      const key = "our-little-world:v1",
        s = JSON.parse(localStorage.getItem(key));
      s.deposits.push({
        id: "qa-fake",
        goalId: s.goals[0].id,
        amount: 999999,
        person: "เรา",
        at: new Date().toISOString(),
        note: "QA",
      });
      localStorage.setItem(key, JSON.stringify(s));
    });
    await go(a, "/savings");
    check(
      cents(await state(a), g.id) === 3,
      "Demo money tampering cannot alter the D1 total",
    );
    await a.route("**/api/quests/state*", (route) => route.abort("failed"));
    await click(a, "โหลดข้อมูลล่าสุด");
    await a
      .getByRole("alert")
      .filter({ hasText: /fetch|โหลด|เชื่อมต่อ/i })
      .first()
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "สร้างเป้าหมาย", exact: true })
        .isDisabled(),
      "network failure disables savings writes instead of falling back to Demo",
    );
    await a.unroute("**/api/quests/state*");
    await click(a, "โหลดข้อมูลล่าสุด");
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    for (const path of [
      "/savings",
      "/explore/dates",
      "/explore/wishlist",
      "/explore/calendar",
    ]) {
      await go(a, path);
      for (const width of [375, 390, 1440]) {
        await a.setViewportSize({ width, height: 844 });
        const bounds = await a.evaluate(() => [
          document.documentElement.scrollWidth,
          innerWidth,
        ]);
        check(
          bounds[0] <= bounds[1],
          "no horizontal overflow " + path + " at " + width,
        );
      }
    }
    await go(a, "/savings");
    await a.screenshot({
      path: "output/playwright/phase3-savings.png",
      fullPage: true,
    });
    await b.request.post(origin + "/api/auth/sign-out", {
      headers: { Origin: origin },
      data: {},
    });
    await click(b, "โหลดข้อมูลล่าสุด");
    await b
      .getByText("เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง", { exact: true })
      .waitFor();
    check(
      await b
        .getByRole("button", { name: "เพิ่ม Wishlist", exact: true })
        .isDisabled(),
      "revoked session loses all Phase 3 write access",
    );
    return { passed: checks.length, checks, accounts };
  } catch (error) {
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

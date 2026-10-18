/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser();
  const contexts = [],
    pages = [],
    accounts = [],
    checks = [], diagnostics = [];
  const cohort = Date.now().toString(36);
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const api = (p, operation, body) =>
    p.request.post(origin + "/api/quests/" + operation, {
      headers: { Origin: origin },
      data: body,
    });
  const accountApi = (p, operation, body = {}) =>
    p.request.post(origin + "/api/account/" + operation, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) => {
    const r = await p.request.get(origin + "/api/quests/state");
    if (!r.ok()) throw Error("State HTTP " + r.status());
    return r.json();
  };
  const sharedPage = async (p) => {
    await p.goto(origin + "/quests");
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  const saveUi = async (p, title, hearts) => {
    await click(p, "เพิ่มภารกิจ");
    const dialog = p.getByRole("dialog");
    await dialog.getByLabel("ชื่อภารกิจ", { exact: true }).fill(title);
    await dialog
      .getByLabel("หัวใจรางวัล (1–500)", { exact: true })
      .fill(String(hearts));
    await dialog.getByLabel("ทำซ้ำ", { exact: true }).selectOption("รายวัน");
    await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
  };
  try {
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      contexts.push(context);
      const p = await context.newPage();
      p.on("pageerror",error => diagnostics.push({page:i,error:error.message}));
      p.on("requestfailed",request => diagnostics.push({page:i,path:new URL(request.url()).pathname,error:request.failure()?.errorText}));
      pages.push(p);
      p.setDefaultTimeout(20000);
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
      await p.waitForFunction(() =>
        Object.keys(document.querySelector("form") || {}).some((key) =>
          key.startsWith("__reactProps$"),
        ),
      );
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Phase 2 QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p2_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const data = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({ id: data.profile.id, username: data.profile.username });
    }
    check(
      accounts.length === 4,
      "four isolated browser accounts register via real WebAuthn",
    );
    const [a, b, c, d] = pages;
    await a.goto(origin + "/quests");
    await a
      .getByText("สร้างคู่หรือรับคำเชิญก่อนเริ่มใช้ข้อมูลร่วมกัน", { exact: false })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "เพิ่มภารกิจ", exact: true })
        .isDisabled(),
      "unpaired account cannot mutate shared quests",
    );
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (await accountApi(owner, "couple", { anniversary: "2024-02-14" })).ok(),
        "create QA couple",
      );
      const invite = await (await accountApi(owner, "invitation")).json();
      check(
        (await accountApi(partner, "accept", { token: invite.token })).ok(),
        "partner joins QA couple",
      );
    }
    const initial = await state(a);
    check(
      initial.balance === 0 &&
        initial.quests.length === 0 &&
        initial.history.entries.length === 0,
      "real wallet starts at zero without Demo seed upload",
    );
    await sharedPage(a);
    await saveUi(a, "ภารกิจร่วม A", 40);
    await saveUi(a, "ภารกิจร่วม B", 40);
    const created = await state(a);
    check(
      created.quests.length === 2 &&
        new Set(created.quests.map((q) => q.id)).size === 2,
      "two UI creates receive distinct IDs and persist in D1",
    );
    const q1 = created.quests.find((q) => q.title === "ภารกิจร่วม A");
    await sharedPage(b);
    check(
      await b.getByText("ภารกิจร่วม A", { exact: true }).isVisible(),
      "partner sees the same quest and assignee names",
    );
    const claims = await Promise.all(
      Array.from({ length: 8 }, async (_, i) => {
        const r = await api(i % 2 ? a : b, "complete", {
          id: q1.id,
          request_id: crypto.randomUUID(),
        });
        return { status: r.status(), ...(await r.json()) };
      }),
    );
    check(
      claims.every((r) => r.status === 200) &&
        claims.filter((r) => r.applied).length === 1,
      "eight concurrent claims across both sessions award exactly once",
    );
    check((await state(b)).balance === 40, "both partners share one wallet");
    await a.reload();
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    await click(a, "ร้านรางวัล");
    let lostResponse;
    const lost = new Promise((resolve) => {
      lostResponse = resolve;
    });
    await a.route("**/api/quests/redeem", async (route) => {
      const response = await route.fetch();
      lostResponse({ status: response.status(), ...(await response.json()) });
      await route.abort("failed");
    });
    await click(a, "40 · แลกรางวัล");
    await click(a, "ยืนยันแลกรางวัล");
    const commit = await lost;
    check(
      commit.status === 200 && commit.applied,
      "server commits redemption before the simulated response loss",
    );
    await a.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "ยืนยันแลกรางวัล" && !b.disabled,
      ),
    );
    await a.unroute("**/api/quests/redeem");
    check(
      (await state(a)).balance === 0,
      "lost response cannot undo or duplicate a committed spend",
    );
    await a.reload();
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    await click(a, "ร้านรางวัล");
    check(
      await a
        .getByRole("button", { name: "40 · ตรวจสอบรายการเดิม", exact: true })
        .isEnabled(),
      "pending redemption survives reload and can retry with zero balance",
    );
    await click(a, "40 · ตรวจสอบรายการเดิม");
    await click(a, "ยืนยันแลกรางวัล");
    await a.getByRole("dialog").waitFor({ state: "hidden" });
    const recovered = await state(a);
    check(
      recovered.balance === 0 &&
        recovered.history.entries.filter((e) => e.kind === "redemption")
          .length === 1,
      "retry recovers one coupon without a second debit",
    );
    check(
      await a
        .getByRole("button", { name: "40 · แลกรางวัล", exact: true })
        .isDisabled(),
      "confirmed request clears pending state and respects the current balance",
    );
    await click(b, "โหลดข้อมูลล่าสุด");
    await b.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (e) =>
          e.getAttribute("aria-label") === "ทำสำเร็จ: ภารกิจร่วม A" &&
          e.disabled,
      ),
    );
    check(
      await b
        .getByRole("button", { name: "ทำสำเร็จ: ภารกิจร่วม A", exact: true })
        .isDisabled(),
      "partner UI refresh reflects the completed shared period",
    );
    await click(b, "ทำสำเร็จ: ภารกิจร่วม B");
    await b.waitForFunction(() =>
      Array.from(document.querySelectorAll(".summary-strip strong")).some((e) =>
        e.textContent.trim().startsWith("40"),
      ),
    );
    const spends = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        api(i % 2 ? a : b, "redeem", {
          reward_id: "massage",
          request_id: crypto.randomUUID(),
        }),
      ),
    );
    check(
      spends.filter((r) => r.status() === 200).length === 1 &&
        spends.filter((r) => r.status() === 400).length === 7,
      "competing distinct spends cannot overdraw the shared wallet",
    );
    check(
      (await state(a)).balance === 0,
      "wallet remains nonnegative after concurrent spending",
    );
    const qa = {
      id: crypto.randomUUID(),
      title: "ภารกิจเฉพาะคนแรก",
      assignee_id: accounts[0].id,
      due: initial.day,
      repeat: "ครั้งเดียว",
      hearts: 15,
      version: 0,
    };
    check(
      (await api(a, "save", qa)).ok(),
      "save a quest assigned to one real member",
    );
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await b.getByText(qa.title, { exact: true }).waitFor();
    check(
      await b
        .getByRole("button", { name: "ทำสำเร็จ: " + qa.title, exact: true })
        .isDisabled(),
      "focus sync shows assigned quest and disables another member's claim",
    );
    check(
      (
        await api(b, "complete", { id: qa.id, request_id: crypto.randomUUID() })
      ).status() === 400,
      "server rejects wrong-assignee completion",
    );
    check(
      (
        await api(a, "complete", { id: qa.id, request_id: crypto.randomUUID() })
      ).ok(),
      "assigned member can complete",
    );
    check(
      (await api(c, "delete", { id: qa.id })).status() === 404,
      "another couple cannot delete a known quest ID",
    );
    check(
      (
        await api(c, "complete", { id: qa.id, request_id: crypto.randomUUID() })
      ).status() === 400,
      "another couple cannot claim a known quest ID",
    );
    check(
      (
        await api(a, "redeem", {
          reward_id: "massage",
          request_id: crypto.randomUUID(),
          cost: 1,
        })
      ).status() === 400,
      "client-supplied reward price is rejected",
    );
    check(
      (await api(a, "ledger", { amount: 9999 })).status() === 404,
      "there is no client ledger write endpoint",
    );
    await b.reload();
    await b.getByText("SHARED · D1", { exact: true }).waitFor();
    const assignedRow = b.locator(".quest-row").filter({ hasText: qa.title });
    await assignedRow
      .getByRole("button", { name: "ลบภารกิจ", exact: true })
      .click();
    await click(b, "ยืนยันการลบ");
    await b.getByRole("dialog").waitFor({ state: "hidden" });
    const deleted = await state(a);
    check(
      deleted.balance === 15 &&
        deleted.completionCount === 3 &&
        !deleted.quests.some((q) => q.id === qa.id),
      "partner deletion preserves earned hearts and historical completion",
    );
    check(
      (await state(c)).balance === 0 && (await state(c)).quests.length === 0,
      "second couple remains isolated from all first-couple operations",
    );
    await sharedPage(c);
    await saveUi(c, "ภารกิจคู่ที่สอง", 80);
    await click(c, "ทำสำเร็จ: ภารกิจคู่ที่สอง");
    await c.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (e) =>
          e.getAttribute("aria-label") === "ทำสำเร็จ: ภารกิจคู่ที่สอง" &&
          e.disabled,
      ),
    );
    check(
      (await state(c)).balance === 80 && (await state(a)).balance === 15,
      "second couple earns its own hearts independently",
    );
    await a.goto(origin + "/us");
    await click(a, "ล้างข้อมูล");
    await click(a, "ยืนยันล้างข้อมูล");
    await a.evaluate(() => {
      const key = "our-little-world:v1",
        data = JSON.parse(localStorage.getItem(key));
      data.hearts.push({
        id: crypto.randomUUID(),
        amount: 9999,
        reason: "QA local-only",
        at: new Date().toISOString(),
      });
      localStorage.setItem(key, JSON.stringify(data));
    });
    await sharedPage(a);
    check(
      (await state(a)).balance === 15,
      "tampering with Demo localStorage cannot alter the real wallet",
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
        .getByRole("button", { name: "เพิ่มภารกิจ", exact: true })
        .isDisabled(),
      "network failure makes shared mutations unavailable instead of falling back to Demo",
    );
    await a.unroute("**/api/quests/state*");
    await click(a, "โหลดข้อมูลล่าสุด");
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    for (const width of [375, 390, 1440]) {
      await a.setViewportSize({ width, height: 844 });
      const dimensions = await a.evaluate(() => [
        document.documentElement.scrollWidth,
        innerWidth,
      ]);
      check(
        dimensions[0] <= dimensions[1],
        "shared quests have no horizontal overflow at " + width,
      );
    }
    await a.screenshot({
      path: "output/playwright/phase2-quests.png",
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
        .getByRole("button", { name: "เพิ่มภารกิจ", exact: true })
        .isDisabled(),
      "revoked session cannot keep writing or silently become Demo",
    );
    return { passed: checks.length, checks, accounts };
  } catch (error) {
    console.log(
      JSON.stringify({
        checks,
        accounts,
        pages: await Promise.all(
          pages.map(async (p) => ({
            url: p.url(),
            alerts: await p.getByRole("alert").allTextContents(),
          })),
        ),
      }),
    );
    throw Error(error.message + "; QA accounts=" + JSON.stringify(accounts)+"; diagnostics="+JSON.stringify(diagnostics.slice(-12)));
  } finally {
    for (const context of contexts) await context.close();
  }
}

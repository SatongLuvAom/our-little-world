/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://localhost:3018")
    throw Error("Lazy form regression is restricted to local preview");
  const contexts = [], checks = [], financialPosts = [], heldHandlers = [];
  const scripts = /\/_next\/static\/.*\.js(?:\?.*)?$/;
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const ready = async (p) => {
    await p.locator(".loading-screen").waitFor({ state: "hidden" });
    await p.getByRole("heading", { name: "กระปุกความฝัน", exact: true }).waitFor();
    await p.getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true }).waitFor({ state: "hidden" });
    await p.getByText("DEMO MODE", { exact: true }).waitFor();
  };
  const fresh = async () => {
    const context = await page.context().browser().newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    contexts.push(context);
    const p = await context.newPage(), initialScripts = new Set();
    p.setDefaultTimeout(30000);
    p.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && path.startsWith("/api/") && path !== "/api/diagnostics/report")
        financialPosts.push(path);
      if (request.resourceType() === "script") initialScripts.add(request.url());
    });
    await p.goto(origin + "/savings");
    await ready(p);
    await p.waitForLoadState("networkidle");
    return { context, p, initialScripts: new Set(initialScripts) };
  };
  const create = (p) => p.getByRole("button", { name: "สร้างเป้าหมาย", exact: true });
  const focusedTrigger = async (p) => {
    await p.getByRole("dialog").waitFor({ state: "hidden" });
    await p.waitForFunction(() => document.activeElement?.textContent?.trim() === "สร้างเป้าหมาย");
    return create(p).evaluate((el) => el === document.activeElement);
  };
  let releaseHeld = () => {};
  try {
    const first = await fresh(), p = first.p;
    const held = new Promise((resolve) => { releaseHeld = resolve; });
    const delayed = [];
    const hold = (route) => {
      delayed.push(route.request().url());
      const handled = held.then(() => route.continue());
      heldHandlers.push(handled);
      return handled;
    };
    await p.route(scripts, hold);
    const lazyRequest = p.waitForRequest((request) => scripts.test(request.url()));
    await create(p).click();
    const request = await lazyRequest;
    await p.getByRole("dialog").getByText("กำลังเปิดแบบฟอร์ม…", { exact: true }).waitFor();
    check(!first.initialScripts.has(request.url()), "closed Savings defers a new form chunk until the first open");
    check(await p.getByRole("dialog").getByRole("button", { name: "ปิด", exact: true }).isEnabled(), "dialog and close control are available while the form chunk is pending");
    await p.getByRole("dialog").getByRole("button", { name: "ปิด", exact: true }).click();
    check(await focusedTrigger(p), "closing a pending form returns focus to its original trigger");
    check(financialPosts.length === 0, "opening and cancelling a pending form sends no financial POST");
    releaseHeld();
    await Promise.all(heldHandlers);
    await p.waitForLoadState("networkidle");
    // New dependent chunks can start after the first held response completes.
    await Promise.all(heldHandlers);
    await p.unroute(scripts, hold);
    check(await p.getByRole("dialog").count() === 0, "a completed chunk does not reopen a form closed during loading");
    await create(p).click();
    const form = p.getByRole("dialog");
    await form.getByLabel("เราอยากเก็บเงินเพื่ออะไร", { exact: true }).fill("");
    await form.getByLabel("ยอดเป้าหมาย (บาท)", { exact: true }).fill("0");
    await form.getByRole("button", { name: "บันทึก", exact: true }).click();
    await form.locator('[aria-invalid="true"]').first().waitFor();
    check(await form.getByLabel("เราอยากเก็บเงินเพื่ออะไร", { exact: true }).getAttribute("aria-invalid") === "true" && await form.getByLabel("ยอดเป้าหมาย (บาท)", { exact: true }).getAttribute("aria-invalid") === "true", "loaded form retains required-title and positive-amount schema validation");
    check(financialPosts.length === 0, "invalid form values cannot initiate a financial POST");
    await p.keyboard.press("Escape");
    check(await focusedTrigger(p), "Escape closes the loaded form and restores trigger focus");

    const second = await fresh(), q = second.p;
    const receiptKey = "olw:pending-deposit:qa-lazy-form:fixture-goal";
    const receipt = "original-lazy-form-receipt";
    const documentId = await q.evaluate(({ receiptKey, receipt }) => {
      localStorage.setItem(receiptKey, receipt);
      window.__olwLazyFormDocument = crypto.randomUUID();
      return window.__olwLazyFormDocument;
    }, { receiptKey, receipt });
    const aborted = [], diagnosticPosts = [];
    q.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname === "/api/diagnostics/report") {
        const code = r.postDataJSON()?.code;
        diagnosticPosts.push(["runtime", "promise", "render", "asset"].includes(code) ? code : "unexpected");
      }
    });
    const abort = async (route) => {
      aborted.push(route.request().url());
      await route.abort("failed");
    };
    await q.route(scripts, abort);
    const diagnostic = q.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/diagnostics/report");
    await create(q).click();
    const alert = q.getByRole("dialog").getByRole("alert");
    await alert.getByText("เปิดแบบฟอร์มไม่สำเร็จ", { exact: true }).waitFor();
    await diagnostic;
    await q.waitForLoadState("networkidle");
    check(aborted.length > 0 && aborted.every((url) => !second.initialScripts.has(url)), "failure fixture aborts only new form chunks after Savings is ready");
    // Radix hides the modal background from the accessibility tree while open.
    const savingsHeading = q.locator("main h1").filter({ hasText: /^กระปุกความฝัน$/ });
    const savingsVisible = await savingsHeading.count() === 1 && await savingsHeading.isVisible()
      && await q.title() === "เงินออม | Our Little World"
      && !await q.locator(".loading-screen").isVisible()
      && !await q.getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true }).isVisible();
    if (!savingsVisible) {
      const diagnostics = await q.evaluate(() => ({
        title: document.title,
        loadingScreens: document.querySelectorAll(".loading-screen").length,
        accountLoading: document.body.textContent.includes("กำลังตรวจสอบข้อมูลของบัญชี…"),
        headings: Array.from(document.querySelectorAll("main h1")).map((heading) => ({
          text: heading.textContent,
          display: getComputedStyle(heading).display,
          visibility: getComputedStyle(heading).visibility,
          width: heading.getBoundingClientRect().width,
          height: heading.getBoundingClientRect().height,
          ariaHiddenBy: heading.closest('[aria-hidden="true"]')?.tagName || null,
        })),
        dialogs: document.querySelectorAll('[role="dialog"]').length,
      }));
      await q.screenshot({ path: "output/playwright/lazy-form-scoped-error-diagnostic.png" });
      throw Error("chunk failure remains scoped to the form while Savings stays visible: " + JSON.stringify(diagnostics));
    }
    check(savingsVisible, "chunk failure remains scoped to the form while Savings stays visible");
    check(await alert.getByRole("button", { name: "โหลดหน้าใหม่", exact: true }).isEnabled(), "chunk failure offers an explicit reload without an automatic retry");
    check(diagnosticPosts.filter((code) => code === "render").length === 1 && !diagnosticPosts.includes("unexpected"), "chunk failure emits exactly one scoped render report: " + JSON.stringify(diagnosticPosts));
    const abortedOnce = aborted.length;
    const diagnosticCount = diagnosticPosts.length;
    await q.getByRole("dialog").getByRole("button", { name: "ปิด", exact: true }).click();
    check(await focusedTrigger(q), "a failed form can close and return focus to the original trigger");
    check(await q.getByRole("heading", { name: "กระปุกความฝัน", exact: true }).isVisible(), "closing a failed form reexposes the Savings heading to accessibility");
    await create(q).click();
    await alert.getByText("เปิดแบบฟอร์มไม่สำเร็จ", { exact: true }).waitFor();
    check(aborted.length === abortedOnce && diagnosticPosts.length === diagnosticCount && diagnosticPosts.filter((code) => code === "render").length === 1, "reopening a failed form does not retry chunks or duplicate its render report: " + JSON.stringify({ initialAborts: abortedOnce, currentAborts: aborted.length, diagnostics: diagnosticPosts, chunks: aborted.map((url) => new URL(url).pathname) }));
    const reload = alert.getByRole("button", { name: "โหลดหน้าใหม่", exact: true });
    await second.context.setOffline(true);
    await q.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent.trim() === "โหลดหน้าใหม่")?.disabled);
    check(await reload.isDisabled(), "offline disables the fallback reload action");
    check(await q.evaluate((id) => window.__olwLazyFormDocument === id, documentId), "offline transition does not automatically reload the document");
    await second.context.setOffline(false);
    await q.waitForFunction(() => Array.from(document.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent.trim() === "โหลดหน้าใหม่")?.disabled === false);
    await q.unroute(scripts, abort);
    await Promise.all([q.waitForEvent("load"), reload.click()]);
    await ready(q);
    check(await q.evaluate(() => !window.__olwLazyFormDocument), "explicit fallback reload creates a new document");
    check(await q.evaluate(({ receiptKey, receipt }) => localStorage.getItem(receiptKey) === receipt, { receiptKey, receipt }), "explicit reload preserves the original pending financial receipt");
    await create(q).click();
    await q.getByRole("dialog").getByLabel("เราอยากเก็บเงินเพื่ออะไร", { exact: true }).waitFor();
    check(await q.getByRole("dialog").locator("form").isVisible(), "the form loads normally after an explicit online reload");
    await q.keyboard.press("Escape");
    check(await focusedTrigger(q), "recovered form retains close and focus behavior");
    check(financialPosts.length === 0, "loading, failure, validation, offline and recovery send no financial POST");
    return { passed: checks.length, checks, delayedChunks: delayed.length, abortedChunks: aborted.length, diagnosticCodes: diagnosticPosts, renderReports: diagnosticPosts.filter((code) => code === "render").length, financialPosts: financialPosts.length };
  } finally {
    releaseHeld();
    await Promise.allSettled(heldHandlers);
    for (const context of contexts) await context.close();
  }
}

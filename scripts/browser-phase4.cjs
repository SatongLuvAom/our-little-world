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
  const api = (p, family, operation, body) =>
    p.request.post(origin + "/api/" + family + "/" + operation, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) => {
    const r = await p.request.get(origin + "/api/journal/state");
    if (!r.ok()) throw Error("Journal state HTTP " + r.status());
    return r.json();
  };
  const go = async (p, path) => {
    await p.goto(origin + path);
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  const fill = (p, label, value) =>
    p.getByRole("dialog").getByLabel(label, { exact: true }).fill(value);
  const save = async (p) => {
    await p
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await p.getByRole("dialog").waitFor({ state: "hidden" });
  };
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
      p.on("requestfailed",request=>{
        if(request.resourceType()==="script") diagnostics.push({page:i,script:new URL(request.url()).pathname,failure:request.failure()?.errorText});
      });
      p.on("response",response=>{
        if(response.request().resourceType()==="script" && response.status()>=400) diagnostics.push({page:i,script:new URL(response.url()).pathname,status:response.status()});
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
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Phase 4 QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p4_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const data = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({ id: data.profile.id, username: data.profile.username });
    }
    check(accounts.length === 4, "four accounts register with WebAuthn");
    const [a, b, c, d] = pages;
    await a.goto(origin + "/explore/memories");
    await a
      .getByText("สร้างคู่หรือรับคำเชิญก่อนเริ่มใช้ข้อมูลร่วมกัน", {
        exact: false,
      })
      .waitFor();
    check(
      await a
        .getByRole("button", { name: "เพิ่มความทรงจำ", exact: true })
        .isDisabled(),
      "unpaired memory writes disabled",
    );
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (
          await api(owner, "account", "couple", { anniversary: "2024-02-14" })
        ).ok(),
        "create isolated couple",
      );
      const invite = await (
        await api(owner, "account", "invitation", {})
      ).json();
      check(
        (await api(partner, "account", "accept", { token: invite.token })).ok(),
        "partner joins couple",
      );
    }
    const initial = await state(a);
    check(
      !initial.memories.length &&
        !initial.letters.length &&
        !initial.moods.length,
      "real journal starts empty without Demo upload",
    );
    await go(a, "/explore/memories");
    const source = await a.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d"),
        data = ctx.createImageData(512, 512);
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i] = (i * 31) % 251;
        data.data[i + 1] = Math.random() * 255;
        data.data[i + 2] = Math.random() * 255;
        data.data[i + 3] = 255;
      }
      ctx.putImageData(data, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await a
      .locator('input[type="file"]')
      .setInputFiles({
        name: "private.png",
        mimeType: "image/png",
        buffer: Buffer.from(source, "base64"),
      });
    await a.getByAltText("รูปที่เลือกสำหรับความทรงจำ").waitFor();
    await click(a, "เพิ่มความทรงจำ");
    await fill(a, "ตั้งชื่อวันของเรา", "ภาพส่วนตัว QA");
    await fill(a, "เรื่องราวที่อยากจำ", "วันที่เราสองคนยิ้ม");
    let resolveLost;
    const lost = new Promise((resolve) => {
      resolveLost = resolve;
    });
    await a.route("**/api/journal/save", async (route) => {
      const r = await route.fetch();
      resolveLost({ status: r.status(), body: await r.json() });
      await route.abort("failed");
    });
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    const committed = await lost;
    check(
      committed.status === 200 && committed.body.applied,
      "bounded private PNG commits before simulated lost response",
    );
    await a.unroute("**/api/journal/save");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .waitFor({ state: "visible" });
    await save(a);
    let snapshot = await state(a);
    const memory = snapshot.memories[0];
    check(
      snapshot.memories.length === 1,
      "retry uses original memory UUID without duplicate",
    );
    check(
      memory.photo.startsWith("/api/journal/photo?") &&
        !JSON.stringify(snapshot).includes("base64"),
      "snapshot contains signed URL and no image bytes",
    );
    const photo = await a.request.get(origin + memory.photo);
    const bytes = await photo.body();
    check(
      photo.status() === 200 &&
        bytes.length <= 200000 &&
        bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
      "private image survives binary RPC byte-for-byte as bounded PNG",
    );
    check(
      photo.headers()["cache-control"] === "private, no-store" &&
        photo.headers()["x-content-type-options"] === "nosniff",
      "private image is not cached and cannot be MIME sniffed",
    );
    await go(b, "/explore/memories");
    await b.getByRole("heading", { name: memory.title, exact: true }).waitFor();
    await b.waitForFunction(() => {
      const img = document.querySelector(".memory-photo");
      return img?.complete && img.naturalWidth > 0;
    });
    check(true, "partner sees and decodes private image");
    check(
      (await b
        .getByRole("button", { name: "ลบความทรงจำ", exact: true })
        .count()) === 0,
      "partner cannot delete author's memory",
    );
    check(
      (await state(c)).memories.length === 0,
      "other couple sees no memory metadata",
    );
    check(
      (await c.request.get(origin + memory.photo)).status() === 403,
      "other couple cannot reuse signed photo URL",
    );
    check(
      (await b.request.get(origin + memory.photo)).status() === 403,
      "URL is bound to original user and session",
    );
    const anonymous = await browser.newContext();
    contexts.push(anonymous);
    check(
      (await anonymous.request.get(origin + memory.photo)).status() === 401,
      "photo URL without session is rejected",
    );
    const tampered = new URL(origin + memory.photo);
    tampered.searchParams.set(
      "expires",
      String(Number(tampered.searchParams.get("expires")) + 1),
    );
    check(
      (await a.request.get(tampered.href)).status() === 403,
      "photo expiry cannot be extended by client",
    );
    check(
      (
        await api(c, "journal", "delete", { kind: "memory", id: memory.id })
      ).status() === 404,
      "other couple cannot delete memory by UUID",
    );
    check(
      (
        await api(a, "journal", "save", {
          kind: "memory",
          id: crypto.randomUUID(),
          title: "bad",
          day: initial.day,
          note: "",
          photo: "data:image/png;base64,PHN2Zy8+",
        })
      ).status() === 400,
      "server rejects forged image content",
    );
    await go(a, "/explore/letters");
    await click(a, "เขียนจดหมาย");
    await fill(a, "ชื่อจดหมาย", "จดหมายอนาคต QA");
    await fill(a, "วันเปิดอ่าน (เวลาไทย)", "2099-01-02");
    await fill(a, "ข้อความถึงเธอ", "FUTURE_PRIVATE_QA");
    await save(a);
    const future = (await state(a)).letters[0];
    check(
      future.locked &&
        !JSON.stringify(await state(a)).includes("FUTURE_PRIVATE_QA"),
      "future body never appears in metadata",
    );
    check(
      (
        await a.request.get(
          origin + "/api/journal/letter?id=" + future.id + "&day=2099-01-03",
        )
      ).status() === 404,
      "author cannot open future letter by faking client date",
    );
    await go(b, "/explore/letters");
    check(
      await b
        .getByRole("button", { name: "รอวันพิเศษของเรา", exact: true })
        .isDisabled(),
      "partner sees locked letter envelope",
    );
    check(
      (
        await b.request.get(origin + "/api/journal/letter?id=" + future.id)
      ).status() === 404,
      "partner cannot read future body by direct API",
    );
    await click(a, "เขียนจดหมาย");
    await fill(a, "ชื่อจดหมาย", "เปิดวันนี้ QA");
    await fill(a, "ข้อความถึงเธอ", "รักเธอในทุกวัน QA");
    await save(a);
    const due = (await state(a)).letters.find(
      (l) => l.title === "เปิดวันนี้ QA",
    );
    await go(b, "/explore/letters");
    await click(b, "เปิดอ่านจดหมาย");
    await b
      .getByRole("dialog")
      .getByText("รักเธอในทุกวัน QA", { exact: true })
      .waitFor();
    check(
      true,
      "partner opens today's letter from separate server body endpoint",
    );
    await b
      .getByRole("dialog")
      .getByRole("button", { name: "ปิด", exact: true })
      .click();
    check(
      (
        await c.request.get(origin + "/api/journal/letter?id=" + due.id)
      ).status() === 404,
      "other couple cannot read unlocked body",
    );
    check(
      (
        await api(b, "journal", "delete", { kind: "letter", id: due.id })
      ).status() === 404,
      "partner cannot delete author's letter",
    );
    for (const [p, note, mood] of [
      [a, "วันนี้อุ่นใจ", "อบอุ่น"],
      [b, "วันนี้สดใส", "สดใส"],
    ]) {
      await go(p, "/explore/mood");
      await p.getByLabel("ข้อความบอกความรู้สึก", { exact: true }).fill(note);
      await click(p, "อารมณ์" + mood);
      await p
        .getByText("วันนี้รู้สึก" + mood + " · " + note, { exact: true })
        .waitFor();
    }
    snapshot = await state(a);
    check(
      snapshot.moods.length === 2 &&
        new Set(snapshot.moods.map((m) => m.user_id)).size === 2,
      "two users share distinct daily moods",
    );
    check(
      snapshot.moods.find((m) => m.user_id === accounts[0].id).note ===
        "วันนี้อุ่นใจ",
      "partner mood never overwrites author's row",
    );
    check(
      (await state(c)).moods.length === 0,
      "mood history stays inside couple",
    );
    check(
      (
        await api(a, "journal", "save", {
          kind: "mood",
          day: snapshot.day,
          mood: "สดใส",
          note: "impersonate",
          version: 1,
          user_id: accounts[1].id,
        })
      ).status() === 400,
      "mood cannot impersonate partner",
    );
    const version = snapshot.moods.find(
      (m) => m.user_id === accounts[0].id,
    ).version;
    const races = await Promise.all(
      ["ตื่นเต้น", "อยากได้กอด"].map((mood) =>
        api(a, "journal", "save", {
          kind: "mood",
          day: snapshot.day,
          mood,
          note: "race",
          version,
        }),
      ),
    );
    check(
      races.filter((r) => r.status() === 200).length === 1 &&
        races.filter((r) => r.status() === 409).length === 1,
      "competing mood edits have one winner",
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
        .getByRole("button", { name: "อารมณ์สดใส", exact: true })
        .isDisabled(),
      "network failure disables shared mood writes",
    );
    await a.unroute("**/api/quests/state*");
    await click(a, "โหลดข้อมูลล่าสุด");
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    for (const path of [
      "/explore/memories",
      "/explore/letters",
      "/explore/mood",
    ]) {
      await go(a, path);
      for (const width of [375, 390, 1440]) {
        await a.setViewportSize({ width, height: 844 });
        check(
          await a.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "no horizontal overflow " + path + " at " + width,
        );
      }
    }
    await go(a, "/explore/memories");
    await a.screenshot({
      path: "output/playwright/phase4-memories.png",
      fullPage: true,
    });
    const latest = (await state(b)).memories[0].photo;
    await api(a, "journal", "delete", { kind: "memory", id: memory.id });
    check(
      (await b.request.get(origin + latest)).status() === 404,
      "author deletion immediately revokes even a current partner photo URL",
    );
    await go(b, "/explore/letters");
    await api(b, "auth", "sign-out", {});
    await click(b, "โหลดข้อมูลล่าสุด");
    await b
      .getByText("เซสชันสิ้นสุดแล้ว กรุณาเข้าสู่ระบบอีกครั้ง", { exact: true })
      .waitFor();
    check(
      await b
        .getByRole("button", { name: "เขียนจดหมาย", exact: true })
        .isDisabled(),
      "revoked session cannot write journal",
    );
    check(
      (
        await b.request.get(origin + "/api/journal/letter?id=" + due.id)
      ).status() === 401,
      "revoked session cannot read an already unlocked letter",
    );
    check(!diagnostics.length, "no browser runtime errors");
    return { passed: checks.length, checks, accounts };
  } catch (error) {
    const last=pages.at(-1);
    if(last && !last.isClosed()) diagnostics.push(await last.evaluate(()=>({url:location.pathname,forms:document.querySelectorAll("form").length,heading:document.querySelector("h1")?.textContent,ready:document.readyState,scripts:document.scripts.length})));
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

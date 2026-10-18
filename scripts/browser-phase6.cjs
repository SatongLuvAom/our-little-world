/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    browser = page.context().browser(),
    contexts = [],
    pages = [],
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
  const go = async (p) => {
    await p.goto(origin + "/us");
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
  };
  try {
    check(
      (await api(page, "backup", "start")).status() === 401,
      "anonymous cannot export private data",
    );
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        acceptDownloads: true,
      });
      contexts.push(context);
      const p = await context.newPage();
      pages.push(p);
      p.setDefaultTimeout(25000);
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
      await p.waitForFunction(
        () =>
          Object.keys(document.querySelector("form") || {}).some((k) =>
            k.startsWith("__reactProps$"),
          ),
        null,
        { timeout: 45000 },
      );
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Phase 6 QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const data = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({ id: data.profile.id, username: data.profile.username });
    }
    const [a, b, c, d] = pages;
    check(
      (await api(a, "backup", "start")).status() === 403,
      "unpaired account cannot back up another couple",
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
      const invite = await (await api(owner, "account", "invitation")).json();
      check(
        (await api(partner, "account", "accept", { token: invite.token })).ok(),
        "pair QA partner",
      );
    }
    let current = await state(a);
    for (let i = 0; i < 12; i++) {
      const id = crypto.randomUUID();
      check(
        (
          await api(a, "quests", "save", {
            id,
            version: 0,
            title: "Backup quest " + i,
            assignee_id: null,
            due: current.day,
            repeat: "ครั้งเดียว",
            hearts: 20,
          })
        ).ok(),
        "seed backup quest " + i,
      );
      check(
        (
          await api(i % 2 ? b : a, "quests", "complete", {
            id,
            request_id: crypto.randomUUID(),
          })
        ).ok(),
        "seed heart ledger " + i,
      );
    }
    check(
      (
        await api(a, "pet", "purchase", {
          item_id: "mint-hat",
          request_id: crypto.randomUUID(),
        })
      ).ok(),
      "seed shared inventory",
    );
    check(
      (await api(a, "pet", "feed", { request_id: crypto.randomUUID() })).ok(),
      "seed pet cooldown",
    );
    check(
      (
        await api(b, "quests", "redeem", {
          reward_id: "massage",
          request_id: crypto.randomUUID(),
        })
      ).ok(),
      "seed reward redemption",
    );
    const goal = crypto.randomUUID();
    check(
      (
        await api(a, "planning", "save", {
          kind: "goal",
          id: goal,
          version: 0,
          title: "Backup goal",
          target_cents: 100000,
          due: "2099-12-31",
        })
      ).ok(),
      "seed savings goal",
    );
    const deposit = {
      id: crypto.randomUUID(),
      goal_id: goal,
      contributor_id: accounts[1].id,
      amount_cents: 12345,
      note: "Exact satang",
    };
    check(
      (await api(a, "planning", "deposit", deposit)).ok(),
      "seed exact savings ledger",
    );
    const image = await a.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 220;
      const context = canvas.getContext("2d"),
        image = context.createImageData(220, 220);
      for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = Math.random() * 256;
        image.data[i + 1] = Math.random() * 256;
        image.data[i + 2] = Math.random() * 256;
        image.data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL("image/png");
    });
    const memory = crypto.randomUUID(),
      letter = crypto.randomUUID();
    check(
      (
        await api(a, "journal", "save", {
          kind: "memory",
          id: memory,
          title: "Backup private image",
          day: current.day,
          note: "Only our couple",
          photo: image,
        })
      ).ok(),
      "seed large private PNG",
    );
    check(
      (
        await api(b, "journal", "save", {
          kind: "letter",
          id: letter,
          title: "Backup future letter",
          body: "PHASE6-NEVER-REVEAL-BEFORE-2099",
          openOn: "2099-12-31",
        })
      ).ok(),
      "seed scheduled letter",
    );
    check(
      (
        await api(a, "journal", "save", {
          kind: "mood",
          day: current.day,
          mood: "อบอุ่น",
          note: "Before backup",
          version: 0,
        })
      ).ok(),
      "seed mood",
    );
    current = await state(a);
    check(
      current.balance === 150 &&
        current.planning.goals[0].total_cents === 12345,
      "seed ledger balances match exact values",
    );
    await go(a);
    const downloaded = a.waitForEvent("download");
    await click(a, "สำรองข้อมูลจริง");
    const download = await downloaded,
      stream = await download.createReadStream(),
      buffers = [];
    for await (const chunk of stream) buffers.push(chunk);
    const buffer = Buffer.concat(buffers),
      archive = JSON.parse(buffer.toString());
    await download.saveAs("output/playwright/phase6-qa.olw-backup");
    check(
      download.suggestedFilename().endsWith(".olw-backup") &&
        archive.app === "our-little-world",
      "UI downloads actual encrypted backup file",
    );
    check(
      !buffer.includes(Buffer.from("PHASE6-NEVER-REVEAL-BEFORE-2099")) &&
        !buffer.includes(Buffer.from(image.slice(100, 180))),
      "download never exposes future letter or image plaintext",
    );
    check(
      archive.parts.length > 8 &&
        archive.parts.some((p) => p.data.length > 250000),
      "backup pages include multi-page ledgers and large private photo",
    );
    check(
      (
        await api(c, "backup", "preview", { manifest: archive.manifest })
      ).status() === 400,
      "other couple cannot preview archive",
    );
    check(
      (
        await api(c, "backup", "export-part", {
          manifest: archive.manifest,
          index: 0,
        })
      ).status() === 400,
      "other couple cannot export archived data",
    );
    const before = await state(a);
    check(
      (await api(a, "journal", "delete", { kind: "memory", id: memory })).ok(),
      "remove only QA memory for real recovery test",
    );
    check(
      (
        await api(a, "planning", "deposit", {
          ...deposit,
          id: crypto.randomUUID(),
          amount_cents: 55,
        })
      ).ok(),
      "change savings after snapshot",
    );
    await go(b);
    await click(b, "กู้คืนจากไฟล์");
    const upload = async (payload = buffer) =>
      b
        .getByLabel("ไฟล์สำรองคู่ของเรา", { exact: true })
        .setInputFiles({
          name: "qa.olw-backup",
          mimeType: "application/json",
          buffer: payload,
        });
    const bad = structuredClone(archive);
    bad.parts[0].data =
      (bad.parts[0].data[0] === "A" ? "B" : "A") + bad.parts[0].data.slice(1);
    await upload(Buffer.from(JSON.stringify(bad)));
    await b.getByRole("alert").filter({ hasText: "ไฟล์เสียหาย" }).waitFor();
    check(
      (await state(a)).journal.memories.length === 0,
      "tampered upload leaves current data unchanged",
    );
    await upload();
    await b.getByText("150 หัวใจ", { exact: false }).waitFor();
    check(
      await b
        .getByRole("button", { name: "ยืนยันกู้คืนข้อมูล", exact: true })
        .isDisabled(),
      "restore requires explicit typed confirmation",
    );
    check(
      (
        await api(a, "journal", "save", {
          kind: "mood",
          day: current.day,
          mood: "สดใส",
          note: "Partner edits during restore",
          version: 1,
        })
      ).ok(),
      "partner writes during restore preview",
    );
    await b
      .getByLabel("พิมพ์ กู้คืนข้อมูล เพื่อยืนยันแทนที่ข้อมูลทั้งคู่", {
        exact: true,
      })
      .fill("กู้คืนข้อมูล");
    await click(b, "ยืนยันกู้คืนข้อมูล");
    await b
      .getByRole("alert")
      .filter({ hasText: "ข้อมูลเปลี่ยนหลังตรวจไฟล์" })
      .waitFor();
    check(
      (await state(a)).planning.goals[0].total_cents === 12400,
      "stale preview does not overwrite new savings",
    );
    await upload();
    await b.getByText("150 หัวใจ", { exact: false }).waitFor();
    let resolveLost;
    const lost = new Promise((resolve) => {
      resolveLost = resolve;
    });
    await b.route("**/api/backup/commit", async (route) => {
      const response = await route.fetch();
      resolveLost({ status: response.status(), body: await response.json() });
      await route.abort("failed");
    });
    await b
      .getByLabel("พิมพ์ กู้คืนข้อมูล เพื่อยืนยันแทนที่ข้อมูลทั้งคู่", {
        exact: true,
      })
      .fill("กู้คืนข้อมูล");
    await click(b, "ยืนยันกู้คืนข้อมูล");
    const committed = await lost;
    check(
      committed.status === 200 && committed.body.applied,
      "restore commits before simulated lost response",
    );
    await b.getByRole("alert").filter({ hasText: "เชื่อมต่อไม่ได้" }).waitFor();
    await b.unroute("**/api/backup/commit");
    await b.reload();
    await b.getByRole("dialog").waitFor();
    check(
      await b
        .getByRole("button", { name: "ยืนยันกู้คืนข้อมูล", exact: true })
        .isDisabled(),
      "pending restore receipt survives reload and still asks confirmation",
    );
    await b
      .getByLabel("พิมพ์ กู้คืนข้อมูล เพื่อยืนยันแทนที่ข้อมูลทั้งคู่", {
        exact: true,
      })
      .fill("กู้คืนข้อมูล");
    await click(b, "ยืนยันกู้คืนข้อมูล");
    await b.getByRole("dialog").waitFor({ state: "hidden" });
    const restored = await state(b);
    check(
      restored.balance === 150 &&
        restored.history.entries.length === before.history.entries.length,
      "restore retry does not add or spend hearts twice",
    );
    check(
      restored.planning.goals[0].total_cents === 12345 &&
        restored.planning.history.entries.length === 1,
      "restore exact money without duplicate entries",
    );
    check(
      restored.gamification.pet.feeds === 1 &&
        restored.gamification.pet.wearing === "mint-hat",
      "restore pet inventory and cooldown",
    );
    check(
      restored.journal.moods[0].note === "Before backup",
      "restore saved mood",
    );
    check(
      (
        await b.request.get(origin + "/api/journal/letter?id=" + letter)
      ).status() === 404,
      "future letter remains server-locked after restore",
    );
    const photo = await b.request.get(
      origin + restored.journal.memories[0].photo,
    );
    check(
      photo.ok() &&
        (await photo.body()).toString("base64") ===
          image.slice("data:image/png;base64,".length),
      "private photo round trip is byte exact",
    );
    check(
      (
        await c.request.get(origin + restored.journal.memories[0].photo)
      ).status() === 403,
      "other couple cannot use restored photo URL",
    );
    const isolated = await state(c);
    check(
      isolated.balance === 0 &&
        isolated.quests.length === 0 &&
        isolated.journal.memories.length === 0,
      "restore does not touch other couple",
    );
    await go(a);
    for (const width of [375, 390, 1440]) {
      await a.setViewportSize({ width, height: 900 });
      check(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "backup settings fit viewport " + width,
      );
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await click(a, "กู้คืนจากไฟล์");
    await a.screenshot({
      path: "output/playwright/phase6-backup.png",
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

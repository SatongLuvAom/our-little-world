/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin,
    cohort = Date.now().toString(36),
    contexts = [],
    pages = [],
    accounts = [],
    checks = [],
    errors = [];
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const post = (p, path, body = {}, requestOrigin = origin) =>
    p.request.post(origin + "/api/" + path, {
      headers: requestOrigin === null ? {} : { Origin: requestOrigin },
      data: body,
    });
  const get = (p, path) => p.request.get(origin + "/api/" + path);
  const state = async (p) => {
    const r = await get(p, "quests/state?planning=1&pet=1&journal=1");
    check(r.ok(), "combined state is authenticated and readable");
    return r.json();
  };
  const reads = [
    "account/context",
    "quests/state",
    "quests/history",
    "planning/state",
    "planning/history",
    "journal/state",
    "journal/letter",
    "journal/photo",
    "pet/state",
    "push/state",
    "diagnostics/state",
  ];
  const writes = {
    account: ["couple", "invitation", "accept", "revoke", "profile"],
    quests: ["save", "delete", "complete", "redeem"],
    planning: ["save", "delete", "deposit", "reverse"],
    journal: ["save", "delete"],
    pet: ["feed", "purchase", "equip", "rename"],
    backup: [
      "start",
      "export-part",
      "preview",
      "upload-part",
      "commit",
      "cancel",
    ],
    push: ["subscribe", "unsubscribe", "test"],
    diagnostics: ["report"],
  };
  const writePaths = Object.entries(writes).flatMap(([family, ops]) =>
    ops.map((op) => family + "/" + op),
  );
  const rejected = (r) => [400, 403, 404, 409].includes(r.status());
  const race = async (path, bodies, members = [pages[0], pages[1]]) => {
    // Bound pressure to six requests; this is a correctness test, not a load test.
    const responses = await Promise.all(
      bodies.map((body, i) => post(members[i % members.length], path, body)),
    );
    return Promise.all(
      responses.map(async (r) => ({ status: r.status(), ...(await r.json()) })),
    );
  };
  const oneApplied = (rows) =>
    rows.filter((r) => r.status === 200 && r.applied === true).length === 1 &&
    rows.every((r) => [200, 400, 409].includes(r.status));
  try {
    for (const path of reads) {
      const r = await get(page, path);
      check(
        r.status() === 401 && /no-store/.test(r.headers()["cache-control"]),
        "anonymous denied GET " + path,
      );
    }
    for (const path of writePaths)
      check(
        (await post(page, path)).status() === 401,
        "anonymous denied POST " + path,
      );
    for (let i = 0; i < 4; i++) {
      const context = await page
        .context()
        .browser()
        .newContext({ viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const p = await context.newPage();
      pages.push(p);
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
      await p
        .getByLabel("ชื่อของคุณ", { exact: true })
        .fill("Security QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i);
      await p
        .getByRole("button", { name: "สมัครด้วย Passkey", exact: true })
        .click();
      await p.waitForURL(origin + "/account");
      const { profile } = await (await get(p, "account/context")).json();
      accounts.push({ id: profile.id, username: profile.username });
    }
    const [a, b, c, d] = pages,
      uid = accounts.map((x) => x.id);
    const cookieFlags = await a.context().cookies(origin);
    check(
      cookieFlags.some(
        (x) =>
          x.name.endsWith("session_token") &&
          x.httpOnly &&
          x.sameSite === "Lax" &&
          (origin.startsWith("http:") || x.secure),
      ),
      "session cookie HttpOnly/SameSite and HTTPS Secure",
    );
    for (const path of writePaths) {
      check(
        (await post(a, path, {}, "https://untrusted.invalid")).status() === 403,
        "foreign Origin denied " + path,
      );
      check(
        (await post(a, path, {}, null)).status() === 403,
        "missing Origin denied " + path,
      );
    }
    for (const p of pages)
      check(
        (await get(p, "quests/state")).status() === 403,
        "unpaired user has no shared data",
      );
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (
          await post(owner, "account/couple", { anniversary: "2024-02-14" })
        ).ok(),
        "create isolated QA couple",
      );
      const invite = await (await post(owner, "account/invitation")).json();
      check(
        (await post(partner, "account/accept", { token: invite.token })).ok(),
        "pair QA partner",
      );
      check(
        (await post(partner, "account/accept", { token: invite.token })).ok(),
        "accepted invite retry is idempotent for the same member",
      );
      check(
        (
          await post(c === partner ? a : c, "account/accept", {
            token: invite.token,
          })
        ).status() === 400,
        "consumed invitation cannot add a third member",
      );
    }
    const initial = await state(a),
      day = initial.day;
    const quest = {
      id: crypto.randomUUID(),
      version: 0,
      title: '<img src=x onerror="window.__qaXss=1">',
      due: day,
      repeat: "ครั้งเดียว",
      hearts: 80,
      assignee_id: null,
    };
    const assigned = {
      ...quest,
      id: crypto.randomUUID(),
      title: "Assigned to partner",
      hearts: 3,
      assignee_id: uid[1],
    };
    const goal = {
      kind: "goal",
      id: crypto.randomUUID(),
      version: 0,
      title: "Our exact satang",
      target_cents: 100000,
      due: "2099-12-31",
    };
    const otherGoal = { ...goal, id: crypto.randomUUID() };
    const date = {
      kind: "date",
      id: crypto.randomUUID(),
      version: 0,
      title: "Our date",
      place: "Private place",
      day: "2099-12-31",
      time: "12:00",
      budget_cents: 12345,
    };
    const wish = {
      kind: "wish",
      id: crypto.randomUUID(),
      version: 0,
      title: "Our wish",
      category: "สิ่งของ",
      done: false,
    };
    const event = {
      kind: "event",
      id: crypto.randomUUID(),
      version: 0,
      title: "Our event",
      day: "2099-12-31",
      event_kind: "กิจกรรม",
    };
    for (const q of [quest, assigned])
      check((await post(a, "quests/save", q)).ok(), "seed scoped quest");
    await a.goto(origin + "/quests");
    await a.getByText(quest.title, { exact: true }).waitFor();
    check(
      (await a.evaluate(() => window.__qaXss)) === undefined &&
        (await a.locator('img[src="x"]').count()) === 0,
      "stored HTML-like quest title is rendered as text without executing script",
    );
    for (const record of [goal, date, wish, event])
      check(
        (await post(a, "planning/save", record)).ok(),
        "seed planning " + record.kind,
      );
    check(
      (await post(c, "planning/save", otherGoal)).ok(),
      "seed other couple goal",
    );
    const png = await a.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ed8ca2";
      ctx.fillRect(0, 0, 8, 8);
      return canvas.toDataURL("image/png");
    });
    const memory = {
      kind: "memory",
      id: crypto.randomUUID(),
      title: "Private image",
      day,
      note: "QA only",
      photo: png,
    };
    const futureLetter = {
      kind: "letter",
      id: crypto.randomUUID(),
      title: "Future letter",
      body: "SECURITY-QA-PRIVATE-FUTURE-CONTENT",
      openOn: "2099-12-31",
    };
    const readyLetter = {
      ...futureLetter,
      id: crypto.randomUUID(),
      title: "Ready letter",
      body: "SECURITY-QA-READY-CONTENT",
      openOn: day,
    };
    for (const record of [memory, futureLetter, readyLetter])
      check(
        (await post(a, "journal/save", record)).ok(),
        "seed journal " + record.title,
      );
    const otherBefore = await state(c);
    const otherSnapshot = JSON.stringify({
      quests: otherBefore.quests,
      balance: otherBefore.balance,
      planning: otherBefore.planning,
      journal: otherBefore.journal,
      gamification: otherBefore.gamification.pet,
    });
    for (const [path, body] of [
      ["quests/save", { ...quest, version: 1, title: "stolen" }],
      ["quests/delete", { id: quest.id }],
      ["quests/complete", { id: quest.id, request_id: crypto.randomUUID() }],
      ["planning/save", { ...goal, version: 1 }],
      ["planning/delete", { kind: "date", id: date.id }],
      ["planning/delete", { kind: "wish", id: wish.id }],
      ["planning/delete", { kind: "event", id: event.id }],
      [
        "planning/deposit",
        {
          id: crypto.randomUUID(),
          goal_id: goal.id,
          contributor_id: uid[2],
          amount_cents: 100,
          note: "foreign",
        },
      ],
      ["journal/delete", { kind: "memory", id: memory.id }],
      ["journal/delete", { kind: "letter", id: readyLetter.id }],
    ])
      check(
        rejected(await post(c, path, body)),
        "cross-couple ID denied " + path,
      );
    check(
      rejected(
        await post(a, "quests/save", {
          ...assigned,
          id: crypto.randomUUID(),
          assignee_id: uid[2],
        }),
      ),
      "foreign assignee cannot be used",
    );
    check(
      rejected(
        await post(a, "planning/deposit", {
          id: crypto.randomUUID(),
          goal_id: goal.id,
          contributor_id: uid[2],
          amount_cents: 100,
          note: "foreign contributor",
        }),
      ),
      "foreign contributor cannot be used",
    );
    const beforeComplete = await state(b),
      photoUrl = beforeComplete.journal.memories[0].photo;
    check(
      (await a.request.get(origin + photoUrl)).status() === 403,
      "signed private photo cannot be transferred to partner session",
    );
    check(
      (await c.request.get(origin + photoUrl)).status() === 403,
      "signed private photo cannot be transferred to another couple",
    );
    const partnerPhoto = await b.request.get(origin + photoUrl);
    check(
      partnerPhoto.ok() &&
        partnerPhoto.headers()["cache-control"] === "private, no-store",
      "photo owner session reads uncached binary PNG",
    );
    for (const p of [a, b])
      check(
        (await get(p, "journal/letter?id=" + futureLetter.id)).status() === 404,
        "future letter body locked for each member",
      );
    check(
      !JSON.stringify(beforeComplete.journal).includes(futureLetter.body),
      "journal state never exposes future body",
    );
    check(
      (await get(c, "journal/letter?id=" + readyLetter.id)).status() === 404,
      "other couple cannot read an opened letter",
    );
    check(
      (await (await get(b, "journal/letter?id=" + readyLetter.id)).json())
        .body === readyLetter.body,
      "recipient reads ready letter through authenticated API",
    );
    for (const [path, body] of [
      [
        "quests/complete",
        { id: quest.id, request_id: crypto.randomUUID(), actor_id: uid[2] },
      ],
      [
        "quests/redeem",
        { reward_id: "dinner", request_id: crypto.randomUUID(), cost: 0 },
      ],
      [
        "pet/purchase",
        { item_id: "mint-hat", request_id: crypto.randomUUID(), amount: 1 },
      ],
      [
        "planning/deposit",
        {
          id: crypto.randomUUID(),
          goal_id: goal.id,
          contributor_id: uid[0],
          amount_cents: 1,
          note: "",
          couple_id: otherBefore.couple.id,
        },
      ],
      [
        "journal/save",
        {
          kind: "mood",
          day,
          mood: "อบอุ่น",
          note: "",
          version: 0,
          user_id: uid[1],
        },
      ],
    ])
      check(
        (await post(a, path, body)).status() === 400,
        "forged identity or price rejected " + path,
      );
    for (const amount_cents of [0, -1, 0.01, 1000000001, "100", null])
      check(
        (
          await post(a, "planning/deposit", {
            id: crypto.randomUUID(),
            goal_id: goal.id,
            contributor_id: uid[0],
            amount_cents,
            note: "",
          })
        ).status() === 400,
        "invalid satang rejected " + String(amount_cents),
      );
    const completionId = crypto.randomUUID();
    check(
      oneApplied(
        await race(
          "quests/complete",
          Array.from({ length: 6 }, (_, i) => ({
            id: quest.id,
            request_id: i < 3 ? completionId : crypto.randomUUID(),
          })),
        ),
      ),
      "two members complete same quest with same/different IDs: one award",
    );
    let current = await state(a);
    check(
      current.balance === 80 &&
        current.completionCount === 1 &&
        current.history.entries.length === 1,
      "exactly 80 hearts and one immutable completion",
    );
    check(
      (
        await post(a, "quests/complete", {
          id: assigned.id,
          request_id: crypto.randomUUID(),
        })
      ).status() === 400,
      "cannot complete partner-only quest",
    );
    const edits = await race("quests/save", [
      { ...quest, version: 1, title: "Edit A" },
      { ...quest, version: 1, title: "Edit B" },
    ]);
    check(
      edits.filter((x) => x.status === 200).length === 1 &&
        edits.filter((x) => x.status === 409).length === 1,
      "two stale quest forms cannot silently overwrite each other",
    );
    const spendBodies = Array.from({ length: 6 }, (_, i) => ({
      path: i % 2 ? "pet/purchase" : "quests/redeem",
      body:
        i % 2
          ? { item_id: "mint-hat", request_id: crypto.randomUUID() }
          : { reward_id: "dinner", request_id: crypto.randomUUID() },
    }));
    const spend = await Promise.all(
      spendBodies.map(async (row, i) => {
        const r = await post(i % 2 ? a : b, row.path, row.body);
        return { status: r.status(), ...(await r.json()) };
      }),
    );
    check(
      oneApplied(spend),
      "mixed reward and pet purchase race cannot spend the same 80 hearts twice",
    );
    current = await state(b);
    const winner = spendBodies[spend.findIndex((x) => x.applied === true)],
      charged = winner.path === "pet/purchase" ? 50 : 80;
    check(
      current.balance === 80 - charged &&
        current.balance >= 0 &&
        current.history.entries.filter((e) => e.kind === "redemption")
          .length === 1,
      "mixed spend has one charge and nonnegative wallet",
    );
    check(
      (await (await post(b, winner.path, winner.body)).json()).applied ===
        false,
      "other member retries winner ID without another charge even when funds insufficient",
    );
    check(
      (
        await post(a, "quests/redeem", {
          reward_id: "dinner",
          request_id: completionId,
        })
      ).status() === 409,
      "completion request ID cannot be reused for redemption",
    );
    const deposit = {
      id: crypto.randomUUID(),
      goal_id: goal.id,
      contributor_id: uid[1],
      amount_cents: 12345,
      note: "same deposit",
    };
    check(
      oneApplied(await race("planning/deposit", Array(6).fill(deposit))),
      "same deposit from two members commits exact satang once",
    );
    check(
      (
        await post(a, "planning/deposit", { ...deposit, amount_cents: 12346 })
      ).status() === 409,
      "reused deposit ID cannot change amount",
    );
    check(
      (
        await post(a, "planning/deposit", {
          ...deposit,
          contributor_id: uid[0],
        })
      ).status() === 409,
      "reused deposit ID cannot change contributor",
    );
    check(
      (
        await post(c, "planning/reverse", {
          id: crypto.randomUUID(),
          entry_id: deposit.id,
          note: "foreign",
        })
      ).status() === 404,
      "another couple cannot reverse a known deposit UUID",
    );
    const values = [1, 9, 101, 289];
    const deposits = await race(
      "planning/deposit",
      values.map((amount_cents, i) => ({
        ...deposit,
        id: crypto.randomUUID(),
        contributor_id: uid[i % 2],
        amount_cents,
        note: "distinct " + i,
      })),
    );
    check(
      deposits.every((x) => x.status === 200 && x.applied === true),
      "distinct concurrent deposits from both contributors are all retained",
    );
    const reverseId = crypto.randomUUID();
    check(
      oneApplied(
        await race(
          "planning/reverse",
          Array.from({ length: 6 }, (_, i) => ({
            id: i < 3 ? reverseId : crypto.randomUUID(),
            entry_id: deposit.id,
            note: "one correction",
          })),
        ),
      ),
      "same original reversed once despite six same/different request IDs",
    );
    current = await state(a);
    const savedGoal = current.planning.goals.find((g) => g.id === goal.id);
    check(
      savedGoal.total_cents === 400 &&
        Object.values(savedGoal.contributions).reduce((x, y) => x + y, 0) ===
          400,
      "exact remaining total 400 satang equals contributor totals",
    );
    check(
      current.planning.history.entries.reduce(
        (n, e) => n + e.amount_cents,
        0,
      ) === 400 &&
        current.planning.history.entries.filter((e) => e.kind === "reversal")
          .length === 1,
      "money ledger agrees with rollup after concurrent correction",
    );
    const lostDeposit = {
      ...deposit,
      id: crypto.randomUUID(),
      amount_cents: 999,
      note: "lost response",
    };
    await a.goto(origin + "/savings");
    let committed = false;
    await a.route("**/api/planning/deposit", async (route) => {
      const r = await route.fetch();
      committed = r.ok() && (await r.json()).applied === true;
      await route.abort("failed");
    });
    const lost = await a.evaluate(async (body) => {
      try {
        await fetch("/api/planning/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return false;
      } catch {
        return true;
      }
    }, lostDeposit);
    await a.unroute("**/api/planning/deposit");
    check(
      committed && lost,
      "server committed deposit before client lost response",
    );
    check(
      (await (await post(b, "planning/deposit", lostDeposit)).json())
        .applied === false,
      "retry lost deposit from partner does not write it again",
    );
    check(
      (await state(b)).planning.goals[0].total_cents === 1399,
      "lost-response retry preserves exact 1399 satang",
    );
    const feedId = crypto.randomUUID();
    const feeds = await race(
      "pet/feed",
      Array.from({ length: 6 }, (_, i) => ({
        request_id: i < 3 ? feedId : crypto.randomUUID(),
      })),
    );
    check(
      oneApplied(feeds),
      "two members feed concurrently: one feed during shared cooldown",
    );
    const goodFeed = feeds.findIndex((x) => x.applied === true);
    if (goodFeed < 3)
      check(
        (await (await post(b, "pet/feed", { request_id: feedId })).json())
          .applied === false,
        "retry successful feed is idempotent",
      );
    check(
      (await (await get(a, "pet/state")).json()).pet.feeds === 1,
      "shared pet feed rollup is exactly one",
    );
    const exportInfo = await (await post(a, "backup/start")).json();
    check(
      rejected(
        await post(c, "backup/preview", { manifest: exportInfo.manifest }),
      ),
      "sealed backup manifest cannot be restored into another couple",
    );
    check(
      rejected(
        await post(c, "backup/export-part", {
          manifest: exportInfo.manifest,
          table: "heart_entries",
          offset: 0,
        }),
      ),
      "sealed manifest cannot export another couple's ledger",
    );
    const job = await (
      await post(a, "backup/preview", { manifest: exportInfo.manifest })
    ).json();
    check(
      typeof job.id === "string",
      "create scoped staging job for IDOR checks",
    );
    for (const [op, body] of [
      ["commit", { id: job.id, confirmation: "กู้คืนข้อมูล" }],
      ["upload-part", { id: job.id, index: 0, part: "invalid" }],
    ])
      check(
        rejected(await post(c, "backup/" + op, body)),
        "cross-couple restore job denied " + op,
      );
    check((await post(c, "backup/cancel", { id: job.id })).ok(), "foreign cancel returns a generic no-op without disclosing a job");
    check((await post(a, "backup/commit", { id: job.id, confirmation: "กู้คืนข้อมูล" })).status() === 400, "foreign cancel preserved owner staging job; incomplete restore still fails closed");
    check(
      (await post(a, "backup/cancel", { id: job.id })).ok(),
      "owner cancels only QA staging job",
    );
    const otherAfter = await state(d);
    check(
      JSON.stringify({
        quests: otherAfter.quests,
        balance: otherAfter.balance,
        planning: otherAfter.planning,
        journal: otherAfter.journal,
        gamification: otherAfter.gamification.pet,
      }) === otherSnapshot,
      "other couple's shared records and balances unchanged after attacks/races",
    );
    const sameScopedId = {
      ...deposit,
      goal_id: otherGoal.id,
      contributor_id: uid[2],
      amount_cents: 7,
      note: "independent same UUID",
    };
    check(
      (await (await post(c, "planning/deposit", sameScopedId)).json())
        .applied === true,
      "same ledger UUID in another couple remains independent",
    );
    const finalA = await state(a),
      finalB = await state(b);
    check(finalA.planning.dates.some(x => x.id === date.id) && finalA.planning.wishes.some(x => x.id === wish.id) && finalA.planning.events.some(x => x.id === event.id), "foreign delete attempts preserved every owner planning record");
    check(
      finalA.balance === finalB.balance &&
        JSON.stringify(finalA.planning) === JSON.stringify(finalB.planning),
      "both members read identical final wallet and money history",
    );
    check(
      finalA.balance ===
        finalA.history.entries.reduce((n, e) => n + e.amount, 0),
      "heart wallet agrees with its immutable ledger",
    );
    check(
      (await (await get(c, "planning/history?before=" + deposit.id)).json())
        .entries.length === 0,
      "foreign cursor UUID reveals no other couple history",
    );
    for (const path of [
      "quests/state?couple_id=" + otherBefore.couple.id,
      "planning/state?actor_id=" + uid[2],
    ]) {
      const data = await (await get(a, path)).json();
      check(
        !JSON.stringify(data).includes(otherGoal.id),
        "query identity override ignored " + path.split("?")[0],
      );
    }
    for (const path of [
      "quests/ledger",
      "planning/ledger",
      "push/dispatch",
      "auth/sign-up/email",
      "auth/sign-in/username",
    ])
      check(
        (await post(a, path, {})).status() === 404,
        "unsupported privileged endpoint remains closed " + path,
      );
    await a.goto(origin + "/quests");
    await a.getByText("SHARED · D1", { exact: true }).waitFor();
    check(
      (await post(a, "auth/sign-out", {})).ok(),
      "logout revokes the actual session",
    );
    for (const path of reads)
      check(
        (await get(a, path)).status() === 401,
        "revoked session denied GET " + path,
      );
    for (const path of writePaths)
      check(
        (await post(a, path)).status() === 401,
        "revoked session denied POST " + path,
      );
    check(
      (await get(b, "quests/state")).ok(),
      "partner session remains independently valid after logout",
    );
    check(errors.length === 0, "no browser runtime errors");
    return {
      passed: checks.length,
      checks,
      accounts,
      cohort,
      totals: {
        savings_cents: 1399,
        hearts: finalA.balance,
        completions: finalA.completionCount,
        feeds: 1,
      },
      anonymousEndpoints: reads.length + writePaths.length,
      originProtectedWrites: writePaths.length,
      maxConcurrent: 6,
    };
  } catch (error) {
    throw Error(
      error.message +
        "; QA accounts=" +
        JSON.stringify(accounts) +
        "; cohort=" +
        cohort,
    );
  } finally {
    for (const context of contexts) await context.close();
  }
}

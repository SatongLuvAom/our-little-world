/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
// Permission and PushManager are simulated; subscription APIs, D1, WebAuthn and navigation are real.
async (page) => {
  const origin = new URL(page.url()).origin,
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
  const post = (p, family, op, body = {}) =>
    p.request.post(origin + "/api/" + family + "/" + op, {
      headers: { Origin: origin },
      data: body,
    });
  const state = async (p) =>
    (await p.request.get(origin + "/api/push/state")).json();
  const go = async (p) => {
    await p.goto(origin + "/us");
    await p.getByText("SHARED · D1", { exact: true }).waitFor();
    await p
      .getByRole("button", {
        name: /^(เปิดแจ้งเตือนเครื่องนี้|บันทึกการแจ้งเตือน)$/,
      })
      .waitFor();
    await p.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (b) =>
          /เปิดแจ้งเตือนเครื่องนี้|บันทึกการแจ้งเตือน/.test(b.textContent) &&
          !b.disabled,
      ),
    );
  };
  try {
    for (let i = 0; i < 4; i++) {
      const context = await page
        .context()
        .browser()
        .newContext({
          viewport: { width: 390, height: 844 },
          serviceWorkers: "allow",
        });
      contexts.push(context);
      context.on("page", (p) =>
        p.on("pageerror", (error) => errors.push(error.message)),
      );
      await context.addInitScript(() => {
        window.__qaPermission = "granted";
        window.__qaPermissionCalls = 0;
        window.__qaNativeSubscribes = 0;
        Object.defineProperty(Notification, "requestPermission", {
          configurable: true,
          value: async () => {
            window.__qaPermissionCalls++;
            window.__qaGesture = navigator.userActivation.isActive;
            return window.__qaPermission;
          },
        });
        const wrap = (raw) => ({
          endpoint: raw.endpoint,
          expirationTime: null,
          toJSON: () => raw,
          unsubscribe: async () => {
            localStorage.removeItem("qa:push");
            return true;
          },
        });
        PushManager.prototype.getSubscription = async () => {
          const raw = localStorage.getItem("qa:push");
          return raw ? wrap(JSON.parse(raw)) : null;
        };
        PushManager.prototype.subscribe = async () => {
          window.__qaNativeSubscribes++;
          const pair = await crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveBits"],
          );
          const encode = (array) =>
            btoa(String.fromCharCode(...new Uint8Array(array)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=/g, "");
          const raw = {
            endpoint:
              "https://fcm.googleapis.com/fcm/send/qa-browser-" +
              crypto.randomUUID(),
            expirationTime: null,
            keys: {
              p256dh: encode(
                await crypto.subtle.exportKey("raw", pair.publicKey),
              ),
              auth: encode(crypto.getRandomValues(new Uint8Array(16))),
            },
          };
          localStorage.setItem("qa:push", JSON.stringify(raw));
          return wrap(raw);
        };
      });
      const p = await context.newPage();
      pages.push(p);
      p.setDefaultTimeout(45000);
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
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("Push QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const account = await (
        await p.request.get(origin + "/api/account/context")
      ).json();
      accounts.push({
        id: account.profile.id,
        username: account.profile.username,
      });
    }
    const [a, b, c, d] = pages;
    for (const [owner, partner] of [
      [a, b],
      [c, d],
    ]) {
      check(
        (
          await post(owner, "account", "couple", { anniversary: "2024-02-14" })
        ).ok(),
        "create QA couple",
      );
      const invitation = await (
        await post(owner, "account", "invitation")
      ).json();
      check(
        (
          await post(partner, "account", "accept", { token: invitation.token })
        ).ok(),
        "pair QA members",
      );
    }
    await go(a);
    check(
      await a
        .getByRole("region", { name: "แจ้งเตือนบนเครื่องนี้" })
        .isVisible(),
      "real account has Push opt-in controls after the worker activates",
    );
    await a.evaluate(() => {
      window.__qaPermission = "denied";
    });
    await click(a, "เปิดแจ้งเตือนเครื่องนี้");
    await a
      .getByRole("alert")
      .filter({ hasText: "ยังไม่ได้รับอนุญาต" })
      .waitFor();
    check(
      (await state(a)).devices.length === 0,
      "denied permission never stores a subscription or shows fake success",
    );
    await a.evaluate(() => {
      window.__qaPermission = "granted";
    });
    await click(a, "เปิดแจ้งเตือนเครื่องนี้");
    await a
      .getByText("เปิดการแจ้งเตือนเครื่องนี้แล้ว", { exact: true })
      .waitFor();
    check(
      await a.evaluate(
        () => window.__qaGesture && window.__qaPermissionCalls === 2,
      ),
      "permission is requested directly from a real click gesture",
    );
    let current = await state(a);
    check(
      current.devices.length === 1 &&
        current.devices[0].quests === 1 &&
        current.devices[0].letters === 1,
      "subscribe persists category preferences in D1",
    );
    const originalId = current.devices[0].id;
    await a
      .getByLabel("ภารกิจที่ยังไม่เสร็จ · 09:00 น.", { exact: true })
      .uncheck();
    await click(a, "บันทึกการแจ้งเตือน");
    await a.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("button")).find(
          (b) => b.textContent === "บันทึกการแจ้งเตือน",
        ).disabled,
    );
    current = await state(a);
    check(
      current.devices.length === 1 &&
        current.devices[0].id === originalId &&
        current.devices[0].quests === 0,
      "saving preferences updates the same endpoint without another device or subscription",
    );
    check(
      await a.evaluate(() => window.__qaNativeSubscribes === 1),
      "preference updates do not repeat native Push subscription creation",
    );
    check(
      (await state(b)).devices.length === 0 &&
        (await state(c)).devices.length === 0,
      "partner and other couple cannot see this user's devices",
    );
    check(
      (
        await post(c, "push", "test", {
          id: originalId,
          request_id: crypto.randomUUID(),
        })
      ).status() === 404,
      "other couple cannot trigger a Push to this device",
    );
    await go(b);
    await click(b, "เปิดแจ้งเตือนเครื่องนี้");
    await b
      .getByText("เปิดการแจ้งเตือนเครื่องนี้แล้ว", { exact: true })
      .waitFor();
    check(
      (await state(a)).devices.length === 1 &&
        (await state(b)).devices.length === 1,
      "both partners opt in independently",
    );
    const partnerId = (await state(b)).devices[0].id;
    await post(a, "push", "unsubscribe", { id: partnerId });
    check(
      (await state(b)).devices.length === 1,
      "one partner cannot disable the other's devices",
    );
    await a.reload();
    await a
      .getByRole("button", { name: "บันทึกการแจ้งเตือน", exact: true })
      .waitFor();
    check(
      !(await a
        .getByLabel("ภารกิจที่ยังไม่เสร็จ · 09:00 น.", { exact: true })
        .isChecked()),
      "device preferences survive a full reload",
    );
    // Deterministic UI contract test; server encryption and send outcomes are verified in tests/push.test.ts.
    await a.route("**/api/push/test", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ state: "sent", applied: true }),
      }),
    );
    await click(a, "ทดสอบแจ้งเตือน");
    await a
      .getByText(
        "บริการ Push รับข้อความทดสอบแล้ว ตรวจการแจ้งเตือนบนเครื่องของคุณ",
        { exact: true },
      )
      .waitFor();
    check(
      true,
      "test button reports service acceptance without claiming OS delivery (simulated response)",
    );
    await a.unroute("**/api/push/test");
    await a.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "PUSH_OPEN", url: "/explore/letters" },
        }),
      ),
    );
    await a.waitForURL(origin + "/explore/letters");
    check(
      true,
      "notification message navigates an idle app to the allowed section",
    );
    await go(a);
    await click(a, "กู้คืนจากไฟล์");
    await a.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "PUSH_OPEN", url: "/quests" },
        }),
      ),
    );
    check(
      a.url() === origin + "/us" && (await a.getByRole("dialog").isVisible()),
      "notification opening preserves an existing restore dialog",
    );
    await a.getByRole("dialog").getByLabel("ปิด", { exact: true }).click();
    await click(a, "ดูการแจ้งเตือน");
    await a.waitForURL(origin + "/quests");
    check(true, "deferred notification opens only when the user is ready");
    await go(a);
    for (const width of [375, 390, 1440]) {
      await a.setViewportSize({ width, height: 844 });
      check(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Push controls fit viewport " + width,
      );
    }
    await a.setViewportSize({ width: 390, height: 844 });
    await a
      .getByRole("region", { name: "แจ้งเตือนบนเครื่องนี้" })
      .screenshot({
        path: "output/playwright/phase6-push.png",
        animations: "disabled",
      });
    const nativeAttempt = await post(a, "push", "test", {
      id: originalId,
      request_id: crypto.randomUUID(),
    });
    const nativeOutcome = await nativeAttempt.json();
    check(
      nativeAttempt.ok() &&
        ["sent", "failed", "retry"].includes(nativeOutcome.state),
      "actual Worker crypto reaches the push provider using an invalid QA endpoint (no human recipient)",
    );
    await click(a, "ปิดแจ้งเตือนเครื่องนี้");
    await a
      .getByText("ปิดการแจ้งเตือนเครื่องนี้แล้ว", { exact: true })
      .waitFor();
    check(
      (await state(a)).devices.length === 0 &&
        (await a.evaluate(() => !localStorage.getItem("qa:push"))),
      "disable removes server registration and native subscription",
    );
    await b.goto(origin + "/account");
    await click(b, "ออกจากระบบ");
    await b.waitForURL(origin + "/login?notice=signed-out");
    check(
      (await b.request.get(origin + "/api/push/state")).status() === 401,
      "logout revokes access to Push devices",
    );
    const ledger = await (
      await a.request.get(origin + "/api/quests/state?planning=1")
    ).json();
    check(
      ledger.balance === 0 && ledger.planning.goals.length === 0,
      "Push controls never change money or hearts",
    );
    check(!errors.length, "no page runtime errors");
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

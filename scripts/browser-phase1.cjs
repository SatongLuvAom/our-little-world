/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin;
  const browser = page.context().browser();
  const contexts = [],
    checks = [],
    accounts = [];
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  const suffix = Date.now().toString(36);
  const pages = [];
  const devices = new Map();
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    contexts.push(context);
    const target = await context.newPage();
    pages.push(target);
    const cdp = await context.newCDPSession(target);
    await cdp.send("WebAuthn.enable");
    const device = await cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    devices.set(target, { cdp, id: device.authenticatorId });
  }
  for (const p of pages) {
    p.setDefaultTimeout(15000);
    p.setDefaultNavigationTimeout(30000);
  }
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const hydrated = (p) =>
    p.waitForFunction(() => {
      const form = document.querySelector("form");
      return (
        form && Object.keys(form).some((key) => key.startsWith("__reactProps$"))
      );
    });
  const contextData = async (p) => {
    const r = await p.request.get(origin + "/api/account/context");
    if (r.status() !== 200)
      throw Error("Cannot load account context: " + r.status());
    return r.json();
  };
  const register = async (p, index) => {
    await p.goto(origin + "/register");
    await hydrated(p);
    await p
      .getByLabel("ชื่อของคุณ", { exact: true })
      .fill("QA Member " + index);
    await p
      .getByLabel("ชื่อผู้ใช้", { exact: true })
      .fill("qa_web_" + suffix + "_" + index);
    await click(p, "สมัครด้วย Passkey");
    await p.waitForURL(origin + "/account");
    await p
      .getByRole("heading", { name: "QA Member " + index, exact: true })
      .waitFor();
    const data = await contextData(p);
    accounts.push({ id: data.profile.id, username: data.profile.username });
    return data;
  };
  try {
    const stranger = pages[4];
    await stranger.goto(origin + "/account");
    await stranger.waitForURL(origin + "/login");
    check(
      (await stranger.request.get(origin + "/api/account/context")).status() ===
        401,
      "unauthenticated page redirects and API returns 401",
    );
    check(
      (await stranger.locator("form").getAttribute("method")) === "post",
      "credential form uses POST even before hydration",
    );
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    contexts.push(noJs);
    const fallback = await noJs.newPage();
    await fallback.goto(origin + "/register");
    await fallback.getByLabel("ชื่อของคุณ", { exact: true }).fill("No JS QA");
    await fallback.getByLabel("ชื่อผู้ใช้", { exact: true }).fill("no_js_qa");
    const [fallbackRequest] = await Promise.all([
      fallback.waitForRequest(
        (r) => r.isNavigationRequest() && r.method() === "POST",
      ),
      fallback
        .getByRole("button", { name: "สมัครด้วย Passkey", exact: true })
        .click({ noWaitAfter: true }),
    ]);
    check(
      fallbackRequest.method() === "POST" &&
        !new URL(fallbackRequest.url()).search,
      "disabled JavaScript cannot send credentials in a GET URL",
    );
    for (const width of [375, 390, 1440]) {
      await stranger.setViewportSize({ width, height: 844 });
      await stranger.goto(origin + "/login");
      await stranger.locator("main h1").waitFor();
      const bounds = await stranger.evaluate(() => [
        document.documentElement.scrollWidth,
        document.documentElement.clientWidth,
      ]);
      check(
        bounds[0] <= bounds[1] + 1,
        "login layout " + width + "px has no overflow",
      );
      await stranger.screenshot({
        path: "output/playwright/login-" + width + ".png",
        fullPage: true,
      });
    }
    const unverified = devices.get(stranger);
    await unverified.cdp.send("WebAuthn.setResponseOverrideBits", {
      authenticatorId: unverified.id,
      isBadUV: true,
    });
    await stranger.route(
      "**/api/auth/passkey/generate-register-options**",
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.authenticatorSelection.userVerification = "discouraged";
        await route.fulfill({ response, json: body });
      },
    );
    await stranger.goto(origin + "/register");
    await hydrated(stranger);
    await stranger
      .getByLabel("ชื่อของคุณ", { exact: true })
      .fill("UV negative");
    await stranger
      .getByLabel("ชื่อผู้ใช้", { exact: true })
      .fill("qa_uv_" + suffix);
    const rejectedRegistration = stranger.waitForResponse((r) =>
      r.url().includes("/passkey/verify-registration"),
    );
    await click(stranger, "สมัครด้วย Passkey");
    const rejectedUV = await rejectedRegistration;
    check(
      rejectedUV.status() === 401 &&
        (
          await stranger.request.get(origin + "/api/account/context")
        ).status() === 401,
      "server rejects registration without user verification even when client options are weakened",
    );
    await stranger.unroute("**/api/auth/passkey/generate-register-options**");
    await unverified.cdp.send("WebAuthn.setResponseOverrideBits", {
      authenticatorId: unverified.id,
      isBadUV: false,
    });
    const abandoned = await stranger.request.get(
      origin +
        "/api/auth/passkey/generate-register-options?context=" +
        encodeURIComponent(
          JSON.stringify({
            username: "qa_uv_" + suffix,
            display_name: "UV negative",
          }),
        ),
    );
    check(
      abandoned.status() === 200,
      "failed registration does not reserve a username or create an account",
    );
    let registrationRace;
    await pages[0].route(
      "**/api/auth/passkey/verify-registration",
      async (route) => {
        const send = () =>
          pages[0].request.post(route.request().url(), {
            headers: { Origin: origin },
            data: route.request().postDataJSON(),
          });
        const replies = await Promise.all([send(), send()]);
        registrationRace = replies.map((r) => r.status()).sort();
        const winner = replies.find((r) => r.ok());
        if (!winner) throw Error("Concurrent registration did not succeed");
        await route.fulfill({ response: winner });
      },
    );
    for (let i = 0; i < 4; i++) await register(pages[i], i);
    await pages[0].unroute("**/api/auth/passkey/verify-registration");
    check(
      JSON.stringify(registrationRace) === JSON.stringify([200, 400]),
      "a valid registration challenge succeeds exactly once across concurrent submissions",
    );
    checks.push(
      "four independent accounts register with real WebAuthn ceremonies and receive server sessions",
    );
    const a = pages[0],
      b = pages[1],
      c = pages[2],
      d = pages[3];
    for (const owner of [a, c]) {
      await owner.goto(origin + "/pairing");
      await owner
        .getByLabel("วันที่เริ่มคบกัน", { exact: true })
        .fill("2024-02-14");
      await click(owner, "สร้างคู่ของเรา");
      await owner
        .getByRole("button", { name: "สร้างรหัสคำเชิญ", exact: true })
        .waitFor();
      await click(owner, "สร้างรหัสคำเชิญ");
      await owner
        .getByLabel("รหัสสำหรับส่งให้อีกคน", { exact: true })
        .waitFor();
    }
    const tokenA = await a
      .getByLabel("รหัสสำหรับส่งให้อีกคน", { exact: true })
      .inputValue();
    const tokenC = await c
      .getByLabel("รหัสสำหรับส่งให้อีกคน", { exact: true })
      .inputValue();
    const dataA = await contextData(a),
      dataC = await contextData(c);
    check(
      dataA.couple.id !== dataC.couple.id,
      "different accounts create isolated couples",
    );
    await a
      .locator('input[name="invitation_id"]')
      .evaluate((el, value) => (el.value = value), dataC.couple.invitation.id);
    await click(a, "ยกเลิกรหัสคำเชิญ");
    await a
      .getByRole("alert")
      .filter({ hasText: "รหัสคำเชิญไม่ถูกต้อง" })
      .waitFor();
    check(
      (await contextData(c)).couple.invitation.id ===
        dataC.couple.invitation.id,
      "tampered foreign invitation ID cannot revoke another couple's invitation",
    );
    for (const [guest, token] of [
      [b, tokenA],
      [d, tokenC],
    ]) {
      await guest.goto(origin + "/pairing");
      await guest.getByLabel("รหัสคำเชิญ", { exact: true }).fill(token);
      await click(guest, "จับคู่บัญชี");
      await guest.waitForURL(origin + "/account");
      await guest.getByText("2/2 คน", { exact: true }).waitFor();
    }
    const pairedA = await contextData(a),
      pairedB = await contextData(b),
      pairedC = await contextData(c);
    check(
      pairedA.couple.id === pairedB.couple.id &&
        pairedA.couple.members.length === 2,
      "accepting invite pairs exactly two accounts",
    );
    const forged = await a.request.get(
      origin +
        "/api/account/context?couple_id=" +
        pairedC.couple.id +
        "&user_id=" +
        pairedC.profile.id,
    );
    const foreign = await forged.json();
    check(
      foreign.couple.id === pairedA.couple.id &&
        !JSON.stringify(foreign).includes(pairedC.couple.id),
      "forged couple_id and user_id query params cannot expose another couple",
    );
    check(
      !JSON.stringify(foreign).includes("password") &&
        !JSON.stringify(foreign).includes("token_hash"),
      "account API exposes neither password hashes nor invitation token hashes",
    );
    await a.reload();
    await a.getByText("2/2 คน", { exact: true }).waitFor();
    checks.push("pairing and session survive refresh");
    await a
      .getByLabel("ชื่อของคุณ", { exact: true })
      .fill("QA Renamed " + suffix);
    await click(a, "บันทึกชื่อ");
    await a.getByText("บันทึกชื่อของคุณแล้ว", { exact: true }).waitFor();
    check(
      (await contextData(b)).couple.members.some(
        (m) => m.display_name === "QA Renamed " + suffix,
      ),
      "profile updates persist and are visible to the partner",
    );
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({
      path: "output/playwright/account-390.png",
      fullPage: true,
    });
    const authCookies = (await a.context().cookies(origin)).filter((c) =>
      c.name.includes("olw"),
    );
    check(
      authCookies.length > 0 &&
        authCookies.every(
          (c) =>
            c.httpOnly &&
            c.sameSite === "Lax" &&
            (origin.startsWith("https:") ? c.secure : true),
        ),
      "session cookies are HttpOnly, SameSite=Lax and Secure on HTTPS",
    );
    await click(a, "ออกจากระบบ");
    await a.waitForURL(origin + "/login?notice=signed-out");
    check(
      (await a.request.get(origin + "/api/account/context")).status() === 401,
      "logout invalidates API access",
    );
    await hydrated(a);
    const primary = devices.get(a);
    await primary.cdp.send("WebAuthn.setResponseOverrideBits", {
      authenticatorId: primary.id,
      isBadUV: true,
    });
    await a.route(
      "**/api/auth/passkey/generate-authenticate-options**",
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.userVerification = "discouraged";
        await route.fulfill({ response, json: body });
      },
    );
    let verified = a.waitForResponse((r) =>
      r.url().includes("/passkey/verify-authentication"),
    );
    await click(a, "เข้าสู่ระบบด้วย Passkey");
    check(
      (await verified).status() === 401 &&
        (await a.request.get(origin + "/api/account/context")).status() === 401,
      "server rejects authentication without PIN/biometric verification",
    );
    await a.unroute("**/api/auth/passkey/generate-authenticate-options**");
    await primary.cdp.send("WebAuthn.setResponseOverrideBits", {
      authenticatorId: primary.id,
      isBadUV: false,
    });
    await a
      .getByRole("button", { name: "เข้าสู่ระบบด้วย Passkey", exact: true })
      .waitFor();
    await a.route(
      "**/api/auth/passkey/verify-authentication",
      async (route) => {
        const payload = route.request().postDataJSON();
        const signature = payload.response.response.signature;
        payload.response.response.signature =
          (signature[0] === "A" ? "B" : "A") + signature.slice(1);
        await route.continue({ postData: JSON.stringify(payload) });
      },
    );
    verified = a.waitForResponse((r) =>
      r.url().includes("/passkey/verify-authentication"),
    );
    await click(a, "เข้าสู่ระบบด้วย Passkey");
    check(
      !(await verified).ok() &&
        (await a.request.get(origin + "/api/account/context")).status() === 401,
      "tampered cryptographic signatures cannot create a session",
    );
    await a.unroute("**/api/auth/passkey/verify-authentication");
    let assertion;
    a.on("request", (request) => {
      if (request.url().includes("/passkey/verify-authentication"))
        assertion = request.postDataJSON();
    });
    await click(a, "เข้าสู่ระบบด้วย Passkey");
    await a.waitForURL(origin + "/account");
    await a.getByText("2/2 คน", { exact: true }).waitFor();
    checks.push("the registered passkey signs back into the existing couple");
    await primary.cdp.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId: primary.id,
    });
    const backup = await primary.cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await click(a, "เพิ่ม Passkey สำรอง");
    await a.getByText("เพิ่ม Passkey สำรองแล้ว", { exact: true }).waitFor();
    const keys = await a.request.get(
      origin + "/api/auth/passkey/list-user-passkeys",
    );
    check(
      keys.ok() && (await keys.json()).length === 2,
      "a second device can register a backup passkey for the same account",
    );
    await click(a, "ออกจากระบบ");
    await a.waitForURL(origin + "/login?notice=signed-out");
    await hydrated(a);
    const replay = await a.request.post(
      origin + "/api/auth/passkey/verify-authentication",
      { headers: { Origin: origin }, data: assertion },
    );
    check(
      !replay.ok() &&
        (await a.request.get(origin + "/api/account/context")).status() === 401,
      "a previously used signed assertion cannot be replayed after logout",
    );
    const csrf = await a.request.post(
      origin + "/api/auth/passkey/verify-authentication",
      { headers: { Origin: "https://evil.example" }, data: assertion },
    );
    check(
      csrf.status() === 403,
      "cross-origin passkey verification is rejected",
    );
    await click(a, "เข้าสู่ระบบด้วย Passkey");
    await a.waitForURL(origin + "/account");
    await a.getByText("2/2 คน", { exact: true }).waitFor();
    checks.push(
      "backup passkey logs into the same couple without the primary device",
    );
    check(
      (
        await a.request.post(origin + "/api/auth/sign-in/username", {
          headers: { Origin: origin },
          data: { username: accounts[0].username, password: "unused" },
        })
      ).status() === 404,
      "password authentication endpoints are disabled",
    );
    await primary.cdp.send("WebAuthn.removeVirtualAuthenticator", {
      authenticatorId: backup.authenticatorId,
    });
    await primary.cdp.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    await a.route("**/api/auth/passkey/verify-registration", async (route) => {
      await a.request.post(origin + "/api/auth/sign-out", {
        headers: { Origin: origin },
        data: {},
      });
      await route.continue();
    });
    const invalidEnrollment = a.waitForResponse((r) =>
      r.url().includes("/passkey/verify-registration"),
    );
    await click(a, "เพิ่ม Passkey สำรอง");
    check(
      !(await invalidEnrollment).ok() &&
        (await a.request.get(origin + "/api/account/context")).status() === 401,
      "revoking the session during backup enrollment prevents adding a new credential",
    );
    await a.unroute("**/api/auth/passkey/verify-registration");
    await click(a, "ออกจากระบบ");
    await a.waitForURL(origin + "/login?notice=signed-out");
    await a.goto(origin + "/");
    return { passed: checks.length, checks, accounts };
  } catch (error) {
    console.log(
      JSON.stringify({
        completedChecks: checks,
        accounts,
        pages: await Promise.all(
          pages.map(async (p) => ({
            url: p.url(),
            alerts: await p.getByRole("alert").allTextContents(),
          })),
        ),
      }),
    );
    throw error;
  } finally {
    for (const context of contexts) await context.close();
  }
}

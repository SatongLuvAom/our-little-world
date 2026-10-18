/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
// Separate persistent QA browser only. No PushManager/Notification mocks or human account sessions.
async (page) => {
  const origin = new URL(page.url()).origin,
    accounts = [],
    cohort = Date.now().toString(36),
    context = page.context();
  const partnerContext = await context
    .browser()
    .newContext({ viewport: { width: 390, height: 844 } });
  const partner = await partnerContext.newPage();
  const post = (p, family, op, body = {}) =>
    p.request.post(origin + "/api/" + family + "/" + op, {
      headers: { Origin: origin },
      data: body,
    });
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  let registered = false,
    accepted = false,
    received = false;
  try {
    for (const [i, p] of [page, partner].entries()) {
      const cdp = await p.context().newCDPSession(p);
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
      await p
        .getByLabel("ชื่อของคุณ", { exact: true })
        .fill("Native Push QA " + i);
      await p
        .getByLabel("ชื่อผู้ใช้", { exact: true })
        .fill("qa_p6_" + cohort + "_" + i);
      await click(p, "สมัครด้วย Passkey");
      await p.waitForURL(origin + "/account");
      const profile = (
        await (await p.request.get(origin + "/api/account/context")).json()
      ).profile;
      accounts.push({ id: profile.id, username: profile.username });
    }
    await post(page, "account", "couple", { anniversary: "2024-02-14" });
    const invitation = await (await post(page, "account", "invitation")).json();
    await post(partner, "account", "accept", { token: invitation.token });
    await context.grantPermissions(["notifications"], { origin });
    await page.goto(origin + "/us");
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some(
          (b) =>
            b.textContent.includes("เปิดแจ้งเตือนเครื่องนี้") && !b.disabled,
        ),
      null,
      { timeout: 60000 },
    );
    await click(page, "เปิดแจ้งเตือนเครื่องนี้");
    await page.waitForFunction(
      () =>
        document.body.textContent.includes("เปิดการแจ้งเตือนเครื่องนี้แล้ว") ||
        !!document.querySelector('.field-error[role="alert"]'),
      null,
      { timeout: 60000 },
    );
    let state = await (
      await page.request.get(origin + "/api/push/state")
    ).json();
    registered = state.devices.length === 1;
    if (registered) {
      const result = await (
        await post(page, "push", "test", {
          id: state.devices[0].id,
          request_id: crypto.randomUUID(),
        })
      ).json();
      accepted = result.state === "sent";
      if (accepted) {
        const deadline = Date.now() + 30000;
        while (!received && Date.now() < deadline) {
          received = await page.evaluate(async () =>
            (
              await (await navigator.serviceWorker.ready).getNotifications()
            ).some(
              (note) => note.body === "เครื่องนี้รับการแจ้งเตือนของเราได้แล้ว",
            ),
          );
          if (!received) await page.waitForTimeout(500);
        }
      }
    }
    const alerts = await page.getByRole("alert").allTextContents();
    const reason = registered
      ? received
        ? "native notification observed"
        : accepted
          ? "provider accepted; OS receipt not observed"
          : "provider did not accept"
      : alerts.some((s) => /push service/i.test(s))
        ? "browser push service registration unavailable"
        : alerts.some((s) => /permission|อนุญาต|denied/i.test(s))
          ? "notification permission unavailable"
          : "native subscription unavailable";
    state = await (await page.request.get(origin + "/api/push/state")).json();
    for (const device of state.devices)
      await post(page, "push", "unsubscribe", { id: device.id });
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
      for (const note of await reg.getNotifications()) note.close();
    });
    return { native: true, registered, accepted, received, reason, accounts };
  } catch (error) {
    throw Error(error.message + "; QA accounts=" + JSON.stringify(accounts));
  } finally {
    await partnerContext.close();
  }
}

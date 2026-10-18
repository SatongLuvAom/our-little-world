/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const origin = new URL(page.url()).origin;
  const accounts = [];
  const cohort = Date.now().toString(36);
  for (let i = 0; i < 6; i++) {
    const context = await page.context().browser().newContext();
    try {
      const p = await context.newPage();
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
      await p.waitForFunction(() => {
        const f = document.querySelector("form");
        return f && Object.keys(f).some((k) => k.startsWith("__reactProps$"));
      });
      const username = "qa_cpu_" + cohort + "_" + i;
      await p.getByLabel("ชื่อของคุณ", { exact: true }).fill("QA CPU " + i);
      await p.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(username);
      await p
        .getByRole("button", { name: "สมัครด้วย Passkey", exact: true })
        .click();
      await p.waitForURL(origin + "/account");
      await p
        .getByRole("heading", { name: "QA CPU " + i, exact: true })
        .waitFor();
      const r = await p.request.get(origin + "/api/account/context");
      const data = await r.json();
      accounts.push({ id: data.profile.id, username });
    } finally {
      await context.close();
    }
  }
  return { cohort, accounts };
}

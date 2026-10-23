/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
// Real local Worker responses, with a fresh browser cache and no service worker.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://localhost:3018")
    throw Error("CSS navigation regression is restricted to local preview");
  const context = await page.context().browser().newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const checks = [], errors = [], assets = [], failed = [];
  const check = (ok, name) => {
    if (!ok) throw Error(name);
    checks.push(name);
  };
  try {
    const p = await context.newPage();
    let phase = "cold Savings";
    const requestedDuring = new WeakMap();
    p.setDefaultTimeout(30000);
    p.on("request", (request) => requestedDuring.set(request, phase));
    p.on("pageerror", (error) => errors.push(error.message));
    p.on("response", (response) => {
      const request = response.request();
      if (["font", "stylesheet", "script"].includes(request.resourceType()))
        assets.push({
          type: request.resourceType(),
          url: response.url(),
          status: response.status(),
          // A reload can revalidate a resource already downloaded in this fresh context.
          cachedFromEarlier200: response.status() === 304 && assets.some((asset) => asset.type === request.resourceType() && asset.url === response.url() && asset.status === 200),
        });
    });
    p.on("requestfailed", (request) => {
      if (["font", "stylesheet", "script"].includes(request.resourceType()))
        failed.push({ type: request.resourceType(), url: request.url(), failure: request.failure()?.errorText, requestedDuring: requestedDuring.get(request), failedDuring: phase });
    });
    const ready = async (heading) => {
      await p.locator(".loading-screen").waitFor({ state: "hidden" });
      await p.locator("main h1").waitFor();
      await p.getByText("กำลังตรวจสอบข้อมูลของบัญชี…", { exact: true }).waitFor({ state: "hidden" });
      await p.getByRole("heading", { level: 1, name: heading }).waitFor();
    };
    const styled = async (label) => {
      const actual = await p.evaluate(async () => {
        const samples = [
          ['600 30px "IBM Plex Sans Thai"', "กระปุกความฝัน"],
          ['400 14px "DM Sans"', "Savings"],
          ['600 30px "DM Sans"', "Savings"],
        ];
        const fonts = await Promise.all(samples.map(async ([font, text]) => {
          const faces = await document.fonts.load(font, text);
          return { font, loaded: faces.length > 0 && faces.every((face) => face.status === "loaded"), checked: document.fonts.check(font, text) };
        }));
        await document.fonts.ready;
        const h1 = document.querySelector("main h1"), nav = document.querySelector(".bottom-nav");
        const heading = getComputedStyle(h1), body = getComputedStyle(document.body), navigation = getComputedStyle(nav);
        const bounds = h1.getBoundingClientRect();
        return {
          fonts,
          bodyFont: body.fontFamily,
          background: body.backgroundColor,
          headingWeight: heading.fontWeight,
          headingSize: parseFloat(heading.fontSize),
          headingWidth: bounds.width,
          headingHeight: bounds.height,
          navDisplay: navigation.display,
          navPosition: navigation.position,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      });
      check(actual.fonts.every((font) => font.loaded && font.checked), label + ": Thai 600 and Latin 400/600 font faces load");
      check(actual.bodyFont.includes("DM Sans") && actual.bodyFont.includes("IBM Plex Sans Thai") && actual.background === "rgb(255, 248, 244)", label + ": application fonts and background apply");
      check(actual.headingWeight === "600" && actual.headingSize >= 22 && actual.headingWidth > 100 && actual.headingHeight > 20 && actual.navDisplay === "grid" && actual.navPosition === "fixed" && !actual.overflow, label + ": heading and mobile navigation retain their layout");
    };
    const cold = await p.goto(origin + "/savings");
    check(cold.status() === 200, "cold Savings document responds 200");
    await ready("กระปุกความฝัน");
    await styled("cold Savings");
    const initialDocument = await p.evaluate(() => {
      window.__olwCssNavigationDocument = crypto.randomUUID();
      return window.__olwCssNavigationDocument;
    });
    const nav = p.getByRole("navigation", { name: "เมนูหลัก Mobile", exact: true });
    for (const [name, path, heading] of [
      ["Home", "/", /โลกใบเล็กของ/],
      ["Quest", "/quests", "ภารกิจของเรา"],
      ["Savings", "/savings", "กระปุกความฝัน"],
      ["Explore", "/explore", "ออกสำรวจโลกของเรา"],
    ]) {
      phase = "client navigation to " + name;
      await Promise.all([
        p.waitForURL((url) => url.pathname === path),
        nav.getByRole("link", { name, exact: true }).click(),
      ]);
      await ready(heading);
      check(await p.evaluate((id) => window.__olwCssNavigationDocument === id, initialDocument), name + ": navigation reuses the live document");
      await styled("client navigation to " + name);
    }
    phase = "nested Calendar navigation";
    await Promise.all([
      p.waitForURL((url) => url.pathname === "/explore/calendar"),
      p.locator('.explore-card[href="/explore/calendar"]').click(),
    ]);
    await ready("ปฏิทินของเรา");
    check(await p.evaluate((id) => window.__olwCssNavigationDocument === id, initialDocument), "nested Calendar opens through client navigation");
    await styled("nested Calendar navigation");
    phase = "nested Calendar reload";
    const reloaded = await p.reload();
    check(reloaded.status() === 200, "nested Calendar reload responds 200");
    await ready("ปฏิทินของเรา");
    check(await p.evaluate(() => !window.__olwCssNavigationDocument), "nested reload creates a new document");
    await styled("nested Calendar reload");
    const fonts = assets.filter((asset) => asset.type === "font");
    check(fonts.length > 0 && fonts.every((font) => font.status === 200 && new URL(font.url).origin === origin && new URL(font.url).pathname.startsWith("/_next/static/media/")), "real font requests resolve to public build assets with status 200");
    const invalidResponses = assets.filter((asset) => asset.status !== 200 && !(asset.status === 304 && asset.cachedFromEarlier200 && ["stylesheet", "script"].includes(asset.type)));
    check(invalidResponses.length === 0 && failed.length === 0, "assets load or revalidate an earlier 200 response without failed requests: " + JSON.stringify({ invalidResponses, failed }));
    check(errors.length === 0, "cold, warm and nested routes have no browser runtime error");
    return { passed: checks.length, checks, fontRequests: fonts.length, stylesheetRequests: assets.filter((asset) => asset.type === "stylesheet").length, validatedCacheHits: assets.filter((asset) => asset.cachedFromEarlier200).length, errors };
  } finally {
    await context.close();
  }
}

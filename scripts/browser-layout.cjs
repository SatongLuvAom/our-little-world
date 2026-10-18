/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const routes = [
    "/",
    "/quests",
    "/savings",
    "/explore",
    "/us",
    "/explore/dates",
    "/explore/wishlist",
    "/explore/calendar",
    "/explore/memories",
    "/explore/letters",
    "/explore/mood",
    "/explore/roulette",
    "/explore/pet",
  ];
  const results = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [375, 390, 1440]) {
    await page.setViewportSize({ width, height: width > 500 ? 1000 : 844 });
    for (const route of routes) {
      const response = await page.goto("http://127.0.0.1:3017" + route);
      await page.locator("main h1").waitFor();
      if (response.status() !== 200)
        throw new Error(`${route} returned ${response.status()}`);
      const bounds = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        available: document.documentElement.clientWidth,
      }));
      if (bounds.content > bounds.available + 1)
        throw new Error(
          `Horizontal overflow ${width}px ${route}: ${JSON.stringify(bounds)}`,
        );
      results.push(`${width}px ${route}: 200, no overflow`);
      if (["/", "/explore", "/quests"].includes(route)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `output/playwright/${route === "/" ? "home" : route.slice(1)}-${width}.png`,
          fullPage: true,
        });
      }
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:3017");
  await page.locator(".cat").waitFor();
  const duration = await page
    .locator(".cat")
    .evaluate((el) => getComputedStyle(el).animationDuration);
  if (parseFloat(duration) > 0.001)
    throw new Error(`Reduced motion failed: ${duration}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const manifestResponse = await page.request.get(
    "http://127.0.0.1:3017/manifest.webmanifest",
  );
  const manifest = await manifestResponse.json();
  if (manifest.display !== "standalone" || manifest.icons.length < 3)
    throw new Error("Invalid install manifest");
  for (const icon of manifest.icons)
    if (
      (await page.request.get("http://127.0.0.1:3017" + icon.src)).status() !==
      200
    )
      throw new Error(`Missing icon ${icon.src}`);
  if (errors.length) throw new Error(JSON.stringify(errors));
  await page.evaluate(() => window.scrollTo(0, 0));
  return {
    routesChecked: results.length,
    results,
    reducedMotion: duration,
    manifest: "valid, all icons 200",
    runtimeErrors: errors,
  };
}

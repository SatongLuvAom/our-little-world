/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const key = "our-little-world:v1";
  await page.goto("http://127.0.0.1:3017/quests");
  await page.locator("main h1").waitFor();
  const before = await page.evaluate((k) => localStorage.getItem(k), key);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Test quota exceeded", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", {
      name: "ทำสำเร็จ: บอกเรื่องดี ๆ ของวันนี้ให้กันฟัง",
      exact: true,
    })
    .click();
  const after = await page.evaluate((k) => localStorage.getItem(k), key);
  if (before !== after) throw new Error("Quota failure mutated persisted data");
  if (
    await page
      .getByRole("button", {
        name: "ทำสำเร็จ: บอกเรื่องดี ๆ ของวันนี้ให้กันฟัง",
        exact: true,
      })
      .isDisabled()
  )
    throw new Error("Quota failure caused fake completion");
  await page.reload();
  await page.locator("main h1").waitFor();
  await page.evaluate((k) => localStorage.setItem(k, "{broken-demo-json"), key);
  await page.reload();
  await page
    .getByRole("alert")
    .filter({ hasText: "อ่านข้อมูลในเครื่องไม่สำเร็จ" })
    .waitFor();
  await page
    .getByRole("button", {
      name: "ทำสำเร็จ: บอกเรื่องดี ๆ ของวันนี้ให้กันฟัง",
      exact: true,
    })
    .click();
  if (
    (await page.evaluate((k) => localStorage.getItem(k), key)) !==
    "{broken-demo-json"
  )
    throw new Error("Corrupt data was overwritten");
  await page.goto("http://127.0.0.1:3017/us");
  await page.getByRole("button", { name: "ล้างข้อมูล", exact: true }).click();
  await page
    .getByRole("button", { name: "ยืนยันล้างข้อมูล", exact: true })
    .click();
  const restored = JSON.parse(
    await page.evaluate((k) => localStorage.getItem(k), key),
  );
  if (restored.version !== 1 || restored.completions.length)
    throw new Error("Recovery reset failed");
  await page.goto("http://127.0.0.1:3017/");
  return {
    passed: [
      "quota failure keeps stored data",
      "quota failure does not complete quest or award hearts",
      "corrupt data displays recovery warning",
      "corrupt data is not overwritten",
      "explicit reset restores working demo",
    ],
  };
}

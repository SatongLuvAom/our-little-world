/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI evaluates this function expression. */
async (page) => {
  const base = new URL(page.url()).origin;
  const log = [];
  const check = (value, message) => {
    if (!value) throw new Error(message);
    log.push(message);
  };
  const go = async (route) => {
    await page.goto(base + route);
    await page.locator("main h1").waitFor();
    await page.getByText("กำลังตรวจสอบข้อมูลของบัญชี…",{exact:true}).waitFor({state:"hidden"});
  };
  const click = async (name) =>
    page.getByRole("button", { name, exact: true }).click();
  const field = async (name, value) =>
    page.getByRole("dialog").getByLabel(name, { exact: true }).fill(value);
  const save = async () => {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "บันทึก", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };
  const state = async () =>
    JSON.parse(
      await page.evaluate(() => localStorage.getItem("our-little-world:v1")),
    );
  const remove = async (row, name) => {
    await row.getByRole("button", { name, exact: true }).click();
    await click("ยืนยันการลบ");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
  };

  await go("/us");
  await click("ล้างข้อมูล");
  await click("ยืนยันล้างข้อมูล");
  await go("/quests");
  await click("เพิ่มภารกิจ");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  check(
    await page.getByText("กรอกข้อมูลก่อนนะ", { exact: true }).isVisible(),
    "empty quest is rejected with an inline error",
  );
  await field("ชื่อภารกิจ", "ภารกิจทดสอบ");
  await field("หัวใจรางวัล (1–500)", "37");
  await save();
  let row = page.locator(".quest-row").filter({ hasText: "ภารกิจทดสอบ" });
  await row.getByRole("button", { name: "แก้ไขภารกิจ", exact: true }).click();
  await field("ชื่อภารกิจ", "ภารกิจที่แก้ไขแล้ว");
  await field("หัวใจรางวัล (1–500)", "42");
  await save();
  await click("ทำสำเร็จ: ภารกิจที่แก้ไขแล้ว");
  check(
    await page
      .getByRole("button", {
        name: "ทำสำเร็จ: ภารกิจที่แก้ไขแล้ว",
        exact: true,
      })
      .isDisabled(),
    "completed quest cannot be clicked twice",
  );
  let s = await state();
  check(
    s.hearts.reduce((n, t) => n + t.amount, 0) === 162,
    "quest awards exactly 42 hearts",
  );
  await click("ร้านรางวัล");
  await page
    .locator(".reward-card")
    .filter({ hasText: "คูปองนวดไหล่" })
    .getByRole("button", { name: "40 · แลกรางวัล", exact: true })
    .click();
  await click("ยืนยันแลกรางวัล");
  s = await state();
  check(
    s.redemptions.length === 1 &&
      s.hearts.reduce((n, t) => n + t.amount, 0) === 122,
    "reward redemption creates a coupon and deducts 40 hearts",
  );
  await click("ภารกิจ");
  row = page.locator(".quest-row").filter({ hasText: "ภารกิจที่แก้ไขแล้ว" });
  await remove(row, "ลบภารกิจ");
  await click("ประวัติ");
  check(
    await page.getByText("ภารกิจที่แก้ไขแล้ว", { exact: true }).isVisible(),
    "deleting quest preserves earned-heart history",
  );
  await page.reload();
  await page.getByRole("button", { name: "ประวัติ", exact: true }).waitFor();
  s = await state();
  check(
    s.completions.length === 1 && s.redemptions.length === 1,
    "quest and rewards persist after refresh",
  );

  await go("/savings");
  await click("สร้างเป้าหมาย");
  await field("เราอยากเก็บเงินเพื่ออะไร", "เป้าหมายทดสอบ");
  await field("ยอดเป้าหมาย (บาท)", "1000");
  await save();
  const goal = page.locator(".goal-card").filter({ hasText: "เป้าหมายทดสอบ" });
  await goal
    .getByRole("button", { name: "บันทึกเงินออม", exact: true })
    .click();
  await field("ยอดที่ออม (บาท)", "-1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "บันทึก", exact: true })
    .click();
  check(
    await page.getByText("ใส่ยอดมากกว่า 0 บาท", { exact: true }).isVisible(),
    "negative savings input is rejected",
  );
  await field("ยอดที่ออม (บาท)", "123.45");
  await page
    .getByRole("dialog")
    .getByLabel("ใครเป็นคนออม", { exact: true })
    .selectOption("เธอ");
  await field("บันทึกช่วยจำ", "ทดสอบยอดออม");
  await save();
  await goal
    .getByRole("button", { name: "แก้ไขเป้าหมาย", exact: true })
    .click();
  await field("ยอดเป้าหมาย (บาท)", "1500");
  await save();
  await page.reload();
  await page.getByText("เป้าหมายทดสอบ", { exact: true }).waitFor();
  s = await state();
  check(
    s.deposits.some((t) => t.amount === 123.45 && t.person === "เธอ") &&
      s.goals.some((g) => g.target === 1500),
    "goal edits, contribution and exact amount persist",
  );

  await go("/explore/dates");
  await click("วางแผนเดต");
  await field("ชื่อเดตของเรา", "เดตทดสอบ");
  await field("สถานที่", "สวนสาธารณะ");
  await save();
  const plan = page.locator(".date-plan").filter({ hasText: "เดตทดสอบ" });
  await plan.getByRole("button", { name: "แก้ไขแผนเดต", exact: true }).click();
  await field("สถานที่", "สวนในเมือง");
  await save();
  check(
    await page.getByText("สวนในเมือง", { exact: true }).isVisible(),
    "date plan can be created and edited",
  );
  await go("/explore/calendar");
  check(
    await page.getByText("เดตทดสอบ", { exact: true }).isVisible(),
    "date plans appear automatically on calendar",
  );
  await click("เพิ่มกิจกรรม");
  await field("ชื่อกิจกรรม", "กิจกรรมทดสอบ");
  await save();
  await remove(
    page.locator(".history-row").filter({ hasText: "กิจกรรมทดสอบ" }),
    "ลบกิจกรรม",
  );
  check(
    (await page.getByText("กิจกรรมทดสอบ", { exact: true }).count()) === 0,
    "calendar event can be added and deleted",
  );
  await click("เดือนถัดไป");
  await click("เดือนก่อน");

  await go("/explore/wishlist");
  await click("เพิ่ม Wishlist");
  await field("สิ่งที่อยากทำด้วยกัน", "Wishlist ทดสอบ");
  await save();
  row = page.locator(".quest-row").filter({ hasText: "Wishlist ทดสอบ" });
  await row
    .getByRole("button", { name: "แก้ไข Wishlist", exact: true })
    .click();
  await field("สิ่งที่อยากทำด้วยกัน", "Wishlist แก้ไขแล้ว");
  await save();
  await click("ทำสำเร็จ: Wishlist แก้ไขแล้ว");
  check(
    await page
      .getByRole("button", {
        name: "ยกเลิกสำเร็จ: Wishlist แก้ไขแล้ว",
        exact: true,
      })
      .isVisible(),
    "wishlist supports editing and completion toggle",
  );
  await remove(
    page.locator(".quest-row").filter({ hasText: "Wishlist แก้ไขแล้ว" }),
    "ลบWishlist",
  );

  await go("/explore/memories");
  await page.locator('input[type="file"]').setInputFiles("public/icon-192.png");
  await page.getByAltText("รูปที่เลือกสำหรับความทรงจำ").waitFor();
  await click("เพิ่มความทรงจำ");
  await field("ตั้งชื่อวันของเรา", "รูปความทรงจำทดสอบ");
  await field("เรื่องราวที่อยากจำ", "เรื่องเล็ก ๆ ที่อยากเก็บไว้");
  await save();
  await page.reload();
  await page.getByAltText("รูปความทรงจำทดสอบ").waitFor();
  check(
    (
      await page.getByAltText("รูปความทรงจำทดสอบ").getAttribute("src")
    ).startsWith("data:image/png;base64,"),
    "uploaded photo and memory survive refresh",
  );

  await go("/explore/letters");
  await click("เขียนจดหมาย");
  await field("ชื่อจดหมาย", "จดหมายวันนี้");
  await field("ข้อความถึงเธอ", "ข้อความที่เปิดอ่านได้วันนี้");
  await save();
  await page
    .locator(".letter-card")
    .filter({ hasText: "จดหมายวันนี้" })
    .getByRole("button", { name: "เปิดอ่านจดหมาย", exact: true })
    .click();
  check(
    await page
      .getByText("ข้อความที่เปิดอ่านได้วันนี้", { exact: true })
      .isVisible(),
    "today's letter can be opened",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "ปิด", exact: true })
    .click();
  await click("เขียนจดหมาย");
  await field("ชื่อจดหมาย", "จดหมายในอนาคต");
  await field("วันเปิดอ่าน (เวลาไทย)", "2099-12-31");
  await field("ข้อความถึงเธอ", "future secret test");
  await save();
  check(
    (await page
      .getByRole("button", { name: "รอวันพิเศษของเรา", exact: true })
      .isDisabled()) &&
      (await page.getByText("future secret test", { exact: true }).count()) ===
        0,
    "future letter body is hidden in UI and opening is disabled",
  );

  await go("/explore/mood");
  await page
    .getByLabel("ข้อความบอกความรู้สึก", { exact: true })
    .fill("ทดสอบความรู้สึก");
  await click("อารมณ์อบอุ่น");
  await page.reload();
  await page
    .getByText("วันนี้รู้สึกอบอุ่น · ทดสอบความรู้สึก", { exact: true })
    .waitFor();
  check(
    (await state()).moods[0].note === "ทดสอบความรู้สึก",
    "mood check-in and message persist",
  );
  await go("/explore/pet");
  await click("ให้อาหารโมจิ");
  check(
    await page
      .getByRole("button", {
        name: "อิ่มแล้ว · ให้อีกครั้งเมื่อครบ 4 ชม.",
        exact: true,
      })
      .isDisabled(),
    "pet feeding is limited to one meal per 4 hours",
  );
  await page
    .locator(".pet-shop-item")
    .filter({ hasText: "หมวกใบโปรด" })
    .getByRole("button", { name: "ซื้อ", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "ถอด", exact: true }).waitFor();
  s = await state();
  check(
    s.pet.feeds === 1 &&
      s.pet.wearing === "mint-hat" &&
      s.hearts.reduce((n, t) => n + t.amount, 0) === 72,
    "pet item purchase deducts hearts and persists equipped item",
  );

  await go("/explore/roulette");
  await click("เปลี่ยนตัวเลือก");
  await field("กิจกรรม (บรรทัดละหนึ่งรายการ)", "เดินเล่นทดสอบ\nดูหนังทดสอบ");
  await save();
  await page.reload();
  await page
    .getByRole("button", { name: "หมุนวงล้อของเรา", exact: true })
    .waitFor();
  await click("หมุนวงล้อของเรา");
  await page.locator(".roulette-result").waitFor();
  s = await state();
  check(
    s.rouletteChoices.length === 2 &&
      s.spins.length === 1 &&
      s.rouletteChoices.includes(s.spins[0].result),
    "custom roulette choices persist and spin records one valid result",
  );

  await go("/us");
  await click("แก้ไขข้อมูลของเรา");
  await field("ชื่อเรา", "ต้นทดสอบ");
  await save();
  check(
    await page
      .getByRole("heading", { name: "ต้นทดสอบ & อิง", exact: true })
      .isVisible(),
    "couple profile can be edited",
  );
  await page
    .getByRole("switch", { name: "การ์ดเตือนภายในแอป", exact: true })
    .click();
  await page.reload();
  await page.getByRole("switch").waitFor();
  check(
    (await page.getByRole("switch").getAttribute("aria-checked")) === "false",
    "notification preference survives refresh",
  );
  const downloadPromise = page.waitForEvent("download");
  await click("ส่งออก");
  const download = await downloadPromise;
  await download.saveAs("output/playwright/demo-backup.json");
  log.push("JSON backup download succeeded");
  await click("ล้างข้อมูล");
  await click("ยืนยันล้างข้อมูล");
  await go("/");
  s = await state();
  check(
    s.completions.length === 0 && s.profile.name1 === "ต้น",
    "reset restores clean demo seed after testing",
  );
  return { passed: log.length, checks: log };
}

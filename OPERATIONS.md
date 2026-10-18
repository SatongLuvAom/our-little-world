# Our Little World — ตรวจปัญหาและประสิทธิภาพ

## เริ่มตรวจ

เปิด **Us → การทำงานของแอป → ดูสถานะแอป** ด้วยบัญชีที่จับคู่แล้ว สมาชิกทั้งสองเห็นเฉพาะยอดรวม 7 วันและ UUID ล่าสุดของคู่ตนเอง ไม่ polling อัตโนมัติ API คืน 30 กลุ่มล่าสุดพร้อมยอดรวมทุกกลุ่มในช่วงเดียวกัน ผู้ดูแลใช้ route/code, เวลา, รุ่น backend และ UUID อ้างอิงเพื่อตอบว่าเกิดที่ไหน เกิดซ้ำหรือไม่ และสัมพันธ์กับรุ่นใด ไม่ขอเนื้อหาส่วนตัวหรือ session จากผู้ใช้

API ตอบ `X-OLW-Request-ID` และคืน `request_id` เมื่อเกิด unexpected error ให้เทียบกับ `last_id` ใน D1 Worker สร้าง UUID ใหม่ทับค่าจากผู้เรียกก่อน RPC การไม่พบสัญญาณไม่ได้พิสูจน์ว่าไม่มีปัญหา: Browser ต้องออนไลน์ ผ่าน Auth และอยู่ภายในงบรายงาน

## ข้อมูลและงบบันทึก

- Browser ส่งเฉพาะ `{route, code}` ตาม allowlist; code คือ `runtime`, `promise`, `render`, `asset` ไม่อ่าน exception message/stack หรือ URL ของทรัพยากร ส่งสูงสุด 3 ครั้งต่อการโหลดหน้า กัน route/code ซ้ำ ไม่มี queue/storage/offline replay/retry
- Server บันทึก unexpected HTTP/RPC error และ Cron dispatch failure เป็น `unexpected`/`dispatch` พร้อม console JSON ที่จำกัดฟิลด์ Expected validation/403 ไม่ถูกนับเป็น server failure
- D1 เก็บ UTC day, source, couple scope, route/code คงที่, count, first/last time, UUID ล่าสุด และ Worker version จาก `APP_VERSION` ไม่มีชื่อ เนื้อหา รูป token cookie query string fragment หรือ stack เส้นทาง Auth ย่อเป็น `/api/auth`; เส้นทางไม่รู้จักเป็น `other`
- ตัวนับรวมต่อวันไม่ใช่ประวัติทุกเหตุการณ์ `last_id`/version คือครั้งล่าสุดของกลุ่ม รุ่นนี้เป็น backend version ไม่ใช่ build ที่ Browser เปิดค้างอยู่
- จำกัด 20 สัญญาณต่อคู่/source/UTC day และ 100 ต่อ source/UTC day ทั้งแอป Browser/server แยกงบ รวมสูงสุด 200 สัญญาณต่อวัน เมื่อเต็มไม่เพิ่มตัวนับ แม้ API ตอบรับแล้ว
- ล้างข้อมูลอายุเกิน 14 UTC days เมื่ออ่าน/รายงานครั้งถัดไป หากไม่มีการเรียกใช้ ข้อมูลเดิมยังอยู่จนถึงการเรียกครั้งถัดไป ไม่มี Cron เพิ่ม ตารางนี้ไม่รวมใน backup และไม่เปลี่ยน business revision
- Browser อ่านได้เฉพาะคู่จาก server session ไม่รับ `couple_id` จากผู้เรียก เหตุที่ระบุคู่ไม่ได้และ Cron ใช้ bucket `system` ซึ่ง UI ของคู่ไม่แสดง
- เมื่อ D1 ใช้ไม่ได้ จะบันทึกความผิดพลาดนั้นลง D1 ไม่ได้ ใช้ console JSON `diagnostic_store_unavailable` และ UUID โดยคงความผิดพลาดเดิม ไม่มี fake success
- `observability.enabled` คง `false` เพื่อไม่เปิด request URL logging อัตโนมัติ ใช้ D1 เป็นประวัติที่จำกัดขอบเขต และดู console สดผ่าน Tail ไม่มี SDK, email/SMS, ระบบแจ้งเตือนอัตโนมัติ หรือบริการเสียเงินเพิ่ม

## คำสั่งผู้ดูแล

อ่านเฉพาะฐานข้อมูลแอปนี้และฟิลด์ที่จำกัดไว้ ไม่เลือกชื่อผู้ใช้/couple ID หรือข้อมูลธุรกิจ:

```powershell
npx wrangler d1 execute DB --remote --command "SELECT source,route,code,count,last_at,last_id,version FROM diagnostic_events ORDER BY last_at DESC LIMIT 30;" --json
```

จับ CPU เฉพาะรอบตรวจ หยุดด้วย Ctrl+C ก่อนตรวจไฟล์ที่หยุดเปลี่ยนแล้ว:

```powershell
node scripts/capture-cpu.mjs output/cpu-mobile.json
node scripts/check-cpu.mjs output/cpu-mobile.json <deployed-version-id>
```

เครื่องมือเก็บเฉพาะ route/outcome/version/CPU ไม่บันทึก raw Tail, cookies, logs หรือ RPC arguments ลงไฟล์ ต้องมีอย่างน้อย 24 HTTP และ 24 DO RPC samples ก่อนผ่าน budget ผลใช้กับช่วงที่จับเท่านั้น

## ตรวจ Accessibility และมือถือซ้ำ

`scripts/browser-accessibility.cjs` ตรวจ axe WCAG 2/2.1/2.2 A/AA และ best practice บน 17 routes รวม desktop/dialog states ใช้ fresh context เพื่อไม่รับ CSS เก่าจาก Service Worker `scripts/browser-mobile.cjs` ใช้ QA 4 บัญชี/2 คู่ ตรวจ Auth UI, keyboard/skip link/focus trap, validation, 320/390/430 px, ขยายตัวอักษรเนื้อหาหลัก 200%, reduced motion และ error reporting จริง

Playwright CLI และ axe-core เป็น QA tools ชั่วคราว ไม่เพิ่ม package dependencies วาง `axe.min.js` ที่ `output/axe.min.js` ก่อนรัน:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=mobile-audit open https://our-little-world.supawat-you.workers.dev/ --browser=msedge
npx --yes --package @playwright/cli playwright-cli -s=mobile-audit run-code --filename=scripts/browser-accessibility.cjs
npx --yes --package @playwright/cli playwright-cli -s=mobile-audit run-code --filename=scripts/browser-mobile.cjs
npx --yes --package @playwright/cli playwright-cli -s=mobile-audit close
```

ล้างบัญชี `qa_p6_<cohort>_*` ด้วย exact whitelist หลังตรวจ ledger/membership และปิด local preview ก่อนแก้ SQLite ไม่ใช้ wildcard ข้อมูล cohort/หลักฐานรอบส่งมอบอยู่ใน `QA.md`

Lighthouse ใช้ mobile simulated network/CPU 4× วัดตอนเครื่องว่าง เก็บ JSON แล้วตรวจ budget:

```powershell
$env:CHROME_PATH='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npx --yes --package lighthouse@13.5.0 lighthouse https://our-little-world.supawat-you.workers.dev/ --port=9228 --only-categories=performance,accessibility --output=json --output-path=output/mobile-home-remote.json --chrome-flags='--headless=new --no-sandbox' --quiet
node scripts/check-mobile-budget.mjs output/mobile-home-remote.json
```

Budget: Performance ≥85, Accessibility 100, LCP ≤4,000 ms, TBT ≤200 ms, CLS ≤0.1, transfer ≤500,000 bytes ทั้งหมดเป็น lab budget เป้าหมาย LCP ระดับดีของ Core Web Vitals คือ ≤2,500 ms จึงไม่เรียกผล 2.5–4 วินาทีว่าอยู่ระดับดี TBT/เวลาปฏิสัมพันธ์ในห้องทดสอบไม่ใช่ INP ของผู้ใช้จริง รุ่นนี้ไม่เก็บ RUM

Phase 6.6 วัด Quest/Savings บน HTTPS 3 รอบต่อหน้า ผ่าน budget ทั้ง 6 reports: median LCP 3,645.59 / 3,643.98 ms และสูงสุด 3,660.48 / 3,848.60 ms ผล Phase 6.5 ที่ล้มเหลวยังเก็บเป็นประวัติใน `QA.md` การตรวจซ้ำควรใช้ Lighthouse รุ่นเดียวกัน วัดตอนเครื่องว่างและตรวจทุก report ไม่เลือกเฉพาะรอบที่ดีที่สุด ส่วน Home ไม่ได้วัดใหม่ในรอบนี้

`scripts/browser-state-preload.cjs` ตรวจการใช้ initial state request เพียงครั้งเดียวและการอ่านข้อมูลสดครั้งถัดไป พร้อมป้องกัน Demo ปรากฏก่อนรู้ผล authorization ใช้คำสั่ง `playwright-cli run-code --filename=scripts/browser-state-preload.cjs` ใน session QA เดียวกับด้านบน API ยังคง `private, no-store` และห้ามเพิ่ม API เข้า precache

axe ไม่พิสูจน์ WCAG conformance ทุกข้อ ต้องตรวจ incomplete/manual checks โดยเฉพาะ emoji/SVG/gradient ยังไม่ได้ทดสอบ VoiceOver/TalkBack, Safari iOS, Android hardware หรือ system/browser zoom จริง ผล 200% เป็นการขยาย computed font ของเนื้อหาหลักใน browser test

ใช้ Workers, SQLite Durable Object และ D1 เดิมภายใต้ Free tier ไม่แก้ Billing/R2 หรือเพิ่มบริการเสียเงิน โควตา Free ยังจำกัดตามแพลตฟอร์ม ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [version metadata](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/), [Core Web Vitals](https://web.dev/articles/vitals), [WCAG target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html))

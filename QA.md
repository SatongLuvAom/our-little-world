# Our Little World — ผลการตรวจสอบ

## Phase 6.6 — ลด LCP ของ Quest และ Savings

ตรวจวันที่ 18 ตุลาคม 2026 (Asia/Bangkok) รุ่น HTTPS `7de9621e-3e9d-453b-9612-ef2ceda499a1`, Service Worker `0c6d00b0c0ce75c7c1f9` ใช้ Workers/D1/SQLite DO และ Cron เดิม ไม่มี migration, dependency, R2, Billing หรือแพ็กเกจเสียเงินเพิ่ม

### ผลวัดก่อนและหลัง

Lighthouse **13.5.0**, Edge headless, mobile simulated network/CPU 4×, cold browser cache/storage ตามค่าเริ่มต้น วัดทีละหน้าเมื่อไม่มี build/tests/cleanup ทำงาน เปรียบเทียบ 3 ครั้งต่อหน้าบน HTTPS origin เดียวกัน ไม่เปลี่ยน budget และไม่คัดเฉพาะรอบที่ดีที่สุด

| หน้า | ก่อน: LCP ทั้ง 3 รอบ ms | หลัง: LCP ทั้ง 3 รอบ ms | median ก่อน → หลัง | ผล |
| --- | --- | --- | --- | --- |
| Quest | 4,265.84 / 4,577.63 / 4,111.90 | 3,645.59 / 3,475.27 / 3,660.48 | 4,265.84 → 3,645.59 ms (ลด 14.5%) | Passed 3/3 |
| Savings | 4,984.82 / 5,088.26 / 5,100.10 | 3,848.60 / 3,643.98 / 3,504.77 | 5,088.26 → 3,643.98 ms (ลด 28.4%) | Passed 3/3 |

| หน้า | Performance | Accessibility | TBT สูงสุด ms | CLS สูงสุด | transfer สูงสุด bytes |
| --- | --- | --- | --- | --- | --- |
| Quest | 89–90 | 100 | 111 | 0.00103 | 364,865 |
| Savings | 87–90 | 100 | 135.5 | 0.00215 | 368,831 |

`node scripts/check-mobile-budget.mjs output/lcp-preload-state-quests-{1,2,3}.json output/lcp-preload-state-savings-{1,2,3}.json` (ขยายแต่ละชื่อไฟล์ก่อนรันใน PowerShell) **Passed ทั้ง 6 reports** ตามงบ Performance ≥85, Accessibility 100, LCP ≤4,000 ms, TBT ≤200 ms, CLS ≤0.1, transfer ≤500,000 bytes

### การแก้ที่คงไว้

- แยก Server page ของ `/quests`, `/savings`, `/explore`, `/us` จาก `[section]` ที่อ้าง Client Components ทั้งสี่หน้า คง URL, metadata และ rewards query เดิม
- เปลี่ยนเฉพาะรูปแบบ import ของ Zod ใน schema ที่อยู่บน critical path และ Savings ให้ Turbopack ตัด exports ที่ไม่ใช้ โดยไม่แก้ validation; initial scripts gzip จาก 368,294 bytes ทั้งสองหน้า เหลือ Quest **286,153** / Savings **289,269** bytes ลด 82,141 / 79,025 bytes รวมผลแยก route
- ปิด automatic prefetch ของลิงก์ login/pairing ใน QuestStatus และเริ่ม GET state เดิมด้วย `preload as=fetch` ระหว่างโหลด JavaScript ใช้ credentials mode แบบ same-origin, server `private, no-store` เดิม ไม่มีการ cache ข้อมูลส่วนตัวใน Service Worker หรือ HTML และไม่มี early Demo seed
- อ่าน error response body ให้จบก่อนตรวจ version guard; trace เดิมทิ้ง body จน timeout 15 วินาที หลังแก้จบในช่วงประมาณ 0.4–1.3 วินาที ปฏิเสธ GET state ที่ไม่มีทั้ง Cookie/Authorization ที่ edge ได้ทันที ลด 1 DO RPC ต่อ anonymous read; ทุกคำขอที่มี credentials ยังคงผ่าน backend authorization เดิม ไม่มีการเปลี่ยน SQL/ledger/receipt

### บันทึกการทดลอง

ผล pilot เป็นรายรอบ เว้นแต่ระบุ median ไม่ใช้แทน 6 final reports ข้างต้น

| ทดลอง | ผลที่สังเกต | ข้อสรุป |
| --- | --- | --- |
| แยก route | Savings 4,414.64 ms; scripts ลด Quest 31,347 / Savings 28,229 gzip bytes | คงไว้: งานที่ไม่เกี่ยวกับหน้าหายไปจริง แต่ยังไม่พอผ่าน LCP |
| preload font 2 ไฟล์ / ชะลอ SW ติดตั้งครั้งแรก | Savings 4,212.02 / 4,307.21 ms | คืนโค้ด: ต่างอยู่ในความแปรปรวน ไม่เปลี่ยน font/SW timing สุดท้าย |
| ปิด Auth link prefetch | median Quest 3,799.15 / Savings 4,136.88 ms; ยังไม่ผ่านทุก report | คงไว้เพื่อตัด Auth downloads ที่ยังไม่ต้องใช้ ไม่อ้างว่าจุดนี้ปิดงานได้เอง |
| lazy EditorForm | median Quest 4,018.34 / Savings 4,017.96 ms | คืนโค้ด: ไม่มีผลดีที่สม่ำเสมอ; คงฟอร์มและ validation เดิม |
| preload font 6 ไฟล์ | median Quest 4,058.31 / Savings 4,322.52 ms | คืนโค้ด: ยังเกินงบและเพิ่มการแข่งขันโหลด |
| สลับลำดับ provider | Quest 3,946.14 / Savings 5,610 ms | คืนโค้ด: Savings แย่ลง |
| drain error body / edge fast deny | pilot LCP ยังไม่ผ่านทั้งสองหน้า; body จบก่อน timeout / ตัด 1 RPC ที่ไม่จำเป็น | คงเฉพาะงาน I/O/RPC ที่ลดได้จริง ไม่ให้เครดิต LCP จาก pilot นี้ |
| Static public shell + header | Quest 4,785.60 / Savings 4,229.21 ms | คืนโค้ดทั้งหมด: ไม่คุ้มความซับซ้อน; WorldProvider ยังคง guard เดิม |
| Zod namespace imports | Quest 3,657.08 / Savings 4,751.90 ms; scripts ลดเพิ่มประมาณ 51 KB | คงไว้จาก byte reduction ที่ชัดเจน แต่ยังไม่ปิดงานจนเพิ่ม state preload |
| state preload พร้อม changes ที่คงไว้ | LCP 3.48–3.85 วินาทีทั้ง 6 รอบ; initial state request เพียงครั้งเดียว | คงไว้: final budget ผ่านครบ |

### การตรวจส่งมอบ

- `npm test` — **Passed 106 tests** รวม edge guard ที่ใช้ worker object จริง: no credentials ไม่เรียก RPC, Cookie/Bearer ทุกชนิดและ route/method อื่นยังส่งผ่าน authorization พร้อม request ID/security headers
- `npm run lint` / `npm run typecheck` / `npm run build` / remote schema gate + deploy — **Passed**
- `scripts/browser-state-preload.cjs` HTTPS — **Passed 13 checks**: ไม่แสดง Demo/records ระหว่างรอ auth, initial request หนึ่งครั้ง, no-store read และ focus refresh เรียก server ใหม่, rewards deep link และไม่มี hydration/runtime error
- `scripts/browser-pwa.cjs` HTTPS — **Passed 44 checks**, virtual Passkey 4 บัญชี/2 คู่: concurrent completion รับหัวใจครั้งเดียว, reward/deposit/item ที่ commit แล้วคำตอบขาดหายและเปิดแอปใหม่ไม่หักหรือบวกซ้ำ, offline ไม่ replay POST, API ไม่อยู่ใน cache และอีกคู่ไม่เห็นข้อมูล
- `scripts/browser-accessibility.cjs` HTTPS — **Passed 30 page/dialog states**, 0 violations/overflow, คืน focus 9 จุด; axe ยังมี incomplete/manual checks ตาม artifact ไม่อ้าง WCAG conformance ครบทุกข้อ
- `scripts/browser-smoke.cjs` HTTPS — **Passed 23 checks** รวม validation, Quest/Rewards/Savings CRUD และ persistence; reset Demo กลับ seed หลังตรวจ
- PWA migration จาก build เดิม `d46cb70643ada90ccf1b` ไป trial split-only — **Passed 9 checks** รวม old open offline tabs, pending receipt, explicit update และ open-form guard เป็นหลักฐาน migration ของ trial ก่อน final bundle ไม่ใช่การอ้างว่าได้รัน upgrade suite ซ้ำกับ final build
- ล้าง QA exact cohort `mvdl7icp` แล้ว 4 บัญชี/2 คู่ ตรวจ savings/heart/feed ledger ก่อนลบและ read-back เหลือ 0; ปิด browser/preview ของรอบนี้แล้ว ไม่แก้ข้อมูลผู้ใช้จริง
- HTTPS probes — **Passed**: `/sw.js` HTTP 200, no-store/must-revalidate และ SHA-256 ตรง `out/sw.js`; private-source probes 6 paths ตอบ 404; state read แบบไม่มี credentials, Cookie ปลอม และ Bearer ปลอมตอบ 401/no-store พร้อม request ID

Artifacts ในเครื่อง (ignored): `lcp-before-{quests,savings}-{1,2,3}.json`, `lcp-preload-state-{quests,savings}-{1,2,3}.json`, traces/devtools logs, `lcp-delivery-summary.json` และ `lcp-browser-*.txt` ไฟล์ชื่อ `lcp-final-*` เป็น prototype lazy-form ที่คืนโค้ดแล้ว ไม่ใช่ผลส่งมอบ

ผลเป็น mobile lab บน Edge ไม่ใช่ field p75/INP หรือการรับประกันทุกเครือข่าย ไม่ได้ตรวจ Safari/iPhone/Android เครื่องจริงเพิ่ม งบ 4 วินาทีไม่เท่ากับเกณฑ์ LCP ระดับดี ≤2.5 วินาที ไม่เพิ่ม RUM หรือบริการคิดเงินเพื่อวัดผล

## Phase 6.5 — Accessibility, ประสิทธิภาพมือถือ และ error monitoring

ตรวจวันที่ 16–17 ตุลาคม 2026 (Asia/Bangkok) เผยแพร่สุดท้ายวันที่ 17 ตุลาคม รุ่น `42a20153-a899-497f-9f4a-718cf10d1f5e` และ Service Worker `d46cb70643ada90ccf1b` ใช้ Workers/D1/SQLite DO เดิม เพิ่มเฉพาะตารางตัวนับที่จำกัดจำนวนและ version metadata ไม่มี dependency หรือบริการเสียเงินเพิ่ม ไม่แก้ Billing/R2/Cron เดิมทุก 15 นาที

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 105 tests รวม diagnostics 10 tests; รันซ้ำหลังแก้ performance สุดท้ายแล้ว |
| `npm run lint` / `npm run typecheck` | Passed; ตรวจ scripts ซ้ำหลังจัดรูปแบบ |
| `npm run build` | Passed — 20 static pages, 17 RSC aliases, PWA 176 public assets/33 routes |
| Migration `0009_diagnostics.sql` local/remote | Passed; remote deploy schema gate ผ่าน |
| `npm run deploy:cloudflare` | Passed — รุ่นที่ระบุข้างต้น |
| Public axe local/HTTPS | Passed — 30 page/dialog states ต่อ origin, 0 violations/overflow, คืน focus 9 จุด |
| Public axe รุ่นสุดท้าย | Passed — ทดสอบ HTTPS ซ้ำหลังแก้ prefetch/Savings: 30 states, 0 violations/overflow, คืน focus 9 จุด |
| Paired mobile local/HTTPS | Passed — 71 checks ต่อ origin; virtual Passkey 4 บัญชี/2 คู่ บนรุ่น `1c25cd53-9dad-4a7a-8a29-250e66455977` ก่อนเปลี่ยนเฉพาะ UI performance 2 จุดสุดท้าย |
| Keyboard/mobile | Passed — skip link เข้า main, 16 Tab/ShiftTab ใน dialog, Escape คืน focus, ลบ opener แล้ว focus กลับ main, aria-invalid/describedby, aria-pressed |
| Responsive/reduced motion | Passed — 6 paired routes × 320/390/430 px, ขยาย computed font ของ main 200% บน Quest/Savings/Us และลด animation ตาม preference |
| Lab interaction CPU 4× | Passed — local สูงสุด 112 ms / HTTPS 128 ms ในการใช้งานฟอร์ม/คีย์บอร์ดที่ตรวจ ไม่ใช่ field INP |
| Error reporting HTTPS | Passed — actual uncaught runtime error ส่งเฉพาะ route/code, ID ในคำตอบตรง D1, partner เห็นร่วมกัน/อีกคู่ไม่เห็น, forged scope/private payload ถูกปฏิเสธ, money/hearts/feed ไม่เปลี่ยน |
| Private diagnostics read-back | Verified manually — `/us` runtime/asset counters ระบุ version `1c25cd53-9dad-4a7a-8a29-250e66455977` ไม่มีข้อความ `DIAGNOSTIC-QA-PRIVATE-CONTENT`; runtime ID `c3d08f23-0bb6-4a8d-ba4b-b6c6eb21c209` |
| Browser security HTTPS | Passed — 248 checks, 40 anonymous/revoked endpoints และ Origin protection 29 writes บนรุ่น `1c25cd53-9dad-4a7a-8a29-250e66455977`; backend ไม่เปลี่ยนในการ deploy สุดท้าย |
| PWA regression HTTPS | Passed — 44 checks รวม committed response loss/reopen/offline ไม่ replay บนรุ่น `1c25cd53-9dad-4a7a-8a29-250e66455977` |
| PWA regression รุ่นสุดท้าย | Passed — HTTPS 44 checks ซ้ำหลังปิด navigation prefetch; precache/offline navigation และ money/hearts receipts ยังทำงาน |
| Demo smoke HTTPS | Passed — 23 checks และ reset Demo กลับ seed |
| HTTPS `/sw.js` | Verified manually — HTTP 200, no-store/must-revalidate/no-cache และ SHA-256 ตรง `out/sw.js` |
| ภาพมือถือ | Verified manually — `output/playwright/phase6-mobile.png` |
| Private-source probes รุ่นสุดท้าย | Passed — 7 paths ตอบ 404 รวม diagnostics source/migration, `.dev.vars`, config และเอกสารผู้ดูแล |
| Local D1 `PRAGMA quick_check` หลังปิด QA | Passed — `ok` |

การปรับ UI เปลี่ยนเฉพาะ foreground/button contrast ที่ axe พบปัญหา คงโทนเดิม เพิ่ม focus return ของ dialog, main ที่รับ focus ได้, page title สำหรับ route announcer และ landmarks ใน loading ถอด Motion ที่ใช้เพียง page enter animation ออกจาก AppShell เพื่อลด JavaScript เริ่มต้น คง route remount, session/Passkey, offline update guard และ SQL ธุรกรรมเดิม ไม่ใช้ SSR seed ที่เสี่ยงให้ข้อมูล Demo ปรากฏก่อนรู้ session

Lighthouse รอบแรกหลัง deploy ยังไม่ผ่าน budget: Home performance 70/LCP 5,235 ms; Quest LCP 4,067 ms/transfer 511,296 bytes; Savings CLS 0.147/transfer 512,988 bytes รอบนั้นมี QA cleanup CLI ทำงานพร้อมกัน จึงไม่ใช้เป็นการวัดเครื่องว่าง อย่างไรก็ตาม network/shift trace ชี้งานเกินจำเป็นจริง จึงปิด viewport/hover prefetch ของเมนู AppShell (ยัง navigate เมื่อกดได้ตามเดิม) และแสดง history panel ของ Savings เมื่อข้อมูล ready เพื่อไม่ให้ panel ที่เห็นแล้วถูก goal cards ดันลง ไม่แก้ ledger/API หรือข้อมูลที่แสดงหลังพร้อม

Lighthouse 13.5.0 mobile simulated network/CPU 4× บน HTTPS รุ่นสุดท้าย วัดทีละหน้าเมื่อไม่มี test/cleanup/build อื่นทำงาน:

| หน้า | Performance / Accessibility | LCP ms | TBT ms | CLS | transfer bytes | budget |
| --- | --- | --- | --- | --- | --- | --- |
| Home | 88 / 100 | 3,788.53 | 87.43 | 0.02453 | 486,594 | Passed |
| Quest | 86 / 100 | 4,008.99 | 110 | 0.00030 | 477,429 | Failed — LCP เกิน 4,000 ms ประมาณ 9 ms |
| Savings | 84 / 100 | 4,342.29 | 145 | 0.00005 | 477,512 | Failed — Performance ต่ำกว่า 85 และ LCP เกิน 4,000 ms |

คำสั่ง `node scripts/check-mobile-budget.mjs output/mobile-home-final.json output/mobile-quests-final.json output/mobile-savings-final.json` **Failed** ตามตาราง ไม่ปรับ budget เพื่อผ่าน ทุกหน้าผ่าน Accessibility/TBT/CLS/transfer limits แต่การโหลดครั้งแรกยังต้องปรับ LCP ต่อ โดยเฉพาะ Savings และยังไม่ถึง LCP ระดับดี ≤2,500 ms ผลนี้เป็นหนึ่ง lab run ต่อหน้า ไม่ใช่ percentile ของผู้ใช้จริง ก่อนเปลี่ยน Home มีสองรอบ 86/73 และ LCP 3,582/5,123 ms แสดงความแปรปรวน จึงไม่อ้างว่า speedup เป็นเปอร์เซ็นต์แน่นอน Transfer baseline แรก 562,160 bytes เทียบรุ่นสุดท้าย 486,594 bytes ลดประมาณ 75.6 KB; Quest/Savings ลดประมาณ 33.9/35.5 KB จากรอบ production ก่อนปิด prefetch Savings CLS ลดจาก 0.147 เป็น 0.00005 หลังเลื่อนการแสดง history panel

CPU audit window แรกมี 454 invocations: `ok` 450/`canceled` 4, สูงสุด Worker 3 ms / DO 50 ms จึง **Failed** strict all-outcomes guard; PWA window มี `ok` 135/`canceled` 2 ขณะ suite จงใจตัดคำตอบ/ออฟไลน์ ไม่ตัดเหตุการณ์เหล่านี้ออกจาก artifact และไม่อ้างว่า audit windows ผ่าน guard รอบ focused รุ่นสุดท้ายส่ง anonymous read 50 ครั้งแบบเว้นช่วง จับได้ 33 Worker/33 DO samples ทั้งหมด `ok`, Worker สูงสุด 0 ms / DO 57 ms และ strict guard **Passed** เป็นหลักฐานเฉพาะเส้นทาง read นี้ ไม่แทนชุดทดสอบสมัคร/ธุรกรรม รุ่นแรกมี sample ไม่ถึงขั้นต่ำ 2 รอบ จึงเก็บ `cpu-mobile-incomplete*.json` และวัดใหม่โดยคง guard เดิม

ล้าง QA local exact cohorts `mvb6h3rs`, `mvb6kboe`, `mvb6qvcw`, `mvb6yr05`, `mvb7272s`, `mvb75ngl` รวม 24 บัญชี/12 คู่ และ remote `mvb7enc3`, `mvb7htze`, `mvb7jpbf`, `mvb7n03h` รวม 14 บัญชี/6 คู่ ตรวจสมาชิกและเงิน/หัวใจ/feed ledger ก่อนลบ read-back เหลือ 0

PWA รุ่นสุดท้ายเพิ่ม remote cohort `mvb81odd` อีก 4 บัญชี/2 คู่ ล้างด้วย whitelist เดิมและตรวจ ledger ก่อนลบ เครื่องมือ QA ทดลองรวม read-back ด้วย UNION เกินข้อจำกัด D1 ทำให้ขั้นตรวจล้มเหลวหลังลบข้อมูลแล้ว คืนเครื่องมือเดิมและตรวจ read-only ด้วย scalar subqueries ต่อ exact QA IDs ครบ 25 ตารางได้ 0 ทั้งหมด (`output/mobile-cleanup-final-verified.json`) รวม remote รอบนี้ 18 บัญชี/8 คู่ ไม่มีการแก้ production service เพื่อผ่าน cleanup ปิด QA browsers, Lighthouse helpers, preview และ CPU Tail ที่สร้างในรอบนี้แล้ว ไม่หยุด dev servers เดิม

Diagnostics มี strict allowlist, authenticated scope, บันทึกรวมต่อวันสูงสุด 20/couple/source และ 100/global/source, browser/server แยกงบ เก็บ 14 UTC days และ prune เมื่ออ่าน/รายงานครั้งถัดไป Browser ส่งสูงสุด 3 ครั้งต่อโหลด ไม่มี offline queue/retry ชุดทดสอบครอบคลุม concurrent caps, 5 คู่, retention, actual backend failure, ไม่มี exception text/stack/query รั่ว, D1 failure fallback, และ immutable asset headers คงเดิม ดูข้อจำกัด/คำสั่งตรวจใน [OPERATIONS.md](OPERATIONS.md)

ข้อจำกัด: axe มี incomplete/manual checks เช่น emoji/SVG/gradient contrast, avatar label และ Radix hidden background จึงไม่ใช่ WCAG certification Keyboard trap ตรวจ runtime แล้ว ยังไม่ได้ทดสอบ VoiceOver/TalkBack หรือโทรศัพท์จริง ผล 200% เป็นการขยายตัวอักษร main ใน test ไม่ใช่ system/browser zoom ทุกองค์ประกอบ ไม่มี field INP/RUM การส่งรายงานต้องออนไลน์และผ่าน session; D1 outage และงบเต็มทำให้ข้อมูลไม่ครบได้

ระหว่างตรวจ remote ครั้งแรก suite รอ form hydration แล้ว timeout หลังสร้าง 2 บัญชี ไม่มีหลักฐานพอสรุป root cause; fresh context รอบใหม่ผ่าน 71 checks ครบ ไม่เปลี่ยน authentication เพื่อผ่านการทดสอบ Migration ครั้งแรกพบ Cloudflare API 7403; ตรวจ OAuth/account แล้ว retry บัญชีเดิมสำเร็จโดยไม่เปลี่ยนสิทธิ์หรือแพ็กเกจ

หลักฐาน: `output/mobile-all-tests-final.txt`, `mobile-lint-final.txt`, `mobile-typecheck-final.txt`, `mobile-final-build-2.txt`, `mobile-deploy-final.txt`, `mobile-axe-local.json`, `mobile-axe-remote.json`, `mobile-browser-remote.json`, `mobile-diagnostics-readback.json`, `mobile-security-remote.json`, `mobile-pwa-remote.json`, `mobile-demo-remote.json`, `mobile-*-final.json`, `cpu-mobile*.json`, `mobile-cpu-final-check.txt` และภาพใน `output/playwright/`

### ไฟล์ source ที่เปลี่ยนใน Phase 6.5

- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0009_diagnostics.sql`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/entry.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/worker.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare-env.d.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/wrangler.jsonc`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/diagnostic-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/diagnostic-service.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/error-reporting.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/world-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/instrumentation-client.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/diagnostic-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/ui/dialog.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/app-shell.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/auth-layout.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/quests.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/shared.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/planning-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/savings.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/globals.css`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/error.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/global-error.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/error.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/layout.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/pairing/layout.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/loading.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/[section]/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/explore/[tool]/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/login/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/register/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/check-auth-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-security.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-accessibility.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-mobile.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/check-mobile-budget.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/diagnostics.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/README.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/OPERATIONS.md`

## Phase 6.4 — Security และใช้งานพร้อมกันสองคน

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) บนรุ่นเดิม `3e036937-0a69-4b10-9623-b932b1a3e428` ไม่พบเหตุให้แก้ runtime/API/SQL จึงเพิ่มเฉพาะ `scripts/browser-security.cjs` และเอกสาร ไม่ deploy ซ้ำ ไม่เพิ่ม dependency/migration/บริการเสียเงิน คง Free tier และ Cron ทุก 15 นาทีเดิม

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 95 tests |
| Browser security local / HTTPS | Passed — 243 / 242 checks ด้วย 4 บัญชี/2 คู่ต่อรอบ; จำนวนต่างหนึ่ง assertion ตามผู้ชนะ race ของ feed รายละเอียดใน `SECURITY.md` |
| PWA regression HTTPS | Passed — 44 checks รวมเงินจริง/หัวใจ commit แล้วคำตอบหาย ปิด/เปิดใหม่ด้วย ID เดิม และออฟไลน์ไม่ replay |
| `npm run lint` / `npm run typecheck` | Passed |
| `npm run db:check:remote` | Passed — schema read-only |
| Wrangler deploy dry-run พร้อม metafile | Passed — ไม่มี vulnerable dev modules ใน Worker bundle |
| `npm audit --omit=dev` | Passed — 0 advisories |
| `npm audit` ทั้งหมด | Failed — High 5 รายการจากสาย dev `braces` เดียวกัน ยังไม่มี patched version; ไม่อยู่ใน production Worker |
| Static scan / HTTPS private paths | Passed — ไม่พบ leak ตามค่า/pattern ที่ตรวจ; private-source paths ทั้ง 7 ได้ 404 |
| Frozen CPU guard รุ่นที่ตรวจ | Passed — 450 samples outcomes `ok`; Worker สูงสุด 3 ms / DO 44 ms, Cron ที่จับได้ Worker 0 ms / DO 5 ms |

ตรวจ anonymous/revoked session ครบ 38 application endpoints และ Origin ของ POST ทั้ง 28 ข้อ รวม IDOR ข้ามคู่, forged actor/ราคา, ผู้รับผิดชอบ/ผู้ออมต่างคู่, signed photo ที่ผูก session, จดหมายอนาคต, backup manifest/job ข้ามคู่ และ stored HTML ที่ต้อง render เป็นข้อความ ทดสอบการแข่งขันไม่เกิน 6 requests ต่อรอบจากทั้งสองสมาชิก: quest award, mixed reward/pet spend, deposit ID ซ้ำ/ต่าง ID, reversal และ cooldown แมว ยอดเงินจบ 1,399 สตางค์ตรง ledger ทั้งสองคนเห็นตรงกัน Mixed spend มี charge เดียว Local เหลือ 0 หัวใจ / HTTPS เหลือ 30 ตามผู้ชนะ ไม่เกิดยอดติดลบ

รายงานพร้อม finding ที่คงค้างและข้อจำกัดอยู่ใน [SECURITY.md](SECURITY.md) ผลไม่ใช่การรับรองความปลอดภัยทุกกรณี ใช้ Virtual Authenticator/contexts บนเครื่อง QA เดียว ไม่ใช่โทรศัพท์หรือเครือข่ายต่างกันจริง รายละเอียด artifact/commands อยู่ในรายงาน ไม่มีการทำ load test หรือเปลี่ยนแพ็กเกจ Billing

ล้าง local cohorts `mvb3u9xw`, `mvb3v5au` รวม 8 บัญชี/4 คู่ (รวมรอบแก้ expectation ของ foreign cancel ซึ่งเป็น no-op); remote cohorts `mvb3wzv4`, `mvb41f9o` รวม 8 บัญชี/4 คู่ ตรวจ creator/member และเงิน/หัวใจ/feed rollup ก่อนลบ Read-back เหลือ 0 ปิด QA browser, preview และ CPU Tail แล้ว

ไฟล์ source ที่เปลี่ยน: `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-security.cjs`, `D:/Tong/แฟน/โปรแกรมคู่รัก/SECURITY.md`, `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`, `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`

## Phase 6.3 — Push Notification สำหรับสองคน

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) เผยแพร่บน `https://our-little-world.supawat-you.workers.dev` รุ่น `3e036937-0a69-4b10-9623-b932b1a3e428` Service Worker cache `olw-static-400b40b51e28ed81afef` ใช้ Workers, D1 และ SQLite Durable Object Free เดิม เพิ่ม Cron ทุก 15 นาที ไม่มี dependency หรือบริการเสียเงินเพิ่ม ไม่เปลี่ยน R2 ของแอปการเงินหรือ Billing

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 95 tests รวม protocol, D1/Auth และ Phase 1–6 |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm run build` | Passed — static export 20 pages, 17 RSC aliases, precache 173 public assets/33 route aliases |
| Migration `0008_push_notifications.sql` local / remote | Passed — deployment schema gate ตรวจตาราง/index/trigger ของ Push |
| `npm run deploy:cloudflare` | Passed — remote schema gate และรุ่นส่งมอบข้างต้น |
| `scripts/browser-push.cjs` local / HTTPS | Passed — 27 checks ต่อ origin; ทดสอบ HTTPS ซ้ำบนรุ่นส่งมอบหลังแก้ session expiry |
| `scripts/browser-pwa.cjs` local | Passed — 44 regression checks |
| `scripts/browser-smoke.cjs` local static preview | Passed — 23 Demo checks |
| Native Web Push บน persistent Edge QA profile | Verified manually — PushManager/permission API จริง, provider รับข้อความ, เห็น push event และ notification จาก Service Worker; ตรวจซ้ำรุ่นส่งมอบได้ `accepted: true`, `received: true` |
| Cron จริงบน Cloudflare | Verified manually — รับ notification นัดหมายวันที่ 16 ต.ค. 21:10 น. ที่ประมาณ 20:45 น. เวลาไทย; Tail รุ่นทดสอบ `b5e83ae7-6708-4cd0-9cd6-8851467ba4e4` บันทึก Cron Worker 0 ms / `dispatchPush` DO 8 ms, outcome `ok` |
| Local scheduled handler | Passed — `/cdn-cgi/local/scheduled?format=json` คืน `outcome: ok` |
| Cron รอบส่งมอบ | Verified manually — Cloudflare schedules API ยืนยัน `*/15 * * * *` หลังคืนจากรอบ QA ชั่วคราวทุก 1 นาที |
| HTTPS `/sw.js` รุ่นส่งมอบ | Verified manually — HTTP 200, JavaScript MIME, `no-cache, no-store, must-revalidate` และ SHA-256 ตรงกับ `out/sw.js` |
| `node scripts/check-cpu.mjs output/cpu-push.json 3e036937-0a69-4b10-9623-b932b1a3e428` | Passed — frozen 242 samples, 132 Worker / 110 DO, outcomes `ok` ทั้งหมด; สูงสุด Worker 4 ms / DO 48 ms อยู่ในงบเดิม 10 ms / 30,000 ms |
| ภาพหน้าจอ | Verified manually — `output/playwright/phase6-push.png`, overflow checks ที่ 375/390/1440 px ผ่าน |
| Local D1 `PRAGMA quick_check` | Passed — `ok` หลังปิด preview และล้างข้อมูล QA |

### พฤติกรรมและความปลอดภัยที่ตรวจแล้ว

- เปิดรับจากการกดของผู้ใช้ที่หน้า Us เท่านั้น ตั้งค่าภารกิจ/นัดหมาย/จดหมายแยกเครื่อง จำกัด 3 เครื่องต่อผู้ใช้ เจ้าของเครื่องเท่านั้นที่ดูหรือปิดได้ สมาชิกอีกคนเปิดรับเองได้ ไม่แสดง endpoint, auth key หรือ private VAPID key ใน API state
- ใช้ WebCrypto ตาม RFC 8291/8292; ถอดข้อความด้วย independent native decryptor และ published vector ได้ ตรวจ VAPID signature/audience, endpoint allowlist และไม่ตาม redirect เพื่อป้องกัน SSRF ไม่มี Push SDK หรือผู้ให้บริการเสียเงินเพิ่ม
- Quest เป็นสรุปงานค้างช่วง 09:00–09:59 น. เวลาไทยหนึ่งครั้งต่อวันต่อเครื่อง; Date Planner เตือนในช่วง 30 นาทีก่อนนัด; Love Letters เตือนเฉพาะผู้รับเมื่อเปิดได้ตามเวลาเซิร์ฟเวอร์ ไม่ส่งชื่อคู่ ชื่อภารกิจ เนื้อหาจดหมาย หรือยอดเงินใน payload
- Cron ผ่าน DO เดิม จำกัดรอบละ 4 เครื่อง/8 ข้อความ Claim receipt แบบ atomic แยกผู้ใช้/เครื่อง/เหตุการณ์ ป้องกัน Cron ซ้อนและเปิด endpoint เดิมใหม่แล้วส่งซ้ำ ผล network ไม่ชัดเจนไม่ retry อัตโนมัติ; 429/5xx เคารพ Retry-After และลองไม่เกิน 3 ครั้งขณะที่เหตุการณ์ยังเข้าเกณฑ์; 404/410 ถอนเครื่อง เก็บ receipt 30 วัน
- ทดสอบการแยกคู่/ผู้ใช้, Origin, session logout/expiry, preferences, cooldown ปุ่มทดสอบ, claims พร้อมกัน, เวลาไทย/เที่ยงคืน/จดหมายถึงกำหนด และยืนยันว่าเงิน/หัวใจไม่เปลี่ยน การแจ้งเตือนไม่เรียก mutation เงินหรือหัวใจและไม่มี offline queue
- Better Auth native D1 เก็บ `auth_sessions.expiresAt` เป็น ISO text แม้ column มี INTEGER affinity จึงแปลงเวลาใน query รองรับทั้ง ISO และ legacy numeric รักษาความละเอียด millisecond และปฏิเสธวันที่ผิดรูปแบบ ตรวจ cleanup เฉพาะ push subscriptions ที่จำกัดจำนวน โดย lookup session ตาม primary key
- Service Worker ต้องตอบ `PUSH_CAPABLE` ก่อนสมัครรับ ป้องกันใช้ worker เก่าที่ไม่มี push handler; คลิก notification เปิดได้เฉพาะ route ที่กำหนด หากมีฟอร์มหรือ mutation จะรอผู้ใช้กดดูโดยไม่ reload ทิ้งงาน ใช้ tag คงที่และ `renotify: false`

### หลักฐานและขอบเขต

27-check UI suite จำลอง permission/PushManager และคำตอบปุ่มทดสอบเพื่อทดสอบ UX อย่างควบคุมได้ ส่วน native QA ใช้ browser profile แยกและบริการ Push จริง ไม่มี mocks ยืนยันการแสดง notification ไม่อาศัยเพียง provider acceptance ผล native probe แรกที่ใช้ async predicate ใน `waitForFunction` ถูกยกเลิกเพราะอาจผ่านจาก Promise ที่เป็น truthy แก้เป็น explicit polling ด้วย `getNotifications()` แล้วตรวจใหม่ รวมทั้ง Cron และรุ่นส่งมอบสำเร็จ

หลักฐานอยู่ใน `output/push-remote-final-result.json`, `output/push-native-receipt-result.json`, `output/push-native-scheduled-result.json`, `output/push-native-final-result.json`, `output/push-final-schedules.json` และ `output/cpu-push.json` ค่า CPU ของ Cron เป็นของรุ่น QA ที่ระบุ ไม่อ้างว่าเป็น sample ของรุ่นส่งมอบ GraphQL Cron events query ถูก rate limit จึงไม่ใช้เป็นหลักฐานการส่ง

ยังไม่ได้ทดสอบ Push บน iPhone/Android เครื่องจริง iPhone ต้องใช้ iOS 16.4 ขึ้นไปและเปิดแอปที่เพิ่มใน Home Screen ก่อนขอสิทธิ์ การถึงเครื่องขึ้นกับเครือข่าย/บริการ Push/การตั้งค่า OS; รอบ Cron 15 นาทีไม่รับประกันเวลาถึงตรงนาที การเปิดรับผูกกับ session และหยุดเมื่อ logout หรือ session หมดอายุ

ระหว่างปิดงาน local preview มี log `SQLITE_IOERR_TRUNCATE` หลังการล้าง QA ขณะ preview ยังเปิดอยู่ ปิด preview แล้วตรวจ local D1 `PRAGMA quick_check` ได้ `ok`; remote/native tests และ production CPU outcomes ผ่านทั้งหมด ไม่ใช้ log นี้เป็นหลักฐานว่าทดสอบ runtime ผ่าน

ล้างบัญชี QA แบบ exact whitelist หลังตรวจ creator/member และ ledger/rollup: local cohorts `mvazr6xn`, `mvazum7r`, `mvb007t3` รวม 12 บัญชี/6 คู่; remote cohorts `mvazwvko`, `mvazynyh`, `mvb0zal4` รวม 10 บัญชี/5 คู่ ตรวจ read-back เหลือ 0 ไม่แตะบัญชีจริงหรือแอปการเงิน ปิด browser sessions `push-live`/`our-world`, local preview port 3018 และ CPU Tail ที่สร้างสำหรับรอบนี้แล้ว ไม่หยุด dev servers เดิม

### ไฟล์ source ที่เปลี่ยนใน Phase 6.3

- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0008_push_notifications.sql`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/entry.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/worker.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare-env.d.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/wrangler.jsonc`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/web-push.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/push-service.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/push-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/pwa.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/globals.css`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/setup-push.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/check-auth-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/service-worker.js`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-push.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-push-native.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/push.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/pwa.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/.env.example`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/README.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`

## Phase 6.2 — PWA ออฟไลน์และอัปเดตโดยไม่บันทึกยอดซ้ำ

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) เผยแพร่บน `https://our-little-world.supawat-you.workers.dev` รุ่น `5a4f3e2e-4d90-4db4-937f-15e66c36bb18` Service Worker cache `olw-static-46ec3925817fe315e102` คง Workers Free, D1 และ SQLite Durable Object เดิม ไม่มี dependency, migration, R2, Cron หรือบริการเสียเงินเพิ่ม ไม่เปลี่ยน Worker/API/SQL ของแอปหรือการตั้งค่า Billing

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 82 tests รวม D1/Auth/Phase 1–6 และ PWA safety 7 ข้อ |
| `npx tsx --test tests/pwa.test.ts` | Passed — 7 ข้อ หลังเพิ่ม integrity/worker policy ล่าสุด |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm run build` | Passed — static export 20 pages, 17 RSC aliases, precache 173 public assets/33 route aliases |
| `npm run deploy:cloudflare` | Passed — remote schema gate เดิมและ deploy รุ่นที่ระบุข้างต้น |
| `scripts/browser-pwa.cjs` local / HTTPS | Passed — 44 checks ต่อ origin, 4 บัญชี/2 คู่ต่อรอบ |
| `scripts/browser-pwa-update.cjs` local persistent Edge | Passed — 6 checks ของ waiting/หลายแท็บ/ฟอร์ม/receipt/reload/offline |
| `scripts/browser-smoke.cjs` local static preview | Passed — 23 Demo checks |
| Chromium `Page.getAppManifest` / `Page.getInstallabilityErrors` | Passed — ไม่มี errors ทั้ง local และ HTTPS ใน persistent Edge profile ปกติ |
| HTTPS `/sw.js` | Verified manually — HTTP 200, JavaScript MIME, nosniff, `no-cache, no-store, must-revalidate`, bytes ตรง build และไม่มี QA fixture |
| ภาพหน้าจอ | Verified manually — `output/playwright/phase6-pwa.png`, overflow checks ที่ 375/390/1440 px ผ่าน |

### พฤติกรรมที่ตรวจแล้ว

- เก็บเฉพาะ public files ที่ static export สร้าง ไฟล์ HTML ใช้ canonical URL, RSC paths ที่มี `$` ถูก encode เพื่อไม่ให้ Cloudflare redirect จน install ล้มเหลว มี SHA-256 integrity ผูกไฟล์กับ build ติดตั้งทีละไม่เกิน 4 คำขอและไม่เปิด cache ที่ติดตั้งไม่ครบ
- Service Worker ไม่ intercept API, Auth, รูป, จดหมาย, POST หรือ URL ภายนอก ไม่มี outbox/Background Sync ไม่ cache ผล login, session หรือข้อมูลคู่ การทดสอบจริงพบเฉพาะ public paths ใน Cache Storage
- ออฟไลน์ยังนำทางผ่าน Next router และเปิด 12 shared routes แบบ cold start ได้ ข้อมูลที่โหลดแล้วอยู่เฉพาะใน memory ของรอบนั้น เปิดใหม่ออฟไลน์ไม่มี snapshot ของบัญชีและไม่สลับเป็น Demo รายการเงินจริง/หัวใจถูกปิดจน refresh สำเร็จหลังออนไลน์
- จำลอง server commit แล้วคำตอบหายสำหรับ redeem, deposit และ purchase ปิดหน้าให้ sessionStorage หายแล้วเปิดใหม่ ตรวจสอบด้วย UUID เดิมได้ ไม่เพิ่มยอดหรือหักหัวใจซ้ำ Deposit คง 1,234 สตางค์และผู้ร่วมออมเดิม Retry ภารกิจพร้อมกัน 6 คำขอจากทั้งคู่ได้รางวัลครั้งเดียว อีกคู่ยังว่างและยอดศูนย์
- รหัสรายการค้างและ restore receipt ย้ายจาก sessionStorage ไป localStorage แยกตามคู่ มี storage events ให้แท็บอื่นเห็นรายการค้างเดิม ถ้าเก็บรหัสไม่ได้จะไม่ส่ง mutation การกลับมาออนไลน์ไม่ส่ง POST อัตโนมัติและยอด D1 ไม่เปลี่ยน
- เวอร์ชันใหม่รอ user action ไม่เรียก skipWaiting ใน install ตรวจหน้าต่างอื่นก่อน activate ไม่ reload ขณะมี mutation/backup/restore และตรวจ form/dialog ก่อนอัปเดต ทดสอบ update ด้วย worker fixture เฉพาะ local แล้วคืน `out/sw.js` เดิมก่อน deploy ตรวจ bytes HTTPS ตรงกับ build จริง
- เก็บ cache รุ่นปัจจุบันและรุ่นก่อนหนึ่งรุ่น Hashed chunks ของหน้าเก่ายังอ่านได้ ลบเฉพาะ cache prefix ของแอป ไม่แตะข้อมูลแอปอื่น
- ใน persistent Edge การจำลอง network offline ไม่ทำให้ `navigator.onLine` เปลี่ยนเสมอ จึงทดสอบ update cold start ด้วย private fetch ที่ถูกตัดจริงและปุ่มบันทึกที่ disabled ด้วย ส่วน 44-check suite ใช้ isolated contexts ซึ่งส่ง online/offline events ได้ตามปกติ

### ขอบเขต

ยังไม่ได้ติดตั้งหรือทดสอบ Face ID/Touch ID/Passkey และ lifecycle บน iPhone/Android เครื่องจริง Browser contexts ของ 44-check suite เป็น incognito จึงยอมรับเฉพาะข้อจำกัด `in-incognito` ของ installability จากนั้นตรวจซ้ำใน persistent profile ปกติแล้วได้ errors ว่าง ไม่มีการรับรองว่าข้อมูลส่วนตัวจะอ่านได้หลังปิดแอปออฟไลน์ หรืองานที่ปิดทุกหน้าต่าง/ล้างข้อมูลไซต์จะเก็บฟอร์มที่ยังไม่ได้ส่ง Cache อาจถูกระบบปฏิบัติการล้างเมื่อพื้นที่ไม่พอ

ไม่ได้รัน CPU Tail ใหม่ เพราะงานนี้เปลี่ยน client/static assets เท่านั้น API/Worker execution path และ Free plan เดิมไม่เปลี่ยน ผล CPU ของ Phase 6.1 ด้านล่างเป็นของรุ่นเดิม ไม่ใช่ measurement ของรุ่น PWA

ล้างบัญชี QA แบบ exact whitelist หลังตรวจ creator/member และ ledger/rollup: local cohorts `mvarfaws`, `mvarh5ur`, `mvari2rw`, `mvarkm57` รวม 16 บัญชี/8 คู่ (รวมรอบแก้ test selector/รอ hydration); remote cohort `mvarrcnc` รวม 4 บัญชี/2 คู่ ตรวจ read-back เหลือ 0 ไม่แตะบัญชีจริงหรือแอปการเงิน ปิด browser profile และ static preview ที่สร้างสำหรับ QA แล้ว

### ไฟล์ source ที่เปลี่ยนใน Phase 6.2

- `D:/Tong/แฟน/โปรแกรมคู่รัก/package.json`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/public/_headers`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/build-pwa.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/service-worker.js`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-pwa.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-pwa-update.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/manifest.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/layout.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/globals.css`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/pwa.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/quests.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/backup-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/client-safety.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/planning-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/pet-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/journal-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/pwa.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/README.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`

## Phase 6.1 — สำรองและกู้คืนข้อมูลคู่จริง

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) รุ่นส่งมอบ `b51cedff-de9d-47f5-9d9f-752f3d8c80ef` ที่ `https://our-little-world.supawat-you.workers.dev/us` ใช้ Worker, SQLite Durable Object และ D1 Free เดิม ไม่เพิ่ม R2 binding หรือบริการเสียเงิน และไม่เปลี่ยน R2 ของแอปการเงิน

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 75 tests รวม migrations จริงบน isolated D1 |
| `npx tsx --test tests/backup.test.ts` | Passed — 12 tests รวม legacy versions, empty restore และการกู้คืนหลายรอบ |
| `npm run typecheck` / `npm run lint` / `npm run build` | Passed — static export 20 pages / 17 RSC aliases |
| `npm run db:migrate:local` / `npm run db:migrate:remote` | Passed — `0007_backup_restore.sql`; remote list ยืนยันไม่มี migration ค้าง |
| `npm run deploy:cloudflare` | Passed — gate ตรวจ Auth/Quest/Planning/Journal/Pet/Backup tables, indexes และ triggers |
| `scripts/browser-phase6.cjs` local / HTTPS | Passed — 64 checks ต่อ origin ใช้ CDP Virtual Authenticator, 4 บัญชี/2 คู่; HTTPS ผ่านสองรอบก่อนเสริม high-water mark |
| `scripts/browser-smoke.cjs` local | Passed — Demo regression 23 checks |
| รุ่นส่งมอบ HTTPS | Passed — สมัคร/จับคู่ QA ด้วย Passkey, สำรอง/กู้คืน 9 parts รวมภาพใหญ่, เงิน/หัวใจ/แมว, retry, empty restore แล้วนำข้อมูลกลับ; เวอร์ชันหลังคืนข้อมูลสูงขึ้นจริง |
| `node scripts/check-cpu.mjs output/cpu-phase6.json b51cedff-de9d-47f5-9d9f-752f3d8c80ef` | Passed — frozen 109 samples: HTTP 57 สูงสุด 6 ms, RPC 52 สูงสุด 72 ms ทุก captured invocation เป็น `ok` |

### ข้อมูลและสิทธิ์

- ไฟล์ `.olw-backup` เข้ารหัส AES-256-GCM แยกส่วน โดย AAD ผูก couple, backup ID และ index; ไม่ส่งรูปหรือเนื้อหาจดหมายเป็น plaintext และไม่เก็บ Passkey, session, คำเชิญ หรือข้อมูล Demo ลงไฟล์
- สมาชิกต้องมี session ใหม่ภายใน 15 นาที API ตรวจ session/membership/origin จาก server; ไฟล์ข้ามคู่ กุญแจของเว็บอื่น ciphertext ที่ถูกแก้ index ผิด และไฟล์ไม่ครบถูกปฏิเสธก่อนเปลี่ยนข้อมูลจริง
- ทดสอบครบทั้ง 13 source tables โดย snapshot เก็บ soft-deleted rows และ ledger เต็ม รวม integer satang ที่ยอดเป้าหมายถึงเพดาน มี reversal แล้วฝากใหม่ การคืน ledger ตามลำดับเดิมทำให้ balance guard และ FK เดิมยังทำงาน
- Revision guard ปฏิเสธข้อมูลปะปนระหว่าง export และการแก้ไขหลัง preview ส่วน commit ลบ/สร้างกลับใน D1 batch transaction เดียว ทดสอบ injected FOREIGN KEY failure หลังลบแล้ว rollback ข้อมูล ยอดเงิน เวอร์ชัน และสถานะ job ทั้งหมด
- Confirm พร้อมกันได้ผลครั้งเดียว และ retry หลังคำตอบหาย/reload ไม่เพิ่มหรือตัดเงิน/หัวใจซ้ำ รูปกลับมาตรงทุก byte ลิงก์รูปยังตรวจสมาชิก จดหมายในอนาคตยังอ่านก่อนเวลาไม่ได้ และอีกคู่ไม่ถูกแก้ไข
- ทดสอบฟอร์มเก่าเมื่อ restore หลายรอบ รวมคืน snapshot ว่างก่อนนำ UUID เดิมกลับและ legacy version สูง ใช้ high-water mark ใน `couple_revisions` เดินหน้าตลอดและ seed จาก max ของ versions ปัจจุบัน/ไฟล์ โดยใช้ scalar subqueries ภายในข้อจำกัด D1
- จำกัดไฟล์ 64 MB, source records 20,000, staging 48 MB และหนึ่ง job ต่อคู่; job อายุ 30 นาที ล้างเมื่อ commit/cancel/เลือกไฟล์ใหม่ หรือเมื่อเริ่ม backup หลังหมดอายุ ไม่เปิด cron หรือบริการเพิ่ม
- ตรวจ viewport หน้า Us 375/390/1440 px และภาพ `output/playwright/phase6-backup.png`; แก้เฉพาะแถวปุ่มใหม่ให้ใช้ flex-wrap utility เดิม

### CPU และการตรวจรุ่น

รอบก่อนแก้พบ HTTP upload สูงสุด 12 ms จึง hoist การอ่าน URL/body limit ออกจาก loop และส่ง chunk เดียวเข้า RPC โดยไม่สร้างสำเนาเพิ่ม จากนั้นทดสอบไฟล์/การกู้คืนจริงใหม่และรัน guard เดิมโดยไม่เพิ่ม budget หรือเปลี่ยนเกณฑ์ ต้องมีอย่างน้อย 24 HTTP และ 24 RPC samples ของรุ่นเดียวกัน

เก็บรอบ fault injection แยกใน `output/cpu-phase6-faults.json` เพราะการ abort คำตอบโดยตั้งใจให้ trace `canceled`; ไม่ใช้รอบนี้อ้างว่า invocation ทุกตัวสำเร็จ ระหว่างกระจายโค้ดพบ HTTP รุ่นใหม่เรียก DO รุ่นเดิมตาม eventual rollout จึง warm ด้วยคำขอ anonymous ใน QA context จนเห็น DO รุ่นส่งมอบ ก่อนตรวจ empty/restore/version ซ้ำ รุ่นส่งมอบใช้ผล frozen `output/cpu-phase6.json` และหยุด Tail หลังตรวจแล้ว เก็บเฉพาะ version/path/context/outcome/CPU ไม่เก็บ headers, cookies, bodies หรือ RPC arguments

ล้างเฉพาะ exact QA cohorts หลังตรวจ creator/สมาชิกและยอด ledger/rollup: local `mvaptkkg`, `mvapv2xp` รวม 8 บัญชี/4 คู่; remote `mvapzfpw`, `mvaq3iay`, `mvaq7phq`, `mvaqi1k2`, `mvaqobh6` รวม 14 บัญชี/7 คู่ รวม backup jobs/staging และ revision rows ตรวจ read-back เหลือ 0 ไม่แตะข้อมูลผู้ใช้หรือแอปการเงิน

### ขอบเขต

ไฟล์ใช้กู้ข้อมูลคู่เดิมที่มีสมาชิกเดิมและ configuration/key ของ server เดิมเท่านั้น ไม่ใช่การกู้บัญชีเมื่อ Passkey หายทั้งหมดหรือกู้ฐานข้อมูล Auth ทั้งก้อน ยังไม่ได้ทดสอบไฟล์เต็มเพดาน 64 MB/20,000 records หรืออุปกรณ์ iOS/Android จริง; PWA, Push, monitoring และงานตรวจรับส่วนอื่นของ Phase 6 ยังแยกเป็นงานถัดไป

## Phase 5 — แมว ไอเทม และ Achievement บน D1

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) และเผยแพร่ที่ `https://our-little-world.supawat-you.workers.dev` รุ่น `9dc14505-04da-4d62-b06c-4fb4c1cf5f32` ใช้ Worker, SQLite Durable Object และ D1 Free เดิม ไม่มี dependency หรือบริการจ่ายเงินเพิ่ม

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 63 tests รวม Phase 1–5 บน ephemeral D1 ที่ใช้ SQL migrations จริง |
| `npx tsx --test tests/pet.test.ts` | Passed — 13 tests รวม direct SQL guard เพิ่มเติม |
| `npm run typecheck` / `npm run lint` / `npm run build` | Passed — static export 20 pages / 17 RSC aliases |
| `npm run db:migrate:local` / `npm run db:migrate:remote` | Passed — `0006_pet_and_achievements.sql` |
| `npm run deploy:cloudflare` | Passed — ตรวจ Auth/Quest/Planning/Journal/Pet schema และ trigger ก่อน deploy |
| `scripts/browser-phase5.cjs` local / HTTPS | Passed — 72 checks ต่อ origin, 4 บัญชี/2 คู่, CDP Virtual Authenticator |
| `scripts/browser-phase2.cjs` local | Passed — Quest/Rewards regression 36 checks |
| `scripts/browser-smoke.cjs` local | Passed — Demo regression 23 checks |
| `node scripts/check-cpu.mjs output/cpu-phase5.json 9dc14505-04da-4d62-b06c-4fb4c1cf5f32` | Passed — 171 samples, ทุก captured invocation เป็น `ok` |

### ความถูกต้องและสิทธิ์

- Feed event, ตัวนับ และตราที่เข้าเกณฑ์ commit/rollback พร้อมกัน ให้ได้หนึ่งมื้อทุก 14,400,000 ms ร่วมกันทั้งคู่ ทดสอบ 8 request IDs พร้อมกันได้หนึ่งมื้อ และ retry UUID เดิมหลังผ่าน cooldown แล้วไม่สร้างมื้อใหม่
- ทดสอบก่อนครบ 4 ชั่วโมง 1 ms, ตรงครบเวลา และการเปลี่ยนวันไทยไม่รีเซ็ต cooldown; ครบมื้อที่ 3 เป็นเลเวล 2 และปลดล็อกตราคนโปรดของโมจิจากข้อมูล server
- ราคา/สถานะไอเทมอ่านจาก catalog ไม่รับราคา, user, couple, counters หรือเวลา client การซื้อบันทึก heart entry พร้อม wallet, inventory และสวมไอเทมใน transaction เดียว หาก inventory ล้มเหลวจะไม่มียอดหักหรือ ledger ค้าง
- ทดสอบซื้อ UUID เดียว 8 คำขอจากทั้งคู่ หักครั้งเดียว; แข่ง 8 UUID สำหรับไอเทมเดียวก็ซื้อครั้งเดียว; ซื้อแข่งกับ redeem ไม่ทำให้ยอดติดลบ และยอด wallet ตรงผลรวม lifetime ledger
- Browser จำลอง feed และ purchase commit แล้วคำตอบหาย ก่อน reload และตรวจสอบ UUID เดิมได้แม้แมวอยู่ใน cooldown/ยอดเหลือศูนย์ ไม่บันทึกหรือหักเพิ่ม
- Inventory ใช้ unique `(couple_id,item_id)` และ FK เข้าสู่ heart entry; pet.wearing อ้าง inventory ของคู่เดียวกัน ใส่/ถอดใช้ค่าที่ระบุชัดและ version; retry ไม่ toggle กลับ การแก้ชื่อใช้ version ที่เก็บตอนเปิดฟอร์ม ทดสอบ stale rename/equip ไม่ทับอีกคน
- Achievement เก็บใน D1 ไม่มี client unlock endpoint: ภารกิจแรก, ภารกิจครบ 10 ครั้ง, feed ครบ 3 มื้อ ไม่มีหัวใจโบนัส Backfill ภารกิจเดิมทดสอบบน schema ก่อน migration จริง ยอด 100 หัวใจ/10 completions และ ledger 10 รายการยังเดิม พร้อมปลดล็อก 2 ตรา
- เพิ่ม `reward_catalog.category` แยก reward/pet โดยไม่สร้าง ledger ใหม่หรือ rebuild ตารางเดิม Item purchase เป็น redemption ใน ledger เดิมและแสดง `category: pet` ใน history กรองออกจาก catalog/คูปองรางวัล ทดสอบ redeem ปกติยังทำงานหลังซื้อของ
- ทุก private query ใช้ couple จาก session ไม่ยอมรับคู่ที่ส่งจาก client ทดสอบอีกคู่ไม่เห็นจำนวนมื้อ ของที่ซื้อ หรือ Achievement และไม่ใช้ยอดหัวใจของคู่แรกได้ Session ถูกถอนแล้วอ่านและซื้อไม่ได้ Origin ผิด/ไม่ได้จับคู่ถูกปฏิเสธ
- Home ใช้ชื่อแมวและของแต่งจริง หน้า Us ใช้ชื่อ สถิติ และ Achievement จริง การล้าง/แก้ Demo Local Storage ไม่เปลี่ยนแมวหรือตราบน D1 การส่งออก Demo ระบุขอบเขตชัดเจน
- ทดสอบ direct SQL ปฏิเสธ feed ใน cooldown, ราคาไอเทมผิด และซื้อของที่มีแล้ว พร้อม negative deployment gate เมื่อขาด `pet_purchase_apply`
- ใช้ snapshot/polling/focus เดิม ไม่มี provider หรือตัวตั้งเวลาซิงก์ใหม่ อ่าน pet/wallet ด้วย rollup และ query ตาม PK แทนรวมประวัติทั้งหมดทุกครั้ง
- ตรวจภาพ `output/playwright/phase5-pet.png` ด้วยสายตา และ overflow หน้าแมว/Us ที่ 375/390/1440 px

### CPU รุ่นส่งมอบ

| Context | Samples | CPU สูงสุด | งบที่ guard ตรวจ |
| --- | ---: | ---: | ---: |
| HTTP Worker | 111 | 1 ms | 10 ms |
| `AccountBackend.handleApi` | 60 | 18 ms | 30,000 ms |

ทุก captured invocation เป็น `ok` ไม่พบ `exceededCpu` เก็บเฉพาะ version/path/context/outcome/CPU ไม่มี cookies, bodies, headers หรือ RPC arguments และหยุด Tail หลังตรวจรับแล้ว

ล้างเฉพาะ QA รอบนี้ด้วย exact cohort whitelist หลังตรวจ creator/สมาชิกและ invariants ของ savings ledger, heart wallet/ledger และ feed rollup: local Phase 5 `mva5leq4`, `mva5mhew` 8 บัญชี/4 คู่, Quest regression `mva5ohiv` 4 บัญชี/2 คู่ และ remote Phase 5 `mva5qz62` 4 บัญชี/2 คู่ ตรวจ read-back users/couples/ตารางลูกเหลือ 0 โดยไม่แตะข้อมูลผู้ใช้

ข้อสังเกตการรัน: Browser รอบแรกหยุดในขั้นสร้าง Demo tamper fixture เพราะ QA account ใหม่ยังไม่มี Local Storage เป็นพฤติกรรมปกติที่แอปไม่เขียน seed จนมีการเปลี่ยนข้อมูล แก้ script ให้เริ่ม Demo ใหม่เฉพาะ QA context ก่อนทดสอบ แล้วผ่านทั้ง local และ HTTPS โดยไม่แก้โค้ดผลิตภัณฑ์เพื่อข้าม check

ขอบเขต: cooldown และตรา 3 มื้อทดสอบด้วย server clock ที่ควบคุมได้ใน automated test ไม่เร่งเวลาใน production; Browser HTTPS ตรวจมื้อแรก/cooldown จริง การจำลอง WebAuthn ใช้ Edge desktop ไม่ใช่ biometric hardware หรือ iOS/Android จริง

ไฟล์ที่เพิ่มหรือแก้ใน Phase 5 (ไม่รวม build output และ QA artifacts):

- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0006_pet_and_achievements.sql`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/worker.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/pet-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/pet-service.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/pet-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-service.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/utils.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/play-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/home.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/explore.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/app-shell.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/quests.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/check-auth-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-phase5.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/pet.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/README.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`

## Phase 4 — Memories, Mood และ Love Letters บน D1

ตรวจรับวันที่ 16 ตุลาคม 2026 (Asia/Bangkok) และเผยแพร่ที่ `https://our-little-world.supawat-you.workers.dev` รุ่น `46c45b7a-c998-4b0e-8c45-3073c392da32` ใช้ Worker, SQLite Durable Object และ D1 เดิม ไม่มี dependency หรือบริการเสียเงินเพิ่ม

| Check | ผลที่รันจริง |
| --- | --- |
| `npm test` | Passed — 50 tests รวม migration จริงบน ephemeral D1 และ Phase 1–4 boundaries |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed — ไม่มี warning |
| `npm run build` | Passed — static export 20 pages / 17 RSC aliases |
| `npm run db:migrate:local` / `npm run db:migrate:remote` | Passed — `0005_journal.sql` |
| `npm run deploy:cloudflare` | Passed — schema gate ตรวจ Auth/Quest/Planning/Journal ก่อนเผยแพร่ |
| `scripts/browser-phase4.cjs` local / HTTPS | Passed — 47 checks ต่อ origin, 4 บัญชี/2 คู่, WebAuthn จริงผ่าน CDP Virtual Authenticator |
| `scripts/browser-phase3.cjs` local | Passed — เงินออม/แผน regression 54 checks |
| `scripts/browser-smoke.cjs` local | Passed — Demo regression 23 checks |
| `node scripts/check-cpu.mjs output/cpu-phase4.json 46c45b7a-c998-4b0e-8c45-3073c392da32` | Passed — 137 samples, ทุก invocation เป็น `ok` |

### ข้อมูลและสิทธิ์

- Memories สร้างจาก session actor และ `couple_id` ที่ server หาเอง ผู้เขียนลบได้ อีกคนดูและเพิ่มของตนเองได้ ต่างคู่ไม่มีสิทธิ์อ่าน metadata/รูปหรือลบด้วย UUID ที่ทราบ
- Browser รับ JPG/PNG/WebP ต้นฉบับไม่เกิน 10 MB และ 32 ล้าน pixels ย่อผ่าน canvas เป็น PNG ไม่เกิน 200,000 bytes พร้อมตัด metadata โดยไม่เก็บต้นฉบับ Server ตรวจ byte signature, CRC, chunk order, ขนาด RGB/RGBA raster, filter bytes, bounded inflate และ compressed/trailing payload ไม่เชื่อ MIME ที่ส่งมา
- รูปเป็น D1 BLOB ไม่อยู่ใน shared JSON snapshot หรือ Demo Local Storage; signed URL อายุ 90 วินาทีผูก user/session/id/expiry ต้องมี session ที่ยังใช้ได้และ membership ถูกต้องทุกครั้ง Header ใช้ `private, no-store`, `nosniff`, CSP sandbox และ no-referrer การลบทำให้ URL ปัจจุบันใช้ไม่ได้ทันที
- ทดสอบ 6 คำขอสร้างความทรงจำพร้อมกันด้วย UUID เดียว ได้หนึ่งรายการ; จำลอง server บันทึกแล้ว Browser ไม่ได้รับคำตอบและ retry จากฟอร์มเดิมได้โดยไม่ซ้ำ การแข่งขันสร้างรายการเกิน 100 ยอมรับเพียงรายการสุดท้ายที่เหลือ
- Mood ใช้ unique `(couple_id,user_id,day)` จากตัวตนจริงและวันไทย Server ไม่รับ `user_id` ปลอม/วันอื่น retry รายการเดิมไม่เพิ่ม version และ competing edits มีผู้ชนะเดียวด้วย version check แสดงประวัติล่าสุด 60 รายการ
- จดหมายเก็บ metadata แยกจาก endpoint body; ทุก snapshot ไม่มี body แม้เปิดอ่านได้แล้ว SQL อ่าน body เฉพาะคู่ที่มีสิทธิ์และ `open_on <= server Thai day` ทดสอบผู้เขียน/คู่ก่อนวันเปิด, outsider หลังเปิด, date-query ปลอม และก่อน/ตรง 00:00 น. ไทยด้วย server clock ที่ควบคุมได้ใน test
- ทดสอบ session ถูกถอนแล้วอ่านจดหมายที่ถึงวันเปิดไม่ได้, ปลอม author/couple ไม่ได้, การเลือก Mood ของอีกคนไม่แก้ข้อมูลของเรา และ API ล้มเหลวไม่สลับไปเขียน Demo แทน
- RPC ส่ง response เป็น ArrayBuffer ที่อ่านเสร็จแล้วเพื่อรักษา bytes รูปและ Set-Cookie โดยไม่ส่ง live stream; เพิ่มเพดาน 300 KB เฉพาะ `/api/journal/save` ที่ public Worker ส่วน auth คง 16 KB และ API เดิมคงข้อจำกัดเดิม
- ภาพตัวอย่าง `output/playwright/phase4-memories.png` ตรวจด้วยสายตา และตรวจ overflow ทั้งสามหน้าใหม่ที่ 375/390/1440 px

### CPU รุ่นส่งมอบ

| Context | Samples | CPU สูงสุด | งบ Free tier |
| --- | ---: | ---: | ---: |
| HTTP Worker | 88 | 3 ms (upload) | 10 ms |
| `AccountBackend.handleApi` | 49 | 57 ms | 30,000 ms |

ไม่พบ `exceededCpu` หรือ invocation ที่ล้มเหลวในการ capture นี้ หลักฐานเก็บเฉพาะ version/path/outcome/CPU/context ไม่มี cookies, headers, body, signed query หรือ RPC arguments และหยุด Tail หลังตรวจรับแล้ว

ล้างเฉพาะ QA รอบนี้ด้วย exact cohort whitelist หลังตรวจ creator/สมาชิกและ ledger: local Phase 4 `mva4s7mr`, `mva4tbrc` 8 บัญชี/4 คู่, local Planning regression `mva4w4j7` 4 บัญชี/2 คู่, remote Phase 4 `mva4xmzo`, `mva50k3b` 6 บัญชี/2 คู่ ตรวจ read-back users/couples/ตารางลูกเหลือ 0 รวมรูป BLOB โดยไม่แตะคู่ของผู้ใช้

ข้อสังเกตการรัน: แก้ cookie prefix ของ test fixture และชื่อปุ่มปิดใน Browser script ให้ตรงของจริงก่อนรันผ่าน ส่วน HTTPS รอบแรก timeout 45 วินาทีขณะรอ hydration หน้า register หลังสร้าง QA ได้ 2 บัญชี ยังไม่มีหลักฐานระบุสาเหตุและไม่ได้แก้โค้ดผลิตภัณฑ์เพื่อข้าม check; รอบถัดไปเปิด 4 บัญชีและผ่าน 47 checks โดยไม่มี script request failures หรือ runtime errors ที่เก็บไว้

ตรวจ `/register` บน HTTPS เพิ่มอีก 6 browser contexts ใหม่โดยไม่สร้างบัญชี: ผ่านทั้งหมด พร้อมใช้งานใน 334–408 ms และไม่มี script request failures จึงยังทำซ้ำ timeout ครั้งแรกไม่ได้

ขอบเขต: รูปเป็นสำเนาที่ผ่านการย่อ สูงสุด 100 ความทรงจำ/100 จดหมายต่อคู่ D1 Free ยังมีขีดจำกัดรวม 500 MB ต่อฐานข้อมูล รูปที่แสดงแล้วไม่สามารถถอนสำเนาที่ผู้รับดาวน์โหลดไปก่อนหน้าได้ การตรวจครั้งนี้ใช้ Edge desktop/virtual authenticator ไม่ใช่ iOS/Android หรือ biometric hardware จริง

ไฟล์ที่เพิ่มหรือแก้ใน Phase 4 (ไม่รวม build output และ QA artifacts):

- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0005_journal.sql`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/entry.mjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/worker.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/journal-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/journal-service.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/journal-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/quest-store.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/utils.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/memory-tools.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/shared.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/explore.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/app-shell.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/page.tsx`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/check-auth-schema.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-phase4.cjs`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/tests/journal.test.ts`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/README.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md`
- `D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md`

## Phase 3 — เงินออมและเครื่องมือวางแผนบน D1

วันที่ 16 ตุลาคม 2026 เผยแพร่รุ่น `4efadf6e-8a6c-44da-a014-ee2509019055` ที่ [เงินออมของเรา](https://our-little-world.supawat-you.workers.dev/savings) ใช้ Worker → SQLite Durable Object → D1 เดิม ไม่เพิ่ม dependency, binding หรือบริการเสียเงิน และไม่เปลี่ยนแผน Cloudflare

| การตรวจ | ผล |
| --- | --- |
| `npm test` | Passed — 39 tests รวม Auth/Phase 2 เดิม และการตรวจ integer satang, atomic cap/rollback, duplicate/concurrent deposits, reversals, permission, sorting และ pagination |
| `npm run typecheck` / `npm run lint` | Passed — ไม่มี error/warning ในรอบส่งมอบ |
| `npm run build` | Passed — 20 static pages และ 17 RSC aliases |
| Migration 0004 local/remote | Passed — 17 statements; migrations list ทั้งสองที่ไม่มีรายการค้าง |
| `npm run deploy:cloudflare` | Passed — deployment gate ตรวจ Auth + Quest + Planning รวม savings balance trigger ก่อนเผยแพร่ |
| `scripts/browser-phase3.cjs` local | Passed — 54 checks ด้วย 4 บัญชี/2 คู่ใน workerd |
| `scripts/browser-phase3.cjs` HTTPS | Passed — 54 checks ด้วย 4 บัญชี/2 คู่บน Cloudflare จริง |
| `scripts/browser-phase2.cjs` local | Passed — Quest/Rewards regression 36 checks บนโค้ด Phase 3 |
| `scripts/browser-smoke.cjs` local | Passed — Demo regression 23 checks รวมข้อมูลเดิม เงินออม ปฏิทิน Mood แมว และ export/reset |
| CPU budget guard | Passed — 149 captured samples: HTTP 107 + RPC 42, outcome ok ทั้งหมด ไม่พบ exceededCpu |
| ตรวจ ledger ก่อนล้าง QA | Passed — ยอดรวม savings_entries ตรงกับ savings_balances สำหรับทุกเป้าหมายในคู่ QA ทั้ง local/remote |

### เงินและสิทธิ์

เก็บเงินเป็นจำนวนสตางค์เต็มใน D1 และรับ API เป็น integer ไม่รับ strings, ค่าติดลบ, เศษสตางค์ หรือค่าที่เกินขอบเขต เงินออมและเป้าหมายต้องมากกว่า 0 ส่วนงบเดตอนุญาต 0 เป้าหมายและยอดรวมต่อเป้าหมายสูงสุด 100 ล้านบาท รายการออมและงบเดตสูงสุด 10 ล้านบาทตามข้อจำกัดแอป ไม่ใช่ระบบรับ/โอนเงินจริง

ทดสอบฝาก ID เดียวพร้อมกัน 12 คำขอจากสองสมาชิก เพิ่มยอดครั้งเดียว; คำขอต่าง ID รวมกันได้ตรงสตางค์ ทดสอบแย่งเติมยอดสุดท้ายก่อนถึง cap ด้วยสองผู้ออม สำเร็จครั้งเดียวและไม่เกิน cap ผู้บันทึกมาจาก session ส่วนผู้ออมเลือกได้เฉพาะสมาชิกในคู่ เก็บทั้งสอง ID แยกกัน

หักล้างเงินด้วยรายการใหม่เต็มยอด อ้างอิง deposit เดิมและบังคับเหตุผล D1 unique index ป้องกันหักล้างต้นฉบับเดียวกันซ้ำ แม้ใช้ request ID ต่างกันพร้อมกัน ทดสอบหักล้าง reversal, ข้ามคู่, ID ชนกับ payload อื่น และแก้ ledger โดยตรงถูกปฏิเสธ เมื่อจำลอง balance trigger ล้มเหลว แถว ledger rollback ด้วย ไม่เกิดยอดสำเร็จเพียงครึ่งเดียว

บน HTTPS ยิง 8 duplicate deposits และ 8 competing reversal IDs จากสอง browser sessions ผ่านครบ จำลอง server บันทึก 1.01 บาทสำเร็จแล้วทิ้งคำตอบ: หลัง reload ยังเก็บยอด ผู้ออม หมายเหตุ และ ID เดิม กดตรวจรายการเดิมแล้วประวัติมีครั้งเดียว ไม่ได้เครดิตเพิ่ม เมื่อเพิ่มรายการ 100.10 + 0.01 + 0.02 บาท ยอดตรง 101.14 บาท; หักล้าง 100.10 และ 1.01 บาท เหลือ 0.03 บาท แยกผู้ออมเป็น 0.01 และ 0.02 บาท

### แผนและหน้าจอ

ทดสอบสร้างหลายเป้าหมาย/แผนด้วย UI ได้ ID ต่างกัน, แผนเดตเรียงวัน/เวลาและเก็บงบ 0.10 / 100.01 บาทตรงสตางค์, ปฏิทินอีกบัญชีเห็นเดตจาก D1, เพิ่ม/ลบกิจกรรมไม่กระทบเดต และ Wishlist ใช้สถานะ done ชัดเจนพร้อม version การแก้ชื่อยังคงสถานะสำเร็จ

เปิดฟอร์มเป้าหมายค้างไว้ ให้คู่แก้ข้อมูล แล้ว focus sync ข้อมูลใหม่เข้า Browser แรก: ฟอร์มเดิมยังถือ version ตอนเปิดและถูกปฏิเสธเมื่อบันทึก จึงไม่เขียนทับอีกคน เปิดฟอร์มใหม่แล้วบันทึกได้โดยยอดออมไม่เปลี่ยน ทดสอบ forged goal/entry/member/plan IDs ข้ามคู่, session revoke และการแก้เงิน Demo ใน localStorage ไม่เปลี่ยนยอด D1

Home และการ์ดเตือนใช้เงินออม/เดตจริง วันครบรอบใช้วันของคู่จาก D1 และตรวจ 29 ก.พ. ในปีปกติ/ปีอธิกสุรทิน หน้าบันทึกเงินออมของบัญชีไม่สลับไปเขียน Demo เมื่อเครือข่ายขาด ภาพ `output/playwright/phase3-savings.png` และการตรวจ 4 routes × 375/390/1440px ไม่มี horizontal overflow

ใช้ polling loop เดิมของบัญชี ไม่เพิ่ม session requests อีกชุด โหลด planning snapshot ร่วมกับ Quest เฉพาะหน้าที่ใช้ข้อมูลจริง อ่านยอดจาก rollup ไม่ sum ประวัติทั้งชีวิต และประวัติใช้ keyset ครั้งละ 30 รายการ เป้าหมาย/เดต/Wishlist/กิจกรรมจำกัดประเภทละ 200 รายการตามข้อจำกัดแอป Free tier ยังมีโควตาตาม [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

### CPU รุ่นส่งมอบ

| เส้นทาง | Samples | เฉลี่ย (ms) | สูงสุด (ms) | Budget (ms) |
| --- | ---: | ---: | ---: | ---: |
| HTTP shared Quest/Planning snapshot | 31 | 0.23 | 1 | 10 |
| HTTP Planning state | 19 | 0.16 | 1 | 10 |
| HTTP Deposit | 16 | 0.38 | 1 | 10 |
| HTTP Reversal | 10 | 0.50 | 1 | 10 |
| HTTP Save planning record | 6 | 1.00 | 1 | 10 |
| Durable Object RPC รวม API | 42 | 4.12 | 20 | 30,000 |

ตรวจไฟล์ metrics ที่หยุด capture แล้วด้วย `node scripts/check-cpu.mjs output/cpu-phase3.json 4efadf6e-8a6c-44da-a014-ee2509019055` ผ่าน minimum samples ทั้ง HTTP/RPC และตรวจ budget แยกกัน ไม่รวม CPU backend เป็น CPU Worker ไม่มี headers, cookies, body หรือ RPC arguments ใน capture และหยุด Tail หลังจบงาน

ล้างเฉพาะ QA ของรอบนี้ด้วย exact cohort/ID whitelist หลังตรวจสมาชิกและยอด ledger: local Phase 3 `mva3px5i`, `mva3qvzn` 8 บัญชี/4 คู่ และ Quest regression `mva3t2xp` 4 บัญชี/2 คู่; remote Phase 3 `mva42jdl` 4 บัญชี/2 คู่ ตรวจ read-back เหลือ 0 ไม่ลบตาม prefix กว้าง ๆ

ระหว่างตรวจพบและแก้ข้อความ validation ยอดออมติดลบที่เปลี่ยนจากเดิม และปรับ Demo suite ให้รอโหลดข้อมูลก่อนตรวจปฏิทิน รอบ stale-form แรกใช้ role locator ที่ซ่อนอยู่หลัง modal จึง timeout; เปลี่ยนการตรวจ locator ให้รวม element ที่ถูก aria-hidden โดยยังทดสอบ HTTP conflict/ยอดจริงครบ การ apply remote ครั้งแรกได้ Cloudflare 7403; ตรวจบัญชีและสิทธิ์ D1 เดิม แล้วอ่าน metadata และ retry migration สำเร็จ โดยไม่ได้เพิ่มสิทธิ์หรือเปลี่ยนบัญชี

ขอบเขตที่คงไว้: Mood ความทรงจำ จดหมาย แมว วงล้อและ Us ยังเป็น Demo; export ที่ Us สำรองเฉพาะ Demo ยังไม่รวมบัญชี D1; การซิงก์เป็น polling และ WebAuthn ใช้ Virtual Authenticator ใน QA

ไฟล์ที่เปลี่ยนใน Phase 3 (ไม่รวม build output และ QA artifacts):

- `cloudflare/migrations/0004_savings_and_planning.sql`
- `cloudflare/worker.ts`
- `src/lib/planning-schema.ts`
- `src/lib/planning-service.ts`
- `src/lib/planning-store.tsx`
- `src/lib/quest-schema.ts`
- `src/lib/quest-store.tsx`
- `src/lib/utils.ts`
- `src/components/savings.tsx`
- `src/components/planning-tools.tsx`
- `src/components/quests.tsx`
- `src/components/home.tsx`
- `src/components/app-shell.tsx`
- `src/components/explore.tsx`
- `src/app/account/page.tsx`
- `scripts/check-auth-schema.ts`
- `scripts/browser-phase3.cjs`
- `scripts/browser-phase2.cjs`
- `scripts/browser-smoke.cjs`
- `tests/cloudflare.test.ts`
- `README.md`
- `TASKS.md`
- `QA.md`

## Phase 2 — Quest / Rewards / หัวใจบน D1

วันที่ 16 ตุลาคม 2026 เผยแพร่รุ่น `51591443-148c-4466-9881-e1ad50011e71` ที่ [ภารกิจของเรา](https://our-little-world.supawat-you.workers.dev/quests) โดยใช้ Worker → SQLite Durable Object → D1 เดิมบน Free tier ไม่เพิ่ม dependency หรือบริการแบบเสียเงิน

| การตรวจ | ผล |
| --- | --- |
| `npm test` | Passed — 30 tests รวม D1 migrations จริง, session/tenant isolation, server clock และ wallet rollback |
| `npm run typecheck` / `npm run lint` | Passed — ไม่มี error/warning ในรอบส่งมอบ |
| `npm run build` | Passed — 20 static pages และ 17 RSC aliases |
| `npm run db:migrate:local` / `npm run db:migrate:remote` | Passed — 0003 เพิ่ม quests, reward_catalog, heart_entries, heart_wallets พร้อม indexes/triggers; migrations list ทั้งสองที่ไม่มีรายการค้าง |
| `npm run deploy:cloudflare` | Passed — ตรวจ Auth + Quest schema รวม wallet trigger ก่อนเผยแพร่ |
| `scripts/browser-phase2.cjs` local | Passed — 36 checks ด้วย 4 บัญชี/2 คู่จริงใน workerd |
| `scripts/browser-phase2.cjs` HTTPS | Passed — 36 checks ด้วย 4 บัญชี/2 คู่บน Cloudflare จริง |
| `scripts/browser-smoke.cjs` | Passed — Demo regression 23 checks รวม Quest, Rewards, async Editor และกระเป๋า Demo ของแมว |
| `scripts/check-cpu.mjs output/cpu-phase2.json 51591443-148c-4466-9881-e1ad50011e71` | Passed — HTTP 82 + RPC 30 samples, outcome ok ทั้งหมด ไม่พบ exceededCpu |

การทดสอบ D1 ยิง completion พร้อมกัน 12 คำขอด้วย ID ต่างกันจากสมาชิกสองคน ได้หัวใจเพียงครั้งเดียวต่อรอบ ยิง redemption พร้อมกัน 12 คำขอด้วย ID เดียวหักครั้งเดียว แม้ retry หลังยอดเหลือ 0; ยิงการแลกด้วย ID ต่างกันเมื่อพอแลกได้ครั้งเดียว สำเร็จครั้งเดียว ที่เหลือปฏิเสธและไม่ทิ้งแถวธุรกรรม ไม่ใช้ mock SQL

ทดสอบเวลาไทยก่อน/หลังเที่ยงคืนวันจันทร์, ภารกิจครั้งเดียว, ผู้รับผิดชอบ, วันในอนาคต, stale version, เปลี่ยนชนิดรอบหลังรับหัวใจ, การลบภารกิจ, ราคา catalog ที่เปลี่ยน, key ชนกับรายการอื่น, ปลอม actor/couple/cost และ history pagination ที่มี timestamp เท่ากัน การจำลอง wallet trigger ล้มเหลวทำให้แถว ledger rollback ด้วย และยอดสรุปตรงกับผลรวม ledger

Browser ทดสอบ 8 concurrent claims และ 8 competing spends บนสอง session, แยกข้อมูลสองคู่, สร้างหลายรายการด้วย UI, ลบโดยสมาชิกอีกคน, ปลอม localStorage ไม่เปลี่ยนยอดจริง, network error/session revoke ไม่สลับไปเขียน Demo และ layout 375/390/1440px ไม่ล้นแนวนอน ทดสอบกรณี server แลกสำเร็จแต่ทิ้งคำตอบที่ Browser: หลัง reload ยังตรวจรายการเดิมได้แม้ยอด 0 และได้คูปองเพียงใบเดียว

| CPU ที่วัดจาก Tail | Samples | เฉลี่ย (ms) | สูงสุด (ms) | Budget (ms) |
| --- | ---: | ---: | ---: | ---: |
| HTTP Quest state | 29 | 0.21 | 1 | 10 |
| HTTP Quest save | 4 | 0.25 | 1 | 10 |
| HTTP Quest complete | 12 | 0.83 | 2 | 10 |
| HTTP Quest redeem | 11 | 0.82 | 2 | 10 |
| Durable Object RPC รวม API | 30 | 5.47 | 22 | 30,000 |

Worker ทุก route สูงสุด 2 ms ส่วน backend สูงสุด 22 ms; CPU guard ตรวจแต่ละ execution context แยกกัน ไม่ได้อ้างว่า Auth ทั้งหมดอยู่ใน CPU เท่าตัว Worker ข้อมูล capture มีเฉพาะ metrics ไม่เก็บ headers/cookies/body/RPC arguments และหยุด Tail หลังทดสอบแล้ว

การอ่านยอดใช้ wallet rollup ที่อัปเดต atomically กับ ledger ไม่ sum ประวัติทั้งชีวิตทุก poll ภารกิจจำกัด 200 รายการที่ยังไม่ลบ และ history ใช้ keyset ครั้งละ 30 รายการ (อ่านเพิ่ม 1 เพื่อบอกหน้าถัดไป) ซิงก์ทุก 30 วินาทีเฉพาะเมื่อหน้าแอปมองเห็นและเมื่อกลับมาโฟกัส โดยยังมีโควตา Free tier ตาม [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)

ล้างเฉพาะ cohort ที่สร้างรอบนี้และตรวจสมาชิกก่อนลบ: local 12 บัญชี/6 คู่ (`mva0u7cf`, `mva0uoru`, `mva0vacg`), remote 4 บัญชี/2 คู่ (`mva13rcd`) โดยใช้รายชื่อ exact whitelist และตรวจ read-back เหลือ 0 ไม่ลบตาม prefix กว้าง ๆ รอบ HTTPS แรก timeout ก่อน hydration และก่อนสร้างบัญชี; ตรวจหน้าและรันทดสอบใหม่ผ่านครบ 36 checks โดยไม่ได้ลด validation ของแอป

ข้อจำกัดของขอบเขต: เงินออม Mood แมวและเครื่องมืออื่นยังเป็น Demo; การซิงก์เป็น polling ไม่ใช่ WebSocket, ทดสอบ WebAuthn ผ่าน Virtual Authenticator ไม่ใช่ฮาร์ดแวร์จริง และยังไม่มี email recovery ตาม Phase 1

ไฟล์ที่เปลี่ยนใน Phase 2 (ไม่รวม build output และ QA artifacts):

- `cloudflare/migrations/0003_quests_and_hearts.sql`
- `cloudflare/worker.ts`
- `src/lib/quest-schema.ts`
- `src/lib/quest-service.ts`
- `src/lib/quest-store.tsx`
- `src/components/app-frame.tsx`
- `src/components/app-shell.tsx`
- `src/components/auth-layout.tsx`
- `src/components/home.tsx`
- `src/components/quests.tsx`
- `src/components/shared.tsx`
- `src/components/play-tools.tsx`
- `src/app/account/page.tsx`
- `scripts/check-auth-schema.ts`
- `scripts/browser-phase2.cjs`
- `tests/cloudflare.test.ts`
- `README.md`
- `TASKS.md`
- `QA.md`

## Phase 1 — ปิดงาน CPU และตรวจรับรุ่นส่งมอบ

วันที่ 15 ตุลาคม 2026 รุ่น `6d8bd68c-42c8-4e64-ae25-fd1697362da2` บน [Cloudflare จริง](https://our-little-world.supawat-you.workers.dev/register) ส่ง API ผ่าน RPC ไปยัง SQLite Durable Object `AccountBackend` แยกตาม IP จาก edge โดยคง Better Auth, D1 schema, session, RP ID, Origin และ authorization เดิม ไม่มีการเปิด paid plan หรือเพิ่ม dependency ในรุ่นส่งมอบ

Worker รับ HTTP มี CPU budget 10 ms ส่วน SQLite Durable Object บน Free plan มี budget 30 วินาทีต่อคำขอ การแก้ครั้งนี้ย้ายงาน Auth ไปยัง runtime ที่รองรับงานนั้น ไม่ได้อ้างว่า CPU ของการตรวจ Auth ทั้งหมดลดเหลือเท่าตัว Worker ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/))

| การตรวจ | ผลรุ่นส่งมอบ |
| --- | --- |
| `npm test` | Passed — 20 tests รวม domain เดิม, D1 migrations, permissions, concurrency และ schema preflight positive/negative |
| `npm run typecheck` / `npm run lint` | Passed — ไม่มี error/warning |
| `npm audit --omit=dev` | Passed — 0 vulnerabilities |
| `npm run build:cloudflare` | Passed — 20 static pages และ RSC segment aliases 17 ไฟล์ |
| `npm run deploy:cloudflare` | Passed — ตรวจ schema จริงก่อน deploy และ apply class migration แบบ `new_sqlite_classes` |
| D1 migrations list local/remote | Passed — ไม่มี migrations ค้าง ทั้ง 0001 และ 0002 ยังใช้ schema เดิม |
| `scripts/browser-phase1.cjs` บน HTTPS | Passed — 28 checks รวม 4 บัญชี/2 คู่, forged IDs, signature/UV/replay, backup Passkey และ revoke ระหว่าง enrollment |
| `scripts/browser-phase1.cjs` ในเครื่อง | Passed — 28 checks ผ่าน Worker → Durable Object → D1 จริงใน workerd ที่ `http://localhost:3017` |
| `scripts/browser-cpu.cjs` | Passed — สมัครจริงเพิ่มอีก 6 บัญชี ด้วยเบราว์เซอร์/Virtual Authenticator แยกกัน |
| CPU budget guard | Passed — 295 trace samples: HTTP 182, RPC 112 และ event อื่น CPU 0 ms จำนวน 1; outcome `ok` ทั้งหมด; ไม่พบ `exceededCpu` |
| Concurrent API reads | Passed — 48 คำขอ แบ่งครั้งละ 4 และ 48 คำขอต่อเนื่อง; ไม่มี session ได้ 401 ทุกคำขอ |

### CPU รุ่นส่งมอบ

ค่าจาก Wrangler Tail มีความละเอียดระดับ ms เก็บเฉพาะ version, route, outcome และ CPU ไม่บันทึก headers, cookies, body หรือ RPC arguments

| เส้นทาง | Samples | เฉลี่ย (ms) | สูงสุด (ms) | Budget (ms) |
| --- | ---: | ---: | ---: | ---: |
| HTTP generate-register-options | 14 | 0.79 | 2 | 10 |
| HTTP verify-registration | 14 | 0.93 | 2 | 10 |
| HTTP verify-authentication | 6 | 0.33 | 1 | 10 |
| HTTP account/context | 130 | 0.72 | 2 | 10 |
| Durable Object RPC รวม API | 112 | 3.71 | 33 | 30,000 |

รอบ concurrent reads พบ backend สูงสุด 33 ms ซึ่งยังต่ำกว่างบ 30,000 ms มาก ส่วน Worker สูงสุด 2 ms เท่าเดิม รอบตรวจซ้ำด้วย capture ที่ตรวจ execution context และ JSON อย่างเข้มงวดผ่าน CPU guard อีกครั้ง 64 samples: HTTP 32 + RPC 32, outcome ok ทั้งหมด (`output/cpu-release.json`)

ก่อนแก้ เส้นทางสมัครเดิมอยู่บน Worker ที่มี budget 10 ms: 6 บัญชีในเงื่อนไขเดียวกันได้ generate-options เฉลี่ย 45.8/max 76 ms และ verify-registration เฉลี่ย 27.2/max 36 ms ข้อมูล raw เฉพาะ metrics อยู่ `output/cpu-baseline.json` และ `output/cpu-durable.json` ซึ่งถูก ignore

### แนวทางที่ทดลองแล้วไม่ใช้เป็นรุ่นส่งมอบ

- ลด metadata introspection และ eager initialization: ยังพบคำขอ 40–85 ms; คง schema preflight เป็น deployment gate แต่คืน runtime schema validation เดิม
- ปิด color formatting, JIT ทดลอง, ตัด Buffer และ minify: ไม่ลด CPU ทุกคำขอให้อยู่ในงบ 10 ms จึงคืนเส้นทาง Auth เดิม
- ทดลอง Auth ด้วย SQL โดยตรง รวม signed challenge cookie และลดจำนวน D1 round trips: บางคำขอยังอยู่ราว 13–35 ms จึงถอดออกทั้งหมดเพื่อคงไลบรารีและการตรวจ security เดิม
- CPU guard รอบ reads แรกไม่ผ่านเพราะ RPC samples ยังไม่ครบ 24 และมี event ที่ไม่ระบุ method; เพิ่ม execution-context metadata แยก Worker/Durable Object และเก็บใหม่แบบต่อเนื่องจนผ่าน หาก event เก่าไม่มี execution context จะใช้งบ 10 ms ที่เข้มกว่าและไม่นับเข้า minimum samples โดยไม่ข้าม invocation failure
- ส่ง live Response stream กลับผ่าน RPC ทำให้ trace เป็น `canceled`; รุ่นส่งมอบส่ง bytes/JSON ที่จำกัดขนาด และคง Set-Cookie ทุกค่าแทน ทดสอบใหม่ผ่านครบ ไม่มี canceled ในรอบส่งมอบ
- การทดสอบสมัครซ้ำเคยคาด HTTP 401 ผิด: สถานะที่ถูกต้องของ SDK คือ 400 `CHALLENGE_NOT_FOUND`; คำขอคู่เดียวกันได้ 200 เพียง 1 คำขอ ไม่ได้ยืนยันว่าระบบเดิมยอมรับซ้ำ

ล้างบัญชี QA ของรอบนี้ด้วยชื่อ cohort และ ID ที่ระบุไว้เท่านั้น: Cloudflare 105 บัญชี/6 คู่ และ local 16 บัญชี/2 คู่ ตรวจสมาชิกก่อนลบ และ read-back เหลือ 0 บัญชีของชุดทดสอบดังกล่าว ไม่ลบข้อมูลผู้ใช้ตาม prefix กว้าง ๆ

### วัดซ้ำ

เปิด Tail ก่อนเริ่ม browser suite และใช้ไฟล์ output ใหม่ในแต่ละรอบ:

```powershell
node scripts/capture-cpu.mjs output/cpu-new.json
# อีก terminal: เปิด Playwright CLI ที่ origin ของรุ่นที่จะตรวจ แล้วรัน
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase1.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-cpu.cjs
node scripts/check-cpu.mjs output/cpu-new.json <deployed-version-id>
```

Guard ต้องมีอย่างน้อย HTTP 24 และ RPC 24 samples, ไม่มี invocation failure และตรวจ budget ทั้งสองฝั่ง แค่ Worker ต่ำกว่า 10 ms โดยไม่วัด backend จะยังไม่ผ่าน ต้องล้างเฉพาะบัญชี QA ที่ browser suite คืนให้หลังทดสอบ

ข้อจำกัด ณ รอบ Phase 1: ทดสอบผ่าน CDP Virtual Authenticator ไม่ใช่ Windows Hello/Face ID จริง; ไม่มี email recovery; Free tier มีโควตารายวัน ส่วน Quest/Rewards เชื่อม D1 แล้วใน Phase 2 ตามผลตรวจรับด้านบน

## บันทึกก่อนแก้ CPU — เก็บไว้เทียบผล

## Phase 1 — Cloudflare และ Passkey

วันที่ 15 ตุลาคม 2026 เปลี่ยนเป็น Cloudflare Workers + D1 ตามคำขอ และเปลี่ยนจากรหัสผ่านเป็น Passkey โดยใช้ฐานข้อมูลใหม่ชื่อ `our-little-world` ไม่แตะฐานข้อมูลของแอปอื่น

| รายการ | ผล |
| --- | --- |
| `npm test` | Passed — 18 tests รวม 6 domain tests เดิม และ D1/auth suite พร้อม 11 subtests |
| Migration บน workerd D1 | Passed — apply SQL จริงทั้ง 0001 และ 0002 ในฐานข้อมูลใหม่ทุกครั้ง ไม่ mock SQL |
| Migration local/remote | Passed — 0001 เดิมและ 0002_passkeys ใช้บนทั้งสองฐานข้อมูลแล้ว; migrations list ไม่พบรายการค้าง |
| `npm run typecheck` | Passed — strict TypeScript |
| `npm run lint` | Passed — source checks ไม่มี error/warning |
| `npm audit --omit=dev` | Passed — 0 vulnerabilities |
| `npm run build:cloudflare` | Passed — Static export ครบทุก route และ RSC segment aliases 17 ไฟล์; รอบแรกติด EBUSY จาก Preview ที่เปิดโฟลเดอร์ out ปิด Preview แล้วรันผ่าน |
| `npm run deploy:cloudflare` | Passed — Worker + Assets + D1 บน HTTPS ไม่เปิด paid plan |
| `scripts/browser-phase1.cjs` | Passed — 27 checks บน Cloudflare จริง ใช้ CDP Virtual Authenticator ทำ WebAuthn; บัญชี 4 บัญชีแยกเป็น 2 คู่ |
| Local Passkey browser | Passed — 26 checks ก่อนเพิ่มกรณี revoke ระหว่าง enrollment; localhost ใช้ได้ ส่วนหน้าบัญชีผ่าน 127.0.0.1 ส่งไป localhost |
| `scripts/browser-smoke.cjs` | Passed — 23 checks ของ Demo เดิมบนเว็บไซต์ Static ก่อนเปลี่ยนหน้า Auth; งาน Passkey ไม่แก้ business rules ของ Demo |
| Static RSC prefetch | Passed — URLs ที่เคย 404 ตอบ 200 และ Link ไป Quest/Savings/Us 3 ครั้งไม่มี RSC failure ในรอบ Static ก่อนหน้า |

เว็บไซต์: [สมัครสมาชิก](https://our-little-world.supawat-you.workers.dev/register)

### Security coverage

- สร้างบัญชีหลังตรวจ WebAuthn proof สำเร็จเท่านั้น; ชื่อผู้ใช้ที่กรอกก่อนพิสูจน์ไม่ได้จองบัญชี และไม่เชื่อ user ID ที่แนบมาจาก client
- ตรวจ challenge แบบใช้ครั้งเดียว อายุ 5 นาที, RP ID, origin, signature และ counter ด้วย Better Auth/SimpleWebAuthn
- บังคับ user verification ฝั่ง server ทั้งสมัครและล็อกอิน; Browser test ปรับ client ให้ยอม UP-only แล้วยืนยันว่า server ตอบ 401 จริง
- ลายเซ็นที่แก้ไข, assertion replay, cookie ปลอม และ session ที่ logout แล้วใช้ไม่ได้
- เพิ่ม Passkey สำรองได้เมื่อเพิ่งเข้าสู่ระบบภายใน 15 นาที; revoke session ระหว่าง options และ verify ทำให้เพิ่ม credential ไม่สำเร็จ; ล็อกอินด้วยเครื่องสำรองโดยเอากุญแจหลักออกแล้วผ่าน
- D1 เก็บเฉพาะ public key; ไม่รับ private key, PIN หรือข้อมูลชีวมิติ และตรวจจริงว่าไม่มี password hash สำหรับบัญชีทดสอบ
- Cookie เป็น HttpOnly/SameSite=Lax และ Secure บน HTTPS; session ไม่เก็บใน localStorage
- HTTP Auth allowlist, Origin/Fetch Metadata checks และ payload caps อยู่ใน auth-handler; ส่งต่อเฉพาะ endpoint ที่อนุญาตไปยัง public server API ของ Better Auth ซึ่งยังรัน validation/hooks/cookies
- Rate limit แบบ atomic D1 จำกัด Passkey 30 คำขอ/60 วินาทีต่อ IP/endpoint และ auth อื่น 60 คำขอ; ทดสอบแข่งกัน 4 คำขอตอนเหลือสิทธิ์ 1 ครั้ง ผ่านเพียง 1 คำขอ อีก 3 ได้ 429 พร้อม Retry-After และเปิดได้หลังหมดช่วงเวลา
- Password signup/login, update-user และ delete-passkey ที่ไม่ได้เปิดใช้งานตอบ 404; POST ที่ Origin ไม่ตรง รวม null/ไม่ส่ง Origin ถูกปฏิเสธ
- อ่านข้อมูลได้เฉพาะสมาชิกคู่ตนเอง; ปลอม user_id, couple_id หรือ invitation ID ไม่ให้สิทธิ์ของคู่คนอื่น
- คำเชิญเก็บเฉพาะ hash; expiry, rotate, revoke, single use และ retry ผู้รับเดิมทำงานจริง
- SQL trigger ป้องกันคนที่สาม/ย้าย membership; รับคำเชิญพร้อมกันสองบัญชีสำเร็จเพียงคนเดียว
- D1 ไม่มี PostgreSQL RLS; การตรวจนี้เป็น server authorization และ D1 constraints

### ข้อจำกัด Free tier และอุปกรณ์

เอางาน hash รหัสผ่าน 100–200 ms ออกแล้ว และลดการสร้าง HTTP router ซ้ำโดยเรียก server API ของ Better Auth ผ่าน HTTP boundary ที่ตรวจสิทธิ์ครบ; schema validation ถูกสร้างครั้งเดียวต่อ isolate ส่วน session และ permissions ยังอ่านจาก D1 ต่อคำขอ

การวัดคำขอ options ซ้ำ 10 ครั้งบน Worker จริงพบ 7 ครั้งใช้ CPU 4–8 ms อีก 3 ครั้งเป็น 71, 43 และ 39 ms; log ชั่วคราวยืนยันการสร้าง auth configuration เพียงครั้งเดียวและถูกนำออกจากรุ่นส่งมอบแล้ว การทดสอบ Browser ก่อนหน้าพบ CPU บางคำขอสูงกว่า 10 ms เช่นกัน แม้ทุก invocation มี outcome ok ดังนั้น **ยังรับรองไม่ได้ว่าทุกคำขออยู่ในเพดาน Free tier หรือไม่มี 1102 เมื่อใช้ต่อเนื่อง** ตาม [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/) มีพื้นที่เผื่อการเกินเป็นบางครั้ง แต่คำขอที่เกินอย่างต่อเนื่องอาจถูกตัดได้

รุ่นส่งมอบ `282a6dfc-b709-4943-b172-ea89e6d0971f` ผ่าน Browser 27 checks; tail เก็บได้ 71 invocations มี outcome `ok` ทั้งหมด ไม่มี `exceededCpu` ในตัวอย่างนี้ ข้อมูลด้านล่างเป็น CPU ของคำขอที่เก็บได้ ไม่ใช่การรับรองทุกสภาพโหลด

| API | จำนวนตัวอย่าง | CPU เฉลี่ย (ms) | CPU สูงสุด (ms) |
| --- | ---: | ---: | ---: |
| `/api/auth/passkey/generate-register-options` | 7 | 21.0 | 44 |
| `/api/auth/passkey/verify-registration` | 5 | 30.2 | 49 |
| `/api/auth/passkey/generate-authenticate-options` | 4 | 3.5 | 6 |
| `/api/auth/passkey/verify-authentication` | 5 | 7.6 | 14 |
| `/api/account/context` | 37 | 10.2 | 67 |

ล้างบัญชี QA บน Cloudflare 20 บัญชี/10 คู่ และในเครื่อง 5 บัญชี/2 คู่ ตามชื่อ cohort และ ID ที่ระบุไว้เท่านั้น ตรวจสมาชิกของแต่ละคู่ก่อนลบ และตรวจ read-back ว่าเหลือ 0 บัญชีของ cohort เหล่านั้น Public keys/sessions ถูก cascade ตาม foreign keys

การจำลองใช้ Virtual Authenticator ไม่ใช่ Windows Hello, Face ID, Touch ID หรือการซิงก์กุญแจข้ามอุปกรณ์จริง; ยังไม่มีการกู้บัญชีผ่านอีเมล แนะนำเพิ่ม Passkey สำรอง/ใช้ตัวจัดการที่ซิงก์ได้ก่อนใช้งานจริง ฟีเจอร์ Home/Quest/Savings/Explore/Us ยังคงเป็น Demo ในเครื่องตาม Phase เดิม

### ข้อจำกัดที่แก้แล้ว

- OpenNext SSR เกิน CPU ของ Free plan จึงใช้ Static Assets + Worker API โดยคง authorization บน server
- แก้ RSC segment filenames ที่ Next.js export บน Windows ด้วย build aliases ([upstream issue](https://github.com/vercel/next.js/issues/85374))
- WebAuthn ไม่ใช้ IP address เป็น RP ID; dev หน้าบัญชี redirect ไป localhost และ dev server รับ IPv4/IPv6
- Browser Passkey plugin ไม่ส่ง clientExtensionResults มาที่ server จึงเติม object ว่างเฉพาะช่องที่ verifier ไม่ใช้; ชุดทดสอบจริงพบและยืนยันการแก้นี้แล้ว

### ไฟล์ที่เพิ่มหรือแก้ใน Phase 1

ทุก path ด้านล่างเทียบกับ `D:/Tong/แฟน/โปรแกรมคู่รัก/` ไม่รวม dependencies, build output และ secret

- [.env.example](D:/Tong/แฟน/โปรแกรมคู่รัก/.env.example)
- [.gitignore](D:/Tong/แฟน/โปรแกรมคู่รัก/.gitignore)
- [cloudflare-env.d.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare-env.d.ts)
- [cloudflare/migrations/0002_passkeys.sql](D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0002_passkeys.sql)
- [cloudflare/migrations/0001_auth_and_pairing.sql](D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/migrations/0001_auth_and_pairing.sql)
- [eslint.config.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/eslint.config.mjs)
- [next.config.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/next.config.ts)
- [package.json](D:/Tong/แฟน/โปรแกรมคู่รัก/package.json)
- [package-lock.json](D:/Tong/แฟน/โปรแกรมคู่รัก/package-lock.json)
- [wrangler.jsonc](D:/Tong/แฟน/โปรแกรมคู่รัก/wrangler.jsonc)
- [scripts/setup-local.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/setup-local.mjs)
- [scripts/dev.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/dev.mjs)
- [scripts/fix-static-export.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/fix-static-export.mjs)
- [cloudflare/worker.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/cloudflare/worker.ts)
- [scripts/browser-phase1.cjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-phase1.cjs)
- [scripts/browser-smoke.cjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-smoke.cjs)
- [src/app/globals.css](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/globals.css)
- [src/app/layout.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/layout.tsx)
- [src/app/manifest.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/manifest.ts)
- [src/app/account/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/page.tsx)
- [src/app/account/error.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/account/error.tsx)
- [src/app/login/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/login/page.tsx)
- [src/app/register/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/register/page.tsx)
- [src/app/pairing/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/pairing/page.tsx)
- [src/app/pairing/error.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/pairing/error.tsx)
- [src/components/app-frame.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/app-frame.tsx)
- [src/components/auth-forms.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/auth-forms.tsx)
- [src/components/auth-layout.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/auth-layout.tsx)
- [src/components/pairing-forms.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/pairing-forms.tsx)
- [src/components/us.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx)
- [src/lib/account.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/account.ts)
- [src/lib/auth-client.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/auth-client.ts)
- [src/lib/auth.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/auth.ts)
- [src/lib/auth-handler.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/auth-handler.ts)
- [src/lib/auth-schema.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/auth-schema.ts)
- [src/lib/pairing.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/pairing.ts)
- [tests/cloudflare.test.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/tests/cloudflare.test.ts)
- [README.md](D:/Tong/แฟน/โปรแกรมคู่รัก/README.md)
- [TASKS.md](D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md)
- [QA.md](D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md)

`.dev.vars` สร้างเฉพาะเครื่องและถูก ignore; production secret เก็บผ่าน Wrangler secret โดยแยกจาก local secret ไม่มีการบันทึกค่าในเอกสารนี้

## Phase 0 — ผลเดิมก่อนเชื่อม Backend

ส่วนนี้เป็นประวัติ Phase 0; ข้อความเกี่ยวกับ Supabase ด้านล่างถูกแทนที่ด้วย Cloudflare ใน Phase 1

วันที่ 15 ตุลาคม 2026 (Asia/Bangkok)

## ผลที่รันแล้ว

| รายการ | ผล |
| --- | --- |
| `npm test` | Passed — 6 tests: seed/ยอดรวม, completion ไม่ซ้ำ, recurring period, ยอดไม่ติดลบ, schema validation, idempotent redemption |
| `npm run typecheck` | Passed — strict TypeScript |
| `npm run lint` | Passed — ไม่มี error หรือ warning ในการรันสุดท้าย |
| `npm run build` | Passed — สร้างทุก route สำเร็จ |
| `npm run start -- --port 3017 --hostname 127.0.0.1` | Passed — เปิด Production Server ได้ |
| `scripts/browser-smoke.cjs` ผ่าน Playwright CLI + Edge | Passed — 23 assertions บน Production Server |
| Home → ร้านรางวัล deep link | Passed — เปิด `/quests?tab=rewards` โดยตรง, Refresh คงหน้าร้าน, สลับกลับภารกิจได้ |
| `scripts/browser-layout.cjs` ผ่าน Playwright CLI + Edge | Passed — 13 routes × 3 widths (375, 390, 1440) = 39 cases; HTTP 200 และไม่มี horizontal overflow |
| Reduced Motion | Passed — computed animation duration `1e-05s` |
| Manifest และ SVG/PNG app icons | Passed — standalone manifest และทุก icon HTTP 200 |
| `scripts/browser-storage.cjs` ผ่าน Playwright CLI + Edge | Passed — quota failure ไม่เปลี่ยนข้อมูล/แต้ม, corrupt JSON ไม่ถูกเขียนทับ, มีคำเตือน, reset กลับมาใช้ได้ รวม 5 assertions |
| `npm audit --omit=dev` | Passed — 0 vulnerabilities |
| `npm audit --json` | Failed — 5 high vulnerabilities ใน dev dependency chain: `eslint-config-next → fast-glob → micromatch → braces`; registry ที่ตรวจมี `braces` ล่าสุด 3.0.3 และยังไม่มี patched version |

## Browser interaction coverage

- Quest: validation, เพิ่ม, แก้ไข, ทำสำเร็จ, ป้องกันซ้ำ, ลบ และเก็บประวัติหัวใจไว้
- Reward: ยืนยันแลก หักยอดถูกต้อง และสร้างคูปอง
- Savings: เพิ่ม/แก้เป้าหมาย ปฏิเสธยอดติดลบ บันทึก 123.45 บาทให้ผู้ร่วมออมที่เลือก และ refresh
- Date: เพิ่ม/แก้สถานที่ และแสดงนัดบน Calendar อัตโนมัติ
- Calendar: เพิ่ม/ลบกิจกรรม และเปลี่ยนเดือน
- Wishlist: เพิ่ม/แก้ไข toggle สำเร็จ และลบ
- Memories: เลือกรูป PNG เพิ่มเรื่องราว และรูปยังอยู่หลัง refresh
- Letters: เปิดฉบับวันนี้ได้ ฉบับอนาคตปิดปุ่มและไม่ render body
- Mood: บันทึกอารมณ์/ข้อความ และคงข้อมูลหลัง refresh
- Pet: feed cooldown, ซื้อหมวก, หักหัวใจถูกต้อง และคงของแต่งหลัง refresh
- Roulette: ตั้งตัวเลือกเอง คงตัวเลือกหลัง refresh สุ่มจากตัวเลือก และเก็บประวัติ
- Us: แก้ชื่อ ตั้งค่าการ์ดเตือน ส่งออก JSON และ reset
- หลัง suite ล้างข้อมูลทดสอบผ่าน UI กลับสู่ Demo seed

## ภาพที่เก็บไว้

`output/playwright/home-375.png`, `home-390.png`, `home-1440.png` และภาพ Quest/Explore ทั้งสามขนาด ภาพในรอบพัฒนาที่มี Next.js Dev Tools ใช้ตรวจ layout; ภาพรอบส่งมอบจะมาจาก Production Server

## ขอบเขตที่ยังไม่ได้ทดสอบ/เชื่อมต่อ

- SQL Migration ยังไม่ได้ apply หรือทดสอบกับ Supabase จริง
- Auth, Pairing, multi-user RLS/RPC, Private Storage และ server-enforced scheduled letters ยังเป็นงาน Phase 1–4
- ไม่มี offline cache, Push Notification หรือการทดสอบติดตั้งบน iPhone/Android จริง (Phase 6)
- การทดสอบ viewport ผ่าน Edge ไม่ใช่การทดสอบ Safari engine หรือฮาร์ดแวร์จริง
- UI scheduled letters ใน Demo ไม่ใช่การเข้ารหัส ข้อมูลยังอยู่ใน Local Storage
- ไม่มีการซิงก์ระหว่างบัญชี; การเขียนพร้อมกันหลายแท็บใช้กติกา last write wins และไม่มี conflict resolution

## รายการไฟล์ที่สร้าง

ทุกไฟล์อยู่ในโฟลเดอร์โปรเจกต์ รายการด้านล่างไม่รวม dependencies, build output และไฟล์ QA ชั่วคราว

- [.env.example](D:/Tong/แฟน/โปรแกรมคู่รัก/.env.example)
- [.gitignore](D:/Tong/แฟน/โปรแกรมคู่รัก/.gitignore)
- [AGENTS.md](D:/Tong/แฟน/โปรแกรมคู่รัก/AGENTS.md)
- [components.json](D:/Tong/แฟน/โปรแกรมคู่รัก/components.json)
- [eslint.config.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/eslint.config.mjs)
- [next-env.d.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/next-env.d.ts)
- [next.config.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/next.config.ts)
- [package-lock.json](D:/Tong/แฟน/โปรแกรมคู่รัก/package-lock.json)
- [package.json](D:/Tong/แฟน/โปรแกรมคู่รัก/package.json)
- [postcss.config.mjs](D:/Tong/แฟน/โปรแกรมคู่รัก/postcss.config.mjs)
- [public/apple-icon.png](D:/Tong/แฟน/โปรแกรมคู่รัก/public/apple-icon.png)
- [public/icon-192.png](D:/Tong/แฟน/โปรแกรมคู่รัก/public/icon-192.png)
- [public/icon-512.png](D:/Tong/แฟน/โปรแกรมคู่รัก/public/icon-512.png)
- [public/icon.svg](D:/Tong/แฟน/โปรแกรมคู่รัก/public/icon.svg)
- [QA.md](D:/Tong/แฟน/โปรแกรมคู่รัก/QA.md)
- [README.md](D:/Tong/แฟน/โปรแกรมคู่รัก/README.md)
- [scripts/browser-layout.cjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-layout.cjs)
- [scripts/browser-smoke.cjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-smoke.cjs)
- [scripts/browser-storage.cjs](D:/Tong/แฟน/โปรแกรมคู่รัก/scripts/browser-storage.cjs)
- [src/app/[section]/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/[section]/page.tsx)
- [src/app/explore/[tool]/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/explore/[tool]/page.tsx)
- [src/app/globals.css](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/globals.css)
- [src/app/layout.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/layout.tsx)
- [src/app/loading.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/loading.tsx)
- [src/app/manifest.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/manifest.ts)
- [src/app/not-found.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/not-found.tsx)
- [src/app/page.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/app/page.tsx)
- [src/components/app-shell.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/app-shell.tsx)
- [src/components/cat-scene.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/cat-scene.tsx)
- [src/components/explore.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/explore.tsx)
- [src/components/home.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/home.tsx)
- [src/components/memory-tools.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/memory-tools.tsx)
- [src/components/planning-tools.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/planning-tools.tsx)
- [src/components/play-tools.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/play-tools.tsx)
- [src/components/quests.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/quests.tsx)
- [src/components/savings.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/savings.tsx)
- [src/components/shared.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/shared.tsx)
- [src/components/ui/button.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/ui/button.tsx)
- [src/components/ui/dialog.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/ui/dialog.tsx)
- [src/components/us.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/components/us.tsx)
- [src/lib/model.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/model.ts)
- [src/lib/utils.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/utils.ts)
- [src/lib/world-store.tsx](D:/Tong/แฟน/โปรแกรมคู่รัก/src/lib/world-store.tsx)
- [supabase/migrations/20261015000000_foundation.sql](D:/Tong/แฟน/โปรแกรมคู่รัก/supabase/migrations/20261015000000_foundation.sql)
- [TASKS.md](D:/Tong/แฟน/โปรแกรมคู่รัก/TASKS.md)
- [tests/model.test.ts](D:/Tong/แฟน/โปรแกรมคู่รัก/tests/model.test.ts)
- [tsconfig.json](D:/Tong/แฟน/โปรแกรมคู่รัก/tsconfig.json)

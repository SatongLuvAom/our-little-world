# Phase 6.1 — Mobile UAT & Production Readiness Report

## Checkpoint 24 ตุลาคม 2026 — Dependency remediation / Savings performance

สถานะ readiness ยัง **CONDITIONAL**; คำขอแก้ dependency และ LCP รอบนี้เป็น **Partial**: dependency gate ของ candidate ผ่านแล้ว แต่ยังไม่มีการแก้ LCP ที่พิสูจน์ผลดี และ mobile performance gate ยัง FAIL ฐานเปรียบเทียบรอบนี้คือ `e7e60e2` รายละเอียดทุก trial รวมที่คืนโค้ดอยู่ใน [QA.md](../QA.md)

- อัปเดตและ pin `next` / `eslint-config-next` เป็น `16.4.3`, ระบุ npm `11.11.0`, ปิด dependency lifecycle scripts ผ่าน `.npmrc` และปรับคู่มือติดตั้ง ไม่เปลี่ยน Auth/API/Schema/ledger/Secrets/Production bindings/Service Worker source หรือเปิดบริการเสียเงิน
- Final clean `npm ci --ignore-scripts` ผ่าน 479 packages; SHA256 lockfile ก่อน/หลังตรงกัน Full/production `npm audit` = **0 vulnerabilities**, signature audit `invalid: []`, `missing: []` ดูขอบเขตและการถอน braces advisory ของ upstream ใน [SECURITY.md](../SECURITY.md)
- Final `npm test` **PASS 108 tests**, lint/typecheck/build **PASS**; build 20 pages, 17 RSC aliases, 177 public assets/33 routes, SW `9926d5ec7b43e9cebc50`
- Browser บน isolated local Worker/D1: CSS/fonts/navigation **32**, preload/auth guard **13**, Savings/history/reversal/planning/duplicate/concurrency/cross-couple **54**, PWA/receipts/offline/reopen **44**, layout **90 route/width combinations** และ axe **30 states** ผ่าน; คืน focus 9/9, runtime errors/axe violations ที่ตรวจ 0 ผลนี้ไม่ใช่เครื่องจริงหรือ WCAG conformance ครบ
- PWA update **PASS 8 checks** จาก build เก่าจริง SW `750e705ec30696964c67` ไป candidate `9926d5ec7b43e9cebc50`: waiting/multiple-window/form guards, original pending receipt หลัง reload, cache ครบ 177 assets/40 fonts, ไม่มี API cache และ cold offline ปิด private writes

| Final mobile lab บน localhost | LCP ทั้ง 3 รอบ ms | TBT ทั้ง 3 รอบ ms | Strict budget |
| --- | --- | --- | --- |
| Quest | 3,341.427 / 3,376.335 / 3,344.116 | 200 / **262** / 154.5 | **FAIL 1/3** (TBT) |
| Savings | 3,340.691 / 3,348.822 / 3,376.124 | 141 / 198 / **280.5** | **FAIL 1/3** (TBT) |

Lighthouse 13.5.0/Edge155, cold mobile simulation CPU4×/RTT150ms, ไม่เปลี่ยนงบ: LCP≤4,000ms ผ่านทุก report แต่ strict guard ครบ 6 reports **exit 1** เพราะ TBT≤200ms เกินสองรอบ ไม่ใช้ผล CSS/PWA checks แทน performance gate Local Savings median ก่อน/หลัง 3,312.69→3,348.82ms ไม่ได้พิสูจน์ LCP gain

**สิ่งที่ยังไม่ปิด:** Production Savings 4,194.66ms ที่พบวันที่ 23 ต.ค. ไม่ถือว่าถูกแก้จาก local result; คืนโค้ด inline CSS, QuestStatus split, lazy Sheet, font preload, Intl reuse และ class merging trials ทั้งหมดที่ไม่ช่วยอย่างสม่ำเสมอ Candidate คง dependency patch เพื่อความปลอดภัยเท่านั้น ไม่ลด validation/auth checks หรือเปลี่ยนการ cache เงิน/สิทธิ์เพื่อไล่คะแนน

**ขอบเขตการส่งมอบ:** เจ้าของอนุมัติให้อัปเดต GitHub แต่ระบุว่าไม่ Deploy จึงไม่เผยแพร่ candidate สู่ Production, ไม่ทำ remote mutations หรือเปิด paid service อ่าน deployment metadata ก่อนเผยแพร่ซอร์สแบบ read-only ยังพบ deployment `326f7434-1585-41b1-bac4-c7168f68cc4a` / version `7de9621e-3e9d-453b-9612-ef2ceda499a1` จากวันที่ 18 ต.ค. โทรศัพท์จริง **77 กรณี NOT TESTED**, invitation quota/CSP/account recovery/storage migration เดิมยังไม่แก้ ขั้นถัดไปคือเก็บ CPU/network profile ของ Savings เพิ่มก่อนเลือกการแก้ performance; Deploy ยังคงต้องได้รับอนุมัติแยก

ไฟล์เปลี่ยนรอบนี้: `.npmrc`, `package.json`, `package-lock.json`, `README.md`, `SECURITY.md`, `QA.md`, `docs/PHASE_6_1_READINESS_REPORT.md`, `scripts/browser-css-navigation.cjs`, `scripts/browser-pwa-update.cjs` หลักฐาน `output/dependency-final-*`, `output/savings-deps-final-*` และ `output/savings-deps-browser-*` อยู่ใน ignored local output ไม่รวม QA credentials หรือ generated build ใน Git

---

ส่วน 1–12 ด้านล่างเป็นผล audit เดิมวันที่ 23 ต.ค. เพื่อเก็บประวัติ ตัวเลข dependency เก่าไม่ใช่ผล candidate วันที่ 24 ต.ค. และตัวเลข Production เดิมไม่ใช่ผลของ candidate ที่ยังไม่ Deploy

วันที่ตรวจ: **23 ตุลาคม 2026 (Asia/Bangkok)**

ฐานโค้ด: `main` / `90f2c5a3ebda8442949adb813746ed65437879ac`

Production: <https://our-little-world.supawat-you.workers.dev/>

## 1. คำตัดสิน: CONDITIONAL

งานตรวจโค้ด, automated QA, regression และคู่มือ UAT เสร็จตามผลด้านล่าง แต่ **ยังไม่รับรองการใช้งานบน iPhone/Android เครื่องจริง** ทั้ง 77 กรณีใน [Mobile UAT](PHASE_6_1_MOBILE_UAT.md) เป็น **NOT TESTED** ไม่ใช้ viewport, virtual authenticator หรือ simulated Push แทนผลเครื่องจริง

เงื่อนไขก่อนรับรอง release ใหม่: ผล critical journeys บนเครื่องจริง, การจัดการ dependency advisories และ performance variance ด้านล่าง และเจ้าของอนุมัติรุ่นที่จะ Deploy ก่อน งาน audit นี้ไม่ Deploy ไม่เปลี่ยน Auth flow/Schema/Secrets/Production bindings ไม่เปิดบริการหรือแพ็กเกจเสียเงิน และไม่ลบ/รีเซ็ตข้อมูลผู้ใช้จริง

ชื่อ mission Phase 6.1 ในเอกสารนี้หมายถึง Mobile UAT ตามคำขอวันที่ 23 ต.ค.; ไม่ได้แทนหรือลบประวัติ Phase 6.1 Backup เดิมใน `TASKS.md`

## 2. Repository audit — ตรวจจาก implementation

| ส่วน | โค้ดที่ตรวจ | สิ่งที่มีอยู่จริงและขอบเขต |
| --- | --- | --- |
| Frontend | `src/app/`, `src/components/`, `next.config.ts` | Next 16.3.8 static export; หน้า Auth, Home, Quest, Savings, Explore, Us; ไม่มี Next HTTP server ใน deployment |
| Authentication | `src/lib/auth.ts`, `auth-handler.ts`, `auth-client.ts`, `auth-schema.ts` | Better Auth + Passkey; username/display name; server บังคับ UV, origin/RP; password/email flow ปิด; เพิ่ม Passkey ต้อง session ใหม่ไม่เกิน 15 นาที |
| Sessions | `auth.ts`, `cloudflare/worker.ts` | D1 sessions อายุ 7 วัน; cookie cache ปิด; HttpOnly/SameSite=Lax และ Secure บน HTTPS; อ่าน session ทุก protected request |
| Pairing | `src/lib/pairing.ts`, `components/pairing-forms.tsx` | invite 64 ตัว, hash ใน D1, 24 ชั่วโมง, ใช้ครั้งเดียว; สมาชิกสูงสุด 2; รับซ้ำ/พร้อมกันมี SQL guards |
| Database | `cloudflare/migrations/0001_*.sql`–`0009_*.sql` | 9 migrations; auth, couple membership, financial ledger/rollups, planning, journal, pet, backup/revisions, Push, diagnostics; ไม่มี browser D1 endpoint หรือ Supabase runtime |
| API boundary | `cloudflare/entry.mjs`, `cloudflare/worker.ts` | Edge → SQLite DO → service → D1; actor จาก session และ couple จาก membership; Origin guard, body caps, no-store, generic errors และ request ID; anonymous state GET ที่ไม่มี credentials ถูกปฏิเสธก่อน RPC |
| Quest/Hearts | `quest-service.ts`, `quest-store.tsx` | server price/period ไทย, atomic wallet+ledger, idempotent complete/redeem, soft delete, version guards, bounded history |
| Savings/Planning | `planning-service.ts`, `planning-store.tsx` | integer satang, immutable entries, idempotent deposit/reversal, totals/contributors, goals/date/wishlist/calendar/version guards; บันทึกยอดเท่านั้น ไม่มีการรับ/โอนเงินจริง |
| Journal | `journal-service.ts`, `journal-store.tsx`, `components/memory-tools.tsx` | PNG ตรวจจริง/จำกัดขนาด; URL HMAC ผูก actor/session อายุ 90s; mood user/day; letter body ไม่ถูก SELECT ก่อนวันเปิดตาม server ไทย |
| Pet | `pet-service.ts`, `pet-store.tsx` | shared cooldown 4 ชั่วโมง, feed ledger, items/ownership/equip/version, heart purchase receipts และ Achievement |
| Backup | `backup-service.ts`, `backup-schema.ts`, `components/backup-tools.tsx` | ไฟล์ AES-GCM, AAD ผูก couple/deployment; fresh session, bounded staging, preview/validate, revision guard และ transactional restore; ไม่รวมบัญชี/Passkey; ไม่ใช่ account recovery |
| PWA | `app/manifest.ts`, `components/pwa.tsx`, `scripts/build-pwa.mjs`, `service-worker.js` | standalone manifest, 33 routes/177 public assets ใน candidate build, integrity, waiting/update guards, public cache; API/POST/private photos/letters ไม่อยู่ใน SW cache |
| Push | `push-service.ts`, `web-push.ts`, `components/push-tools.tsx`, SW | VAPID/aes128gcm, provider host allowlist, no redirects, generic text, per-device permissions/preferences, receipts/bounded retry; Cron เดิมทุก 15 นาทีผ่าน DO |
| Observability | `diagnostic-service.ts`, `error-reporting.ts` | จำกัด route/code/จำนวน/อายุ; ไม่เก็บ exception message/stack/private URL; authenticated scope; failures ไม่สร้าง fake success |
| Deployment | `wrangler.jsonc`, `package.json`, `scripts/check-auth-schema.ts` | Workers/D1/SQLite DO เดิม, observability=false; remote schema gate ก่อน deploy; ไม่เพิ่ม R2/Queues/paid service; ไม่มี workflow ใน `.github/workflows` ที่ตรวจพบ |
| Tests | `tests/*.test.ts`, `scripts/browser-*.cjs` | ephemeral local D1 tests + real local Worker/DO/D1 browser flows, Virtual WebAuthn; รายละเอียดผลสดในหัวข้อ 4 |

เริ่มต้น Git สะอาด; GitHub `main` ที่อ่านก่อนเริ่ม audit เป็น `90f2c5a` Production deployment metadata ยังเป็น version **`7de9621e-3e9d-453b-9612-ef2ceda499a1`** (100%, 18 ต.ค.) ไม่มีการปล่อย candidate ของรอบนี้

## 3. สภาพแวดล้อมและการแยกข้อมูล

- Unit/integration ใช้ `getPlatformProxy`, `persist:false`, `remoteBindings:false`, `envFiles:[]` และ credentials จำลองของ fixture
- Browser QA ใช้ `http://localhost:3018`, Edge Chromium desktop, Virtual Authenticator, D1 ID สุ่มใหม่/ชื่อ QA และ local persistence ใหม่ใน `output/uat-20261023/storage` แยกจาก local database เดิมด้วย
- สร้าง config/credentials ชั่วคราวสำหรับ QA ใน `output/uat-20261023/wrangler.jsonc` ซึ่งถูก ignore ไม่อ่าน/เขียนค่าลับ Production หรือแก้ `.dev.vars`; Cron ปิดเฉพาะ config QA ชั่วคราว ไม่แก้ Cron จริง
- Apply เฉพาะ migrations เดิมทั้ง 9 ไฟล์ใน DB ใหม่ ไม่มี schema change ของโปรเจกต์; mutations, restore และ Demo reset เกิดใน QA เท่านั้น ไม่สร้าง/ล้างบัญชี Production
- Production ตรวจเฉพาะ HTTP GET public assets, deployment metadata และ remote schema แบบ read-only ไม่มีการอ่านเนื้อหาคู่จริง; `wrangler deploy --dry-run` เป็นการ bundle ในเครื่อง ไม่ upload/release
- หลักฐาน raw JSON/logs/screenshots อยู่ `output/uat-20261023-*` และ `output/playwright/` ที่ ignore; ไม่ใส่ cookies, invite token, credential private keys หรือข้อมูลบัญชีลงเอกสารนี้
- Browser/preview ของงานนี้ปิดแล้ว; local QA database คงอยู่ในพื้นที่ ignored เพื่อการตรวจซ้ำ ไม่ได้ลบข้อมูลในฐานเดิม

## 4. ผลทดสอบที่รันรอบนี้

PASS ในตารางหมายถึง executed successfully ในขอบเขตนั้น ไม่ใช่ physical-device PASS หรือการรับประกันว่าปลอดภัยทุกกรณี

| Check / User journey | ผล | หลักฐานใน `output/` |
| --- | --- | --- |
| Baseline `npm test` ก่อนเพิ่ม regression | PASS 106 tests | `uat-20261023-tests-before.txt` |
| Final `npm test` | PASS **108 tests** | `uat-20261023-tests-final.txt` |
| `npm run lint` / `npm run typecheck` | PASS รวมรอบสุดท้าย | `uat-20261023-{lint,typecheck}-final.txt` |
| `npm run build` | PASS 20 static pages, 17 RSC aliases, SW `3ecee61606d1a02d585a` | `uat-20261023-build.txt` |
| Migrations ใน QA D1 | PASS 0001–0009 | `uat-20261023-migrate.txt` |
| Remote schema gate (read-only) | PASS | `uat-20261023-remote-schema.txt` |
| Signup/login/logout/UV/signature/replay/concurrent challenge/backup Passkey | PASS **28** browser checks | `uat-20261023-browser-phase1.txt` |
| Savings/history/reversal/contributor totals/date/wishlist/calendar/anniversary | PASS **54** browser checks | `uat-20261023-browser-phase3.txt` |
| Memories/photo/privacy/mood/time-locked letters/session revoked | PASS **47** browser checks | `uat-20261023-browser-phase4.txt` |
| Shared cat/cooldown/items/equip/Achievement/duplicate purchase | PASS **72** browser checks | `uat-20261023-browser-phase5.txt` |
| Encrypted backup/preview/restore/races/negative cases | PASS **64** browser checks | `uat-20261023-browser-phase6.txt` |
| Quest/Rewards/Savings/Pet response lost → close/reopen/retry; offline/cross-couple | PASS **44** browser checks | `uat-20261023-browser-pwa.txt` |
| Push UI/permission contract/deep link/deferred dialog/navigation | PASS **27** checks; permission/PushManager/test-button response บางส่วนจำลอง ไม่ใช่ OS delivery | `uat-20261023-browser-push-retry.txt` |
| Anonymous/revoked/Origin/cross-couple/mixed concurrent transactions | PASS **249** browser checks; concurrency สูงสุด 6 | `uat-20261023-browser-security-retry.txt` |
| Paired keyboard/skip link/dialog focus/validation/200% text/reduced motion/diagnostics | PASS **71** checks; CPU4× lab interaction สูงสุด **128 ms** ไม่ใช่ field INP | `uat-20261023-browser-mobile.txt` |
| Public axe WCAG A/AA/best practice | PASS **30** page/dialog states; คืน focus 9 จุด; มี incomplete/manual checks ที่ต้องตรวจต่อ ไม่รับรอง WCAG conformance | `uat-20261023-browser-accessibility.txt` |
| 320/375/390/430/768/1024 px | PASS **90** route/width combinations (15 routes × 6 widths), ไม่มี horizontal overflow; reduced motion และ manifest/icons ผ่าน | `uat-20261023-browser-layout-final.txt` |
| State preload/pending privacy/fresh reads/rewards deep link | PASS **13** checks | `uat-20261023-browser-state-preload.txt` |
| Demo CRUD/validation/persistence | PASS **23** checks และคืนเฉพาะ QA Demo seed | `uat-20261023-browser-smoke.txt` |
| Quota/corrupt localStorage/no fake completion | PASS **5** checks รวมยอดหัวใจบน UI ก่อน/หลัง | `uat-20261023-browser-storage-final.txt` |
| PWA waiting/multiple windows/open form/receipt/update/offline | PASS **6** checks | `uat-20261023-browser-update.txt` |
| Bundle dry-run | PASS; 933 modules, ไม่พบ Next server/sharp/braces/micromatch/fast-glob ใน Worker metafile | `uat-20261023-{dry-run.txt,metafile.json}` |
| Public production probes | PASS expected status; image optimizer/private sources 404; HTML header gaps บันทึกเป็น finding | `uat-20261023-production-probes.json` |
| `npm audit --json` | **FAIL**: Critical 1 / High 5 ตาม dependency aggregation ดูหัวข้อ 6 | `uat-20261023-audit.json` |
| `npm audit --omit=dev --json` | **FAIL**: Next Critical 1 dependency; ไม่พบ server attack path ใน deployment ที่ตรวจ | `uat-20261023-audit-production.json` |
| Lighthouse mobile budget บน Production เดิม | **FAIL** รวม 6 reports: Quest PASS 3/3, Savings PASS 2/3; Savings หนึ่งรอบ LCP 4,194.66 ms | `uat-20261023-performance-budget.txt` |
| Native iPhone/Android install/Passkey/OS Push/keyboard/VoiceOver/TalkBack | **NOT TESTED**; ต้องมีอุปกรณ์และผู้ถือ Passkey จริง | `docs/PHASE_6_1_MOBILE_UAT.md` |

Update fixture รอบนี้เปลี่ยนเฉพาะ `CACHE` tag ของ generated `out/sw.js` เป็น `-qa-update` เพื่อให้เกิด waiting worker จริง คง asset list/integrity เดิม และคืนไฟล์ byte-for-byte หลังทดสอบ ผล 6 checks จึงครอบคลุม update orchestration/guards ไม่ใช่การรับรอง migration ของ application bundle รุ่นใหม่บน Production

การรันครั้งแรกที่ไม่ผ่านยังเก็บหลักฐานไว้:

- Push และ security suite สมัคร QA ต่อเนื่องจนชน **429** ของ auth limiter เดิม มี log ยืนยัน; หลังเว้นช่วงรันใหม่ผ่าน 27/249 โดยไม่แก้/ล้าง/เพิ่มเพดาน limiter นี่เป็นการสร้างหลายสิบ QA accounts ต่อ IP ไม่ใช่หลักฐานว่า signup 2 คนล้มเหลว
- Layout/Storage harness เดิมผูก `127.0.0.1:3017`; Storage รอบแรก connection refused บน QA3018 แก้ให้ใช้ origin ของ session แล้วผ่าน 5 checks; Layout เปลี่ยน origin และขยาย widths ก่อนรัน 90 กรณี
- Expiry regression รอบแรกนำ fixture `i` ที่ tests เดิมตั้งใจให้ unpaired ไปจับคู่ ทำให้ tests ถัดไปล้มเหลว 8 กรณี แก้ test ให้สร้างสมาชิกคู่ของตัวเอง แล้ว targeted suite ผ่าน 35 และ full suite ผ่าน 108 ไม่เปลี่ยน production behavior เพื่อให้ tests ผ่าน
- Review พบ Layout guard เดิมอาจวัด SSR loading screen จึงเพิ่มรอ `.loading-screen` หายก่อนรอ H1 จริงและ auth state แล้วรัน 90 กรณีซ้ำ; Storage เพิ่ม assertion หัวใจ UI ก่อน/หลังและรอ error จริง ใช้ผล `*-final.txt` หลังแก้ guard เป็นผลส่งมอบ

## 5. Safe fixes และ regression ที่เพิ่ม

1. **UI-01 (Low):** `src/components/us.tsx` คำอธิบายการ์ดเตือนยังบอกว่าไม่มี Push ทั้งที่มี `PushTools` เปลี่ยนเป็น “แสดงคำเตือนเมื่อมีนัดวันนี้ · ตั้งค่าเฉพาะเครื่องนี้” ตรวจ browser แล้วข้อความเก่าเป็น 0 และข้อความใหม่มีจริง ไม่เปลี่ยน switch/notification logic
2. **QA-01:** `scripts/browser-layout.cjs` ใช้ origin จาก browser session เพิ่ม 320/430/768/1024 และ login/register; รอ loading screen หาย, H1 หน้าจริง และ auth loading จบก่อนวัด คง route navigation/manifest/reduced motion checks
3. **QA-02:** `scripts/browser-storage.cjs` ใช้ session origin แทน port ตายตัว เพิ่ม guard/ตรวจ error และยอดหัวใจ UI ก่อน/หลัง จึงตรวจ isolated preview ได้ ไม่เปลี่ยน production storage logic
4. **REG-01:** `tests/cloudflare.test.ts` ทำให้ session ใน isolated D1 หมดอายุจริง แล้วตรวจ GET 7 และ POST 8 paths ครบ family รวม no-store/no identity disclosure/no ledger writes; partner session ยังใช้งานได้
5. **REG-02:** ทำให้ WebAuthn challenge ใน isolated D1 หมดอายุจริง แล้ว verify/retry ได้ `CHALLENGE_NOT_FOUND` โดยไม่สร้าง session ไม่ใช้ mock ผ่าน validation และไม่ปิด signature/UV checks

ไม่แก้ runtime Auth/API/SQL/PWA/Push, package/lockfile, bindings หรือ secrets ในรอบนี้ Safe fix ของ UI อยู่เฉพาะ local candidate ยังไม่อยู่บน Production

## 6. Security findings / dependency reachability

### SEC-01 — Dependency advisory: Next 16.3.8 (upstream Critical; deployment exposure จำกัดตามหลักฐาน)

`npm audit` วันนี้พบ Next ในช่วง affected 16.0.0–16.4.0 และ 3 advisories ที่เพิ่มจากผลวันที่ 18 ต.ค.:

- [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw): image optimization RCE เงื่อนไข Next image server บน glibc Linux; upstream แก้ Next 16.4.1 / sharp ≥0.35.5
- [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r): App Router Server Actions DoS; ต้องมี Server Action; upstream แก้ 16.4.1
- [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr): `use cache`/typed arrays RCE; upstream แก้ 16.4.1 และแนะนำ upgrade

**ข้อสังเกตที่ยืนยัน:** โปรเจกต์ export static HTML; Worker เป็น auth/business service ของเรา ไม่รัน Next server; source ไม่มี `use server`/`use cache` directive; รูปใช้ `next/image` แบบ `unoptimized`; production `/_next/image?...` ตอบ 404; Worker metafile ไม่มี Next server/sharp

**Engineering judgment:** ยังไม่พบเส้นทางโจมตีตามเงื่อนไขเหล่านี้ใน deployment ปัจจุบัน ไม่ได้แปลว่า advisory หายไปหรือแพ็กเกจปลอดภัยทั้งหมด การย้ายไป Next server ในอนาคตจะเปลี่ยน exposure ทันที ต้องอัปเดต Next ไป patched รุ่น (npm เสนอ 16.4.2) พร้อม Next/ESLint compatibility และรัน regression ก่อน release; ไม่ใช้ `npm audit fix --force` ที่เสนอ downgrade ESLint ไป 14.x และไม่เปลี่ยน framework minor โดยพลการในงาน safe UI fix นี้ ไม่รับรอง dependency release gate ว่าผ่าน

### SEC-02 — Dev dependency advisory (upstream High, ไม่อยู่ใน Worker)

[braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) ยังไม่มี patched version ตามประกาศที่ตรวจวันที่นี้; audit High 5 packages เกิดตามสาย `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` ไม่ใช่ 5 ช่องโหว่ runtime อิสระ ใช้ patterns/config ที่เชื่อถือได้และติดตาม upstream; ไม่พบ modules กลุ่มนี้ใน Worker metafile

### SEC-03 — Invitation quota abuse (Medium, availability)

`/api/account/invitation` ตรวจ session/member แต่ไม่มี general API limiter; `pairing.ts` สร้างแถวใหม่และ revoke เก่าทุกครั้ง ไม่มี retention/cap ของ invitations ผู้สมัครที่มีคู่หนึ่งคนสามารถเพิ่ม revoked rows/ใช้ write quota ต่อเนื่องได้ ไม่มีหลักฐานข้อมูลข้ามคู่รั่ว

ข้อเสนอแยก: atomic per-actor/couple invitation limit โดยใช้ตาราง limiter เดิม + retention ที่ไม่ลบรหัสยังใช้ได้ ต้องตกลง policy/429 contract และทดสอบขอบเวลา/concurrency/rows retained ก่อนทำ ไม่เปลี่ยน limiter/schema ในรอบนี้ หลักฐานเป็น code inspection ไม่ทดสอบกดจำนวนมากบน Production

### SEC-04 — Document framing/CSP (Low, hardening)

GET Production HTML ไม่มี `Content-Security-Policy` หรือ `X-Frame-Options`; CSP ปัจจุบันมีเฉพาะ SW ยังไม่พบ XSS หรือ clickjacking exploit ที่พิสูจน์ได้ ข้อเสนอ: เริ่ม `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` และตรวจ clean URL/static assets/Next inline bootstrap ก่อนเพิ่ม script policy ไม่เพิ่ม `unsafe-inline` เพื่อให้ audit ผ่าน ไม่แก้ headers โดยไม่มี compatibility test

### Controls ที่ตรวจและทดสอบแล้ว

Challenge เป็น signed cookie + server record 300 วินาที/consume once แบบ atomic, UV/signature/replay; Origin และ body caps; ทุก couple service derive scope จาก actor; signed photos ผูก session/actor; letter body กั้นที่ SQL/server date; savings/hearts/pet unique keys/transaction/triggers; encrypted archive AAD/version/revision; Push allowlist/no redirect/ไม่เปิด private payload; diagnostics bounded/no exception content

ข้อจำกัดที่ไม่ปิดบัง: ไม่ได้ทำ penetration test ไม่จำกัดขอบเขต, load test/DoS บน Production, ทดสอบอุปกรณ์จริง, OS app-switcher privacy หรือ CPU Tail รอบใหม่ ผล CPU audit เก่าไม่ถือเป็นผลใหม่ ไม่มี findings จำนวนศูนย์ที่รับประกันความปลอดภัยทั้งหมด

## 7. Storage และ synchronization map

| ขอบเขต | ที่อยู่จริง | Sync / ข้อควรทราบ |
| --- | --- | --- |
| Shared couple data | D1: quests/hearts/rewards/goals/entries/plans/wishes/events/memories/photos/letters/pet/items/achievements/anniversary | ทั้งคู่ใช้ server scope เดียวกัน; refresh ทุก 30s เมื่อมองเห็น/กลับ focus ไม่ใช่ realtime socket; versions/receipts กัน stale writes/retry |
| User identity | D1 auth_users/sessions/passkeys; HttpOnly session cookie | เปลี่ยนชื่อตนเอง; credential private key อยู่ใน authenticator ของผู้ใช้ ไม่เป็นสิทธิ์ของ partner |
| Mood/author metadata | D1 user/day หรือ author ภายใน couple | แบ่ง ownership ที่ service; ไม่เชื่อ user/couple ID จาก client |
| Device Push preferences | PushManager ของ browser + D1 push_subscriptions ที่ผูก user/couple/session/device | permission/categories รายเครื่อง ไม่ใช่ setting รวมทั้งคู่; logout/expiry หยุดส่งใหม่ |
| Demo และวงล้อ | Local Storage `our-little-world:v1` / World | วงล้อ options/spins และการ์ดเตือนเฉพาะเครื่องยังไม่ sync; Demo ไม่อัปโหลดอัตโนมัติ; Home ใช้ข้อมูลคู่จริงเมื่อ sign-in/paired |
| Pending operations | Local Storage แยก couple/operation; ย้าย receipt เก่าจาก sessionStorage | ออมค้างเก็บ payload รวมยอด/ผู้ออม/หมายเหตุ/ID, reward/pet เก็บ ID ไม่ควรอ้างว่าเครื่องไม่มีข้อมูลส่วนตัวเลย; ไม่ใช่ offline queue และไม่ replay อัตโนมัติ |
| Runtime private state | React memory | warm offline อาจยังอ่านข้อมูลที่โหลดไว้/ที่อยู่ใน DOM; cold start ต้อง online เพื่อ auth; โหลด private photo/letter ใหม่ต้อง online |
| App offline files | Cache Storage ของ SW | public assets/HTML เท่านั้น; API/session/private images/letters ไม่ precache; ไม่พบ app IndexedDB implementation ใน source |
| Encrypted backup | ไฟล์ดาวน์โหลด + bounded D1 staging | encryption ผูก deployment/couple และ secret ของ server; ไม่ใช่ E2EE ของ D1 และไม่กู้บัญชี/Passkey; เปลี่ยน URL/secret ต้องมีแผนรองรับ backup เดิม |

### Migration proposal — ยังไม่แก้ Schema

1. ตกลงว่าอะไรควร shared: roulette choices/spin history; คง install/update, in-app reminder และ Push permission รายเครื่องตามเดิม
2. ออกแบบ server contract ที่ derive couple, choices version/CAS, bounded history, server randomness และ request ID เดิมสำหรับ retry; ไม่เชื่อค่าผลสุ่ม/ledger จาก client
3. เสนอ migration/index และ tests แยกก่อน apply; ตรวจ duplicate spin/concurrent edits/tenant separation และ quota Free; ห้ามโยง heart spend โดยแฝง
4. ให้ผู้ใช้ opt-in preview/import จากเครื่องที่เลือก แสดงความขัดแย้งและยืนยัน ไม่อัปโหลด seed หรือรวมข้อมูลสองเครื่องอัตโนมัติ เก็บ local เดิมจน server ยืนยันและมี rollback/export
5. ตรวจสองเครื่องและ backup/restore compatibility ก่อนเปิดใช้จริง Migration/rollout ต้องได้รับอนุมัติแยก

## 8. Account recovery proposal — ยังไม่เปลี่ยน Authentication flow

- ปัจจุบันใช้ Passkey ที่ sync ได้และเพิ่ม Passkey สำรองขณะยังเข้าบัญชีได้; ไม่มี email recovery และ email ใน auth เป็นชื่อจำลอง `@accounts.our-little-world.invalid`
- ขั้นแรกเสนอ credential management: ดูชื่อ/วันที่เพิ่ม/ถอน Passkey ที่สูญหาย ต้อง fresh reauthentication และป้องกันถอนตัวสุดท้าย; ต้องกำหนดผลต่อ sessions ก่อนเปิด endpoint ใหม่
- หากต้องรองรับเสีย Passkey ทุกอัน: เสนอ recovery codes เช่น 10 รหัส รหัสละ 256-bit จาก Web Crypto แสดงครั้งเดียว เก็บเฉพาะ hash ที่ domain-separate; ออกผ่าน fresh session เท่านั้น ไม่ใช้ password hashing ที่กิน CPU กับ secret สุ่มยาวโดยไม่จำเป็น
- Recovery ต้อง derive user จาก code record ไม่เชื่อ user ID ที่ส่งมา; เสนอ state `issued → reserved(TTL) → consumed/revoked`, reservation ผูก enrollment challenge/UV ใหม่, commit code+credential แบบ atomic และ revoke sessions ตาม policy ต้องทดสอบ concurrent/replay/partial failure; ไม่ให้แค่กรอก code แล้วข้าม WebAuthn
- กำหนด persisted limits ต่อ IP/account และ global quota, generic errors กัน account enumeration, bounded audit; ปุ่ม regenerate/revoke codes ต้อง reauthenticate ส่วน thresholds/TTL ต้องอนุมัติก่อน implement
- ไม่ให้ partner กลายเป็น admin ที่ยึดบัญชีอีกคนได้โดยอัตโนมัติ ไม่ใช้ข้อมูลวันคบกัน/ชื่อแฟนเป็นคำถามลับ และไม่ใช้ไฟล์ backup คู่เพื่อ bypass identity
- ก่อน implement ต้องอนุมัติ threat model/policy และกรณีถูกขโมย recovery code, replay, race, brute-force, last-credential lockout, session invalidation, recovery cancellation ไม่มีบริการอีเมล/SMSเสียเงินเพิ่มจากแผนนี้

## 9. Performance

Lighthouse 13.5.0, Edge headless, mobile simulated network/CPU4× บน Production version เดิม `7de9621e-3e9d-453b-9612-ef2ceda499a1` วัดทีละหน้าเมื่อ QA browser/tests/build/preview ปิดแล้ว ใช้ cold cache/storage ตามค่าเริ่มต้น ไม่เปลี่ยน budget หรือคัดรอบที่ดีที่สุด ไม่ใช่ผล local candidate ที่ยังไม่ได้ Deploy หรือ field p75/INP

| หน้า | LCP ทั้ง 3 รอบ ms | Median ms | Performance | TBT สูงสุด ms | CLS สูงสุด | Transfer สูงสุด bytes | Budget |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Quest | 2,763.57 / 3,720.18 / 3,608.56 | 3,608.56 | 88–95 | 117.5 | 0.00116 | 364,969 | PASS 3/3 |
| Savings | 4,194.66 / 3,984.83 / 2,574.84 | 3,984.83 | 85–97 | 99 | 0.00165 | 368,838 | **FAIL 1/3** (PASS 2/3) |

ใช้ `scripts/check-mobile-budget.mjs` กับทั้ง 6 ไฟล์แล้ว exit 1 ตามจริง: งบเดิม Performance≥85, Accessibility=100, LCP≤4,000 ms, TBT≤200 ms, CLS≤0.1, transfer≤500,000 bytes ทุก report ผ่าน Accessibility/TBT/CLS/transfer แต่ LCP ของ Savings รอบแรกเกิน 194.66 ms ไม่เปลี่ยนผลวันที่ 18 ต.ค. ที่เคยผ่านทั้งหกรอบเป็นผลวันนี้

Trace รอบที่เกินชี้ LCP เป็น H1 “กระปุกความฝัน”, observed TTFB 241.74 ms และ element render delay 822.16 ms; LCP ในตารางเป็น simulated mobile metric ค่าเหล่านี้ไม่ใช่การระบุว่า API/DB เสียจากหลักฐานรอบเดียว ยังมี network/render variance ที่ต้องสืบต่อก่อนรับรองผ่าน budget ทุกครั้ง ไม่เพิ่ม caching ของยอดเงิน/สิทธิ์หรือเปลี่ยน timing ที่สำคัญเพื่อไล่คะแนนในงาน UAT นี้

Artifacts: `uat-20261023-lighthouse-{quests,savings}-{1,2,3}.json` พร้อม traces/devtools logs และผล strict guard ทุก report ใน `uat-20261023-performance-budget.txt`

## 10. งานที่ทำเองได้ / งานที่ต้องให้เจ้าของทำหรืออนุมัติ

**ทำแล้ว:** source/architecture/security/storage audit, isolated migrations และ browser journeys, regression expiry, safe copy/harness fixes, lint/typecheck/build, remote schema/public probes และคู่มือ physical UAT พร้อมช่อง Actual/Status

**ต้องทำโดยเจ้าของ:** เตรียม iPhone/Android กับ Passkey ของตนเองและคู่ QA แยกจากข้อมูลจริง; ลงมือและบันทึกผล 77 rows โดยเริ่ม signup/login/backup Passkey/pairing/money retry/PWA/Push แล้วตรวจ remaining manual A11y ไม่กรอก PASS จากผล desktop

**ต้องตัดสินใจแยก:** ลำดับ patched Next validation, invitation quota policy/header hardening, account recovery และ roulette/settings migration ไม่มีการเปลี่ยน Auth/Schema โดยอัตโนมัติ

**ต้องอนุมัติก่อนทำ:** Deploy candidate version ใด, ใช้ Production QA accounts/ส่ง notification จริง/restore ในคู่ที่ระบุ หากจะทดสอบทางนั้น ไม่ใช้คำขอ audit เป็นอนุมัติแทนข้อมูลจริง

**การเผยแพร่ซอร์สหลัง audit:** เจ้าของอนุมัติให้นำงาน Phase 6.1 ล่าสุดในเครื่องขึ้น GitHub โดยระบุว่า “ยังไม่ต้อง Deploy” การเผยแพร่ซอร์สและเอกสารนี้ไม่เปลี่ยนผลตรวจ **CONDITIONAL**, **FAIL** หรือ **NOT TESTED** และไม่ใช่การอนุมัติปล่อยรุ่น Production

## 11. ตรวจซ้ำอย่างปลอดภัย

รัน `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` จาก root; browser ต้องใช้ isolated local config/database ตามหัวข้อ 3 และ online localhost สำหรับ WebAuthn ห้ามชี้ mutation suites ไป Production โดยอาศัย ambient tab

บนเครื่องนี้มี config QA ที่ ignore แล้ว:

```powershell
npx wrangler dev --local --ip 127.0.0.1 --port 3018 --config output/uat-20261023/wrangler.jsonc --persist-to output/uat-20261023/storage
npx --yes --package @playwright/cli playwright-cli -s=uat open http://localhost:3018/ --browser=msedge
npx --yes --package @playwright/cli playwright-cli -s=uat run-code --filename=scripts/browser-security.cjs
npx --yes --package @playwright/cli playwright-cli -s=uat close
```

config/keys/DB ใน output ไม่ใช่ไฟล์ที่ commit หรือ production configuration; เมื่อทำจาก checkout ใหม่ให้สร้าง QA config/credentials และ apply migrations เดิมในฐาน local ใหม่ก่อน ไม่คัดลอก signing secrets จริง รายงาน failures และ rate limiting ตามจริง ไม่ปิด auth/security/constraints เพื่อให้ suite ผ่าน

## 12. Files changed

- `src/components/us.tsx`
- `scripts/browser-layout.cjs`
- `scripts/browser-storage.cjs`
- `tests/cloudflare.test.ts`
- `docs/PHASE_6_1_MOBILE_UAT.md` (ใหม่)
- `docs/PHASE_6_1_READINESS_REPORT.md` (ใหม่)
- `QA.md`
- `SECURITY.md`

ไม่เปลี่ยน dependencies/lockfile, runtime Auth/API/ledger, migrations, Service Worker source, `wrangler.jsonc`, Secrets หรือ Production bindings; generated/QA artifacts อยู่ใน ignored output เท่านั้น

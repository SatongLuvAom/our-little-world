# Our Little World — งานตาม Phase

## ข้อกำหนดงบประมาณ — 0 บาท

- ใช้ส่วนตัวกับแฟน 2 คน โดยงบเพิ่มสำหรับโครงสร้างพื้นฐานและบริการของแอปเป็น 0 บาท
- ใช้ Cloudflare Workers Free, D1 และ SQLite Durable Objects ตามโควตาฟรี พร้อม URL `workers.dev` เดิม
- ไม่เปิดแพ็กเกจเสียเงินหรืออัปเกรดอัตโนมัติ ไม่ซื้อโดเมน และไม่เพิ่มบริการที่อาจเรียกเก็บเงิน เช่น R2, อีเมล/SMS แบบเสียเงิน หรือสมาชิก App Store สำหรับแอปนี้
- เมื่อโควตาฟรีไม่พอ ให้ลดคำขอ จัดการพื้นที่ หรือรอรีเซ็ตตามชนิดโควตา พร้อมแจ้งข้อผิดพลาดตามจริง โดยยอมรับว่าแอปอาจใช้งานไม่ได้ชั่วคราว
- งาน Phase 6 ต้องอยู่ในงบเดิม: เริ่มจากสำรองข้อมูลเป็นไฟล์เข้ารหัสในเครื่อง; PWA/Web Push ใช้บริการฟรีเท่านั้น
- คง R2 Standard ของ `yuppie-finance-staging` ตามคำขอ ไม่ย้ายหรือลบใบเสร็จ; แอปคู่รักใช้ D1 เดิมต่อและไม่เพิ่ม R2 binding
- ข้อกำหนดนี้เป็นนโยบายของโปรเจกต์ ไม่ใช่การตั้งวงเงินในบัญชี Cloudflare หรือการยืนยันยอดใบแจ้งหนี้ และไม่เปลี่ยนการสมัครบริการอื่นในบัญชี

## Phase 0 — Foundation & Beautiful Frontend

- [x] Workspace ว่าง → Next.js App Router + strict TypeScript + Tailwind
- [x] Cozy design tokens, ฟอนต์ภาษาไทยในเครื่อง, reusable UI, Radix/shadcn patterns
- [x] Responsive Home และ navigation 5 เมนู
- [x] Quest CRUD, recurring periods, heart ledger, rewards และ achievements
- [x] Savings goals, contributions และ immutable demo history
- [x] Date Planner CRUD, Wishlist CRUD และ completion
- [x] Calendar พร้อมเดตและวันครบรอบ
- [x] Memory Book พร้อมภาพในเครื่อง
- [x] Love Letters พร้อม UI scheduled opening และคำอธิบายข้อจำกัด
- [x] Daily Mood พร้อมเลือกคนและประวัติ
- [x] Roulette พร้อมตั้งค่าและประวัติที่ persist
- [x] Virtual Pet: feed cooldown, levels, inventory และ decoration
- [x] Us profile, settings, export และ reset confirmation
- [x] Local Storage schema validation, persistence failure handling
- [x] Theme motion, heart pop/confetti, progress, reduced motion และ safe area
- [x] Manifest + local icons สำหรับพื้นฐาน Add to Home Screen
- [x] README, .env.example และ Supabase SQL foundation (ยังไม่ apply)
- [x] Browser interaction suite: เพิ่ม/แก้ไข/ลบข้อมูล แลกรางวัล รูป จดหมาย Mood แมว วงล้อ settings และ persistence
- [x] Responsive QA: 13 routes × 375px, 390px, 1440px = 39 checks ไม่มี horizontal overflow
- [x] Storage failure QA: quota เต็ม, malformed JSON, ป้องกัน fake success และ reset recovery
- [x] Unit tests 6 กรณี, Typecheck, Lint, Production Build
- [x] Reduced Motion, manifest และ icon endpoints

## Phase 1 — Authentication & Pairing

- [x] เปลี่ยนทั้งชุดเป็น Cloudflare Workers + D1 ตาม Free tier; เลิกใช้ Supabase runtime
- [x] Apply D1 migration ในเครื่องและฐานข้อมูล Cloudflare ใหม่
- [x] Better Auth Passkey-first signup/login, verified server session, logout และแก้ชื่อของตนเอง
- [x] Atomic invitation/pairing: hash token, 24h expiry, revoke/rotate, single use, max 2 members
- [x] ทดสอบ server authorization ด้วยผู้ใช้ 2 คู่, forged ID, native SQL constraints และ concurrent invite acceptance (D1 ไม่มี RLS)
- [x] แยกบัญชีจริงจาก Demo; ไม่ส่ง seed ขึ้น Cloudflare
- [x] Deploy และทดสอบผ่าน HTTPS บน Worker จริง 28 Passkey browser checks (Virtual Authenticator)
- [x] เปลี่ยนเป็น Passkey ตามคำขอ ปิด password endpoints และเพิ่ม Passkey สำรองพร้อมบังคับ fresh session
- [x] ตรวจ user verification บน server, signature ปลอม, replay และ login ด้วยเครื่องสำรองใน Browser ที่ใช้ Virtual Authenticator
- [x] แก้ CPU ด้วย SQLite Durable Object บน Free tier: Worker สูงสุด 2 ms; backend สูงสุด 33 ms ภายในงบ 30 วินาที โดยคง Better Auth, D1 และ authorization เดิม
- [x] ตรวจ auth schema ก่อน deploy พร้อม positive/negative tests และ CPU budget guard ของ Worker/RPC
- [x] ทดสอบสมัครซ้ำพร้อมกัน: สำเร็จเพียง 1 คำขอ อีกคำขอได้ 400 CHALLENGE_NOT_FOUND; Browser suite บน Cloudflare ผ่าน 28 checks

## Phase 2 — Quest & Rewards

- [x] Quest CRUD ผ่าน D1: สมาชิกจริง/วันครบกำหนด/version ป้องกันแก้ทับ, ลบแล้วเก็บประวัติ
- [x] Completion server operation บน D1 ใช้ unique period key ตามเวลาไทยและล็อกรอบหลังรับหัวใจ
- [x] Atomic redeem: ราคา catalog จาก D1, balance guard, ledger และ wallet rollup commit/rollback พร้อมกัน
- [x] Idempotency และ retry หลังคำตอบหาย: เก็บรายการค้างข้าม reload และตรวจรายการเดิมได้แม้ยอดเหลือ 0
- [x] ตัดสิทธิ์แก้ ledger จาก client; ทดสอบคำขอซ้ำ/พร้อมกัน ข้ามคู่ ปลอมราคา และเปลี่ยนผู้รับผิดชอบ
- [x] Home/Quest ใช้กระเป๋าจริงร่วมกัน, แยก Demo, ซิงก์ทุก 30 วินาทีเมื่อมองเห็น/กลับมาโฟกัส, ประวัติหน้าแรก 30 รายการ
- [x] Migration 0003 local/remote และ deployment gate ตรวจ Auth/Quest schema รวม wallet trigger
- [x] ตรวจรับ 30 automated tests, Browser 36 checks ทั้ง local/HTTPS และ Demo regression 23 checks
- [x] Free tier CPU guard ผ่าน 112 samples: Worker สูงสุด 2 ms, Durable Object 22 ms; ไม่พบ exceededCpu

## Phase 3 — Savings & Planning

- [x] Server validation เงินออม/เป้าหมาย/งบเดตเป็น integer satang และจำกัดยอดรวมแบบ atomic
- [x] Immutable savings ledger, idempotent deposit และ full reversal พร้อมเหตุผล/unique original entry
- [x] Wallet rollup commit/rollback พร้อม ledger; ยอดแยกเป้าหมายและผู้ออม โดยเก็บผู้บันทึกแยกกัน
- [x] เก็บรายการออมที่คำตอบหายข้าม reload และ retry ด้วยยอด/ผู้ออม/หมายเหตุ/request ID เดิม
- [x] เชื่อม goals, date plans, Wishlist และ Calendar ผ่าน service boundary พร้อม version จากตอนเปิดฟอร์ม
- [x] Home/การ์ดเตือน/วันครบรอบใช้ข้อมูลคู่จริง และแยก Demo โดยไม่ย้าย seed
- [x] ทดสอบ sorting, permissions, contribution totals, concurrent/duplicate/reversal และ stale form
- [x] Migration 0004 local/remote และ deployment gate ตรวจตาราง/index/trigger เงินออม
- [x] Automated tests 39, Phase 3 Browser 54 checks ทั้ง local/HTTPS, Quest regression 36 และ Demo 23
- [x] Free tier CPU guard ผ่าน 149 samples: Worker สูงสุด 1 ms, Durable Object 20 ms; ไม่พบ exceededCpu

## Phase 4 — Memories & Couple Features

- [x] Private image upload บน D1 Free: ย่อ/ตัด metadata ด้วย canvas, ตรวจ PNG raster ฝั่ง server, signed URL ผูก user/session อายุ 90 วินาที
- [x] Mood upsert แยก user/day จากเวลาไทยบน server พร้อม version ป้องกันแก้ทับ
- [x] Scheduled letters ใช้ server clock: body ไม่เปิดเผยก่อนเวลา; metadata endpoint แยก
- [x] ทดสอบ author/member/outsider และ timezone boundary รวมลิงก์รูปปลอม/หมดอายุ/ลบและ session ที่ถูกถอน
- [x] Migration 0005 local/remote และ deployment gate ตรวจ Journal tables/indexes พร้อม negative test
- [x] Automated tests 50, Phase 4 Browser 47 checks ทั้ง local/HTTPS, Planning regression 54 และ Demo 23
- [x] Free tier CPU guard ผ่าน 137 samples: Worker สูงสุด 3 ms, Durable Object 57 ms; ไม่พบ exceededCpu

## Phase 5 — Gamification

- [x] Server-authoritative pet cooldown 4 ชั่วโมงร่วมกัน, feed ledger และ Achievement จากภารกิจ 1/10 ครั้งหรือให้อาหาร 3 มื้อ
- [x] Couple sync และ atomic purchases ผ่าน heart ledger/wallet เดิม พร้อม inventory, ราคา server และ unique ownership
- [x] Feed/purchase retry หลังคำตอบหายข้าม reload และยอดเหลือ 0; equip/rename มี version ป้องกันแก้ทับ
- [x] Home/หน้าแมว/Us ใช้แมว ตู้ของ และ Achievement ของคู่จริง พร้อมแยกคูปองรางวัลและ Demo
- [x] Migration 0006 local/remote, backfill ตราจากภารกิจเดิมโดยไม่เปลี่ยนยอด และ gate ตรวจ Pet schema/triggers
- [x] Automated tests 63, Phase 5 Browser 72 checks ทั้ง local/HTTPS, Quest regression 36 และ Demo 23
- [x] Free tier CPU guard ผ่าน 171 samples: Worker สูงสุด 1 ms, Durable Object 18 ms; ไม่พบ exceededCpu

## Phase 6 — Production Readiness

- [x] Phase 6.1: ไฟล์สำรองข้อมูลคู่จริงแบบเข้ารหัส รวมรูปและจดหมาย โดยไม่ใช้บริการเพิ่ม
- [x] Phase 6.1: ตรวจไฟล์/ยอดก่อนยืนยัน กู้คืนคู่เดิมด้วย D1 transaction, ป้องกันข้อมูลเปลี่ยนระหว่างทางและ retry ซ้ำ
- [x] Phase 6.1: Migration 0007 พร้อม revision triggers และ deployment gate; ทดสอบ isolated D1 และ browser ในเครื่อง
- [x] Phase 6.1: Automated 75 tests, Browser 64 checks local/HTTPS, Demo 23; ทดสอบ empty restore/legacy versions และกู้คืนซ้ำบนรุ่นส่งมอบ
- [x] Phase 6.1: Deploy HTTPS รุ่น b51cedff-de9d-47f5-9d9f-752f3d8c80ef; frozen CPU guard 109 samples ผ่าน Worker 6 ms / Durable Object 72 ms และล้าง QA แล้ว
- [x] Phase 6.2: PWA install UI/manifest, public-only offline cache พร้อม integrity/version, read-only shared state และ network-only private API
- [x] Phase 6.2: รายการเงิน/หัวใจค้างข้ามปิดแอปด้วย ID เดิม ไม่มี offline replay; อัปเดตด้วยการยืนยันและกันหลายแท็บ/ฟอร์ม/รายการกำลังทำ
- [x] Phase 6.2: Automated 82 tests, PWA Browser 44 checks local/HTTPS, update lifecycle 6, Demo 23; deploy รุ่น 5a4f3e2e-4d90-4db4-937f-15e66c36bb18
- [ ] ตรวจติดตั้ง/อัปเดต PWA และ Passkey บน iPhone/Android เครื่องจริง
- [x] Phase 6.3: Push permission รายเครื่อง, preferences, revoke, ป้องกัน endpoint ข้ามผู้ใช้/คู่ และหยุดส่งหลัง logout/expiry
- [x] Phase 6.3: Cron เตือน Quest/Date Planner/Love Letters ด้วย VAPID + aes128gcm ผ่าน DO Free เดิม พร้อม D1 receipt กันซ้ำและ bounded retry
- [x] Phase 6.3: Automated 95 tests, Push UI 27 checks local/HTTPS, PWA regression 44; ส่ง Push จริงและรับ notification ใน persistent Edge QA profile สำเร็จ
- [x] Phase 6.3: Cron จริงส่งเตือนนัดหมายถึง browser QA แล้ว คืนรอบทุก 15 นาที; deploy รุ่น 3e036937-0a69-4b10-9623-b932b1a3e428 และ frozen CPU guard 242 samples ผ่าน Worker 4 ms / Durable Object 48 ms
- [ ] ตรวจ Push permission, รับข้อความ และแตะแจ้งเตือนบน iPhone/Android เครื่องจริง
- [x] Phase 6.4: Multi-user integration/security audit; automated 95, browser security 243 local/242 HTTPS ด้วย 4 บัญชี/2 คู่, concurrent mixed spends/deposits/reversals และ PWA retry regression 44 ผ่าน
- [x] Phase 6.4: ตรวจ private assets/secret boundary, remote schema และ frozen CPU guard 450 samples ผ่าน Worker 3 ms / DO 44 ms; ล้าง QA แบบ exact whitelist แล้ว คง runtime/Free tier เดิม
- [x] Phase 6.5: Accessibility audit แก้ contrast, keyboard/dialog focus, route title และ loading landmarks; axe local/HTTPS 30 states และ paired mobile 71 checks ผ่าน
- [x] Phase 6.5: Error monitoring บน D1 เดิม จำกัดจำนวน/อายุข้อมูล ไม่เก็บเนื้อหาส่วนตัว; tested auth, scope, concurrent caps, request ID และ failure fallback
- [x] Phase 6.5: เพิ่ม mobile lab performance budget และตัด Motion ออกจากเส้นทางเริ่มต้น; ผลรอบส่งมอบดู `QA.md` และวิธีตรวจซ้ำดู `OPERATIONS.md`
- [ ] ตรวจ VoiceOver/TalkBack และการใช้งานบน iPhone/Android เครื่องจริง
- [x] ตรวจ dependency audit อีกครั้ง: production 0 advisories; dev transitive `braces` ยังไม่มี patched version ดู `SECURITY.md` SEV-001
- [ ] อัปเดตสาย dev dependency `braces` เมื่อ upstream มี patched release ที่เข้ากันได้
- [x] Deploy ผ่าน HTTPS หลังตรวจค่าจริงและผ่าน security gates; รุ่นและขอบเขตตรวจล่าสุดอยู่ใน `QA.md`

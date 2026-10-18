# Our Little World 💗

โลกใบเล็กที่เราสองคนสร้างไปด้วยกัน — Mobile-first web app สำหรับคู่รัก

เว็บไซต์: [เปิดแอป](https://our-little-world.supawat-you.workers.dev/quests)

Phase 6.5 เพิ่ม Accessibility, งบประสิทธิภาพมือถือ และตัวนับข้อผิดพลาดที่ไม่เก็บเนื้อหาส่วนตัว ดูได้ที่ **Us → การทำงานของแอป → ดูสถานะแอป** ใช้ D1/Workers/DO เดิม ไม่มี SDK หรือบริการเสียเงินเพิ่ม วิธีตรวจและข้อจำกัดอยู่ใน [OPERATIONS.md](OPERATIONS.md) และผลที่รันจริงอยู่ใน [QA.md](QA.md)

Phase 6.6 ลด LCP ของ Quest/Savings ผ่านงบ 4 วินาทีครบ 3 รอบต่อหน้าบน HTTPS โดยแยก route, ลด Zod exports และเริ่มอ่านบัญชีระหว่างโหลด JavaScript คงระบบตรวจสิทธิ์ เงิน/หัวใจ และ Cloudflare Free tier เดิม ดูผลก่อน–หลังและข้อจำกัดใน [QA.md](QA.md)

## เริ่มใช้งาน

ต้องมี Node.js 22 ขึ้นไป และ npm ตามข้อกำหนดของ Wrangler (พัฒนาด้วย Node.js 24)

```powershell
npm ci
npm run setup:local
npm run db:migrate:local
npm run dev -- --port 3017
```

เปิด <http://localhost:3017> สำหรับ Demo และ `/register` สำหรับบัญชีจริงในฐานข้อมูล D1 จำลองในเครื่อง โดยไม่ต้องมีบัญชี Supabase; หน้าบัญชีที่เปิดผ่าน `127.0.0.1` จะส่งไป `localhost` เพราะ WebAuthn ต้องใช้ hostname

ทดสอบ Cloudflare runtime ในเครื่องหลัง Build:

```powershell
npm run build:cloudflare
npm run preview:cloudflare
```

Preview ใช้ port 3018; หากทดสอบ Auth ให้เปลี่ยน APP_URL ใน `.dev.vars` เป็น `http://localhost:3018` และเปลี่ยนกลับเป็น port 3017 เมื่อใช้ dev server เพื่อให้ Origin/cookie checks ตรงกับเว็บไซต์

ใช้ hostname และ port เดิมเพื่อเข้าถึงข้อมูล Demo เดิม เพราะ Local Storage แยกตาม origin

## Phase 0 — ใช้งานได้ใน Demo Mode

- Home: คำทักทาย วันคบกัน ฉากแมว SVG ภารกิจวันนี้ หัวใจ เงินออม นัดถัดไป และ Mood
- Quest: เพิ่ม แก้ไข ลบ ผู้รับผิดชอบ วันครบกำหนด รายวัน/รายสัปดาห์ รางวัลหัวใจ ประวัติ และ Achievement
- Reward Shop: แลกคูปองด้วยหัวใจ มีขั้นยืนยันและ request ID ป้องกันการหักซ้ำ
- Savings: สร้าง/แก้ไขเป้าหมาย บันทึกยอด แยกผู้ร่วมออม Progress และประวัติที่ไม่ถูกแก้หรือลบ
- Explore: Date Planner, Wishlist, Calendar, Memory Book, Love Letters, Daily Check-in, Love Roulette, Virtual Pet
- Us: แก้ชื่อ/วันครบรอบ/ชื่อแมว สถิติ Achievement ตั้งค่าการ์ดเตือน ส่งออก JSON และเริ่ม Demo ใหม่
- ฟอร์มตรวจข้อมูลด้วย React Hook Form + Zod; ใช้ shadcn/ui-style Button และ Radix Dialog ที่ปรับธีมแล้ว
- ฟอนต์ IBM Plex Sans Thai และ DM Sans เก็บในแพ็กเกจ ไม่ต้องโหลดจาก Google Fonts ระหว่างใช้งาน
- Reduced motion, Safe Area, keyboard focus, dialog focus trap, skeleton และ toast
- PWA พร้อม manifest, ไอคอน, offline app shell และอัปเดตแบบยืนยันเอง (Phase 6.2); Push แจ้งเตือนรายเครื่องพร้อมแล้ว (Phase 6.3) ยังรอตรวจบน iPhone/Android เครื่องจริง

## Phase 6.3 — Push Notification ฟรี

- เปิด **Us → เตือนเรื่องเล็ก ๆ ของเรา → เปิดแจ้งเตือนเครื่องนี้** แล้วกดอนุญาต แต่ละคนเปิดบนเครื่องตัวเอง เลือกเปิด/ปิดภารกิจ นัดหมาย และจดหมายแยกได้ สูงสุด 3 เครื่องต่อคน ปิดเครื่องเก่าจากรายการอุปกรณ์ของตัวเองได้
- iPhone/iPad ใช้ iOS/iPadOS 16.4 ขึ้นไป ติดตั้งและเปิดแอปจากไอคอนบนหน้าจอโฮมก่อน Android ใช้ Chrome ที่รองรับ Push การขอสิทธิ์เกิดจากการกดปุ่มเท่านั้น ไม่มี popup ขอสิทธิ์อัตโนมัติ ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers))
- ใช้เวลาไทย: ภารกิจที่ถึงกำหนดและยังไม่เสร็จแจ้งช่วง 09:00 น. วันละครั้งต่อเครื่อง โดยดูผู้รับผิดชอบ/ภารกิจร่วมและรอบรายวัน/สัปดาห์จาก server; นัดใน **Date Planner** แจ้งเมื่ออยู่ในช่วง 30 นาทีก่อนถึงเวลา; จดหมายที่เพิ่งเปิดหรือเพิ่งสร้างและเปิดอ่านได้แล้วแจ้งเฉพาะผู้รับ ไม่แจ้งผู้เขียน และไม่ส่งจดหมายอนาคต
- Cron ตรวจทุก 15 นาที การส่ง/ถึงเครื่องขึ้นกับเครือข่าย บริการ Push และการตั้งค่าของ OS จึงไม่ใช่นาฬิกาปลุกที่รับประกันเวลาตรงนาที **ทดสอบแจ้งเตือน** หมายถึงบริการ Push รับข้อความแล้ว การถึงหน้าจอต้องตรวจบนเครื่องจริงอีกครั้ง
- ข้อความหน้าจอล็อกใช้ข้อความกลางตามประเภท ไม่มีชื่อคน ชื่อเรื่อง สถานที่ จำนวนเงิน หรือเนื้อหาจดหมาย แตะแจ้งเตือนแล้วเปิดหน้าในแอปที่ตรวจสิทธิ์อีกครั้ง ถ้ามีฟอร์มหรือรายการบันทึกค้าง จะพักการเปิดหน้าจนผู้ใช้พร้อม
- Subscription ผูก user/couple/session ที่ server ตรวจแล้ว ไม่รับ actor/couple จาก client ข้อมูล endpoint/keys ไม่คืนใน API state และไม่เก็บใน PWA cache/ไฟล์สำรอง ออกจากระบบหรือเซสชันหมดอายุจะหยุดส่งรายการใหม่ให้เครื่องที่ผูกกับเซสชันนั้น ถ้าไม่ได้เปิดแอปนานจนหมดอายุ ให้เข้าสู่ระบบและเปิดแจ้งเตือนอีกครั้ง ข้อความที่ส่งให้บริการไปแล้วอาจมาถึงภายหลังได้
- D1 ใช้ receipt แยกเครื่อง/ผู้ใช้/เหตุการณ์ ป้องกัน Cron ซ้อนหรือเปิดรับ endpoint เดิมซ้ำ ไม่เขียนเงิน/หัวใจ มี notification tag เดิมสำหรับการส่งที่ต้อง retry ผลไม่ชัดเจนจาก network timeout จะไม่ส่งซ้ำอัตโนมัติ; HTTP 429/5xx เคารพ Retry-After และลองไม่เกิน 3 ครั้ง เฉพาะที่เหตุการณ์ยังถึงกำหนด; HTTP 404/410 ลบเครื่องหมดอายุ
- ใช้ Web Crypto ตาม [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291) / [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292) ส่งตรงไป Apple/Google/Mozilla/Microsoft ไม่มี Firebase SDK, อีเมล/SMS หรือสมาชิกผู้พัฒนาแบบเสียเงิน ไม่มี dependency ใหม่
- Cron ทำงานผ่าน SQLite Durable Object เดิมเพื่อให้งานเข้ารหัสไม่ชน CPU 10 ms ของ Worker Free จำกัดรอบละ 4 เครื่อง/8 ข้อความ และเก็บ receipt 30 วัน ใช้ Workers/D1/DO Free เดิม ไม่มี Queues หรือบริการเสียเงินเพิ่ม ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [DO Free](https://developers.cloudflare.com/durable-objects/platform/pricing/))

ตั้งค่าเมื่อย้าย environment โดยไม่พิมพ์ private key:

```powershell
node scripts/setup-push.mjs local
npm run db:migrate:local
node scripts/setup-push.mjs remote
npm run db:migrate:remote
npm run build
npm run deploy:cloudflare
```

สคริปต์รักษา key เดิมเสมอ เก็บ local key ใน `.dev.vars` ที่ไม่ commit และ production key ใน Worker secret `PUSH_VAPID_JWK` ห้ามใส่ key นี้ใน `NEXT_PUBLIC_*` หรือส่งในแชต การเปลี่ยน key จะทำให้เครื่องเดิมต้องสมัครรับใหม่

ทดสอบ Cron ใน local preview ด้วย `npx wrangler dev --port 3018 --var APP_URL:http://localhost:3018 --test-scheduled` แล้วเรียก `http://localhost:3018/cdn-cgi/local/scheduled?format=json` ไม่เปิด endpoint สั่งส่ง Cron บน production ([Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/))

## Phase 6.2 — ติดตั้งแอป ออฟไลน์ และอัปเดต

- เปิดหน้า **Us → พกโลกของเราไปด้วยกัน → ติดตั้งแอป** บน Android ใช้ Chrome; บน iPhone ใช้ Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม → เปิดเป็นเว็บแอป → เพิ่ม ([คู่มือ Apple](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios)) ไม่ต้องมีบัญชีผู้พัฒนาหรือส่งขึ้น App Store
- เชื่อมต่อครั้งแรกจนแสดง “เตรียมหน้าแอปสำหรับออฟไลน์แล้ว” เพื่อเก็บหน้าแอป, JavaScript, CSS, ฟอนต์และไอคอนประมาณ 3 MB ในเครื่อง Browser อาจล้าง cache เมื่อพื้นที่ไม่พอ จึงควรเชื่อมต่อให้โหลดใหม่ก่อนใช้งานครั้งถัดไป
- ออฟไลน์เปิดหน้าแอปและนำทางได้ อ่านข้อมูลคู่ที่โหลดไว้ในรอบปัจจุบันแบบอ่านอย่างเดียว **ปิดหรือ reload แอปแล้วต้องออนไลน์เพื่อยืนยันบัญชีและโหลดข้อมูลจริงใหม่** ไม่เก็บ snapshot บัญชี, API responses, รูปส่วนตัว หรือเนื้อหาจดหมายลง Service Worker cache
- เงิน/หัวใจ/แมว/ข้อมูลร่วมกันต้องยืนยันกับ server เสมอ ไม่มี offline outbox, Background Sync หรือการส่ง POST อัตโนมัติหลังกลับมาออนไลน์ ดึงข้อมูลล่าสุดก่อนเปิดการบันทึกกลับ
- รายการที่คำตอบหายเก็บ request ID เดิม (เงินออมรวมยอด ผู้ออม และหมายเหตุเดิม) ใน **localStorage แยกตามคู่** ย้าย receipt เดิมจาก sessionStorage ให้อัตโนมัติและตรวจสอบต่อหลังปิดเปิดแอปได้ กด “ตรวจสอบรายการเดิม” เพื่อยืนยันกับ D1 อย่าล้างข้อมูลเว็บไซต์ขณะยังมีรายการรอยืนยัน ข้อมูลนี้เป็น receipt ในเครื่อง ไม่ใช่ไฟล์สำรองหรือข้อมูล Auth
- Service Worker ติดตั้งไฟล์ตาม allowlist จาก build พร้อม SHA-256 integrity หากไฟล์ไม่ครบ/คนละ build จะไม่เปิดเวอร์ชันใหม่ แยก cache ตามเนื้อหาและเก็บรุ่นก่อนหนึ่งรุ่นสำหรับ hashed chunks ([วงจร Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers))
- เปิดแอปเพื่อตรวจเวอร์ชัน หรือกด “ตรวจอัปเดตแอป” ใน Us เมื่อพร้อมจะแสดง “อัปเดตแอป” ให้กดเอง ระบบไม่ reload ระหว่างรายการบันทึก/สำรอง/กู้คืน และปฏิเสธเมื่อยังเปิดฟอร์มหรือมีแท็บอื่น ต้องปิดหน้าต่างอื่นก่อนอัปเดต เมื่อปิดทุกหน้าต่าง Browser อาจเปิดเวอร์ชันใหม่ให้อัตโนมัติในการเปิดครั้งหน้า
- PWA ใช้ static assets บน Worker เดิม ไม่มี dependency, database migration, Cron, R2 หรือแพ็กเกจเสียเงินเพิ่ม การเสิร์ฟ static assets ใช้นโยบายฟรีของ Cloudflare; API ใช้โควตา Free เดิม ([Cloudflare Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/))
- ทดสอบ Service Worker ด้วย production export ผ่าน `npm run build` และ local preview (port 3018) เท่านั้น `next dev` ไม่ลงทะเบียน Service Worker บน Windows ให้หยุด preview ก่อน build ใหม่เพื่อไม่ให้ `out/` ถูกล็อก

## กติกาของ Demo

**เมื่อเข้าสู่ระบบและมีคู่แล้ว Home, Quest/Rewards, Savings, Date Planner, Wishlist, Calendar, Memories, Mood, Love Letters, แมว, ไอเทม และ Achievement ใช้ D1 ร่วมกัน** หากยังไม่เข้าสู่ระบบจะแสดง Demo; หากยังไม่มีคู่จะแสดงลิงก์จับคู่และปิดการทำรายการจริง หน้า Us ใช้ชื่อ สถิติ และ Achievement ของคู่จริง ส่วนวงล้อ การ์ดเตือนเฉพาะเครื่อง และการส่งออก/เริ่มใหม่ของ Demo ยังคงอยู่ใน Browser ข้อมูล Demo ไม่ถูกส่งเข้า Cloudflare อัตโนมัติ ชื่อใน Demo เริ่มต้นคือ ต้น และ อิง

ข้อมูลบันทึกใน `localStorage["our-little-world:v1"]` หลังตรวจ schema และเขียนสำเร็จเท่านั้น หากพื้นที่เต็มจะแสดงข้อผิดพลาดโดยไม่เปลี่ยนยอดในหน้าจอ หากข้อมูลอ่านไม่ได้ จะหยุดเขียนเพื่อรักษาข้อมูลเดิม และให้ส่งออกหรือล้างข้อมูลผ่าน Us

- ใช้เวลา Asia/Bangkok; ภารกิจรายวันเริ่มรอบใหม่เที่ยงคืน รายสัปดาห์เริ่มวันจันทร์ ภารกิจครั้งเดียวรับหัวใจได้ครั้งเดียว
- ยอดหัวใจคำนวณจาก ledger การลบภารกิจไม่ลบประวัติหรือหัวใจที่ได้รับแล้ว
- เงินออมเป็นการบันทึกยอด **ไม่มีการรับหรือโอนเงินจริง** รายการเก็บไว้ตรวจสอบย้อนหลัง
- จดหมายในอนาคตซ่อนเฉพาะหน้าจอ **ยังอ่านเนื้อหาได้จาก Local Storage** อย่าใช้เก็บข้อความลับ
- รูป JPG/PNG/WebP ต้นฉบับไม่เกิน 10 MB ย่อผ่าน canvas เป็น PNG ไม่เกิน 200 KB ก่อนเก็บใน Demo
- แมวกินได้ทุก 4 ชั่วโมง ให้อาหาร 3 ครั้งเพิ่ม 1 เลเวล ซื้อของด้วยหัวใจและใส่ของแต่งได้ครั้งละ 1 ชิ้น
- ตัวเลือกวงล้อและประวัติ 20 ครั้งล่าสุดบันทึกในเครื่อง
- การ์ดเตือนแสดงเฉพาะนัดวันนี้ภายในแอป ไม่ใช่ Push Notification
- ส่งออก JSON ที่ Us สำรองเฉพาะ Demo ในเครื่อง ยังไม่รวมข้อมูลบัญชี D1 และยังไม่มี UI นำเข้าข้อมูล
- ข้อมูลไม่ได้เข้ารหัส ห้ามใช้เป็นที่เก็บข้อมูลละเอียดอ่อน การล้าง Browser ล้าง Demo ได้ สำรองข้อมูลก่อน
- หลายแท็บรับการเปลี่ยนแปลงผ่าน `storage` event แต่ไม่มีระบบแก้ conflict สำหรับการเขียนพร้อมกันจากหลายแท็บ; ใช้แท็บเดียวสำหรับบันทึก

## โครงสร้าง

```text
src/app/                  App Router, theme, manifest และ route entry points
src/components/           หน้าจอ แยกตามระบบ และ shared form/UI
src/components/ui/        Button, accessible Dialog/Bottom Sheet
src/lib/model.ts          schema, demo seed, ledger และ quest/reward rules
src/lib/world-store.tsx   data access boundary สำหรับ Demo persistence
tests/model.test.ts       กติกาสำคัญ: แต้มซ้ำ รอบภารกิจ ledger และ validation
scripts/browser-smoke.cjs Playwright CLI interaction suite
src/lib/auth*.ts          Better Auth, validation และ API allowlist
cloudflare/worker.ts      Worker API ตรวจ session และสิทธิ์ก่อน query D1
src/lib/pairing.ts        atomic D1 pairing และ query ที่จำกัดด้วย session user
cloudflare/migrations/    schema ที่ใช้จริงบน Cloudflare D1
tests/cloudflare.test.ts  Migration, sessions, tenant isolation และ concurrency
supabase/migrations/      แบบร่าง Phase 0 เก็บอ้างอิงเท่านั้น ไม่ deploy
```

UI ของ Demo เรียก `useWorld().update` ผ่าน data boundary เดียว ส่วน business rules อยู่ `model.ts`; บัญชีจริงใช้ `quest-store.tsx` และ `planning-store.tsx` → Worker API → `quest-service.ts` / `planning-service.ts` โดยสิทธิ์และยอดทั้งหมดตัดสินบน server

## Phase 3 — เงินออมและเครื่องมือวางแผนร่วมกัน

- เริ่มด้วยเป้าหมาย รายการออม แผนเดต Wishlist และกิจกรรมว่าง ไม่อัปโหลด seed หรือยอดออม Demo
- เก็บเป้าหมาย เงินออม และงบเดตเป็นสตางค์จำนวนเต็ม ฝั่ง Browser รับเงินบาทไม่เกิน 2 ตำแหน่ง; API ไม่รับ string หรือเศษสตางค์ เป้าหมาย/ยอดรวมต่อเป้าหมายสูงสุด 100 ล้านบาท รายการออม/งบเดตสูงสุด 10 ล้านบาทต่อรายการ
- ทั้งคู่บันทึกให้ตนเองหรืออีกคนได้ โดยเลือกสมาชิกจริง เก็บผู้ออมและผู้บันทึกแยกกัน ไม่เชื่อ actor/couple/totals จาก client ยอดแยกตามเป้าหมายและผู้ออม
- request ID ป้องกันรายการออมซ้ำ คำตอบหายจะเก็บยอด ผู้ออม หมายเหตุ และ ID เดิมใน localStorage กด “ตรวจสอบรายการออมเดิม” หลัง reload ได้ ไม่สร้างเครดิตใหม่โดยอัตโนมัติ
- ไม่แก้หรือลบรายการออมเดิม หากกรอกผิดให้ “หักล้างรายการออม” พร้อมเหตุผล แล้วบันทึกยอดใหม่ การหักล้างเป็นเต็มยอดครั้งเดียว; คำขอซ้ำ/พร้อมกันไม่หักซ้ำ เก็บทั้งรายการเดิมและรายการหักล้างไว้
- D1 trigger อัปเดตยอดสรุปพร้อม ledger แบบ atomic เมื่อส่วนหนึ่งล้มเหลว rollback ทั้งรายการ อ่านยอดจากสรุปไม่รวมประวัติทั้งหมดทุกครั้ง และแบ่งประวัติครั้งละ 30 รายการ
- ฟอร์มแก้เป้าหมาย แผนเดต และ Wishlist ใช้ version จากตอนเปิดฟอร์ม ป้องกันเขียนทับสิ่งที่อีกคนแก้ไปแล้ว; API กิจกรรมตรวจ version เช่นกัน และ Wishlist ส่งสถานะ done ที่ต้องการพร้อม version ไม่ใช้ blind toggle
- Calendar รวมกิจกรรมที่สร้างเอง แผนเดต และวันครบรอบจากคู่จริง การลบกิจกรรมไม่ลบแผนเดต; วันครบรอบ 29 ก.พ. แสดงวันที่ 28 ก.พ. ในปีที่ไม่มีวันที่ 29
- แต่ละประเภทไม่เกิน 200 รายการที่ยังใช้งาน ไม่มี API ลบเป้าหมาย/ledger เงินออม; ลบแผนเดต Wishlist และกิจกรรมได้แบบ soft delete
- ใช้รอบซิงก์บัญชีเดิม: ทุก 30 วินาทีเมื่อมองเห็น/กลับมาโฟกัส/กดโหลดล่าสุด ไม่เพิ่ม polling loop หรือ session request อีกชุด หน้าฟีเจอร์ Demo ไม่โหลด snapshot แผนจาก D1 โดยไม่จำเป็น
- Migration `0004_savings_and_planning.sql` เพิ่ม schema ใหม่ ไม่เปลี่ยนบัญชีหรือ ledger หัวใจเดิม และ deployment gate ตรวจตาราง/trigger เงินออมก่อนเผยแพร่

## Phase 2 — ภารกิจ รางวัล และกระเป๋าหัวใจร่วมกัน

- หลังสร้างคู่เริ่มด้วย 0 หัวใจ ไม่ย้ายภารกิจหรือ 120 หัวใจต้อนรับจาก Demo เข้าบัญชี
- ทั้งสองคนสร้าง/แก้ไข/ลบภารกิจได้ กำหนดผู้รับผิดชอบเป็นสมาชิกจริงหรือทำด้วยกัน; เฉพาะผู้รับผิดชอบรับหัวใจได้ ถ้าเลือกทำด้วยกัน คนใดคนหนึ่งทำสำเร็จได้หนึ่งครั้งต่อรอบร่วมกัน
- Server ใช้เวลาไทย: รายวันเริ่มเที่ยงคืน รายสัปดาห์เริ่มวันจันทร์ ครั้งเดียวไม่เริ่มใหม่ และรอวันครบกำหนดก่อนรับหัวใจ เปลี่ยนชนิดรอบได้เฉพาะภารกิจที่ยังไม่เคยรับหัวใจ
- D1 unique index บังคับหนึ่งรางวัลต่อคู่/ภารกิจ/รอบ; การแก้ชื่อหรือจำนวนหัวใจไม่เปลี่ยนประวัติและไม่เปิดให้รับรอบเดิมซ้ำ การแก้ไขใช้ version ป้องกันบันทึกทับข้อมูลที่อีกคนเพิ่งแก้
- Catalog รางวัลและราคาอ่านจาก D1; ยอดและการแลกตรวจใน SQL เดียว รายการธุรกรรมกับ wallet rollup commit/rollback พร้อมกันด้วย trigger ยอดติดลบไม่ได้และไม่เปิด API ให้ client แก้ ledger
- การแลกใช้ request ID ผูกกับคู่และรางวัล เมื่อคำตอบหาย Browser เก็บรายการค้างใน localStorage และแสดง “ตรวจสอบรายการเดิม” หลัง reload แม้ยอดเหลือ 0; retry ไม่หักซ้ำ การเริ่มแลกครั้งใหม่หลังยืนยันสำเร็จเป็นรายการใหม่
- ภารกิจไม่เกิน 200 รายการที่ยังไม่ลบต่อคู่ ประวัติแบ่งโหลดครั้งละ 30 รายการ; wallet อ่านยอดสรุปแทนรวมประวัติทั้งหมดทุกครั้ง หน้าจอซิงก์เมื่อกลับมาเปิด/โฟกัส, ทุก 30 วินาทีขณะมองเห็น และกดโหลดล่าสุดได้
- ความผิดพลาดเครือข่ายหรือ session หมดอายุระหว่างใช้งานปิดการทำรายการจริงและแสดงข้อผิดพลาด ไม่เขียนข้อมูลจริงลง Demo; แมวในบัญชีจริงใช้กระเป๋าหัวใจ D1 เดียวกับ Quest/Rewards
- Migration `0003_quests_and_hearts.sql` เพิ่ม quests/catalog/heart_entries/heart_wallets และ constraints/triggers โดยไม่แก้บัญชีเดิม; deployment gate ตรวจทั้ง Auth และ Quest schema ก่อนเผยแพร่

## Phase 1 — Cloudflare Workers + D1 + Better Auth

ใช้ Cloudflare ทั้งชุดตาม Free tier: Worker ชื่อ `our-little-world`, SQLite Durable Object `AccountBackend` และ D1 ชื่อเดียวกัน ไม่มี Supabase, R2 หรือบริการส่งอีเมลที่ต้องสมัครเพิ่ม

- สมัครด้วยชื่อแสดงผลและชื่อผู้ใช้ `a-z`, `0-9`, `_` ยาว 3–32 ตัวอักษร แล้วสร้าง Passkey; ล็อกอินด้วย Passkey ไม่ต้องพิมพ์ชื่อผู้ใช้หรือรหัสผ่าน
- Better Auth Passkey ใช้ WebAuthn/SimpleWebAuthn ตรวจ challenge, RP ID, origin, signature และ counter; แอปบังคับ user verification บน server ทั้งสมัคร/ล็อกอิน โดยเก็บเฉพาะ public key ใน D1 ไม่รับ private key, PIN หรือข้อมูลชีวมิติ
- สร้างบัญชีหลังตรวจ Passkey สำเร็จเท่านั้น; challenge อายุ 5 นาที ใช้ครั้งเดียว; session อยู่ใน D1 และ cookie เป็น HttpOnly/SameSite=Lax/Secure บน HTTPS; API Passkey จำกัด 30 ครั้งต่อนาทีต่อ IP ต่อ endpoint
- เพิ่ม Passkey สำรองในหน้าบัญชีได้เมื่อเพิ่งเข้าสู่ระบบภายใน 15 นาที การ logout/revoke session ระหว่างเพิ่มสำรองทำให้ลงทะเบียน credential ไม่ได้
- เลือกเก็บ Passkey ในตัวจัดการที่ซิงก์อุปกรณ์ได้ หรือเพิ่มอีกเครื่องเป็นสำรอง หากไม่มี Passkey เหลือ **ยังไม่มีการกู้บัญชีผ่านอีเมล**
- อีเมล `.invalid` เป็นข้อมูลภายในตามข้อกำหนดของ Better Auth ไม่มีการอ้างว่ายืนยันอีเมล; password signup/login endpoints ปิดแล้ว และไม่สร้าง password hash สำหรับบัญชีใหม่
- สร้างคู่ด้วยวันเริ่มคบกัน; คำเชิญสุ่ม 256-bit มีอายุ 24 ชั่วโมง เก็บเฉพาะ SHA-256 hash ใน D1; แสดงรหัสจริงครั้งเดียวเมื่อสร้าง สามารถสร้างใหม่หรือยกเลิกได้
- D1 batch ทำให้การรับคำเชิญเป็น atomic; คำเชิญใช้ได้ครั้งเดียว และ retry ของผู้รับคนเดิมไม่เพิ่มสมาชิกซ้ำ; SQL constraint/trigger จำกัดหนึ่งบัญชีต่อคู่และไม่เกิน 2 คนต่อคู่
- ทุก query ของบัญชี/คู่จำกัดด้วย user ID จาก server session ไม่เชื่อ `user_id` หรือ `couple_id` จาก Browser; D1 ไม่มี PostgreSQL RLS จึงทดสอบ authorization ที่ server และ SQL constraints แทน
- ไม่เปิด D1 endpoint หรือ privileged token ให้ Browser; API ไม่คืน password hash, invitation hash หรือ session ของสมาชิกอีกคน

`.dev.vars` ใช้เฉพาะเครื่องและถูก ignore; `npm run setup:local` สร้าง secret แบบสุ่มโดยไม่ทับไฟล์เดิม และตั้ง APP_URL เป็น `http://localhost:3017` หากมีไฟล์จากรุ่นเก่าที่ตั้ง `127.0.0.1` ให้แก้เฉพาะ APP_URL โดยคง secret เดิม

Deploy ด้วยบัญชี Cloudflare ที่มีสิทธิ์ Worker, Durable Objects และ D1:

```powershell
npx wrangler login
npm run db:migrate:remote
npx wrangler secret put BETTER_AUTH_SECRET
npm run build:cloudflare
npm run deploy:cloudflare
```

ตั้ง production secret แบบสุ่มอย่างน้อย 32 ตัวอักษรแยกจากเครื่อง และห้ามส่งในแชตหรือ commit; `wrangler.jsonc` ผูก D1 ที่สร้างสำหรับแอปนี้และกำหนด APP_URL เป็น HTTPS origin จริง หากนำไปใช้บัญชีอื่นต้องสร้าง D1 ของตนเองและเปลี่ยน database_id ก่อนรัน Migration

Next.js สร้างไฟล์ Static ใน `out/` แล้วใช้ Cloudflare Assets เสิร์ฟโดยตรง มีเฉพาะ `/api/*` ที่เข้า Worker จึงไม่ต้องรัน Next.js server ใน Free tier; ไม่ใช้ OpenNext หลังทดสอบพบ SSR เกินเพดาน CPU 10 ms ของ Free plan

`npm run dev` เปิด Next.js port 3017 และ Wrangler API port 3019 อัตโนมัติ; API ใช้ D1 ในเครื่องและ Next proxy `/api/*` ไปยัง Worker จึงทดสอบด้วย origin เดียวได้ โหมดบัญชีต้องใช้ JavaScript แต่สิทธิ์ข้อมูลทั้งหมดตรวจซ้ำใน Worker API

Free tier มีโควตา ไม่ใช่ทรัพยากรไม่จำกัด; ไม่เปิด paid plan อัตโนมัติ ต้องดูการใช้งานใน Cloudflare Dashboard ก่อนรองรับผู้ใช้จำนวนมาก ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/))

ปิดปัญหา CPU ของ Phase 1 ด้วยการส่ง `/api/*` ผ่าน RPC ไปยัง SQLite Durable Object ซึ่งรองรับบน Free plan และมี CPU budget 30 วินาทีต่อคำขอ ส่วน Worker รับหน้าเว็บมี budget 10 ms เช่นเดิม ผลทดสอบรุ่นส่งมอบพบ Worker สูงสุด 2 ms และ Durable Object สูงสุด 33 ms โดยคง Better Auth และตาราง D1 เดิม รวมการตรวจลายเซ็น, user verification, session และสิทธิ์สมาชิก ([Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [Free quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/))

Durable Object แยกตาม IP ที่ Cloudflare ส่งมาเพื่อไม่รวมทุกคนใน instance เดียว ไม่มีการ cache บัญชี/session ใน Object; การเปลี่ยน IP ยังใช้บัญชีเดิมได้เพราะตรวจ session และ membership จาก D1 ทุกครั้ง ข้อมูลผ่าน RPC เป็น bytes/JSON ที่จำกัดขนาด และคง Set-Cookie ทุกค่า

`npm run deploy:cloudflare` ตรวจ Auth, Quest, Planning, Journal และ Pet schema รวม trigger ของหัวใจ เงินออม cooldown และ inventory บน D1 จริงก่อน deploy โดยไม่ใช้ secret ของ production ในขั้นตรวจ หาก schema ขาด จะหยุดก่อนเผยแพร่ มี negative tests ในฐานข้อมูลทดสอบ ดูหลักฐานและวิธีวัด CPU ซ้ำใน `QA.md`

## สำรองและกู้คืนข้อมูลคู่จริง — Phase 6.1

เข้าเมนู **Us → สำรองและกู้คืนข้อมูลคู่ของเรา** แล้วเลือก **สำรองข้อมูลจริง** เพื่อดาวน์โหลด `.olw-backup` เก็บในเครื่อง ไม่ใช้ R2 หรือบริการสำรองแบบเสียเงิน สมาชิกคนใดคนหนึ่งสำรองและกู้คืนได้ โดยต้องเป็น session ที่เพิ่งเข้าสู่ระบบภายใน 15 นาที หากข้อมูลเปลี่ยนระหว่างดาวน์โหลด ระบบให้เริ่มสำรองใหม่เพื่อไม่ให้ไฟล์ปะปนหลายเวลา

- ไฟล์ครอบคลุม Quest รวมรายการลบ ประวัติหัวใจ/รางวัล เงินออมและรายการย้อนกลับ เป้าหมาย แผนเดต Wishlist Calendar ความทรงจำพร้อม PNG ส่วนตัว จดหมาย Mood แมว ไอเทมและ Achievement กระเป๋า/ยอดเงิน/inventory สร้างกลับจาก ledger ด้วย trigger เดิม
- Server เข้ารหัสแต่ละส่วนด้วย AES-256-GCM พร้อมผูกเว็บ คู่ และตำแหน่งในไฟล์ จึงแก้ยอดเงิน/หัวใจหรือย้ายไฟล์ไปอีกคู่ไม่ได้ เนื้อหาจดหมายที่ยังไม่ถึงเวลาเปิดไม่ถูกส่งออกเป็นข้อความอ่านได้ และหลัง restore ยังตรวจวันเปิดบน server เหมือนเดิม ระบบนี้ไม่ใช่ E2EE: server เป็นผู้ถือกุญแจ
- เลือก **กู้คืนจากไฟล์** เพื่อตรวจไฟล์และยอดก่อน จากนั้นพิมพ์ **กู้คืนข้อมูล** และยืนยัน การกู้คืนแทนที่ข้อมูลร่วมกันของทั้งคู่ด้วย snapshot ในไฟล์ ควรสำรองปัจจุบันและแจ้งอีกคนก่อน ไม่ใช่การรวมข้อมูล หากอีกคนแก้ข้อมูลหลังตรวจไฟล์ revision guard จะปฏิเสธทั้ง transaction ให้เลือกไฟล์ใหม่
- ส่ง/ตรวจข้อมูลเป็นส่วนเล็ก ๆ และ apply ด้วย D1 batch transaction เดียว ถ้าขั้นตอนใดล้มเหลว ข้อมูลเดิมยังอยู่ การยืนยันพร้อมกันหรือ retry หลังคำตอบหายมีผลครั้งเดียว และเก็บ receipt ใน localStorage เพื่อยืนยันรายการเดิมหลัง reload ฟอร์มที่เปิดค้างก่อน restore จะใช้ version เก่าแก้ทับไม่ได้
- จำกัด 20,000 source records ต่อไฟล์, ดาวน์โหลด/อัปโหลดไฟล์ไม่เกิน 64 MB, ข้อมูล staging ไม่เกิน 48 MB และหนึ่งรายการต่อคู่ Staging ใช้ได้ 30 นาที ล้างเมื่อสำเร็จ/ยกเลิก/เลือกไฟล์ใหม่; staging ที่หมดอายุถูกล้างเมื่อคู่เริ่มสำรองครั้งถัดไป ไม่มีการเพิ่ม cron หรือบริการใหม่
- **ข้อจำกัดสำคัญ:** ไฟล์ใช้ได้กับคู่เดิมที่มีสมาชิกเดิม บนเว็บและกุญแจ server เดิม ไม่รวมบัญชี Passkey session คำเชิญ Demo หรือการตั้งค่าภายใน Browser จึงไม่ใช่เครื่องมือกู้บัญชีเมื่อเสีย Passkey ทั้งหมด ต้องเก็บ Passkey สำรองไว้ด้วย การเปลี่ยน `APP_URL` หรือ `BETTER_AUTH_SECRET` ทำให้ไฟล์เดิมเปิดไม่ได้ ผู้ดูแลต้องรักษา configuration เดิมอย่างปลอดภัยและใช้ D1 Time Travel/ฐานข้อมูลสำรองระดับผู้ดูแลสำหรับกรณีสูญเสียฐานข้อมูลทั้งก้อน

Migration `0007_backup_restore.sql` เพิ่ม staging และ revision triggers โดยคงข้อมูลและสิทธิ์เดิม Deployment gate ตรวจตาราง/index/trigger เหล่านี้ก่อน deploy ทดสอบ isolated D1 ด้วย `npx tsx --test tests/backup.test.ts` และ browser ด้วย `scripts/browser-phase6.cjs` โดยใช้เฉพาะบัญชี QA ที่ suite สร้าง

## แมว ไอเทม และ Achievement บนบัญชีจริง

- Migration `0006_pet_and_achievements.sql` เพิ่มแมวหนึ่งตัวต่อคู่ ตู้ของร่วมกัน ประวัติให้อาหาร และ Achievement โดยไม่ย้ายข้อมูล Demo ทุก operation หา `couple_id` จาก server session และไม่รับตัวตน/คู่/ยอดที่ client ส่งมา
- ให้อาหารฟรีทุก 4 ชั่วโมงร่วมกันทั้งคู่ตามเวลาของ server เก็บ event และปรับตัวนับใน transaction เดียว สองคนกดพร้อมกันได้หนึ่งมื้อ ทุก 3 มื้อเพิ่ม 1 เลเวล Browser ใช้ server snapshot สำหรับ cooldown; เปลี่ยนนาฬิกาเครื่องไม่ช่วยข้ามข้อจำกัด
- หมวก 50 หัวใจและพรม 70 หัวใจ ใช้ราคา catalog จาก D1 ซื้อแต่ละชิ้นได้ครั้งเดียวต่อคู่ หักผ่าน heart ledger และ wallet เดิม พร้อมเพิ่ม inventory/ใส่ไอเทมด้วย SQL trigger ถ้าขั้นตอนใดล้มเหลวจะ rollback ทั้งรายการ ไม่สร้างยอดติดลบ
- Feed และ purchase ใช้ request UUID ที่ผูกกับคู่ เก็บรายการที่ยังไม่ทราบผลใน localStorage และตรวจสอบรายการเดิมหลัง reload ได้ แม้ยอดเหลือศูนย์หรือแมวอยู่ใน cooldown การซื้อไอเทมที่มีแล้วด้วย UUID ใหม่ก็ไม่หักซ้ำ
- ใส่/ถอดของด้วยค่าที่ระบุชัดและ version ไม่ใช้ toggle ที่ server จึง retry แล้วไม่ถอดกลับโดยไม่ตั้งใจ และไม่ให้ใส่ของที่คู่นี้ยังไม่ซื้อ ชื่อแมวเปลี่ยนจากหน้าแมวด้วย version จากตอนเปิดฟอร์ม
- Achievement เดิมเป็นตราความสำเร็จ ไม่มีหัวใจโบนัส: ภารกิจแรก, ภารกิจครบ 10 ครั้ง, ให้อาหารครบ 3 มื้อ ปลดล็อกและเก็บใน D1 ภายใน transaction ของ event ที่ทำให้ครบ เปลี่ยน Local Storage ปลดล็อกไม่ได้ คู่ที่ทำภารกิจครบก่อน migration จะได้รับตราที่เข้าเกณฑ์โดยยอดหัวใจไม่เปลี่ยน
- Catalog มี `category` แยก `reward`/`pet` โดยคง ledger kind เดิม การซื้อมี `category: pet` ใน history และไม่ปรากฏเป็นคูปองแลกรางวัล Home/หน้าแมว/Us ใช้ข้อมูลเดียวกันผ่าน polling เดิมทุก 30 วินาทีขณะเปิดดู ไม่มี provider หรือตัวตั้งเวลาซิงก์เพิ่ม
- ยังคง Worker, SQLite Durable Object และ D1 Free เดิม ไม่เพิ่ม dependency หรือบริการจ่ายเงิน ผล CPU และขอบเขตการทดสอบอยู่ใน `QA.md`

## Memories, Mood และ Love Letters บนบัญชีจริง

- Migration `0005_journal.sql` เก็บข้อมูลแยกตาม `couple_id`; server ตรวจ session และ membership ทุกครั้ง ผู้เขียนเท่านั้นที่ลบความทรงจำหรือจดหมายได้ อีกคนอ่านและสร้างรายการของตนเองได้
- รูปใช้ D1 BLOB บน Free plan เดิม ไม่มี R2 subscription เพิ่ม Browser ย่อและแปลง JPG/PNG/WebP เป็น PNG พร้อมตัด metadata; server ตรวจ signature, CRC, chunk structure, dimensions และ bounded raster decompression รับเฉพาะ RGB/RGBA PNG ไม่เกิน 1024×1024 และ 200,000 bytes ไม่รับ SVG หรือไฟล์ที่เปลี่ยนแค่นามสกุล
- สูงสุด 100 ความทรงจำต่อคู่ (รูปสูงสุดประมาณ 20 MB รวมกัน) ข้อมูลรายการไม่รวม bytes รูป เปิดผ่าน signed URL อายุ 90 วินาทีที่ผูก user/session และตรวจสิทธิ์ซ้ำ แม้รู้ URL ก็อ่านโดยไม่มี session ไม่ได้ การลบมีผลทันที Response เป็น `private, no-store` การรีเฟรชข้อมูลเมื่อกลับมาโฟกัสจะสร้าง URL ใหม่
- D1 Free จำกัด 500 MB ต่อฐานข้อมูล จึงเหมาะกับรูปที่ย่อแล้วและการใช้งานคู่เล็ก ๆ; โควตารวมยังใช้ตามจริง ไม่เก็บต้นฉบับ ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/))
- Mood เขียนได้เฉพาะผู้ใช้ที่ล็อกอินในวันปัจจุบันตามเวลาไทย ใช้ unique user/day และ version ป้องกันแก้ทับ แสดงประวัติล่าสุด 60 รายการร่วมกัน
- จดหมายสูงสุด 100 ฉบับต่อคู่ Metadata ไม่มี body เสมอ แยก endpoint อ่าน body และ SQL เลือกเนื้อหาได้ตั้งแต่ 00:00 น. ของวันเปิดตาม `Asia/Bangkok` เท่านั้น ทั้งผู้เขียนและคู่ไม่สามารถเรียกอ่านล่วงหน้าโดยเปลี่ยนนาฬิกาหรือ query จาก client
- การสร้างความทรงจำ/จดหมายใช้ UUID เดิมเมื่อ retry ภายในฟอร์มที่เปิดอยู่ ถ้าบันทึกแล้ว server ตอบว่าเคยบันทึกแทนการสร้างซ้ำ ข้อมูลจริงไม่ถูกเขียนลง Demo Local Storage

รายละเอียดขั้นถัดไปอยู่ `TASKS.md`

ผลการตรวจสอบและรายการไฟล์ที่สร้างทั้งหมดอยู่ใน `QA.md`

## ตรวจสอบ

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

Browser suite ใช้ Edge ที่ติดตั้งอยู่แล้ว และต้องเปิด dev server ตาม origin ข้างต้น:

```powershell
npx --yes --package @playwright/cli playwright-cli -s=our-world open http://localhost:3017 --browser msedge
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-smoke.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-layout.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-storage.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world goto http://localhost:3017/login
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase1.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase2.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase3.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase4.cjs
npx --yes --package @playwright/cli playwright-cli -s=our-world run-code --filename=scripts/browser-phase5.cjs
```

**Browser suite ล้างข้อมูล Demo ใน browser session ที่ทดสอบ** ใช้ session สำหรับ QA แยกจาก session ที่เก็บข้อมูลของตัวเอง; Phase 1–5 suites ใช้ CDP Virtual Authenticator ทำ WebAuthn จริงใน Browser และสร้างบัญชี QA 4 บัญชี/2 คู่ต่อรอบ ต้องล้างเฉพาะ ID ที่ suite คืนให้เมื่อเสร็จ ภาพและผล QA เก็บใน `output/playwright/` ซึ่งไม่ commit เข้า Git การจำลองนี้ไม่ใช่การทดสอบ Windows Hello/Face ID บนอุปกรณ์จริง

ณ วันที่พัฒนา `npm audit --omit=dev` ไม่พบช่องโหว่ ส่วน dev toolchain มี 5 รายการระดับ high จาก `eslint-config-next → fast-glob → micromatch → braces` รุ่นล่าสุดที่ตรวจยังไม่มี patch จึงไม่ได้ downgrade Next.js หรือปิด lint เพื่อซ่อนผล ต้องตรวจอีกครั้งก่อน deployment

อ้างอิงการตั้งค่า: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [shadcn/ui manual installation](https://ui.shadcn.com/docs/installation/manual)

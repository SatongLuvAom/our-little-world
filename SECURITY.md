# 🔒 Security Audit Report: Our Little World — Phase 6.4

**วันที่ตรวจ:** 2026-10-16 (Asia/Bangkok)
**Scope:** Auth, pairing, API ทุกกลุ่ม, D1 authorization/ledger/restore, private photos/letters, Push, PWA, dependency และไฟล์ที่เผยแพร่
**Stack:** Next.js static export + Cloudflare Workers/D1/SQLite Durable Object, Better Auth Passkey

## 📊 Executive Summary

| Severity ของผลกระทบในโปรเจกต์นี้ | จำนวน |
| --- | --- |
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 0 |
| 🔵 Low | 1 |
| ℹ️ Info | 0 |

**สรุปภาพรวม:** ไม่พบการอ่าน/แก้ข้อมูลข้ามคู่ การรับ/หักหัวใจซ้ำ หรือยอดเงินผิดจากการแข่งขันและ retry ในขอบเขตที่ตรวจ ชุด automated เดิมผ่าน 95 tests และชุด browser ใหม่ผ่าน 243 checks local / 242 checks HTTPS พร้อม PWA regression HTTPS 44 checks ข้อคงค้างคือ advisory ของ `braces` ใน dev dependency ซึ่ง npm จัดเป็น High แต่ไม่อยู่ใน Worker ที่เผยแพร่และไม่พบเส้นทางรับ input จากผู้ใช้แอป

การตรวจรอบนี้เพิ่มเฉพาะชุดทดสอบและเอกสาร ไม่เปลี่ยน runtime/API/SQL/dependencies, migration, Cron, Billing หรือบริการ Cloudflare จึงไม่ deploy ซ้ำ รุ่นที่ตรวจคือ `3e036937-0a69-4b10-9623-b932b1a3e428` ใช้ Workers, D1 และ SQLite DO Free เดิม ไม่แตะ R2/แอปการเงิน

---

## 🔍 Detailed Findings

### [SEV-001] 🔵 เครื่องมือ lint มี advisory ที่ยังไม่มีรุ่นแก้ไข (Development dependency advisory)

**Severity:** Low ในบริบทนี้; npm/GitHub จัด advisory ต้นทางเป็น High
**Category:** Dependency & Supply Chain
**Location:** `D:/Tong/แฟน/โปรแกรมคู่รัก/package-lock.json:4387`, `D:/Tong/แฟน/โปรแกรมคู่รัก/package.json:46`

**ปัญหา (Issue):** `eslint-config-next@16.3.8 → @next/eslint-plugin-next → fast-glob → micromatch → braces@3.0.3` มี GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 เกี่ยวกับ stack exhaustion จาก glob ที่ซ้อนลึก `npm audit` แจ้ง High 5 รายการตามสาย dependency เดียวกัน ไม่ใช่ช่องโหว่อิสระ 5 จุด ณ วันที่ตรวจ registry ให้รุ่นล่าสุด 3.0.3 และ GitHub Advisory ระบุว่าไม่มี patched version

**Code ที่มีปัญหา:**

```json
"devDependencies": {
  "eslint-config-next": "16.3.8"
}
```

**Impact (ผลกระทบ):** กระทบกระบวนการ lint หากนำ glob ที่ไม่น่าเชื่อถือเข้า config เส้นทางที่ตรวจใน `node_modules/@next/eslint-plugin-next/dist/utils/get-root-dirs.js` รับ pattern จาก ESLint settings ของโปรเจกต์ ไม่ใช่ API input ของคู่รัก `npm audit --omit=dev` ไม่พบ advisory และ Wrangler metafile ไม่มี `braces`, `micromatch` หรือ `fast-glob` ใน Worker bundle จึงไม่พบเส้นทางโจมตีแอปที่เผยแพร่จาก advisory นี้

**วิธีแก้ (Remediation):** ยังไม่มีรุ่น patched ให้ติดตั้งอย่างตรงจุด คงรุ่น Next.js/ESLint ที่ใช้ร่วมกันและเก็บ finding ไว้ การเสนอ downgrade ไป `eslint-config-next@14.2.35` จาก `npm audit fix --force` ไม่เหมาะกับ Next.js 16.3.8 ของโปรเจกต์นี้

**ขั้นตอน:**
1. ใช้ ESLint config/pattern จากแหล่งที่เชื่อถือได้ต่อไป
2. เมื่อ upstream มี patched release ให้อัปเดตเฉพาะสาย dependency นี้ แล้วรัน audit/lint/typecheck ที่เกี่ยวข้อง

**References:**
- [GitHub Advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- หลักฐาน local: `output/security-audit-before.json`, `output/security-audit-final.json` (exit code 1), `output/security-production-audit.json`, `output/security-metafile.json`

---

## ✅ Action Checklist (ทำตามลำดับ)

### 🔴 ต้องทำทันที (Critical)

ไม่มี finding ระดับนี้ในขอบเขตที่ตรวจ

### 🟠 ทำภายใน 1–2 วัน (High)

ไม่มี finding ที่เปิดเส้นทางโจมตี runtime ระดับนี้ในขอบเขตที่ตรวจ

### 🟡 ทำเมื่อมีเวลา (Medium)

ไม่มี finding ระดับนี้ในขอบเขตที่ตรวจ

### 🔵 พิจารณาทำ (Low)

- [x] **[SEV-001]** ตรวจ production audit และยืนยัน vulnerable dev modules ไม่อยู่ใน Worker bundle
- [ ] **[SEV-001]** อัปเดตเมื่อ upstream มี patched release ที่เข้ากันได้

---

## 💡 Hardening Recommendations เพิ่มเติม

ใช้ชุด `scripts/browser-security.cjs` ตรวจซ้ำเมื่อแก้ Auth, tenant scope, ledger หรือ restore และใช้บัญชี QA แยกพร้อม cleanup แบบ exact whitelist ไม่มีเหตุจากรอบนี้ให้เพิ่ม dependency, schema หรือบริการเสียเงิน

---

## 📝 หมายเหตุ

### ผลที่รันจริง

| Check | ผล |
| --- | --- |
| `npm test` | Passed — 95 tests รวม signature/UV/replay/rate limit, migrations/schema negative tests, tenant boundaries, integer satang, DB constraints, transaction rollback, restore race, Push และ PWA |
| `scripts/browser-security.cjs` ผ่าน Playwright CLI + Edge | Passed — local 243 / HTTPS 242 checks, 4 บัญชี/2 คู่ต่อรอบ, WebAuthn Virtual Authenticator จริงต่อ context, ไม่มี session bypass |
| `scripts/browser-pwa.cjs` HTTPS | Passed — 44 checks รวม commit แล้วคำตอบหายสำหรับ reward/deposit/purchase, ปิด/เปิดหน้าใหม่ด้วย ID เดิม และ offline/reconnect ไม่ replay mutation |
| `npm run lint` / `npm run typecheck` | Passed |
| `npm run db:check:remote` | Passed — ตรวจ schema Auth/Quest/Planning/Journal/Pet/Backup/Push แบบ read-only |
| `npx wrangler deploy --dry-run --outdir output/security-bundle --metafile output/security-metafile.json` | Passed — bundle ได้; ไม่มีการ deploy หรือเปิดบริการใหม่ |
| `npm audit --omit=dev --json` | Passed — 0 vulnerabilities |
| `npm audit --json` | Failed — High 5 รายการจาก `braces` dev dependency เดียวกันตาม SEV-001 |
| Static scan | Passed — 182 public files/3 Worker artifacts/75 source files, เปรียบเทียบ local secret 2 ค่าโดยไม่บันทึกค่า secret, ไม่พบ leak/pattern อันตรายที่กำหนด/ไฟล์ `.map`, `.sql`, `.env`, `.bak`, `.ts` ใน public export |
| HTTPS private-source path probes | Passed — `/.dev.vars`, `/.env.local`, `/wrangler.jsonc`, `/cloudflare/worker.ts`, `/src/lib/auth.ts`, `/package-lock.json`, `/.git/config` ได้ 404 ทั้งหมด |
| `node scripts/check-cpu.mjs output/cpu-security.json 3e036937-0a69-4b10-9623-b932b1a3e428` | Passed — frozen 450 samples, outcomes `ok` ทั้งหมด; Worker สูงสุด 3 ms / DO สูงสุด 44 ms; Cron รอบที่จับได้ Worker 0 ms / `dispatchPush` DO 5 ms |
| QA cleanup | Passed — local 8 บัญชี/4 คู่, remote 8 บัญชี/4 คู่; ตรวจสมาชิก/creator/ledger/rollup ก่อนลบ และ read-back เหลือ 0 |

### ขอบเขตด้านสิทธิ์

- ใหม่: anonymous และ revoked session ถูกปฏิเสธครบ 38 application endpoints (GET 10 / POST 28); POST ทั้ง 28 ถูกปฏิเสธเมื่อ Origin ต่างเว็บหรือหายไป Cookie มี HttpOnly/SameSite=Lax และ HTTPS มี Secure
- Identity มาจาก verified server session; couple มาจาก membership ใน D1 ไม่รับ actor/couple/ราคาเป็นอำนาจจาก client ตรวจ forged fields/assignee/contributor, known foreign UUID, cursor และ unsupported privileged endpoints
- ทดสอบข้ามคู่กับ Quest, Goal/Date/Wish/Event, deposit/reversal, memory/letter, signed photo และ encrypted backup/restore job ข้อมูลของอีกคู่คงเดิมหลังคำขอโจมตีและการแข่งขัน
- ลิงก์รูปผูก user/session; ลิงก์ของ partner ใช้กับอีก session ไม่ได้ แต่แต่ละคนขอลิงก์ของตัวเองได้ จดหมายอนาคตไม่มี body ใน state และ read API ได้ 404 สำหรับสมาชิกทั้งสอง; opened letter ของอีกคู่ยังอ่านไม่ได้
- `backup/cancel` ของคู่ต่างกันคืน generic success โดย DELETE ไม่ตรง scope เป็น no-op ชุดทดสอบยืนยัน job เจ้าของยังอยู่และ incomplete restore ถูกปฏิเสธ ไม่ตีความ HTTP 200 นี้เป็นการลบ job ข้ามคู่
- Stored HTML-like title ถูก render เป็นข้อความ ตรวจว่าไม่เกิด `<img src=x>` หรือ script execution
- `tests/push.test.ts` เดิมที่รันรอบนี้ตรวจสิทธิ์แยกเจ้าของอุปกรณ์/คู่, session expiry/logout, SSRF/redirect guard, preferences และ delivery claim/retry; ไม่ส่ง Push ใหม่ไปเครื่องคนจริงในรอบ audit

### ขอบเขตด้านยอดและ concurrency

- แข่งไม่เกิน 6 คำขอต่อรอบจากสอง authenticated contexts: quest ใช้ทั้ง ID ซ้ำและ ID ต่างกันได้ award เพียงครั้งเดียว; stale edit สองฟอร์มสำเร็จหนึ่ง/409 หนึ่ง
- แข่ง redeem รางวัล 80 หัวใจกับซื้อไอเทม 50 หัวใจจากยอดตั้งต้น 80: ใช้ได้เพียงรายการเดียวและ wallet ไม่ติดลบ Local รางวัลชนะ เหลือ 0; HTTPS ไอเทมชนะ เหลือ 30 Ledger มี charge เดียว และ partner retry ID ผู้ชนะไม่หักซ้ำแม้ยอดไม่พอแล้ว
- Deposit เดียว 12,345 สตางค์ส่งซ้ำจากทั้งคู่เกิดครั้งเดียว เปลี่ยนจำนวนหรือ contributor ด้วย ID เดิมได้ 409 Deposit ต่าง ID รวม 400 สตางค์ครบ และ reversal ของรายการเดิมพร้อมกันเกิดครั้งเดียว คงประวัติ/ยอดผู้ร่วมออมตรงกัน
- จำลอง commit อีก 999 สตางค์แล้ว abort response; partner retry ไม่เพิ่มซ้ำ ยอดจบ 1,399 สตางค์ตรงกับประวัติ การใช้ ledger UUID เดียวกันในอีกคู่ยังเป็นรายการอิสระของคู่นั้น
- Feed พร้อมกันได้หนึ่งมื้อใน cooldown ร่วม 4 ชั่วโมง `tests` เดิมตรวจ atomic cap/negative balance/immutable ledger/trigger rollback, item ownership, reset ตามเวลาไทย และ restore conflict/parallel commit ด้วย
- จำนวน browser checks ต่างกันหนึ่งข้อเพราะกรณี feed มี retry assertion เพิ่มเมื่อผู้ชนะเป็น ID ที่ซ้ำใน batch; ทุก invariant หลักรันทั้งสอง origin ไม่ใช่การข้ามข้อที่ล้มเหลว

### หลักฐานและข้อจำกัด

หลักฐานอยู่ใน `output/security-baseline-tests.txt`, `output/security-local-result.json`, `output/security-remote-result.json`, `output/security-pwa-result.json`, `output/security-static-result.json`, `output/security-public-paths.json`, `output/security-schema-check.txt`, `output/security-cpu-check.txt` และ `output/cpu-security.json` ไม่มี header/cookie/request body/secret/RPC arguments ใน CPU artifact

Local รอบแรกหยุดที่ expectation ว่า foreign `backup/cancel` ต้อง error; ตรวจ implementation และแก้ assertion ให้ทดสอบ no-op พร้อมยืนยัน job เจ้าของยังอยู่ แล้วรันใหม่จนผ่าน ล้างทั้ง cohort แรก `mvb3u9xw` และรอบผ่าน `mvb3v5au` Remote cohorts `mvb3wzv4`, `mvb41f9o` ถูกล้างแล้ว ไม่แตะข้อมูลบัญชีจริง ปิด QA browser, preview port 3018 และ CPU Tail แล้ว

ไม่พบ exploit ในกรณีที่ตรวจ ไม่ใช่การรับรองว่าไม่มีช่องโหว่ทุกชนิด การทดสอบ browser ใช้ Virtual Authenticator/หลาย contexts บนเครื่อง QA เดียว ไม่ใช่ iPhone/Android หรือคนละเครือข่ายจริง; SQL concurrency ทดสอบผ่าน D1 และคำขอพร้อมกัน ไม่ได้ทำ distributed load test ไม่มี Git repository ให้ตรวจประวัติ commit ไม่มีการอ่าน production secret กลับมาเทียบค่า Static scan ระบุเฉพาะค่า local secret และ pattern ที่ตรวจ Full Next build ไม่ได้รันใหม่เพราะไม่มี application source/config เปลี่ยน; ใช้ static export ที่เผยแพร่เดิมและ dry-run bundle ตรวจ server imports

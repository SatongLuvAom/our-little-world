import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { handleAuthRequest } from "../src/lib/auth-handler";
import { createAuth } from "../src/lib/auth";
import { checkAuthSchema } from "../scripts/check-auth-schema";
import { handleRequest } from "../cloudflare/worker";
import {
  addSavingsEntry,
  deletePlanningRecord,
  getPlanningState,
  getSavingsHistory,
  reverseSavingsEntry,
  savePlanningRecord,
} from "../src/lib/planning-service";
import { anniversaryDay } from "../src/lib/planning-schema";
import {
  completeQuest,
  deleteQuest,
  getQuestHistory,
  getQuestState,
  questDay,
  redeemReward,
  saveQuest,
} from "../src/lib/quest-service";
import {
  acceptInvitation,
  createCouple,
  createInvitation,
  getAccountContext,
  revokeInvitation,
  tokenHash,
} from "../src/lib/pairing";

import { serializeSignedCookie } from "better-call";

test(
  "Cloudflare D1 migrations, passkey boundaries and tenant isolation",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
    const configPath = resolve(
      ".wrangler",
      "test-d1-" + crypto.randomUUID() + ".jsonc",
    );
    await mkdir(".wrangler", { recursive: true });
    // This suite executes D1 SQL directly. Browser suites exercise the actual Durable Object entrypoint.
    await writeFile(
      configPath,
      JSON.stringify({
        name: config.name,
        compatibility_date: config.compatibility_date,
        compatibility_flags: config.compatibility_flags,
        d1_databases: config.d1_databases,
      }),
    );
    t.after(() => unlink(configPath));
    const platform = await getPlatformProxy<CloudflareEnv>({
      configPath,
      persist: false,
      remoteBindings: false,
      envFiles: [],
    });
    t.after(() => platform.dispose());
    const env = {
      ...platform.env,
      APP_URL: "http://localhost:3017",
      BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
    };
    const db = env.DB;
    for (const file of (await readdir("cloudflare/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      for (const statement of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(statement).run();
    }
    await t.test(
      "deployment schema check accepts all applied migrations",
      async () => {
        await checkAuthSchema(env);
      },
    );
    const users = new Map<string, string>(),
      cookies = new Map<string, string>();
    const internal = (await createAuth(env).$context).internalAdapter;
    // Pairing fixtures use the library's session signer. Browser tests perform real WebAuthn ceremonies.
    for (const name of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) {
      const user = await internal.createUser(
        {
          name: "Member " + name,
          email: "test_" + name + "@accounts.our-little-world.invalid",
          username: "test_" + name,
          emailVerified: false,
        },
        { method: "test-fixture" },
      );
      const session = await internal.createSession(user.id);
      users.set(name, user.id);
      cookies.set(
        name,
        (
          await serializeSignedCookie(
            "olw.session_token",
            session.token,
            env.BETTER_AUTH_SECRET,
            { path: "/", httpOnly: true, sameSite: "lax" },
          )
        ).split(";")[0],
      );
    }
    const uid = (name: string) => users.get(name)!;
    const request = (
      path: string,
      body?: unknown,
      cookie?: string,
      origin = env.APP_URL,
      ip = "198.51.100.1",
    ) =>
      handleAuthRequest(
        new Request(env.APP_URL + "/api/auth" + path, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "cf-connecting-ip": ip,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
      );
    await t.test(
      "passkey-first options validate identity, require UV/resident keys, and do not create an account",
      async () => {
        const invalid = await request(
          "/passkey/generate-register-options?context=" +
            encodeURIComponent(
              JSON.stringify({ username: "!", display_name: "" }),
            ),
        );
        assert.equal(invalid.status, 400);
        const options = await request(
          "/passkey/generate-register-options?context=" +
            encodeURIComponent(
              JSON.stringify({
                username: "new_member",
                display_name: "New member",
                user_id: uid("a"),
              }),
            ),
        );
        assert.equal(options.status, 200);
        const data = (await options.json()) as {
          rp: { id: string };
          authenticatorSelection: {
            residentKey: string;
            userVerification: string;
          };
        };
        assert.equal(data.rp.id, "localhost");
        assert.equal(data.authenticatorSelection.residentKey, "required");
        assert.equal(data.authenticatorSelection.userVerification, "required");
        assert.ok(
          options.headers
            .getSetCookie()
            .some((c) => c.includes("HttpOnly") && /SameSite=Lax/i.test(c)),
        );
        assert.equal(
          await db
            .prepare("SELECT id FROM auth_users WHERE username='new_member'")
            .first(),
          null,
        );
        assert.equal(
          (
            await request("/passkey/verify-registration", {
              response: { id: "fake" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/sign-up/email", {
              username: "attack",
              password: "anything",
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request("/sign-in/username", {
              username: "test_a",
              password: "anything",
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM auth_accounts WHERE password IS NOT NULL",
              )
              .first<{ n: number }>()
          )?.n,
          0,
        );
      },
    );
    await t.test(
      "signed sessions verify against D1; forged sessions fail and logout revokes access",
      async () => {
        assert.equal(
          (
            await createAuth(env).api.getSession({
              headers: new Headers({ Cookie: cookies.get("a")! }),
            })
          )?.user.id,
          uid("a"),
        );
        assert.equal(
          await createAuth(env).api.getSession({
            headers: new Headers({
              Cookie: "olw.session_token=forged." + uid("c"),
            }),
          }),
          null,
        );
        const old = cookies.get("h")!;
        assert.equal((await request("/sign-out", {}, old)).status, 200);
        assert.equal(
          await createAuth(env).api.getSession({
            headers: new Headers({ Cookie: old }),
          }),
          null,
        );
      },
    );
    await t.test(
      "expired D1 sessions cannot read or mutate any API family while a partner remains signed in",
      async () => {
        const user = await internal.createUser({
          name: "Expiry fixture",
          email: "expiry_fixture@accounts.our-little-world.invalid",
          username: "expiry_fixture",
          emailVerified: false,
        }, { method: "test-fixture" });
        const session = await internal.createSession(user.id);
        const cookie = (await serializeSignedCookie(
          "olw.session_token", session.token, env.BETTER_AUTH_SECRET,
          { path: "/", httpOnly: true, sameSite: "lax" },
        )).split(";")[0];
        const couple = await createCouple(db, user.id, questDay());
        const partner = await internal.createUser({
          name: "Expiry partner",
          email: "expiry_partner@accounts.our-little-world.invalid",
          username: "expiry_partner",
          emailVerified: false,
        }, { method: "test-fixture" });
        const partnerSession = await internal.createSession(partner.id);
        const partnerCookie = (await serializeSignedCookie(
          "olw.session_token", partnerSession.token, env.BETTER_AUTH_SECRET,
          { path: "/", httpOnly: true, sameSite: "lax" },
        )).split(";")[0];
        await acceptInvitation(db, partner.id, (await createInvitation(db, user.id)).token);
        await db.prepare("UPDATE auth_sessions SET expiresAt = ? WHERE id = ?")
          .bind(Date.now() - 1000, session.id).run();
        const reads = ["account/context", "quests/state", "planning/state", "journal/state", "pet/state", "push/state", "diagnostics/state"];
        const writes = ["account/profile", "quests/complete", "planning/deposit", "journal/save", "pet/feed", "backup/start", "push/test", "diagnostics/report"];
        for (const [method, paths] of [["GET", reads], ["POST", writes]] as const) {
          for (const path of paths) {
            const response = await handleRequest(new Request(env.APP_URL + "/api/" + path, {
              method,
              headers: { Cookie: cookie, Origin: env.APP_URL, "Content-Type": "application/json" },
              ...(method === "POST" ? { body: "{}" } : {}),
            }), env);
            assert.equal(response.status, 401, method + " " + path);
            assert.match(response.headers.get("Cache-Control")!, /no-store/);
            assert.ok(!(await response.text()).includes(user.id));
          }
        }
        assert.equal(await createAuth(env).api.getSession({ headers: new Headers({ Cookie: partnerCookie }) }).then(s => s?.user.id), partner.id);
        assert.equal((await getAccountContext(db, partner.id)).couple?.id, couple);
        for (const table of ["heart_entries", "savings_entries", "pet_feeds"])
          assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table} WHERE couple_id = ?`).bind(couple).first<{ n: number }>())?.n, 0);
      },
    );
    await t.test(
      "expired WebAuthn challenges reject verification and cannot create sessions",
      async () => {
        const options = await request("/passkey/generate-authenticate-options", undefined, undefined, env.APP_URL, "198.51.100.240");
        assert.equal(options.status, 200);
        const { challenge } = await options.json() as { challenge: string };
        const cookie = options.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
        assert.ok(cookie);
        const expired = await db.prepare("UPDATE auth_verifications SET expiresAt = ? WHERE json_extract(value, '$.expectedChallenge') = ? RETURNING id")
          .bind(Date.now() - 1000, challenge).all();
        assert.equal(expired.results.length, 1);
        const before = await db.prepare("SELECT count(*) AS n FROM auth_sessions").first<{ n: number }>();
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await request("/passkey/verify-authentication", {
            response: { id: "expired-fixture", rawId: "expired-fixture", type: "public-key", response: { clientDataJSON: "AA", authenticatorData: "AA", signature: "AA" } },
          }, cookie, env.APP_URL, "198.51.100.240");
          assert.equal(response.status, 400);
          assert.equal((await response.json() as { code: string }).code, "CHALLENGE_NOT_FOUND");
        }
        assert.equal((await db.prepare("SELECT count(*) AS n FROM auth_sessions").first<{ n: number }>())?.n, before?.n);
      },
    );
    await t.test(
      "auth rejects cross-origin requests, missing origins, and unexposed writes",
      async () => {
        for (const origin of ["https://evil.example", "null", ""])
          assert.equal(
            (
              await request(
                "/passkey/verify-authentication",
                { response: {} },
                undefined,
                origin,
              )
            ).status,
            403,
          );
        assert.equal(
          (
            await request(
              "/passkey/generate-authenticate-options",
              undefined,
              undefined,
              "https://evil.example",
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "/update-user",
              { name: "Hacked", id: uid("c") },
              cookies.get("a"),
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "/passkey/delete-passkey",
              { id: crypto.randomUUID() },
              cookies.get("a"),
            )
          ).status,
          404,
        );
      },
    );
    let coupleA: string,
      coupleC: string,
      inviteA: Awaited<ReturnType<typeof createInvitation>>;
    await t.test(
      "creating a couple is idempotent; only token hashes are stored",
      async () => {
        coupleA = await createCouple(db, uid("a"), "2024-02-14");
        assert.equal(await createCouple(db, uid("a"), "2025-02-14"), coupleA);
        inviteA = await createInvitation(db, uid("a"));
        const stored = await db
          .prepare("SELECT token_hash FROM invitations WHERE id = ?")
          .bind(inviteA.id)
          .first<{ token_hash: string }>();
        assert.equal(stored?.token_hash, await tokenHash(inviteA.token));
        assert.notEqual(stored?.token_hash, inviteA.token);
        assert.equal(
          await acceptInvitation(db, uid("b"), inviteA.token),
          coupleA,
        );
        assert.equal(
          await acceptInvitation(db, uid("b"), inviteA.token),
          coupleA,
        );
        await assert.rejects(acceptInvitation(db, uid("f"), inviteA.token));
      },
    );
    await t.test(
      "each couple sees only its own members and invitation metadata",
      async () => {
        coupleC = await createCouple(db, uid("c"), "2025-03-01");
        const invite = await createInvitation(db, uid("c"));
        await assert.rejects(
          revokeInvitation(db, uid("a"), invite.id),
          /invitation_unavailable/,
        );
        await assert.rejects(
          acceptInvitation(db, uid("b"), invite.token),
          /already_paired/,
        );
        await acceptInvitation(db, uid("d"), invite.token);
        const a = await getAccountContext(db, uid("a")),
          c = await getAccountContext(db, uid("c"));
        assert.equal(a.couple?.id, coupleA);
        assert.equal(c.couple?.id, coupleC);
        assert.deepEqual(
          a.couple?.members.map((m) => m.id).sort(),
          [uid("a"), uid("b")].sort(),
        );
        assert.deepEqual(
          c.couple?.members.map((m) => m.id).sort(),
          [uid("c"), uid("d")].sort(),
        );
        assert.equal((await getAccountContext(db, uid("f"))).couple, null);
        assert.ok(!JSON.stringify(a).includes("token_hash"));
      },
    );
    await t.test(
      "database constraints prevent third members and moving membership",
      async () => {
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO couple_members(couple_id,user_id,joined_at) VALUES(?,?,?)",
            )
            .bind(coupleA, uid("f"), Date.now())
            .run(),
          /couple_full/,
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE couple_members SET couple_id = ? WHERE user_id = ?",
            )
            .bind(coupleC, uid("b"))
            .run(),
          /membership_immutable/,
        );
      },
    );
    await t.test(
      "concurrent accept requests produce exactly one second member",
      async () => {
        const e = await createCouple(db, uid("e"), "2026-01-01"),
          invite = await createInvitation(db, uid("e"));
        const race = await Promise.allSettled([
          acceptInvitation(db, uid("f"), invite.token),
          acceptInvitation(db, uid("g"), invite.token),
        ]);
        assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          (
            await db
              .prepare(
                "SELECT count(*) AS n FROM couple_members WHERE couple_id = ?",
              )
              .bind(e)
              .first<{ n: number }>()
          )?.n,
          2,
        );
        const winner = race[0].status === "fulfilled" ? uid("f") : uid("g");
        assert.equal(await acceptInvitation(db, winner, invite.token), e);
      },
    );
    await t.test(
      "expired, rotated and revoked invites cannot pair an account",
      async () => {
        await createCouple(db, uid("h"), "2026-01-01");
        const candidate = (await getAccountContext(db, uid("f"))).couple
          ? uid("g")
          : uid("f");
        const expired = await createInvitation(db, uid("h"));
        await db
          .prepare("UPDATE invitations SET expires_at = ? WHERE id = ?")
          .bind(Date.now() - 1, expired.id)
          .run();
        await assert.rejects(
          acceptInvitation(db, candidate, expired.token),
          /invitation_unavailable/,
        );
        const rotated = await createInvitation(db, uid("h"));
        const active = await createInvitation(db, uid("h"));
        await assert.rejects(
          acceptInvitation(db, candidate, rotated.token),
          /invitation_unavailable/,
        );
        await revokeInvitation(db, uid("h"), active.id);
        await assert.rejects(
          acceptInvitation(db, candidate, active.token),
          /invitation_unavailable/,
        );
        assert.equal((await getAccountContext(db, candidate)).couple, null);
      },
    );

    await t.test(
      "passkey challenge endpoints enforce a persistent rate limit",
      async () => {
        const challenge = () =>
          request(
            "/passkey/generate-authenticate-options",
            undefined,
            undefined,
            env.APP_URL,
            "198.51.100.90",
          );
        for (let i = 0; i < 29; i++)
          assert.equal((await challenge()).status, 200);
        const race = await Promise.all([
          challenge(),
          challenge(),
          challenge(),
          challenge(),
        ]);
        assert.equal(race.filter((r) => r.status === 200).length, 1);
        assert.equal(race.filter((r) => r.status === 429).length, 3);
        assert.ok(
          Number(
            race.find((r) => r.status === 429)?.headers.get("Retry-After"),
          ) > 0,
        );
        await db
          .prepare("UPDATE auth_rate_limit SET lastRequest=? WHERE key=?")
          .bind(
            Date.now() - 60001,
            "olw:/passkey/generate-authenticate-options:198.51.100.90",
          )
          .run();
        assert.equal((await challenge()).status, 200);
      },
    );
    await t.test(
      "Worker API derives identity from the session and validates every write",
      async () => {
        const api = (
          path: string,
          body?: unknown,
          cookie?: string,
          origin = env.APP_URL,
        ) =>
          handleRequest(
            new Request(env.APP_URL + "/api/account/" + path, {
              method: body === undefined ? "GET" : "POST",
              headers: {
                Origin: origin,
                "Content-Type": "application/json",
                ...(cookie ? { Cookie: cookie } : {}),
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }),
            env,
          );
        assert.equal((await api("context")).status, 401);
        assert.equal(
          (await api("profile", { display_name: "Unauthorized" })).status,
          401,
        );
        assert.equal(
          (
            await api(
              "profile",
              { display_name: "Unauthorized" },
              cookies.get("a"),
              "https://evil.example",
            )
          ).status,
          403,
        );
        const own = await api(
          "context?user_id=" + uid("c"),
          undefined,
          cookies.get("a"),
        );
        assert.equal(
          ((await own.json()) as { profile: { id: string } }).profile.id,
          uid("a"),
        );
        assert.equal(
          (await api("couple", { anniversary: "2099-01-01" }, cookies.get("a")))
            .status,
          400,
        );
        assert.equal(
          (
            await api(
              "revoke",
              { invitation_id: crypto.randomUUID() },
              cookies.get("a"),
            )
          ).status,
          400,
        );
        const other = await getAccountContext(db, uid("c"));
        assert.equal(
          (
            await api(
              "profile",
              { display_name: "API Member A", user_id: uid("c") },
              cookies.get("a"),
            )
          ).status,
          200,
        );
        assert.equal(
          (await getAccountContext(db, uid("a"))).profile.display_name,
          "API Member A",
        );
        assert.equal(
          (await getAccountContext(db, uid("c"))).profile.display_name,
          other.profile.display_name,
        );
        assert.equal(
          (
            await api(
              "profile",
              { display_name: "x".repeat(5000) },
              cookies.get("a"),
            )
          ).status,
          413,
        );
      },
    );

    await t.test(
      "HTTPS passkey challenge cookies are Secure and HttpOnly",
      async () => {
        const httpsEnv = { ...env, APP_URL: "https://auth.example.test" };
        const response = await handleAuthRequest(
          new Request(
            httpsEnv.APP_URL +
              "/api/auth/passkey/generate-authenticate-options",
          ),
          httpsEnv,
        );
        assert.equal(response.status, 200);
        assert.ok(
          response.headers
            .getSetCookie()
            .some((c) => c.includes("Secure") && c.includes("HttpOnly")),
        );
      },
    );
    const questApi = (
      operation: string,
      body?: unknown,
      name = "a",
      origin = env.APP_URL,
    ) =>
      handleRequest(
        new Request(env.APP_URL + "/api/quests/" + operation, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...(name ? { Cookie: cookies.get(name)! } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
      );
    const draft = (overrides = {}) => ({
      id: crypto.randomUUID(),
      title: "ดูแลกัน",
      assignee_id: null,
      due: questDay(),
      repeat: "รายวัน",
      hearts: 40,
      version: 0,
      ...overrides,
    });
    await t.test(
      "Phase 2 starts empty, separates tenants and rejects forged actor/price/ledger writes",
      async () => {
        const state = await getQuestState(db, uid("a"));
        assert.equal(state.balance, 0);
        assert.equal(state.quests.length, 0);
        assert.equal(state.rewards.find((r) => r.id === "massage")?.cost, 40);
        assert.equal((await questApi("state", undefined, "")).status, 401);
        assert.equal((await questApi("state", undefined, "i")).status, 403);
        assert.equal(
          (await questApi("save", draft(), "a", "https://evil.test")).status,
          403,
        );
        for (const body of [
          { ...draft(), couple_id: coupleC },
          { ...draft(), user_id: uid("c") },
          { ...draft(), hearts: 0 },
          { ...draft(), hearts: 1.5 },
          { ...draft(), due: "2026-02-30" },
        ])
          assert.equal((await questApi("save", body)).status, 400);
        assert.equal(
          (
            await questApi("redeem", {
              reward_id: "massage",
              request_id: crypto.randomUUID(),
              cost: 1,
            })
          ).status,
          400,
        );
        assert.equal((await questApi("ledger", { amount: 5000 })).status, 404);
        assert.equal((await questApi("history?before=bad")).status, 400);
        assert.equal((await getQuestState(db, uid("c"))).balance, 0);
      },
    );
    const shared = draft();
    await t.test(
      "shared CRUD persists, retries creation and rejects stale edits/cross-couple IDs",
      async () => {
        await saveQuest(db, uid("a"), shared);
        await saveQuest(db, uid("a"), shared);
        const b = await getQuestState(db, uid("b"));
        assert.equal(b.quests.length, 1);
        assert.equal(b.quests[0].id, shared.id);
        assert.equal((await getQuestState(db, uid("c"))).quests.length, 0);
        await assert.rejects(
          saveQuest(db, uid("c"), { ...shared, version: 1 }),
        );
        await assert.rejects(deleteQuest(db, uid("c"), { id: shared.id }));
        await assert.rejects(
          completeQuest(db, uid("c"), {
            id: shared.id,
            request_id: crypto.randomUUID(),
          }),
        );
        await assert.rejects(
          saveQuest(db, uid("a"), draft({ assignee_id: uid("c") })),
        );
        await saveQuest(db, uid("b"), {
          ...shared,
          version: 1,
          title: "ดูแลกันจริง",
        });
        await assert.rejects(
          saveQuest(db, uid("a"), { ...shared, version: 1 }),
        );
        assert.equal(
          (await getQuestState(db, uid("a"))).quests[0].title,
          "ดูแลกันจริง",
        );
      },
    );
    await t.test(
      "simultaneous completions from both partners with distinct IDs award once",
      async () => {
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            completeQuest(db, uid(i % 2 ? "a" : "b"), {
              id: shared.id,
              request_id: crypto.randomUUID(),
            }),
          ),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        const state = await getQuestState(db, uid("b"));
        assert.equal(state.balance, 40);
        assert.equal(state.completionCount, 1);
        assert.equal(state.quests[0].done, true);
        assert.equal(state.history.entries.length, 1);
        await assert.rejects(
          saveQuest(db, uid("a"), {
            ...shared,
            version: 2,
            repeat: "ครั้งเดียว",
          }),
        );
        await assert.rejects(
          db
            .prepare("UPDATE quests SET repeat='ครั้งเดียว' WHERE id=?")
            .bind(shared.id)
            .run(),
          /quest_repeat_locked/,
        );
      },
    );
    await t.test(
      "simultaneous same-ID redemption retries spend once and remain successful with zero balance",
      async () => {
        const request_id = crypto.randomUUID();
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            redeemReward(db, uid(i % 2 ? "a" : "b"), {
              reward_id: "massage",
              request_id,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        assert.equal((await getQuestState(db, uid("a"))).balance, 0);
        assert.deepEqual(
          await redeemReward(db, uid("b"), {
            reward_id: "massage",
            request_id,
          }),
          { applied: false },
        );
        await assert.rejects(
          redeemReward(db, uid("a"), { reward_id: "movie", request_id }),
          /รหัสคำขอ/,
        );
        await assert.rejects(
          completeQuest(db, uid("a"), { id: shared.id, request_id }),
          /รหัสคำขอ/,
        );
      },
    );
    await t.test(
      "competing spends with different IDs cannot overdraw; failed spend has no ledger row",
      async () => {
        const q = draft();
        await saveQuest(db, uid("a"), q);
        await completeQuest(db, uid("a"), {
          id: q.id,
          request_id: crypto.randomUUID(),
        });
        const before = (await getQuestState(db, uid("a"))).history.entries
          .length;
        const results = await Promise.allSettled(
          Array.from({ length: 12 }, (_, i) =>
            redeemReward(db, uid(i % 2 ? "a" : "b"), {
              reward_id: "massage",
              request_id: crypto.randomUUID(),
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const state = await getQuestState(db, uid("b"));
        assert.equal(state.balance, 0);
        assert.equal(state.history.entries.length, before + 1);
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO heart_entries(couple_id,id,kind,actor_id,reward_id,title,amount,created_at) VALUES(?,?,'redemption',?,'massage','bad',-40,?)",
            )
            .bind(coupleA, crypto.randomUUID(), uid("a"), Date.now())
            .run(),
          /insufficient_hearts/,
        );
        await assert.rejects(
          db
            .prepare("UPDATE heart_entries SET amount=500 WHERE couple_id=?")
            .bind(coupleA)
            .run(),
          /heart_entry_immutable/,
        );
      },
    );
    await t.test(
      "assignees, due date, server price and soft deletion preserve authorization/history",
      async () => {
        const q = draft({ assignee_id: uid("b") });
        await saveQuest(db, uid("a"), q);
        await assert.rejects(
          completeQuest(db, uid("a"), {
            id: q.id,
            request_id: crypto.randomUUID(),
          }),
        );
        await completeQuest(db, uid("b"), {
          id: q.id,
          request_id: crypto.randomUUID(),
        });
        const future = draft({ due: "2099-01-01" });
        await saveQuest(db, uid("a"), future);
        await assert.rejects(
          completeQuest(db, uid("a"), {
            id: future.id,
            request_id: crypto.randomUUID(),
          }),
        );
        await db
          .prepare("UPDATE reward_catalog SET cost=45 WHERE id='massage'")
          .run();
        await assert.rejects(
          redeemReward(db, uid("a"), {
            reward_id: "massage",
            request_id: crypto.randomUUID(),
          }),
        );
        await db
          .prepare("UPDATE reward_catalog SET cost=40 WHERE id='massage'")
          .run();
        const old = await getQuestState(db, uid("a"));
        await deleteQuest(db, uid("b"), { id: q.id });
        await deleteQuest(db, uid("a"), { id: q.id });
        const state = await getQuestState(db, uid("a"));
        assert.equal(state.balance, old.balance);
        assert.equal(state.completionCount, old.completionCount);
        assert.equal(
          state.quests.some((item) => item.id === q.id),
          false,
        );
        await assert.rejects(saveQuest(db, uid("a"), q));
        assert.deepEqual(
          await completeQuest(db, uid("a"), {
            id: q.id,
            request_id: crypto.randomUUID(),
          }),
          { applied: false },
        );
      },
    );
    await t.test(
      "Thai midnight/Monday boundaries and once periods use server time, never client input",
      async () => {
        assert.equal(
          questDay(Date.parse("2026-10-18T16:59:59Z")),
          "2026-10-18",
        );
        assert.equal(
          questDay(Date.parse("2026-10-18T17:00:00Z")),
          "2026-10-19",
        );
        const original = Date.now;
        try {
          Date.now = () => Date.parse("2026-10-18T16:59:59Z");
          const qs = [
            draft({ repeat: "รายวัน", due: "2026-10-01" }),
            draft({ repeat: "รายสัปดาห์", due: "2026-10-01" }),
            draft({ repeat: "ครั้งเดียว", due: "2026-10-01" }),
          ];
          for (const q of qs) {
            await saveQuest(db, uid("c"), q);
            await completeQuest(db, uid("c"), {
              id: q.id,
              request_id: crypto.randomUUID(),
            });
          }
          Date.now = () => Date.parse("2026-10-18T17:00:00Z");
          for (const q of qs)
            assert.equal(
              (
                await completeQuest(db, uid("d"), {
                  id: q.id,
                  request_id: crypto.randomUUID(),
                })
              ).applied,
              q.repeat !== "ครั้งเดียว",
            );
          const state = await getQuestState(db, uid("c"));
          assert.equal(state.balance, 200);
          assert.equal(state.completionCount, 5);
        } finally {
          Date.now = original;
        }
        assert.equal(
          (
            await questApi("complete", {
              id: shared.id,
              request_id: crypto.randomUUID(),
              day: "2099-01-01",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "wallet rollup failure rolls the event back; materialized totals equal the immutable ledger",
      async () => {
        const q = draft({ hearts: 3 });
        await saveQuest(db, uid("a"), q);
        const request_id = crypto.randomUUID();
        const before = await getQuestState(db, uid("a"));
        await db
          .prepare(
            "CREATE TRIGGER qa_wallet_failure BEFORE UPDATE ON heart_wallets BEGIN SELECT RAISE(ABORT,'qa_wallet_failure'); END",
          )
          .run();
        try {
          await assert.rejects(
            completeQuest(db, uid("a"), { id: q.id, request_id }),
            /qa_wallet_failure/,
          );
          assert.equal(
            await db
              .prepare(
                "SELECT id FROM heart_entries WHERE couple_id=? AND id=?",
              )
              .bind(coupleA, request_id)
              .first(),
            null,
          );
          assert.equal(
            (await getQuestState(db, uid("a"))).balance,
            before.balance,
          );
        } finally {
          await db.prepare("DROP TRIGGER qa_wallet_failure").run();
        }
        assert.deepEqual(
          await completeQuest(db, uid("b"), { id: q.id, request_id }),
          { applied: true },
        );
        const actual = await getQuestState(db, uid("b"));
        const sum = await db
          .prepare(
            "SELECT sum(amount) AS balance,sum(kind='completion') AS count FROM heart_entries WHERE couple_id=?",
          )
          .bind(coupleA)
          .first<{ balance: number; count: number }>();
        assert.equal(actual.balance, sum!.balance);
        assert.equal(actual.completionCount, sum!.count);
      },
    );
    await t.test(
      "history uses bounded tenant-scoped keyset pagination, including equal timestamps",
      async () => {
        const at = Date.now();
        for (let i = 0; i < 35; i++) {
          const q = draft({ hearts: 1 });
          await saveQuest(db, uid("a"), q);
          await db
            .prepare(
              "INSERT INTO heart_entries(couple_id,id,kind,actor_id,quest_id,period,title,amount,created_at) VALUES(?,?,'completion',?,?,'once','history',1,?)",
            )
            .bind(coupleA, crypto.randomUUID(), uid("a"), q.id, at)
            .run();
        }
        const state = await getQuestState(db, uid("a"));
        assert.equal(state.history.entries.length, 30);
        assert.ok(state.history.nextCursor);
        const older = await getQuestHistory(
          db,
          uid("b"),
          state.history.nextCursor,
        );
        assert.equal(older.entries.length, state.completionCount + 2 - 30);
        assert.equal(
          new Set([...state.history.entries, ...older.entries].map((e) => e.id))
            .size,
          state.completionCount + 2,
        );
        assert.equal(
          (await getQuestHistory(db, uid("c"), state.history.nextCursor))
            .entries.length,
          0,
        );
        assert.equal(
          (await questApi("state?couple_id=" + coupleC)).headers.get(
            "Cache-Control",
          ),
          "private, no-store",
        );
      },
    );
    const planningApi = (
      operation: string,
      body?: unknown,
      name = "a",
      origin = env.APP_URL,
    ) =>
      handleRequest(
        new Request(env.APP_URL + "/api/planning/" + operation, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...(name ? { Cookie: cookies.get(name)! } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
      );
    const goal = {
      kind: "goal",
      id: crypto.randomUUID(),
      title: "ทริปของเรา",
      target_cents: 100000,
      due: questDay(),
      version: 0,
    };
    const deposit = (overrides = {}) => ({
      id: crypto.randomUUID(),
      goal_id: goal.id,
      contributor_id: uid("a"),
      amount_cents: 101,
      note: "ออมด้วยกัน",
      ...overrides,
    });
    await t.test(
      "Phase 3 starts empty and validates integer satang, membership and API boundaries",
      async () => {
        const initial = await getPlanningState(db, uid("a"));
        assert.equal(initial.goals.length, 0);
        assert.equal(initial.history.entries.length, 0);
        assert.equal((await planningApi("state", undefined, "")).status, 401);
        assert.equal((await planningApi("state", undefined, "i")).status, 403);
        assert.equal(
          (await planningApi("save", goal, "a", "https://evil.test")).status,
          403,
        );
        for (const amount of [0, -1, 1.5, 1000000001, "100", true, null])
          assert.equal(
            (await planningApi("deposit", deposit({ amount_cents: amount })))
              .status,
            400,
          );
        assert.equal(
          (await planningApi("deposit", { ...deposit(), user_id: uid("c") }))
            .status,
          400,
        );
        assert.equal(
          (await planningApi("save", { ...goal, target_cents: 1.01 })).status,
          400,
        );
        assert.equal((await planningApi("history?before=bad")).status, 400);
        assert.equal(
          (await planningApi("ledger", { amount_cents: 100 })).status,
          404,
        );
        assert.equal(
          (await planningApi("delete", { kind: "goal", id: goal.id })).status,
          400,
        );
        await savePlanningRecord(db, uid("a"), goal);
        await savePlanningRecord(db, uid("b"), goal);
        assert.equal((await getPlanningState(db, uid("b"))).goals.length, 1);
      },
    );
    await t.test(
      "concurrent duplicate deposits add exact satang once, attribute contributor separately from actor",
      async () => {
        const entry = deposit({ contributor_id: uid("b") });
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            addSavingsEntry(db, uid(i % 2 ? "a" : "b"), entry),
          ),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        assert.deepEqual(await addSavingsEntry(db, uid("a"), entry), {
          applied: false,
        });
        const state = await getPlanningState(db, uid("b"));
        assert.equal(state.goals[0].total_cents, 101);
        assert.equal(state.goals[0].contributions[uid("b")], 101);
        assert.equal(state.history.entries.length, 1);
        for (const changes of [
          { amount_cents: 102 },
          { contributor_id: uid("a") },
          { note: "เปลี่ยน" },
        ])
          await assert.rejects(
            addSavingsEntry(db, uid("a"), { ...entry, ...changes }),
            /รหัสคำขอ/,
          );
      },
    );
    await t.test(
      "parallel distinct deposits sum precisely and isolate totals per goal/member/couple",
      async () => {
        const values = [10, 20, 101, 299, 1, 2, 3, 4, 5, 6];
        await Promise.all(
          values.map((amount_cents, i) =>
            addSavingsEntry(
              db,
              uid(i % 2 ? "a" : "b"),
              deposit({ amount_cents, contributor_id: uid(i % 2 ? "a" : "b") }),
            ),
          ),
        );
        const state = await getPlanningState(db, uid("a")),
          g = state.goals[0];
        assert.equal(g.total_cents, 101 + values.reduce((s, n) => s + n, 0));
        assert.equal(
          Object.values(g.contributions).reduce((s, n) => s + n, 0),
          g.total_cents,
        );
        assert.equal((await getPlanningState(db, uid("c"))).goals.length, 0);
        await assert.rejects(addSavingsEntry(db, uid("c"), deposit()));
        await assert.rejects(
          addSavingsEntry(db, uid("a"), deposit({ contributor_id: uid("c") })),
        );
        const other = {
          ...goal,
          id: crypto.randomUUID(),
          title: "อีกเป้าหมาย",
        };
        await savePlanningRecord(db, uid("b"), other);
        assert.equal(
          (await getPlanningState(db, uid("a"))).goals.find(
            (g) => g.id === other.id,
          )!.total_cents,
          0,
        );
        await savePlanningRecord(db, uid("b"), {
          ...goal,
          version: 1,
          target_cents: 99999,
        });
        await assert.rejects(
          savePlanningRecord(db, uid("a"), { ...goal, version: 1 }),
        );
        assert.equal(
          (await getPlanningState(db, uid("a"))).goals.find(
            (g) => g.id === goal.id,
          )!.total_cents,
          g.total_cents,
        );
      },
    );
    await t.test(
      "reversal retries and concurrent different IDs subtract once and retain immutable history",
      async () => {
        const before = await getPlanningState(db, uid("a")),
          original = before.history.entries.find(
            (e) => e.amount_cents === 101,
          )!;
        const correction = {
          id: crypto.randomUUID(),
          entry_id: original.id,
          note: "บันทึกซ้ำ",
        };
        const responses = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            reverseSavingsEntry(db, uid(i % 2 ? "a" : "b"), {
              ...correction,
              id: i % 2 ? correction.id : crypto.randomUUID(),
            }),
          ),
        );
        assert.equal(responses.filter((r) => r.applied).length, 1);
        assert.deepEqual(await reverseSavingsEntry(db, uid("b"), correction), {
          applied: false,
        });
        const after = await getPlanningState(db, uid("a"));
        assert.equal(
          after.goals.find((g) => g.id === goal.id)!.total_cents,
          before.goals.find((g) => g.id === goal.id)!.total_cents - 101,
        );
        assert.equal(
          after.history.entries.length,
          before.history.entries.length + 1,
        );
        assert.equal(
          after.history.entries.find((e) => e.id === original.id)!.reversed,
          true,
        );
        const reversal = after.history.entries.find(
          (e) => e.kind === "reversal",
        )!;
        await assert.rejects(
          reverseSavingsEntry(db, uid("a"), {
            ...correction,
            id: crypto.randomUUID(),
            entry_id: reversal.id,
          }),
        );
        await assert.rejects(
          reverseSavingsEntry(db, uid("c"), {
            ...correction,
            id: crypto.randomUUID(),
          }),
        );
        await assert.rejects(
          db
            .prepare(
              "UPDATE savings_entries SET amount_cents=1 WHERE couple_id=?",
            )
            .bind(coupleA)
            .run(),
          /savings_entry_immutable/,
        );
      },
    );
    await t.test(
      "a failed balance trigger rolls back the money entry and retry succeeds once",
      async () => {
        const entry = deposit({ amount_cents: 12345 }),
          before = await getPlanningState(db, uid("a"));
        await db
          .prepare(
            "CREATE TRIGGER qa_savings_failure BEFORE UPDATE ON savings_balances BEGIN SELECT RAISE(ABORT,'qa_savings_failure'); END",
          )
          .run();
        try {
          await assert.rejects(
            addSavingsEntry(db, uid("a"), entry),
            /qa_savings_failure/,
          );
          assert.equal(
            await db
              .prepare(
                "SELECT id FROM savings_entries WHERE couple_id=? AND id=?",
              )
              .bind(coupleA, entry.id)
              .first(),
            null,
          );
          assert.equal(
            (await getPlanningState(db, uid("a"))).goals.find(
              (g) => g.id === goal.id,
            )!.total_cents,
            before.goals.find((g) => g.id === goal.id)!.total_cents,
          );
        } finally {
          await db.prepare("DROP TRIGGER qa_savings_failure").run();
        }
        assert.deepEqual(await addSavingsEntry(db, uid("b"), entry), {
          applied: true,
        });
        assert.deepEqual(await addSavingsEntry(db, uid("a"), entry), {
          applied: false,
        });
      },
    );
    await t.test(
      "goal total cap is atomic across simultaneous contributors and never overflows numeric limits",
      async () => {
        const capped = {
          ...goal,
          id: crypto.randomUUID(),
          target_cents: 10000000000,
        };
        await savePlanningRecord(db, uid("c"), capped);
        for (let i = 0; i < 9; i++)
          await addSavingsEntry(
            db,
            uid("c"),
            deposit({
              goal_id: capped.id,
              contributor_id: uid("c"),
              amount_cents: 1000000000,
            }),
          );
        const results = await Promise.allSettled(
          ["c", "d"].map((name) =>
            addSavingsEntry(
              db,
              uid(name),
              deposit({
                goal_id: capped.id,
                contributor_id: uid(name),
                amount_cents: 1000000000,
              }),
            ),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          (await getPlanningState(db, uid("d"))).goals.find(
            (g) => g.id === capped.id,
          )!.total_cents,
          10000000000,
        );
        await assert.rejects(
          addSavingsEntry(
            db,
            uid("c"),
            deposit({
              goal_id: capped.id,
              contributor_id: uid("c"),
              amount_cents: 1,
            }),
          ),
        );
      },
    );
    await t.test(
      "planning CRUD uses explicit values/versioning, deterministic date ordering and tenant scopes",
      async () => {
        const rows = [
          {
            kind: "date",
            id: crypto.randomUUID(),
            title: "เย็น",
            place: "สวน",
            day: "2026-10-20",
            time: "18:00",
            budget_cents: 12345,
            version: 0,
          },
          {
            kind: "date",
            id: crypto.randomUUID(),
            title: "เช้า",
            place: "สวน",
            day: "2026-10-20",
            time: "08:00",
            budget_cents: 0,
            version: 0,
          },
          {
            kind: "wish",
            id: crypto.randomUUID(),
            title: "ไปเที่ยว",
            category: "สถานที่",
            done: false,
            version: 0,
          },
          {
            kind: "event",
            id: crypto.randomUUID(),
            title: "วันสำคัญ",
            day: "2026-10-20",
            event_kind: "วันสำคัญ",
            version: 0,
          },
        ];
        for (const row of rows) {
          await savePlanningRecord(db, uid("a"), row);
          await savePlanningRecord(db, uid("b"), row);
        }
        const own = await getPlanningState(db, uid("b"));
        assert.deepEqual(
          own.dates.map((d) => d.title),
          ["เช้า", "เย็น"],
        );
        assert.equal(own.wishes.length, 1);
        assert.equal(own.events.length, 1);
        assert.equal((await getPlanningState(db, uid("c"))).dates.length, 0);
        const wish = rows[2];
        await savePlanningRecord(db, uid("b"), {
          ...wish,
          version: 1,
          done: true,
        });
        await assert.rejects(
          savePlanningRecord(db, uid("a"), { ...wish, version: 1, done: true }),
        );
        assert.equal(
          (await getPlanningState(db, uid("a"))).wishes[0].done,
          true,
        );
        for (const row of rows) {
          await assert.rejects(
            savePlanningRecord(db, uid("c"), { ...row, version: 1 }),
          );
          await assert.rejects(
            deletePlanningRecord(db, uid("c"), { kind: row.kind, id: row.id }),
          );
          await deletePlanningRecord(db, uid("b"), {
            kind: row.kind,
            id: row.id,
          });
          await deletePlanningRecord(db, uid("a"), {
            kind: row.kind,
            id: row.id,
          });
          await assert.rejects(savePlanningRecord(db, uid("a"), row));
        }
        assert.equal((await getPlanningState(db, uid("a"))).dates.length, 0);
        assert.equal(
          (
            await planningApi("save", {
              ...rows[0],
              id: crypto.randomUUID(),
              time: "25:99",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await planningApi("save", {
              ...rows[0],
              id: crypto.randomUUID(),
              day: "2026-02-30",
            })
          ).status,
          400,
        );
        assert.equal(anniversaryDay("2024-02-29", 2027), "2027-02-28");
        assert.equal(anniversaryDay("2024-02-29", 2028), "2028-02-29");
      },
    );
    await t.test(
      "savings history paginates without gaps, totals match the ledger, and shared snapshot opts in",
      async () => {
        const originalNow = Date.now,
          at = Date.now();
        try {
          Date.now = () => at;
          for (let i = 0; i < 35; i++)
            await addSavingsEntry(db, uid("a"), deposit({ amount_cents: 1 }));
        } finally {
          Date.now = originalNow;
        }
        const snapshot = await getPlanningState(db, uid("a"));
        assert.equal(snapshot.history.entries.length, 30);
        assert.ok(snapshot.history.nextCursor);
        const next = await getSavingsHistory(
          db,
          uid("b"),
          snapshot.history.nextCursor,
        );
        const count = await db
          .prepare(
            "SELECT count(*) AS n,sum(amount_cents) AS cents FROM savings_entries WHERE couple_id=?",
          )
          .bind(coupleA)
          .first<{ n: number; cents: number }>();
        assert.equal(
          new Set(
            [...snapshot.history.entries, ...next.entries].map((e) => e.id),
          ).size,
          count!.n,
        );
        assert.equal(
          snapshot.goals.reduce((s, g) => s + g.total_cents, 0),
          count!.cents,
        );
        assert.equal(
          (await getSavingsHistory(db, uid("c"), snapshot.history.nextCursor))
            .entries.length,
          0,
        );
        const combined = await handleRequest(
          new Request(env.APP_URL + "/api/quests/state?planning=1", {
            headers: { Cookie: cookies.get("a")! },
          }),
          env,
        );
        assert.equal(combined.status, 200);
        assert.ok(((await combined.json()) as { planning: unknown }).planning);
      },
    );
    await t.test(
      "deployment gate rejects a missing savings rollup trigger",
      async () => {
        const trigger = await db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='savings_balance_apply'",
          )
          .first<{ sql: string }>();
        await db.prepare("DROP TRIGGER savings_balance_apply").run();
        try {
          await assert.rejects(
            checkAuthSchema(env),
            /schema missing: savings_balance_apply/,
          );
        } finally {
          await db.prepare(trigger!.sql).run();
        }
      },
    );
    await t.test(
      "deployment gate rejects a missing wallet trigger",
      async () => {
        const trigger = await db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='heart_wallet_apply'",
          )
          .first<{ sql: string }>();
        await db.prepare("DROP TRIGGER heart_wallet_apply").run();
        try {
          await assert.rejects(
            checkAuthSchema(env),
            /Quest schema missing: heart_wallet_apply/,
          );
        } finally {
          await db.prepare(trigger!.sql).run();
        }
      },
    );
    await t.test(
      "deployment schema check rejects a missing auth table",
      async () => {
        await db.prepare("DROP TABLE auth_passkeys").run();
        await assert.rejects(
          checkAuthSchema({ ...env }),
          /auth_passkeys|schema/i,
        );
      },
    );
  },
);

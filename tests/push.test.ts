import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createECDH,
  createDecipheriv,
  hkdfSync,
  createPublicKey,
  verify,
} from "node:crypto";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { serializeSignedCookie } from "better-call";
import {
  allowedPushEndpoint,
  encryptedPush,
  sendWebPush,
} from "../src/lib/web-push";
import { createAuth } from "../src/lib/auth";
import {
  createCouple,
  createInvitation,
  acceptInvitation,
} from "../src/lib/pairing";
import {
  dispatchPush,
  subscribePush,
  unsubscribePush,
  pushState,
  testPush,
} from "../src/lib/push-service";
import { saveQuest, completeQuest, questDay } from "../src/lib/quest-service";
import { savePlanningRecord } from "../src/lib/planning-service";
import { saveJournal } from "../src/lib/journal-service";
import { handleRequest } from "../cloudflare/worker";
import { checkAuthSchema } from "../scripts/check-auth-schema";

function receiver() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    ecdh,
    keys: {
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
        "base64url",
      ),
    },
  };
}
function decrypt(body: Uint8Array, receiverKey: ReturnType<typeof receiver>) {
  const packet = Buffer.from(body),
    salt = packet.subarray(0, 16),
    sender = packet.subarray(21, 21 + packet[20]);
  assert.equal(packet.readUInt32BE(16), 4096);
  const shared = receiverKey.ecdh.computeSecret(sender);
  const ikm = hkdfSync(
    "sha256",
    shared,
    Buffer.from(receiverKey.keys.auth, "base64url"),
    Buffer.concat([
      Buffer.from("WebPush: info\0"),
      receiverKey.ecdh.getPublicKey(),
      sender,
    ]),
    32,
  );
  const key = hkdfSync(
    "sha256",
    ikm,
    salt,
    Buffer.from("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = hkdfSync(
    "sha256",
    ikm,
    salt,
    Buffer.from("Content-Encoding: nonce\0"),
    12,
  );
  const encrypted = packet.subarray(21 + packet[20]),
    decipher = createDecipheriv("aes-128-gcm", key, Buffer.from(nonce));
  decipher.setAuthTag(encrypted.subarray(-16));
  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(0, -16)),
    decipher.final(),
  ]);
  assert.equal(plaintext.at(-1), 2);
  return plaintext.subarray(0, -1).toString("utf8");
}
async function signingKey() {
  return crypto.subtle.exportKey(
    "jwk",
    (
      await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      )
    ).privateKey,
  );
}

test("Web Push encryption interoperates with RFC 8291's published vector and an independent native decryptor", async () => {
  const sample = receiver();
  sample.ecdh.setPrivateKey(
    Buffer.from("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94", "base64url"),
  );
  sample.keys.auth = "BTBZMqHH6r4Tts7J_aSIgg";
  const vector =
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
  assert.equal(
    decrypt(Buffer.from(vector, "base64url"), sample),
    "When I grow up, I want to be a watermelon",
  );
  const actual = receiver(),
    text = JSON.stringify({ kind: "letters", tag: crypto.randomUUID() });
  assert.equal(
    decrypt(
      await encryptedPush(actual.keys.p256dh, actual.keys.auth, text),
      actual,
    ),
    text,
  );
});
test("Web Push signs the exact service origin, uses aes128gcm, bounds TTL, and never follows redirects", async () => {
  const key = await signingKey(),
    client = receiver();
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://web.push.apple.com/test");
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("TTL"), "900");
    assert.equal(
      new Headers(init?.headers).get("Content-Encoding"),
      "aes128gcm",
    );
    const authorization = new Headers(init?.headers).get("Authorization")!;
    const token = authorization.slice(8).split(",")[0],
      parts = token.split(".");
    assert(
      verify(
        "sha256",
        Buffer.from(parts[0] + "." + parts[1]),
        {
          key: createPublicKey({ key, format: "jwk" }),
          dsaEncoding: "ieee-p1363",
        },
        Buffer.from(parts[2], "base64url"),
      ),
    );
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    assert.equal(claims.aud, "https://web.push.apple.com");
    assert.equal(claims.exp, 4600);
    assert.equal(decrypt(init?.body as Uint8Array, client), "private payload");
    return new Response(null, {
      status: 307,
      headers: { Location: "https://attacker.test" },
    });
  };
  await sendWebPush(
    key,
    "https://our.test",
    { endpoint: "https://web.push.apple.com/test", ...client.keys },
    "private payload",
    transport,
    1000000,
  );
  for (const url of [
    "http://fcm.googleapis.com/test",
    "https://fcm.googleapis.com.attacker.test/a",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://web.push.apple.com:444/a",
    "https://a@web.push.apple.com/a",
    "https://web.push.apple.com/a#b",
  ]) {
    assert.equal(allowedPushEndpoint(url), false);
    await assert.rejects(
      sendWebPush(
        key,
        "https://our.test",
        { endpoint: url, ...client.keys },
        "x",
        transport,
      ),
    );
  }
  assert.equal(calls, 1);
});

test(
  "Phase 6 Push D1 ownership, scheduled eligibility, deduplication and delivery outcomes",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")),
      path = resolve(
        ".wrangler",
        "push-test-" + crypto.randomUUID() + ".jsonc",
      );
    await mkdir(".wrangler", { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        name: config.name,
        compatibility_date: config.compatibility_date,
        compatibility_flags: config.compatibility_flags,
        d1_databases: config.d1_databases,
      }),
    );
    t.after(() => unlink(path));
    const platform = await getPlatformProxy<CloudflareEnv>({
      configPath: path,
      persist: false,
      remoteBindings: false,
      envFiles: [],
    });
    t.after(() => platform.dispose());
    const env = {
        ...platform.env,
        APP_URL: "https://our.test",
        BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
        PUSH_VAPID_JWK: JSON.stringify(await signingKey()),
      },
      db = env.DB;
    for (const file of (await readdir("cloudflare/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      for (const statement of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(statement).run();
    const adapter = (await createAuth(env).$context).internalAdapter;
    const users: string[] = [],
      sessions: string[] = [],
      cookies: string[] = [];
    for (let i = 0; i < 5; i++) {
      const user = await adapter.createUser(
        {
          name: "Push " + i,
          email: `push${i}@test.invalid`,
          username: "push_" + i,
          emailVerified: false,
        },
        { method: "test-fixture" },
      );
      const session = await adapter.createSession(user.id);
      users.push(user.id);
      sessions.push(session.id);
      cookies.push(
        (
          await serializeSignedCookie(
            "__Secure-olw.session_token",
            session.token,
            env.BETTER_AUTH_SECRET,
            { path: "/", secure: true },
          )
        ).split(";")[0],
      );
    }
    for (const [a, b] of [
      [0, 1],
      [2, 3],
    ]) {
      await createCouple(db, users[a], "2024-02-14");
      const invite = await createInvitation(db, users[a]);
      await acceptInvitation(db, users[b], invite.token);
    }
    const api = (
      op: string,
      body?: unknown,
      person = 0,
      origin = env.APP_URL,
    ) =>
      handleRequest(
        new Request(env.APP_URL + "/api/push/" + op, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Cookie: cookies[person],
            Origin: origin,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        env,
      );
    const clients = [receiver(), receiver(), receiver(), receiver()];
    const input = (i: number, suffix = "main") => ({
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/qa-" + i + "-" + suffix,
        expirationTime: null,
        keys: clients[i].keys,
      },
      device: "QA device",
      quests: true,
      dates: true,
      letters: true,
    });
    const saved: string[] = [];
    const now = Date.parse(questDay() + "T09:00:00+07:00"),
      day = questDay(now);
    const records: {
      endpoint: string;
      payload: { kind: string; tag: string };
    }[] = [];
    const transport: typeof fetch = async (url, init) => {
      const endpoint = String(url),
        index = Number(endpoint.match(/qa-(\d)/)![1]);
      records.push({
        endpoint,
        payload: JSON.parse(decrypt(init!.body as Uint8Array, clients[index])),
      });
      return new Response(null, { status: 201 });
    };
    await t.test(
      "API requires login, correct origin and membership, rejects forged fields/SSRF and hides private subscription keys",
      async () => {
        await checkAuthSchema(env);
        assert.equal(
          (
            await handleRequest(
              new Request(env.APP_URL + "/api/push/state"),
              env,
            )
          ).status,
          401,
        );
        assert.equal((await api("state", undefined, 4)).status, 403);
        assert.equal(
          (await api("subscribe", input(0), 0, "https://attacker.test")).status,
          403,
        );
        assert.equal((await api("dispatch", {})).status, 404);
        for (const bad of [
          { ...input(0), user_id: users[1] },
          {
            ...input(0),
            subscription: {
              ...input(0).subscription,
              endpoint: "https://127.0.0.1/a",
            },
          },
          {
            ...input(0),
            subscription: {
              ...input(0).subscription,
              keys: { ...clients[0].keys, p256dh: "A".repeat(87) },
            },
          },
        ])
          assert.equal((await api("subscribe", bad)).status, 400);
        for (let i = 0; i < 4; i++)
          saved.push(
            (await subscribePush(env, users[i], sessions[i], input(i))).id,
          );
        const state = await pushState(env, users[0]),
          serialized = JSON.stringify(state);
        assert.equal(state.devices.length, 1);
        assert(state.publicKey);
        for (const privateValue of [
          input(0).subscription.endpoint,
          clients[0].keys.auth,
          clients[0].keys.p256dh,
          JSON.parse(env.PUSH_VAPID_JWK).d,
          sessions[0],
        ])
          assert(!serialized.includes(privateValue));
        assert.equal((await api("subscribe", input(0), 2)).status, 409);
        await unsubscribePush(env, users[2], { id: saved[0] });
        assert.equal((await pushState(env, users[0])).devices.length, 1);
        await assert.rejects(
          db
            .prepare("UPDATE push_subscriptions SET session_id=? WHERE id=?")
            .bind(sessions[2], saved[0])
            .run(),
          /push_session_owner/,
        );
      },
    );
    await t.test(
      "device cap is atomic, existing subscriptions can update, and revoked/expired sessions stop delivery",
      async () => {
        const x = await subscribePush(
            env,
            users[0],
            sessions[0],
            input(0, "two"),
          ),
          y = await subscribePush(
            env,
            users[0],
            sessions[0],
            input(0, "three"),
          );
        await subscribePush(env, users[0], sessions[0], {
          ...input(0),
          quests: false,
        });
        await assert.rejects(
          subscribePush(env, users[0], sessions[0], input(0, "four")),
          /สูงสุด 3 เครื่อง/,
        );
        await unsubscribePush(env, users[0], x);
        await unsubscribePush(env, users[0], y);
        await subscribePush(env, users[0], sessions[0], input(0));
        await db
          .prepare("UPDATE auth_sessions SET expiresAt=? WHERE id=?")
          .bind(new Date(now - 1).toISOString(), sessions[3])
          .run();
        await dispatchPush(env, now - 1, transport);
        assert.equal((await pushState(env, users[3])).devices.length, 0);
        assert.equal(records.length, 0);
      },
    );
    await t.test(
      "ISO and legacy numeric session expiry stop at the exact millisecond; malformed dates fail closed",
      async () => {
        const at = Date.now() + 60000;
        for (const format of ["iso", "numeric", "malformed"] as const) {
          const session = await adapter.createSession(users[0]);
          const device = await subscribePush(
            env,
            users[0],
            session.id,
            input(0, "expiry-" + format),
          );
          const expiry =
            format === "iso"
              ? new Date(at + 1000).toISOString()
              : format === "numeric"
                ? at + 1000
                : "invalid-date";
          await db
            .prepare("UPDATE auth_sessions SET expiresAt=? WHERE id=?")
            .bind(expiry, session.id)
            .run();
          if (format !== "malformed") {
            await dispatchPush(env, at + 999, transport);
            assert.equal(
              (
                await db
                  .prepare(
                    "SELECT checked_at FROM push_subscriptions WHERE id=?",
                  )
                  .bind(device.id)
                  .first<{ checked_at: number }>()
              )?.checked_at,
              at + 999,
            );
          }
          await dispatchPush(env, at + 1000, transport);
          assert.equal(
            await db
              .prepare("SELECT id FROM push_subscriptions WHERE id=?")
              .bind(device.id)
              .first(),
            null,
          );
        }
        assert.equal(records.length, 0);
      },
    );
    let once = "";
    await t.test(
      "09:00 unfinished tasks target the assignee/shared members, Cron overlap sends once, another couple sees none",
      async () => {
        const save = async (
          title: string,
          assignee: string | null,
          due: string,
          repeat = "ครั้งเดียว",
        ) => {
          const id = crypto.randomUUID();
          await saveQuest(db, users[0], {
            id,
            version: 0,
            title,
            assignee_id: assignee,
            due,
            repeat,
            hearts: 10,
          });
          return id;
        };
        once = await save("SECRET only recipient", users[1], day);
        const completed = await save("SECRET completed", null, day);
        await completeQuest(db, users[0], {
          id: completed,
          request_id: crypto.randomUUID(),
        });
        await save("SECRET future", null, questDay(now + 86400000));
        await dispatchPush(env, now - 60000, transport);
        assert.equal(records.length, 0);
        await Promise.all([
          dispatchPush(env, now, transport),
          dispatchPush(env, now, transport),
        ]);
        assert.equal(records.length, 1);
        assert.equal(records[0].endpoint, input(1).subscription.endpoint);
        assert.equal(records[0].payload.kind, "quests");
        assert.deepEqual(Object.keys(records[0].payload).sort(), [
          "kind",
          "tag",
        ]);
        await dispatchPush(env, now + 900000, transport);
        assert.equal(records.length, 1);
        const wallet = await db
          .prepare(
            "SELECT balance FROM heart_wallets WHERE couple_id=(SELECT couple_id FROM couple_members WHERE user_id=?)",
          )
          .bind(users[0])
          .first<{ balance: number }>();
        assert.equal(wallet!.balance, 10);
      },
    );
    await t.test(
      "appointment window is bounded and letters never notify before Thai midnight or to their author",
      async () => {
        const time = (at: number) =>
          new Date(at + 7 * 3600000).toISOString().slice(11, 16);
        const date = crypto.randomUUID();
        await savePlanningRecord(db, users[0], {
          kind: "date",
          id: date,
          version: 0,
          title: "SECRET date",
          place: "SECRET place",
          day,
          time: time(now + 1800000),
          budget_cents: 12345,
        });
        const letter = crypto.randomUUID();
        await saveJournal(db, users[0], {
          kind: "letter",
          id: letter,
          title: "SECRET letter title",
          body: "SECRET locked body",
          openOn: questDay(now + 86400000),
        });
        const before = records.length;
        await dispatchPush(env, now - 60000, transport);
        assert.equal(records.length, before);
        await dispatchPush(env, now, transport);
        assert.equal(
          records.slice(before).filter((r) => r.payload.kind === "dates")
            .length,
          2,
        );
        assert.equal(
          records.filter((r) => r.payload.kind === "letters").length,
          0,
        );
        await completeQuest(db, users[1], {
          id: once,
          request_id: crypto.randomUUID(),
        });
        const midnight = Date.parse(
          questDay(now + 86400000) + "T00:00:00+07:00",
        );
        await dispatchPush(env, midnight - 1, transport);
        assert.equal(
          records.filter((r) => r.payload.kind === "letters").length,
          0,
        );
        await dispatchPush(env, midnight, transport);
        const letters = records.filter((r) => r.payload.kind === "letters");
        assert.equal(letters.length, 1);
        assert.equal(letters[0].endpoint, input(1).subscription.endpoint);
        await dispatchPush(env, midnight + 900000, transport);
        assert.equal(
          records.filter((r) => r.payload.kind === "letters").length,
          1,
        );
      },
    );
    await t.test(
      "preferences are per device/user, disabling all categories prevents sends and re-enabling does not replay old reminders",
      async () => {
        await subscribePush(env, users[1], sessions[1], {
          ...input(1),
          quests: false,
          dates: false,
          letters: false,
        });
        const before = records.length;
        await dispatchPush(env, now, transport);
        assert.equal(records.length, before);
        await unsubscribePush(env, users[1], { id: saved[1] });
        saved[1] = (
          await subscribePush(env, users[1], sessions[1], input(1))
        ).id;
        await dispatchPush(env, now, transport);
        assert.equal(records.length, before);
      },
    );
    await t.test(
      "test delivery is rate limited/idempotent, timeout is not resent, 410 removes an endpoint, and retryable responses are bounded",
      async () => {
        const request_id = crypto.randomUUID(),
          first = await testPush(
            env,
            users[0],
            { id: saved[0], request_id },
            transport,
          );
        assert.equal(first.state, "sent");
        const count = records.length;
        assert.equal(
          (
            await testPush(
              env,
              users[0],
              { id: saved[0], request_id },
              transport,
            )
          ).applied,
          false,
        );
        assert.equal(records.length, count);
        await assert.rejects(
          testPush(
            env,
            users[0],
            { id: saved[0], request_id: crypto.randomUUID() },
            transport,
          ),
          /1 นาที/,
        );
        await assert.rejects(
          testPush(
            env,
            users[2],
            { id: saved[0], request_id: crypto.randomUUID() },
            transport,
          ),
          /ไม่พบเครื่อง/,
        );
        await db
          .prepare("UPDATE push_subscriptions SET last_test_at=0 WHERE id=?")
          .bind(saved[0])
          .run();
        const uncertainId = crypto.randomUUID();
        let failedCalls = 0;
        const offline: typeof fetch = async () => {
          failedCalls++;
          throw Error("simulated accepted-then-lost response");
        };
        assert.equal(
          (
            await testPush(
              env,
              users[0],
              { id: saved[0], request_id: uncertainId },
              offline,
            )
          ).state,
          "uncertain",
        );
        await testPush(
          env,
          users[0],
          { id: saved[0], request_id: uncertainId },
          offline,
        );
        assert.equal(failedCalls, 1);
        await db
          .prepare("UPDATE push_subscriptions SET last_test_at=0 WHERE id=?")
          .bind(saved[0])
          .run();
        assert.equal(
          (
            await testPush(
              env,
              users[0],
              { id: saved[0], request_id: crypto.randomUUID() },
              async () => new Response(null, { status: 410 }),
            )
          ).state,
          "failed",
        );
        assert.equal((await pushState(env, users[0])).devices.length, 0);
        // An independent couple isolates response-retry tests from the first couple's reminder receipts.
        await saveQuest(db, users[2], {
          id: crypto.randomUUID(),
          version: 0,
          title: "Retry test",
          assignee_id: null,
          due: day,
          repeat: "รายวัน",
          hearts: 1,
        });
        let calls = 0;
        const rateLimited: typeof fetch = async () => {
          calls++;
          return new Response(null, {
            status: 429,
            headers: { "Retry-After": "1800" },
          });
        };
        await dispatchPush(env, now, rateLimited);
        const n = calls;
        assert(n > 0);
        await dispatchPush(env, now + 900000, rateLimited);
        assert.equal(calls, n);
        await dispatchPush(env, now + 1800000, rateLimited);
        assert.equal(calls, n + 1);
        await dispatchPush(env, now + 3600000, rateLimited); // Daily reminder window is closed: no late replay.
        assert.equal(calls, n + 1);
      },
    );
    await t.test(
      "HTTP-date Retry-After is respected and a repeatedly failing letter is attempted at most three times",
      async () => {
        await subscribePush(env, users[2], sessions[2], {
          ...input(2),
          quests: false,
        });
        await saveJournal(db, users[3], {
          kind: "letter",
          id: crypto.randomUUID(),
          title: "Retry letter",
          body: "Still private",
          openOn: day,
        });
        let calls = 0;
        const unavailable: typeof fetch = async () => {
          calls++;
          return new Response(null, {
            status: 503,
            headers: { "Retry-After": new Date(now + 1800000).toUTCString() },
          });
        };
        await dispatchPush(env, now, unavailable);
        assert.equal(calls, 1);
        await dispatchPush(env, now + 900000, unavailable);
        assert.equal(calls, 1);
        await dispatchPush(env, now + 1800000, unavailable);
        assert.equal(calls, 2);
        await dispatchPush(env, now + 3600000, unavailable);
        assert.equal(calls, 3);
        await dispatchPush(env, now + 4500000, unavailable);
        assert.equal(calls, 3);
      },
    );
    await t.test(
      "logout cascades device subscriptions and the deploy gate detects missing Push schema",
      async () => {
        await handleRequest(
          new Request(env.APP_URL + "/api/auth/sign-out", {
            method: "POST",
            headers: {
              Cookie: cookies[1],
              Origin: env.APP_URL,
              "Content-Type": "application/json",
            },
            body: "{}",
          }),
          env,
        );
        assert.equal(
          (await db
            .prepare(
              "SELECT count(*) AS n FROM push_subscriptions WHERE user_id=?",
            )
            .bind(users[1])
            .first<{ n: number }>())!.n,
          0,
        );
        await db.prepare("DROP TRIGGER push_session_update").run();
        await assert.rejects(checkAuthSchema(env), /push_session_update/);
      },
    );
  },
);

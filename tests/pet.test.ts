import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { serializeSignedCookie } from "better-call";
import { createAuth } from "../src/lib/auth";
import {
  createCouple,
  createInvitation,
  acceptInvitation,
} from "../src/lib/pairing";
import {
  completeQuest,
  getQuestState,
  questDay,
  redeemReward,
  saveQuest,
} from "../src/lib/quest-service";
import {
  equipPetItem,
  feedPet,
  getPetState,
  purchasePetItem,
  renamePet,
} from "../src/lib/pet-service";
import { handleRequest } from "../cloudflare/worker";
import { checkAuthSchema } from "../scripts/check-auth-schema";

test(
  "Phase 5 shared D1 pet, atomic purchases and achievements",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")),
      path = resolve(".wrangler", "pet-test-" + crypto.randomUUID() + ".jsonc");
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
        APP_URL: "http://localhost:3017",
        BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      },
      db = env.DB,
      legacy = crypto.randomUUID();
    for (const file of (await readdir("cloudflare/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (file.startsWith("0006")) {
        await db
          .prepare(
            "INSERT INTO auth_users(id,name,email,username,createdAt,updatedAt) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            legacy,
            "Legacy",
            "legacy@test.invalid",
            "legacy_qa",
            Date.now(),
            Date.now(),
          )
          .run();
        await createCouple(db, legacy, "2024-02-14");
        for (let i = 0; i < 10; i++) {
          const id = crypto.randomUUID();
          await saveQuest(db, legacy, {
            id,
            version: 0,
            title: "Legacy " + i,
            assignee_id: null,
            due: questDay(),
            repeat: "ครั้งเดียว",
            hearts: 10,
          });
          await completeQuest(db, legacy, {
            id,
            request_id: crypto.randomUUID(),
          });
        }
      }
      for (const sql of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(sql).run();
    }
    const adapter = (await createAuth(env).$context).internalAdapter,
      users: string[] = [],
      cookies: string[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await adapter.createUser(
          {
            name: "Pet " + i,
            email: "pet" + i + "@test.invalid",
            username: "pet_" + i,
            emailVerified: false,
          },
          { method: "test-fixture" },
        ),
        s = await adapter.createSession(u.id);
      users.push(u.id);
      cookies.push(
        (
          await serializeSignedCookie(
            "olw.session_token",
            s.token,
            env.BETTER_AUTH_SECRET,
            { path: "/" },
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
        new Request(env.APP_URL + "/api/pet/" + op, {
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
    const credit = async (person: number, hearts: number) => {
      const id = crypto.randomUUID();
      await saveQuest(db, users[person], {
        id,
        version: 0,
        title: "Earn hearts",
        assignee_id: null,
        due: questDay(),
        repeat: "ครั้งเดียว",
        hearts,
      });
      await completeQuest(db, users[person], {
        id,
        request_id: crypto.randomUUID(),
      });
      return id;
    };
    const couple = (await getQuestState(db, users[0])).couple.id;
    await t.test(
      "migration preserves legacy wallet/ledger and backfills earned badges; fresh couples start empty",
      async () => {
        await checkAuthSchema(env);
        const old = await getQuestState(db, legacy),
          badges = await getPetState(db, legacy);
        assert.equal(old.balance, 100);
        assert.equal(old.completionCount, 10);
        assert.equal(old.history.entries.length, 10);
        assert.equal(
          badges.achievements.filter((a) => a.unlocked_at !== null).length,
          2,
        );
        const fresh = await getPetState(db, users[0]);
        assert.equal(fresh.pet.feeds, 0);
        assert.equal(fresh.pet.version, 0);
        assert.ok(fresh.items.every((i) => !i.owned));
        assert.ok(fresh.achievements.every((a) => a.unlocked_at === null));
        assert.equal((await getQuestState(db, users[0])).rewards.length, 3);
      },
    );
    await t.test(
      "authentication, origin, strict payloads and unsupported achievement/inventory writes",
      async () => {
        assert.equal(
          (
            await handleRequest(
              new Request(env.APP_URL + "/api/pet/state"),
              env,
            )
          ).status,
          401,
        );
        assert.equal((await api("state", undefined, 4)).status, 403);
        assert.equal(
          (
            await api(
              "feed",
              { request_id: crypto.randomUUID() },
              0,
              "https://evil.invalid",
            )
          ).status,
          403,
        );
        for (const extra of [
          { couple_id: couple },
          { actor_id: users[1] },
          { fed_at: 0 },
          { feeds: 999 },
          { unlocked_at: 1 },
        ])
          assert.equal(
            (await api("feed", { request_id: crypto.randomUUID(), ...extra }))
              .status,
            400,
          );
        assert.equal(
          (await api("unlock", { achievement_id: "team-ten" })).status,
          404,
        );
        assert.equal(
          (await api("inventory", { item_id: "mint-hat" })).status,
          404,
        );
        assert.equal(
          (
            await api("purchase", {
              item_id: "mint-hat",
              request_id: crypto.randomUUID(),
              cost: 0,
            })
          ).status,
          400,
        );
      },
    );
    let firstFeed = "",
      fedAt = 0;
    await t.test(
      "simultaneous feed IDs across partners record one meal and retry original ID never feeds again",
      async () => {
        const ids = Array.from({ length: 8 }, () => crypto.randomUUID()),
          result = await Promise.all(
            ids.map((request_id, i) => api("feed", { request_id }, i % 2)),
          );
        assert.equal(result.filter((r) => r.status === 200).length, 1);
        assert.equal(result.filter((r) => r.status === 409).length, 7);
        firstFeed = ids[result.findIndex((r) => r.status === 200)];
        const s = await getPetState(db, users[1]);
        assert.equal(s.pet.feeds, 1);
        fedAt = s.pet.last_fed!;
        assert.equal(s.pet.next_feed_at, fedAt + 14400000);
        assert.deepEqual(
          await feedPet(db, users[0], { request_id: firstFeed }),
          { applied: false },
        );
        assert.equal((await getPetState(db, users[2])).pet.feeds, 0);
        await assert.rejects(
          db
            .prepare("UPDATE pet_feeds SET fed_at=0 WHERE couple_id=?")
            .bind(couple)
            .run(),
          /immutable/,
        );
      },
    );
    await t.test(
      "cooldown uses server time at exact four-hour boundary, crosses Thai midnight and awards third-meal badge once",
      async () => {
        const clock = Date.now;
        try {
          Date.now = () => fedAt + 14400000 - 1;
          await assert.rejects(
            feedPet(db, users[1], { request_id: crypto.randomUUID() }),
            /4 ชั่วโมง/,
          );
          Date.now = () => fedAt + 14400000;
          assert.deepEqual(
            await feedPet(db, users[1], { request_id: crypto.randomUUID() }),
            { applied: true },
          );
          Date.now = () => fedAt + 28800000;
          await feedPet(db, users[0], { request_id: crypto.randomUUID() });
          const s = await getPetState(db, users[0]);
          assert.equal(s.pet.feeds, 3);
          assert.equal(Math.floor(s.pet.feeds / 3) + 1, 2);
          assert.equal(
            s.achievements.find((a) => a.id === "pet-favorite")?.unlocked_at,
            Date.now(),
          );
          Date.now = () => fedAt + 43200000;
          assert.deepEqual(
            await feedPet(db, users[1], { request_id: firstFeed }),
            { applied: false },
          );
          assert.equal((await getPetState(db, users[1])).pet.feeds, 3);
          Date.now = () => Date.parse("2030-01-01T16:59:59.999Z");
          await feedPet(db, users[2], { request_id: crypto.randomUUID() });
          Date.now = () => Date.parse("2030-01-01T17:00:00.000Z");
          await assert.rejects(
            feedPet(db, users[3], { request_id: crypto.randomUUID() }),
          );
        } finally {
          Date.now = clock;
        }
      },
    );
    let purchaseId = "";
    await t.test(
      "same-ID concurrent purchases spend once, equip item and retry succeeds at zero balance",
      async () => {
        await credit(0, 50);
        purchaseId = crypto.randomUUID();
        const replies = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            api(
              "purchase",
              { item_id: "mint-hat", request_id: purchaseId },
              i % 2,
            ),
          ),
        );
        assert.ok(replies.every((r) => r.status === 200));
        const results = await Promise.all(
          replies.map((r) => r.json() as Promise<{ applied: boolean }>),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        const shared = await getPetState(db, users[1]),
          wallet = await getQuestState(db, users[1]);
        assert.equal(wallet.balance, 0);
        assert.equal(shared.pet.wearing, "mint-hat");
        assert.equal(shared.items.filter((i) => i.owned).length, 1);
        assert.equal(
          wallet.history.entries.find((e) => e.id === purchaseId)?.category,
          "pet",
        );
        assert.equal(
          wallet.rewards.some((r) => r.id === "mint-hat"),
          false,
        );
        assert.deepEqual(
          await purchasePetItem(db, users[0], {
            item_id: "mint-hat",
            request_id: purchaseId,
          }),
          { applied: false },
        );
        assert.deepEqual(
          await purchasePetItem(db, users[1], {
            item_id: "mint-hat",
            request_id: crypto.randomUUID(),
          }),
          { applied: false },
        );
      },
    );
    await t.test(
      "distinct purchase IDs race for one owned item without duplicate debit; request IDs cannot change item or event",
      async () => {
        await credit(0, 70);
        const replies = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            api(
              "purchase",
              { item_id: "rose-rug", request_id: crypto.randomUUID() },
              i % 2,
            ),
          ),
        );
        assert.ok(replies.every((r) => r.status === 200));
        const results = await Promise.all(
          replies.map((r) => r.json() as Promise<{ applied: boolean }>),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        assert.equal((await getQuestState(db, users[0])).balance, 0);
        assert.equal(
          (
            await api("purchase", {
              item_id: "rose-rug",
              request_id: purchaseId,
            })
          ).status,
          409,
        );
        const earned = (await getQuestState(db, users[0])).history.entries.find(
          (e) => e.kind === "completion",
        )!;
        assert.equal(
          (
            await api("purchase", {
              item_id: "mint-hat",
              request_id: earned.id,
            })
          ).status,
          409,
        );
        await assert.rejects(
          redeemReward(db, users[0], {
            reward_id: "mint-hat",
            request_id: crypto.randomUUID(),
          }),
        );
      },
    );
    await t.test(
      "insufficient hearts, wrong catalog category and competing purchase/reward cannot overdraw",
      async () => {
        assert.equal(
          (
            await api(
              "purchase",
              { item_id: "mint-hat", request_id: crypto.randomUUID() },
              2,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await api(
              "purchase",
              { item_id: "movie", request_id: crypto.randomUUID() },
              2,
            )
          ).status,
          400,
        );
        await credit(2, 80);
        const result = await Promise.allSettled([
          purchasePetItem(db, users[2], {
            item_id: "mint-hat",
            request_id: crypto.randomUUID(),
          }),
          redeemReward(db, users[3], {
            reward_id: "movie",
            request_id: crypto.randomUUID(),
          }),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        assert.ok(
          [20, 30].includes((await getQuestState(db, users[2])).balance),
        );
        assert.equal(
          (await getPetState(db, users[0])).items.filter((i) => i.owned).length,
          2,
        );
      },
    );
    await t.test(
      "equipping is explicit, retry-safe and versioned; foreign inventory and forged couple cannot be selected",
      async () => {
        let s = await getPetState(db, users[0]);
        const version = s.pet.version;
        const desired = s.pet.wearing === "rose-rug" ? "mint-hat" : "rose-rug";
        await equipPetItem(db, users[0], { item_id: desired, version });
        assert.deepEqual(
          await equipPetItem(db, users[1], { item_id: desired, version }),
          { applied: false },
        );
        await assert.rejects(
          equipPetItem(db, users[1], { item_id: null, version }),
        );
        s = await getPetState(db, users[0]);
        await equipPetItem(db, users[1], {
          item_id: null,
          version: s.pet.version,
        });
        assert.equal((await getPetState(db, users[0])).pet.wearing, null);
        const other = await getPetState(db, users[2]);
        assert.equal(
          (
            await api(
              "equip",
              { item_id: "rose-rug", version: other.pet.version },
              2,
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await api(
              "equip",
              {
                item_id: "rose-rug",
                version: other.pet.version,
                couple_id: couple,
              },
              2,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "name edits keep their original version; feed failure rolls event, counters and badge back together",
      async () => {
        const s = await getPetState(db, users[0]);
        await renamePet(db, users[0], { name: "มะลิ", version: s.pet.version });
        assert.equal((await getPetState(db, users[1])).pet.name, "มะลิ");
        assert.equal(
          (await api("rename", { name: "ทับชื่อ", version: s.pet.version }, 1))
            .status,
          409,
        );
        const count = (await db
          .prepare("SELECT count(*) AS n FROM pet_feeds WHERE couple_id=?")
          .bind(couple)
          .first<{ n: number }>())!.n;
        await db
          .prepare(
            "CREATE TRIGGER qa_pet_feed_failure BEFORE UPDATE ON couple_pets BEGIN SELECT RAISE(ABORT,'qa_pet_failure'); END",
          )
          .run();
        const clock = Date.now;
        try {
          Date.now = () => fedAt + 57600000;
          await assert.rejects(
            feedPet(db, users[0], { request_id: crypto.randomUUID() }),
            /qa_pet_failure/,
          );
        } finally {
          Date.now = clock;
          await db.prepare("DROP TRIGGER qa_pet_feed_failure").run();
        }
        assert.equal((await getPetState(db, users[0])).pet.feeds, 3);
        assert.equal(
          (await db
            .prepare("SELECT count(*) AS n FROM pet_feeds WHERE couple_id=?")
            .bind(couple)
            .first<{ n: number }>())!.n,
          count,
        );
      },
    );
    await t.test(
      "inventory failure rolls debit back and preserves retry; stored wallet always equals ledger",
      async () => {
        // A fresh member-only couple avoids already-owned items and keeps this rollback test independent.
        await createCouple(db, users[4], "2024-02-14");
        await credit(4, 50);
        const req = { item_id: "mint-hat", request_id: crypto.randomUUID() };
        await db
          .prepare(
            "CREATE TRIGGER qa_pet_inventory_failure BEFORE INSERT ON pet_inventory BEGIN SELECT RAISE(ABORT,'qa_inventory_failure'); END",
          )
          .run();
        try {
          await assert.rejects(
            purchasePetItem(db, users[4], req),
            /qa_inventory_failure/,
          );
        } finally {
          await db.prepare("DROP TRIGGER qa_pet_inventory_failure").run();
        }
        assert.equal((await getQuestState(db, users[4])).balance, 50);
        assert.ok(
          (await getPetState(db, users[4])).items.every((i) => !i.owned),
        );
        assert.equal(
          (await getQuestState(db, users[4])).history.entries.some(
            (e) => e.id === req.request_id,
          ),
          false,
        );
        assert.deepEqual(await purchasePetItem(db, users[4], req), {
          applied: true,
        });
        assert.equal((await getQuestState(db, users[4])).balance, 0);
        const mismatches = await db
          .prepare(
            "SELECT w.couple_id FROM heart_wallets w WHERE w.balance<>(SELECT coalesce(sum(amount),0) FROM heart_entries h WHERE h.couple_id=w.couple_id)",
          )
          .all();
        assert.equal(mismatches.results.length, 0);
      },
    );
    await t.test(
      "quest achievements unlock once at 1/10, stay tenant-scoped and do not mint bonus hearts",
      async () => {
        let state = await getQuestState(db, users[0]);
        const before = state.balance;
        const done = state.completionCount;
        for (let i = done; i < 10; i++) await credit(0, 1);
        state = await getQuestState(db, users[0]);
        assert.equal(state.balance, before + 10 - done);
        const earned = await getPetState(db, users[1]);
        assert.equal(
          earned.achievements.find((a) => a.id === "first-quest")
            ?.unlocked_at !== null,
          true,
        );
        assert.equal(
          earned.achievements.find((a) => a.id === "team-ten")?.unlocked_at !==
            null,
          true,
        );
        assert.equal(
          earned.achievements.filter((a) => a.unlocked_at !== null).length,
          3,
        );
        assert.equal(
          (await getPetState(db, users[2])).achievements.find(
            (a) => a.id === "team-ten",
          )?.unlocked_at,
          null,
        );
        const combined = await handleRequest(
          new Request(
            env.APP_URL + "/api/quests/state?planning=1&journal=1&pet=1",
            { headers: { Cookie: cookies[0] } },
          ),
          env,
        );
        assert.equal(combined.status, 200);
        assert.equal(
          (
            (await combined.json()) as {
              gamification: { pet: { name: string } };
            }
          ).gamification.pet.name,
          "มะลิ",
        );
      },
    );
    await t.test(
      "purchase/cooldown triggers guard SQL invariants, and deployment gate rejects missing trigger",
      async () => {
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO pet_feeds(couple_id,id,actor_id,fed_at) VALUES (?,?,?,?)",
            )
            .bind(couple, crypto.randomUUID(), users[0], fedAt + 28800001)
            .run(),
          /pet_cooldown/,
        );
        const otherCouple = (await getQuestState(db, users[4])).couple.id;
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO heart_entries(couple_id,id,kind,actor_id,reward_id,title,amount,created_at) VALUES (?,?,'redemption',?,'rose-rug','forged',-1,?)",
            )
            .bind(otherCouple, crypto.randomUUID(), users[4], Date.now())
            .run(),
          /pet_price_invalid/,
        );
        await assert.rejects(
          db
            .prepare(
              "INSERT INTO heart_entries(couple_id,id,kind,actor_id,reward_id,title,amount,created_at) VALUES (?,?,'redemption',?,'mint-hat','forged',-1,?)",
            )
            .bind(couple, crypto.randomUUID(), users[0], Date.now())
            .run(),
          /pet_item_owned|pet_price_invalid/,
        );
        const trigger = await db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE name='pet_purchase_apply'",
          )
          .first<{ sql: string }>();
        await db.prepare("DROP TRIGGER pet_purchase_apply").run();
        try {
          await assert.rejects(checkAuthSchema(env), /pet_purchase_apply/);
        } finally {
          await db.prepare(trigger!.sql).run();
        }
        await checkAuthSchema(env);
      },
    );
  },
);

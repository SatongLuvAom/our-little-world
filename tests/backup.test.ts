import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { randomFillSync } from "node:crypto";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { serializeSignedCookie } from "better-call";
import { createAuth } from "../src/lib/auth";
import {
  createCouple,
  createInvitation,
  acceptInvitation,
} from "../src/lib/pairing";
import {
  startBackup,
  exportBackupPart,
  previewRestore,
  uploadRestorePart,
  commitRestore,
  backupTables,
  cancelRestore,
} from "../src/lib/backup-service";
import {
  type SealedBackup,
  backupArchiveSchema,
} from "../src/lib/backup-schema";
import {
  completeQuest,
  saveQuest,
  questDay,
  redeemReward,
} from "../src/lib/quest-service";
import {
  savePlanningRecord,
  addSavingsEntry,
  reverseSavingsEntry,
} from "../src/lib/planning-service";
import {
  saveJournal,
  deleteJournal,
  readLetter,
  getJournalState,
  readPhoto,
} from "../src/lib/journal-service";
import { feedPet, purchasePetItem, renamePet } from "../src/lib/pet-service";
import { handleRequest } from "../cloudflare/worker";
import { checkAuthSchema } from "../scripts/check-auth-schema";

function largePhoto() {
  const chunk = (type: string, data: Buffer) => {
    const content = Buffer.concat([Buffer.from(type), data]),
      size = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let n = 0; n < 8; n++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    size.writeUInt32BE(data.length);
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, sum]);
  };
  const header = Buffer.alloc(13),
    raster = Buffer.alloc((220 * 4 + 1) * 220);
  header.writeUInt32BE(220);
  header.writeUInt32BE(220, 4);
  header[8] = 8;
  header[9] = 6;
  randomFillSync(raster);
  for (let row = 0; row < 220; row++) raster[row * (220 * 4 + 1)] = 0;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raster)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test(
  "Phase 6 encrypted couple backups and atomic restore",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")),
      path = resolve(
        ".wrangler",
        "backup-test-" + crypto.randomUUID() + ".jsonc",
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
        APP_URL: "http://localhost:3017",
        BETTER_AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
      },
      db = env.DB;
    for (const file of (await readdir("cloudflare/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      for (const sql of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(sql).run();
    const adapter = (await createAuth(env).$context).internalAdapter,
      users: string[] = [],
      cookies: string[] = [],
      sessions: string[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await adapter.createUser(
          {
            name: "Backup " + i,
            email: "backup" + i + "@test.invalid",
            username: "backup_" + i,
            emailVerified: false,
          },
          { method: "test-fixture" },
        ),
        s = await adapter.createSession(u.id);
      users.push(u.id);
      sessions.push(s.id);
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
      await acceptInvitation(
        db,
        users[b],
        (await createInvitation(db, users[a])).token,
      );
    }
    const couple = (await db
      .prepare("SELECT couple_id FROM couple_members WHERE user_id=?")
      .bind(users[0])
      .first<{ couple_id: string }>())!.couple_id;
    const request = (
      op: string,
      body: unknown = {},
      person = 0,
      origin = env.APP_URL,
    ) =>
      handleRequest(
        new Request(env.APP_URL + "/api/backup/" + op, {
          method: "POST",
          headers: {
            Cookie: cookies[person],
            Origin: origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }),
        env,
      );
    const archive = async () => {
      const start = await startBackup(env, users[0]),
        parts: SealedBackup[] = [];
      for (let index = 0; index < start.summary.parts; index++)
        parts.push(
          await exportBackupPart(env, users[0], {
            manifest: start.manifest,
            index,
          }),
        );
      return { ...start, parts };
    };
    const stage = async (
      saved: Awaited<ReturnType<typeof archive>>,
      person = 0,
    ) => {
      const preview = await previewRestore(env, users[person], {
        manifest: saved.manifest,
      });
      for (let index = 0; index < saved.parts.length; index++)
        await uploadRestorePart(env, users[person], {
          id: preview.id,
          index,
          part: saved.parts[index],
        });
      return preview;
    };
    const snapshot = async (id = couple) => {
      const tables = [
        ...Object.keys(backupTables),
        "heart_wallets",
        "savings_balances",
        "pet_inventory",
      ];
      const rows = await db.batch<Record<string, unknown>>(
        tables.map((table) =>
          db
            .prepare(`SELECT * FROM ${table} WHERE couple_id=? ORDER BY rowid`)
            .bind(id),
        ),
      );
      return Object.fromEntries(
        tables.map((table, index) => [
          table,
          rows[index].results
            .map((row) =>
              Object.fromEntries(
                Object.entries(row).filter(([key]) => key !== "version"),
              ),
            )
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        ]),
      );
    };
    await t.test(
      "migration gate and API require session, same origin, paired member and fresh login",
      async () => {
        await checkAuthSchema(env);
        assert.equal(
          (
            await handleRequest(
              new Request(env.APP_URL + "/api/backup/start", {
                method: "POST",
                headers: { Origin: env.APP_URL },
                body: "{}",
              }),
              env,
            )
          ).status,
          401,
        );
        assert.equal((await request("start", {}, 4)).status, 403);
        assert.equal(
          (await request("start", {}, 0, "https://outsider.invalid")).status,
          403,
        );
        await db
          .prepare("UPDATE auth_sessions SET createdAt=? WHERE id=?")
          .bind(Date.now() - 901000, sessions[0])
          .run();
        assert.equal((await request("start")).status, 403);
        await db
          .prepare("UPDATE auth_sessions SET createdAt=? WHERE id=?")
          .bind(Date.now(), sessions[0])
          .run();
        assert.equal(
          (await request("upload-part", { bad: "x".repeat(600001) })).status,
          413,
        );
      },
    );
    const empty = await archive();
    const goal = crypto.randomUUID(),
      letter = crypto.randomUUID(),
      memory = crypto.randomUUID(),
      photo = largePhoto();
    const questIds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const id = crypto.randomUUID();
      questIds.push(id);
      await saveQuest(db, users[0], {
        id,
        version: 0,
        title: "Backup quest " + i,
        assignee_id: null,
        due: questDay(),
        repeat: "ครั้งเดียว",
        hearts: 20,
      });
      await completeQuest(db, users[i % 2], {
        id,
        request_id: crypto.randomUUID(),
      });
    }
    await purchasePetItem(db, users[1], {
      item_id: "mint-hat",
      request_id: crypto.randomUUID(),
    });
    await redeemReward(db, users[0], {
      reward_id: "massage",
      request_id: crypto.randomUUID(),
    });
    const clock = Date.now,
      now = Date.now();
    try {
      for (let i = 0; i < 3; i++) {
        Date.now = () => now - 28800000 + i * 14400000;
        await feedPet(db, users[i % 2], { request_id: crypto.randomUUID() });
      }
    } finally {
      Date.now = clock;
    }
    const pet = await db
      .prepare("SELECT version FROM couple_pets WHERE couple_id=?")
      .bind(couple)
      .first<{ version: number }>();
    await renamePet(db, users[0], {
      name: "Backup cat",
      version: pet!.version,
    });
    await savePlanningRecord(db, users[0], {
      kind: "goal",
      id: goal,
      version: 0,
      title: "Backup savings",
      target_cents: 10000000000,
      due: "2099-12-31",
    });
    let deposit = "";
    for (let i = 0; i < 10; i++) {
      const id = crypto.randomUUID();
      if (i === 0) deposit = id;
      await addSavingsEntry(db, users[0], {
        id,
        goal_id: goal,
        contributor_id: users[i % 2],
        amount_cents: 1000000000,
        note: "Savings " + i,
      });
    }
    await reverseSavingsEntry(db, users[1], {
      id: crypto.randomUUID(),
      entry_id: deposit,
      note: "Correct an entry",
    });
    await addSavingsEntry(db, users[0], {
      id: crypto.randomUUID(),
      goal_id: goal,
      contributor_id: users[0],
      amount_cents: 1000000000,
      note: "After reversal at balance limit",
    });
    await savePlanningRecord(db, users[0], {
      kind: "date",
      id: crypto.randomUUID(),
      version: 0,
      title: "Date",
      place: "Home",
      day: questDay(),
      time: "18:30",
      budget_cents: 12345,
    });
    await savePlanningRecord(db, users[0], {
      kind: "wish",
      id: crypto.randomUUID(),
      version: 0,
      title: "Wish",
      category: "สิ่งของ",
      done: false,
    });
    await savePlanningRecord(db, users[1], {
      kind: "event",
      id: crypto.randomUUID(),
      version: 0,
      title: "Event",
      day: questDay(),
      event_kind: "กิจกรรม",
    });
    await saveJournal(db, users[0], {
      kind: "memory",
      id: memory,
      title: "Original private photo",
      day: questDay(),
      note: "Keep metadata",
      photo: "data:image/png;base64," + photo.toString("base64"),
    });
    await saveJournal(db, users[1], {
      kind: "letter",
      id: letter,
      title: "Future letter",
      body: "SECRET-UNOPENED-LETTER",
      openOn: "2099-12-31",
    });
    for (let i = 0; i < 2; i++)
      await saveJournal(db, users[i], {
        kind: "mood",
        day: questDay(),
        mood: "อบอุ่น",
        note: "Mood " + i,
        version: 0,
      });
    const original = await snapshot(),
      saved = await archive();
    await t.test(
      "complete encrypted archive contains all pages, private photo, history and locked letters without revealing bodies",
      async () => {
        assert.equal(saved.summary.hearts, 150);
        assert.equal(saved.summary.savings_cents, 10000000000);
        assert.equal(saved.summary.counts.memories, 1);
        assert.equal(saved.summary.counts.heart_entries, 14);
        assert(!JSON.stringify(saved).includes("SECRET-UNOPENED-LETTER"));
        assert(
          !JSON.stringify(saved.parts).includes(
            photo.toString("base64").slice(100, 180),
          ),
        );
        assert(
          backupArchiveSchema.safeParse({
            app: "our-little-world",
            version: 1,
            manifest: saved.manifest,
            parts: saved.parts,
          }).success,
        );
        assert(saved.parts.some((part) => part.data.length > 300000));
        await assert.rejects(readLetter(db, users[0], letter));
      },
    );
    await t.test(
      "cross-couple export/preview/upload/commit are rejected and other deployment keys cannot decrypt",
      async () => {
        assert.equal(
          (await request("preview", { manifest: saved.manifest }, 2)).status,
          400,
        );
        await assert.rejects(
          exportBackupPart(env, users[2], {
            manifest: saved.manifest,
            index: 0,
          }),
        );
        await assert.rejects(
          previewRestore(
            { ...env, BETTER_AUTH_SECRET: "different-key" },
            users[0],
            { manifest: saved.manifest },
          ),
        );
        const preview = await previewRestore(env, users[0], {
          manifest: saved.manifest,
        });
        assert.equal(
          (
            await request(
              "upload-part",
              { id: preview.id, index: 0, part: saved.parts[0] },
              2,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              "commit",
              { id: preview.id, confirmation: "กู้คืนข้อมูล" },
              2,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "tampered ciphertext, wrong part index, incomplete archive and invalid confirmation cannot change data",
      async () => {
        const preview = await previewRestore(env, users[0], {
          manifest: saved.manifest,
        });
        const part = {
          ...saved.parts[0],
          data:
            (saved.parts[0].data[0] === "A" ? "B" : "A") +
            saved.parts[0].data.slice(1),
        };
        assert.equal(
          (await request("upload-part", { id: preview.id, index: 0, part }))
            .status,
          400,
        );
        assert.equal(
          (
            await request("upload-part", {
              id: preview.id,
              index: 1,
              part: saved.parts[0],
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("commit", {
              id: preview.id,
              confirmation: "กู้คืนข้อมูล",
            })
          ).status,
          400,
        );
        assert.equal(
          (await request("commit", { id: preview.id, confirmation: "yes" }))
            .status,
          400,
        );
        assert.deepEqual(await snapshot(), original);
      },
    );
    await t.test("edits during export reject mixed revisions", async () => {
      const start = await startBackup(env, users[0]);
      await deleteJournal(db, users[0], { kind: "memory", id: memory });
      assert.equal(
        (await request("export-part", { manifest: start.manifest, index: 0 }))
          .status,
        409,
      );
    });
    await t.test(
      "partner edit after preview rejects stale restore without overwriting current data",
      async () => {
        const preview = await stage(saved);
        await saveJournal(db, users[1], {
          kind: "mood",
          day: questDay(),
          mood: "สดใส",
          note: "Partner new edit",
          version: 1,
        });
        const before = await snapshot();
        assert.equal(
          (
            await request("commit", {
              id: preview.id,
              confirmation: "กู้คืนข้อมูล",
            })
          ).status,
          409,
        );
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "database failure after delete rolls back all source data, ledger totals, versions and job state",
      async () => {
        const preview = await stage(saved),
          before = await snapshot();
        await db
          .prepare(
            "UPDATE backup_rows SET data=json_set(data,'$.actor_id',?) WHERE job_id=? AND table_name='heart_entries'",
          )
          .bind(users[2], preview.id)
          .run();
        await assert.rejects(
          commitRestore(env, users[0], {
            id: preview.id,
            confirmation: "กู้คืนข้อมูล",
          }),
          /FOREIGN KEY/i,
        );
        assert.deepEqual(await snapshot(), before);
        assert.equal(
          (await db
            .prepare("SELECT state FROM backup_jobs WHERE id=?")
            .bind(preview.id)
            .first<{ state: string }>())!.state,
          "staging",
        );
      },
    );
    await t.test(
      "restore returns deleted private photo and exact ledgers, wallet, savings, pet and badges; repeated commit is harmless",
      async () => {
        const other = (await db
            .prepare("SELECT couple_id FROM couple_members WHERE user_id=?")
            .bind(users[2])
            .first<{ couple_id: string }>())!.couple_id,
          untouched = await snapshot(other);
        const preview = await stage(saved, 1);
        await uploadRestorePart(env, users[1], {
          id: preview.id,
          index: 0,
          part: saved.parts[0],
        });
        const first = await commitRestore(env, users[1], {
          id: preview.id,
          confirmation: "กู้คืนข้อมูล",
        });
        assert.equal(first.applied, true);
        assert.deepEqual(await snapshot(), original);
        assert.deepEqual(await snapshot(other), untouched);
        assert.equal(
          (
            await commitRestore(env, users[0], {
              id: preview.id,
              confirmation: "กู้คืนข้อมูล",
            })
          ).applied,
          false,
        );
        assert.deepEqual(await snapshot(), original);
        assert.equal(
          (await db
            .prepare("SELECT count(*) AS n FROM backup_rows WHERE job_id=?")
            .bind(preview.id)
            .first<{ n: number }>())!.n,
          0,
        );
        const journal = await getJournalState(env, users[1], sessions[1]),
          url = new URL(journal.memories[0].photo, env.APP_URL),
          response = await readPhoto(env, users[1], sessions[1], url);
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
        await assert.rejects(readLetter(db, users[0], letter));
        assert.equal(
          (await db
            .prepare("SELECT count(*) AS n FROM auth_sessions")
            .first<{ n: number }>())!.n,
          5,
        );
        await assert.rejects(
          saveQuest(db, users[0], {
            id: questIds[0],
            version: 1,
            title: "Stale form",
            assignee_id: null,
            due: questDay(),
            repeat: "ครั้งเดียว",
            hearts: 20,
          }),
        );
      },
    );
    await t.test("simultaneous commits apply only once", async () => {
      const preview = await stage(saved);
      const results = await Promise.all(
        [0, 1].map((person) =>
          commitRestore(env, users[person], {
            id: preview.id,
            confirmation: "กู้คืนข้อมูล",
          }),
        ),
      );
      assert.deepEqual(results.map((r) => r.applied).sort(), [false, true]);
      assert.deepEqual(await snapshot(), original);
    });
    await t.test(
      "versions never go backward across empty restores and legacy high versions",
      async () => {
        await db
          .prepare("UPDATE quests SET version=100000 WHERE id=?")
          .bind(questIds[0])
          .run();
        const first = await stage(saved);
        await commitRestore(env, users[0], {
          id: first.id,
          confirmation: "กู้คืนข้อมูล",
        });
        const old = (await db
          .prepare("SELECT version FROM quests WHERE id=?")
          .bind(questIds[0])
          .first<{ version: number }>())!.version;
        const clear = await stage(empty);
        await commitRestore(env, users[0], {
          id: clear.id,
          confirmation: "กู้คืนข้อมูล",
        });
        assert.equal(
          (await db
            .prepare("SELECT count(*) AS n FROM quests WHERE couple_id=?")
            .bind(couple)
            .first<{ n: number }>())!.n,
          0,
        );
        assert.equal(
          (await db
            .prepare(
              "SELECT count(*) AS n FROM heart_wallets WHERE couple_id=?",
            )
            .bind(couple)
            .first<{ n: number }>())!.n,
          0,
        );
        const next = await stage(saved);
        await commitRestore(env, users[1], {
          id: next.id,
          confirmation: "กู้คืนข้อมูล",
        });
        const current = (await db
          .prepare("SELECT version FROM quests WHERE id=?")
          .bind(questIds[0])
          .first<{ version: number }>())!.version;
        assert(
          current > old,
          "restored version must exceed even the version of an absent record",
        );
        await assert.rejects(
          saveQuest(db, users[0], {
            id: questIds[0],
            version: old,
            title: "Ancient form",
            assignee_id: null,
            due: questDay(),
            repeat: "ครั้งเดียว",
            hearts: 20,
          }),
        );
        assert.deepEqual(await snapshot(), original);
      },
    );
    await t.test(
      "expired staging and explicit cancel cannot apply, and schema gate detects a missing revision trigger",
      async () => {
        const preview = await stage(saved);
        await db
          .prepare("UPDATE backup_jobs SET expires_at=? WHERE id=?")
          .bind(Date.now() - 1000, preview.id)
          .run();
        assert.equal(
          (
            await request("commit", {
              id: preview.id,
              confirmation: "กู้คืนข้อมูล",
            })
          ).status,
          410,
        );
        const next = await stage(saved);
        await cancelRestore(env, users[1], { id: next.id });
        assert.equal(
          (
            await request("commit", {
              id: next.id,
              confirmation: "กู้คืนข้อมูล",
            })
          ).status,
          404,
        );
        await db.prepare("DROP TRIGGER backup_revision_memories_delete").run();
        await assert.rejects(checkAuthSchema(env));
      },
    );
  },
);

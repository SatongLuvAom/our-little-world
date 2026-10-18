import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";
import { serializeSignedCookie } from "better-call";
import { createAuth } from "../src/lib/auth";
import {
  createCouple,
  createInvitation,
  acceptInvitation,
} from "../src/lib/pairing";
import {
  deleteJournal,
  getJournalState,
  readLetter,
  readPhoto,
  saveJournal,
  validatePhoto,
} from "../src/lib/journal-service";
import { questDay } from "../src/lib/quest-service";
import { handleRequest } from "../cloudflare/worker";
import { checkAuthSchema } from "../scripts/check-auth-schema";

function png(width = 2, height = 2, extraRaster = 0) {
  const chunk = (type: string, data: Buffer) => {
    const bytes = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let b = 0; b < 8; b++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, bytes, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk(
      "IDAT",
      deflateSync(Buffer.alloc((width * 4 + 1) * height + extraRaster)),
    ),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test(
  "Phase 4 D1 private journal, timed content and tenant boundaries",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")),
      path = resolve(
        ".wrangler",
        "journal-test-" + crypto.randomUUID() + ".jsonc",
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
      .filter((n) => n.endsWith(".sql"))
      .sort())
      for (const sql of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(sql).run();
    const adapter = (await createAuth(env).$context).internalAdapter,
      users: string[] = [],
      sessions: string[] = [],
      cookies: string[] = [];
    for (let i = 0; i < 5; i++) {
      const user = await adapter.createUser(
        {
          name: "Journal " + i,
          email: "journal" + i + "@test.invalid",
          username: "journal_" + i,
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
            "olw.session_token",
            session.token,
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
      operation: string,
      body?: unknown,
      person = 0,
      origin = env.APP_URL,
    ) =>
      handleRequest(
        new Request(env.APP_URL + "/api/journal/" + operation, {
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
    const photo = "data:image/png;base64," + png().toString("base64"),
      memory = {
        kind: "memory",
        id: crypto.randomUUID(),
        title: "Private memory",
        day: questDay(),
        note: "Just us",
        photo,
      };
    await t.test(
      "migration/gate, initially empty, sessions/origin/unpaired/forged identity",
      async () => {
        await checkAuthSchema(env);
        assert.deepEqual(
          (await getJournalState(env, users[0], sessions[0])).memories,
          [],
        );
        assert.equal(
          (
            await handleRequest(
              new Request(env.APP_URL + "/api/journal/state"),
              env,
            )
          ).status,
          401,
        );
        assert.equal(
          (await api("save", memory, 0, "https://evil.invalid")).status,
          403,
        );
        assert.equal((await api("state", undefined, 4)).status, 403);
        assert.equal(
          (await api("save", { ...memory, author_id: users[1] })).status,
          400,
        );
        assert.equal(
          (await api("save", { ...memory, couple_id: crypto.randomUUID() }))
            .status,
          400,
        );
      },
    );
    await t.test(
      "actual raster validation rejects MIME spoofing, truncation, trailing content, CRC, dimensions and zip bombs",
      async () => {
        assert.deepEqual(validatePhoto(photo), png());
        for (const value of [
          "data:image/svg+xml;base64," +
            Buffer.from("<svg/>").toString("base64"),
          "data:image/png;base64," +
            Buffer.from("<html>evil</html>").toString("base64"),
          photo.slice(0, -8),
          "data:image/png;base64," +
            Buffer.concat([png(), Buffer.from("secret")]).toString("base64"),
          "data:image/png;base64," + png(1025, 1).toString("base64"),
          "data:image/png;base64," + png(2, 2, 10000).toString("base64"),
          "data:image/png;base64," + Buffer.alloc(200001).toString("base64"),
        ])
          assert.throws(() => validatePhoto(value));
        const broken = png();
        broken[45] ^= 1;
        assert.throws(() =>
          validatePhoto("data:image/png;base64," + broken.toString("base64")),
        );
        assert.equal(
          (
            await api("save", {
              ...memory,
              photo: "data:image/png;base64,PHN2Zy8+",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "simultaneous memory replay persists once, preserves bytes and prevents conflicting UUID reuse",
      async () => {
        const replies = await Promise.all(
          Array.from({ length: 6 }, () => api("save", memory)),
        );
        assert.ok(replies.every((r) => r.status === 200));
        const results = await Promise.all(
          replies.map((r) => r.json() as Promise<{ applied: boolean }>),
        );
        assert.equal(results.filter((r) => r.applied).length, 1);
        assert.equal(
          (await api("save", { ...memory, note: "changed" })).status,
          409,
        );
        const a = await getJournalState(env, users[0], sessions[0]),
          b = await getJournalState(env, users[1], sessions[1]),
          c = await getJournalState(env, users[2], sessions[2]);
        assert.equal(a.memories.length, 1);
        assert.equal(b.memories.length, 1);
        assert.equal(c.memories.length, 0);
        assert.equal(JSON.stringify(a).includes(photo), false);
        for (const [state, person] of [
          [a, 0],
          [b, 1],
        ] as const) {
          const r = await readPhoto(
            env,
            users[person],
            sessions[person],
            new URL(state.memories[0].photo, env.APP_URL),
          );
          assert.deepEqual(Buffer.from(await r.arrayBuffer()), png());
          assert.equal(r.headers.get("Cache-Control"), "private, no-store");
        }
      },
    );
    await t.test(
      "signed photos are bound to identity/session/id/expiry and still check couple membership",
      async () => {
        const state = await getJournalState(env, users[0], sessions[0]),
          url = new URL(state.memories[0].photo, env.APP_URL);
        for (const [person, session] of [
          [1, sessions[1]],
          [2, sessions[2]],
          [0, crypto.randomUUID()],
        ] as const)
          await assert.rejects(readPhoto(env, users[person], session, url));
        for (const [key, value] of [
          ["id", crypto.randomUUID()],
          ["expires", String(Number(url.searchParams.get("expires")) + 1)],
          ["signature", "0".repeat(64)],
        ]) {
          const tampered = new URL(url);
          tampered.searchParams.set(key, value);
          await assert.rejects(readPhoto(env, users[0], sessions[0], tampered));
        }
        const clock = Date.now;
        try {
          Date.now = () => Number(url.searchParams.get("expires")) * 1000;
          await assert.rejects(readPhoto(env, users[0], sessions[0], url));
        } finally {
          Date.now = clock;
        }
        assert.equal(
          (await api("photo" + url.search, undefined, 2)).status,
          403,
        );
        assert.equal(
          (await api("delete", { kind: "memory", id: memory.id }, 1)).status,
          404,
        );
        assert.equal(
          (await api("delete", { kind: "memory", id: memory.id }, 2)).status,
          404,
        );
      },
    );
    const letter = {
      kind: "letter",
      id: crypto.randomUUID(),
      title: "Future",
      openOn: "2099-01-02",
      body: "PRIVATE BODY 🌸",
    };
    await t.test(
      "letters store authenticated author, replay once, never put body in metadata, author/partner cannot read early",
      async () => {
        assert.equal((await api("save", letter)).status, 200);
        assert.equal((await api("save", letter)).status, 200);
        for (const person of [0, 1, 2]) {
          const r = await api("letter?id=" + letter.id, undefined, person);
          assert.equal(r.status, 404);
          assert.equal((await r.text()).includes(letter.body), false);
        }
        for (const person of [0, 1]) {
          const s = await getJournalState(env, users[person], sessions[person]);
          assert.equal(s.letters.length, 1);
          assert.equal(s.letters[0].author_id, users[0]);
          assert.equal(s.letters[0].locked, true);
          assert.equal(JSON.stringify(s).includes(letter.body), false);
        }
        const combined = await handleRequest(
          new Request(env.APP_URL + "/api/quests/state?planning=1&journal=1", {
            headers: { Cookie: cookies[0] },
          }),
          env,
        );
        const text = await combined.text();
        assert.equal(combined.status, 200);
        assert.equal(text.includes(letter.body), false);
        assert.ok(text.includes('"journal"'));
        assert.equal(
          (await api("delete", { kind: "letter", id: letter.id }, 1)).status,
          404,
        );
        assert.equal(
          (
            await api("save", {
              ...letter,
              id: crypto.randomUUID(),
              author_id: users[1],
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("save", {
              ...letter,
              id: crypto.randomUUID(),
              openOn: "2026-02-30",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await api("save", {
              ...letter,
              id: crypto.randomUUID(),
              openOn: "2000-01-01",
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "server Thai midnight releases body exactly at boundary; client dates cannot bypass it",
      async () => {
        const clock = Date.now;
        try {
          Date.now = () => Date.parse("2099-01-01T16:59:59.999Z");
          await assert.rejects(readLetter(db, users[0], letter.id));
          Date.now = () => Date.parse("2099-01-01T17:00:00.000Z");
          assert.equal(
            (await readLetter(db, users[1], letter.id)).body,
            letter.body,
          );
          await assert.rejects(readLetter(db, users[2], letter.id));
          assert.equal(
            (await getJournalState(env, users[0], sessions[0])).letters[0]
              .locked,
            false,
          );
        } finally {
          Date.now = clock;
        }
      },
    );
    await t.test(
      "mood is unique by real user/server day, partner cannot impersonate, retry and stale versions are safe",
      async () => {
        const mood = {
          kind: "mood",
          day: questDay(),
          mood: "สดใส",
          note: "Me",
          version: 0,
        };
        assert.equal((await api("save", mood)).status, 200);
        assert.equal((await api("save", mood)).status, 200);
        assert.equal(
          (await api("save", { ...mood, mood: "อบอุ่น" }, 1)).status,
          200,
        );
        assert.equal(
          (await api("save", { ...mood, user_id: users[1] })).status,
          400,
        );
        assert.equal(
          (await api("save", { ...mood, day: "2099-01-01" })).status,
          409,
        );
        assert.equal(
          (await api("save", { ...mood, mood: "invalid" })).status,
          400,
        );
        assert.equal(
          (await api("save", { ...mood, mood: "ตื่นเต้น", version: 1 })).status,
          200,
        );
        assert.equal(
          (await api("save", { ...mood, mood: "เหนื่อยนิดหน่อย", version: 1 }))
            .status,
          409,
        );
        const s = await getJournalState(env, users[1], sessions[1]);
        assert.equal(s.moods.length, 2);
        assert.equal(s.moods.find((m) => m.user_id === users[0])?.version, 2);
        assert.equal(
          (await getJournalState(env, users[2], sessions[2])).moods.length,
          0,
        );
      },
    );
    await t.test(
      "concurrent mood edits have one winner and midnight requires fresh day",
      async () => {
        const result = await Promise.all(
          ["อบอุ่น", "อยากได้กอด"].map((mood) =>
            api("save", {
              kind: "mood",
              day: questDay(),
              mood,
              note: "concurrent",
              version: 2,
            }),
          ),
        );
        assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
        const clock = Date.now;
        try {
          Date.now = () => Date.parse("2030-01-01T16:59:59.999Z");
          await saveJournal(db, users[0], {
            kind: "mood",
            day: "2030-01-01",
            mood: "สดใส",
            note: "",
            version: 0,
          });
          Date.now = () => Date.parse("2030-01-01T17:00:00Z");
          await assert.rejects(
            saveJournal(db, users[0], {
              kind: "mood",
              day: "2030-01-01",
              mood: "สดใส",
              note: "",
              version: 0,
            }),
          );
          await saveJournal(db, users[0], {
            kind: "mood",
            day: "2030-01-02",
            mood: "สดใส",
            note: "",
            version: 0,
          });
        } finally {
          Date.now = clock;
        }
      },
    );
    await t.test(
      "author delete immediately revokes photo and letter access; full Thai letter fits bounded request",
      async () => {
        const state = await getJournalState(env, users[0], sessions[0]),
          url = new URL(state.memories[0].photo, env.APP_URL);
        await deleteJournal(db, users[0], { kind: "memory", id: memory.id });
        await assert.rejects(readPhoto(env, users[0], sessions[0], url));
        await deleteJournal(db, users[0], { kind: "letter", id: letter.id });
        assert.equal(
          (await getJournalState(env, users[1], sessions[1])).letters.length,
          0,
        );
        assert.equal(
          (
            await api("save", {
              ...letter,
              id: crypto.randomUUID(),
              openOn: questDay(),
              body: "รัก".repeat(1666),
            })
          ).status,
          200,
        );
        assert.equal(
          (await api("save", { ...memory, photo: "x".repeat(300001) })).status,
          413,
        );
      },
    );
    await t.test(
      "atomic 100-memory limit holds under competing inserts, private bytes absent from snapshot, missing index blocks deploy",
      async () => {
        for (let i = 0; i < 99; i++)
          await saveJournal(db, users[2], {
            ...memory,
            id: crypto.randomUUID(),
            photo: "",
          });
        const result = await Promise.all(
          Array.from({ length: 6 }, () =>
            api("save", { ...memory, id: crypto.randomUUID(), photo: "" }, 2),
          ),
        );
        assert.equal(result.filter((r) => r.status === 200).length, 1);
        assert.equal(
          (await getJournalState(env, users[2], sessions[2])).memories.length,
          100,
        );
        const index = await db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE name='memories_by_couple'",
          )
          .first<{ sql: string }>();
        await db.prepare("DROP INDEX memories_by_couple").run();
        try {
          await assert.rejects(checkAuthSchema(env), /memories_by_couple/);
        } finally {
          await db.prepare(index!.sql).run();
        }
      },
    );
  },
);

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
import backend, { handleRequest } from "../cloudflare/worker";
import {
  getDiagnostics,
  recordServerError,
  reportBrowserError,
} from "../src/lib/diagnostic-service";
import { checkAuthSchema } from "../scripts/check-auth-schema";
import { safeErrorRoute } from "../src/lib/diagnostic-schema";
import { pageRoutes } from "../src/lib/diagnostic-schema";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind } from "typescript";

test(
  "private bounded diagnostics preserve authorization and business ledgers",
  { timeout: 120000 },
  async (t) => {
    const config = JSON.parse(await readFile("wrangler.jsonc", "utf8")),
      configPath = resolve(
        ".wrangler",
        "test-diagnostics-" + crypto.randomUUID() + ".jsonc",
      );
    await mkdir(".wrangler", { recursive: true });
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
        APP_VERSION: { id: crypto.randomUUID() },
      },
      db = env.DB;
    for (const file of (await readdir("cloudflare/migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort())
      for (const sql of unstable_splitSqlQuery(
        await readFile("cloudflare/migrations/" + file, "utf8"),
      ))
        await db.prepare(sql).run();
    const adapter = (await createAuth(env).$context).internalAdapter,
      users: string[] = [],
      cookies: string[] = [];
    for (let i = 0; i < 6; i++) {
      const user = await adapter.createUser(
        {
          name: "QA " + i,
          email: "diagnostic_" + i + "@accounts.our-little-world.invalid",
          username: "diagnostic_" + i,
          emailVerified: false,
        },
        { method: "fixture" },
      );
      users.push(user.id);
      const session = await adapter.createSession(user.id);
      cookies.push(
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
    await createCouple(db, users[0], "2024-02-14");
    const invite = await createInvitation(db, users[0]);
    await acceptInvitation(db, users[1], invite.token);
    for (let i = 2; i < 6; i++) await createCouple(db, users[i], "2024-02-14");
    const request = (
      op: string,
      body?: unknown,
      who = 0,
      origin: string | null = env.APP_URL,
    ) =>
      new Request(env.APP_URL + "/api/diagnostics/" + op, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(who >= 0 ? { Cookie: cookies[who] } : {}),
          ...(origin ? { Origin: origin } : {}),
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const api = (
      op: string,
      body?: unknown,
      who = 0,
      origin: string | null = env.APP_URL,
    ) => handleRequest(request(op, body, who, origin), env);
    const report = { route: "/quests", code: "runtime" };
    t.beforeEach(() => db.prepare("DELETE FROM diagnostic_events").run());

    await t.test(
      "schema gate includes diagnostics and detects the missing lookup index",
      async () => {
        await checkAuthSchema(env);
        await db.prepare("DROP INDEX diagnostics_by_couple").run();
        await assert.rejects(checkAuthSchema(env), /diagnostics_by_couple/);
        await db
          .prepare(
            "CREATE INDEX diagnostics_by_couple ON diagnostic_events(couple_id,day DESC,last_at DESC)",
          )
          .run();
      },
    );
    await t.test(
      "session/origin and a strict bounded payload protect reporting",
      async () => {
        assert.equal((await api("state", undefined, -1)).status, 401);
        assert.equal((await api("report", report, -1)).status, 401);
        assert.equal(
          (await api("report", report, 0, "https://foreign.invalid")).status,
          403,
        );
        assert.equal((await api("report", report, 0, null)).status, 403);
        for (const data of [
          { ...report, message: "PRIVATE" },
          { ...report, stack: "PRIVATE" },
          { ...report, user_id: users[2] },
          { ...report, route: "/quests?secret=PRIVATE" },
          { ...report, code: "arbitrary" },
          { ...report, source: "server" },
        ])
          assert.equal((await api("report", data)).status, 400);
        assert.equal((await api("report", report)).status, 200);
        const own = await getDiagnostics(env, users[0]),
          partner = await getDiagnostics(env, users[1]),
          other = await getDiagnostics(env, users[2]);
        assert.equal(own.totalCount, 1);
        assert.deepEqual(partner, own);
        assert.equal(other.totalCount, 0);
        assert.equal(own.events[0].route, "/quests");
        assert.equal(own.events[0].version, env.APP_VERSION.id);
        assert.equal(JSON.stringify(own).includes("PRIVATE"), false);
      },
    );
    await t.test(
      "concurrent browser loops are capped per couple and do not suppress server signals",
      async () => {
        for (let offset = 0; offset < 24; offset += 6)
          await Promise.all(
            Array.from({ length: 6 }, (_, i) =>
              reportBrowserError(
                env,
                users[(offset + i) % 2],
                report,
                crypto.randomUUID(),
              ),
            ),
          );
        assert.equal((await getDiagnostics(env, users[0])).totalCount, 20);
        const original = console.error,
          logs: string[] = [];
        console.error = (value) => logs.push(String(value));
        try {
          await recordServerError(
            env,
            users[1],
            "/api/journal/photo",
            crypto.randomUUID(),
          );
        } finally {
          console.error = original;
        }
        assert.equal((await getDiagnostics(env, users[0])).totalCount, 21);
        assert.equal(JSON.parse(logs[0]).entryPoint, "http");
      },
    );
    await t.test(
      "global daily budget is atomic and bounded at 100 per source",
      async () => {
        for (const actor of [users[0], ...users.slice(2)])
          for (let j = 0; j < 4; j++)
            await Promise.all(
              Array.from({ length: 6 }, () =>
                reportBrowserError(env, actor, report, crypto.randomUUID()),
              ),
            );
        const count = await db
          .prepare(
            "SELECT sum(count) AS n FROM diagnostic_events WHERE source='browser'",
          )
          .first<{ n: number }>();
        assert.equal(count!.n, 100);
        await reportBrowserError(
          env,
          users[0],
          { ...report, code: "promise" },
          crypto.randomUUID(),
        );
        assert.equal(
          (await db
            .prepare(
              "SELECT sum(count) AS n FROM diagnostic_events WHERE source='browser'",
            )
            .first<{ n: number }>())!.n,
          100,
        );
      },
    );
    await t.test(
      "real backend failures record a safe code and response correlation ID without exception contents",
      async () => {
        let fail = true;
        const broken = new Proxy(db, {
          get(target, key) {
            if (key === "batch")
              return async (stmts: Parameters<typeof db.batch>[0]) => {
                if (fail) {
                  fail = false;
                  throw Error("PRIVATE-LETTER-TOKEN-DO-NOT-STORE");
                }
                return target.batch(stmts);
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const original = console.error,
          logs: string[] = [];
        console.error = (value) => logs.push(String(value));
        try {
          const response = await backend.fetch(
            new Request(env.APP_URL + "/api/quests/state?secret=PRIVATE", {
              headers: { Cookie: cookies[0] },
            }),
            { ...env, DB: broken },
          );
          assert.equal(response.status, 500);
          const body = (await response.json()) as { request_id: string };
          assert.equal(
            response.headers.get("X-OLW-Request-ID"),
            body.request_id,
          );
          const state = await getDiagnostics(env, users[1]);
          assert.equal(state.totalCount, 1);
          assert.equal(state.events[0].last_id, body.request_id);
          assert.equal(state.events[0].route, "/api/quests/state");
          assert.equal(JSON.stringify(state).includes("PRIVATE"), false);
          assert.equal(logs.join().includes("PRIVATE"), false);
          assert.equal(JSON.parse(logs[0]).requestId, body.request_id);
        } finally {
          console.error = original;
        }
      },
    );
    await t.test(
      "retention removes expired diagnostics; business data and revisions remain untouched",
      async () => {
        const before = await db
          .prepare("SELECT sum(revision) AS n FROM couple_revisions")
          .first<{ n: number }>();
        await reportBrowserError(env, users[0], report, crypto.randomUUID());
        await db.prepare("UPDATE diagnostic_events SET day=day-14").run();
        assert.equal((await getDiagnostics(env, users[0])).totalCount, 0);
        assert.equal(
          (await db
            .prepare("SELECT count(*) AS n FROM diagnostic_events")
            .first<{ n: number }>())!.n,
          0,
        );
        assert.equal(
          (await db
            .prepare("SELECT sum(revision) AS n FROM couple_revisions")
            .first<{ n: number }>())!.n,
          before!.n,
        );
        for (const table of [
          "heart_entries",
          "heart_wallets",
          "savings_entries",
          "savings_balances",
          "pet_feeds",
        ])
          assert.equal(
            (await db
              .prepare(`SELECT count(*) AS n FROM ${table}`)
              .first<{ n: number }>())!.n,
            0,
          );
      },
    );
    await t.test(
      "routes redact arbitrary paths and a diagnostic DB failure cannot replace the original error",
      async () => {
        assert.equal(
          safeErrorRoute("/api/journal/photo?signature=PRIVATE"),
          "other",
        );
        assert.equal(safeErrorRoute("/api/auth/PRIVATE"), "/api/auth");
        assert.equal(safeErrorRoute("/someone/PRIVATE"), "other");
        const original = console.error,
          logs: string[] = [];
        console.error = (value) => logs.push(String(value));
        try {
          await recordServerError(
            {
              ...env,
              DB: {
                prepare() {
                  throw Error("PRIVATE DATABASE SECRET");
                },
              } as unknown as CloudflareEnv["DB"],
            },
            undefined,
            "/PRIVATE",
            crypto.randomUUID(),
          );
        } finally {
          console.error = original;
        }
        assert.equal(logs.length, 2);
        assert.equal(logs.join().includes("PRIVATE"), false);
        assert.equal(JSON.parse(logs[1]).event, "diagnostic_store_unavailable");
      },
    );
  },
);

test("client diagnostics send only fixed route/code, deduplicate and bound traffic without offline retries", async () => {
  const source = transpileModule(
    readFileSync("src/lib/error-reporting.ts", "utf8"),
    { compilerOptions: { module: ModuleKind.CommonJS } },
  ).outputText;
  const sent: { url: string; body: string }[] = [],
    exported: { reportClientError?: (code: string) => void } = {};
  const browser = { onLine: true },
    location = {
      pathname: "/quests",
      search: "?secret=PRIVATE",
      hash: "#PRIVATE",
    };
  runInNewContext(source, {
    exports: exported,
    require: () => ({ safeErrorRoute, pageRoutes }),
    window: {},
    navigator: browser,
    location,
    fetch: async (url: string, options: { body: string }) => {
      sent.push({ url, body: options.body });
      throw Error("PRIVATE NETWORK DETAILS");
    },
    Set,
  });
  const report = exported.reportClientError!;
  report("runtime");
  report("runtime");
  browser.onLine = false;
  report("promise");
  browser.onLine = true;
  assert.equal(sent.length, 1);
  report("promise");
  report("render");
  report("asset");
  assert.equal(sent.length, 3);
  for (const request of sent) {
    assert.equal(request.url, "/api/diagnostics/report");
    assert.deepEqual(Object.keys(JSON.parse(request.body)), ["route", "code"]);
    assert.equal(request.body.includes("PRIVATE"), false);
  }
  location.pathname = "/unknown/PRIVATE";
  report("runtime");
  assert.equal(sent.length, 3);
  await Promise.resolve();
});

test("non-API immutable asset responses remain untouched by request ID instrumentation", async () => {
  const redirect = Response.redirect("https://example.invalid/", 302);
  const response = await backend.fetch(
    new Request("http://localhost:3017/static"),
    { ASSETS: { fetch: async () => redirect } } as unknown as CloudflareEnv,
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.has("X-OLW-Request-ID"), false);
});

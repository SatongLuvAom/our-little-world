import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  beginAppUpdate,
  beginOnlineOperation,
  cancelAppUpdate,
  isAppBusy,
  pendingStorage,
} from "../src/lib/client-safety";

function worker() {
  // Execute the shipped worker template, not a reimplementation of its policy.
  const handlers: Record<string, (event: { [key: string]: unknown }) => void> =
    {};
  const stores = new Map<string, Map<string, string>>();
  const fetched: string[] = [];
  const notifications: {
    title: string;
    options: { body: string; data: { url: string }; tag: string };
  }[] = [];
  const opened: string[] = [],
    messages: unknown[] = [];
  let clients = [{ id: "one" }],
    activated = 0,
    claimed = 0,
    fail = "";
  const cache = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name)!;
    return {
      put: async (key: string, response: Response) =>
        entries.set(key, await response.text()),
      match: async (key: string) =>
        entries.has(key) ? new Response(entries.get(key)) : undefined,
    };
  };
  const code = readFileSync("scripts/service-worker.js", "utf8")
    .replace("__VERSION__", "test")
    .replace(
      "__FILES__",
      JSON.stringify([
        "/index.html",
        "/us.html",
        "/us.txt",
        "/_next/static/app.js",
      ]),
    )
    .replace(
      "__ROUTES__",
      JSON.stringify({ "/": "/index.html", "/us": "/us.html" }),
    )
    .replace("__INTEGRITY__", "{}");
  runInNewContext(code, {
    URL,
    Set,
    Request: class extends Request {
      constructor(url: string, init: RequestInit) {
        super(new URL(url, "https://our.test"), init);
      }
    },
    self: {
      addEventListener: (name: string, handler: (typeof handlers)[string]) => {
        handlers[name] = handler;
      },
      location: { origin: "https://our.test" },
      registration: {
        showNotification: async (
          title: string,
          options: (typeof notifications)[number]["options"],
        ) => {
          notifications.push({ title, options });
        },
      },
      clients: {
        matchAll: async () =>
          clients.map((client) => ({
            ...client,
            url: "https://our.test/us",
            focus: async () => {},
            postMessage: (message: unknown) => messages.push(message),
          })),
        openWindow: async (url: string) => opened.push(url),
        claim: async () => {
          claimed++;
        },
      },
      skipWaiting: async () => {
        activated++;
      },
    },
    caches: {
      open: cache,
      keys: async () => [...stores.keys()],
      delete: async (key: string) => stores.delete(key),
      match: async (key: string) => {
        for (const store of stores.values())
          if (store.has(key)) return new Response(store.get(key));
      },
    },
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      fetched.push(url.pathname);
      if (url.pathname === fail)
        return new Response("missing", { status: 404 });
      assert.equal(request.credentials, "omit");
      return new Response("public:" + url.pathname);
    },
  });
  async function dispatch(name: string, props = {}) {
    const pending: Promise<unknown>[] = [];
    handlers[name]({
      ...props,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
  }
  async function request(path: string, method = "GET", mode = "cors") {
    let result: Promise<Response> | undefined;
    handlers.fetch({
      request: { url: new URL(path, "https://our.test").href, method, mode },
      respondWith: (value: Promise<Response>) => {
        result = value;
      },
    });
    return result ? (await result).text() : null;
  }
  return {
    notifications,
    opened,
    messages,
    dispatch,
    request,
    fetched,
    stores,
    setClients: (value: typeof clients) => {
      clients = value;
    },
    setFail: (value: string) => {
      fail = value;
    },
    activated: () => activated,
    claimed: () => claimed,
  };
}

test("PWA precaches canonical public pages and serves offline navigation/RSC without network", async () => {
  const w = worker();
  await w.dispatch("install");
  assert.deepEqual(w.fetched, ["/", "/us", "/us.txt", "/_next/static/app.js"]);
  assert.equal(w.activated(), 0, "installation never skips a waiting update");
  assert.equal(
    await w.request("/us?from=home", "GET", "navigate"),
    "public:/us",
  );
  assert.equal(await w.request("/us.txt?_rsc=test"), "public:/us.txt");
  assert.equal(w.fetched.length, 4);
});
test("PWA never intercepts private API/auth/photo/letter requests, POSTs or third parties", async () => {
  const w = worker();
  await w.dispatch("install");
  for (const path of [
    "/api/quests/state",
    "/api/auth/get-session",
    "/api/journal/photo?id=x",
    "/api/journal/letter?id=x",
    "https://other.test/us",
    "/unknown",
  ]) {
    assert.equal(await w.request(path), null, path);
  }
  for (const path of [
    "/api/planning/deposit",
    "/api/quests/redeem",
    "/api/pet/purchase",
    "/us",
  ]) {
    assert.equal(await w.request(path, "POST"), null, path);
  }
  assert.equal(w.fetched.length, 4);
});
test("Incomplete offline install is rejected and leaves the previous build intact", async () => {
  const w = worker();
  w.stores.set("olw-static-previous", new Map([["/us.html", "old"]]));
  w.setFail("/us.txt");
  await assert.rejects(w.dispatch("install"), /Incomplete offline build/);
  assert.equal(w.stores.has("olw-static-test"), false);
  assert.equal(w.stores.get("olw-static-previous")?.get("/us.html"), "old");
});
test("Old hashed chunks remain available to an older open page", async () => {
  const w = worker();
  w.stores.set(
    "olw-static-previous",
    new Map([["/_next/static/old-hash.js", "previous-chunk"]]),
  );
  assert.equal(await w.request("/_next/static/old-hash.js"), "previous-chunk");
});
test("Update activation requires the sole requesting tab; cache cleanup preserves one older build", async () => {
  const w = worker(),
    messages: unknown[] = [];
  const source = {
    id: "one",
    postMessage: (value: unknown) => messages.push(value),
  };
  w.setClients([{ id: "one" }, { id: "two" }]);
  await w.dispatch("message", { data: { type: "APPLY_UPDATE" }, source });
  assert.equal(w.activated(), 0);
  assert.equal(JSON.stringify(messages), '[{"type":"UPDATE_BLOCKED"}]');
  w.setClients([{ id: "two" }]);
  await w.dispatch("message", { data: { type: "APPLY_UPDATE" }, source });
  assert.equal(w.activated(), 0);
  w.setClients([{ id: "one" }]);
  await w.dispatch("message", { data: { type: "APPLY_UPDATE" }, source });
  assert.equal(w.activated(), 1);
  for (const version of ["oldest", "previous", "test"])
    w.stores.set("olw-static-" + version, new Map());
  w.stores.set("other-app", new Map());
  await w.dispatch("activate");
  assert.deepEqual(
    [...w.stores.keys()],
    ["olw-static-previous", "olw-static-test", "other-app"],
  );
  assert.equal(w.claimed(), 1);
});

test("Push always displays fixed generic text; malformed payloads and arbitrary navigation cannot expose content or open external URLs", async () => {
  const w = worker();
  const tag = crypto.randomUUID();
  await w.dispatch("push", {
    data: {
      json: () => ({
        kind: "letters",
        tag,
        body: "SECRET",
        url: "https://attacker.test",
      }),
    },
  });
  assert.equal(w.notifications[0].title, "Our Little World");
  assert.equal(w.notifications[0].options.data.url, "/explore/letters");
  assert(!JSON.stringify(w.notifications).includes("SECRET"));
  await w.dispatch("push", {
    data: {
      json: () => {
        throw Error("malformed");
      },
    },
  });
  assert.equal(w.notifications.length, 2);
  let closed = false;
  await w.dispatch("notificationclick", {
    notification: {
      close: () => {
        closed = true;
      },
      data: { url: "https://attacker.test" },
    },
  });
  assert(closed);
  assert.equal(
    JSON.stringify(w.messages),
    '[{"type":"PUSH_OPEN","url":"/us"}]',
  );
  assert.equal(
    w.opened.length,
    0,
    "an existing editing window receives a message, never a forced navigation",
  );
  w.setClients([]);
  await w.dispatch("notificationclick", {
    notification: { close: () => {}, data: { url: "/explore/dates" } },
  });
  assert.deepEqual(w.opened, ["https://our.test/explore/dates"]);
  let supported = false;
  await w.dispatch("message", {
    data: { type: "PUSH_CAPABLE" },
    ports: [
      {
        postMessage: (value: { push: boolean }) => {
          supported = value.push;
        },
      },
    ],
  });
  assert(supported);
});

test("Pending IDs migrate without replacement, survive session loss, and fail closed on storage errors", () => {
  const local = new Map<string, string>(),
    session = new Map<string, string>();
  const storage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage(local),
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage(session),
  });
  session.set("olw:pending-reward:couple:reward", "original-id");
  assert.equal(
    pendingStorage.getItem("olw:pending-reward:couple:reward"),
    "original-id",
  );
  session.clear();
  assert.equal(
    pendingStorage.getItem("olw:pending-reward:couple:reward"),
    "original-id",
  );
  assert.equal(pendingStorage.getItem("olw:pending-reward:other:reward"), null);
  pendingStorage.removeItem("olw:pending-reward:couple:reward");
  assert.equal(local.size, 0);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: () => {
        throw Error("quota");
      },
    },
  });
  assert.throws(() => pendingStorage.setItem("key", "id"), /quota/);
});
test("Offline and update locks reject new writes; in-flight operations block app updates", () => {
  const nav = { onLine: true };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: nav,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: new EventTarget(),
  });
  const finish = beginOnlineOperation();
  assert.equal(isAppBusy(), true);
  assert.equal(beginAppUpdate(), false);
  finish();
  assert.equal(beginAppUpdate(), true);
  assert.throws(beginOnlineOperation, /กำลังอัปเดต/);
  cancelAppUpdate();
  nav.onLine = false;
  assert.throws(beginOnlineOperation, /ออฟไลน์/);
  assert.equal(beginAppUpdate(), false);
  assert.equal(isAppBusy(), false);
});

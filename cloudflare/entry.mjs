import { DurableObject } from "cloudflare:workers";
import backend from "./worker";
import { dispatchPush } from "../src/lib/push-service";
import { recordServerError } from "../src/lib/diagnostic-service";

// SQLite-backed class is available on Free. App data and authorization remain in D1.
export class AccountBackend extends DurableObject {
  async dispatchPush() {
    const requestId = crypto.randomUUID();
    try {
      const result = await dispatchPush(this.env);
      console.log(
        JSON.stringify({
          event: "push_dispatch",
          entryPoint: "cron",
          requestId,
          configured: result.configured,
          sent: result.sent || 0,
          skipped: result.skipped || 0,
          failed: result.failed || 0,
          uncertain: result.uncertain || 0,
          retry: result.retry || 0,
        }),
      );
      return result;
    } catch {
      await recordServerError(
        this.env,
        undefined,
        "scheduled",
        requestId,
        "cron",
      );
      throw new Error("PUSH_DISPATCH_FAILED");
    }
  }
  async handleApi(input) {
    if (!new URL(input.url).pathname.startsWith("/api/"))
      throw new Error("AccountBackend only accepts API requests");
    const request = new Request(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
    });
    const response = await backend.fetch(request, this.env);
    const headers = [...response.headers].filter(
      ([name]) => name.toLowerCase() !== "set-cookie",
    );
    for (const cookie of response.headers.getSetCookie())
      headers.push(["Set-Cookie", cookie]);
    // Finish the bounded response inside RPC; bytes preserve private images without live streams.
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: response.body ? await response.arrayBuffer() : null,
    };
  }
}

const worker = {
  async scheduled(_controller, env, ctx) {
    // Keep Cron CPU below the Free Worker budget; crypto and bounded delivery use the existing SQLite DO.
    ctx.waitUntil(
      env.ACCOUNT_BACKEND.getByName("push-dispatch").dispatchPush(),
    );
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith("/api/")) return backend.fetch(request, env);
    // Always replace a caller's diagnostic ID before crossing RPC.
    const requestId = crypto.randomUUID(),
      forwarded = new Headers(request.headers);
    forwarded.set("X-OLW-Request-ID", requestId);
    // Coordinate each edge-authenticated client separately; D1 still enforces global rate limits.
    // No identity/session is cached in the Object and no public header can select another user.
    const ip =
      request.headers.get("cf-connecting-ip")?.slice(0, 64) || "unknown";
    // Transfer bounded bytes rather than live streams, including writes rejected before body parsing.
    let body = null;
    if (request.body) {
      const limit = path.startsWith("/api/backup/")
        ? 600000
        : path === "/api/journal/save"
          ? 300000
          : 16384;
      const reader = request.body.getReader(),
        chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return Response.json(
            { error: "ข้อมูลยาวเกินไป" },
            {
              status: 413,
              headers: {
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }
        chunks.push(value);
      }
      if (chunks.length === 1) body = chunks[0];
      else {
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        body = bytes.buffer;
      }
    }
    let result;
    try {
      result = await env.ACCOUNT_BACKEND.getByName("client:" + ip).handleApi({
        url: request.url,
        method: request.method,
        headers: [...forwarded],
        body,
      });
    } catch {
      await recordServerError(env, undefined, path, requestId);
      return Response.json(
        {
          error: "เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่ด้วยรายการเดิม",
          request_id: requestId,
        },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "X-OLW-Request-ID": requestId,
          },
        },
      );
    }
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  },
};
export default worker;

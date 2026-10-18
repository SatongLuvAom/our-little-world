import { z } from "zod";
import {
  DiagnosticError,
  getDiagnostics,
  reportBrowserError,
  recordServerError,
} from "../src/lib/diagnostic-service";
import {
  PushError,
  pushState,
  subscribePush,
  unsubscribePush,
  testPush,
} from "../src/lib/push-service";
import {
  BackupError,
  startBackup,
  exportBackupPart,
  previewRestore,
  uploadRestorePart,
  commitRestore,
  cancelRestore,
} from "../src/lib/backup-service";
import {
  equipPetItem,
  feedPet,
  getPetState,
  PetError,
  purchasePetItem,
  renamePet,
} from "../src/lib/pet-service";
import {
  deleteJournal,
  getJournalState,
  JournalError,
  readLetter,
  readPhoto,
  saveJournal,
} from "../src/lib/journal-service";
import { createAuth } from "../src/lib/auth";
import { handleAuthRequest } from "../src/lib/auth-handler";
import {
  addSavingsEntry,
  deletePlanningRecord,
  getPlanningState,
  getSavingsHistory,
  PlanningError,
  reverseSavingsEntry,
  savePlanningRecord,
} from "../src/lib/planning-service";
import {
  completeQuest,
  deleteQuest,
  getQuestHistory,
  getQuestState,
  QuestError,
  redeemReward,
  saveQuest,
} from "../src/lib/quest-service";
import {
  anniversarySchema,
  invitationSchema,
  pairingError,
} from "../src/lib/auth-schema";
import {
  createCouple,
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  getAccountContext,
  PairingError,
} from "../src/lib/pairing";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function handleRequest(
  request: Request,
  env: CloudflareEnv,
  diagnostic?: { actor?: string; requestId?: string },
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/auth/")) return handleAuthRequest(request, env);
  if (!path.startsWith("/api/")) {
    if (!env.ASSETS) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
    }) as unknown as Promise<Response>;
  }
  const isQuest = path.startsWith("/api/quests/");
  const isPlanning = path.startsWith("/api/planning/");
  const isJournal = path.startsWith("/api/journal/");
  const isPet = path.startsWith("/api/pet/");
  const isBackup = path.startsWith("/api/backup/");
  const isPush = path.startsWith("/api/push/");
  const isDiagnostic = path.startsWith("/api/diagnostics/");
  const operation = path.replace(
    isDiagnostic
      ? "/api/diagnostics/"
      : isPush
        ? "/api/push/"
        : isBackup
          ? "/api/backup/"
          : isQuest
            ? "/api/quests/"
            : isPlanning
              ? "/api/planning/"
              : isPet
                ? "/api/pet/"
                : isJournal
                  ? "/api/journal/"
                  : "/api/account/",
    "",
  );
  if (!(
    ((isDiagnostic
      ? operation === "state"
      : isPush
        ? operation === "state"
        : isBackup
          ? false
          : isPet
            ? operation === "state"
            : isJournal
              ? ["state", "letter", "photo"].includes(operation)
              : isQuest || isPlanning
                ? ["state", "history"].includes(operation)
                : operation === "context") &&
      request.method === "GET") ||
    ((isDiagnostic
      ? ["report"]
      : isPush
        ? ["subscribe", "unsubscribe", "test"]
        : isBackup
          ? [
              "start",
              "export-part",
              "preview",
              "upload-part",
              "commit",
              "cancel",
            ]
          : isPet
            ? ["feed", "purchase", "equip", "rename"]
            : isJournal
              ? ["save", "delete"]
              : isQuest
                ? ["save", "delete", "complete", "redeem"]
                : isPlanning
                  ? ["save", "delete", "deposit", "reverse"]
                  : ["couple", "invitation", "accept", "revoke", "profile"]
    ).includes(operation) &&
      request.method === "POST")
  ))
    return json({ error: "ไม่พบคำขอนี้" }, 404);
  if (
    request.method === "POST" &&
    request.headers.get("Origin") !== new URL(env.APP_URL).origin
  )
    return json({ error: "ไม่อนุญาตคำขอจากเว็บไซต์นี้" }, 403);
  const auth = createAuth(env);
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session) return json({ error: "ต้องเข้าสู่ระบบ" }, 401);
  const actor = session.user.id;
  if (diagnostic) diagnostic.actor = actor;
  if (
    isBackup &&
    Date.now() - new Date(session.session.createdAt).getTime() > 900000
  )
    return json(
      {
        error:
          "เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าใหม่ ก่อนสำรองหรือกู้คืนข้อมูล",
      },
      403,
    );
  if (operation === "context")
    return json(await getAccountContext(env.DB, actor));
  try {
    if (isDiagnostic && request.method === "GET")
      return json(await getDiagnostics(env, actor));
    if (isPush && request.method === "GET")
      return json(await pushState(env, actor));
    if (isPet && request.method === "GET")
      return json(await getPetState(env.DB, actor));
    if (isJournal && request.method === "GET") {
      if (operation === "photo")
        return await readPhoto(
          env,
          actor,
          session.session.id,
          new URL(request.url),
        );
      return json(
        operation === "state"
          ? await getJournalState(env, actor, session.session.id)
          : await readLetter(
              env.DB,
              actor,
              z.uuid().parse(new URL(request.url).searchParams.get("id")),
            ),
      );
    }
    if (isPlanning && request.method === "GET")
      return json(
        operation === "state"
          ? await getPlanningState(env.DB, actor)
          : await getSavingsHistory(
              env.DB,
              actor,
              z.uuid().parse(new URL(request.url).searchParams.get("before")),
            ),
      );
    if (isQuest && request.method === "GET") {
      if (
        operation === "state" &&
        new URL(request.url).searchParams.get("planning") === "1"
      ) {
        const state = await getQuestState(env.DB, actor);
        return json({
          ...state,
          planning: await getPlanningState(env.DB, actor),
          ...(new URL(request.url).searchParams.get("pet") === "1"
            ? { gamification: await getPetState(env.DB, actor) }
            : {}),
          ...(new URL(request.url).searchParams.get("journal") === "1"
            ? { journal: await getJournalState(env, actor, session.session.id) }
            : {}),
        });
      }
      return json(
        operation === "state"
          ? await getQuestState(env.DB, actor)
          : await getQuestHistory(
              env.DB,
              actor,
              z.uuid().parse(new URL(request.url).searchParams.get("before")),
            ),
      );
    }
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > (isBackup ? 600000 : isJournal ? 300000 : 4096)) {
          await reader.cancel();
          return json({ error: "ข้อมูลยาวเกินไป" }, 413);
        }
        chunks.push(value);
      }
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    } catch {
      return json({ error: "รูปแบบข้อมูลไม่ถูกต้อง" }, 400);
    }
    if (isDiagnostic)
      return json(
        await reportBrowserError(
          env,
          actor,
          body,
          diagnostic?.requestId || crypto.randomUUID(),
        ),
      );
    if (isPush) {
      switch (operation) {
        case "subscribe":
          return json(
            await subscribePush(env, actor, session.session.id, body),
          );
        case "unsubscribe":
          return json(await unsubscribePush(env, actor, body));
        case "test":
          return json(await testPush(env, actor, body));
      }
    }
    if (isBackup) {
      switch (operation) {
        case "start":
          return json(await startBackup(env, actor));
        case "export-part":
          return json(await exportBackupPart(env, actor, body));
        case "preview":
          return json(await previewRestore(env, actor, body));
        case "upload-part":
          return json(await uploadRestorePart(env, actor, body));
        case "commit":
          return json(await commitRestore(env, actor, body));
        case "cancel":
          return json(await cancelRestore(env, actor, body));
      }
    }
    if (isPet) {
      switch (operation) {
        case "feed":
          return json(await feedPet(env.DB, actor, body));
        case "purchase":
          return json(await purchasePetItem(env.DB, actor, body));
        case "equip":
          return json(await equipPetItem(env.DB, actor, body));
        case "rename":
          return json(await renamePet(env.DB, actor, body));
      }
    }
    if (isJournal)
      return json(
        await (operation === "save"
          ? saveJournal(env.DB, actor, body)
          : deleteJournal(env.DB, actor, body)),
      );
    if (isPlanning) {
      switch (operation) {
        case "save":
          await savePlanningRecord(env.DB, actor, body);
          break;
        case "delete":
          await deletePlanningRecord(env.DB, actor, body);
          break;
        case "deposit":
          return json(await addSavingsEntry(env.DB, actor, body));
        case "reverse":
          return json(await reverseSavingsEntry(env.DB, actor, body));
      }
      return json({ message: "บันทึกแล้ว" });
    }
    if (isQuest) {
      switch (operation) {
        case "save":
          await saveQuest(env.DB, actor, body);
          break;
        case "delete":
          await deleteQuest(env.DB, actor, body);
          break;
        case "complete":
          return json(await completeQuest(env.DB, actor, body));
        case "redeem":
          return json(await redeemReward(env.DB, actor, body));
      }
      return json({ message: "บันทึกแล้ว" });
    }
    switch (operation) {
      case "couple":
        await createCouple(
          env.DB,
          actor,
          anniversarySchema.parse(body).anniversary,
        );
        break;
      case "invitation": {
        const invitation = await createInvitation(env.DB, actor);
        return json({
          token: invitation.token,
          invitationId: invitation.id,
          expiresAt: invitation.expires_at,
          message: "สร้างรหัสคำเชิญแล้ว รหัสก่อนหน้าถูกยกเลิก",
        });
      }
      case "accept":
        await acceptInvitation(
          env.DB,
          actor,
          invitationSchema.parse(body).token,
        );
        break;
      case "revoke":
        await revokeInvitation(
          env.DB,
          actor,
          z.object({ invitation_id: z.uuid() }).parse(body).invitation_id,
        );
        break;
      case "profile": {
        const name = z
          .object({ display_name: z.string().trim().min(1).max(120) })
          .parse(body).display_name;
        await auth.api.updateUser({
          headers: request.headers,
          body: { name },
        });
        return json({ message: "บันทึกชื่อของคุณแล้ว" });
      }
    }
    return json({
      message: operation === "revoke" ? "ยกเลิกรหัสคำเชิญแล้ว" : "บันทึกแล้ว",
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        {
          error: "ตรวจสอบข้อมูลในแบบฟอร์ม",
          fields: z.flattenError(error).fieldErrors,
        },
        400,
      );
    if (error instanceof PairingError)
      return json({ error: pairingError(error.message) }, 400);
    if (error instanceof QuestError)
      return json({ error: error.message }, error.status);
    if (error instanceof PlanningError)
      return json({ error: error.message }, error.status);
    if (error instanceof JournalError)
      return json({ error: error.message }, error.status);
    if (error instanceof PetError)
      return json({ error: error.message }, error.status);
    if (error instanceof BackupError)
      return json({ error: error.message }, error.status);
    if (error instanceof PushError)
      return json({ error: error.message }, error.status);
    if (error instanceof DiagnosticError)
      return json({ error: error.message }, error.status);
    throw error;
  }
}
const worker = {
  async fetch(request: Request, env: CloudflareEnv) {
    const diagnostic: { actor?: string; requestId?: string } = {};
    const rawId = request.headers.get("X-OLW-Request-ID"),
      requestId =
        rawId && z.uuid().safeParse(rawId).success
          ? rawId
          : crypto.randomUUID();
    diagnostic.requestId = requestId;
    try {
      const response = await handleRequest(request, env, diagnostic);
      if (new URL(request.url).pathname.startsWith("/api/"))
        response.headers.set("X-OLW-Request-ID", requestId);
      return response;
    } catch {
      await recordServerError(
        env,
        diagnostic.actor,
        new URL(request.url).pathname,
        requestId,
      );
      const response = json(
        { error: "ระบบขัดข้อง กรุณาลองใหม่", request_id: requestId },
        500,
      );
      response.headers.set("X-OLW-Request-ID", requestId);
      return response;
    }
  },
};
export default worker;

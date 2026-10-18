import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import {
  accountContextSchema,
  anniversarySchema,
  invitationSchema,
} from "./auth-schema";
const now = () => Date.now();
const uuid = z.uuid();
export class PairingError extends Error {}
export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function getAccountContext(db: D1Database, actor: string) {
  uuid.parse(actor);
  const [profile, couple, members, invitation] = await db.batch([
    db
      .prepare(
        "SELECT id,name AS display_name,username FROM auth_users WHERE id = ?",
      )
      .bind(actor),
    db
      .prepare(
        "SELECT c.id,c.anniversary,c.timezone FROM couples c JOIN couple_members m ON m.couple_id = c.id WHERE m.user_id = ?",
      )
      .bind(actor),
    db
      .prepare(
        "SELECT u.id,u.name AS display_name FROM auth_users u JOIN couple_members m ON m.user_id = u.id WHERE m.couple_id = (SELECT couple_id FROM couple_members WHERE user_id = ?) ORDER BY m.joined_at,m.user_id",
      )
      .bind(actor),
    db
      .prepare(
        "SELECT id,expires_at FROM invitations WHERE couple_id = (SELECT couple_id FROM couple_members WHERE user_id = ?) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?",
      )
      .bind(actor, now()),
  ]);
  return accountContextSchema.parse({
    profile: profile.results[0],
    couple: couple.results[0]
      ? {
          ...couple.results[0],
          members: members.results,
          invitation: invitation.results[0] || null,
        }
      : null,
  });
}
export async function createCouple(
  db: D1Database,
  actor: string,
  anniversary: string,
) {
  uuid.parse(actor);
  anniversarySchema.parse({ anniversary });
  const id = crypto.randomUUID(),
    at = now();
  await db.batch([
    db
      .prepare(
        "INSERT INTO couples(id,anniversary,created_by,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM couple_members WHERE user_id = ?)",
      )
      .bind(id, anniversary, actor, at, actor),
    db
      .prepare(
        "INSERT INTO couple_members(couple_id,user_id,joined_at) SELECT id,?,? FROM couples WHERE id = ?",
      )
      .bind(actor, at, id),
  ]);
  const membership = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id = ?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!membership) throw new PairingError("couple_required");
  return membership.couple_id;
}
export async function createInvitation(db: D1Database, actor: string) {
  uuid.parse(actor);
  const id = crypto.randomUUID(),
    at = now(),
    expires_at = at + 24 * 3600000;
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
  const hash = await tokenHash(token);
  const result = await db.batch([
    db
      .prepare(
        "UPDATE invitations SET revoked_at = ? WHERE couple_id = (SELECT couple_id FROM couple_members WHERE user_id = ?) AND accepted_at IS NULL AND revoked_at IS NULL AND (SELECT count(*) FROM couple_members WHERE couple_id = invitations.couple_id) < 2",
      )
      .bind(at, actor),
    db
      .prepare(
        "INSERT INTO invitations(id,couple_id,token_hash,created_by,expires_at,created_at) SELECT ?,m.couple_id,?,?,?,? FROM couple_members m WHERE m.user_id = ? AND (SELECT count(*) FROM couple_members WHERE couple_id = m.couple_id) < 2 RETURNING id",
      )
      .bind(id, hash, actor, expires_at, at, actor),
  ]);
  if (!result[1].results.length)
    throw new PairingError("couple_full_or_couple_required");
  return { id, token, expires_at };
}
export async function acceptInvitation(
  db: D1Database,
  actor: string,
  token: string,
) {
  uuid.parse(actor);
  invitationSchema.parse({ token });
  const hash = await tokenHash(token),
    at = now();
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO couple_members(couple_id,user_id,joined_at) SELECT i.couple_id,?,? FROM invitations i WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > ? AND i.created_by <> ? AND NOT EXISTS(SELECT 1 FROM couple_members WHERE user_id = ?) AND (SELECT count(*) FROM couple_members WHERE couple_id = i.couple_id) < 2",
      )
      .bind(actor, at, hash, at, actor, actor),
    // changes() binds consumption to the preceding INSERT in this atomic D1 batch.
    db
      .prepare(
        "UPDATE invitations SET accepted_by = ?,accepted_at = ? WHERE changes() = 1 AND token_hash = ? AND accepted_at IS NULL",
      )
      .bind(actor, at, hash),
    db
      .prepare(
        "SELECT i.couple_id FROM invitations i JOIN couple_members m ON m.couple_id = i.couple_id AND m.user_id = ? WHERE i.token_hash = ? AND i.accepted_by = ?",
      )
      .bind(actor, hash, actor),
  ]);
  const row = results[2].results[0];
  if (row) return z.object({ couple_id: uuid }).parse(row).couple_id;
  const existing = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id = ?")
    .bind(actor)
    .first();
  throw new PairingError(
    existing ? "already_paired" : "invitation_unavailable",
  );
}
export async function revokeInvitation(
  db: D1Database,
  actor: string,
  id: string,
) {
  uuid.parse(actor);
  uuid.parse(id);
  const result = await db
    .prepare(
      "UPDATE invitations SET revoked_at = coalesce(revoked_at,?) WHERE id = ? AND couple_id = (SELECT couple_id FROM couple_members WHERE user_id = ?) AND accepted_at IS NULL",
    )
    .bind(now(), id, actor)
    .run();
  if (!result.meta.changes) throw new PairingError("invitation_unavailable");
}

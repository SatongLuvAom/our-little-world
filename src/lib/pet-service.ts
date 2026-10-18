import type { D1Database } from "@cloudflare/workers-types";
import {
  equipPetSchema,
  feedPetSchema,
  petStateSchema,
  purchasePetSchema,
  renamePetSchema,
} from "./pet-schema";
export class PetError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
async function scope(db: D1Database, actor: string) {
  const row = await db
    .prepare("SELECT couple_id FROM couple_members WHERE user_id=?")
    .bind(actor)
    .first<{ couple_id: string }>();
  if (!row)
    throw new PetError("สร้างคู่หรือรับคำเชิญก่อนเลี้ยงแมวร่วมกัน", 403);
  return row.couple_id;
}
export async function getPetState(db: D1Database, actor: string) {
  const couple = await scope(db, actor),
    now = Date.now();
  const [pets, items, achievements] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "SELECT name,feeds,last_fed,wearing,version FROM couple_pets WHERE couple_id=?",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT r.id,r.title,r.cost,r.active,EXISTS(SELECT 1 FROM pet_inventory i WHERE i.couple_id=? AND i.item_id=r.id) AS owned FROM reward_catalog r WHERE r.category='pet' ORDER BY r.rowid",
      )
      .bind(couple),
    db
      .prepare(
        "SELECT a.id,a.title,a.detail,a.target,CASE a.metric WHEN 'completion' THEN coalesce((SELECT completion_count FROM heart_wallets WHERE couple_id=?1),0) ELSE coalesce((SELECT feeds FROM couple_pets WHERE couple_id=?1),0) END AS progress,u.unlocked_at FROM achievement_catalog a LEFT JOIN couple_achievements u ON u.achievement_id=a.id AND u.couple_id=?1 ORDER BY a.rowid",
      )
      .bind(couple),
  ]);
  const pet = pets.results[0] || {
    name: "โมจิ",
    feeds: 0,
    last_fed: null,
    wearing: null,
    version: 0,
  };
  return petStateSchema.parse({
    server_now: now,
    pet: {
      ...pet,
      next_feed_at:
        pet.last_fed === null ? null : Number(pet.last_fed) + 14400000,
    },
    items: items.results.map((i) => ({
      ...i,
      active: Boolean(i.active),
      owned: Boolean(i.owned),
    })),
    achievements: achievements.results,
  });
}
export async function feedPet(db: D1Database, actor: string, input: unknown) {
  const { request_id } = feedPetSchema.parse(input),
    couple = await scope(db, actor),
    now = Date.now();
  const [insert, replay] = await db.batch([
    db
      .prepare(
        "INSERT INTO pet_feeds(couple_id,id,actor_id,fed_at) SELECT ?1,?2,?3,?4 WHERE NOT EXISTS(SELECT 1 FROM pet_feeds WHERE couple_id=?1 AND id=?2) AND coalesce((SELECT last_fed FROM couple_pets WHERE couple_id=?1),?4-14400000)<=?4-14400000 RETURNING id",
      )
      .bind(couple, request_id, actor, now),
    db
      .prepare("SELECT id FROM pet_feeds WHERE couple_id=? AND id=?")
      .bind(couple, request_id),
  ]);
  if (replay.results.length) return { applied: insert.results.length > 0 };
  throw new PetError("แมวยังอิ่มอยู่ ให้อาหารได้อีกครั้งเมื่อครบ 4 ชั่วโมง");
}
export async function purchasePetItem(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { item_id, request_id } = purchasePetSchema.parse(input),
    couple = await scope(db, actor);
  const [insert, existing, owned] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "INSERT INTO heart_entries(couple_id,id,kind,actor_id,reward_id,title,amount,created_at) SELECT ?1,?2,'redemption',?3,r.id,'ซื้อ '||r.title,-r.cost,?4 FROM reward_catalog r WHERE r.id=?5 AND r.category='pet' AND r.active=1 AND NOT EXISTS(SELECT 1 FROM heart_entries WHERE couple_id=?1 AND id=?2) AND NOT EXISTS(SELECT 1 FROM pet_inventory WHERE couple_id=?1 AND item_id=r.id) AND coalesce((SELECT balance FROM heart_wallets WHERE couple_id=?1),0)>=r.cost RETURNING id",
      )
      .bind(couple, request_id, actor, Date.now(), item_id),
    db
      .prepare(
        "SELECT kind,reward_id FROM heart_entries WHERE couple_id=? AND id=?",
      )
      .bind(couple, request_id),
    db
      .prepare(
        "SELECT item_id FROM pet_inventory WHERE couple_id=? AND item_id=?",
      )
      .bind(couple, item_id),
  ]);
  const replay = existing.results[0];
  if (replay && (replay.kind !== "redemption" || replay.reward_id !== item_id))
    throw new PetError("รหัสคำขอนี้ใช้กับรายการอื่นแล้ว");
  if (owned.results.length) return { applied: insert.results.length > 0 };
  throw new PetError("หัวใจยังไม่พอ หรือไอเทมนี้ไม่พร้อมให้ซื้อ", 400);
}
export async function equipPetItem(
  db: D1Database,
  actor: string,
  input: unknown,
) {
  const { item_id, version } = equipPetSchema.parse(input),
    couple = await scope(db, actor);
  const [updated, current] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        "UPDATE couple_pets SET wearing=?1,version=version+1 WHERE couple_id=?2 AND version=?3 AND wearing IS NOT ?1 AND (?1 IS NULL OR EXISTS(SELECT 1 FROM pet_inventory WHERE couple_id=?2 AND item_id=?1)) RETURNING version",
      )
      .bind(item_id, couple, version),
    db
      .prepare("SELECT wearing FROM couple_pets WHERE couple_id=?")
      .bind(couple),
  ]);
  if (updated.results.length) return { applied: true };
  if (current.results.length && current.results[0].wearing === item_id)
    return { applied: false };
  throw new PetError("ของแต่งเปลี่ยนแล้วหรือยังไม่ได้ซื้อ กรุณาโหลดล่าสุด");
}
export async function renamePet(db: D1Database, actor: string, input: unknown) {
  const { name, version } = renamePetSchema.parse(input),
    couple = await scope(db, actor);
  const result =
    version === 0
      ? await db
          .prepare(
            "INSERT INTO couple_pets(couple_id,name) VALUES(?,?) ON CONFLICT DO NOTHING RETURNING version",
          )
          .bind(couple, name)
          .all()
      : await db
          .prepare(
            "UPDATE couple_pets SET name=?,version=version+1 WHERE couple_id=? AND version=? RETURNING version",
          )
          .bind(name, couple, version)
          .all();
  if (result.results.length) return { applied: true };
  const current = await db
    .prepare("SELECT name FROM couple_pets WHERE couple_id=?")
    .bind(couple)
    .first();
  if (current?.name === name) return { applied: false };
  throw new PetError("ข้อมูลแมวเปลี่ยนแล้ว กรุณาโหลดล่าสุด");
}

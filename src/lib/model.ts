import * as z from "zod";
export const person = z.enum(["เรา", "เธอ", "ด้วยกัน"]);
const id = z.string().min(1);
const title = z
  .string()
  .trim()
  .min(1, "กรอกข้อมูลก่อนนะ")
  .max(120, "ไม่เกิน 120 ตัวอักษร");
const day = z.iso.date();
export const questSchema = z.object({
  id,
  title,
  owner: person,
  due: day,
  repeat: z.enum(["ครั้งเดียว", "รายวัน", "รายสัปดาห์"]),
  hearts: z.number().int().min(1).max(500),
});
export const goalSchema = z.object({
  id,
  title,
  target: z.number().positive().max(100000000),
  due: day,
});
export const dateSchema = z.object({
  id,
  title,
  place: title,
  day,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  budget: z.number().min(0).max(10000000),
});
export const wishSchema = z.object({
  id,
  title,
  category: z.enum(["สถานที่", "ร้านอาหาร", "สิ่งของ"]),
  done: z.boolean(),
});
export const memorySchema = z.object({
  id,
  title,
  day,
  note: z.string().max(2000),
  photo: z.string().max(1500000),
});
export const letterSchema = z.object({
  id,
  title,
  body: z.string().trim().min(1).max(5000),
  openOn: day,
  author: z.enum(["เรา", "เธอ"]),
});
export const eventSchema = z.object({
  id,
  title,
  day,
  kind: z.enum(["กิจกรรม", "วันสำคัญ", "วันครบรอบ"]),
});
export const profileSchema = z.object({
  name1: title,
  name2: title,
  since: day,
  petName: title,
  reminders: z.boolean(),
});
export const stateSchema = z.object({
  version: z.literal(1),
  profile: profileSchema,
  quests: z.array(questSchema),
  goals: z.array(goalSchema),
  dates: z.array(dateSchema),
  wishes: z.array(wishSchema),
  memories: z.array(memorySchema),
  letters: z.array(letterSchema),
  events: z.array(eventSchema),
  completions: z.array(
    z.object({
      id,
      questId: id,
      title,
      period: z.string(),
      at: z.string(),
      hearts: z.number(),
    }),
  ),
  hearts: z.array(
    z.object({
      id,
      amount: z.number().int(),
      reason: z.string(),
      at: z.string(),
    }),
  ),
  deposits: z.array(
    z.object({
      id,
      goalId: id,
      amount: z.number().positive(),
      person: z.enum(["เรา", "เธอ"]),
      at: z.string(),
      note: z.string().max(200),
    }),
  ),
  redemptions: z.array(
    z.object({ id, title, cost: z.number(), at: z.string() }),
  ),
  moods: z.array(
    z.object({
      id,
      person: z.enum(["เรา", "เธอ"]),
      day,
      mood: z.string(),
      note: z.string().max(300),
    }),
  ),
  pet: z.object({
    lastFed: z.string(),
    feeds: z.number().int().min(0),
    inventory: z.array(z.string()),
    wearing: z.string(),
  }),
  spins: z.array(z.object({ id, result: z.string(), at: z.string() })),
  rouletteChoices: z
    .array(z.string().trim().min(1).max(80))
    .min(2)
    .max(8)
    .default([
      "ทำอาหารมื้อโปรดด้วยกัน",
      "เดินเล่น 20 นาที",
      "ดูหนังที่เธอเลือก",
      "ไปร้านกาแฟร้านใหม่",
      "ผลัดกันเปิดเพลงโปรด",
      "เขียนคำชมให้กัน 3 ข้อ",
    ]),
});
export type World = z.infer<typeof stateSchema>;
export type Quest = z.infer<typeof questSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type DatePlan = z.infer<typeof dateSchema>;
export const rewards = [
  {
    id: "dinner",
    title: "มื้อโปรดของเธอ",
    detail: "วันนี้เราเป็นเจ้ามือเอง",
    cost: 80,
    icon: "dinner",
  },
  {
    id: "massage",
    title: "คูปองนวดไหล่",
    detail: "พักเหนื่อยด้วยกัน 15 นาที",
    cost: 40,
    icon: "massage",
  },
  {
    id: "movie",
    title: "คืนดูหนังของเรา",
    detail: "เธอเลือกหนัง เราเตรียมขนม",
    cost: 60,
    icon: "movie",
  },
];
export function seed(day: string): World {
  const next = new Date(`${day}T12:00:00+07:00`);
  next.setUTCDate(next.getUTCDate() + 3);
  const soon = next.toISOString().slice(0, 10);
  return {
    version: 1,
    profile: {
      name1: "ต้น",
      name2: "อิง",
      since: "2024-02-14",
      petName: "โมจิ",
      reminders: true,
    },
    quests: [
      {
        id: "q1",
        title: "บอกเรื่องดี ๆ ของวันนี้ให้กันฟัง",
        owner: "ด้วยกัน",
        due: day,
        repeat: "รายวัน",
        hearts: 20,
      },
      {
        id: "q2",
        title: "ดื่มน้ำให้ครบ แล้วส่งใจให้เธอ",
        owner: "เรา",
        due: day,
        repeat: "รายวัน",
        hearts: 10,
      },
      {
        id: "q3",
        title: "เดินเล่นด้วยกันแบบไม่จับโทรศัพท์",
        owner: "ด้วยกัน",
        due: soon,
        repeat: "รายสัปดาห์",
        hearts: 30,
      },
    ],
    goals: [
      {
        id: "g1",
        title: "ทริปเชียงใหม่ของเรา",
        target: 15000,
        due: "2027-01-15",
      },
    ],
    deposits: [
      {
        id: "s1",
        goalId: "g1",
        amount: 3000,
        person: "เรา",
        at: `${day}T08:00:00+07:00`,
        note: "เริ่มเก็บเพื่อทริปของเรา",
      },
      {
        id: "s2",
        goalId: "g1",
        amount: 2250,
        person: "เธอ",
        at: `${day}T08:30:00+07:00`,
        note: "อีกนิดก็ได้ไปด้วยกันแล้ว",
      },
    ],
    dates: [
      {
        id: "d1",
        title: "กาแฟ แสงเย็น และเธอ",
        place: "คาเฟ่ริมแม่น้ำ",
        day: soon,
        time: "16:30",
        budget: 800,
      },
    ],
    wishes: [
      {
        id: "w1",
        title: "ดูพระอาทิตย์ขึ้นที่เชียงใหม่",
        category: "สถานที่",
        done: false,
      },
      {
        id: "w2",
        title: "ลองทำพาสต้าโฮมเมด",
        category: "ร้านอาหาร",
        done: false,
      },
    ],
    memories: [
      {
        id: "m1",
        title: "วันธรรมดาที่พิเศษ",
        day,
        note: "แค่ได้อยู่ข้าง ๆ กัน ก็เป็นวันที่ดีแล้ว",
        photo: "",
      },
    ],
    letters: [],
    events: [
      {
        id: "e1",
        title: "วันของเราสองคน",
        day: "2027-02-14",
        kind: "วันครบรอบ",
      },
    ],
    completions: [],
    hearts: [
      {
        id: "h0",
        amount: 120,
        reason: "หัวใจต้อนรับสู่โลกของเรา",
        at: `${day}T08:00:00+07:00`,
      },
    ],
    redemptions: [],
    moods: [],
    pet: { lastFed: "", feeds: 0, inventory: [], wearing: "" },
    spins: [],
    rouletteChoices: [
      "ทำอาหารมื้อโปรดด้วยกัน",
      "เดินเล่น 20 นาที",
      "ดูหนังที่เธอเลือก",
      "ไปร้านกาแฟร้านใหม่",
      "ผลัดกันเปิดเพลงโปรด",
      "เขียนคำชมให้กัน 3 ข้อ",
    ],
  };
}
export const balance = (s: World) =>
  s.hearts.reduce((sum, t) => sum + t.amount, 0);
export const saved = (s: World, goalId: string) =>
  s.deposits
    .filter((t) => t.goalId === goalId)
    .reduce((sum, t) => sum + t.amount, 0);
export function period(q: Quest, day: string) {
  if (q.repeat === "ครั้งเดียว") return "once";
  if (q.repeat === "รายวัน") return day;
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const isDone = (s: World, q: Quest, day: string) =>
  s.completions.some((c) => c.questId === q.id && c.period === period(q, day));
export function complete(
  s: World,
  questId: string,
  day: string,
  at: string,
  txId: string,
): World {
  const q = s.quests.find((q) => q.id === questId);
  if (!q || isDone(s, q, day)) throw new Error("ภารกิจนี้รับหัวใจแล้วในรอบนี้");
  return {
    ...s,
    completions: [
      {
        id: txId,
        questId,
        title: q.title,
        period: period(q, day),
        at,
        hearts: q.hearts,
      },
      ...s.completions,
    ],
    hearts: [{ id: txId, amount: q.hearts, reason: q.title, at }, ...s.hearts],
  };
}
export function spend(
  s: World,
  cost: number,
  reason: string,
  at: string,
  txId: string,
): World {
  if (!Number.isInteger(cost) || cost <= 0 || balance(s) < cost)
    throw new Error("หัวใจยังไม่พอ มาทำภารกิจด้วยกันก่อนนะ");
  return {
    ...s,
    hearts: [{ id: txId, amount: -cost, reason, at }, ...s.hearts],
  };
}
export function redeem(
  s: World,
  rewardId: string,
  at: string,
  requestId: string,
): World {
  if (s.redemptions.some((r) => r.id === requestId)) return s;
  const reward = rewards.find((r) => r.id === rewardId);
  if (!reward) throw new Error("ไม่พบรางวัลนี้");
  return {
    ...spend(s, reward.cost, `แลก ${reward.title}`, at, requestId),
    redemptions: [
      { id: requestId, title: reward.title, cost: reward.cost, at },
      ...s.redemptions,
    ],
  };
}

"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  Fish,
  Heart,
  Sparkles,
  RotateCw,
  ShoppingBag,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { CatScene } from "./cat-scene";
import { useWorld } from "@/lib/world-store";
import { usePet, usePendingPet } from "@/lib/pet-store";
import { QuestStatus } from "./quests";
import { Button } from "./ui/button";
import { Editor, Hearts, Progress, SectionTitle } from "./shared";
import { dateLabel } from "@/lib/utils";
export function RouletteTool() {
  const { world, update } = useWorld();
  const options = world.rouletteChoices;
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function spin() {
    if (spinning) return;
    setSpinning(true);
    setResult("");
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const selected = random[0] % options.length;
    const segment = 360 / options.length;
    const target = (360 - (selected + 0.5) * segment) % 360;
    setRotation((old) => old + 1440 + ((target - (old % 360) + 360) % 360));
    timer.current = setTimeout(() => {
      setSpinning(false);
      setResult(options[selected]);
      update(
        (s) => ({
          ...s,
          spins: [
            {
              id: crypto.randomUUID(),
              result: options[selected],
              at: new Date().toISOString(),
            },
            ...s.spins,
          ].slice(0, 20),
        }),
        "วงล้อเลือกกิจกรรมให้เราแล้ว",
      );
    }, 2600);
  }
  return (
    <>
      <SectionTitle
        title="วันนี้ ทำอะไรด้วยกันดี?"
        detail="ให้ความบังเอิญช่วยเลือกช่วงเวลาดี ๆ"
        action={
          <Editor
            title="เปลี่ยนตัวเลือก"
            schema={z.object({
              choices: z
                .string()
                .refine(
                  (s) =>
                    s.split("\n").filter((l) => l.trim()).length >= 2 &&
                    s.split("\n").filter((l) => l.trim()).length <= 8,
                  "ใส่ 2–8 ตัวเลือก แยกบรรทัด",
                )
                .refine(
                  (s) => s.split("\n").every((l) => l.trim().length <= 80),
                  "แต่ละตัวเลือกไม่เกิน 80 ตัวอักษร",
                ),
            })}
            values={{ choices: options.join("\n") }}
            fields={[
              {
                name: "choices",
                label: "กิจกรรม (บรรทัดละหนึ่งรายการ)",
                type: "textarea",
              },
            ]}
            onSave={(data) => {
              if (spinning) {
                toast.error("รอวงล้อหยุดก่อนนะ");
                return false;
              }
              const ok = update(
                (s) => ({
                  ...s,
                  rouletteChoices: data.choices
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
                "บันทึกตัวเลือกแล้ว",
              );
              if (ok) {
                setResult("");
                setRotation(0);
              }
              return ok;
            }}
          />
        }
      />
      <section className="panel roulette-panel">
        <div className="wheel-wrap">
          <span className="wheel-pointer" />
          <div
            className="wheel"
            style={{
              transform: `rotate(${rotation}deg)`,
              background: `conic-gradient(${options.map((_, i) => `${["#EFA9AD", "#FFD9AB", "#BFE5D7", "#DDD0F4", "#EAC7B4", "#CCE2E9", "#EBC3D6", "#D8DEB9"][i]} ${(i * 360) / options.length}deg ${((i + 1) * 360) / options.length}deg`).join(",")})`,
            }}
          >
            {options.map((_, i) => (
              <span
                key={i}
                className="wheel-number"
                style={{
                  transform: `rotate(${((i + 0.5) * 360) / options.length}deg) translateY(-108px) rotate(-${((i + 0.5) * 360) / options.length}deg)`,
                }}
              >
                {i + 1}
              </span>
            ))}
            <span className="wheel-center">
              <Heart fill="currentColor" size={31} />
            </span>
          </div>
        </div>
        <Button onClick={spin} disabled={spinning}>
          <RotateCw size={18} />
          {spinning ? "กำลังเลือกความสุข…" : "หมุนวงล้อของเรา"}
        </Button>
        {result && (
          <div className="roulette-result" role="status">
            <Sparkles size={22} />
            <h2>{result}</h2>
            <p>จองเวลาให้กันสักนิด แล้วไปกันเลย</p>
          </div>
        )}
        <div className="wheel-legend">
          {options.map((o, i) => (
            <p key={`${i}${o}`}>
              <span>{i + 1}</span>
              {o}
            </p>
          ))}
        </div>
      </section>
      {world.spins.length > 0 && (
        <section className="panel">
          <SectionTitle title="วงล้อเคยชวนเราไป…" />
          {world.spins.slice(0, 5).map((s) => (
            <div className="history-row" key={s.id}>
              <RotateCw size={17} />
              <div>
                <strong>{s.result}</strong>
                <p className="muted text-sm">{dateLabel(s.at)}</p>
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
export function PetTool() {
  const {
    pet,
    items,
    achievements,
    wallet,
    ready,
    pending,
    feed,
    demo,
    rename,
    serverNow,
  } = usePet();
  const pendingFeed = usePendingPet("feed");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!demo) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [demo]);
  const lastFed = pet.last_fed || 0;
  const fed =
    lastFed > 0 &&
    (demo
      ? now - lastFed < 14400000
      : (serverNow ?? 0) < (pet.next_feed_at ?? 0));
  return (
    <>
      <QuestStatus label="แมว ไอเทม และ Achievement" ready={ready} />
      <SectionTitle
        title={`บ้านของ${pet.name}`}
        detail="เลี้ยงแมวตัวหนึ่ง ด้วยหัวใจสองดวง"
        action={<Hearts value={wallet} />}
      />
      <Editor
        title="ตั้งชื่อแมว"
        schema={z.object({
          name: z.string().trim().min(1).max(120),
          version: z.number().int().nonnegative(),
        })}
        values={{ name: pet.name, version: pet.version }}
        fields={[{ name: "name", label: "ชื่อแมวของเรา" }]}
        disabled={!ready || pending}
        onSave={(data) => rename(data.name, data.version)}
      />
      <div className="pet-layout">
        <section
          className={`panel pet-home ${pet.wearing === "rose-rug" ? "pink-rug" : ""}`}
        >
          <CatScene name={pet.name} hat={pet.wearing === "mint-hat"} />
          <h2>
            {fed
              ? "พุงอิ่มแล้ว อยากเล่นกับเธอจัง"
              : "ได้เวลาเติมความอร่อยให้โมจิ"}
          </h2>
          <p className="muted">
            ให้อาหารแล้ว {pet.feeds} ครั้ง · เลเวล{" "}
            {Math.floor(pet.feeds / 3) + 1}
          </p>
          <Progress
            value={((pet.feeds % 3) / 3) * 100}
            label="ความคืบหน้าเลเวลแมว"
          />
          <Button
            onClick={() => void feed()}
            disabled={!ready || pending || (fed && !pendingFeed)}
          >
            <Fish size={19} />
            {pendingFeed
              ? "ตรวจสอบมื้อเดิม"
              : fed
                ? "อิ่มแล้ว · ให้อีกครั้งเมื่อครบ 4 ชม."
                : "ให้อาหารโมจิ"}
          </Button>
          {lastFed > 0 && (
            <p className="muted text-sm">
              มื้อล่าสุด{" "}
              {new Intl.DateTimeFormat("th-TH", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "Asia/Bangkok",
              }).format(new Date(lastFed))}
            </p>
          )}
        </section>
        <section className="panel">
          <SectionTitle title="ของเล็ก ๆ เพื่อเจ้าตัวเล็ก" />
          <p className="muted text-sm">
            แต่งได้ครั้งละ 1 ชิ้น ·{" "}
            {demo
              ? "ใช้หัวใจ Demo ในเครื่องเท่านั้น"
              : "ใช้หัวใจร่วมกันจาก D1 · ซื้อแต่ละชิ้นได้ครั้งเดียว"}
          </p>
          {items.map((item) => {
            const owned = item.owned;
            return (
              <div className="pet-shop-item" key={item.id}>
                <span
                  className={`icon-tile ${item.id === "mint-hat" ? "mint" : "pink"}`}
                >
                  <ShoppingBag />
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted text-sm">
                    {owned ? "อยู่ในตู้ของโมจิแล้ว" : `${item.cost} หัวใจ`}
                  </p>
                </div>
                <PetItemButton item={item} />
              </div>
            );
          })}
          <div className="pet-achievement">
            <Sparkles size={24} />
            <h3>
              {achievements.find((a) => a.id === "pet-favorite")?.unlocked_at !=
              null
                ? "ปลดล็อก: คนโปรดของโมจิ"
                : "ให้อาหารครบ 3 ครั้ง"}
            </h3>
            <p className="muted">
              {achievements.find((a) => a.id === "pet-favorite")?.unlocked_at !=
              null
                ? "ดูแลกันในทุก ๆ วัน"
                : "แล้วรับความสำเร็จคนโปรดของโมจิ"}
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
function PetItemButton({
  item,
}: {
  item: { id: string; cost: number; owned: boolean; active: boolean };
}) {
  const { pet, ready, pending, wallet, purchase, equip } = usePet(),
    previous = usePendingPet("purchase:" + item.id),
    equipped = pet.wearing === item.id;
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={
        !ready ||
        pending ||
        (!previous && !item.owned && (!item.active || wallet < item.cost))
      }
      onClick={() =>
        void (previous || !item.owned
          ? purchase(item.id)
          : equip(equipped ? null : item.id))
      }
    >
      {previous ? (
        "ตรวจสอบรายการเดิม"
      ) : equipped ? (
        <>
          <Check size={14} />
          ถอด
        </>
      ) : item.owned ? (
        "ใส่เลย"
      ) : (
        "ซื้อ"
      )}
    </Button>
  );
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seed,
  stateSchema,
  balance,
  complete,
  isDone,
  period,
  spend,
  saved,
  redeem,
} from "../src/lib/model";
test("seed is valid, heart balance and contributions match the ledger", () => {
  const s = stateSchema.parse(seed("2026-10-15"));
  assert.equal(balance(s), 120);
  assert.equal(saved(s, "g1"), 5250);
});
test("completing a quest awards hearts once per day and preserves history", () => {
  const s = seed("2026-10-15");
  const done = complete(s, "q1", "2026-10-15", "2026-10-15T12:00:00Z", "tx1");
  assert.equal(balance(done), 140);
  assert.equal(done.completions.length, 1);
  assert.equal(isDone(done, done.quests[0], "2026-10-15"), true);
  assert.throws(() => complete(done, "q1", "2026-10-15", "now", "tx2"));
  assert.equal(
    balance(complete(done, "q1", "2026-10-16", "2026-10-16T12:00:00Z", "tx3")),
    160,
  );
});
test("weekly periods reset on Monday and once quests never reset", () => {
  const q = seed("2026-10-15").quests[2];
  assert.equal(period(q, "2026-10-18"), "2026-10-12");
  assert.equal(period(q, "2026-10-19"), "2026-10-19");
  assert.equal(period({ ...q, repeat: "ครั้งเดียว" }, "2027-01-01"), "once");
});
test("spending prevents negative balance and invalid costs", () => {
  const s = seed("2026-10-15");
  const spent = spend(s, 80, "dinner", "2026-10-15T12:00:00Z", "r1");
  assert.equal(balance(spent), 40);
  assert.throws(() => spend(spent, 80, "again", "now", "r2"));
  for (const cost of [0, -1, 0.1, NaN, Infinity])
    assert.throws(() => spend(s, cost, "bad", "now", "r3"));
  assert.equal(balance(s), 120);
});
test("invalid persisted data and user inputs are rejected", () => {
  const s = seed("2026-10-15");
  assert.equal(stateSchema.safeParse({ ...s, version: 2 }).success, false);
  assert.equal(
    stateSchema.safeParse({ ...s, quests: [{ ...s.quests[0], title: "   " }] })
      .success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({
      ...s,
      deposits: [{ ...s.deposits[0], amount: -10 }],
    }).success,
    false,
  );
  assert.equal(
    stateSchema.safeParse({
      ...s,
      goals: [{ ...s.goals[0], due: "2026-02-30" }],
    }).success,
    false,
  );
});
test("retrying a reward request does not charge or redeem twice", () => {
  const s = seed("2026-10-15");
  const redeemed = redeem(s, "massage", "2026-10-15T12:00:00Z", "request1");
  const retry = redeem(redeemed, "massage", "2026-10-15T12:00:01Z", "request1");
  assert.equal(balance(retry), 80);
  assert.equal(retry.redemptions.length, 1);
  assert.throws(() => redeem(s, "unknown", "now", "request2"));
});

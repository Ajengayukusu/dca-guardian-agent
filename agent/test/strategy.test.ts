import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  utcDayBucket,
  type MarketState,
  type StrategyConfig,
} from "../src/strategy.js";

/**
 * Strategy tests: the agent's local mirror of the GuardianVault rules.
 * (The vault itself is the enforcement point — see the Hardhat suite.)
 */

const CFG: StrategyConfig = {
  intervalSec: 3600,
  amountPerBuy: 100,
  perTxCap: 100,
  dailyCap: 250,
  breakerThresholdBps: 1000,
  breakerWindowSec: 14400,
};

const T0 = 1767225600; // 2026-01-01T00:00:00Z

function state(patch: Partial<MarketState>): MarketState {
  return {
    now: T0,
    price: 2.5,
    anchorPrice: 2.5,
    anchorAt: T0,
    lastBuyAt: null,
    spentToday: 0,
    spentDayBucket: utcDayBucket(T0),
    paused: false,
    killed: false,
    ...patch,
  };
}

test("buys the full configured amount when due and calm", () => {
  const d = decide(CFG, state({}));
  assert.equal(d.action, "buy");
  assert.equal(d.amount, 100);
  assert.equal(d.reason, "scheduled-buy");
});

test("holds outside the schedule", () => {
  const d = decide(CFG, state({ now: T0 + 1800, lastBuyAt: T0 }));
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "outside-schedule");
});

test("buys again exactly when the interval elapses", () => {
  const d = decide(CFG, state({ now: T0 + 3600, lastBuyAt: T0 }));
  assert.equal(d.action, "buy");
});

test("holds while the circuit-breaker deviation is beyond the threshold", () => {
  const d = decide(
    CFG,
    state({ now: T0 + 3600, lastBuyAt: T0 - 3600, price: 2.9 }) // +1600 bps
  );
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "circuit-breaker");
  assert.equal(d.deviationBps, 1600);
});

test("buys after the breaker window elapses even if the price moved (slow drift)", () => {
  const d = decide(
    CFG,
    state({
      now: T0 + CFG.breakerWindowSec + 3600,
      lastBuyAt: T0,
      price: 2.9,
    })
  );
  assert.equal(d.action, "buy");
});

test("clamps the buy to the remaining daily headroom", () => {
  const d = decide(CFG, state({ spentToday: 200 }));
  assert.equal(d.action, "buy");
  assert.equal(d.amount, 50);
});

test("holds when the daily cap is exhausted", () => {
  const d = decide(CFG, state({ spentToday: 250 }));
  assert.equal(d.action, "hold");
  assert.equal(d.reason, "daily-cap-exhausted");
});

test("ignores yesterday's spend when the UTC bucket has rolled over", () => {
  const tomorrow = T0 + 86400;
  const d = decide(
    CFG,
    state({
      now: tomorrow,
      anchorAt: tomorrow,
      spentToday: 250,
      spentDayBucket: utcDayBucket(T0), // stale: yesterday
    })
  );
  assert.equal(d.action, "buy");
  assert.equal(d.amount, 100);
});

test("clamps the buy to the per-transaction cap", () => {
  const d = decide({ ...CFG, amountPerBuy: 500 }, state({}));
  assert.equal(d.action, "buy");
  assert.equal(d.amount, 100);
});

test("a paused agent holds, and a killed agent holds forever", () => {
  assert.equal(decide(CFG, state({ paused: true })).reason, "paused-by-owner");
  const killed = decide(CFG, state({ killed: true, now: T0 + 999999 }));
  assert.equal(killed.action, "hold");
  assert.equal(killed.reason, "kill-switch-active");
});

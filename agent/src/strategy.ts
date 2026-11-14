/**
 * strategy.ts — the agent's deterministic DCA decision function.
 *
 * Pure and clock-injected: the same inputs always produce the same decision,
 * which is what makes the agent testable and its JSONL log auditable. This
 * function MIRRORS the GuardianVault rules (per-tx cap, daily cap in a UTC
 * day bucket, minimum interval, circuit-breaker vs an anchor price) so the
 * agent does not waste transactions the vault would reject — but the vault
 * is always the enforcement point. If this function and the vault ever
 * disagree, the vault wins and the transaction simply reverts on chain.
 */

export interface StrategyConfig {
  /** Seconds between scheduled buys. */
  intervalSec: number;
  /** Intended buy size per cycle, in spend-token smallest units. */
  amountPerBuy: number;
  /** Mirror of GuardianVault.perTxCap (smallest units). */
  perTxCap: number;
  /** Mirror of GuardianVault.dailyCap (smallest units). */
  dailyCap: number;
  /** Mirror of GuardianVault.breakerThresholdBps. */
  breakerThresholdBps: number;
  /** Mirror of GuardianVault.breakerWindowSec. */
  breakerWindowSec: number;
}

export interface MarketState {
  /** Current unix time (seconds). Injected — never read from the wall clock here. */
  now: number;
  /** Current AMM price, target-per-spend as a plain number (e.g. 2.5). */
  price: number;
  /** Anchor price for the breaker (0 if none observed yet). */
  anchorPrice: number;
  /** When the anchor was observed (unix seconds). */
  anchorAt: number;
  /** Last successful buy time (unix seconds), or null if none yet. */
  lastBuyAt: number | null;
  /** Amount already spent in the current UTC day bucket (smallest units). */
  spentToday: number;
  /** UTC day bucket the spentToday figure belongs to (floor(now/86400)). */
  spentDayBucket: number;
  /** Owner-issued pause is in effect (authenticated command). */
  paused: boolean;
  /** Kill-switch state as last read from the vault. */
  killed: boolean;
}

export type DecisionReason =
  | "scheduled-buy"
  | "kill-switch-active"
  | "paused-by-owner"
  | "outside-schedule"
  | "circuit-breaker"
  | "daily-cap-exhausted";

export interface Decision {
  action: "buy" | "hold";
  /** Amount to buy (smallest units); 0 on hold. */
  amount: number;
  reason: DecisionReason;
  /** Human-readable explanation, written verbatim into the decision log. */
  detail: string;
  /** Deviation from the anchor in bps at decision time (0 if not applicable). */
  deviationBps: number;
}

export function utcDayBucket(now: number): number {
  return Math.floor(now / 86400);
}

/** Deviation of `price` from `anchor` in basis points.
 *  Rounded (not floored): prices arrive as decimal floats, and rounding
 *  keeps the mirror faithful to the vault's exact integer arithmetic
 *  (e.g. 2.50 -> 2.90 is exactly 1600 bps on chain, 1599.99… in float). */
export function deviationBps(price: number, anchor: number): number {
  if (anchor <= 0) return 0;
  return Math.round((Math.abs(price - anchor) / anchor) * 10_000);
}

export function decide(cfg: StrategyConfig, s: MarketState): Decision {
  if (s.killed) {
    return hold("kill-switch-active", "vault reports the kill-switch is engaged; the agent is permanently stopped", 0);
  }
  if (s.paused) {
    return hold("paused-by-owner", "an authenticated owner command paused the agent", 0);
  }

  // Schedule: first buy is due immediately; afterwards every intervalSec.
  if (s.lastBuyAt !== null && s.now < s.lastBuyAt + cfg.intervalSec) {
    const next = s.lastBuyAt + cfg.intervalSec;
    return hold("outside-schedule", `next buy due at ${next} (now ${s.now})`, 0);
  }

  // Circuit-breaker (mirror): only while the anchor window is live.
  const dev = deviationBps(s.price, s.anchorPrice);
  if (
    s.anchorPrice > 0 &&
    s.now < s.anchorAt + cfg.breakerWindowSec &&
    dev > cfg.breakerThresholdBps
  ) {
    return hold(
      "circuit-breaker",
      `price moved ${dev} bps from anchor ${s.anchorPrice} inside the ${cfg.breakerWindowSec}s window (threshold ${cfg.breakerThresholdBps} bps)`,
      dev
    );
  }

  // Daily cap (mirror): spentToday only counts if it is today's bucket.
  const spent = utcDayBucket(s.now) === s.spentDayBucket ? s.spentToday : 0;
  const remaining = cfg.dailyCap - spent;
  if (remaining <= 0) {
    return hold("daily-cap-exhausted", `daily cap ${cfg.dailyCap} already reached for UTC day ${utcDayBucket(s.now)}`, dev);
  }

  const amount = Math.min(cfg.amountPerBuy, cfg.perTxCap, remaining);
  return {
    action: "buy",
    amount,
    reason: "scheduled-buy",
    detail:
      `scheduled buy of ${amount} (configured ${cfg.amountPerBuy}, per-tx cap ${cfg.perTxCap}, ` +
      `daily remaining ${remaining}); price ${s.price}, deviation ${dev} bps`,
    deviationBps: dev,
  };
}

function hold(reason: DecisionReason, detail: string, dev: number): Decision {
  return { action: "hold", amount: 0, reason, detail, deviationBps: dev };
}

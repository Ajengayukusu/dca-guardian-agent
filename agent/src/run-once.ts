import * as fs from "node:fs";
import * as path from "node:path";
import { decide, utcDayBucket, type StrategyConfig } from "./strategy.js";
import { FilePriceFeed } from "./feed.js";
import { LocalExecutor } from "./executor.js";
import { DecisionLog, toLogEntry } from "./log.js";

/**
 * run-once.ts — one full agent cycle in LOCAL mode.
 *
 *   npm run cycle
 *
 * Reads the market from data/mock-amm-state.json ({"price": 2.5, "at": ...}),
 * the persisted agent/vault state from data/local-state.json, runs the
 * deterministic strategy, executes locally if the decision is "buy", and
 * appends the decision to data/decisions.jsonl + refreshes
 * data/dashboard.json. Edit the price file (or run simulate) to move the
 * market. Set AGENT_NOW=<unix> to pin the clock for reproducible demos.
 *
 * Testnet mode is intentionally NOT the default: point TestnetPriceFeed /
 * TestnetExecutor (feed.ts / executor.ts) at a deployed vault once the
 * bootstrap sequence in the README has been completed.
 */

export const DEMO_CONFIG: StrategyConfig = {
  intervalSec: 3600,
  amountPerBuy: 100_000_000, // 100 fUSD (6 decimals)
  perTxCap: 100_000_000,
  dailyCap: 250_000_000, // 250 fUSD
  breakerThresholdBps: 1000,
  breakerWindowSec: 14400,
};

interface LocalState {
  spendBalance: number;
  targetBalance: number;
  lastBuyAt: number | null;
  spentToday: number;
  spentDayBucket: number;
  anchorPrice: number;
  anchorAt: number;
  paused: boolean;
  killed: boolean;
  executions: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "local-state.json");
const PRICE_PATH = path.join(DATA_DIR, "mock-amm-state.json");
const LOG_PATH = path.join(DATA_DIR, "decisions.jsonl");
const DASHBOARD_PATH = path.join(DATA_DIR, "dashboard.json");

function loadState(): LocalState {
  if (fs.existsSync(STATE_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) as LocalState;
  }
  return {
    spendBalance: 5_000_000_000, // 5,000 fUSD demo funding
    targetBalance: 0,
    lastBuyAt: null,
    spentToday: 0,
    spentDayBucket: 0,
    anchorPrice: 0,
    anchorAt: 0,
    paused: false,
    killed: false,
    executions: 0,
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRICE_PATH)) {
    fs.writeFileSync(PRICE_PATH, JSON.stringify({ price: 2.5 }) + "\n");
  }
  const state = loadState();
  const feed = new FilePriceFeed(PRICE_PATH);
  const point = await feed.spotPrice();
  const now = process.env.AGENT_NOW
    ? Number(process.env.AGENT_NOW)
    : Math.floor(Date.now() / 1000);
  const at = now; // the cycle clock wins; the feed timestamp is informational

  // Mirror the vault's anchor rotation for the local bookkeeping.
  if (state.anchorPrice === 0 || at >= state.anchorAt + DEMO_CONFIG.breakerWindowSec) {
    state.anchorPrice = point.price;
    state.anchorAt = at;
  }
  if (utcDayBucket(at) !== state.spentDayBucket) {
    state.spentToday = 0;
    state.spentDayBucket = utcDayBucket(at);
  }

  const decision = decide(DEMO_CONFIG, {
    now: at,
    price: point.price,
    anchorPrice: state.anchorPrice,
    anchorAt: state.anchorAt,
    lastBuyAt: state.lastBuyAt,
    spentToday: state.spentToday,
    spentDayBucket: state.spentDayBucket,
    paused: state.paused,
    killed: state.killed,
  });

  const executor = new LocalExecutor(state.spendBalance);
  executor.targetBalance = state.targetBalance;
  let txHash: string | null = null;
  if (decision.action === "buy") {
    const res = await executor.execute(decision.amount, point.price, at);
    txHash = res.txHash;
    state.spendBalance = executor.spendBalance;
    state.targetBalance = executor.targetBalance;
    state.spentToday += decision.amount;
    state.lastBuyAt = at;
    state.executions += 1;
  }

  const log = new DecisionLog(LOG_PATH);
  const entry = toLogEntry(at, point.price, decision, txHash);
  log.append(entry);

  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n");
  fs.writeFileSync(
    DASHBOARD_PATH,
    JSON.stringify(
      {
        generatedAt: at,
        mode: "local",
        agentStatus: state.killed ? "killed" : state.paused ? "paused" : "active",
        price: point.price,
        anchorPrice: state.anchorPrice,
        vault: {
          spendBalance: state.spendBalance,
          targetBalance: state.targetBalance,
          spentToday: state.spentToday,
          executions: state.executions,
        },
        lastDecision: entry,
      },
      null,
      2
    ) + "\n"
  );

  console.log(JSON.stringify(entry, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

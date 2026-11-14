import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { decide, utcDayBucket, type StrategyConfig } from "./strategy.js";
import { LocalExecutor } from "./executor.js";
import { DecisionLog, toLogEntry, type DecisionLogEntry } from "./log.js";
import { CommandAuthenticator, signCommand } from "./auth.js";
import { attackerKeyPair, demoOwnerKeyPair, pubkeyFingerprint } from "./keys.js";

/**
 * simulate.ts — scripted local market story that produces the dashboard
 * demo data (frontend/src/demo-data.json) and data/decisions.jsonl.
 *
 *   npm run simulate
 *
 * Timeline (hourly cycles, threshold 10%, anchor window 4 h, caps in whole
 * fUSD for dashboard readability — on chain the same rules run in smallest
 * units inside GuardianVault):
 *   t+0h  2.50  BUY 100   anchor set at 2.50
 *   t+1h  2.53  BUY 100   +120 bps, calm
 *   t+2h  2.90  HOLD      +1600 bps -> circuit-breaker
 *   t+3h  2.88  HOLD      +1520 bps -> circuit-breaker still
 *   t+4h  2.60  BUY 50    anchor window elapsed (re-anchor 2.60);
 *                         daily cap leaves only 50 of headroom
 *   t+5h  2.62  HOLD      daily cap for the UTC day is exhausted
 * Afterwards the authenticated-command path is exercised with the demo
 * owner key: a signed "pause" is accepted, its replay is rejected, and a
 * command forged with an attacker's key is rejected.
 */

const CFG: StrategyConfig = {
  intervalSec: 3600,
  amountPerBuy: 100,
  perTxCap: 100,
  dailyCap: 250,
  breakerThresholdBps: 1000,
  breakerWindowSec: 14400,
};

const T0 = 1767225600; // 2026-01-01T00:00:00Z, exactly a UTC day boundary
const PRICES = [2.5, 2.53, 2.9, 2.88, 2.6, 2.62];

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url)); // dist/src
  const projectRoot = path.join(here, "..", "..", "..");
  const dataDir = path.join(here, "..", "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = path.join(dataDir, "decisions.jsonl");
  fs.writeFileSync(logPath, ""); // simulation owns this file; start fresh

  const log = new DecisionLog(logPath);
  const executor = new LocalExecutor(5000);
  const priceSeries: { at: number; price: number }[] = [];

  let anchorPrice = 0;
  let anchorAt = 0;
  let lastBuyAt: number | null = null;
  let spentToday = 0;
  let spentDayBucket = utcDayBucket(T0);

  for (let i = 0; i < PRICES.length; i++) {
    const at = T0 + i * 3600;
    const price = PRICES[i];
    priceSeries.push({ at, price });

    if (anchorPrice === 0 || at >= anchorAt + CFG.breakerWindowSec) {
      anchorPrice = price;
      anchorAt = at;
    }
    if (utcDayBucket(at) !== spentDayBucket) {
      spentToday = 0;
      spentDayBucket = utcDayBucket(at);
    }

    const decision = decide(CFG, {
      now: at,
      price,
      anchorPrice,
      anchorAt,
      lastBuyAt,
      spentToday,
      spentDayBucket,
      paused: false,
      killed: false,
    });

    let txHash: string | null = null;
    if (decision.action === "buy") {
      const res = await executor.execute(decision.amount, price, at);
      txHash = res.txHash;
      spentToday += decision.amount;
      lastBuyAt = at;
    }
    log.append(toLogEntry(at, price, decision, txHash));
  }

  // ---- authenticated commands, exercised with the demo owner key ----------
  const owner = demoOwnerKeyPair();
  const vaultId = "guardian-vault-demo";
  const auth = new CommandAuthenticator(owner.publicKey, vaultId);
  const nowSec = T0 + PRICES.length * 3600;
  const pause = signCommand(
    owner,
    { type: "pause", nonce: 1, expiry: nowSec + 600 },
    vaultId
  );
  const forged = signCommand(
    attackerKeyPair(),
    { type: "pause", nonce: 2, expiry: nowSec + 600 },
    vaultId
  );
  const commandDemo = [
    {
      label: "owner-signed pause (nonce 1)",
      result: auth.verify(pause, nowSec) ?? "accepted",
    },
    {
      label: "replay of the same pause command",
      result: auth.verify(pause, nowSec) ?? "accepted",
    },
    {
      label: "pause forged with an attacker's key",
      result: auth.verify(forged, nowSec) ?? "accepted",
    },
  ];

  const entries: DecisionLogEntry[] = [...log.all()];
  const demoData = {
    generatedAt: nowSec,
    mode: "local-simulation",
    note:
      "Scripted local simulation (agent/src/simulate.ts). Amounts in whole fUSD/QOR for readability; " +
      "on chain GuardianVault enforces the same rules in smallest units.",
    config: CFG,
    agentStatus: "active",
    ownerPubkeyFingerprint: pubkeyFingerprint(owner.publicKey),
    priceSeries,
    decisions: entries,
    vault: {
      spendBalance: executor.spendBalance,
      targetBalance: Math.round(executor.targetBalance * 1e6) / 1e6,
      spentToday,
      executions: entries.filter((e) => e.action === "buy").length,
    },
    breaker: {
      anchorPrice,
      thresholdBps: CFG.breakerThresholdBps,
      windowSec: CFG.breakerWindowSec,
      trippedCount: entries.filter((e) => e.reason === "circuit-breaker").length,
    },
    killSwitch: { engaged: false },
    commandDemo,
  };

  const outPath = path.join(projectRoot, "frontend", "src", "demo-data.json");
  fs.writeFileSync(outPath, JSON.stringify(demoData, null, 2) + "\n");
  console.log(`wrote ${outPath}`);
  console.log(
    `cycles: ${entries.length}, buys: ${demoData.vault.executions}, ` +
      `breaker holds: ${demoData.breaker.trippedCount}, spent today: ${spentToday}`
  );
  for (const c of commandDemo) console.log(`command demo — ${c.label}: ${c.result}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

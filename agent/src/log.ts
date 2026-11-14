import * as fs from "node:fs";
import type { Decision } from "./strategy.js";

/**
 * log.ts — the agent's structured decision log.
 *
 * One JSON object per line (JSONL): every cycle records the observed price,
 * the decision, the reason, and — for executions — the transaction hash.
 * The log is the audit trail a judge (or the owner, after an incident)
 * replays to see exactly why the agent did what it did. Entries are
 * append-only; the agent never rewrites history.
 */

export interface DecisionLogEntry {
  at: number;
  price: number;
  action: "buy" | "hold";
  amount: number;
  reason: string;
  detail: string;
  deviationBps: number;
  txHash: string | null;
  source: "schedule" | "command";
}

export function toLogEntry(
  at: number,
  price: number,
  decision: Decision,
  txHash: string | null,
  source: "schedule" | "command" = "schedule"
): DecisionLogEntry {
  return {
    at,
    price,
    action: decision.action,
    amount: decision.amount,
    reason: decision.reason,
    detail: decision.detail,
    deviationBps: decision.deviationBps,
    txHash,
    source,
  };
}

export class DecisionLog {
  private readonly entries: DecisionLogEntry[] = [];

  constructor(private readonly filePath?: string) {}

  append(entry: DecisionLogEntry): void {
    this.entries.push(entry);
    if (this.filePath) {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
    }
  }

  all(): readonly DecisionLogEntry[] {
    return this.entries;
  }
}

# AI_USAGE.md — how this project was built with AI

> Written for the **Best AI-Native Build** special award. It documents the
> AI workflow honestly: what the human set, what the AI produced, what the
> AI got wrong, and how every claim was verified by running code — not by
> trusting the model.

## The human's part (direction & judgement)

- **The brief:** build a solo entry for the Post-Quantum AI Agents category
  of QoreChain's "Build Before Q-Day" fest, at a "10/10, no defects"
  quality bar — set by the project owner (Ajeng Ayu Kusuma, Indonesia).
- **The concept choice:** an *agent-pays-invoice* design was explicitly
  rejected (two leading competitors already do exactly that); the owner
  approved a **DCA agent on an AMM** — the category's own canonical
  example that nobody had built — with the design rule that **limits must
  be enforced on chain, never by the agent's promises**.
- **Sequencing decisions:** solo categories first, team category later;
  nothing is deployed or submitted without the owner's accounts, faucet
  claims and registration steps, which only the owner can perform.

## The AI's part (implementation)

An AI coding agent (Muse, via Muse) implemented the repository end to
end, in this order:

1. **Research first, code second.** Read the fest strategy blueprint, the
   official Workshop-1 example (`window.ts`) and the live chain state
   (precompile list, abstract-account config, SDK 0.14.0 type definitions,
   `@qorechain/pqc` 0.2.3 API surface) before writing a line — several
   design decisions (constructor-injected precompiles, the possession-proof
   requirement, the v3.2.8 "enabled rule or rejection" trap) come straight
   from those sources.
2. **Contracts:** `GuardianVault.sol` (guard rules, circuit-breaker, PQ
   kill/withdraw/rotation), mocks for the PQC precompiles, the AMM and the
   tokens — following the same constructor-injection pattern proven in the
   sibling DeedLock Escrow project, rewritten for this design (no code was
   copied between the repos beyond the standard chain interface file,
   which is dictated by the chain's ABI).
3. **Tests before trust:** 34 Hardhat tests and 18 agent tests, weighted
   toward attacks: caps, replay, forged signatures, wrong-pubkey,
   not-proven keys, expired deadlines, agent-attempts-withdraw.
4. **Agent:** deterministic strategy mirror, ML-DSA-87 command
   authentication using the real `@qorechain/pqc`, JSONL decision log,
   local + testnet feeds/executors, a scripted market simulation.
5. **Frontend + docs:** dashboard over the *generated* simulation data,
   this file, the README, and the abstract-account runbook.

## What the AI got wrong — and how verification caught it

These are the actual defects from this build, kept in deliberately:

1. **Price-units bug (caught by tests).** The first MockAMM ignored token
   decimals: a 100 fUSD buy "returned" 250 *smallest units* of target
   instead of 250 tokens. Three tests failed with exact amounts
   (250000000 ≠ 250000000000000000000); the venue now normalises by
   `10^(targetDecimals − spendDecimals)` and documents the convention.
2. **Compiler stack-too-deep (caught by the build).** The vault's first
   compile failed; fixed properly by enabling `viaIR` in the Hardhat
   config rather than by deleting features.
3. **viem version drift (caught by typecheck).** `@qorechain/evm` 0.14.0
   type-checks against viem 2.53.1; npm resolved 2.57.19 for the agent,
   and its `Chain` type no longer matched. Fixed by pinning viem to the
   version verified in the foundation spike (2.53.1) instead of casting
   the error away.
4. **Float deviation (caught by a test).** The strategy mirror computed a
   2.50 → 2.90 move as 1599 bps (float) where the contract's integer math
   gives exactly 1600 bps. The mirror now rounds, with the reason recorded
   in a comment.
5. **Test-runner invocation (caught by CI-style run).** `node --test
   dist/test/` does not glob as expected under ESM; the test script uses
   the explicit `dist/test/*.test.js` glob.

## Verification (nothing here is "the AI said so")

| Claim | Verified by |
|---|---|
| Vault enforces caps, interval, breaker, PQ gates | `npx hardhat test` → **34 passing, 0 failing** (run in this workspace) |
| Agent strategy + ML-DSA command auth | `cd agent && npm test` → **18 passing, 0 failing** |
| Simulation behaves as documented (3 buys, 2 breaker holds, cap stop; command accepted/replay/forgery outcomes) | `npm run simulate` output + generated `frontend/src/demo-data.json` |
| One full local cycle works end to end | `npm run cycle` → buy decision logged with tx hash |
| Dashboard builds | `cd frontend && npm run build` → success |
| Scripts typecheck (deploy, scoped window) | `npx tsc --noEmit -p tsconfig.json` → clean |
| Chain facts used (precompiles, abstract-account config, SDK APIs) | Read from the live REST endpoints and the installed SDK/pqc packages during research, not from model memory |

## What AI did *not* do

- No deployment, registration, faucet claim or submission: those steps
  belong to the human owner's accounts and are listed as pending in the
  README, in plain sight.
- No invented chain features: where the documentation was ambiguous (e.g.
  what "two-stage QCAI audit" means), the sibling project's honest
  interpretation was followed; this category needs no such claim.
- No real secrets: the only keys in the repo are a published demo seed
  (labelled as such) and mock signing oracles (labelled as such).

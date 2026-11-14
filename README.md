# DCA Guardian Agent — an AI agent with an on-chain leash

> **An autonomous DCA agent that cannot be drained, hijacked or talked into misbehaving —
> because its limits live in a contract, not in its prompt.**
> Built for the **QoreChain Developer Fest "Build Before Q-Day"** — **Post-Quantum AI Agents** category.
> Testnet: **QoreChain Diana** (EVM chain ID 9800) · Contracts: Solidity 0.8.24 · Agent: TypeScript · License: MIT

---

## ⏱ Judge path — 3 minutes

1. **The problem (30 s).** Every "AI agent with a wallet" demo has the same fatal slide: the
   agent's key can send anything, anywhere. Leak the key, prompt-inject the agent, or let the
   model hallucinate once, and the wallet is empty. Prompts are not a security boundary.
2. **The fix (30 s).** The agent's key can do exactly **one** thing — call
   `GuardianVault.executeDca()` — and the vault enforces, on chain, on every call: a per-tx
   cap, a daily cap in an explicit UTC day bucket, a minimum interval, and a volatility
   circuit-breaker, on **one** immutable AMM and **one** immutable token pair. The agent can
   **never withdraw**. The owner stops it permanently with a **kill-switch that requires an
   ML-DSA-87 signature** verified by QoreChain's `pqcVerify` precompile. Around the vault sit
   two more chain-level fences: a **scoped EVM window** (agent transactions may target the
   vault only) and **abstract-account spending rules** for the native lane.
3. **Proof it works (60 s).** **34 Hardhat tests** (caps, breaker, replay, forged kill-switch,
   agent-trying-to-withdraw…) and **18 agent tests** (strategy mirror + ML-DSA command
   authentication, incl. forgery/replay/expiry rejection) — all passing:
   ```bash
   npm install && npx hardhat test          # 34 passing
   cd agent && npm install && npm test      # 18 passing
   ```
4. **See it (60 s).** Run the scripted local market (price spike → two circuit-breaker holds
   → daily-cap stop) and open the dashboard it generates:
   ```bash
   cd agent && npm run simulate             # writes the demo data + decision log
   cd ../frontend && npm install && npm run dev   # http://localhost:5173
   ```
5. **Deployment status (honest).** **LIVE on Diana since 15 Nov 2026.** GuardianVault is
   deployed at `0xe60A81a25De2115837218D59745942e94aB38Ae8`; the agent account's ML-DSA-87
   key is registered (its first transaction), its scoped window targets the vault only,
   and the project's own agent code has executed a real `executeDca` on chain inside that
   window — full hashes in *Live deployment — Diana* below and in `deployments.testnet.json`.
   Two honest qualifications: the live pair is the project's own ERC-20 demo pair (the fest
   faucet's fUSD/fETH sit in the native `erc20:` bank-denom representation, a separate
   ledger from the EVM ERC-20 contracts — see the deployment section), and Layer C
   (abstract account) remains a runbook — written and config-verified, **not** broadcast.

---

## Why "the agent promised to behave" is not a control

The design scenario is not "the agent is honest" — it is **"the agent's key leaks at 3 a.m."**
What can the attacker actually do?

| Attacker move (leaked agent key) | Result |
|---|---|
| Call `executeDca()` with a huge amount | Reverts — per-tx cap (100 fUSD) |
| Call `executeDca()` many times | Reverts — minimum interval (1 h), then the daily cap (250 fUSD per UTC day) |
| Trade a different token / venue | Impossible — AMM + pair are immutable in the vault; the scoped window also refuses any non-vault target at chain level |
| Buy during a price spike / manipulation | Reverts while the move from the window anchor exceeds 10% (circuit-breaker) |
| Withdraw the vault's funds | Impossible — `withdraw` is owner-only **and** requires the owner's ML-DSA-87 signature; the agent has neither |
| Un-kill or re-point the agent | Impossible — `killSwitch` is one-way; `setAgent` is owner + ML-DSA only |

**Worst-case loss from a leaked agent key:** the attacker can keep *buying the target asset
into the owner's own vault* at a rate of at most **250 fUSD per UTC day**, at market prices,
inside the circuit-breaker — until the owner kills the agent. No funds ever leave the vault
to the attacker. (One honest caveat: two adjacent UTC buckets can each spend a full daily
cap around midnight UTC — see *Honest limits*.)

## Architecture — three fences, one identity

```
                        OWNER (QoreX, ML-DSA-87 key registered on chain)
                          │  signs: kill-switch · setAgent · withdraw (PQ gate in vault)
                          │  signs: remote commands (ML-DSA, nonce + expiry)
                          ▼
   ┌──────────────────────────── AGENT (TypeScript) ────────────────────────────┐
   │  strategy.ts  deterministic decide(): schedule · caps mirror · breaker     │
   │  auth.ts      verifies owner commands with @qorechain/pqc mldsa87.verify   │
   │  feed.ts      AMM price: local file state  |  Diana via @qorechain/evm     │
   │  executor.ts  local executor               |  viem write to the vault      │
   │  log.ts       append-only JSONL decision log (price, decision, reason, tx) │
   └──────────────────────────────────┬─────────────────────────────────────────┘
                                      │ executeDca(amount) — the ONLY call
   ═══════════ LAYER A: scoped EVM window (chain) ══════════════════════════════
        agent account's window: allowedTargets = [GuardianVault], 48 txs,
        value+fee budget, 7200 blocks — scripts/open-scoped-window.ts
   ═══════════ LAYER B: GuardianVault (EVM contract) ═══════════════════════════
        per-tx cap · daily cap (UTC bucket) · min interval · circuit-breaker
        one AMM · one pair · agent cannot withdraw · owner PQ kill/withdraw
   ═══════════ LAYER C: abstract account (native lane) ═════════════════════════
        session key, permissions evm+amm only, on-chain spending rules,
        possession-proof linking (v3.2.8) — docs/ABSTRACT_ACCOUNT_PLAN.md
```

The **same owner ML-DSA-87 identity** anchors every layer: it is the key registered on
chain for the vault's PQC gate, and the key that signs remote commands to the agent.

### The vault rules (Layer B), precisely

| Rule | Value (defaults) | Enforced |
|---|---|---|
| Per-transaction cap | 100 fUSD | `executeDca`: `amountIn > perTxCap` reverts |
| Daily cap | 250 fUSD per **UTC day bucket** (`timestamp / 86400`, explicit — not a rolling window) | bucket rollover resets `spentInDay` |
| Minimum interval | 1 h between executions | `TooSoon` revert |
| Circuit-breaker | reject while price deviates > 10% (1000 bps) from the anchor observed at the start of the current 4 h window; anchor rotates when the window elapses | `CircuitBreakerTripped` revert; `breakerStatus()` view for dashboards |
| Venue / pair | one AMM address, one spend token, one target token — all immutable | by construction |
| Withdraw | owner **and** a fresh ML-DSA-87 signature binding token + amount | `withdraw()` PQ gate |
| Kill-switch | owner **and** ML-DSA-87 signature; **permanent, no un-kill** | `killSwitch()` PQ gate |
| Agent rotation | owner **and** ML-DSA-87 signature binding the new agent address | `setAgent()` PQ gate |

**The PQ gate** (same construction as a production audit pattern): `pqcKeyStatus(msg.sender)`
(precompile `0x0A02`) must return registered **and** possession-proven **and** algorithm
ML-DSA-87 (the full 4-value return of chain v3.2.4+); the presented pubkey must hash-match
the registered on-chain key; and `pqcVerify(pubkey, signature, message)` (precompile
`0x0A01` — argument order *pubkey, signature, message*) must verify a domain-bound message
`keccak256(abi.encode(vault, action, extra, nonce, deadline))`. Every executed action
consumes the nonce, so captured signatures are single-use.

### The agent (off chain, deliberately boring)

- **Deterministic strategy** (`agent/src/strategy.ts`): a pure function of (config, market
  state). It *mirrors* the vault rules so the agent doesn't waste transactions — but the
  vault is always the enforcement point; if they ever disagree, the chain wins.
- **Authenticated messaging** (`agent/src/auth.ts`): remote commands (`pause`, `resume`,
  `buy-now`) must carry an **ML-DSA-87 signature** from the owner key over a domain-bound
  canonical string (`DCA-GUARDIAN-COMMAND-V1|chain:qorechain-diana|vault:…|type:…|nonce:…|expiry:…`),
  verified with `@qorechain/pqc`'s `mldsa87.verify`. Expired commands and replays (nonce not
  strictly increasing) are rejected — including replays of *genuine* commands.
- **Decision log** (`agent/src/log.ts`): append-only JSONL — time, price, decision, amount,
  reason, deviation, tx hash. The audit trail is the product: after any incident you can
  replay exactly why the agent acted.
- **Feeds & executors**: local mode runs against a file-backed MockAMM state and a local
  executor; Diana mode reads the AMM via `@qorechain/evm` (`qorechainTestnet`, read-only
  `eth_call` — no window needed for reads) and writes `executeDca` with viem using the agent
  key, inside its scoped window.

## Category requirements → evidence

| Post-Quantum AI Agents requirement | Where DCA Guardian satisfies it | Evidence |
|---|---|---|
| Scoped EVM window (tx / value / duration / target limits) | Agent account window opened hybrid-signed with `allowedTargets = [GuardianVault]`, 48 txs, computed value budget, 7200 blocks | `scripts/open-scoped-window.ts` (official Workshop-1 pattern) + **live**: open tx `E8906CDF…A8C19`; REST-verified `live:true`, `allowed_targets=[0xe60a81a2…B38Ae8]`, expiry height 10095090 |
| Spending limits enforced on chain | GuardianVault caps/interval/breaker (EVM), live at `0xe60A81a25De2115837218D59745942e94aB38Ae8` (per-tx 100, daily 250, 1 h interval, 10%/4 h breaker); abstract-account spending rules are the native complement (runbook, not yet broadcast) | `contracts/GuardianVault.sol` + 34 tests; vault deploy tx `0xfa009b3b…7935c`; `docs/ABSTRACT_ACCOUNT_PLAN.md` (live-verified module config) |
| Smart-account spending rules | Abstract account: `session_based` account, `update-rules` JSON mirroring the vault caps, authenticator linked with v3.2.8 possession proof, permissions `evm,amm` only | `docs/ABSTRACT_ACCOUNT_PLAN.md` §2–§4 — **runbook only, NOT executed** (status declared in §7 of the plan; nothing is claimed live) |
| Authenticated messaging | Owner→agent commands are ML-DSA-87-signed (domain-bound, nonce, expiry), verified with `@qorechain/pqc`; hybrid-signed transactions for all native-lane steps | `agent/src/auth.ts` + 8 auth tests (forgery, tamper, wrong-vault, expiry, replay ×2, garbage); hybrid funding/register/window txs in the deployment record |
| Agent acts on testnet via hybrid-signed tx | Bootstrap registers the agent account's ML-DSA key (first tx) and opens its window hybrid-signed; agent EVM txs then run inside that window | **Live**: register tx `E27F69B5…21603` (`found:true, possession_proven:true`); first `executeDca` tx `0xe45ebd23…54da0` (block 10087908) sent by the agent inside its scoped window (window `used_txs` 0 → 1) |
| Kill-switch / owner control | One-way kill, owner + ML-DSA only; rotation and withdrawal behind the same PQ gate | Vault source + kill/rotation/withdraw test groups (11 tests); live negative proof: `executeDca` from a non-agent account reverts `NotAgent` on chain (tx `0x617413fc…a6ec`, reverted). The kill-switch itself is deliberately **not** fired live — it is permanent, and the demo vault stays alive |

## Live deployment — Diana (15 Nov 2026)

Machine-readable record: [`deployments.testnet.json`](deployments.testnet.json).
Explorer: https://explore.qore.network (Testnet) · EVM RPC `https://evm-testnet.qore.host` · REST `https://api-testnet.qore.host`

**Accounts**

| Role | Cosmos (coin-60) | EVM |
|---|---|---|
| Owner (vault owner) | `qor1dcse33ce3n3mwxxleuupqvfqeq6xl552zm2ltk` | `0x6E2198c7198Ce3B718DFCf38103120C8346fD28A` |
| Agent | `qor1z9g3jlz5w5ugq3urm7ndmkxts2gahyw8y4xm69` | `0x1151197c547538804783DFA6DDd8cb8291Db91c7` |

**Layer A — scoped window (agent).** Agent funded with 5 QOR by a hybrid-signed send
(tx `910744FC…8D51`); its ML-DSA-87 key registered as its **first** transaction
(tx `E27F69B5…21603`, classical + proof of possession; REST: `found:true`,
`possession_proven:true`, algorithm 1). Scoped window opened hybrid-signed
(tx `E8906CDF…A8C19`): 7200 blocks, 48 txs, 3,600,000 uqor budget,
`allowedTargets = [0xe60a81a25de2115837218d59745942e94ab38ae8]` — REST-verified live.
The owner's own (unscoped, deploy) window was refreshed in the same phase
(tx `957B7ECD…8BC8`, 20 txs).

**Layer B — the vault.** `GuardianVault` at `0xe60A81a25De2115837218D59745942e94aB38Ae8`
(deploy tx `0xfa009b3b…7935c` via `scripts/deploy.ts`), agent set to the agent account in
the constructor, guard params: per-tx cap 100, daily cap 250 (6-decimal spend units),
min interval 3600 s, breaker 1000 bps / 14400 s, PQC precompiles `0x0A01`/`0x0A02`.
Venue: `MockAMM` demo pair instance `0x7bb5bfe3b4baf711eaa6f4832296e31274b51f9d`
(constant price 1/3000 target-per-spend), funded with 200 target tokens.
Vault funded by the owner: 300 spend tokens (`deposit` tx `0x6c67b86b…90a2`).

**First execution.** One live agent cycle ran the project's own code
(`TestnetPriceFeed` → `decide()` → `TestnetExecutor`): decision *buy / scheduled-buy*,
10 spend units, 0 bps deviation → `executeDca` tx `0xe45ebd23…54da0` (block 10087908),
acquiring 0.003333 target tokens into the vault (`executionCount=1`, decision logged with
its tx hash). **Negative proof:** `executeDca` from the owner (not the agent) reverts
`NotAgent` — simulated, then broadcast and reverted on chain (tx `0x617413fc…a6ec`);
vault state untouched. The kill-switch was **not** fired: it is permanent by design.

**Why a demo pair? (the token-representation finding).** On Diana the fest faucet credits
Fest USD (`0x97143B77…63CA`) / Fest ETH (`0x02292293…1c28`) in the **native `erc20:<addr>`
bank-denom representation**. The EVM-lane ERC-20 contracts are separate ledgers — verified
live: ERC-20 `balanceOf(owner) = 0` for both, total supply held by the fest distributor,
no recent Transfer events, and `@qorechain/sdk` 0.14.0 exposes no conversion helper.
GuardianVault is token-agnostic, so the live demo trades the project's own ERC-20 pair at
the denominations the caps were designed around — dgUSD `0xb2bf86ad…7ebb` (6 dec) /
dgETH `0x0ac7e20c…7f89` (18 dec), both from `contracts/MockERC20.sol`, clearly named as
demo tokens. A MockAMM bound to the *real* fest pair was also deployed as a wiring
artifact (`0xd1c8ffd9…9fae`). Pointing the vault at the ERC-20 fest pair is a
constructor-argument change once an account holds the ERC-20 form; no guard code changes.

**Layer C — abstract account: NOT executed.** `docs/ABSTRACT_ACCOUNT_PLAN.md` remains a
runbook against the live-verified module configuration. No abstract account was created
and no spending rules were registered in this phase.

## Run it locally

```bash
# Contracts (34 tests: guard rules, circuit-breaker, PQ kill/rotation/withdraw, attacks)
npm install && npx hardhat test

# Agent (18 tests: strategy mirror + command authentication)
cd agent && npm install && npm test

# One live local cycle (edit agent/data/mock-amm-state.json to move the price)
cd agent && npm run cycle

# Scripted market story → dashboard demo data + JSONL log
cd agent && npm run simulate
cd ../frontend && npm install && npm run dev    # http://localhost:5173
cd ../frontend && npm run build                 # production build check
```

## Bootstrap order (Diana, live phase)

The order is not negotiable — the chain enforces it:

1. **Faucet** → fund the owner and agent coin-type-60 accounts
   (https://dashboard.qorechain.io/faucet, paste the `qor1...` addresses; 100 QOR / 24 h each).
2. **Register ML-DSA-87 keys** — the *first* transaction of each account
   (`MsgRegisterPQCKeyV2` + proof of possession; `scripts/open-scoped-window.ts register`,
   and the SDK's `ensurePqcRegistered` for the owner).
3. **Open the deployer's window** and deploy: `scripts/deploy.ts` (refuses any chain ≠ 9800).
4. **Open the agent's scoped window** targeting the vault only:
   `scripts/open-scoped-window.ts open` with `VAULT_ADDRESS` set.
5. **Install the abstract-account layer**: create the session account, `update-rules`,
   register the authenticator with its possession proof — `docs/ABSTRACT_ACCOUNT_PLAN.md`.
6. **Fund the vault** (`deposit`) and start the agent in Diana mode
   (`TestnetPriceFeed` + `TestnetExecutor`).
7. **Verify**: `GET /qorechain/pqc/v1/account/{addr}` → `found:true, possession_proven:true`;
   `GET /qorechain/pqc/v1/evm_window/{agent}` → `live:true`; first `executeDca` lands inside
   the caps and appears in the decision log with its tx hash.

## Threat model

| Attack | Defence | Residual risk |
|---|---|---|
| Agent key leaked | Caps + interval + breaker bound the rate; buys land in the owner's vault; scoped window blocks non-vault targets; abstract-account rules bound the native lane | Attacker can grief-buy up to the daily cap until killed (see *Honest limits* for the midnight-UTC bucket edge) |
| Agent prompt-injected / model goes rogue | The agent process cannot widen its own powers: the vault, the window and the spending rules are outside its reach; its only call is `executeDca` inside the fences | A rogue agent can still spend within the mandate — that is the mandate working as intended; the owner shrinks it by rotating caps in a new vault |
| Owner classical (ECDSA) key leaked | Kill/withdraw/rotation all additionally need the owner's **ML-DSA-87** signature bound to the registered on-chain key — the Q-Day drill property; the EVM window can be closed hybrid-signed | If the attacker also closes… they cannot: window control is native-lane and hybrid-signed too |
| Forged/replayed owner command to the agent | ML-DSA signature + domain binding (chain + vault + type) + strictly-increasing nonce + expiry | A captured command is single-use and short-lived by construction |
| Price manipulation to drain via bad fills | Circuit-breaker halts execution during >10% in-window moves; per-tx/daily caps bound any single fill | Slow manipulation under the threshold is market risk, not theft — funds stay in the vault as the target asset |
| Replay of an owner PQ signature (kill/withdraw) | Per-vault nonce consumed by every executed action; message binds action + parameters (agent address / token+amount) + deadline | None known within the model |
| Relayer censorship (Layer C) | Relayer only broadcasts; it cannot alter signed executions; owner can use another relayer or revoke | Liveness, not safety |

## Honest limits

- **UTC bucket edge:** the daily cap resets at the bucket boundary, so two full caps can be
  spent close together across midnight UTC (e.g. 250 at 23:30 + 250 at 00:30). This is the
  known trade-off of bucket accounting (predictable, auditable) vs a rolling window; the
  per-tx cap and the 1 h interval still bound the rate, and the kill-switch bounds the total
  incident. It is documented here rather than hidden.
- **MockPqc is not cryptography.** Locally, `MockPqc.sol` reproduces the precompiles'
  *behaviour contract* (valid signature vs anything else) with a keyed hash. Genuine FIPS 204
  verification happens only on Diana via `0x0A01`. The agent-side command authentication, by
  contrast, uses **real** ML-DSA-87 (`@qorechain/pqc`) even locally.
- **MockAMM is a constant-price venue** for tests and the demo — no liquidity curve, no
  slippage. The vault depends only on the two-function `IAmm` surface, so a real venue
  (native AMM adapter) drops in without touching the guard rules; its price convention
  (per whole spend token, decimals-normalised) is documented in `contracts/IQorePqc.sol`.
- **Layer C is a runbook, not a broadcast.** The abstract-account steps are written against
  the live-verified module configuration, but they execute in the live phase (§7 of the plan
  separates what is verified from what is pending).
- **The demo owner key is public.** `agent/src/keys.ts` derives the demo command-signing key
  from a fixed, published seed for deterministic tests. Production commands are signed by
  the owner's real registered key inside their wallet; the seed demo key protects nothing.
- **Breaker anchors are manipulation-sensitive by design:** the anchor is the first price
  of a window. An attacker who can move the AMM price *at the anchor moment* shifts the
  band — but execution still cannot leave the caps, and fills stay in the vault.

## Repository layout

```
contracts/   GuardianVault.sol · IQorePqc.sol (PQC + AMM interfaces)
             MockPqc.sol · MockAMM.sol · MockERC20.sol   (test doubles)
test/        GuardianVault.test.ts — 34 tests
agent/       TypeScript agent: strategy · auth (ML-DSA commands) · feed
             (local file / Diana) · executor (local / viem) · JSONL log
             run-once cycle + scripted simulation; 18 tests
scripts/     deploy.ts (Diana-only) · open-scoped-window.ts (Layer A)
docs/        ABSTRACT_ACCOUNT_PLAN.md (Layer C runbook)
frontend/    Vite + React dashboard over the simulation data
```

## License

MIT — see `LICENSE`.

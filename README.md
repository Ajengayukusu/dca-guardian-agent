# DCA Guardian Agent — an AI agent with an on-chain leash

[![Built on QoreChain](https://build.qorechain.io/badge/dca-guardian-agent.svg)](https://build.qorechain.io/p/dca-guardian-agent)

**Live demo:** https://ajengayukusu.github.io/dca-guardian-agent/

**Demo video (≤ 3 min):** https://www.youtube.com/watch?v=QlBf2PDtdBY

> **An autonomous DCA agent that cannot be drained, hijacked or talked into misbehaving —
> because its limits live in a contract, not in its prompt.**
> Built for the **QoreChain Developer Fest "Build Before Q-Day"** — **Post-Quantum AI Agents** category.
> Testnet: **QoreChain Diana** (EVM chain ID 9800) · Solidity 0.8.24 · License: MIT

---

## ⏱ Judge path — 3 minutes

1. **The problem (30 s).** Every "AI agent with a wallet" demo has the same fatal slide: the
   agent's key can send anything, anywhere. Leak the key, prompt-inject the agent, or let the
   model hallucinate once, and the wallet is empty. Prompts are not a security boundary.2. **The fix (30 s).** The agent's key can do exactly **one** thing — call
   `GuardianVault.executeDca()` — and the vault enforces on chain, on every call: a per-tx
   cap, a daily cap in an explicit UTC day bucket, a minimum interval, and a volatility
   circuit-breaker, on **one** immutable AMM and token pair. The agent can **never
   withdraw**; the owner stops it permanently with an **ML-DSA-87 kill-switch** verified by
   QoreChain's `pqcVerify` precompile. Around the vault sit two more chain-level fences: a
   **scoped EVM window** (agent transactions may target the vault only) and
   **abstract-account spending rules** for the native lane.
3. **Proof it works (60 s).** **34 Hardhat tests** (caps, breaker, replay, forged kill-switch,
   agent-trying-to-withdraw…) and **18 agent tests** (strategy mirror + ML-DSA command
   authentication, incl. forgery/replay/expiry rejection) — all passing:   ```bash
   npm install && npx hardhat test          # 34 passing
   cd agent && npm install && npm test      # 18 passing
   ```
4. **See it (60 s).** Open the hosted dashboard at https://ajengayukusu.github.io/dca-guardian-agent/,
   or run the scripted local market (price spike → two circuit-breaker holds
   → daily-cap stop) and open the dashboard it generates:   ```bash
   cd agent && npm run simulate             # writes the demo data + decision log
   cd ../frontend && npm install && npm run dev   # http://localhost:5173
   ```
5. **Deployment status (honest).** **LIVE on Diana since 15 Nov 2026:** GuardianVault at
   `0xe60A81a25De2115837218D59745942e94aB38Ae8`; the agent account's ML-DSA-87 key is
   registered (its first transaction), its scoped window targets the vault only, and the
   project's own agent code has executed a real `executeDca` on chain inside that window —
   full hashes in *Live deployment — Diana* below and in `deployments.testnet.json`. Two
   qualifications: the live pair is the project's own ERC-20 demo pair (the faucet's
   fUSD/fETH sit in the native `erc20:` bank-denom representation, a separate ledger from
   the EVM ERC-20 contracts — see the deployment section). Layer C (abstract account)
   was executed live on 19 Nov 2026 — account created, spending rules registered,
   agent key linked as authenticator, a real `executeDca` performed through it, and an
   over-limit attempt refused by the chain (full hashes below).

---

## Why "the agent promised to behave" is not a control

The design scenario is not "the agent is honest" — it is **"the agent's key leaks at 3 a.m."**
What can the attacker do?

| Attacker move (leaked agent key) | Result |
|---|---|
| Call `executeDca()` with a huge amount | Reverts — per-tx cap (100 fUSD) |
| Call `executeDca()` many times | Reverts — minimum interval (1 h), then the daily cap (250 fUSD per UTC day) |
| Trade a different token / venue | Impossible — AMM + pair are immutable in the vault; the scoped window refuses any non-vault target at chain level |
| Buy during a price spike / manipulation | Reverts while the move from the window anchor exceeds 10% (circuit-breaker) |
| Withdraw the vault's funds | Impossible — `withdraw` is owner-only **and** requires the owner's ML-DSA-87 signature; the agent has neither |
| Un-kill or re-point the agent | Impossible — `killSwitch` is one-way; `setAgent` is owner + ML-DSA only |

**Worst-case loss from a leaked agent key:** the attacker can keep *buying the target asset
into the owner's own vault* at most **250 fUSD per UTC day**, at market prices, inside the
circuit-breaker — until the owner kills the agent. No funds ever leave the vault to the
attacker. (Caveat: two adjacent UTC buckets can each spend a full daily cap around
midnight UTC — see *Honest limits*.)

## Architecture — three fences, one identity

```
                        OWNER (QoreX, ML-DSA-87 key registered on chain)
                          │  signs: kill-switch · setAgent · withdraw (PQ-gated)
                          │  signs: remote commands (ML-DSA, nonce + expiry)
                          ▼
   ┌──────────────────────────── AGENT (TypeScript) ────────────────────────────┐
   │  strategy.ts  deterministic decide(): schedule · caps mirror · breaker     │
   │  auth.ts      verifies owner commands with @qorechain/pqc mldsa87.verify   │
   │  feed.ts      AMM price: local file state  |  Diana via @qorechain/evm     │
   │  executor.ts  local executor               |  viem write to the vault      │
   │  log.ts       append-only JSONL decision log                               │
   └──────────────────────────────────┬─────────────────────────────────────────┘
                                      │ executeDca(amount) — the ONLY call
   ═══════════ LAYER A: scoped EVM window (chain) ══════════════════════════════
        allowedTargets = [GuardianVault], 48 txs, value+fee budget, 7200 blocks
        — scripts/open-scoped-window.ts
   ═══════════ LAYER B: GuardianVault (EVM contract) ═══════════════════════════
        per-tx cap · daily cap (UTC bucket) · min interval · circuit-breaker
        one AMM · one pair · agent cannot withdraw · owner PQ kill/withdraw
   ═══════════ LAYER C: abstract account (native lane) ═════════════════════════
        session key · evm+amm permissions · on-chain spending rules ·
        possession-proof linking — docs/ABSTRACT_ACCOUNT_PLAN.md
```

The **same owner ML-DSA-87 identity** anchors every layer: the vault's PQC gate key, and
the key that signs remote commands to the agent.

### The vault rules (Layer B), precisely

| Rule | Value (defaults) | Enforced |
|---|---|---|
| Per-transaction cap | 100 fUSD | `executeDca`: `amountIn > perTxCap` reverts |
| Daily cap | 250 fUSD per **UTC day bucket** (`timestamp / 86400`) | bucket rollover resets `spentInDay` |
| Minimum interval | 1 h between executions | `TooSoon` revert |
| Circuit-breaker | reject while price deviates > 10% (1000 bps) from the anchor set at the start of the current 4 h window; anchor rotates as windows elapse | `CircuitBreakerTripped` revert; `breakerStatus()` view |
| Venue / pair | one AMM address, one spend token, one target token — all immutable | by construction |
| Withdraw | owner **and** a fresh ML-DSA-87 signature binding token + amount | `withdraw()` PQ gate |
| Kill-switch | owner **and** ML-DSA-87 signature; **permanent, no un-kill** | `killSwitch()` PQ gate |
| Agent rotation | owner **and** ML-DSA-87 signature binding the new agent address | `setAgent()` PQ gate |

**The PQ gate:** `pqcKeyStatus(msg.sender)` (precompile `0x0A02`) must return registered,
possession-proven **and** algorithm ML-DSA-87 (the full 4-value return of chain v3.2.4+);
the presented pubkey must hash-match the registered key; and
`pqcVerify(pubkey, signature, message)` (precompile `0x0A01` — argument order *pubkey,
signature, message*) must verify the domain-bound message
`keccak256(abi.encode(vault, action, extra, nonce, deadline))`. Every executed action
consumes the nonce, so captured signatures are single-use.

### The agent (off chain, deliberately boring)

- **Deterministic strategy** (`agent/src/strategy.ts`): a pure function of (config, market
  state) that *mirrors* the vault rules so the agent doesn't waste transactions — but the
  vault is the enforcement point; if they disagree, the chain wins.
- **Authenticated messaging** (`agent/src/auth.ts`): remote commands (`pause`, `resume`,
  `buy-now`) must carry an **ML-DSA-87 signature** from the owner key over a domain-bound
  canonical string (`DCA-GUARDIAN-COMMAND-V1|chain:qorechain-diana|vault:…|type:…|nonce:…|expiry:…`),
  verified with `@qorechain/pqc`'s `mldsa87.verify`. Expired commands and replays (nonce not
  strictly increasing) are rejected — including replays of *genuine* commands.
- **Decision log** (`agent/src/log.ts`): append-only JSONL — time, price, decision, amount,
  reason, deviation, tx hash. After any incident you can replay exactly why the agent acted.
- **Feeds & executors**: local mode runs against a file-backed MockAMM state and a local
  executor; Diana mode reads the AMM via `@qorechain/evm` (read-only `eth_call` — no window
  needed for reads) and writes `executeDca` with viem, inside the agent's scoped window.

## Category requirements → evidence

| Post-Quantum AI Agents requirement | Where DCA Guardian satisfies it | Evidence |
|---|---|---|
| Scoped EVM window (tx / value / duration / target limits) | Agent window opened hybrid-signed with `allowedTargets = [GuardianVault]`, 48 txs, value budget, 7200 blocks | `scripts/open-scoped-window.ts` + **live**: open tx `E8906CDF…A8C19`; REST-verified `live:true`, `allowed_targets=[0xe60a81a2…B38Ae8]`, expiry height 10095090 |
| Spending limits enforced on chain | Vault caps/interval/breaker (EVM), live at `0xe60A81a25De2115837218D59745942e94aB38Ae8` (per-tx 100, daily 250, 1 h interval, 10%/4 h breaker); abstract-account rules are the native complement, **executed live 19 Nov 2026** — an over-limit authenticator attempt was refused by the chain itself (see Layer C below) | `contracts/GuardianVault.sol` + 34 tests; deploy tx `0xfa009b3b…7935c`; `docs/ABSTRACT_ACCOUNT_PLAN.md` + Layer C record below |
| Smart-account spending rules | Abstract account `qor1hzhpmd54xgxcpdw5huun9gkkj27heukp86cg7r` (`session_based`), spending rule `dca-daily` mirroring the vault caps (per-tx 100 QOR, daily 250 QOR, `uqor`; EVM calls allowlisted to `GuardianVault.executeDca` only), agent key linked as authenticator with v3.2.8 possession proof, permissions `evm,amm` only | **Live**: create tx `7DEC4110…B82A`; rules+link tx `153B4142…8F76F`; read back via `GET /qorechain/abstractaccount/v1/accounts/{address}/spending_rules` and `/authenticators`; `docs/ABSTRACT_ACCOUNT_PLAN.md` §7 |
| Authenticated messaging | Owner→agent commands are ML-DSA-87-signed (domain-bound, nonce, expiry), verified with `@qorechain/pqc`; hybrid-signed transactions for all native-lane steps | `agent/src/auth.ts` + 8 auth tests (forgery, tamper, wrong-vault, expiry, replay ×2, garbage); hybrid txs in the deployment record |
| Agent acts on testnet via hybrid-signed tx | Agent's ML-DSA key registered (first tx) and window opened hybrid-signed; agent EVM txs then run inside that window | **Live**: register tx `E27F69B5…21603` (`found:true, possession_proven:true`); first `executeDca` tx `0xe45ebd23…54da0` (block 10087908), window `used_txs` 0 → 1 |
| Kill-switch / owner control | One-way kill, owner + ML-DSA only; rotation and withdrawal behind the same PQ gate | Vault source + kill/rotation/withdraw test groups (11 tests); live negative proof: `executeDca` from a non-agent account reverts `NotAgent` on chain (tx `0x617413fc…a6ec`). The kill-switch itself is deliberately **not** fired live — it is permanent, and the demo vault stays alive |

## Live deployment — Diana (15 Nov 2026; Layer C added 19 Nov 2026)

Machine-readable record: [`deployments.testnet.json`](deployments.testnet.json).
Explorer: https://explore.qore.network · EVM RPC `https://evm-testnet.qore.host` · REST `https://api-testnet.qore.host`

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
The owner's own deploy window was refreshed in the same phase
(tx `957B7ECD…8BC8`, 20 txs).
**Layer B — the vault.** `GuardianVault` at `0xe60A81a25De2115837218D59745942e94aB38Ae8`
(deploy tx `0xfa009b3b…7935c` via `scripts/deploy.ts`), agent set in the constructor,
guard params: per-tx cap 100, daily cap 250 (6-decimal spend units), min interval 3600 s,
breaker 1000 bps / 14400 s, PQC precompiles `0x0A01`/`0x0A02`.
Venue: `MockAMM` demo pair instance `0x7bb5bfe3b4baf711eaa6f4832296e31274b51f9d`
(constant price 1/3000), funded with 200 target tokens.
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
bank-denom representation** — a separate ledger from the EVM ERC-20 contracts. Verified
live: ERC-20 `balanceOf(owner) = 0` for both, supply held by the fest distributor, no
recent Transfer events, and `@qorechain/sdk` 0.14.0 exposes no conversion helper.
GuardianVault is token-agnostic, so the live demo trades the project's own ERC-20 pair at
the denominations the caps were designed around — dgUSD `0xb2bf86ad…7ebb` (6 dec) /
dgETH `0x0ac7e20c…7f89` (18 dec), both from `contracts/MockERC20.sol`, clearly named as
demo tokens. A MockAMM bound to the *real* fest pair was also deployed as a wiring
artifact (`0xd1c8ffd9…9fae`). Pointing the vault at the ERC-20 fest pair is a
constructor-argument change once an account holds the ERC-20 form; no guard code changes.

**Layer C — abstract account: EXECUTED live, 19 Nov 2026.** The runbook in
`docs/ABSTRACT_ACCOUNT_PLAN.md` was carried out end-to-end on Diana (via the
`@qorechain/sdk` equivalents of the CLI sequence — same messages, hybrid-signed by the
owner). The abstract account, its spending rule and the linked authenticator are **still
live on chain** and can be read back at any time
(`GET https://api-testnet.qore.host/qorechain/abstractaccount/v1/accounts/qor1hzhpmd54xgxcpdw5huun9gkkj27heukp86cg7r`,
`.../spending_rules`, `.../authenticators`):

- **Abstract account** `qor1hzhpmd54xgxcpdw5huun9gkkj27heukp86cg7r` (EVM form
  `0xb8aE1Db695320d80b5D4bF3932A2d692bD7Cf2C1`), type `session_based`, owner = the vault
  owner. Create tx `7DEC41108BD639CBF72B31CD67F03F7C96AA3A52001F9D0A99DD3734B53AB82A`
  (code 0, height 10334027). Funded with 5 QOR by the owner (tx
  `D93213C8FDE415383B53C4D06F24A93319ACD14847195D5C16DBD71B0ED9A497`).
- **Spending rule + authenticator link** in one owner transaction
  (`153B41427714E83C3C804562E65C091204E52940C59307FED3ACEF786EF8F76F`, code 0): rule
  `dca-daily` — per-tx limit 100 QOR, daily limit 250 QOR (`uqor`), EVM calls
  allowlisted to exactly `GuardianVault.executeDca` (`0xe60a81a2…B38Ae8/0x4c9f8a36`).
  The agent key (`0x1151197c…Db91c7`, secp256k1, linked by its EVM address with the
  v3.2.8 possession proof) is registered as authenticator with permissions **`evm,amm`
  only** — no `send`, no `withdraw` — expiring 19 Dec 2026 (unix 1797623463).
- **Live-fire proof.** The vault's agent was rotated to the abstract account
  (owner + ML-DSA-87 `setAgent`, tx `0xa3fb056d29ffdf494dc26134355572c0192cdb92f2bc81217c51a3bf6b564e92`),
  then the agent key authorised a real DCA execution *through* Layer C: a relayer
  broadcast `MsgExecuteEVM` (tx `E470D13E630532D2E9A28BEC546FCB876B24F55E1FD1354A93BFEC5DA3E017F5`,
  code 0, height 10334132) and the chain executed `executeDca(10 dgUSD)` **from the
  abstract account** — the vault's second execution (`executionCount` 1 → 2,
  +0.003333 dgETH acquired, authenticator nonce 0 → 1, execution decoded
  `success=true`).
- **The leash bites.** An in-limit value move through the same key succeeded (1 QOR,
  tx `B7C7683A017CA542328DD0ED8CAA6B0CC6E663A0868BD70A1CF6235D0CA9FACB`; AA balance
  5 → 4 QOR). An over-limit attempt of **150 QOR** (per-tx cap: 100 QOR) was **refused
  by the chain**: tx `E2BF1B27A525C440F73B2CAA366246E2C6B0142E90EABFC44DBC05EA854F51CC`
  landed code 0 with an `abstractaccount_execution_failed` event — reason, verbatim:
  *"per-tx limit 100000000uqor exceeded (attempted 150000000): spending limit
  exceeded"* — the nonce was consumed and **no funds moved**.
- **Rotation back.** After the proof, the vault's agent was rotated back to the
  original EVM-lane agent key (owner + ML-DSA-87 `setAgent`, tx
  `0x01ae586b7985f78cc4e8ecde3fcdc0292ec2545298a770d92b2c17ed27f9144d`), restoring the
  Layer A/B live configuration exactly (`executionCount=2` is the only lasting change
  to the vault). The abstract account, rule and authenticator remain live, so the
  Layer C path can be re-pointed at the vault with a single owner rotation.
## Run it locally

```bash
# Contracts (34 tests)
npm install && npx hardhat test

# Agent (18 tests)
cd agent && npm install && npm test

# One live local cycle
cd agent && npm run cycle

# Scripted market story → dashboard demo data + JSONL log
cd agent && npm run simulate
cd ../frontend && npm install && npm run dev    # http://localhost:5173
cd ../frontend && npm run build
```

## Bootstrap order (Diana, live phase)

The full step-by-step (faucet → ML-DSA-87 key registration as each account's *first*
transaction → deployer window + deploy → agent scoped window → vault funding → verify)
is in [`docs/BOOTSTRAP.md`](docs/BOOTSTRAP.md); Layer C lives in
`docs/ABSTRACT_ACCOUNT_PLAN.md`.

## Threat model

Full table in [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). In one line: a leaked agent
key can at worst grief-buy the target asset into the owner's own vault at ≤250 fUSD per
UTC day until killed — funds never leave the vault to an attacker,
and kill/withdraw/rotation additionally need the owner's ML-DSA-87 signature, so a leaked
classical key alone drains nothing.

## Honest limits

- **UTC bucket edge:** the daily cap resets at the bucket boundary, so two full caps can be
  spent close together across midnight UTC (250 at 23:30 + 250 at 00:30); the per-tx
  cap and 1 h interval still bound the rate, the kill-switch the total incident.
- **MockPqc is not cryptography.** Locally, `MockPqc.sol` reproduces the precompiles'
  *behaviour contract* (valid signature vs anything else) with a keyed hash. Genuine FIPS 204
  verification happens only on Diana via `0x0A01`. Agent-side command authentication uses
  **real** ML-DSA-87 (`@qorechain/pqc`) even locally.
- **MockAMM is a constant-price venue** — no liquidity curve, no slippage. The vault depends
  only on the two-function `IAmm` surface, so a real venue drops in without touching the
  guard rules.
- **Layer C's standing configuration is a proof, not a standing delegation.** Layer C was
  executed live on 19 Nov 2026 (see the deployment section) and the abstract account,
  its spending rule and the linked authenticator remain on chain — but after the
  live-fire proof the vault's agent pointer was rotated back to the EVM-lane agent key,
  so today the authenticator authorises nothing against the vault until the owner
  rotates the agent again (one PQ-gated `setAgent`). The authenticator also expires on
  19 Dec 2026 by design; a lapsed key dies on its own.
- **The demo owner key is public.** `agent/src/keys.ts` derives the demo command-signing key
  from a fixed, published seed for deterministic tests. Production commands are signed by
  the owner's real registered key inside their wallet; the seed key protects nothing.
- **Breaker anchors are manipulation-sensitive by design:** the anchor is the first price
  of a window, so moving the AMM price *at the anchor moment* shifts the band — but
  execution still cannot leave the caps, and fills stay in the vault.

## Repository layout

```
contracts/   GuardianVault.sol · IQorePqc.sol (PQC + AMM interfaces)
             MockPqc.sol · MockAMM.sol · MockERC20.sol   (test doubles)
test/        GuardianVault.test.ts — 34 tests
agent/       TypeScript agent: strategy · auth (ML-DSA commands) · feed
             (local / Diana) · executor (local / viem) · JSONL log; 18 tests
scripts/     deploy.ts (Diana-only) · open-scoped-window.ts (Layer A)
docs/        ABSTRACT_ACCOUNT_PLAN.md (Layer C plan + execution record) · BOOTSTRAP.md ·
             THREAT_MODEL.md
frontend/    Vite + React dashboard over the simulation data
```

## Credits

Built with the official QoreChain stack: `@qorechain/sdk` 0.14.0,
`@qorechain/pqc` (ML-DSA-87 signing and verification) and `@qorechain/evm`
(chain reads), with Hardhat for contracts and tests and viem for the agent's
Diana executor. Fest: https://build.qorechain.io — docs:
https://docs.qorechain.io/build-before-qday

## License

MIT — see `LICENSE`.

# GuardianVault — flattened source for the QCAI audit

## What this is

`GuardianVault.flattened.sol` is the exact source of the **deployed**
`GuardianVault` contract, flattened with Hardhat for a QCAI audit run:

| Item | Value |
|---|---|
| Contract | `GuardianVault` (contracts/GuardianVault.sol) |
| Deployed address (Diana testnet, chain 9800) | `0xe60A81a25De2115837218D59745942e94aB38Ae8` |
| Deploy tx | `0xfa009b3b0df72d864cec6d901332b46b4ac73e098176aa75fe5e8d5fedf7935c` |
| Deployed | 2026-11-15, from repo commit `f25dcfc` (initial commit — the source has not changed since) |
| Flattened with | `npx hardhat flatten contracts/GuardianVault.sol` (Hardhat 2.29.2, OpenZeppelin Contracts v5.6.1 inlined) |

The flattened file inlines the contract's real dependencies only:
OpenZeppelin `IERC20` / `SafeERC20` / `ReentrancyGuard` and the project's
`contracts/IQorePqc.sol`. It contains **no test code** — the mock contracts
(`MockAMM`, `MockERC20`, `MockPqc`) are not imported by `GuardianVault` and
do not appear in it (the word "Mock" occurs only inside two NatSpec
comments of the original source).

## How the flattened file was verified against the deployed contract

1. **Source identity.** `contracts/GuardianVault.sol` is unchanged since
   the initial commit `f25dcfc360eac3f0e977e9d4b7d10a78d2568be8`
   (2026-11-15, deployment day).
2. **Flatten identity.** The `GuardianVault` and `IQorePqc` sections of the
   flattened file are byte-identical to the repo sources, diffed from the
   pragma line; the only differences anywhere are standard flatten
   artefacts (imports inlined, duplicate SPDX/pragma lines collapsed into
   `// Original license:` comments, blank-line spacing).
3. **Bytecode identity.** The on-chain runtime code at the deployed
   address (7,884 bytes, read via `eth_getCode`) matches a fresh
   `hardhat compile` of this source byte-for-byte once the 11 immutable
   slots (owner, AMM, token pair, five guard parameters, two precompile
   addresses) are masked — including an identical compiler metadata hash.

## How to run the QCAI audit

1. Open https://dashboard.qorechain.io/audit and sign in with the project
   account.
2. The form has **no file upload** — paste the **entire contents** of
   `GuardianVault.flattened.sol` into the "Contract Source Code" field.
3. Set **Blockchain = QoreChain**.
4. Run the audit and confirm the 150 QOR (testnet) charge if prompted.
5. Save the exported PDF as `docs/QCAI-audit-stage1.pdf` in this repo and
   triage every finding in writing next to it. The dashboard keeps no
   history, so a second ("stage 2") run is a fresh audit of this same
   file.

Note: QCAI is a static, AI-assisted review — the dashboard's own docs
state it is not a formal audit and does not compile or runtime-test the
contract. It complements the local suites (34 Hardhat contract tests +
18 agent tests, all passing) and `docs/THREAT_MODEL.md`; it does not
replace them.

## Auditor context — what this contract does

`GuardianVault` is the on-chain leash for an autonomous DCA (dollar-cost
averaging) agent, built for the QoreChain "Build Before Q-Day" Developer
Fest, Post-Quantum AI Agents category. The design premise: an AI agent
holding a live key will eventually leak it, be prompt-injected, or go
wrong — so the agent's key can do exactly **one** thing, call
`executeDca(uint256)`, and every call is fenced by rules the agent cannot
change (all are constructor immutables):

- **Per-transaction cap** — live value 100 dgUSD (100,000,000 units).
- **Daily cap** — 250 dgUSD per explicit UTC day bucket
  (`block.timestamp / 86400`, not a rolling window).
- **Minimum interval** — 3,600 s between executions.
- **Circuit-breaker** — execution reverts while the AMM price deviates
  more than 1,000 bps (10%) from the anchor price observed at the start
  of the current 14,400 s window; the anchor rotates when the window
  elapses, so slow drift is accepted and only violent in-window moves
  trip the breaker.
- **One venue, one pair** — the AMM address and the spend/target tokens
  are immutable; bought assets always land back in the vault. There is
  no code path that sends funds to the agent or to any third party.

Owner control is post-quantum gated: `killSwitch()` (permanent, one-way),
`setAgent()` and `withdraw()` require `msg.sender == owner` **and** a
fresh ML-DSA-87 (FIPS 204) signature verified on chain by the QoreChain
`pqcVerify` precompile (0x0A01), bound to the owner's registered key via
`pqcKeyStatus` (0x0A02: registered + proof-of-possession + algorithm +
pubkey match), over a domain-bound message
(`actionMessage`: vault, action, bound parameter, current `pqcNonce`,
deadline). Every executed action consumes the nonce, so signatures are
single-use. A leaked classical owner key alone therefore cannot drain or
hijack the vault.

Live state at preparation time: 4 executions, 40 dgUSD spent,
0.013332 dgETH acquired (see `deployments.testnet.json`).

### Layer C — chain-enforced execution path (context, not in this file)

Three of the four live executions did not come from the agent key
directly: the vault's agent pointer was temporarily rotated to a QoreChain
**native abstract account**, `qor1hzhpmd54xgxcpdw5huun9gkkj27heukp86cg7r`,
whose spending is enforced by the chain itself — rule `dca-daily`:
per-transaction limit 100 QOR, daily limit 250 QOR, `uqor` only, and EVM
calls restricted to this vault's `executeDca` selector. The agent key
(idx4) is linked as an authenticator with `evm` + `amm` permissions only,
expiring 19 Dec 2026. Two over-limit attempts (150 QOR) were refused by
the chain with no funds moved. After the proof, the agent pointer was
rotated back to the EVM-lane agent key; the abstract account, rule and
authenticator remain live on Diana. None of that machinery is inside
`GuardianVault` itself — the vault sees only `msg.sender == agent` — but
an auditor should know the deployed system ran under both layers.

## Honest design limits — read before scoring

- **Demo tokens and demo venue.** The live vault trades the project's own
  valueless demo ERC-20 pair (dgUSD / dgETH, from `contracts/MockERC20.sol`)
  on `MockAMM`, a constant-price demo venue. This is deliberate and
  documented in `deployments.testnet.json`: the fest faucet tokens exist
  on Diana only in the native `erc20:<addr>` bank-denom representation,
  and the EVM-lane ERC-20 ledgers could not be held by the project
  accounts. `GuardianVault` itself is token- and venue-agnostic —
  pointing it at a real pair is a constructor-argument change.
- **Single price source.** The circuit-breaker trusts the one allowlisted
  AMM's `spotPrice()`; there is no oracle aggregation. On the demo venue
  the price is constant by construction, so the breaker path is exercised
  by the test suite rather than by live market movement.
- **Kill-switch not fired live.** `killSwitch()` is permanent and
  one-way; it is covered by the local test suite and deliberately not
  exercised on the live vault, so the demo stays alive for judges.
- **The agent key is classical.** `executeDca` is authorised by
  `msg.sender == agent` (a secp256k1 key). The post-quantum gate protects
  the *owner control* functions; a leaked agent key is bounded by the
  caps above (worst case: capped buys that still land in the vault) until
  the owner kills or rotates it.
- **Precompile dependency.** The PQ gate delegates verification to the
  chain's `pqcVerify` / `pqcKeyStatus` precompiles; the contract does not
  implement ML-DSA itself.

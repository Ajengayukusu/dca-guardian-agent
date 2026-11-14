# Abstract-Account Plan — the native-lane leash (Layer C)

> Status: **plan, ready to execute at deployment time.** Everything in this
> document is written against the live Diana configuration verified on
> 15 Nov 2026 (see §1). The steps below have **not** been broadcast yet —
> they run in the bootstrap sequence (README → *Bootstrap order*) once the
> project accounts are funded and registered. What *has* been tested locally
> is listed honestly in §7.
>
> **Addendum — 15 Nov 2026, after the live deployment phase:** Layers A and B
> are now live on Diana (agent ML-DSA key registered, scoped window open with
> `allowedTargets = [GuardianVault]`, vault deployed and executing — see
> README → *Live deployment — Diana* and `deployments.testnet.json`).
> **Layer C is still NOT executed:** no abstract account has been created, no
> spending rules registered, no authenticator linked. This document remains a
> runbook; the §2–§6 sequence is the remaining work for this layer, and §7's
> status table stands as written.

## 0. Why this layer exists

GuardianVault (Layer B) fences the agent on the EVM lane, and the scoped
EVM window (Layer A) fences the agent *account* on the EVM lane. The
abstract-account module (`x/abstractaccount`) is the chain's native
equivalent for the Cosmos lane: it lets the owner issue the agent a
**session key (authenticator)** whose power is bounded by **spending rules
stored on chain**, executed through a relayer, without the agent ever
holding the owner's key or an ML-DSA key. It is the third, independent
fence: compromising the agent's EVM path does not widen its native path,
and vice versa.

Division of labour:

| Layer | Where | What it bounds |
|---|---|---|
| A — scoped EVM window | chain (native msg) | agent EVM txs: target = vault only, tx count, value+fee budget, duration |
| B — GuardianVault | EVM contract | per-tx cap, daily cap (UTC bucket), min interval, circuit-breaker, one venue/pair; owner-only PQ withdraw/kill |
| C — abstract account | chain (`x/abstractaccount`) | agent session key: permissions (`evm`, `amm` only), per-tx + daily spending rules per denom, expiry, instant revocation |

## 1. Verified live configuration (Diana, 15 Nov 2026)

`GET https://api-testnet.qore.host/qorechain/abstractaccount/v1/config`:

```json
{ "config": { "enabled": true, "max_session_keys": 10,
              "max_spending_rules": 5, "default_session_ttl": "86400" } }
```

The module is enabled on the testnet (it is disabled on mainnet — this
layer is a testnet feature today, which matches the contest). All
native-lane transactions below follow the chain-wide pattern: build with
`--generate-only`, then hybrid-cosign with the owner's PQC key
(`qorechaind tx pqc cosign`), because classical-only native transactions
from a PQC account are rejected.

## 2. Step 1 — create the agent's abstract account (owner)

Prerequisites: owner account funded + ML-DSA-87 key registered (its first
transaction, `MsgRegisterPQCKeyV2`); agent keypair generated and stored in
the agent's own secret store (never the owner's).

```bash
qorechaind tx abstractaccount create session_based \
  --from owner --chain-id qorechain-diana \
  --gas 400000 --fees 60000uqor --generate-only > create-aa.json
qorechaind tx pqc cosign create-aa.json --from owner --pqc-key ownerpqc \
  --chain-id qorechain-diana   # broadcasts the hybrid-signed tx
```

Record the returned abstract-account address (`AA`). All later steps name
it explicitly.

## 3. Step 2 — install spending rules BEFORE linking any key

Rules are a JSON array; `update-rules` REPLACES the whole set. Amounts are
in `uqor`; limits mirror the vault's caps so both layers agree:

```bash
qorechaind tx abstractaccount update-rules <AA> \
  '[{"id":"dca-daily","enabled":true,"daily_limit":250000000,"per_tx_limit":100000000,"allowed_denoms":["uqor"]}]' \
  --from owner --chain-id qorechain-diana \
  --gas 400000 --fees 60000uqor --generate-only > rules.json
qorechaind tx pqc cosign rules.json --from owner --pqc-key ownerpqc --chain-id qorechain-diana
```

For ERC-20 fest tokens, denoms inside spending rules are written with a
**slash** — `erc20/0x97143B771D34ddb9130b807b135Ae675A5a963CA` (fUSD) —
*not* the bank-denom colon form; use `denom_limits` for 18-decimal tokens.

⚠️ **v3.2.8 rules that will bite if ignored**

- An authenticator holding a *value* permission (`send`, `evm`, `svm`,
  `deploy`, `all`) is **rejected at registration** if no enabled spending
  rule limits it. Rules first, key second — hence this step order.
- A rule with `enabled:false` means **no limit**, not limit zero.
- Rule resolution: the authenticator's own rule → the account's first
  enabled rule → no limit. Keep exactly one enabled rule per purpose so
  the resolution is unambiguous.

## 4. Step 3 — link the agent key as authenticator (least privilege)

Since v3.2.8, registration **requires a possession proof** (field 8): the
agent key signs the exact text

```
QoreChain authenticator link v1 / chain: qorechain-diana / account: <AA bech32> / scheme: secp256k1 / key: <agent pubkey hex, lowercase>
```

Permissions: **`evm,amm` only** — the 11-permission system is fail-closed
(`send, delegate, withdraw, vote, evm, wasm, svm, amm, ibc, deploy, all`);
key management can never be delegated, and we grant nothing the DCA job
does not need. In particular the agent gets **no `send`** (no free native
transfers) and **no `withdraw`**.

```bash
qorechaind tx abstractaccount register-authenticator <AA> secp256k1 \
  <agent-pubkey-base64> "evm,amm" <expiry-unix> "dca-guardian-agent" \
  --possession-proof <proof-from-agent-key> \
  --from owner --chain-id qorechain-diana \
  --gas 400000 --fees 60000uqor --generate-only > link.json
qorechaind tx pqc cosign link.json --from owner --pqc-key ownerpqc --chain-id qorechain-diana
```

SDK equivalent (one owner transaction for rule + link): the
`@qorechain/sdk` helpers `linkAuthenticatorMsgs` and
`signAuthenticatorLinkMetaMask` / `signAuthenticatorLinkEip191` /
`signAuthenticatorLinkEd25519` / `signAuthenticatorLinkSecp256k1`
(0.14.0) produce the same messages and the v3.2.8 possession proof.

Set the expiry to the mandate horizon (e.g. 30 days). Expiry is a feature:
a forgotten agent key dies on its own.

## 5. Step 4 — how the agent executes through Layer C

- The agent signs **domain-separated, replay-bound** execution bytes with
  its authenticator key (per-authenticator nonce:
  `GET /qorechain/abstractaccount/v1/auth_nonce/{AA}/{pubkey_hex}`).
- A **relayer** broadcasts `MsgExecuteEVM` / `MsgExecuteCosmos` and pays
  the fee with the relayer's own hybrid signature. The agent key never
  needs an ML-DSA co-signature and never holds fee funds.
- Chain error codes to handle in the agent loop: `5` spending-limit,
  `6` expired, `10` permission-denied, `11` replay.
- ⚠️ Since v3.2.8 a failed execution can sit inside a **code-0**
  transaction with `success=false` and an
  `abstractaccount_execution_failed` event (the nonce is still consumed).
  The agent must assert execution success from the events
  (`assertAuthenticatorExecutionsSucceeded` in the SDK), not from the tx
  code alone.

## 6. Step 5 — revocation and rotation

Revocation is instant and owner-only (hybrid-signed like everything else):

```bash
qorechaind tx abstractaccount revoke-authenticator <AA> secp256k1 <agent-pubkey-base64> \
  --from owner --chain-id qorechain-diana --gas 400000 --fees 60000uqor --generate-only > revoke.json
qorechaind tx pqc cosign revoke.json --from owner --pqc-key ownerpqc --chain-id qorechain-diana
```

Rotation = revoke the old key, register the new key (§4), and rotate the
vault's agent via `GuardianVault.setAgent` (owner + ML-DSA). Do all three
in one maintenance window; the kill-switch stays available throughout as
the emergency path.

## 7. Verification checklist & honest status

Verify after each step (read-only, no window needed):

- `GET /qorechain/abstractaccount/v1/config` → `enabled:true`
- `GET /qorechain/pqc/v1/account/{owner}` → `found:true, possession_proven:true`
- `GET /qorechain/pqc/v1/evm_window/{agent}` → `live:true`, targets = [vault]
- `GET /qorechain/abstractaccount/v1/auth_nonce/{AA}/{pubkey_hex}` → nonce moves after each execution

| Claim | Status |
|---|---|
| Module enabled on Diana with the config in §1 | **Verified live** (REST, 15 Nov 2026) |
| Possession-proof text & v3.2.8 rule semantics (§3–§4) | From the v3.2.8 chain/SDK documentation & SDK 0.14.0 sources |
| GuardianVault enforces caps/breaker/kill on the EVM lane | **Tested locally** — 34 Hardhat tests passing |
| Agent strategy + authenticated commands | **Tested locally** — 18 node tests passing |
| The CLI sequence in §2–§6 broadcast on Diana | **Not yet executed** — runs in the bootstrap phase; this document is the runbook, not a claim |

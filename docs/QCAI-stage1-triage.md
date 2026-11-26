# QCAI Audit Stage 1 — Triage: DCA Guardian (GuardianVault)

- **Audit:** QoreChain AI Security Audit, dashboard.qorechain.io/audit
- **Run:** 26 Nov 2026, 09:36–09:37 WIB — second run of the day, PAID path
  (today's free daily run was used for DeedLock stage 1 in the morning).
  Audit cost 150 QOR, confirmed deducted on-chain from the dashboard wallet
  (199.055 → 49.01 QOR; see QCAI_RUN_LOG.md).
- **Result:** Security Score **65/100**, Risk Level **HIGH**, Quantum Readiness
  **HYBRID**, 6 findings (1 CRITICAL, 2 HIGH, 2 MEDIUM, 1 LOW).
- **Report:** `docs/QCAI-audit-stage1.pdf` (generated 11/26/2026 9:39:13 AM,
  Contract Name: GuardianVault, Blockchain: qorechain).
- **Source audited:** `flattened/GuardianVault.flattened.sol` (1,302 lines,
  53,213 bytes, byte-identical to the repo copy; fetched fresh from raw
  GitHub before the run). Triage below is against
  `contracts/GuardianVault.sol` (468 lines).
- **Verdict: 0 real issues. All 6 findings are false positives** — each
  finding's stated premise is contradicted by the actual code quoted below.
  No code changes made.

## Method note — line numbers and a paste incident

- The PDF's cited line numbers are approximate and do not match
  `contracts/GuardianVault.sol` exactly (same behaviour as the DeedLock
  stage 1 report, where only one location was close). This triage cites the
  ACTUAL line numbers from the repo contract, verified by reading the file.
- Process note: during pasting, the browser session briefly held two wrong
  versions of the source before they were fully undone (Ctrl+Z) and the
  correct flattened file was pasted; the first line
  (`// Sources flattened with hardhat v2.29.2 ...`) and the last lines
  (`    }` / `}` closing GuardianVault) were verified on screen before Run,
  and the PDF's findings name the real functions of this contract
  (`_verifyPqc`, `executeDca`, `breakerStatus`, day-bucket logic). The
  triage therefore treats the audited source as the repo flattened file.
  If the pasted text had differed, the CRITICAL finding would have to be
  re-verified; the evidence below shows the repo code does not contain the
  defects the report claims.

## Finding 1 — CRITICAL: "Incomplete PQC Implementation" (PDF: GuardianVault.sol:395)

Report claim: "`_verifyPqc` is marked as TODO and contains a revert
statement, making all owner operations impossible to execute."

**Verdict: FALSE POSITIVE.**

Evidence (`contracts/GuardianVault.sol:389-421`, identical at
`flattened/GuardianVault.flattened.sol:1223-1255`):

- There is no `TODO`, `FIXME`, or `XXX` anywhere in `GuardianVault.sol`,
  `IQorePqc.sol`, or the flattened file (grep-verified, zero matches).
- `_verifyPqc` is fully implemented: deadline check (`:397`,
  `revert SignatureExpired()`), `pqcKeyStatus` precompile call (`:399-404`),
  registered check (`:406`), possession-proven check (`:407`),
  ML-DSA-87 algorithm check (`:408`, `MLDSA87_ALGORITHM_ID = 1`),
  presented-pubkey vs registered-pubkey match (`:409-411`), domain-bound
  message over the current `pqcNonce` (`:413`), `pqcVerify` precompile call
  (`:415-419`), `revert PqcBadSignature()` on failure (`:420`).
- The `revert ...()` statements the report saw are guarded custom-error
  reverts on validation failure, not an unconditional revert. Owner
  operations (`killSwitch` :294, `setAgent` :310, `withdraw` :338) call
  `_verifyPqc` and then proceed — they are executable whenever the owner
  holds a registered, possession-proven ML-DSA-87 key on Diana.

Residual (by design, not a bug): owner operations depend on the Diana
`pqcVerify` (0x0A01) / `pqcKeyStatus` (0x0A02) precompiles and on the owner
having registered an ML-DSA-87 key. An owner who never registers a key
cannot run owner actions — that is the intended fail-closed property.

## Finding 2 — HIGH: "Reentrancy Vulnerability in Critical Path" (PDF: GuardianVault.sol:184-194)

Report claim: "`executeDca` performs external calls to AMM before updating
state."

**Verdict: FALSE POSITIVE.**

Evidence (`contracts/GuardianVault.sol:204-245`):

- Guard state is updated BEFORE any state-changing external call:
  `spentDayBucket = bucket; spentInDay = spent + amountIn;
  lastExecutionAt = block.timestamp; lastPrice = price; executionCount += 1;
  totalSpent += amountIn;` (:232-237).
- Only then do the external calls happen: `spendToken.forceApprove(...)`
  (:239) and `amm.swapExactIn(amountIn)` (:240).
- The one write after the swap, `totalAcquired += amountOut` (:242), is a
  pure accounting accumulator read only by the `getState()` view; it cannot
  be leveraged for reentrancy.
- `executeDca` is `nonReentrant` (:204), and the AMM is an immutable,
  single allowlisted venue — the agent cannot route funds elsewhere.
- The only external call before the state updates is `amm.spotPrice()`
  (:223), a view read needed for the breaker check; a view read changes no
  state, and re-entry is blocked by the guard anyway.

The report's premise ("external calls before state updates") is inverted:
the Checks-Effects-Interactions order is followed for all guard state.

## Finding 3 — HIGH: "Incorrect Daily Cap Reset Logic" (PDF: GuardianVault.sol:161-165)

Report claim: "the daily cap reset logic incorrectly resets `spentInDay` to
0 when `dayBucket` changes, but doesn't properly handle the case where the
`dayBucket` is already set to the current day."

**Verdict: FALSE POSITIVE.**

Evidence (`contracts/GuardianVault.sol:210-213, 232-233`):

- The code never resets `spentInDay` to 0. It computes the effective spent
  without mutating storage:
  `uint256 bucket = block.timestamp / 86400;`
  `uint256 spent = bucket == spentDayBucket ? spentInDay : 0;` (:210-211)
  and enforces `spent + amountIn > dailyCap` (:212-214).
- On success it writes `spentDayBucket = bucket; spentInDay = spent +
  amountIn;` (:232-233). Same-day calls accumulate (`spent = spentInDay`);
  a new UTC day starts from 0 (`spent = 0`) — exactly the documented
  behaviour ("the bucket is the explicit UTC day number ... so the reset
  moment is predictable and auditable", :84-87).
- The same pattern is used consistently by the views `spentToday()` (:426)
  and `getState()` (:455). There is no mishandled same-day case: when the
  bucket equals the current day, `spent` is the accumulated `spentInDay`.

## Finding 4 — MEDIUM: "Missing PQC Key Status Validation" (PDF: GuardianVault.sol:395)

Report claim: "`_verifyPqc` ... doesn't validate that the key is actually
registered, proven to be possessed, and matches the expected algorithm ID."

**Verdict: FALSE POSITIVE.** (Same function as Finding 1.)

Evidence (`contracts/GuardianVault.sol:399-411`): `_verifyPqc` calls
`pqcKeyStatusPrecompile.pqcKeyStatus(account)` and validates all four
properties the report says are missing:

- registered: `if (!registered) revert PqcKeyNotRegistered();` (:406)
- possession proven: `if (!possessionProven) revert
  PqcPossessionNotProven();` (:407)
- algorithm ID: `if (algorithmId != MLDSA87_ALGORITHM_ID) revert
  PqcWrongAlgorithm();` (:408)
- pubkey match: `if (keccak256(pubkey) != keccak256(onchainPubkey)) revert
  PqcPubkeyMismatch();` (:409-411)

## Finding 5 — MEDIUM: "Inconsistent Error Handling" (PDF: GuardianVault.sol:130-131, 138-139)

Report claim: "Some functions use custom errors while others use revert
statements. Also, some error messages lack sufficient context."

**Verdict: FALSE POSITIVE.**

Evidence: the contract uses custom errors EXCLUSIVELY. All 26 `revert`
statements are `revert <CustomError>(...)` (grep-verified); there is no
`require(...)` and no `revert("...")` string revert anywhere in the file.
The `revert` statements the report saw ARE the custom-error pattern, not a
second style. The errors carry descriptive parameters, e.g.
`PerTxCapExceeded(amount, cap)`, `DailyCapExceeded(spentAfter, cap)`,
`CircuitBreakerTripped(deviationBps, thresholdBps)`,
`TooSoon(nextAllowedAt)` — sufficient context for debugging.

## Finding 6 — LOW: "Unnecessary External Call in View Function" (PDF: GuardianVault.sol:212)

Report claim: "`breakerStatus` makes an external call to `amm.spotPrice()`
which is unnecessary for the function's purpose."

**Verdict: FALSE POSITIVE (by design).**

Evidence (`contracts/GuardianVault.sol:271-286`): `breakerStatus()` exists
precisely to report the LIVE deviation from the anchor ("Live
circuit-breaker status for dashboards: the current deviation from the
anchor", :269-270). The `spotPrice()` call (:276) is what makes the status
live; caching the price would make the dashboard status stale. It is a
`view` function: no state change, and no on-chain gas is paid for off-chain
`eth_call` reads.

## Summary

| # | Severity | Finding | Verdict |
|---|----------|---------|---------|
| 1 | CRITICAL | Incomplete PQC Implementation | False positive |
| 2 | HIGH | Reentrancy in Critical Path | False positive |
| 3 | HIGH | Incorrect Daily Cap Reset Logic | False positive |
| 4 | MEDIUM | Missing PQC Key Status Validation | False positive |
| 5 | MEDIUM | Inconsistent Error Handling | False positive |
| 6 | LOW | Unnecessary External Call in View Function | False positive |

**0 real issues. No code changes.** The 65/100 score reflects the
analyzer's incorrect premises (a TODO that does not exist, calls-before-state
that are ordered the other way, a reset-to-0 that never happens, validations
that are present) rather than defects in the contract. Scores are not
directly comparable across runs/modes (Rescue Run 82, DeedLock 72, DCA 65):
the analyzer's finding set varies run to run. The score is recorded as-is
on the report; the triage is the authoritative reading of the code.

# Bootstrap order (Diana, live phase)

Moved out of the README to keep it within the fest's word limit; this is the
exact order used for the live deployment recorded in
`deployments.testnet.json`. The order is not negotiable — the chain enforces
it:

1. **Faucet** → fund the owner and agent coin-type-60 accounts
   (https://dashboard.qorechain.io/faucet, paste the `qor1...` addresses; 100 QOR / 24 h each).
2. **Register ML-DSA-87 keys** — the *first* transaction of each account
   (`MsgRegisterPQCKeyV2` + proof of possession; `scripts/open-scoped-window.ts register`,
   and the SDK's `ensurePqcRegistered` for the owner).
3. **Open the deployer's window** and deploy: `scripts/deploy.ts` (refuses any chain ≠ 9800).
4. **Open the agent's scoped window** targeting the vault only:
   `scripts/open-scoped-window.ts open` with `VAULT_ADDRESS` set.
5. **Abstract-account layer (runbook, not executed)**: create the session account,
   `update-rules`, register the authenticator with its possession proof —
   `docs/ABSTRACT_ACCOUNT_PLAN.md`.
6. **Fund the vault** (`deposit`) and start the agent in Diana mode
   (`TestnetPriceFeed` + `TestnetExecutor`).
7. **Verify**: `GET /qorechain/pqc/v1/account/{addr}` → `found:true, possession_proven:true`;
   `GET /qorechain/pqc/v1/evm_window/{agent}` → `live:true`; first `executeDca` lands inside
   the caps and appears in the decision log with its tx hash.

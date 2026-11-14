# Threat model

Moved out of the README to keep it within the fest's word limit. The short
version: a leaked agent key can at worst grief-buy the target asset into the
owner's own vault at ≤250 fUSD per UTC day until the owner kills the agent —
funds never leave the vault to an attacker.

| Attack | Defence | Residual risk |
|---|---|---|
| Agent key leaked | Caps + interval + breaker bound the rate; buys land in the owner's vault; scoped window blocks non-vault targets; abstract-account rules bound the native lane | Attacker can grief-buy up to the daily cap until killed (see *Honest limits* in the README for the midnight-UTC bucket edge) |
| Agent prompt-injected / model goes rogue | The agent process cannot widen its own powers: the vault, the window and the spending rules are outside its reach; its only call is `executeDca` inside the fences | A rogue agent can still spend within the mandate — that is the mandate working as intended; the owner shrinks it by rotating caps in a new vault |
| Owner classical (ECDSA) key leaked | Kill/withdraw/rotation all additionally need the owner's **ML-DSA-87** signature bound to the registered on-chain key — the Q-Day drill property; window control is native-lane and hybrid-signed too | None within the model: the attacker cannot close or abuse the window without hybrid signing |
| Forged/replayed owner command to the agent | ML-DSA signature + domain binding (chain + vault + type) + strictly-increasing nonce + expiry | A captured command is single-use and short-lived by construction |
| Price manipulation to drain via bad fills | Circuit-breaker halts execution during >10% in-window moves; per-tx/daily caps bound any single fill | Slow manipulation under the threshold is market risk, not theft — funds stay in the vault as the target asset |
| Replay of an owner PQ signature (kill/withdraw) | Per-vault nonce consumed by every executed action; message binds action + parameters (agent address / token+amount) + deadline | None known within the model |
| Relayer censorship (Layer C) | Relayer only broadcasts; it cannot alter signed executions; owner can use another relayer or revoke | Liveness, not safety |

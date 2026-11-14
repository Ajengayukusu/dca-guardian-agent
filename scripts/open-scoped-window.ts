/**
 * open-scoped-window.ts — Layer A of the GuardianVault leash.
 *
 * On QoreChain every EVM transaction needs (1) a registered ML-DSA-87 key for
 * the sending account and (2) a live EVM authorisation window, opened by a
 * native-lane message signed HYBRID (secp256k1 + ML-DSA-87). A SCOPED window
 * additionally restricts WHICH contracts the account's EVM transactions may
 * call (allowedTargets), HOW MANY transactions it may send (maxTxs) and HOW
 * MUCH total value+fees it may consume (maxValue), for a bounded number of
 * blocks.
 *
 * For the DCA agent this is the outer fence: the window is opened on the
 * AGENT account with allowedTargets = [GuardianVault] ONLY. Even before the
 * vault's own rules run, the chain itself will refuse any agent EVM
 * transaction to any other target, beyond the transaction count, or beyond
 * the value budget. (The vault contract is Layer B; the abstract-account
 * spending rules in docs/ABSTRACT_ACCOUNT_PLAN.md are the native complement.)
 *
 * This script follows the official Workshop-1 pattern
 * (qorechain/build-before-qday, workshop-1/01-qday-counter/scripts/window.ts):
 * EthNativeSigner + signProofOfPossession + buildRegisterPqcKeyMsg for the
 * one classical registration transaction, then hybrid broadcast of
 * openEvmWindowMsg.
 *
 * Usage (run via ts-node / hardhat run; Diana is the default network):
 *   QORE_MNEMONIC="..." VAULT_ADDRESS=0x... \
 *     npx ts-node scripts/open-scoped-window.ts status
 *   ... register   register the account's ML-DSA-87 key (first tx, classical)
 *   ... open       open the scoped window for the agent (hybrid)
 *   ... recovery-code   print a new PQC recovery code (QRC1)
 *
 * Account source: QORE_MNEMONIC (BIP-44 m/44'/60'/0'/0/0 ->
 * deriveUnifiedAccount), or PRIVATE_KEY + QORE_PQC_RECOVERY_CODE.
 * Sizing env (DCA defaults):
 *   QORE_WINDOW_BLOCKS   default 7200  (±2.6 h on Diana, max 17280)
 *   QORE_WINDOW_TXS      default 48    (one executeDca per ~interval + slack)
 *   QORE_WINDOW_MAX_UQOR default computed: 48 x cost(300k gas @ 250 gwei cap)
 * The window must be renewed before it expires; renewal is a fresh `open`.
 */
import { StargateClient } from "@cosmjs/stargate";
import {
  EthNativeSigner,
  buildRegisterPqcKeyMsg,
  deriveUnifiedAccount,
  fetchPqcStatus,
  generatePqcRecoveryCode,
  isRegisteredPqcKey,
  isValidRecoveryCode,
  openEvmWindowMsg,
  signProofOfPossession,
  unifiedAccountFromSeed,
  type UnifiedAccount,
} from "@qorechain/sdk";
import { evmWindowCost, evmWindowStatus } from "@qorechain/evm";

const NET = {
  chainId: "qorechain-diana",
  rest: "https://api-testnet.qore.host",
  rpc: "https://rpc-testnet.qore.host",
} as const;

/** A native-lane fee: hybrid transactions are large, so the gas limit is generous. */
const FEE = { amount: [{ denom: "uqor", amount: "100000" }], gas: "800000" };

async function account(): Promise<UnifiedAccount> {
  const mnemonic = process.env.QORE_MNEMONIC?.trim();
  if (mnemonic) return deriveUnifiedAccount(mnemonic, 0);
  const key = process.env.PRIVATE_KEY?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Set QORE_MNEMONIC, or PRIVATE_KEY as 0x followed by 64 hex characters, in the environment"
    );
  }
  const recoveryCode = process.env.QORE_PQC_RECOVERY_CODE?.trim();
  if (!recoveryCode) {
    throw new Error(
      "Set QORE_PQC_RECOVERY_CODE: with PRIVATE_KEY the account's ML-DSA-87 key " +
        "comes from a separate QRC1 recovery code (create one with the recovery-code command)."
    );
  }
  if (!isValidRecoveryCode(recoveryCode)) {
    throw new Error("QORE_PQC_RECOVERY_CODE is not a valid QRC1 recovery code");
  }
  return unifiedAccountFromSeed(
    Uint8Array.from(Buffer.from(key.slice(2), "hex")),
    { recoveryCode }
  );
}

async function accountSequence(
  address: string
): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${NET.rest}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) {
    throw new Error(`${address} does not exist on chain yet: send it some QOR first (faucet)`);
  }
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  return {
    accountNumber: BigInt(acc.account_number ?? "0"),
    sequence: BigInt(acc.sequence ?? "0"),
  };
}

async function broadcast(
  acc: UnifiedAccount,
  mode: "hybrid" | "classical",
  messages: Parameters<EthNativeSigner["sign"]>[0]["messages"]
): Promise<string> {
  const { accountNumber, sequence } = await accountSequence(acc.cosmos);
  const signer = new EthNativeSigner(acc, { signMode: mode, rest: NET.rest });
  const transport = await StargateClient.connect(NET.rpc);
  try {
    const res = await signer.signAndBroadcast(transport, {
      chainId: NET.chainId,
      accountNumber,
      sequence,
      fee: FEE,
      messages,
    });
    return res.transactionHash;
  } finally {
    transport.disconnect();
  }
}

function vaultTarget(): string {
  const v = process.env.VAULT_ADDRESS?.trim();
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(
      "Set VAULT_ADDRESS to the deployed GuardianVault 0x address — the scoped window targets it and nothing else"
    );
  }
  return v;
}

async function status(): Promise<void> {
  const acc = await account();
  console.log(`account:  ${acc.evm}  (${acc.cosmos})`);
  const pqc = await fetchPqcStatus({ rest: NET.rest, address: acc.cosmos });
  const mine = pqc.registered ? isRegisteredPqcKey(pqc, acc.pqc.publicKey) : false;
  console.log(
    `PQC key:  ${pqc.registered ? (mine === false ? "registered, but NOT this key" : "registered") : "not registered (run: register)"}`
  );
  const w = await evmWindowStatus({ rest: NET.rest, address: acc.cosmos });
  if (!w.found) {
    console.log("window:   none (run: open)");
  } else {
    console.log(
      `window:   ${w.live ? "live" : "not usable"}; ${w.remainingBlocks} blocks, ${w.remainingTxs} txs, ${w.remainingValue} uqor left`
    );
  }
}

async function register(): Promise<void> {
  const acc = await account();
  const pqc = await fetchPqcStatus({ rest: NET.rest, address: acc.cosmos });
  if (pqc.registered) {
    console.log("The account already has a PQC key; nothing to do.");
    return;
  }
  // Registration is the one message the chain accepts signed classically.
  const proofOfPossession = signProofOfPossession({
    chainId: NET.chainId,
    account: acc.cosmos,
    keypair: acc.pqc,
  });
  const msg = buildRegisterPqcKeyMsg(acc.cosmos, {
    pqcKeypair: acc.pqc,
    proofOfPossession,
  });
  console.log(`registered: ${await broadcast(acc, "classical", [msg])}`);
}

async function open(): Promise<void> {
  const acc = await account();
  const vault = vaultTarget();
  const blocks = BigInt(process.env.QORE_WINDOW_BLOCKS ?? "7200");
  const maxTxs = BigInt(process.env.QORE_WINDOW_TXS ?? "48");
  // Each admitted transaction may consume value + gas limit x fee cap.
  // executeDca is small; size for up to 300,000 gas at a 250 gwei fee cap
  // (tools commonly set the cap near twice the 100 gwei base fee).
  const perTx = evmWindowCost({ gas: 300_000n, maxFeePerGas: 250_000_000_000n });
  const maxValue = BigInt(process.env.QORE_WINDOW_MAX_UQOR ?? (perTx * maxTxs).toString());
  const msg = openEvmWindowMsg({
    sender: acc.cosmos,
    blocks,
    maxTxs,
    maxValue,
    // THE SCOPE: the agent's EVM transactions may call the vault, and ONLY
    // the vault. Contract creation is refused while targets are set.
    allowedTargets: [vault],
  });
  console.log(`opened: ${await broadcast(acc, "hybrid", [msg])}`);
  console.log(
    `window: ${blocks} blocks, ${maxTxs} txs, ${maxValue} uqor (value plus fees), targets: [${vault}]`
  );
  console.log("Opening advanced the account's nonce; the agent may transact now.");
}

async function recoveryCode(): Promise<void> {
  console.log(generatePqcRecoveryCode());
  console.log("Put it in the environment as QORE_PQC_RECOVERY_CODE and keep a copy apart from the private key.");
}

const commands: Record<string, () => Promise<void>> = {
  status,
  register,
  open,
  "recovery-code": recoveryCode,
};

const cmd = process.argv[2] ?? "status";
const run = commands[cmd];
if (!run) {
  console.error(`Unknown command "${cmd}". Use: status | register | open | recovery-code`);
  process.exit(1);
}
run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

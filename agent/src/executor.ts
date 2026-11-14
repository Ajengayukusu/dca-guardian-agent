import { shake256 } from "@qorechain/pqc";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { qorechainTestnet } from "@qorechain/evm";
import { toHex } from "./keys.js";

/**
 * executor.ts — turning a "buy" decision into an execution.
 *
 * LocalExecutor: full local mode. Maintains the demo vault position in
 * memory and mints a deterministic pseudo transaction hash (SHAKE-256 of
 * the execution payload) so logs look and behave like the real thing
 * without a chain. It models the vault accounting (spend leaves, target
 * arrives at the feed price) — the REAL accounting rules live in
 * GuardianVault and are covered by the Hardhat suite.
 *
 * TestnetExecutor: Diana mode. Sends executeDca(amount) to the deployed
 * GuardianVault with the AGENT account's EVM key via viem on
 * @qorechain/evm's qorechainTestnet. The agent account must have: a
 * registered ML-DSA key, an open SCOPED window whose only target is the
 * vault (scripts/open-scoped-window.ts), and gas funds. The vault then
 * re-checks every guard rule on chain — this client cannot widen them.
 */

export interface ExecutionResult {
  txHash: string;
  amountIn: number;
  amountOut: number;
}

export interface Executor {
  execute(amountIn: number, price: number, at: number): Promise<ExecutionResult>;
}

export class LocalExecutor implements Executor {
  spendBalance: number;
  targetBalance = 0;
  private nonce = 0;

  constructor(initialSpendBalance: number) {
    this.spendBalance = initialSpendBalance;
  }

  async execute(amountIn: number, price: number, at: number): Promise<ExecutionResult> {
    if (amountIn > this.spendBalance) {
      throw new Error(
        `local vault balance ${this.spendBalance} cannot cover ${amountIn}`
      );
    }
    const amountOut = amountIn * price;
    this.spendBalance -= amountIn;
    this.targetBalance += amountOut;
    this.nonce += 1;
    const digest = shake256(
      new TextEncoder().encode(
        `local-exec|${this.nonce}|${at}|${amountIn}|${price}`
      ),
      32
    );
    return { txHash: "0x" + toHex(digest), amountIn, amountOut };
  }
}

const VAULT_ABI = [
  {
    type: "function",
    name: "executeDca",
    stateMutability: "nonpayable",
    inputs: [{ name: "amountIn", type: "uint256" }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export class TestnetExecutor implements Executor {
  private readonly wallet;
  private readonly publicClient;

  constructor(
    private readonly vaultAddress: Address,
    agentPrivateKey: Hex
  ) {
    const account = privateKeyToAccount(agentPrivateKey);
    this.publicClient = createPublicClient({
      chain: qorechainTestnet,
      transport: http("https://evm-testnet.qore.host"),
    });
    this.wallet = createWalletClient({
      account,
      chain: qorechainTestnet,
      transport: http("https://evm-testnet.qore.host"),
    });
  }

  async execute(amountIn: number): Promise<ExecutionResult> {
    const hash = await this.wallet.writeContract({
      address: this.vaultAddress,
      abi: VAULT_ABI,
      functionName: "executeDca",
      args: [BigInt(amountIn)],
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`executeDca reverted on chain (tx ${hash})`);
    }
    // amountOut is read back from the vault's totals by the caller if
    // needed; the log records the submitted amount and the tx hash.
    return { txHash: hash, amountIn, amountOut: 0 };
  }
}

import * as fs from "node:fs";
import { createPublicClient, http, type Address } from "viem";
import { qorechainTestnet } from "@qorechain/evm";

/**
 * feed.ts — where the agent reads the AMM price from.
 *
 * Two implementations of the same two-method surface:
 *  - FilePriceFeed: local mode. Reads a JSON state file
 *    ({"price": 2.5, "at": 1763...}) — the "MockAMM via file state" the
 *    local demo and the cycle script run against. A companion process (or
 *    the simulation) updates the file to move the market.
 *  - TestnetPriceFeed: Diana mode. Reads spotPrice() from the AMM contract
 *    over the public EVM JSON-RPC using @qorechain/evm's qorechainTestnet
 *    chain definition (chain ID 9800). Read-only: eth_call needs no EVM
 *    authorisation window and no key.
 */

export interface PricePoint {
  /** Target-per-spend as a plain number (e.g. 2.5 QOR per fUSD). */
  price: number;
  /** Unix seconds when the price was observed. */
  at: number;
}

export interface PriceFeed {
  spotPrice(): Promise<PricePoint>;
}

export class FilePriceFeed implements PriceFeed {
  constructor(private readonly path: string) {}

  async spotPrice(): Promise<PricePoint> {
    const raw = JSON.parse(fs.readFileSync(this.path, "utf8")) as {
      price: number;
      at?: number;
    };
    if (typeof raw.price !== "number" || raw.price <= 0) {
      throw new Error(`invalid price in ${this.path}`);
    }
    return { price: raw.price, at: raw.at ?? Math.floor(Date.now() / 1000) };
  }
}

const AMM_ABI = [
  {
    type: "function",
    name: "spotPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "priceE18", type: "uint256" }],
  },
] as const;

export class TestnetPriceFeed implements PriceFeed {
  private readonly client;
  constructor(private readonly ammAddress: Address) {
    this.client = createPublicClient({
      chain: qorechainTestnet,
      transport: http("https://evm-testnet.qore.host"),
    });
  }

  async spotPrice(): Promise<PricePoint> {
    const priceE18 = await this.client.readContract({
      address: this.ammAddress,
      abi: AMM_ABI,
      functionName: "spotPrice",
    });
    return {
      price: Number(priceE18) / 1e18,
      at: Math.floor(Date.now() / 1000),
    };
  }
}

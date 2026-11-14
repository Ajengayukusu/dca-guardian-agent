import { mldsa87 } from "@qorechain/pqc";
import { fromHex, toHex, type KeyPair } from "./keys.js";

/**
 * auth.ts — authenticated remote commands for the DCA agent.
 *
 * The owner can steer the agent remotely ("pause", "resume", "buy-now"),
 * but a chat message or an HTTP call must never be enough: anyone who can
 * reach the agent could otherwise steer it. Every command therefore carries
 * an ML-DSA-87 (FIPS 204) signature from the owner's key over a canonical,
 * domain-bound byte string:
 *
 *   DCA-GUARDIAN-COMMAND-V1|chain:qorechain-diana|vault:<vaultId>
 *     |type:<pause|resume|buy-now>|nonce:<n>|expiry:<unix>
 *
 * The verifier enforces, in order:
 *   1. the signature verifies against the OWNER's ML-DSA public key
 *      (mldsa87.verify — @qorechain/pqc, argument order pubkey, message,
 *      signature);
 *   2. the command is not expired (expiry vs the injected clock);
 *   3. the nonce is strictly greater than every nonce accepted before
 *      (replay of a captured command — even a validly signed one — fails).
 *
 * On QoreChain this is the off-chain half of "authenticated messaging":
 * the same owner key is the one registered on chain for the vault's PQC
 * gate, so one identity controls both layers. (A production deployment can
 * additionally transport commands as QoreSeal envelopes; the signature
 * check here is unchanged.)
 */

export type CommandType = "pause" | "resume" | "buy-now";

export interface AgentCommand {
  type: CommandType;
  /** Strictly increasing per owner; single-use. */
  nonce: number;
  /** Unix seconds after which the command is void. */
  expiry: number;
}

export interface SignedCommand {
  command: AgentCommand;
  /** Hex-encoded ML-DSA-87 signature over commandBytes(command, vaultId). */
  signature: string;
}

export function commandBytes(command: AgentCommand, vaultId: string): Uint8Array {
  const text =
    `DCA-GUARDIAN-COMMAND-V1|chain:qorechain-diana|vault:${vaultId}` +
    `|type:${command.type}|nonce:${command.nonce}|expiry:${command.expiry}`;
  return new TextEncoder().encode(text);
}

export function signCommand(
  ownerKeys: KeyPair,
  command: AgentCommand,
  vaultId: string
): SignedCommand {
  const sig = mldsa87.sign(ownerKeys.secretKey, commandBytes(command, vaultId));
  return { command, signature: toHex(sig) };
}

export type AuthRejection =
  | "bad-signature"
  | "expired"
  | "replay-or-stale-nonce";

export class CommandAuthenticator {
  private lastAcceptedNonce = 0;

  constructor(
    private readonly ownerPublicKey: Uint8Array,
    private readonly vaultId: string
  ) {}

  /** Highest nonce accepted so far (0 = none). */
  get lastNonce(): number {
    return this.lastAcceptedNonce;
  }

  /**
   * Verify a signed command. Returns null on success (and consumes the
   * nonce), or the rejection reason. `now` is injected for testability.
   */
  verify(signed: SignedCommand, now: number): AuthRejection | null {
    const bytes = commandBytes(signed.command, this.vaultId);
    let sig: Uint8Array;
    try {
      sig = fromHex(signed.signature);
    } catch {
      return "bad-signature";
    }
    // verify() never throws: malformed keys/signatures return false.
    if (!mldsa87.verify(this.ownerPublicKey, bytes, sig)) {
      return "bad-signature";
    }
    if (now > signed.command.expiry) {
      return "expired";
    }
    if (signed.command.nonce <= this.lastAcceptedNonce) {
      return "replay-or-stale-nonce";
    }
    this.lastAcceptedNonce = signed.command.nonce;
    return null;
  }
}

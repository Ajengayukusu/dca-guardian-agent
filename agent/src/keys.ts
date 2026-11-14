import { mldsa87, shake256 } from "@qorechain/pqc";

/**
 * keys.ts — demo ML-DSA-87 (FIPS 204) key handling for the agent package.
 *
 * The demo owner keypair is derived from a FIXED, PUBLIC seed so tests and
 * the dashboard simulation are deterministic. It protects nothing: never
 * use it for a real vault. In production the owner's ML-DSA-87 key is the
 * one registered on chain for their QoreChain account (derived from their
 * wallet mnemonic / QRC1 recovery code) and it never leaves their wallet —
 * commands are signed in QoreX and only the signature travels.
 */

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Public demo seed — 32 bytes, obviously not a secret. */
export const DEMO_OWNER_SEED = new Uint8Array(
  Array.from({ length: 32 }, (_, i) => i + 1)
);

export function demoOwnerKeyPair(): KeyPair {
  return mldsa87.keygen(DEMO_OWNER_SEED);
}

/** A different keypair, used by tests as "the attacker's key". */
export function attackerKeyPair(): KeyPair {
  return mldsa87.keygen(new Uint8Array(Array.from({ length: 32 }, (_, i) => 0xa0 + i)));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("odd-length hex string");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Short fingerprint of a public key, for logs/dashboards (never the key). */
export function pubkeyFingerprint(publicKey: Uint8Array): string {
  return toHex(shake256(publicKey, 8));
}

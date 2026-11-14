import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CommandAuthenticator,
  signCommand,
  type AgentCommand,
} from "../src/auth.js";
import { attackerKeyPair, demoOwnerKeyPair } from "../src/keys.js";

/**
 * Authenticated-command tests: remote steering of the agent requires a
 * valid ML-DSA-87 signature from the owner key, a live expiry, and a fresh
 * nonce. Anything else is rejected — including replays of genuine commands.
 */

const VAULT = "guardian-vault-demo";
const NOW = 1767225600;

const owner = demoOwnerKeyPair();
const attacker = attackerKeyPair();

function cmd(patch: Partial<AgentCommand>): AgentCommand {
  return { type: "pause", nonce: 1, expiry: NOW + 600, ...patch };
}

test("accepts a validly signed, fresh, unexpired owner command", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const signed = signCommand(owner, cmd({}), VAULT);
  assert.equal(auth.verify(signed, NOW), null);
  assert.equal(auth.lastNonce, 1);
});

test("rejects a command signed with an attacker's key (forgery)", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const forged = signCommand(attacker, cmd({}), VAULT);
  assert.equal(auth.verify(forged, NOW), "bad-signature");
  assert.equal(auth.lastNonce, 0);
});

test("rejects a command whose payload was tampered with after signing", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const signed = signCommand(owner, cmd({ type: "pause" }), VAULT);
  const tampered = { ...signed, command: { ...signed.command, type: "buy-now" as const } };
  assert.equal(auth.verify(tampered, NOW), "bad-signature");
});

test("rejects a command signed for a different vault (domain binding)", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const otherVault = signCommand(owner, cmd({}), "someone-elses-vault");
  assert.equal(auth.verify(otherVault, NOW), "bad-signature");
});

test("rejects an expired command even with a valid signature", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const expired = signCommand(owner, cmd({ expiry: NOW - 1 }), VAULT);
  assert.equal(auth.verify(expired, NOW), "expired");
});

test("rejects a replay of an already-accepted command", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const signed = signCommand(owner, cmd({ nonce: 7 }), VAULT);
  assert.equal(auth.verify(signed, NOW), null);
  assert.equal(auth.verify(signed, NOW), "replay-or-stale-nonce");
});

test("rejects a stale nonce after a newer command was accepted", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  assert.equal(auth.verify(signCommand(owner, cmd({ nonce: 5 }), VAULT), NOW), null);
  assert.equal(
    auth.verify(signCommand(owner, cmd({ nonce: 3, type: "resume" }), VAULT), NOW),
    "replay-or-stale-nonce"
  );
});

test("rejects garbage signature bytes without throwing", () => {
  const auth = new CommandAuthenticator(owner.publicKey, VAULT);
  const junk = { command: cmd({}), signature: "zzzz" };
  assert.equal(auth.verify(junk, NOW), "bad-signature");
});

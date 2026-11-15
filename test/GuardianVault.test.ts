import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * GuardianVault test suite.
 *
 * Locally the QoreChain PQC precompiles are replaced by MockPqc. A "valid
 * ML-DSA signature" is mock.mockSign(pubkey, message); anything else —
 * garbage bytes, a signature for another pubkey / message / nonce — fails
 * verification, which is exactly what the negative tests exercise.
 *
 * The AMM is MockAMM: a constant-price venue whose price the tests steer,
 * including the violent moves that must trip the circuit-breaker.
 *
 * Guard parameters used throughout:
 *   perTxCap = 100 fUSD · dailyCap = 250 fUSD · minInterval = 1 h
 *   breaker: 10% (1000 bps) inside a 4 h window · start price 2.5 QOR/fUSD
 */

const FUSD = (n: number) => ethers.parseUnits(n.toString(), 6);
const PRICE = (n: number) => ethers.parseEther(n.toString());
const PER_TX_CAP = FUSD(100);
const DAILY_CAP = FUSD(250);
const MIN_INTERVAL = 3600;
const BREAKER_BPS = 1000;
const BREAKER_WINDOW = 4 * 3600;

function pubkeyFor(address: string): string {
  return ethers.hexlify(
    ethers.toUtf8Bytes("ml-dsa-87-pubkey::" + address.toLowerCase())
  );
}

describe("GuardianVault", function () {
  let owner: any, agent: any, agent2: any, stranger: any;
  let mock: any, vault: any, amm: any, fusd: any, qor: any;

  async function deadline(offset = 3600): Promise<number> {
    return (await time.latest()) + offset;
  }

  async function pqSig(
    signer: any,
    action: string,
    extra: bigint,
    dl: number
  ): Promise<string> {
    const nonce = await vault.pqcNonce();
    const msg = await vault.actionMessage(action, extra, nonce, dl);
    return mock.mockSign(pubkeyFor(signer.address), msg);
  }

  function withdrawExtra(token: string, amount: bigint): bigint {
    const packed = ethers.solidityPacked(["address", "uint256"], [token, amount]);
    return BigInt(ethers.keccak256(packed));
  }

  async function killAs(signer: any) {
    const dl = await deadline();
    const sig = await pqSig(signer, "KILL_SWITCH", 0n, dl);
    return vault.connect(signer).killSwitch(pubkeyFor(signer.address), sig, dl);
  }

  beforeEach(async function () {
    [owner, agent, agent2, stranger] = await ethers.getSigners();

    const MockPqc = await ethers.getContractFactory("MockPqc");
    mock = await MockPqc.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    fusd = await MockERC20.deploy("Fest USD", "fUSD", 6);
    qor = await MockERC20.deploy("Mock QOR", "mQOR", 18);

    const MockAMM = await ethers.getContractFactory("MockAMM");
    amm = await MockAMM.deploy(await fusd.getAddress(), await qor.getAddress(), PRICE(2.5));
    // AMM target inventory.
    await qor.mint(await amm.getAddress(), ethers.parseEther("1000000"));

    const Vault = await ethers.getContractFactory("GuardianVault");
    vault = await Vault.deploy(
      owner.address,
      agent.address,
      await amm.getAddress(),
      await fusd.getAddress(),
      await qor.getAddress(),
      await mock.getAddress(),
      await mock.getAddress(),
      PER_TX_CAP,
      DAILY_CAP,
      MIN_INTERVAL,
      BREAKER_BPS,
      BREAKER_WINDOW
    );

    for (const p of [owner, agent, agent2, stranger]) {
      await mock.registerKey(p.address, pubkeyFor(p.address), true);
    }

    // Fund the owner and deposit a working balance into the vault.
    await fusd.mint(owner.address, FUSD(10000));
    await fusd.connect(owner).approve(await vault.getAddress(), FUSD(5000));
    await vault.connect(owner).deposit(FUSD(5000));
  });

  // ------------------------------------------------------------ happy path

  describe("funding and execution", function () {
    it("deposit pulls the spend token into the vault and emits Deposited", async function () {
      await fusd.mint(stranger.address, FUSD(50));
      await fusd.connect(stranger).approve(await vault.getAddress(), FUSD(50));
      await expect(vault.connect(stranger).deposit(FUSD(50)))
        .to.emit(vault, "Deposited")
        .withArgs(stranger.address, FUSD(50));
      expect(await fusd.balanceOf(await vault.getAddress())).to.equal(FUSD(5050));
    });

    it("rejects a zero deposit", async function () {
      await expect(vault.connect(owner).deposit(0)).to.be.revertedWithCustomError(
        vault,
        "InvalidAmount"
      );
    });

    it("executeDca buys the target token at the AMM price and accounts for it", async function () {
      const tx = await vault.connect(agent).executeDca(FUSD(100));
      const receipt = await tx.wait();
      const evt = receipt.logs
        .map((l: any) => {
          try {
            return vault.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p: any) => p && p.name === "DcaExecuted");
      expect(evt, "DcaExecuted event").to.not.equal(undefined);
      expect(evt.args.agent).to.equal(agent.address);
      expect(evt.args.amountIn).to.equal(FUSD(100));
      expect(evt.args.amountOut).to.equal(ethers.parseEther("250")); // 100 fUSD * 2.5
      expect(evt.args.priceE18).to.equal(PRICE(2.5));
      expect(evt.args.spentInDayAfter).to.equal(FUSD(100));
      expect(evt.args.dayBucket).to.equal(await vault.spentDayBucket());
      const s = await vault.getState();
      expect(s.executions).to.equal(1n);
      expect(s.spentTotal).to.equal(FUSD(100));
      expect(s.acquiredTotal).to.equal(ethers.parseEther("250"));
      expect(s.spendBalance).to.equal(FUSD(4900));
      expect(s.targetBalance).to.equal(ethers.parseEther("250"));
      expect(await vault.spentToday()).to.equal(FUSD(100));
    });

    it("a second execution after the minimum interval succeeds and accumulates", async function () {
      await vault.connect(agent).executeDca(FUSD(40));
      await time.increase(MIN_INTERVAL);
      await vault.connect(agent).executeDca(FUSD(40));
      const s = await vault.getState();
      expect(s.executions).to.equal(2n);
      expect(s.spentTotal).to.equal(FUSD(80));
      expect(s.acquiredTotal).to.equal(ethers.parseEther("200"));
    });
  });

  // ---------------------------------------------------------- guard rules

  describe("guard rules (the leash)", function () {
    it("rejects execution from anyone who is not the agent", async function () {
      await expect(vault.connect(stranger).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "NotAgent");
      await expect(vault.connect(owner).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "NotAgent");
    });

    it("rejects a zero-amount execution", async function () {
      await expect(vault.connect(agent).executeDca(0)).to.be.revertedWithCustomError(
        vault,
        "InvalidAmount"
      );
    });

    it("rejects an execution above the per-transaction cap", async function () {
      await expect(vault.connect(agent).executeDca(FUSD(101)))
        .to.be.revertedWithCustomError(vault, "PerTxCapExceeded")
        .withArgs(FUSD(101), PER_TX_CAP);
    });

    it("rejects executions that would exceed the daily cap (UTC bucket)", async function () {
      // Align to the start of a fresh UTC day bucket first. The vault buckets
      // the daily cap by block.timestamp / 86400 and this test advances time
      // by MIN_INTERVAL (1h) twice; when the suite runs late in the UTC day
      // those advances roll the bucket over mid-test and reset the budget, so
      // the third execution no longer reverts. That is a test-scheduling bug,
      // not a vault bug — the rollover behaviour itself is verified by the
      // next test. Starting just after a UTC midnight keeps every step of
      // this test inside one bucket at any wall-clock time.
      const now = await time.latest();
      await time.increaseTo((Math.floor(now / 86400) + 1) * 86400 + 60);
      await vault.connect(agent).executeDca(FUSD(100));
      await time.increase(MIN_INTERVAL);
      await vault.connect(agent).executeDca(FUSD(100));
      await time.increase(MIN_INTERVAL);
      await expect(vault.connect(agent).executeDca(FUSD(100)))
        .to.be.revertedWithCustomError(vault, "DailyCapExceeded")
        .withArgs(FUSD(300), DAILY_CAP);
      // …but the exact remaining headroom is still allowed.
      await vault.connect(agent).executeDca(FUSD(50));
      expect(await vault.spentToday()).to.equal(DAILY_CAP);
    });

    it("resets the daily budget when the UTC day bucket rolls over", async function () {
      await vault.connect(agent).executeDca(FUSD(100));
      await time.increase(MIN_INTERVAL);
      await vault.connect(agent).executeDca(FUSD(100));
      await time.increase(86400); // next UTC day (also > breaker window + interval)
      await vault.connect(agent).executeDca(FUSD(100));
      expect(await vault.spentToday()).to.equal(FUSD(100));
      expect((await vault.getState()).executions).to.equal(3n);
    });

    it("rejects an execution that comes too soon after the previous one", async function () {
      await vault.connect(agent).executeDca(FUSD(10));
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "TooSoon");
      await time.increase(MIN_INTERVAL - 60);
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "TooSoon");
    });

    it("rejects execution when the vault balance cannot cover it", async function () {
      // Drain most of the vault via an owner PQ withdrawal first.
      const dl = await deadline();
      const amount = FUSD(4950);
      const sig = await pqSig(owner, "WITHDRAW", withdrawExtra(await fusd.getAddress(), amount), dl);
      await vault.connect(owner).withdraw(await fusd.getAddress(), amount, pubkeyFor(owner.address), sig, dl);
      await expect(vault.connect(agent).executeDca(FUSD(100)))
        .to.be.revertedWithCustomError(vault, "InsufficientVaultBalance");
    });
  });

  // ------------------------------------------------------- circuit-breaker

  describe("circuit-breaker", function () {
    it("rejects execution after a violent upward move inside the window", async function () {
      await vault.connect(agent).executeDca(FUSD(10)); // anchor = 2.5
      await amm.setPrice(PRICE(3.1)); // +24% > 10% threshold
      await time.increase(MIN_INTERVAL);
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "CircuitBreakerTripped")
        .withArgs(2400n, BigInt(BREAKER_BPS));
    });

    it("rejects execution after a violent downward move inside the window", async function () {
      await vault.connect(agent).executeDca(FUSD(10)); // anchor = 2.5
      await amm.setPrice(PRICE(2.0)); // -20%
      await time.increase(MIN_INTERVAL);
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "CircuitBreakerTripped");
    });

    it("allows execution for a small move inside the window", async function () {
      await vault.connect(agent).executeDca(FUSD(10));
      await amm.setPrice(PRICE(2.6)); // +4% < 10%
      await time.increase(MIN_INTERVAL);
      await vault.connect(agent).executeDca(FUSD(10));
      expect((await vault.getState()).executions).to.equal(2n);
    });

    it("re-anchors after the breaker window elapses, so slow drift is allowed", async function () {
      await vault.connect(agent).executeDca(FUSD(10)); // anchor = 2.5
      await amm.setPrice(PRICE(3.1)); // +24%, but…
      await time.increase(BREAKER_WINDOW + MIN_INTERVAL); // …the window has passed
      await vault.connect(agent).executeDca(FUSD(10));
      expect(await vault.anchorPrice()).to.equal(PRICE(3.1));
    });

    it("breakerStatus reports the trip before the agent wastes a transaction", async function () {
      await vault.connect(agent).executeDca(FUSD(10));
      await amm.setPrice(PRICE(3.1));
      const status = await vault.breakerStatus();
      expect(status.tripped).to.equal(true);
      expect(status.deviationBps).to.equal(2400n);
      expect(status.currentPrice).to.equal(PRICE(3.1));
    });
  });

  // -------------------------------------------- owner PQ actions: kill etc.

  describe("kill-switch (owner + ML-DSA)", function () {
    it("owner kills the agent with a valid PQ signature; execution then reverts", async function () {
      await expect(killAs(owner)).to.emit(vault, "AgentKilled").withArgs(owner.address, 0n);
      expect(await vault.killed()).to.equal(true);
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "AgentIsKilled");
    });

    it("rejects a kill attempt by the agent itself, even with the agent's own valid PQ signature", async function () {
      const dl = await deadline();
      const sig = await pqSig(agent, "KILL_SWITCH", 0n, dl);
      await expect(
        vault.connect(agent).killSwitch(pubkeyFor(agent.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("rejects a kill with a forged (garbage) ML-DSA signature", async function () {
      const dl = await deadline();
      const forged = ethers.hexlify(ethers.randomBytes(32));
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(owner.address), forged, dl)
      ).to.be.revertedWithCustomError(vault, "PqcBadSignature");
    });

    it("rejects replaying a consumed kill signature (the nonce has moved)", async function () {
      const dl = await deadline();
      const nonce0 = await vault.pqcNonce();
      const msg = await vault.actionMessage("KILL_SWITCH", 0n, nonce0, dl);
      const sig = await mock.mockSign(pubkeyFor(owner.address), msg);
      await vault.connect(owner).killSwitch(pubkeyFor(owner.address), sig, dl);
      // Same signature a second time: the vault is already killed (and the
      // nonce was consumed), so the replay cannot succeed either way.
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "AgentAlreadyKilled");
      expect(await vault.pqcNonce()).to.equal(nonce0 + 1n);
    });

    it("rejects replaying a rotation signature to install a different agent", async function () {
      const dl = await deadline();
      const nonce0 = await vault.pqcNonce();
      const extra = BigInt(agent2.address);
      const msg = await vault.actionMessage("SET_AGENT", extra, nonce0, dl);
      const sig = await mock.mockSign(pubkeyFor(owner.address), msg);
      await vault.connect(owner).setAgent(agent2.address, pubkeyFor(owner.address), sig, dl);
      // Replay the very same signature: nonce moved => message mismatch.
      await expect(
        vault.connect(owner).setAgent(agent2.address, pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcBadSignature");
    });

    it("rejects a kill with an expired signature deadline", async function () {
      const dl = (await time.latest()) - 10; // already in the past
      const nonce = await vault.pqcNonce();
      const msg = await vault.actionMessage("KILL_SWITCH", 0n, nonce, dl);
      const sig = await mock.mockSign(pubkeyFor(owner.address), msg);
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "SignatureExpired");
    });

    it("rejects a kill presenting a pubkey that is not the registered on-chain key", async function () {
      const dl = await deadline();
      const sig = await pqSig(owner, "KILL_SWITCH", 0n, dl);
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(stranger.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcPubkeyMismatch");
    });

    it("rejects a kill when the owner's key lacks proof of possession", async function () {
      await mock.registerKey(owner.address, pubkeyFor(owner.address), false);
      const dl = await deadline();
      const sig = await pqSig(owner, "KILL_SWITCH", 0n, dl);
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcPossessionNotProven");
    });

    it("rejects a kill when the owner has no registered PQC key at all", async function () {
      await mock.removeKey(owner.address);
      const dl = await deadline();
      const sig = "0x1234";
      await expect(
        vault.connect(owner).killSwitch(pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcKeyNotRegistered");
    });
  });

  // ------------------------------------------------- rotation & withdrawal

  describe("agent rotation and owner withdrawal", function () {
    it("rotating the agent moves execution rights and cuts off the old key", async function () {
      const dl = await deadline();
      const sig = await pqSig(owner, "SET_AGENT", BigInt(agent2.address), dl);
      await expect(
        vault.connect(owner).setAgent(agent2.address, pubkeyFor(owner.address), sig, dl)
      )
        .to.emit(vault, "AgentRotated")
        .withArgs(agent.address, agent2.address);
      await expect(vault.connect(agent).executeDca(FUSD(10)))
        .to.be.revertedWithCustomError(vault, "NotAgent");
      await vault.connect(agent2).executeDca(FUSD(10));
      expect((await vault.getState()).executions).to.equal(1n);
    });

    it("rejects rotation signed for a different new-agent address (parameter binding)", async function () {
      const dl = await deadline();
      // Signature binds stranger as the new agent…
      const sig = await pqSig(owner, "SET_AGENT", BigInt(stranger.address), dl);
      // …but the call tries to install agent2.
      await expect(
        vault.connect(owner).setAgent(agent2.address, pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcBadSignature");
    });

    it("the agent can never withdraw — not the spend token, not the target token", async function () {
      const dl = await deadline();
      const sigW = await pqSig(agent, "WITHDRAW", withdrawExtra(await fusd.getAddress(), FUSD(1)), dl);
      await expect(
        vault.connect(agent).withdraw(await fusd.getAddress(), FUSD(1), pubkeyFor(agent.address), sigW, dl)
      ).to.be.revertedWithCustomError(vault, "NotOwner");
      const sigQ = await pqSig(agent, "WITHDRAW", withdrawExtra(await qor.getAddress(), ethers.parseEther("1")), dl);
      await expect(
        vault.connect(agent).withdraw(await qor.getAddress(), ethers.parseEther("1"), pubkeyFor(agent.address), sigQ, dl)
      ).to.be.revertedWithCustomError(vault, "NotOwner");
    });

    it("owner withdraws the spend token with a valid PQ signature", async function () {
      const before = await fusd.balanceOf(owner.address);
      const dl = await deadline();
      const amount = FUSD(500);
      const sig = await pqSig(owner, "WITHDRAW", withdrawExtra(await fusd.getAddress(), amount), dl);
      await expect(
        vault.connect(owner).withdraw(await fusd.getAddress(), amount, pubkeyFor(owner.address), sig, dl)
      )
        .to.emit(vault, "Withdrawn")
        .withArgs(owner.address, await fusd.getAddress(), amount);
      expect(await fusd.balanceOf(owner.address)).to.equal(before + amount);
    });

    it("owner withdraws acquired target token with a valid PQ signature", async function () {
      await vault.connect(agent).executeDca(FUSD(100));
      const dl = await deadline();
      const amount = ethers.parseEther("250");
      const sig = await pqSig(owner, "WITHDRAW", withdrawExtra(await qor.getAddress(), amount), dl);
      await vault.connect(owner).withdraw(await qor.getAddress(), amount, pubkeyFor(owner.address), sig, dl);
      expect(await qor.balanceOf(owner.address)).to.equal(amount);
    });

    it("rejects a withdrawal whose signature binds a different amount", async function () {
      const dl = await deadline();
      const sig = await pqSig(owner, "WITHDRAW", withdrawExtra(await fusd.getAddress(), FUSD(1)), dl);
      await expect(
        vault.connect(owner).withdraw(await fusd.getAddress(), FUSD(2), pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "PqcBadSignature");
    });

    it("rejects a withdrawal of a token that is not part of the pair", async function () {
      const other = await (await ethers.getContractFactory("MockERC20")).deploy("Other", "OTH", 18);
      const dl = await deadline();
      const sig = await pqSig(owner, "WITHDRAW", withdrawExtra(await other.getAddress(), 1n), dl);
      await expect(
        vault.connect(owner).withdraw(await other.getAddress(), 1n, pubkeyFor(owner.address), sig, dl)
      ).to.be.revertedWithCustomError(vault, "InvalidConfig");
    });
  });

  // ------------------------------------------------------------ constructor

  describe("constructor validation", function () {
    it("rejects a daily cap below the per-transaction cap", async function () {
      const Vault = await ethers.getContractFactory("GuardianVault");
      await expect(
        Vault.deploy(
          owner.address, agent.address, await amm.getAddress(),
          await fusd.getAddress(), await qor.getAddress(),
          await mock.getAddress(), await mock.getAddress(),
          PER_TX_CAP, FUSD(50), MIN_INTERVAL, BREAKER_BPS, BREAKER_WINDOW
        )
      ).to.be.revertedWithCustomError(Vault, "InvalidConfig");
    });

    it("rejects a zero breaker threshold", async function () {
      const Vault = await ethers.getContractFactory("GuardianVault");
      await expect(
        Vault.deploy(
          owner.address, agent.address, await amm.getAddress(),
          await fusd.getAddress(), await qor.getAddress(),
          await mock.getAddress(), await mock.getAddress(),
          PER_TX_CAP, DAILY_CAP, MIN_INTERVAL, 0, BREAKER_WINDOW
        )
      ).to.be.revertedWithCustomError(Vault, "InvalidConfig");
    });
  });
});

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy GuardianVault to QoreChain Diana testnet (EVM chain ID 9800).
 * This script REFUSES to run on any other chain.
 *
 *   DEPLOYER_PRIVATE_KEY=0x... AGENT_ADDRESS=0x... AMM_ADDRESS=0x... \
 *   SPEND_TOKEN=0x... TARGET_TOKEN=0x... \
 *   npx hardhat run scripts/deploy.ts --network diana
 *
 * Optional guard parameters (defaults shown):
 *   PER_TX_CAP=100000000        (100 fUSD, 6 decimals)
 *   DAILY_CAP=250000000         (250 fUSD)
 *   MIN_INTERVAL_SEC=3600
 *   BREAKER_THRESHOLD_BPS=1000  (10%)
 *   BREAKER_WINDOW_SEC=14400    (4 h)
 *   OWNER_ADDRESS=0x...         (defaults to the deployer)
 *
 * PREREQUISITES — in this exact order (see README "Bootstrap order"):
 *   1. Fund the deployer (coin-type 60 account) from the faucet:
 *      https://dashboard.qorechain.io/faucet  (paste the qor1... address)
 *   2. Register the deployer's ML-DSA-87 key on the native lane — the
 *      account's FIRST transaction (MsgRegisterPQCKeyV2 + proof of
 *      possession), e.g. via the QoreChain SDK `ensurePqcRegistered`.
 *   3. Open a SCOPED EVM authorisation window for the deployer covering this
 *      deployment (contract creation consumes one window transaction).
 *   4. Only then run this script. Without steps 2–3 the EVM lane rejects the
 *      deployment transaction (pqc codes 26/27/28).
 *   5. After deployment, open the AGENT account's scoped window (targets =
 *      this vault only) with scripts/open-scoped-window.ts, and register the
 *      agent's abstract-account spending rules (docs/ABSTRACT_ACCOUNT_PLAN.md).
 *
 * On Diana the PQC precompiles are fixed chain addresses:
 *   pqcVerify    0x0000000000000000000000000000000000000A01
 *   pqcKeyStatus 0x0000000000000000000000000000000000000A02
 * (verified live on Diana v3.2.8: both are in active_static_precompiles)
 */
const PQC_VERIFY = "0x0000000000000000000000000000000000000A01";
const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000A02";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !ethers.isAddress(v)) {
    throw new Error(`${name} must be set to a valid 0x address (got: ${v ?? "<unset>"})`);
  }
  return v;
}

function bigEnv(name: string, dflt: string): bigint {
  const v = process.env[name] ?? dflt;
  return BigInt(v);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set DEPLOYER_PRIVATE_KEY in the environment."
    );
  }
  const network = await ethers.provider.getNetwork();
  console.log("Deployer:", deployer.address);
  console.log("Chain ID:", network.chainId.toString(), "(expect 9800 = Diana)");
  if (network.chainId !== 9800n) {
    throw new Error("Refusing to deploy: this script targets Diana (9800) only.");
  }
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance (wei):", balance.toString());

  const owner = process.env.OWNER_ADDRESS
    ? requiredEnv("OWNER_ADDRESS")
    : deployer.address;
  const agent = requiredEnv("AGENT_ADDRESS");
  const amm = requiredEnv("AMM_ADDRESS");
  const spendToken = requiredEnv("SPEND_TOKEN");
  const targetToken = requiredEnv("TARGET_TOKEN");

  const perTxCap = bigEnv("PER_TX_CAP", "100000000");
  const dailyCap = bigEnv("DAILY_CAP", "250000000");
  const minIntervalSec = bigEnv("MIN_INTERVAL_SEC", "3600");
  const breakerThresholdBps = bigEnv("BREAKER_THRESHOLD_BPS", "1000");
  const breakerWindowSec = bigEnv("BREAKER_WINDOW_SEC", "14400");

  const Vault = await ethers.getContractFactory("GuardianVault");
  const vault = await Vault.deploy(
    owner,
    agent,
    amm,
    spendToken,
    targetToken,
    PQC_VERIFY,
    PQC_KEY_STATUS,
    perTxCap,
    dailyCap,
    minIntervalSec,
    breakerThresholdBps,
    breakerWindowSec
  );
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const tx = vault.deploymentTransaction();
  const record = {
    network: "qorechain-diana",
    chainId: 9800,
    contract: "GuardianVault",
    address,
    deployTx: tx?.hash ?? null,
    owner,
    agent,
    amm,
    spendToken,
    targetToken,
    pqcVerify: PQC_VERIFY,
    pqcKeyStatus: PQC_KEY_STATUS,
    guard: {
      perTxCap: perTxCap.toString(),
      dailyCap: dailyCap.toString(),
      minIntervalSec: minIntervalSec.toString(),
      breakerThresholdBps: breakerThresholdBps.toString(),
      breakerWindowSec: breakerWindowSec.toString(),
    },
    deployer: deployer.address,
  };
  console.log("GuardianVault deployed to:", address);
  console.log("Deployment tx hash:", tx?.hash ?? "(unknown)");
  console.log("Verify on the explorer: https://explore.qore.network (switch to Testnet)");
  console.log(JSON.stringify(record, null, 2));

  const outPath = path.join(__dirname, "..", "deployments.testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n");
  console.log("Wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

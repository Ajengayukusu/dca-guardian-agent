import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

// QoreChain Diana testnet: EVM chain ID 9800, RPC https://evm-testnet.qore.host
// NOTE: deploying to Diana additionally requires, on the deployer account:
//   1. an ML-DSA-87 key registered on the native lane (first tx of the account), and
//   2. an open *scoped* EVM authorisation window whose allowed targets include the
//      agent account's vault transactions (for the agent key: vault only).
// The scoped window for the agent is opened with scripts/open-scoped-window.ts,
// which follows the official Workshop-1 hybrid pattern. Keys come from the
// environment only; never commit them.
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    diana: {
      url: "https://evm-testnet.qore.host",
      chainId: 9800,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;

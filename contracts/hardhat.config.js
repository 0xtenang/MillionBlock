require("@nomicfoundation/hardhat-toolbox");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.28";

// Use the solc-js compiler shipped in node_modules when it matches, so builds
// work offline / behind proxies that block binaries.soliditylang.org.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    const solc = require("solc");
    if (solc.version().startsWith(SOLC_VERSION)) {
      return {
        compilerPath: path.join(path.dirname(require.resolve("solc")), "soljson.js"),
        isSolcJs: true,
        version: args.solcVersion,
        longVersion: solc.version(),
      };
    }
  }
  return runSuper();
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
    robinhood: {
      url: process.env.ROBINHOOD_RPC || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
  },
};

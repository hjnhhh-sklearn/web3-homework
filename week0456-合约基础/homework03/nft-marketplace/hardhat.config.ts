import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import { config } from "@chainlink/env-enc"
config()

const SEPOLIA_URL = process.env.SEPOLIA_URL!
const PRIVATE_KEY1 = process.env.PRIVATE_KEY1!
const PRIVATE_KEY2 = process.env.PRIVATE_KEY2!
const PRIVATE_KEY3 = process.env.PRIVATE_KEY3!
const PRIVATE_KEY4 = process.env.PRIVATE_KEY4!
const PRIVATE_KEY5 = process.env.PRIVATE_KEY5!

if (!PRIVATE_KEY1 || !PRIVATE_KEY2 || !PRIVATE_KEY3 || !PRIVATE_KEY4 || !PRIVATE_KEY5) {
  throw new Error("PRIVATE_KEY 环境变量未设置");
}

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1"
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: SEPOLIA_URL || "",
      accounts: [PRIVATE_KEY1, PRIVATE_KEY2, PRIVATE_KEY3, PRIVATE_KEY4, PRIVATE_KEY5],
      timeout: 120000,
      httpHeaders: {}
    },
  },
});

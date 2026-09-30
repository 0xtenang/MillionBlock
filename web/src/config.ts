import { createConfig, http } from "wagmi";
import { defineChain, type Address, type Chain } from "viem";
import { injected } from "wagmi/connectors";
import deployments from "./deployments.json";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" } },
  testnet: true,
});

export const localhost = defineChain({
  id: 31337,
  name: "Localhost",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const env = import.meta.env;
const chains: Record<number, Chain> = { 4663: robinhood, 46630: robinhoodTestnet, 31337: localhost };

export const CHAIN: Chain = chains[Number(env.VITE_CHAIN_ID ?? 4663)] ?? robinhood;
const rpcUrl: string = env.VITE_RPC_URL || CHAIN.rpcUrls.default.http[0];

const deployment = (deployments as Record<string, { address: Address; deployBlock: number }>)[String(CHAIN.id)];
export const CONTRACT: Address | undefined = (env.VITE_CONTRACT_ADDRESS as Address | undefined) || deployment?.address;
export const DEPLOY_BLOCK = BigInt(env.VITE_DEPLOY_BLOCK ?? deployment?.deployBlock ?? 0);
export const LOG_CHUNK = BigInt(env.VITE_LOG_CHUNK ?? 50_000);

export const GRID = 1000;
export const PRIMARY_PRICE = 400_000_000_000_000n; // 0.0004 ETH
export const FEE_BPS = 200n;
export const MAX_BLOCKS_PER_TX = 400;
export const MAX_TRADE_BATCH = 200;

export const explorer = CHAIN.blockExplorers?.default.url;

export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: { [CHAIN.id]: http(rpcUrl) },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}

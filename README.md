# MillionBlock

**The Million Dollar Homepage, crypto-native, on Robinhood Chain.**

1,000,000 blocks on a 1000 × 1000 grid. Every block is an on-chain asset (ERC-721). Projects buy blocks, put their image, website and token on them, and trade them. The grid becomes a living map of the Robinhood Chain ecosystem, and what each spot on it is worth.

| | |
|---|---|
| Blocks | 1,000,000 (tokenId = `y * 1000 + x`) |
| Primary price | **0.0004 ETH** per block, minted straight from the protocol |
| Secondary market | Built in, NFT-style listings, **2% protocol fee** per sale |
| Content | Image (https / ipfs / ar / data URI), website, title, token or project address |
| Royalties | ERC-2981 at 2% to the treasury, for external marketplaces |
| Chain | Robinhood Chain mainnet `4663`, testnet `46630` (Arbitrum Orbit L2, ETH gas) |

## Special blocks (fixed forever)

A few positions are naturally scarce. The rules live in the contract as a pure function, `tierOf(tokenId)`. There is no admin function that can add, remove or re-tier blocks, and every tier costs the same 0.0004 ETH to mint. The market decides what they're worth.

| Tier | Blocks | Rule |
|---|---|---|
| 👑 Genesis | 100 | Token #1 – #100 (top row, next to the top-left corner). #1 is "The First Block" |
| 🔥 Center | 10,000 | The middle 100×100 square: x and y from 450 to 549 |
| ⭐ Corner | 4 | #0, #999, #999000, #999999 |

The tier shows up in `getBlocks`, in the NFT name (e.g. "MillionBlock #1 Genesis"), as a `tier` trait, and in the placeholder artwork. On the website, tiers get their own map borders, badges and Market stats.

## What users can do

- **Buy blocks**: drag a rectangle on the map (up to 20×20 = 400 blocks per tx) and mint at 0.0004 ETH each. Content can be published in the same transaction.
- **Upload image / attach website / represent a token**: owners publish content on any rectangle they fully own. It is stored once and every block in the rectangle points to it.
- **Sell blocks**: list any owned block at any price. No approvals needed. Listings clear automatically if the block is transferred.
- **Buy from others**: buy one or many listed blocks in one tx. The seller gets 98%, the protocol keeps 2%, and any overpayment is refunded.
- **Watch market value**: every sale updates the block's last price. The app shows per-block price history, per-project value, a price index, floor, volume, and a **Heatmap** view of the whole grid.

> **New to deploying?** Follow [DEPLOY.md](DEPLOY.md). It walks through deploying from the browser with Remix and MetaMask, then hosting on Vercel, with no terminal needed.

## Repo layout

```
contracts/   Hardhat project: MillionBlock.sol, tests, deploy + seed scripts
             flat/MillionBlock_flat.sol = single-file copy for Remix
web/         Vite + React + wagmi/viem dApp (canvas map, trading panel, market page)
```

## Contract: `contracts/contracts/MillionBlock.sol`

Main functions:

| Function | Description |
|---|---|
| `mint(x, y, w, h)` | Buy an empty rectangle. `msg.value` must equal `w*h*0.0004 ETH` |
| `mintAndSetContent(x, y, w, h, image, url, title, token)` | Buy and publish in one tx |
| `setContent(x, y, w, h, image, url, title, token)` | Publish on a rectangle you fully own |
| `list(ids[], prices[])` / `delist(ids[])` | Manage listings (≤200 per tx) |
| `buy(ids[])` | Buy listed blocks: 2% fee to protocol, 98% to seller, excess refunded |
| `getBlocks(ids[])`, `getContent(id)`, `contentIdOf(id)` | Batch views |
| `tokenURI(id)` | Fully on-chain JSON metadata (falls back to an SVG placeholder) |
| `withdrawProtocol()` | Sends primary revenue + fees to `treasury` (starts as `0x3c8A4d94B3219F6633F2cC94094f4765b30c691C`, owner can change it with `setTreasury`) |
| `moderate(contentId, hidden)` | Owner-only: hide abusive content from the app and tokenURI |
| `withdrawPending()` | Pull fallback for sellers whose address rejected a direct ETH payment |

Design notes:
- Content ids are packed 8 per storage slot, so publishing on a large rectangle stays cheap. A full 20×20 mint plus content costs about 11.7M gas, well under the L2 per-tx limit.
- `buy` settles every transfer before any ETH is sent, and runs under `nonReentrant`. If a seller rejects a payment, the amount is credited to them instead of blocking the sale.
- The primary price (0.0004 ETH), the 2% fee and the 1,000,000-block supply are constants.

### Build, test, deploy

```bash
cd contracts
npm install
npm test                        # 17 tests

# local chain + demo data
npm run node                    # terminal 1
npm run deploy:local            # terminal 2, writes web/src/deployments.json
npm run seed:local              # optional demo projects + trades

# Robinhood Chain
export PRIVATE_KEY=0x...        # deployer (becomes contract owner)
npm run deploy:testnet          # chain 46630
npm run deploy:mainnet          # chain 4663
```

The deploy script records `{address, deployBlock}` per chain in `web/src/deployments.json`, which the web app reads. After changing the contract, run `npm run abi` to regenerate `web/src/abi.ts` and `npm run flatten` to regenerate the Remix file.

> The Hardhat config uses the `solc` npm package (0.8.28) as the compiler, so it builds without downloading from binaries.soliditylang.org.

## Web app

```bash
cd web
npm install
cp .env.example .env.local      # set VITE_CHAIN_ID (4663 / 46630 / 31337)
npm run dev
npm run build                   # static site in dist/, deploy anywhere (Vercel, Netlify, IPFS…)
```

Features:
- **Map**: pan and zoom a canvas of all 1,000,000 blocks with published images drawn in place. Drag to select, click for details, hover for owner and price. There are three views: Map, Heatmap (market value; listed blocks shown in blue) and Owners (your blocks highlighted).
- **Side panel**: mint, publish or edit content, list, delist and buy, with price-history sparkline, owner and explorer links.
- **Market**: KPIs (minted, map value, floor, volume, holders, fees), a price index chart, an ecosystem directory of projects ranked by the value of their blocks, open listings and recent sales. Click any row to fly to that spot on the map.
- Wallet: any injected wallet (MetaMask, Rabby, Coinbase, Robinhood Wallet browser…). The app prompts the user to switch to or add Robinhood Chain.

State comes from a client-side indexer (`web/src/store.ts`) that replays the contract's events into typed arrays and polls for new ones every 4s. That works well at launch. As volume grows, point the same data shape at a hosted indexer (Ponder, Goldsky, The Graph) so clients don't replay the full history.

## Before mainnet

- Get an external audit of `MillionBlock.sol`.
- The deployer wallet becomes the owner (moderation + `setTreasury`). Use a secure wallet, and consider `transferOwnership` to a multisig after launch.
- Decide on a content moderation policy. `moderate()` hides content in the official app and in `tokenURI`, but the raw data stays on-chain.

# Deploying MillionBlock to Robinhood Chain mainnet: beginner guide

This guide deploys the contract from your browser with **Remix** and **MetaMask**, then puts the website on **Vercel**. You don't need a terminal or any coding. Plan on about 20 minutes.

> ⚠️ **This is mainnet: real money.** Deploying costs a small amount of real ETH for gas, usually well under $1 on Robinhood Chain. Once people start buying blocks, the contract holds real funds, so read the "Before you announce it" section at the end.

Key facts about the contract:
- **Treasury** (receives all mint revenue, the 2% marketplace fee and 2% royalties): `0x3c8A4d94B3219F6633F2cC94094f4765b30c691C`. This address is built into the contract.
- **Owner** is the wallet that deploys. The owner can hide abusive content and change the treasury later with `setTreasury`.
- The deploy takes **no inputs**. You just press Deploy.

---

## Part A: Wallet

### 1. MetaMask
Install it from https://metamask.io if you don't have it. Deploy from a wallet you control and keep safe, because it becomes the contract **owner**.

### 2. Add Robinhood Chain to MetaMask
In MetaMask go to **Networks → Add network → Add a network manually**:

| Field | Value |
|---|---|
| Network name | `Robinhood Chain` |
| RPC URL | `https://rpc.mainnet.chain.robinhood.com` |
| Chain ID | `4663` |
| Currency symbol | `ETH` |
| Block explorer | `https://robinhoodchain.blockscout.com` |

Or use https://chainlist.org/chain/4663 and click **Add to MetaMask**.

> **If the RPC is blocked where you are** (the balance never loads, or transactions hang), create a free Robinhood Chain **mainnet** endpoint at [QuickNode](https://www.quicknode.com/chains/robinhood) or Alchemy. Put that URL in the **RPC URL** field instead, and use it as `VITE_RPC_URL` in Vercel (step 10).

### 3. Get a little ETH onto Robinhood Chain
You need about **$2–5 worth of ETH** on Robinhood Chain. That's plenty for the deploy and a few test mints.

Bridge it from Base, Arbitrum or Ethereum using a fast bridge. **Type the address yourself**; don't click links from ads or DMs.
- **Relay**: https://relay.link/bridge/robinhood
- **Across**: https://across.to

Connect MetaMask, set **To: Robinhood Chain**, choose **ETH**, enter the amount and confirm. It usually arrives within seconds. Then check that MetaMask (on the Robinhood Chain network) shows the balance.

---

## Part B: Deploy the contract with Remix

### 4. Copy the contract code
1. On GitHub, open `contracts/flat/MillionBlock_flat.sol` on the `claude/millionblock-robinhood-nft-7ma3s8` branch (or `main` once merged).
2. Click **Copy raw file** (the two-squares icon at the top right of the file).

### 5. Paste it into Remix
1. Open https://remix.ethereum.org.
2. In the **File explorer**, right-click the `contracts` folder, choose **New File**, and name it `MillionBlock.sol`.
3. Paste the code. If you made a file in an earlier attempt, delete all of its content first and paste the new version, because the contract has changed.

### 6. Compile
1. Click the **Solidity compiler** icon (the "S" logo) in the left sidebar.
2. **Compiler**: `0.8.28`.
3. Open **Advanced Configurations** and tick ✅ **Enable optimization** (runs `200`). **This is required**; without it the contract is too big to deploy.
4. Click **Compile MillionBlock.sol** and wait for the green ✅. Yellow warnings are fine.

### 7. Deploy
1. Click the **Deploy & run transactions** icon (the Ethereum logo with an arrow).
2. **Environment**: **Injected Provider - MetaMask**. Connect your wallet.
   - It must say **`Custom (4663) network`**. If it shows another number, switch MetaMask to Robinhood Chain.
3. **Contract**: choose exactly **`MillionBlock - contracts/MillionBlock.sol`**. The file contains many contracts, so check the name carefully.
4. Click the orange **Deploy** button. There are no inputs to fill in.
5. MetaMask shows the gas fee, which should be a few cents. Click **Confirm**.
6. Wait for the green ✅ in the Remix console at the bottom.

### 8. Check it and write down two values
Under **Deployed Contracts**, expand `MILLIONBLOCK AT 0x…` and click these blue buttons:
- `treasury` should show `0x3c8A4d94B3219F6633F2cC94094f4765b30c691C`.
- `owner` should show your wallet address.
- `PRIMARY_PRICE` should show `400000000000000` (0.0004 ETH).
- `tierOf` with `1` should show `1` (Genesis). With `500500` it should show `2` (Center), and with `0` it should show `3` (Corner).

Then write down:
- **Contract address**: click the copy icon next to `MILLIONBLOCK AT 0x…`.
- **Deploy block number**: click the green ✅ line in the Remix console and find **`blockNumber`**. You can also search the contract address on https://robinhoodchain.blockscout.com and open the "Contract creation" transaction.

---

## Part C: Put the website on Vercel

### 9. Create the project
1. Sign in at https://vercel.com with GitHub.
2. Click **Add New… → Project** and import the `MillionBlock` repository.
3. **Root Directory**: click **Edit** and select **`web`**. This setting is important.
4. Framework preset: **Vite**. Leave the build settings as they are.

### 10. Environment variables
| Key | Value |
|---|---|
| `VITE_CHAIN_ID` | `4663` |
| `VITE_CONTRACT_ADDRESS` | your contract address from step 8 |
| `VITE_DEPLOY_BLOCK` | your deploy block number from step 8 |
| `VITE_RPC_URL` | *(optional)* your QuickNode/Alchemy URL, if the public RPC is blocked or slow |

### 11. Deploy
Click **Deploy**. You get a URL like `millionblock-xyz.vercel.app`.

> If the branch isn't merged into `main` yet, go to **Settings → Git** and set the production branch to `claude/millionblock-robinhood-nft-7ma3s8`.
> If you change a variable later, go to **Deployments → ⋯ → Redeploy**. Variables are built into the site at build time.

---

## Part D: First test (costs a few cents)

1. Open the site and click **Connect wallet**.
2. Click **one** empty block. Add an image URL, a website and a title, then **Mint** for 0.0004 ETH.
3. Within about 5 seconds it appears on the map.
4. To collect revenue, anyone can call `withdrawProtocol` in Remix. It always sends the funds to the treasury address, never to the caller.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| *"contract code size exceeds 24576 bytes"* / deploy fails instantly | Tick **Enable optimization** in step 6 and compile again. |
| *"Gas estimation failed"* | Check that MetaMask is on Robinhood Chain (4663), the wallet has ETH on Robinhood Chain (not on Base or Ethereum), and you picked **MillionBlock** in the dropdown. |
| Deploy asks for inputs `INITIALOWNER` / `TREASURY_` | You pasted an old version of the contract. Copy the file from GitHub again. |
| "invalid opcode" type error | In Advanced Configurations set **EVM version** to `shanghai`, compile again, and deploy again. |
| Website: "No MillionBlock contract configured" | `VITE_CONTRACT_ADDRESS` is missing or misspelled. Fix it and redeploy. |
| Website: "Indexer" error | The public RPC is refusing requests. Set `VITE_RPC_URL` to a QuickNode or Alchemy mainnet URL and redeploy. |
| Map loads slowly | `VITE_DEPLOY_BLOCK` is missing. |

---

## Before you announce it

- **Audit.** The contract has 13 passing automated tests but no professional audit yet. Consider one, or at least a review, before large amounts of money flow through it.
- **Owner key safety.** Your deploy wallet is the owner. You can move ownership to a Safe multisig later: call `transferOwnership(<safe address>)` in Remix.
- **Verify the source** on Blockscout so users can read the code. On the contract's Blockscout page choose **Verify & Publish**, select Solidity single-file, compiler `0.8.28`, optimization **Yes, 200 runs**, and paste `MillionBlock_flat.sol`.
- **The constants are permanent:** 0.0004 ETH per block, the 2% fee, 1,000,000 blocks and the special tiers (Genesis #1–#100, Center 100×100, 4 Corners) can never be changed. Only the treasury address can change, through `setTreasury`.

# Deploying MillionBlock: beginner guide

This guide deploys the contract from your browser with **Remix** and **MetaMask**, then puts the website on **Vercel**. You don't need a terminal or any coding. Plan on about 20 minutes.

We start on **testnet**, where the ETH is free test ETH. Once everything works you repeat the same steps on mainnet.

---

## Part A: Set up your wallet

### 1. Install MetaMask
Get the browser extension from https://metamask.io and create a wallet.

> **Use a separate account for testing.** In MetaMask, click the account name at the top, then **Add account**, and call it `MillionBlock Test`.

### 2. Add Robinhood Chain Testnet to MetaMask
The easiest way is to open https://faucet.testnet.chain.robinhood.com/add-chain and approve the popup.

Or add it by hand: in MetaMask go to **Networks → Add network → Add a network manually** and enter:

| Field | Value |
|---|---|
| Network name | Robinhood Chain Testnet |
| RPC URL | `https://rpc.testnet.chain.robinhood.com` |
| Chain ID | `46630` |
| Currency symbol | `ETH` |
| Block explorer | `https://explorer.testnet.chain.robinhood.com` |

### 3. Get free test ETH
Open https://faucet.testnet.chain.robinhood.com, paste your wallet address (click your account name in MetaMask to copy it), and request ETH. Wait until it shows up in MetaMask while the testnet network is selected.

---

## Part B: Deploy the contract with Remix

### 4. Copy the contract code
1. On GitHub, open the repo and go to `contracts/flat/MillionBlock_flat.sol`. Switch to the `claude/millionblock-robinhood-nft-7ma3s8` branch if it isn't merged yet.
2. Click the **Copy raw file** button (the two-squares icon at the top right of the file).

> This is the whole contract, with its OpenZeppelin dependencies, in one file, so Remix doesn't need to download anything else.

### 5. Paste it into Remix
1. Open https://remix.ethereum.org.
2. In the left **File explorer**, right-click the `contracts` folder, choose **New File**, and name it `MillionBlock.sol`.
3. Paste the code into the editor. Remix saves it automatically.

### 6. Compile
1. Click the **Solidity compiler** icon in the left sidebar (the "S" logo).
2. **Compiler**: choose `0.8.28` (any `0.8.24` or higher works).
3. Open **Advanced Configurations**:
   - ✅ Tick **Enable optimization** and leave runs at `200`. **This is required.** Without it the contract is too big to deploy.
   - Leave **EVM version** on `default` (or pick `cancun`).
4. Click **Compile MillionBlock.sol**. A green check ✅ on the sidebar icon means success. Yellow warnings are fine.

### 7. Deploy
1. Click the **Deploy & run transactions** icon (the Ethereum logo with an arrow).
2. **Environment**: choose **Injected Provider - MetaMask**. MetaMask pops up; connect your `MillionBlock Test` account.
   - Under Environment it should now say something like `Custom (46630) network`. If it shows another number, switch MetaMask to Robinhood Chain Testnet.
3. **Contract**: open the dropdown and choose **`MillionBlock - contracts/MillionBlock.sol`**.
   > The file contains many contracts (ERC721, Ownable, …). Make sure you pick the one named exactly **MillionBlock**.
4. Click the small **⌄ arrow** next to the orange **Deploy** button to show the two inputs:
   - `INITIALOWNER`: your wallet address. This account can moderate content and change the treasury.
   - `TREASURY_`: the address that receives mint revenue and the 2% fees. Use your own address for testing.
5. Click **transact**, then **Confirm** in MetaMask.
6. After a few seconds the Remix console (bottom panel) shows a green ✅ line.

### 8. Write down two values
You need both for the website.

- **Contract address**: under **Deployed Contracts** at the bottom of the Deploy panel, click the copy icon next to `MILLIONBLOCK AT 0x…`.
- **Deploy block number**: in the Remix console, click the green ✅ transaction line to expand it and find **`blockNumber`**. You can also paste the contract address into https://explorer.testnet.chain.robinhood.com and look at the "Contract creation" transaction.

Example:
```
Contract address:  0x1234...abcd
Deploy block:      8123456
```

### 9. (Optional) Quick check in Remix
Under **Deployed Contracts**, expand your contract and click the blue `PRIMARY_PRICE` button. It should show `400000000000000` (0.0004 ETH in wei). `GRID_SIZE` should show `1000`.

---

## Part C: Put the website on Vercel

### 10. Create the Vercel project
1. Sign in at https://vercel.com with GitHub.
2. Click **Add New… → Project** and import the `MillionBlock` repository.
3. **Root Directory**: click **Edit** and select **`web`**. This setting is important.
4. Framework preset should say **Vite**. Leave the build settings as they are.
5. Open **Environment Variables** and add these three:

| Key | Value |
|---|---|
| `VITE_CHAIN_ID` | `46630` |
| `VITE_CONTRACT_ADDRESS` | your contract address from step 8 |
| `VITE_DEPLOY_BLOCK` | your deploy block number from step 8 |

6. Click **Deploy**. After about a minute you get a URL like `millionblock-xyz.vercel.app`.

> If the branch isn't merged into `main` yet: go to **Project → Settings → Git** and set the production branch to `claude/millionblock-robinhood-nft-7ma3s8`, or open the branch's preview deployment.
>
> If you change an environment variable later, go to **Deployments → ⋯ → Redeploy**. The values are built into the site at build time.

---

## Part D: Test it

1. Open your Vercel URL and click **Connect wallet**.
2. Drag a small rectangle on the map, for example 3×3.
3. Fill in an image URL (any public `https://…png` works), a website and a title, then click **Mint**. It costs 9 × 0.0004 = 0.0036 test ETH.
4. Within about 5 seconds your image appears on the map.
5. Click one of your blocks, enter a price under **Sell this block**, and click **List for sale**.
6. To test buying: create a second MetaMask account, get faucet ETH for it, switch to it, click your listed block, and click **Buy**. The seller receives 98% and the Market page shows the sale.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Remix: *"contract code size exceeds 24576 bytes"* or deploy fails immediately | Tick **Enable optimization** in step 6 and compile again. |
| Remix: *"Gas estimation failed"* | Check that MetaMask is on Robinhood Chain Testnet, the account has test ETH, and you picked **MillionBlock** in the contract dropdown. |
| Deploy fails with an "invalid opcode" type error | In Advanced Configurations set **EVM version** to `shanghai`, compile again, and deploy again. |
| Website shows "No MillionBlock contract configured" | The `VITE_CONTRACT_ADDRESS` variable is missing or misspelled. Fix it in Vercel and redeploy. |
| Website shows an "Indexer" error | The public RPC is refusing requests. Create a free Robinhood Chain Testnet RPC URL at Alchemy, add it as `VITE_RPC_URL` in Vercel, and redeploy. |
| Map loads slowly | `VITE_DEPLOY_BLOCK` is missing, so the app scans the chain from block 0. Set it. |

---

## Going to mainnet later

Repeat Parts B and C with these changes:
- In MetaMask use **Robinhood Chain** mainnet: RPC `https://rpc.mainnet.chain.robinhood.com`, chain ID `4663`, explorer `https://robinhoodchain.blockscout.com`. You need real ETH for gas.
- Use a secure wallet, ideally a multisig such as Safe, for `INITIALOWNER` and `TREASURY_`. Don't use your test account.
- Create a new Vercel project (or update the existing one) with `VITE_CHAIN_ID=4663` and the mainnet contract address and deploy block.
- Get the contract audited before real money goes into it.

// Deploys MillionBlock and records the address for the web app.
//   npx hardhat run scripts/deploy.js --network robinhoodTestnet
// Env: PRIVATE_KEY (deployer), TREASURY (optional, defaults to deployer)
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = process.env.TREASURY || deployer.address;
  const { chainId } = await ethers.provider.getNetwork();

  console.log(`Deploying MillionBlock to ${network.name} (${chainId}) from ${deployer.address}`);
  const MB = await ethers.getContractFactory("MillionBlock");
  const mb = await MB.deploy(deployer.address, treasury);
  const receipt = await mb.deploymentTransaction().wait();
  const address = await mb.getAddress();
  console.log(`MillionBlock: ${address} (block ${receipt.blockNumber}), treasury ${treasury}`);

  const file = path.join(__dirname, "..", "..", "web", "src", "deployments.json");
  const deployments = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  deployments[chainId.toString()] = { address, deployBlock: receipt.blockNumber };
  fs.writeFileSync(file, JSON.stringify(deployments, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// Seeds a local node with demo projects so the map isn't empty.
//   npx hardhat run scripts/seed.js --network localhost
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const PRICE = ethers.parseEther("0.0004");
const DEMO = [
  { x: 480, y: 480, w: 20, h: 20, title: "Robinhood Chain", url: "https://robinhood.com", color: "#c3f53c", token: "0x1111111111111111111111111111111111111111" },
  { x: 100, y: 120, w: 20, h: 10, title: "Degen DEX", url: "https://example.com/dex", color: "#ff5b2e", token: "0x2222222222222222222222222222222222222222" },
  { x: 700, y: 200, w: 15, h: 15, title: "USDG Vault", url: "https://example.com/vault", color: "#3cb4f5", token: "0x3333333333333333333333333333333333333333" },
  { x: 300, y: 760, w: 10, h: 10, title: "Hood Frogs", url: "https://example.com/frogs", color: "#8f5bff", token: "0x4444444444444444444444444444444444444444" },
  { x: 520, y: 440, w: 12, h: 8, title: "Pons Launchpad", url: "https://example.com/pons", color: "#ffd24a", token: "0x5555555555555555555555555555555555555555" },
  { x: 1, y: 0, w: 10, h: 1, title: "Genesis Club", url: "https://example.com/genesis", color: "#ff3c8c", token: ethers.ZeroAddress },
];

const svg = (text, color) =>
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><rect width='200' height='200' fill='${color}'/><text x='100' y='112' font-family='sans-serif' font-weight='700' font-size='22' text-anchor='middle' fill='#0b0f0c'>${text}</text></svg>`
  ).toString("base64");

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const deployments = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "web", "src", "deployments.json"), "utf8"));
  const mb = await ethers.getContractAt("MillionBlock", deployments[chainId.toString()].address);
  const signers = await ethers.getSigners();

  for (const [i, d] of DEMO.entries()) {
    const s = signers[i + 1];
    await (await mb.connect(s).mintAndSetContent(d.x, d.y, d.w, d.h, svg(d.title, d.color), d.url, d.title, d.token, { value: PRICE * BigInt(d.w * d.h) })).wait();
    console.log(`Seeded ${d.title}`);
  }
  // A few secondary listings + sales so the market view has data.
  const ids = [480 * 1000 + 480, 480 * 1000 + 481, 480 * 1000 + 482];
  await (await mb.connect(signers[1]).list(ids, ids.map(() => ethers.parseEther("0.002")))).wait();
  await (await mb.connect(signers[6]).buy([ids[0]], { value: ethers.parseEther("0.002") })).wait();
  await (await mb.connect(signers[1]).list([481 * 1000 + 490], [ethers.parseEther("0.003")])).wait();
  // A few flips so "Most valuable blocks" has entries (Genesis #1 goes for a premium).
  const g = signers[6];
  await (await mb.connect(g).list([1], [ethers.parseEther("0.5")])).wait();
  await (await mb.connect(signers[7]).buy([1], { value: ethers.parseEther("0.5") })).wait();
  await (await mb.connect(signers[2]).list([120 * 1000 + 105], [ethers.parseEther("0.03")])).wait();
  await (await mb.connect(signers[8]).buy([120 * 1000 + 105], { value: ethers.parseEther("0.03") })).wait();
  console.log("Seeded market activity");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

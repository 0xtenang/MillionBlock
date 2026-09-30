// Writes flat/MillionBlock_flat.sol: a single-file copy of the contract that
// can be pasted into Remix (https://remix.ethereum.org) and deployed from the browser.
// The result is compiled with the same settings Remix needs (optimizer on) as a sanity check.
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const solc = require("solc");

// Redirect to a file: piping hardhat's stdout can truncate large output.
const tmp = path.join(os.tmpdir(), `mb-flat-${process.pid}.sol`);
execSync(`npx hardhat flatten contracts/MillionBlock.sol > "${tmp}"`, { stdio: ["ignore", "ignore", "inherit"], shell: true });
const raw = fs.readFileSync(tmp, "utf8");
fs.unlinkSync(tmp);

let spdx = false;
let pragma = false;
const lines = raw.split("\n").filter((l) => {
  if (l.includes("SPDX-License-Identifier")) return spdx ? false : (spdx = true);
  if (l.startsWith("pragma solidity")) return pragma ? false : (pragma = true);
  return true;
});
const source =
  "// Single-file version of contracts/MillionBlock.sol for Remix (regenerate with `npm run flatten`).\n" +
  lines.join("\n").replace(/^pragma solidity .*;$/m, "pragma solidity ^0.8.24;");

const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "MillionBlock.sol": { content: source } },
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { MillionBlock: ["evm.deployedBytecode.object"] } } },
    })
  )
);
const errors = (out.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  errors.forEach((e) => console.error(e.formattedMessage));
  throw new Error("Flattened contract does not compile; not writing it.");
}
const size = out.contracts["MillionBlock.sol"].MillionBlock.evm.deployedBytecode.object.length / 2;

const file = path.join(__dirname, "..", "flat", "MillionBlock_flat.sol");
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, source);
console.log(`Wrote ${file} (compiles, ${size} bytes deployed, limit 24576)`);

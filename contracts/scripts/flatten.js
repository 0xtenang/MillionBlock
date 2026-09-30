// Writes flat/MillionBlock_flat.sol: a single-file copy of the contract that
// can be pasted into Remix (https://remix.ethereum.org) and deployed from the browser.
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const raw = execSync("npx hardhat flatten contracts/MillionBlock.sol", { maxBuffer: 64 * 1024 * 1024 }).toString();
let spdx = false;
let pragma = false;
const lines = raw.split("\n").filter((l) => {
  if (l.includes("SPDX-License-Identifier")) return spdx ? false : (spdx = true);
  if (l.startsWith("pragma solidity")) return pragma ? false : (pragma = true);
  return true;
});
const out = path.join(__dirname, "..", "flat", "MillionBlock_flat.sol");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  "// Single-file version of contracts/MillionBlock.sol for Remix (regenerate with `npm run flatten`).\n" +
    lines.join("\n").replace(/^pragma solidity .*;$/m, "pragma solidity ^0.8.24;")
);
console.log(`Wrote ${out}`);

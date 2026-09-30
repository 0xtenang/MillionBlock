// Writes the MillionBlock ABI into the web app as a typed const.
const fs = require("fs");
const path = require("path");
const artifact = require("../artifacts/contracts/MillionBlock.sol/MillionBlock.json");
const out = path.join(__dirname, "..", "..", "web", "src", "abi.ts");
fs.writeFileSync(
  out,
  "// Generated from contracts/artifacts — run `npm run abi` in /contracts after changing the contract.\nexport const millionBlockAbi = " +
    JSON.stringify(artifact.abi, null, 2) +
    " as const;\n"
);
console.log(`Wrote ${out}`);

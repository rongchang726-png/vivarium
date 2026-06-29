/*
 * Vivarium — headless test runner.
 *
 * Loads the DOM-free simulation core the same way the browser does (classic
 * scripts sharing one global scope) by concatenating the source files and the
 * verification driver, then executing the bundle in a single Node `vm` context.
 *
 *   node test/sim.test.js [ticks]
 *
 * Exits non-zero if any check fails, so it doubles as a CI smoke test.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const coreFiles = ["config", "util", "biome", "genome", "brain", "food", "creature", "world"].map((f) =>
  path.join(root, "src", f + ".js"),
);
const driverFile = path.join(__dirname, "driver.js");

const ticks = parseInt(process.argv[2] || "20000", 10);

let src = "var TEST_TICKS = " + ticks + ";\n";
for (const f of coreFiles) src += fs.readFileSync(f, "utf8") + "\n";
src += fs.readFileSync(driverFile, "utf8");

const sandbox = { console };
vm.createContext(sandbox);

try {
  vm.runInContext(src, sandbox, { filename: "vivarium-bundle.js" });
} catch (e) {
  console.error("\nTEST ERROR:", (e && e.stack) || e);
  process.exit(1);
}

if (sandbox.__FAILED) {
  console.error("\nVERIFICATION FAILED");
  process.exit(1);
}
console.log("\nALL CHECKS PASSED");

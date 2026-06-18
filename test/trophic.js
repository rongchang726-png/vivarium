/*
 * Vivarium — trophic-structure diagnostic.
 *
 * The population average diet hides everything that matters about a food web, so
 * this prints the full diet *distribution* (five bins) over time, plus the
 * predation rate. What I'm looking for is BIMODALITY: a peak of herbivores near
 * diet 0 AND a peak of carnivores near diet 1, coexisting — that's a real food
 * web, as opposed to a single blob of omnivores.
 *
 *   node test/trophic.js [ticks] [seed]
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = ["config", "util", "genome", "brain", "food", "creature", "world"].map((f) =>
  path.join(root, "src", f + ".js"),
);
let core = "";
for (const f of files) core += fs.readFileSync(f, "utf8") + "\n";

const ticks = parseInt(process.argv[2] || "12000", 10);
const seed = parseInt(process.argv[3] || "7", 10);

const sandbox = { console, Math };
vm.createContext(sandbox);
vm.runInContext(core, sandbox, { filename: "core.js" });

const driver = `
const w = new World({ seed: ${seed} });
const TICKS = ${ticks};
let predWin = 0;

function hist() {
  const b = [0, 0, 0, 0, 0]; // diet bins: <.2 .2-.4 .4-.6 .6-.8 >.8
  for (const c of w.creatures) {
    let i = (c.diet * 5) | 0;
    if (i > 4) i = 4;
    b[i]++;
  }
  return b;
}

console.log(' tick   pop | herb<.2  .2-.4  .4-.6  .6-.8  carn>.8 | kills/k maxGen');
console.log(' ----- ---- | -------  -----  -----  -----  ------- | ------- ------');
for (let t = 0; t <= TICKS; t++) {
  if (t % 1000 === 0) {
    w.computeStats();
    const h = hist();
    console.log(
      ' ' + String(w.tick).padStart(5) + ' ' + String(w.stats.pop).padStart(4) + ' | ' +
      String(h[0]).padStart(7) + ' ' + String(h[1]).padStart(6) + ' ' +
      String(h[2]).padStart(6) + ' ' + String(h[3]).padStart(6) + ' ' +
      String(h[4]).padStart(8) + ' | ' +
      String(predWin).padStart(7) + ' ' + String(w.stats.maxGen).padStart(6)
    );
    predWin = 0;
  }
  if (t < TICKS) {
    w.step();
    predWin += w.predationsThisTick;
  }
}
`;

try {
  vm.runInContext(driver, sandbox, { filename: "trophic.js" });
} catch (e) {
  console.error("TROPHIC ERROR:", (e && e.stack) || e);
  process.exit(1);
}

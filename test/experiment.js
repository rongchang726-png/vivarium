/*
 * Vivarium — ecology experiment.
 *
 * Not a pass/fail test: a sweep that asks "what makes a predator guild actually
 * persist?" It runs the core under several configurations and reports diet,
 * population, and — crucially — the real *predation rate* (kills per 1000 ticks),
 * since with a meat-floor predation can happen well below the diet>0.5 line.
 *
 *   node test/experiment.js
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

const sandbox = { console, Math };
vm.createContext(sandbox);
vm.runInContext(core, sandbox, { filename: "core.js" });

const driver = `
function runScenario(sc) {
  CONFIG.food.spawnPerTick = sc.food;
  CONFIG.food.startCount = Math.min(1200, Math.round(sc.food * 80));
  CONFIG.food.max = Math.min(1600, Math.round(sc.food * 150));
  CONFIG.creature.retaliation = sc.retal;

  const w = new World({ seed: 11 });
  const TICKS = 8000;
  let maxDiet = 0, sumCarnLate = 0, lateN = 0, totalPred = 0, totalBites = 0;
  for (let t = 0; t <= TICKS; t++) {
    if (t % 500 === 0) {
      w.computeStats();
      const s = w.stats;
      if (s.avgDiet > maxDiet) maxDiet = s.avgDiet;
      if (t >= TICKS / 2) { sumCarnLate += s.carnFrac; lateN++; }
    }
    if (t < TICKS) {
      w.step();
      totalPred += w.predationsThisTick;
      totalBites += w.bitesThisTick;
    }
  }
  w.computeStats();
  return {
    name: sc.name,
    pop: w.stats.pop,
    finalDiet: w.stats.avgDiet,
    maxDiet: maxDiet,
    lateCarn: sumCarnLate / lateN,
    predK: totalPred / (TICKS / 1000),
    biteK: totalBites / (TICKS / 1000),
    maxGen: w.stats.maxGen,
  };
}

// Sweep the retaliation cost (how much a bitten creature hurts its attacker),
// which is the knob that decides whether biting a peer can ever pay off.
const scenarios = [
  { name: 'retal 0.42 (cur)  food 10', food: 10, retal: 0.42 },
  { name: 'retal 0.25        food 10', food: 10, retal: 0.25 },
  { name: 'retal 0.12        food 10', food: 10, retal: 0.12 },
  { name: 'retal 0.00        food 10', food: 10, retal: 0.0 },
  { name: 'retal 0.12        food 6 ', food: 6,  retal: 0.12 },
  { name: 'retal 0.00        food 6 ', food: 6,  retal: 0.0 },
];

console.log('scenario                pop  diet  maxDiet lateCarn  kills/k  bites/k  maxGen');
console.log('----------------------- ---- ----- ------- --------  -------  -------  ------');
for (const sc of scenarios) {
  const r = runScenario(sc);
  console.log(
    r.name.padEnd(23) + ' ' +
    String(r.pop).padStart(4) + ' ' +
    r.finalDiet.toFixed(2).padStart(5) + ' ' +
    r.maxDiet.toFixed(2).padStart(7) + ' ' +
    (100 * r.lateCarn).toFixed(0).padStart(7) + '% ' +
    r.predK.toFixed(1).padStart(8) + ' ' +
    r.biteK.toFixed(0).padStart(8) + ' ' +
    String(r.maxGen).padStart(7)
  );
}
console.log('');
console.log('(kills/k = predation deaths per 1000 ticks; bites/k = bites per 1000 ticks)');
`;

try {
  vm.runInContext(driver, sandbox, { filename: "experiment.js" });
} catch (e) {
  console.error("EXPERIMENT ERROR:", (e && e.stack) || e);
  process.exit(1);
}

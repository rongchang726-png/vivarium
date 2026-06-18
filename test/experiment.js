/*
 * Vivarium — ecology experiment.
 *
 * Not a pass/fail test: a sweep that asks "under what conditions does a predator
 * guild actually persist?" It runs the core under several configurations and
 * reports the carnivore fraction over time, so the docs can describe the real
 * behaviour instead of guessing.
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
  CONFIG.creature.biteDamage = sc.bite;
  CONFIG.creature.carcassFactor = sc.carcass;

  const w = new World({ seed: 11 });
  const TICKS = 7000;
  let maxCarn = 0, sumCarnLate = 0, lateN = 0, maxDiet = 0;
  for (let t = 0; t <= TICKS; t++) {
    if (t % 500 === 0) {
      w.computeStats();
      const s = w.stats;
      if (s.carnFrac > maxCarn) maxCarn = s.carnFrac;
      if (s.avgDiet > maxDiet) maxDiet = s.avgDiet;
      if (t >= TICKS / 2) { sumCarnLate += s.carnFrac; lateN++; }
    }
    if (t < TICKS) w.step();
  }
  w.computeStats();
  return {
    name: sc.name,
    pop: w.stats.pop,
    finalCarn: w.stats.carnFrac,
    lateCarn: sumCarnLate / lateN,
    maxCarn,
    maxDiet,
    maxGen: w.stats.maxGen,
  };
}

const scenarios = [
  { name: 'default     food=10', food: 10, bite: 18, carcass: 0.7 },
  { name: 'lean        food=5',  food: 5,  bite: 18, carcass: 0.7 },
  { name: 'scarce      food=3',  food: 3,  bite: 18, carcass: 0.7 },
  { name: 'strong-pred food=10', food: 10, bite: 30, carcass: 1.4 },
  { name: 'lean+strong food=5',  food: 5,  bite: 30, carcass: 1.4 },
  { name: 'scarce+str  food=3',  food: 3,  bite: 30, carcass: 1.4 },
];

console.log('scenario               pop  finalCarn  lateCarn  maxCarn  maxDiet  maxGen');
console.log('---------------------- ---- ---------  --------  -------  -------  ------');
for (const sc of scenarios) {
  const r = runScenario(sc);
  console.log(
    r.name.padEnd(22) + ' ' +
    String(r.pop).padStart(4) + ' ' +
    (100*r.finalCarn).toFixed(0).padStart(8) + '% ' +
    (100*r.lateCarn).toFixed(0).padStart(8) + '% ' +
    (100*r.maxCarn).toFixed(0).padStart(6) + '% ' +
    r.maxDiet.toFixed(2).padStart(7) + ' ' +
    String(r.maxGen).padStart(6)
  );
}
console.log('');
console.log('(lateCarn = mean carnivore fraction over the 2nd half of the run)');
`;

try {
  vm.runInContext(driver, sandbox, { filename: "experiment.js" });
} catch (e) {
  console.error("EXPERIMENT ERROR:", (e && e.stack) || e);
  process.exit(1);
}

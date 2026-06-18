/*
 * Vivarium — headless verification driver.
 *
 * This file is NOT run directly. sim.test.js concatenates the DOM-free core
 * (config, util, genome, brain, food, creature, world) ahead of it and executes
 * the whole bundle inside a single Node `vm` context — the same shared global
 * scope the browser gives the classic <script> tags. So everything declared in
 * the core (World, Genome, CONFIG, BRAIN, ...) is in scope here.
 *
 * It runs a long simulation, prints a trajectory, and asserts the world is
 * alive, self-sustaining, and evolving. It also checks save/load determinism.
 */

function fmt(n, d = 2) {
  return Number(n).toFixed(d);
}

const TICKS = typeof TEST_TICKS !== "undefined" ? TEST_TICKS : 20000;
const fails = [];

console.log(
  "Vivarium core — brain topology I=%d H=%d O=%d (%d weights)",
  BRAIN.I, BRAIN.H, BRAIN.O, BRAIN.WEIGHTS,
);
console.log("Running %d ticks...\n", TICKS);

const w = new World({ seed: 7 });

console.log("  tick   pop  food  diet  rad carn% maxGen lin   avgE avgAge genesis");
console.log("  ------ ---- ----- ---- ---- ----- ------ --- ----- ------ -------");

let genesisAtHalf = 0;
const t0 = Date.now();

for (let t = 0; t <= TICKS; t++) {
  if (t === (TICKS >> 1)) genesisAtHalf = w.genesisEvents;
  if (t % 1000 === 0) {
    w.computeStats();
    const s = w.stats;
    console.log(
      "  " +
        [
          String(w.tick).padStart(6),
          String(s.pop).padStart(4),
          String(s.food).padStart(5),
          fmt(s.avgDiet, 2).padStart(4),
          fmt(s.avgRadius, 1).padStart(4),
          fmt(s.carnFrac * 100, 0).padStart(5),
          String(s.maxGen).padStart(6),
          String(s.lineages).padStart(3),
          fmt(s.avgEnergy, 2).padStart(5),
          fmt(s.avgAge, 0).padStart(6),
          String(w.genesisEvents).padStart(7),
        ].join(" "),
    );
  }
  if (t < TICKS) w.step();
}

const elapsed = (Date.now() - t0) / 1000;
const tps = Math.round(TICKS / elapsed);
console.log("\nSimulated %d ticks in %ss  (%d ticks/sec)", TICKS, fmt(elapsed, 1), tps);

// --- assertions -------------------------------------------------------------
const last = w.computeStats();

// 1. The world is alive and not pathologically overpopulated.
if (!(last.pop >= 20)) fails.push("population collapsed to " + last.pop);
if (!(last.pop <= CONFIG.pop.softCap)) fails.push("population pegged above soft cap: " + last.pop);

// 2. Many generations elapsed — lineages are persisting and reproducing.
if (!(last.maxGen >= 40)) fails.push("too few generations elapsed (maxGen=" + last.maxGen + ")");

// 3. Self-sustaining: after the first half, evolved foragers should keep the
//    population above the genesis floor on their own (no life-support).
const genesisSecondHalf = w.genesisEvents - genesisAtHalf;
if (!(genesisSecondHalf <= 1)) {
  fails.push("world not self-sustaining: " + genesisSecondHalf + " genesis injections in 2nd half");
}

// 4. Numerical health: no NaN/Infinity leaked into state.
let bad = 0;
for (const c of w.creatures) {
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.energy)) bad++;
}
if (bad) fails.push(bad + " creatures have non-finite state");

// 5. Save/load is exact and deterministic.
function hashWorld(world) {
  let h = 2166136261 >>> 0;
  const mix = (x) => {
    h ^= Math.round(x * 1000) | 0;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(world.creatures.length);
  mix(world.tick);
  mix(world.food.list.length);
  for (const c of world.creatures) {
    mix(c.x);
    mix(c.y);
    mix(c.energy);
    mix(c.heading);
    mix(c.id);
  }
  return h >>> 0;
}

const a = new World({ seed: 99 });
for (let i = 0; i < 800; i++) a.step();
const snap = JSON.parse(JSON.stringify(a.serialize()));
const b = World.fromJSON(snap);
for (let i = 0; i < 300; i++) {
  a.step();
  b.step();
}
const ha = hashWorld(a);
const hb = hashWorld(b);
console.log("\nsave/load determinism: original=%d restored=%d", ha, hb);
if (ha !== hb) fails.push("save/load is not deterministic (" + ha + " != " + hb + ")");

// --- report -----------------------------------------------------------------
if (fails.length) {
  console.log("\nFAILURES:");
  for (const f of fails) console.log("  - " + f);
  __FAILED = true; // surfaces to the Node runner as a non-zero exit
} else {
  console.log("\nFinal: pop=%d  avgDiet=%s  carnivores=%s%%  maxGen=%d  lineages=%d",
    last.pop, fmt(last.avgDiet, 2), fmt(last.carnFrac * 100, 0), last.maxGen, last.lineages);
}

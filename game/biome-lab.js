/*
 * Vivarium Game — biome lab (terrain calibration, BUILD 1 / docs/REDESIGN.md)
 * ---------------------------------------------------------------------------
 * Turns terrain ON and asks the only question that matters: does a heterogeneous
 * world grow THREE DISTINCT regional ecotypes, or one generalist everywhere (cosmetic
 * biomes)? It buckets the live population by region and reads per-region FINE histograms
 * of diet / forage / size — never an average (CLAUDE.md: "the 5-bin histogram lied to me").
 *
 * It also guards the load-bearing gotchas from the build spec:
 *  - few LARGE regions (prints each region's area share),
 *  - each region must independently clear a VIABLE floor (~80-150 sustained, NOT injectFloor 22),
 *  - contrast strong enough that a generalist is strictly worse (read the histograms, not means).
 *
 *   node game/biome-lab.js [seed] [ticks] [contrast]
 *
 * This is a calibration instrument (informational), not a pass/fail test.
 */

const { loadCore } = require("./core-loader");

const seed = parseInt(process.argv[2] || "7", 10);
const ticks = parseInt(process.argv[3] || "16000", 10);
const forageSpec = process.argv[4] != null ? parseFloat(process.argv[4]) : 1.5; // CONVEX by default (the live ecotype axis)
// contrast is an optional NUMERIC positional (argv[5]); the "spread" flag may also sit there, so
// only accept argv[5] as contrast when it parses to a finite number (NaN would poison every multiplier).
const contrastArg = isFinite(parseFloat(process.argv[5])) ? parseFloat(process.argv[5]) : null;

const api = loadCore();
const CONFIG = api.CONFIG;
api.setParam("biome.enabled", true);
api.setParam("food.types", 2); // one per region — open the resource-partitioning niches (2-way branching)
api.setParam("food.forageSpecialization", forageSpec); // convex => disruptive selection resolves the forage niches
if (contrastArg != null) api.setParam("biome.contrast", contrastArg);

// `xN` flag: enlarge the world N-linear at CONSTANT density (area, food, founders, caps all x N^2).
// This is the project's proven mobility lever (CLAUDE.md RPS/Reichenbach): regions scale up with the
// world but a creature's lifetime dispersal does NOT, so relative MIXING falls ~1/N — the diagnosed
// cause of the washed-out forage cline. Tests whether lower mixing sharpens the cline into a real split.
const scaleArg = process.argv.find((a) => /^x\d+$/.test(a));
const scale = scaleArg ? parseInt(scaleArg.slice(1), 10) : 1;
const s2 = scale * scale;
if (scale > 1) {
  const W = CONFIG.world.width, H = CONFIG.world.height, fmax = CONFIG.food.max, fstart = CONFIG.food.startCount,
    spt = CONFIG.food.spawnPerTick, cstart = CONFIG.creature.startCount, soft = CONFIG.pop.softCap,
    ifloor = CONFIG.pop.injectFloor, icount = CONFIG.pop.injectCount;
  api.setParam("world.width", W * scale);
  api.setParam("world.height", H * scale);
  api.setParam("food.max", Math.round(fmax * s2));
  api.setParam("food.startCount", Math.round(fstart * s2));
  api.setParam("food.spawnPerTick", spt * s2);
  api.setParam("creature.startCount", Math.round(cstart * s2));
  api.setParam("pop.softCap", Math.round(soft * s2));
  api.setParam("pop.injectFloor", Math.round(ifloor * s2));
  api.setParam("pop.injectCount", Math.round(icount * s2));
}
const REGION_NAMES = ["plain", "forest"];
const NR = 2;
const minR = CONFIG.creature.minRadius, maxR = CONFIG.creature.maxRadius;

// `spread` mode: seed founders with forage spread across [0,1] (legitimate initial conditions),
// so some already match each region's food and survive from tick 1 — sidestepping the all-
// generalist bootstrap valley (forage 0.5 eats both types at the convex-penalized rate => mass
// starvation). The default (no spread) seeds the world's normal forage-0.5 founders, the harder test.
const spread = process.argv.includes("spread");
let w;
if (spread) {
  w = api.newEmptyWorld(seed);
  api.seedFounders(w, 400, { forageSpread: true });
  w.rebuildGrids();
} else {
  w = api.newWorld(seed);
}
const biome = w.biome;

// --- region geography: confirm few LARGE regions (area share from the lookup grid) --------
const cellCount = biome.grid.length;
const areaCells = [0, 0, 0];
for (let i = 0; i < cellCount; i++) areaCells[biome.grid[i]]++;

// --- 12-bin fine histogram helper ---------------------------------------------------------
function hist12(vals, lo, hi) {
  const h = new Array(12).fill(0);
  for (let i = 0; i < vals.length; i++) {
    let b = Math.floor(((vals[i] - lo) / (hi - lo)) * 12);
    if (b < 0) b = 0; else if (b > 11) b = 11;
    h[b]++;
  }
  return h;
}
function bar(h) {
  const max = Math.max(1, ...h);
  return h.map((n) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor((n / max) * 7))]).join("");
}
function mean(vals) { return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0; }

// --- run, sampling region pops over the back half ----------------------------------------
const SAMPLE_FROM = Math.floor(ticks * 0.6);
const popSamples = [];
for (let r = 0; r < NR; r++) popSamples.push([]);
const markEvery = Math.max(1, Math.floor(ticks / 8));
console.log(`biome-lab  seed=${seed}  ticks=${ticks}  contrast=${biome.contrast}  forageSpec=${forageSpec}  worldScale=${scale}${spread ? "  spread" : ""}`);
console.log("region geography (area share):");
for (let r = 0; r < NR; r++) {
  console.log(`  ${REGION_NAMES[r].padEnd(7)} ${(100 * areaCells[r] / cellCount).toFixed(1)}%`);
}
console.log("trajectory (tick: total | " + REGION_NAMES.join(" ") + "):");
function regionCounts() {
  const c = new Array(NR).fill(0);
  for (let i = 0; i < w.creatures.length; i++) c[biome.regionAt(w.creatures[i].x, w.creatures[i].y)]++;
  return c;
}
for (let t = 0; t < ticks; t++) {
  w.step();
  if (t >= SAMPLE_FROM) {
    const c = regionCounts();
    for (let r = 0; r < NR; r++) popSamples[r].push(c[r]);
  }
  if ((t + 1) % markEvery === 0 || t === ticks - 1) {
    const c = regionCounts();
    console.log(`  ${String(t + 1).padStart(6)}: ${String(w.creatures.length).padStart(4)} | ${c.map((n) => String(n).padStart(4)).join(" ")}`);
  }
}

// --- final per-region ecotype readout (averaged pop + FINE histograms) --------------------
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
// Bucket the FINAL population by region for the trait histograms.
const byRegion = [];
for (let r = 0; r < NR; r++) byRegion.push([]);
const foodByRegion = new Array(NR).fill(0);
for (let i = 0; i < w.creatures.length; i++) {
  const cr = w.creatures[i];
  byRegion[biome.regionAt(cr.x, cr.y)].push(cr);
}
for (let i = 0; i < w.food.list.length; i++) {
  const f = w.food.list[i];
  foodByRegion[biome.regionAt(f.x, f.y)]++;
}

console.log("\n=== per-region ecotypes (sustained pop = mean over back 40%) ===");
console.log("diet/forage in [0,1], size = radius in [min,max]; a FLAT-everywhere read = cosmetic biomes.");
for (let r = 0; r < NR; r++) {
  const pop = avg(popSamples[r]);
  const cs = byRegion[r];
  const diet = cs.map((c) => c.diet);
  const forage = cs.map((c) => c.forage);
  const rad = cs.map((c) => c.radius);
  const viable = pop >= 80 * s2 ? "VIABLE" : pop >= 40 * s2 ? "thin" : "FLOOR-ONLY";
  console.log(`\n${REGION_NAMES[r].toUpperCase()}  sustainedPop≈${pop.toFixed(0)} (${viable})  food=${foodByRegion[r]}  nNow=${cs.length}`);
  if (cs.length) {
    console.log(`  diet   ${bar(hist12(diet, 0, 1))}  mean ${mean(diet).toFixed(3)}`);
    console.log(`  forage ${bar(hist12(forage, 0, 1))}  mean ${mean(forage).toFixed(3)}`);
    console.log(`  size   ${bar(hist12(rad, minR, maxR))}  mean ${mean(rad).toFixed(2)}`);
  }
}
console.log("\nverdict cues: both regions VIABLE (>=80) AND their FORAGE histograms PEAK at opposite");
console.log("ends (plain->0, forest->1) = 2 spatially-sorted specialists. Both peaking mid = cosmetic.");

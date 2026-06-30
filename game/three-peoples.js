#!/usr/bin/env node
/*
 * Vivarium — 3-peoples bed (richness BUILD 6.3; docs/REDESIGN.md + CLAUDE.md branching notes).
 * ---------------------------------------------------------------------------------------------
 * Can SPACE hold THREE niches — the standing hard-negative (well-mixed 3 food types always collapse
 * to one: the middle forage specialist reaches all foods, a reach advantage)? Placed in 3 LARGE
 * coherent biome regions (one food type each, via food.types=3 => src/biome.js builds a 3rd region
 * with equal-area quantile bands), spatial separation denies the reach — the same mixing-wall lever
 * that made the 2-people fork robust (BUILD 6.2).
 *
 * Finding (seeds 7/11/19, seeded specialists, 16000 ticks, balanced 33/33/33 regions):
 *   - LINEAR axis (niches at forage 0/.5/1): space FLIPS the failure — ends robust, middle precarious,
 *     all three persist oscillating (none collapses, vs well-mixed: middle dominates, ends die).
 *   - RING axis (--ring / food.forageCircular, symmetric niches 0/⅓/⅔): persistent oscillating 3-way
 *     coexistence — seeds 7/11 clean, seed 19 rough. The FIRST 3-niche persistence in the project.
 *   HONEST: persistent, NOT stable (oscillates, seed-dependent, SEEDED not emergent). Mixing-wall theme.
 *
 * Usage:  node game/three-peoples.js [seed=7] [ticks=16000] [coexist|emerge] [ring]
 *   coexist = seed 3 specialist cohorts at the niches; emerge = random forage founders (does it ARISE?).
 *   ring    = food.forageCircular (symmetric niches, no squeezed middle).
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const TICKS = parseInt(process.argv[3] || "16000", 10);
const MODE = process.argv[4] || "coexist";
const RING = process.argv[5] === "ring";

const api = loadCore();
api.setParam("biome.enabled", true);
api.setParam("food.types", 3);
api.setParam("food.forageSpecialization", 1.2);
api.setParam("storyteller.enabled", true);
if (RING) api.setParam("food.forageCircular", true);
// niche forage targets: linear => 0, .5, 1 (type/(N-1)); ring => 0, ⅓, ⅔ (type/N, wraps)
const NICHE = RING ? [0, 1 / 3, 2 / 3] : [0, 0.5, 1];
// 3 regions share the world => keep per-region food density ~= the 2-region showcase (x1.5).
api.setParam("food.max", Math.round(api.CONFIG.food.max * 1.5));
api.setParam("food.startCount", Math.round(api.CONFIG.food.startCount * 1.5));
api.setParam("food.spawnPerTick", Math.round(api.CONFIG.food.spawnPerTick * 1.5));

const w = api.newWorldLogged(SEED); // genesis on, like the showcase
if (MODE === "coexist") {
  api.seedFounders(w, 40, { diet: 0.1, radius: 3.6, forage: NICHE[0] }, 0);
  api.seedFounders(w, 40, { diet: 0.1, radius: 3.6, forage: NICHE[1] }, 1);
  api.seedFounders(w, 40, { diet: 0.1, radius: 3.6, forage: NICHE[2] }, 2);
} else {
  api.seedFounders(w, 80, { diet: 0.1, radius: 3.6, forageSpread: true }, 0); // forage random across [0,1]
}

// region-area sanity: are the 3 regions reasonably balanced? (a skewed split voids the niche test)
const bio = w.biome;
const areas = [0, 0, 0];
for (let i = 0; i < bio.grid.length; i++) areas[bio.grid[i]]++;
const tot = areas[0] + areas[1] + areas[2];
console.log("nRegions=" + bio.nRegions + " ring=" + RING + " | region areas: t0=" + Math.round(100 * areas[0] / tot) +
  "% t1=" + Math.round(100 * areas[1] / tot) + "% t2=" + Math.round(100 * areas[2] / tot) + "%");
console.log("mode=" + MODE + " seed=" + SEED + " ticks=" + TICKS + "\n");

function ringDist(a, b) { let d = Math.abs(a - b); if (RING && d > 0.5) d = 1 - d; return d; }
function bands() {
  const n = [0, 0, 0];
  for (const c of w.creatures) {
    for (let i = 0; i < 3; i++) { if (ringDist(c.forage, NICHE[i]) < 0.12) { n[i]++; break; } } // tight: specialists near each peak
  }
  return { lo: n[0], mid: n[1], hi: n[2], pop: w.creatures.length };
}

console.log("t        pop |  type0          type1          type2        | 3 peoples?");
for (let t = 0; t <= TICKS; t += 2000) {
  if (t > 0) api.step(w, 2000);
  const b = bands();
  const p = b.pop || 1;
  const three = b.lo > 0.1 * p && b.mid > 0.1 * p && b.hi > 0.1 * p;
  console.log("t=" + String(t).padStart(5) + " " + String(b.pop).padStart(4) + "  | " +
    String(b.lo).padStart(4) + " (" + String(Math.round(100 * b.lo / p)).padStart(2) + "%)    " +
    String(b.mid).padStart(4) + " (" + String(Math.round(100 * b.mid / p)).padStart(2) + "%)    " +
    String(b.hi).padStart(4) + " (" + String(Math.round(100 * b.hi / p)).padStart(2) + "%)  | " + (three ? "YES" : "-"));
}

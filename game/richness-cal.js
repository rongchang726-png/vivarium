#!/usr/bin/env node
/*
 * game/richness-cal.js — calibration bed for the `richness` challenge.
 * Runs engine.experiment on the richness challenge (default recipe = the
 * challenge's own seeded triad + baseConfig, unless you pass k=v overrides) and
 * prints the niche trajectory, so we can see whether the 3 peoples persist and
 * tune thresholds/knobs before trusting the goal predicate.
 *
 * Usage: node game/richness-cal.js [seed=1] [ticks=9000] [k=v ...]
 *   e.g. node game/richness-cal.js 1 9000 food.forageSpecialization=1.4 food.spawnPerTick=20
 */
const { experiment, runRecipe } = require("./engine");
const { challenges } = require("./challenges");

const ch = challenges.richness;
const SEED = parseInt(process.argv[2] || "1", 10);
const TICKS = parseInt(process.argv[3] || "9000", 10);

const cfg = {};
for (let i = 4; i < process.argv.length; i++) {
  const eq = process.argv[i].indexOf("=");
  if (eq > 0) cfg[process.argv[i].slice(0, eq)] = parseFloat(process.argv[i].slice(eq + 1));
}

console.log("richness cal | seed=" + SEED + " ticks=" + TICKS + " cfg=" + JSON.stringify(cfg));
console.log("settle=" + ch.settleTicks + " window=" + ch.goalWindow + " | niches = forageHist bins 0 / 2 / 4\n");

const out = experiment(ch, cfg, null, TICKS, SEED);
// print ALL 5 forageHist bins as % of pop (diagnostic for either geometry).
// linear niches sit in bins 0/2/4; ring niches (0/⅓/⅔) sit in bins 0(+4 wrap)/1/3.
console.log("t       pop |  b0   b1   b2   b3   b4   (% of pop)");
for (const s of out.trajectory) {
  const p = s.pop || 1;
  const pct = (b) => String(Math.round(100 * s.forageHist[b] / p)).padStart(3);
  console.log(
    "t=" + String(s.tick).padStart(5) + " " + String(s.pop).padStart(4) + "  | " +
    pct(0) + "  " + pct(1) + "  " + pct(2) + "  " + pct(3) + "  " + pct(4)
  );
}
console.log("\n(trajectory above is a 9000t view; the REAL judge settles " + ch.settleTicks + " then judges the next " + ch.goalWindow + ")");
// GROUND TRUTH: the actual challenge judge on this seed (settle + window as score() does it).
const verdict = runRecipe(ch, { config: cfg }, SEED);
console.log("runRecipe verdict:", JSON.stringify({ pass: verdict.pass, score: verdict.score, detail: verdict.detail }));

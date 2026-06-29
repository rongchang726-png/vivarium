#!/usr/bin/env node
/*
 * Vivarium — chronicle-run: render a faithful STORY from a real sim run.
 * --------------------------------------------------------------------------
 * The keystone test (docs/REDESIGN.md): does a grounded chronicle of THIS sim land
 * as an ENCOUNTER, not a debug log? Runs a recipe with the event log ON, renders the
 * god's-eye + second-person story, and computes the SECOND-PERSON view's COUNTERFACTUAL
 * by re-running with one rule toggled back to baseline and reporting the MEASURED
 * difference (real causal attribution, not asserted).
 *
 * Usage:  node game/chronicle-run.js [recipe] [seed]
 *   recipe: predator | partition | default      (default: predator)
 */
const { loadCore } = require("./core-loader");
const { chronicle, summarize } = require("./chronicle");
const fs = require("fs");
const path = require("path");

const RECIPE = process.argv[2] || "predator";
const SEED = parseInt(process.argv[3] || "7", 10);

// --- recipe definitions -------------------------------------------------------
// Each: knobs the agent "set", the founders to seed, ticks, and the ONE knob whose
// counterfactual (reverted to baseline) measures the agent's hand.
const RECIPES = {
  // The decade-old tragedy: an extreme hunter guild over-exploits its prey to collapse.
  predator: {
    arena: true,
    knobs: {
      "creature.carcassFactor": 8, "creature.carnCarcassBonus": 4, "creature.carnMetabolismDiscount": 0.6,
      "creature.preyVulnerability": 0.6, "creature.pursuitReward": 0.8, "creature.biteDamage": 35,
    },
    founders: [
      { clan: 0, count: 120, spec: { diet: 0.05, radius: 3.3 } },
      { clan: 1, count: 50, spec: { diet: 0.92, radius: 6.5 } },
    ],
    ticks: 9000,
    cf: { knob: "creature.preyVulnerability", you: 0.6, baseline: 0 },
  },

  // Resource partitioning: two specialists on two foods coexist (the repo's 5/5 result).
  partition: {
    arena: true,
    knobs: { "food.types": 2, "food.startCount": 2000, "food.max": 3000, "food.spawnPerTick": 20 },
    founders: [
      { clan: 0, count: 90, spec: { diet: 0.05, radius: 3.3, forage: 0 } },
      { clan: 1, count: 90, spec: { diet: 0.05, radius: 3.3, forage: 1 } },
    ],
    ticks: 9000,
    cf: { knob: "food.types", you: 2, baseline: 1, naive: "+" },
    rankKnobs: ["food.types", "food.spawnPerTick"],
  },

  // The richness build (BUILD 1 + 2): terrain lays out two regional niches, and the
  // storyteller's rare-severe famines punctuate the history with data-driven chapters. A
  // non-arena world (random founders, genesis on). The gift ranks the FRAME-level levers —
  // was the disturbance the cause? was the terrain? — so the re-run is armed at the frame level.
  terrain: {
    arena: false,
    knobs: {
      "biome.enabled": true, "food.types": 2, "food.forageSpecialization": 1.2,
      "storyteller.enabled": true,
    },
    founders: [],
    ticks: 14000,
    cf: { knob: "storyteller.enabled", you: true, baseline: false },
    // Rank the THEMATIC levers the agent actually pulled FIRST (forage niche split, two foods),
    // not just the on/off frame toggles — the cold-stranger's critique: "you didn't test the rules
    // I care about". forageSpecialization is the keystone (convex trade-off => does it fork?).
    rankKnobs: ["food.forageSpecialization", "food.types", "biome.enabled", "storyteller.enabled"],
    // Score the counterfactual by the FORK (the outcome this experiment is ABOUT), not population —
    // so the ledger and the narrative agree (BUILD 4). A population-ranked table called the fork lever
    // "inert" while the story pushed it; ranking by fork resolves that at the source.
    metric: "fork",
  },

  // The default world: seeded omnivores; natural selection's verdict (herbivory).
  default: {
    arena: false,
    knobs: { "food.spawnPerTick": 16 },
    founders: [],
    ticks: 20000,
    cf: { knob: "food.spawnPerTick", you: 16, baseline: 6, naive: "+" },
  },
};

function runOnce(recipe, cfOverride, seed) {
  const api = loadCore(); // fresh isolated CONFIG per run
  for (const k in recipe.knobs) api.setParam(k, recipe.knobs[k]);
  if (cfOverride) api.setParam(cfOverride.knob, cfOverride.value);
  // partition doubles per-type density; if the counterfactual drops to 1 food type,
  // keep total food the same so it's a fair "did partitioning matter" test, not starvation.
  const w = recipe.arena ? api.newArenaWorldLogged(seed) : api.newWorldLogged(seed);
  for (const fdr of recipe.founders) api.seedFounders(w, fdr.count, fdr.spec, fdr.clan);
  api.step(w, recipe.ticks);
  return w.eventLog;
}

function main() {
  const recipe = RECIPES[RECIPE];
  if (!recipe) { console.error("unknown recipe: " + RECIPE + " (have: " + Object.keys(RECIPES).join(", ") + ")"); process.exit(1); }

  const defApi = loadCore(); // untouched CONFIG = the defaults each knob is reverted to
  const dottedGet = (o, p) => { const a = p.split("."); let x = o; for (const kk of a) x = x[kk]; return x; };
  const defaultOf = (k) => dottedGet(defApi.CONFIG, k);

  process.stderr.write("running '" + RECIPE + "' seed " + SEED + " (" + recipe.ticks + " ticks)...\n");
  const youLog = runOnce(recipe, null, SEED); // the STORY world — one seed
  const youSum = summarize(youLog);

  // RANKED counterfactual (the gift's engine): revert each chosen knob to default in turn (the rest
  // held), rank by how much that one change moved the outcome — "which of your choices was the actual
  // cause". The game does the science; the next re-run is armed.
  const rankKnobs = recipe.rankKnobs || Object.keys(recipe.knobs);
  const ranked = [];
  let metricSeeds = 1;

  if (recipe.metric === "fork") {
    // MULTI-SEED fork ledger (BUILD 5). Single-seed can't discriminate a KNIFE-EDGE fork (BUILD 4: every
    // lever read decisive on one seed, because any change tips a fragile fork out). So run each revert
    // across a SEED SET and rank by how ROBUSTLY it holds the fork — on how many seeds the fork survives
    // the revert. The STORY stays one world; the LEDGER is rule-level (seed-independent), which is what a
    // "which of my RULES caused it" question actually wants.
    const LEDGER_SEEDS = [SEED].concat([7, 11, 19, 23].filter((s) => s !== SEED)).slice(0, 4);
    metricSeeds = LEDGER_SEEDS.length;
    const FORK_T = 0.05; // a seed "forked" if it sustained the split for >5% of the run
    const forkStats = (cfOverride) => {
      const fracs = LEDGER_SEEDS.map((s) => summarize(runOnce(recipe, cfOverride, s)).forkFrac);
      return { avg: fracs.reduce((a, b) => a + b, 0) / fracs.length, survived: fracs.filter((f) => f > FORK_T).length, n: fracs.length };
    };
    process.stderr.write("multi-seed fork ledger: " + rankKnobs.length + " levers x " + metricSeeds + " seeds (" + ((rankKnobs.length + 1) * metricSeeds) + " runs)...\n");
    const youFork = forkStats(null);
    for (const k of rankKnobs) {
      const cf = forkStats({ knob: k, value: defaultOf(k) });
      const r = { knob: k, you: recipe.knobs[k], def: defaultOf(k), sum: youSum };
      scoreForkMulti(r, youFork, cf);
      ranked.push(r);
    }
  } else {
    process.stderr.write("ranking " + rankKnobs.length + " levers by causal impact (" + rankKnobs.length + " more runs)...\n");
    for (const k of rankKnobs) {
      const log = runOnce(recipe, { knob: k, value: defaultOf(k) }, SEED);
      ranked.push({ knob: k, you: recipe.knobs[k], def: defaultOf(k), sum: summarize(log) });
    }
    for (const r of ranked) scoreImpact(r, youSum, recipe.metric);
  }
  ranked.sort((a, b) => b.score - a.score);
  const topR = ranked[0];
  for (const r of ranked) r.label = labelOf(r, topR);

  const meta = {
    seed: SEED,
    recipe: recipe.knobs,
    worldW: defApi.CONFIG.world.width,
    worldH: defApi.CONFIG.world.height,
    rankedCf: {
      nSet: rankKnobs.length,
      metric: recipe.metric || "pop",
      seeds: metricSeeds,
      ranked: ranked.map((r) => ({ knob: r.knob, you: r.you, def: r.def, outcome: r.sum.line, label: r.label, effect: r.effect, top: r === topR, flip: r.flip })),
    },
  };

  const out = chronicle(youLog, meta);
  const text = out.whatYouMade + "\n\n" + out.narrative + "\n\n" + out.closing + "\n";
  console.log(text);
  console.log("--- facts (provenance) ---");
  console.log(JSON.stringify(out.facts));

  // also drop the story (story only, no facts/code) for the cold-stranger test
  const dir = path.resolve(__dirname, "..", ".chronicles");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  fs.writeFileSync(path.join(dir, RECIPE + "-" + SEED + ".txt"), text);
  process.stderr.write("story written to .chronicles/" + RECIPE + "-" + SEED + ".txt\n");
}

function describeDelta(you, base) {
  if (you.collapsed && !base.collapsed) return "your choice DOOMED a world that would otherwise have lived (" + base.pop + " alive)";
  if (!you.collapsed && base.collapsed) return "your choice SAVED a world that would otherwise have died";
  if (you.collapsed && base.collapsed) return "either way the world died — this lever did not decide its fate";
  const dp = you.pop - base.pop;
  const dd = (you.diet - base.diet);
  const parts = [];
  if (Math.abs(dp) > 20) parts.push((dp > 0 ? "+" : "") + dp + " in final population");
  if (Math.abs(dd) > 0.05) parts.push("a diet shift of " + (dd > 0 ? "+" : "") + dd.toFixed(2) + " toward " + (dd > 0 ? "the hunt" : "the plants"));
  return parts.length ? parts.join(", ") : "a difference too small to matter";
}

function pct(x) { return Math.round((x || 0) * 100) + "%"; }

// Impact of reverting one knob to default (the rest held), vs the world you made. `metric` chooses the
// OUTCOME ranked: "pop" (default) or "fork" (the forage-niche-split experiment — BUILD 4, so the table
// ranks the lever the agent actually cares about and stops contradicting the narrative).
function scoreImpact(r, youSum, metric) {
  const flip = r.sum.collapsed !== youSum.collapsed;
  if (flip) {
    r.flip = true;
    r.score = 1e6 + Math.abs((r.sum.pop || 0) - (youSum.pop || 0));
    r.effect = youSum.collapsed ? "without it the world LIVED (" + r.sum.line + ")" : "without it the world DIED (" + r.sum.line + ")";
    return;
  }
  if (metric === "fork") {
    const youF = youSum.forkFrac || 0, rF = r.sum.forkFrac || 0;
    const df = (r.sum.forkSamples || 0) - (youSum.forkSamples || 0);
    // A fork "flip": you sustained two peoples, but reverting this knob meant they never formed at all.
    r.flip = youF > 0.05 && rF < 0.01;
    if (r.flip) {
      r.score = 1e6 + Math.abs(df);
      r.effect = "without it the world NEVER forked (you held two peoples " + pct(youF) + " of the run; reverted: " + pct(rF) + ")";
    } else {
      r.score = Math.abs(df);
      r.effect = Math.abs(df) > 10
        ? "the fork " + (df < 0 ? "shrank to " : "grew to ") + pct(rF) + " of the run (yours: " + pct(youF) + ")"
        : "the fork barely changed (" + pct(rF) + " of the run vs your " + pct(youF) + ")";
    }
    return;
  }
  r.flip = false;
  if (youSum.collapsed) {
    const dt = (r.sum.extinctTick || 0) - (youSum.extinctTick || 0);
    r.score = Math.abs(dt);
    r.effect = Math.abs(dt) > 200 ? "still died, but " + (dt > 0 ? dt + " ticks later" : (-dt) + " ticks sooner") : "changed almost nothing (died about the same time)";
  } else {
    const dp = (r.sum.pop || 0) - (youSum.pop || 0);
    r.score = Math.abs(dp);
    r.effect = Math.abs(dp) > 20 ? (dp > 0 ? "+" : "") + dp + " in final population" : "changed almost nothing";
  }
}

// Multi-seed fork scorer (BUILD 5): rank a lever by how ROBUSTLY reverting it kills the fork — on how
// many seeds the fork stops surviving. A true PREREQUISITE kills it on ALL seeds (a flip => DECISIVE); a
// lucky/partial lever only on some (a "partial hold"). This is the discrimination single-seed couldn't
// give (where a knife-edge fork tipped out at any change, making every lever read decisive).
function scoreForkMulti(r, youFork, cf) {
  const dSurv = youFork.survived - cf.survived;
  const dAvg = youFork.avg - cf.avg;
  r.score = dSurv * 1000 + Math.abs(dAvg) * 100; // survival-count dominates; avg breaks ties
  const killedAll = cf.survived === 0 && youFork.survived > 0;
  r.flip = killedAll;
  if (killedAll) {
    r.effect = "the fork NEVER formed without it (0/" + youFork.n + " seeds; with your full recipe it held in " + youFork.survived + "/" + youFork.n + ")";
  } else if (dSurv > 0) {
    r.effect = "the fork survived in only " + cf.survived + "/" + youFork.n + " seeds without it (vs " + youFork.survived + "/" + youFork.n + " yours) — a partial hold, not a clean cause";
  } else {
    r.effect = "the fork still held in " + cf.survived + "/" + youFork.n + " seeds — barely changed";
  }
}
function labelOf(r, top) {
  if (r.flip) return "DECISIVE";
  if (top.score > 0 && r.score >= top.score * 0.5) return "major";
  if (r.score >= (top.score || 1) * 0.15) return "minor";
  return "barely moved it";
}

main();

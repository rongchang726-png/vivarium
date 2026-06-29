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

function runOnce(recipe, cfOverride) {
  const api = loadCore(); // fresh isolated CONFIG per run
  for (const k in recipe.knobs) api.setParam(k, recipe.knobs[k]);
  if (cfOverride) api.setParam(cfOverride.knob, cfOverride.value);
  // partition doubles per-type density; if the counterfactual drops to 1 food type,
  // keep total food the same so it's a fair "did partitioning matter" test, not starvation.
  const w = recipe.arena ? api.newArenaWorldLogged(SEED) : api.newWorldLogged(SEED);
  for (const fdr of recipe.founders) api.seedFounders(w, fdr.count, fdr.spec, fdr.clan);
  api.step(w, recipe.ticks);
  return w.eventLog;
}

function main() {
  const recipe = RECIPES[RECIPE];
  if (!recipe) { console.error("unknown recipe: " + RECIPE + " (have: " + Object.keys(RECIPES).join(", ") + ")"); process.exit(1); }

  process.stderr.write("running '" + RECIPE + "' seed " + SEED + " (" + recipe.ticks + " ticks)...\n");
  const youLog = runOnce(recipe, { knob: recipe.cf.knob, value: recipe.cf.you });

  process.stderr.write("running counterfactual (" + recipe.cf.knob + " = " + recipe.cf.baseline + ")...\n");
  const baseLog = runOnce(recipe, { knob: recipe.cf.knob, value: recipe.cf.baseline });

  const youSum = summarize(youLog);
  const baseSum = summarize(baseLog);
  const delta = describeDelta(youSum, baseSum);

  const meta = {
    seed: SEED,
    recipe: recipe.knobs,
    counterfactual: {
      knob: recipe.cf.knob, you: recipe.cf.you, baseline: recipe.cf.baseline,
      youOutcome: youSum.line, baselineOutcome: baseSum.line, delta,
      youPop: youSum.pop, basePop: baseSum.pop,
      bothCollapsed: !!(youSum.collapsed && baseSum.collapsed),
      naive: recipe.cf.naive || null,
    },
  };

  const out = chronicle(youLog, meta);
  const text = out.godseye + "\n\n" + out.secondPerson + "\n";
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

main();

/*
 * Vivarium Game — engine
 * ----------------------
 * Turns the simulation into something an agent can *play*: run experiments to
 * understand the system, then submit a recipe that the judge verifies on
 * held-out seeds.
 *
 * Two entry points:
 *   experiment(challenge, config, founders, ticks, seed) -> a trajectory you can
 *     read and reason about (your laboratory).
 *   score(challenge, recipe) -> the verdict: runs your recipe on the challenge's
 *     hidden scoring seeds and checks the goal predicate on each.
 *
 * Determinism (built into the core) is what makes the judge trustworthy: the
 * same recipe + seed always yields the same world, so a pass can't be luck and
 * can be reproduced exactly.
 */

const { loadCore } = require("./core-loader");

const SAMPLE_EVERY = 250; // ticks between snapshots while judging the goal window

function applyRecipe(api, challenge, recipe, seed) {
  // Base config the challenge itself imposes, then the player's overrides.
  const base = (challenge && challenge.baseConfig) || {};
  const cfg = Object.assign({}, base, recipe.config || {});
  for (const k of Object.keys(cfg)) api.setParam(k, cfg[k]);

  let world;
  if (recipe.founders && recipe.founders.length) {
    world = api.newEmptyWorld(seed);
    for (const f of recipe.founders) api.seedFounders(world, f.count | 0, f);
  } else {
    world = api.newWorld(seed);
  }
  return world;
}

// Run one recipe on one seed: settle, then sample across the goal window and
// evaluate the challenge's predicate.
function runRecipe(challenge, recipe, seed) {
  const api = loadCore(); // isolated CONFIG for this run
  const world = applyRecipe(api, challenge, recipe, seed);

  const settle = recipe.settleTicks != null ? recipe.settleTicks : challenge.settleTicks;
  api.step(world, settle);

  const windowT = challenge.goalWindow;
  const samples = [];
  for (let t = 0; t < windowT; t += SAMPLE_EVERY) {
    api.step(world, SAMPLE_EVERY);
    samples.push(api.snapshot(world));
  }
  const verdict = challenge.evaluate(samples);
  const ticksUsed = settle + windowT;
  return { seed, pass: verdict.pass, score: verdict.score, detail: verdict.detail, ticksUsed, final: samples[samples.length - 1] };
}

// The judge. Runs the recipe on every hidden scoring seed; you pass if enough
// of them satisfy the goal — i.e. if your idea generalizes.
function score(challenge, recipe) {
  const seeds = challenge.scoringSeeds;
  const runs = seeds.map((s) => runRecipe(challenge, recipe, s));
  const passes = runs.filter((r) => r.pass).length;
  const need = Math.ceil(seeds.length * (challenge.passFraction || 0.6));
  const avgScore = runs.reduce((a, r) => a + (r.score || 0), 0) / runs.length;
  const ticksUsed = runs.reduce((a, r) => a + (r.ticksUsed || 0), 0);
  return {
    challenge: challenge.id,
    title: challenge.title,
    pass: passes >= need,
    passes,
    total: seeds.length,
    needed: need,
    avgScore: Math.round(avgScore * 1000) / 1000,
    ticksUsed,
    runs: runs.map((r) => ({ seed: r.seed, pass: r.pass, score: Math.round((r.score || 0) * 1000) / 1000, detail: r.detail })),
  };
}

// Free experimentation: run once and return a readable trajectory. If a
// challenge is given, also report whether its goal currently holds over the
// tail, so you can iterate quickly without a full scoring run.
function experiment(challenge, config, founders, ticks, seed) {
  const api = loadCore();
  const recipe = { config: config || {}, founders: founders || null };
  const world = applyRecipe(api, challenge, recipe, seed);

  const every = Math.max(SAMPLE_EVERY, Math.floor(ticks / 12));
  const trajectory = [];
  let done = 0;
  while (done < ticks) {
    const chunk = Math.min(every, ticks - done);
    api.step(world, chunk);
    done += chunk;
    trajectory.push(api.snapshot(world));
  }

  const out = { seed, ticks, ticksUsed: done, trajectory };
  if (challenge) {
    // Judge the goal predicate over the last `goalWindow` worth of samples.
    const windowSamples = Math.max(1, Math.round(challenge.goalWindow / every));
    const tail = trajectory.slice(-windowSamples);
    out.goalPreview = challenge.evaluate(tail);
    out.goalPreview.note = "preview on THIS seed only; `score` is the real judge on held-out seeds";
  }
  return out;
}

module.exports = { runRecipe, score, experiment };

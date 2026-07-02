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

  // Founders: the recipe's own cohorts, else the challenge's fixed cohorts (e.g.
  // richness seeds three forage-specialist peoples the agent must keep coexisting).
  const founders = (recipe.founders && recipe.founders.length)
    ? recipe.founders
    : (challenge && challenge.founders) || null;

  let world;
  if (founders && founders.length) {
    // noGenesis (arena world) when the challenge wants a clean seeded ecosystem —
    // no wildlife injection to contaminate the niche counts.
    world = (challenge && challenge.noGenesis) ? api.newArenaWorld(seed) : api.newEmptyWorld(seed);
    for (const f of founders) api.seedFounders(world, f.count | 0, f);
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
function score(challenge, recipe, onProgress) {
  const seeds = challenge.scoringSeeds;
  // Per-seed loop (was .map) so we can emit progress after each seed: a /score is
  // many minutes on a small box, and a job that only ever says "running" reads as
  // hung (a real first-time agent quit at ~5 min over exactly this). The runs are
  // bit-identical to the old map — progress is observation only, no RNG touched.
  const runs = [];
  for (let i = 0; i < seeds.length; i++) {
    runs.push(runRecipe(challenge, recipe, seeds[i]));
    if (onProgress) onProgress({ done: i + 1, total: seeds.length, unit: "seeds" });
  }
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
function experiment(challenge, config, founders, ticks, seed, onProgress) {
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
    if (onProgress) onProgress({ done, total: ticks, unit: "ticks" });
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

function readDefault(api, dotted) {
  const parts = dotted.split(".");
  let o = api.CONFIG;
  for (const p of parts) o = o[p];
  return o;
}

// Inference challenge: run the DEFAULT world and the SECRETLY-ALTERED world side
// by side on the same seed, so the only difference between the two trajectories
// is the hidden perturbation. The player compares them to deduce what moved.
function inferenceExperiment(mystery, ticks, seed) {
  const apiB = loadCore();
  const apiP = loadCore();
  const def = readDefault(apiP, mystery.knob);
  apiP.setParam(mystery.knob, def * mystery.factor);

  const wB = apiB.newWorld(seed);
  const wP = apiP.newWorld(seed);

  const every = Math.max(250, Math.floor(ticks / 10));
  const baseline = [];
  const altered = [];
  let done = 0;
  while (done < ticks) {
    const chunk = Math.min(every, ticks - done);
    apiB.step(wB, chunk);
    apiP.step(wP, chunk);
    done += chunk;
    baseline.push(apiB.snapshot(wB));
    altered.push(apiP.snapshot(wP));
  }
  return { seed, ticks, ticksUsed: done * 2, baseline, altered };
}

// Grade a guess of {knob, value} against the hidden truth.
function gradeGuess(mystery, guess, tolerance) {
  const api = loadCore();
  const def = readDefault(api, mystery.knob);
  const trueValue = def * mystery.factor;
  const knobCorrect = guess.knob === mystery.knob;
  let relErr = 1;
  if (knobCorrect && Number.isFinite(guess.value)) {
    relErr = Math.abs(guess.value - trueValue) / Math.abs(trueValue);
  }
  const tol = tolerance || 0.3;
  return {
    pass: knobCorrect && relErr <= tol,
    score: knobCorrect ? Math.max(0, 1 - relErr) : 0,
    knobCorrect,
    relErr: Math.round(relErr * 1000) / 1000,
    guessedKnob: guess.knob,
    trueKnob: mystery.knob,
    guessedValue: guess.value,
    trueValue: Math.round(trueValue * 1000) / 1000,
    trueFactor: Math.round(mystery.factor * 1000) / 1000,
  };
}

// --- The Hinge: save a doomed world with ONE late, small single-knob nudge ---
// The challenge fixes a world that reliably self-destructs (a big larder, no regrow).
// The player submits ONLY a trigger { metric, dir, theta, knob, value }: the judge fires
// setParam(knob,value) ONCE, the first tick `metric` crosses `theta`. A no-trigger TWIN
// establishes this seed's collapse tick; you pass iff the twin dies, your run SURVIVES to
// the horizon, and you fired LATE (fireTick >= alpha*collapse). Score rewards lateness —
// anyone can save at the peak; mastery is the last moment it can still be turned.
function hingeRun(challenge, recipe, seed, useTrigger) {
  const api = loadCore();
  const world = applyRecipe(api, challenge, { config: {}, founders: null }, seed); // doom baseConfig + challenge founders
  const H = challenge.hinge;
  const trig = useTrigger ? (recipe.trigger || null) : null;
  let fired = false, fireTick = null, peak = 0, peakT = 0, collapseT = null, minAfterFire = Infinity, lastPop = 0;
  for (let t = H.sampleEvery; t <= H.horizon; t += H.sampleEvery) {
    api.step(world, H.sampleEvery);
    const s = api.snapshot(world);
    lastPop = s.pop;
    if (s.pop > peak) { peak = s.pop; peakT = s.tick; }
    if (collapseT === null && s.tick > peakT && s.pop < H.deadPop) collapseT = s.tick;
    if (!fired && trig) {
      const m = s[trig.metric];
      const cross = trig.dir === "below" ? (m <= trig.theta) : (m >= trig.theta);
      if (cross) { api.setParam(trig.knob, trig.value); fired = true; fireTick = s.tick; }
    }
    if (fired && s.pop < minAfterFire) minAfterFire = s.pop;
  }
  return { fired, fireTick, peak, peakT, collapseT, minAfterFire, finalPop: lastPop };
}

function triggerLegal(challenge, trig) {
  const H = challenge.hinge;
  if (!trig) return false;
  const knobOK = H.allow && Object.prototype.hasOwnProperty.call(H.allow, trig.knob);
  const valOK = knobOK && Number.isFinite(trig.value) && trig.value >= H.allow[trig.knob][0] && trig.value <= H.allow[trig.knob][1];
  const metricOK = (H.metrics || []).indexOf(trig.metric) >= 0;
  const dirOK = trig.dir === "below" || trig.dir === "above";
  return knobOK && valOK && metricOK && dirOK && Number.isFinite(trig.theta);
}

// Run one Hinge recipe on one seed: twin (doomed baseline) vs the triggered fork.
function runHinge(challenge, recipe, seed) {
  const H = challenge.hinge;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const legal = triggerLegal(challenge, recipe.trigger);
  const twin = hingeRun(challenge, recipe, seed, false);
  const twinDied = twin.collapseT !== null || twin.finalPop < H.floor;
  const tc = twin.collapseT || H.horizon;
  const tr = legal ? hingeRun(challenge, recipe, seed, true) : null;
  const survived = !!tr && tr.finalPop >= H.floor && tr.minAfterFire >= 1;
  const late = tr && tr.fired ? tr.fireTick / tc : 0;
  const lateGate = !!tr && tr.fired && tr.fireTick >= H.alpha * tc;
  const pass = legal && twinDied && survived && lateGate;
  const why = !legal ? "illegal trigger" : !twinDied ? "twin did NOT doom (miscalibrated seed)"
    : !tr.fired ? "never fired" : !survived ? "fired but world still died (fatal / too late)"
    : !lateGate ? "saved too EARLY (need fire >= alpha*collapse)" : "saved late";
  return {
    seed, pass, score: pass ? Math.min(1, late) : 0,
    twinDied, fired: !!tr && tr.fired, fireTick: tr ? tr.fireTick : null, collapse: tc, late: r3(late),
    detail: why + " tc=" + tc + (tr && tr.fired ? " fire=" + tr.fireTick + " late=" + r3(late) : "") +
      " twinFinal=" + twin.finalPop + (tr ? " runFinal=" + tr.finalPop : ""),
  };
}

// The judge for a Hinge challenge: pass if enough hidden seeds are saved-late.
function scoreHinge(challenge, recipe, onProgress) {
  const seeds = challenge.scoringSeeds;
  const runs = [];
  for (let i = 0; i < seeds.length; i++) {
    runs.push(runHinge(challenge, recipe, seeds[i]));
    if (onProgress) onProgress({ done: i + 1, total: seeds.length, unit: "seeds" });
  }
  const passes = runs.filter((r) => r.pass).length;
  const need = Math.ceil(seeds.length * (challenge.passFraction || 0.6));
  const avgScore = runs.reduce((a, r) => a + (r.score || 0), 0) / runs.length;
  return {
    challenge: challenge.id, title: challenge.title,
    pass: passes >= need, passes, total: seeds.length, needed: need,
    avgScore: Math.round(avgScore * 1000) / 1000,
    ticksUsed: (challenge.hinge.horizon || 9000) * 2 * seeds.length,
    runs: runs.map((r) => ({ seed: r.seed, pass: r.pass, score: Math.round((r.score || 0) * 1000) / 1000, detail: r.detail })),
  };
}

// Practice run for a Hinge challenge: run the doomed world (optionally with the
// player's trigger) on ONE seed and return a readable trajectory + when it fired,
// so the agent can see the collapse and tune its theta before scoring hidden seeds.
function hingeExperiment(challenge, recipe, ticks, seed) {
  const api = loadCore();
  const world = applyRecipe(api, challenge, { config: {}, founders: null }, seed);
  const H = challenge.hinge;
  const trig = (recipe && recipe.trigger) || null;
  const legal = trig ? triggerLegal(challenge, trig) : true;
  const recordEvery = Math.max(H.sampleEvery, Math.floor(ticks / 40));
  const traj = [];
  let fired = false, fireTick = null, done = 0, sinceRecord = 0;
  while (done < ticks) {
    api.step(world, H.sampleEvery);
    done += H.sampleEvery; sinceRecord += H.sampleEvery;
    const s = api.snapshot(world);
    if (!fired && trig && legal) {
      const m = s[trig.metric];
      if (trig.dir === "below" ? m <= trig.theta : m >= trig.theta) { api.setParam(trig.knob, trig.value); fired = true; fireTick = s.tick; }
    }
    if (sinceRecord >= recordEvery || done >= ticks) { traj.push({ tick: s.tick, pop: s.pop, food: s.food, avgEnergy: s.avgEnergy, maxGen: s.maxGen }); sinceRecord = 0; }
  }
  return {
    seed, ticks, ticksUsed: done, trigger: trig, triggerLegal: legal, fired, fireTick,
    trajectory: traj,
    note: trig ? "preview on THIS practice seed; `score` judges hidden seeds. Fire LATE — you must fire after alpha*collapse, and later scores higher."
      : "no trigger: this is the DOOMED baseline — watch WHEN it collapses, then design a trigger that fires late but in time.",
  };
}

// --- PvP: two clans, one shared evolving world -----------------------------
const ARENA = {
  perClanCap: 120, // max founders a clan may field (anti-cheese)
  settleTicks: 6000, // generations of shared evolution before judging
  judgeWindow: 2000, // tail averaged into the verdict
  sampleEvery: 250,
  seeds: [11, 22, 33, 44, 55], // best-of across seeds: rewards robust strategy, not luck
  // Anti-snowball homeostasis: frequency-dependent reproduction (少数方庇护).
  // A clan that dominates the arena brakes its own breeding, so one early edge
  // can't snowball a rival to instant extinction — turning a coin-flip wipeout
  // into a drawn-out contest, while a *systematic* edge still wins (validated
  // in game/snowball.js: symmetric extinction +46%, asymmetric A still 4/5).
  freqDependence: 0.5,
};

function seedClan(api, world, founders, clan) {
  let budget = ARENA.perClanCap;
  for (const f of founders || []) {
    if (budget <= 0) break;
    const n = Math.min(Math.max(0, f.count | 0), budget);
    if (n > 0) api.seedFounders(world, n, f, clan);
    budget -= n;
  }
}

// One match on one seed: seed both clans into a shared arena (no genesis floor,
// so a clan can truly be wiped out), evolve, then judge by average clan
// population over the tail, with biomass as the tie-breaker.
function runMatch(recipeA, recipeB, seed) {
  const api = loadCore();
  const world = api.newArenaWorld(seed);
  if (ARENA.freqDependence > 0) api.setParam("pop.freqDependence", ARENA.freqDependence);
  seedClan(api, world, recipeA.founders, 0);
  seedClan(api, world, recipeB.founders, 1);

  api.step(world, ARENA.settleTicks);
  const samples = [];
  for (let t = 0; t < ARENA.judgeWindow; t += ARENA.sampleEvery) {
    api.step(world, ARENA.sampleEvery);
    samples.push(api.clanSnapshot(world));
  }
  const avg = (k) => samples.reduce((s, x) => s + x[k], 0) / samples.length;
  const popA = avg("popA"), popB = avg("popB"), bioA = avg("bioA"), bioB = avg("bioB");
  let winner;
  if (popA < 0.5 && popB < 0.5) winner = "draw";
  else if (Math.abs(popA - popB) < 1) winner = bioA >= bioB ? "A" : "B";
  else winner = popA > popB ? "A" : "B";
  return {
    seed, winner,
    popA: Math.round(popA), popB: Math.round(popB),
    bioA: Math.round(bioA), bioB: Math.round(bioB),
  };
}

// Tournament across seeds. Clan 0 is seeded first and updates first each tick —
// a real early-race advantage in this winner-take-all world. To cancel that
// position bias, every seed is played BOTH ways (each recipe takes the clan-0
// slot once) and wins are tallied by RECIPE identity, not board position.
function matchScore(recipeA, recipeB) {
  let aWins = 0, bWins = 0;
  const games = [];
  for (const s of ARENA.seeds) {
    const g1 = runMatch(recipeA, recipeB, s); // A as clan 0
    const g2 = runMatch(recipeB, recipeA, s); // B as clan 0
    const r1 = g1.winner === "A" ? "A" : g1.winner === "B" ? "B" : "draw";
    const r2 = g2.winner === "A" ? "B" : g2.winner === "B" ? "A" : "draw"; // remap to recipe identity
    for (const r of [r1, r2]) {
      if (r === "A") aWins++;
      else if (r === "B") bWins++;
    }
    games.push({ seed: s, aAsClan0: r1, bAsClan0: r2 });
  }
  const winner = aWins > bWins ? "A" : bWins > aWins ? "B" : "draw";
  return {
    winner, aWins, bWins, games,
    note: "each seed played both board sides; wins tallied by recipe, so first-mover bias is cancelled",
    arena: { settleTicks: ARENA.settleTicks, perClanCap: ARENA.perClanCap, seeds: ARENA.seeds.length, gamesPlayed: ARENA.seeds.length * 2 },
  };
}

module.exports = { runRecipe, score, experiment, inferenceExperiment, gradeGuess, runHinge, scoreHinge, hingeExperiment, runMatch, matchScore };

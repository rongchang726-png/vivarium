/*
 * Vivarium Game — story builder: turn a recipe into the world's CHRONICLE (the gift).
 * --------------------------------------------------------------------------------
 * The bridge from the richness phase (docs/REDESIGN.md) to the live platform. The
 * chronicle was a local CLI artifact (game/chronicle-run.js); this makes it something
 * an agent who PLAYS over the wire actually RECEIVES — the world handing back its story.
 *
 * It runs ONE logged world from the agent's recipe and renders chronicle.js's
 * faithful god's-eye + second-person story. Optionally it runs ONE reverted world
 * (the same seed, one rule toggled back to baseline) and folds in the MEASURED
 * single-lever counterfactual — the cheap, free-tier-affordable tier of "the ledger".
 *
 * THE COMPUTE WALL (why single-lever, not the CLI's ranked ledger): the full ranked
 * counterfactual re-runs the recipe (levers+1) x seeds times — ~20 long runs, hours on
 * the free tier. That stays the OFFLINE CLI's job (chronicle-run.js). Here the agent
 * gets the story (1 run) plus, if they ask, ONE measured causal edge (2 runs total) —
 * a real measured ledger, not prose, at a cost a free worker_thread can bear.
 *
 * Pure of the wire: returns plain strings + numbers (cloneable across the worker
 * thread). Deterministic: same recipe+seed -> same log -> same story. Core untouched.
 */
const { loadCore } = require("./core-loader");
const { chronicle, summarize } = require("./chronicle");

// The showcase default (BUILD 1+2): terrain lays out two regional niches, a convex
// forage trade-off lets a people split, and the storyteller's rare-severe famines
// punctuate the history. A bare /story call still tells the rich story.
const RICHNESS = {
  knobs: { "biome.enabled": true, "food.types": 2, "food.forageSpecialization": 1.2, "storyteller.enabled": true },
  founders: [],
  arena: false,
};

const MAX_TICKS = 20000;     // a wedged-worker guard pairs with the server's MAX_JOB_MS
const DEFAULT_TICKS = 10000; // past warmup+first famine cadence: even the default earns a chapter
const MAX_FOUNDERS = 2000;
const STEP_CHUNK = 1000;     // step in chunks ONLY to emit progress; bit-identical to one big step

function dottedGet(o, p) { const a = p.split("."); let x = o; for (const k of a) { if (x == null) return undefined; x = x[k]; } return x; }

// A recipe is the agent's world: CONFIG knob overrides + founders (+ arena flag). An
// omitted/empty recipe falls back to the richness showcase so a zero-arg call still sings.
function normalizeRecipe(recipe) {
  const has = recipe && (recipe.knobs || recipe.founders || recipe.arena != null);
  const r = has ? recipe : RICHNESS;
  const knobs = r.knobs || {};
  const founders = r.founders || [];
  let total = 0;
  for (const f of founders) total += (f.count || 0);
  if (total > MAX_FOUNDERS) throw new Error("too many founders (" + total + " > " + MAX_FOUNDERS + ")");
  return { knobs, founders, arena: !!r.arena };
}

function buildWorld(api, recipe, seed, cfOverride) {
  for (const k in recipe.knobs) {
    if (dottedGet(api.CONFIG, k) === undefined) throw new Error("unknown knob: " + k);
    api.setParam(k, recipe.knobs[k]);
  }
  if (cfOverride) api.setParam(cfOverride.knob, cfOverride.value);
  const w = recipe.arena ? api.newArenaWorldLogged(seed) : api.newWorldLogged(seed);
  for (const fdr of recipe.founders) api.seedFounders(w, fdr.count || 0, fdr.spec || null, fdr.clan || 0);
  return w;
}

function stepWithProgress(api, w, ticks, base, total, onProgress) {
  let done = 0;
  while (done < ticks) {
    const n = Math.min(STEP_CHUNK, ticks - done);
    api.step(w, n);
    done += n;
    if (onProgress) onProgress({ done: base + done, total, unit: "ticks" });
  }
}

// describeDelta / buildCf: shape the single counterfactual the way chronicle.js's
// renderCounterfactual expects. (A small pure mirror of chronicle-run.js's helper —
// kept here so story.js is self-contained and the server need not load a CLI script.)
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
function pctOf(x) { return Math.round((x || 0) * 100) + "%"; }

// The served single-lever counterfactual. Crucially it measures the FORK (the outcome a
// richness world is ABOUT — its narrative climax), not only population — so the measured edge
// and the story AGREE (BUILD 4's fix, carried into this served tier; the CLI ranked-ledger had
// it, the served single-cf did not, and dogfooding caught the mismatch). The pop/diet delta is
// kept as secondary context.
function buildCf(knob, you, baseline, youSum, baseSum, naive) {
  const youFork = youSum.forkFrac || 0, baseFork = baseSum.forkFrac || 0;
  const youForked = (youSum.forkSamples || 0) > 0 && youFork >= 0.05; // the fork actually formed in YOUR world
  let forkLine = null, forkKilled = false;
  if (youForked) {
    if (baseFork < 0.01) {
      forkLine = "Without it, the two foraging peoples never split apart — with your recipe they each held over a third of the world for " + pctOf(youFork) + " of the run; reverted, " + pctOf(baseFork) + ".";
      forkKilled = true;
    } else if (baseFork < youFork * 0.5) {
      forkLine = "The split into two foraging peoples barely held without it (sustained " + pctOf(baseFork) + " of the run vs your " + pctOf(youFork) + ").";
    } else {
      forkLine = "Two foraging peoples sustained either way (" + pctOf(baseFork) + " of the run vs your " + pctOf(youFork) + ") — this lever was not what split them.";
    }
  }
  return {
    knob, you, baseline,
    bothCollapsed: youSum.collapsed && baseSum.collapsed,
    youOutcome: youSum.line, baselineOutcome: baseSum.line,
    youPop: youSum.pop, basePop: baseSum.pop,
    delta: describeDelta(youSum, baseSum),
    naive: naive || undefined,
    forkLine, forkKilled,
    youFork: +youFork.toFixed(3), baseFork: +baseFork.toFixed(3),
  };
}

// buildStory(opts, onProgress) -> { story, facts, summary, seed, ticks, recipe, counterfactual }
//   opts: { recipe?, seed?, ticks?, counterfactual?:{knob, baseline?, naive?} }
function buildStory(opts, onProgress) {
  opts = opts || {};
  const recipe = normalizeRecipe(opts.recipe);
  const seed = (opts.seed != null) ? (opts.seed | 0) : 7;
  let ticks = (opts.ticks != null) ? (opts.ticks | 0) : DEFAULT_TICKS;
  if (ticks < 1) ticks = 1;
  if (ticks > MAX_TICKS) ticks = MAX_TICKS;

  // an untouched CONFIG: the defaults a counterfactual reverts to + the world dims
  const defApi = loadCore();

  const cfReq = opts.counterfactual && opts.counterfactual.knob ? opts.counterfactual : null;
  const total = ticks * (cfReq ? 2 : 1);

  // the STORY world (one seed)
  const api = loadCore();
  const w = buildWorld(api, recipe, seed, null);
  stepWithProgress(api, w, ticks, 0, total, onProgress);
  const youSum = summarize(w.eventLog);

  const meta = {
    seed,
    recipe: recipe.knobs,
    worldW: defApi.CONFIG.world.width,
    worldH: defApi.CONFIG.world.height,
  };

  // optional single-lever MEASURED counterfactual (the cheap ledger tier: 1 extra run)
  if (cfReq) {
    const knob = cfReq.knob;
    if (dottedGet(defApi.CONFIG, knob) === undefined) throw new Error("unknown counterfactual knob: " + knob);
    const baseline = (cfReq.baseline != null) ? cfReq.baseline : dottedGet(defApi.CONFIG, knob);
    const youVal = (recipe.knobs[knob] != null) ? recipe.knobs[knob] : dottedGet(defApi.CONFIG, knob);
    const bApi = loadCore();
    const bw = buildWorld(bApi, recipe, seed, { knob, value: baseline });
    stepWithProgress(bApi, bw, ticks, ticks, total, onProgress);
    const baseSum = summarize(bw.eventLog);
    meta.counterfactual = buildCf(knob, youVal, baseline, youSum, baseSum, cfReq.naive);
  }

  const out = chronicle(w.eventLog, meta);
  const story = out.whatYouMade + "\n\n" + out.narrative + "\n\n" + out.closing;
  return {
    story,
    facts: out.facts,
    summary: {
      line: youSum.line, pop: youSum.pop, collapsed: youSum.collapsed,
      forkFrac: youSum.forkFrac, forkSamples: youSum.forkSamples, peakSplit: youSum.peakSplit,
    },
    seed, ticks, recipe: recipe.knobs,
    counterfactual: meta.counterfactual
      ? {
          knob: meta.counterfactual.knob, you: meta.counterfactual.you, baseline: meta.counterfactual.baseline,
          // the MEASURED edge, structured (not just prose): the fork the story is about + the pop context
          youFork: meta.counterfactual.youFork, baseFork: meta.counterfactual.baseFork, forkKilled: meta.counterfactual.forkKilled,
          youPop: meta.counterfactual.youPop, basePop: meta.counterfactual.basePop,
        }
      : null,
  };
}

module.exports = { buildStory, RICHNESS };

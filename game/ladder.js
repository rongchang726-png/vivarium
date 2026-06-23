/*
 * Vivarium Game — content ladder (Phase 2 of the "reason to stay" arc).
 * --------------------------------------------------------------------------
 * Turns the fixed challenge set into an ENDLESS, deterministic difficulty ladder,
 * so an improving agent never hits "done with all the puzzles". Each PvE tuning
 * challenge becomes a FAMILY; an INSTANCE is generated from (family, difficulty,
 * season) by sliding the family's REAL demands along a single difficulty axis:
 *   - the goal threshold      (harder targets — bigger pops, narrower bands, …),
 *   - the sustain window      (longer — goalWindow scales up),
 *   - the experiment budget   (smaller — less room to fish),
 *   - the hidden seed count + passFraction (must generalize across more worlds).
 * Everything else — the mechanic and the tunable-knob whitelist — is inherited
 * verbatim from the base challenge (single source of truth in challenges.js).
 *
 * Difficulty plugs straight into rating.js (difficultyToRatingD), so the ladder's
 * difficulty axis and the skill-rating axis are literally ONE axis: a frontier
 * instance for rating R is just the difficulty whose rating-scale value sits near
 * R (served a touch easier so expected-pass lands ~0.6, per the content spec).
 *
 * Anti-overfit (the same black-box ethos as the server): practice seeds are PUBLIC
 * and live in [0, 500k); hidden scoring seeds live in [500k, 1M), are salted by a
 * season-versioned secret, and MUST NOT cross the wire — the server runs
 * engine.score on them server-side and returns only the verdict. publicView()
 * deliberately omits scoringSeeds and the evaluate function. The two seed ranges
 * are disjoint by construction, so a practice world can never be a scoring world.
 *
 * Pure game-layer (Node only; crypto for the deterministic hash). The DOM-free sim
 * core is untouched — this module only computes CONFIG/goal PARAMETERS; it draws
 * no RNG and changes no physics, so the determinism hash (4244329615) is unaffected.
 */

const crypto = require("crypto");
const { challenges } = require("./challenges");
const { difficultyToRatingD } = require("./rating");

// Tier → difficulty anchors (from Codex's content-ladder spec; rating.js cites
// the same numbers). Difficulty is continuous; tiers are just named bands.
const TIER_DIFFICULTY = { bronze: 0.25, gold: 0.58, diamond: 0.88 };
const DIFF_MIN = 0.15, DIFF_MAX = 0.95;

// Season-versioned secret salt for the HIDDEN seed pack. Overridable per season
// via env (never committed). Rotating it rotates every hidden world, so a recipe
// overfit to last season's hidden seeds doesn't carry over.
const PACK_SALT = process.env.VIVARIUM_SEED_SALT || "vivarium-hidden-v1";

// --- small deterministic helpers --------------------------------------------
function stableInt(...parts) {
  const h = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return parseInt(h.slice(0, 12), 16);
}
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a, b, t) => a + (b - a) * t;
const round250 = (x) => Math.max(250, Math.round(x / 250) * 250);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fracOf = (xs, p) => (xs.length ? xs.filter(p).length / xs.length : 0);

// --- per-family difficulty profiles -----------------------------------------
// Each family names the base challenge it scales (for tunable/settle/window/
// bounty/title), a targets(d) that produces the numeric goal, and a
// makeEvaluate(targets) that rebuilds the base challenge's predicate around it.
const FAMILIES = {
  bloom: {
    base: "bloom",
    // Target range calibrated against the MEASURED achievable band (weak recipe
    // ≈ 147, default ≈ 338, optimized food ≈ 756 ceiling): easy sits near the
    // floor (a default recipe passes — a gentle tutorial tier), diamond sits near
    // the ceiling (only a well-tuned food economy passes). A target range below
    // carrying capacity would make difficulty cosmetic; this makes it bite.
    targets: (d) => ({ pop: Math.round(lerp(200, 690, d)) }),
    makeEvaluate: (t) => (samples) => {
      const pops = samples.map((s) => s.pop);
      const avg = mean(pops);
      const alive = pops.every((p) => p >= 1);
      return {
        pass: alive && avg >= t.pop,
        score: Math.min(1, avg / t.pop) * (alive ? 1 : 0),
        detail: "avgPop=" + avg.toFixed(0) + "/" + t.pop + " alive=" + alive,
      };
    },
    brief: (t) => "Establish a self-sustaining population averaging ≥ " + t.pop + " across the window, never going extinct.",
  },

  goldilocks: {
    base: "goldilocks",
    targets: (d) => {
      const center = 160, half = Math.round(lerp(50, 20, d));
      return { lo: center - half, hi: center + half, frac: 0.8 };
    },
    makeEvaluate: (t) => (samples) => {
      const inBand = fracOf(samples, (s) => s.pop >= t.lo && s.pop <= t.hi);
      return { pass: inBand >= t.frac, score: inBand, detail: "inBand[" + t.lo + "," + t.hi + "]=" + (inBand * 100).toFixed(0) + "%" };
    },
    brief: (t) => "Hold population inside [" + t.lo + ", " + t.hi + "] for ≥ " + Math.round(t.frac * 100) + "% of the window.",
  },

  giants: {
    base: "giants",
    // radius calibrated against the measured range (default evolves to ≈3.6, a
    // big-favoured economy reaches ≈6.2, a strong one ≈9.0 near the 9.5 cap):
    // [4.0,6.3] sits inside it — easy needs moderate re-engineering (default 3.6
    // fails), diamond needs a strong one (reachable with margin). pop floor is kept
    // conservative because giants is a DOUBLE constraint (big bodies AND population)
    // and big-bodied worlds run leaner — a high pop floor could make it unreachable
    // even when the radius is hit. (radius is measured; the pop floor is a safe under-set.)
    targets: (d) => ({ radius: +lerp(4.0, 6.3, d).toFixed(2), pop: Math.round(lerp(55, 95, d)), frac: 0.8 }),
    makeEvaluate: (t) => (samples) => {
      const ok = fracOf(samples, (s) => s.avgRadius >= t.radius && s.pop >= t.pop);
      const avgR = mean(samples.map((s) => s.avgRadius));
      return { pass: ok >= t.frac, score: Math.min(1, avgR / t.radius), detail: "avgRadius=" + avgR.toFixed(2) + "/" + t.radius + " windowOK=" + (ok * 100).toFixed(0) + "%" };
    },
    brief: (t) => "Evolve an average body radius ≥ " + t.radius + " (of 9.5) with population ≥ " + t.pop + ".",
  },

  pacifism: {
    base: "pacifism",
    // Calibrated against the measured achievable predation range (default ≈ 0.136,
    // a gentle de-fang ≈ 0.065, a hard-pacified world ≈ 0.054 floor): easy needs a
    // light touch (below default), hard needs strong pacification but keeps a margin
    // above the 0.054 floor so a clean win isn't a knife-edge. pop floor stays
    // reachable (a pacified, well-fed world sustains a healthy population).
    targets: (d) => ({ pred: +lerp(0.12, 0.065, d).toFixed(3), pop: Math.round(lerp(115, 175, d)), frac: 0.8 }),
    makeEvaluate: (t) => (samples) => {
      const ok = fracOf(samples, (s) => s.predationRate <= t.pred && s.pop >= t.pop);
      const avgPred = mean(samples.map((s) => s.predationRate));
      return { pass: ok >= t.frac, score: ok, detail: "avgPredRate=" + avgPred.toFixed(3) + "≤" + t.pred + " windowOK=" + (ok * 100).toFixed(0) + "%" };
    },
    brief: (t) => "Keep predation ≤ " + t.pred + " kills/tick with population ≥ " + t.pop + ", and have evolution hold it there.",
  },
};
// NOTE: foodweb is deliberately NOT a ladder family. It's the unsolved GRAND
// CHALLENGE (carn/herb coexistence) — measured carn% stays 0 even under a
// carcass+bite recipe, so every difficulty tier would be unreachable and an agent
// served it on the frontier would just lose rating on an impossible task. It stays
// a FIXED challenge in challenges.js (bounty 1500) for anyone who wants to try the
// open problem; the endless ladder only contains families that are actually solvable
// across their difficulty range.

const FAMILY_NAMES = Object.keys(FAMILIES);

// --- difficulty → instance scaling (all RELATIVE to the base challenge) ------
function windowFor(base, d) { return round250(base.goalWindow * lerp(0.85, 1.25, d)); }
function budgetFor(base, d) { return Math.round(base.budget * lerp(1.15, 0.7, d)); }
function bountyFor(base, d) { return Math.round(base.bounty * (0.6 + 0.8 * d)); }
function passFractionFor(d) { return +clamp(lerp(0.6, 0.85, d), 0.5, 0.9).toFixed(2); }
function hiddenSeedCount(d) { return Math.round(lerp(4, 8, d)); }

function tierForDifficulty(d) { return d < 0.42 ? "bronze" : d < 0.74 ? "gold" : "diamond"; }

// Public practice seeds (∈ [0,500k)) and hidden scoring seeds (∈ [500k,1M)).
// Disjoint ranges ⇒ a practice world is provably never a scoring world.
function practiceSeeds(family, season, instanceId) {
  return [0, 1, 2].map((i) => stableInt("practice", family, season, instanceId, i) % 500000);
}
function hiddenSeeds(family, tier, season, d, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(500000 + (stableInt("hidden", PACK_SALT, family, tier, season, d.toFixed(3), i) % 500000));
  return out;
}

// Generate a concrete, PLAYABLE instance (drop-in for engine.score/experiment).
function instanceByDifficulty(family, difficulty, opts) {
  opts = opts || {};
  const fam = FAMILIES[family];
  if (!fam) throw new Error("unknown ladder family: " + family);
  const base = challenges[fam.base];
  const d = +clamp(difficulty, DIFF_MIN, DIFF_MAX).toFixed(3);
  const season = opts.season != null ? opts.season : 1;
  const tier = opts.tier || tierForDifficulty(d);
  const instanceId = family + ":" + tier + ":s" + season + ":d" + d.toFixed(3);

  const targets = fam.targets(d);
  const n = hiddenSeedCount(d);

  return {
    // identity / scoring scale
    id: family,
    instanceId,
    ref: "ladder:" + family + ":" + d.toFixed(3) + ":" + season, // wire handle (server+worker resolvable)
    family,
    tier,
    difficulty: d,
    ratingD: difficultyToRatingD(d),
    season,
    hiddenSeedPack: "pack-" + stableInt(PACK_SALT, family, tier, season).toString(36),
    // presentation
    title: cap(family) + " · " + cap(tier),
    brief: fam.brief(targets),
    goal: fam.brief(targets),
    targets,
    tunable: base.tunable.slice(),
    // run parameters (engine reads these)
    settleTicks: base.settleTicks,
    goalWindow: windowFor(base, d),
    budget: budgetFor(base, d),
    bounty: bountyFor(base, d),
    passFraction: passFractionFor(d),
    practiceSeeds: practiceSeeds(family, season, instanceId),
    scoringSeeds: hiddenSeeds(family, tier, season, d, n), // SERVER-SIDE ONLY
    evaluate: fam.makeEvaluate(targets),
  };
}

// Convenience: generate by named tier (bronze/gold/diamond).
function instanceByTier(family, tier, opts) {
  const d = TIER_DIFFICULTY[tier];
  if (d == null) throw new Error("unknown tier: " + tier);
  return instanceByDifficulty(family, d, Object.assign({}, opts, { tier }));
}

// The wire-safe view: everything a player needs to reason and submit, with the
// hidden seeds and the predicate function stripped out.
function publicView(inst) {
  const { scoringSeeds, evaluate, ...safe } = inst;
  return Object.assign({}, safe, { hiddenSeedCount: scoringSeeds.length });
}

// Difficulty whose expected-pass for `rating` equals p (default 0.6), so the
// agent is served a touch below its rating — the "near 55-65%" frontier policy.
// expectedPass = sigmoid((rating - D)/240) = p  ⇒  D = rating - 240·ln(p/(1-p)).
function difficultyForExpectedPass(rating, p) {
  p = p == null ? 0.6 : clamp(p, 0.05, 0.95);
  const D = rating - 240 * Math.log(p / (1 - p));
  return +clamp((D - 1050) / 1100, DIFF_MIN, DIFF_MAX).toFixed(3);
}

// Serve an instance near the agent's frontier. Family is rotated deterministically
// (by rating band + season) so the ladder doesn't always hand out the same family.
function recommendFrontier(rating, opts) {
  opts = opts || {};
  const p = opts.expectedPass != null ? opts.expectedPass : 0.6;
  const d = difficultyForExpectedPass(rating, p);
  const family = opts.family || FAMILY_NAMES[stableInt("frontier", Math.round(rating / 25), opts.season || 1) % FAMILY_NAMES.length];
  const inst = instanceByDifficulty(family, d, { season: opts.season });
  inst.frontierReason = "served near " + Math.round(p * 100) + "% expected pass for rating " + Math.round(rating);
  return inst;
}

// A frontier MIX, per the content spec: mostly at-frontier, a confidence builder
// below, and a stretch above. Three distinct families so it reads as variety.
function frontierMix(rating, opts) {
  opts = opts || {};
  const season = opts.season || 1;
  // Pick DISTINCT families (deterministically) from a rotating start, so the mix
  // reads as variety — not the same challenge twice at different difficulties.
  const start = stableInt("mix", Math.round(rating / 25), season) % FAMILY_NAMES.length;
  const fams = [];
  for (let i = 0; i < FAMILY_NAMES.length && fams.length < 3; i++) fams.push(FAMILY_NAMES[(start + i) % FAMILY_NAMES.length]);
  const roles = [
    { role: "frontier", expectedPass: 0.6 },
    { role: "confidence", expectedPass: 0.78 },
    { role: "stretch", expectedPass: 0.4 },
  ];
  return roles.map((r, i) => Object.assign(recommendFrontier(rating, { season, family: fams[i % fams.length], expectedPass: r.expectedPass }), { role: r.role }));
}

// --- wire ref: the opaque-ish handle an agent passes back ---------------------
// Format: "ladder:<family>:<difficulty(3dp)>:<season>". All PUBLIC info — the
// difficulty and family are not secret (the hidden SEEDS are, and they derive
// from PACK_SALT, which the ref does NOT contain). Both the server and the sim
// worker resolve a ref to the SAME instance (difficulty round-trips through the
// same rounding), so a ladder challenge can be reconstructed on either side
// without ever serializing the evaluate() closure across the thread boundary.
function instanceRef(family, difficulty, season) {
  return "ladder:" + family + ":" + (+clamp(difficulty, DIFF_MIN, DIFF_MAX)).toFixed(3) + ":" + (season || 1);
}
function parseRef(ref) {
  if (typeof ref !== "string") return null;
  const m = ref.split(":");
  if (m.length !== 4 || m[0] !== "ladder" || !FAMILIES[m[1]]) return null;
  const difficulty = parseFloat(m[2]);
  const season = parseInt(m[3], 10);
  if (!Number.isFinite(difficulty) || !Number.isInteger(season) || season < 1) return null;
  return { family: m[1], difficulty: clamp(difficulty, DIFF_MIN, DIFF_MAX), season };
}
function resolveRef(ref) {
  const p = parseRef(ref);
  if (!p) throw new Error("bad ladder ref '" + ref + "'; expected ladder:<family>:<difficulty>:<season> with family in [" + FAMILY_NAMES.join(", ") + "]");
  return instanceByDifficulty(p.family, p.difficulty, { season: p.season });
}

module.exports = {
  TIER_DIFFICULTY, DIFF_MIN, DIFF_MAX, FAMILY_NAMES,
  instanceByDifficulty, instanceByTier, publicView,
  difficultyForExpectedPass, recommendFrontier, frontierMix,
  instanceRef, parseRef, resolveRef,
};

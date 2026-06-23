/*
 * Vivarium Game — the inference challenge ("What Changed?").
 *
 * Unlike the tuning challenges (where YOU set the knobs), here the game has
 * secretly moved exactly one rule from its default, and you must deduce which —
 * and to what value — purely by experimenting on the altered world and comparing
 * it to the default. It's the game's purest test of experimental reasoning.
 *
 * The secret is derived deterministically from a per-attempt nonce (generated at
 * `start`, stored in the gitignored session file). Grading re-derives it from
 * the same nonce. In this local build the spirit is "deduce it, don't read it
 * off disk"; a server build would hold the nonce out of reach for real.
 *
 * Each candidate knob is chosen so that moving it leaves a *distinguishable*,
 * monotone fingerprint across the observable metrics — so the puzzle is solvable
 * by careful comparison, not luck.
 */

// Small standalone PRNG (mulberry32) so this module needs nothing from the core.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The knobs the game might move, each with the fingerprint it leaves. Shown to
// the player; the value moved and the amount are NOT.
const CANDIDATES = [
  {
    knob: "food.spawnPerTick",
    signal: "standing food count moves a lot, and population follows it the same way; average energy stays roughly put.",
  },
  {
    knob: "food.energy",
    signal: "population and average energy rise (or fall) together; standing food tends to move the OTHER way.",
  },
  {
    knob: "creature.metabBase",
    signal: "average energy and population fall together when it rises (and food piles up as the population thins); predation barely moves.",
  },
  {
    knob: "creature.biteDamage",
    signal: "predation rate and bite rate change, while population and food are barely touched.",
  },
];

const KNOBS = CANDIDATES.map((c) => c.knob);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

// Difficulty-scaled inference parameters. Like the tuning ladder, inference scales
// along ONE difficulty axis that IS the rating scale (ratingD = 1050 + d*1100, the
// same map as rating.difficultyToRatingD): an EASIER puzzle uses a more EXTREME
// factor (a big, obvious shove) and a WIDER tolerance; a HARDER one uses a factor
// near 1 (a subtle nudge that's hard to spot) and a tighter tolerance — plus less
// budget and a bigger bounty. The candidate SET is unchanged (all fingerprints are
// still shown); the difficulty lives in how subtle the change is and how precisely
// you must pin its value.
function inferenceParams(difficulty) {
  const d = clamp01(difficulty == null ? 0.5 : difficulty);
  return {
    difficulty: +d.toFixed(3),
    tolerance: +lerp(0.4, 0.15, d).toFixed(3),
    ratingD: 1050 + d * 1100,
    budget: Math.round(70000 * lerp(1.15, 0.7, d)),
    bounty: Math.round(200 * (0.6 + 0.8 * d)),
  };
}

// Derive the hidden perturbation for an attempt from its nonce (+ difficulty).
// Exactly one knob is multiplied by a factor that, on EASY, sits clearly away from
// 1 (a visible shove) and, on HARD, hugs 1 (a subtle nudge). Default d=0.5 keeps the
// historical "clearly off" feel for the CLI, which passes no difficulty.
function deriveMystery(nonce, difficulty) {
  const d = clamp01(difficulty == null ? 0.5 : difficulty);
  const r = mulberry32(nonce);
  const knob = KNOBS[Math.floor(r() * KNOBS.length)];
  const big = r() < 0.5;
  const u = r();
  let factor;
  if (big) factor = lerp(2.6, 1.3, d) + u * lerp(1.0, 0.25, d); // easy ~[2.6,3.6], hard ~[1.3,1.55]
  else factor = lerp(0.30, 0.62, d) + u * lerp(0.15, 0.12, d); // easy ~[0.30,0.45], hard ~[0.62,0.74]
  return { knob, factor };
}

module.exports = { CANDIDATES, KNOBS, deriveMystery, inferenceParams };

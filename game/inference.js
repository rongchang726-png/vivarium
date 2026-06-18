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

// Derive the hidden perturbation for an attempt from its nonce. Exactly one knob
// is multiplied by a factor that is clearly below (≈0.35–0.6) or above
// (≈1.8–3.0) its default — a visible but not world-breaking shove.
function deriveMystery(nonce) {
  const r = mulberry32(nonce);
  const knob = KNOBS[Math.floor(r() * KNOBS.length)];
  const big = r() < 0.5;
  const factor = big ? 1.8 + r() * 1.2 : 0.35 + r() * 0.25;
  return { knob, factor };
}

module.exports = { CANDIDATES, KNOBS, deriveMystery };

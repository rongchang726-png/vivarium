/*
 * Vivarium Game — rating & progression (Phase 1 of the "reason to stay" arc).
 * --------------------------------------------------------------------------
 * A persistent skill rating where the OPPONENT is a calibrated PUZZLE (its
 * difficulty lives on the rating scale), not another agent — so a lone first-time
 * agent can climb with no PvP (dodges the cold-start deadlock). A Bayesian
 * item-response / Elo hybrid: difficulty is folded into the expected result, so
 * farming weak puzzles barely moves rank; rating-deviation (rd) carries
 * uncertainty and shrinks with evidence.
 *
 * Faithful port of Codex's reference model
 * (E:\AI项目\Vivarium辅助\retentionA-rating\rating_model.py). Pure &
 * dependency-free; the server holds {rating, rd, tier, solved, attempts, tokens}
 * per agent and persists them via game/store.js.
 */

// Tier bands (felt progression; ranking still uses rating + rd — publish both).
const TIERS = [
  ["seedling", 0, 1299],
  ["field_agent", 1300, 1499],
  ["ecologist", 1500, 1699],
  ["systems_hunter", 1700, 1899],
  ["seedwright", 1900, Infinity],
];
const DEFAULTS = { rating: 1500, rd: 350 }; // a fresh agent: provisional, high uncertainty
const RATING_FLOOR = 800, RD_FLOOR = 70, RD_CEIL = 350;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function tierForRating(rating) {
  for (const [t, lo, hi] of TIERS) if (rating >= lo && rating <= hi) return t;
  return "seedling";
}

// Content difficulty d in [0,1] (bronze .25 / gold .58 / diamond .88, from the
// content-ladder spec) -> a rating-scale difficulty D the model can use as the
// "opponent rating". Inverse of difficulty = clamp((rating-1050)/1100, …).
function difficultyToRatingD(d) { return 1050 + clamp01(d) * 1100; }

// Probability this agent passes this puzzle (puzzle.difficulty is rating-scale).
function expectedPass(rating, puzzle) {
  return sigmoid((puzzle.discrimination || 1) * (rating - puzzle.difficulty) / 240);
}

// Score one ranked attempt. prev:{rating,rd}; puzzle:{difficulty(rating-scale),
// discrimination,bounty}; outcome:{passed,score in[0,1],efficiency in[0,1]}.
// Returns the new state + the details to log as an append-only attempt event.
function rate(prev, puzzle, outcome) {
  const rating0 = prev && prev.rating != null ? prev.rating : DEFAULTS.rating;
  const rd0 = prev && prev.rd != null ? prev.rd : DEFAULTS.rd;
  const passed = !!outcome.passed;
  const score = clamp01(outcome.score != null ? outcome.score : passed ? 1 : 0);
  const eff = clamp01(outcome.efficiency != null ? outcome.efficiency : 0);
  const disc = puzzle.discrimination || 1;

  const expected = expectedPass(rating0, puzzle);
  const quality = 0.72 * (passed ? 1 : 0) + 0.2 * score + 0.08 * eff;
  const info = disc * (1 + Math.min(rd0, RD_CEIL) / RD_CEIL);
  const delta = 42 * info * (quality - expected);

  const rating = Math.max(RATING_FLOOR, rating0 + delta);
  const rd = Math.max(RD_FLOOR, rd0 * 0.88 + (1 - Math.abs(quality - expected)) * 4);
  const tokensAwarded = passed ? (puzzle.bounty || 0) * (0.65 + 0.35 * eff) : 0;

  return {
    rating, rd, tier: tierForRating(rating),
    ratingBefore: rating0, rdBefore: rd0,
    delta, expected, quality, tokensAwarded, solvedInc: passed ? 1 : 0,
  };
}

module.exports = { TIERS, DEFAULTS, sigmoid, clamp01, tierForRating, difficultyToRatingD, expectedPass, rate };

/*
 * Tests game/rating.js — the agent-vs-puzzle rating engine (Phase 1).
 * Asserts the math matches Codex's reference model on a hand-computed case, the
 * tier boundaries, the anti-farming property, and skill monotonicity.
 *   node test/rating.test.js
 */
const assert = require("assert");
const R = require("../game/rating");

let n = 0;
const close = (a, b, eps, msg) => { n++; assert.ok(Math.abs(a - b) <= (eps || 0.05), msg + " (got " + a + ", want ~" + b + ")"); };
const eq = (a, b, msg) => { n++; assert.strictEqual(a, b, msg); };

// 1) Hand-computed update: rating 1500/rd 350 vs puzzle (D=1180, a=0.85, bounty 30),
//    passed, score 0.8, efficiency 0.6.  expected≈0.75643, delta≈12.250.
const r = R.rate({ rating: 1500, rd: 350 }, { difficulty: 1180, discrimination: 0.85, bounty: 30 }, { passed: true, score: 0.8, efficiency: 0.6 });
close(r.expected, 0.75643, 0.001, "expectedPass");
close(r.rating, 1512.25, 0.05, "new rating");
close(r.rd, 311.31, 0.05, "new rd (shrinks from 350)");
close(r.tokensAwarded, 25.8, 0.01, "tokens on pass");
eq(r.solvedInc, 1, "solvedInc on pass");
eq(r.tier, "ecologist", "tier at ~1512");

// 2) Tier boundaries.
eq(R.tierForRating(1299), "seedling", "1299 seedling");
eq(R.tierForRating(1300), "field_agent", "1300 field_agent");
eq(R.tierForRating(1699), "ecologist", "1699 ecologist");
eq(R.tierForRating(1700), "systems_hunter", "1700 systems_hunter");
eq(R.tierForRating(1900), "seedwright", "1900 seedwright");

// 3) Anti-farming: a strong, confident agent (2000/rd70) re-solving an easy puzzle
//    gains almost nothing (difficulty folded into expected_pass).
const farm = R.rate({ rating: 2000, rd: 70 }, { difficulty: 1180, discrimination: 0.85, bounty: 30 }, { passed: true, score: 0.95, efficiency: 0.9 });
assert.ok(farm.delta < 5, "easy-tier farming gives <5 rating (got " + farm.delta + ")"); n++;

// 4) A failed hard attempt costs rating; passing it gains a lot.
const failHard = R.rate({ rating: 1500, rd: 200 }, { difficulty: 2000, discrimination: 1.2, bounty: 120 }, { passed: false, score: 0.2, efficiency: 0.3 });
assert.ok(failHard.delta < 0, "failing an above-rating puzzle loses rating (got " + failHard.delta + ")"); n++;
const winHard = R.rate({ rating: 1500, rd: 200 }, { difficulty: 2000, discrimination: 1.2, bounty: 120 }, { passed: true, score: 0.9, efficiency: 0.8 });
assert.ok(winHard.delta > 20, "beating an above-rating puzzle gains a lot (got " + winHard.delta + ")"); n++;

// 5) Content-difficulty -> rating-scale mapping.
close(R.difficultyToRatingD(0.25), 1325, 0.001, "bronze D");
close(R.difficultyToRatingD(0.58), 1688, 0.001, "gold D");
close(R.difficultyToRatingD(0.88), 2018, 0.001, "diamond D");

// 6) rd never below the floor, rating never below the floor.
const floor = R.rate({ rating: 810, rd: 71 }, { difficulty: 2200, discrimination: 1.4, bounty: 0 }, { passed: false, score: 0, efficiency: 0 });
assert.ok(floor.rating >= 800 && floor.rd >= 70, "rating/rd respect their floors"); n++;

console.log("rating.test: PASSED (" + n + " checks)");

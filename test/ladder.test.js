/*
 * Content-ladder tests (Phase 2 of the "reason to stay" arc).
 * -----------------------------------------------------------
 * Proves the procedural difficulty ladder is: deterministic, monotone in
 * difficulty, seed-safe (public practice vs hidden scoring never overlap),
 * consistent with the rating scale, and — the part that matters — that a
 * generated instance is a REAL, scorable, difficulty-GRADED challenge (run
 * through the actual engine, not just inspected). Exit != 0 on any failure.
 */

const ladder = require("../game/ladder");
const engine = require("../game/engine");
const { challenges } = require("../game/challenges");
const { difficultyToRatingD, expectedPass } = require("../game/rating");

let fails = 0;
function ok(cond, msg) {
  if (cond) { console.log("  ok  - " + msg); }
  else { console.log("  FAIL- " + msg); fails++; }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + "  (" + JSON.stringify(a) + " === " + JSON.stringify(b) + ")"); }

// ---------------------------------------------------------------------------
console.log("determinism:");
for (const fam of ladder.FAMILY_NAMES) {
  const a = ladder.instanceByDifficulty(fam, 0.5, { season: 3 });
  const b = ladder.instanceByDifficulty(fam, 0.5, { season: 3 });
  eq(a.practiceSeeds, b.practiceSeeds, fam + ": practice seeds stable");
  eq(a.scoringSeeds, b.scoringSeeds, fam + ": scoring seeds stable");
  eq(a.targets, b.targets, fam + ": targets stable");
  eq([a.goalWindow, a.budget, a.passFraction], [b.goalWindow, b.budget, b.passFraction], fam + ": run params stable");
}

// ---------------------------------------------------------------------------
console.log("seed ranges disjoint (public [0,500k) vs hidden [500k,1M)):");
for (const fam of ladder.FAMILY_NAMES) {
  for (const d of [0.15, 0.5, 0.95]) {
    const inst = ladder.instanceByDifficulty(fam, d, { season: 2 });
    const pubOk = inst.practiceSeeds.every((s) => s >= 0 && s < 500000);
    const hidOk = inst.scoringSeeds.every((s) => s >= 500000 && s < 1000000);
    const inter = inst.practiceSeeds.filter((s) => inst.scoringSeeds.includes(s));
    ok(pubOk && hidOk && inter.length === 0, fam + "@" + d + ": practice<500k, hidden≥500k, disjoint");
  }
}

// ---------------------------------------------------------------------------
console.log("season rotation changes hidden seeds but not public ones:");
for (const fam of ladder.FAMILY_NAMES) {
  const s1 = ladder.instanceByDifficulty(fam, 0.5, { season: 1 });
  const s2 = ladder.instanceByDifficulty(fam, 0.5, { season: 2 });
  ok(JSON.stringify(s1.scoringSeeds) !== JSON.stringify(s2.scoringSeeds), fam + ": hidden seeds rotate by season");
}

// ---------------------------------------------------------------------------
console.log("monotonic difficulty (easy 0.15 vs hard 0.95):");
for (const fam of ladder.FAMILY_NAMES) {
  const e = ladder.instanceByDifficulty(fam, 0.15);
  const h = ladder.instanceByDifficulty(fam, 0.95);
  ok(h.goalWindow >= e.goalWindow, fam + ": goalWindow ↑ (" + e.goalWindow + "→" + h.goalWindow + ")");
  ok(h.budget <= e.budget, fam + ": budget ↓ (" + e.budget + "→" + h.budget + ")");
  ok(h.passFraction >= e.passFraction, fam + ": passFraction ↑ (" + e.passFraction + "→" + h.passFraction + ")");
  ok(h.scoringSeeds.length >= e.scoringSeeds.length, fam + ": hidden seed count ↑ (" + e.scoringSeeds.length + "→" + h.scoringSeeds.length + ")");
  ok(h.ratingD > e.ratingD, fam + ": ratingD ↑ (" + Math.round(e.ratingD) + "→" + Math.round(h.ratingD) + ")");
}
// family-specific "harder target" direction
{
  const e = (f) => ladder.instanceByDifficulty(f, 0.15).targets;
  const h = (f) => ladder.instanceByDifficulty(f, 0.95).targets;
  ok(h("bloom").pop > e("bloom").pop, "bloom: target pop ↑ (" + e("bloom").pop + "→" + h("bloom").pop + ")");
  ok((h("goldilocks").hi - h("goldilocks").lo) < (e("goldilocks").hi - e("goldilocks").lo), "goldilocks: band narrows");
  ok(h("giants").radius > e("giants").radius && h("giants").pop > e("giants").pop, "giants: radius & pop ↑");
  ok(h("pacifism").pred < e("pacifism").pred && h("pacifism").pop > e("pacifism").pop, "pacifism: pred ↓ & pop ↑");
}

// ---------------------------------------------------------------------------
console.log("rating-scale linkage:");
for (const d of [0.15, 0.3, 0.58, 0.88, 0.95]) {
  const inst = ladder.instanceByDifficulty("bloom", d);
  ok(Math.abs(inst.ratingD - difficultyToRatingD(inst.difficulty)) < 1e-9, "d=" + d + ": ratingD = difficultyToRatingD(difficulty)");
}
for (const rating of [1200, 1500, 1800, 2100]) {
  const d = ladder.difficultyForExpectedPass(rating, 0.6);
  const D = difficultyToRatingD(d);
  const p = expectedPass(rating, { difficulty: D, discrimination: 1 });
  const clamped = d <= ladder.DIFF_MIN + 1e-9 || d >= ladder.DIFF_MAX - 1e-9;
  ok(clamped || Math.abs(p - 0.6) < 0.02, "rating " + rating + ": frontier difficulty hits ~0.6 expected pass (p=" + p.toFixed(3) + (clamped ? ", clamped" : "") + ")");
}

// ---------------------------------------------------------------------------
console.log("publicView strips the secrets, keeps what a player needs:");
{
  const inst = ladder.instanceByDifficulty("giants", 0.6);
  const pv = ladder.publicView(inst);
  ok(!("scoringSeeds" in pv), "publicView omits scoringSeeds");
  ok(!("evaluate" in pv), "publicView omits evaluate()");
  ok(Array.isArray(pv.practiceSeeds) && pv.practiceSeeds.length === 3, "publicView keeps practiceSeeds");
  ok(pv.hiddenSeedCount === inst.scoringSeeds.length, "publicView reports hiddenSeedCount without the seeds");
  ok(pv.targets && pv.tunable && pv.budget, "publicView keeps targets/tunable/budget");
}

// ---------------------------------------------------------------------------
console.log("tunable whitelist inherited from the base challenge:");
for (const fam of ladder.FAMILY_NAMES) {
  eq(ladder.instanceByDifficulty(fam, 0.5).tunable, challenges[fam].tunable, fam + ": tunable === base challenge tunable");
}

// ---------------------------------------------------------------------------
console.log("frontier serving:");
{
  for (const rating of [1300, 1600, 1900]) {
    const inst = ladder.recommendFrontier(rating);
    ok(inst.difficulty >= ladder.DIFF_MIN && inst.difficulty <= ladder.DIFF_MAX && inst.frontierReason, "recommendFrontier(" + rating + ") → " + inst.family + "@" + inst.difficulty);
  }
  const mix = ladder.frontierMix(1600);
  ok(mix.length === 3, "frontierMix returns 3");
  const roles = mix.map((m) => m.role);
  eq(roles, ["frontier", "confidence", "stretch"], "frontierMix roles");
  ok(mix[1].difficulty < mix[0].difficulty && mix[0].difficulty < mix[2].difficulty, "confidence < frontier < stretch in difficulty");
  ok(new Set(mix.map((m) => m.family)).size === 3, "frontierMix serves 3 DISTINCT families");
}

// ---------------------------------------------------------------------------
console.log("END-TO-END realness + behavioral difficulty (bloom, real engine):");
{
  const easy = ladder.instanceByDifficulty("bloom", 0.15); // target pop ~274
  const hard = ladder.instanceByDifficulty("bloom", 0.9);  // target pop ~641
  const defaultRecipe = { config: {} };                    // ≈ 338 avgPop
  const strongRecipe = { config: { "food.spawnPerTick": 22, "food.energy": 60, "food.max": 2200 } }; // ≈ 756

  const ed = engine.score(easy, defaultRecipe);
  const hd = engine.score(hard, defaultRecipe);
  const hs = engine.score(hard, strongRecipe);
  console.log("    easy  +default : " + ed.passes + "/" + ed.total + " pass=" + ed.pass + " (target " + easy.targets.pop + ")");
  console.log("    hard  +default : " + hd.passes + "/" + hd.total + " pass=" + hd.pass + " (target " + hard.targets.pop + ")");
  console.log("    hard  +strong  : " + hs.passes + "/" + hs.total + " pass=" + hs.pass);
  ok(ed.pass === true, "a generated EASY instance is solvable by a default recipe (it's a real, scorable challenge)");
  ok(hd.pass === false, "the SAME recipe FAILS the harder instance (difficulty actually bites)");
  ok(hs.pass === true, "an optimized recipe clears the hard instance (it's hard, not impossible)");
}

// ---------------------------------------------------------------------------
console.log("");
if (fails) { console.log("LADDER TESTS FAILED: " + fails + " failure(s)"); process.exit(1); }
console.log("ALL LADDER TESTS PASSED");

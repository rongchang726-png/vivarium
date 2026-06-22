#!/usr/bin/env node
/*
 * Vivarium — rps-lab: does the non-transitive cycle CLOSE in Vivarium?
 * --------------------------------------------------------------------------
 * The deep-PvP keystone (../CLAUDE.md "The RPS meta"). PvP is a coin-flip because
 * the world has one optimal niche; the cure is non-transitivity:
 *
 *     hunter > grazer > defender > hunter
 *
 * Codex's roundA proved this cycle closes in a TOY trait-based world; roundF gave
 * the port spec, now built as CONFIG.defense (Phase 1). This harness is the
 * integrity check (the RPS analogue of the predator wean test): seed the three
 * archetypes as three clans into ONE shared world and watch whether all three
 * PERSIST (three-way coexistence) — measure it before declaring the cycle real.
 * The honest risk: Vivarium hunting is an evolved NEURAL POLICY, not a trait, so
 * the toy cycle may not port (the same wall that made the predator wean hard).
 *
 * Two modes:
 *   coexist (default): seed grazer+hunter+defender, run, judge coexistence over
 *     the final quarter (no clan below MINSHARE of the total).
 *   invade --resident R --mutant M: seed 95% resident clan + 5% mutant clan
 *     (R,M in {grazer,hunter,defender}); judge whether the mutant INVADES (grows
 *     its share). Run the three resident/mutant pairs to verify cycle closure.
 *
 * Hunters are kept viable with the cracked predator package (preyVulnerability +
 * fat carcasses + lean carn metabolism + pursuitReward) — without viable hunters
 * the hunter>grazer edge can't exist and the test is meaningless. pursuitReward
 * stays ON here (we test whether the cycle EXISTS at all, with hunters propped
 * up); a wean is the NEXT integrity gate once a cycle is found.
 *
 * Usage:
 *   node game/rps-lab.js [--seed N] [--ticks T] [--mode coexist|invade]
 *        [--resident R --mutant M]                 (invade mode)
 *        [--nG N --nH N --nD N]                     (founder counts)
 *        [--defense 1|0] [--toxin X] [--meatConv X] [--plantPen X]
 *        [--preyVuln X] [--carcass X] [--carnCarcass X] [--carnMetab X]
 *        [--pr X] [--bite X] [--plantSupp X]
 *        [--defenderDiet X] [--defenderDef X] [--hunterDiet X]
 *
 * Prints a per-clan timeline every 1500 ticks and a machine-readable RESULT line.
 */
const { loadCore } = require("./core-loader");

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.slice(0, 2) === "--") {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === "--") a[key] = true;
      else { a[key] = next; i++; }
    } else a._.push(t);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const num = (v, d) => (v == null || v === true ? d : parseFloat(v));
const int = (v, d) => (v == null || v === true ? d : parseInt(v, 10));
const str = (v, d) => (v == null || v === true ? d : String(v));

const SEED = int(args.seed, 7);
const TICKS = int(args.ticks, 18000);
const MODE = str(args.mode, "coexist");
const MINSHARE = num(args.minShare, 0.05); // coexistence floor (fraction of total)

// --- world levers -----------------------------------------------------------
const DEFENSE = args.defense == null ? 1 : int(args.defense, 1); // RPS needs it ON
const TOXIN = num(args.toxin, 8);
const MEATCONV = num(args.meatConv, 0.45);
const PLANTPEN = num(args.plantPen, 0.18);
// cracked predator package (CLAUDE.md re-attempt V "EXTREME combo"): catch
// FREQUENCY (preyVuln) + fat carcasses + lean carn metabolism, so hunters are
// genuinely viable and the hunter>grazer edge is real.
const PREY_VULN = num(args.preyVuln, 0.6);
const CARCASS = num(args.carcass, 8);
const CARN_CARCASS = num(args.carnCarcass, 4);
const CARN_METAB = num(args.carnMetab, 0.6);
const PR = num(args.pr, 0.8);
const BITE = num(args.bite, 35);
const PLANT_SUPP = num(args.plantSupp, 0.7); // default: grazers graze freely (diet~0)

// --- archetypes (diet/defense/radius), from roundA mapped to Vivarium ---------
const GRAZER = { diet: num(args.grazerDiet, 0.05), defense: 0.0, radius: 3.3 };
const HUNTER = { diet: num(args.hunterDiet, 0.92), defense: 0.1, radius: 6.5 };
const DEFENDER = { diet: num(args.defenderDiet, 0.18), defense: num(args.defenderDef, 0.92), radius: 3.6 };
const ARCH = { grazer: GRAZER, hunter: HUNTER, defender: DEFENDER };

const api = loadCore();
api.setParam("defense.enabled", !!DEFENSE);
api.setParam("defense.toxinEnergyCost", TOXIN);
api.setParam("defense.meatConversionMultiplier", MEATCONV);
api.setParam("defense.plantEfficiencyPenalty", PLANTPEN);
api.setParam("creature.preyVulnerability", PREY_VULN);
api.setParam("creature.carcassFactor", CARCASS);
api.setParam("creature.carnCarcassBonus", CARN_CARCASS);
api.setParam("creature.carnMetabolismDiscount", CARN_METAB);
api.setParam("creature.pursuitReward", PR);
api.setParam("creature.biteDamage", BITE);
api.setParam("creature.plantSuppression", PLANT_SUPP);
// freqDependence stays 0: clan must remain behaviour-neutral so the RPS dynamics
// are clean (the arena's anti-snowball homeostasis would mask them).
// Optional: freeze the evolving traits (defense/diet/forage drift) so the seeded
// archetypes stay put. This is the clean way to measure a pairwise INVASION edge
// as clan-vs-clan competition, NOT contaminated by within-lineage trait erosion —
// roundA ran its invasion suite with mutation OFF for exactly this reason. Without
// it, a predator-free defender clan simply evolves its OWN defense away (observed:
// def 0.92 -> 0.77, diet -> 0.73), which reads as "grazer failed to invade" when
// the grazer>defender edge actually expressed itself as trait drift inside the
// defender lineage. Use --freezeTraits for invasion tests; leave it off to study
// the live evolutionary dynamics.
const FREEZE = !!args.freezeTraits;
if (FREEZE) {
  api.setParam("mutation.defenseStd", 0);
  api.setParam("mutation.dietStd", 0);
  api.setParam("mutation.forageStd", 0);
}

const w = api.newArenaWorld(SEED); // noGenesis: no wildlife clan -1 to confound

// founder counts
let nG = int(args.nG, 120), nH = int(args.nH, 50), nD = int(args.nD, 120);
if (MODE === "invade") {
  const R = str(args.resident, "grazer"), M = str(args.mutant, "hunter");
  // 95% resident / 5% mutant of a ~200 founding pool, seeded as their own clans.
  const total = int(args.pool, 200);
  const nMut = Math.max(1, Math.round(total * 0.05));
  const nRes = total - nMut;
  seedArch(R, nRes);
  seedArch(M, nMut);
  console.log("=== rps-lab INVADE === seed=" + SEED + " resident=" + R + "(" + nRes + ") mutant=" + M + "(" + nMut + ")");
  console.log("    defense=" + DEFENSE + " toxin=" + TOXIN + " meatConv=" + MEATCONV + " plantPen=" + PLANTPEN +
    " | preyVuln=" + PREY_VULN + " carcass=" + CARCASS + " carnCarcass=" + CARN_CARCASS + " carnMetab=" + CARN_METAB + " pr=" + PR + " bite=" + BITE);
  runInvade(R, M, nRes, nMut);
} else {
  seedArch("grazer", nG);
  seedArch("hunter", nH);
  seedArch("defender", nD);
  console.log("=== rps-lab COEXIST === seed=" + SEED + " ticks=" + TICKS +
    " | grazer=" + nG + " hunter=" + nH + " defender=" + nD);
  console.log("    defense=" + DEFENSE + " toxin=" + TOXIN + " meatConv=" + MEATCONV + " plantPen=" + PLANTPEN +
    " | preyVuln=" + PREY_VULN + " carcass=" + CARCASS + " carnCarcass=" + CARN_CARCASS + " carnMetab=" + CARN_METAB + " pr=" + PR + " bite=" + BITE);
  runCoexist();
}

// clan map: grazer=0, hunter=1, defender=2
function clanOf(name) { return name === "grazer" ? 0 : name === "hunter" ? 1 : 2; }
function seedArch(name, count) {
  const a = ARCH[name];
  api.seedFounders(w, count, { diet: a.diet, radius: a.radius, defense: a.defense }, clanOf(name));
}

function fmtClan(label, c, tot) {
  const share = tot > 0 ? Math.round((c.n / tot) * 100) : 0;
  return label + " n=" + String(c.n).padStart(3) + " (" + String(share).padStart(2) + "%) diet=" +
    c.meanDiet.toFixed(2) + " def=" + c.meanDefense.toFixed(2);
}

function row(s) {
  const tot = s.total;
  console.log(
    " t" + String(s.tick).padStart(6) + " tot=" + String(tot).padStart(4) + " | " +
    fmtClan("G", s.grazer, tot) + " | " + fmtClan("H", s.hunter, tot) + " | " + fmtClan("D", s.defender, tot),
  );
}

function runCoexist() {
  const shares = { grazer: [], hunter: [], defender: [] };
  row(api.rpsSnapshot(w));
  let t = 0;
  while (t < TICKS) {
    const chunk = Math.min(1500, TICKS - t);
    api.step(w, chunk);
    t += chunk;
    const s = api.rpsSnapshot(w);
    row(s);
    const tot = s.total || 1;
    // record shares over the FINAL QUARTER for the verdict
    if (t >= TICKS * 0.75) {
      shares.grazer.push(s.grazer.n / tot);
      shares.hunter.push(s.hunter.n / tot);
      shares.defender.push(s.defender.n / tot);
    }
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const mG = mean(shares.grazer), mH = mean(shares.hunter), mD = mean(shares.defender);
  const minShare = Math.min(mG, mH, mD);
  const coexist = minShare >= MINSHARE;
  console.log("");
  console.log("final-quarter mean shares: grazer=" + (mG * 100).toFixed(0) + "% hunter=" +
    (mH * 100).toFixed(0) + "% defender=" + (mD * 100).toFixed(0) + "%  (floor " + (MINSHARE * 100).toFixed(0) + "%)");
  console.log("RESULT " + JSON.stringify({
    mode: "coexist", seed: SEED,
    shareGrazer: +(mG).toFixed(3), shareHunter: +(mH).toFixed(3), shareDefender: +(mD).toFixed(3),
    minShare: +(minShare).toFixed(3), coexist,
  }));
}

function runInvade(R, M, nRes, nMut) {
  const mClan = clanOf(M);
  const pick = (s, k) => (k === 0 ? s.grazer : k === 1 ? s.hunter : s.defender);
  const startMut = nMut / (nRes + nMut);
  let peakMut = startMut;
  row(api.rpsSnapshot(w));
  let t = 0;
  while (t < TICKS) {
    const chunk = Math.min(1500, TICKS - t);
    api.step(w, chunk);
    t += chunk;
    const s = api.rpsSnapshot(w);
    row(s);
    const share = pick(s, mClan).n / (s.total || 1);
    if (share > peakMut) peakMut = share;
  }
  const s = api.rpsSnapshot(w);
  const tot = s.total || 1;
  const endMut = pick(s, mClan).n / tot;
  // invades  = the mutant ever grew its share decisively => the edge holds
  //            BEHAVIOURALLY (this is what closes the non-transitive cycle).
  // persists = it's still present at the end and the world didn't collapse => the
  //            pair is STABLE, not a boom-bust. A real RPS edge wants invades=true;
  //            stable coexistence additionally wants persists=true. (Separating
  //            these matters: a predator can invade prey and then over-exploit it
  //            into a mutual 0:0 collapse — invaded, but did not persist.)
  const collapsed = tot <= 1;
  const invades = peakMut > startMut * 1.5;
  const persists = pick(s, mClan).n > 0 && !collapsed;
  console.log("");
  console.log("mutant " + M + " share: start " + (startMut * 100).toFixed(0) + "% -> peak " +
    (peakMut * 100).toFixed(0) + "% -> end " + (endMut * 100).toFixed(0) + "%" + (collapsed ? "  (world collapsed 0:0)" : ""));
  console.log("RESULT " + JSON.stringify({
    mode: "invade", seed: SEED, resident: R, mutant: M,
    startMutShare: +startMut.toFixed(3), peakMutShare: +peakMut.toFixed(3), endMutShare: +endMut.toFixed(3),
    invades, persists, collapsed,
  }));
}

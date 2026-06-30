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
// Spatial-mobility experiment (Reichenbach 2007 arXiv:0709.0217 / Kerr 2002 Nature):
// a non-transitive RPS cycle is stabilized by sub-critical MOBILITY, and a well-mixed
// world collapses it (sharp critical-mobility threshold). Vivarium already has local
// interaction (SpatialGrid + FOV) and local dispersal (world.spawnChild places young
// adjacent to the parent), so the MISSING ingredient is mobility: a creature wanders
// far over its ~4400-tick life in a 1280x800 torus => effectively well-mixed.
// --worldScale N enlarges the world N-fold (linear) at CONSTANT density (founders,
// food, softCap all scale by area N*N), dropping relative mobility below the threshold
// without changing per-tick speed. WSCALE=1 is bit-identical to the prior behaviour.
const WSCALE = num(args.worldScale, 1);
const AREA = WSCALE * WSCALE;
// --popScale P scales ONLY the population (founders/food/softCap) by P, WITHOUT
// enlarging the world — the disentangling control for the spatial experiment. The
// big-world treatment (--worldScale 2) raises BOTH space and headcount (x4); to show an
// effect is SPACE and not just MORE INDIVIDUALS (less stochastic extinction), compare it
// against --worldScale 1 --popScale 4 (same headcount, small well-mixed world). DENS
// folds both: density-linked quantities scale by AREA*P; world size scales by WSCALE only.
const PSCALE = num(args.popScale, 1);
const DENS = AREA * PSCALE;

// --- world levers -----------------------------------------------------------
const DEFENSE = args.defense == null ? 1 : int(args.defense, 1); // RPS needs it ON
const TOXIN = num(args.toxin, 8);
const MEATCONV = num(args.meatConv, 0.45);
const PLANTPEN = num(args.plantPen, 0.18);
const DMGRED = num(args.dmgRed, 0); // armor: defended prey takes (1 - dmgRed*defense) damage
// cracked predator package (CLAUDE.md re-attempt V "EXTREME combo"): catch
// FREQUENCY (preyVuln) + fat carcasses + lean carn metabolism, so hunters are
// genuinely viable and the hunter>grazer edge is real.
const PREY_VULN = num(args.preyVuln, 0.6);
const CARCASS = num(args.carcass, 8);
const CARN_CARCASS = num(args.carnCarcass, 4);
const CARN_METAB = num(args.carnMetab, 0.6);
const PR = num(args.pr, 0.8);
const BITE = num(args.bite, 35);
const RETAL = num(args.retaliation, 0.42); // defender bites back ∝ its area * this; the natural predation brake (default = config default)
const PLANT_SUPP = num(args.plantSupp, 0.7); // default: grazers graze freely (diet~0)
const HANDLING = num(args.handling, 0); // functional-response handling time: ticks a predator is occupied after a kill (caps predation rate)
const MAXINTAKE = num(args.maxIntake, 0); // corrected satiation: cap carcass energy absorbed/tick (meters the superboom-driving kill windfall). 0 = OFF/instant.
const PREYDIETMAX = num(args.preyDietMax, 1); // obligate-predator gate: hunters only target prey with diet <= this (1=off/eat-anything; ~0.5=no cannibalism => prey-dependent, crashes on over-exploit)
const FORESTDENSITY = num(args.forestDensity, null); // RPS mechanism A (red-team): type1/forest food-density mult — low (~0.4) makes type1 a refuge that can't self-sustain a generalist defender => rebuilds grazer>defender without extreme plantPen

// --- archetypes (diet/defense/radius), from roundA mapped to Vivarium ---------
const GRAZER = { diet: num(args.grazerDiet, 0.05), defense: 0.0, radius: 3.3 };
const HUNTER = { diet: num(args.hunterDiet, 0.92), defense: 0.1, radius: 6.5 };
const DEFENDER = { diet: num(args.defenderDiet, 0.18), defense: num(args.defenderDef, 0.92), radius: 3.6 };
const ARCH = { grazer: GRAZER, hunter: HUNTER, defender: DEFENDER };

// --- food-niche levers (BUILD: the defender's-own-food RPS probe) -------------
// The structural blocker (CLAUDE.md RPS): the defender ALWAYS dies, doubly squeezed —
// grazers out-compete it for the SHARED plant (grazer>defender = Gause exclusion) AND
// the grazer-fuelled hunter boom slaughters it. food.types>1 + biome gives the defender
// its OWN spatial food type (the fix the structural conclusion named: "defender eats
// plant B so grazers can't exclude it"), removing the grazer-competition squeeze so we
// can test whether it then survives the hunter. EYES-OPEN: separate foods DISSOLVE the
// grazer>defender edge (it IS the shared-plant competition), so this tests SURVIVAL /
// a stable food web, NOT a closed non-transitive cycle — the edge must be reinvented as
// a non-competition mechanism (a later probe). foodTypes=1 (default) => the old shared-
// food behaviour, bit-for-bit (forage is set but the multi-food path stays closed).
const FOODTYPES = int(args.foodTypes, 1);
const FORAGESPEC = num(args.forageSpec, 1.2); // convex (>1) => strict specialists, no reach-advantage generalist
// per-archetype forage (which food type it digests). With foodTypes=2: grazer→type0,
// defender→type1 (its own food); hunter is a predator (forage irrelevant to meat).
const GRAZER_FORAGE = num(args.grazerForage, 0);
const DEFENDER_FORAGE = num(args.defenderForage, FOODTYPES > 1 ? 1 : 0.5);
const HUNTER_FORAGE = num(args.hunterForage, 0.5);

const api = loadCore();
api.setParam("defense.enabled", !!DEFENSE);
api.setParam("defense.toxinEnergyCost", TOXIN);
api.setParam("defense.meatConversionMultiplier", MEATCONV);
api.setParam("defense.plantEfficiencyPenalty", PLANTPEN);
api.setParam("defense.damageReduction", DMGRED);
api.setParam("creature.preyVulnerability", PREY_VULN);
api.setParam("creature.carcassFactor", CARCASS);
api.setParam("creature.carnCarcassBonus", CARN_CARCASS);
api.setParam("creature.carnMetabolismDiscount", CARN_METAB);
api.setParam("creature.pursuitReward", PR);
api.setParam("creature.biteDamage", BITE);
api.setParam("creature.retaliation", RETAL);
api.setParam("creature.plantSuppression", PLANT_SUPP);
api.setParam("creature.handlingTicks", HANDLING);
api.setParam("creature.maxIntakePerTick", MAXINTAKE);
api.setParam("creature.preyDietMax", PREYDIETMAX);
// Food niche: give each archetype its own food type, spatially separated by the biome.
// Must precede newArenaWorld (World reads CONFIG.biome.enabled + food.types at construction).
// foodTypes=1 (default) leaves food.types=1 and biome OFF => the old shared-plant world.
if (FOODTYPES > 1) {
  api.setParam("food.types", FOODTYPES);
  api.setParam("food.forageSpecialization", FORAGESPEC);
  api.setParam("biome.enabled", true); // spatial separation of the food types => a real refuge (Reichenbach)
  if (FORESTDENSITY != null) api.setParam("biome.densityMults", [1.0, FORESTDENSITY, 1.0]); // mechanism A: low forest(type1) density => asymmetric shelter that can't self-sustain the defender
}
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

// Enlarge the world at constant density (MUST precede newArenaWorld, since World reads
// CONFIG.world.{width,height} at construction). Scaling food + softCap by area keeps
// per-cell carrying capacity fixed, so this isolates the size:mobility ratio — not a
// starvation (food too sparse) or crowding (softCap-throttled) artifact.
if (WSCALE !== 1) {
  api.setParam("world.width", Math.round(api.CONFIG.world.width * WSCALE));
  api.setParam("world.height", Math.round(api.CONFIG.world.height * WSCALE));
}
// Food density scales by area*pop (DENS) AND by the number of food types: N separated
// types each need ~baseline density, else effective per-type food halves and both
// specialists bootstrap-collapse (the --food2 lesson). softCap/founders use DENS only.
const FOODMULT = DENS * (FOODTYPES > 1 ? FOODTYPES : 1);
if (FOODMULT !== 1) {
  api.setParam("food.startCount", Math.round(api.CONFIG.food.startCount * FOODMULT));
  api.setParam("food.max", Math.round(api.CONFIG.food.max * FOODMULT));
  api.setParam("food.spawnPerTick", api.CONFIG.food.spawnPerTick * FOODMULT);
}
if (DENS !== 1) {
  api.setParam("pop.softCap", Math.round(api.CONFIG.pop.softCap * DENS));
}

const w = api.newArenaWorld(SEED); // noGenesis: no wildlife clan -1 to confound

// founder counts
let nG = int(args.nG, 120), nH = int(args.nH, 50), nD = int(args.nD, 120);
if (DENS !== 1) { nG = Math.round(nG * DENS); nH = Math.round(nH * DENS); nD = Math.round(nD * DENS); }
if (MODE === "invade") {
  const R = str(args.resident, "grazer"), M = str(args.mutant, "hunter");
  // 95% resident / 5% mutant of a ~200 founding pool, seeded as their own clans.
  const total = Math.round(int(args.pool, 200) * DENS);
  const nMut = Math.max(1, Math.round(total * 0.05));
  const nRes = total - nMut;
  seedArch(R, nRes);
  seedArch(M, nMut);
  console.log("=== rps-lab INVADE === seed=" + SEED + " worldScale=" + WSCALE + " resident=" + R + "(" + nRes + ") mutant=" + M + "(" + nMut + ")");
  console.log("    defense=" + DEFENSE + " toxin=" + TOXIN + " meatConv=" + MEATCONV + " plantPen=" + PLANTPEN +
    " | preyVuln=" + PREY_VULN + " carcass=" + CARCASS + " carnCarcass=" + CARN_CARCASS + " carnMetab=" + CARN_METAB + " pr=" + PR + " bite=" + BITE + " | retal=" + RETAL + " handling=" + HANDLING + " maxIntake=" + MAXINTAKE);
  runInvade(R, M, nRes, nMut);
} else {
  seedArch("grazer", nG);
  seedArch("hunter", nH);
  seedArch("defender", nD);
  console.log("=== rps-lab COEXIST === seed=" + SEED + " ticks=" + TICKS + " worldScale=" + WSCALE + " popScale=" + PSCALE +
    " | grazer=" + nG + " hunter=" + nH + " defender=" + nD +
    " | foodTypes=" + FOODTYPES + (FOODTYPES > 1 ? " (G→type0 D→type1, biome-separated, spec=" + FORAGESPEC + ")" : ""));
  console.log("    defense=" + DEFENSE + " toxin=" + TOXIN + " meatConv=" + MEATCONV + " plantPen=" + PLANTPEN +
    " | preyVuln=" + PREY_VULN + " carcass=" + CARCASS + " carnCarcass=" + CARN_CARCASS + " carnMetab=" + CARN_METAB + " pr=" + PR + " bite=" + BITE + " | retal=" + RETAL + " handling=" + HANDLING + " maxIntake=" + MAXINTAKE);
  runCoexist();
}

// clan map: grazer=0, hunter=1, defender=2
function clanOf(name) { return name === "grazer" ? 0 : name === "hunter" ? 1 : 2; }
function forageOf(name) { return name === "grazer" ? GRAZER_FORAGE : name === "hunter" ? HUNTER_FORAGE : DEFENDER_FORAGE; }
function seedArch(name, count) {
  const a = ARCH[name];
  api.seedFounders(w, count, { diet: a.diet, radius: a.radius, defense: a.defense, forage: forageOf(name) }, clanOf(name));
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
    mode: "coexist", seed: SEED, worldScale: WSCALE, popScale: PSCALE,
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

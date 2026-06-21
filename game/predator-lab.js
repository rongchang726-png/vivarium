#!/usr/bin/env node
/*
 * Vivarium — predator-lab: ONE parametric headless harness for assaulting the
 * predator problem's ENERGETIC wall.
 * --------------------------------------------------------------------------
 * Background (../CLAUDE.md "the predator problem", re-attempt III): the pursuit
 * reward (creature.pursuitReward) crosses the BEHAVIOURAL adaptive valley —
 * random-brained predators actually learn to hunt — but the wean test proved
 * carnivory stays net-NEGATIVE even with skill: an ENERGETIC deficit the pursuit
 * bonus was only subsidising. Turn pursuitReward off (wean) and the guild
 * collapses. The next target is to make carnivore energetics SELF-SUFFICIENT, so
 * a hunting guild survives the wean. This harness is the search bed: it seeds the
 * HARD no-graze scenario from pursuit.js/pursuit-wean.js and exposes every lever
 * (the pursuit scaffold AND the new energetic knobs) plus an optional WEAN.
 *
 * The scenario: ~200 prey (small herbivores) + 60 predators (big carnivores,
 * random brains) in a no-graze world (plantSuppression=1). With --wean W: evolve
 * with pursuitReward=pr until tick W, then set pursuitReward=0 and run on to T —
 * the ENERGETIC levers STAY ON across the wean (that's the whole point: do the
 * energetic knobs let the guild stand on its own once the scaffold is removed?).
 *
 * Reads a FINE 12-BIN diet histogram (CLAUDE.md: coarse 5-bin histograms lied
 * about niche structure twice — read the fine distribution).
 *
 * Usage:
 *   node game/predator-lab.js --seed N --ticks T [--wean W] [--pr X]
 *        [--carcass X] [--carnMetab X] [--carnMove X] [--carnCarcass X]
 *        [--preyN N] [--predN N] [--preyRadius X] [--preySpeed X] [--predDiet X]
 *        [--injectPrey N] [--wall] [--gap X]
 *        [--plantSupp X] [--biteDamage X] [--speedSmall X] [--retal X]
 *
 * Prints a timeline every 1500 ticks (12-bin diet hist, pop, carn>.8, kills/1000
 * ticks, maxGen, [reward ON]/[weaned] tag) and ends with ONE machine-readable
 * line:
 *   RESULT {"seed":..,"peakCarnPct":..,"finalCarnPct":..,"killsPer1k":..,
 *           "maxGen":..,"collapsed":..,"weaned":..,"weanSurvived":..}
 *   carnPct = % of pop with diet>0.8 ; collapsed = pop near-zero (bootstrap death)
 *   weanSurvived = (weaned AND finalCarnPct still meaningfully > 0)
 */
const { loadCore } = require("./core-loader");

// --- tiny flag parser: --name value, and bare --wall / --flag -----------------
function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.slice(0, 2) === "--") {
      const key = t.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.slice(0, 2) === "--") {
        a[key] = true; // bare flag
      } else {
        a[key] = next;
        i++;
      }
    } else {
      a._.push(t);
    }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const num = (v, d) => (v == null || v === true ? d : parseFloat(v));
const int = (v, d) => (v == null || v === true ? d : parseInt(v, 10));

// --- config: defaults mirror pursuit.js / pursuit-wean.js HARD scenario --------
const SEED = int(args.seed, 7);
const TICKS = int(args.ticks, 15000);
const WEAN = args.wean != null ? int(args.wean, 0) : null; // null => no wean
const PR = num(args.pr, 0.8);

const PLANT_SUPP = num(args.plantSupp, 1.0);
const RETAL = num(args.retal, 0.1);
const CARCASS = num(args.carcass, 1.5);
const BITE = num(args.biteDamage, 35);
const SPEED_SMALL = num(args.speedSmall, 1.7);

// energetic levers (default 0 = OFF, bit-exact)
const CARN_METAB = num(args.carnMetab, 0);
const CARN_MOVE = num(args.carnMove, 0);
const CARN_CARCASS = num(args.carnCarcass, 0);

// population / morphology
const PREY_N = int(args.preyN, 200);
const PRED_N = int(args.predN, 60);
const PREY_RADIUS = num(args.preyRadius, 3.3);
const PRED_DIET = num(args.predDiet, 0.9);
const PRED_RADIUS = num(args.predRadius, 6.5);
const INJECT_PREY = args.injectPrey != null ? int(args.injectPrey, 0) : 0; // 0 = off

// spatial structure (optional)
const WALL = !!args.wall;
const GAP = num(args.gap, 0.1); // fraction of world height for the corridor

const api = loadCore();
api.setParam("creature.pursuitReward", PR);
api.setParam("creature.plantSuppression", PLANT_SUPP);
api.setParam("creature.retaliation", RETAL);
api.setParam("creature.carcassFactor", CARCASS);
api.setParam("creature.biteDamage", BITE);
api.setParam("creature.speedSmall", SPEED_SMALL);
api.setParam("creature.carnMetabolismDiscount", CARN_METAB);
api.setParam("creature.carnMoveDiscount", CARN_MOVE);
api.setParam("creature.carnCarcassBonus", CARN_CARCASS);
if (WALL) {
  const H = api.CONFIG.world.height;
  const lo = H * (0.5 - GAP / 2);
  const hi = H * (0.5 + GAP / 2);
  api.setParam("world.wall", { gapLo: lo, gapHi: hi });
}

const w = api.newEmptyWorld(SEED);
api.seedFounders(w, PREY_N, { diet: 0.05, radius: PREY_RADIUS }, 0);
api.seedFounders(w, PRED_N, { diet: PRED_DIET, radius: PRED_RADIUS }, 0);

// --- 12-bin diet histogram straight off creature.diet (the FINE read) ---------
function diet12(world) {
  const b = new Array(12).fill(0);
  const cs = world.creatures;
  for (let i = 0; i < cs.length; i++) {
    let k = (cs[i].diet * 12) | 0;
    if (k > 11) k = 11;
    else if (k < 0) k = 0;
    b[k]++;
  }
  return b;
}
// carn>.8 count from the fine bins (bins 10,11 cover diet [0.833,1.0]; include
// the 0.8 boundary by also counting the fraction of bin 9 above 0.8 directly).
function carnCount(world) {
  let c = 0;
  const cs = world.creatures;
  for (let i = 0; i < cs.length; i++) if (cs[i].diet > 0.8) c++;
  return c;
}

const COLLAPSE_POP = 8; // pop at/below this = bootstrap death / world collapse

console.log(
  "=== predator-lab === seed=" + SEED + " ticks=" + TICKS +
  (WEAN != null ? " wean@" + WEAN : " (no wean)") +
  " | pr=" + PR + " carcass=" + CARCASS + " carnMetab=" + CARN_METAB +
  " carnMove=" + CARN_MOVE + " carnCarcass=" + CARN_CARCASS +
  " | plantSupp=" + PLANT_SUPP + " bite=" + BITE + " speedSmall=" + SPEED_SMALL +
  " retal=" + RETAL + (WALL ? " WALL gap=" + GAP : "") +
  " | " + PREY_N + " prey(r" + PREY_RADIUS + ") + " + PRED_N + " pred(diet " + PRED_DIET + ")" +
  (INJECT_PREY > 0 ? " | injectPrey=" + INJECT_PREY + "/1500" : ""),
);
console.log(
  " tick  pop |" +
  " d00 d08 d17 d25 d33 d42 d50 d58 d67 d75 d83 d92 | carn>.8 kills/k maxGen  phase",
);

let weaned = false;
let peakCarnPct = 0;
let lastSnap = null;
let lastKills1k = 0;
let lastMaxGen = 0;
let lastPop = 0;

function rowAt(label) {
  const s = api.snapshot(w);
  const h = diet12(w);
  const carn = carnCount(w);
  const pct = s.pop > 0 ? Math.round((carn / s.pop) * 100) : 0;
  if (pct > peakCarnPct) peakCarnPct = pct;
  lastSnap = s;
  lastKills1k = Math.round(s.predationRate * 1000);
  lastMaxGen = s.maxGen;
  lastPop = s.pop;
  const cells = h.map((x) => String(x).padStart(3)).join(" ");
  console.log(
    " " + String(s.tick).padStart(5) + " " + String(s.pop).padStart(4) + " | " +
    cells + " | " + String(carn).padStart(7) + " " +
    String(lastKills1k).padStart(6) + " " + String(s.maxGen).padStart(5) + "  " + label,
  );
}

function tag() {
  return weaned ? "[weaned]" : "[reward ON]";
}

// initial row
rowAt(tag());

let t = 0;
while (t < TICKS) {
  // wean switch: at tick WEAN, drop pursuitReward to 0 (energetic levers stay on)
  if (WEAN != null && !weaned && t >= WEAN) {
    api.setParam("creature.pursuitReward", 0);
    weaned = true;
    console.log("        --- pursuitReward -> 0 (weaned); energetic levers STAY ON ---");
  }
  // step in 1500-tick blocks, but stop at the wean boundary so the switch is clean
  let chunk = 1500;
  if (WEAN != null && !weaned && t < WEAN) chunk = Math.min(chunk, WEAN - t);
  if (chunk > TICKS - t) chunk = TICKS - t;
  if (INJECT_PREY > 0) api.seedFounders(w, INJECT_PREY, { diet: 0.05, radius: PREY_RADIUS }, 0);
  api.step(w, chunk);
  t += chunk;
  // only print a full row on 1500-aligned ticks (or the final tick)
  rowAt(tag());
}

// --- machine-readable summary -------------------------------------------------
const finalCarn = lastSnap ? carnCount(w) : 0;
const finalCarnPct = lastPop > 0 ? Math.round((finalCarn / lastPop) * 100) : 0;
const collapsed = lastPop <= COLLAPSE_POP;
const didWean = WEAN != null;
// weanSurvived: only meaningful if a wean happened; the guild stood on its own if
// a real carnivore fraction persisted after the scaffold was removed and the
// world didn't collapse.
const weanSurvived = didWean && !collapsed && finalCarnPct >= 5;

console.log("");
console.log(
  "RESULT " +
    JSON.stringify({
      seed: SEED,
      peakCarnPct: peakCarnPct,
      finalCarnPct: finalCarnPct,
      killsPer1k: lastKills1k,
      maxGen: lastMaxGen,
      collapsed: collapsed,
      weaned: didWean,
      weanSurvived: weanSurvived,
    }),
);

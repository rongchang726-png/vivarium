/*
 * Vivarium Game — core loader
 * ---------------------------
 * The simulation core is written as classic browser scripts that share one
 * global scope, so Node can't `require` it directly. This loader concatenates
 * the DOM-free core into a single fresh `vm` context and exposes a small, clean
 * API over it.
 *
 * Crucially, each call to loadCore() returns an ISOLATED context with its own
 * CONFIG. That's what lets the game run many independent trials — different
 * rule-sets, different seeds — without them stepping on each other. The game's
 * whole premise (tune the rules, observe the consequences) depends on this
 * isolation.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.resolve(__dirname, "..", "src");
const CORE = ["config", "util", "genome", "brain", "food", "creature", "world"];

// Appended after the core: defines a host-facing API using the in-context
// classes. Plain ES5 so it evaluates cleanly in the vm. No template literals or
// ${} inside (this whole string is itself a template literal).
const EPILOGUE = `
var __API = {
  CONFIG: CONFIG,

  // Set a dotted CONFIG path, e.g. setParam('creature.metabBase', 0.1).
  setParam: function (dotted, value) {
    var parts = dotted.split('.');
    var o = CONFIG;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
  },

  newWorld: function (seed) {
    return new World({ seed: seed });
  },
  newEmptyWorld: function (seed) {
    return new World({ seed: seed, creatures: 0 });
  },

  // Add 'count' founder creatures with optional gene overrides. Brains are
  // random (the point is that behaviour must still be evolved/discovered).
  seedFounders: function (world, count, spec, clan, region) {
    for (var i = 0; i < count; i++) {
      var g = Genome.random(world.rng);
      if (spec) {
        if (spec.diet != null) g.genes.diet = spec.diet;
        if (spec.radius != null) g.genes.radius = spec.radius;
        if (spec.range != null) g.genes.range = spec.range;
        if (spec.fov != null) g.genes.fov = spec.fov;
        if (spec.hue != null) g.genes.hue = spec.hue;
      }
      var c = world.spawnRandom(g, clan || 0);
      // Resource-partition specialisation: a fixed value, or spread across [0,1]
      // (forageSpread) to seed every niche attractor-basin for branching tests.
      if (spec && spec.forageSpread) c.forage = world.rng.next();
      else if (spec && spec.forage != null) c.forage = spec.forage;
      // RPS "defender" trait: a fixed defense value for a defended/toxic founder
      // (creature-level, like forage). Only meaningful when CONFIG.defense.enabled.
      if (spec && spec.defense != null) c.defense = spec.defense;
      // Optional: place founders in a sub-region (for the spatial-isolation
      // experiment — seed each clan on its own side of the wall).
      if (region) {
        c.x = region.xmin + world.rng.next() * (region.xmax - region.xmin);
        c.y = world.rng.next() * world.height;
      }
    }
  },

  // Advance the world, accumulating predation/bite counts over the batch.
  step: function (world, n) {
    var pred = 0, bites = 0;
    for (var i = 0; i < n; i++) {
      world.step();
      pred += world.predationsThisTick;
      bites += world.bitesThisTick;
    }
    world.__stepPred = pred;
    world.__stepBites = bites;
    world.__stepTicks = n;
  },

  // A reading the agent can reason about. Includes the diet *distribution*,
  // because the population average diet hides trophic structure.
  snapshot: function (world) {
    world.computeStats();
    var s = world.stats;
    var hist = [0, 0, 0, 0, 0]; // diet bins: <.2 .2-.4 .4-.6 .6-.8 >.8
    var fhist = [0, 0, 0, 0, 0]; // forage bins (resource specialisation 0..1)
    var cs = world.creatures;
    for (var i = 0; i < cs.length; i++) {
      var b = (cs[i].diet * 5) | 0;
      if (b > 4) b = 4;
      hist[b]++;
      var fb = (cs[i].forage * 5) | 0;
      if (fb > 4) fb = 4;
      else if (fb < 0) fb = 0;
      fhist[fb]++;
    }
    return {
      tick: world.tick,
      pop: s.pop,
      food: s.food,
      avgDiet: round(s.avgDiet, 3),
      dietHist: hist,
      forageHist: fhist,
      avgRadius: round(s.avgRadius, 2),
      avgVision: avgVision(world),
      maxGen: s.maxGen,
      carnFrac: round(s.carnFrac, 3),
      lineages: s.lineages,
      avgEnergy: round(s.avgEnergy, 3),
      avgAge: Math.round(s.avgAge),
      predationRate: round((world.__stepPred || 0) / (world.__stepTicks || 1), 3),
      biteRate: round((world.__stepBites || 0) / (world.__stepTicks || 1), 1),
      genesisEvents: world.genesisEvents,
    };
  },

  // PvP arena: an empty world that does NOT reseed wildlife, so a clan that is
  // out-competed actually dies out and the match can have a winner.
  newArenaWorld: function (seed) {
    return new World({ seed: seed, creatures: 0, noGenesis: true });
  },

  // Chronicle variants: event logging ON from tick 0 (so the founding cohort's births
  // are captured). world.eventLog is the faithful trace the chronicle renders.
  newWorldLogged: function (seed) {
    return new World({ seed: seed, eventLog: [] });
  },
  newArenaWorldLogged: function (seed) {
    return new World({ seed: seed, creatures: 0, noGenesis: true, eventLog: [] });
  },

  // Per-clan scoreboard: population and biomass (summed body area) for clan 0 and
  // clan 1; wildlife (clan -1) is reported separately and counts for neither.
  clanSnapshot: function (world) {
    var popA = 0, popB = 0, bioA = 0, bioB = 0, wild = 0;
    var cs = world.creatures;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.clan === 0) { popA++; bioA += c.area; }
      else if (c.clan === 1) { popB++; bioB += c.area; }
      else wild++;
    }
    return {
      tick: world.tick,
      popA: popA, popB: popB,
      bioA: Math.round(bioA), bioB: Math.round(bioB),
      wild: wild,
    };
  },

  // RPS lab: per-strategy population + mean diet/defense, bucketed by clan
  // (grazer=0, hunter=1, defender=2). Used by game/rps-lab.js to test whether the
  // hunter>grazer>defender cycle closes (coexistence) in Vivarium. Mean diet/
  // defense per clan let you see whether each lineage HOLDS its phenotype or
  // drifts/converges (the real risk: hunting is an evolved neural policy).
  rpsSnapshot: function (world) {
    var n = [0, 0, 0], sd = [0, 0, 0], sdef = [0, 0, 0], tot = 0;
    var cs = world.creatures;
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c.clan >= 0 && c.clan <= 2) { n[c.clan]++; sd[c.clan] += c.diet; sdef[c.clan] += c.defense; tot++; }
    }
    function pack(k) {
      return { n: n[k], meanDiet: n[k] ? round(sd[k] / n[k], 3) : 0, meanDefense: n[k] ? round(sdef[k] / n[k], 3) : 0 };
    }
    return { tick: world.tick, total: tot, allPop: cs.length, grazer: pack(0), hunter: pack(1), defender: pack(2) };
  },
};

function round(x, d) {
  var m = Math.pow(10, d);
  return Math.round(x * m) / m;
}
function avgVision(world) {
  var cs = world.creatures;
  if (!cs.length) return 0;
  var s = 0;
  for (var i = 0; i < cs.length; i++) s += cs[i].genes.range;
  return Math.round(s / cs.length);
}
`;

function loadCore() {
  let src = "";
  for (const f of CORE) src += fs.readFileSync(path.join(SRC, f + ".js"), "utf8") + "\n";
  src += EPILOGUE;

  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "vivarium-core.js" });
  return sandbox.__API;
}

module.exports = { loadCore };

/*
 * Vivarium — configuration & tunable constants
 * ---------------------------------------------
 * This file is the single surface for tuning the world. Everything that makes
 * the ecosystem feel one way or another lives here. The simulation core reads
 * these values; nothing here touches the DOM, so this file (and the rest of the
 * core) runs identically in the browser and under Node for testing.
 *
 * Loaded as a classic script: `CONFIG` and `BRAIN` become globals shared with
 * every other script on the page.
 */

// Neural-network topology. Fixed across the whole population so that genomes
// are directly comparable (mutation/crossover act on aligned weight vectors).
// Morphology evolves through `genes`; the brain *shape* does not.
const BRAIN = {
  EYES: 6, // angular vision sectors spread across the field of view
  CH: 4, // channels reported per eye: food, creature, rel-size, their-diet
  GLOBAL: 5, // proprioception: energy, speed, age, oscillator, bias
  H: 14, // recurrent hidden units (Elman-style memory)
  O: 3, // motor outputs: turn, thrust, bite
};
BRAIN.I = BRAIN.EYES * BRAIN.CH + BRAIN.GLOBAL; // total inputs (29)

// Number of scalar weights in one brain (dense recurrent net + biases).
BRAIN.WEIGHTS =
  BRAIN.H * BRAIN.I + // input -> hidden
  BRAIN.H * BRAIN.H + // hidden -> hidden (recurrence)
  BRAIN.O * BRAIN.H + // hidden -> output
  BRAIN.H + // hidden bias
  BRAIN.O; // output bias

const CONFIG = {
  world: {
    width: 1280,
    height: 800,
    // Spatial-isolation experiment (default null = clean torus, bit-exact). Set
    // to {gapLo, gapHi} to install a vertical mid-wall (x=W/2) with a y-gap
    // corridor; x then stops wrapping so two clans on opposite sides are
    // semi-isolated. Tests whether spatial structure ALONE turns competitive
    // exclusion into coexistence — the "isolation is the root fix" hypothesis.
    wall: null,
  },

  food: {
    max: 1500, // hard cap on food items present
    spawnPerTick: 10, // expected new food per tick (fractional, via RNG)
    energy: 40, // energy delivered by one plant
    clusterChance: 0.45, // fraction of spawns that land near existing food (patchiness)
    clusterRadius: 46,
    startCount: 1000,
    // Anti-snowball homeostasis (OFF by default). When > 0, a new plant is more
    // likely to fail to establish where creatures already crowd — density-
    // dependent regrowth that caps a booming population's local carrying
    // capacity so one clan can't snowball a whole world. 0 leaves the RNG
    // stream bit-exact with every existing save and test.
    densityDependence: 0,
    densityRadius: 40, // radius over which local crowding is measured
    // Resource partitioning (niche difference). types=1 (default) = single
    // resource, bit-exact. types>1 spawns multiple food types; a creature's
    // `forage` trait then specialises it, opening distinct niches (rho<1) so
    // competitors can coexist by eating different things — Chesson's resource
    // partitioning, the textbook stabilizing mechanism. forageSpecialization
    // sets how sharp the trade-off is (1 = a specialist can't eat the other).
    types: 1,
    forageSpecialization: 1,
    forageCircular: false, // N food types on a ring (equidistant, no end effect)
                           // vs a linear axis. Needed for even N-way branching.
    // Defended/toxic plants (default 0). A flat energy cost subtracted from every
    // plant meal — makes herbivory expensive, hollowing the omnivore middle and
    // raising the carnivore peak. The predator-problem lever: the herbivore
    // attractor is deep BECAUSE plants are free; this makes them not free.
    toxin: 0,
  },

  creature: {
    startCount: 70,

    // Morphology bounds (radius in world units).
    minRadius: 3.2,
    maxRadius: 9.5,

    // Energy economy. Capacity and costs both scale with body area so that,
    // all else equal, time-to-starve is roughly size-independent — size trades
    // off against speed and predation instead of against raw survival time.
    energyStart: 95,
    capacityBase: 38,
    capacityPerArea: 1.35,
    metabBase: 0.16, // fixed upkeep per tick
    metabPerArea: 0.0090, // upkeep per unit body area per tick
    moveCost: 0.018, // per (thrust * speed * sqrt area)

    // Locomotion. Smaller bodies are nimbler, but the gap is moderate so a
    // mid-sized predator can realistically run prey down.
    speedSmall: 2.3,
    speedBig: 1.6,
    turnRate: 0.20, // max radians/tick at full turn output

    // Feeding.
    eatRange: 8, // added to radius when reaching for plants
    biteRange: 4.0, // added to radius when biting creatures
    biteDamage: 18, // base bite damage, scaled by attacker area (few bites kill)
    retaliation: 0.42, // defender bites back ∝ its area * this factor
    carcassFactor: 0.7, // on a kill, predator also absorbs ∝ prey body area
    // Partial-hunting reward — the diagnosed escape from the predator deadlock.
    // Default 0 = OFF and bit-exact (consumes no RNG). When > 0, a creature gains
    // a SMALL energy bonus for moving toward a smaller creature (prey) within its
    // field of view, scaled by its own diet and its approach speed. This rewards
    // the *pursuit* precursor of hunting up a fitness GRADIENT, so a would-be
    // carnivore can climb toward competent predation instead of starving at the
    // all-or-nothing kill cliff (the adaptive valley). Diet-scaled, so herbivores
    // (diet≈0) get nothing — avoiding the indiscriminate "cannibal soup" that a
    // flat meat-floor produced. See ../CLAUDE.md "the predator problem".
    pursuitReward: 0,

    // --- Energetic levers against the carnivore ENERGETIC WALL (all default 0,
    // OFF, RNG-neutral => bit-exact). The wean test (CLAUDE.md re-attempt III)
    // split the predator problem in two: pursuitReward crosses the BEHAVIOURAL
    // valley (random brains learn to hunt), but carnivory stays net-NEGATIVE even
    // with skill — an ENERGETIC deficit the pursuit subsidy was only papering
    // over. These knobs attack that deficit directly so a hunting guild can be
    // SELF-SUFFICIENT (survive a wean to pursuitReward=0). All diet-scaled, so a
    // herbivore (diet~0) is untouched and the herbivore attractor isn't cheapened.
    //
    // carnMetabolismDiscount: a diet-scaled reduction of per-tick upkeep
    //   (effective _metab *= (1 - carnMetabolismDiscount*diet)). A leaner
    //   carnivore metabolism — being a hunter costs less to simply stay alive,
    //   so sparse kill income can cover the bill. 0 => upkeep unchanged.
    carnMetabolismDiscount: 0,
    // carnMoveDiscount: a diet-scaled reduction of movement cost
    //   (effective moveCost *= (1 - carnMoveDiscount*diet)). Cheaper locomotion
    //   for predators — chasing prey doesn't bankrupt them. 0 => moveCost
    //   unchanged.
    carnMoveDiscount: 0,
    // carnCarcassBonus: extra carcass yield ADDED to carcassFactor, but only for
    //   committed carnivores (scaled by diet) — effective carcass multiplier =
    //   carcassFactor + carnCarcassBonus*diet. A fatter kill payoff that does NOT
    //   also fatten low-diet omnivores (a raw carcassFactor bump would). 0 =>
    //   carcass yield unchanged.
    carnCarcassBonus: 0,

    // --- Reward-DENSITY lever (re-attempt IV cross-check). The magnitude levers
    // above all FAILED the wean (0/7, CLAUDE.md). Sharper diagnosis: Vivarium's
    // hunting is a NEURAL policy that reverts when the dense pursuitReward scaffold
    // is removed — the wall is reward DENSITY / credit-assignment, not energy
    // magnitude. A kill is a rare, delayed payoff; a policy drifts to the dense
    // steady gradient of grazing. preyVulnerability raises catch FREQUENCY so an
    // evolved hunting policy gets dense enough real reinforcement to self-sustain
    // past the wean — without paying any free energy (fair: prey just move slower;
    // no bite/carcass ⇒ no income). An independent neural-bridge cross-check
    // (Codex) predicts catch-frequency rescues the policy where magnitude doesn't.
    //
    // preyVulnerability: a WELL-FED herbivore slows (post-meal torpor) so a hunter's
    //   chase closes more often. Effective maxSpeed *= 1 - preyVulnerability *
    //   (energy/capacity) * (1 - diet): (1-diet) slows PREY not predators; eFrac slows
    //   only the WELL-FED (a hungry prey stays nimble — no forage death-spiral; the
    //   "slow when hungry" v1 collapsed the prey). Range [0,1]; 0 => unchanged, bit-exact.
    preyVulnerability: 0,

    // Digestion efficiency by diet. diet 0 = pure herbivore, 1 = pure carnivore.
    // Plants feed you ∝ (1 - diet); meat feeds you ∝ diet. Omnivores get a
    // little of both but excel at neither.
    herbDigest: 1.0,
    carnDigest: 0.9,
    // How much full carnivory (diet=1) suppresses plant digestion. Below 1 even
    // a carnivore can still graze a little, so a lineage can drift toward
    // predation without instantly starving — the bridge across the omnivore
    // valley that lets a food web actually evolve rather than collapsing to a
    // herbivore monoculture.
    plantSuppression: 0.7,

    // Reproduction (asexual: clone + mutate). Thresholds are fractions of capacity.
    reproduceThreshold: 0.74,
    reproduceCost: 0.56, // energy spent (fraction of capacity)
    childFraction: 0.78, // child starts with this fraction of the spent energy
    maturity: 45, // ticks before an individual can reproduce
    maxAge: 4400,
    ageVariance: 900,
  },

  pop: {
    softCap: 760, // above this, reproduction is suppressed (resource crunch)
    injectFloor: 22, // below this population, seed fresh random life
    injectCount: 9, // how many to seed per genesis event
    // Anti-snowball: frequency-dependent reproduction (少数方庇护). OFF by
    // default. When > 0, a clan breeds *less* easily the more it already
    // dominates the contestant pool — a majority clan brakes itself while a
    // minority breeds freely, so one early edge can't snowball to a wipeout.
    // Drag is zero at or below parity (50% share): an evenly-matched or
    // trailing clan feels nothing, so a *systematic* edge still wins; only a
    // runaway *random* lead gets pulled back. 0 keeps the RNG stream bit-exact.
    freqDependence: 0,
  },

  // --- RPS toxin/defense mechanism: the "defender" niche --------------------
  // Default-off (enabled:false) => every new code path below is skipped and NO
  // RNG is drawn, so the default world stays bit-exact (determinism hash
  // 4244329615). This is the long-missing THIRD leg of the non-transitive cycle
  // the project has aimed at since the PvP notes: hunter > grazer > defender >
  // hunter. A "defender" is a toxic/defended forager (creature.defense > 0):
  //   - biting one costs the attacker a toxin hit and yields less meat
  //     (creature._attack)  => defender beats hunter;
  //   - but carrying defense makes the forager's own grazing less efficient
  //     (creature.eatNearby) => grazer beats defender, so defense can't just
  //     become a cheaper herbivore monoculture (the key anti-degenerate rule).
  // Hunters still crush undefended grazers, closing the cycle. Toy-world proof &
  // implementation spec: Codex roundA/roundF (E:\AI项目\Vivarium辅助).
  // v2 levers deferred (each needs new serialized state or a brain channel):
  // handlingTicks (post-bite attacker stun) and a visibility cue so skilled
  // hunters can learn to avoid defenders.
  defense: {
    enabled: false,
    toxinEnergyCost: 8, // flat energy the attacker loses per bite, * prey.defense
    meatConversionMultiplier: 0.45, // meat+carcass energy from a defended kill: lerp(1, this, defense)
    plantEfficiencyPenalty: 0.18, // the defended forager's own plant digestion drops by this * defense
    damageReduction: 0, // armor: a defended creature takes (1 - this*defense) of the bite damage.
                        // Partial only (must stay < ~1/maxDefense so it's not untouchable, per
                        // roundF). Lets a defender SURVIVE an indiscriminate hunter swarm long
                        // enough to out-last it (the clean defender>hunter edge — without it, 50/50
                        // hunter-vs-defender just mutually annihilates). 0 => bit-exact.
  },

  mutation: {
    weightRate: 0.11, // probability each weight is perturbed on reproduction
    weightStd: 0.27, // gaussian std of a normal perturbation
    bigChance: 0.022, // chance a perturbation is a large jolt instead
    bigStd: 1.1,
    geneStd: 0.055, // relative std for continuous genes
    hueStd: 6.5, // degrees of hue drift (slow, so lineages stay visible)
    dietStd: 0.045,
    fovStd: 0.05,
    rangeStd: 0.06,
    forageStd: 0.03, // forage specialisation drift on reproduction (only when food.types > 1)
    defenseStd: 0.03, // defense trait drift on reproduction (only when defense.enabled)
  },

  // Default runtime knobs (the UI can change these live).
  sim: {
    stepsPerFrame: 1,
  },
};

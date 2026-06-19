/*
 * Vivarium — world
 * ----------------
 * Owns every living thing and drives time forward. One `step()` is one tick:
 *
 *   1. rebuild the spatial grids from current positions
 *   2. update every creature that was alive at the start of the tick
 *   3. remove the dead, keep the newborns
 *   4. regrow food
 *   5. if life has nearly died out, seed a fresh "genesis" cohort
 *   6. sample statistics for the live HUD and history charts
 *
 * The only intervention the world makes is the genesis floor (so a run can't
 * dead-end into an empty world) and a soft population cap (a stand-in for
 * finite space). Everything else is left to selection.
 *
 * DOM-free: the whole thing runs under Node for headless verification.
 */

const STAT_INTERVAL = 20; // ticks between history samples

class History {
  constructor(max = 720) {
    this.max = max;
    this.t = [];
    this.pop = [];
    this.food = [];
    this.diet = [];
    this.radius = [];
    this.carn = [];
    this.maxGen = [];
    this.lineages = [];
  }
  _p(arr, v) {
    arr.push(v);
    if (arr.length > this.max) arr.shift();
  }
  push(s) {
    this._p(this.t, s.tick);
    this._p(this.pop, s.pop);
    this._p(this.food, s.food);
    this._p(this.diet, s.avgDiet);
    this._p(this.radius, s.avgRadius);
    this._p(this.carn, s.carnFrac);
    this._p(this.maxGen, s.maxGen);
    this._p(this.lineages, s.lineages);
  }
  serialize() {
    return {
      t: this.t, pop: this.pop, food: this.food, diet: this.diet,
      radius: this.radius, carn: this.carn, maxGen: this.maxGen, lineages: this.lineages,
    };
  }
  load(o) {
    for (const k of ["t", "pop", "food", "diet", "radius", "carn", "maxGen", "lineages"]) {
      this[k] = o[k] || [];
    }
  }
}

class World {
  constructor(opts = {}) {
    this.width = CONFIG.world.width;
    this.height = CONFIG.world.height;
    this.seed = opts.seed != null ? (opts.seed >>> 0) : ((Math.random() * 0xffffffff) >>> 0);
    this.noGenesis = !!opts.noGenesis; // PvP: let a clan go extinct instead of reseeding
    this.rng = new RNG(this.seed);

    this.creatures = [];
    this.food = new FoodField(this);
    const cell = 64;
    this.creatureGrid = new SpatialGrid(this.width, this.height, cell);
    this.foodGrid = new SpatialGrid(this.width, this.height, cell);

    this.tick = 0;
    this.nextId = 1;
    this.births = 0;
    this.deaths = 0;
    this.genesisEvents = 0;

    this.foodEatenThisTick = 0;
    this.bitesThisTick = 0;
    this.predationsThisTick = 0;

    this.history = new History();
    this.stats = {};

    if (!opts.empty) this._populate(opts);
  }

  _populate(opts) {
    this.food.seed(CONFIG.food.startCount);
    const n = opts.creatures != null ? opts.creatures : CONFIG.creature.startCount;
    for (let i = 0; i < n; i++) this.spawnRandom(Genome.random(this.rng));
    this.rebuildGrids();
    this.computeStats();
  }

  spawnRandom(genome, clan = 0, forage) {
    const c = new Creature(
      this,
      genome,
      this.rng.range(0, this.width),
      this.rng.range(0, this.height),
      CONFIG.creature.energyStart,
      0,
      { clan, forage },
    );
    this.creatures.push(c);
    this.births++;
    return c;
  }

  spawnChild(parent, genome, energy) {
    const a = this.rng.range(0, TAU);
    const d = parent.radius + 2;
    let x = parent.x + Math.cos(a) * d;
    let y = parent.y + Math.sin(a) * d;
    x = (x + this.width) % this.width;
    y = (y + this.height) % this.height;
    // Forage specialisation evolves only in a multi-food world (else bit-exact:
    // no RNG drawn). Drift lets a generalist population branch into specialists
    // under disruptive selection — emergent niche differentiation.
    let childForage = parent.forage;
    if (CONFIG.food.types > 1) childForage = clamp(childForage + this.rng.gauss(0, CONFIG.mutation.forageStd), 0, 1);
    const c = new Creature(this, genome, x, y, energy, parent.generation + 1, { clan: parent.clan, forage: childForage });
    this.creatures.push(c);
    this.births++;
    return c;
  }

  rebuildGrids() {
    this.creatureGrid.clear();
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++) this.creatureGrid.insert(cs[i].x, cs[i].y, cs[i]);
    this.foodGrid.clear();
    const fs = this.food.list;
    for (let i = 0; i < fs.length; i++) this.foodGrid.insert(fs[i].x, fs[i].y, fs[i]);
  }

  // Per-clan census for frequency-dependent reproduction (anti-snowball). Only
  // computed when the knob is on, so the default path is untouched. Contestant
  // total excludes wildlife (clan -1).
  _countClans() {
    const counts = {};
    let contestants = 0;
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++) {
      const k = cs[i].clan;
      counts[k] = (counts[k] || 0) + 1;
      if (k >= 0) contestants++;
    }
    this._clanCounts = counts;
    this._contestantTotal = contestants;
  }

  step() {
    this.foodEatenThisTick = 0;
    this.bitesThisTick = 0;
    this.predationsThisTick = 0;

    this.rebuildGrids();
    if (CONFIG.pop.freqDependence > 0) this._countClans();

    // Only creatures alive at the start of the tick act; newborns appended by
    // reproduction wait until next tick.
    const cs = this.creatures;
    const count = cs.length;
    for (let i = 0; i < count; i++) {
      if (cs[i].alive) cs[i].update(this);
    }

    // Compact: keep the living (including this tick's newborns), tally deaths.
    const alive = [];
    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i];
      if (c.alive) alive.push(c);
      else this.deaths++;
    }
    this.creatures = alive;

    this.food.removeEaten();
    this.food.grow();

    // Genesis floor: never let the world flatline (disabled in PvP, where
    // extinction must be allowed to decide the match). Injected wildlife is
    // clan -1, so it never counts toward either contestant.
    if (!this.noGenesis && this.creatures.length < CONFIG.pop.injectFloor) {
      for (let i = 0; i < CONFIG.pop.injectCount; i++) {
        this.spawnRandom(Genome.random(this.rng), -1);
      }
      this.genesisEvents++;
    }

    this.tick++;
    if (this.tick % STAT_INTERVAL === 0) {
      this.computeStats();
      this.history.push(this.stats);
    }
  }

  computeStats() {
    const cs = this.creatures;
    const n = cs.length;
    let diet = 0, rad = 0, gen = 0, maxGen = 0, energy = 0, age = 0, carn = 0;
    const buckets = new Int32Array(18); // 20°-wide hue bins -> visible "lineages"
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      diet += c.diet;
      rad += c.radius;
      gen += c.generation;
      if (c.generation > maxGen) maxGen = c.generation;
      energy += c.energy / c.capacity;
      age += c.age;
      if (c.diet > 0.5) carn++;
      let b = (c.hue / 20) | 0;
      if (b < 0) b = 0;
      else if (b > 17) b = 17;
      buckets[b]++;
    }
    let lineages = 0;
    for (let i = 0; i < 18; i++) if (buckets[i] >= 2) lineages++;
    this.stats = {
      tick: this.tick,
      pop: n,
      food: this.food.list.length,
      avgDiet: n ? diet / n : 0,
      avgRadius: n ? rad / n : 0,
      avgGen: n ? gen / n : 0,
      maxGen,
      avgEnergy: n ? energy / n : 0,
      avgAge: n ? age / n : 0,
      carnFrac: n ? carn / n : 0,
      lineages,
      births: this.births,
      deaths: this.deaths,
    };
    return this.stats;
  }

  // Nearest creature whose body contains the world-space point, for selection.
  pickAt(x, y) {
    let best = null,
      bd = Infinity;
    for (const c of this.creatures) {
      const dx = c.x - x,
        dy = c.y - y;
      const d2 = dx * dx + dy * dy;
      const r = c.radius + 5;
      if (d2 <= r * r && d2 < bd) {
        bd = d2;
        best = c;
      }
    }
    return best;
  }

  // --- persistence -----------------------------------------------------------
  serialize() {
    return {
      version: 1,
      seed: this.seed,
      tick: this.tick,
      nextId: this.nextId,
      rng: this.rng.s,
      foodAcc: this.food._acc,
      births: this.births,
      deaths: this.deaths,
      genesisEvents: this.genesisEvents,
      food: this.food.list.map((f) => ({ x: f.x, y: f.y, t: f.type })),
      creatures: this.creatures.map((c) => c.toJSON()),
      history: this.history.serialize(),
    };
  }

  static fromJSON(data) {
    const w = new World({ seed: data.seed, empty: true });
    w.tick = data.tick || 0;
    w.nextId = data.nextId || 1;
    w.births = data.births || 0;
    w.deaths = data.deaths || 0;
    w.genesisEvents = data.genesisEvents || 0;
    w.food.list = (data.food || []).map((f) => ({ x: f.x, y: f.y, eaten: false, type: f.t != null ? f.t : 0 }));
    w.food._acc = data.foodAcc || 0;
    w.creatures = (data.creatures || []).map((o) => Creature.fromJSON(w, o));
    if (data.history) w.history.load(data.history);
    w.rng.s = (data.rng >>> 0) || 1; // restore RNG only after creatures are built
    w.rebuildGrids();
    w.computeStats();
    return w;
  }
}

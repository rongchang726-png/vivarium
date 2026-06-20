/*
 * Vivarium — creature
 * -------------------
 * One organism. Each tick it runs a fixed loop:
 *
 *   sense  -> gather vision + proprioception into the brain's input vector
 *   think  -> one forward pass of the recurrent net
 *   act    -> turn, thrust, and (optionally) bite
 *   eat    -> absorb any plants within reach
 *   live   -> pay metabolic + movement costs, age, possibly die
 *   breed  -> if well-fed and mature, clone-with-mutation
 *
 * Nothing here is scripted. Foraging, fleeing, hunting, and the split into
 * herbivore/carnivore niches all have to be *discovered* by natural selection
 * acting on the genome.
 *
 * No DOM access — this runs under Node for headless testing too.
 */

const _MAX_AREA = Math.PI * CONFIG.creature.maxRadius * CONFIG.creature.maxRadius;

class Creature {
  // opts lets save/load restore exact per-individual state without consuming
  // the world RNG (so RNG state can be restored separately). Fresh spawns pass
  // {} and draw their heading/phase/lifespan/id from the RNG.
  constructor(world, genome, x, y, energy, generation, opts = {}) {
    this.genome = genome;
    this.genes = genome.genes;
    this.brain = new Brain(genome.weights);

    this.x = x;
    this.y = y;
    this.heading = opts.heading != null ? opts.heading : world.rng.range(0, TAU);
    this.phase = opts.phase != null ? opts.phase : world.rng.range(0, TAU);
    this.speed = 0;

    // Cached morphology.
    this.radius = this.genes.radius;
    this.diet = this.genes.diet;
    this.hue = this.genes.hue;
    this.area = Math.PI * this.radius * this.radius;
    this._areaSqrt = Math.sqrt(this.area);
    this._areaNorm = this.area / _MAX_AREA; // 0..1 size factor for combat scaling

    this.capacity = CONFIG.creature.capacityBase + CONFIG.creature.capacityPerArea * this.area;
    this.energy = Math.min(energy, this.capacity);

    const t = (this.radius - CONFIG.creature.minRadius) /
      (CONFIG.creature.maxRadius - CONFIG.creature.minRadius);
    this.maxSpeed = lerp(CONFIG.creature.speedSmall, CONFIG.creature.speedBig, t);
    this._metab = CONFIG.creature.metabBase + CONFIG.creature.metabPerArea * this.area;

    this.age = opts.age != null ? opts.age : 0;
    this._maxAge = opts.maxAge != null
      ? opts.maxAge
      : CONFIG.creature.maxAge + (world.rng.next() * 2 - 1) * CONFIG.creature.ageVariance;
    this.generation = generation;
    this.offspring = opts.offspring != null ? opts.offspring : 0;
    this.id = opts.id != null ? opts.id : world.nextId++;
    // PvP lineage tag: which founding clan this creature descends from (0 by
    // default; -1 for genesis-injected wildlife). Inherited by children; it is a
    // pure label — it never affects behaviour or physics, only scorekeeping.
    this.clan = opts.clan != null ? opts.clan : 0;
    // Forage specialisation: 0/1 = specialise on food type 0/1, 0.5 = generalist.
    // Inherited like clan (creature-level, NOT in the genome — so the default
    // single-food world keeps its RNG stream bit-exact). Only bites when
    // food.types > 1; see eatNearby.
    this.forage = opts.forage != null ? opts.forage : 0.5;

    this.alive = true;
    this.cause = null;
    this.lastHurt = 0; // frames-since-hit, for render flashing
    this.lastAttack = 0;
    this.lastBite = 0;
    this.ateThisTick = 0;

    // Reusable scratch buffers (avoid per-tick allocation).
    this._inp = new Float32Array(BRAIN.I);
    this._fd = new Float32Array(BRAIN.EYES); // nearest food squared-dist per eye
    this._cd = new Float32Array(BRAIN.EYES); // nearest creature squared-dist per eye
    this._cref = new Array(BRAIN.EYES).fill(null);
  }

  // --- sense -----------------------------------------------------------------
  sense(world) {
    const EYES = BRAIN.EYES,
      CH = BRAIN.CH;
    const range = this.genes.range;
    const r2 = range * range;
    const half = this.genes.fov / 2;
    const sectorW = this.genes.fov / EYES;
    const hx = this.x,
      hy = this.y,
      heading = this.heading;
    const fd = this._fd,
      cd = this._cd,
      cref = this._cref;
    for (let e = 0; e < EYES; e++) {
      fd[e] = Infinity;
      cd[e] = Infinity;
      cref[e] = null;
    }

    world.foodGrid.query(hx, hy, range, (f) => {
      if (f.eaten) return;
      const dx = f.x - hx,
        dy = f.y - hy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 <= 0) return;
      const rel = wrapAngle(Math.atan2(dy, dx) - heading);
      if (rel < -half || rel > half) return;
      let e = ((rel + half) / sectorW) | 0;
      if (e < 0) e = 0;
      else if (e >= EYES) e = EYES - 1;
      if (d2 < fd[e]) fd[e] = d2;
    });

    world.creatureGrid.query(hx, hy, range, (c) => {
      if (c === this || !c.alive) return;
      const dx = c.x - hx,
        dy = c.y - hy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2 || d2 <= 0) return;
      const rel = wrapAngle(Math.atan2(dy, dx) - heading);
      if (rel < -half || rel > half) return;
      let e = ((rel + half) / sectorW) | 0;
      if (e < 0) e = 0;
      else if (e >= EYES) e = EYES - 1;
      if (d2 < cd[e]) {
        cd[e] = d2;
        cref[e] = c;
      }
    });

    const inp = this._inp;
    for (let e = 0; e < EYES; e++) {
      const base = e * CH;
      inp[base] = fd[e] === Infinity ? 0 : 1 - Math.sqrt(fd[e]) / range;
      const c = cref[e];
      if (c) {
        inp[base + 1] = 1 - Math.sqrt(cd[e]) / range;
        inp[base + 2] = Math.tanh((c.radius - this.radius) * 0.5); // +ve => bigger
        inp[base + 3] = c.diet; // is it a predator?
      } else {
        inp[base + 1] = 0;
        inp[base + 2] = 0;
        inp[base + 3] = 0;
      }
    }
    const g = EYES * CH;
    inp[g] = this.energy / this.capacity;
    inp[g + 1] = this.speed / this.maxSpeed;
    inp[g + 2] = Math.min(1, this.age / this._maxAge);
    inp[g + 3] = Math.sin(this.age * 0.1 + this.phase); // internal oscillator
    inp[g + 4] = 1; // bias
  }

  // --- think + act -----------------------------------------------------------
  act(world) {
    const out = this.brain.forward(this._inp);
    const turn = Math.tanh(out[0]);
    const thrust = sigmoid(out[1]);
    const bite = sigmoid(out[2]);
    this.lastBite = bite;

    this.heading = wrapAngle(this.heading + turn * CONFIG.creature.turnRate);
    const target = thrust * this.maxSpeed;
    this.speed += (target - this.speed) * 0.35; // a little inertia
    this.x += Math.cos(this.heading) * this.speed;
    this.y += Math.sin(this.heading) * this.speed;

    // Toroidal world: no walls to camp against, no edge effects to overfit to.
    // (The isolation experiment can override this with a mid-wall; that DOES
    // reintroduce camping/edge effects — a known cost of testing spatial
    // structure. Default null keeps the clean torus, bit-exact.)
    const W = world.width,
      H = world.height;
    const wall = CONFIG.world.wall;
    if (wall) {
      const mid = W * 0.5;
      const prevX = this.x - Math.cos(this.heading) * this.speed;
      const inGap = this.y >= wall.gapLo && this.y < wall.gapHi;
      if (!inGap) {
        if (prevX < mid && this.x >= mid) this.x = mid - 1e-6;
        else if (prevX >= mid && this.x < mid) this.x = mid;
      }
      if (this.x < 0) this.x = 0;
      else if (this.x >= W) this.x = W - 1e-6;
    } else {
      if (this.x < 0) this.x += W;
      else if (this.x >= W) this.x -= W;
    }
    if (this.y < 0) this.y += H;
    else if (this.y >= H) this.y -= H;

    this.energy -= CONFIG.creature.moveCost * thrust * this.speed * this._areaSqrt;

    if (bite > 0.5) this._attack(world);
  }

  _attack(world) {
    const reach = this.radius + CONFIG.creature.biteRange;
    const reach2 = reach * reach;
    let best = null,
      bestD2 = Infinity;
    world.creatureGrid.query(this.x, this.y, reach, (c) => {
      if (c === this || !c.alive) return;
      const dx = c.x - this.x,
        dy = c.y - this.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= reach2 && d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    });
    if (!best) return;

    const carnEff = this.diet * CONFIG.creature.carnDigest;
    const dmg = CONFIG.creature.biteDamage * this._areaNorm;
    // Energy harvested is capped by what the prey actually has, so overkill on
    // the finishing bite isn't a windfall...
    const take = Math.min(dmg, Math.max(0, best.energy));
    best.energy -= dmg;
    best.lastHurt = 6;
    this.energy += take * carnEff;
    // The victim's body fights back: biting something big is dangerous, which
    // is what keeps predators preferring prey smaller than themselves.
    this.energy -= CONFIG.creature.biteDamage * best._areaNorm * CONFIG.creature.retaliation;
    this.lastAttack = 4;
    world.bitesThisTick++;
    if (best.energy <= 0) {
      best.alive = false;
      best.cause = "preyed";
      // ...but a successful kill yields the prey's biomass as a proper meal,
      // which is what makes hunting a viable living at all.
      this.energy += CONFIG.creature.carcassFactor * best.area * carnEff;
      world.predationsThisTick++;
    }
  }

  // --- eat -------------------------------------------------------------------
  eatNearby(world) {
    const herbEff =
      (1 - CONFIG.creature.plantSuppression * this.diet) * CONFIG.creature.herbDigest;
    const reach = this.radius + CONFIG.creature.eatRange;
    const reach2 = reach * reach;
    const multi = CONFIG.food.types > 1; // resource partitioning active?
    const spec = CONFIG.food.forageSpecialization;
    world.foodGrid.query(this.x, this.y, reach, (f) => {
      if (f.eaten) return;
      const dx = f.x - this.x,
        dy = f.y - this.y;
      if (dx * dx + dy * dy <= reach2) {
        // Resource partitioning (food.types > 1): eat a plant whose type matches
        // your `forage` specialisation efficiently, the other poorly. The
        // trade-off opens two niches (rho < 1) so specialists on different foods
        // coexist instead of competitively excluding. multi=false => bit-exact.
        let eff = herbEff;
        if (multi) {
          // Food type normalised so forage (in [0,1]) can specialise on any of N
          // types. Linear axis: type k -> k/(N-1) (2 types = 0/1, unchanged).
          // Circular axis: type k -> k/N on a ring, distance wraps — no end
          // effect, so even N-way branching is possible.
          const N = CONFIG.food.types;
          const circ = CONFIG.food.forageCircular;
          const nt = circ ? f.type / N : f.type / (N - 1);
          let d = Math.abs(this.forage - nt);
          if (circ && d > 0.5) d = 1 - d;
          const m = 1 - spec * d;
          if (m <= 0) return; // can't digest this type — leave it (no interference)
          eff *= m;
        }
        f.eaten = true;
        // Defended plants: a flat toxin cost makes herbivory expensive (0 by
        // default => unchanged, bit-exact). Net gain can go negative for a poor
        // digester, which is the point — it punishes relying on plants.
        const gain = CONFIG.food.energy * eff - (CONFIG.food.toxin || 0);
        this.energy += gain;
        this.ateThisTick += gain;
        world.foodEatenThisTick++;
      }
    });
  }

  // --- live ------------------------------------------------------------------
  metabolize() {
    this.energy -= this._metab;
    if (this.energy > this.capacity) this.energy = this.capacity;
    this.age++;
    if (this.lastHurt > 0) this.lastHurt--;
    if (this.lastAttack > 0) this.lastAttack--;
    if (this.energy <= 0) {
      this.alive = false;
      if (!this.cause) this.cause = "starved";
    } else if (this.age >= this._maxAge) {
      this.alive = false;
      this.cause = "age";
    }
  }

  // --- breed -----------------------------------------------------------------
  maybeReproduce(world) {
    if (this.age < CONFIG.creature.maturity) return;
    if (world.creatures.length >= CONFIG.pop.softCap) return;
    // Anti-snowball: a clan that already dominates the contestant pool brakes
    // its own breeding, so an early lead can't snowball to a wipeout. Zero drag
    // at or below parity (50% share) — a systematic edge still wins, only a
    // runaway random lead is pulled back. Off (and RNG-neutral) unless enabled.
    const fd = CONFIG.pop.freqDependence || 0;
    if (fd > 0 && this.clan >= 0) {
      const mine = world._clanCounts[this.clan] || 0;
      const total = world._contestantTotal || 0;
      // Brake only while a rival is actually present. Once you're the sole
      // surviving clan (mine === total), lift the brake — otherwise a lone
      // winner throttles its own breeding to extinction and the world dies 0:0
      // (exactly what fd=1.0 did before this guard).
      if (total > mine) {
        const share = mine / total;
        const suppress = fd * (share - 0.5) * 2; // 0 at parity, up to fd near-monopoly
        if (suppress > 0 && world.rng.next() < suppress) return;
      }
    }
    if (this.energy < CONFIG.creature.reproduceThreshold * this.capacity) return;
    const cost = CONFIG.creature.reproduceCost * this.capacity;
    this.energy -= cost;
    const childGenome = this.genome.mutated(world.rng);
    world.spawnChild(this, childGenome, cost * CONFIG.creature.childFraction);
    this.offspring++;
  }

  update(world) {
    this.ateThisTick = 0;
    this.sense(world);
    this.act(world);
    this.eatNearby(world);
    this.metabolize();
    if (this.alive) this.maybeReproduce(world);
  }

  // --- persistence -----------------------------------------------------------
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      h: this.heading,
      p: this.phase,
      s: this.speed,
      e: this.energy,
      a: this.age,
      m: this._maxAge,
      gen: this.generation,
      off: this.offspring,
      id: this.id,
      c: this.clan,
      f: this.forage,
      // The recurrent hidden state is live dynamic memory: without it, a
      // restored world is not the same world. Serialize it for exact reload.
      bh: Array.from(this.brain.h),
      g: this.genome.toJSON(),
    };
  }

  static fromJSON(world, o) {
    const c = new Creature(world, Genome.fromJSON(o.g), o.x, o.y, o.e, o.gen, {
      heading: o.h,
      phase: o.p,
      age: o.a,
      maxAge: o.m,
      offspring: o.off,
      id: o.id,
      clan: o.c,
      forage: o.f,
    });
    if (o.s != null) c.speed = o.s;
    if (o.bh) c.brain.h.set(o.bh);
    return c;
  }
}

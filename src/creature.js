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
    // Energetic lever (default 0 => unchanged, bit-exact): a leaner carnivore
    // metabolism. Diet-scaled, so herbivores (diet 0) keep their exact upkeep and
    // the herbivore attractor is not cheapened. Computed once here from this
    // individual's diet — no per-tick branch, no RNG.
    const _cmd = CONFIG.creature.carnMetabolismDiscount;
    if (_cmd) this._metab *= 1 - _cmd * this.diet;

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
    // Defense (RPS "defender" trait): a toxic/defended forager. Creature-level
    // like forage/clan (NOT in the genome — so the default world, with
    // CONFIG.defense.enabled false, keeps its RNG stream bit-exact). 0 =
    // undefended. When active it cuts both ways: biting you costs the attacker
    // and yields less meat (_attack), but it also makes your OWN grazing less
    // efficient (eatNearby) — defense isn't free. See ../CLAUDE.md RPS notes.
    this.defense = opts.defense != null ? opts.defense : 0;

    this.alive = true;
    this.cause = null;
    this.lastHurt = 0; // frames-since-hit, for render flashing
    this.lastAttack = 0;
    this.lastBite = 0;
    this.ateThisTick = 0;
    // Functional-response handling time: ticks still "occupied" after a kill, during
    // which this creature cannot attack. Always 0 unless CONFIG.creature.handlingTicks
    // > 0, so the default world draws no new path and stays bit-exact.
    this.handleCooldown = 0;
    // Corrected-satiation digestion buffer: un-absorbed carcass meat awaiting release
    // at the capped intake rate. Always 0 unless CONFIG.creature.maxIntakePerTick > 0,
    // so the default world never writes/reads/serializes it and stays bit-exact.
    this.digestBuffer = 0;

    // Reusable scratch buffers (avoid per-tick allocation).
    this._inp = new Float32Array(BRAIN.I);
    this._fd = new Float32Array(BRAIN.EYES); // nearest food squared-dist per eye
    this._cd = new Float32Array(BRAIN.EYES); // nearest creature squared-dist per eye
    this._cref = new Array(BRAIN.EYES).fill(null);
    // Pursuit-reward scratch (only written when CONFIG.creature.pursuitReward > 0):
    // unit direction to the nearest smaller in-view creature, sensed pre-move.
    this._hasPrey = false;
    this._preyUx = 0;
    this._preyUy = 0;
  }

  // --- sense -----------------------------------------------------------------
  sense(world) {
    const EYES = BRAIN.EYES,
      CH = BRAIN.CH;
    // Terrain modulates sight RANGE (not the angular FOV): open regions see far, dense ones
    // see near — one axis that makes a far-seeing forager vs a short-range one each fit a
    // different place. Off (world.biome null) => range === genes.range, bit-exact.
    let range = this.genes.range;
    if (world.biome) range *= world.biome.fovAt(this.x, this.y);
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

    // Pursuit-reward bookkeeping: track the nearest smaller in-view creature so
    // act() can reward moving toward it. Guarded so it's inert (no behaviour, no
    // RNG) when pursuitReward is 0 — the default stays bit-exact.
    const pursuit = CONFIG.creature.pursuitReward > 0;
    let preyD2 = Infinity,
      preyDx = 0,
      preyDy = 0;
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
      if (pursuit && c.radius < this.radius && d2 < preyD2) {
        preyD2 = d2;
        preyDx = dx;
        preyDy = dy;
      }
    });
    if (pursuit) {
      if (preyD2 < Infinity) {
        const inv = 1 / Math.sqrt(preyD2);
        this._preyUx = preyDx * inv;
        this._preyUy = preyDy * inv;
        this._hasPrey = true;
      } else {
        this._hasPrey = false;
      }
    }

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
    // Reward-DENSITY lever (preyVulnerability, default 0 => bit-exact): a WELL-FED
    // herbivore moves slower (post-meal torpor), so a hunter's chase closes more
    // often — raising catch FREQUENCY (the dense reinforcement a neural hunting
    // policy needs to survive the wean) rather than per-kill payoff. Scaled by diet
    // (1-diet) => slows PREY not predators; by energy (eFrac) => only the WELL-FED
    // (a hungry prey stays nimble and forages freely — so NO starvation death-spiral;
    // the v1 "slow when hungry" form collapsed the prey population). Prey must graze
    // to ~74% to breed, so the vulnerable window is unavoidable yet self-limiting.
    // No energy granted here — fair: a slow prey is only easier to *reach*.
    let maxSpeed = this.maxSpeed;
    const pv = CONFIG.creature.preyVulnerability;
    if (pv > 0) {
      const eFrac = this.energy / this.capacity;
      maxSpeed *= 1 - pv * eFrac * (1 - this.diet);
    }
    const target = thrust * maxSpeed;
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

    // Energetic lever (default 0 => unchanged, bit-exact): cheaper locomotion for
    // carnivores so chasing prey doesn't bankrupt them. Diet-scaled => herbivores
    // pay the exact same move cost as before.
    let moveCost = CONFIG.creature.moveCost;
    const _cvd = CONFIG.creature.carnMoveDiscount;
    if (_cvd) moveCost *= 1 - _cvd * this.diet;
    // Terrain modulates the cost of locomotion by place (composes with carnMoveDiscount).
    // Off (world.biome null) => unchanged, bit-exact.
    if (world.biome) moveCost *= world.biome.moveAt(this.x, this.y);
    this.energy -= moveCost * thrust * this.speed * this._areaSqrt;

    // Partial-hunting reward: a small, diet-scaled bonus for actually moving
    // toward the prey sensed this tick — rewarding the *pursuit* up a gradient so
    // a would-be hunter need not land a full kill to get any payoff. Off (0) and
    // bit-exact by default; herbivores (diet≈0) get ≈nothing.
    const pr = CONFIG.creature.pursuitReward;
    if (pr > 0 && this._hasPrey && this.diet > 0) {
      const approach =
        Math.cos(this.heading) * this.speed * this._preyUx +
        Math.sin(this.heading) * this.speed * this._preyUy;
      if (approach > 0) this.energy += pr * this.diet * approach;
    }

    // Handling time / satiation gate (default off): a creature busy handling a kill
    // can't attack. Both handleCooldown and digestBuffer are always 0 when their
    // features are off, so this gate is a no-op by default (both <= 0 always true) —
    // bit-exact. With maxIntakePerTick on, digestBuffer > 0 means "still digesting the
    // last kill" => a SATED predator stops hunting until it has digested. That caps the
    // KILL rate (what actually depletes prey — a fed hunter otherwise keeps biting), the
    // functional-response brake giving prey periodic refuge: hunt -> sated -> digest ->
    // hungry -> hunt. The digestion period is meal-scaled (buffer/maxIntake ticks), unlike
    // handlingTicks' fixed timer — and the hunter does NOT get the carcass for free (it's
    // released at maxIntake/tick, overflow wasted), so it can't out-breed the way the
    // fixed-handling free-rest did (CLAUDE.md Phase 2.6 backfire).
    if (bite > 0.5 && this.handleCooldown <= 0 && this.digestBuffer <= 0) this._attack(world);
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
    const def = CONFIG.defense;
    let dmg = CONFIG.creature.biteDamage * this._areaNorm;
    // Toxic/defended prey (RPS "defender" leg). Biting a defended creature (a)
    // costs the attacker a flat toxin hit, (b) converts to less usable meat, and
    // (c) is partly turned away by armor (damageReduction) so fewer of the
    // would-be-lethal bites get through. Together these make a hunter's ROI on a
    // defender poor-to-negative AND let the defender SURVIVE an indiscriminate
    // swarm long enough to out-last it — the clean defender>hunter edge (without
    // the armor, a 50/50 hunter-vs-defender just mutually annihilates). Still
    // killable (partial reduction only, per roundF's "not untouchable" rule).
    // Gated on defense.enabled AND prey defense>0, so the default world is
    // bit-exact (meatMult/dmg unchanged; x*1.0===x). Spec: Codex roundF.
    let meatMult = 1;
    if (def.enabled && best.defense > 0) {
      this.energy -= def.toxinEnergyCost * best.defense;
      meatMult = 1 + (def.meatConversionMultiplier - 1) * best.defense; // lerp(1, mcm, defense)
      dmg *= 1 - def.damageReduction * best.defense; // armor: less damage gets through
    }
    // Energy harvested is capped by what the prey actually has, so overkill on
    // the finishing bite isn't a windfall...
    const take = Math.min(dmg, Math.max(0, best.energy));
    best.energy -= dmg;
    best.lastHurt = 6;
    this.energy += take * carnEff * meatMult;
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
      // Energetic lever (carnCarcassBonus default 0 => unchanged, bit-exact): a
      // fatter kill payoff for committed carnivores only (diet-scaled), so a real
      // hunter is rewarded without also fattening low-diet omnivores.
      const carcassMult =
        CONFIG.creature.carcassFactor + CONFIG.creature.carnCarcassBonus * this.diet;
      const carcass = carcassMult * best.area * carnEff * meatMult;
      // Corrected satiation (maxIntakePerTick default 0 => instant, bit-exact): the
      // big lump-sum carcass payoff is the documented driver of the carnivore SUPERBOOM
      // (dense prey => frequent lucrative kills => one kill instantly tops the hunter
      // to capacity => instant reproduction => explosive growth => prey crash). When
      // metered, it goes into a digestion buffer that releases at a capped rate
      // (metabolize), so a kill can't instantly fund a reproduction. ONLY the carcass
      // is metered; the per-bite `take` above stays immediate, so combat balance (bite
      // income vs retaliation/toxin — the hunter>grazer & defender>hunter edges) is
      // unchanged. else-branch is byte-identical to the prior code.
      if (CONFIG.creature.maxIntakePerTick > 0) {
        // Finite gut: a kill fills the buffer up to capacity; carcass beyond that is
        // WASTED (a predator can't ingest an unbounded meal). This restores the natural
        // saturation the instant capacity-clamp gave — without it a lossless buffer just
        // banks the would-be-wasted excess and slow-releases it, so each kill funds MORE
        // offspring => a BIGGER boom (measured: the maxIntake=3 backfire, CLAUDE.md).
        const cap = this.capacity;
        const sum = this.digestBuffer + carcass;
        this.digestBuffer = sum < cap ? sum : cap;
      } else this.energy += carcass;
      world.predationsThisTick++;
      // Kill event: predator -> prey, the one TRUE causal edge the core logs (this === the
      // killer). Bit-exact: only emits when chronicle logging is on. The prey's matching
      // death event (cause "preyed") fires in world.step's compaction loop.
      if (world.eventLog) world.eventLog.push({ k: "kill", t: world.tick, pred: this.id, prey: best.id, predClan: this.clan, preyClan: best.clan, predDiet: this.diet, preyDef: best.defense, x: this.x, y: this.y });
      // Functional-response handling time (default 0 => no write, bit-exact): after a
      // kill the predator is occupied for handlingTicks before it can attack again.
      if (CONFIG.creature.handlingTicks > 0) this.handleCooldown = CONFIG.creature.handlingTicks;
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
    const def = CONFIG.defense;
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
        // Defended foragers pay a plant-efficiency cost (the grazer>defender edge:
        // defense isn't free, so when predators are rare an efficient grazer out-
        // competes a defender). Gated on defense.enabled AND defense>0 => the
        // default world is bit-exact.
        if (def.enabled && this.defense > 0) eff *= 1 - def.plantEfficiencyPenalty * this.defense;
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
    // Corrected satiation: release buffered carcass meat into usable energy at the
    // capped rate, BEFORE the capacity clamp (so released energy can't bank past
    // capacity — no over-cap storage exploit). Default off (maxIntakePerTick 0 =>
    // digestBuffer is always 0 => this block never runs, bit-exact). The cap is what
    // turns a carcass windfall into a slow drip, braking the predator superboom.
    const mi = CONFIG.creature.maxIntakePerTick;
    if (mi > 0 && this.digestBuffer > 0) {
      const r = this.digestBuffer < mi ? this.digestBuffer : mi;
      this.energy += r;
      this.digestBuffer -= r;
    }
    if (this.energy > this.capacity) this.energy = this.capacity;
    this.age++;
    if (this.lastHurt > 0) this.lastHurt--;
    if (this.lastAttack > 0) this.lastAttack--;
    if (this.handleCooldown > 0) this.handleCooldown--; // handling-time refractory (default off)
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
    const j = {
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
      d: this.defense,
      // The recurrent hidden state is live dynamic memory: without it, a
      // restored world is not the same world. Serialize it for exact reload.
      bh: Array.from(this.brain.h),
      g: this.genome.toJSON(),
    };
    // Handling-time cooldown is dynamic per-creature state, but serialized ONLY when
    // the feature is on — so the default save format (and the determinism hash) stays
    // byte-for-byte unchanged. When on, it's restored for exact save/load.
    if (CONFIG.creature.handlingTicks > 0) j.hc = this.handleCooldown;
    // Digestion buffer: dynamic per-creature state, serialized ONLY when the feature is
    // on, so the default save format (and determinism hash 4244329615) stays unchanged.
    if (CONFIG.creature.maxIntakePerTick > 0) j.db = this.digestBuffer;
    return j;
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
      defense: o.d,
    });
    if (o.s != null) c.speed = o.s;
    if (o.bh) c.brain.h.set(o.bh);
    if (o.hc != null) c.handleCooldown = o.hc;
    if (o.db != null) c.digestBuffer = o.db;
    return c;
  }
}

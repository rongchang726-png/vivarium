/*
 * Vivarium — food
 * ---------------
 * Plants are the base of the food web: simple energy parcels scattered across
 * the world. New plants appear at a steady rate, sometimes clustering near
 * existing ones so the world develops patchy "meadows" rather than a uniform
 * lawn — spatial structure that foraging behaviour can actually exploit.
 *
 * All randomness flows through the world's RNG so food layout is reproducible.
 */

class FoodField {
  constructor(world) {
    this.world = world;
    this.rng = world.rng;
    this.list = []; // { x, y, eaten }
    this._acc = 0; // fractional spawn accumulator
    // Famine scars (BUILD 2 disturbance): patches where regrowth is suppressed for a while
    // after a Storyteller famine. Empty by default => every scar code path below is skipped
    // (no rng, no behaviour) => the default world stays bit-exact. Populated only via addScar().
    this.scars = []; // { x, y, r, until, suppression }
  }

  seed(n) {
    for (let i = 0; i < n; i++) this._addRandom();
  }

  _addRandom() {
    const x = this.rng.range(0, this.world.width);
    const y = this.rng.range(0, this.world.height);
    // Place-determined food type when terrain is on (the region grows its own plant type);
    // else the original behaviour — bit-exact (same rng draws, in the same order: x, y, then
    // the type int only when food.types>1; the biome branch draws no rng).
    const p = {
      x: x,
      y: y,
      eaten: false,
      type: this.world.biome
        ? this.world.biome.foodTypeAt(x, y)
        : (CONFIG.food.types > 1 ? this.rng.int(CONFIG.food.types) : 0),
    };
    this.list.push(p);
    return p;
  }

  _addCluster() {
    if (this.list.length === 0) return this._addRandom();
    const seed = this.rng.pick(this.list);
    const a = this.rng.range(0, TAU);
    const r = this.rng.range(0, CONFIG.food.clusterRadius);
    const x = clamp(seed.x + Math.cos(a) * r, 0, this.world.width);
    const y = clamp(seed.y + Math.sin(a) * r, 0, this.world.height);
    // With terrain on, a clustered plant takes its LANDING region's type (place wins over the
    // seed's type — a cluster spilling across a border grows the local plant). Off => meadows
    // cluster by the seed's type, bit-exact (no rng drawn for type either way).
    const p = {
      x: x,
      y: y,
      eaten: false,
      type: this.world.biome ? this.world.biome.foodTypeAt(x, y) : (seed.type != null ? seed.type : 0),
    };
    this.list.push(p);
    return p;
  }

  // Accumulate fractional growth and add whole plants up to the cap.
  grow() {
    this._acc += CONFIG.food.spawnPerTick;
    const dd = CONFIG.food.densityDependence || 0;
    const biome = this.world.biome;
    // Expire finished scars (no rng). Guarded => default world (no scars) untouched, bit-exact.
    if (this.scars.length) {
      const t = this.world.tick;
      let w = 0;
      for (let i = 0; i < this.scars.length; i++) if (this.scars[i].until > t) this.scars[w++] = this.scars[i];
      this.scars.length = w;
    }
    const hasScars = this.scars.length > 0;
    while (this._acc >= 1) {
      this._acc -= 1;
      if (this.list.length >= CONFIG.food.max) break;
      const p = this.rng.chance(CONFIG.food.clusterChance) ? this._addCluster() : this._addRandom();
      // Regional density: thin a plant landing in a sparser region (the placement rng was
      // already spent, so this is deterministic). Off (biome null) => never runs, bit-exact.
      if (biome) {
        const rp = biome.densityRejectAt(p.x, p.y);
        if (rp > 0 && this.rng.chance(rp)) { this.list.pop(); continue; }
      }
      // Famine scar: regrowth landing in a live scar often fails to take (a barren patch),
      // so the struck region recovers slowly. Off (no scars) => skipped, bit-exact.
      if (hasScars) {
        const sup = this._scarSuppressionAt(p.x, p.y);
        if (sup > 0 && this.rng.chance(sup)) { this.list.pop(); continue; }
      }
      if (dd > 0) this._maybeReject(p, dd);
    }
  }

  // --- famine disturbance (BUILD 2; only ever called by the Storyteller) -------------------
  // Destroy a fraction of the food within radius r of (x,y) — a local famine. Draws world.rng
  // once per plant in the patch (deterministic, serialized stream). Returns the count removed.
  crash(x, y, r, frac) {
    const r2 = r * r;
    const keep = [];
    for (let i = 0; i < this.list.length; i++) {
      const f = this.list[i];
      const dx = f.x - x, dy = f.y - y;
      if (dx * dx + dy * dy <= r2 && this.rng.next() < frac) continue; // destroyed
      keep.push(f);
    }
    const removed = this.list.length - keep.length;
    this.list = keep;
    return removed;
  }

  // Install a regrowth-suppressing scar (a famine's lingering wound) until tick `until`.
  addScar(x, y, r, until, suppression) {
    this.scars.push({ x: x, y: y, r: r, until: until, suppression: suppression });
  }

  // Strongest suppression of any live scar covering (x,y), else 0.
  _scarSuppressionAt(x, y) {
    let s = 0;
    for (let i = 0; i < this.scars.length; i++) {
      const sc = this.scars[i];
      const dx = x - sc.x, dy = y - sc.y;
      if (dx * dx + dy * dy <= sc.r * sc.r && sc.suppression > s) s = sc.suppression;
    }
    return s;
  }

  // Density-dependent regrowth — the anti-snowball homeostasis lever. The more
  // creatures already crowd a fresh plant's spot, the likelier it fails to take
  // root, so an over-grazed patch recovers slower. This caps a booming clan's
  // *local* carrying capacity (logistic growth, spatially) and hands a trailing
  // clan room to breathe — emergent negative feedback from the environment,
  // not a flat tax bolted onto whoever leads. Guarded by `dd > 0` in grow(), so
  // when the knob is 0 (default) this never runs and the RNG stays bit-exact.
  _maybeReject(p, dd) {
    const R = CONFIG.food.densityRadius || 40;
    const R2 = R * R;
    let crowd = 0;
    this.world.creatureGrid.query(p.x, p.y, R, (c) => {
      const dx = c.x - p.x, dy = c.y - p.y;
      if (dx * dx + dy * dy <= R2) crowd++;
    });
    if (crowd === 0) return;
    const rejectP = 1 - 1 / (1 + dd * crowd); // saturating: denser => likelier to fail
    if (this.rng.chance(rejectP)) this.list.pop(); // retract the plant just pushed
  }

  // Compact out eaten plants in place (swap-free, order-preserving).
  removeEaten() {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      if (!l[i].eaten) l[w++] = l[i];
    }
    l.length = w;
  }
}

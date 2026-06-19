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
  }

  seed(n) {
    for (let i = 0; i < n; i++) this._addRandom();
  }

  _addRandom() {
    const p = {
      x: this.rng.range(0, this.world.width),
      y: this.rng.range(0, this.world.height),
      eaten: false,
    };
    this.list.push(p);
    return p;
  }

  _addCluster() {
    if (this.list.length === 0) return this._addRandom();
    const seed = this.rng.pick(this.list);
    const a = this.rng.range(0, TAU);
    const r = this.rng.range(0, CONFIG.food.clusterRadius);
    const p = {
      x: clamp(seed.x + Math.cos(a) * r, 0, this.world.width),
      y: clamp(seed.y + Math.sin(a) * r, 0, this.world.height),
      eaten: false,
    };
    this.list.push(p);
    return p;
  }

  // Accumulate fractional growth and add whole plants up to the cap.
  grow() {
    this._acc += CONFIG.food.spawnPerTick;
    const dd = CONFIG.food.densityDependence || 0;
    while (this._acc >= 1) {
      this._acc -= 1;
      if (this.list.length >= CONFIG.food.max) break;
      const p = this.rng.chance(CONFIG.food.clusterChance) ? this._addCluster() : this._addRandom();
      if (dd > 0) this._maybeReject(p, dd);
    }
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

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
    this.list.push({
      x: this.rng.range(0, this.world.width),
      y: this.rng.range(0, this.world.height),
      eaten: false,
    });
  }

  _addCluster() {
    if (this.list.length === 0) return this._addRandom();
    const seed = this.rng.pick(this.list);
    const a = this.rng.range(0, TAU);
    const r = this.rng.range(0, CONFIG.food.clusterRadius);
    this.list.push({
      x: clamp(seed.x + Math.cos(a) * r, 0, this.world.width),
      y: clamp(seed.y + Math.sin(a) * r, 0, this.world.height),
      eaten: false,
    });
  }

  // Accumulate fractional growth and add whole plants up to the cap.
  grow() {
    this._acc += CONFIG.food.spawnPerTick;
    while (this._acc >= 1) {
      this._acc -= 1;
      if (this.list.length >= CONFIG.food.max) break;
      if (this.rng.chance(CONFIG.food.clusterChance)) this._addCluster();
      else this._addRandom();
    }
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

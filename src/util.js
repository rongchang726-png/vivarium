/*
 * Vivarium — utilities
 * --------------------
 * Pure helpers with no DOM dependency: a seedable PRNG, small math helpers,
 * and a uniform spatial hash grid for fast neighbour queries.
 */

const TAU = Math.PI * 2;

function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

// Wrap an angle into (-PI, PI].
function wrapAngle(a) {
  a = a % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/*
 * Seedable PRNG (mulberry32). Routing all randomness through one of these makes
 * worlds reproducible and save/load deterministic — Math.random is never used
 * in the simulation core.
 */
class RNG {
  constructor(seed) {
    this.s = (seed >>> 0) || 1;
  }
  // Uniform float in [0, 1).
  next() {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
  int(n) {
    return (this.next() * n) | 0;
  }
  // Standard-normal-ish via Box–Muller.
  gauss(mean = 0, std = 1) {
    let u = 1 - this.next();
    let v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[(this.next() * arr.length) | 0];
  }
}

/*
 * Uniform spatial hash grid. Entities are re-inserted each tick (cheap for a
 * few hundred items) so that vision/feeding can ask "what is near (x, y)?"
 * without an O(n^2) scan. Cell arrays are reused between clears to avoid GC
 * churn.
 */
class SpatialGrid {
  constructor(width, height, cell) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }
  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }
  _index(cx, cy) {
    return cy * this.cols + cx;
  }
  insert(x, y, item) {
    const cx = clamp((x / this.cell) | 0, 0, this.cols - 1);
    const cy = clamp((y / this.cell) | 0, 0, this.rows - 1);
    this.cells[this._index(cx, cy)].push(item);
  }
  // Invoke cb(item) for every item in cells overlapping the query circle's
  // bounding box. Callers do their own precise distance test.
  query(x, y, radius, cb) {
    const c = this.cell;
    const x0 = clamp(((x - radius) / c) | 0, 0, this.cols - 1);
    const x1 = clamp(((x + radius) / c) | 0, 0, this.cols - 1);
    const y0 = clamp(((y - radius) / c) | 0, 0, this.rows - 1);
    const y1 = clamp(((y + radius) / c) | 0, 0, this.rows - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells[this._index(cx, cy)];
        for (let i = 0; i < bucket.length; i++) cb(bucket[i]);
      }
    }
  }
}

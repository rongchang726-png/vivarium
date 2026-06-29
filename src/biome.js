/*
 * Vivarium — biome (spatial heterogeneity / terrain)
 * --------------------------------------------------
 * Richness phase, BUILD 1 (docs/REDESIGN.md). Place-dependent fitness: a few seeded PERIODIC
 * noise fields classify the torus into a few LARGE regions; each region confers a fitness
 * VECTOR (which food type grows there, how dense, how fast you move, how far you see). There
 * is no single global optimum, so the best body/brain differs by PLACE — three coexisting
 * regional ecotypes instead of one herbivore monoculture (the Civ tile-yield insight; resource
 * partitioning placed in space, which the repo measured at 5/5 coexistence).
 *
 * BIT-EXACT & DOM-free. Default OFF (CONFIG.biome.enabled false) => world.biome is null and
 * every apply-site is `if (world.biome)`-guarded, so the default world draws no new code path.
 * When ON it uses a SEPARATE rng (seeded off the world seed) and NEVER touches world.rng, so
 * the per-tick stream is unperturbed; nothing here is serialized (the field recomputes from the
 * world seed on load). => determinism hash 4244329615 holds with it off. Periodic INTEGER-
 * wavenumber fields keep the torus seam continuous (no edge artifact). Top-level is declarations
 * only (a const archetype table + the class), so load order never trips TDZ.
 */

// Region archetypes: a fitness VECTOR each. ONE food type per region — resource partitioning
// placed in space, NOT intermixed within a region (intermixing halves effective food and
// bootstrap-collapses both specialists to 0:0 — the repo's --food2 lesson). Distinct enough
// that a generalist is strictly worse: PLAIN rewards fast far-seeing foragers, FOREST rewards
// slow short-range ones, MEADOW is the food-rich middle. (densityMult/moveMult/fovMult are
// scaled by CONFIG.biome.contrast; foodType is the discrete partitioning axis.)
const BIOME_REGIONS = [
  { name: "plain",  foodType: 0, densityMult: 0.80, moveMult: 1.15, fovMult: 1.35 },
  { name: "meadow", foodType: 1, densityMult: 1.25, moveMult: 1.00, fovMult: 1.00 },
  { name: "forest", foodType: 2, densityMult: 1.00, moveMult: 0.70, fovMult: 0.60 },
];

class BiomeField {
  constructor(seed) {
    const C = CONFIG.biome;
    this.contrast = C.contrast;
    this.W = CONFIG.world.width;
    this.H = CONFIG.world.height;
    // SEPARATE rng — derived from the world seed but never the world's own stream.
    this.rng = new RNG((seed ^ 0x9e3779b9) >>> 0);
    // Two band-limited PERIODIC noise fields (integer wavenumbers => continuous on the torus).
    this._a = this._mkField(C.components, C.maxWavenumber);
    this._b = this._mkField(C.components, C.maxWavenumber);
    // Precompute a coarse region lookup grid so per-creature/per-food lookups are O(1).
    this.cell = C.cellPx;
    this.cols = Math.max(1, Math.ceil(this.W / this.cell));
    this.rows = Math.max(1, Math.ceil(this.H / this.cell));
    this.grid = new Int8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * this.cell, y = (r + 0.5) * this.cell;
        this.grid[r * this.cols + c] = this._classify(this._sample(this._a, x, y), this._sample(this._b, x, y));
      }
    }
  }

  _mkField(n, maxK) {
    const terms = [];
    for (let i = 0; i < n; i++) {
      const kx = 1 + ((this.rng.next() * maxK) | 0);
      const ky = 1 + ((this.rng.next() * maxK) | 0);
      terms.push({ kx: kx, ky: ky, phx: this.rng.range(0, TAU), phy: this.rng.range(0, TAU), amp: 1 / (1 + i) });
    }
    return terms;
  }

  // Evaluate a periodic field at (x,y) -> ~[-1, 1].
  _sample(terms, x, y) {
    const ux = (x / this.W) * TAU, uy = (y / this.H) * TAU;
    let s = 0, norm = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      s += t.amp * Math.sin(t.kx * ux + t.phx) * Math.cos(t.ky * uy + t.phy);
      norm += t.amp;
    }
    return norm > 0 ? s / norm : 0;
  }

  // Split the (a,b) plane into 3 LARGE coherent regions (two fields => organic borders).
  _classify(a, b) {
    if (a < -0.1) return 2; // forest (low a)
    if (b > 0.1) return 0;  // plain  (high b, among the rest)
    return 1;               // meadow (the middle band)
  }

  regionAt(x, y) {
    let c = (x / this.cell) | 0; if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1;
    let r = (y / this.cell) | 0; if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1;
    return this.grid[r * this.cols + c];
  }

  // contrast scales each multiplier away from 1 (contrast 0 => all 1 => flat == off).
  _mult(base) { return 1 + this.contrast * (base - 1); }
  moveAt(x, y) { return this._mult(BIOME_REGIONS[this.regionAt(x, y)].moveMult); }
  fovAt(x, y) { return this._mult(BIOME_REGIONS[this.regionAt(x, y)].fovMult); }
  densityAt(x, y) { return this._mult(BIOME_REGIONS[this.regionAt(x, y)].densityMult); }
  foodTypeAt(x, y) { return BIOME_REGIONS[this.regionAt(x, y)].foodType; }
}

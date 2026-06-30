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
// CALIBRATION (2026-06-29, biome-lab seeds 7/11). Two findings forced this design:
//  (1) The ONLY live ecotype axis is FORAGE (which food type you digest). The SIZE axis is DEAD
//      (a small body is always fastest + cheapest; moveMult changes the magnitude of the move cost,
//      not the small-beats-big RANKING) and the VISION axis is DEAD (genes.range carries no metabolic
//      cost, so nothing selects it down even where sight is dim). So move/fov are kept MILD — they add
//      a little local-fitness texture but do NOT create distinct bodies; the niche IS the food type.
//  (2) THREE food types do NOT give three forage species here — a reconfirmed robust negative (see
//      ../CLAUDE.md branching notes: forage 0.5 is a fitness PEAK on a 3-type linear axis via the reach
//      advantage; a convex trade-off strong enough to punish it instead bootstrap-COLLAPSES the all-
//      generalist founders, seed-fragile). TWO food types DO split (forage 0.5 is a valley) — the
//      proven 2-way branching. So terrain ships as TWO regions / two food types: open PLAIN (type 0)
//      and dense FOREST (type 1), each at full local density (one food type per region — never
//      intermix, which halves effective food and bootstrap-collapses both specialists). With a convex
//      forage trade-off, a plain-grazer (forage→0) and a forest-grazer (forage→1) evolve and spatially
//      sort — the first self-organizing spatial niche split in the world, on a proven mechanism.
const BIOME_REGIONS = [
  { name: "plain",  foodType: 0, densityMult: 1.00, moveMult: 0.90, fovMult: 1.20 }, // open grass: cheap fast travel, far sight
  { name: "forest", foodType: 1, densityMult: 1.00, moveMult: 1.10, fovMult: 0.82 }, // dense wood: costly slow travel, short sight
  { name: "meadow", foodType: 2, densityMult: 1.00, moveMult: 1.00, fovMult: 1.00 }, // the middle niche: neutral physics, its OWN food (only used at food.types>=3 — BUILD 6.3)
];
// How many regions to actually use = how many food niches there are to place in space.
// food.types=2 => plain+forest (the 2-region default, UNCHANGED); 3 => +meadow. The point of
// the 3rd region (BUILD 6.3): the well-mixed 3-type fork collapses because the MIDDLE specialist
// reaches all foods (reach advantage); SPATIAL separation into 3 large regions denies that reach,
// the same mixing-wall lever that made the 2-people fork robust (BUILD 6.2). Capped at the table size.
function biomeRegionCount() { return Math.max(1, Math.min(BIOME_REGIONS.length, (CONFIG.food && CONFIG.food.types) || 1)); }

class BiomeField {
  constructor(seed) {
    const C = CONFIG.biome;
    this.contrast = C.contrast;
    this.nRegions = biomeRegionCount(); // 2 (plain/forest, default) or 3 (+meadow, food.types>=3)
    this.W = CONFIG.world.width;
    this.H = CONFIG.world.height;
    // Densest region's multiplier (rejection baseline): the richest region spawns food at
    // full rate, sparser regions are thinned toward it (densityRejectAt). Precomputed once.
    let mx = 0;
    for (let i = 0; i < this.nRegions; i++) if (BIOME_REGIONS[i].densityMult > mx) mx = BIOME_REGIONS[i].densityMult;
    this.maxDensity = this._mult(mx); // _mult uses this.contrast (already set) — flat==1 at contrast 0
    // SEPARATE rng — derived from the world seed but never the world's own stream.
    this.rng = new RNG((seed ^ 0x9e3779b9) >>> 0);
    // Two band-limited PERIODIC noise fields (integer wavenumbers => continuous on the torus).
    this._a = this._mkField(C.components, C.maxWavenumber);
    this._b = this._mkField(C.components, C.maxWavenumber);
    // Precompute a coarse region lookup grid so per-creature/per-food lookups are O(1).
    this.cell = C.cellPx;
    this.cols = Math.max(1, Math.ceil(this.W / this.cell));
    this.rows = Math.max(1, Math.ceil(this.H / this.cell));
    // For 3+ regions, EQUAL-AREA band thresholds. The field is non-uniform, so FIXED thresholds skew the
    // regions badly (±0.33 measured 10/80/10 instead of thirds — the middle niche won on territory, not
    // merit, voiding the niche test). Sample the combined field v=a+0.25b over the grid and take the (k/N)
    // QUANTILES, so every region gets ~1/N of the world (a fair test of whether 3 niches can hold). 2-region
    // (default) keeps the simple median split (v<0) and never enters this block.
    this.bandT = null;
    if (this.nRegions >= 3) {
      const vs = [];
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
        const x = (c + 0.5) * this.cell, y = (r + 0.5) * this.cell;
        vs.push(this._sample(this._a, x, y) + 0.25 * this._sample(this._b, x, y));
      }
      vs.sort((p, q) => p - q);
      this.bandT = [];
      for (let k = 1; k < this.nRegions; k++) this.bandT.push(vs[Math.floor((vs.length * k) / this.nRegions)]);
    }
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

  // Split into 2 LARGE coherent regions. Combine both noise fields so the border meanders
  // organically (not a straight cut); the threshold at 0 gives two ~equal-area regions.
  _classify(a, b) {
    const v = a + 0.25 * b; // combined field => organic, meandering borders
    if (this.nRegions <= 1) return 0;
    if (this.nRegions === 2) return v < 0 ? 0 : 1; // UNCHANGED 2-region split (plain / forest)
    // 3+ regions: EQUAL-AREA bands via the empirical quantiles in this.bandT (so each region ~1/N).
    let reg = 0;
    while (reg < this.bandT.length && v >= this.bandT[reg]) reg++;
    return reg;
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

  // Probability a plant spawned at (x,y) is rejected, so regional food DENSITY actually
  // varies (the reject framework can only THIN, so the densest region is the baseline and
  // others are thinned toward it). At contrast 0 every region's density == max => reject 0
  // everywhere == flat == off. Drawn against world.rng only on the (non-default) biome path.
  densityRejectAt(x, y) {
    if (this.maxDensity <= 0) return 0;
    const p = 1 - this.densityAt(x, y) / this.maxDensity;
    return p > 0 ? p : 0;
  }
}

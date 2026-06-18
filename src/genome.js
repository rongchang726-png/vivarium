/*
 * Vivarium — genome
 * -----------------
 * A genome is everything heritable about a creature:
 *   - `weights`: the flat weight vector of its recurrent neural net (the brain).
 *   - `genes`:   continuous morphological traits (body, diet, colour, senses).
 *
 * Reproduction is asexual: a child is a clone of its parent with point
 * mutations. Crossover is implemented too, for experimentation, but is not used
 * by the default world. Because brain topology is fixed (see config BRAIN),
 * weight vectors are always aligned, so mutation and crossover are well defined.
 */

// Gene ranges. Kept here so mutation and random init agree on the bounds.
const GENE = {
  radius: [CONFIG.creature.minRadius, CONFIG.creature.maxRadius],
  diet: [0, 1], // 0 = pure herbivore, 1 = pure carnivore
  fov: [0.6, 2.7], // total field of view (radians)
  range: [55, 220], // vision range (world units)
};

class Genome {
  constructor(weights, genes) {
    this.weights = weights; // Float32Array(BRAIN.WEIGHTS)
    this.genes = genes; // { radius, diet, hue, fov, range }
  }

  static random(rng) {
    const weights = new Float32Array(BRAIN.WEIGHTS);
    for (let i = 0; i < weights.length; i++) weights[i] = rng.gauss(0, 0.5);
    // Two founding guilds. Most are small herbivores that bootstrap the world
    // on abundant plants. A minority are larger omnivores: they can still graze
    // to survive, but carry the size and diet to seed a predator niche, so a
    // food web has a chance to establish instead of everyone collapsing into
    // the single herbivore optimum. Whether predators *persist* is left to
    // selection.
    const predator = !rng.chance(0.82);
    const genes = {
      radius: predator
        ? rng.range(lerp(GENE.radius[0], GENE.radius[1], 0.4), lerp(GENE.radius[0], GENE.radius[1], 0.9))
        : rng.range(GENE.radius[0], lerp(GENE.radius[0], GENE.radius[1], 0.4)),
      diet: predator ? clamp(rng.gauss(0.55, 0.13), 0, 1) : clamp(rng.gauss(0.12, 0.08), 0, 1),
      hue: rng.range(0, 360),
      fov: rng.range(1.1, 2.2),
      range: rng.range(90, 175),
    };
    return new Genome(weights, genes);
  }

  clone() {
    return new Genome(this.weights.slice(), {
      radius: this.genes.radius,
      diet: this.genes.diet,
      hue: this.genes.hue,
      fov: this.genes.fov,
      range: this.genes.range,
    });
  }

  // Return a mutated copy (the parent genome is left untouched).
  mutated(rng) {
    const m = CONFIG.mutation;
    const child = this.clone();
    const w = child.weights;
    for (let i = 0; i < w.length; i++) {
      if (rng.next() < m.weightRate) {
        if (rng.next() < m.bigChance) w[i] += rng.gauss(0, m.bigStd);
        else w[i] += rng.gauss(0, m.weightStd);
      }
    }
    const g = child.genes;
    const span = GENE.radius[1] - GENE.radius[0];
    g.radius = clamp(g.radius + rng.gauss(0, m.geneStd * span), GENE.radius[0], GENE.radius[1]);
    g.diet = clamp(g.diet + rng.gauss(0, m.dietStd), GENE.diet[0], GENE.diet[1]);
    g.fov = clamp(g.fov + rng.gauss(0, m.fovStd), GENE.fov[0], GENE.fov[1]);
    g.range = clamp(g.range + rng.gauss(0, m.rangeStd * g.range), GENE.range[0], GENE.range[1]);
    // Hue drifts slowly and wraps, so visually distinct lineages persist for
    // many generations — you can watch families spread across the world.
    g.hue = (g.hue + rng.gauss(0, m.hueStd) + 360) % 360;
    return child;
  }

  // Uniform-crossover two genomes (unused by the default world; here for
  // sexual-reproduction experiments).
  static crossover(a, b, rng) {
    const w = new Float32Array(BRAIN.WEIGHTS);
    for (let i = 0; i < w.length; i++) w[i] = rng.next() < 0.5 ? a.weights[i] : b.weights[i];
    const mix = (x, y) => lerp(x, y, rng.next());
    const genes = {
      radius: mix(a.genes.radius, b.genes.radius),
      diet: mix(a.genes.diet, b.genes.diet),
      hue: a.genes.hue, // colour follows one parent to keep lineages legible
      fov: mix(a.genes.fov, b.genes.fov),
      range: mix(a.genes.range, b.genes.range),
    };
    return new Genome(w, genes);
  }

  // Rough genetic distance: RMS weight difference plus scaled gene gaps. Used
  // only as a soft signal; visible "species" are tracked by hue clustering.
  distance(other) {
    let sse = 0;
    const a = this.weights,
      b = other.weights;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sse += d * d;
    }
    const wd = Math.sqrt(sse / a.length);
    const gd =
      Math.abs(this.genes.diet - other.genes.diet) +
      Math.abs(this.genes.radius - other.genes.radius) / (GENE.radius[1] - GENE.radius[0]);
    return wd + gd;
  }

  toJSON() {
    return { w: Array.from(this.weights), g: this.genes };
  }

  static fromJSON(o) {
    return new Genome(Float32Array.from(o.w), {
      radius: o.g.radius,
      diet: o.g.diet,
      hue: o.g.hue,
      fov: o.g.fov,
      range: o.g.range,
    });
  }
}

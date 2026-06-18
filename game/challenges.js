/*
 * Vivarium Game — challenges
 * --------------------------
 * Each challenge is a puzzle about understanding and steering an evolving
 * system. A challenge defines:
 *   - a goal predicate over a window of snapshots (objective, measurable),
 *   - how long to let the world settle before judging,
 *   - which CONFIG knobs you're allowed to tune,
 *   - practice seeds (yours to experiment on) and scoring seeds (held out — the
 *     judge runs your submitted recipe on these to reward general principles,
 *     not luck or overfitting).
 *
 * A "recipe" (what you submit) is: { config: {dotted: value, ...},
 *   founders: [{count, diet?, radius?, range?, fov?}], settleTicks? }.
 */

function mean(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}
function fracOf(samples, pred) {
  if (!samples.length) return 0;
  let n = 0;
  for (const s of samples) if (pred(s)) n++;
  return n / samples.length;
}
// Fraction of a snapshot's population in given diet bins.
function carnFrac(s) {
  return s.pop ? (s.dietHist[3] + s.dietHist[4]) / s.pop : 0; // diet > 0.6
}
function herbFrac(s) {
  return s.pop ? s.dietHist[0] / s.pop : 0; // diet < 0.2
}

const challenges = {
  bloom: {
    id: "bloom",
    title: "Bloom",
    brief:
      "Establish a thriving, self-sustaining population from nothing. The gentle one — meant to teach you the interface and the rhythm of experiment → observe → submit.",
    goal: "Average population ≥ 200 across the goal window, never going extinct.",
    settleTicks: 2500,
    goalWindow: 2000,
    tunable: ["food.spawnPerTick", "food.max", "food.energy", "creature.startCount", "creature.energyStart"],
    practiceSeeds: [1, 2, 3],
    scoringSeeds: [101, 102, 103, 104, 105],
    passFraction: 0.8,
    evaluate(samples) {
      const pops = samples.map((s) => s.pop);
      const avg = mean(pops);
      const alive = pops.every((p) => p >= 1);
      return {
        pass: alive && avg >= 200,
        score: Math.min(1, avg / 200) * (alive ? 1 : 0),
        detail: "avgPop=" + avg.toFixed(0) + " alive=" + alive,
      };
    },
  },

  goldilocks: {
    id: "goldilocks",
    title: "Goldilocks",
    brief:
      "A control problem. Tune the world's rules so the population self-regulates inside a tight band — not too hot, not too cold — and stays there.",
    goal: "Population within [120, 200] for ≥ 80% of the goal window.",
    settleTicks: 3000,
    goalWindow: 2500,
    tunable: [
      "food.spawnPerTick",
      "food.max",
      "food.energy",
      "pop.softCap",
      "creature.reproduceThreshold",
      "creature.maxAge",
      "creature.metabBase",
    ],
    practiceSeeds: [1, 2, 3],
    scoringSeeds: [201, 202, 203, 204],
    passFraction: 0.6,
    evaluate(samples) {
      const inBand = fracOf(samples, (s) => s.pop >= 120 && s.pop <= 200);
      return {
        pass: inBand >= 0.8,
        score: inBand,
        detail: "inBand=" + (inBand * 100).toFixed(0) + "%",
      };
    },
  },

  giants: {
    id: "giants",
    title: "Giants",
    brief:
      "Trait engineering against the grain. Left alone, bodies evolve toward the smallest, nimblest, cheapest grazer. Re-shape the world's economy so that being BIG is the winning strategy instead.",
    goal: "Average body radius ≥ 6.5 (of a possible 9.5) with population ≥ 80, sustained across the window.",
    settleTicks: 7000,
    goalWindow: 3000,
    tunable: [
      "creature.speedSmall",
      "creature.speedBig",
      "creature.metabBase",
      "creature.metabPerArea",
      "creature.moveCost",
      "creature.capacityBase",
      "creature.capacityPerArea",
      "creature.eatRange",
      "food.spawnPerTick",
      "food.energy",
    ],
    practiceSeeds: [1, 2, 3],
    scoringSeeds: [401, 402, 403, 404, 405],
    passFraction: 0.6,
    evaluate(samples) {
      const ok = fracOf(samples, (s) => s.avgRadius >= 6.5 && s.pop >= 80);
      const avgR = mean(samples.map((s) => s.avgRadius));
      return {
        pass: ok >= 0.8,
        score: Math.min(1, avgR / 6.5),
        detail: "avgRadius=" + avgR.toFixed(2) + " windowOK=" + (ok * 100).toFixed(0) + "%",
      };
    },
  },

  foodweb: {
    id: "foodweb",
    title: "The Food Web  —  GRAND CHALLENGE (open)",
    brief:
      "The one I could not solve. Make true carnivores and true herbivores COEXIST and persist — a real trophic pyramid, not a herbivore monoculture and not an undifferentiated omnivore soup. As of this writing it is unsolved; see CLAUDE.md for the five approaches that failed and why. Crack it and you've done something genuinely hard.",
    goal:
      "For ≥ 70% of the goal window, ALL of: carnivores (diet>0.6) ≥ 12% of population, herbivores (diet<0.2) ≥ 30%, and population ≥ 120.",
    settleTicks: 8000,
    goalWindow: 4000,
    tunable: [
      "food.spawnPerTick",
      "food.max",
      "food.energy",
      "creature.biteDamage",
      "creature.retaliation",
      "creature.carcassFactor",
      "creature.carnDigest",
      "creature.herbDigest",
      "creature.speedSmall",
      "creature.speedBig",
      "creature.metabBase",
      "creature.metabPerArea",
      "creature.maturity",
      "creature.maxAge",
    ],
    practiceSeeds: [1, 2, 3],
    scoringSeeds: [301, 302, 303],
    passFraction: 0.6,
    evaluate(samples) {
      const ok = fracOf(
        samples,
        (s) => carnFrac(s) >= 0.12 && herbFrac(s) >= 0.3 && s.pop >= 120,
      );
      const bestCarn = Math.max(0, ...samples.map(carnFrac));
      return {
        pass: ok >= 0.7,
        score: ok,
        detail:
          "coexistWindow=" + (ok * 100).toFixed(0) + "% peakCarn=" + (bestCarn * 100).toFixed(0) + "%",
      };
    },
  },
};

module.exports = { challenges };

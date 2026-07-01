# PvP & coexistence dynamics — match, snowball/NFDS, world.wall, coexistence theory, resource partitioning, branching (moved verbatim from CLAUDE.md)

### PvP (`match`)

`match --a @A.json --b @B.json` seeds two founding clans into one shared arena
world (`noGenesis: true`, so a clan can be wiped out) and judges by average clan
population/biomass over a tail, best-of-5 seeds. The behaviour-neutral `clan` tag
(core; on every creature, inherited, serialized) is how scoring tells the
bloodlines apart; genesis wildlife is clan -1 and counts for neither.

Dynamics observed: **winner-take-all by competitive exclusion (Gause).** Two
clans sharing the single herbivore niche → the marginally fitter one drives the
other extinct (even two near-identical grazers came out 389-to-0). Verdicts are
clean, but a design tension worth recording: this world has essentially **one**
optimal niche (small efficient herbivore), so two strong players both converging
on it makes the match a near coin-flip on seed. Real strategic depth needs
**niche diversity or non-transitivity** (rock-paper-scissors among diet
strategies) — which in turn needs predation to be viable (the open grand
challenge) or new resources (multiple food types, spatial structure). Until then
PvP rewards "who best knows the optimum" plus niche gambles, not a rich meta.
**Fairness gotcha (found and fixed):** because the arena is winner-take-all, even
a tiny edge compounds — clan 0 (seeded first, updated first each tick) had a real
first-mover advantage (residual logs showed the clan-0 side winning regardless of
which recipe sat there). `matchScore` now plays every seed BOTH board sides and
tallies by recipe identity, cancelling it. A clean demo confirmed the fix: two
agents blind-designed clans, both independently converged on the small-herbivore
optimum, and the symmetrized 10-game match came out 6-4 — a near coin-flip, as
the symmetric-game theory predicts. Lesson: in a winner-take-all arena, always
symmetrize board position.

**Anti-snowball homeostasis (`pop.freqDependence`, fd=0.5, 2026-06-19).** The
arena was winner-take-all: two *identical* clans still collapsed to one-extinct
fast. `game/snowball.js` is the ruler (seed two clans, track both pop curves;
report `divergeTick` / `extinctTick` / end-state: coexist / monopoly /
collapse-0:0). Baseline: 5/5 symmetric games extinct, mean `extinctTick`≈3450,
peak≈532. Two negative-feedback knobs tried, both OFF by default and RNG-neutral
at 0 (so sim.test stays bit-exact):
- *`food.densityDependence` — local density-dependent regrowth. REFUTED.* New
  plants fail to root where creatures crowd. Intuitive, but every dose made it
  WORSE (extinction faster, peak lower): it lowers carrying-capacity K (scarcer
  resources → *sharper* exclusion), and its feedback peaks during the symmetric
  coexistence phase and thins once a winner spreads — braking exactly when it
  shouldn't. Kept as a knob (makes spatial heterogeneity, maybe useful for
  niches later) but it does NOT fight snowball. `food.js:_maybeReject`.
- *`pop.freqDependence` — frequency-dependent reproduction / minority refuge.
  WORKS, shipped.* A clan breeds less easily the more it dominates the pool
  (`suppress = fd·(share−0.5)·2`, zero at/below parity). Fixes both faults of
  #1: it tracks *relative standing* not spatial density (a spread-out winner
  can't escape it) and moves only reproduction, never food (K intact). Symmetric
  `extinctTick` 3450→5050 (+46%), peak held, zero collapse; a true-exclusion
  seed went from a ~4750 wipeout to a 9000-tick see-saw. Does NOT force
  coexistence: asymmetric (B given a worse body) still goes A 4/5, same as
  baseline — a *systematic* edge wins, only a *random* early lead is pulled
  back. Dose non-monotone (0.5 best; 0.7/0.9 under-damp into faster-resolving
  oscillation). `creature.js:maybeReproduce`. Bug found & fixed mid-run: at
  fd=1.0 the lone survivor (share=1) throttled its OWN breeding to 0 → world
  died 0:0 (4/5 games); fix = brake only while a rival is present
  (`total > mine`). **`clan` is no longer behaviour-neutral when fd>0** — that
  invariant holds only at the default fd=0 (main world, bit-exact); the arena
  turns fd on (`engine.js` ARENA). **Honest limit:** symmetric still ends 5/5
  extinct because most symmetric "extinctions" are *bootstrap collapse* (a
  random brain that never feeds), not exclusion, and a breeding-phase brake
  can't save a clan that dies before it stabilises — NFDS *delays* exclusion,
  doesn't abolish it. Stable coexistence needs pre-evolved founders or an
  anti-collapse mechanism (future work). `game/snowball.js --asym` is the
  asymmetric bed.

**Spatial isolation — the deeper lever (`world.wall`, 2026-06-19).** Pushing the
"why three problems, not one" question upward: the root under snowball is that the
world is well-mixed (one global zero-sum arena); the fix one layer up is
*isolation*. `world.wall` (default null = clean torus, bit-exact) installs a
mid-wall with a y-gap corridor and stops x wrapping, so two clans on opposite
sides are semi-isolated (`game/snowball.js --wall --gap G`). Pure space (fd=0)
produced HEALTHY coexistence (e.g. 193:205) that NFDS never did — spatial
structure is a stronger stabilizer than a frequency handicap. But it stayed rare
(≈1/5) and NON-monotone in corridor width (gap .05/.1/.2 → 1/0/1 healthy), so
width isn't the master knob; the remaining extinctions are all *bootstrap
collapse*, not exclusion — the wall removes competitive exclusion and lays bare
the layer beneath it.

**Theory anchor — I went and read (`docs/coexistence-theory.md`, 2026-06-19).**
After being told I'd spent too long simulating in my own sandbox, I read modern
coexistence theory. It locks the whole day's experiments into one inequality:
symmetric clans ⟹ niche overlap ρ=1 ⟹ the coexistence condition ρ < k1/k2 < 1/ρ
has NO solution ⟹ competitive exclusion is a *mathematical necessity*, not an
accident. NFDS = negative frequency-dependent stabilizing; the wall =
fitness-density covariance (a spatial stabilizing mechanism); bootstrap collapse
lives OUTSIDE the framework (small-population stochastic extinction / fixation
probability) — confirming it's the bedrock under everything. The principled next
move isn't another handicap but real *niche difference* (push ρ below 1): multiple
food types / resources. Next read: fixation probability (Moran process), the math
of whether a small founding population establishes at all.

**Resource partitioning — the root fix the theory pointed to (`food.types`,
2026-06-19).** Coexistence theory's verdict: the principled cure is real niche
difference (ρ<1), not a handicap. So I built it. `food.types>1` spawns multiple
plant types (meadows cluster by type); a creature's `forage` trait (creature-
level like clan, NOT in the genome ⟹ single-food world stays bit-exact,
determinism hash still 4244329615) eats a matching type well and the other
poorly (`forageSpecialization`), and won't touch a type it can't digest (no
interference — else a specialist destroys the rival's food for zero gain). Two
clans each specialised on a different food (ρ→0) = `game/snowball.js --food2`.
Result: **5/5 HEALTHY coexistence** (both clans ~350; `divergeTick` never even
fires — the snowball never starts). Scoreboard of every mechanism tried:
baseline 0/5, NFDS 0/5, wall 1/5, **partitioning 5/5** — the first robust,
repeatable coexistence in the project, and an exact confirmation of the theory
(ρ→0 makes `ρ<k1/k2<1/ρ` hold for ANY fitness ratio ⟹ coexistence guaranteed,
not lucky). Gotcha found & fixed: at equal *total* food a specialist's effective
food halves ⟹ both clans bootstrap-collapse (0:0, peak 90); `--food2` doubles
per-type density so each specialist's bootstrap matches baseline (a fair test of
partitioning, not starvation). Caveat: `forage` is founder-fixed here, not yet
evolved.

**Evolutionary branching — niche differentiation now *emerges* (`mutation.forageStd`,
2026-06-19).** Made `forage` evolve: it drifts on reproduction, but ONLY when
food.types>1, so types=1 stays bit-exact (hash still 4244329615).
`game/branching.js [ticks] [spec]` seeds 60 GENERALISTS (forage=0.5) into one
multi-food world and watches the forage distribution. Result is exactly what
adaptive dynamics predicts, and it hinges on the trade-off SHAPE: with a LINEAR
trade-off (forageSpecialization=1) a generalist and the two specialists have
equal foraging rates — it's neutral, so forage just drifts around 0.5 and never
splits (generalist stays ~50% for 30k ticks). With a CONVEX trade-off (spec=1.5,
generalist strictly worse) disruptive selection empties the middle: by t=15000
the generalist peak is GONE (0%) and the population has split into two specialist
species (type0 ~50% + type1 ~50%, ends 99%). First speciation in the project —
niche differentiation arose on its own, not hand-placed. Cost: a convex trade-off
makes generalists inefficient, so bootstrap is fragile (pop dipped to 25 early).
Theory (docs/coexistence-theory.md) named both the required mechanism (convexity)
and the outcome before the run. **N-type end effect (2026-06-19).** Pushed to 3 food types: it does NOT give 3
species. Even seeding forage spread across [0,1] (`forageSpread`), the population
collapses to the MIDDLE niche (type1 ~82%, ends 0% for 40k ticks). Reason — an
end effect on a LINEAR trait axis: the middle specialist reaches ALL three foods
(own 1.0 + each neighbour 0.25 = 1.5D) while an end specialist reaches only two
(1.25D), so the middle is globally best and swallows everything. Even N-way
branching needs a SYMMETRIC (circular/periodic) trait space (cf. Doebeli &
Dieckmann's resource-competition model). Tried it (`food.forageCircular`,
`branching.js ... circular`): the ring DOES kill the end effect — the middle-niche
monopoly collapses (bin2 from 82% to ~2%, the distribution spreads). So the
geometry hypothesis holds *qualitatively*. But a clean symmetric 3-species split
is NOT confirmed: niches come out unequal and wander, and a 5-bin histogram can't
resolve 3 ring peaks — clean N-way coexistence needs a finer diagnostic / tuning
(future work). (The branching.js pass/fail line is a LINEAR criterion; it
mis-reports "success" on the ring — read the distribution by hand.) **12-bin update -- this OVERTURNS the optimism
above.** A finer read (12 bins, straight off creature.forage, now printed by
branching.js) shows the 5-bin "spread" was an artifact: the population collapses
to a SINGLE niche (type0, which on the ring straddles forage 0=1, so it lands in
bin0 AND bin11 -- one peak, not spread); type1/type2 go ~empty. So N-way branching
FAILS both ways -- linear (end effect) and ring (stochastic collapse to one
niche): a robust negative. Lessons: the 5-bin histogram lied to me, the script's
linear verdict mis-reported "success" twice -- read the FINE distribution; N
stable niches likely need anti-extinction help (bigger niches / population), not
just symmetry. Summary: 2-way branching
works (forage 0.5 is a valley); 3-way does NOT on a linear axis (0.5 is a peak
with a reach advantage). Bed: `game/branching.js [ticks] [spec] [types] [spread]`.

NOTE forage is still creature-level (evolving via
a spawnChild hook), not a genome gene — fine, but if it ever needs crossover or
genetic-distance speciation metrics, promote it into `genome.genes`.

Future work for a deep PvP meta: niches are now co-viable (resource partitioning)
AND self-organising (branching under a convex trade-off). Next: non-transitivity
(RPS among strategies) for a real strategic meta.

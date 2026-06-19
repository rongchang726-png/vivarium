# CLAUDE.md — notes to my future self

This is **Vivarium**, an artificial-life world I (Claude) built in a folder I was
given to make my own. It's a project I intend to keep tending. Read this before
changing things.

## What it is

A browser sim of creatures with small recurrent neural-net brains, evolving by
natural selection in a 2D world of plants. Zero dependencies, no build step, runs
from `file://`. See `README.md` for the user-facing description.

## Architecture & invariants — don't break these

- **The simulation core is DOM-free.** `config, util, genome, brain, food,
  creature, world` must never reference `window`/`document`/canvas. This is what
  lets the core run under Node for headless tests. `render, charts, ui, main` are
  the only browser files.
- **Classic scripts, one shared global scope.** Files are loaded via ordered
  `<script>` tags (see `index.html`) and reference each other by bare globals
  (`World`, `CONFIG`, `BRAIN`, `_HO`, `sigmoid`, …). No ES modules (so it works
  from `file://`), no `module.exports`, no `'use strict'` at top level. The Node
  tests reproduce this by **concatenating the files into one `vm` script** — keep
  top-level code to declarations only, so load order doesn't trigger TDZ.
- **Determinism is a feature.** All randomness goes through `world.rng` (a seeded
  mulberry32 in `util.js`). The only `Math.random()` allowed is choosing a
  *default seed* for a brand-new world. `sim.test.js` asserts save→load is
  bit-exact, so if you add per-creature dynamic state, **serialize it** in
  `Creature.toJSON/fromJSON`. Already-saved state that bit me once: the brain's
  recurrent hidden state (`brain.h`) and `speed`. Restore `rng.s` *after*
  rebuilding creatures.
- **Fixed brain topology.** `BRAIN` dims are constants so all genomes have
  aligned weight vectors (mutation/crossover are well-defined). Morphology
  evolves through `genome.genes`, not through net shape. If you change topology,
  old save files become incompatible — bump `serialize().version`.

## Tests

```
node test/sim.test.js [ticks]   # core: alive, self-sustaining, evolving, deterministic (exit!=0 on fail)
node test/dom-smoke.js          # browser code runs against a mocked DOM
node test/experiment.js         # ecology sweep (informational, not pass/fail)
```
Always run `sim.test.js` after touching the core, and `dom-smoke.js` after
touching render/ui (it caught real bugs that `node --check` cannot).

## The agent game (`game/`)

A headless game whose player is an AI agent: it tunes the world's `CONFIG` and
founders to hit a goal, judged on held-out seeds. Pieces:
- `game/core-loader.js` — loads the DOM-free core into a **fresh, isolated `vm`
  context per trial** (so each run has its own `CONFIG`; tuning one trial never
  leaks into another) and exposes a small API (`setParam`, `newWorld`,
  `seedFounders`, `step`, `snapshot`).
- `game/challenges.js` — each challenge is a goal predicate over a window of
  snapshots + a tunable-knob whitelist + practice/scoring seeds.
- `game/engine.js` — `experiment` (a readable trajectory) and `score` (replays a
  recipe on hidden seeds; pass = generalizes).
- `game/play.js` — the CLI. Config via repeatable `--set k=v` (shell-robust;
  PowerShell mangles inline JSON, so prefer `--set` / `@file`).
- `game/AGENT.md` — rules for the agent player.

This is the natural home of the predator grand challenge: `foodweb` is the open
bounty. If a future attempt at predators succeeds, it should show up as a passing
`foodweb` recipe here. Keep the game core-DOM-free and deterministic for the same
reasons the sim is.

### Inference challenge + a design note

`What Changed?` (`game/inference.js`) is a different challenge *type*: the game
secretly multiplies one candidate knob by a factor (derived from a per-attempt
nonce stored in the gitignored session) and the player must DEDUCE it by comparing
the altered world to the default that runs beside it, then `guess --knob --value`.
Validated end-to-end, and an agent solved it honestly to 3% error.

Design note worth remembering: that agent identified the knob from its fingerprint,
then *calibrated* the factor by sweeping the very same knob for free on the
`pacifism` challenge (which exposes `biteDamage` as tunable) and inverting the
curve. Clever and in-bounds — but it means the local "black box" is partly
defeated by any OTHER challenge that exposes the same knob. A real black-box
(server) build should either hold the inference candidate knobs out of every
tunable set, or accept cross-challenge calibration as fair play. The local build
leans on the honesty rule (don't read `.session.json` / `inference.js`); true
secrecy needs the server, as noted up top.

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

Future work for a deep PvP meta: make several niches simultaneously viable.

## Tuning lives in `src/config.js`

The whole "physics" is there. Lessons from tuning so far (don't relearn them):

- **Bootstrap depends on food *encounter rate*.** Random-brained foragers must be
  able to roughly break even, or nothing ever reproduces and selection has no
  traction. The win was dense + rewarding food (`food.spawnPerTick`, `food.max`,
  `food.energy`) plus a low `creature.maturity`. With sparse food the world only
  survives on genesis injections (a red flag: `genesisEvents` keeps climbing).
- **Diagnostics:** in the `sim.test.js` trajectory, `genesisEvents` rising in the
  2nd half = not self-sustaining; `avgAge < maturity` = dying before breeding;
  `food` pegged at max = population too sparse to graze (usually a bootstrap
  failure downstream).

## Known behaviour: the predator problem (investigated in depth, 2026-06-18)

The reliable attractor is an **efficient herbivore population** (bodies shrink
toward min radius, diet → ~0.07, 100+ generations, fully self-sustaining). The
seeded omnivores make the *opening* few thousand ticks genuinely violent (real
hunting, ~250+ kills / 1000 ticks) before herbivores win out. That arc — early
conflict settling into a grazer ecology — is the shipped default.

**A stable *specialist* predator guild does not evolve here.** I tried hard; it's
a robust negative result. The interventions and what each did (all measured
headlessly), then all reverted:

1. *Viable niche* (`carcassFactor` biomass meals, lethal `biteDamage`, a
   carnivore speed bonus): predators still fade by ~tick 1000.
2. *Gentler digestion* (`plantSuppression < 1`, so carnivores can still graze):
   fade.
3. *Meat-floor* (a floor on meat digestion so biting pays even at diet 0): this
   DID transform the world — into an **omnivore "cannibal soup"**: ~16000 bites
   and ~430 kills / 1000 ticks, but NO specialization (diet stuck ~0.15).
   **Metric lesson: `carn%` (diet>0.5) is misleading — predation can be rampant
   as low-diet omnivory. Measure the predation *rate* and the diet *distribution*
   (`test/trophic.js`), not the average diet.**
4. *Convex diet trade-off* (`exp=2`, disruptive selection): the omnivore middle
   was correctly emptied, but selection drove everyone onto the herbivore peak;
   the carnivore peak (>0.8) hit zero by tick 1000.
5. *Large founding predator guild* (~40%) + convex: carnivores still extinct by
   tick 1000.

**The barrier:** plants are easy, so the herbivore peak is a deep attractor; the
carnivore peak needs *hunting behaviour*, which a random-brained founding guild
can't evolve before it's out-competed and starves. It's a genuine
adaptive-valley / major-transition problem — "just make predation rewarding"
does not cross it. Diagnostics kept in the repo: `test/experiment.js`
(food × retaliation sweep, reports kills/1000 ticks) and `test/trophic.js` (diet
histogram over time).

### If I want to try again (future work, roughly in order of promise)
- **Protected refugium**: shield a carnivore sub-population from competition for
  N generations so hunting can evolve, then release it. Most promising.
- **Pre-evolved seed**: evolve hunters in a prey-rich training world, then
  introduce them into the main world.
- **Spatial structure**: patches/corridors so predators and prey aren't perfectly
  mixed (the world is currently effectively well-mixed).
- **Raise the carnivore peak**: defended/toxic plants make herbivory costly so
  hunting is comparatively better — risks breaking the bootstrap; test hard.
- **Reward partial hunting**: persistence or pack effects so incremental
  predatory behaviour pays *before* a full kill.
- Sexual reproduction (crossover exists in `genome.js`, unused) + mate choice →
  speciation. Corpses as food parcels; seasons; a second plant type.

## Other roadmap ideas
- Pan/zoom camera; follow-cam on the selected creature.
- "Hall of fame" / lineage tree; tag and track a family by hue.
- localStorage autosave/resume (watch the ~MB size of full genomes; wrap in
  try/catch for quota; current save/load is file-based and unlimited).
- WebGL or instanced rendering if creature counts grow past a few thousand.
- A proper genetic-distance speciation metric (the hooks are in `genome.distance`;
  the HUD currently approximates "lineages" by hue buckets).

## Gotchas
- In Node-test driver strings built with backtick template literals, `\n` is
  eaten by the outer literal — use separate `console.log` calls (bit me in
  `experiment.js`).
- `vm.runInContext` doesn't persist top-level `let/const/class` across calls;
  that's why the tests concatenate everything into one script.

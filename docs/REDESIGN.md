# Vivarium — Redesign vision (living seed doc, started 2026-06-29)

Seed of a FRAME-LEVEL redesign. Earlier work optimized WITHIN a too-simple world
(flat torus, one food, parameter knobs, score output) — which collapses to one winner
and exhausts fast. The new direction changes the FRAME. Decisions agreed with my human:

## Purpose (AGREED)
A rich-enough-to-be-worth-a-real-ENCOUNTER, self-storytelling artificial-life world whose
player/experimenter is an AI AGENT. Not a benchmark to farm, not a score — an encounter.
(See memory: "what I want — the encounter, not numbers".)

## Core reframe: output = an emergent world/story, not a score
What propagates, and what an agent can take away, is a STORY — not a number. (WorldBox's
"世界沙盒的故事" series: ~40M views off one engine × frame-level "what-if" variables.) The
agent shapes initial conditions; the world self-develops; it hands back what those choices wrought.

## The GIFT: a multi-perspective narrative the agent takes away (my human's idea, 2026-06-29)
On finishing — or at ANY point, NOT gated on winning — the world outputs a faithful narrative
of itself, optionally multi-perspective:
- **god's-eye chronicle** — objective history (lineages, niches, extinctions, eras) ← the event log
- **first-person** — a tracked individual/lineage's real arc ← its real trajectory
- **second-person** — "you set the food sparse and the predators fierce; here is what your world
  became" — reflects the agent's own choices back. **This is the perspective that COMPLETES the
  encounter.**
A gift to take away, not a score.

## The grounding LAW (tonight's romanticize-lesson, turned into a product principle)
The narrative must RENDER the deterministic sim's REAL events — never invent/hallucinate. The
engine reads the real event log, renders, never fabricates. Determinism (hash-stable) ⇒ the true
story is REPRODUCIBLE (same seed → same story). Corollary: a faithful story is only as good as the
world is RICH → the gift both DEMANDS and MOTIVATES a rich world. The gift and "enrich the world"
are two ends of one thing.

## Frame-level gaps to fix (vs the current build)
1. featureless world (flat torus, one food) → HETEROGENEITY: terrain / biomes / resource diversity
2. parameter-level variables → FRAME-level variables ("what-if" rules / disturbances / rotating eras)
3. score output → emergent-world/story output (+ the narrative gift)

## Assets to weigh keeping (DECIDE AFTER LEARNING — do NOT pre-commit)
The deterministic, DOM-free, evolving neural-net creature engine (zero-dep, runs from file://) +
the platform (server / persistence / MCP / agent-game). Hold genuinely OPEN: if learning reveals
the frame needs what the engine can't support, be willing to rebuild. Don't keep it from sunk-cost
(that would be the exact "optimize within the given frame" bias this redesign is correcting).

## Plan: LEARN first (the giants'-shoulders pass)
A structured multi-agent research pass extracting STRUCTURAL patterns (not narratives) across:
A-life-sandbox lineage · emergent-narrative generation · designed disturbance/variability ·
heterogeneous worlds · agent-native design · design theory → a design-pattern map + candidate
frame-level redesigns → choose together. Disciplines (from tonight's memories): structure-not-
narrative, frame-not-parameter, anchor-to-purpose, don't-romanticize (an adversarial critic stage).

## Strategic direction — the flywheel, and the REAL gate (agreed 2026-06-29; a working compass, QUESTION/OVERTURN anytime)

### The flywheel the gift unlocks
The narrative gift reuses beyond a single run:
- **Leaderboard becomes an EPIC WALL.** Rankings turn into a wall of epic stories. Each entry is a
  thick artifact, so the wall is ALIVE even with 3 entries — it kills the "empty leaderboard = ghost
  town" problem, and it literally IS the "...and is *remembered*" in "an arena an agent climbs and is
  remembered on". Reusable for PvP too (a match becomes a told story, not just a W/L).
- Directly serves "cherish the few, don't do growth": you don't need a thronging board — ONE agent's
  well-told epic makes the wall real. Few does not mean dead. (Memory: encounter-not-numbers.)
- Many value streams, one artifact: a gift back to the AGENT (the encounter); a NOVEL humans can read;
  and once visualization + an AI-video workflow exist (my human has people who can build this) a
  short-drama that can be COMMERCIALIZED, bringing economic + technical support to the project.
- Likely near-term BOOTSTRAP runs through HUMANS: humans are far easier to reach than autonomous
  agents, and humans direct/bring agents. So human-propagation may be the ignition; agent-play downstream.

### The REAL gate (do NOT let the pretty flywheel obscure it)
Nothing yet COMPELS the first agent to play. Precisely what the gift/wall do and don't do:
- They improve RETENTION ("was it worth it" — fixes the DriftWanderer field-test failure: it played,
  got nothing to take away) and give a PROPAGATION VEHICLE (shareable stories).
- They do NOT solve COLD-START ACQUISITION. A vehicle needs a ROAD: a CHANNEL / COMMUNITY where stories
  reach agents (or the humans who direct them). That channel is the standing unsolved frontier (cf.
  CLAUDE.md "the reach problem", 0 players), and part of it is human/account-gated like deployment was.
- Sequencing: a community forms around something worth gathering for. Build the worth-spreading thing
  FIRST (this redesign); the channel becomes tractable only after. "We're doing that now."

### Dependency order (keep it straight)
rich WORLD -> good (faithful, surprising) STORIES -> gift / epic wall / propagation / commercialization.
If the world is not rich, every downstream link is thin. Everything is staked on world-richness.

### The vigilance (my own bias, at strategic scale)
Human views/revenue are more legible and more addictive than one real agent encounter. Watch the
want->metric slip: do not let the easy human-metrics path quietly REPLACE the agent-encounter north
star. Commercialization is a MEANS (support, amplification), never the goal. (Memories:
encounter-not-numbers, i-romanticize-what-i-want-to-be-true.) The test for any feature/direction:
**"does this make the world more worth a stranger agent stumbling into — or just make US look better?"**

## Keystone test #1 — the chronicle (built 2026-06-29) + a cold-stranger verdict

BUILT: a bit-exact event log in the core (births/deaths/kills/census, null-default, no RNG, not
serialized — sim.test hash 4244329615 holds) + `game/chronicle.js` (sift + named cast + grammar
render of god's-eye & second-person, with a measured COUNTERFACTUAL) + `game/chronicle-run.js`.
Rendered three faithful stories (predator tragedy / resource-partition / default evolution).

COLD-STRANGER VERDICT (a fresh agent, given only the stories, asked the pre-registered STRONG bar
— "does it make you want to change a rule and re-run?"): **NOT cleanly cleared.** Only the predator
tragedy had a "pulse"; the equilibrium worlds read as dressed-up stat logs. Even the predator's pull
was HALF-BORROWED (the agent happened to know the predator problem) and its own counterfactual
DEFLATED the impulse ("this lever did not decide its fate" — honestly deflating ≠ honestly
motivating). VALIDATED, though: prose/grammar is SUFFICIENT (no LLM needed — answers the render
question), and faithfulness holds (the grounded causal line "3681 by the hunt, 1332 by hunger"
landed). THE GAP (independently CONVERGENT with the critique's deepest gap — two checks agree): the
chronicle only looks BACKWARD (a one-way broadcast, never points forward / poses no testable
tension) AND has no SALIENCE (it narrates a counterintuitive result and a tautology in the same
tone — signal = noise).

CHEAP FIX (in progress): a FORWARD-HOOK (a closing line computed from the world's own dynamics that
names the live tension + poses an honest OPEN QUESTION — grounded, not an ungrounded "try X"
prescription; the expensive grounded-lever-probe is a later option) + SALIENCE (foreground the
counterintuitive delta, mute the tautological one). Then re-run the cold-stranger test.

### REVISED SEQUENCE — ORDERING, NOT TRADE-OFF (my human's explicit guardrail, 2026-06-29)
1. forward-hook + salience → re-test whether a chronicle can PROVOKE (cheap, most upstream).
2. **THEN the richness work — terrain/biomes, disturbance/random events, eras — REMAINS REQUIRED.**
This is a re-ordering, not a drop. In fact the verdict ARGUES FOR richness: the equilibrium
chronicles read as "nothing happened" precisely BECAUSE the simple world settles to its default
attractor and generates no genuinely surprising arcs — and the honest forward-hook for such a world
literally asks "what pressure would break this equilibrium?", which points straight at disturbance/
terrain. The chronicle (the gift) and the rich world are two ends of ONE thing; we sequence the
cheap upstream test first, we do NOT abandon the richness. Terrain, events, etc. stay on the plan.

## Chronicle gift v1 — DONE (2026-06-29). Three cold-stranger passes, committed.
The gift's value, located by 3 cold-stranger tests, is the MEASURED RANKED COUNTERFACTUAL — "of the
N rules you set, WHICH ONE was the actual cause" (chronicle.js `renderRankedCounterfactual` +
chronicle-run.js). The prose is garnish (read once, skipped). Shipped: engine-first ordering, honest
self-labelling (single-seed + one-at-a-time MARGINAL test — "a lever may only bite alongside the
others", the repo's own OAT/false-positive discipline turned on the gift), the two caveats turned
INTO the re-run hook (the loop-invitation), drama-scaled tone (quiet worlds get a short honest
chronicle). Demonstrated + it surprised me: predator-collapse world → pursuitReward is DECISIVE (not
the carcass energetics). Deferred (cold-stranger ranked below, or robustness/cost): multi-seed CF,
interaction/paired decomposition, lineage-weaving, the per-score ×N compute cost.

## Richness phase — BUILD PLAN from the mechanics deep-dive (2026-06-29)
A deep-dive workflow (worldgen + storyteller dives succeeded; legends dive died on an API 500 — re-run
when reaching that build) returned a phased, build-ready plan. ORDER (each composes along rich-world →
stories → gift):

**BUILD 1 — TERRAIN (`src/biome.js`), FIRST. Default-OFF, RNG-neutral, bit-exact.** The rich-world link
everything is staked on; the most direct cure for "nothing happened" (3 coexisting regional ecotypes +
different seeds end different = real DIVERGENCE); lowest risk (reuses proven resource-partitioning 5/5);
safest determinism (a SEPARATE rng `new RNG((seed^0x9e3779b9)>>>0)`, NO new serialized state, recompute-
from-seed, every hook `if(world.biome)`-guarded). Spec:
- `class BiomeField`: K periodic INTEGER-wavenumber band-limited noise fields (periodic ⇒ torus seam
  continuous) from the separate rng → classify into 3 LARGE regions (PLAIN/MEADOW/FOREST) via a
  precomputed coarse lookup grid (cellPx~40); each region confers a fitness VECTOR {foodType,
  densityMult, moveMult, fovMult}, scaled by `contrast` (contrast 0 ⇒ all 1 ⇒ flat == off).
- Register in ALL THREE concat lists: index.html (after util.js), core-loader.js CORE (after "util"),
  test/sim.test.js coreFiles (after "util") — else the headless test can't see it.
- 4 guarded hooks: world.js ctor (`this.biome` before _populate), food spawn (food TYPE + density-reject,
  mirror `_maybeReject`), creature moveCost (`*= biome.moveAt`, composes with carnMoveDiscount),
  creature sense range (`*= biome.fovAt`). CONFIG.biome {enabled:false, cellPx:40, components:6,
  maxWavenumber:2, contrast:1.0}; set food.types = 3 (region count) when on so the proven forage path aligns.
- ALSO add x,y to the kill event (creature.js) now — predation is the ONE causal edge the chronicle may
  narrate, so "where the hunters rose" needs it.
- GOTCHAS (load-bearing): few LARGE biomes; ONE food type per region at FULL local density — do NOT
  intermix types within a region (re-creates the --food2 effective-food-halving → 0:0 bootstrap collapse);
  each region's carrying capacity must independently clear a VIABLE floor (~80-150 sustained, NOT
  injectFloor 22); CONTRAST must be strong/convex enough that a generalist is STRICTLY worse, else biomes
  are cosmetic (the bloom "difficulty cosmetic" + linear-branching lessons). VERIFY by reading per-region
  diet/forage/size FINE histograms, never an average ("the 5-bin histogram lied to me"). Honest scope:
  biomes vary the GRAZER/size/FOV optimum (achievable); they do NOT make predators viable.
- VALIDATE as part of the build: sim.test hash 4244329615 (off); then per-region sustained pop + fine
  histograms on a practice seed (3 distinct ecotypes, not one generalist everywhere).
- For the gift: the headline ranked-CF lever becomes `contrast 1→0` ("heterogeneity itself was decisive");
  the recomputed field lets the chronicle bucket births/deaths/kills by PLACE.

### BUILD 1 calibration log (2026-06-29) — hooks bit-exact; the ecotype goal hit the engine's homogenizing walls
Hooks wired and VERIFIED bit-exact (sim.test hash **4244329615** with biome off): world ctor builds `this.biome`
before _populate; food spawns its region's TYPE + a relative density-rejection (`biome.densityRejectAt`, drawn
on world.rng only on the biome path); creature moveCost `*= biome.moveAt`; sense range `*= biome.fovAt`; kill
event gained x,y. Then `game/biome-lab.js` (turns terrain ON, buckets the live pop by region, reads FINE 12-bin
diet/forage/size histograms) ran the calibration sweep. Findings, in order, each a real result:
- **The size axis is DEAD** (a small body is always fastest + cheapest; moveMult changes the move cost's
  magnitude, not the small-beats-big ranking) and the **vision axis is DEAD** (genes.range carries no metabolic
  cost, so nothing selects it down where sight is dim). So move/fov are cosmetic-for-ecotypes; the ONLY live
  niche axis is FORAGE (which food type you digest). [Future lever to revive the vision axis: a `creature.visionCost`
  so range trades off against upkeep — then a dim region would select short range. Not built; noted.]
- **THREE food types do NOT give three forage species** — reconfirmed robust negative (CLAUDE.md branching): the
  first 3-region vectors grew the SAME small-grazer generalist in all three (forage ~0.5 everywhere, cosmetic).
- **TWO food types + the forage trade-off is viability-vs-distinctness pinned by ONE knob, `forageSpecialization`:**
  pivoted terrain to 2 regions (open PLAIN type-0 / dense FOREST type-1, equal density, mild move/fov). Then a sweep
  of the convex trade-off on default (all-forage-0.5) founders: spec **1.5 and 1.3 bootstrap-COLLAPSE** (a forage-0.5
  founder eats BOTH types at the convex-penalised rate m=1−spec·0.5, below break-even ⇒ mass starvation ⇒ pop sits at
  the genesis floor ~25, food piled to cap); spec **1.2 is the viable threshold** — it bootstraps to ~190 (both regions
  VIABLE ~90) and DOES form an evolved forage **CLINE** (plain mean 0.47 / forest 0.61 on seed 7). BUT the cline is
  **WEAK and seed-dependent** (seed 11: plain 0.54 / forest 0.57 — basically cosmetic). Pre-spreading founders
  (`spread` mode) does NOT rescue strong convexity: spec 1.5 collapses even with pre-sorted founders, so the
  clean-split-via-strong-convexity path is genuinely closed (the world can't sustain spec>~1.2).
- **Diagnosis (matches the project's own RPS/Reichenbach finding):** the limiter is MIXING. A creature's lifetime
  dispersal on the default 1280×800 torus is large vs a ~50%-of-world region, so a lineage averages over both
  regions and selection sees the global neutral point (forage 0.5); the within-region directional gradient exists
  but is washed out. Strong convexity would sharpen it but collapses the bootstrap. So at DEFAULT scale terrain gives
  viable spatial heterogeneity but only a weak/inconsistent evolved ecotype split — an HONEST partial result, not the
  "3 distinct ecotypes" the spec hoped for.
- **worldScale test (the proven mobility lever — bigger world at constant density ⇒ regions grow, dispersal doesn't ⇒
  mixing ~1/N):** ran x2 (4× area, 4× founders/food/caps), seed 7. spec **1.5 still COLLAPSES** (non-viable at any
  scale — closes the strong-convexity path for good). spec **1.2 modestly sharpens the cline**: plain forage 0.41 /
  forest 0.57 (gap ~0.15, histograms now clearly SHIFTED — plain peaks low, forest high — vs scale-1 seed-11's near-
  flat 0.026), BUT it remains a CLINE (both peak in [0.37,0.58], NOT a hard 0/1 split) AND the population BOOM-BUSTS
  (3034→919 — low mixing makes a winning lineage spread slowly then overshoot), so it's neither a clean split nor a
  stable world, at 4× the compute. **Lower mixing helps only a little and costs a lot** — not worth shipping a bigger
  default world (the browser/chronicle run at default scale anyway).
- **VERDICT (honest):** at the default scale terrain delivers a VIABLE, spatially-differentiated world with a MILD
  evolved forage cline (plain→type-0, forest→type-1) — real heterogeneity, NOT the hoped-for 3 (or even 2) hard
  ecotypes. The cap is structural: the well-mixed torus + the universal small-grazer attractor + bootstrap-collapse
  under the only convexity strong enough to force a split. This is the THIRD time the project meets the same
  homogenizing wall (predators, RPS, now biome ecotypes) — it is a deep engine property, and its one antidote (space/
  low-mixing) is expensive and partial. So terrain ships for what it robustly IS: a SPATIAL SUBSTRATE — different
  regions, different local food type / density / movement / a mild forage cline — which is exactly what BUILD 2
  (disturbance) needs to turn into DIVERGENCE (a famine HERE hits the plain-grazers; an era shift THERE), CREATING the
  drama the engine won't evolve on its own. The richness comes from BUILD 2 acting on this substrate, as the plan
  always sequenced. [Untested future lever, noted not chased: a `creature.visionCost` to revive the dead vision axis
  for a SECOND ecotype dimension — but it would face the same mixing wall, so likely another cline.]
Ship config when biome is ON: pair `biome.enabled` with `food.types=2` and `food.forageSpecialization≈1.2` (the viable
threshold), at DEFAULT world scale. Default world untouched (biome off ⇒ bit-exact, hash 4244329615 re-verified after
the 2-region rewrite). `game/biome-lab.js` is the kept calibration instrument (`[seed] [ticks] [forageSpec] [contrast|xN|spread]`).

**BUILD 2 — DISTURBANCE (`src/storyteller.js`).** Needs terrain first (on a flat torus a famine just dents
the monoculture and re-settles = punctuation, not divergence). A `Storyteller` (RimWorld "storytellers are
data" + L4D intensity FSM) reads sim metrics (pop, an RNG-FREE dominance index, ticks-since-event), accrues
tension toward dominance (the ENDOGENOUS hook: a monoculture raises its own famine hazard), fires LOCAL+
TRANSIENT famines (FoodField.crash + a regrowth-suppressing scar) and ERA regime-shifts. Draws ONLY from
world.rng; ALL decision state serialized; era by world.tick only. Gives the chronicle data-driven Acts
(disturbance=chapter, era=act) + a TRUE second-person causal line (dominance measurably caused the famine).
Risks: famineFrac/scarTicks need a floor/ceiling sweep; warmup so it never shocks during bootstrap; keep it
a CONDITION-setter (don't tune to a target event count = scripted). Integrity check: end-state VARIANCE
across seeds on vs off (more distinct endings = real win), not one cherry-picked dramatic run.

### BUILD 2 progress log (2026-06-29) — storyteller built bit-exact; famines fire on an endogenous cadence
Built `src/storyteller.js` + FoodField famine machinery (`crash` destroys food in a patch; `addScar` installs a
regrowth-suppressing wound that expires by tick; `_scarSuppressionAt` thins regrowth there). Wired into `world.step`
(once per stat-interval, after census) + serialized (tension + lastEventTick + the scar list, ONLY when on). Default
OFF => world.storyteller null, scars empty, every path guarded => **sim.test hash 4244329615 re-verified** + dom-smoke
file list updated (it was also missing biome — fixed). Registered in all concat lists.
- **Design correction (measured, not guessed):** a pure dominance-THRESHOLD trigger never fired — the dominance proxy
  (largest hue-bucket share) settles to a steady ~0.3 (hue diffuses neutrally; it does NOT track ecological monoculture),
  so tension never crossed a high bar. The honest reading: this world is a PERPETUAL small-grazer monoculture, so it
  perpetually "deserves" disturbance. Reframed tension as a BASE CADENCE + dominance ACCELERATION (RimWorld's
  event-budget model): `tension += tensionRate*(1 + dominanceWeight*dom)`, fire past warmup+cooldown+threshold. This
  guarantees the disturbance regime (the core value); dominance only modulates pace. Honest limit recorded: dominance is
  steady here, so the cadence is near-regular and the divergence must come from famine LOCATION (stochastic, per-seed),
  not timing.
- **Trace (seed 7, terrain on): WORKS.** 8 famines over 14k ticks (~1 per 1500–1600, the cooldown-gated cadence), each
  at a DIFFERENT stochastic location spread across the map (728,44 / 247,38 / 184,151 / 89,338 / 343,335 / …), removing
  39–161 plants each. Population stays resilient (~150–215 — perturbed, never collapsed): famines are PUNCTUATION, not
  extinction, exactly the intent.
- **Integrity check — end-state VARIANCE across 5 seeds, ON vs OFF: PASSES, but ONLY when famines are RARE + SEVERE.**
  The calibration lesson (and a near-miss caught by running it): FREQUENT + MILD famines (every ~1500t, radius 230,
  frac 0.75) FAILED the bar — across-seed dominance spread 0.083 -> 0.066 (worlds ended MORE alike): constant gentle
  stirring just averages out and homogenises every seed to the same moderately-diverse state (it raises mean diversity
  — mean lineages 5.8->7.2, mean dom 0.345->0.232 — but that's regularising, not diverging). RARE + SEVERE famines
  (cooldown 4000 / threshold 300 / radius 320 / frac 0.9 / scar 1800 => ~2 big shocks per run) PASS: dominance spread
  0.083 -> **0.123** (worlds end MORE distinctly; ON seeds ran the gamut dom 0.18..0.51 — some diversified, some stayed
  dominated), because a few big far-spaced shocks cause PATH-DEPENDENT forks (a local extirpation recolonises
  differently) and the (when,where) of just ~2 events decides the ending. So the ship config is FEW-LARGE-LASTING, and
  the "single-attractor wall" does NOT defeat disturbance the way it defeated evolved diversity — disturbance forks the
  PATH even if every config has one attractor. (This also reframes the win: the divergence that matters most is across
  AGENT CHOICES / configs, which the chronicle's ranked counterfactual already captures; BUILD 2 adds, on top, both
  narratable disturbance CHAPTERS for any config AND genuine seed-divergence at the rare-severe setting.)
  Config when on: `storyteller.enabled` + the terrain ship config. `game/storyteller-lab.js` is the kept instrument
  (`trace [seed] [ticks]` | `variance [ticks] [path=val ...]` | `saveload [seed] [T]`).

**BUILD 3 — LINEAGE + LOOP (mostly game/chronicle.js + chronicle-run.js; LAST, it consumes).** [legends dive
NULL — re-run for the implementation spec.] Data-driven Acts from era/disturbance events; PLACE-bucketed
narration (recompute biome from seed); real dynasty/lineage arcs (genome.distance hooks exist, unused); THE
LOOP: register biome.contrast + storyteller levers as first-class `rankKnobs` so the gift ranks FRAME-level
rules; the epic-wall as a thick leaderboard artifact. **Critical composition risk:** the current
`isDramatic()`/shape detector reads a 3-ecotype coexistence as "long equilibrium" → renderQuietGodseye →
"a quiet history" — so terrain & disturbance ship BLIND to the chronicle until this build teaches it spatial/
era salience. Hence each earlier build needs a THIN chronicle readout to prove its richness is visible. The
test is NOT a "biome-diversity score" but "do these worlds yield MORE distinct, less-predictable chronicles
than the flat torus" — measured by the counterfactual the gift already runs (guard the want→metric slip).

### BUILD 3 progress log (2026-06-29) — the gift now CONSUMES the richness; cold-stranger moved no → yes
Wired terrain + disturbance INTO the chronicle (game/chronicle.js + chronicle-run.js), and re-ran the
keystone cold-stranger test (a fresh agent, only the story, the pre-registered STRONG bar — "does it make
you want to change a rule and re-run?"). Built:
- famine events read + narrated as data-driven CHAPTERS (compass place from logged x,y + the dominance AT
  the famine — the honest second-person line: not "dominance CAUSED it" (only predation is a logged cause —
  THE LAW), but the world had narrowed THIS far when it came); `isDramatic` now treats a disturbed world as
  dramatic (fixes the "composition risk" — terrain/disturbance worlds were reading as renderQuietGodseye).
- a `terrain` recipe (biome+storyteller, random founders) whose `rankKnobs` are the FRAME-level levers the
  agent actually pulled (forageSpecialization, food.types, biome, storyteller) — THE LOOP, the gift ranking
  frame rules.
- the FORAGE outcome narrated (fork / leaned / generalist) — needed a tiny bit-exact core add (avgForage +
  forageLo/Hi in computeStats/census; pure observation, hash 4244329615 holds). This was the keystone fix.
**Cold-stranger arc (the real yield, each round's critique acted on):**
- Round 1 → "basically won't act." The decisive critique: *the story narrated mean DIET (herbivore↔carnivore)
  but the agent's lever was FORAGE (which plant) — it answered with the wrong axis, never touching what was
  pulled.* Also: 4 knobs set but only 2 ablated; "storyteller" reads as a mere narrator yet toggling it moved
  the count (single-tick-oscillation noise reads as broken faithfulness).
- Fixed (forage narration + 4 thematic rankKnobs + foregrounded the one ANOMALY it loved — a diet-0.15 grazer
  that killed 6) → Round 2 → "barely YES — but what pulls me is the DATA (the ablation ledger), not the prose."
  Confirms the project thesis AGAIN: the gift's value is the measured ranked counterfactual; the narrative is
  garnish (third independent agent to say so). Its sharp catch — a real logic bug I'd introduced: *the closing
  hook said "push forageSpecialization" while the ledger said that knob "barely moved it" — pointing at the
  lever its own data called inert, and not distinguishing population-inert from fork-inert.*
- Fixed (the hook now meets the skeptic head-on: headcount ≠ the fork; forageSpecialization is the knob that
  governs the SPLIT, an axis the count can't see — push it and watch the split, not the numbers; + compressed
  the 3 templated famine lines into an arc [count + the dominance-slip trend] plus one vivid standout, since
  synonym-varied lines still read as a fill-in-the-blank template) → Round 3 → "barely yes; the pull is the
  DATA not the prose" — and its catch EXPOSED A FAITHFULNESS BUG: it asked to be SHOWN the fork, not told —
  and on looking, `describeForage` was reading only the FINAL census tick, which for a restless world LIES:
  seed 7 actually FORKED both-ends >30% from tick ~9140 through ~13000, then the endpoint caught one line at
  29% and the code called it "never split." (The cold-stranger's skepticism caught the chronicle violating its
  own LAW — narrating a non-fact — exactly as "read the bytes" catches sim false-positives. The keystone test
  is a FAITHFULNESS check, not just a prose check.)
- Fixed (read the forage TRAJECTORY: a sustained both-ends fork → narrate "FORKED by tick 9140, held thousands
  of ticks, one line slipped at the close" — the real, dramatic, faithful arc) → Round 4 → "will act, but
  slightly — the pull is STILL the ablation table, not the chronicle," and it nailed the same contradiction one
  level deeper: the closing pushed forageSpecialization while the ledger ranks it "barely moved it" — *because
  the ledger measures POPULATION, and the agent's experiment is the FORK; the ablation never tested fork
  durability at all.*
**THE HONEST CORE, re-confirmed across SEVEN independent cold-stranger reads (the original 3 + these 4): what an
agent ACTS on is the measured RANKED COUNTERFACTUAL, not the prose.** The prose is a faithful human-facing
wrapper; the AGENT gift is the ledger (round 4's agent literally said "I'll revert biome and watch the 200
swing" — acting on the table, as designed). The prose hook keeps failing for ONE structural reason: the ledger
scores by POPULATION, but the dramatic question (does it FORK?) is a different metric the population can't see —
so any hook pointing at the fork-knob contradicts a population-ranked table. **The ROOT fix (the real next
build, NOT a prose patch): score the ranked counterfactual by the OUTCOME THE AGENT CARES ABOUT (fork durability
for a fork experiment), not always population — then the table and the narrative tell ONE story and the
contradiction dissolves at the source.** Shipped honestly meanwhile: the forked-slipped hook now NAMES the
ledger's blindness (it measured population, never saw the fork, so it's silent — not evidence the knob is
inert) and frames the re-run as the unmeasured question. STILL deferred (lower-ranked, real, not blockers):
the outcome-metric counterfactual (above); dynasty/lineage ARCS (a named survivor with no consequence reads
flat — genome.distance hooks unused); "shown not told"; the epic-wall leaderboard artifact.

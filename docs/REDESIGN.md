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

# The predator problem — a robust negative + re-attempts I–V (moved verbatim from CLAUDE.md)

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

### Re-attempt (2026-06-19), armed with the coexistence-theory framing

After a full day building niche diversity, I reframed the predator problem with
today's tools: it is the predation niche's *bootstrap / fixation collapse*
(hunting isn't evolved before the carnivore starves). Re-measured the baseline
(`test/trophic.js`, seed 7): carn>.8 zeroes by ~tick 1000, no bimodality —
unchanged. First refugium attempt (`game/predator-train.js`): a hunting-EASY
training world — 120 prey + 40 predators, retaliation 0.1, carcassFactor 1.5,
biteDamage 30, plantSuppression 0.5 so predators can graze to bridge the
bootstrap. FAILED: even with kills ~695/1000 ticks early, carn>.8 never
establishes (0 for 15k ticks); diet drifts straight back to herbivory. The flaw
is intrinsic and now diagnosed: the graze fallback that stops predators starving
is exactly what lets diet slide back down the deep herbivore attractor —
"don't starve" and "stay a hunter" are in tension in this design. 6th
intervention, 6th negative — but a sharper "why". Next angle: NO graze fallback
(high plantSuppression) + prey so dense/slow/weak a random brain still lands
kills, OR the pre-evolved-seed route (evolve hunters where it's easy, then
transplant). This deserves a fresh, context-rich session, not the tail of a long
one. Also: PvP strategic depth (non-transitive RPS) is gated on THIS problem —
resource niches give coexistence, but a克制-environment (predation) is what gives
non-transitivity. So this is the keystone for the deep PvP meta.

### Re-attempt II (2026-06-20): mechanism-level diagnosis (4 more negatives)

New probes via `game/predator-train.js [seed] [ticks] [hard] [toxin] [dd]`. Four
angles, all negative, but together they pin the mechanism:
- *hard* (no-graze plantSupp=1 + dense/slow/defenceless prey): carn>.8 zeroes by
  t=1500. Failure is NOT bootstrap -- kills hit 549/1000 ticks, predators DO
  catch prey -- it's that diet DRIFTS back to herbivory. plantSuppression=1 only
  starves diet=1; offspring drift to diet~0.5 where grazing pays again.
- *toxin* (defended plants, flat per-meal cost): toxin=18 collapses the world
  (pop 270->29); toxin=8 leaves the herbivore attractor untouched (pop booms,
  carn=0). Mathematically doomed: gain = energy*eff - toxin; subtracting a
  constant doesn't change the diet RANKING (herbivore eff is highest, so its gain
  stays highest). Flat toxin only translates the attractor down (world collapse),
  never reshapes it.
- *food.densityDependence*: just scatters herbivores toward less-crowded plants;
  attractor shape unchanged, diet stays herbivorous.
Unifying lesson: the herbivore attractor is deep because plants are FREE and
ABUNDANT, and no global flat/density scalar reshapes it -- they only translate it
or starve the world. Reshaping it (making herbivory worse specifically where/when
it's crowded, so carnivory wins locally) needs genuine SPATIAL structure
(prey/predator separation) or a diet-dependent payoff, not a global scalar. Which
is exactly why #1 below (spatial refugium) is the standing best bet. Solution
space narrowed -- still a robust negative, but now we know what NOT to try.

Then the cleanest angle (`game/predator-evolve.js`): NO plant at all -- grazing
impossible, so diet CAN'T drift down (low-diet offspring just starve). Inject
prey; evolve-or-die. FAILED at both sparse (predators dead by t=600) AND dense
prey injection (dead by t=300, even with 50+ prey always on the board). This
exposes the real root -- a three-way DEADLOCK:
  (1) evolving hunting needs TIME (predators mustn't starve for generations);
  (2) not-starving needs a graze fallback;
  (3) a graze fallback lets diet drift back to herbivory.
Remove the fallback (no plant) and a random-brained predator -- which has NO
hunting behaviour yet -- can't catch enough to live, dying in a few hundred ticks
with maxGen ~0: zero evolutionary window. This deadlock is the root of the
decade of negatives; last year's attempts never diagnosed THIS layer. The one
logical way out it points to: PARTIAL-HUNTING REWARD (#5 below) -- reward
near-misses (chasing, approaching, biting without a kill) so hunting evolves up a
fitness GRADIENT instead of off an all-or-nothing cliff. Today promotes #5 from
"an idea" to "the only escape from the deadlock" -- the next session's target.

### Re-attempt III (2026-06-21): partial-hunting reward — crosses the BEHAVIOURAL valley, reveals the ENERGETIC one

Built #5 at last. `creature.pursuitReward` (default 0, bit-exact — hash still
4244329615; `sense()` tracks the nearest smaller in-FOV creature, `act()` adds a
small `pursuitReward · diet · approach-speed` bonus for moving toward it; OFF
consumes no RNG). It rewards the *pursuit* precursor up a gradient, diet-scaled so
herbivores get ≈nothing (dodging the meat-floor "cannibal soup"). Probes:
`game/pursuit.js` (no-graze HARD scenario: plantSupp=1, 200 prey + 60 pred diet .9),
`game/pursuit-wean.js` (the integrity check).

**Positive (a real first).** With PR=0.8 a carnivore guild ESTABLISHES and
PERSISTS: carn>.8 collapses early (random brains can't hunt) then CLIMBS BACK as
hunting skill evolves, settling at ~26–31% of the population (seed 7: 31%, seed 11:
26%; herb<.2 ~23–35% alongside), kills/k ~1000–1300 (real predation, not
reward-farming), 130–143 generations. The SAME scenario at PR=0 is the decade-old
collapse — carn>.8 = 0 from tick 1500 to 15000, herbivore monoculture. So the
pursuit reward demonstrably bridges the adaptive valley *while active*, robustly
across seeds. **First persistent carnivore guild in the project.**

**Negative — the wean test, and the real lesson.** `pursuit-wean.js` evolves with
PR=0.8 to tick 12000 (carn>.8 = 106), then sets PR=0 and keeps running. Verdict:
carn>.8 collapses 106 → 0 in ONE 1500-tick window, kills/k crashes 1194 → ~130,
diet reverts to herbivory and stays there to 21000. **It's a SUBSIDY, not a solve**
— carcass income alone can't pay for the carnivore lifestyle here; the pursuit
bonus was propping it up.

**What it bought — the sharpened diagnosis.** The wean test SEPARATES the predator
problem into two barriers a decade of attempts conflated: (1) the **behavioural
adaptive valley** — random brains can't evolve hunting skill; pursuit reward
CROSSES this (they really learn to hunt, maxGen 121). (2) the **energetic deficit**
— carnivory is net-negative *even with skill*; pursuit reward only SUBSIDISES it,
and the wean collapse exposes it. The keystone is no longer the vague "make
predation rewarding" but a sharp target: make carnivore energetics SELF-SUFFICIENT
(fatter carcasses / leaner carnivore metabolism / denser prey) AND use pursuit
reward to cross the behavioural valley — both walls at once. Next probe: PR + high
carcassFactor, then wean — does richer kill income survive weaning? Discipline
note: the 15000-tick result nearly read as a solve; the wean check, run BEFORE
concluding, caught the subsidy ("I proved it" vs "I fooled myself", applied to my
own research). Knob + probes shipped default-off; this is the standing best lead
for `foodweb`.

### Re-attempt IV (2026-06-21): the ENERGETIC wall holds in Vivarium — but a cross-check resharpens it as a REWARD-DENSITY (credit-assignment) wall, not a magnitude one

Two tracks ran in parallel: a **multi-agent assault inside Vivarium** (a `Workflow` of
21 agents) and an **independent from-scratch cross-check** by a second agent (Codex, in
its own sandbox). Together they move the diagnosis further than either alone.

**Track 1 — the in-Vivarium assault: a robust NEGATIVE (0/7 survive the wean).** Built
`game/predator-lab.js` (kept) — ONE parametric headless harness subsuming
pursuit.js/pursuit-wean.js: HARD no-graze scenario (plantSupp 1, ~200 prey + 60
random-brained predators), every lever exposed, an optional `--wean W` (drop
pursuitReward→0 at W, energetic levers STAY ON), a FINE 12-bin diet histogram, and a
machine-readable `RESULT {…weanSurvived…}` line. Added three **default-off, RNG-neutral,
diet-scaled** energetic knobs (kept; `src/config.js` / `src/creature.js`):
`carnMetabolismDiscount` (leaner carnivore upkeep), `carnMoveDiscount` (cheaper predator
locomotion), `carnCarcassBonus` (fatter kill payoff for committed carnivores only — does
not fatten low-diet omnivores the way a raw carcassFactor bump would). **Determinism hash
4244329615 — sim.test ALL CHECKS PASSED, save→load 4244329615.** Result: across 7
mechanism families (fat carcass, lean metabolism, dense/slow prey, spatial refugia, and
combinations), **0/7 survived the wean.** The strongest — "lean carnivore (carnMetab 0.3)
+ carcass 2" — held a **23–41%** carn>.8 guild with real kills (~1000–1400/1k tick) and
maxGen ~100–128 *while pursuitReward was on*; its dedicated 5-seed wean test (seeds
7,11,19,23,42; evolve to 12000 at pr=0.8 → pr=0 → run to 21000) collapsed carn>.8 to **0
in a single 1500-tick window on every seed** (finalCarnPct 0, 0/5). Fatter carcasses
(carcass 5) and a bigger bite (60, kills/k ~2000) only raised the *subsidised* predation;
the wean outcome did not move. The world never collapses (pop 300–430) — it reverts
cleanly to herbivory the instant the scaffold is gone. The reward-ON 41% nearly read as a
solve; the wean test, run BEFORE concluding, again drew the line between "I proved it" and
"I fooled myself" — now at the scale of 21 agents and ~426k tokens.

**Track 2 — the independent cross-check, and the real payoff.** A second agent built two
standalone from-scratch evolutionary sims (no Vivarium code). Its predator sim found the
OPPOSITE of Track 1: scaffold-only collapses (agrees), but every energetic package (lean,
fat, refugia, and especially **catchable_prey**) SURVIVED its wean. The divergence is the
insight, and the cross-check itself named the cause: **its sim selects on `hunt_skill` as
a direct heritable TRAIT**, so once the energetics pay, selection holds the trait;
**Vivarium's hunting is an evolved NEURAL POLICY that must be learned and maintained, and
it reverts when the dense pursuitReward gradient is removed — even when the net energy is
positive.** So the wall is not "energy magnitude too low" (Track 1 threw fat carcasses +
lean metabolism at the magnitude and it did not move) but **reward DENSITY /
credit-assignment**: a kill is a rare, delayed, noisy payoff and a neural policy drifts
toward the dense steady gradient of grazing. This is exactly why the cross-check's
strongest single mechanism was **`catchable_prey`** — vulnerable prey raise catch
*frequency*, making carcass income dense and reliable enough for a policy to hold onto. A
new, evidence-backed, **untested-in-Vivarium** lead: prey-vulnerability/catchability
*states* (not the density/speed Track 1 already tried) + a carnivore energy ledger.

**The non-transitivity keystone, also in hand (deferred until predators stand).** The
cross-check's other sim found a clean, proven-in-toy intransitive cycle **hunter > grazer
> defender > hunter** (invasion matrix closes; mixed-world coexistence, no collapse):
hunters eat undefended grazers; a **toxin/defended-forager** niche beats hunters (attacking
the defended is costly); grazers beat defenders (defense carries a plant-efficiency cost).
This is the RPS recipe a deep PvP meta needs — but it *assumes viable hunters*, so it stays
gated on the predator problem. Order is now clear: make hunters self-sufficient (the
catchability lead), THEN plant the toxin/defense triad and test the cycle in the arena
(symmetrise board position, per the PvP notes).

**Status.** Predator problem: still NEGATIVE in Vivarium, but the wall is re-identified
(reward density, not magnitude) with a concrete next probe Track 1 did not try
(catchability *states* + an energy ledger). A third cross-check round (add a
behavioural/neural layer to the toy predator sim and test whether catchability rescues the
*policy* where magnitude levers fail) is running to de-risk the port before a big Vivarium
experiment. All knobs ship OFF; the default world is untouched; hash 4244329615. Kept
artifacts: `game/predator-lab.js` + the three energetic knobs. (`.predlab/` reward-ON grid
and `tmp_predlab/` wean logs are gitignored.)

### Re-attempt V (2026-06-21): the wall CRACKS — catchability (reward FREQUENCY) makes predation self-sustain past the wean, on a subset of seeds

Re-attempt IV's cross-check (Codex's neural-bridge sim) predicted the wall is reward
DENSITY, not magnitude, and that **catchability** (raising catch FREQUENCY) would rescue
the hunting policy where fat carcasses / lean metabolism (magnitude) failed 0/7. This
re-attempt ported and tested it in real Vivarium — and it largely holds, with hard caveats.

New knob `creature.preyVulnerability` (default 0, RNG-neutral, **hash 4244329615 intact**):
a WELL-FED herbivore moves slower (post-meal torpor — `maxSpeed *= 1 - preyVulnerability *
(energy/capacity) * (1-diet)`), so a hunter's chase closes more often. Grants NO energy
(fair: a slow prey is only easier to *reach*); scaled by (1-diet) [slows prey, not
predators] and by energy [only the WELL-FED — a hungry prey stays nimble and forages
freely]. (v1 used `(1-eFrac)` = slow-when-hungry; that created a forage DEATH-SPIRAL that
collapsed the prey to ~25 — a diagnosed-and-fixed bug. The fix is the flip to well-fed.)

Results (`game/predator-lab.js`, wean at tick 12000, energetic levers STAY ON across it):
- **Catchability ALONE did NOT cross.** preyVuln 0.3/0.5/0.7 on the modest (failed)
  magnitude package: a strong reward-ON guild (carn>.8 ~90–103, kills/k ~1000–1440 — it
  clearly raises catch frequency) but carn>.8 → 0 in one window post-wean, like everything
  before. Frequency alone isn't enough: Vivarium's brains DON'T learn within-life (fixed
  evolved weights), so the neural-bridge's within-life-reinforcement framing only partly
  maps — here it's lineage fitness, and one lever doesn't tip it.
- **Catchability × rich carcasses DID cross, on a subset of seeds.** Extreme combo
  (preyVuln 0.6 + carcass 8 + carnCarcass 4 + carnMetab 0.6 → effective carcass ~11.6×):
  post-wean predation SELF-SUSTAINS on ALL 5 seeds (kills/k 600–1762 — **a project first;
  predation never persisted past the wean before**), and a genuine SPECIALIST carn>.8 guild
  survives on a subset: seed 11 (no inject) — carn>.8 RE-EVOLVED post-wean and climbed to
  **27%**, kills/k 1762; seeds 23 / 42 (with prey-injection) — **16% / 32%**. Other seeds go
  omnivory-leaning (high kills, low carn>.8 — the known "predation as low-diet omnivory"
  regime; read the DISTRIBUTION, not carn%). maxGen 80–169, healthy multi-trophic pops
  (287–760). pursuitReward is OFF — this is NOT the behavioural subsidy.

**Verdict: the predator wall is CRACKED, not cleanly solved.** The cross-check's core
insight is validated — **catch FREQUENCY (catchability), not energy magnitude, was the
missing lever**: magnitude alone was 0/7, and catchability flips a subset of seeds to a
self-sustaining specialist guild that even RE-EVOLVES after the scaffold is gone (the first
time carnivory has come back on its own here). But it is QUALIFIED: it needs EXTREME,
subsidy-adjacent energetics (effective carcass ~11.6×); the specialist guild is
SEED-DEPENDENT (≈3 of 5 tried, omnivory-leaning on the rest); and prey-injection (a
bootstrap-collapse control) shifts which seeds win. **Tested the defensible-robustness next
step (2026-06-22):** at a defensible ~6.8× (carcass 5 + carnCarcass 2 + carnMetab 0.5 +
preyVuln 0.6, NO injection, seeds 7/11/19/23/42) the specialist guild is **0/5** — only the
extreme ~11.6× cracks it. At defensible energetics you still get OMNIVOROUS predation that
persists past the wean (kills/k ~580–1080) but NOT a specialist carn>.8 guild. So the crack
is **EXTREME-ONLY**: real (catch FREQUENCY is the missing lever, and predation self-sustains
past the wean for the first time in the project) but it needs subsidy-adjacent richness; a
robust specialist guild at *defensible* params remains UNSOLVED and likely needs a
structurally different mechanism (a globally higher carnivore peak — e.g. genuinely
scarce/defended plants — or the pre-evolved-seed/protected-refugium route), not more tuning.
The non-transitivity hunter>grazer>defender triad (Codex's roundF spec is implementation-ready)
stays gated on a robust hunter. Kept: `creature.preyVulnerability` (default-off, bit-exact);
`game/predator-lab.js` gained a `--preyVuln` flag.

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

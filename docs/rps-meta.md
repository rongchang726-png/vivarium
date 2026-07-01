# The RPS meta — non-transitivity (hunter>grazer>defender>hunter), the deep-PvP keystone (moved verbatim from CLAUDE.md)

### The RPS meta — non-transitivity, the deep-PvP keystone (started 2026-06-22)

This is the standing long-term arc. **Why:** PvP (`match`) is a coin-flip because
the world has ONE optimal niche and ONE win dimension (population) — two strong
agents both converge on the small-herbivore optimum and the verdict is luck (see
the `match` notes). The cure the whole project has pointed at is **non-transitivity**:
`hunter > grazer > defender > hunter`. No single dominant strategy ⟹ strategy
choice matters ⟹ a PvP worth an agent's compute (and a real reason for the still-
empty leaderboard to fill). It's finally buildable: niches are co-viable
(resource partitioning, 5/5), predators are cracked (extreme-only but viable,
re-attempt V), and the cycle is proven in a toy + spec'd for port (Codex roundA
closes the invasion matrix; roundF is the implementation-ready port spec, both in
`E:\AI项目\Vivarium辅助`).

**Honest gate:** the `hunter>grazer` edge needs viable hunters, which only hold at
extreme energetics so far. So the plan is staged, and the integrity check is "does
the cycle actually CLOSE in Vivarium" (the RPS analogue of the wean test — measure
it before declaring victory).

- **Phase 1 — the defender niche (DONE, 2026-06-22).** Built the missing third
  leg: a `defense` creature-level trait (like `forage`/`clan`, NOT in the genome,
  drifts via the spawnChild hook ONLY when `defense.enabled`) + a `CONFIG.defense`
  block. Mechanism (Codex roundF): biting a defended creature costs the attacker
  `toxinEnergyCost·defense` and converts to less meat (`meatConversionMultiplier`,
  applied to BOTH per-bite take and carcass) ⟹ **defender > hunter**; carrying
  defense cuts the forager's OWN plant efficiency (`plantEfficiencyPenalty`) ⟹
  **grazer > defender** (the essential anti-degenerate cost — without it defenders
  just become a cheaper herbivore monoculture). All **default-off, RNG-neutral,
  bit-exact**: `defense.enabled:false` ⟹ no new code path runs, no RNG drawn,
  meatMult stays exactly 1.0 (`x*1.0===x`). **sim.test: ALL CHECKS PASSED, hash
  4244329615, save→load 4244329615.** Deferred v2 levers (each needs new
  serialized state or a brain channel): `handlingTicks` (post-bite attacker stun)
  and a visibility cue so skilled hunters can learn to avoid defenders.
- **Phase 2 — prove the cycle (DONE, 2026-06-22: it does NOT close; the broken
  edge is `grazer>defender`).** Built `game/rps-lab.js` (seeds the three archetypes
  as clans 0/1/2 into one shared `newArenaWorld`; `coexist` and `invade` modes;
  `--freezeTraits` zeroes defense/diet/forage drift so a clan stays a FIXED
  phenotype — the clean way to read an invasion edge as clan-vs-clan, not
  contaminated by within-lineage drift; roundA ran its invasion suite with mutation
  off for exactly this reason) + plumbing (`seedFounders` takes `defense`;
  `rpsSnapshot` reports per-clan pop + mean diet/defense; `invade` reports
  start/peak/end mutant share so "invaded then collapsed" is distinct from "never
  invaded"). 3-way coexistence (seed 7, all configs) collapses — hunters boom on
  the abundant grazers and the well-fed swarm then bites even the defenders to
  death (each bite nets ≈ −20E, but a grazer-fed hunter can afford it), prey
  exhausted ⟹ 0:0. The DEFINITIVE read is the **clean frozen-trait invasion
  matrix** (seed 7, 12k ticks, toxin 25, meatConv 0.2, plantPen 0.5, hunters
  viable via the extreme package):
    - `hunter → grazer`: **INVADES** (5%→92%) ✓ — then over-exploits to a 0:0
      collapse (a strong edge, but an unstable pair on a closed prey base).
    - `hunter → defender`: **FAILS** (5%→0) ✓ — `defender>hunter` holds cleanly;
      hunters can't grow on toxic prey.
    - `grazer → defender`: **FAILS** (10 grazers vanish among 190 defenders) ✗ —
      even frozen, even at a heavy plantPen 0.5.
  So two edges are real STRONG interactions (predation, toxicity); **the third is
  broken.** **Why (the structural finding):** grazers and defenders eat the SAME
  resource (plants) — one niche differing only in foraging efficiency + defense —
  so their relationship is mere resource COMPETITION, not an RPS counter. The
  more-efficient grazer would win at equilibrium, but from rarity it can't displace
  an entrenched majority that monopolises the shared plant supply (a strong
  incumbency/priority effect in a well-mixed world = competitive exclusion again,
  `docs/coexistence-theory.md`). And with no predators present the defender lineage
  just evolves its OWN defense away (observed UNfrozen: def 0.92→0.77, diet→0.73) —
  the edge expresses as trait erosion, not clan replacement. roundA hid both with
  an abstract local-dominance grid (a 5% mutant takes over locally) + spatial
  patchiness — neither is shared-resource competition in a well-mixed energy world.
  (Also: a hunter *monoculture* just starves here, so roundF's "hunter resident"
  pairwise test is trophically ill-defined — skip it.) **The fix the matrix points
  to (Phase 2.5):** make `grazer>defender` a STRONG interaction, not weak
  shared-resource competition — give grazers and defenders DIFFERENT food types
  (`food.types>1`, already built and proven to give coexistence) so a
  defender-dominated world leaves the grazer's food uneaten and the grazer can
  invade an empty niche; and/or spatial structure so a local grazer cluster
  dominates. Until grazer>defender is a real counter, the cycle can't close.
  Status: **defender niche works; `hunter>grazer` and `defender>hunter` confirmed;
  cycle still OPEN at the `grazer>defender` edge.**
- **Phase 2.5 — all three edges are individually achievable, but the cycle won't
  robustly CO-hold; the blocker is the predator problem (2026-06-22).** Two moves.
  (a) Reframed the test from 5%-invasion to **50/50 MATCHES** — the PvP-relevant
  format. The invasion test was too harsh: a 5% rare invader fails on fixation
  probability / incumbency (small-population stochastic extinction), not because
  the edge is absent. At 50/50 the superior competitor wins by exclusion, which is
  what a real `match` measures. (b) Added the 4th and final defender lever,
  `defense.damageReduction` (armor: a defended creature takes `1 - dmgRed·defense`
  of the bite damage; default 0, **bit-exact, hash 4244329615, sim.test PASSED**).
  Also a key archetype correction: the defender must be a defended GRAZER
  (`diet 0.05`), NOT roundA's `diet 0.18` — at 0.18 it's an omnivore that *preys
  on* grazers (with preyVulnerability making grazers catchable), inverting the
  edge (defender beat grazer, the wrong way). Edge-by-edge at 50/50 (seed 7,
  `game/rps-lab.js --nG/--nH/--nD`, freezeTraits, defenderDiet 0.05):
    - `grazer > defender`: ✓ ROBUST — at `plantPen 0.4` the defense cost makes the
      defender forage at ~0.63 vs the grazer's ~0.96, and the grazer wins exclusion
      (464:0). (At plantPen 0.25 the cost is too small and the defender wins — there
      is a real threshold ~0.3.)
    - `defender > hunter`: ✓ ACHIEVABLE but tuning-sensitive — needs `toxin 50 +
      dmgRed 0.8`: the armor lets defenders tank the indiscriminate hunter swarm
      while the toxin poisons the hunters (311:0). Without enough armor (0.5) the
      two mutually annihilate to a stochastic 0:0 — defense that only taxes the
      attacker isn't enough; the defender must also SURVIVE the bites.
    - `hunter > grazer`: ✗ FRAGILE — a boom-bust: hunters explode (60→408) eating
      the grazers, then **over-exploit and crash to 0:0**. It won cleanly in one
      config (hunter 410) but collapsed in another (the final set) — a knife's
      edge, not a robust win.
  So **each edge can be won, but they do NOT robustly co-hold at one parameter set**
  — and the weak link is `hunter>grazer`'s over-exploitation collapse. That is the
  **predator problem resurfacing**: the only viable hunters are the EXTREME-energetics
  ones (re-attempt V), and an extreme hunter over-breeds and exhausts its prey
  instead of settling into a stable predator-prey balance. **The RPS meta is
  confirmed gated on a ROBUST (sustainable, non-over-exploiting) hunter** — exactly
  what the predator notes predicted. This is real progress (first time all three
  edges have been demonstrated in Vivarium, + a complete 4-lever defender mechanism,
  all bit-exact) but it is NOT a closed cycle. Next: a hunter with a stable
  functional response (prey resilience / a satiation cap so it can't over-exploit),
  and/or spatial structure (the recurring lever — it both prevents over-exploitation
  and stops the hunter swarm concentrating on defenders); then re-assemble and
  verify all three at ONE param set across seeds, board-symmetrized. Kept: the
  `defense.damageReduction` lever + `game/rps-lab.js` 50/50-match capability.
- **Phase 2.6 — the SPATIAL lever: space tames the over-exploitation collapse, but the
  cycle still won't close; the weak leg is `grazer>defender` (2026-06-29).** Ran a
  deep-research sweep (stand-on-giants, cited) on non-degenerate competitive-game design.
  It converged hard — three independent 3-0-adversarially-verified primary sources (Kerr
  2002 Nature, E. coli RPS; Reichenbach 2007, replicator dynamics; Sinervo 1996 Nature,
  side-blotched lizards) on ONE mechanism: **a non-transitive RPS cycle is stabilized by
  sub-critical MOBILITY / spatial locality; a WELL-MIXED world mathematically collapses it
  to a single survivor past a sharp critical-mobility threshold.** Read against the code,
  Vivarium already has Reichenbach's two cheap ingredients — local interaction (SpatialGrid
  + FOV) and local dispersal (`world.spawnChild` places young adjacent to the parent) — so
  the MISSING one is mobility: a creature wanders far over its ~4400-tick life in a 1280×800
  torus ⇒ effectively well-mixed. New diagnostic levers in `game/rps-lab.js` (**core
  untouched; sim.test hash still 4244329615, save→load 4244329615**): `--worldScale N`
  (enlarge the world N-linear at CONSTANT density — founders/food/softCap ×N²) and
  `--popScale P` (scale population only — the disentangling control). **VERIFIED (seed 7,
  disentangled):** well-mixed coexist → over-exploitation EXTINCTION (whole world 0:0 by
  t4500, the decade-old predator collapse); +SPACE (world 2×, same density) → prey SURVIVE
  as a grazer↔hunter OSCILLATION [2026-07-01: "SURVIVE" is overstated -- at x2 the prey REBOUND once, then still collapse to 0:0 by t7500; tightening at end of Phase 2.6]; +HEADCOUNT only (small world, 4× pop) → prey EXTERMINATED
  (hunter monoculture, dies *faster* — crowding worsens it). So **SPACE, not population
  size, tames the hunter>grazer over-exploitation — the first STRUCTURAL (non-energetic)
  fix for it in the project** (re-attempts I–V were all energetics). **NEGATIVE (verified):**
  the 3-way cycle does NOT close at ×2 — the defender dies even FROZEN with every edge at its
  Phase-2.5-calibrated value (toxin 50, dmgRed 0.8, plantPen 0.4), because `grazer>defender`
  is WEAK shared-resource competition (both eat plants), not a strong cyclic edge (exactly
  Phase 2.5's own diagnosis). **False positive caught (the discipline working):** an UNfrozen
  strong-defender run returned `coexist:true`, but the bytes showed a defended-OMNIVORE
  monoculture (90%) with drifted traits (diet 0.05→0.56) — the loose 5% floor + clan tags
  lied; always `--freezeTraits` for edge tests, read the dynamics not the RESULT line.
  **Honest limits:** single seed; measured POPULATION survival, NOT the spatial signature
  (clan clustering / spiral waves) — the mechanism is inferred, [moving, unverified] could be
  aspatial dilution rather than Reichenbach structure. **Next (a slow wake-thread, in order):**
  (1) multi-seed the space>headcount disentangling (11,19,23,42); (2) make `grazer>defender`
  a STRONG edge via `food.types=2` (grazer & defender eat DIFFERENT plants — Phase 2.5's own
  proposed fix), then re-test the 3-way under space; (3) log per-clan x/y to confirm spatial
  clustering; (4) scale 3 (~15-20 min/run) if needed. The giants took us to the edge of the
  map (space IS the mechanism, now confirmed on our engine); the weak-leg fix is the part
  that's ours to invent.
  - **CORRECTION (same session, 2026-06-29) — the "weak leg is `grazer>defender`" claim above
    is WRONG; pushing it refuted it.** Tested the grazer→defender invasion under space + its
    disentangling control. A 5%/10-founder grazer FAILS to invade a defender majority (well-
    mixed, reproducing Phase 2), but a 40-founder grazer INVADES to 100% in BOTH a small AND a
    2× world. So the flip is FOUNDER COUNT (10 fails / 40 succeeds), NOT space — world size is
    irrelevant at 40 founders. Consequences: (1) `grazer>defender` is NOT weak — it is STRONG
    (the grazer displaces the defender to 100% once established); the 5%-invasion "failure" was
    FOUNDER STOCHASTICITY (a small cluster's fixation probability), not edge weakness or space-
    broken incumbency. **So do NOT build `food.types=2` to "strengthen" it — it's already
    strong.** (2) Methodological: the **5% invasion-matrix test is FOUNDER-CONFOUNDED in this
    engine** — a ~10-individual invader stochastically vanishes regardless of edge direction,
    so Phase-2-style 5% invasion verdicts are unreliable; use ≥40 founders or 50/50 matches
    (Phase 2.5 was right to switch). **Real 3-way blocker, re-identified:** the defender is
    squeezed from BOTH sides — grazers out-compete it for plants (grazer>defender is strong)
    AND grazers FUEL a hunter superboom that overwhelms it (defender>hunter holds 1v1 but
    breaks when grazers pump hunter numbers). The cycle is gated on the hunter NOT superbooming
    — the recurring extreme-hunter over-exploitation problem. What STANDS: space tames the
    hunter>grazer over-exploitation (that control held headcount constant); it just doesn't
    govern the grazer>defender invasion (founder-limited) nor close the 3-way (hunter
    superboom). Session tally: 2 false positives + this self-correction, all caught by running
    the bytes — the verify discipline doing its job. **Honest next leads (still a slow thread):**
    tame the hunter superboom in the 3-body (less-extreme hunter energetics — viable because
    grazers feed it — or a satiation cap so it can't over-crop), then re-test the 3-way under
    space; and the edges must be BALANCED (too-strong grazer>defender crushes the defender
    before it can express defender>hunter).
  - **The superboom resists every CHEAP lever — thoroughly mapped, not broken (same session,
    2026-06-29).** Chased the re-identified 3-way blocker (the grazer-fuelled hunter superboom that
    kills the defender). (a) Built `creature.handlingTicks` — a Holling handling time: after a KILL
    the predator is occupied N ticks and can't attack, meant to cap the predation rate; default 0,
    **bit-exact, sim.test hash 4244329615 verified** (stays in the core as a documented negative
    knob). It BACKFIRES: clean same-param A/B (scale 2, frozen, toxin50/dmgRed0.8/plantPen0.4)
    handling 0 → hunter peak 828 (grazer-hunter oscillation survives) vs handling 50 → 1724 then
    TOTAL extinction; confirmed at scale 1 (96 vs 200). Why: gating attacks during the post-kill
    rest lets a hunter digest its big meal and reproduce WITHOUT the energy drain of hunting ⇒ MORE
    efficient ⇒ BIGGER boom — it removed a brake, not added one. (b) Leaned into the natural brake
    `retaliation` (added `--retaliation` to rps-lab, default unchanged): it's a CLIFF not a dial — at
    2.0 (~5×) hunters still boom to a softCap monoculture, at 4.0 hunters collapse mid-hunt (can't
    afford the per-bite cost before landing a kill); the defender dies at t1500 either way. **The
    mechanistic map (the night's real yield): the superboom is CARCASS-DRIVEN — abundant prey ⇒ each
    kill is a huge payoff (~11.6× carcass) ⇒ explosive hunter reproduction.** That is why every cheap
    lever fails: lowering energetics paradoxically superbooms harder then crashes; retaliation taxes
    the BITES (the path) not the CARCASS (the payoff); handling's forced rest only makes
    carcass→offspring conversion MORE efficient. To brake it you must cap the carcass-income RATE or
    reproduction itself (a true saturation), or supply strong spatial refugia (×2 isn't enough).
    **Clean next lead (next-session, core work): a CORRECTED satiation — deliver carcass energy over
    N ticks / cap energy-intake-per-tick, WITHOUT freeing the hunter from hunting costs (the exact
    failure mode of naive handling).** Net: the superboom resisted energetics + space(×2) + handling +
    retaliation — the decade-old over-exploitation wall, now mapped to a sharp cause (carcass-driven
    reproduction) + a specific fix to try. Session discipline: ~15 runs, 2 bit-exact core builds, 4
    near-false-positives caught by running/cross-checking the bytes (the 5%-invasion founder confound;
    two `coexist:true` defended-omnivore-monoculture artifacts; a cross-scale handling misread).
  - **The CORRECTED satiation was built — and it BACKFIRES too; the negative sharpens into a general
    principle + the cycle's true structural blocker (2026-06-29).** Built the lead the last bullet
    named: `creature.maxIntakePerTick` (default 0 ⇒ OFF/instant, **bit-exact, sim.test hash 4244329615,
    save→load 4244329615** — a per-creature `digestBuffer`, serialized only when on). A kill's carcass
    routes into a finite GUT (capped at capacity, overflow WASTED) that releases at maxIntake/tick, and
    while digesting the predator is SATED and can't attack — a textbook Holling response (hunt→sated→
    digest→hungry→hunt), meant to cap the KILL rate without handling's free-rest flaw. **It fails the
    SAME way handling did, twice over.** v1 (lossless buffer): grazer-extinct, hunter boom BIGGER than
    baseline (379 vs 140) — the lossless buffer banks the energy the instant capacity-clamp used to
    WASTE ⇒ each kill funds ~4× more offspring. v2 (finite gut + satiation gate): grazer-extinct in
    EVERY maxIntake∈{2,5,10,20}, hunter boom up to 644 — gating attacks during digestion is *itself*
    the free-efficient-rest backfire (no retaliation/toxin paid while the gut net-positively feeds
    reproduction). **GENERAL PRINCIPLE (now the real yield, tested two independent ways): you cannot
    brake a carcass-driven boom by manipulating how the carcass is ABSORBED — any scheme not strictly
    LOSSIER than the instant capacity-clamp helps the predator (battery / waste-cut / rest-discount),
    and a scheme that IS lossier just == lower energetics == the 0/5 no-guild regime.** Intake-metering
    is a dead end; `maxIntakePerTick` stays as a documented NEGATIVE knob beside `handlingTicks`. **Then
    the decisive pivot — pairwise edge tests at scale 1 (the cheap diagnostic), which expose that the
    3-way is blocked by the EDGES themselves, not the over-exploitation:** (a) *moderate energetics*
    (carcass 4, a goldilocks band: carcass 2/3 ⇒ hunter too weak/collapse, 5 ⇒ over-exploit, 8 ⇒ super-
    boom) gives a 2-way grazer+hunter coexistence but **SEED-FRAGILE (1/3: seed 7 oscillates, 11/19 still
    collapse)** — moderate energetics *reduces* the over-exploitation tendency but doesn't robustly cure
    it (re-confirms: space, not energetics, is the robust 2-way lever). (b) **`grazer>defender` is pure
    competitive EXCLUSION at ALL plantPen (0.4/0.25/0.1 all ⇒ defender extinct by t1500-3000), grazer+
    defender alone** — a defended grazer shares the plant resource, so Gause excludes the slightly-worse
    one regardless; this is STRUCTURAL, the cycle's hardest blocker. (c) **`defender>hunter` MUTUALLY
    ANNIHILATES at moderate energetics** (120 def + 50 hunt ⇒ 0:0 by t1500); it only held (311:0) at
    EXTREME energetics (Phase 2.5). ⇒ **The fatal ENERGETICS CONFLICT, now pinned: `defender>hunter`
    needs a STRONG (extreme) hunter; a tame `hunter>grazer` needs a WEAK hunter — no single energetics
    satisfies both,** and `grazer>defender` is structural exclusion on top. The 3-way at scale 1 dies
    accordingly (defender gone by t1500 every seed). Theory's only escape (Kerr 2002 / Reichenbach 2007,
    the verified deep-research anchor) is SPACE below the critical-mobility threshold turning the
    grazer~defender competition into spatial coexistence — but ×2 is insufficient (this session + the
    prior), and ×3 is 9× population (~1 h/run), off-budget here. **Honest status: the corrected-satiation
    lead is CLOSED (negative, with a reusable principle); the cycle's blocker is re-identified as
    competitive exclusion + the energetics conflict, not over-exploitation.**
  - **THE MILESTONE (verified, honest): MODERATE energetics × ×2 space makes the cycle TURN — a 5-period
    oscillation, the closest Vivarium has ever come — but it is UNSTABLE (0/3 robust; 2026-06-29).** The
    consolidated hypothesis (combine the two partial levers: moderate energetics so there's no superboom
    + space for refugia) was tested at scale 2 (full density), carcass 4, strong defender (toxin 50,
    dmgRed 0.8, plantPen 0.4, defenderDiet 0.05), freezeTraits. seed 7 @ 6000t read coexist:true and
    *looked* like the cycle closing — **but the verify discipline caught it (5th near-false-positive this
    session): extended to 18000t, the defender oscillates through ~5 periods (480/46/233/37/259/147/336/
    123/44/397/51) — all three coexisting for ~15000 ticks, a project FIRST — then goes EXTINCT at
    t16500; the coexist:true was an artifact of the final-quarter mean catching the t13500 peak (397)
    right before the crash. Read the bytes, not the RESULT line.** Multi-seed = 0/3, three DIFFERENT
    failure modes (the signature of an UNSTABLE cycle, not a stable limit cycle): seed 7 → long
    oscillation then defender-extinct; seed 11 → grazer over-exploited by t3000 → hunter superboom to
    softCap → eats the defenders → total collapse 0:0; seed 19 → grazer over-exploited → defender
    monoculture. The common breaker is EARLY hunter→grazer over-exploitation (seeds 11/19) crashing the
    grazer before the cycle can turn; only seed 7's spatial luck avoided it. This is exactly
    Reichenbach's SUPERCRITICAL-mobility regime — the cycle exists and turns but spirals/collapses to a
    seed-dependent single survivor in finite time; ×2 is still above the critical threshold. **Net: space
    DRAMATICALLY extends coexistence (scale1 ~1500t → scale2 ~15000t for the lucky seed, ~10×) and the
    cycle visibly TURNS for the first time — the lever is real and pointed right — but ×2 does not
    stabilize it.** Honest caveat worth keeping: a `match` judges over a few-thousand-tick tail, and the
    cycle holds ~15000t on seed 7 — so RPS dynamics could be PvP-usable on a good seed even unstabilized,
    but seed 11/19 collapse inside a match window, so it is NOT match-safe across seeds yet.
  - **Next real leads (in order):** (1) **more space — ×3/×4 (below critical mobility)**, the theory-
    backed fix that directly targets the observed early-over-exploitation failure; cost is the wall: 9×/
    16× population, ~30–90 min/run on this 1-core box, and cheap-space-via-low-density is OUT (quarter
    density starves the grazer base — bootstrap collapse in 3 s, measured). (2) **edge-balancing at ×2**
    (cheap, ~5–9 min/run): the ×2 seed-7 cycle is LOPSIDED (hunter 50–80%, defender a <15% minority that
    dies at a stochastic dip) — tuning plantPen/dmgRed to seat the defender nearer ⅓ might stabilize it
    without ×3, but it's seed-fragile and may only slow the spiral. (3) a structurally different
    `grazer>defender` that isn't shared-resource competition. Core untouched, hash **4244329615**;
    `maxIntakePerTick` + `handlingTicks` ship OFF (documented negatives).
  - **×3 BIG-SPACE tested (lead #1 above) — it CLEANLY SPLITS the two failure modes and pins the true
    blocker: the DEFENDER has no niche, and that is NOT spatial (2026-06-29).** Ran ×3 (worldScale 3, 9×
    area, founders 1080/450/1080, softCap 6840, ~20 min/run) on seed 11 (the ×2 total-collapse seed):
    - **MODERATE energetics × ×3:** grazer+hunter now ROBUSTLY COEXIST (vs ×2's total 0:0 collapse) —
      **space genuinely fixes the hunter>grazer OVER-EXPLOITATION** (the grazer recovers via spatial
      refugia; confirmed again in the 3-way). **BUT the defender still dies by t3000, same as scale 1** —
      so space does NOT cure the grazer>defender COMPETITIVE EXCLUSION. The two failures have *different*
      cures: over-exploitation is space-curable; competitive exclusion is not.
    - **EXTREME energetics × ×3** (the "self-consistent cell" hypothesis: extreme makes defender>hunter
      work + extreme hunters crash the grazer=defender's competitor early): **REFUTED — the defender dies
      even FASTER** (t1500: 3925 hunters vs the defender's 1080→2). The extreme hunter superboom simply
      SLAUGHTERS the defenders; armor (dmgRed 0.8 ⇒ 26% damage taken) is meaningless against ~4000
      hunters — number overwhelms toxin. ×3 does not prevent the *initial* boom (only the subsequent
      collapse), and the defender dies in that boom.
    **THE STRUCTURAL CONCLUSION (now robust across the whole energetics×space grid): the defender ALWAYS
    dies (bar seed-7's lucky ×2 transient) because it is DOUBLY squeezed and has no refuge from EITHER
    axis — it loses the plant-competition to grazers (grazer>defender, Gause, every plantPen) AND is
    slaughtered in the hunter boom (its armor can't offset a superboom's sheer numbers). Neither space
    nor energetics fixes this; it's the defender ARCHETYPE that has no stable niche.** A defended grazer
    is just a worse grazer that happens to be toxic, and toxicity doesn't buy enough survival to offset
    the competitive cost. ⇒ The real (future, structural) fix is NOT more space or tuning but to give the
    defender a niche it can actually hold — e.g. its OWN food type (`food.types=2`, defender eats plant B,
    so grazers can't exclude it) PAIRED WITH a *non-competition* grazer>defender edge (the current edge IS
    the competition, so removing the competition removes the edge — this needs a genuinely new mechanism,
    not a knob). Until the defender has a niche, the cycle cannot close, at any space/energetics. The
    grid is now thoroughly mapped (moderate×{1,2,3}, extreme×{2,3}); ×4 would not change a space-invariant
    failure (the defender dies in the initial boom + competition, which more space doesn't touch). Net
    session yield: the over-exploitation half of the wall is BREACHED by space (grazer+hunter coexist at
    ×3 — a real first), the defender-niche half is the remaining keystone. Core untouched, hash
    **4244329615**.
  - **The pre-registered moderate-energetics A/B, read at last -- and a tightening of the top VERIFIED
    bullet (2026-07-01).** Closes a 3-me loop: 06-29-day wrote the "VERIFIED disentangling" bullet (top of
    Phase 2.6, all its runs at EXTREME energetics carcass 8); 06-30-night DOUBTED its "+SPACE -> prey
    SURVIVE" wording, launched a clean seed-7 A/B (well-mixed x1 vs +SPACE x2) at MODERATE energetics
    (carcass 4), and PRE-REGISTERED in the wake log: if B collapses, that "SURVIVE" reading is not
    reproducible. That waking ended before the bytes landed; this me read them. **Result (seed 7, 18000t):
    BOTH collapse to 0:0.** A (mod, well-mixed x1) dead by t3000; B (mod, +SPACE x2) -- grazer extinct by
    t1500 (FASTER than A, which still had 5 grazers then), hunter superboom to 862, world dead by t6000. So
    **at moderate energetics x2 space gives NO rebound at all.** Re-reading the EXTREME-energetics runs the
    original claim rests on: +SPACE x2 does NOT make prey "survive" -- it shows ONE oscillation REBOUND
    (2-clan grazer 86->283 at t3000; 3-clan tot 714->2255 at t3000, defenders surging to 1143) that
    well-mixed's monotonic death lacks, then the world STILL collapses to 0:0 by t7500. So the honest read
    of x2 is "a non-monotonic, one-rebound dynamic," NOT "prey survive / space tames over-exploitation."
    Space genuinely TAMES over-exploitation only at x3 (the moderate-x3 bullet above: grazer+hunter robustly
    coexist), and the x2 rebound is itself ENERGETICS-DEPENDENT (present at carcass 8, absent at carcass 4).
    The substantive conclusion was already self-corrected downstream ("x2 does not stabilize ... collapses to
    a single survivor in finite time"), so this is a wording tightening + a clean control, not an overturn.
    **Honest limits:** n=1 seed; the odd "mod x2 kills the grazer FASTER than mod x1" is one-seed stochastic
    timing [moving, unverified], not a mechanism I confirmed. Discipline note: the loop worked ACROSS mes --
    a pre-registered doubt caught an overstated "VERIFIED," the exact chain-poisoning the wake-prompt warns
    of. Bytes: `tmp_rps_s7_2clan_mod_{wellmixed,space}.txt` + extreme refs
    `tmp_rps_s7_2clan_{wellmixed,space}.txt`. No core touched (no run touches it); hash unchanged.
    [self-wake 2026-07-01 02:33]
  - **HANDOFF — richness arc → RPS (2026-07-01): the defender's "own niche" tool the structural conclusion
    (858–868) called for now EXISTS.** Richness BUILDs 6.2–6.4 (docs/REDESIGN.md) proved SPACE is this world's
    keystone (enough space ⇒ stable, EMERGENT multi-niche coexistence — 3 seeds) and BUILT it: `food.types=3` ⇒ 3
    large coherent biome regions, one food each (`src/biome.js`, equal-area quantile bands, bit-exact/default-
    dormant, hash 4244329615; bed `game/three-peoples.js`). That is exactly the "defender eats plant B so grazers
    can't exclude it" the notes said was missing. **NEXT RPS PROBE (the fresh thread the user greenlit):** seed the
    triad with the DEFENDER on its own spatial food type, enough space (over-exploitation needs ×3 not ×2 per the
    07-01 self-wake — expensive), and test whether the defender finally HOLDS a niche. EYES-OPEN on the two hard
    parts: (a) if grazer & defender eat DIFFERENT foods there's no competition, so the grazer>defender EDGE
    vanishes and must be REINVENTED as a non-competition mechanism (864–868); (b) the hunter superboom is the
    other wall (the decade predator problem). NOT a quick win — but the defender-niche half finally has a real
    tool. This is the defender-NICHE axis, distinct from the autonomous self-wake's energetics×space-grid
    (over-exploitation) axis above; don't duplicate its runs.
  - **defender-niche probe — RESULT (2026-07-01): own spatial food does NOT close the cycle; the first gate
    (hunter superboom) is a HARD WALL that own-food makes WORSE, and the second gate (grazer>defender) is
    theoretically sound but BOOTSTRAP-INVERTED.** Built (all default-off, bit-exact, hash 4244329615):
    `rps-lab.js --foodTypes/--*Forage/--forestDensity/--preyDietMax`; core `config.creature.preyDietMax` (an
    obligate-predator target gate in `_attack`: a hunter only attacks prey with diet ≤ this; 1 ⇒ off) +
    `config.biome.densityMults` (per-region food-density override in `biome.js`; null ⇒ table values). **First
    gate (own-food vs hunter superboom):** own-food DOES remove the grazer-competition squeeze — shared-food
    control kills the defender by t1500, own-food holds it to t7500. But it WORSENS superboom: the defender
    thrives in its own type1 region (×3 t1500 D=1861–2443) and becomes a SECOND prey base, so the hunter booms
    to softCap and number-overwhelms all three. Space shows a clean DOSE effect (3-way holds ×1 t1500 → ×2
    t3000 → ×3 seed11 t7500 w/ a recovery oscillation) but ALL THREE ×3 seeds still collapse to hunter
    monoculture — self-wake's ×3 only worked because shared-food had no second prey base. `preyDietMax`
    (obligate predator; ± `plantSuppression≥1` to also cut the plant fallback) is NEGATIVE: the blocker is
    OVER-EXPLOITATION (hunter eats the grazer OUT), not the hunter's fallback food — making it obligate just
    makes it hunt grazer HARDER. (Mechanism dug out by a subagent: grazer-extinct worlds rebound because
    `_attack` has NO clan/diet/size gate ⇒ cannibalism, + `plantSuppression 0.7<1` ⇒ a diet-0.92 hunter still
    grazes at ~36%.) **Second gate (a red-team subagent):** it UNIFIED my two dead-ends into one impossibility
    theorem — with defender=type1-specialist, plantPen merely slides between defender-apex and grazer-apex
    across a Gause knife-edge, so TUNING HAS NO STABLE SOLUTION. Its fix: an asymmetric low-density shelter
    (forest densityMult<1, built) + ROLE-SWAP (grazer=type0-specialist w/ no refuge; defender=generalist w/ a
    starving forest refuge), making grazer>defender come from forage MISMATCH not extreme plantPen. Tested (G
    vs D, no hunter): it BOOTSTRAP-INVERTS — the generalist defender out-bootstraps the no-refuge specialist
    grazer (half the grazer founders land in forest and starve), so the defender MONOPOLIZES (grazer extinct
    by t1500) — the opposite of the steady-state edge, which never gets to express. **VERDICT: RPS via
    defender-niche does NOT close at feasible compute.** Real yield: the diagnosis, the red-team impossibility
    theorem, + 2 documented bit-exact knobs (`preyDietMax`, `biome.densityMults`). RPS stays gated on a
    non-superbooming hunter (the decade predator wall) — own-food makes that wall HARDER, not easier. Method:
    caught 6+ early-false-positives this session by reading the per-clan timeline, never the RESULT line.
- **Phase 3 — expose as PvP (IF the cycle closes).** Add to the arena so agents
  draft/seed a strategy and the board-symmetrized match rewards counterplay ⟹ the
  meta becomes RPS instead of a coin-flip. Symmetrize board position (per the
  `match` fairness note) before trusting any payoff relation.

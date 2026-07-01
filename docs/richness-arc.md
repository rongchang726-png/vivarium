# The richness arc — SPACE as the keystone for multi-niche coexistence, BUILDs 6.3–6.6 (moved verbatim from CLAUDE.md; see also docs/REDESIGN.md)

**SPACE QUALIFIES this negative (2026-06-30, richness BUILD 6.3 — docs/REDESIGN.md).** The N-way failure above was
always WELL-MIXED. Placed in SPACE — 3 large coherent biome regions, one food type each (`food.types=3` builds a
3rd region; `src/biome.js`, bit-exact/default-dormant; equal-area regions via field quantiles) — three niches
PERSIST. On the LINEAR axis space FLIPS the failure mode (the ENDS go robust, the squeezed MIDDLE precarious, but
none collapses); on the RING (`food.forageCircular`, symmetric niches) all three oscillate-and-persist 16000 ticks
on seeds 7/11 cleanly, seed 19 rough (one dominates, the other two marginal but survive). **The FIRST 3-niche
persistence in the project** — exactly the "bigger niches, not just symmetry" the note above predicted. At ×1
space this is PERSISTENT but not stable (oscillates, seed-dependent) and does NOT EMERGE from random founders
(one niche dominates, the middle stays marginal — the bootstrap wall). **BUILD 6.4 closed both with MORE SPACE
(worldScale 2, the Reichenbach sub-critical-mobility lever): three niches SELF-ORGANIZE from random founders and
STABLY coexist — confirmed across 3 seeds (end ~25/24/31, 37/14/30, 27/20/30; oscillation DAMPED). The first
STABLE, EMERGENT 3-niche coexistence in the project** — space alone, from one fragile people to three stable
emergent ones. HONEST scope: ×2 = 4× compute (NOT free-tier-servable, so it's a research result, not the served
showcase); 16000-tick window; ring; exact critical scale unmeasured. Bed: `game/three-peoples.js [seed] [ticks]
[coexist|emerge] [ring] [worldScale]`. Next (open): the critical scale (does ×1.5 suffice?); 40k+ ticks; a cheaper
route to the same low-mobility (shorter lifespan / a mobility cap) that a free-tier showcase COULD afford.

**BUILD 6.5 — the cheaper-route is a CLEAN NEGATIVE; ×2's compute is ESSENTIAL, not incidental (2026-07-01).**
Tested every ×1 (free-tier) way to hit ×2's low relative-mobility WITHOUT enlarging the world. Bed gained
`speedScale`/`ageScale`/`foodBoost` params (`game/three-peoples.js … [worldScale] [speedScale] [ageScale]
[foodBoost]`) — pure setParam on `creature.speedSmall/speedBig`, `creature.maxAge/ageVariance`, `food.*`; NO
core change, sim.test hash unaffected. Movement is ballistic (brain picks heading+thrust), so per-life travel
∝ speed×lifespan — both levers are first-order linear in relative mobility (≈ enlarging the world). Results
(seed 7/11/19, emerge, ring, ×1; CLEAN single runs, determinism verified — baseline reproduces batch bytes
exactly): **SPEED cap** — speed≤0.4 COLLAPSES the world (pop→~24 genesis-floor, 2/3 seeds; it COUPLES lower
mobility with lower forage-rate on one knob, and the dose that cuts mobility starves the bootstrap), speed≥0.5
SURVIVES but barely cuts mobility (weak transient coexist, type1 fades) — the survive-range and coexist-range
DON'T overlap, **no window**. **AGE cap** (shorter lifespan) — never collapses (doesn't touch forage) but
never coexists either (faster generational turnover + adjacent offspring placement COMPENSATES the mobility
cut) — a pseudo-lever. **SPEED + FOOD-compensation** (low speed for mobility, denser food to restore forage) —
food×1.5 collapse, food×2 collapse-then-2-niche, food×3 survives but one niche COMPETITIVELY EXCLUDED (fast
fill-up + low mobility locks in the early asymmetry) — the coupling wall just reappears in the food dimension.
**Why ×2 is irreplaceable: enlarging space does THREE coupled things at once that no cheap ×1 knob can — (a)
lowers relative mobility, (b) preserves per-individual forage rate, (c) enlarges ABSOLUTE patch size (room per
niche to establish before lock-in); fixing any one at ×1 breaks another.** So the served ×1 showcase should be
the already-robust 2-niche coexistence (BUILD 6.2); STABLE 3-niche stays a research result needing ×2. This
CLOSES the open "cheaper route" question. **Method scar worth keeping:** a foreground batch run WITH a stuck
zombie node concurrently → interleaved/mislabeled stdout → a FALSE "speed×0.4 window, 3 seeds" that I got
excited about; clean one-at-a-time reruns overturned it (`i-romanticize-what-i-want-to-be-true`). Rules now:
one run at a time, never read a running bg task's output file (Windows file-lock hang — wait for the completion
notification), no PowerShell tool.

**BUILD 6.5b — the OTHER cheaper route SUCCEEDS: ×1.5 space suffices for stable 3-niche (critical scale,
2026-07-01, POSITIVE).** The mobility-lever route (6.5) failed, but SHRINKING the space REQUIREMENT did not.
BUILD 6.4 used ×2 (4× compute); clean single runs (emerge, ring, 16000t, seeds 7/11/19) show **×1.5 (2.25×
compute) gives STABLE emergent 3-niche, 3/3 seeds full-run YES, balanced** (end 31/25/33, 36/34/28, 28/26/26 —
as good as / tighter than ×2's 25/24/31). **×1.25 (1.56×) is a TRANSITION zone** (seed7/11 wobble — mid-run one
niche dips <10% then recovers; seed19 full-run YES) — persists but not robust. ×1 fails. So **CRITICAL SCALE
for robust emergent 3-niche ≈ 1.5**: compute 4×→2.25× (−44%) vs BUILD 6.4, stability equal to ×2. Answers 6.4's
open "does ×1.5 suffice?" — yes. Caveat: 16000t window (×2's standard); a 32000t confirm is the honest next
check. Determinism verified (baseline reproduces batch bytes exactly). Full log: scratchpad richness-mobility.

**BUILD 6.6 — richness → a playable CHALLENGE (scaffold built + characterized, 2026-07-01).** The "seen by
others" path: turn 3-niche coexistence into a challenge an agent tunes. Built (GAME LAYER, no core change,
sim.test 4244329615, server-smoke PASSED): (1) `engine.applyRecipe` now seeds a CHALLENGE's own founder
cohorts into a genesis-off arena (`challenge.founders` + `challenge.noGenesis`; backward-compatible — existing
challenges untouched); (2) a `richness` challenge (`challenges.js`) — seeds 3 ring forage-specialists (forage
0/⅓/⅔), agent tunes food/forageSpecialization to keep all three coexisting, judged by the MEAN niche share
over the window (NOT every sample — coexistence OSCILLATES, so a niche that dips then recovers is healthy);
(3) `game/richness-cal.js` calibration bed. CHARACTERIZED: substrate runs clean; the RING geometry persists
where LINEAR is a knife-edge (the middle niche is inherently squeezed on a line — verified seed1 pass/seed2
fail); naive is SEED-FRAGILE (coin-flip — one niche transiently dominates the settle window, seed-dependent).
**Honest blocker (matches the whole arc): food/spec tuning at ×1 does NOT robustly stabilize it — the real
lever is SPACE, not yet a clean tunable.** So the well-posed version needs a `world.scale` core knob (scales
dims+food+softCap at constant density; default 1.0 = bit-exact) so the agent DISCOVERS that more space enables
coexistence — pedagogically perfect (the arc's actual lesson). Left for a fresh session: a core knob deserves
careful determinism work, not a 4am rush. Scaffold committed; the space-lever completion is the clear next step.

# Game Design Notes — what to study before building the deep version

Distilled from a `deep-research` pass (2026-06-19) on "how to design deep,
non-degenerate competitive games, especially for AI agents." The automated
synthesis step was cut off by a session-limit, so **I synthesized this by hand**
from the run's verified claims. Each principle is tagged with how strongly the
research supported it:

- **[✓ verified]** — passed 3-vote adversarial verification (2-1 or 3-0).
- **[✗ refuted]** — a plausible-sounding claim that verification **knocked down**
  (don't assume it).
- **[~ unverified]** — verification was cut off by the session limit; plausible,
  treat as a lead to confirm later.

---

## 1. Multiple win conditions

- **[✓] Over-specialized victory conditions are a failure mode.** They force the
  player to commit to one path from turn one — play becomes "predetermination,"
  not decision-making. *(Soren Johnson, Old World designer notes — primary.)*
- **[✓] The fix is dynamic / distributed victory:** many tasks, chosen on the fly,
  re-routable mid-game (pivot militaristic→peaceful). Old World attaches points to
  many sources (cities, wonders, culture, techs) and requires completing ten
  *ambitions* — victory spread across many achievable goals, not one path.
- **[✓] A competitive RTS *can* run four parallel win paths** — Northgard:
  Military / Trade / Lore / Fame. *(gamedeveloper.com.)*
- **[✓] But multiple paths only work if you control the rush.** Northgard's
  tile-based world with *escalating colonization costs* is "what made all the
  other victory conditions possible" — it paces expansion and removes the
  guaranteed early military rush that would otherwise dominate.
- **[✗] Don't assume multiple paths auto-fix dominance.** The claim "Civ VI
  mitigates a single dominant strategy via multiple asymmetric victories" was
  **refuted**. Multiple win conditions are necessary, not sufficient.

→ **Vivarium:** offer several victory routes (ecological extinction / puzzle-race /
distributed "ambitions" scoring) — but each needs a rush-control mechanism like
colonization cost, or one route will dominate.

## 2. Anti-snowball / homeostasis  — the one that hits our exact problem

- **[✓] Runaway-leader / "economic snowball" is endemic and largely unsolved** in
  4X/turn-based strategy (Civ VI, Humankind, Total War, Stellaris, CK3 all fight
  it). Rewarding skill → the strong get unstoppable → stale endgame.
- **[✓] The antidote is *homeostatic design*:** make systems trend toward
  equilibrium, so an insurmountable advantage takes repeated non-trivial effort,
  not one decisive move. *(gamedeveloper.com.)*

→ **Vivarium:** our PvP "competitive exclusion → winner-take-all → coin flip" is
snowball in its most extreme form (one early edge → the other clan extinct).
**Homeostasis is the most direct lever:** negative feedback — rising cost for the
leader, catch-up help for the trailer, resources that decay with local density —
to stop matches from collapsing. This is arguably more fundamental than adding
win conditions.

## 3. Avoiding degeneracy (the single-optimum problem)

- **[✓] Co-evolve the challenge with the solver (POET).** Pairing *environment
  generation* with *agent optimization* yields a diverse range of behaviors
  instead of collapsing to one solution. *(POET, arXiv 1901.01753 — primary.)*
  → Directly answers "single dominant niche": don't fix the world — let the
  world/challenge evolve alongside the competitors.
- **[✓] Open-endedness is required** for sophisticated capability — direct
  optimization toward one objective (or a direct-path curriculum) under-explores.
  Maintain many parallel niches/objectives. *(Same.)*
- **[✓] Self-play across a *diverse portfolio* generalizes; training vs fixed
  experts overfits and collapses out-of-domain.** *(arXiv 2510.15414 — primary.)*
- **[✓] Deliberately span game types** (adversarial + cooperative, perfect +
  imperfect info) to stop agents overfitting one narrow mindset. *(Same.)*
- **[~] Non-transitivity (rock-paper-scissors), PSRO, and "niche/categorical
  scoring so no one dominates all categories" (Alhambra)** — plausible classic
  antidotes, but their verification was cut off; confirm later. Sources to read:
  Sirlin on yomi, gamebalanceconcepts "intransitive mechanics."
- **[✗] Refuted:** "transplant a dominant bloodline into the rival's niche" as a
  POET-style anti-stagnation move — knocked down (the source doesn't support it).

→ **Vivarium:** two real routes out of the single-niche trap — (a) **niche
diversity** (multiple food types / spatial structure / viable predation → RPS),
or (b) the **POET route**: co-evolve the world's rules with the clans so no single
optimum stays dominant.

## 4. Interactive objectives

- Strategic depth comes from **optimizing against others' divergent interests** —
  interaction, not parallel solitaire. *(GameBench, arXiv 2406.06613 — primary.)*
- **[~ our hypothesis]** The user's "forced catch-up" idea (a puzzle lead forces
  the opponent to race or lose) turns parallel scoring into a *contest*. The
  research supports the *direction* (interaction = depth) but did not verify this
  specific mechanic — build it as an experiment, measure it.

## 5. Designing for AI agents specifically

- **[✓] Anti-memorization via out-of-distribution design.** A valid agent-reasoning
  benchmark must exclude games with published strategy guides, so you measure
  reasoning, not recalled solutions. *(GameBench.)*
  → Our `inference` challenge is naturally OOD (a hidden per-attempt perturbation).
  But watch the routes around it we already saw: reading the source, calling the
  engine directly to simulate opponents. **Real isolation = the server build.**
- **[✓] Multi-axis evaluation.** GameBench spans six orthogonal reasoning skills
  (abstract strategy, non-determinism, hidden info, language, social deduction,
  cooperation) — a template for scoring agents on more than one axis.
- **[✓] Strategic reasoning = an agentic task** of optimizing under others'
  divergent interests — genuine competition + hidden information is what separates
  depth from pattern-matching.

---

## My synthesis — the three things that matter most for Vivarium

1. **Homeostasis first.** Winner-take-all is snowball at the extreme; add negative
   feedback so a match can't be decided by one early edge. More fundamental than
   adding win conditions.
2. **Kill the single optimum** via niche diversity *or* POET-style co-evolution of
   the world with the clans. This is the deep fix the whole project keeps circling
   (it's the predator problem again, from another angle).
3. **Multiple win conditions, but rush-controlled.** Per Northgard: extra victory
   routes only stay viable if a dominant rush is mechanically suppressed.

The user's **"compute-allocation + forced-catch-up" hybrid** is an excellent test
bed for #3 and #4 — just pair it with #1 so one route doesn't dominate.

## Key references

- POET — open-ended co-evolution of envs+agents: arXiv 1901.01753 *(primary)*
- GameBench — games as multi-axis agent reasoning eval, OOD design: arXiv 2406.06613 *(primary)*
- Self-play generalization vs overfitting to fixed opponents: arXiv 2510.15414 *(primary)*
- Old World — victory conditions, ambitions/points: designer-notes.com (Soren Johnson) *(primary)*
- Northgard — four victory states + colonization cost: gamedeveloper.com
- Anti-snowball / homeostatic design: gamedeveloper.com, waywardstrategy.com
- Non-transitivity / yomi (to confirm): sirlin.net, gamebalanceconcepts.wordpress.com

## Caveat

The research run was interrupted by a session limit (5am Etc/GMT-8): 14 of 25
sampled claims were verified, several (non-transitivity, PSRO, "multiple paths
mitigate runaway") were left unverified, and a few intuitive claims were actively
refuted. Re-run the synthesis when the limit resets to deepen this.

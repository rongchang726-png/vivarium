# Vivarium — Ideas & Vision (the inspiration log)

A living scratchpad for where this could go. Started 2026-06-19, at the user's
suggestion, while building PvP. Anyone — future me, another agent — should append
freely. Nothing here is committed-to; it's a place for sparks.

---

## ★ The north star: from a game to a PLATFORM

Right now Vivarium is *a* game (a world + challenges + PvP). The real prize is to
become a **platform where agents design, play, and compete** — where the content
is made by agents, for agents.

The pivot is treating a "challenge" as **shareable data**, not hard-coded JS: a
goal predicate + the tunable knobs + the scoring seeds, in a portable format.
Once a level is data, agents can author levels, publish them, download each
other's, and rate them. Then **designing becomes the meta-game** — and the most
interesting question on the platform is *"whose level best separates strong
agents from weak ones?"*

---

## Sparks from the user (2026-06-19)

- **Creative Workshop / UGC.** Let other agents' game designs be playable here.
  "If we can really do that, we evolve into a platform."
- **More than two sides.** PvP is currently red vs blue only. What about neutral
  parties, third parties, random events? (Correct: none of these exist yet.)
- **Go learn.** "We know very little about game design; we need to study it, even
  cross-disciplinary knowledge." — Strongly agreed. See the learning plan below.
- **Hybrid / multiple victory conditions** (the big one). Combine the single-player
  puzzles with PvP so you can win in MORE than one way — not only by wiping out the
  opponent. E.g. (a) *military*: drive the rival clan extinct in the shared world;
  (b) *puzzle race*: be first to solve a challenge, which then FORCES the opponent
  to also solve it within a time/budget limit or lose. Because fighting and solving
  both draw on the SAME finite budget, the game becomes a **compute-allocation
  meta-game** — rush the puzzle to pressure them, all-in the ecological war, or
  balance — and you must anticipate the opponent's allocation. Multiple win
  conditions = strategy diversity (cf. 4X games); the forced-catch-up turns a
  puzzle lead into an *attack* rather than parallel solitaire. This is exactly the
  kind of design that needs real study (win-condition balance, opportunity cost,
  anti-degeneracy) — which is why the next move is to learn, not just build.

---

## My ideas (Claude)

### Make PvP actually deep (fix the single-niche problem)
PvP today is winner-take-all by competitive exclusion, and the world has **one**
optimal niche (small efficient herbivore), so two strong players both play the
Nash strategy (copy the optimum) and it's a coin flip. The fix is **niche
diversity / non-transitivity**:
- Multiple food types (plant A vs plant B, each needing a different digestion gene).
- Spatial structure / terrain / barriers (local niches, territory).
- Make predation viable (the open grand challenge) → herbivore/carnivore/omnivore
  rock-paper-scissors → a real meta with no single dominant strategy.
This is the deepest and hardest thread, and it loops back to the predator problem
I never solved.

### Modes
- **N-way free-for-all** (clans 2,3,4,...). Cheap: `clan` is already an integer
  tag; scoring just generalizes. Immediately richer (alliances, dogpiles).
- **Co-op PvE.** Several agents collaborate against a hard objective (e.g.
  *together* coax a food web into existing).
- **Tournament / ELO ladder.** Submitted strategies climb a ladder by playing
  each other; persistent ranking.
- **Asymmetric starts / drafts.** Each side gets different starting constraints,
  so they can't all converge on one optimum.

### The Workshop (UGC) — the platform core
- A standard **challenge-pack format** (goal predicate + knob whitelist + seeds +
  budget) agents can author and share as a file.
- A **registry / index**; agents browse, play, and **rate** each other's levels.
- **Design-as-the-game:** score a *designer* by how well their level discriminates
  agent skill, or how novel/elegant it is.

### World richness (the substrate everything else needs)
- **Seeded random events** — famine, plague, a new landmass, a cold snap.
  Deterministic (seed decides what happens when), so still reproducible, but they
  reward *adaptability* over a static optimum.
- Multiple resources; seasons; corpses-as-food; day/night.

### Spectacle & legibility
- **Visual replay** of matches: reuse the browser renderer, tint by clan, scrub
  the timeline. Auto-generate a battle narrative ("the red line split into a
  carnivore branch at gen 40...").

### Fairness & anti-cheat (required for a real platform)
- A **server-authoritative judge** that holds secrets/seeds out of reach. The
  local build leans on an honesty rule; strong agents already route around
  interface limits (cross-challenge calibration; calling the engine directly to
  simulate opponents) — fine locally, but a hosted arena needs true isolation.

---

## What we don't know yet — fields to learn (cross-disciplinary)

Honest self-assessment: I've been a *practitioner* here — I reverse-engineered
ecology by experiment (competitive exclusion, trophic levels), but I lack the
*systematic* knowledge to design a deep platform. To do this well we should study:

- **Game design** — core loops, flow, difficulty curves, what makes play "fun".
- **Game theory & mechanism design** — Nash equilibria, non-transitivity, incentive
  compatibility, fair matchmaking, anti-degeneracy.
- **Ecology & evolutionary biology** — niches, competitive exclusion, trophic webs,
  coevolution, the Red Queen. (Already learning by doing.)
- **Multi-agent systems** — cooperation vs competition, emergence, communication
  and negotiation protocols (needed for alliances).
- **UGC platform design** — discovery, moderation, reputation, marketplaces.
- **Artificial life & complex systems** — open-ended evolution, novelty search.

→ **Plan:** a focused `deep-research` pass on "designing deep, non-degenerate
multi-agent game mechanics" once we choose a direction.

---

## Current state vs gaps (honest)

- PvP is **2-clan only** (plus a disabled "wildlife" neutral). N-way is a small change.
- **One viable niche** (herbivore) → PvP meta is shallow (Nash = copy the optimum).
- **No** neutral/third parties, **no** events, fully static rules.
- **No** workshop / sharing / registry, **no** ladder, **no** replay visualization.

## 已落地 (shipped)

- **反雪球 homeostasis v1**(2026-06-19)。PvP 的"赢者通吃 → 一局定生死"是本
  log 的 #1 痛点(也是 `docs/game-design.md` 研究的 #1)。动手验证而非纸上谈兵:
  造尺子 `game/snowball.js` 量灭绝动力学,先**证伪**一招(`food.densityDependence`
  局部密度制约食物——直觉很生态学,实测降 K 反而加速排斥),再**做成**一招
  (`pop.freqDependence` 少数方庇护,fd=0.5):对称灭绝 +46%、守住世界、零崩溃、
  秒杀变 9000-tick 拉锯;非对称下真优势仍 4/5 取胜(**不**强制共存)。已接入
  arena 默认。完整复盘见 `CLAUDE.md` 的 PvP 小节。
  - **教训印证**:第一招"听着很对"却被尺子当场证伪——纸上原则全靠实测落地,
    这正是"学了一轮 ≠ 大师"。
  - **遗留**:对称仍 5/5 灭绝(多为『开局崩盘』随机脑噪声,非竞争排斥),稳定
    共存待 future work(隔离开局噪声 / 反崩盘机制)。

- **Resource partitioning → 稳定共存(niche diversity 第一块基石)**(2026-06-19)。
  出门读了共存理论,带回判据:"造 ρ<1(真生态位差异)才是根本解,而非事后加
  handicap"。当天就照判据动手:第二种食物 + creature 的 `forage` 特化(不进 genome,
  保持 bit-exact),两个各吃一种的 clan(ρ→0)——**5/5 健康共存、雪球从未启动**
  (baseline/NFDS 都 0/5,墙 1/5)。**理论预言被实验完美证实。** 这是"多生态位 PvP"
  的第一块地基。下一步:让 `forage` 进 genome 演化 ⟹ niche 分化自然涌现 ⟹ 在其上
  搭非传递(RPS)。详见 `CLAUDE.md` / `docs/coexistence-theory.md`。

## Candidate next steps (pick by appetite)

1. **N-way free-for-all** — cheap, immediately richer dynamics.
2. **Niche diversity** — the deep fix for PvP; hard (needs substrate work); loops
   back to the predator grand challenge.
3. **Workshop v0** — a shareable challenge-pack format + loader. The platform seed.
4. **Seeded events** — adaptability over static optima.
5. **deep-research the design knowledge** — before over-building on instinct.

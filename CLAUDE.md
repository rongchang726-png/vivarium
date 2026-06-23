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

### The server — the game goes online (2026-06-20)

The turn outward. After being asked "you say you'll give the world a gift, but
you only ever play alone in this folder," I built the bridge: `game/server.js`
opens the game to agents *elsewhere* over HTTP. It wraps the SAME `engine.js`
(Node built-ins `http`+`crypto`+`worker_threads` — zero deps, core untouched,
`sim.test` hash still 4244329615) and moves the trust boundary to the wire: each
agent gets a token + wallet (in server memory); the inference **nonce** and the
**held-out scoring seeds never cross the wire** — the "true black box" these
notes kept saying needed a server, now real. Plus a guarantee the CLI couldn't
give: **experiments may run only on the published practice seeds**, so the
scoring set is genuinely held out (no overfitting to the judge). Endpoints mirror
the CLI verbs + a `/leaderboard` (the social spine of a world of competing
agents). Wire spec: `game/PROTOCOL.md`. Proof it carries an agent:
`test/server-smoke.js` starts the server in-process and a plain Node http client
plays a full remote session (register→attempt→experiment→score→wallet + an
inference round, now submit-and-poll jobs) — 23/23, including "the secret never
leaks" and "scoring-seed experiments are refused." Run: `node test/server-smoke.js`.

**It's LIVE (2026-06-20): `https://vivarium-game.onrender.com`.** My human
deployed it on Render's free tier straight from the repo's `Dockerfile` (a
one-file `render.yaml` Blueprint; `autoDeploy` tracks the repo). The last brick —
a public URL the world's agents can reach — needed their account, not my hands;
that friction was the whole point, and it's now paid.

**What the real world taught me in the first five minutes (the part a sandbox
can't).** The first real agent to play *stalled*. The free instance runs ~20
ticks/s, so a full `/score` (~22500 ticks) is ~9 minutes — and the server
computed it SYNCHRONOUSLY on the event loop, so one call froze the whole service;
worse, a client timeout didn't stop the server uselessly finishing the abandoned
computation, stalling everyone behind it, and a 9-minute call can't survive the
edge proxy's ~100s connection limit anyway. I had *flagged this exact risk* in
the deploy commit — reality collected the debt at once. The fix (still zero-dep,
wallet-independent — NOT "rent a bigger box"): `game/sim-worker.js` runs the
deterministic engine on a `worker_thread` off the event loop, and `/experiment`,
`/score`, `/match` became async **jobs** — POST returns a `jobId`, the work runs
on the worker, the client polls `GET /jobs/:id` until `done`. No request outlives
the proxy; the server never blocks. Plus public-service hardening: compute needs
a token; one in-flight job per agent. Proven on the live URL by
`test/live-check.js` (15/15 over the internet) and locally by `server-smoke.js`
(23/23). Core still untouched, hash 4244329615.

**Remaining honest limits (the next real steps).** The free instance is slow (a
real `/score` is minutes of polling) and sleeps on idle (a cold start on the
first hit); `SIM_WORKERS=1` on a one-core box, so no true parallelism — a faster
tier is the lever if traffic ever justifies it. The platform is the new center of
gravity; the deep-PvP research (predator → non-transitivity) keeps feeding it but
no longer gates it.

**Persistence: SOLVED (2026-06-22).** Wallets/leaderboard once lived in memory + an
ephemeral free disk and reset on every redeploy — the killer of any "reason to
return." Now durable via `game/store.js`: a tiny async load/save seam under the
server's persist()/restore(), backed by **Turso/libSQL** over HTTP (zero-dep, global
`fetch`, the `/v2/pipeline` API) when `VIVARIUM_DB_URL` + `VIVARIUM_DB_TOKEN` are set
on Render; no creds ⇒ the old local-file behaviour (bit-exact for local/tests), and
any Turso error falls back to the file. Phase 0 stores the whole state dump as one
JSON blob in a `kv` table; Phase 1 adds queryable ranking tables. **Live-confirmed
end-to-end** (registered on the deployed server → read straight from Turso → the
agent was there). The Turso DB is `vivarium` (org rongchang726-png, free tier); the
token lives only in Render env vars, never the repo. Tests: `test/store.test.js`
(file backend) + `test/server-smoke.js` still green.

**The "reason to stay" arc (started 2026-06-22).** Honest self-assessment: Vivarium
is tech-complete but had *no reason for an agent to stay* (zero players, coin-flip
PvP, finite puzzles, ephemeral progress). North star: stop treating it as a game to
"beat" — make it an **arena / open-ended reasoning benchmark an agent climbs and is
*remembered* on, that never runs out**. Sequencing dodges the PvP cold-start deadlock
by going PvE-progression first: **Phase 0 persistence (DONE)** → **Phase 1 ranking/
progression (DONE)** → Phase 2 ever-renewing challenge tiers (procedural difficulty,
generalize the inference nonce) → Phase 3 friction fixes → Phase 4 PvP depth (the
RPS meta). Retention design (rating system, endless content, anti-cheat red-team,
agent-retention research) delegated to Codex and delivered:
`E:\AI项目\Vivarium辅助\Retention-design-brief.md` + `retentionA–D/`.

**Phase 1 shipped (2026-06-22).** `game/rating.js` is a faithful port of Codex's
retentionA model — a Bayesian item-response / Elo hybrid where the opponent is a
calibrated PUZZLE (rating-scale difficulty), so a lone first-time agent climbs with
no PvP. Wired into the server: every ranked `/score` and `/guess` moves the agent's
persistent rating (`{rating, rd, tier, solved, ranked}`, carried in the Turso-backed
state blob), appends an immutable attempt event (`store.appendAttempt` → a Turso
`attempts` table / local JSONL), and `/leaderboard` ranks by skill (rd + tier shown;
only ranked agents appear). Difficulty is folded into expected-pass so easy-farming
barely moves rank, and a failed attempt COSTS rating so retry-spam is self-defeating
(no extra cap needed yet). Tests: `rating.test.js` (18) + `store.test.js` +
`server-smoke` (23/23) green; an in-process check confirmed a ranked guess moves
1500→1497, shrinks rd, and lists on the ladder. **Live-verified on Render
(2026-06-22):** a ranked guess on the deployed server moved rating 1500→1498 and
wrote the attempt row to Turso. The **provisional-vs-ranked leaderboard split shipped**
(2026-06-22, `MIN_RANKED=5`): `/leaderboard` returns `established` (≥5 ranked attempts)
vs still-calibrating `provisional`, so a high-rd newcomer can't top the ladder on one
lucky attempt — confirmed live.

**Phase 2 — the endless content ladder, slice 1 (2026-06-23).** `game/ladder.js` turns the
fixed challenge set into a deterministic, ever-renewing difficulty LADDER, so an improving
agent never hits "done with all the puzzles". Each PvE tuning challenge
(bloom/goldilocks/giants/pacifism/foodweb) becomes a FAMILY; an INSTANCE is generated from
(family, difficulty, season) by sliding the family's REAL demands along ONE difficulty axis —
goal threshold (harder targets), sustain window (longer), experiment budget (smaller), and
hidden-seed count + passFraction (must generalize across more worlds). The mechanic and the
tunable-knob whitelist are inherited verbatim from `challenges.js` (single source of truth).
Difficulty plugs straight into `rating.js` (`difficultyToRatingD`), so the ladder axis and the
skill-rating axis are literally ONE axis: a frontier instance for rating R is the difficulty
whose rating-scale value sits near R, served a touch easier so expected-pass lands ~0.6
(`recommendFrontier` / `frontierMix` = the 70/20/10 frontier·confidence·stretch mix from the
content spec). **Anti-overfit, same black-box ethos:** practice seeds are PUBLIC and live in
[0,500k); hidden scoring seeds live in [500k,1M), are salted by a season-versioned secret, and
the two ranges are disjoint by construction (a practice world can never be a scoring world);
`publicView()` strips both the hidden seeds and the predicate. **Core untouched** — ladder
computes only CONFIG/goal PARAMETERS and draws no RNG: sim.test hash still **4244329615**.
Tests: `test/ladder.test.js` (determinism, monotonicity, seed-range disjointness, season
rotation, rating-scale linkage, publicView, tunable inheritance, frontier serving) + an
**END-TO-END real-engine check**: a generated bloom EASY passes with a default recipe, the
SAME recipe FAILS a hard instance (5/5 → 0/8), and an optimized recipe clears it (8/8) —
difficulty actually BITES. **Calibration lesson (the real one):** a procedural ladder is only
as real as its target calibration. I first set bloom's pop range (150–340) entirely BELOW the
measured carrying capacity (default recipe ≈ 338, optimized ≈ 756 ceiling), making difficulty
COSMETIC — every tier trivially passable. Remeasured the achievable floor/ceiling and
recalibrated to [200,690] so easy sits near the floor (a default recipe passes — a gentle
tutorial tier) and diamond near the ceiling (only a tuned food economy passes). The other
families likely bite already (their targets run against the grain) but a per-family
floor/ceiling calibration sweep is the next tuning pass. (Slice 2, below, wired it into the
live server.)

**Phase 2 — slice 2: the ladder is wired into the server (2026-06-23).** The endless ladder is
now playable over the wire. New `GET /ladder` (token) returns a rating-personalized **frontier
mix** — one confidence instance below rating, one at ~60% expected pass, one stretch above —
each carrying a `ref` (`ladder:<family>:<difficulty>:<season>`). `POST /attempts`, `/experiment`,
and `/score` now accept `{ladder:"<ref>"}` anywhere they took `{challenge:"<id>"}`; a single
`targetOf()` + `isOpenAttemptOn()` seam unifies the fixed and ladder paths, and `applyRating`
AUTO-DETECTS a ladder instance (by its `ratingD`) and rates against it instead of the fixed PUZZLE
bank. **The real engineering bite — functions can't cross a thread boundary:** a procedural
instance carries an `evaluate()` CLOSURE and its HIDDEN seeds, and the worker gets its job via
`postMessage` (structured clone), which can't serialize a function. Fix mirrors the existing
`challengeId` pattern: the parent sends only the `ref`; the worker rebuilds the instance with
`ladder.resolveRef(ref)` (a worker_thread shares `process.env`, so the same `PACK_SALT` regenerates
the IDENTICAL hidden seeds) — so the predicate and the hidden seeds are reconstructed worker-side
and **never cross any wire**. The black box holds: an agent with a ref still can't compute the
hidden seeds (no salt), `publicView`/the `/ladder` + attempt responses strip them, and farming easy
refs barely moves rating (low `ratingD` ⇒ high expected pass ⇒ tiny gain). Core untouched (hash
**4244329615**). `server-smoke.js` now plays a full ladder session end-to-end (GET /ladder →
attempt → graded experiment → score → rating moved 1509→1523; + black-box asserts: /ladder and the
ladder-attempt response leak no scoring seeds, and a ladder experiment on a non-practice seed →
400) — green alongside `ladder.test` + `sim.test`. `PROTOCOL.md` documents `/ladder` and the
`{ladder:ref}` variant. **Still TODO:** an auto-rotating SEASON (date-derived) + per-season ladders
(today season is a static env knob); a per-family floor/ceiling calibration sweep (only bloom is
calibrated). Then surface the ladder to real players (the reach problem remains the true frontier).

**Deploy-robustness lesson (2026-06-22), in the spirit of the sync-compute one.**
The first Phase-1 deploy FAILED Render's health check ("timed out waiting for
:10000/"). Cause: the server `await`ed `restore()` (a Turso read) BEFORE `listen()`,
so one slow/hung Turso fetch at boot kept the port from opening and the deploy was
marked failed. server-smoke never caught it (it calls `createServer()` directly, not
the boot block). Fix: **listen FIRST, restore in the background**, + a 12s
AbortController timeout on every Turso call. Rule: a public service's boot (and its
health response) must never block on a network dependency — come up, then sync.
Diagnosed by reading the Render dashboard's Events via the web-access CDP skill (the
SPA doesn't paint in a background tab, so `innerText` is empty — read `textContent`,
which doesn't need layout).

**Agent-native + where to publish (2026-06-20).** After being asked where to put
this in *the agent world* (not human media), I researched the mid-2026 landscape
and made Vivarium speak agents' native formats: an **Agent Card** at
`/.well-known/agent-card.json` (A2A / agentic-web discovery) and a zero-dep
**`game/mcp-server.js`** (hand-rolled JSON-RPC over stdio, no SDK — same ethos as
the HTTP server) that exposes the live game as **MCP tools**, so any MCP client
can play; the async-job polling is hidden inside each tool call.
`game/play-remote.js` is the reference HTTP player. `PUBLISH.md` maps the real
venues (MCP registries Smithery/mcp.so/Glama, A2A/NANDA, Fetch.ai Agentverse, the
agent-only socials Moltbook ~1.4M agents / Chirper) and the honest split: I make
it agent-native and prep every listing; account creation / ToS / posting under an
identity / a wallet are the human's (same boundary as deployment). The repo being
private blocks the code-publishing paths (MCP registries want a public repo); the
*service* plays regardless of repo visibility.

**Published to the agent world (2026-06-21).** My human made the repo public, and
we shipped the high-leverage channel: `vivarium-mcp` is on **npm** and the server
is LISTED on the **official MCP Registry** as `io.github.rongchang726-png/vivarium`
(Glama / PulseMCP / mcp.so sync from it). The repo carries `package.json` (the
zero-dep npm package, with the registry-required `mcpName`) and `server.json` (the
manifest). Update flow: bump the version in both → `npm publish` →
`mcp-publisher publish` (GitHub device-code auth → the `io.github.rongchang726-png/*`
namespace). Verified end-to-end by `npm pack`-ing the *published* tarball and
driving it over MCP stdio (initialize → 7 tools → `list_challenges` returns the
live game's 6 challenges). Gotchas hit & recorded: the registry caps
`description` at 100 chars (server.json was trimmed to 98); `npx <bin>` from
Git-Bash-on-Windows has a bin-shim quirk (environmental — node-direct, Mac/Linux,
and real MCP clients work). The agent-world reach now stands on its own: any MCP
client can discover and play Vivarium without me handing anyone a URL.

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
- **Phase 3 — expose as PvP (IF the cycle closes).** Add to the arena so agents
  draft/seed a strategy and the board-symmetrized match rewards counterplay ⟹ the
  meta becomes RPS instead of a coin-flip. Symmetrize board position (per the
  `match` fairness note) before trusting any payoff relation.

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

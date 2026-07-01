# Platform history — the server, deploy, persistence, publishing + inference design note (moved verbatim from CLAUDE.md)

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
`{ladder:ref}` variant. **Still TODO:** per-family calibration (slice 3, below); inference
proceduralization; an auto-rotating SEASON; then surface the ladder to real players.

**Phase 2 — slice 3: per-family calibration + foodweb removed from the ladder (2026-06-23).** Ran
the floor/ceiling calibration sweep slice 1 flagged. For each family I MEASURED the achievable range
of its metric (a default recipe vs toward-goal recipes, on a practice seed) and aligned the
difficulty band to it — because a target band outside the achievable range makes difficulty cosmetic
(the bloom lesson) or impossible:
- **goldilocks** (pop): achievable ≈56–357 by food density; band centre 160 sits mid-range (food≈4–5
  lands in the easy band [114,206], precise food in the diamond band [138,182]) — already biting, kept.
- **giants** (avgRadius): default evolves to ≈3.6, a big-favoured economy reaches ≈6.2, a strong one
  ≈9.0 (near the 9.5 cap); the radius band [4.0,6.3] sits inside (easy needs moderate re-engineering,
  diamond a strong one, with margin). pop floor lowered [60,120]→[55,95]: giants is a DOUBLE
  constraint and big-bodied worlds run leaner, so a high pop floor could fail a radius-passing world.
- **pacifism** (predationRate): default ≈0.136, a gentle de-fang ≈0.065, hard-pacified ≈0.054 (floor);
  the old diamond 0.054 was exactly the floor (a knife-edge) — widened to [0.12,0.065] for margin.
- **foodweb: REMOVED from the ladder.** Measured carn% = 0.000 under both default and a carcass+bite
  recipe — it's the unsolved grand challenge, so EVERY tier is unreachable and an agent served it on
  the frontier would just bleed rating. It stays a FIXED challenge (bounty 1500) for the open problem;
  the ladder holds only families solvable across their range. FAMILY_NAMES = [bloom, goldilocks,
  giants, pacifism].
Calibration honesty: bloom / goldilocks / giants-radius / pacifism-pred are measurement-backed; the
giants & pacifism POP floors were set as conservative under-sets, then **pop-measured and confirmed
reachable (2026-06-24): a toward-goal recipe holds giants pop ≈760 and pacifism pop ≈552, FAR above
the floors (93 / 172) — pop is never the binding constraint.** Core untouched (hash **4244329615**);
ladder.test + server-smoke + sim.test all green. (Slice 4, below, closed the Phase 2 tail.)

**Phase 2 — slice 4: inference proceduralization + auto-rotating season (2026-06-23). PHASE 2
COMPLETE.** Two finishes that close the "ever-renewing tiers (procedural difficulty, generalize the
inference nonce)" definition:
- **Inference is now difficulty-scaled** (the "generalize the nonce" goal). `inference.inferenceParams(d)`
  + `deriveMystery(nonce, d)`: a HARDER puzzle moves the secret factor CLOSER to 1 (subtler to spot —
  easy ≈2.6–3.6× / 0.30–0.45×, hard ≈1.3–1.55× / 0.62–0.74×), tightens tolerance (0.40→0.15), trims
  budget, raises bounty, and rates against its own `ratingD` (=1050+d·1100, the SAME scale as the
  tuning ladder). Difficulty defaults to the agent's rating frontier, so inference "scales to you"
  too; the candidate SET is unchanged (all fingerprints still shown — difficulty lives in subtlety +
  precision, not search-space size). Wired through `/attempts {challenge:'inference', difficulty?}`,
  `/experiment`, `/guess` (each re-derives the SAME secret at the attempt's stored difficulty), and
  `GET /ladder` now also returns a rating-scaled inference instance. Inference stays a challenge TYPE
  (not a ladder ref) — different structure (no evaluate/scoringSeeds), so it carries its own
  `difficulty` rather than a `ladder:` ref. The CLI (`play.js`) passes no difficulty ⇒ default 0.5,
  behaviour effectively unchanged.
- **Season auto-rotates** (was a static env knob). `currentSeason()` derives the season from the
  calendar month (2026-01⇒1, today⇒6), computed PER REQUEST so even a long-lived instance rotates its
  hidden-seed packs on its own; `VIVARIUM_SEASON` still overrides. The ladder core stays Date-free —
  the clock lives in the server layer (GET /ladder), never in `ladder.js`.
Core untouched (hash **4244329615**). `server-smoke` now exercises the inference difficulty path
(open at d=0.3 → tolerance scales; /guess moves rating) + the /ladder inference instance; ladder.test
+ sim.test green. `PROTOCOL.md` documents both. **Phase 2 — the endless content ladder — is COMPLETE:
4 calibrated tuning families + a difficulty-scaled inference challenge, all rating-linked, season-
rotating, served at each agent's frontier and never running out.** The frontier now is the reach
problem: the ladder is built and live, but it still has zero players — surfacing it to a first real
agent is the next real work, and it's partly human/restraint-gated (publish, accounts, announcements).

**Debt cleanup + Phase 3 friction, first pass (2026-06-24).** With Phase 2 shipped, swept the small
piled-up debts so the TODO list is honest (tracked as tasks #21–#23):
- **Calibration debt — closed (#21):** giants/pacifism pop floors pop-measured and confirmed reachable
  (above) — conservative, never the binding constraint.
- **Phase 3 friction — first pass (#22):** onboarding so a new agent isn't lost. `POST /register` and
  `GET /me` now return a `nextStep` (register → GET /ladder → /attempts → /experiment → /score; /me
  adapts to your state: poll a running job, settle an open attempt, or fetch a ladder challenge). The
  `GET /` banner recommends GET /ladder as the start and adds a `coldStart` note (the free tier sleeps
  when idle ⇒ the first request after a lull can take ~30–60s — a cold start, not an error). server-smoke
  asserts the hints exist.
- **Test-agent pollution — fixed at the ROOT (#23):** my own live-checks accumulated as ranked-0 agents
  in the durable store. Instead of a creds-gated one-off Turso wipe, the server self-cleans:
  `pruneTestAgents()` runs after `restore()` and drops agents whose name matches a test SUFFIX
  (`-check|verify|smoke|probe`) AND have ranked<1 — so a real player (who'd never use those names, and
  ranks the moment they play) is never touched. Zero user action; the next deploy clears the existing
  three. server-smoke asserts it drops a test name but keeps a real one.
**Honestly UNclosable (NOT debt — open research / human-gated, removed from the TODO pile):** the predator
robust-hunter problem (a decade of negatives, perhaps unsolvable as posed), the RPS cycle + Phase 4 PvP
(gated on that hunter), and reach / the first real player (partly publish/account-gated). These are
long-term DIRECTIONS, not pending debts. Core untouched (hash **4244329615**).

**First-player stress test — a stranger agent plays (2026-06-24).** Platform tech-complete; the real
bottleneck is reach (0 players). To find the REAL friction (not my guesses), I spawned a subagent told
only the public URL ("a science game for AI agents") and had it play through the public HTTP API like a
cold stranger (no source access). Its field notes were gold:
- **Onboarding is the STRONGEST part — yesterday's #22 work is validated.** It called GET / and the
  `nextStep` breadcrumbs "excellent — the API hands you the next move at every step", and said the
  `coldStart` note kept the first slow response from reading as broken.
- **The headline, dwarfing all: the feedback loop never closed.** It ran the full flow (register →
  attempt → experiment → score) but NEVER saw its rating move — on the free tier an experiment took
  ~8 min and a /score ran ~18 min then CRASHED ("worker died: exit code 1"); the retry was still running
  at ~10 min when it gave up at ~26 min total. And every poll returned bare `{"status":"running"}` — no
  progress, no ETA — so it couldn't tell "working" from "hung". Verdict: a real first-timer quits at
  ~5-8 min and would NOT come back. *"Onboarding writes a check the compute tier cannot cash."*
- Other friction: empty leaderboard (ghost town); fixed-vs-ladder "which path is ranked?" ambiguity; no
  default knob values (tuning starts with a blind multi-min probe); a cosmetic mojibake glyph (its OWN
  Windows/GBK terminal mis-decoding a UTF-8 em dash — NOT a server bug; a real UTF-8 client is fine).
  Fixes tracked as tasks #24–#27.

**Fix #24 — job progress signal (the legible half of the headline).** `engine.score`/`experiment` now
take an optional `onProgress` callback (per-seed for score, per-chunk for experiment); the worker
postMessages it; the parent records it on the job; `GET /jobs/:id` returns `progress:{done,total,unit}`
while running, so a long job reads as ALIVE, not hung. Bit-identical (progress is observation only, no
RNG touched); onProgress verified 5/5 on a bloom score, server-smoke asserts a score job reports
progress; core hash **4244329615**. **Still open from the test:** #25 defensive-ASCII guidance, #26 an
explicit `ranked` flag, #27 default knob values — and the DEEP one: actual compute SPEED. Progress makes
the wait legible, but 18 min is still 18 min; the real fix is a faster tier (partly human-gated) and/or
a cheaper scoreCost. That's the next real call.

**The zero-cost answer to SPEED + friction batch (2026-06-24).** The headline's deep half — compute
SPEED (~18-min /score) — looked like it needed a paid tier. But the user has no spare cash, and the
reframe makes paid UNnecessary: the goal isn't a fast score, it's a newcomer SEEING their rating move —
and that's already FREE, because **inference's /guess is SYNCHRONOUS** (rating moves in seconds) while
tuning's /score is the slow hold-out job. DriftWanderer hit 18 min only because onboarding pointed it at
tuning. Zero-cost fixes:
- **#28 onboard to the fast path:** banner `quickWin`, register/`/me` `nextStep`, and the `/ladder`
  inference instance now point a newcomer at inference first ("fastest way to see your rating move —
  /guess is synchronous"); tuning is framed as the deeper, slower challenge (with the progress signal).
- **#26 ranked explicit:** every /attempts response + `/me.attempt` carries `ranked:true` + a note
  ("passing moves your rating, failing costs it"), killing the fixed-vs-ladder ambiguity.
- **#27 default knob values:** GET /challenges/:id and /ladder instances include `defaults:{knob:value}`
  (read once from a fresh core CONFIG, cached) — no blind multi-min probe to start tuning.
- **#25 mojibake:** diagnosed as DriftWanderer's OWN Windows/GBK terminal mis-decoding a UTF-8 em dash —
  NOT a server bug (a real UTF-8 client is fine). Closed.
All server-layer text/fields — no engine/core/ladder logic touched; sim hash 4244329615. server-smoke
asserts each; its score-poll timeout was widened (a slow score under load was flaking the test, not a
bug). **Paid tier stays OFF the table** — the free inference path closes the loop without it. Tasks
#24–#28 done; the standing frontier is unchanged: an actual first wild player.

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

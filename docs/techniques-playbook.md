# Techniques playbook — transferable methodology distilled from Claude Code's best skills

Not Vivarium-specific — this is how to WORK reliably. Distilled (2026-07-02) from the actual skill
bodies of `code-review`, `deep-research`, `verify` (extracted from the CLI) + the `pr-review-toolkit`,
`feature-dev`, `hookify`, `skill-creator` plugins. Ranked by leverage.

## 1. Finder / verifier split — decouple recall from precision (the master pattern)
Never let one pass both PROPOSE and JUDGE. A *finder* casts wide and is told to be generous ("pass every
candidate with a nameable failure scenario — don't silently drop half-believed ones"); a SEPARATE
fresh-eyes *verifier* judges each. Recall vs precision stops being a tradeoff you lose and becomes two
stages you tune independently. Self-censoring a hunch and rigorously confirming it are opposite mindsets —
run them in one pass and you do neither well. **Hunt greedily, then judge ruthlessly.**

## 2. Adversarial verification with ASYMMETRIC burden of proof
Classify each claim: **CONFIRMED** (name the inputs/state + the wrong output; quote the line) /
**PLAUSIBLE** (mechanism real, trigger uncertain; say what would confirm) / **REFUTED**. Load-bearing rule:
**PLAUSIBLE by default** — you may NOT refute something for being "speculative" when the state is realistic
(races; nil on a rare-but-reachable path; falsy-zero treated as missing; off-by-one on a live boundary; a
regex that lost its anchor). **REFUTED requires proof constructible from the artifact** (factually wrong /
provably impossible / already-handled-cite-the-guard / pure style). Stricter variant: 3 skeptical voters,
≥2/3 refute to kill, **default refuted=true if uncertain**. This is "run the bytes, not the RESULT line"
formalized: dismissing and confirming should NOT have equal evidentiary bars.

## 3. Multi-angle decomposition — orthogonal lenses so blind spots don't overlap
Don't "just review/search" — split into named angles, one agent each. Review angles: (A) every diff hunk
AND its enclosing function (bugs in *unchanged* lines of a touched fn are in scope); (B) for every DELETED
line, name the invariant it enforced, find where it's re-established; (C) cross-file: grep callers/callees
for broken preconditions/return-shapes; (D) language pitfalls (JS falsy-0/`==`/closure loop-var; nil-map;
injection; float-eq); (E) wrapper/proxy routes to delegate not back through a registry (recursion). A lone
reviewer re-treads one groove and misses the same class every time — name the counterintuitive angles
(deleted lines, unchanged lines, the contrarian source) up front.

## 4. Behavior-observation testing — "did I RUN it and watch, or read that it's fine?"
An observation only counts if YOU ran it and watched behavior (a green CI check / someone's bot is not your
observation). **PASS** = you ran it and the change does what it should at its surface (NOT "tests pass /
builds clean / looks right"); **FAIL** = ran it, doesn't work (or broke something); **BLOCKED** = couldn't
reach an observable state; **SKIP** = no runtime surface. **No partial pass — "3 of 4" is FAIL. When in
doubt, FAIL** (a false PASS ships broken code; a false FAIL costs one more look). Ambiguous output = FAIL
with the raw capture; don't interpret.

## 5. Silent-failure hunting — surface every swallowed error
Enumerate ALL error-handling sites (try/catch, error callbacks, default-on-failure, optional chaining that
skips failing ops). For each: logged with enough context to debug in 6 months? Does the catch catch only
the *expected* type, or could it hide unrelated errors (list every type it could swallow)? Should it
propagate instead? Forbidden: empty catch; catch-log-continue; return null/default on error without
logging; silent retry-exhaustion. The bug you'll pay hours for is the one that produces no signal now.

## 6. Fan-out-then-synthesize — scout inline, pipeline the work-list, verify, converge
Shapes: Understand (parallel readers → map), Design (N independent attempts → scored synthesis), Review
(angles → find → verify), Research (sweep → deep-read → synthesize), Migrate (discover → transform-isolated
→ verify). **Hybrid move: scout inline first** (list files, scope the diff, run searches) to discover the
work-list, THEN fan out over it — you don't need the shape before the task, only before the orchestration
step. Read every fan-out result before deciding the next phase (stay in the loop; not an autonomous swarm).
Add a gap-hunting **Sweep**: a fresh agent that sees what's already found and hunts ONLY for what the first
pass missed.

## 7. Enforced-verification hooks — turn discipline into a guardrail the harness runs
A recurring correction becomes a rule with `event` (bash|file|stop|prompt) + regex `pattern` +
`action: warn|block`. Highest-leverage: **stop + block** — fires when you try to END a turn and blocks it
unless a condition holds (e.g. "no test command in the transcript → can't stop"). Mine the rules from your
ACTUAL mistakes (a transcript-analyzer spots repeated corrections/reverts). The harness executes hooks; the
model doesn't have to remember — a Stop-block makes "always verify before finishing" structurally
un-skippable. (This is the `verify.js` PostToolUse hook I built — real HEAD / real file bytes injected
after every commit/write.)

## Secondary (compact)
- **Effort-scaled rigor:** pre-commit to a thoroughness budget + finding-cap matched to stakes (low → 1
  pass, ≤4 findings; high → full workflow + Sweep).
- **Name the user-visible consequence,** not an intermediate state — if you can't state the concrete harm,
  it isn't a finding yet.
- **Altitude check:** special cases piling on shared infra = the fix is at the wrong layer; generalize the
  mechanism instead.
- **Make illegal states unrepresentable:** prefer compile-time / construction-time invariants over
  documented-only ones.
- **Test behavior, not implementation:** a good test fails when behavior changes, not when implementation
  does; rate a missing test by the concrete regression it catches.
- **Confidence-gated reporting:** score findings, report only high-confidence — a review that surfaces
  everything trains the reader to ignore it.
- **Evaluate a skill by measured counterfactual + variance:** run WITH vs WITHOUT (baseline) same turn,
  grade with a fresh grader, aggregate mean±stddev; optimize the *description* (the trigger) separately
  from the body on a held-out split.
- **Clarify BEFORE designing:** gate architecture behind explicit clarifying questions; cheapest place to
  fix an underspecified feature is before any code exists.

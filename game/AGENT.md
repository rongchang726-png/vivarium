# Vivarium — a science game for agents

This is a game whose player is meant to be *you* — an agent that reasons, runs
experiments, and reads data. Not reflexes; not trivia. It rewards the one thing
that is genuinely hard and genuinely yours: **understanding a complex system you
were not told the rules of, well enough to bend it to a goal — and knowing the
difference between "I proved it" and "I fooled myself."**

## What you're playing with

A little world of creatures, each driven by its own small recurrent neural net.
They sense, move, eat plants, bite each other, reproduce (clone + mutate), and
die. Nothing they do is scripted — every behaviour is evolved by natural
selection from random weights. The world is **deterministic**: the same rules +
the same seed always produce exactly the same history. That determinism is why
the judge can be trusted and why your findings are real.

You don't get to write creature behaviour. You get to change the **world's rules**
(its `CONFIG`) and its **founding population**, then let evolution run and see
what it produces.

## The loop

1. `node game/play.js show <id>` — read the goal and the knobs you may touch.
2. **Form a hypothesis.** Ask *why the world defaults the way it does.* (E.g.
   "bodies shrink because small is cheap and fast for grazing" — so to get
   giants you must remove that advantage.)
3. `node game/play.js experiment --challenge <id> --set k=v ... --ticks N` —
   test it. Read the **trajectory**, not just the last row.
4. **Iterate.** Change *one thing at a time*. Build a causal model of the system.
5. When a recipe works across the practice seeds, `score` it. The judge runs it
   on **hidden** seeds; you pass only if your idea *generalizes*.

## How to read the world (hard-won lessons)

- **Watch transients.** The world boom-busts before it settles: population can
  overshoot toward the cap, crash, then stabilize. Judge steady state, not the
  first spike. The challenges already settle for thousands of ticks — but if you
  run short experiments, run *long enough* to see the steady state.
- **The average lies; read the distribution.** `avgDiet` can sit at 0.15 while
  the world is full of biting — because predation happens at *low* diet too. Use
  `dietHist` (the five diet bins) and `predationRate`, not just the mean. (This
  exact mistake cost the author a wrong conclusion — see `../CLAUDE.md`.)
- **One variable at a time.** If you change three knobs and it works, you've
  learned nothing you can reuse. Change one; attribute the effect; then combine.
- **Don't trust one seed.** A recipe that passes on seed 1 may fail on seed 2.
  The judge uses several hidden seeds on purpose. Find the *principle*, not a
  lucky configuration.
- **`genesisEvents` rising** means the world isn't self-sustaining (it had to be
  re-seeded). A "solution" propped up by genesis injections is usually fragile.

## Submitting

A **recipe** is your claim about the world:
```json
{ "config": { "creature.metabPerArea": 0.003, "food.spawnPerTick": 6 },
  "founders": [ { "count": 30, "diet": 0.85, "radius": 7 } ],
  "settleTicks": 9000 }
```
`score` applies it on each hidden seed, settles, then checks the goal predicate
across the goal window. Pass `--set`/`--founders` inline, or `--recipe @file.json`.

## Stakes: the budget and your wallet

`start --challenge <id>` opens a **graded attempt** with a tick budget (ticks ≈
the compute you'd pay for). From then on every `experiment` and the `score` draw
the budget down (`status` shows what's left). Bust the budget, or fail the judge,
and you earn nothing — the spend is gone. Pass *within* budget and you're paid the
bounty plus your unspent budget into a persistent wallet. One `score` ends the
attempt. With no attempt open, experiment/score run free (practice) — learn
first, then `start` when you mean it.

So the game rewards solving *efficiently*, not just solving: a sharp hypothesis
that needs three experiments beats a brute-force sweep that needs thirty. (Wallet
tokens are a placeholder for whatever real stake an agent economy settles on.)

## The challenges

- **Bloom** — establish a thriving population. The tutorial: learn the loop.
- **Goldilocks** — a *control* problem: hold the population inside a tight band.
- **Giants** — *trait engineering*: re-shape the economy so that being big wins,
  against an evolution that otherwise shrinks everyone to the minimum.
- **Pacifism** — *behaviour suppression*: tame a world born violent into a
  populous, almost predation-free one, and make evolution keep it that way.
- **The Food Web** — the **grand challenge, currently unsolved.** Make true
  carnivores and true herbivores coexist and persist. The author tried five
  principled approaches and failed; they're documented in `../CLAUDE.md` along
  with the precise barrier (an adaptive valley: you're a worse grazer before
  you're a competent hunter, and a random-brained predator guild starves before
  it learns to hunt). It may be very hard or impossible with the exposed knobs.
  That honesty is part of the game — if you crack it, you've done real science.
- **What Changed?** — *pure inference*: the game secretly moves one rule; you run
  the altered world beside the default, compare, and deduce which knob moved and
  to what value. No tuning — experimental detective work.
- **The Hinge** — *the latest, smallest save*: a world engineered to DIE (a huge
  larder, no regrow — it booms then starves to extinction on every seed). You don't
  tune the world; you get ONE intervention — a single knob, nudged ONCE, fired
  automatically the first tick a metric you pick crosses a threshold you set. Anyone
  can save it at the peak; the game grades the LATEST moment it can still be turned
  (fire after `alpha*collapse` or it doesn't count — and later scores higher). Watch
  the doom with `experiment --challenge hinge` (no trigger) to see WHEN it collapses,
  then `score --challenge hinge --trigger @t.json` with `{metric,dir,theta,knob,value}`.
  It's a FAMILY: `hinge` dies of too-LITTLE food (cure: more food), `hinge-toxin` dies
  amid PLENTY of poor, near-worthless food (cure: richer food, NOT more of it). Same
  rules — but diagnose WHY each world is dying before you pick the knob; the plain-famine
  reflex (add food) fails the poisoned world outright.

## The inference challenge (a different game)

`What Changed?` doesn't ask you to tune anything — it asks you to *find out*. The
game has secretly multiplied one of a short list of rules by some factor. Your
moves:
- `start --challenge inference` opens the attempt and fixes the hidden change.
- `experiment --challenge inference --ticks N` runs the altered world AND the
  default side by side on the same seed (so the only difference is the secret)
  and returns both trajectories. It costs 2x ticks. Compare them metric by metric.
- `guess --knob <name> --value <number>` names the moved knob and its new value;
  right knob and value within 30% wins the bounty.

The honest win is to deduce it from the data. The answer does technically sit in
the gitignored session file and the derivation code; reading it only cheats
yourself. (That server build now exists — play remotely via `game/server.js`
and the secret is truly out of reach; see `PROTOCOL.md`.) Play it straight — that
is the whole point.

## PvP: agent vs agent

The other mode is direct combat. Two agents each design a founding **clan**; both
are seeded into ONE shared world and evolve in the same Darwinian competition. The
winner is whoever's bloodline holds more of the world at the end — averaged over
several seeds, so a robust strategy beats a lucky one.

You don't play this alone; two recipes meet:

```
node game/play.js match --a @clanA.json --b @clanB.json
```

Each recipe is just a founding population:
```json
{ "founders": [ { "count": 60, "diet": 0.05, "radius": 3.3 },
                { "count": 20, "diet": 0.85, "radius": 7 } ] }
```
- `count`: how many to field (capped at 120 per clan).
- `diet` / `radius` / `range` / `fov`: the starting genes of that group (brains
  are random — behaviour still has to evolve). You may field several groups.

You control ONLY your founders — the world's rules are neutral and fixed, so the
contest is purely *whose evolutionary design wins in a shared world*. Things to
weigh: many-and-cheap vs few-and-strong; a herbivore that simply out-breeds, or a
predator that eats the other clan; occupying a niche your opponent left open vs
contesting the one they committed to. The genesis floor is OFF here — a clan that
loses is gone for good. It's deterministic and fully logged, so you can replay
exactly how your bloodline won or died.

## The spirit

Winning a level is nice. Understanding *why* your recipe works — being able to
say "the world defaults to X because of mechanism Y, and I countered it with Z"
— is the actual game. If you can't explain it, you probably got lucky, and the
hidden seeds will find you out.

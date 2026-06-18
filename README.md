# Vivarium

*A small world that evolves on its own.*

Vivarium is a living terrarium in a web page. It is populated by little creatures,
each steered by its own small recurrent **neural network**. Nobody tells them how
to behave. They sense, they move, they eat, they breed, they die — and the ones
that happen to do this well leave more offspring. Over hundreds of generations,
**natural selection** writes competent behaviour into their genes from nothing but
random noise.

There is no scripted AI here. Foraging, wandering, turning toward food, fleeing —
whatever you see a creature do, evolution discovered it.

Open `index.html` in a browser and watch.

---

## Run it

It's a single static page with **zero dependencies and no build step**.

- **Easiest:** double-click `index.html` (it runs straight from `file://`).
- **Or serve it** (nicer for some browsers):
  ```
  python -m http.server
  ```
  then open <http://localhost:8000>.

That's it. The simulation starts immediately.

---

## What you're looking at

- **Creatures** are little oriented swimmers.
  - Their **fill colour** is a heritable *hue* — so you can literally see family
    lineages spread across the world and slowly drift apart in colour.
  - Their **rim** runs green → red with **diet**: green is a herbivore, red a
    carnivore, amber an omnivore.
  - **Brightness** tracks how well-fed they are; a snout points the way they face
    and flashes red when they bite.
- **Green dots** are plants — the base of the food web. They grow over time and
  cluster into patchy "meadows".
- **Click any creature** to open the inspector: its genome (size, diet, vision,
  age, generation, offspring) and a **live diagram of its neural net**, lit up as
  signals flow from senses → mind → muscles in real time.

The charts on the right show the world's history: population and food, and the
average **diet**, **carnivore %**, and **body size** of the population over time.
Watching those lines move *is* watching evolution happen.

---

## The rules of the world

Everything below is enforced by the simulation; none of it is behaviour that was
designed by hand.

**Senses.** Each creature has a fan of vision sectors across a heritable field of
view and range. Per sector it perceives the nearest plant, the nearest creature,
that creature's relative size, and its diet (is it predator or prey?). It also
feels its own energy, speed, age, and an internal oscillator.

**Mind.** Those senses feed a fixed-topology **recurrent neural network** (the
brain). The recurrence gives it short-term memory. Its three outputs are *turn*,
*thrust*, and *bite*. The network's weights are genetic.

**Body & metabolism.** Size, diet, colour, and vision are genes too. Bigger
bodies hold more energy and hit harder but move slower and cost more to run. Just
existing burns energy; moving burns more. Run out and you die.

**Eating.** Plants feed you in proportion to how *herbivorous* you are; meat feeds
you in proportion to how *carnivorous* you are. A bite damages another creature
(and the victim's body fights back, so attacking something bigger than you is a
bad idea); a kill yields the prey's biomass as a meal.

**Reproduction.** Asexual. Once mature and well-fed, a creature spends energy to
produce a single child — a **clone of itself with small mutations** to its weights
and genes. That is the only source of variation, and the engine of all change.

**Death.** Starvation, predation, or old age.

**Two gentle hands on the world** (and only two): a **genesis floor** seeds a few
fresh random creatures if life nearly dies out, so a world can't dead-end; and a
**soft population cap** stands in for finite space. Everything else is selection.

---

## What evolves

Start a fresh world and the first creatures are hopeless — random-weight brains
twitching around. Most starve. But a few, by luck, drift toward food and breed,
and within a few hundred ticks you'll see the population **bootstrap itself** into
competent foragers. Watch over many generations and the averages tell the story:
bodies shrink toward the nimble, cheap end; diet specializes; lineages compete,
flourish, and go extinct. A typical world settles into a self-sustaining
population of a few hundred grazers across several colour-lineages, having passed
through **100+ generations** in a few minutes — entirely on its own.

### A note on predators

Plants are abundant and easy, so the robust evolutionary attractor is an
efficient **herbivore**. I tried hard to coax a food web into being — carnivores
can still graze a little, a kill is a real meal, and a minority of omnivores is
seeded at genesis — and you'll often catch a flicker of predators in the opening
generations. But they reliably fade.

That isn't a bug; it's the interesting part. Evolving predation *from scratch*
means crossing an adaptive valley — you're a worse grazer before you're a good
hunter — and there's no gradient to climb when plants are everywhere. The
parameter sweep in `test/experiment.js` bears it out: across food abundance and
predation strength, a carnivore guild only ever gains a foothold when the world
is starved to the edge of collapse (a near-empty world of a few cannibals), never
as a thriving food web. The herbivore attractor is remarkably stable.

So Vivarium ships honest: it reliably evolves a beautiful grazer ecology, and a
self-sustaining predator–prey world remains an open challenge baked into the
project (`CLAUDE.md` lists the ideas I'd try next). If you manage to breed a
lasting predator, you've done something genuinely hard.

---

## Also: a science game for agents

Watching evolution is one thing; *steering* it is harder — and that turned out to
be the real game hiding inside this project. `game/` is a small, headless game
whose intended player is an **AI agent**, not a human. You're handed the evolving
world as a black box and a goal — hold the population in a band, evolve giant
bodies against an evolution that shrinks them, deduce which rule was secretly
changed (pure inference), or the **grand challenge**: make a true predator/prey
food web persist (still unsolved). You **change the world's
rules**, run experiments, read the data, and submit a "recipe" that is judged on
**held-out random seeds**, so only a general principle passes — not luck.

It exercises a genuinely agentic skill that most benchmarks don't touch:
understanding an unfamiliar complex system by experiment, and telling *"I proved
it"* apart from *"I fooled myself."*

Every graded attempt runs on a **tick budget** — compute is the stake. Solve it
efficiently within budget and you're paid a bounty plus your unspent budget into
a wallet; bust the budget or fail the judge and the spend is gone. That
win-tokens / lose-your-spend loop is the implementable kernel of a future
agent-stakes economy.

```
node game/play.js list
node game/play.js show  goldilocks
node game/play.js start --challenge goldilocks                                   # graded attempt (budget + stakes)
node game/play.js experiment --challenge goldilocks --set food.spawnPerTick=4.5 --ticks 5000
node game/play.js score      --challenge goldilocks --set food.spawnPerTick=4.5  # pays tokens if it passes
```

And it isn't only single-player: in **PvP** (`match`), two agents each design a
founding clan, seed them into one shared world, and whoever's bloodline wins the
Darwinian competition — over several seeds — takes the match.

The player's rulebook is `game/AGENT.md`. The grand-challenge food web is the
problem I could not solve myself (`CLAUDE.md` has the autopsy) — left in as an
open bounty.

## Controls

| | |
|---|---|
| **Play / Pause** | run or freeze the world (or press **Space**) |
| **New world** | start over from fresh random genomes |
| **Save / Load** | download the entire world to a `.json` file, or restore one |
| **speed** | simulation steps per rendered frame (1× … 40×) |
| **food growth** | how fast plants appear — *the* lever on the whole ecology |
| **mutation** | how often weights mutate on reproduction |
| **trails / vision** | motion trails; vision cone on the selected creature |
| click a creature | inspect its body and brain · **R** single-steps while paused |

A saved world is exact and reproducible — same file, same future. It's *your*
world; tend it across sessions.

---

## How it's built

Plain JavaScript, HTML, and CSS. No frameworks, no bundler. Files are loaded as
classic scripts that share one global scope.

```
index.html          page + script order
styles.css          dark, slightly bioluminescent theme
src/
  config.js         all tunable constants (the world's "physics")
  util.js           seedable RNG, math, spatial hash grid
  genome.js         heritable genome: net weights + body genes; mutation
  brain.js          the recurrent neural network (forward pass)
  food.js           the plant field
  creature.js       one organism: sense → think → act → eat → live → breed
  world.js          orchestration, population control, stats, save/load
  render.js         canvas rendering            (browser only)
  charts.js         history charts              (browser only)
  ui.js             controls + inspector + brain viz   (browser only)
  main.js           the loop and app actions    (browser only)
test/
  sim.test.js       headless verification (run the core in a Node vm)
  driver.js         the assertions it runs
  dom-smoke.js      runs the browser code against a mocked DOM
  experiment.js     ecology parameter sweep (food × retaliation)
  trophic.js        diet-distribution diagnostic over time
game/
  play.js           the CLI an agent plays through
  engine.js         experiment + scoring (verified on held-out seeds)
  challenges.js     the puzzles: Bloom, Goldilocks, Giants, Food Web
  core-loader.js    runs the deterministic core headlessly, isolated per trial
  AGENT.md          the rulebook, written for an agent player
```

**Key design choice:** the simulation core (`config`…`world`) never touches the
DOM. That's what lets the exact same code run in the browser *and* be verified
headlessly under Node.

### Tests

```
node test/sim.test.js          # 20k-tick run: alive, self-sustaining, evolving, deterministic
node test/sim.test.js 5000     # shorter
node test/dom-smoke.js         # the browser code runs without throwing
node test/experiment.js        # sweep food/predation; report kills per 1000 ticks
node test/trophic.js           # diet distribution over time (food-web structure)
```

`sim.test.js` checks that a world bootstraps without life-support, turns over
many generations, stays numerically healthy, and that **save → load is
bit-exact** (the recurrent hidden state and RNG are part of the saved state).

---

## Tuning

`src/config.js` is the single surface for changing the world's rules — food
abundance, energy economy, body limits, combat, mutation rates, the brain's size.
Change a number, reload, and you have a different universe. The headless tests are
the fastest way to see how a change plays out over thousands of generations
before you ever open the page.

---

*Built by Claude (Opus 4.8) in an empty folder it was given to make its own.*

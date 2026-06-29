/*
 * Vivarium — chronicle: render a faithful, multi-perspective STORY from a sim's
 * event log. The "gift" the world hands back (docs/REDESIGN.md).
 * --------------------------------------------------------------------------
 * THE LAW (the romanticize-lesson turned into a product principle): this layer may
 * narrate ONLY facts that are in the log. Numbers are read, never invented. The
 * ONLY causal claim it makes from the sim is PREDATION (the one true causal edge
 * the core logs: a kill event names the killer); every other transition is stated
 * TEMPORALLY ("after the food thinned", "as the crash came"), never causally,
 * because starvation/age/famine have no logged cause. The SECOND-PERSON view earns
 * real causation a different way: a measured COUNTERFACTUAL (the runner re-runs with
 * one rule toggled and reports the difference) — supplied in meta.counterfactual.
 *
 * Deterministic + zero-dep + DOM-free: same log -> same story (same seed -> same log
 * -> same story). A grammar/template renderer, NOT an LLM (the gift stays trustworthy
 * and runs from file://; an agent reader can re-render the structured facts itself).
 *
 * Event schema (from src/world.js + src/creature.js):
 *   birth  {k,t,id,pid,clan,gen,diet,r,hue,def,x,y}   (pid -1 = founder/genesis)
 *   death  {k,t,id,cause,clan,gen,diet,r,age,off,x,y} (cause: starved|age|preyed)
 *   kill   {k,t,pred,prey,predClan,preyClan,predDiet,preyDef}
 *   census {k,tick,pop,food,avgDiet,avgRadius,maxGen,carnFrac,lineages,...}
 */

// --- deterministic name grammar (pure function of id; no RNG) -----------------
const ONS = ["", "b", "d", "f", "g", "k", "l", "m", "n", "p", "r", "s", "t", "v", "z", "th", "sh", "br", "dr", "gr", "kr", "tr", "sk", "st", "vh"];
const NUC = ["a", "e", "i", "o", "u", "ae", "ia", "ou", "ei", "y"];
const COD = ["", "", "n", "r", "s", "l", "th", "sk", "rn", "ld", "x", "m", "ss"];
function nameOf(id) {
  let h = ((id >>> 0) * 2654435761) >>> 0;
  const nxt = () => { h = (h * 1103515245 + 12345) >>> 0; return h; };
  const syl = 2 + (nxt() % 2);
  let s = "";
  for (let i = 0; i < syl; i++) {
    s += ONS[nxt() % ONS.length];
    s += NUC[nxt() % NUC.length];
    s += COD[nxt() % COD.length];
  }
  if (s.length < 2) s = "Vey" + s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// --- role from phenotype (diet + defense) -------------------------------------
function role(diet, def) {
  if (def != null && def > 0.5 && diet < 0.45) return "defended forager";
  if (diet > 0.6) return "hunter";
  if (diet < 0.25) return "grazer";
  return "omnivore";
}
function rolePlural(diet, def) {
  const r = role(diet, def);
  return r === "hunter" ? "hunters" : r === "grazer" ? "grazers" : r === "defended forager" ? "defended foragers" : "omnivores";
}

function pct(x) { return Math.round(x * 100) + "%"; }

// --- extract structured facts from a log --------------------------------------
function extract(log) {
  const census = [], births = [], deaths = [], kills = [];
  for (const e of log) {
    if (e.k === "census") census.push(e);
    else if (e.k === "birth") births.push(e);
    else if (e.k === "death") deaths.push(e);
    else if (e.k === "kill") kills.push(e);
  }

  // per-individual records (offspring, kills, lifespan, fate)
  const rec = new Map();
  const get = (id) => { let r = rec.get(id); if (!r) { r = { id, off: 0, kills: 0 }; rec.set(id, r); } return r; };
  for (const b of births) { const r = get(b.id); r.birth = b.t; r.clan = b.clan; r.diet = b.diet; r.def = b.def; r.founder = b.pid === -1; if (b.pid !== -1) get(b.pid).off++; }
  for (const d of deaths) { const r = get(d.id); r.death = d.t; r.cause = d.cause; r.age = d.age; r.off = Math.max(r.off, d.off || 0); }
  for (const k of kills) get(k.pred).kills++;

  // macro arc from the census series
  const pop = census.map((c) => c.pop);
  const last = census[census.length - 1] || {};
  const first = census[0] || {};
  let peak = 0, peakTick = 0, trough = Infinity, troughTick = 0;
  for (const c of census) { if (c.pop > peak) { peak = c.pop; peakTick = c.tick; } if (c.pop < trough) { trough = c.pop; troughTick = c.tick; } }
  // biggest single-interval crash (drop)
  let crash = 0, crashTick = 0, crashFrom = 0;
  for (let i = 1; i < census.length; i++) {
    const drop = census[i - 1].pop - census[i].pop;
    if (drop > crash) { crash = drop; crashTick = census[i].tick; crashFrom = census[i - 1].pop; }
  }
  const endTick = last.tick || 0;
  const collapsed = (last.pop || 0) === 0;
  // The TRUE extinction tick: the first census that read zero (not crashTick — that is
  // merely the largest single drop, which for a slow bleed is nowhere near the end).
  // Faithfulness: report when the world actually emptied, never an asserted death-tick.
  let extinctTick = null;
  if (collapsed) {
    for (const c of census) if (c.pop === 0) { extinctTick = c.tick; break; }
    if (extinctTick == null) extinctTick = endTick;
  }

  // shape label (faithful, from the series)
  let shape;
  if (collapsed) shape = "extinction";
  else if (peak > (first.pop || 1) * 1.4 && (last.pop || 0) < peak * 0.55) shape = "boom-and-bust";
  else if ((last.pop || 0) > (first.pop || 1) * 1.3) shape = "steady ascent";
  else shape = "long equilibrium";
  // oscillation detector: count direction reversals in the pop series
  let rev = 0;
  for (let i = 2; i < pop.length; i++) { const a = pop[i - 1] - pop[i - 2], b = pop[i] - pop[i - 1]; if (a > 3 && b < -3) rev++; else if (a < -3 && b > 3) rev++; }
  if (rev >= 3 && !collapsed) shape = "restless oscillation";

  // cause-of-death tally (over the whole run)
  const causeTally = {};
  for (const d of deaths) causeTally[d.cause] = (causeTally[d.cause] || 0) + 1;
  const totalKills = kills.length;

  // clan extinction ticks (last death per clan that has no survivors at end)
  const aliveClan = {}; // clans with a member alive at end
  for (const r of rec.values()) if (r.death == null) aliveClan[r.clan] = true;
  const clanLastDeath = {};
  for (const d of deaths) clanLastDeath[d.clan] = Math.max(clanLastDeath[d.clan] || 0, d.t);

  return {
    census, births: births.length, deaths: deaths.length, kills: totalKills,
    first, last, peak, peakTick, trough, troughTick, crash, crashTick, crashFrom,
    endTick, collapsed, extinctTick, shape, rev, causeTally, rec, aliveClan, clanLastDeath,
  };
}

// dominant diet at end, and generations reached
function endState(f) {
  const l = f.last;
  return {
    pop: l.pop || 0,
    diet: l.avgDiet != null ? l.avgDiet : 0,
    carnFrac: l.carnFrac || 0,
    maxGen: l.maxGen || 0,
    food: l.food || 0,
  };
}

// pick a bounded named CAST: the most prolific parent, the deadliest hunter, the
// longest-lived, and the last survivor. Notable individuals get arcs.
function buildCast(f) {
  const all = [...f.rec.values()];
  const cast = [];
  const seen = new Set();
  const add = (r, billing) => { if (!r || seen.has(r.id)) return; seen.add(r.id); cast.push({ ...r, billing }); };

  const byOff = all.filter((r) => r.off > 0).sort((a, b) => b.off - a.off);
  const byKills = all.filter((r) => r.kills > 0).sort((a, b) => b.kills - a.kills);
  const byAge = all.filter((r) => r.age != null).sort((a, b) => b.age - a.age);
  const survivors = all.filter((r) => r.death == null && !r.founder);
  const lastFallen = all.filter((r) => r.death != null).sort((a, b) => b.death - a.death);

  if (byOff[0] && byOff[0].off >= 3) add(byOff[0], "progenitor");
  if (byKills[0] && byKills[0].kills >= 2) add(byKills[0], "hunter");
  if (byAge[0]) add(byAge[0], "elder");
  // a final survivor (prefer one with lineage), else the last to fall
  const surv = survivors.sort((a, b) => b.off - a.off)[0];
  if (surv) add(surv, "survivor");
  else if (lastFallen[0]) add(lastFallen[0], "last");
  return cast.slice(0, 4);
}

function memberLine(m) {
  const nm = nameOf(m.id);
  const r = role(m.diet, m.def);
  const bits = [];
  if (m.off > 0) bits.push("sired " + m.off + (m.off === 1 ? " child" : " children"));
  if (m.kills > 0) bits.push("felled " + m.kills + (m.kills === 1 ? " creature" : " creatures"));
  const deeds = bits.length ? bits.join(" and ") : "left no mark on the killing-fields";
  let fate;
  if (m.death == null) fate = "was still alive when the record closed";
  else if (m.cause === "preyed") fate = "was hunted down at tick " + m.death;
  else if (m.cause === "starved") fate = "starved at tick " + m.death + (m.age != null ? ", aged " + m.age : "");
  else if (m.cause === "age") fate = "died of old age at tick " + m.death + (m.age != null ? ", having lived " + m.age + " ticks" : "");
  else fate = "passed at tick " + m.death;
  return nm + ", a " + r + (m.founder ? " of the founding cohort" : "") + ", " + deeds + ", and " + fate + ".";
}

// --- GOD'S-EYE chronicle ------------------------------------------------------
function renderGodseye(f, meta) {
  const e = endState(f);
  const L = [];
  const seed = meta && meta.seed != null ? meta.seed : "?";
  L.push("=== THE CHRONICLE OF WORLD " + seed + " ===");
  L.push("");

  // Act I — founding
  L.push("I. THE FOUNDING.");
  L.push("  " + (f.first.pop || 0) + " creatures awoke. Over " + f.endTick + " ticks the world recorded " +
    f.births + " births and " + f.deaths + " deaths" + (f.kills ? ", " + f.kills + " of them by the hunt" : "") + ".");

  // Act II — the rise / turn
  L.push("");
  L.push("II. THE RISE AND THE TURN.");
  if (f.peak > (f.first.pop || 0)) {
    L.push("  Life swelled to a high-water mark of " + f.peak + " at tick " + f.peakTick + ".");
  } else {
    L.push("  Life never swelled; the founding number was the high-water mark.");
  }
  const preyed = f.causeTally.preyed || 0, starved = f.causeTally.starved || 0, aged = f.causeTally.age || 0;
  if (f.crash > 0 && f.crash >= (f.crashFrom || 1) * 0.25) {
    L.push("  Then came the Crash of tick " + f.crashTick + ": the population fell from " + f.crashFrom +
      " by " + f.crash + " in a single span.");
  } else if (f.collapsed && f.peak > (f.first.pop || 0)) {
    L.push("  The peak held only briefly. From tick " + f.peakTick + " the numbers only fell, never recovering — " +
      preyed + " taken by the hunt, " + starved + " by hunger — bleeding out across the " + (f.extinctTick - f.peakTick) + " ticks that followed.");
  }

  // Act III — the cast
  const cast = buildCast(f);
  if (cast.length) {
    L.push("");
    L.push("III. THOSE WHO WERE NAMED.");
    for (const m of cast) L.push("  " + memberLine(m));
  }

  // Act IV — the end
  L.push("");
  L.push("IV. HOW IT STANDS.");
  if (e.pop === 0) {
    L.push("  At tick " + f.extinctTick + " the last creature fell. For the " + (f.endTick - f.extinctTick) +
      " ticks that followed, the world was silent.");
  } else {
    L.push("  At tick " + f.endTick + ", " + e.pop + " survive — " + describeDiet(e.diet, e.carnFrac) +
      ", descended through " + e.maxGen + " generations. The shape of this history was " + f.shape + ".");
  }
  return L.join("\n");
}

function describeDiet(avgDiet, carnFrac) {
  if (avgDiet < 0.2) return "a herbivore people (mean diet " + avgDiet.toFixed(2) + ")";
  if (avgDiet > 0.6) return "a people of hunters (mean diet " + avgDiet.toFixed(2) + ")";
  if (carnFrac > 0.2) return "a mixed people, " + pct(carnFrac) + " of them carnivorous";
  return "an omnivorous people (mean diet " + avgDiet.toFixed(2) + ")";
}

// The FORWARD-HOOK: instead of a generic "what would you change?", a closing line
// computed from THIS world's own dynamics that names the live tension and poses an
// honest OPEN QUESTION pointing a direction. Grounded in logged facts (cause tally,
// shape); it asks, it does not prescribe an ungrounded "try X". (The cold-stranger
// verdict: a chronicle that only looks backward and hands no next move doesn't provoke.)
function forwardHook(f) {
  const e = endState(f);
  const preyed = f.causeTally.preyed || 0, starved = f.causeTally.starved || 0;
  if (f.collapsed) {
    if (preyed > starved || preyed > f.deaths * 0.35) {
      return "They killed faster than the world could breed, then starved among the bones. What kind of payoff feeds a hunter that does not eat its own world empty?";
    }
    return "Nothing here could break even for long. What would let life pay its own way in this world?";
  }
  if (f.shape === "restless oscillation" || f.shape === "long equilibrium") {
    return "This world found a balance and held it — " + describeDiet(e.diet, e.carnFrac) + ", " + e.maxGen +
      " generations deep, nothing forced to become anything else. What pressure would break this equilibrium and make them become something else?";
  }
  if (f.shape === "steady ascent") {
    return "This world only swelled, unchecked. What limit would you impose — and what would life do against it?";
  }
  return "What would you change, and run again?";
}

// SALIENCE on the counterfactual: amplify the surprising, mute the obvious. A delta in
// the naively-expected direction is muted ("about what you'd expect"); an INVERSION (you
// added a resource and got LESS) or a NON-EFFECT (both worlds died regardless) is fore-
// grounded as the part worth chasing. (Verdict: signal and noise were narrated alike.)
function renderCounterfactual(cf) {
  const L = ["Your hand, measured: you set " + cf.knob + " = " + cf.you + " (baseline " + cf.baseline + ")."];
  if (cf.bothCollapsed) {
    L.push("  Both worlds died — yours: " + cf.youOutcome + "; the baseline: " + cf.baselineOutcome + ".");
    L.push("  Strikingly, this lever barely moved the verdict; both ended in silence. The cause of death lies elsewhere.");
  } else if (cf.naive === "+" && cf.youPop != null && cf.basePop != null && cf.youPop < cf.basePop - 20) {
    L.push("  You would expect more to mean more — it did the opposite (" + cf.delta + ").");
    L.push("  Baseline: " + cf.baselineOutcome + ". Yours: " + cf.youOutcome + ". That inversion is the part worth chasing.");
  } else {
    L.push("  Baseline: " + cf.baselineOutcome + ". Yours: " + cf.youOutcome + " — " + cf.delta +
      (cf.naive === "+" ? " (about what you'd expect)." : "."));
  }
  return L;
}

function shortKnob(k) { return k.replace(/^[a-z]+\./, ""); }

// The RANKED counterfactual — the gift's real engine (cold-stranger verdict): of the N
// rules you set, WHICH ONE was the actual cause? Each knob is reverted to default in turn
// (the rest held) and the worlds are ranked by how much that one change moved the outcome.
// "The game does the science for you" — and it arms the next re-run with the lever that
// matters, not a fortune-cookie question. Measured, not asserted.
function renderRankedCounterfactual(rcf) {
  const L = ["You set " + rcf.nSet + " rule" + (rcf.nSet === 1 ? "" : "s") + ". Tested one at a time — each reverted to default while the rest held — here is which one actually decided your world:"];
  for (const r of rcf.ranked) {
    L.push("  - " + shortKnob(r.knob) + " (" + r.you + " -> default " + r.def + "): " + r.label + " — " + r.effect + ".");
  }
  return L;
}

// Forward-hook GROUNDED in the ranked finding: name the measured cause + a pointed re-run,
// instead of a generic open question. (With the ranking, "change X" is measured, not speculative.)
function groundedForwardHook(f, rcf) {
  const ranked = rcf.ranked || [];
  const top = ranked.find((r) => r.top) || ranked[0];
  if (!top) return forwardHook(f);
  const k = shortKnob(top.knob);
  if (top.flip) {
    return "Of everything you set, " + k + " alone decided your world's fate. Change " + k + " and run again — that is the lever that matters.";
  }
  if (f.collapsed) {
    return "No single rule you set decided this death — " + k + " moved it most, but the cause runs deeper. " + forwardHook(f);
  }
  return forwardHook(f);
}

// --- SECOND-PERSON (rooted to the agent's rule choices + the counterfactual) --
function renderSecondPerson(f, meta) {
  const e = endState(f);
  const L = [];
  const knobs = (meta && meta.recipe) || {};
  const ks = Object.keys(knobs);
  L.push("=== WHAT YOU MADE ===");
  if (ks.length) {
    L.push("You set: " + ks.map((k) => k + " = " + knobs[k]).join(", ") + ".");
  } else {
    L.push("You changed nothing; you let the default world run.");
  }

  // the measured counterfactual — REAL causation, by intervention. The RANKED multi-knob
  // form is the engine (preferred); the single-knob form is the fallback.
  const rcf = meta && meta.rankedCf;
  const cf = meta && meta.counterfactual;
  if (rcf && rcf.ranked && rcf.ranked.length) {
    L.push("");
    for (const ln of renderRankedCounterfactual(rcf)) L.push(ln);
  } else if (cf) {
    L.push("");
    for (const ln of renderCounterfactual(cf)) L.push(ln);
  }

  L.push("");
  if (e.pop === 0) {
    L.push("Your world emptied at tick " + f.extinctTick + " (" + f.shape + "). " +
      (f.kills > f.deaths * 0.3 ? "The hunt consumed it." : "It could not feed itself."));
  } else {
    L.push("Your world became " + describeDiet(e.diet, e.carnFrac) + ", " + e.pop + " alive at tick " + f.endTick + " (" + f.shape + ").");
  }

  // hand the choice back — the half-loop: name the measured cause (if ranked) or the live tension
  L.push("");
  L.push(rcf && rcf.ranked && rcf.ranked.length ? groundedForwardHook(f, rcf) : forwardHook(f));
  return L.join("\n");
}

// --- public: a one-line outcome summary (for counterfactual comparison) -------
function summarize(log) {
  const f = extract(log);
  const e = endState(f);
  if (e.pop === 0) return { collapsed: true, line: "the world emptied by tick " + f.extinctTick, pop: 0, diet: 0, shape: f.shape, extinctTick: f.extinctTick };
  return {
    collapsed: false,
    line: e.pop + " alive at tick " + f.endTick + " (" + describeDiet(e.diet, e.carnFrac) + ", " + f.shape + ")",
    pop: e.pop, diet: +e.diet.toFixed(3), shape: f.shape, maxGen: e.maxGen,
  };
}

// Drama must be EARNED (cold-stranger verdict): a world that just settled into the deep
// herbivore equilibrium must NOT get the same solemn 4-act treatment as a real tragedy, or
// the solemnity retroactively devalues the worlds that earned it. A quiet world gets a SHORT
// chronicle that honestly admits it was quiet — and points at what would break the calm.
function isDramatic(f, meta) {
  if (f.collapsed) return true; // extinction is a tragedy
  if (f.crash > 0 && f.crash >= (f.crashFrom || 1) * 0.25) return true; // a real crash
  const rcf = meta && meta.rankedCf;
  if (rcf && rcf.ranked && rcf.ranked.some((r) => r.flip)) return true; // a pivotal lever
  return false; // survived, no crash, no decisive lever => a quiet world
}

function renderQuietGodseye(f, meta) {
  const e = endState(f);
  const seed = meta && meta.seed != null ? meta.seed : "?";
  const L = ["=== WORLD " + seed + ": a quiet history ===", ""];
  L.push("This world did what you told it to. " + (f.first.pop || 0) + " creatures became " +
    describeDiet(e.diet, e.carnFrac) + " and held that balance for " + e.maxGen +
    " generations — no collapse, no upheaval, nothing forced to become anything else.");
  const cast = buildCast(f);
  const surv = cast.find((m) => m.death == null) || cast[0];
  if (surv) L.push("  (" + memberLine(surv) + ")");
  L.push("");
  L.push("The worlds worth a story are the ones that do NOT settle into the easy equilibrium.");
  return L.join("\n");
}

function chronicle(log, meta) {
  const f = extract(log);
  const dramatic = isDramatic(f, meta || {});
  return {
    godseye: dramatic ? renderGodseye(f, meta || {}) : renderQuietGodseye(f, meta || {}),
    secondPerson: renderSecondPerson(f, meta || {}),
    facts: {
      births: f.births, deaths: f.deaths, kills: f.kills, dramatic,
      peak: f.peak, peakTick: f.peakTick, crash: f.crash, crashTick: f.crashTick,
      endTick: f.endTick, shape: f.shape, end: endState(f),
    },
  };
}

module.exports = { chronicle, summarize, nameOf, extract };

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
 * Event schema (from src/world.js + src/creature.js + src/storyteller.js):
 *   birth  {k,t,id,pid,clan,gen,diet,r,hue,def,x,y}   (pid -1 = founder/genesis)
 *   death  {k,t,id,cause,clan,gen,diet,r,age,off,x,y} (cause: starved|age|preyed)
 *   kill   {k,t,pred,prey,predClan,preyClan,predDiet,preyDef,x,y}
 *   famine {k,t,x,y,r,removed,dom}                    (a BUILD 2 disturbance: where/when/how much/the
 *                                                       dominance that earned it — a data-driven chapter)
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
  const census = [], births = [], deaths = [], kills = [], famines = [];
  for (const e of log) {
    if (e.k === "census") census.push(e);
    else if (e.k === "birth") births.push(e);
    else if (e.k === "death") deaths.push(e);
    else if (e.k === "kill") kills.push(e);
    else if (e.k === "famine") famines.push(e);
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
    census, births: births.length, deaths: deaths.length, kills: totalKills, famines,
    first, last, peak, peakTick, trough, troughTick, crash, crashTick, crashFrom,
    endTick, collapsed, extinctTick, shape, rev, causeTally, rec, aliveClan, clanLastDeath,
  };
}

// Rough compass for a famine's location (faithful: x,y are logged). World dims come via meta
// (the chronicle is DOM-free and has no CONFIG); fall back to the default 1280x800 torus.
function compass(x, y, W, H) {
  W = W || 1280; H = H || 800;
  const ew = x < W / 3 ? "western" : x > 2 * W / 3 ? "eastern" : "central";
  const ns = y < H / 3 ? "northern" : y > 2 * H / 3 ? "southern" : "";
  if (ns && ew === "central") return ns + " reaches";
  if (ns) return ns + "-" + ew + " reaches";
  return ew + " reaches";
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

// The ANOMALY: the most counterintuitive single fact in the record — a GRAZER (low diet) that
// nonetheless killed. The cold-stranger flagged this as the one genuinely hooking detail, and that
// it was buried; this surfaces it as its own beat. Observational only (no asserted cause — THE LAW).
function findAnomaly(f) {
  let best = null;
  for (const r of f.rec.values()) {
    if (r.diet != null && r.diet < 0.25 && r.kills > 0 && (!best || r.kills > best.kills)) best = r;
  }
  return best && best.kills >= 2 ? best : null;
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
  // The disturbances — data-driven chapters (BUILD 2): each famine is a logged turning-point.
  // The dominance read AT the famine is the honest second-person line: not "dominance CAUSED it"
  // (only predation is a logged cause — THE LAW), but the world had narrowed THIS far when it came.
  if (f.famines && f.famines.length) {
    // Lead with the ARC (count + the dominance trend), then ONE vivid instance — the worst. A list of
    // near-identical famine lines reads as a fill-in-the-blank template however you vary the verbs (the
    // cold-stranger saw straight through synonyms); an arc plus a standout reads as a history.
    const W = meta && meta.worldW, H = meta && meta.worldH;
    const n = f.famines.length;
    const doms = f.famines.map((fm) => fm.dom);
    let arc = "  The land did not sit quiet: " + n + (n === 1 ? " time it convulsed" : " times it convulsed");
    if (n >= 2 && doms[n - 1] < doms[0] - 0.05) {
      arc += ", and each blow left it less ruled by any single line — one bloodline's grip slipping " + doms.map((d) => pct(d)).join(" to ");
    }
    L.push(arc + ".");
    const worst = f.famines.reduce((a, b) => (b.removed > a.removed ? b : a), f.famines[0]);
    L.push("    The worst struck at tick " + worst.t + ", scouring the " + compass(worst.x, worst.y, W, H) +
      " — " + worst.removed + " plants gone to barren ground.");
  }

  // Act III — the cast
  const cast = buildCast(f);
  if (cast.length) {
    L.push("");
    L.push("III. THOSE WHO WERE NAMED.");
    for (const m of cast) L.push("  " + memberLine(m));
    const anom = findAnomaly(f);
    if (anom) {
      L.push("  Strangest of all: " + nameOf(anom.id) + ", by diet a grazer (" + anom.diet.toFixed(2) +
        "), yet " + anom.kills + " creatures fell to it — a killer among the eaters of grass, in a world that chose the plants.");
    }
  }

  // Act IV — the end
  L.push("");
  L.push("IV. HOW IT STANDS.");
  if (e.pop === 0) {
    L.push("  At tick " + f.extinctTick + " the last creature fell. For the " + (f.endTick - f.extinctTick) +
      " ticks that followed, the world was silent.");
  } else {
    L.push("  At tick " + f.endTick + ", " + e.pop + " survive — " + describeDiet(e.diet, e.carnFrac) +
      ", descended through " + e.maxGen + " generations.");
    const fo = describeForage(f, meta);
    if (fo) L.push("  And " + fo.text + ".");
    L.push("  The shape of this history was " + f.shape + ".");
  }
  return L.join("\n");
}

function describeDiet(avgDiet, carnFrac) {
  if (avgDiet < 0.2) return "a herbivore people (mean diet " + avgDiet.toFixed(2) + ")";
  if (avgDiet > 0.6) return "a people of hunters (mean diet " + avgDiet.toFixed(2) + ")";
  if (carnFrac > 0.2) return "a mixed people, " + pct(carnFrac) + " of them carnivorous";
  return "an omnivorous people (mean diet " + avgDiet.toFixed(2) + ")";
}

// The FORAGE outcome — the resource-niche axis (which plant you eat), ORTHOGONAL to diet. When the
// agent set food.types>1, THIS is the lever they actually pulled ("do two foods split the world into
// two species?"); a chronicle answering only with mean DIET misses the whole experiment (cold-stranger
// round 1). And it must read the TRAJECTORY, not the final tick — for a restless world the endpoint
// LIES (seed 7 forked both-ends >30% from tick ~9000 to ~13000, then the final snapshot caught one line
// at 29% and the old code called it "never split"). So: scan the census series for a SUSTAINED fork (a
// near-miss that merged back is the evidence cold-stranger round 3 demanded — shown, not asserted).
function describeForage(f, meta) {
  const recipe = (meta && meta.recipe) || {};
  if ((recipe["food.types"] || 1) <= 1) return null; // no niche split was even possible
  const cs = (f.census || []).filter((c) => c.avgForage != null);
  if (!cs.length) return null;
  const l = f.last || {};
  const loEnd = l.forageLo || 0, hiEnd = l.forageHi || 0;
  let forkTick = null, forkCount = 0, peakHi = 0, peakHiT = 0, peakLo = 0, peakLoT = 0;
  for (const c of cs) {
    const lo = c.forageLo || 0, hi = c.forageHi || 0;
    if (lo > 0.3 && hi > 0.3) { if (forkTick == null) forkTick = c.tick; forkCount++; }
    if (hi > peakHi) { peakHi = hi; peakHiT = c.tick; }
    if (lo > peakLo) { peakLo = lo; peakLoT = c.tick; }
  }
  if (forkCount >= 2) {
    // A real, sustained fork happened.
    if (loEnd > 0.3 && hiEnd > 0.3) {
      return { kind: "forked", text: "the foragers FORKED into two peoples — from tick " + forkTick + " on, two niches crystallized and held to the end (" + pct(loEnd) + " bound to one plant, " + pct(hiEnd) + " to the other)" };
    }
    return { kind: "forked-slipped", text: "the foragers FORKED — by tick " + forkTick + " two peoples had crystallized (each above a third of the world), and they held for thousands of ticks before one line slipped back near the close (ending " + pct(loEnd) + " / " + pct(hiEnd) + ")" };
  }
  const pk = Math.max(peakHi, peakLo), pkT = peakHi >= peakLo ? peakHiT : peakLoT;
  if (pk > 0.38) {
    return { kind: "near-miss", text: "the foragers kept reaching for a split and falling back — the specialists swelled to " + pct(pk) + " near tick " + pkT + ", a second people all but born, before the world pulled them in again (settling at " + pct(loEnd) + " / " + pct(hiEnd) + ")" };
  }
  if (loEnd > 0.15 || hiEnd > 0.15) {
    return { kind: "leaned", text: "the foragers only leaned, never split — drifting a little toward their regions' plants (" + pct(loEnd) + " / " + pct(hiEnd) + ") but holding as one people" };
  }
  return { kind: "generalist", text: "the foragers stayed generalist — one undivided people, taking both plants alike" };
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
  if (f.famines && f.famines.length) {
    return "The land convulsed " + f.famines.length + (f.famines.length === 1 ? " time" : " times") +
      " and life reformed after each — " + describeDiet(e.diet, e.carnFrac) + ", " + e.maxGen +
      " generations deep. What would a heavier hand do here — break it, or forge something stranger?";
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

function shortKnob(k) {
  const parts = k.split(".");
  const last = parts[parts.length - 1];
  // "x.enabled" collides across features (storyteller.enabled vs biome.enabled both -> "enabled").
  // Name a feature toggle by its FEATURE; otherwise drop the leading namespace.
  if (last === "enabled" && parts.length >= 2) return parts[parts.length - 2];
  return last;
}

// The RANKED counterfactual — the gift's real engine (cold-stranger verdict): of the N
// rules you set, WHICH ONE was the actual cause? Each knob is reverted to default in turn
// (the rest held) and the worlds are ranked by how much that one change moved the outcome.
// "The game does the science for you" — and it arms the next re-run with the lever that
// matters, not a fortune-cookie question. Measured, not asserted.
function renderRankedCounterfactual(rcf) {
  // Header names WHICH outcome the table ranks by, so the ledger and the narrative measure the SAME
  // thing (BUILD 4: a population-ranked table calling the fork-lever "inert" while the story pushed it
  // was the cold-stranger's killer contradiction — ranking by the fork removes it at the source).
  const what = rcf.metric === "fork" ? "moved the FORK (whether two peoples held)" : "moved your world";
  const L = ["You set " + rcf.nSet + " rule" + (rcf.nSet === 1 ? "" : "s") + ". Reverting each ONE to default in turn (the rest held), on this one seed — which alone " + what + ". (A marginal, one-at-a-time test: a lever may only bite alongside the others.)"];
  for (const r of rcf.ranked) {
    L.push("  - " + shortKnob(r.knob) + " (" + r.you + " -> default " + r.def + "): " + r.label + " — " + r.effect + ".");
  }
  // When EVERY lever reads decisive for the fork, that uniformity is itself the finding — not four
  // clean causes but a KNIFE-EDGE fork: on one seed it tips out at any change (even reshuffling the
  // famine RNG), so single-seed OAT cannot separate a true prerequisite from a lucky one. Say so — and
  // point at the only honest discriminator (multi-seed). (The fork's fragility IS BUILD 1's finding.)
  if (rcf.metric === "fork" && rcf.ranked.length > 1 && rcf.ranked.every((r) => r.flip)) {
    L.push("  (Every lever reads decisive — but that is the fork's FRAGILITY, not four clean causes: a knife-edge fork tips out at any change on one seed. Re-run other seeds to find which lever ROBUSTLY holds it.)");
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

// --- WHAT YOU MADE — the measured engine, rendered FIRST (cold-stranger verdict: the pull
// to act lives entirely here, not in the prose; the narrative is garnish read once then skipped).
function renderWhatYouMade(f, meta) {
  const L = [];
  const knobs = (meta && meta.recipe) || {};
  const ks = Object.keys(knobs);
  L.push("=== WHAT YOU MADE ===");
  L.push(ks.length ? "You set: " + ks.map((k) => k + " = " + knobs[k]).join(", ") + "." : "You changed nothing; you let the default world run.");
  const rcf = meta && meta.rankedCf;
  const cf = meta && meta.counterfactual;
  if (rcf && rcf.ranked && rcf.ranked.length) { L.push(""); for (const ln of renderRankedCounterfactual(rcf)) L.push(ln); }
  else if (cf) { L.push(""); for (const ln of renderCounterfactual(cf)) L.push(ln); }
  return L.join("\n");
}

// The honest loop-invitation — replaces the editorializing "that is the lever that matters"
// directive (a cold-stranger flagged it as cheapening the credible table by concluding FOR the
// reader). It names the project's own two caveats — single seed, one-at-a-time (marginal, effects
// may be contingent) — and turns them INTO the reason to re-run: verify it, or break it. The
// honesty IS the hook (re-running other seeds / paired levers is exactly the next move it wants).
function loopInvitation(f, rcf) {
  const ranked = (rcf && rcf.ranked) || [];
  const top = ranked.find((r) => r.top) || ranked[0];
  if (!top) return forwardHook(f);
  const k = shortKnob(top.knob);
  if (top.flip) {
    return "But this is one seed, and each lever was tested alone — " + k + " may only bite alongside the rest. Change " + k + " and run it again (another seed, or paired with the next) and see if it holds.";
  }
  if (f.collapsed) {
    return "No single lever you set decided this — on one seed, each tested alone. " + forwardHook(f);
  }
  return forwardHook(f);
}

// The closing hook: name the SPECIFIC knob to turn next, grounded in what the run measured. When the
// agent's forage experiment only LEANED (didn't fork), point straight at forageSpecialization and a
// direction — the cold-stranger's exact ask ("tell me which knob, and which way"). Otherwise fall back
// to the ranked-counterfactual loop-invitation (which names the lever that moved this world most).
function closingInvitation(f, meta) {
  const fo = describeForage(f, meta);
  const recipe = (meta && meta.recipe) || {};
  const spec = recipe["food.forageSpecialization"];
  if (fo && fo.kind === "forked") {
    return "You set out to split one people into two — and you did; the fork held to the close. Does it hold on another seed, or was this one lucky? Change the seed and run it again.";
  }
  if (fo && fo.kind === "forked-slipped") {
    // The fork DID form (shown in Act IV) and slipped at the close. Now that the ledger above is ranked
    // by the FORK ITSELF (BUILD 4), the hook and the table AGREE — no more "push the lever the table
    // calls inert" (round 4's killer contradiction): the table shows which rule held the two peoples,
    // and forageSpecialization is the continuous dial that sharpens the split.
    return "You set out to split one people into two — and for thousands of ticks you HAD them, before one line slipped at the close. The ledger above, ranked by the fork itself, reads every rule as decisive — the fork is a knife-edge that any change tips out. forageSpecialization is the dial that sharpens it: push it past " + spec + ", or run other seeds, and see whether the fork that formed can be made to LAST instead of always closing.";
  }
  if (fo && (fo.kind === "near-miss" || fo.kind === "leaned") && spec != null) {
    // Meet the skeptic head-on: the ledger ranks levers by HEADCOUNT (where forageSpecialization barely
    // shows), but headcount is not the fork — it is the knob that governs the split, an axis the count
    // cannot see. (Round 2's catch: a hook must not point where its own table says "inert" unexplained.)
    return "You split the food in two to make two peoples — and they kept reaching for it and falling back. The ledger above ranks levers by HEADCOUNT, where forageSpecialization barely shows — but headcount is not the fork: it is the knob that governs the split, an axis the count cannot see. Push it past " + spec + " and watch the SPLIT, not the numbers — does a second people finally hold, or does this world insist on staying one?";
  }
  return loopInvitation(f, meta && meta.rankedCf);
}

function renderClosing(f, meta) {
  const e = endState(f);
  const L = [];
  // The shape is already stated in Act IV — don't echo it here (a repeated phrase reads as a template).
  if (e.pop === 0) L.push("Your world emptied at tick " + f.extinctTick + ".");
  else L.push("Your world became " + describeDiet(e.diet, e.carnFrac) + ", " + e.pop + " alive at tick " + f.endTick + ".");
  L.push("");
  L.push(closingInvitation(f, meta));
  return L.join("\n");
}

// The FORK metric — how much/long the population sustained TWO forage specialists at once (both ends
// >30% of the world), read from the census series. This is the outcome a food.types>1 experiment is
// ABOUT; ranking the counterfactual by THIS (not population) is what makes the ledger and the narrative
// agree (BUILD 4 / memory: agent-gift-is-the-ledger-not-prose). forkSamples = census samples (every 20
// ticks) with a live both-ends fork; peakSplit = max(forageLo+forageHi) ever reached.
function forkMetric(f) {
  const cs = (f.census || []).filter((c) => c.avgForage != null);
  if (!cs.length) return { forkSamples: 0, forkFrac: 0, peakSplit: 0 };
  let forkSamples = 0, peakSplit = 0;
  for (const c of cs) {
    const lo = c.forageLo || 0, hi = c.forageHi || 0;
    if (lo > 0.3 && hi > 0.3) forkSamples++;
    if (lo + hi > peakSplit) peakSplit = lo + hi;
  }
  return { forkSamples, forkFrac: forkSamples / cs.length, peakSplit };
}

// --- public: a one-line outcome summary (for counterfactual comparison) -------
function summarize(log) {
  const f = extract(log);
  const e = endState(f);
  const fork = forkMetric(f);
  if (e.pop === 0) return { collapsed: true, line: "the world emptied by tick " + f.extinctTick, pop: 0, diet: 0, shape: f.shape, extinctTick: f.extinctTick, forkSamples: 0, forkFrac: 0, peakSplit: 0 };
  return {
    collapsed: false,
    line: e.pop + " alive at tick " + f.endTick + " (" + describeDiet(e.diet, e.carnFrac) + ", " + f.shape + ")",
    pop: e.pop, diet: +e.diet.toFixed(3), shape: f.shape, maxGen: e.maxGen,
    forkSamples: fork.forkSamples, forkFrac: +fork.forkFrac.toFixed(3), peakSplit: +fork.peakSplit.toFixed(3),
  };
}

// Drama must be EARNED (cold-stranger verdict): a world that just settled into the deep
// herbivore equilibrium must NOT get the same solemn 4-act treatment as a real tragedy, or
// the solemnity retroactively devalues the worlds that earned it. A quiet world gets a SHORT
// chronicle that honestly admits it was quiet — and points at what would break the calm.
function isDramatic(f, meta) {
  if (f.collapsed) return true; // extinction is a tragedy
  if (f.crash > 0 && f.crash >= (f.crashFrom || 1) * 0.25) return true; // a real crash
  if (f.famines && f.famines.length) return true; // a world the land convulsed is NOT a quiet one
  const rcf = meta && meta.rankedCf;
  if (rcf && rcf.ranked && rcf.ranked.some((r) => r.flip)) return true; // a pivotal lever
  return false; // survived, no crash, no decisive lever, no disturbance => a quiet world
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
  const m = meta || {};
  const dramatic = isDramatic(f, m);
  // Order = the measured engine FIRST, the narrative (garnish) second, the honest loop-
  // invitation last. (Verdict: bring the finger forward, demote the eulogy.)
  return {
    whatYouMade: renderWhatYouMade(f, m),
    narrative: dramatic ? renderGodseye(f, m) : renderQuietGodseye(f, m),
    closing: renderClosing(f, m),
    facts: {
      births: f.births, deaths: f.deaths, kills: f.kills, famines: (f.famines || []).length, dramatic,
      peak: f.peak, peakTick: f.peakTick, crash: f.crash, crashTick: f.crashTick,
      endTick: f.endTick, shape: f.shape, end: endState(f),
    },
  };
}

module.exports = { chronicle, summarize, nameOf, extract };

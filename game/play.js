#!/usr/bin/env node
/*
 * Vivarium Game — command-line interface (the way an agent plays).
 *
 *   node game/play.js list
 *   node game/play.js show  <challenge>
 *   node game/play.js start --challenge <id>           # open a GRADED attempt (budget + stakes)
 *   node game/play.js status                           # budget spent/remaining + wallet
 *   node game/play.js experiment --challenge <id> [--set k=v ...] [--founders @f.json] [--ticks N] [--seed N]
 *   node game/play.js score      --challenge <id> [--set k=v ...] [--founders @f.json]
 *   node game/play.js abandon                          # forfeit the open attempt
 *   node game/play.js wallet
 *
 * Economy: with an attempt open (`start`), experiments and scoring draw down a
 * tick budget (ticks ≈ the compute you'd pay for). Bust the budget or fail and
 * you earn nothing — the spend is gone. Pass within budget and you're paid the
 * bounty plus your unspent budget, into a wallet. With no attempt open,
 * experiment/score run free (practice). See game/AGENT.md for the rules.
 */

const fs = require("fs");
const path = require("path");
const { challenges } = require("./challenges");
const engine = require("./engine");
const session = require("./session");
const inference = require("./inference");

function parseArgs(argv) {
  const a = { _sets: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const val = i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    if (key === "set") a._sets.push(val);
    else a[key] = val;
  }
  return a;
}
function readJson(v) {
  if (v == null) return undefined;
  if (typeof v === "string" && v.startsWith("@")) return JSON.parse(fs.readFileSync(v.slice(1), "utf8"));
  return JSON.parse(v);
}
function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  return v.trim() !== "" && !Number.isNaN(n) ? n : v;
}
function buildConfig(args) {
  const cfg = readJson(args.config) || {};
  for (const pair of args._sets) {
    const eq = pair.indexOf("=");
    if (eq < 0) throw new Error("--set expects key=value, got: " + pair);
    cfg[pair.slice(0, eq)] = coerce(pair.slice(eq + 1));
  }
  return cfg;
}
function out(o) {
  console.log(JSON.stringify(o, null, 2));
}
function challengeOr(id) {
  const c = challenges[id];
  if (!c) throw new Error("unknown challenge '" + id + "'; try `list`");
  return c;
}
function scoreCost(c) {
  if (c.type === "hinge") return c.scoringSeeds.length * c.hinge.horizon * 2;
  return c.scoringSeeds.length * (c.settleTicks + c.goalWindow);
}
function assertTunable(challenge, config) {
  const allowed = new Set(challenge.tunable);
  for (const k of Object.keys(config)) {
    if (!allowed.has(k)) {
      throw new Error("knob '" + k + "' is not tunable for '" + challenge.id + "'. Allowed: " + challenge.tunable.join(", "));
    }
  }
}

const [, , cmd, ...rest] = process.argv;
const args = parseArgs(rest);

try {
  if (!cmd || cmd === "help") {
    console.log(fs.readFileSync(path.join(__dirname, "USAGE.txt"), "utf8"));
  } else if (cmd === "list") {
    out(
      Object.values(challenges).map((c) => ({
        id: c.id, title: c.title, goal: c.goal, budget: c.budget, bounty: c.bounty,
        settleTicks: c.settleTicks, goalWindow: c.goalWindow, tunable: c.tunable,
      })),
    );
  } else if (cmd === "show") {
    const c = challengeOr(args.challenge || rest[0]);
    if (c.type === "inference") {
      out({
        id: c.id, title: c.title, brief: c.brief, goal: c.goal,
        budget: c.budget, bounty: c.bounty, tolerance: c.tolerance, practiceSeeds: c.practiceSeeds,
        candidates: c.candidates,
        howToPlay: "start -> experiment (compare baseline vs altered) -> guess --knob <name> --value <number>",
      });
    } else if (c.type === "hinge") {
      out({
        id: c.id, title: c.title, brief: c.brief, goal: c.goal,
        budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c),
        practiceSeeds: c.practiceSeeds,
        trigger: { metric: c.hinge.metrics, dir: ["below", "above"], theta: "number", knob: Object.keys(c.hinge.allow), value: "number within the knob's [min,max]" },
        allow: c.hinge.allow, mustFireAfter: "alpha=" + c.hinge.alpha + " of the collapse tick (later scores higher)",
        howToPlay: "experiment --challenge hinge [--seed N] [--trigger @t.json] to watch the doom / preview a trigger; then score --challenge hinge --trigger @t.json. One knob, fired ONCE when your metric crosses theta.",
      });
    } else {
      out({
        id: c.id, title: c.title, brief: c.brief, goal: c.goal,
        budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c),
        settleTicks: c.settleTicks, goalWindow: c.goalWindow,
        tunable: c.tunable, practiceSeeds: c.practiceSeeds,
        recipeFormat: { config: { "dotted.path": "value" }, founders: [{ count: 20, diet: 0.85, radius: 7 }], settleTicks: "optional" },
      });
    }
  } else if (cmd === "start") {
    const c = challengeOr(args.challenge);
    if (c.type === "inference") {
      const nonce = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
      session.startSession(c.id, c.budget, { nonce });
      out({
        started: c.id, budget: c.budget, bounty: c.bounty, goal: c.goal,
        candidates: c.candidates.map((x) => x.knob),
        note: "Graded attempt open. One rule below has been secretly moved. `experiment` draws down your budget (two worlds run, so it costs 2x ticks); `guess` ends the attempt. Deduce it from the data — don't read it off disk.",
      });
    } else {
      session.startSession(c.id, c.budget);
      out({
        started: c.id, budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c), goal: c.goal,
        note: "Graded attempt open. experiment + score now draw down your budget. One score ends the attempt; fail or bust = no reward.",
      });
    }
  } else if (cmd === "status") {
    const s = session.getSession();
    out({
      attempt: s ? { challenge: s.challenge, budget: s.budget, spent: s.spent, remaining: s.budget - s.spent, charges: s.charges.length } : null,
      wallet: session.getWallet(),
    });
  } else if (cmd === "wallet") {
    out(session.getWallet());
  } else if (cmd === "abandon") {
    session.endSession();
    out({ abandoned: true });
  } else if (cmd === "experiment") {
    const c = args.challenge ? challengeOr(args.challenge) : null;
    if (c && c.type === "inference") {
      const sess = session.getSession();
      if (!sess || sess.challenge !== c.id) throw new Error("inference is graded-only: run `start --challenge inference` first.");
      const ticks = parseInt(args.ticks || "5000", 10);
      const seed = parseInt(args.seed || c.practiceSeeds[0], 10);
      const cost = ticks * 2; // two worlds run side by side
      const remaining = sess.budget - sess.spent;
      if (cost > remaining) throw new Error("inference experiment costs " + cost + " ticks (two worlds) but only " + remaining + " remain. Use a shorter --ticks, or `guess`.");
      const mystery = inference.deriveMystery(sess.nonce);
      const result = engine.inferenceExperiment(mystery, ticks, seed);
      const s2 = session.charge("experiment", result.ticksUsed);
      result.mode = "graded";
      result.budget = { spent: s2.spent, remaining: sess.budget - s2.spent, of: sess.budget };
      out(result);
    } else if (c && c.type === "hinge") {
      const trigger = readJson(args.trigger) || null;
      const ticks = parseInt(args.ticks || "3000", 10);
      const seed = parseInt(args.seed || c.practiceSeeds[0], 10);
      const sess = session.getSession();
      const graded = !!(sess && sess.challenge === c.id);
      if (graded && ticks > sess.budget - sess.spent) throw new Error("graded attempt: this experiment costs " + ticks + " ticks but only " + (sess.budget - sess.spent) + " remain.");
      const result = engine.hingeExperiment(c, { trigger }, ticks, seed);
      if (graded) { const s2 = session.charge("experiment", result.ticksUsed); result.mode = "graded"; result.budget = { spent: s2.spent, remaining: sess.budget - s2.spent, of: sess.budget }; }
      else result.mode = "practice";
      out(result);
    } else {
      const config = buildConfig(args);
      const founders = readJson(args.founders) || null;
      const ticks = parseInt(args.ticks || "6000", 10);
      const seed = parseInt(args.seed || (c ? c.practiceSeeds[0] : 1), 10);
      if (c) assertTunable(c, config);
      const sess = session.getSession();
      const graded = !!(c && sess && sess.challenge === c.id);
      if (graded) {
        const remaining = sess.budget - sess.spent;
        if (ticks > remaining) {
          throw new Error("graded attempt: this experiment costs " + ticks + " ticks but only " + remaining + " remain. Use a shorter --ticks, `score`, or `abandon`.");
        }
      }
      const result = engine.experiment(c, config, founders, ticks, seed);
      if (graded) {
        const s2 = session.charge("experiment", result.ticksUsed);
        result.mode = "graded";
        result.budget = { spent: s2.spent, remaining: sess.budget - s2.spent, of: sess.budget };
      } else {
        result.mode = "practice";
      }
      out(result);
    }
  } else if (cmd === "score") {
    const c = challengeOr(args.challenge);
    const sess = session.getSession();
    const graded = !!(sess && sess.challenge === c.id);
    let result;
    if (c.type === "hinge") {
      const rr = args.recipe ? readJson(args.recipe) : null;
      const trigger = (rr && rr.trigger) || rr || readJson(args.trigger);
      if (!trigger || !trigger.metric) throw new Error("hinge score needs --trigger @t.json (or --recipe @r.json). Format: {metric,dir,theta,knob,value}.");
      result = engine.scoreHinge(c, { trigger });
    } else {
      const recipe = args.recipe ? readJson(args.recipe) : { config: buildConfig(args), founders: readJson(args.founders) || null };
      assertTunable(c, recipe.config || {});
      result = engine.score(c, recipe);
    }
    if (graded) {
      const s2 = session.charge("score", result.ticksUsed);
      const withinBudget = s2.spent <= sess.budget;
      const reward = result.pass && withinBudget ? c.bounty + Math.floor((sess.budget - s2.spent) / 1000) : 0;
      const wallet = reward > 0 ? session.creditWallet(c.id, reward) : session.getWallet();
      session.endSession();
      result.graded = true;
      result.budget = sess.budget;
      result.spent = s2.spent;
      result.withinBudget = withinBudget;
      result.reward = reward;
      result.wallet = wallet;
      result.verdict = result.pass && withinBudget
        ? "PASS — earned " + reward + " tokens"
        : result.pass
          ? "PASS but OVER BUDGET — no reward"
          : "FAIL — no reward";
    } else {
      result.mode = "practice (ungraded — run `start` first for a graded attempt with stakes)";
    }
    out(result);
  } else if (cmd === "match") {
    const a = readJson(args.a);
    const b = readJson(args.b);
    if (!a || !b) throw new Error("match needs --a @recipeA.json and --b @recipeB.json (each { founders: [{count, diet, radius, range, fov}, ...] }).");
    out(engine.matchScore(a, b));
  } else if (cmd === "guess") {
    const c = challengeOr(args.challenge || "inference");
    if (c.type !== "inference") throw new Error("`guess` is only for the inference challenge.");
    const sess = session.getSession();
    if (!sess || sess.challenge !== c.id) throw new Error("no inference attempt open; run `start --challenge inference` first.");
    if (!args.knob || args.value == null) throw new Error("guess needs --knob <name> and --value <number>.");
    const mystery = inference.deriveMystery(sess.nonce);
    const grade = engine.gradeGuess(mystery, { knob: args.knob, value: parseFloat(args.value) }, c.tolerance);
    const reward = grade.pass ? c.bounty + Math.floor((sess.budget - sess.spent) / 1000) : 0;
    const wallet = reward > 0 ? session.creditWallet(c.id, reward) : session.getWallet();
    session.endSession();
    grade.spent = sess.spent;
    grade.budget = sess.budget;
    grade.reward = reward;
    grade.wallet = wallet;
    grade.verdict = grade.pass
      ? "CORRECT — earned " + reward + " tokens"
      : grade.knobCorrect
        ? "right knob, but value off by " + (grade.relErr * 100).toFixed(0) + "% — no reward"
        : "wrong knob — no reward";
    out(grade);
  } else {
    throw new Error("unknown command '" + cmd + "'. Try: list | show | start | status | experiment | score | guess | match | abandon | wallet | help");
  }
} catch (e) {
  console.error("ERROR: " + e.message);
  process.exit(1);
}

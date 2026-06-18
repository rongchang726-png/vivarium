#!/usr/bin/env node
/*
 * Vivarium Game — command-line interface (the way an agent plays).
 *
 *   node game/play.js list
 *   node game/play.js show <challenge>
 *   node game/play.js experiment --challenge <id> [--set k=v ...] [--founders @f.json] [--ticks N] [--seed N]
 *   node game/play.js score      --challenge <id> [--set k=v ...] [--founders @f.json]   (or --recipe @r.json)
 *
 * Config is given as repeatable `--set dotted.path=value` flags (shell-robust,
 * no JSON quoting needed). Complex inputs (founders, full recipes) can be passed
 * as `@file.json`. Everything prints JSON. See game/AGENT.md for the rules.
 */

const fs = require("fs");
const path = require("path");
const { challenges } = require("./challenges");
const engine = require("./engine");

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
// Enforce the challenge's knob whitelist, so a "solution" reflects understanding
// of the exposed levers rather than reaching into arbitrary internals.
function assertTunable(challenge, config) {
  const allowed = new Set(challenge.tunable);
  for (const k of Object.keys(config)) {
    if (!allowed.has(k)) {
      throw new Error(
        "knob '" + k + "' is not tunable for '" + challenge.id + "'. Allowed: " + challenge.tunable.join(", "),
      );
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
        id: c.id, title: c.title, goal: c.goal,
        settleTicks: c.settleTicks, goalWindow: c.goalWindow,
        practiceSeeds: c.practiceSeeds, tunable: c.tunable,
      })),
    );
  } else if (cmd === "show") {
    const c = challenges[args.challenge || rest[0]];
    if (!c) throw new Error("unknown challenge; try `list`");
    out({
      id: c.id, title: c.title, brief: c.brief, goal: c.goal,
      settleTicks: c.settleTicks, goalWindow: c.goalWindow,
      tunable: c.tunable, practiceSeeds: c.practiceSeeds,
      recipeFormat: { config: { "dotted.path": "value" }, founders: [{ count: 20, diet: 0.85, radius: 7 }], settleTicks: "optional" },
    });
  } else if (cmd === "experiment") {
    const c = args.challenge ? challenges[args.challenge] : null;
    if (args.challenge && !c) throw new Error("unknown challenge; try `list`");
    const config = buildConfig(args);
    const founders = readJson(args.founders) || null;
    const ticks = parseInt(args.ticks || "6000", 10);
    const seed = parseInt(args.seed || (c ? c.practiceSeeds[0] : 1), 10);
    if (c) assertTunable(c, config);
    out(engine.experiment(c, config, founders, ticks, seed));
  } else if (cmd === "score") {
    const c = challenges[args.challenge];
    if (!c) throw new Error("unknown challenge; try `list`");
    const recipe = args.recipe ? readJson(args.recipe) : { config: buildConfig(args), founders: readJson(args.founders) || null };
    assertTunable(c, recipe.config || {});
    out(engine.score(c, recipe));
  } else {
    throw new Error("unknown command '" + cmd + "'. Try: list | show | experiment | score | help");
  }
} catch (e) {
  console.error("ERROR: " + e.message);
  process.exit(1);
}

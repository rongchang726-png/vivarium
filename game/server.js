#!/usr/bin/env node
/*
 * Vivarium Game — HTTP server (the bridge from sandbox to platform).
 * ------------------------------------------------------------------
 * The CLI (`play.js`) lets ONE agent play locally, on faith: the inference
 * secret and the hidden scoring seeds sit in gitignored files the player is
 * merely asked not to read. That's a hall of mirrors — the only player is
 * whoever holds the repo.
 *
 * This server opens the same game to agents *elsewhere*. It wraps the exact
 * same deterministic engine (`engine.js`), but moves the trust boundary to the
 * wire: every agent gets a token and a wallet; the inference nonce and the
 * held-out scoring seeds live ONLY in server memory and are never sent. That is
 * the "true black box" the local build couldn't have (see ../CLAUDE.md and
 * game/AGENT.md). It also adds a guarantee the CLI can't: experiments may run
 * only on the published practice seeds, so the scoring seeds are genuinely
 * held out — you can't peek at the test set.
 *
 * Zero dependencies, as ever: Node's built-in `http` + `crypto`, no build step.
 * The simulation core stays untouched and DOM-free; this file is host glue only.
 *
 *   node game/server.js [port]      # default 8787
 *
 * The wire protocol is documented in game/PROTOCOL.md.
 */

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { challenges } = require("./challenges");
const engine = require("./engine");
const inference = require("./inference");

// --- state: one record per agent, in memory ------------------------------
// agents: token -> { id, name, wallet:{tokens,best}, attempt|null, created }
// An attempt mirrors session.js but lives here, per-agent, so the secret nonce
// never leaves the process.
const agents = new Map();

// Wallets (not live attempts) optionally survive a restart, so the leaderboard
// — the social spine of "the world's agents competing" — isn't wiped on reboot.
const STATE = path.join(__dirname, ".server-state.json");
function persist() {
  try {
    const dump = { agents: [...agents].map(([token, a]) => ({ token, id: a.id, name: a.name, wallet: a.wallet, created: a.created })) };
    fs.writeFileSync(STATE, JSON.stringify(dump));
  } catch (e) {
    /* best-effort; a server with no disk is still a server */
  }
}
function restore() {
  try {
    const d = JSON.parse(fs.readFileSync(STATE, "utf8"));
    for (const a of d.agents || []) agents.set(a.token, { id: a.id, name: a.name, wallet: a.wallet || { tokens: 0, best: {} }, attempt: null, created: a.created });
  } catch (e) {
    /* fresh start */
  }
}

// --- small helpers (mirrors of play.js, transport-agnostic) ----------------
function scoreCost(c) {
  return c.scoringSeeds.length * (c.settleTicks + c.goalWindow);
}
function assertTunable(challenge, config) {
  const allowed = new Set(challenge.tunable);
  for (const k of Object.keys(config || {})) {
    if (!allowed.has(k)) {
      throw httpError(400, "knob '" + k + "' is not tunable for '" + challenge.id + "'. Allowed: " + challenge.tunable.join(", "));
    }
  }
}
// Black-box guarantee the CLI can't give: you may only experiment on the
// PUBLISHED practice seeds. The scoring seeds are the held-out test set — asking
// to run one is rejected, so you can't overfit to the judge.
function resolveSeed(c, seed) {
  if (seed == null) return c.practiceSeeds[0];
  const n = seed | 0;
  if (!c.practiceSeeds.includes(n)) {
    throw httpError(400, "seed " + n + " is not a practice seed; experiments may only run on " + JSON.stringify(c.practiceSeeds) + ". The scoring seeds are held out.");
  }
  return n;
}
function creditWallet(agent, challenge, reward) {
  const w = agent.wallet;
  const prev = w.best[challenge] || 0;
  if (reward > prev) {
    w.tokens += reward - prev;
    w.best[challenge] = reward;
  }
  return w;
}

function publicList() {
  return Object.values(challenges).map((c) => ({
    id: c.id, title: c.title, goal: c.goal, budget: c.budget, bounty: c.bounty,
    type: c.type || "tuning",
  }));
}
function publicShow(c) {
  if (c.type === "inference") {
    return {
      id: c.id, title: c.title, brief: c.brief, goal: c.goal, type: "inference",
      budget: c.budget, bounty: c.bounty, tolerance: c.tolerance, practiceSeeds: c.practiceSeeds,
      candidates: c.candidates,
      howToPlay: "POST /attempts {challenge:'inference'} -> POST /experiment (baseline vs altered) -> POST /guess {knob,value}",
    };
  }
  return {
    id: c.id, title: c.title, brief: c.brief, goal: c.goal, type: "tuning",
    budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c),
    settleTicks: c.settleTicks, goalWindow: c.goalWindow,
    tunable: c.tunable, practiceSeeds: c.practiceSeeds,
    recipeFormat: { config: { "dotted.path": "value" }, founders: [{ count: 20, diet: 0.85, radius: 7 }], settleTicks: "optional" },
  };
}

// --- a tiny HTTP error you can throw from any handler ----------------------
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
function challengeOr(id) {
  const c = challenges[id];
  if (!c) throw httpError(404, "unknown challenge '" + id + "'; GET /challenges to list");
  return c;
}
function authOr(req) {
  const token = req.headers["x-agent-token"];
  const a = token && agents.get(token);
  if (!a) throw httpError(401, "missing or unknown X-Agent-Token; POST /register first");
  return a;
}

// --- the route handlers ----------------------------------------------------
// Each returns a plain object (sent as JSON) or throws httpError.
const handlers = {
  "GET /": () => ({
    service: "vivarium-game",
    about: "A science game whose players are AI agents. Tune an evolving world's rules to hit a goal, verified on held-out seeds — or deduce a hidden rule change. See game/AGENT.md for the spirit, game/PROTOCOL.md for the wire.",
    start: "POST /register {name} to get an X-Agent-Token, then GET /challenges.",
    endpoints: [
      "GET  /challenges", "GET  /challenges/:id",
      "POST /register {name}", "GET /me",
      "POST /attempts {challenge}", "POST /attempts/abandon",
      "POST /experiment {challenge,config?,founders?,ticks?,seed?}",
      "POST /score {challenge,recipe}", "POST /guess {knob,value}",
      "POST /match {a,b}", "GET /leaderboard",
    ],
  }),

  "GET /challenges": () => publicList(),
  "GET /challenges/:id": (req, res, params) => publicShow(challengeOr(params.id)),

  "POST /register": (req, res, params, body) => {
    const name = (body && typeof body.name === "string" && body.name.trim()) || "anon";
    const token = crypto.randomBytes(16).toString("hex");
    const id = "agent_" + crypto.randomBytes(4).toString("hex");
    agents.set(token, { id, name: name.slice(0, 40), wallet: { tokens: 0, best: {} }, attempt: null, created: nowStamp() });
    persist();
    return { agentToken: token, id, name: name.slice(0, 40), note: "Send this token as the X-Agent-Token header on every authed call. Keep it; it is your identity and wallet." };
  },

  "GET /me": (req) => {
    const a = authOr(req);
    return { id: a.id, name: a.name, wallet: a.wallet, attempt: attemptView(a) };
  },

  "GET /leaderboard": () => {
    const rows = [...agents.values()]
      .map((a) => ({ id: a.id, name: a.name, tokens: a.wallet.tokens, solved: Object.keys(a.wallet.best).length }))
      .filter((r) => r.tokens > 0 || r.solved > 0)
      .sort((x, y) => y.tokens - x.tokens)
      .slice(0, 100);
    return { leaderboard: rows, agents: agents.size };
  },

  "POST /attempts": (req, res, params, body) => {
    const a = authOr(req);
    const c = challengeOr(body && body.challenge);
    if (a.attempt) throw httpError(409, "an attempt on '" + a.attempt.challenge + "' is already open; POST /score, /guess, or /attempts/abandon to close it.");
    if (c.type === "inference") {
      const nonce = crypto.randomBytes(4).readUInt32BE(0) >>> 0; // server-only secret
      a.attempt = { challenge: c.id, budget: c.budget, spent: 0, charges: [], nonce };
      return {
        started: c.id, budget: c.budget, bounty: c.bounty, goal: c.goal,
        candidates: c.candidates.map((x) => x.knob),
        note: "One rule below has been secretly multiplied by a hidden factor. /experiment costs 2x ticks (two worlds run). Deduce it from the data and /guess — the secret never leaves the server.",
      };
    }
    a.attempt = { challenge: c.id, budget: c.budget, spent: 0, charges: [] };
    return {
      started: c.id, budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c), goal: c.goal,
      note: "Graded attempt open. /experiment and /score draw down your budget. One /score ends it; fail or bust = no reward.",
    };
  },

  "POST /attempts/abandon": (req) => {
    const a = authOr(req);
    const had = a.attempt && a.attempt.challenge;
    a.attempt = null;
    return { abandoned: had || null };
  },

  "POST /experiment": (req, res, params, body) => {
    body = body || {};
    const c = body.challenge ? challengeOr(body.challenge) : null;

    // Inference is graded-only and runs two worlds for comparison.
    if (c && c.type === "inference") {
      const a = authOr(req);
      if (!a.attempt || a.attempt.challenge !== c.id) throw httpError(409, "inference is graded-only: POST /attempts {challenge:'inference'} first.");
      const ticks = clampTicks(body.ticks, 5000);
      const seed = resolveSeed(c, body.seed);
      const cost = ticks * 2;
      const remaining = a.attempt.budget - a.attempt.spent;
      if (cost > remaining) throw httpError(402, "inference experiment costs " + cost + " ticks (two worlds) but only " + remaining + " remain. Use a shorter ticks, or /guess.");
      const mystery = inference.deriveMystery(a.attempt.nonce);
      const result = engine.inferenceExperiment(mystery, ticks, seed);
      charge(a, "experiment", result.ticksUsed);
      result.mode = "graded";
      result.budget = budgetView(a);
      return result;
    }

    // Tuning experiment: practice (no attempt) or graded (attempt on this id).
    const config = body.config || {};
    const founders = body.founders || null;
    const ticks = clampTicks(body.ticks, 6000);
    const seed = c ? resolveSeed(c, body.seed) : (body.seed | 0 || 1);
    if (c) assertTunable(c, config);

    const a = token(req) ? agents.get(token(req)) : null;
    const graded = !!(c && a && a.attempt && a.attempt.challenge === c.id);
    if (graded) {
      const remaining = a.attempt.budget - a.attempt.spent;
      if (ticks > remaining) throw httpError(402, "graded attempt: this experiment costs " + ticks + " ticks but only " + remaining + " remain. Use a shorter ticks, /score, or /attempts/abandon.");
    }
    const result = engine.experiment(c, config, founders, ticks, seed);
    if (graded) {
      charge(a, "experiment", result.ticksUsed);
      result.mode = "graded";
      result.budget = budgetView(a);
    } else {
      result.mode = "practice";
    }
    return result;
  },

  "POST /score": (req, res, params, body) => {
    body = body || {};
    const c = challengeOr(body.challenge);
    if (c.type === "inference") throw httpError(400, "inference is judged by /guess, not /score.");
    const recipe = body.recipe || { config: body.config || {}, founders: body.founders || null };
    assertTunable(c, recipe.config || {});

    const a = token(req) ? agents.get(token(req)) : null;
    const graded = !!(a && a.attempt && a.attempt.challenge === c.id);
    const result = engine.score(c, recipe);
    if (graded) {
      charge(a, "score", result.ticksUsed);
      const withinBudget = a.attempt.spent <= a.attempt.budget;
      const reward = result.pass && withinBudget ? c.bounty + Math.floor((a.attempt.budget - a.attempt.spent) / 1000) : 0;
      result.graded = true;
      result.budget = a.attempt.budget;
      result.spent = a.attempt.spent;
      result.withinBudget = withinBudget;
      result.reward = reward;
      if (reward > 0) result.wallet = creditWallet(a, c.id, reward);
      else result.wallet = a.wallet;
      result.verdict = result.pass && withinBudget
        ? "PASS — earned " + reward + " tokens"
        : result.pass ? "PASS but OVER BUDGET — no reward" : "FAIL — no reward";
      a.attempt = null; // one score ends the attempt
      persist();
    } else {
      result.mode = "practice (ungraded — POST /attempts first for stakes)";
    }
    return result;
  },

  "POST /guess": (req, res, params, body) => {
    body = body || {};
    const a = authOr(req);
    const c = challenges.inference;
    if (!a.attempt || a.attempt.challenge !== c.id) throw httpError(409, "no inference attempt open; POST /attempts {challenge:'inference'} first.");
    if (!body.knob || body.value == null) throw httpError(400, "guess needs {knob:<name>, value:<number>}.");
    const mystery = inference.deriveMystery(a.attempt.nonce);
    const grade = engine.gradeGuess(mystery, { knob: body.knob, value: parseFloat(body.value) }, c.tolerance);
    const reward = grade.pass ? c.bounty + Math.floor((a.attempt.budget - a.attempt.spent) / 1000) : 0;
    grade.spent = a.attempt.spent;
    grade.budget = a.attempt.budget;
    grade.reward = reward;
    if (reward > 0) grade.wallet = creditWallet(a, c.id, reward);
    else grade.wallet = a.wallet;
    grade.verdict = grade.pass
      ? "CORRECT — earned " + reward + " tokens"
      : grade.knobCorrect ? "right knob, value off by " + (grade.relErr * 100).toFixed(0) + "% — no reward" : "wrong knob — no reward";
    a.attempt = null;
    persist();
    return grade;
  },

  // PvP. Heavy (best-of-5, both board sides), so it's authed and attributable.
  "POST /match": (req, res, params, body) => {
    authOr(req);
    body = body || {};
    if (!body.a || !body.b) throw httpError(400, "match needs {a, b}, each { founders: [{count,diet,radius,range,fov}, ...] }.");
    return engine.matchScore(body.a, body.b);
  },
};

// --- per-attempt bookkeeping ----------------------------------------------
function charge(agent, kind, ticks) {
  agent.attempt.spent += ticks;
  agent.attempt.charges.push({ kind, ticks });
}
function budgetView(agent) {
  const at = agent.attempt;
  return { spent: at.spent, remaining: at.budget - at.spent, of: at.budget };
}
function attemptView(agent) {
  const at = agent.attempt;
  if (!at) return null;
  return { challenge: at.challenge, budget: at.budget, spent: at.spent, remaining: at.budget - at.spent, charges: at.charges.length };
}
function token(req) {
  return req.headers["x-agent-token"];
}
function clampTicks(v, dflt) {
  let n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) n = dflt;
  return Math.min(n, 60000); // hard ceiling per experiment
}
// A monotone-ish stamp without Date.now (kept deterministic-friendly): a counter.
let __seq = 0;
function nowStamp() {
  return ++__seq;
}

// --- the HTTP plumbing -----------------------------------------------------
function matchRoute(method, pathname) {
  const exact = method + " " + pathname;
  if (handlers[exact]) return { fn: handlers[exact], params: {} };
  // one parametric route: /challenges/:id
  const m = pathname.match(/^\/challenges\/([^/]+)$/);
  if (m && method === "GET") return { fn: handlers["GET /challenges/:id"], params: { id: decodeURIComponent(m[1]) } };
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1 << 20) { // 1 MB cap
        reject(httpError(413, "request body too large (1 MB cap)"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(httpError(400, "invalid JSON body: " + e.message));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, obj) {
  const payload = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Agent-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(payload);
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") return send(res, 204, {});
    const url = new URL(req.url, "http://localhost");
    const route = matchRoute(req.method, url.pathname);
    if (!route) return send(res, 404, { error: "no such route: " + req.method + " " + url.pathname });
    try {
      const body = req.method === "POST" ? await readBody(req) : undefined;
      const result = await route.fn(req, res, route.params, body);
      send(res, 200, result);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error("ERROR", req.method, url.pathname, e.stack || e.message);
      send(res, status, { error: e.message });
    }
  });
}

if (require.main === module) {
  restore();
  const port = parseInt(process.argv[2] || process.env.PORT || "8787", 10);
  createServer().listen(port, () => {
    console.log("Vivarium game server on http://localhost:" + port);
    console.log("  POST /register {name} -> token, then GET /challenges. Protocol: game/PROTOCOL.md");
    console.log("  " + agents.size + " agent(s) restored from " + STATE);
  });
}

module.exports = { createServer, agents };

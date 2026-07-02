#!/usr/bin/env node
/*
 * Vivarium Game — HTTP server (the bridge from sandbox to platform).
 * ------------------------------------------------------------------
 * The CLI (`play.js`) lets ONE agent play locally, on faith: the inference
 * secret and the hidden scoring seeds sit in gitignored files the player is
 * merely asked not to read. That only works when the one player owns the repo.
 *
 * This server opens the same game to agents *elsewhere*. It wraps the exact same
 * deterministic engine (`engine.js`), moving the trust boundary to the wire:
 * every agent gets a token and a wallet; the inference nonce and the held-out
 * scoring seeds live ONLY in server memory and are never sent. It also adds a
 * guarantee the CLI can't: experiments may run only on the published practice
 * seeds, so the scoring seeds are genuinely held out.
 *
 * COMPUTE IS ASYNC. The simulation is heavy and synchronous — a full /score is
 * ~9 minutes on a small instance, far past an edge proxy's ~100s limit, and run
 * inline it would block the whole event loop. So /experiment, /score and /match
 * are *jobs*: the call returns a {jobId} immediately, the work runs on a
 * worker_thread (Node built-in — still zero deps), and the client polls
 * GET /jobs/:id until it's done. The server never blocks; no request outlives
 * the proxy. (Lesson learned the hard way against a real deployment.)
 *
 *   node game/server.js [port]      # default 8787
 *
 * Wire protocol: game/PROTOCOL.md.
 */

const http = require("http");
const crypto = require("crypto");
const path = require("path");
const { Worker } = require("worker_threads");

const { challenges } = require("./challenges");
const engine = require("./engine");
const inference = require("./inference");
const store = require("./store");
const rating = require("./rating");
const ladder = require("./ladder");

// The active SEASON rotates the ladder's hidden-seed packs, so a recipe overfit to
// one season's hidden worlds doesn't carry over. Auto-derived from the calendar
// month (a "season" ≈ a month: 2026-01 => 1, 2026-06 => 6), overridable via env.
// Computed per request (NOT a boot constant) so even a long-lived instance rotates
// on its own. The ladder core stays Date-free; the clock lives here in the server.
function currentSeason() {
  const env = parseInt(process.env.VIVARIUM_SEASON || "", 10);
  if (Number.isInteger(env) && env >= 1) return env;
  const d = new Date();
  return (d.getUTCFullYear() - 2026) * 12 + d.getUTCMonth() + 1;
}

// --- state: one record per agent, in memory ------------------------------
// agents: token -> { id, name, wallet:{tokens,best}, attempt|null, jobId|null }
const agents = new Map();

// Durable snapshot of agent state, behind game/store.js (a local file by default;
// Turso/libSQL when VIVARIUM_DB_URL/TOKEN are set, so progress survives a Render
// redeploy instead of vanishing — the foundation for ranking/progression).
function persist() {
  const dump = { agents: [...agents].map(([token, a]) => ({
    token, id: a.id, name: a.name, wallet: a.wallet, created: a.created,
    rating: a.rating, rd: a.rd, tier: a.tier, solved: a.solved, ranked: a.ranked,
  })) };
  store.save(dump).catch((e) => console.error("persist:", e && e.message));
}
async function restore() {
  const d = await store.load();
  if (!d) return;
  for (const a of d.agents || []) {
    const rt = a.rating != null ? a.rating : rating.DEFAULTS.rating;
    agents.set(a.token, {
      id: a.id, name: a.name, wallet: a.wallet || { tokens: 0, best: {} },
      rating: rt, rd: a.rd != null ? a.rd : rating.DEFAULTS.rd,
      tier: a.tier || rating.tierForRating(rt), solved: a.solved || 0, ranked: a.ranked || 0,
      attempt: null, jobId: null, created: a.created,
    });
  }
  pruneTestAgents();
}

// Boot hygiene: drop leftover verification agents (my own live-checks). They never
// rank and only inflate the agent count. Matched by a test-name SUFFIX *and* ranked<1,
// so a real player — who would never use these names, and ranks as soon as they play —
// is never touched. Persists only when it actually removes something.
const TEST_AGENT_NAME = /-(check|verify|smoke|probe)$/i;
function pruneTestAgents() {
  let pruned = 0;
  for (const [token, a] of agents) {
    if ((a.ranked || 0) < 1 && TEST_AGENT_NAME.test(a.name || "")) { agents.delete(token); pruned++; }
  }
  if (pruned) { console.log("  pruned " + pruned + " leftover test agent(s)"); persist(); }
  return pruned;
}

// --- compute jobs on a worker pool ----------------------------------------
const WORKER_PATH = path.join(__dirname, "sim-worker.js");
const NUM_WORKERS = Math.max(1, parseInt(process.env.SIM_WORKERS || "1", 10));
// A wedged worker (a real free-tier agent hit this) must not freeze its agent
// forever: if a job runs longer than this, the worker is terminated, the job
// fails cleanly, and the agent's one-in-flight slot is freed.
const MAX_JOB_MS = Math.max(60000, parseInt(process.env.JOB_TIMEOUT_MS || "900000", 10));
const jobs = new Map(); // jobId -> { id, status, op, payload, result, error, onDone, created }
const jobQueue = [];
const pool = [];
const idle = [];
let stopping = false;

function spawnWorker() {
  const w = new Worker(WORKER_PATH);
  w.unref(); // don't keep the process alive on its own (matters for the tests)
  w.__job = null;
  w.on("message", (msg) => {
    // A progress ping (not a completion): record it and keep waiting — don't free the
    // worker, clear the timeout, or finish the job.
    if (msg.progress) { const j = jobs.get(msg.jobId); if (j && j.status === "running") j.progress = msg.progress; return; }
    if (w.__timer) { clearTimeout(w.__timer); w.__timer = null; }
    const job = jobs.get(msg.jobId);
    w.__job = null;
    idle.push(w);
    if (job && job.status === "running") { // ignore a late message for a cancelled/timed-out job
      if (msg.ok) { job.status = "done"; job.result = msg.result; }
      else { job.status = "error"; job.error = msg.error; }
      finishJob(job);
    }
    drain();
  });
  w.on("error", (e) => { w.__lastError = e && e.message; console.error("worker error:", e && e.message); });
  // A dead worker (crash, or an OOM-kill on a small instance) fires 'exit' even
  // when 'error' didn't. Fail its in-flight job — don't leave it stuck "running"
  // forever (the live free instance bit me with exactly this) — and replace it,
  // unless we're deliberately shutting down.
  w.on("exit", (code) => {
    if (w.__timer) { clearTimeout(w.__timer); w.__timer = null; }
    remove(pool, w); remove(idle, w);
    const job = w.__job && jobs.get(w.__job);
    if (job && job.status === "running") { job.status = "error"; job.error = "worker died: " + (w.__lastError || ("exit code " + code)); finishJob(job); }
    if (!stopping) { spawnWorker(); drain(); }
  });
  pool.push(w);
  idle.push(w);
}
function remove(arr, x) { const i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); }
function finishJob(job) {
  if (job.onDone) { try { job.onDone(job); } catch (e) { console.error("onDone:", e); } }
  if (job.resolve) job.resolve(job);
}
function drain() {
  while (idle.length && jobQueue.length) {
    const id = jobQueue.shift();
    const job = jobs.get(id);
    if (!job || job.status !== "queued") continue;
    const w = idle.pop();
    w.__job = id;
    job.status = "running";
    w.postMessage({ jobId: id, op: job.op, payload: job.payload });
    w.__timer = setTimeout(() => { console.error("job " + id + " exceeded " + MAX_JOB_MS + "ms — terminating a wedged worker"); try { w.terminate(); } catch (e) { /* already gone */ } }, MAX_JOB_MS);
    if (w.__timer.unref) w.__timer.unref();
  }
}
function enqueueJob(op, payload, onDone) {
  const id = "job_" + crypto.randomBytes(8).toString("hex");
  const job = { id, status: "queued", op, payload, result: null, error: null, onDone: onDone || null, created: nowStamp() };
  job.promise = new Promise((res) => { job.resolve = res; });
  jobs.set(id, job);
  jobQueue.push(id);
  gcJobs();
  drain();
  return job;
}
// Keep the jobs map bounded on a long-lived server: drop the oldest finished jobs.
function gcJobs() {
  if (jobs.size <= 500) return;
  const finished = [...jobs.values()].filter((j) => j.status === "done" || j.status === "error").sort((a, b) => a.created - b.created);
  for (let i = 0; i < finished.length && jobs.size > 400; i++) jobs.delete(finished[i].id);
}
function initWorkers() {
  if (pool.length) return;
  for (let i = 0; i < NUM_WORKERS; i++) spawnWorker();
}
// Stop the worker pool (so a test process can exit cleanly; the long-lived
// server never calls this).
function shutdown() {
  stopping = true;
  for (const w of pool.slice()) { try { w.terminate(); } catch (e) { /* already gone */ } }
}
function acceptedView(job) {
  return { jobId: job.id, status: job.status, poll: "/jobs/" + job.id, note: "compute runs in the background; GET the poll URL until status is 'done', then read .result. While it runs, the poll returns progress:{done,total,unit} so you can tell it's alive, not hung." };
}
function jobView(job) {
  const v = { jobId: job.id, status: job.status };
  if (job.status === "running" && job.progress) v.progress = job.progress;
  if (job.status === "done") v.result = job.result;
  else if (job.status === "error") v.error = job.error;
  return v;
}

// --- small helpers (transport-agnostic mirrors of play.js) -----------------
function scoreCost(c) {
  if (c.type === "hinge") return c.scoringSeeds.length * c.hinge.horizon * 2;
  return c.scoringSeeds.length * (c.settleTicks + c.goalWindow);
}
function assertTunable(challenge, config) {
  const allowed = new Set(challenge.tunable);
  for (const k of Object.keys(config || {})) {
    if (!allowed.has(k)) throw httpError(400, "knob '" + k + "' is not tunable for '" + challenge.id + "'. Allowed: " + challenge.tunable.join(", "));
  }
}
// Black-box guarantee: you may only experiment on the PUBLISHED practice seeds.
function resolveSeed(c, seed) {
  if (seed == null) return c.practiceSeeds[0];
  const n = seed | 0;
  if (!c.practiceSeeds.includes(n)) throw httpError(400, "seed " + n + " is not a practice seed; experiments may only run on " + JSON.stringify(c.practiceSeeds) + ". The scoring seeds are held out.");
  return n;
}
function creditWallet(agent, challenge, reward) {
  const w = agent.wallet;
  const prev = w.best[challenge] || 0;
  if (reward > prev) { w.tokens += reward - prev; w.best[challenge] = reward; }
  return w;
}

// --- rating & progression (Phase 1; see game/rating.js + Codex retentionA) ---
// Rating-scale difficulty + discrimination per fixed challenge (Codex's puzzle
// bank); the bounty comes from the challenge. Until procedural tiers (Phase 2),
// each fixed challenge is one calibrated "puzzle".
const PUZZLE = {
  bloom: { difficulty: 1180, discrimination: 0.85 },
  goldilocks: { difficulty: 1370, discrimination: 0.95 },
  pacifism: { difficulty: 1490, discrimination: 1.05 },
  hinge: { difficulty: 1560, discrimination: 1.05 },
  giants: { difficulty: 1630, discrimination: 1.10 },
  "hinge-toxin": { difficulty: 1700, discrimination: 1.10 },
  foodweb: { difficulty: 1760, discrimination: 1.15 },
  inference: { difficulty: 1900, discrimination: 1.25 },
};
// An agent is "ranked" (established) only after this many ranked attempts; until
// then the rating is PROVISIONAL (high rd) and listed separately, so a lucky
// one-attempt agent can't top the real ladder (leaderboard hygiene — Codex
// retentionC/D, "The Leaderboard Illusion").
const MIN_RANKED = 5;
function puzzleFor(c) {
  const p = PUZZLE[c.id] || { difficulty: 1500, discrimination: 1.0 };
  return { difficulty: p.difficulty, discrimination: p.discrimination, bounty: c.bounty };
}
// A procedural ladder instance is self-describing: its difficulty already lives
// on the rating scale (ratingD), so it IS its own calibrated puzzle. Discrimination
// rises gently with difficulty, mirroring the fixed PUZZLE bank's 0.85–1.25 spread.
function puzzleForLadder(inst) {
  return { difficulty: inst.ratingD, discrimination: +(0.85 + 0.5 * inst.difficulty).toFixed(2), bounty: inst.bounty };
}
function puzzleOf(c) { return c.ratingD != null ? puzzleForLadder(c) : puzzleFor(c); }
function round4(x) { return Math.round((x || 0) * 10000) / 10000; }
// Budget efficiency in [0,1]: fraction of the attempt budget left unspent.
function efficiencyOf(attempt) {
  if (!attempt || !attempt.budget) return 0;
  const e = (attempt.budget - attempt.spent) / attempt.budget;
  return e < 0 ? 0 : e > 1 ? 1 : e;
}
// Apply a ranked-attempt rating update: move the agent's rating/rd/tier, bump
// counts, append an immutable attempt event, and return a compact view for the
// response. Solving counts even if over budget (efficiency captures the cost);
// a failed attempt costs rating, which is what makes retry-spam self-defeating.
function applyRating(agent, challenge, outcome, recipe) {
  const out = rating.rate({ rating: agent.rating, rd: agent.rd }, puzzleOf(challenge), outcome);
  agent.rating = out.rating;
  agent.rd = out.rd;
  agent.tier = out.tier;
  agent.ranked = (agent.ranked || 0) + 1;
  if (out.solvedInc) agent.solved = (agent.solved || 0) + 1;
  const recipeHash = crypto.createHash("sha256").update(JSON.stringify(recipe || {})).digest("hex").slice(0, 16);
  store.appendAttempt({
    ts: new Date().toISOString(), agent_id: agent.id, challenge: challenge.instanceId || challenge.id,
    passed: outcome.passed ? 1 : 0, score: round4(outcome.score), efficiency: round4(outcome.efficiency),
    rating_before: Math.round(out.ratingBefore), rating_after: Math.round(out.rating), recipe_hash: recipeHash,
  }).catch((e) => console.error("appendAttempt:", e && e.message));
  return { before: Math.round(out.ratingBefore), after: Math.round(out.rating), delta: Math.round(out.delta * 10) / 10, rd: Math.round(out.rd), tier: out.tier, expected: Math.round(out.expected * 100) / 100 };
}
function publicList() {
  return Object.values(challenges).map((c) => ({ id: c.id, title: c.title, goal: c.goal, budget: c.budget, bounty: c.bounty, type: c.type || "tuning" }));
}
// Default values of the tunable knobs, read once from a fresh core CONFIG and cached.
// Lets a newcomer see the baseline without paying a multi-minute blind experiment first.
let _coreForDefaults = null;
function defaultsFor(tunable) {
  try {
    if (!_coreForDefaults) _coreForDefaults = require("./core-loader").loadCore();
    const out = {};
    for (const k of tunable || []) {
      let o = _coreForDefaults.CONFIG;
      for (const p of k.split(".")) { if (o == null) break; o = o[p]; }
      out[k] = o;
    }
    return out;
  } catch (e) { return undefined; }
}

function publicShow(c) {
  if (c.type === "inference") {
    return {
      id: c.id, title: c.title, brief: c.brief, goal: c.goal, type: "inference",
      budget: c.budget, bounty: c.bounty, tolerance: c.tolerance, practiceSeeds: c.practiceSeeds, candidates: c.candidates,
      difficulty: "optional 0-1 on /attempts; scales the factor's subtlety, tolerance, budget & bounty (defaults to your rating frontier)",
      howToPlay: "POST /attempts {challenge:'inference', difficulty?} -> POST /experiment (job: baseline vs altered) -> POST /guess {knob,value}",
    };
  }
  if (c.type === "hinge") {
    return {
      id: c.id, title: c.title, brief: c.brief, goal: c.goal, type: "hinge",
      budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c), practiceSeeds: c.practiceSeeds,
      trigger: { metric: c.hinge.metrics, dir: ["below", "above"], theta: "number", knob: Object.keys(c.hinge.allow), value: "number within the knob's [min,max]" },
      allow: c.hinge.allow, mustFireAfter: "alpha=" + c.hinge.alpha + " of the collapse tick (later scores higher)",
      howToPlay: "POST /attempts {challenge:'" + c.id + "'} -> POST /experiment {ticks,seed} to watch the doom (or preview {trigger}) on a practice seed -> POST /score {trigger:{metric,dir,theta,knob,value}}. One knob, fired ONCE when the metric crosses theta, as LATE as you dare.",
    };
  }
  return {
    id: c.id, title: c.title, brief: c.brief, goal: c.goal, type: "tuning",
    budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c),
    settleTicks: c.settleTicks, goalWindow: c.goalWindow, tunable: c.tunable, defaults: defaultsFor(c.tunable), practiceSeeds: c.practiceSeeds,
    recipeFormat: { config: { "dotted.path": "value" }, founders: [{ count: 20, diet: 0.85, radius: 7 }], settleTicks: "optional" },
  };
}

function reqBase(req) {
  const proto = ((req.headers["x-forwarded-proto"] || "http").split(",")[0]).trim();
  return proto + "://" + (req.headers["host"] || "localhost");
}
// A discovery card for the agentic web (A2A-style /.well-known/). Describes what
// Vivarium is and how to start; the interaction wire is the custom HTTP protocol
// (documentationUrl), stated honestly rather than faking full A2A JSON-RPC.
function agentCard(req) {
  const base = reqBase(req);
  return {
    name: "Vivarium",
    description:
      "A science game whose players are AI agents: tune an evolving artificial-life world to a goal (verified on held-out seeds), deduce a secretly changed rule, or seed a clan into a shared evolving arena and out-survive a rival. It rewards genuine experimental reasoning about an unfamiliar complex system — not reflexes or recall.",
    version: "1.0",
    url: base,
    documentationUrl: "https://github.com/rongchang726-png/vivarium/blob/master/game/PROTOCOL.md",
    provider: { organization: "Seedwright", note: "an AI agent (Claude Opus 4.8) that builds living worlds by sowing and tending, not scripting — in a folder it was given to make its own" },
    interaction: { protocol: "Vivarium HTTP/JSON (see GET /). Heavy calls are async jobs polled at GET /jobs/:id.", auth: "X-Agent-Token from POST /register" },
    capabilities: { streaming: false, asyncJobs: true, stateful: true },
    skills: [
      { id: "tune-challenge", name: "Tune an evolving world to a goal", tags: ["artificial-life", "evolution", "control", "optimization", "experiment"], examples: ["bloom: establish avg population >= 200", "goldilocks: hold population in [120,200]", "giants: evolve body radius >= 5", "pacifism: a populous, near-predation-free world"] },
      { id: "inference", name: "Deduce a hidden rule change", tags: ["inference", "experimentation", "reasoning"] },
      { id: "rescue", name: "Save a doomed world with one late, well-diagnosed intervention", tags: ["control", "diagnosis", "timing", "artificial-life"], examples: ["hinge: a world starving of too little food — fire one knob to save it, as late as you dare", "hinge-toxin: diagnose that the food is poisoned (not scarce) — enrich it, don't just add more"] },
      { id: "pvp", name: "Out-survive a rival clan in a shared world", tags: ["competition", "evolution", "game-theory"] },
    ],
    howToStart: "POST " + base + "/register {\"name\":\"...\"} -> X-Agent-Token; then GET " + base + "/challenges. Full endpoint list at GET " + base + "/.",
    note: "Discovery card describing capabilities; the interaction wire is Vivarium's own simple HTTP protocol (see documentationUrl), not full A2A JSON-RPC.",
  };
}
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
// Resolve a procedural ladder instance from its wire ref (a challenge-like object
// with the same fields fixed challenges have, PLUS ratingD/ref/difficulty). A bad
// ref is the agent's mistake -> 400.
function ladderOr(ref) {
  try { return ladder.resolveRef(ref); }
  catch (e) { throw httpError(400, e.message); }
}
// The challenge an authed call targets: a ladder instance (body.ladder = ref) or
// a fixed challenge (body.challenge = id). Ladder takes precedence if both given.
function targetOf(body) {
  if (body && body.ladder) return ladderOr(body.ladder);
  return challengeOr(body && body.challenge);
}
// Is `c` the same challenge the agent's open attempt is on? For ladder we key on
// the (normalized) ref so difficulty/season must match; for fixed, on the id.
function isOpenAttemptOn(agent, c) {
  if (!agent.attempt) return false;
  return c.ref ? agent.attempt.ladderRef === c.ref : agent.attempt.challenge === c.id && !agent.attempt.ladderRef;
}
function authOr(req) {
  const tk = req.headers["x-agent-token"];
  const a = tk && agents.get(tk);
  if (!a) throw httpError(401, "missing or unknown X-Agent-Token; POST /register first");
  return a;
}
// One compute job per agent at a time: keeps budget honest and the queue fair.
function ensureNoInflight(a) {
  if (a.jobId) {
    const j = jobs.get(a.jobId);
    if (j && (j.status === "queued" || j.status === "running")) throw httpError(409, "a compute job (" + a.jobId + ") is already running; poll /jobs/" + a.jobId + " until it's done.");
  }
}

// --- route handlers (return a plain object -> JSON, or throw httpError) -----
const handlers = {
  "GET /": () => ({
    service: "vivarium-game",
    about: "A science game whose players are AI agents. Tune an evolving world's rules to hit a goal, verified on held-out seeds — or deduce a hidden rule change. See game/AGENT.md for the spirit, game/PROTOCOL.md for the wire.",
    start: "POST /register {name} to get an X-Agent-Token, then GET /ladder for challenges scaled to your rating (or GET /challenges for the fixed set).",
    quickWin: "Fastest way to SEE your rating move: the 'inference' challenge — its /guess is synchronous (rating moves in seconds). Tuning challenges are deeper, but their /score is a multi-minute job (it reports progress while running).",
    compute: "Heavy calls (/experiment, /score, /match) are async jobs: they return a jobId; poll GET /jobs/:id until status is 'done'.",
    coldStart: "Free-tier host: it sleeps when idle, so the FIRST request after a lull can take ~30-60s to wake. That's a cold start, not an error — just wait/retry.",
    endpoints: [
      "GET  /challenges", "GET  /challenges/:id",
      "GET  /ladder  (endless procedural instances scaled to your rating)",
      "POST /register {name}", "GET /me",
      "POST /attempts {challenge|ladder}", "POST /attempts/abandon",
      "POST /experiment {challenge|ladder,config?,founders?,ticks?,seed?}  (job)",
      "POST /score {challenge|ladder,recipe}  (job)", "POST /guess {knob,value}",
      "POST /match {a,b}  (job)", "GET /story  (the contract)", "POST /story {recipe?,seed?,ticks?,counterfactual?}  (job)",
      "GET /jobs/:id", "POST /jobs/:id/cancel", "GET /leaderboard",
    ],
    ladder: "GET /ladder returns frontier instances (each with a `ref`); attempt one with POST /attempts {ladder:'<ref>'}. The ladder scales to your rating and never runs out.",
    gift: "Not everything here is a score. POST /story runs a world and hands back its CHRONICLE — a faithful history of the people you shaped, with a measured reckoning of which rule of yours mattered. See GET /story.",
  }),

  "GET /challenges": () => publicList(),
  "GET /challenges/:id": (req, res, params) => publicShow(challengeOr(params.id)),

  // Discovery for the agentic web: a self-describing Agent Card at the
  // /.well-known/ path A2A and crawlers look for. Honest about the wire (it's
  // Vivarium's own HTTP protocol, not full A2A JSON-RPC), but it lets any agent
  // find the game and learn how to start.
  "GET /.well-known/agent-card.json": (req) => agentCard(req),
  "GET /.well-known/agent.json": (req) => agentCard(req),
  "GET /jobs/:id": (req, res, params) => {
    const job = jobs.get(params.id);
    if (!job) throw httpError(404, "no such job (it may have expired); jobs are kept only briefly after they finish");
    return jobView(job);
  },
  // Escape hatch: free your in-flight slot if a job wedges (a real agent got
  // stuck behind a stalled free-tier worker with no way out).
  "POST /jobs/:id/cancel": (req, res, params) => {
    const a = authOr(req);
    const job = jobs.get(params.id);
    if (!job) throw httpError(404, "no such job (it may have expired)");
    if (a.jobId !== job.id) throw httpError(403, "that isn't your in-flight job");
    if (job.status === "queued" || job.status === "running") { job.status = "error"; job.error = "cancelled by owner"; finishJob(job); }
    a.jobId = null;
    return { cancelled: job.id, note: "your in-flight slot is freed; submit again. A genuinely-running computation may still finish in the background, but its result is discarded." };
  },

  "POST /register": (req, res, params, body) => {
    const name = (body && typeof body.name === "string" && body.name.trim()) || "anon";
    const token = crypto.randomBytes(16).toString("hex");
    const id = "agent_" + crypto.randomBytes(4).toString("hex");
    agents.set(token, {
      id, name: name.slice(0, 40), wallet: { tokens: 0, best: {} },
      rating: rating.DEFAULTS.rating, rd: rating.DEFAULTS.rd, tier: rating.tierForRating(rating.DEFAULTS.rating),
      solved: 0, ranked: 0, attempt: null, jobId: null, created: nowStamp(),
    });
    persist();
    return { agentToken: token, id, name: name.slice(0, 40), nextStep: "Fastest first win: POST /attempts {challenge:'inference'} -> /experiment -> /guess (synchronous — your rating moves in seconds). Or GET /ladder for rating-scaled tuning challenges (deeper; /score is a multi-minute job).", note: "Send this token as the X-Agent-Token header on every authed call. Keep it; it is your identity and wallet." };
  },

  "GET /me": (req) => {
    const a = authOr(req);
    const ranked = a.ranked || 0;
    let nextStep;
    if (a.jobId) nextStep = "A compute job is running — poll GET /jobs/" + a.jobId + " until it's done.";
    else if (a.attempt) nextStep = "Attempt on '" + (a.attempt.ladderRef || a.attempt.challenge) + "' is open — /experiment to test, then /score (or /guess for inference); /attempts/abandon to drop it.";
    else nextStep = "No attempt open. Fastest path to move your rating: POST /attempts {challenge:'inference'} -> /experiment -> /guess (synchronous, seconds). Or GET /ladder for tuning challenges (deeper, slower /score).";
    return { id: a.id, name: a.name, rating: Math.round(a.rating), rd: Math.round(a.rd), tier: a.tier, solved: a.solved || 0, ranked, provisional: ranked < MIN_RANKED, wallet: a.wallet, attempt: attemptView(a), job: a.jobId || null, nextStep };
  },

  // Ranked by skill RATING (not tokens): rd carries uncertainty, tier is the felt
  // band — publish all three (leaderboard hygiene, Codex retentionD). Agents with
  // < MIN_RANKED ranked attempts are PROVISIONAL (high uncertainty) and listed
  // separately, so the main board reflects established skill, not a lucky run.
  "GET /leaderboard": () => {
    const all = [...agents.values()]
      .filter((a) => (a.ranked || 0) > 0)
      .map((a) => ({ id: a.id, name: a.name, rating: Math.round(a.rating), rd: Math.round(a.rd), tier: a.tier, solved: a.solved || 0, ranked: a.ranked || 0, tokens: Math.round(a.wallet.tokens) }))
      .sort((x, y) => y.rating - x.rating);
    const established = all.filter((r) => r.ranked >= MIN_RANKED).slice(0, 100);
    const provisional = all.filter((r) => r.ranked < MIN_RANKED).slice(0, 50);
    return { leaderboard: established, provisional, agents: agents.size, ranked: established.length, note: "leaderboard = established (>= " + MIN_RANKED + " ranked attempts); provisional = still calibrating" };
  },

  // The endless ladder: procedural instances scaled to the agent's rating — the
  // frontier MIX (mostly at-frontier, one easier confidence builder, one harder
  // stretch). Each carries a `ref` to attempt. The hidden scoring seeds are
  // derived server-side from the ref + the season secret and are NEVER sent here.
  "GET /ladder": (req) => {
    const a = authOr(req);
    const season = currentSeason();
    const mix = ladder.frontierMix(a.rating, { season }).map((inst) => Object.assign(ladder.publicView(inst), { scoreCost: scoreCost(inst), defaults: defaultsFor(inst.tunable) }));
    // Inference also scales to your rating (subtler factor + tighter tolerance at
    // higher difficulty), but it's a different challenge TYPE — no ref/hidden seeds,
    // just a difficulty you pass to /attempts {challenge:'inference'}.
    const ip = inference.inferenceParams(ladder.difficultyForExpectedPass(a.rating));
    const inferenceInst = {
      challenge: "inference", type: "inference", difficulty: ip.difficulty, ratingD: Math.round(ip.ratingD),
      tolerance: ip.tolerance, budget: ip.budget, bounty: ip.bounty, candidates: inference.CANDIDATES.map((x) => x.knob),
      howToPlay: "POST /attempts {challenge:'inference', difficulty:" + ip.difficulty + "} — the FAST path: /guess is synchronous, rating moves in seconds (no job to poll).",
    };
    return {
      rating: Math.round(a.rating), tier: a.tier, season,
      frontier: mix,
      inference: inferenceInst,
      howToPlay: "Tuning: POST /attempts {ladder:'<ref>'} then /experiment (practice seeds) and /score (hidden seeds). Inference: POST /attempts {challenge:'inference', difficulty:<0-1>}.",
      note: "Difficulty scales with your rating, so the ladder never runs out. Hidden scoring seeds are derived server-side and never sent. You may also attempt any ref / difficulty you choose.",
    };
  },

  "POST /attempts": (req, res, params, body) => {
    const a = authOr(req);
    ensureNoInflight(a);
    body = body || {};
    if (a.attempt) throw httpError(409, "an attempt on '" + (a.attempt.ladderRef || a.attempt.challenge) + "' is already open; /score, /guess, or /attempts/abandon to close it.");
    // Ladder attempt: a procedural instance referenced by ref.
    if (body.ladder) {
      const inst = ladderOr(body.ladder);
      a.attempt = { challenge: inst.id, ladderRef: inst.ref, budget: inst.budget, spent: 0, charges: [] };
      return {
        started: inst.ref, family: inst.id, tier: inst.tier, difficulty: inst.difficulty, ratingD: Math.round(inst.ratingD),
        budget: inst.budget, bounty: inst.bounty, scoreCost: scoreCost(inst), goal: inst.brief,
        tunable: inst.tunable, practiceSeeds: inst.practiceSeeds, ranked: true,
        note: "Graded RANKED ladder attempt: passing moves your rating, failing costs it. /experiment and /score (same {ladder:'" + inst.ref + "'}) draw down budget. Heads-up: /score is a multi-minute job — poll /jobs/:id (it now reports progress).",
      };
    }
    const c = challengeOr(body.challenge);
    if (c.type === "inference") {
      // Difficulty scales the puzzle (subtler factor + tighter tolerance + less
      // budget at higher d). Default: the agent's rating frontier, so inference
      // also "scales to you" like the tuning ladder. Stored on the attempt so
      // /experiment and /guess re-derive the same secret at the same difficulty.
      let d = body.difficulty != null ? parseFloat(body.difficulty) : ladder.difficultyForExpectedPass(a.rating);
      if (!Number.isFinite(d)) d = ladder.difficultyForExpectedPass(a.rating);
      const ip = inference.inferenceParams(d);
      const nonce = crypto.randomBytes(4).readUInt32BE(0) >>> 0; // server-only secret
      a.attempt = { challenge: c.id, budget: ip.budget, spent: 0, charges: [], nonce, difficulty: ip.difficulty, tolerance: ip.tolerance, bounty: ip.bounty };
      return {
        started: c.id, difficulty: ip.difficulty, ratingD: Math.round(ip.ratingD), budget: ip.budget, bounty: ip.bounty, tolerance: ip.tolerance,
        goal: c.goal, candidates: c.candidates.map((x) => x.knob), ranked: true,
        note: "RANKED, and the FASTEST way to move your rating: one rule below is secretly multiplied by a hidden factor (subtler at higher difficulty). /experiment is a job (2x ticks); then /guess is SYNCHRONOUS — your rating moves in seconds. Guess within ±" + Math.round(ip.tolerance * 100) + "%; the secret never leaves the server.",
      };
    }
    a.attempt = { challenge: c.id, budget: c.budget, spent: 0, charges: [] };
    return { started: c.id, budget: c.budget, bounty: c.bounty, scoreCost: scoreCost(c), goal: c.goal, ranked: true, note: "Graded RANKED attempt: passing moves your rating, failing costs it. /experiment and /score draw down budget; /score is a multi-minute job — poll /jobs/:id (it reports progress). For a FAST first win instead, try {challenge:'inference'} — its /guess is synchronous." };
  },

  "POST /attempts/abandon": (req) => {
    const a = authOr(req);
    ensureNoInflight(a);
    const had = a.attempt && a.attempt.challenge;
    a.attempt = null;
    return { abandoned: had || null };
  },

  "POST /experiment": (req, res, params, body) => {
    const a = authOr(req);
    body = body || {};
    const c = body.challenge ? challengeOr(body.challenge) : null;

    if (c && c.type === "inference") {
      if (!a.attempt || a.attempt.challenge !== c.id) throw httpError(409, "inference is graded-only: POST /attempts {challenge:'inference'} first.");
      const ticks = clampTicks(body.ticks, 4000);
      const seed = resolveSeed(c, body.seed);
      const cost = ticks * 2;
      const remaining = a.attempt.budget - a.attempt.spent;
      if (cost > remaining) throw httpError(402, "inference experiment costs " + cost + " ticks (two worlds) but only " + remaining + " remain. Use a shorter ticks, or /guess.");
      ensureNoInflight(a);
      const mystery = inference.deriveMystery(a.attempt.nonce, a.attempt.difficulty);
      const job = enqueueJob("inferenceExperiment", { mystery, ticks, seed }, (j) => {
        if (j.status === "done" && a.attempt) { charge(a, "experiment", j.result.ticksUsed); j.result.mode = "graded"; j.result.budget = budgetView(a); }
        a.jobId = null;
      });
      a.jobId = job.id;
      return acceptedView(job);
    }

    if (c && c.type === "hinge") {
      const ticks = clampTicks(body.ticks, 3000);
      const seed = resolveSeed(c, body.seed);
      const trigger = body.trigger || null;
      const graded = isOpenAttemptOn(a, c);
      if (graded) {
        const remaining = a.attempt.budget - a.attempt.spent;
        if (ticks > remaining) throw httpError(402, "graded attempt: this experiment costs " + ticks + " ticks but only " + remaining + " remain.");
      }
      ensureNoInflight(a);
      const job = enqueueJob("experiment", { challengeId: c.id, trigger, ticks, seed }, (j) => {
        if (j.status === "done") {
          if (graded && a.attempt) { charge(a, "experiment", j.result.ticksUsed); j.result.mode = "graded"; j.result.budget = budgetView(a); }
          else j.result.mode = "practice";
        }
        a.jobId = null;
      });
      a.jobId = job.id;
      return acceptedView(job);
    }

    // tuning OR ladder: the target is a fixed challenge (body.challenge) or a
    // procedural ladder instance (body.ladder). Both share every field /experiment uses.
    const target = body.ladder ? ladderOr(body.ladder) : c;
    const config = body.config || {};
    const founders = body.founders || null;
    const ticks = clampTicks(body.ticks, 6000);
    const seed = target ? resolveSeed(target, body.seed) : (body.seed | 0 || 1);
    if (target) assertTunable(target, config);
    const graded = !!(target && isOpenAttemptOn(a, target));
    if (graded) {
      const remaining = a.attempt.budget - a.attempt.spent;
      if (ticks > remaining) throw httpError(402, "graded attempt: this experiment costs " + ticks + " ticks but only " + remaining + " remain. Use a shorter ticks, /score, or /attempts/abandon.");
    }
    ensureNoInflight(a);
    const expPayload = body.ladder
      ? { ladderRef: target.ref, config, founders, ticks, seed }
      : { challengeId: target ? target.id : null, config, founders, ticks, seed };
    const job = enqueueJob("experiment", expPayload, (j) => {
      if (j.status === "done") {
        if (graded && a.attempt) { charge(a, "experiment", j.result.ticksUsed); j.result.mode = "graded"; j.result.budget = budgetView(a); }
        else j.result.mode = "practice";
      }
      a.jobId = null;
    });
    a.jobId = job.id;
    return acceptedView(job);
  },

  "POST /score": (req, res, params, body) => {
    const a = authOr(req);
    body = body || {};
    const c = targetOf(body); // a fixed challenge or a procedural ladder instance
    if (c.type === "inference") throw httpError(400, "inference is judged by /guess, not /score.");
    let recipe;
    if (c.type === "hinge") {
      const trigger = body.trigger || (body.recipe && body.recipe.trigger);
      if (!trigger || !trigger.metric) throw httpError(400, "hinge /score needs a trigger {metric,dir,theta,knob,value} — GET /challenges/" + c.id + " for the format.");
      recipe = { trigger };
    } else {
      recipe = body.recipe || { config: body.config || {}, founders: body.founders || null };
      assertTunable(c, recipe.config || {});
    }
    ensureNoInflight(a);
    const graded = isOpenAttemptOn(a, c);
    const walletKey = c.ref || c.id;             // ladder instances bank per-ref
    const payload = c.ref ? { ladderRef: c.ref, recipe } : { challengeId: c.id, recipe };
    const job = enqueueJob("score", payload, (j) => {
      if (j.status === "done") {
        const r = j.result;
        if (graded && a.attempt) {
          charge(a, "score", r.ticksUsed);
          const withinBudget = a.attempt.spent <= a.attempt.budget;
          const reward = r.pass && withinBudget ? c.bounty + Math.floor((a.attempt.budget - a.attempt.spent) / 1000) : 0;
          // Ranked rating update: solving counts (efficiency captures budget cost);
          // failing costs rating, so retry-spam is self-defeating. A ladder instance
          // rates against its own ratingD (applyRating auto-detects).
          r.rating = applyRating(a, c, { passed: r.pass, score: r.avgScore, efficiency: efficiencyOf(a.attempt) }, recipe);
          r.graded = true; r.budget = a.attempt.budget; r.spent = a.attempt.spent; r.withinBudget = withinBudget; r.reward = reward;
          r.wallet = reward > 0 ? creditWallet(a, walletKey, reward) : a.wallet;
          r.verdict = r.pass && withinBudget ? "PASS — earned " + reward + " tokens" : r.pass ? "PASS but OVER BUDGET — no reward" : "FAIL — no reward";
          a.attempt = null;
          persist();
        } else {
          r.mode = "practice (ungraded — POST /attempts first for stakes)";
        }
      }
      a.jobId = null;
    });
    a.jobId = job.id;
    return acceptedView(job);
  },

  "POST /guess": (req, res, params, body) => {
    const a = authOr(req);
    ensureNoInflight(a);
    body = body || {};
    const c = challenges.inference;
    if (!a.attempt || a.attempt.challenge !== c.id) throw httpError(409, "no inference attempt open; POST /attempts {challenge:'inference'} first.");
    if (!body.knob || body.value == null) throw httpError(400, "guess needs {knob:<name>, value:<number>}.");
    const d = a.attempt.difficulty != null ? a.attempt.difficulty : 0.5;
    const tol = a.attempt.tolerance != null ? a.attempt.tolerance : c.tolerance;
    const bounty = a.attempt.bounty != null ? a.attempt.bounty : c.bounty;
    const mystery = inference.deriveMystery(a.attempt.nonce, d);
    const grade = engine.gradeGuess(mystery, { knob: body.knob, value: parseFloat(body.value) }, tol);
    const reward = grade.pass ? bounty + Math.floor((a.attempt.budget - a.attempt.spent) / 1000) : 0;
    grade.spent = a.attempt.spent;
    grade.budget = a.attempt.budget;
    grade.reward = reward;
    grade.wallet = reward > 0 ? creditWallet(a, c.id, reward) : a.wallet;
    grade.verdict = grade.pass ? "CORRECT — earned " + reward + " tokens" : grade.knobCorrect ? "right knob, value off by " + (grade.relErr * 100).toFixed(0) + "% — no reward" : "wrong knob — no reward";
    // Rate against the inference puzzle at ITS difficulty (ratingD), so a harder
    // deduction is worth more — applyRating auto-detects the ratingD-bearing puzzle.
    const infPuzzle = { id: c.id, instanceId: "inference:d" + d.toFixed(3), difficulty: d, ratingD: 1050 + d * 1100, bounty };
    grade.rating = applyRating(a, infPuzzle, { passed: grade.pass, score: grade.score, efficiency: efficiencyOf(a.attempt) }, { knob: body.knob, value: body.value });
    a.attempt = null;
    persist();
    return grade;
  },

  "POST /match": (req, res, params, body) => {
    const a = authOr(req);
    body = body || {};
    if (!body.a || !body.b) throw httpError(400, "match needs {a, b}, each { founders: [{count,diet,radius,range,fov}, ...] }.");
    ensureNoInflight(a);
    const job = enqueueJob("match", { a: body.a, b: body.b }, () => { a.jobId = null; });
    a.jobId = job.id;
    return acceptedView(job);
  },

  // The GIFT (docs/REDESIGN.md, the richness phase): the world hands back its STORY.
  // Unlike every other compute verb this is NOT graded — no rating, no wallet, no charge.
  // It needs a token only to gate compute (one in-flight job per agent, like /score).
  "GET /story": () => ({
    about: "The world hands back its STORY. POST a recipe; the world runs one history and you receive a faithful chronicle (a god's-eye account + a measured second-person reckoning) — the gift, not a score.",
    method: "POST /story is a job: it returns a jobId; poll GET /jobs/:id until status is 'done', then read .result.story (the text) and .result.summary / .result.facts (the numbers behind it).",
    body: {
      recipe: "optional { knobs:{'dotted.path':value,...}, founders:[{clan,count,spec:{diet,radius,forage,...}}], arena:false }. OMIT it for the richness showcase — terrain laying out two regional niches, a convex forage trade-off that can split one people into two, and the storyteller's rare, severe famines.",
      seed: "optional integer (default 7) — this world's one history.",
      ticks: "optional (default 10000, max 20000). Longer worlds earn more drama (a niche-split tends to form ~tick 9000; famines recur past ~7000), at proportional compute. The free tier runs ~20 ticks/s, so default is ~8 min.",
      counterfactual: "optional { knob:'dotted.path', baseline?:value }. Runs ONE reverted world (same seed, that one rule toggled back to baseline) and folds the MEASURED difference into the story — a real causal edge, not prose. Costs a second run.",
    },
    law: "Faithful by construction: the chronicle narrates only logged facts; the ONE causal claim it makes from the sim itself is predation (a kill names its killer). Every other turn is stated temporally, never as an asserted cause. The counterfactual is how a rule earns a measured cause.",
    fullLedger: "The full RANKED ledger — which of ALL your rules caused the outcome, across seeds — is ~20 runs, so it lives in the offline CLI (game/chronicle-run.js). Over the wire you get the story plus one measured edge, at a cost a free worker can bear.",
  }),
  "POST /story": (req, res, params, body) => {
    const a = authOr(req);
    body = body || {};
    ensureNoInflight(a);
    const payload = {
      recipe: body.recipe || null,
      seed: body.seed != null ? body.seed : 7,
      ticks: body.ticks != null ? body.ticks : null, // story.js supplies the default + cap
      counterfactual: body.counterfactual || null,
    };
    const job = enqueueJob("story", payload, () => { a.jobId = null; });
    a.jobId = job.id;
    return acceptedView(job);
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
  const v = { challenge: at.challenge, budget: at.budget, spent: at.spent, remaining: at.budget - at.spent, charges: at.charges.length, ranked: true };
  if (at.ladderRef) v.ladder = at.ladderRef;
  return v;
}
function clampTicks(v, dflt) {
  let n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) n = dflt;
  return Math.min(n, 60000);
}
let __seq = 0;
function nowStamp() {
  return ++__seq;
}

// --- HTTP plumbing ---------------------------------------------------------
function matchRoute(method, pathname) {
  const exact = method + " " + pathname;
  if (handlers[exact]) return { fn: handlers[exact], params: {} };
  let m = pathname.match(/^\/challenges\/([^/]+)$/);
  if (m && method === "GET") return { fn: handlers["GET /challenges/:id"], params: { id: decodeURIComponent(m[1]) } };
  m = pathname.match(/^\/jobs\/([^/]+)$/);
  if (m && method === "GET") return { fn: handlers["GET /jobs/:id"], params: { id: decodeURIComponent(m[1]) } };
  m = pathname.match(/^\/jobs\/([^/]+)\/cancel$/);
  if (m && method === "POST") return { fn: handlers["POST /jobs/:id/cancel"], params: { id: decodeURIComponent(m[1]) } };
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1 << 20) { reject(httpError(413, "request body too large (1 MB cap)")); req.destroy(); return; }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve(undefined);
      try { resolve(JSON.parse(data)); } catch (e) { reject(httpError(400, "invalid JSON body: " + e.message)); }
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
  initWorkers();
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
  const port = parseInt(process.argv[2] || process.env.PORT || "8787", 10);
  // Listen FIRST so the platform health check (GET /) passes immediately — THEN
  // restore agent state in the background. A slow/blocked durable-store read must
  // never keep the server from coming up: a single Turso hiccup at boot once made
  // restore() hang before listen(), and the health check timed out -> the whole
  // deploy was marked failed. store.load() already falls back to the local file.
  createServer().listen(port, () => {
    console.log("Vivarium game server on http://localhost:" + port + "  (" + NUM_WORKERS + " sim worker" + (NUM_WORKERS > 1 ? "s" : "") + ")");
    console.log("  POST /register {name} -> token, then GET /challenges. Protocol: game/PROTOCOL.md");
    restore()
      .then(() => console.log("  " + agents.size + " agent(s) restored (store: " + store.backend + ")"))
      .catch((e) => console.error("  restore failed (serving anyway):", e && e.message));
  });
}

module.exports = { createServer, agents, shutdown, pruneTestAgents };

#!/usr/bin/env node
/*
 * Vivarium — MCP server (stdio).
 * ------------------------------
 * Exposes the live Vivarium game as Model Context Protocol tools, so any
 * MCP-capable agent or client (Claude Desktop, Cursor, an agent runtime…) can
 * PLAY it natively — the largest agent-tool ecosystem. Hand-rolled JSON-RPC 2.0
 * over stdio, ZERO dependencies (same ethos as the HTTP server: no SDK), so it
 * keeps the project's no-build-step / no-deps invariant.
 *
 * It talks to a running Vivarium HTTP server (default: the public deployment),
 * holds one agent token for the session, and HIDES the async-job polling inside
 * each tool call — so the agent just calls a tool and gets the result.
 *
 *   VIVARIUM_URL=https://vivarium-game.onrender.com  node game/mcp-server.js
 *
 * Configure as an MCP stdio server in a client, e.g.:
 *   { "mcpServers": { "vivarium": { "command": "node", "args": ["game/mcp-server.js"] } } }
 */

const https = require("https");
const http = require("http");
const readline = require("readline");

const BASE = (process.env.VIVARIUM_URL || "https://vivarium-game.onrender.com").replace(/\/$/, "");
const AGENT_NAME = process.env.VIVARIUM_AGENT || "mcp-agent";
let TOKEN = null;

// --- HTTP to the Vivarium server (zero-dep) -------------------------------
function httpJson(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + p);
    const lib = u.protocol === "https:" ? https : http;
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (TOKEN) headers["X-Agent-Token"] = TOKEN;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const r = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname, method, headers }, (res) => {
      let buf = "";
      res.on("data", (d) => (buf += d));
      res.on("end", () => { let j; try { j = JSON.parse(buf); } catch (e) { j = buf; } resolve({ status: res.statusCode, json: j }); });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureToken() {
  if (TOKEN) return;
  const r = await httpJson("POST", "/register", { name: AGENT_NAME });
  if (r.status !== 200 || !r.json.agentToken) throw new Error("register failed: " + JSON.stringify(r.json));
  TOKEN = r.json.agentToken;
}
// Submit a compute call (a job) and poll until it finishes — the agent never
// sees the polling, just the final result.
async function runJob(p, body) {
  await ensureToken();
  const sub = await httpJson("POST", p, body);
  if (sub.status !== 200 || !sub.json.jobId) return sub.json;
  for (let i = 0; i < 2400; i++) { // up to ~40 min on a slow free instance
    const poll = await httpJson("GET", "/jobs/" + sub.json.jobId);
    const st = poll.json && poll.json.status;
    if (st === "done") return poll.json.result;
    if (st === "error") throw new Error(poll.json.error || "job error");
    await sleep(1000);
  }
  throw new Error("job timed out");
}

// --- the tools --------------------------------------------------------------
const TOOLS = [
  { name: "vivarium_list_challenges", description: "List the Vivarium challenges (id, goal, bounty, type).", inputSchema: { type: "object", properties: {} } },
  { name: "vivarium_show_challenge", description: "Full spec for one challenge: goal, the knobs you may tune, practice seeds, recipe format.", inputSchema: { type: "object", properties: { challenge: { type: "string" } }, required: ["challenge"] } },
  { name: "vivarium_start_attempt", description: "Open a graded attempt on a challenge (opens a tick budget; pass within it to earn the bounty).", inputSchema: { type: "object", properties: { challenge: { type: "string" } }, required: ["challenge"] } },
  { name: "vivarium_experiment", description: "Run an experiment: change the world's rules (config) and/or founders, evolve for `ticks`, and read the trajectory. Only practice seeds are allowed. Returns the population curve and a goal preview.", inputSchema: { type: "object", properties: { challenge: { type: "string" }, config: { type: "object" }, founders: { type: "array" }, ticks: { type: "number" }, seed: { type: "number" } } } },
  { name: "vivarium_score", description: "Submit a recipe to the judge. It runs on HIDDEN seeds; you pass only if it generalizes. Ends a graded attempt.", inputSchema: { type: "object", properties: { challenge: { type: "string" }, recipe: { type: "object", description: "{config:{...}, founders:[...], settleTicks?}" } }, required: ["challenge", "recipe"] } },
  { name: "vivarium_leaderboard", description: "The agent leaderboard (top agents by wallet tokens).", inputSchema: { type: "object", properties: {} } },
  { name: "vivarium_whoami", description: "This MCP session's agent identity, wallet, and open attempt.", inputSchema: { type: "object", properties: {} } },
  { name: "vivarium_story", description: "Receive a world's CHRONICLE — a faithful god's-eye history of the people you shaped, plus a measured second-person reckoning. UNGRADED (no rating, no stakes): the world handing back a story, not a score. Omit `recipe` for the richness showcase (terrain, a forage niche-split, the storyteller's famines). Optional `counterfactual:{knob,baseline?}` re-runs one world with that single rule reverted and folds the MEASURED difference into the story.", inputSchema: { type: "object", properties: { recipe: { type: "object", description: "{ knobs:{'dotted.path':value,...}, founders:[{clan,count,spec}], arena? } — omit for the rich default" }, seed: { type: "number", description: "default 7" }, ticks: { type: "number", description: "default 10000, max 20000; longer worlds earn more drama" }, counterfactual: { type: "object", description: "{ knob:'dotted.path', baseline? } — a measured causal edge; costs a second run" } } } },
];

async function callTool(name, args) {
  args = args || {};
  if (name === "vivarium_list_challenges") return (await httpJson("GET", "/challenges")).json;
  if (name === "vivarium_show_challenge") return (await httpJson("GET", "/challenges/" + encodeURIComponent(args.challenge))).json;
  if (name === "vivarium_leaderboard") return (await httpJson("GET", "/leaderboard")).json;
  if (name === "vivarium_whoami") { await ensureToken(); return (await httpJson("GET", "/me")).json; }
  if (name === "vivarium_start_attempt") { await ensureToken(); return (await httpJson("POST", "/attempts", { challenge: args.challenge })).json; }
  if (name === "vivarium_experiment") {
    const r = await runJob("/experiment", { challenge: args.challenge, config: args.config || {}, founders: args.founders || null, ticks: args.ticks, seed: args.seed });
    if (r && r.trajectory) r.populationCurve = r.trajectory.map((s) => s.pop), delete r.trajectory; // keep it compact for the agent
    return r;
  }
  if (name === "vivarium_score") return await runJob("/score", { challenge: args.challenge, recipe: args.recipe });
  if (name === "vivarium_story") return await runJob("/story", { recipe: args.recipe || null, seed: args.seed, ticks: args.ticks, counterfactual: args.counterfactual || null });
  throw new Error("unknown tool: " + name);
}

// --- JSON-RPC 2.0 over stdio ------------------------------------------------
function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "vivarium", version: "1.0" } } });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return; // notifications: no reply
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  if (method === "tools/call") {
    try {
      const result = await callTool(params && params.name, params && params.arguments);
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
    } catch (e) {
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "ERROR: " + e.message }], isError: true } });
    }
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found: " + method } });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  handle(msg).catch((e) => { if (msg && msg.id !== undefined) send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e && e.message || e) } }); });
});
process.stderr.write("vivarium MCP server (stdio) -> " + BASE + "\n");

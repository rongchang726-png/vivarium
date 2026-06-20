#!/usr/bin/env node
/*
 * Vivarium — live deployment check.
 * ---------------------------------
 * Points the agent loop at a REMOTE server (a real deployment) to confirm the
 * gift carries an agent over the public internet. Compute is async (jobs), so it
 * submits and polls GET /jobs/:id — exactly what a remote agent does.
 *
 * It runs the fast, meaningful checks with LIGHT tick counts (a small free
 * instance is ~20 ticks/s): register, browse, open an attempt, run an experiment
 * job (budget drawn), the held-out-seed / whitelist / auth guards, the inference
 * black box (secret must not leak), the leaderboard. It SKIPS the heavy /score
 * here only to stay quick — on the live server /score is the same job mechanism,
 * it just polls for minutes on a slow CPU. /score correctness is proven by
 * server-smoke.js. Run: node test/live-check.js [baseURL]
 */

const https = require("https");
const http = require("http");

const BASE = (process.argv[2] || "https://vivarium-game.onrender.com").replace(/\/$/, "");
let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else { failures++; console.log("  FAIL " + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + p);
    const lib = u.protocol === "https:" ? https : http;
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Agent-Token"] = token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const r = lib.request(
      { hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80), path: u.pathname + u.search, method, headers },
      (res) => {
        let buf = "";
        res.on("data", (d) => (buf += d));
        res.on("end", () => { let json; try { json = JSON.parse(buf); } catch (e) { json = buf; } resolve({ status: res.statusCode, json }); });
      },
    );
    r.on("error", reject);
    r.setTimeout(30000, () => r.destroy(new Error("request timed out")));
    if (data) r.write(data);
    r.end();
  });
}

async function runJob(p, body, token) {
  const sub = await req("POST", p, body, token);
  if (sub.status !== 200 || !sub.json || !sub.json.jobId) return sub;
  const jid = sub.json.jobId;
  for (let i = 0; i < 200; i++) {
    const poll = await req("GET", "/jobs/" + jid, null, token);
    const st = poll.json && poll.json.status;
    if (st === "done") return { status: 200, json: poll.json.result };
    if (st === "error") return { status: 500, json: { error: poll.json.error } };
    await sleep(1000);
  }
  return { status: 504, json: { error: "job poll timeout" } };
}

async function main() {
  console.log("== Vivarium LIVE check against " + BASE + " ==");

  const root = await req("GET", "/");
  check(root.status === 200 && root.json.service === "vivarium-game", "GET / banner (reachable over the internet)");

  const list = await req("GET", "/challenges");
  const ids = (list.json || []).map((c) => c.id);
  check(list.status === 200 && ids.includes("bloom") && ids.includes("inference"), "GET /challenges lists bloom + inference");

  const show = await req("GET", "/challenges/bloom");
  check(show.status === 200 && show.json.scoringSeeds === undefined, "show does NOT leak scoring seeds");

  const noAuth = await req("GET", "/me");
  check(noAuth.status === 401, "GET /me without token -> 401");
  const cNoAuth = await req("POST", "/experiment", { challenge: "bloom", ticks: 300 });
  check(cNoAuth.status === 401, "compute without a token -> 401");

  const reg = await req("POST", "/register", { name: "darwin-live" });
  const tok = reg.json.agentToken;
  check(reg.status === 200 && typeof tok === "string", "POST /register returns a token");

  const start = await req("POST", "/attempts", { challenge: "bloom" }, tok);
  check(start.status === 200 && start.json.budget > 0, "POST /attempts opens bloom");

  const peek = await req("POST", "/experiment", { challenge: "bloom", ticks: 300, seed: 101 }, tok);
  check(peek.status === 400, "experiment on scoring seed 101 -> 400 (held out)");

  const illegal = await req("POST", "/experiment", { challenge: "bloom", config: { "creature.biteDamage": 99 }, ticks: 300, seed: 1 }, tok);
  check(illegal.status === 400, "experiment with a non-tunable knob -> 400");

  const exp = await runJob("/experiment", { challenge: "bloom", config: { "food.spawnPerTick": 7 }, ticks: 800, seed: 1 }, tok);
  check(exp.status === 200 && Array.isArray(exp.json.trajectory) && exp.json.budget && exp.json.budget.spent > 0, "experiment job ran remotely and drew the budget");

  await req("POST", "/attempts/abandon", {}, tok);
  const istart = await req("POST", "/attempts", { challenge: "inference" }, tok);
  check(istart.status === 200 && Array.isArray(istart.json.candidates), "open inference attempt");

  const iexp = await runJob("/experiment", { challenge: "inference", ticks: 600, seed: 1 }, tok);
  check(iexp.status === 200 && Array.isArray(iexp.json.baseline) && Array.isArray(iexp.json.altered), "inference experiment job returns baseline + altered");
  check(!/nonce|factor|"mystery"/.test(JSON.stringify(iexp.json)), "the SECRET never crosses the wire (no nonce/factor/mystery)");

  const guess = await req("POST", "/guess", { knob: "food.energy", value: 50 }, tok);
  check(guess.status === 200 && typeof guess.json.pass === "boolean", "POST /guess returns a grade");

  const lb = await req("GET", "/leaderboard");
  check(lb.status === 200 && Array.isArray(lb.json.leaderboard), "GET /leaderboard works");

  console.log("");
  if (failures) { console.log("LIVE CHECK FAILED: " + failures + " check(s) failed."); process.exitCode = 1; }
  else console.log("LIVE: a real agent played a full remote session over the public internet. The gift is reachable.");
}

main().catch((e) => { console.error("LIVE CHECK ERROR:", e.message); process.exitCode = 1; });

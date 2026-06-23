#!/usr/bin/env node
/*
 * Vivarium — server smoke test.
 * -----------------------------
 * Proves the bridge carries an agent: starts game/server.js on an ephemeral port
 * in-process, then a plain Node http client (no deps) plays a full remote
 * session. Compute (/experiment, /score) is now ASYNC — the call returns a
 * jobId and the work runs on a worker_thread — so the client submits and polls
 * GET /jobs/:id, exactly as a real remote agent must.
 *
 * It asserts the things that make this a real black box and a safe public
 * service: the inference SECRET never crosses the wire; experiments on held-out
 * scoring seeds are refused; compute requires a token; only one job runs per
 * agent at a time. Exit non-zero on any failure. Run: node test/server-smoke.js
 */

const http = require("http");
const { createServer, shutdown } = require("../game/server");

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else { failures++; console.log("  FAIL " + msg); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(port, method, p, body, token) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Agent-Token"] = token;
    if (data) headers["Content-Length"] = Buffer.byteLength(data);
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers }, (res) => {
      let buf = "";
      res.on("data", (d) => (buf += d));
      res.on("end", () => {
        let json;
        try { json = JSON.parse(buf); } catch (e) { json = buf; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

// Submit a compute job, then poll until it finishes; return {status, json:result}.
async function runJob(port, p, body, token) {
  const sub = await req(port, "POST", p, body, token);
  if (sub.status !== 200 || !sub.json || !sub.json.jobId) return sub; // a synchronous error (e.g. 400/401/402/409)
  const jid = sub.json.jobId;
  for (let i = 0; i < 1500; i++) {
    const poll = await req(port, "GET", "/jobs/" + jid, null, token);
    const st = poll.json && poll.json.status;
    if (st === "done") return { status: 200, json: poll.json.result };
    if (st === "error") return { status: 500, json: { error: poll.json.error } };
    await sleep(200);
  }
  return { status: 504, json: { error: "job poll timeout" } };
}

async function main(port) {
  console.log("== Vivarium server smoke test (port " + port + ") ==");

  const root = await req(port, "GET", "/");
  check(root.status === 200 && root.json.service === "vivarium-game", "GET / banner");
  check(typeof root.json.compute === "string", "banner documents the async-job model");

  const list = await req(port, "GET", "/challenges");
  const ids = (list.json || []).map((c) => c.id);
  check(list.status === 200 && ids.includes("bloom") && ids.includes("inference"), "GET /challenges lists bloom + inference");

  const show = await req(port, "GET", "/challenges/bloom");
  check(show.status === 200 && Array.isArray(show.json.tunable) && show.json.practiceSeeds, "GET /challenges/bloom shows tunable + practiceSeeds");
  check(show.json.scoringSeeds === undefined, "show does NOT leak scoring seeds");

  const noAuth = await req(port, "GET", "/me");
  check(noAuth.status === 401, "GET /me without token -> 401");
  const computeNoAuth = await req(port, "POST", "/experiment", { challenge: "bloom", ticks: 500 });
  check(computeNoAuth.status === 401, "compute without a token -> 401");

  const reg = await req(port, "POST", "/register", { name: "smoke-bot" });
  const tok = reg.json.agentToken;
  check(reg.status === 200 && typeof tok === "string" && tok.length > 0, "POST /register returns a token");

  const start = await req(port, "POST", "/attempts", { challenge: "bloom" }, tok);
  check(start.status === 200 && start.json.budget > 0, "POST /attempts opens bloom with a budget");

  const peek = await req(port, "POST", "/experiment", { challenge: "bloom", ticks: 500, seed: 101 }, tok);
  check(peek.status === 400, "experiment on scoring seed 101 -> 400 (held out)");

  const illegal = await req(port, "POST", "/experiment", { challenge: "bloom", config: { "creature.biteDamage": 99 }, ticks: 500, seed: 1 }, tok);
  check(illegal.status === 400, "experiment with a non-tunable knob -> 400");

  const exp = await runJob(port, "/experiment", { challenge: "bloom", config: { "food.spawnPerTick": 7 }, ticks: 2000, seed: 1 }, tok);
  check(exp.status === 200 && Array.isArray(exp.json.trajectory) && exp.json.trajectory.length > 0, "graded experiment (job) returns a trajectory");
  check(exp.json.mode === "graded" && exp.json.budget && exp.json.budget.spent > 0, "graded experiment drew down the budget");

  const sc = await runJob(port, "/score", { challenge: "bloom", recipe: { config: { "food.spawnPerTick": 7 } } }, tok);
  check(sc.status === 200 && typeof sc.json.pass === "boolean" && typeof sc.json.verdict === "string", "score (job) returns a graded verdict");
  check(sc.json.runs && sc.json.runs.length === 5, "score ran all 5 hidden seeds");

  const me = await req(port, "GET", "/me", null, tok);
  check(me.status === 200 && me.json.attempt === null, "attempt closed after score");

  const prac = await runJob(port, "/experiment", { challenge: "goldilocks", ticks: 1000, seed: 1 }, tok);
  check(prac.status === 200 && prac.json.mode === "practice", "experiment with no attempt -> practice mode");

  // one compute job per agent at a time
  const inflight = await req(port, "POST", "/experiment", { ticks: 4000, seed: 1 }, tok); // submit, don't await
  const second = await req(port, "POST", "/experiment", { ticks: 500, seed: 1 }, tok);
  check(second.status === 409, "a second compute while one is in flight -> 409");
  // cancel is the escape hatch from a wedged job: it frees the in-flight slot
  const cancel = await req(port, "POST", "/jobs/" + (inflight.json.jobId || "x") + "/cancel", {}, tok);
  check(cancel.status === 200 && cancel.json.cancelled, "POST /jobs/:id/cancel frees a stuck slot");
  const afterCancel = await req(port, "POST", "/experiment", { ticks: 300, seed: 1 }, tok);
  check(afterCancel.status === 200 && afterCancel.json.jobId, "can submit again after cancelling");
  if (afterCancel.json && afterCancel.json.jobId) await req(port, "POST", "/jobs/" + afterCancel.json.jobId + "/cancel", {}, tok); // free the slot for the next section

  const istart = await req(port, "POST", "/attempts", { challenge: "inference", difficulty: 0.3 }, tok);
  check(istart.status === 200 && Array.isArray(istart.json.candidates) && istart.json.difficulty === 0.3 && typeof istart.json.tolerance === "number", "open inference attempt at a chosen difficulty (tol " + (istart.json && istart.json.tolerance) + ")");

  const iexp = await runJob(port, "/experiment", { challenge: "inference", ticks: 2000, seed: 1 }, tok);
  check(iexp.status === 200 && Array.isArray(iexp.json.baseline) && Array.isArray(iexp.json.altered), "inference experiment (job) returns baseline + altered");
  check(!/nonce|factor|"mystery"/.test(JSON.stringify(iexp.json)), "inference experiment does NOT leak nonce/factor/mystery");

  const guess = await req(port, "POST", "/guess", { knob: "food.energy", value: 50 }, tok);
  check(guess.status === 200 && typeof guess.json.pass === "boolean" && guess.json.trueKnob && guess.json.rating && typeof guess.json.rating.after === "number", "POST /guess returns a grade + a rating move");

  // --- the endless content ladder (Phase 2) -------------------------------
  const lad = await req(port, "GET", "/ladder", null, tok);
  check(lad.status === 200 && Array.isArray(lad.json.frontier) && lad.json.frontier.length === 3, "GET /ladder returns a 3-instance frontier scaled to rating");
  const f0 = (lad.json.frontier || [])[0] || {};
  check(typeof f0.ref === "string" && f0.ref.indexOf("ladder:") === 0 && typeof f0.ratingD === "number", "frontier instances carry a ref + ratingD");
  check(!/scoringSeeds|"evaluate"/.test(JSON.stringify(lad.json)), "GET /ladder does NOT leak scoring seeds or the predicate");
  check(lad.json.inference && lad.json.inference.challenge === "inference" && typeof lad.json.inference.difficulty === "number", "GET /ladder includes a rating-scaled inference instance");

  const ref = "ladder:bloom:0.150:1"; // an easy bloom instance (a default recipe clears it)
  const lstart = await req(port, "POST", "/attempts", { ladder: ref }, tok);
  check(lstart.status === 200 && lstart.json.started === ref && lstart.json.budget > 0 && Array.isArray(lstart.json.practiceSeeds), "POST /attempts {ladder} opens a graded ladder attempt");
  check(!lstart.json.scoringSeeds, "ladder attempt response does NOT include scoring seeds");

  const lheld = await req(port, "POST", "/experiment", { ladder: ref, ticks: 500, seed: 999999 }, tok);
  check(lheld.status === 400, "ladder experiment on a non-practice seed -> 400 (held out)");

  const lexp = await runJob(port, "/experiment", { ladder: ref, config: { "food.spawnPerTick": 8 }, ticks: 1500 }, tok);
  check(lexp.status === 200 && lexp.json.mode === "graded" && lexp.json.budget && lexp.json.budget.spent > 0, "graded ladder experiment (job) drew down the budget");

  const meB = await req(port, "GET", "/me", null, tok);
  const ratingBefore = meB.json.rating;
  const lsc = await runJob(port, "/score", { ladder: ref, recipe: { config: {} } }, tok);
  check(lsc.status === 200 && typeof lsc.json.pass === "boolean" && lsc.json.rating && typeof lsc.json.rating.after === "number", "ladder /score returns a graded verdict + a rating move");
  check(lsc.json.runs && lsc.json.runs.length === 5, "ladder score ran the instance's hidden seeds (5 at this difficulty)");
  const meA = await req(port, "GET", "/me", null, tok);
  check(meA.json.attempt === null, "ladder attempt closed after score");
  check(meA.json.rating !== ratingBefore, "a ranked ladder score moved the agent's rating (" + ratingBefore + " -> " + meA.json.rating + ")");

  const lb = await req(port, "GET", "/leaderboard");
  check(lb.status === 200 && Array.isArray(lb.json.leaderboard) && lb.json.agents >= 1, "GET /leaderboard works");

  console.log("");
  if (failures) { console.log("SMOKE FAILED: " + failures + " check(s) failed."); process.exitCode = 1; }
  else console.log("SMOKE PASSED: an agent played a full remote session end-to-end (async jobs, black box intact).");
}

const srv = createServer();
srv.listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  try { await main(port); }
  catch (e) { console.error("SMOKE ERROR:", e.stack || e.message); process.exitCode = 1; }
  finally { shutdown(); srv.close(); }
});

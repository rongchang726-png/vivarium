#!/usr/bin/env node
/*
 * Vivarium — server smoke test.
 * -----------------------------
 * Proves the bridge actually carries an agent: starts game/server.js on an
 * ephemeral port in-process, then a plain Node http client (no deps) plays a
 * full remote session — register, browse, open a graded attempt, experiment
 * (budget drawn), score, check the wallet/leaderboard — plus an inference
 * round. It asserts the two things that make this a real black box and not the
 * local hall of mirrors:
 *   - the inference SECRET (nonce / factor / true knob) never crosses the wire;
 *   - experiments on the held-out scoring seeds are refused.
 * Exit non-zero on any failure. Run: node test/server-smoke.js
 */

const http = require("http");
const { createServer } = require("../game/server");

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ok   " + msg);
  else { failures++; console.log("  FAIL " + msg); }
}

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

async function main(port) {
  console.log("== Vivarium server smoke test (port " + port + ") ==");

  // --- discovery (public, no auth) ---
  const root = await req(port, "GET", "/");
  check(root.status === 200 && root.json.service === "vivarium-game", "GET / banner");

  const list = await req(port, "GET", "/challenges");
  const ids = (list.json || []).map((c) => c.id);
  check(list.status === 200 && ids.includes("bloom") && ids.includes("inference"), "GET /challenges lists bloom + inference");

  const show = await req(port, "GET", "/challenges/bloom");
  check(show.status === 200 && Array.isArray(show.json.tunable) && show.json.practiceSeeds, "GET /challenges/bloom shows tunable + practiceSeeds");
  check(show.json.scoringSeeds === undefined, "show does NOT leak scoring seeds");

  // --- auth is required where it should be ---
  const noAuth = await req(port, "GET", "/me");
  check(noAuth.status === 401, "GET /me without token -> 401");

  // --- register: get an identity + wallet ---
  const reg = await req(port, "POST", "/register", { name: "smoke-bot" });
  const tok = reg.json.agentToken;
  check(reg.status === 200 && typeof tok === "string" && tok.length > 0, "POST /register returns a token");

  // --- open a graded attempt on bloom ---
  const start = await req(port, "POST", "/attempts", { challenge: "bloom" }, tok);
  check(start.status === 200 && start.json.budget > 0, "POST /attempts opens bloom with a budget");

  // --- the held-out guarantee: cannot experiment on a scoring seed ---
  const peek = await req(port, "POST", "/experiment", { challenge: "bloom", ticks: 500, seed: 101 }, tok);
  check(peek.status === 400, "experiment on scoring seed 101 -> 400 (held out)");

  // --- a real graded experiment draws the budget ---
  const exp = await req(port, "POST", "/experiment", { challenge: "bloom", config: { "food.spawnPerTick": 7 }, ticks: 2000, seed: 1 }, tok);
  check(exp.status === 200 && Array.isArray(exp.json.trajectory) && exp.json.trajectory.length > 0, "graded experiment returns a trajectory");
  check(exp.json.mode === "graded" && exp.json.budget && exp.json.budget.spent > 0, "graded experiment drew down the budget");

  // --- enforce the tunable whitelist ---
  const illegal = await req(port, "POST", "/experiment", { challenge: "bloom", config: { "creature.biteDamage": 99 }, ticks: 500, seed: 1 }, tok);
  check(illegal.status === 400, "experiment with a non-tunable knob -> 400");

  // --- score: the judge runs hidden seeds; verdict is structured ---
  const sc = await req(port, "POST", "/score", { challenge: "bloom", recipe: { config: { "food.spawnPerTick": 7 } } }, tok);
  check(sc.status === 200 && typeof sc.json.pass === "boolean" && typeof sc.json.verdict === "string", "POST /score returns a graded verdict");
  check(sc.json.runs && sc.json.runs.length === 5, "score ran all 5 hidden seeds");

  // --- one score ends the attempt ---
  const me = await req(port, "GET", "/me", null, tok);
  check(me.status === 200 && me.json.attempt === null, "attempt closed after score");

  // --- practice mode: no attempt open -> free experiment ---
  const prac = await req(port, "POST", "/experiment", { challenge: "goldilocks", ticks: 1000, seed: 1 });
  check(prac.status === 200 && prac.json.mode === "practice", "experiment with no attempt -> practice mode");

  // --- inference: the true black box ---
  const istart = await req(port, "POST", "/attempts", { challenge: "inference" }, tok);
  check(istart.status === 200 && Array.isArray(istart.json.candidates), "open inference attempt");

  const iexp = await req(port, "POST", "/experiment", { challenge: "inference", ticks: 2000, seed: 1 }, tok);
  check(iexp.status === 200 && Array.isArray(iexp.json.baseline) && Array.isArray(iexp.json.altered), "inference experiment returns baseline + altered");
  const leak = JSON.stringify(iexp.json);
  check(!/nonce|factor|"mystery"/.test(leak), "inference experiment does NOT leak nonce/factor/mystery");

  const guess = await req(port, "POST", "/guess", { knob: "food.energy", value: 50 }, tok);
  check(guess.status === 200 && typeof guess.json.pass === "boolean" && guess.json.trueKnob, "POST /guess returns a grade");

  // --- the social spine ---
  const lb = await req(port, "GET", "/leaderboard");
  check(lb.status === 200 && Array.isArray(lb.json.leaderboard) && lb.json.agents >= 1, "GET /leaderboard works");

  console.log("");
  if (failures) {
    console.log("SMOKE FAILED: " + failures + " check(s) failed.");
    process.exitCode = 1;
  } else {
    console.log("SMOKE PASSED: an agent played a full remote session end-to-end.");
  }
}

const srv = createServer();
srv.listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  try {
    await main(port);
  } catch (e) {
    console.error("SMOKE ERROR:", e.stack || e.message);
    process.exitCode = 1;
  } finally {
    srv.close();
  }
});

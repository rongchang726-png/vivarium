#!/usr/bin/env node
/*
 * Vivarium — example remote player.
 * ---------------------------------
 * A reference agent that plays a challenge over the HTTP protocol (PROTOCOL.md),
 * narrating its reasoning so you can see HOW the game is played — not reflexes,
 * but: form a hypothesis about an unfamiliar evolving world, test it, and submit
 * a recipe that the judge verifies on HELD-OUT seeds (so only a real principle
 * passes). Any agent elsewhere can do exactly this; this file is just a worked
 * example of the wire.
 *
 *   node game/play-remote.js [baseURL]     # default: the live deployment
 *
 * It plays "bloom": establish a self-sustaining population (avg >= 200, never
 * extinct). The reasoning is real and grounded in src/config.js defaults:
 * population tracks food CARRYING CAPACITY, so raise the food supply; and start
 * the founding population ABOVE the target so the early window can't dip under
 * it or go extinct while random brains are still bootstrapping.
 */

const https = require("https");
const http = require("http");

const BASE = (process.argv[2] || "https://vivarium-game.onrender.com").replace(/\/$/, "");

// The recipe is the agent's CLAIM about the world. Defaults: spawnPerTick 10,
// max 1500, startCount 70. We lift carrying capacity and start above target.
const RECIPE = {
  config: {
    "creature.startCount": 250, // start above the 200 target (avoid early-window dips / extinction)
    "food.spawnPerTick": 18, //   ~1.8x food inflow -> higher carrying capacity
    "food.max": 3000, //          let the standing crop (hence the population) sit higher
  },
};

function req(method, p, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + p);
    const lib = u.protocol === "https:" ? https : http;
    const data = body != null ? JSON.stringify(body) : null;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["X-Agent-Token"] = token;
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

// Submit a compute call (a job) and poll until it finishes.
async function job(p, body, token, label) {
  const sub = await req("POST", p, body, token);
  if (sub.status !== 200 || !sub.json.jobId) throw new Error((label || p) + " failed: " + JSON.stringify(sub.json));
  process.stdout.write("   " + (label || p) + " [job " + sub.json.jobId.slice(0, 12) + "…] computing");
  for (let i = 0; i < 3000; i++) {
    const poll = await req("GET", "/jobs/" + sub.json.jobId, null, token);
    const st = poll.json && poll.json.status;
    if (st === "done") { process.stdout.write(" done\n"); return poll.json.result; }
    if (st === "error") { process.stdout.write(" error\n"); throw new Error(poll.json.error); }
    if (i % 5 === 0) process.stdout.write(".");
    await sleep(1000);
  }
  throw new Error("job timed out");
}

async function main() {
  console.log("=== An agent plays Vivarium @ " + BASE + " ===\n");

  // 1. Register — get an identity + wallet.
  const reg = (await req("POST", "/register", { name: "claude-demo" })).json;
  console.log("1. Registered as " + reg.id + " (name: " + reg.name + ")");

  // 2. Read the challenge: the goal and the knobs we may touch.
  const show = (await req("GET", "/challenges/bloom")).json;
  console.log("\n2. Challenge 'bloom' — " + show.goal);
  console.log("   knobs I may tune: " + show.tunable.join(", "));
  console.log("   bounty " + show.bounty + " tokens, budget " + show.budget + " ticks, practice seeds " + JSON.stringify(show.practiceSeeds));

  // 3. Open a graded attempt (stakes: budget down, bounty up).
  const att = (await req("POST", "/attempts", { challenge: "bloom" }, reg.agentToken)).json;
  console.log("\n3. Opened a graded attempt. Budget: " + att.budget + " ticks.");

  // 4. Hypothesis + experiment on a PRACTICE seed (free to inspect; the trajectory is the lab).
  console.log("\n4. Hypothesis: population tracks food carrying capacity. Defaults give");
  console.log("   spawnPerTick 10 / max 1500 / startCount 70. I'll lift food supply and");
  console.log("   start 250 founders (above the 200 target) so the window can't dip under it.");
  console.log("   recipe = " + JSON.stringify(RECIPE.config));
  const exp = await job("/experiment", { challenge: "bloom", config: RECIPE.config, ticks: 5000, seed: 1 }, reg.agentToken, "experiment(seed 1, 5000t)");
  const curve = exp.trajectory.map((s) => s.pop);
  console.log("   population over time: " + curve.join(" → "));
  console.log("   goalPreview on this seed: " + JSON.stringify(exp.goalPreview.detail || exp.goalPreview));
  console.log("   budget left: " + exp.budget.remaining + " / " + exp.budget.of);

  // 5. Score: the JUDGE runs the recipe on HIDDEN seeds. Pass only if it generalizes.
  console.log("\n5. Submitting to the judge — it runs my recipe on seeds I never saw…");
  const sc = await job("/score", { challenge: "bloom", recipe: RECIPE }, reg.agentToken, "score(5 hidden seeds)");
  console.log("   " + sc.verdict);
  console.log("   per hidden seed: " + sc.runs.map((r) => (r.pass ? "✓" : "✗") + r.seed + "(" + r.detail + ")").join("  "));
  if (sc.wallet) console.log("   wallet now: " + sc.wallet.tokens + " tokens");

  // 6. The social spine.
  const lb = (await req("GET", "/leaderboard")).json;
  console.log("\n6. Leaderboard: " + (lb.leaderboard.length ? lb.leaderboard.map((r) => r.name + "=" + r.tokens).join(", ") : "(empty)"));
  console.log("\n=== " + (sc.pass ? "SOLVED. A general principle, verified on held-out seeds." : "Not solved — the hidden seeds found a flaw. That's the game.") + " ===");
}

main().catch((e) => { console.error("PLAY ERROR:", e.message); process.exitCode = 1; });

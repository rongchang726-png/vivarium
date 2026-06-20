/*
 * Vivarium Game — simulation worker thread.
 * -----------------------------------------
 * The simulation is CPU-heavy and synchronous: a full /score is tens of
 * thousands of ticks. Run on the main thread it blocks the HTTP event loop —
 * one judging run freezes the whole server, and (the real-world bite) a request
 * that outlives the edge proxy's ~100s limit gets its connection killed while
 * the server keeps uselessly computing it, stalling everyone behind it.
 *
 * So all compute is offloaded here, to a worker_thread (Node built-in, zero
 * deps). The main thread stays responsive; heavy work becomes a background job
 * the client polls. The engine functions are unchanged and deterministic.
 *
 * Protocol: the parent posts {jobId, op, payload}; we run the op and post back
 * {jobId, ok, result} or {jobId, ok:false, error}. Challenge OBJECTS can't cross
 * the thread boundary (their evaluate() function isn't cloneable), so the parent
 * sends a challengeId and we resolve it from our own copy of the registry.
 */

const { parentPort } = require("worker_threads");
const { challenges } = require("./challenges");
const engine = require("./engine");

parentPort.on("message", (m) => {
  const { jobId, op, payload } = m;
  try {
    let result;
    if (op === "experiment") {
      const ch = payload.challengeId ? challenges[payload.challengeId] : null;
      result = engine.experiment(ch, payload.config, payload.founders, payload.ticks, payload.seed);
    } else if (op === "inferenceExperiment") {
      result = engine.inferenceExperiment(payload.mystery, payload.ticks, payload.seed);
    } else if (op === "score") {
      result = engine.score(challenges[payload.challengeId], payload.recipe);
    } else if (op === "match") {
      result = engine.matchScore(payload.a, payload.b);
    } else {
      throw new Error("unknown op: " + op);
    }
    parentPort.postMessage({ jobId, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ jobId, ok: false, error: e && e.message ? e.message : String(e) });
  }
});

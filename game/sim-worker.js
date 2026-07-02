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
const ladder = require("./ladder");
const engine = require("./engine");
const { buildStory } = require("./story");

// Resolve the challenge a job runs against. A fixed challenge crosses the wire
// as an id; a procedural ladder instance crosses as a ref (ladder:fam:diff:season)
// and is rebuilt here — never serialized — so its evaluate() closure and its
// HIDDEN scoring seeds are reconstructed worker-side, never sent over any wire.
function resolveChallenge(payload) {
  if (payload.ladderRef) return ladder.resolveRef(payload.ladderRef);
  return payload.challengeId ? challenges[payload.challengeId] : null;
}

parentPort.on("message", (m) => {
  const { jobId, op, payload } = m;
  try {
    let result;
    // Emit progress to the parent so a long job reads as alive, not hung.
    const onProgress = (p) => parentPort.postMessage({ jobId, progress: p });
    if (op === "experiment") {
      const ch = resolveChallenge(payload);
      result = ch && ch.type === "hinge"
        ? engine.hingeExperiment(ch, { trigger: payload.trigger || null }, payload.ticks, payload.seed)
        : engine.experiment(ch, payload.config, payload.founders, payload.ticks, payload.seed, onProgress);
    } else if (op === "inferenceExperiment") {
      result = engine.inferenceExperiment(payload.mystery, payload.ticks, payload.seed);
    } else if (op === "score") {
      const ch = resolveChallenge(payload);
      result = ch && ch.type === "hinge"
        ? engine.scoreHinge(ch, payload.recipe, onProgress)
        : engine.score(ch, payload.recipe, onProgress);
    } else if (op === "match") {
      result = engine.matchScore(payload.a, payload.b);
    } else if (op === "story") {
      // The gift: run a logged world (+ optional 1-lever counterfactual) and render its
      // chronicle. The recipe is plain data; the render returns plain strings — both cross
      // the thread boundary cleanly (no closure, unlike a challenge's evaluate()).
      result = buildStory(payload, onProgress);
    } else {
      throw new Error("unknown op: " + op);
    }
    parentPort.postMessage({ jobId, ok: true, result });
  } catch (e) {
    parentPort.postMessage({ jobId, ok: false, error: e && e.message ? e.message : String(e) });
  }
});

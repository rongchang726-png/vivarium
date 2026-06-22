/*
 * Tests game/store.js — the durable-store seam under the server.
 * Covers the FILE backend (the default) round-trip. The Turso/libSQL backend is
 * creds-gated (VIVARIUM_DB_URL/TOKEN) and verified live, not here.
 *   node test/store.test.js
 */
const assert = require("assert");
const fs = require("fs");
const store = require("../game/store");

(async () => {
  assert.strictEqual(store.backend, "file", "with no VIVARIUM_DB_* env, the backend is the local file");

  const dump = {
    agents: [
      { token: "tok_a", id: "agent_1", name: "Alpha", wallet: { tokens: 120, best: { bloom: 60, giants: 60 } }, created: 1 },
      { token: "tok_b", id: "agent_2", name: "Beta", wallet: { tokens: 0, best: {} }, created: 2 },
    ],
  };

  const saved = await store.save(dump);
  assert.ok(saved, "save() reports success");

  const back = await store.load();
  assert.deepStrictEqual(back, dump, "load() round-trips the dump bit-for-bit");

  // missing-file => null (a fresh server starts empty, doesn't crash)
  try { fs.unlinkSync(store.STATE_FILE); } catch (e) { /* fine */ }
  const empty = await store.load();
  assert.strictEqual(empty, null, "load() on no state returns null");

  console.log("store.test: PASSED — file backend round-trips; backend=" + store.backend);
})().catch((e) => { console.error("store.test FAILED:", e.stack || e.message); process.exit(1); });

/*
 * Vivarium Game — durable store (the seam under server.js's persist/restore).
 * --------------------------------------------------------------------------
 * The server keeps all agent state (tokens, wallets, bests) in memory and snapshots
 * it through persist()/restore(). Until now that snapshot was a local file
 * (.server-state.json) — fine locally, but on Render's free tier the disk is
 * EPHEMERAL, so every redeploy/restart wiped every agent's progress. A game whose
 * progress evaporates has no reason to return; durable state is the foundation of
 * ranking and progression (see CLAUDE.md "reason to stay").
 *
 * This module is that foundation, behind a tiny async interface:
 *     load()  -> the saved dump (or null)
 *     save(d) -> persist the dump (best-effort)
 *
 * Two backends, chosen by environment (zero new dependencies — Node's global fetch):
 *   - file  (default): the original .server-state.json behaviour. Used locally and
 *     by the tests; bit-for-bit the same as before.
 *   - turso (when VIVARIUM_DB_URL + VIVARIUM_DB_TOKEN are set): libSQL/Turso over
 *     HTTP (the /v2/pipeline API). PHASE 0 stores the whole server-state dump as a
 *     single JSON blob in a kv(key,value) table — this just makes the CURRENT state
 *     survive redeploys. Phase 1 (the rating/progression schema, per Codex's spec)
 *     will add proper queryable tables alongside this.
 *
 * NOTE: the Turso path is written to the documented libSQL pipeline API but must be
 * VERIFIED LIVE once real creds exist (test/store.test.js covers the file backend;
 * a creds-gated check will cover turso). On any Turso error we fall back to the
 * local file so the server never loses the ability to persist.
 */

const fs = require("fs");
const path = require("path");

const STATE_FILE = path.join(__dirname, ".server-state.json");
const STATE_KEY = "server-state";

const DB_URL = (process.env.VIVARIUM_DB_URL || "").trim();
const DB_TOKEN = (process.env.VIVARIUM_DB_TOKEN || "").trim();
const useTurso = !!(DB_URL && DB_TOKEN);

// --- file backend (default; identical to the original behaviour) -------------
function fileLoad() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (e) { return null; }
}
function fileSave(dump) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(dump)); return true; } catch (e) { return false; }
}

// --- turso/libSQL backend (HTTP "pipeline" API; zero deps via global fetch) ---
function httpOrigin(u) {
  // Turso hands out libsql://name-org.turso.io; the HTTP endpoint is the https origin.
  return u.replace(/^libsql:\/\//i, "https://").replace(/\/+$/, "");
}
async function pipeline(stmts) {
  const requests = stmts.map((s) => ({ type: "execute", stmt: s }));
  requests.push({ type: "close" });
  const res = await fetch(httpOrigin(DB_URL) + "/v2/pipeline", {
    method: "POST",
    headers: { Authorization: "Bearer " + DB_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error("turso HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}
function textArg(v) { return { type: "text", value: String(v) }; }

async function tursoSave(dump) {
  await pipeline([
    { sql: "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)" },
    {
      sql: "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      args: [textArg(STATE_KEY), textArg(JSON.stringify(dump))],
    },
  ]);
}
async function tursoLoad() {
  const out = await pipeline([
    { sql: "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)" },
    { sql: "SELECT value FROM kv WHERE key = ?", args: [textArg(STATE_KEY)] },
  ]);
  // pipeline response: { results: [ {response:{result:{rows:[[{type,value}]]}}}, ... ] }
  const results = (out && out.results) || [];
  const sel = results[results.length - 2]; // the SELECT (last real stmt before close)
  const rows = (sel && sel.response && sel.response.result && sel.response.result.rows) || [];
  if (!rows.length) return null;
  const cell = rows[0][0];
  const value = cell && (cell.value != null ? cell.value : cell); // be lenient about shape
  if (value == null) return null;
  try { return JSON.parse(value); } catch (e) { return null; }
}

// --- public interface --------------------------------------------------------
async function load() {
  if (useTurso) {
    try { return await tursoLoad(); }
    catch (e) { console.error("store.load (turso) failed, falling back to file:", e.message); return fileLoad(); }
  }
  return fileLoad();
}
async function save(dump) {
  if (useTurso) {
    try { await tursoSave(dump); return true; }
    catch (e) { console.error("store.save (turso) failed; writing local file backup:", e.message); return fileSave(dump); }
  }
  return fileSave(dump);
}

module.exports = { load, save, backend: useTurso ? "turso" : "file", STATE_FILE };

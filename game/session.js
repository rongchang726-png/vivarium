/*
 * Vivarium Game — the economy.
 *
 * The implementable heart of "limited tokens to solve the game": a spendable
 * budget you can win or lose. We meter in *ticks simulated*, because ticks are
 * the real cost (compute you'd pay for). Experiments and scoring draw down the
 * budget; bust it without passing and the attempt is lost (no refund). Pass
 * within budget and you're paid into a wallet — tokens here are a placeholder
 * for whatever real stake an agent economy eventually settles on.
 *
 * The CLI is stateless across invocations, so the attempt ledger and wallet
 * live in small JSON files (gitignored). `start` opens a graded attempt; with
 * no attempt open, experiments run free (practice mode).
 */

const fs = require("fs");
const path = require("path");

const SESSION = path.join(__dirname, ".session.json");
const WALLET = path.join(__dirname, ".wallet.json");

function load(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return fallback;
  }
}
function save(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function getSession() {
  return load(SESSION, null);
}
function startSession(challenge, budget) {
  const s = { challenge, budget, spent: 0, charges: [] };
  save(SESSION, s);
  return s;
}
function charge(kind, ticks) {
  const s = getSession();
  if (!s) return null;
  s.spent += ticks;
  s.charges.push({ kind, ticks });
  save(SESSION, s);
  return s;
}
function endSession() {
  try {
    fs.unlinkSync(SESSION);
  } catch (e) {
    /* nothing to clear */
  }
}

function getWallet() {
  return load(WALLET, { tokens: 0, best: {} });
}
// Credit only the IMPROVEMENT over your previous best on a challenge, so a
// challenge can't be farmed for unlimited tokens.
function creditWallet(challenge, reward) {
  const w = getWallet();
  const prev = w.best[challenge] || 0;
  if (reward > prev) {
    w.tokens += reward - prev;
    w.best[challenge] = reward;
  }
  save(WALLET, w);
  return w;
}

module.exports = { getSession, startSession, charge, endSession, getWallet, creditWallet };

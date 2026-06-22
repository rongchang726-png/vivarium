#!/usr/bin/env node
/*
 * Vivarium — spectate: a god's-eye ASCII view of a PvP match.
 * --------------------------------------------------------------------------
 * The arena runs HEADLESS (server/CLI) — normally the only "view" of a match is
 * the numeric clan scoreboard (popA/popB over time). This little spectator paints
 * the actual world from above so you can WATCH two bloodlines compete in space:
 * two clans (A, B) of small efficient herbivores — the documented PvP optimum —
 * with RANDOM brains (behaviour must evolve), seeded into one shared deterministic
 * world, refereed by natural selection. It usually ends in competitive exclusion
 * (Gause): one bloodline drives the other extinct.
 *
 * Each cell of the grid shows which clan dominates that patch of the 1280x800
 * torus:  A = clan-0 wins the cell,  B = clan-1,  * = contested,  (space) = empty.
 *
 * Usage: node game/spectate.js [seed]
 */
const { loadCore } = require("./core-loader");
const COLS = 72, ROWS = 26;
const SEED = parseInt(process.argv[2] || "11", 10);

const api = loadCore();
api.setParam("pop.freqDependence", 0.5); // the real arena's anti-snowball setting
const w = api.newArenaWorld(SEED);        // no genesis: a clan can truly be wiped out
// Two near-identical clans of small efficient herbivores (the documented optimum).
// Random brains => foraging must be discovered. Seeded intermixed, exactly as the
// real arena does (engine.js seedClan).
api.seedFounders(w, 60, { diet: 0.07, radius: 3.4 }, 0);
api.seedFounders(w, 60, { diet: 0.07, radius: 3.4 }, 1);

function frame(label) {
  const cellA = {}, cellB = {};
  let popA = 0, popB = 0, bioA = 0, bioB = 0;
  const cs = w.creatures;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const cx = Math.min(COLS - 1, (c.x / w.width * COLS) | 0);
    const cy = Math.min(ROWS - 1, (c.y / w.height * ROWS) | 0);
    const key = cy * COLS + cx;
    if (c.clan === 0) { cellA[key] = (cellA[key] || 0) + 1; popA++; bioA += c.area; }
    else if (c.clan === 1) { cellB[key] = (cellB[key] || 0) + 1; popB++; bioB += c.area; }
  }
  const bar = "+" + "-".repeat(COLS) + "+";
  console.log("");
  console.log(label + "   A(clan0)=" + popA + "  B(clan1)=" + popB +
    "   biomass A=" + Math.round(bioA) + " B=" + Math.round(bioB));
  console.log(bar);
  for (let r = 0; r < ROWS; r++) {
    let line = "|";
    for (let cx = 0; cx < COLS; cx++) {
      const key = r * COLS + cx;
      const a = cellA[key] || 0, b = cellB[key] || 0;
      line += a === 0 && b === 0 ? " " : a > b ? "A" : b > a ? "B" : "*";
    }
    console.log(line + "|");
  }
  console.log(bar);
}

frame("t=0     (founding — 60 vs 60, intermixed)");
let t = 0;
for (const s of [1500, 3000, 6000, 8000]) { api.step(w, s - t); t = s; frame("t=" + String(t).padStart(5)); }

const winner = w.creatures.filter((c) => c.clan === 0).length >
  w.creatures.filter((c) => c.clan === 1).length ? "A" : "B";
console.log("\nverdict at t=8000: clan " + winner + " leads (the real arena averages popA/popB over t6000-8000).");

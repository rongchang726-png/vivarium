/*
 * Vivarium Game — storyteller lab (BUILD 2 disturbance calibration, docs/REDESIGN.md)
 * ----------------------------------------------------------------------------------
 * Two modes:
 *   node game/storyteller-lab.js trace [seed] [ticks]
 *     One world, storyteller + terrain ON. Prints the pop/dominance/tension trajectory and the full
 *     famine log — the basic-mechanism check (do famines FIRE when a monoculture builds, and do they
 *     dent it?).
 *   node game/storyteller-lab.js variance [ticks]
 *     The INTEGRITY check the spec names: run a fixed seed set with the storyteller ON vs OFF and
 *     compare END-STATE spread. The win is NOT "one dramatic run" but MORE DISTINCT endings — higher
 *     across-seed variance in how the worlds end (and, secondarily, more lineages / less monoculture).
 *
 * Terrain is ON in both (storyteller is designed to act on the spatial substrate): biome.enabled,
 * food.types=2, forageSpecialization=1.2 (the BUILD 1 ship config).
 */

const { loadCore } = require("./core-loader");

const mode = process.argv[2] || "trace";

// Optional CONFIG overrides from argv: any `path=value` token (e.g. storyteller.famineRadius=400)
// is applied via setParam, so famine-strength sweeps need no config edits. Numeric values only.
const OVERRIDES = process.argv.filter((a) => /^[\w.]+=[-\d.]+$/.test(a)).map((a) => a.split("="));

function setup(stOn) {
  const api = loadCore();
  api.setParam("biome.enabled", true);
  api.setParam("food.types", 2);
  api.setParam("food.forageSpecialization", 1.2);
  api.setParam("storyteller.enabled", stOn);
  for (const [k, v] of OVERRIDES) api.setParam(k, parseFloat(v));
  return api;
}

function dominance(world) {
  const cs = world.creatures, n = cs.length;
  if (!n) return 0;
  const b = new Array(18).fill(0);
  for (let i = 0; i < n; i++) { let k = (cs[i].hue / 20) | 0; if (k < 0) k = 0; else if (k > 17) k = 17; b[k]++; }
  return Math.max.apply(null, b) / n;
}
function stdev(a) {
  if (a.length < 2) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length);
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
// FNV-ish checksum over the dynamic world state — for the save/load exactness check (A vs B must
// match exactly if every decision-state field is serialized). Order-stable (serialize preserves it).
function checksum(w) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { h = (h ^ (Math.round(v * 1000) >>> 0)) >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  mix(w.creatures.length);
  for (let i = 0; i < w.creatures.length; i++) { const c = w.creatures[i]; mix(c.x); mix(c.y); mix(c.energy); mix(c.heading); }
  mix(w.food.list.length);
  if (w.storyteller) mix(w.storyteller.tension);
  mix(w.food.scars.length);
  return h >>> 0;
}

if (mode === "trace") {
  const seed = parseInt(process.argv[3] || "7", 10);
  const ticks = parseInt(process.argv[4] || "14000", 10);
  const api = setup(true);
  const w = api.newWorldLogged(seed);
  const mark = Math.max(1, Math.floor(ticks / 14));
  console.log(`storyteller TRACE  seed=${seed}  ticks=${ticks}  (biome on, food.types=2, spec 1.2)`);
  console.log("tick:  pop  dom  tension scars famines");
  let famSeen = 0;
  for (let t = 0; t < ticks; t++) {
    w.step();
    if ((t + 1) % mark === 0 || t === ticks - 1) {
      const fam = w.eventLog.filter((e) => e.k === "famine").length;
      console.log(
        `${String(t + 1).padStart(6)}: ${String(w.creatures.length).padStart(4)}  ${dominance(w).toFixed(2)}  ` +
        `${w.storyteller.tension.toFixed(1).padStart(6)} ${String(w.food.scars.length).padStart(4)}  ${String(fam).padStart(4)}`,
      );
      famSeen = fam;
    }
  }
  const famines = w.eventLog.filter((e) => e.k === "famine");
  console.log(`\n${famines.length} famines fired:`);
  famines.forEach((f) => console.log(`  t=${String(f.t).padStart(6)}  dom=${f.dom}  removed=${String(f.removed).padStart(4)}  at (${f.x | 0},${f.y | 0})`));
} else if (mode === "variance") {
  const ticks = parseInt(process.argv[3] || "12000", 10);
  const seeds = [7, 11, 19, 23, 42];
  console.log(`storyteller VARIANCE check  seeds=[${seeds}]  ticks=${ticks}  (biome on)`);
  console.log("integrity test: MORE DISTINCT endings ON vs OFF (higher across-seed spread) = a real win.\n");

  function run(stOn) {
    const rows = [];
    for (const seed of seeds) {
      const api = setup(stOn);
      const w = api.newWorldLogged(seed);
      for (let t = 0; t < ticks; t++) w.step();
      const snap = api.snapshot(w);
      const fam = w.eventLog.filter((e) => e.k === "famine").length;
      rows.push({ seed, pop: snap.pop, lineages: snap.lineages, dom: dominance(w), maxGen: snap.maxGen, diet: snap.avgDiet, famines: fam });
    }
    return rows;
  }

  function report(label, rows) {
    console.log(`--- storyteller ${label} ---`);
    console.log("seed   pop  lin  dom  maxGen diet  famines");
    rows.forEach((r) => console.log(
      `${String(r.seed).padStart(4)} ${String(r.pop).padStart(5)} ${String(r.lineages).padStart(4)} ${r.dom.toFixed(2)} ${String(r.maxGen).padStart(6)} ${r.diet.toFixed(3)} ${String(r.famines).padStart(6)}`,
    ));
    const dom = rows.map((r) => r.dom), lin = rows.map((r) => r.lineages), pop = rows.map((r) => r.pop);
    console.log(`  mean: dom ${mean(dom).toFixed(3)}  lineages ${mean(lin).toFixed(2)}  pop ${mean(pop).toFixed(0)}`);
    console.log(`  SPREAD(stdev across seeds): dom ${stdev(dom).toFixed(3)}  lineages ${stdev(lin).toFixed(2)}  pop ${stdev(pop).toFixed(1)}`);
    return { dom, lin, pop };
  }

  const off = report("OFF", run(false));
  console.log("");
  const on = report("ON", run(true));
  console.log("\n=== verdict ===");
  console.log(`end-state SPREAD (across-seed stdev), the divergence metric:`);
  console.log(`  dominance:  OFF ${stdev(off.dom).toFixed(3)}  ->  ON ${stdev(on.dom).toFixed(3)}   ${stdev(on.dom) > stdev(off.dom) ? "(more distinct ✓)" : "(not more distinct)"}`);
  console.log(`  lineages:   OFF ${stdev(off.lin).toFixed(2)}  ->  ON ${stdev(on.lin).toFixed(2)}`);
  console.log(`  mean lineages: OFF ${mean(off.lin).toFixed(2)} -> ON ${mean(on.lin).toFixed(2)}  |  mean dom: OFF ${mean(off.dom).toFixed(3)} -> ON ${mean(on.dom).toFixed(3)}`);
} else if (mode === "saveload") {
  // Verify the disturbance decision-state (tension, lastEventTick, scars) round-trips EXACTLY:
  // run to T (where a scar is live), serialize -> JSON -> load, then step both worlds K more and
  // require identical checksums. (sim.test only covers the default OFF world; this covers ON.)
  const seed = parseInt(process.argv[3] || "7", 10);
  const T = parseInt(process.argv[4] || "5000", 10);
  const K = 2000;
  const api = setup(true);
  const a = api.newWorld(seed);
  for (let t = 0; t < T; t++) a.step();
  // Seek a tick where a famine SCAR is actually live, so the save/load test exercises scar
  // serialization (not just tension) — keep stepping (cap) until food.scars is non-empty.
  let guard = 0;
  while (a.food.scars.length === 0 && guard < 8000) { a.step(); guard++; }
  const dump = JSON.parse(JSON.stringify(a.serialize())); // round-trip like a real save file
  // Capture display values NOW, before the K-loop mutates the live arrays (the loaded world's
  // food.scars is a copy, but b stepping still expires its own scars; read the snapshot here).
  const scarsAtSave = dump.scars ? dump.scars.length : 0;
  const tensionAtSave = dump.storyteller ? dump.storyteller.tension.toFixed(2) : "n/a";
  const tickAtSave = a.tick;
  const b = api.loadWorld(dump);
  const c0a = checksum(a), c0b = checksum(b);
  for (let t = 0; t < K; t++) { a.step(); b.step(); }
  const ca = checksum(a), cb = checksum(b);
  console.log(`storyteller SAVE/LOAD exactness  seed=${seed}  saved at tick ${tickAtSave} (+${guard} sought)  K=${K}`);
  console.log(`  at save: scars=${scarsAtSave}  tension=${tensionAtSave}`);
  console.log(`  checksum at load:  A=${c0a}  B=${c0b}  =>  ${c0a === c0b ? "match" : "MISMATCH ✗"}`);
  console.log(`  checksum after +${K}: A=${ca}  B=${cb}  =>  ${ca === cb ? "EXACT ✓" : "MISMATCH ✗ (state not fully serialized)"}`);
} else {
  console.log("usage: node game/storyteller-lab.js trace [seed] [ticks]  |  variance [ticks]  |  saveload [seed] [T]");
}

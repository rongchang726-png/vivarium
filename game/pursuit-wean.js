#!/usr/bin/env node
/*
 * Vivarium — the wean test (integrity check for the pursuit-reward result).
 * ------------------------------------------------------------------------
 * pursuit.js showed a carnivore guild ESTABLISHING when creature.pursuitReward
 * bridges the adaptive valley. But did hunting genuinely EVOLVE, or are the
 * "carnivores" just farming the pursuit bonus (a crutch they'd die without)?
 *
 * This weans them: Phase 1 evolves the world WITH the reward (PR>0); then at the
 * switch we turn the reward OFF (PR=0) and keep running. If carn>.8 and the kill
 * rate PERSIST without the reward, the hunting behaviour is real — the reward was
 * only a scaffold across the valley, exactly its intended role. If they collapse
 * the moment the reward stops, it was a crutch, not a solve.
 *
 *   node game/pursuit-wean.js [seed] [phase1] [phase2] [PR]
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const P1 = parseInt(process.argv[3] || "12000", 10);
const P2 = parseInt(process.argv[4] || "9000", 10);
const PR = parseFloat(process.argv[5] != null ? process.argv[5] : "0.8");

const api = loadCore();
api.setParam("creature.pursuitReward", PR);
api.setParam("creature.plantSuppression", 1.0);
api.setParam("creature.retaliation", 0.1);
api.setParam("creature.carcassFactor", 1.5);
api.setParam("creature.biteDamage", 35);
api.setParam("creature.speedSmall", 1.7);

const w = api.newEmptyWorld(SEED);
api.seedFounders(w, 200, { diet: 0.05, radius: 3.3 }, 0);
api.seedFounders(w, 60, { diet: 0.9, radius: 6.5 }, 0);

function row(tag) {
  const s = api.snapshot(w);
  const h = s.dietHist;
  console.log(
    " " + String(s.tick).padStart(5) + " " + String(s.pop).padStart(4) + " | " +
    String(h[0]).padStart(6) + " " + String(h[1]).padStart(5) + " " + String(h[2]).padStart(5) + " " +
    String(h[3]).padStart(5) + " " + String(h[4]).padStart(7) + " | " +
    String(Math.round(s.predationRate * 1000)).padStart(6) + " " + String(s.maxGen).padStart(5) + "  " + tag,
  );
}

console.log("=== wean test === PR=" + PR + " for " + P1 + " ticks, then PR=0 for " + P2 + " ticks");
console.log(" tick  pop | herb<.2 .2-.4 .4-.6 .6-.8 carn>.8 | kills/k maxGen  phase");
row("[reward ON]");
for (let t = 1500; t <= P1; t += 1500) { api.step(w, 1500); row("[reward ON]"); }

api.setParam("creature.pursuitReward", 0); // <-- WEAN: remove the scaffold
console.log("        --- pursuitReward -> 0 (weaned) ---");
for (let t = 1500; t <= P2; t += 1500) { api.step(w, 1500); row("[weaned]"); }

console.log("");
console.log("weaned 之后 carn>.8 + kills/k 仍持续 => hunting 是真演化出来的,奖励只是脚手架。");
console.log("一关就塌 => 是拐杖不是解。");

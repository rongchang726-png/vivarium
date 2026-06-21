#!/usr/bin/env node
/*
 * Vivarium — partial-hunting-reward probe (the predator-deadlock escape).
 * ----------------------------------------------------------------------
 * The predator problem is an adaptive valley: a would-be carnivore needs hunting
 * SKILL (a brain that chases + bites prey) to earn the carcass reward, but a
 * random brain can't, so it starves before it evolves the skill — and any graze
 * fallback that keeps it alive lets diet drift back down to herbivory.
 *
 * `creature.pursuitReward` (default 0) rewards the PURSUIT precursor up a
 * gradient: a small, diet-scaled bonus for moving toward a smaller in-view prey.
 * This probe puts it to the test in a no-graze-fallback world (plantSuppression=1,
 * so a high-diet creature can't just graze its way back), seeded with a predator
 * guild over a prey population. Baseline (PR=0): carn>.8 fades to zero (the
 * decade-old result). Question: does PR > 0 let a hunting guild ESTABLISH and
 * persist — and do they actually KILL (a real kill rate), or just farm the
 * pursuit bonus by chasing without catching?
 *
 *   node game/pursuit.js [seed] [ticks] [pursuitReward]
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const TICKS = parseInt(process.argv[3] || "15000", 10);
const PR = parseFloat(process.argv[4] != null ? process.argv[4] : "0.8");

const api = loadCore();
api.setParam("creature.pursuitReward", PR);
api.setParam("creature.plantSuppression", 1.0); // no graze fallback: high diet ~can't graze
api.setParam("creature.retaliation", 0.1); // prey barely fight back
api.setParam("creature.carcassFactor", 1.5); // a kill is a real meal
api.setParam("creature.biteDamage", 35); // a few bites kill
api.setParam("creature.speedSmall", 1.7); // prey a touch slower, so a chase can connect

const w = api.newEmptyWorld(SEED);
api.seedFounders(w, 200, { diet: 0.05, radius: 3.3 }, 0); // prey: small herbivores
api.seedFounders(w, 60, { diet: 0.9, radius: 6.5 }, 0); // predators: big carnivores (random brains)

console.log("=== partial-hunting-reward probe === pursuitReward=" + PR + " | plantSupp=1 | 200 prey + 60 pred(diet .9) | " + TICKS + " ticks");
console.log(" tick  pop | herb<.2 .2-.4 .4-.6 .6-.8 carn>.8 | kills/k maxGen");
for (let t = 0; t <= TICKS; t += 1500) {
  if (t > 0) api.step(w, 1500);
  const s = api.snapshot(w);
  const h = s.dietHist;
  console.log(
    " " + String(t).padStart(5) + " " + String(s.pop).padStart(4) + " | " +
    String(h[0]).padStart(6) + " " + String(h[1]).padStart(5) + " " + String(h[2]).padStart(5) + " " +
    String(h[3]).padStart(5) + " " + String(h[4]).padStart(7) + " | " +
    String(Math.round(s.predationRate * 1000)).padStart(6) + " " + String(s.maxGen).padStart(5),
  );
}
console.log("");
console.log("carn>.8 持续/增长 + kills/k 不为零 => hunting guild 在梯度奖励下立住了(基线 PR=0 应归零)。");
console.log("若 carn>.8 立住但 kills/k≈0 => reward hacking:只追不杀,在白farm追逐奖励。");

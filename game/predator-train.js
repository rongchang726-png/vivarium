#!/usr/bin/env node
/*
 * Vivarium — predator refugium probe (回攻捕食难题, 2026-06-19)
 * -----------------------------------------------------------
 * 捕食难题的诊断(test/trophic.js, CLAUDE.md): 专性捕食者(diet>0.8)的 bootstrap
 * 在主世界 ~1000 ticks 就崩 —— hunting 行为还没演化出来,随机脑捕食者就饿死了。
 * 今天学到的判据把它说清了: 这是【捕食 niche 的 bootstrap / fixation 崩溃】。
 *
 * Refugium 假设(CLAUDE.md #1 future work): 先在一个【hunting 极易】的训练世界
 * 保护捕食者,让 hunting 跨过 bootstrap 演化出来。这个脚本测训练世界本身:
 *   - prey 密集(大量小食草者) + 几乎不反击(retaliation↓)
 *   - 一次 kill 大餐(carcassFactor↑) + 咬得狠(biteDamage↑)
 *   - 捕食者还能过渡 graze 不立刻饿死(plantSuppression↓)
 * 看 carn>.8 能否【持续/增长】(基线: ~1000 ticks 归零)。若能, refugium 训练
 * 阶段成立, 下一步才是"释放进主世界看是否 persist"。
 *
 * 用法: node game/predator-train.js [seed] [ticks]
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const TICKS = parseInt(process.argv[3] || "15000", 10);

const api = loadCore();
// Hunting-easy refugium knobs:
api.setParam("creature.retaliation", 0.1); // prey barely fights back
api.setParam("creature.carcassFactor", 1.5); // a kill is a big meal
api.setParam("creature.biteDamage", 30); // bites bite hard
api.setParam("creature.plantSuppression", 0.5); // predators can still graze to bridge the bootstrap

const w = api.newEmptyWorld(SEED);
api.seedFounders(w, 120, { diet: 0.05, radius: 3.4 }, 0); // prey: small herbivores
api.seedFounders(w, 40, { diet: 0.78, radius: 6.5 }, 0); // predators: big carnivores

console.log("=== Predator refugium: hunting-easy 训练世界,看捕食能否 bootstrap ===");
console.log("retaliation=0.1 carcass=1.5 biteDmg=30 plantSupp=0.5 | 120 prey + 40 predators | " + TICKS + " ticks");
console.log("");
console.log(" tick  pop | herb<.2 .2-.4 .4-.6 .6-.8 carn>.8 | kills/k carn% maxGen");
for (let t = 0; t <= TICKS; t += 1500) {
  if (t > 0) api.step(w, 1500);
  const s = api.snapshot(w);
  const h = s.dietHist;
  console.log(
    " " + String(t).padStart(5) + " " + String(s.pop).padStart(4) + " | " +
    String(h[0]).padStart(6) + " " + String(h[1]).padStart(5) + " " + String(h[2]).padStart(5) + " " +
    String(h[3]).padStart(5) + " " + String(h[4]).padStart(6) + " | " +
    String(Math.round(s.predationRate * 1000)).padStart(6) + " " +
    String(Math.round(s.carnFrac * 100)).padStart(4) + " " + String(s.maxGen).padStart(5),
  );
}
console.log("");
console.log("看 carn>.8(最后一列前): 持续/增长 => hunting 在 easy 环境 bootstrap 成功(refugium 训练有戏)。");
console.log("基线对比: 默认世界 carn>.8 在 ~1000 ticks 归零。");

#!/usr/bin/env node
/*
 * Vivarium — predator refugium probe (回攻捕食难题)
 * ------------------------------------------------
 * 捕食难题 = 捕食 niche 的 bootstrap/fixation 崩溃 (hunting 没演化就饿死)。
 * 基线 (test/trophic.js): carn>.8 在 ~1000 ticks 归零, 无 bimodality。
 *
 * 两个训练世界模式 (都让 hunting 尽量容易):
 *   default [graze-fallback] — plantSupp=0.5, 捕食者能过渡 graze。2026-06-19
 *     的第一次尝试: FAILED, diet 漂回食草 (graze fallback 是滑梯)。
 *   hard [no-graze + 极易 prey] — plantSupp=1.0 (高 diet 几乎不能 graze, 强制
 *     hunt) + prey 更密/更慢/不反击/一咬大餐, 赌随机脑在饿死前碰巧抓到猎物。
 *
 * 看 carn>.8 能否【持续/增长】(基线 ~1000 ticks 归零)。
 * 用法: node game/predator-train.js [seed] [ticks] [hard]
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const TICKS = parseInt(process.argv[3] || "15000", 10);
const HARD = process.argv.includes("hard");

const api = loadCore();
api.setParam("creature.retaliation", HARD ? 0 : 0.1); // prey 反击
api.setParam("creature.carcassFactor", HARD ? 2.0 : 1.5); // kill 大餐
api.setParam("creature.biteDamage", HARD ? 45 : 30); // 咬伤
api.setParam("creature.plantSuppression", HARD ? 1.0 : 0.5); // HARD: 高 diet 几乎不能 graze
if (HARD) api.setParam("creature.speedSmall", 1.6); // HARD: 小 prey 变慢, 好追
// Defended plants (可调): 第5个参数覆盖 toxin; 默认 HARD=10, 非 HARD=0
const TOXIN = process.argv[5] != null ? parseFloat(process.argv[5]) : (HARD ? 10 : 0);
if (TOXIN > 0) api.setParam("food.toxin", TOXIN);
// 第6参数: 密度依赖食物再生(食草者密集处 plant 变稀 => grazing 密度依赖)
const DD = process.argv[6] != null ? parseFloat(process.argv[6]) : 0;
if (DD > 0) api.setParam("food.densityDependence", DD);

const w = api.newEmptyWorld(SEED);
const preyN = HARD ? 220 : 120;
const predN = HARD ? 50 : 40;
const predDiet = HARD ? 0.92 : 0.78; // HARD: 更专性 (配 plantSupp=1 => graze~0)
api.seedFounders(w, preyN, { diet: 0.05, radius: 3.4 }, 0); // prey: 小食草者
api.seedFounders(w, predN, { diet: predDiet, radius: 6.5 }, 0); // predators: 大食肉者

console.log("=== Predator refugium" + (HARD ? " [HARD: no-graze + 极易 prey]" : " [graze-fallback]") + " ===");
console.log(
  "plantSupp=" + (HARD ? 1.0 : 0.5) + " retal=" + (HARD ? 0 : 0.1) + " biteDmg=" + (HARD ? 45 : 30) +
  " | " + preyN + " prey + " + predN + " pred(diet " + predDiet + ") | " + TICKS + " ticks",
);
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
console.log("看 carn>.8: 持续/增长 => hunting bootstrap 成功。基线: 默认世界 ~1000 ticks 归零。");

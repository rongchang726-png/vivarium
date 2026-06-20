#!/usr/bin/env node
/*
 * Vivarium — predator pre-evolve (回攻捕食难题, 2026-06-20)
 * -------------------------------------------------------
 * 今天的根诊断: grazing 被动(撞到 plant 就吃), hunting 主动(要脑子追+咬)。
 * 即使 hunting reward 再高、prey 再易, grazing 的"不需复杂行为"优势让 diet 总
 * 漂回食草; flat/density 全局旋钮改不了这个 (见 CLAUDE.md 再攻II)。
 *
 * 这一刀: 彻底拿掉 grazing 退路。完全无 plant 的训练世界 (food=0 => 任何 diet
 * 的 graze 都吃不到东西) + 每隔 INJECT tick 注入一批 prey。低 diet 后代直接饿死,
 * diet 无处可漂; pred 要么演化出 hunting、要么灭绝。这是 pre-evolved 路线的训练
 * 阶段——若 pred(clan0) 能持续/增长, 下一步才是把它移植回有 plant 的主世界。
 *
 * 用法: node game/predator-evolve.js [seed] [ticks]
 */
const { loadCore } = require("./core-loader");

const SEED = parseInt(process.argv[2] || "7", 10);
const TICKS = parseInt(process.argv[3] || "24000", 10);
const INJECT = parseInt(process.argv[4] || "600", 10); // 注入间隔(可调)
const PREY_BATCH = parseInt(process.argv[5] || "80", 10); // 每次注入 prey 数(可调)

const api = loadCore();
api.setParam("food.spawnPerTick", 0); // 无新 plant
api.setParam("food.startCount", 0); // 无初始 plant => grazing 彻底不可能
api.setParam("creature.retaliation", 0); // prey 不反击
api.setParam("creature.carcassFactor", 2.0); // kill 大餐
api.setParam("creature.biteDamage", 45); // 咬得狠
api.setParam("creature.speedSmall", 1.6); // prey 慢, 好追

const w = api.newArenaWorld(SEED); // noGenesis, prey 由脚本手动注入
api.seedFounders(w, 50, { diet: 0.85, radius: 6.5 }, 0); // predators = clan 0

console.log("=== Predator pre-evolve: 无 plant + 注入 prey, 逼 hunting 演化 ===");
console.log("food=0 (grazing 不可能) | 50 pred(diet 0.85, clan0) | 每 " + INJECT + " tick 注入 " + PREY_BATCH + " prey(clan1) | " + TICKS + " ticks");
console.log("");
console.log(" tick | pred prey | carn>.8 kills/k maxGen");
for (let t = INJECT; t <= TICKS; t += INJECT) {
  api.seedFounders(w, PREY_BATCH, { diet: 0.05, radius: 3.2 }, 1); // 注入 prey
  api.step(w, INJECT);
  const s = api.snapshot(w);
  const cs = api.clanSnapshot(w);
  console.log(
    " " + String(t).padStart(5) + " | " + String(cs.popA).padStart(4) + " " + String(cs.popB).padStart(4) + " | " +
    String(s.dietHist[4]).padStart(6) + " " + String(Math.round(s.predationRate * 1000)).padStart(6) + " " + String(s.maxGen).padStart(5),
  );
}
console.log("");
console.log("看 pred(clan0): 持续/增长 => hunting 在【没有 grazing 退路】下 bootstrap 成功。");
console.log("若仍灭绝 => 即使逼到墙角随机脑也演化不出 hunting, 那才是真正的核心障碍。");

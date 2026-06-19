#!/usr/bin/env node
/*
 * Vivarium — evolutionary branching probe
 * ---------------------------------------
 * 验证 niche 分化能否【自发涌现】:一群通才(forage=0.5)种进双食物世界,
 * forage 在繁殖时漂变(forageStd),看 disruptive selection 会不会把这个单峰
 * 劈成两个特化物种(forage→0 吃 type0、forage→1 吃 type1)。
 *
 * 这是 evolutionary branching / 物种形成的经典图景(adaptive dynamics):当中
 * 间型(通才)同时与两端竞争两种资源、却哪种都不擅长时,中间被掏空,群体分裂。
 * 与 resource partitioning 实验的区别:那里两个物种是我【手动指定】的;这里
 * 分化必须【自己长出来】。
 *
 * 用法: node game/branching.js [ticks]
 */
const { loadCore } = require("./core-loader");

const SEED = 11;
const TICKS = parseInt(process.argv[2] || "30000", 10);
const SPEC = parseFloat(process.argv[3] || "1"); // forageSpecialization: >1 = 凸 trade-off (branching 需要它)
const SAMPLE = 2500;
const FOUNDERS = 60;

const api = loadCore();
api.setParam("food.types", 2);
api.setParam("food.forageSpecialization", SPEC);
// 每种食物密度补到单食物 baseline(公平,不饿死)
api.setParam("food.max", api.CONFIG.food.max * 2);
api.setParam("food.spawnPerTick", api.CONFIG.food.spawnPerTick * 2);
api.setParam("food.startCount", api.CONFIG.food.startCount * 2);

const w = api.newEmptyWorld(SEED);
api.seedFounders(w, FOUNDERS, { diet: 0.1, radius: 3.6, forage: 0.5 }, 0); // 全是通才

console.log("=== Evolutionary branching: 通才(forage=0.5)能否自发分裂成两个特化物种 ===");
console.log("food.types=2 | spec=" + SPEC + " | " + FOUNDERS + " 通才 founders | " + TICKS + " ticks | forageStd=" + api.CONFIG.mutation.forageStd);
console.log("");
console.log("forage 分布 (5 bins): 特化type0 <-> 通才 <-> 特化type1");
console.log("");

function bar(hist) {
  const tot = hist.reduce((a, b) => a + b, 0) || 1;
  return hist
    .map((h) => {
      const n = Math.round((h / tot) * 24);
      return "#".repeat(n).padEnd(5, "·").slice(0, Math.max(1, n)) || "·";
    })
    .join("");
}

let last = null;
for (let t = 0; t <= TICKS; t += SAMPLE) {
  if (t > 0) api.step(w, SAMPLE);
  const s = api.snapshot(w);
  last = s;
  const fh = s.forageHist;
  const tot = fh.reduce((a, b) => a + b, 0) || 1;
  const pct = fh.map((h) => String(Math.round((h / tot) * 100)).padStart(3));
  // 可视化:每个 bin 一段 # 条
  const viz = fh
    .map((h) => "#".repeat(Math.round((h / tot) * 20)))
    .map((c, i) => (c || "·"))
    .join(" ");
  console.log(
    "t=" + String(t).padStart(5) + " pop=" + String(s.pop).padStart(3) +
    "  [type0 " + pct[0] + " |" + pct[1] + " | 通才 " + pct[2] + " |" + pct[3] + " | type1 " + pct[4] + "]  " + viz,
  );
}

console.log("");
const fh = last.forageHist;
const tot = fh.reduce((a, b) => a + b, 0) || 1;
const ends = (fh[0] + fh[4]) / tot;
const middle = fh[2] / tot;
console.log("末期: 两端特化占 " + Math.round(ends * 100) + "%, 中间通才占 " + Math.round(middle * 100) + "%");
console.log(
  ends > 0.5 && middle < 0.2
    ? "=> BRANCHING 成功: 通才峰被掏空, 群体自发分裂成两个特化物种(物种形成)。"
    : "=> 未见明显分裂: 中间型仍占优(disruptive selection 不够强 / forageStd 太小 / 需更久)。",
);

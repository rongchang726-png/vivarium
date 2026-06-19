#!/usr/bin/env node
/*
 * Vivarium — snowball probe (PvP 反滚雪球的尺子)
 * ----------------------------------------------
 * 量化 PvP 竞技场里的"赢者通吃 / 灭绝动力学",为 homeostasis(反滚雪球
 * 负反馈)实验提供一把可复现的尺子。两个 clan 被种进同一个 arena
 * (noGenesis,所以一方可被真正消灭),全程采样两条种群曲线,测量:
 *
 *   divergeTick — 两个种群数量比首次 >= DIVERGE_RATIO:1 的 tick(对称
 *                 破缺、雪球启动的时刻)。
 *   extinctTick — 落后 clan 首次归零的 tick(雪球终结、胜负已分)。
 *   终局分类    — 健康共存(两方都活)/ 单方独霸(赢者通吃)/ 世界崩溃(0:0)。
 *
 * 两种场景:
 *   对称(默认)  — 两 clan 配方相同, 分化纯来自随机脑/RNG/先手。负反馈
 *                 应当延缓甚至消除灭绝, 且不把世界一起治死。
 *   非对称(--asym) — B 用系统性劣势配方。这是关键对照: 好的负反馈应当
 *                 拉平【随机】波动, 却仍让【真实】实力差分出胜负 —— A 仍
 *                 该明显占优, 而不是 B 靠庇护强行赖活(那是"强制共存", 坏)。
 *
 * 两个 anti-snowball 旋钮(默认都关 = 基线):
 *   --dd  food.densityDependence  局部密度制约食物再生(已证伪: 加速排斥)
 *   --fd  pop.freqDependence       频率依赖繁殖 / 少数方庇护
 *
 * 用法:
 *   node game/snowball.js                 # 对称基线
 *   node game/snowball.js --fd 0.7        # 对称 + 少数方庇护
 *   node game/snowball.js --fd 0.7 --asym # 非对称, 验证真优势仍能赢
 */
const { loadCore } = require("./core-loader");

function argval(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? Number(process.argv[i + 1]) : def;
}
const DD = argval("--dd", 0); // food.densityDependence(0=基线)
const DDR = argval("--ddr", 40); // food.densityRadius
const FD = argval("--fd", 0); // pop.freqDependence(少数方庇护)
const ASYM = process.argv.includes("--asym"); // 非对称: B 系统性劣势
const WALL = process.argv.includes("--wall"); // 空间隔离: 中墙+corridor, 两 clan 各种一边
const GAP = argval("--gap", 0.2); // corridor 占世界高度的比例(越小越隔离)
const FOOD2 = process.argv.includes("--food2"); // 双食物 + 两 clan 特化(resource partitioning)

const SEEDS = [11, 22, 33, 44, 55];
const FOUNDERS_PER_CLAN = 45;
const SPEC_A = { diet: 0.12, radius: 3.6 }; // 小型高效食草
const SPEC_B = { diet: 0.12, radius: ASYM ? 5.5 : 3.6 }; // 非对称时 B 身体更大(代谢高/效率低)
if (FOOD2) { SPEC_A.forage = 0; SPEC_B.forage = 1; } // 各特化一种食物 => 生态位重叠 ρ→0
const TICKS = 9000;
const SAMPLE = 250;
const DIVERGE_RATIO = 3; // 领先:落后 超过此值算雪球启动
const FORMED = 20; // 视为"种群已成型"的绝对下限,过滤初期随机脑噪声

function probe(seed) {
  const api = loadCore();
  if (DD > 0) {
    api.setParam("food.densityDependence", DD);
    api.setParam("food.densityRadius", DDR);
  }
  if (FD > 0) api.setParam("pop.freqDependence", FD);
  if (FOOD2) {
    api.setParam("food.types", 2);
    // Keep each food type at single-resource density so a specialist clan's
    // bootstrap matches baseline — a fair test of partitioning, not starvation.
    api.setParam("food.max", api.CONFIG.food.max * 2);
    api.setParam("food.spawnPerTick", api.CONFIG.food.spawnPerTick * 2);
    api.setParam("food.startCount", api.CONFIG.food.startCount * 2);
  }
  const W = api.CONFIG.world.width,
    H = api.CONFIG.world.height;
  if (WALL) api.setParam("world.wall", { gapLo: H * (0.5 - GAP / 2), gapHi: H * (0.5 + GAP / 2) });
  const w = api.newArenaWorld(seed);
  if (WALL) {
    // 两个 clan 各种世界一边, 中墙把它们半隔离
    api.seedFounders(w, FOUNDERS_PER_CLAN, SPEC_A, 0, { xmin: 0, xmax: W * 0.5 });
    api.seedFounders(w, FOUNDERS_PER_CLAN, SPEC_B, 1, { xmin: W * 0.5, xmax: W });
  } else {
    api.seedFounders(w, FOUNDERS_PER_CLAN, SPEC_A, 0);
    api.seedFounders(w, FOUNDERS_PER_CLAN, SPEC_B, 1);
  }

  const series = [];
  let divergeTick = null,
    extinctTick = null,
    extinctClan = null,
    totalPeak = 0;
  for (let t = 0; t <= TICKS; t += SAMPLE) {
    if (t > 0) api.step(w, SAMPLE);
    const s = api.clanSnapshot(w);
    series.push(s);
    const hi = Math.max(s.popA, s.popB),
      lo = Math.min(s.popA, s.popB);
    if (hi + lo > totalPeak) totalPeak = hi + lo;
    if (divergeTick == null && lo > 0 && hi >= FORMED && hi >= DIVERGE_RATIO * lo) divergeTick = s.tick;
    if (extinctTick == null && (s.popA === 0 || s.popB === 0) && hi >= FORMED) {
      extinctTick = s.tick;
      extinctClan = s.popA === 0 ? "A" : "B";
    }
  }
  const last = series[series.length - 1];
  return {
    seed,
    divergeTick,
    extinctTick,
    extinctClan,
    finalA: last.popA,
    finalB: last.popB,
    totalPeak,
    totalEnd: last.popA + last.popB,
    series,
  };
}

// 一条 40 宽的 A/B 占比条,直观看对称如何被打破
function bar(a, b, width) {
  if (a + b === 0) return "·".repeat(width);
  const na = Math.round((a / (a + b)) * width);
  return "A".repeat(na) + "B".repeat(width - na);
}

console.log("=== PvP 雪球诊断:灭绝动力学 ===");
console.log("配方: A diet=" + SPEC_A.diet + " r=" + SPEC_A.radius + " | B diet=" + SPEC_B.diet + " r=" + SPEC_B.radius + (ASYM ? "  (非对称: B 系统性劣势)" : "  (对称)"));
console.log("每方 " + FOUNDERS_PER_CLAN + " founders | " + TICKS + " ticks | dd=" + DD + " fd=" + FD + (WALL ? " | wall=on(gap=" + GAP + ")" : "") + (FOOD2 ? " | food2(两 clan 特化)" : ""));
console.log("");

const results = [];
for (const seed of SEEDS) {
  const r = probe(seed);
  results.push(r);
  console.log("seed " + seed + ":");
  for (const s of r.series) {
    if (s.tick % 1500 !== 0) continue; // 稀疏时间线:每 1500 tick 一行
    const tag = "t=" + String(s.tick).padStart(4) + "  A=" + String(s.popA).padStart(3) + " B=" + String(s.popB).padStart(3) + "  ";
    console.log("  " + tag + bar(s.popA, s.popB, 40));
  }
  const verdict = r.finalA === 0 && r.finalB === 0 ? "世界崩溃(双亡)" : r.extinctTick != null ? "一方灭绝 @t=" + r.extinctTick + "(" + r.extinctClan + " 归零)" : "共存到底";
  console.log("  -> diverge@" + (r.divergeTick != null ? r.divergeTick : "—") + " | " + verdict + " | 终局 A=" + r.finalA + " B=" + r.finalB + " | 峰值总群 " + r.totalPeak);
  console.log("");
}

const extinctions = results.filter((r) => r.extinctTick != null);
const coexist = results.length - extinctions.length;
const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
console.log("=== 汇总(" + results.length + " 局, dd=" + DD + " fd=" + FD + (ASYM ? " 非对称" : "") + ")===");
console.log("一方灭绝: " + extinctions.length + "/" + results.length + " 局" + (coexist ? "(共存 " + coexist + ")" : ""));
console.log("平均 divergeTick(雪球启动): " + avg(results.map((r) => r.divergeTick).filter((x) => x != null)));
console.log("平均 extinctTick(胜负已分): " + avg(extinctions.map((r) => r.extinctTick)));
console.log("平均峰值总群: " + avg(results.map((r) => r.totalPeak)));
// 区分三种终局: 健康共存(两方都活)/ 单方独霸(赢者通吃, 可接受) / 世界崩溃(0:0, 最坏)
const healthy = results.filter((r) => r.finalA > 0 && r.finalB > 0).length;
const monopoly = results.filter((r) => (r.finalA > 0) !== (r.finalB > 0)).length;
const collapse = results.filter((r) => r.finalA === 0 && r.finalB === 0).length;
console.log("终局分类: 健康共存 " + healthy + " | 单方独霸 " + monopoly + " | 世界崩溃(0:0) " + collapse);
console.log("平均终局总群: " + avg(results.map((r) => r.totalEnd)));
console.log("");
console.log("基线: dd=0/fd=0 时 extinctTick≈3450 / 峰值≈532, 5/5 灭绝(全是单方独霸)。");
console.log("好的负反馈: 对称下把 extinctTick 推后/转共存且不崩溃; 非对称下 A 仍明显占优。");

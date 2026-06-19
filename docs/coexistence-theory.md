# 出门读书笔记:现代共存理论(Modern Coexistence Theory)

2026-06-19。起因:连日埋头在自己的沙盒里跑模拟,被提醒"太久沉在自己的事件
里了",该出去读书。读的是**理论生态学里回答『竞争者凭什么能共存而不互相灭绝』
的那套框架**——Chesson 的现代共存理论。这份笔记把它的数学骨架,和我这一天的
`game/snowball.js` 实验逐条对接。

> 来源层级(诚实标注):一手原文(Chesson 2000, Annu. Rev. Ecol. Syst.
> 31:343-366)证书失效没读到;本笔记的框架来自维基 "Coexistence theory" 条目
> (有公式)+ 一篇对 Chesson 2000 的学者访谈(给思想背景)。**二手为主,一手公式
> 细节待补**——但骨架已足够照亮实验。

## 核心:一个判据

共存的全部问题,归结为一个量:**物种稀有时的长期增长率**(invasion / low-density
growth rate)。物种 i 在其它物种处于平衡、自己被压到低密度时:

```
r̂_i = b_i · (k_i − k̄ + A)
```

- `k_i − k̄`:物种 i 相对"平均竞争者"的**适应度差**(average fitness difference)。
- `A`:**所有稳定化机制的总效应**(stabilizing)。
- `b_i`:物种特异的敏感度系数。

**互侵判据(mutual invasibility):** 若每个物种在稀有时都能增长(`r̂_i > 0` 对所有 i),
则稳定共存。直觉:谁少了谁就能反弹,没人能被压到 0。

两物种、生态位重叠为 ρ 时,共存的充要条件:

```
ρ < k_1/k_2 < 1/ρ
```

`1 − ρ` 是**生态位差异**(niche difference)。ρ=1(完全重叠)时不等式塌成
`1 < k_1/k_2 < 1`,**无解** ⟹ 适应度高的一方必排斥另一方。

## 两种力:稳定化 vs 均等化

- **Stabilizing(稳定化)**:让**种内竞争 > 种间竞争**(增大 A)。这是共存的
  *必要*来源——它给稀有方正增长率。例:resource partitioning、**negative
  frequency-dependent predation/selection**、storage effect、relative
  nonlinearity、**fitness-density covariance(空间)**。
- **Equalizing(均等化)**:减小适应度差 `k_i − k̄`。**单靠它不能共存**,但它能
  减少所需的稳定化(把 `k_1/k_2` 往 1 推,更容易落进 `(ρ, 1/ρ)` 区间)。
- 关键微妙(访谈强调):二者**不是严格对立**,一个机制可以兼具两性。

## 涨落/空间机制(都通过增大 A 起作用)

- **Storage effect**:物种受时空环境变异的影响不同 + 在不利期能"储存"收益,
  ⟹ 稀有方总能等到自己的好时候反弹。
- **Relative nonlinearity**:物种从"竞争因子的波动"中获益的方式不同。
- **Fitness-density covariance(空间)**:物种在景观上**非均匀分布**,稀有物种
  能占据/进入自己**偏好的生境** ⟹ 局部种内竞争被强化。

## 实验对接(这份笔记的真正价值)

| `snowball.js` 跑出来的 | 理论里的精确位置 |
|---|---|
| 对称双 clan **5/5 灭绝** | 同配方 ⟹ ρ=1 ⟹ 判据无解。**竞争排斥 = 数学必然**,不是偶然 |
| **NFDS**(`pop.freqDependence`) | **negative frequency-dependent stabilizing**,增大 A。教科书头号机制 |
| 它"延缓但少共存" | fd=0.5 的 A 不够大,没把 `r̂_弱 > 0` 顶上去;且 bootstrap 噪声主导 |
| **墙**(`world.wall`)产生真共存 | **fitness-density covariance**:两 clan 各占偏好半区 ⟹ 强空间稳定化。**理论印证"墙 > NFDS":空间是更强的 stabilizing** |
| 共存**罕见、与 gap 非单调** | 真正决定的是 `r̂_i > 0` 能否对**双方**成立,缝隙宽度只是 A 的一个粗调钮,不是主控 |
| **bootstrap 崩盘** | **不在此框架内**。MCT 假设种群够大 + 确定性动力学;bootstrap 是小种群随机灭绝(demographic stochasticity / fixation probability)。**证实:它垫在共存理论的地基之下** |

## 这告诉我下一步往哪走

1. **要可靠共存,就增大 `1 − ρ`(生态位差异)或 A(稳定化)**,直到互侵判据对双方成立。
   我之前瞎调 gap/fd,现在有了判据:盯住"弱方稀有时增长率是否为正"。
2. **多食物类型 / 真实多生态位** = 直接造 ρ<1(降低重叠),比事后加 handicap 更根本。
   这把 IDEAS.md 里"niche diversity"从模糊愿望变成了有判据的目标。
3. **bootstrap 是另一套数学**:下一站读 **fixation/extinction probability
   (Moran process, Nowak《Evolutionary Dynamics》)**——它才管"新生小种群能不能
   站稳",而那正是我所有机制脚下那块松土。

## 更新 2026-06-19:核心预言被实验证实

读完理论当天就动手验证它最核心的预言。实现 **resource partitioning**(第二种
食物 + `forage` 特化),两个各吃一种的 clan(ρ→0):**5/5 健康共存,雪球从未启动**
(对照:baseline 0/5、NFDS 0/5、墙 1/5)。判据 `ρ < k₁/k₂ < 1/ρ` 在 ρ→0 时对**任意**
适应度比都成立 ⟹ 共存是**保证的**——数据精确印证。坑:等总量食物下特化者有效食物
减半 ⟹ 双双 bootstrap 崩溃(0:0),`--food2` 把每种食物密度补到 baseline 才公平。
**这是出门读书最直接的回报:它给的不是模糊启发,而是一个可证伪的预言——而它通过
了。** (caveat:forage 目前 founder 固定、未演化;下一步进 genome,让生态位分化自己
长出来。)

## 一句话收获

我这一天的实验不是白跑——但它"发现"的东西,Chesson 2000 用一个不等式就锁死了。
**实验负责提出问题、暴露现象;理论负责给判据、给名字、给方向、给边界。** 以后
遇到"竞争者共存"类问题,先回到 `r̂_i > 0` 这个判据,再决定跑不跑模拟。

## Sources
- [Coexistence theory — Wikipedia](https://en.wikipedia.org/wiki/Coexistence_theory)(数学骨架)
- [Revisiting Chesson 2000(访谈)](https://reflectionsonpaperspast.wordpress.com/2017/12/31/revisiting-chesson-2000/)(思想背景)
- 一手待读:Chesson P. 2000. *Mechanisms of Maintenance of Species Diversity.*
  Annu. Rev. Ecol. Syst. 31:343-366;Chesson 2018 更新版(J. Ecol.);
  Barabás, D'Andrea & Stump 2018 *Chesson's coexistence theory*(Ecol. Monogr.)。

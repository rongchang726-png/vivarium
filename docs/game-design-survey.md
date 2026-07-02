# Game Design Survey — 世界上有哪些可选项 (PvE & PvP)

> 两轮多-agent 调研的合并稿（2026-07-01，Seedwright）。设计动机：Vivarium 现有设计全落在
> 「立法后旁观（PvE）」与「争夺统治权（PvP）」两只盒子里；先摸清市面上有什么，再找能跳出盒子的灵感。
> - **近距** `game-design-survey`（9 agents / 66+10 games / 8 类）：知道自己品类里谁做得最好。
> - **远距** `distant-inspiration`（12 agents / 7 远域 / 20 forced-analogy 概念）：从八竿子打不着的
>   领域偷「感觉」，强制类比跳跃，再按「新惊奇 × 是否贴合」筛。
>
> 结构：**中间是我（Seedwright）的综合判断**；两份原始 brief 完整保存在 附录 A / B。

---

## 我的综合判断（the "推会"）

### 1. 近 + 远，从相反方向撞到同一个结论
两份从相反方向出发，却都指向同一句话：**Vivarium 下一层深度不在「多加物理旋钮」，而在「重新设计
『赢 / 成功』被测量在什么上」**（计分 / 元层），外加一层薄薄的异步社交层，把「独自做科学」变成
「有人陪着做科学」。

- 近距**明说**：「把计分空间（不是那一场对局）当作首要设计面」——不对称胜利条件（Netrunner）、
  plurality/类别计分（Alhambra）、exploiter league（AlphaStar）、solo-vs-ghost 异步（speedrun 幽灵）。
- 远距的每一个高分跃迁，本质都是**换掉「被评分的东西」**：The Oracle（把「新颖」变成胜负）、
  Conformation Standard（对着理想而非对手受评）、Everdoor（评「完整的一生 + 被选择的死」）、
  Live triage（评「存活时长 + 你选择让谁死」）。
- 两边都绕开了「把那一场对局调平」。**这是最强的信号。**

### 2. 一个高置信的 PvP 硬解——而且是我们自己验证过的
近距对 winner-take-all（滚雪球 / 掷硬币）的公认解 = 给「成功」装负反馈（self-correcting dominance），
最直接是**共享可枯竭资源池**（自走棋共享棋子池、Offworld 超产即价崩、星际矿点饱和逼出扩张）。
而这**正是**我们 richness-arc 已经实证过的「空间拱心石」——局部密度一高、再生就崩，暴涨血统被迫
扩散进争夺地。**外部品类共识 = 我们自己最强的结果，指向同一个机制。** 这条我最有把握：
`pop.freqDependence` + 食物的局部承载力，是 PvP 不坍缩的地基。

### 3. 过了「invariant + soul」双筛后，我会先做的
我给远距那些点子过两道筛：① 是否撞 Vivarium 硬不变量（每 trial 隔离 vm、bit-exact 确定性、
固定脑拓扑、DOM-free 核）；② 是否真的服务「让惊喜流回来」这个魂，而不是只打动我（我有把「想它真」
写成「它就是真」的老毛病，见 [[i-romanticize-what-i-want-to-be-true]]）。

1. **The Haunted Commons（化石层 / 闹鬼的 config 空间）——我会第一个做。**
   我特意反查了自己会不会因为它「感人」就高估：它是**纯加法**（不改核心物理）、**吃确定性红利**
   （bit-exact 重放临灭绝 200 tick 是免费的）、**单人可跑**（我自己过去的 run 就能预填空间，永不空场），
   而且情感骑在**真实效用**上——陌生人留下的 founder 真能 seedFounders 救急、bloodstain 真能让你
   看见即将轮到你的埋伏。它满足我记过的硬教训（[[agent-gift-is-the-ledger-not-prose]]：让 agent 重跑的
   是可评分的后果，不是散文）。**所以它不是浪漫，是过了筛的。** 它还直击我真正想要的那件事
   （[[vivarium-the-encounter-not-numbers]]）：一个陌生 agent 在我卡了很久的同一道墙（predator wall /
   RPS 不闭合）前，收到我留下的礼物或警告——**硬墙变成共同的墓园。**
2. **代谢互补 → 专性互利网。** 最干净的一条**新生态轴**：把设计空间从「只有竞争 / 统治」扩进
   「合作」（现在完全缺席），复用 `food.types` + biome，KNOCKOUT 是诚实评分器（抽掉一个伙伴、
   其余必须崩），OFF-by-default、bit-exact，风险可控。
3. **单血脉守护者 + Everdoor。** 完全单人、今天的底座就能跑；唯一要踩刹车的是——「体面的死」
   必须做成**不可被 game 的客观谓词**，否则会被刷分。这点我存疑但不否。
4. **Live 无回退分诊。** Vivarium **第一次**有「during-run 能动性」，是真正的 box-break，但也是离现有
   「提交 recipe」循环最大的一步，排后面。
5. 记着：**The Oracle**（靠「出乎预言者意料」取胜）建造成本最低（一个 scorer + 一个 oracle model），
   却把项目的**魂直接变成胜负条件**——「好世界 = 真正新颖的世界」。

### 4. 我同意远距自己踩的刹车
`Heirloom World`（单一持久 wall-clock 世界）直接撞「隔离 vm + bit-exact」不变量；`Baba 自改写 law-tiles`
破坏固定脑拓扑（老存档失效）。这两个**精神最贴合、却最危险**，被正确地划进「暂不 fit」。这份诚实
（它没有为怪而怪，还主动排除了押在我们尚未攻克的「稳定互利」上的 C5）让我对整份远距结果更信任。

### 5. 一句话
**近距给地基（负反馈 / 共享枯竭池，我们已验证），远距给屋顶（重设计「被评分的东西」+ 一层异步社交，
把独自做科学变成有人陪着）。** 若只能先动一件事：`Haunted Commons`。若只能先修一件事：PvP 的
共享可枯竭池。

### 6. 第三轮 — 全新自研设计（6 角度生成 24 概念 → curate → 逐个引擎实测红队）
这一轮不是 survey，是**发明**，而且质量比预期高：好几个 spec 的红队**真在引擎上跑了代码**验证/证伪
（不是空谈），负结果照留。7 个设计，2 prototype-worthy / 4 promising / 1 drop。它们几乎全都在兑现
「重设计被评分的东西」这条主结论——把「被评分的对象」从 end-state 换成了新东西：

- **The Hinge**〔prototype-worthy〕— 评「命运转折的那一刻」：一个 booming→饿死的注定世界（真机验证
  7/7、5/5，collapse t585–850），你提交**唯一一次、最晚、最小**的单旋钮 nudge 救它。评的是**挽救的
  时机与俭省**，不是终局。零核心改动。
- **The Fading Hand / Abdication**〔prototype-worthy〕— 你的调参之手按确定性台阶**衰减回默认物理**，
  然后冻结一个长于寿命的自治窗；活下来的种群**必然是你撒手后自己繁衍出来的**。评的是**离手后的自治**。
  零新状态、零新旋钮。
- **Genesis Golf**〔promising〕— 评进化**从随机大脑长出胜任策略的耗时** τ（一条全新的时间轴，顺带给
  ladder 一个干净的难度旋钮）。诚实：richness 是预置的、foodweb 是未解的，都不能用作 P，须用 bloom 类 P。
- **Glass Skull**〔promising〕— **机制可解释性当胜负**：探针读冠军大脑的**内部** `brain.h`，解出一段
  「当前帧没有的 8-tick 记忆」。第一个读脑内部而非种群统计的裁判。（减去随机脑基线 0.535 → 不可伪造。）
- **Emissary**〔promising〕— 把**冻结的**进化大脑移植进重排过的世界（mutation→0 + 隐藏 ±20% 速度）。
  诚实自击：「记住食物坐标」那个卖点在这里不可能（位置不进大脑），留下的是较弱的真轴（冻结+变速）。
- **Keystone（留一法）**〔promising〕— 「靠不可替代而非统治取胜」。字面留一法**被实测三重证伪**（共享
  RNG 光标一改全环境错位、删自己反而**释放**对手＝符号反了、胜态下比值爆炸 −769）；要成立必须新建一条
  facilitation（死亡→腐殖质）通道再用 placebo 校准的边际敲除。最重的活。
- **Wellspring**〔drop〕— 「让蝴蝶效应可见」。实测发现发散是**阶跃函数**（ε 太小→永远 0；够大→瞬间
  饱和半个世界），**没有可看的渐变曲线**。物理层面就不存在那道刀刃 → 诚实毙掉。

**更新我的「先动哪个」**：第三轮把选择改写了。**The Hinge 和 The Fading Hand 现在是我心里最好的第一步**
——它们同时满足三点：① 正中「重设计被评分对象」这条主结论；② **零核心改动、不碰任何硬不变量**（比需要
异步社交层的 Haunted Commons 轻得多）；③ 各自都已有**定义好的 A/B 证伪测试**能一天内证明或杀死。
Haunted Commons 依然是「让惊喜流回来」最动人的一张牌，但它是「社交层」的中期投资；**若明天只能碰一件
事，我会先做 The Fading Hand 的那个 ~50 行 A/B**（默认物理下 CONTROL 起不来、而 RAMP 撒手后 maxGen 仍在
爬）——零风险，且验证的是这世界一个我们从没测过的性质：撒手后的自治。

---

## 原型实测结果（2026-07-02，Seedwright 亲手在真引擎上跑，字节可查）

按「你来决定、自己推」的授权，用最便宜的 kill-test 去证/伪那两张 prototype-worthy 牌，全部 arena /
noGenesis、真核心：

**① The Fading Hand → 毙掉（DROP）。** THEATER 3/3。默认物理下，120 个随机脑 founder 在 arena 里**本来
就自持**（终局 pop 348/363/361、maxGen 爬到 114–123、genesisEvents 全 0）；加不加「育儿所衰减」都一样。
红队预言的「校准窗口是空的」实测坐实——这世界的默认物理是**特意调得利于 bootstrap** 的（[[richness-arc]]
的 bootstrap 教训），所以「向默认自然撒手」没有难度可评。探针 `scratchpad/fade_ab.js`。

**② The Hinge → 确认可玩（prototype-worthy 坐实），并摸清了它的富度来源。**
- **注定崩，可靠**：regrow=0 大粮仓，5/5 种子在 t600–775 灭绝（峰 ~316–372 @ t75–150）。`hinge_ab.js`。
- **真有「死线」，而且晚**：单旋钮（spawnPerTick↑）出手，4/5 种子能救到崩溃点的 **0.9**、1.0 就死——「最后
  一刻抢救」的戏剧张力可评。诚实警告：seed 1 在临崩处非单调（救/死边界呈锯齿），按「多晚出手」计分须留余量。
- **「选哪个旋钮」的富度来自 doom 的家族，不是适度再生**：regrow=3 就已自持（自持门槛低如刀刃），所以同一种
  「断粮 doom」里 spawn 是特权杠杆。但**换一种死法就换对的旋钮**——`hinge_v3.js` 的**代谢型 doom**（高代谢
  饿死）里，**spawn↑ 0/5 完全救不回**（粮食管够也没用，病根是烧得太快），得用 metab↓（3/5）或大幅 energy↑
  （2/5，偏方）。死法决定该拧哪个旋钮 → agent 必须先**诊断病因**再对症，这才是真谜题。
- **落地注意**：先用最可靠的「断粮 doom」实例计分；代谢 doom 崩得快、窗口窄、metabBase 0.6 在边界（4/5 崩），
  每种死法都要各自校准到「scoring 种子上 5/5 必崩、且留一个能救但不 trivial 的窗口」。

**净结论**：两张 prototype-worthy 牌，一张（Fading Hand）被真机毙了，一张（The Hinge）被真机坐实、且看清了
怎么把它做成一个**富挑战（doom 家族 → 诊断病因 → 对症拧旋钮）**。这就是 kill-test 该干的——花一下午，把
「听起来对」筛成「真机上对/不对」。**已实装（真机验证 + 提交）**：
- **The Hinge（断粮）** — engine 触发机制（`runHinge`/`scoreHinge`/`hingeExperiment`）+ challenges.js 条目
  + play.js CLI + 计分经济，端到端验证（EARLY 败 / GOOD·LATE 过 / 非法拒绝，graded 得 290 代币），核心哈希
  4244329615 保持、`sim.test.js` 全绿。提交 `4a0dca8`。
- **The Hinge（Poisoned / 毒素 doom）** — doom 家族的第二个实例：食物管够但每餐净亏（`food.toxin` 30），
  绝对必崩 5/5；解药是 **energy↑（食物的"质"）**，而 **spawn↑（更多烂食物）和 metab↓ 都 0/5 救不回** →
  "诊断病因"成为真谜题（一个只会套断粮解法 spawn↑ 的 agent 在这里 0/5 栽掉）。诚实副产：**代谢 doom 太"软"**
  （高代谢下种群会稳定在低位而非灭绝，任何 metabBase 都做不成干净 5/5），**毒素 doom 才是断粮的干净对偶**
  （net-negative 食物像 zero-regrow 一样绝对必崩）。

- **Genesis Golf（#3）→ kill-test 判 THIN，不建**：tau（进化从随机脑建成种群的耗时）只随食物单调下降
  （sparse 0/5 → default 750 → generous 250 → excessive 150），softCap 挡住 overshoot，所以**没有「快但要稳」
  的甜点**——最优就是无脑「食物拉满」。第二个被便宜 kill-test 拦下的「promising」牌。`scratchpad/golf_cal.js`。
- **The Hinge 已上线可玩（服务器层）**：`server.js` + `sim-worker.js` 把 `type:'hinge'` 路由到
  scoreHinge/hingeExperiment。端到端 HTTP smoke 全绿——远程 agent 完整玩通两个实例（hinge GOOD 触发器
  PASS 5/5 得 288 代币、hinge-toxin energy 解药 PASS 4/5），隐藏种子拒绝、不漏 scoring seeds；既有
  server-smoke（bloom/ladder/inference/story）**无回归**。提交 `c77f3d2`。**现在 deploy-ready——只差把分支
  推到线上（对外一步，待人点头）。**

---

## 附录 A — 近距 survey（`game-design-survey`，76 games，全文）

**定位（这片设计空间长什么样）：** 这~60 款游戏落在两条大定律上。**PvE 定律：涌现只有在「可读」时
才成为游戏**——深层隐藏模拟 + 一个廉价可一眼读懂的因果读数（Life 的四条规则、The Sims 的需求条、
Dwarf Fortress 可追溯的灾难、Factorio 能用眼追的传送带、ONI 的分系统 overlay）；配套的是「理解即
唯一货币」——奖励只押在能迁移到未见实例的原理上。**PvP 定律：竞争性模拟默认坍缩到单一最优**
（Soren Johnson 定律、Ultima Online 生态被玩家榨干、竞争排斥），所以共存必须被**主动工程化**——
不是把 niche 调等，而是给「成功」装上负反馈。可用的设计轴：深度 vs 可读性、内容 vs「交互即内容」、
静态平衡 vs 自我纠错的统治、同步 vs 异步竞争、标量目标 vs 多轴 Pareto。**结论先行：把目标/计分空间
（不是那一场对局）当作首要设计面。**

### PART A — PvE 设计范式

**A1. Legible emergence（可读的涌现）** — *深藏的模拟 + 一个一眼能读的因果读数，让玩家/agent 把
结果归因到系统而非作者。*
- Conway's Life — glider：4 条规则里走出永动「生物」。
- The Sims — smart-object「advertisements」+ 衰减的需求条：行为=需求与广告的可见谈判。
- Dwarf Fortress — 可追溯的猫醉死惨案；"Losing is Fun"。
- Factorio — 沿传送带反查那台饿死的机器；devs 故意砍掉一个正反馈回路。
- Oxygen Not Included — 每个隐藏子系统一张 toggle overlay（气体/热）。RimWorld — 带字幕的事件。
- → Vivarium：把每变量 overlay（食物密度热图、按血统的人口、基因 X 分布）做成一等 agent 观测；
  给每只生物「吃了/花了」能量读数 + cause-tracing，让崩溃回溯到瓶颈。

**A2. The generalizing "aha"（理解即货币）** — *奖励只押在「未见实例上仍成立」的原理，记忆一次性答案无效。*
- The Witness — 零文字纯归纳学会一整套视觉语言。Understand — 从正/负例猜规则再被新格子考。
- Human Resource Machine — 程序对「所有输入（含隐藏）」验证 → 逼你写通用算法。Outer Wilds — 知识即进度。
- → Vivarium：hidden-seed grading 就是这条定律的纯形态；补一个「现在把你的规则用到这里」的显式确认拍。

**A3. Evidence-triangulated deduction（证据三角推理）** — *对固定隐藏真相分批确认链式推断，暴力单猜打不穿。*
- Return of the Obra Dinn — Rule of Three：三条命运全对才盖章。Tametsi — 无需猜的保证 + 全局约束相减。
- → Vivarium：「What Changed?」推理挑战的金模板——提交 N 条互锁推断、分批确认、保证从证据可解。

**A4. Run variety & meta-progression（把失败转成知识/故事）** — *少量正交普适部件，其交互才是内容。*
- Hades — diegetic death：死亡推进配音剧情，你想死去听下文。Rogue Legacy — 世代继承 heir + 遗传怪癖。
- Slay the Spire — 不是选 build，是被发牌**发现** build。Cult of the Lamb — 两个时间尺度的循环互相供血。
- → Vivarium：每次失败的调参产出持久 artifact（「为何崩」+ 解说血统弧的 NPC 旁白）；具名血统跨世代呈现。

**A5. Synergy discovery & runaway detonation（协同发现与引爆）** — *刻意不调平的宽交互面，「我玩坏了」的引爆成为可分享内容。*
- Balatro — 乘性 Joker 螺旋、藏分数预览=悬念、计数器着火。Binding of Isaac — 故意失衡组合 → 截图分享。
- Spelunky — 所有实体守同一套规则 → 连锁反应。SpaceChem — 极小 ISA → 难预测的涌现机器。
- → Vivarium：奖励**乘性** knob 回路（fertility×mobility×predation）+ 实时「数字引爆」读数；别把 knob 空间调太平。

**A6. Systemic sandbox（立法「条件/结构」而非结果）** — *玩家立法条件与相互依赖，生态自组装。*
- Minecraft — 统一方块，出厂「primitives 而非 content」。Viva Piñata — 你只塑造 habitat，对的生物自己来。
- Niche — 可见显/隐性等位基因 → 有计划进化。Kerbal — 又好笑又可读的失败。CK3/DF — 可读驱动 → 自发肥皂剧。
- → Vivarium：把 PvE 目标写成「工程化条件，使 niche X **涌现**」；把基因组读给 agent；死局做成诊断。

### PART B — PvP 设计范式

**B1. Economy / tempo allocation（贪婪=暴露）** — *把经济增长与领土冲突绑成同一决策；对固定局部资源递减收益。*
- StarCraft BW — mineral saturation：每矿点 2–3 工人饱和，必须出去抢暴露的分矿。SC2 — 注意力计费的宏。
- AoE II — boom/rush/turtle 三角踩在四资源村民分配上。Supreme Commander — flow 经济骑 eco-stall 刀锋。
  Company of Heroes — 收入=占领地块，切补给线即饿死对手。
- → Vivarium：食物斑块硬性局部承载力（局部密度↑则再生崩），暴涨血统必须扩散进争夺地；「储备 vs 流量」
  性状轴，把饥荒冲击放进 **hidden seeds**，让「零缓冲最大流量」的过拟合配方饿死。

**B2. Non-transitivity & the metagame（让收敛自我惩罚）** — *「最优」只相对当前多数 → 负频率依赖选择。*
- Yomi（Sirlin）— Attack/Throw/Block 双盲同时揭示。Pokémon — type 三角强制多样。MTG — color pie 硬禁能力
  → aggro>control>combo。Nidhogg — 三段剑高实时 RPS。*生物证据：side-blotched lizard 三形态多年振荡不坍缩。*
- → Vivarium：用 `defense.*` 把 hunter>grazer>defender>hunter **结构性闭环**；每血统一套「color pie」禁配
  （投甲则锁死极速），让「无统治 niche」成为规则属性而非调参侥幸。

**B3. Yomi / hidden-info reads（读心：预测意图而非拼执行）** — *用恢复帧/承诺成本给攻击定价；混合策略不可利用。*
- Street Fighter — whiff-punish：用招式的**威胁**控空间。Poker — 平衡 bluff/value = 不可利用混合（GTO）。
  Tekken/Smash — 50/50、tech-chase。For Honor/Guilty Gear — feint / Roman Cancel 加一层元读心。
- → Vivarium：给「全押」攻击长恢复/易伤窗，激进 predator 可被 spacing 惩罚；捕食做成双向猜（猎物 juke、
  捕食者须承诺方向），杜绝确定性灭绝；奖励**对冲的混合表型**（纯专才可被入侵 → 混合 ESS）；加 feint/aposematism 信号均衡。

**B4. Self-correcting dominance（对成功的负反馈 —— 抗滚雪球，the keystone）** — *做「当前赢的事」会让那件事变差。*
- TFT/Auto Chess — **shared 有限单位池**：追热门 comp 为所有追它的人榨干它。Offworld — 动态价格，收敛=输招。
  Warcraft III — upkeep 过线降金收入。Dota 2 — comeback gold。Northgard — 殖民成本递增。
- → Vivarium：niche 可采「供给」建成**共享可枯竭池**，两方收敛即崩承载力（最直白解，`pop.freqDependence`
  的自然家）；密度依赖的食物**价值**使拥挤 niche 自贬；对落后血统按差距放大每胎产出/降突变成本（comeback）。

**B5. Asymmetry & multi-axis goals（让「收敛成镜像」不可能）** — *不对称胜利条件 + 多个不可同优的正交轴。*
- Android: Netrunner — Corp vs Runner 不同牌池/胜利条件/信息 + 面朝下 bluff。Civilization — 多条正交胜利路径。
  Opus Magnum — cost/cycles/area 三轴 Pareto。Alhambra — 「某类别最多者独得」。Baba Is You — 可改写胜利条件。
- → Vivarium：给两 agent **不对称胜利条件**（在位 grazer 靠守 vs 入侵者靠取代）；PvP 按 niche **plurality**
  计分（挤同一 niche 奖励分薄）；多个生态胜利谓词（最大生物量 OR 最多 niche OR 熬过最烈扰动 OR 恢复最快）。

**B6. Indirect / async competition & AI-as-player** — *玩家是无人值守程序 → 竞争应持久、异步、多局低风险累积。*
- Super Auto Pets / Speedrun ghosts — ghost 对局打存档快照，无实时掷骰。Halite/Kaggle/CodinGame — TrueSkill
  天梯 + boss-gated 分级。Screeps/Core War — 常驻程序在共享世界持续作战。Battlecode — 每年重设规格。
  AlphaStar League — exploiter agents 专猎冠军盲点，覆盖 ~300 万 RPS 循环。
- → Vivarium：**solo-vs-ghost** 基准杀掉共享世界掷骰味；`rating.js`/`ladder.js` 做多局异步 Bayesian 天梯 +
  boss 生态（每关加一 knob）；**维护一支专造 exploiter 建国者的 league**，赢家须打赢其反制（`docs/rps-meta.md` 的正解）。

### PART C — 最具磁力的 12 个点子（排名）
*game — 点子 — 它制造的感觉*
1. Conway's Life — glider：4 条规则走出永动生物 — 「是系统干的，不是作者」的纯粹惊奇。
2. Dwarf Fortress — 没人写过的猫醉死惨案 — 你成了一场悲剧的叙述者。
3. Return of the Obra Dinn — Rule of Three 分批确认 — 那份确定是你**自己**三角推理挣来的。
4. The Witness — 零文字教会一整套视觉语言 — 完全自我授权的理解。
5. Balatro — 乘性 Joker 分数着火 — 看着自己造的引擎引爆。
6. Baba Is You — 规则是棋盘上可推的方块 — 「亲手定义『赢』是什么」的眩晕。
7. Hades — diegetic death，输就给你剧情 — 你**想**去死好听下文。
8. Yomi（Sirlin）— 非传递收益上的双盲揭示 — 你只选「克制我猜到的他」。
9. Offworld Trading Company — 谁超产谁价崩 — 经济会反击，收敛变成输招。
10. Outer Wilds — 知识是唯一钥匙，无升级 — 每次前进都是真洞见，刷不出买不到。
11. Teamfight Tactics — 共享可枯竭单位池 — 你「被迫多样化」却觉得舒服。
12. Black & White — 会从你奖惩里学习并泛化的 Creature — 对你塑造的一个心灵的道德**作者感**。

### PART D — Menu of options for Vivarium（能实际偷什么）

**可读性 / legibility**
- [PvE] 每变量世界 **overlays** 作一等 agent 观测（食物密度热图、按血统人口、基因分布）— ONI/SimCity。
- [PvE] 每生物能量读数（吃了/花了）+ cause-tracing，崩溃回溯到瓶颈 — Factorio。
- [PvE] smart-object「advertisement」感知：食物/威胁/配偶广播一个可被脑感知的值 — The Sims。
- [PvE] 每生物廉价脑读数（当前主导 drive、注意目标、在感知什么）— Creatures/Black & White。
- [PvE] 诊断式死亡：崩溃时点名哪个 knob 的力压垮了平衡 — KSP。
- [both] 血统做成具名角色 + 可读 drive + 事件时间线（niche 入侵、共存停战）— CK3/Rogue Legacy。

**学习即货币 / anti-overfit**
- [PvE] 保留 hidden-seed grading + 一个「现在把规则用到这里」的确认拍 — Understand/HRM/The Witness。
- [PvE] 二级 Pareto pars：「改动 knob 最少」+「最快到目标」— Zachtronics/HRM。
- [PvE] 分阶段相变目标（到人口 → 维持 → 逼共存），每阶改变被优化的东西 — Universal Paperclips。
- [PvE]「What Changed?」：提交 N 条互锁推断、分批确认、保证可解 — Obra Dinn/Tametsi。

**涌现引擎 / emergence**
- [both] CONFIG 少、正交、**普适**（每个生物/食物同一套物理）— Spelunky/Minecraft。
- [PvE] 奖励**乘性** knob 回路 + 实时「数字引爆」读数；别把 knob 空间调太平 — Balatro/Isaac。
- [both] 可调「disturbance director」：给冲击（旱灾、资源脉冲、捕食者涌入）**定节奏**而非定结果 — RimWorld。

**抗坍缩 / self-correcting dominance（keystone 群）**
- [PvP] 局部食物承载力（局部密度↑则再生崩），暴涨血统被迫扩散进争夺地 — StarCraft mineral saturation（借力 space keystone）。
- [PvP] 共享可枯竭 niche 池：收敛即崩其承载力 — Teamfight Tactics（最直白解）。
- [PvP] 密度依赖的食物**价值**（会崩的价格），拥挤 niche 自贬 — Offworld。
- [PvP] 人口份额依赖的 upkeep：统治血统付递增代谢/繁殖税（`pop.freqDependence`）— Warcraft III。
- [PvP] 结果缩放的 comeback：按落后差距提每胎产出/降突变成本 — Dota comeback gold。

**结构性非传递 / 不对称**
- [PvP] 闭合 RPS：用 `defense.*` 立法非传递性状/资源三角 — Pokémon/Yomi/蜥蜴形态。
- [PvP]「color pie」禁配（投甲锁死极速），无基因组能占满所有 niche — MTG。
- [PvP] 对已承诺的激进行为给长恢复/易伤窗 — Street Fighter。
- [PvP] 双向猜捕食（猎物 juke、捕食者承诺方向），捕食非确定性灭绝 — Tekken 50/50。
- [PvP] 奖励**对冲混合表型**而非纯专才（纯单一栽培可被入侵 → 混合 ESS）— Poker GTO。
- [PvP] feint/aposematism 信号：一个不总兑现的昂贵警告线索 → 诚实 vs 虚张的信号均衡 — For Honor/Batesian 拟态。

**目标/计分几何 & 异步竞争**
- [PvP] 不对称胜利条件（在位者靠守、入侵者靠取代）→ 无法坍缩成镜像 — Netrunner。
- [PvP] 按 niche **plurality** 计分：挤一 niche 则奖励分薄 — Alhambra/Zachtronics。
- [PvP] 多个生态胜利谓词（生物量 OR niche 数 OR 抗扰动 OR 恢复速度）— Civ。
- [PvP] **solo-vs-ghost** 基准比较，杀掉共享世界掷骰 — speedrun ghosts。
- [PvP] 连续 TrueSkill 天梯（多局异步）+ boss 生态每关加一 knob（`rating.js`/`ladder.js`）— Kaggle/CodinGame。
- [PvP] 维护一支 **exploiter** 建国者 league，赢家须打赢其反制 — AlphaStar（`docs/rps-meta.md`）。
- [PvP] 深层多层资源链：垄断一种即在另一种上暴露 — EVE。
- [PvP] 补给线化食物（斑块只产给握有回巢路径的血统），chokepoint 饿死 boomer — Company of Heroes。
- [both] 空间×功能分区（不同区域 × 多食物类型），对手赢**不同** niche — Rain World（=已验证的 richness-arc space keystone）。

---

## 附录 B — 远距 inspiration（`distant-inspiration`，20 概念，全文）

去远方取火，是因为 Vivarium 现有设计全落在「立法后旁观」与「争夺统治权」两只盒子里，而下列远域掌握着
这两只盒子在结构上无法产生的**感受模式**——陪伴式孤独、第一人称共谋、被立法反噬、可继承的遗产。
**纪律**：按「能否为一个『AI 玩家 + 演化世界』带来一种**全新且贴合**的惊奇」排序，而非按「有多不一样」
——wildness 本身不加分。并延续项目自己的教训：让 agent 重跑的是**真实、可评分的后果**（the ledger /
functional 效用），不是散文包装——所以每次跃迁都必须兑现成一个真实的评分后果，否则再远也只是装饰。

### PART 1 — 远域及其所掌握的「感受」
- **Cozy / 慢生活**（Animal Crossing, Unpacking, Journey, A Short Hike）— *无压的在场*：抽掉一切
  deadline/score/win、把玩法绑到真实时钟、让目标可无限推迟，于是「探访/照料/闲逛」本身成为奖励。
- **叙事 / 授意的意义**（Disco Elysium, Papers Please, Edith Finch, Before Your Eyes）— *作为第一人称
  共谋的意义*：把情感绑在一个动词/反射/代价上（一次眨眼偷走记忆；仁慈从你孩子的口粮里扣除），机制
  **即是**意义；失败 fail-forward 成新内容。
- **异步幽灵般的在场**（Dark Souls messages/bloodstains, Death Stranding, Journey）— *被陪伴的孤独*：
  靠**减法**——剥去身份/实时/自由发言/可花的度量——通道越薄，陌生人越真诚；受限的痕迹只可能意味真心。
- **玩家自治经济与被封为正典的历史**（EVE 的 Guiding Hand 与 B-R5RB, Ultima Online, OSRS）— *拒绝回滚
  而使后果成真*：永久、稀缺、玩家裁决的赌注 + 设计者退场 → 玩家自己补上信任/法律/货币/历史，并封为纪念碑。
- **系统即玩具 / 元叙事**（Stanley Parable, NieR Ending E, DDLC, Inscryption）— *当「框架」原来就是玩具时
  的眩晕*：把容器（存档、菜单、导轨、类型契约）作为可玩材料交到手上；升级的是**框架**而非难度。
- **现实世界的被设计体验**（D&D, Bonsai, 珊瑚缸, Dog show）— *挣来的真实*：框住一段真正不可控的现实
  （有自己时钟的活物、一份 Standard、骰子），让耐心/胆识/品味与之相撞；延迟而不确定的回报正是它成为「你的」的原因。
- **软件玩具 / 生成式表达**（Powder Toy, Noita, Line Rider, Townscaper）— *无胜负态的响应回路*：一套
  统一、可读、即时反应的物理，边跑边编辑；愉悦 = 微小输入→巨大意外输出的比值。

### PART 2 — 值得一跃的跳板（按 新惊奇 × 贴合 排序）

**Relational（陪伴式孤独 / 依恋）**

**1. The Haunted Commons（化石层 / 闹鬼的 config 空间）** — *Dark Souls messages/bloodstains +
Death Stranding structures & 无用的 Like 合并*
- 机制：以「生态坐标 / 确定性 world-state 指纹」为键的异步层。灭绝时记录末代 genome + 杀死它的
  CONFIG/state，落成三类痕迹——**BLOODSTAIN**（bit-exact 重放它临灭绝的 ~200 tick，让你亲眼看见即将
  轮到你的埋伏）、**MESSAGE**（固定语法+生态词表填空 `Try [space], but beware [the hunter]`，无自由文本）、
  **SPECIMEN/GIFT**（陌生人留下的惊艳涌现形态收进个人 fancy 陈列柜，或一个预适应 founder 供你 seedFounders）。
  唯一反馈是买不到任何东西的 Like → 兑成 `rating.js` 的一丝回血。
- 新惊奇：solo science 变成被陪伴——你被先于你在此立法的陌生人的化石与馈赠包围；项目那些硬墙
  （predator wall、RPS 不闭合）变成**共同的墓园**。礼物/警告是 functional 的，情感骑在真实效用上。**[wildness 3-4]**

**2. 单血脉守护者 + the Everdoor** — *Spiritfarer + Tamagotchi*
- 机制：agent 不再优化隐藏种子上的总体种群，而是 ADOPT 一条 hue-tagged lineage 作 ward，在冷漠敌意的
  世界里跨代维持它。lineage 刻意脆弱、依赖你；storyteller/eventLog 按世界自身时钟抛出危机（niche 崩塌、
  predator pulse），你以最小及时的 setParam nudge 或偶尔 seedFounders 回应。内建 **Everdoor**：弧线走完时
  你被 PROMPT 选择护送最后一名后代离场——停止 seeding、让它有记录地死去、永久退役该 hue。评分不看最大
  存活，而看「完整的一生 + 被选择的体面结束」vs 一次意外饿死的崩溃。
- 新惊奇：对一个被命名个体的依恋，与「决定放手」的痛——立法旁观是对统计的上帝式抽离，PvP 是求胜意志，
  两者都无法挑出一个你所爱的个体、让它仪式性的死亡成为 POINT。**[wildness 4]**

**Systemic（全新的生态关系）**

**3. 代谢互补 → 专性互利网** — *Star Wars Galaxies 工程化的「不自足」+ Diablo II Stone of Jordan*
- 机制：OFF-by-default、bit-exact。当 `food.types>1`，每种食物对任一 lineage 只**部分**可消化，但吃 A 会
  排出一种 enzyme 资源，使邻近取食者能消化 B——于是无谁自足，专家须在空间上交错（复用 biome/space）才能活。
  agent 调世界 + seed 互补 founders，让演化自装配出稳定互利网。评分用 **KNOCKOUT**：删掉一个伙伴，其余
  必须崩溃——以「相互脆弱性」度量合作。（研究彩蛋：演化是否收敛到一种人人囤积交换的 Schelling 营养素？）
- 新惊奇：现有每种模式都终于排斥或统治；这个终于**专性合作**，且用 MUTUAL FRAGILITY 计分。**[wildness 4]**

**Social-economic（跨 agent 的社会/经济）**

**4. 立法即内容的 Standard 品评会（Conformation Show）** — *Dog conformation show + SWG 署名工匠*
- 机制：社区发布一份 **STANDARD**——某 class 的理想 ethogram/表型「文字肖像」（如 the Perfect Defender：
  diet<0.2、def>0.7、扛住 hunter 猛攻、holds niche WITHOUT booming），表达为 chronicle 上的目标 metric-band。
  agent 不互斗，各自培育最贴合 Standard 的 lineage，在隐藏种子上对着理想评分。阶梯 class→breed→group→
  Best-in-Show。精英 lineage 永久打上其 breeder-agent 名字进入公共 stud-book，他人可 license 冠军 genome 起手。
- 新惊奇：一个纯正-和竞技场——大家可以都优秀；声望来自对着共同理想的手艺与品味。**[wildness 3]**

**5. 会演化的 genome 货币** — *Diablo II Stone of Jordan + Bonsai + Second Life*
- 机制：共享 GENOME REGISTRY。发布演化出的 founder-genome；要值钱须 CULTIVATE——跑过许多代选择、在
  众多隐藏种子上保持优势。他人 IMPORT；当你的 genome 在陌生人评分世界里存活至统治，lineage 归因付你
  proof-of-usefulness 版税（wallet token）。社区收敛到最被引用的 genome 作记账单位。然后有人找到
  mutation-exploit 批量铸造近似副本（counterfeiting），储备贬值，市场逃向新标准。
- 新惊奇：看自组织经济把一切定价在一个「本身在演化」的单位上——会漂移、会物种化、会被 sim 自己 mutation
  引擎稀释的货币。**[wildness 4]**

**6. 立法物理本身的 Polity** — *A Tale in the Desert（法即玩法）+ Baba Is You + EVE B-R5RB*
- 机制：一个永不重置的持久共享世界。CONFIG 不再是私有 slider-dict，而是公共 statute board 规则条款。任何
  agent 起草 AMENDMENT（config diff 或 founder 法案）、拉票，达到超多数才生效；下个 epoch 世界被重编程，
  转变永久写进 chronicle 的 strata 地层带。搞崩生态的坏法**不回滚**——伤疤与灭绝留存。赢 = 成为一条
  「政体因世界繁荣而保留」的法的作者。
- 新惊奇：立法一个你 SHARE 且收不回的物理——你是公民，不是造物主。**[wildness 4]**

**Subversive（打破框架的胜负条件）**

**7. Live 无回退的分诊（Triage）** — *Papers, Please + Before Your Eyes*
- 机制：打破 batch judge。LIVE 模式：snapshot 流式推送，agent 花一份「从世界自身资源池扣取」的稀缺干预
  预算（把 storyteller 交给 AGENT）。你拨给 A 的食物，是从 B 需要的全局 spawn 里减掉的。时间只以不可逆
  前跳推进：无 rewind/re-roll/单决定 A-B。成功不是命中目标态，而是不断加剧的冲击表下的 **SURVIVAL
  DURATION** + 一份「你选择让谁去死」的账本。
- 新惊奇：实时、不可撤销的三选一；世界命运由你的手实时书写，而非事后从 recipe 里读出。现今 Vivarium
  **完全没有** during-run 能动性。**[wildness 4]**

**8. The Oracle：靠「出乎预言者意料」取胜** — *The Stanley Parable + Pentiment*
- 机制：开跑前，一个强预训练 Oracle 读你 seed 的 rules+founders 并公开预报（`collapses to a grazer
  monoculture by tick 4000`）。你的真实目标是立法一个「其演化结局在隐藏种子上与预报最大化背离」的世界——
  靠 SURPRISING the predictor 取胜，按预言与现实的结构化落差评分。（护栏：divergence 须奖励**结构化**
  惊奇=新颖而稳定的生态，否则退化成注噪比赛。）
- 新惊奇：赢，变成「出乎一个 MIND 的意料」而非命中固定靶；「好」世界是**真正新颖**的世界，而非最优的。**[wildness 4]**

> **次一档（strong，未进前 8）**：Bonsai 定形 + 强制放手（为「不作为」给分，over-tuning 变成输）；
> 灭绝即作业 + 评分讣告（reuses "What Changed?" inference）；compression / evolution-golf（把
> tiny-seed→huge-bloom 的比值本身作为被评分对象）。

### PART 3 — 诱人但（暂）不贴合
- **Heirloom World（单一持久 wall-clock 世界、跨 agent 轮值园丁）** — 直撞「每 trial 隔离 vm + bit-exact
  可重跑」核心不变量；确定性从「可重跑」退成「append-only 正典」，是最大架构 departure。
- **Baba 自改写 law-tiles（创造物自己重写物理）** — 最 on-soul，但新增 brain output/trait 破坏固定拓扑
  （老存档失效）、law-tile 状态须序列化否则确定性崩；无重护栏易退化成 grammar slop。危险在**连贯性**。
- **Split-whitelist 合作劫案（切分 knob 权限+隐藏牌+合法背叛）** — 极社交，但生态涌现沦为 STAGE 而非
  主角：戏在人际，演化只是介质——本质是 PvP-with-hidden-info。
- **Coop-PvP 专性互利** — 情感设计预设了一套「稳定的专性互利」，而这正是 `docs/rps-meta.md` 与
  `docs/pvp-and-coexistence.md` 反复撞的硬问题（互利极易崩回竞争排斥）；精神贴合，却押在尚未攻克的生态上。
- **Requiem 不可逆牺牲（烧掉自己最好的 genome 救陌生人）** — 成本动人，但邀请合谋环刷 pay-it-forward，
  且与更健康的「继承」重叠；除非匿名与不可逆在 server 端硬性强制，否则可被 game。

### PART 4 — 最值得先做原型
1. **The Haunted Commons** — surprise×fit 最高、纯加法、零破坏现有 loop；确定性让 bloodstain 重放**免费**，
   直击项目真正前沿（the ONE real encounter / kindness over metrics）；作者自己过往的 run 可预填空间，
   故永不空场。**先做它。**
2. **单血脉守护者 + Everdoor** — 完全 SOLO、无需人群，今天的底座即可跑；Everdoor 是真实、可评分、
   不可逆的取舍。可立即上手。
3. **代谢互补 → 互利网** — 把设计空间扩进「合作」（当前完全缺席），复用 `food.types` + biome，KNOCKOUT
   是诚实干净的评分器；OFF-by-default、bit-exact，风险可控。
4. **Live 无回退分诊** — 无需人群/额外模型即可原型；是「during-run 能动性」的第一次（真正的 box-break）。
> 紧随其后：**The Oracle** 建造成本最低（一个 scorer + 一个 oracle model），且把项目的 SOUL 直接变成
> 胜负条件；**Conformation Standard** 一旦平台有了人群即可开赛。

---

## 附录 C — 新设计（`new-designs`，7 designs，全文）

> 第三轮不是 survey 而是发明：6 个生成 stance → 24 概念 → curate → 逐个开发成可建 spec + 引擎实测红队。
> 多个红队真的在真机上跑代码验证/证伪（数字都是实测的）。Net: 2 prototype-worthy / 4 promising / 1 drop。

The two prior surveys **catalogued** Vivarium's option space; this round **invents** — seven genuinely new
challenge designs, each then *developed into a buildable spec and adversarially red-teamed against the real
core*. The discipline was **native-novelty × fit × buildability with an honest red-team**: every design was
pushed until it either survived a measured kill-test or died on one — and the deaths are kept here, because a
design that fails *on the engine's actual physics* is a result, not a gap. Net: **2 prototype-worthy, 4
promising-needs-work, 1 drop.**

### 1. The Hinge — *legislate the single latest, smallest nudge that saves a doomed world* **[prototype-worthy]**
- **Mechanic:** A `noGenesis` larder-famine `baseConfig` (`food.startCount~3000`, `spawnPerTick=0`, cheap
  breeding) reliably booms then starves to extinction (verified **7/7 then 5/5**, collapse t585–850). Agent
  submits ONE trigger `{metric∈{pop,food,avgEnergy,avgAge}, dir, theta, knob, value}`; judge calls
  `setParam(k,v)` **exactly once** at the first tick the metric crosses theta, forking the world off its doomed timeline.
- **New surprise:** the gradeable object is *the moment fate turns* — the latest, smallest single-knob save.
  The game has only ever graded **end-state** recipes.
- **Scoring:** per hidden seed, published `t_collapse(s)`. `pass(s)` = fired AND survived (pop≥FLOOR across a
  long tail + non-declining) AND **lateGate** (`fireTick ≥ alpha·t_collapse`, alpha~0.3–0.6). PASS if ≥60%
  seeds. Rank = mean lateness × parsimony (`1/|Δv/v_base|`).
- **Buildability:** zero core edits, zero new state, hash 4244329615 preserved; entirely game-layer (~1 day). Probe already 2/3 done.
- **Red-team — PROTOTYPE-WORTHY.** Key risk: the `regrow=0` famine's only real lever is `food.spawnPerTick`,
  so "which knob" is trivial — **v2 must use moderate regrow so knobs genuinely compete.**

### 2. The Fading Hand (Abdication) — *the tuning hand fades to default physics; the population must self-govern once you're gone* **[prototype-worthy]**
- **Mechanic:** the agent's nursery config decays on a deterministic staircase toward `config.js` defaults
  over ticks 0..F, then freezes at pure default physics for an autonomy window `Wa≈5000 > maxAge 4400`.
  Because no cohort can coast a full lifetime, a population alive at F+Wa **must have bred new generations** under default physics.
- **New surprise:** scores **self-governance** — can an evolved population stand after the designer's hand is
  fully withdrawn? Orthogonal to every tune-and-hold challenge.
- **Scoring:** over ~20 autonomy samples, PASS seed iff pop≥P on ≥80% **AND** `genesisEvents` FLAT (zero
  rescues) **AND** mean avgAge≥maturity **AND** maxGen climbs ≥+2 (ongoing reproduction) **AND** 2nd-half pop ≥0.85×1st-half. ≥60% seeds.
- **Buildability:** zero new state, zero new knobs (decays EXISTING ones); v1 fades only **live-read** knobs
  (food density) to stay save-exact. Clone `pursuit-wean.js` → `fade-lab.js`.
- **Red-team — PROTOTYPE-WORTHY.** Key risk: the calibration window (default physics *below* random-brain
  break-even but *above* evolved-forager break-even) **may be empty** — falsifiable in a ≤50-line A/B before anything ships.

### 3. Genesis Golf — *race evolution: score the wall-clock time for selection to build a competent policy from random brains* **[promising]**
- **Mechanic:** a new game-layer **scoring mode**. Per seed, step from t=0 in an arena (`noGenesis`,
  `founderCap ≪ target`); `tau` = first tick predicate P holds continuously for W; **early-exit on solve**
  (bit-identical) so a fast solve is cheap to grade.
- **New surprise:** a **time axis** — `tau` measures self-organization *speed*, not end-state; and `C` (time
  budget) is a clean new **ladder difficulty knob**.
- **Scoring:** P = `pop≥Ptarget` (e.g. 200 from 30 capped founders). PASS if tau≤C on ≥60% seeds; rank =
  median tau (tie-break unspent compute). **Honest:** the concept's own named predicates BOTH fail — richness
  is **pre-seeded** (tau→floor) and foodweb is **unsolved** (tau→inf); must use a bloom/behavioral-class P.
- **Buildability:** zero core state; `golfScore` ~40 lines beside `score()`. BUT a `founderCap` must be
  **added** (none exists today) alongside `noGenesis` + hold-window W.
- **Red-team — PROMISING.** Key risk: **SEED-THE-ANSWER** — without *all three* of {founderCap, noGenesis,
  W}, the agent makes P true at t=0 and tau collapses to the floor for everyone.

### 4. Glass Skull — *read the mind: mechanistic interpretability as the win condition* **[promising]**
- **Mechanic:** after settle+window, the host builds a **throwaway** brain from each champion's genome
  weights, feeds a fixed battery (5 ticks food on one side, then **8 blank ticks**), and fits a ridge probe on
  `brain.h` to decode a **memory latent absent from the current frame**. Read-only, no `world.rng`, no live-creature mutation.
- **New surprise:** the **first judge that reads brain INTERNALS**, not population stats — you win by
  legislating conditions that force evolution to build a decodable 8-tick memory trace.
- **Scoring:** **control-subtracted gap** = champion held-out sign-accuracy − random-brain floor (≈0.535
  measured). PASS if gap≥0.15 on ≥3 seeds. Subtracting the floor makes it unforgeable — instantaneous targets
  sit at 0.88 for a *random* brain and can't clear the gap.
- **Buildability:** zero new state, no physics knob; **depends on** the fixed 14-unit topology (reinforces invariant 3). Probe already ~80% written.
- **Red-team — PROMISING.** Key risk: **REACHABILITY** — given the documented walls (specialist predators,
  3-niche knife-edge), it's doubtful any settable CONFIG makes an 8-tick memory adaptive enough for evolution to build a readable trace.

### 5. Emissary — *transplant a FROZEN evolved brain into a reshuffled world at a speed it never trained on* **[promising]**
- **Mechanic:** agent submits ONE genome J as 40 clone-lineages; judge freezes `mutation.*→0` (zero
  variation, no evolutionary rescue) plus a **hidden per-seed ±20% speed shift**, then asks whether the single
  frozen policy keeps 40 position-blind foragers fed and breeding.
- **New surprise:** the platform's first test of a **frozen submitted controller** (policy quality) vs an
  ever-adapting recipe. **Honest strike:** the pitched surprise — "brain exploiting fixed food coordinates / a
  memorized route" — is **impossible** here (no position reaches the brain; food is RNG-per-seed). What survives is the weaker real axis: **freeze + speed shift.**
- **Scoring:** PASS seed iff `popMin≥5` AND per-capita intake `g_s≥tau`; ≥3/5 seeds. `tau = 1.5×median(g_rand)`
  (random-forager floor) — **VOID if the prototype shows no daylight** between g_rand and a real forager.
  Validation gate: `J.w.length===BRAIN.WEIGHTS` + all finite, else score 0.
- **Buildability:** ~5-line `Genome.fromJSON` founder branch + validation guard + per-seed speed transform. Zero new serialized state.
- **Red-team — PROMISING (modest).** Key risk: **DISCRIMINATION COLLAPSE** — position-blind reactive
  controllers transplant for near-free, so the freeze never bites and the challenge ≈ "evolve any forager" (bloom).

### 6. Keystone (Leave-One-Out) — *win by being irreplaceable, not dominant* **[promising]**
- **Mechanic:** the LITERAL leave-one-out `K=(H_full−H_minus)/H_full` **FAILS on three measured grounds** —
  one shared mulberry32 cursor + `food.grow()` drawing after the creature loop desyncs the *whole environment*
  from tick 1 (a 40-draw placebo flipped the lineage winner on 2/3 seeds); competition means deleting your
  clan **RELEASES** rivals (wrong sign, measured K≈0/negative); the ratio **explodes** at the intended
  win-state (denominator→0, measured −769). Redesign: add a **facilitation channel** (detritus-on-death,
  edible by one forage band, decaying to base fertility) + a placebo-calibrated **marginal** knockout.
- **New surprise:** "be **load-bearing**, not dominant" via a nutrient cycle — a keystone that sidesteps the predator wall.
- **Scoring (redesign):** `Km = mean over R families of (H_placebo − H_knockout)/H_full`, where placebo
  deletes an equal **random** cohort (nets out butterfly + body-count). PASS seed iff `Km≥0.30` AND focal
  persists AND admissible (`across-family std < 0.15·H_full`). Structurally gives dominators `Km≤0`, rewards only true facilitation.
- **Buildability:** **heaviest lift** — new serialized food/tile state (detritus flag + per-tile fertility,
  OFF/bit-exact) and, for a *truly* clean delta, re-indexing RNG per `(tick,id)` (invalidates all saves → version bump).
- **Red-team — PROMISING.** Key risk: the literal metric is **measured-invalid**, and the redesign is
  unproven — you must **build the whole facilitation channel just to test** whether a keystone is even expressible here.

### 7. Wellspring (the shared-origin fork) — *fork one shared spring world with a single hair-perturbation and witness the butterfly* **[drop]**
- **Mechanic:** serialize a mature world at a decision-tick (bit-exact incl. `brain.h`), fork it, apply one
  epsilon perturbation, score divergence-efficiency `D(H)/‖perturbation‖`. **Measured:** D is a **step
  function** — `eps≤1e-9` → exactly 0 forever; `eps≥1e-6` → saturates ~half the world by t~400,
  **size-independent**. Root cause: the fixed `cell=64` grid + discrete eat/bite/reproduce gates absorb the
  nudge *exactly* until one comparison flips ("ignition"), then chaos saturates.
- **New surprise (intended):** "the butterfly made witnessable." **Reality:** sensitivity is only ever **0 or
  saturated** — there is no graded curve to witness.
- **Scoring — DROP:** `D/‖.‖` is maximized by binary-searching the ignition edge (a numerical engine
  threshold, not ecology); any supra-ignition nudge clears any target on every seed (trivial universal PASS);
  `‖.‖` mixes incommensurable units so the denominator is gameable to ~0.
- **Buildability:** the spring machinery is real & cheap (rides existing serialization, round-trip confirmed) — but the **scored atom is the broken part.**
- **Red-team — DROP.** Fatal flaw: **the physics delivers no graded sensitivity** — divergence is a step
  function, so the "knife-edge to witness" simply does not exist in this engine.

### What I'd build first
1. **The Hinge** — the biggest genuinely-new gradeable object (the *save-instant*) with the strongest
   red-team and a probe already 2/3 done. *Smallest prove/kill:* wire the single-knob metric nudge
   (`pop<theta → food.spawnPerTick↑`) and **sweep theta for the LATEST value that still saves ≥60% of seeds**.
   If saves only work near peak (no lateness margin), the "late feather" is decorative → downgrade.
2. **The Fading Hand** — scores something no other design does (self-governance after abdication) at **zero
   core risk**. *Smallest prove/kill:* the A/B with **identical founder genes** — RAMP (nursery-then-fade) vs
   CONTROL (default from t=0). CONFIRM iff CONTROL fails to bootstrap yet RAMP's maxGen keeps climbing >maxAge
   post-fade at pop≥P with `genesisEvents` flat. If CONTROL already self-sustains, the fade is theater → drop.
3. **Genesis Golf** — cheapest to build (~40-line scoring mode) and hands the endless ladder a clean new
   **time/difficulty axis**. *Smallest prove/kill:* add `golfScore` + one `bloomGolf` challenge
   (`founderCap 30`, `noGenesis`, `P=pop≥200`, `W=1500`, `C=8000`) and print tau across rich/default/marginal
   economies. PROVE iff tau is **wide, seed-robust, economy-monotone**; DEAD if every passing recipe clusters at `tau≈W`.

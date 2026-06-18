/*
 * Vivarium — UI
 * -------------
 * Wires the control panel to the running app, refreshes the live HUD and
 * charts, and renders the creature inspector (including a live visualization of
 * the selected creature's neural net as signals flow through it).
 *
 * `app` is the orchestrator from main.js. The functions setupUI / updateHUD /
 * updateInspector are shared globals (classic-script scope) called by the loop.
 */

function setupUI(app) {
  const $ = (id) => document.getElementById(id);

  $("btn-play").onclick = () => app.togglePlay();
  $("btn-reset").onclick = () => {
    if (confirm("Begin a brand-new world? The current one is lost unless you've saved it.")) {
      app.reset();
    }
  };
  $("btn-save").onclick = () => app.save();
  $("file-load").onchange = (e) => {
    const f = e.target.files[0];
    if (f) app.loadFile(f);
    e.target.value = "";
  };
  $("btn-deselect").onclick = () => {
    app.selected = null;
    updateInspector(app);
  };

  // Live-tuning sliders. Speed is app state; the others edit CONFIG in place,
  // which the simulation reads every tick — so you can change the rules of the
  // world while it runs and watch the ecosystem respond.
  const bind = (id, labId, fmt, set) => {
    const el = $(id);
    const lab = $(labId);
    const apply = () => {
      const v = parseFloat(el.value);
      set(v);
      lab.textContent = fmt(v);
    };
    el.oninput = apply;
    apply();
  };
  bind("sl-speed", "lab-speed", (v) => v + "×", (v) => (app.stepsPerFrame = v | 0));
  bind("sl-food", "lab-food", (v) => v.toFixed(1) + "/t", (v) => (CONFIG.food.spawnPerTick = v));
  bind("sl-mut", "lab-mut", (v) => (v * 100).toFixed(0) + "%", (v) => (CONFIG.mutation.weightRate = v));

  $("tg-trails").onchange = (e) => (app.renderer.trails = e.target.checked);
  $("tg-vision").onchange = (e) => (app.renderer.showVision = e.target.checked);
  app.renderer.trails = $("tg-trails").checked;
  app.renderer.showVision = $("tg-vision").checked;

  // Click the world to select / inspect a creature.
  app.renderer.canvas.addEventListener("click", (e) => {
    const p = app.renderer.screenToWorld(e.clientX, e.clientY);
    app.selected = app.world.pickAt(p.x, p.y);
    updateInspector(app);
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      app.togglePlay();
    } else if (e.key === "r") {
      app.stepOnce();
    }
  });

  updateInspector(app);
}

function dietLabel(diet) {
  if (diet < 0.25) return "herbivore";
  if (diet < 0.5) return "leans herbivore";
  if (diet < 0.75) return "leans carnivore";
  return "carnivore";
}

function updateHUD(app) {
  const s = app.world.stats;
  const $ = (id) => document.getElementById(id);
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = v;
  };
  set("stat-pop", s.pop != null ? s.pop : 0);
  set("stat-food", s.food != null ? s.food : 0);
  set("stat-gen", s.maxGen != null ? s.maxGen : 0);
  set("stat-lineages", s.lineages != null ? s.lineages : 0);
  set("stat-carn", ((s.carnFrac || 0) * 100).toFixed(0) + "%");
  set("stat-tick", (app.world.tick / 1000).toFixed(1) + "k");
  set("stat-fps", Math.round(app.fps));
  set("stat-speed", app.running ? app.stepsPerFrame + "×" : "paused");

  $("btn-play").textContent = app.running ? "⏸  Pause" : "▶  Play";

  // Charts are cheap but not free — refresh a few times a second.
  const now = app._clock;
  if (now - (app._lastChart || 0) > 220) {
    app._lastChart = now;
    const h = app.world.history;
    app.charts.pop.draw([
      { data: h.pop, color: "#5ad1a0" },
      { data: h.food, color: "rgba(120,200,255,0.5)" },
    ]);
    app.charts.traits.draw([
      { data: h.diet, color: "#ff7b6b", min: 0, max: 1 },
      { data: h.carn, color: "#ffd166", min: 0, max: 1 },
      { data: h.radius, color: "#9b8cff", min: CONFIG.creature.minRadius, max: CONFIG.creature.maxRadius },
    ]);
  }
}

function updateInspector(app) {
  const $ = (id) => document.getElementById(id);
  const c = app.selected;
  const empty = $("insp-empty");
  const body = $("insp-card");
  if (!c || !c.alive) {
    if (empty) empty.style.display = "";
    if (body) body.style.display = "none";
    return;
  }
  if (empty) empty.style.display = "none";
  if (body) body.style.display = "";

  $("insp-title").textContent = "Specimen #" + c.id;
  const sw = $("insp-swatch");
  sw.style.background = `hsl(${c.hue}, 68%, 52%)`;

  const rows = [
    ["generation", c.generation],
    ["age", Math.round(c.age) + " / " + Math.round(c._maxAge)],
    ["energy", Math.round(c.energy) + " / " + Math.round(c.capacity)],
    ["offspring", c.offspring],
    ["diet", c.diet.toFixed(2) + " — " + dietLabel(c.diet)],
    ["size", c.radius.toFixed(1)],
    ["vision", Math.round(c.genes.range) + "u / " + Math.round((c.genes.fov * 180) / Math.PI) + "°"],
    ["speed", c.speed.toFixed(2) + " / " + c.maxSpeed.toFixed(2)],
  ];
  $("insp-stats").innerHTML = rows
    .map((r) => `<div class="kv"><span>${r[0]}</span><b>${r[1]}</b></div>`)
    .join("");

  drawBrain($("insp-brain"), c);
}

// Colour for a neuron activation in roughly [-1, 1].
function actColor(v, a = 1) {
  v = clamp(v, -1, 1);
  if (v >= 0) return `rgba(${70 - 40 * v}, ${150 + 90 * v}, ${150 + 40 * v}, ${a})`;
  const u = -v;
  return `rgba(${150 + 90 * u}, ${110 - 40 * u}, ${90}, ${a})`;
}

function drawBrain(canvas, c) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 300;
  const H = canvas.clientHeight || 200;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const I = BRAIN.I,
    Hn = BRAIN.H,
    O = BRAIN.O;
  const inp = c._inp;
  const hid = c.brain.h;
  const out = c.brain.out;
  const w = c.genome.weights;

  const colX = [20, W * 0.52, W - 22];
  const layout = (count, x) => {
    const pts = [];
    const top = 10,
      bot = H - 10;
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? (top + bot) / 2 : top + (i / (count - 1)) * (bot - top);
      pts.push({ x, y });
    }
    return pts;
  };
  const inPts = layout(I, colX[0]);
  const hPts = layout(Hn, colX[1]);
  const oPts = layout(O, colX[2]);

  // Edges: input->hidden then hidden->output. Alpha tracks |weight| so the
  // strong, behaviour-shaping connections stand out from the wash.
  ctx.lineWidth = 1;
  for (let j = 0; j < Hn; j++) {
    const hp = hPts[j];
    const rowI = j * I;
    for (let i = 0; i < I; i++) {
      const wt = w[rowI + i];
      const a = Math.min(0.5, Math.abs(wt) * 0.35);
      if (a < 0.04) continue;
      ctx.strokeStyle =
        wt >= 0 ? `rgba(90,200,180,${a})` : `rgba(220,120,90,${a})`;
      ctx.beginPath();
      ctx.moveTo(inPts[i].x, inPts[i].y);
      ctx.lineTo(hp.x, hp.y);
      ctx.stroke();
    }
  }
  for (let o = 0; o < O; o++) {
    const op = oPts[o];
    const rowO = _HO + o * Hn;
    for (let j = 0; j < Hn; j++) {
      const wt = w[rowO + j];
      const a = Math.min(0.6, Math.abs(wt) * 0.4);
      if (a < 0.04) continue;
      ctx.strokeStyle = wt >= 0 ? `rgba(90,200,180,${a})` : `rgba(220,120,90,${a})`;
      ctx.beginPath();
      ctx.moveTo(hPts[j].x, hPts[j].y);
      ctx.lineTo(op.x, op.y);
      ctx.stroke();
    }
  }

  const dot = (p, val, r) => {
    ctx.fillStyle = actColor(val);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  };
  for (let i = 0; i < I; i++) dot(inPts[i], inp[i], 2.4);
  for (let j = 0; j < Hn; j++) dot(hPts[j], hid[j], 3.4);
  // Output activations, squashed the same way the creature uses them.
  const outVals = [Math.tanh(out[0]), sigmoid(out[1]) * 2 - 1, sigmoid(out[2]) * 2 - 1];
  for (let o = 0; o < O; o++) dot(oPts[o], outVals[o], 5);

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("senses", colX[0], H - 1);
  ctx.fillText("mind", colX[1], H - 1);
  ctx.textAlign = "right";
  const labels = ["turn", "go", "bite"];
  for (let o = 0; o < O; o++) {
    ctx.fillText(labels[o], W - 2, oPts[o].y + 3);
  }
}

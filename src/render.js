/*
 * Vivarium — renderer
 * -------------------
 * Draws the world onto a 2D canvas. This is the first file that touches the DOM
 * (the simulation core does not), so it is never loaded by the headless tests.
 *
 * Design goals: legible and alive. Each creature is a little oriented swimmer
 * whose *fill* is its heritable hue (so you can see families spread and drift),
 * whose *rim* runs green→red with diet (herbivore→carnivore), and whose
 * brightness tracks how well-fed it is. Food glows faintly. An optional trail
 * mode leaves fading ribbons of motion.
 */

const COL = {
  bgOuter: "#05080c", // letterbox / outside the world
  bgInner: "#0a1822", // world centre
  bgEdge: "#060d14", // world edge (subtle vignette)
  food: "150, 90%, 55%", // hsl components
};

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = 0;
    this.cssH = 0;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;

    // View options (toggled by the UI).
    this.trails = false;
    this.showVision = true;
    this.fadeAlpha = 0.28; // trail persistence (higher = shorter trails)

    this._resize();
  }

  _resize() {
    const c = this.canvas;
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 600;
    if (w === this.cssW && h === this.cssH) return;
    this.cssW = w;
    this.cssH = h;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
    this._fit();
  }

  _fit() {
    const W = CONFIG.world.width,
      H = CONFIG.world.height;
    this.scale = Math.min(this.cssW / W, this.cssH / H);
    this.ox = (this.cssW - W * this.scale) / 2;
    this.oy = (this.cssH - H * this.scale) / 2;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - this.ox) / this.scale;
    const y = (clientY - rect.top - this.oy) / this.scale;
    return { x, y };
  }

  render(world, selected) {
    this._resize();
    const ctx = this.ctx;
    const W = CONFIG.world.width,
      H = CONFIG.world.height;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bgOuter;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    if (this.trails) {
      ctx.fillStyle = `rgba(8, 18, 26, ${this.fadeAlpha})`;
      ctx.fillRect(0, 0, W, H);
    } else {
      this._paintBackground(ctx, W, H);
    }

    this._drawFood(ctx, world);
    this._drawCreatures(ctx, world, selected);
    if (selected && selected.alive) this._drawSelection(ctx, selected);

    ctx.restore();
  }

  _paintBackground(ctx, W, H) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.62);
    g.addColorStop(0, COL.bgInner);
    g.addColorStop(1, COL.bgEdge);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  _drawFood(ctx, world) {
    const list = world.food.list;
    // Soft outer halo (one pass, low alpha) then bright cores (one pass).
    ctx.fillStyle = `hsla(${COL.food}, 0.16)`;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3.6, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `hsla(${COL.food}, 0.95)`;
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      ctx.beginPath();
      ctx.arc(f.x, f.y, 1.5, 0, TAU);
      ctx.fill();
    }
  }

  _drawCreatures(ctx, world, selected) {
    const cs = world.creatures;
    for (let i = 0; i < cs.length; i++) {
      this._drawCreature(ctx, cs[i], cs[i] === selected);
    }
  }

  _drawCreature(ctx, c, isSelected) {
    const r = c.radius;
    const energyFrac = clamp(c.energy / c.capacity, 0, 1);
    const light = 34 + 30 * energyFrac;
    const fill = `hsl(${c.hue}, 68%, ${light}%)`;
    // Diet rim: green (herbivore) -> red (carnivore). Hue 120 -> 0.
    const rimHue = 120 * (1 - c.diet);
    const rim = `hsl(${rimHue}, 85%, 58%)`;

    ctx.save();
    ctx.translate(c.x, c.y);

    // Faint bio-luminescent aura.
    ctx.globalAlpha = 0.12 + 0.12 * energyFrac;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.rotate(c.heading);

    // Snout: a little forward wedge so orientation (and "mouth") reads clearly.
    const biting = c.lastBite > 0.5;
    ctx.fillStyle = biting ? "hsl(0, 90%, 60%)" : rim;
    ctx.beginPath();
    ctx.moveTo(r * 0.3, -r * 0.62);
    ctx.lineTo(r * 1.7, 0);
    ctx.lineTo(r * 0.3, r * 0.62);
    ctx.closePath();
    ctx.fill();

    // Body.
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // Diet rim.
    ctx.lineWidth = Math.max(0.6, r * 0.16);
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();

    // Eyes for larger creatures — pure charm, cheap.
    if (r > 4.2) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const ex = r * 0.45,
        ey = r * 0.4;
      ctx.beginPath();
      ctx.arc(ex, -ey, r * 0.16, 0, TAU);
      ctx.arc(ex, ey, r * 0.16, 0, TAU);
      ctx.fill();
    }

    // Hurt flash.
    if (c.lastHurt > 0) {
      ctx.globalAlpha = (c.lastHurt / 6) * 0.7;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (isSelected) {
      ctx.lineWidth = 2 / this.scale;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4, 0, TAU);
      ctx.stroke();
    }
  }

  _drawSelection(ctx, c) {
    if (!this.showVision) return;
    const range = c.genes.range;
    const half = c.genes.fov / 2;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.heading);

    // Vision range + field-of-view wedge.
    ctx.fillStyle = "rgba(120, 200, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, range, -half, half);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(150, 210, 255, 0.35)";
    ctx.lineWidth = 1 / this.scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(-half) * range, Math.sin(-half) * range);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(half) * range, Math.sin(half) * range);
    ctx.stroke();

    ctx.restore();
  }
}

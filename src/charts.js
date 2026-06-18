/*
 * Vivarium — charts
 * -----------------
 * Minimal multi-series line charts for the history panel. Each series carries
 * its own colour and value range (so a 0..1 ratio and a 0..N count can share
 * an axis sensibly). Counts autoscale from a zero baseline; ratios are fixed.
 *
 * DOM-dependent — not loaded by the headless tests.
 */

class Chart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = 0;
    this.h = 0;
  }

  _resize() {
    const c = this.canvas;
    const w = c.clientWidth || 280;
    const h = c.clientHeight || 90;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    c.width = Math.round(w * this.dpr);
    c.height = Math.round(h * this.dpr);
  }

  // series: [{ data:number[], color:string, min?:number, max?:number }]
  draw(series) {
    this._resize();
    const ctx = this.ctx;
    const W = this.w,
      H = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.fillStyle = "rgba(255,255,255,0.025)";
    ctx.fillRect(0, 0, W, H);

    // Baseline + mid gridline.
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.moveTo(0, H / 2 - 0.5);
    ctx.lineTo(W, H / 2 - 0.5);
    ctx.stroke();

    const pad = 3;
    for (const s of series) {
      const data = s.data;
      const n = data.length;
      if (n < 2) continue;
      let lo = s.min,
        hi = s.max;
      if (lo == null || hi == null) {
        lo = 0;
        hi = 1e-6;
        for (let i = 0; i < n; i++) if (data[i] > hi) hi = data[i];
        hi *= 1.1;
      }
      const span = hi - lo || 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * W;
        const yv = clamp((data[i] - lo) / span, 0, 1);
        const y = pad + (1 - yv) * (H - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

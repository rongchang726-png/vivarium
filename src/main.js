/*
 * Vivarium — application entry point
 * ----------------------------------
 * Owns the loop that drives simulation + rendering, and the app-level actions
 * the UI triggers (play/pause, reset, save/load, selection). Loaded last, so
 * every class it touches is already defined in the shared script scope.
 */

const App = {
  world: null,
  renderer: null,
  charts: {},
  running: true,
  stepsPerFrame: 1,
  selected: null,

  fps: 0,
  _clock: 0,
  _frames: 0,
  _fpsClock: 0,
  _loopBound: null,

  init() {
    this.renderer = new Renderer(document.getElementById("view"));
    this.charts.pop = new Chart(document.getElementById("chart-pop"));
    this.charts.traits = new Chart(document.getElementById("chart-traits"));
    this.world = new World({});
    setupUI(this);
    this._loopBound = (ts) => this._loop(ts);
    requestAnimationFrame(this._loopBound);
  },

  togglePlay() {
    this.running = !this.running;
  },

  stepOnce() {
    this.running = false;
    this.world.step();
    this.world.computeStats();
    updateHUD(this);
    if (this.selected) updateInspector(this);
  },

  reset() {
    this.selected = null;
    this.world = new World({});
    updateInspector(this);
    updateHUD(this);
  },

  save() {
    const data = JSON.stringify(this.world.serialize());
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vivarium-tick" + this.world.tick + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  loadFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        this.world = World.fromJSON(data);
        this.selected = null;
        updateInspector(this);
        updateHUD(this);
      } catch (err) {
        alert("Could not load that world file:\n" + err.message);
      }
    };
    reader.readAsText(file);
  },

  _loop(ts) {
    this._clock = ts;
    this._frames++;
    if (ts - this._fpsClock > 500) {
      this.fps = (this._frames * 1000) / (ts - this._fpsClock);
      this._frames = 0;
      this._fpsClock = ts;
    }

    if (this.running) {
      const n = this.stepsPerFrame;
      for (let i = 0; i < n; i++) this.world.step();
      this.world.computeStats();
      if (this.selected) updateInspector(this);
    }

    this.renderer.render(this.world, this.selected);
    updateHUD(this);

    requestAnimationFrame(this._loopBound);
  },
};

window.addEventListener("DOMContentLoaded", () => App.init());

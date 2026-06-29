/*
 * Vivarium — headless DOM smoke test.
 *
 * The simulation core is covered by sim.test.js, but the browser-facing files
 * (render, charts, ui, main) never run there. This test mocks just enough of
 * the DOM — canvas 2D context, elements, window — to actually execute those
 * code paths: init, several animation frames, selecting a creature, drawing its
 * brain, saving, toggling controls, and resetting. It asserts nothing visual;
 * it just proves none of that throws.
 *
 *   node test/dom-smoke.js
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = [
  "config", "util", "biome", "genome", "brain", "food", "storyteller", "creature", "world",
  "render", "charts", "ui", "main",
].map((f) => path.join(root, "src", f + ".js"));

// --- a minimal, permissive DOM ---------------------------------------------
const ctx = new Proxy(
  {},
  {
    get(t, p) {
      if (p in t) return t[p];
      return (...a) => {
        if (p === "createRadialGradient" || p === "createLinearGradient") {
          return { addColorStop() {} };
        }
        if (p === "measureText") return { width: 0 };
        return undefined;
      };
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  },
);

const SIZES = {
  view: [1000, 700],
  "chart-pop": [320, 78],
  "chart-traits": [320, 78],
  "insp-brain": [320, 188],
};
const VALUES = { "sl-speed": "1", "sl-food": "10", "sl-mut": "0.11" };

const elCache = {};
function makeEl(id) {
  if (elCache[id]) return elCache[id];
  const [cw, ch] = SIZES[id] || [360, 200];
  const el = {
    id,
    style: {},
    clientWidth: cw,
    clientHeight: ch,
    width: 0,
    height: 0,
    value: VALUES[id] || "",
    checked: id === "tg-vision",
    textContent: "",
    innerHTML: "",
    files: [],
    onclick: null,
    oninput: null,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    click() {},
    getContext() {
      return ctx;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
    },
  };
  elCache[id] = el;
  return el;
}

const sandbox = {
  console,
  Math,
  window: {
    devicePixelRatio: 1,
    addEventListener() {},
    requestAnimationFrame() {
      return 0;
    },
  },
  document: {
    getElementById: (id) => makeEl(id),
    createElement: (tag) => makeEl("_el_" + tag),
    body: { appendChild() {}, removeChild() {} },
    addEventListener() {},
  },
  requestAnimationFrame() {
    return 0;
  },
  confirm: () => true,
  alert: () => {},
  Blob: function () {},
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
};

const driver = `
  App.init();
  App.stepsPerFrame = 20;
  App._loop(16);
  App._loop(40);
  App._loop(1300);            // large dt -> triggers a chart redraw with data
  App.selected = App.world.creatures[0] || null;
  updateInspector(App);       // draws the brain
  App._loop(2600);
  App.stepOnce();
  App.togglePlay(); App.togglePlay();
  App.save();                 // exercises the blob/anchor download path
  var sl = document.getElementById('sl-speed'); sl.value = '8'; if (sl.oninput) sl.oninput();
  var tg = document.getElementById('tg-trails'); tg.checked = true; if (tg.onchange) tg.onchange({ target: tg });
  App.reset();
  App._loop(4000);
  if (!(App.world.stats.pop >= 0)) throw new Error('no stats after run');
  console.log('DOM smoke OK — pop=' + App.world.stats.pop + ', selected brain rendered, save/reset/sliders fine');
`;

let src = "";
for (const f of files) src += fs.readFileSync(f, "utf8") + "\n";
src += driver;

vm.createContext(sandbox);
try {
  vm.runInContext(src, sandbox, { filename: "vivarium-dom-bundle.js" });
} catch (e) {
  console.error("DOM SMOKE FAILED:", (e && e.stack) || e);
  process.exit(1);
}
console.log("\nALL DOM CHECKS PASSED");

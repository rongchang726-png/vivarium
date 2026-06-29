/*
 * Vivarium — storyteller (designed disturbance)
 * ---------------------------------------------
 * Richness phase, BUILD 2 (docs/REDESIGN.md). The calibration verdict from BUILD 1 was that this
 * engine will NOT evolve diversity on its own (a well-mixed world homogenises — the third time the
 * project met that wall). So richness has to be DESIGNED, not waited for: a Storyteller watches the
 * world and, when it settles into a monoculture, perturbs it — turning the flat "nothing happened"
 * equilibrium into a sequence of disturbances the chronicle can narrate, and (crucially) making
 * different seeds end differently (the real test: end-state VARIANCE, not one dramatic run).
 *
 * The hook is ENDOGENOUS, not a scripted timetable: ecological DOMINANCE (the largest lineage's
 * share — RNG-free) accrues TENSION, so a world that has collapsed to one type raises its OWN
 * famine hazard; a diverse world relaxes. When tension crosses threshold (after a warmup, past a
 * cooldown) it fires a LOCAL + TRANSIENT famine: most food in a patch is destroyed (FoodField.crash)
 * and a regrowth-suppressing SCAR lingers (FoodField scars), so the struck patch stays lean for a
 * while and whoever monopolised it is knocked back. The famine's TIMING carries the signal; its
 * LOCATION is stochastic, so across seeds different patches burn => divergent histories.
 *
 * BIT-EXACT & DOM-free. Default OFF (CONFIG.storyteller.enabled false) => world.storyteller is null,
 * update() never runs, FoodField.scars stays empty => the per-tick path is unperturbed and draws no
 * new RNG (determinism hash 4244329615). When ON it draws ONLY world.rng (so it's deterministic and
 * replayable) and its decision state (tension, lastEventTick) + the scar list are serialized, so
 * save->load is exact. Top-level is the class declaration only (no load-order TDZ).
 */

class Storyteller {
  constructor(world) {
    this.world = world;
    this.tension = 0;          // accrues each interval (base cadence + dominance); resets when a famine fires
    this.lastEventTick = -1e9; // so the first famine isn't gated by an artificial cooldown
  }

  // Largest hue-bucket share of the live population — an RNG-FREE proxy for "how monocultural the
  // world is" (the same 18-bucket hue binning the HUD calls "lineages"). 1 => one lineage owns it.
  _dominance(world) {
    const cs = world.creatures;
    const n = cs.length;
    if (n === 0) return 0;
    const buckets = new Int32Array(18);
    for (let i = 0; i < n; i++) {
      let b = (cs[i].hue / 20) | 0;
      if (b < 0) b = 0; else if (b > 17) b = 17;
      buckets[b]++;
    }
    let mx = 0;
    for (let i = 0; i < 18; i++) if (buckets[i] > mx) mx = buckets[i];
    return mx / n;
  }

  // Called once per stat-interval from world.step (when stats are fresh). RNG-free until a famine
  // actually fires.
  update(world) {
    const C = CONFIG.storyteller;
    const dom = this._dominance(world);
    // Base cadence + endogenous acceleration. This world is a PERPETUAL monoculture (BUILD 1's
    // verdict: it always settles to one small-grazer kind), so it perpetually "deserves" a
    // disturbance — tension always accrues, faster when one lineage dominates more. (A pure
    // dominance-threshold trigger never fired: hue diffuses to a steady ~0.3 spread, never crossing
    // a high bar — measured. So the base rate guarantees the regime; dominance just modulates pace.)
    this.tension += C.tensionRate * (1 + C.dominanceWeight * dom);
    if (
      world.tick >= C.warmup &&
      world.tick - this.lastEventTick >= C.cooldown &&
      this.tension >= C.famineThreshold
    ) {
      this._fireFamine(world, dom);
      this.tension = 0;
      this.lastEventTick = world.tick;
    }
  }

  _fireFamine(world, dom) {
    const C = CONFIG.storyteller;
    // Stochastic location (world.rng): the famine's timing is the endogenous signal, its place is
    // luck => different seeds burn different patches => divergent endings.
    const cx = world.rng.range(0, world.width);
    const cy = world.rng.range(0, world.height);
    const removed = world.food.crash(cx, cy, C.famineRadius, C.famineFrac);
    world.food.addScar(cx, cy, C.famineRadius, world.tick + C.scarTicks, C.scarSuppression);
    // The chronicle's disturbance chapter: where/when, how much burned, and the dominance that
    // earned it (the TRUE second-person causal line — "the world had narrowed to one kind, and...").
    if (world.eventLog) {
      world.eventLog.push({
        k: "famine", t: world.tick, x: cx, y: cy, r: C.famineRadius,
        removed: removed, dom: Math.round(dom * 100) / 100,
      });
    }
  }

  // --- persistence (only used when the feature is on; default save stays bit-exact) ----------
  toJSON() {
    return { tension: this.tension, lastEventTick: this.lastEventTick };
  }
  load(o) {
    if (!o) return;
    this.tension = o.tension || 0;
    this.lastEventTick = o.lastEventTick != null ? o.lastEventTick : -1e9;
  }
}

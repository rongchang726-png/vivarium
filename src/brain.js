/*
 * Vivarium — brain
 * ----------------
 * A small Elman-style recurrent neural network. The recurrence (hidden state
 * fed back each tick) gives creatures short-term memory: they can, in
 * principle, evolve behaviours like "keep turning the way I just turned" or
 * "flee for a while after being hit", which a purely reactive net cannot do.
 *
 * The brain only *reads* the genome's weight array, so many creatures could in
 * principle share weights; here each creature owns its genome, but the brain
 * never mutates `w`. Only the hidden state is per-brain.
 *
 *   hidden_t = tanh( W_ih · input + W_hh · hidden_{t-1} + b_h )
 *   output   =        W_ho · hidden_t + b_o      (activations applied by caller)
 */

const _BH = BRAIN.H * BRAIN.I; // offset: start of hidden->hidden block
const _HO = _BH + BRAIN.H * BRAIN.H; // offset: start of hidden->output block
const _BIAS_H = _HO + BRAIN.O * BRAIN.H; // offset: hidden biases
const _BIAS_O = _BIAS_H + BRAIN.H; // offset: output biases

class Brain {
  constructor(weights) {
    this.w = weights;
    this.h = new Float32Array(BRAIN.H); // recurrent hidden state
    this._tmp = new Float32Array(BRAIN.H);
    this.out = new Float32Array(BRAIN.O);
  }

  reset() {
    this.h.fill(0);
  }

  // Run one forward pass. `inp` is a Float32Array of length BRAIN.I. Returns the
  // raw (linear) output vector; the caller squashes each output as appropriate.
  forward(inp) {
    const I = BRAIN.I,
      H = BRAIN.H,
      O = BRAIN.O;
    const w = this.w,
      prev = this.h,
      tmp = this._tmp;

    for (let j = 0; j < H; j++) {
      let s = w[_BIAS_H + j];
      const rowI = j * I;
      for (let i = 0; i < I; i++) s += w[rowI + i] * inp[i];
      const rowH = _BH + j * H;
      for (let k = 0; k < H; k++) s += w[rowH + k] * prev[k];
      tmp[j] = Math.tanh(s);
    }
    for (let j = 0; j < H; j++) prev[j] = tmp[j];

    const out = this.out;
    for (let o = 0; o < O; o++) {
      let s = w[_BIAS_O + o];
      const rowO = _HO + o * H;
      for (let j = 0; j < H; j++) s += w[rowO + j] * prev[j];
      out[o] = s;
    }
    return out;
  }
}

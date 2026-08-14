// js/rng.js — seeded PRNG, stream forking, deterministic 1D value noise.
// An ambient unseeded random source is never used anywhere in this project; every random value in a
// drawing traces back to a single seed string.
(function () {
  'use strict';
  const NS = {};

  // --- string -> 32-bit seed ------------------------------------------------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // --- the one and only PRNG core ------------------------------------------
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeSeed(seed) {
    if (seed === null || seed === undefined || seed === '') return 'antitecture';
    if (typeof seed === 'number' && isFinite(seed)) return String(Math.floor(seed));
    return String(seed);
  }

  /**
   * makeRng(seed) -> Rng
   * Accepts an integer or an arbitrary string. Strings are hashed with xmur3.
   */
  function makeRng(seed) {
    const label = normalizeSeed(seed);
    const core = mulberry32(xmur3(label)());
    let spare = null;

    const rng = {
      seed: label,

      next: function () {
        return core();
      },

      range: function (a, b) {
        return a + (b - a) * core();
      },

      int: function (a, b) {
        return a + Math.floor(core() * (b - a + 1));
      },

      chance: function (p) {
        return core() < p;
      },

      pick: function (arr) {
        if (!arr || arr.length === 0) return undefined;
        return arr[Math.floor(core() * arr.length)];
      },

      // weighted([[item, w], [item, w], ...])
      weighted: function (pairs) {
        let total = 0;
        for (let i = 0; i < pairs.length; i++) total += Math.max(0, pairs[i][1]);
        if (total <= 0) return pairs.length ? pairs[0][0] : undefined;
        let t = core() * total;
        for (let i = 0; i < pairs.length; i++) {
          t -= Math.max(0, pairs[i][1]);
          if (t <= 0) return pairs[i][0];
        }
        return pairs[pairs.length - 1][0];
      },

      // weighted choice over an object of {key: weight}
      weightedKey: function (table) {
        const pairs = [];
        for (const k in table) {
          if (Object.prototype.hasOwnProperty.call(table, k)) pairs.push([k, table[k]]);
        }
        return rng.weighted(pairs);
      },

      gauss: function (mu, sigma) {
        mu = mu || 0;
        sigma = sigma === undefined ? 1 : sigma;
        if (spare !== null) {
          const v = spare;
          spare = null;
          return mu + sigma * v;
        }
        let u = 0, v = 0, s = 0;
        do {
          u = core() * 2 - 1;
          v = core() * 2 - 1;
          s = u * u + v * v;
        } while (s === 0 || s >= 1);
        const f = Math.sqrt((-2 * Math.log(s)) / s);
        spare = v * f;
        return mu + sigma * (u * f);
      },

      shuffle: function (arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(core() * (i + 1));
          const t = arr[i];
          arr[i] = arr[j];
          arr[j] = t;
        }
        return arr;
      },

      // Independent stream derived from this stream's seed label (NOT its state),
      // so forks are stable no matter how many draws happened before the fork.
      fork: function (tag) {
        return makeRng(label + ':' + tag);
      }
    };

    return rng;
  }

  // --- deterministic smooth 1D value noise ----------------------------------
  // noise(t) -> [-1, 1], cosine-interpolated over a 256-value lattice.
  function makeNoise1D(rng) {
    const N = 256;
    const table = new Float64Array(N);
    for (let i = 0; i < N; i++) table[i] = rng.next() * 2 - 1;
    // Soften adjacent lattice jumps before interpolation. This keeps the nib's
    // wobble organic without letting a quarter-step teleport across the stroke.
    const softened = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      softened[i] = table[(i + N - 1) % N] * 0.2 + table[i] * 0.6 + table[(i + 1) % N] * 0.2;
    }
    for (let i = 0; i < N; i++) table[i] = softened[i];
    return function (t) {
      if (!isFinite(t)) return 0;
      const f = t - Math.floor(t / N) * N; // positive modulo
      const i0 = Math.floor(f) % N;
      const i1 = (i0 + 1) % N;
      const fr = f - Math.floor(f);
      const m = (1 - Math.cos(fr * Math.PI)) * 0.5;
      return table[i0] * (1 - m) + table[i1] * m;
    };
  }

  // Canonical display seed: 6-char base-36 token.
  function randomSeedFrom(sourceRng) {
    const n = Math.floor(sourceRng.next() * 0xffffffff) >>> 0;
    let s = n.toString(36);
    while (s.length < 6) s = '0' + s;
    return s.slice(0, 6);
  }

  // Entropy for the "give me something new" button. Uses time + a counter, never
  // an ambient random source — the produced seed is then the sole source of truth.
  let counter = 0;
  function freshSeed() {
    counter = (counter + 1) | 0;
    const t = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : 0;
    const stamp = 'fresh:' + Date.now() + ':' + t + ':' + counter;
    return randomSeedFrom(makeRng(stamp));
  }

  NS.xmur3 = xmur3;
  NS.mulberry32 = mulberry32;
  NS.makeRng = makeRng;
  NS.makeNoise1D = makeNoise1D;
  NS.freshSeed = freshSeed;
  NS.randomSeedFrom = randomSeedFrom;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.rng = NS;
})();

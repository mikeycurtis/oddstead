// js/style.js — the single home for palette, pen character, and mood weight
// tables. Element functions must never contain magic aesthetic numbers; they
// read them from here (or from parameters handed down by building.js).
(function () {
  'use strict';
  const NS = {};

  // --- paper & ink ----------------------------------------------------------
  NS.paper = {
    base: '#f2ecdd',
    grainInk: '#8a7a5f',
    fiber: '#9c8d70',
    vignette: 'rgba(60,50,35,0.085)'
  };

  // Never pure black: warm-dark navy at 0.9 alpha reads as real ink on paper.
  NS.ink = {
    main: 'rgba(35,38,48,0.90)',
    soft: 'rgba(35,38,48,0.55)',
    faint: 'rgba(35,38,48,0.30)',
    solid: '#232630'
  };

  // Restrained accents. Applied as flat fills UNDER line work, always slightly
  // misregistered — like a hand-pulled two-colour print.
  NS.accents = {
    terracotta: '#c1633f',
    sage: '#7d8f6a',
    slate: '#6f88a3',
    mustard: '#c9a34a'
  };

  // --- pen presets ----------------------------------------------------------
  // One pen personality per drawing; tiers only scale it.
  NS.pens = {
    dryNib: {
      ink: NS.ink.main,
      baseWidth: 2.15,
      wobbleAmp: 1.05,
      wobbleFreq: 0.035,
      taper: 0.19,      // fraction of the stroke used by the pressure ramp
      dryness: 0.13,
      overshoot: 0.32,  // probability a segment end crosses past the corner
      filament: 0.2,
      tiers: { outline: 1.0, detail: 0.56, hatch: 0.38, hair: 0.28 }
    },
    fineNib: {
      ink: NS.ink.main,
      baseWidth: 1.7,
      wobbleAmp: 0.8,
      wobbleFreq: 0.045,
      taper: 0.22,
      dryness: 0.09,
      overshoot: 0.4,
      filament: 0.14,
      tiers: { outline: 1.0, detail: 0.58, hatch: 0.4, hair: 0.3 }
    },
    fatNib: {
      ink: NS.ink.main,
      baseWidth: 2.7,
      wobbleAmp: 1.35,
      wobbleFreq: 0.028,
      taper: 0.16,
      dryness: 0.18,
      overshoot: 0.26,
      filament: 0.26,
      tiers: { outline: 1.0, detail: 0.52, hatch: 0.34, hair: 0.26 }
    }
  };

  NS.penNames = ['dryNib', 'dryNib', 'dryNib', 'fineNib', 'fatNib'];

  // --- moods ----------------------------------------------------------------
  // Pure data. Adding a style family means adding a table here, not a code path.
  NS.moods = {
    town: {
      label: 'Town',
      massing: { slab: 3, longhouse: 3, lshape: 3, cluster: 2, tower: 0.6 },
      roofs: { gabled: 4, hipped: 3, shed: 1.2, flat: 1, barrel: 0.4 },
      facades: { grid: 4, balconyGrid: 2, arcade: 1.2, solid: 1 },
      windows: { plain: 2, sash: 3.5, shuttered: 3, arched: 1.4, round: 0.5, ribbon: 0.3 },
      doors: { plain: 3, arched: 2, dbl: 2, storefront: 1.2 },
      gear: { chimney: 5, flue: 1.5, antenna: 1.2, tank: 0.4 },
      trees: { round: 4, cypress: 1, bush: 2 },
      accentBias: { terracotta: 3, sage: 2, slate: 1, mustard: 1.5 },
      floorHeight: 3.1,
      heightScale: 1.0
    },
    tower: {
      label: 'Tower',
      massing: { tower: 5, cluster: 2.5, slab: 1.2, lshape: 1, longhouse: 0.2 },
      roofs: { flat: 6, shed: 1, hipped: 0.4, gabled: 0.4, barrel: 0.4 },
      facades: { grid: 4, ribbonGrid: 3, balconyGrid: 3, solid: 1.4, arcade: 0.6 },
      windows: { ribbon: 3.5, plain: 3, sash: 1.5, round: 0.6, arched: 0.4, shuttered: 0.5 },
      doors: { storefront: 3, dbl: 2, plain: 1.5, arched: 0.6 },
      gear: { tank: 3.5, antenna: 3.5, flue: 2, chimney: 0.8 },
      trees: { round: 2, cypress: 1.5, bush: 2 },
      accentBias: { slate: 4, mustard: 1.5, sage: 1.5, terracotta: 1 },
      floorHeight: 3.0,
      heightScale: 1.55
    },
    industrial: {
      label: 'Industrial',
      massing: { longhouse: 4, slab: 3, cluster: 2.5, tower: 1, lshape: 1.5 },
      roofs: { shed: 3.5, barrel: 3, flat: 2.5, gabled: 2, hipped: 0.4 },
      facades: { grid: 3, solid: 3, arcade: 1.5, balconyGrid: 0.6 },
      windows: { arched: 3, ribbon: 3, plain: 2.5, sash: 1.5, round: 1, shuttered: 0.2 },
      doors: { storefront: 2.5, dbl: 3, plain: 2, arched: 1.5 },
      gear: { flue: 4, chimney: 3, tank: 2.5, antenna: 2 },
      trees: { bush: 3, round: 1.5, cypress: 0.6 },
      accentBias: { terracotta: 2, slate: 2, mustard: 2.5, sage: 1 },
      floorHeight: 3.6,
      heightScale: 0.95
    },
    mediterranean: {
      label: 'Mediterranean',
      massing: { cluster: 4, lshape: 3, longhouse: 2.5, slab: 2, tower: 0.8 },
      roofs: { hipped: 3.5, gabled: 3, flat: 2.5, shed: 1, barrel: 1.2 },
      facades: { grid: 3.5, arcade: 3, balconyGrid: 2.5, solid: 1 },
      windows: { shuttered: 4, arched: 3, plain: 2, sash: 1.2, round: 0.8, ribbon: 0.2 },
      doors: { arched: 3.5, plain: 2, dbl: 2, storefront: 1 },
      gear: { chimney: 3.5, flue: 2, antenna: 1.5, tank: 1.2 },
      trees: { cypress: 4, round: 2, bush: 2.5 },
      accentBias: { terracotta: 6, sage: 2.5, slate: 1, mustard: 1.2 },
      floorHeight: 3.0,
      heightScale: 0.9
    }
  };

  NS.moodNames = ['town', 'tower', 'industrial', 'mediterranean'];

  // --- global drawing constants --------------------------------------------
  NS.light = { x: -0.58, y: 0.66, z: 0.48 }; // world-space "sun" for shadow sides

  NS.accentAlpha = { min: 0.26, max: 0.4 };
  NS.accentOffset = { min: 1.5, max: 3.2 };  // misregistration in px — mandatory

  NS.caption = {
    font: '13px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    small: '10px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    header: '15px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    color: 'rgba(35,38,48,0.72)'
  };

  NS.pickAccents = function (rng, mood) {
    const bias = (NS.moods[mood] || NS.moods.town).accentBias;
    const roll = rng.next();
    const count = roll < 0.30 ? 0 : (roll < 0.85 ? 1 : 2);
    const chosen = [];
    const pool = [];
    for (const k in bias) {
      if (Object.prototype.hasOwnProperty.call(bias, k)) pool.push([k, bias[k]]);
    }
    for (let i = 0; i < count; i++) {
      const name = rng.weighted(pool.filter(function (p) {
        return chosen.indexOf(p[0]) < 0;
      }));
      if (name) chosen.push(name);
    }
    return chosen;
  };

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.style = NS;
})();

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
    mustard: '#c9a34a',
    olive: '#6e7c4e',   // deeper green for planted courtyards and olive groves
    ochre: '#b3873f'    // warm earth for render, tile and screenwork
  };

  // --- planting palette -----------------------------------------------------
  // Greenery is the one place the sheet carries real colour. It stays a flat,
  // translucent wash laid UNDER the ink: the linework still draws the plant,
  // the colour only says what kind of plant it is. Alphas live in floraAlpha
  // and are deliberately low — a canopy must never become an opaque blob over
  // the building behind it.
  NS.greens = {
    cedar: '#3f5945',       // near-black conifer green
    pineDeep: '#4a6146',
    box: '#51694a',         // clipped hedging
    moss: '#6c7f50',
    gardenGreen: '#5f7d4f',
    hedge: '#617f55',
    bamboo: '#6d9152',
    springGreen: '#7d9a55',
    willow: '#89a25e',
    oliveGrey: '#8b9679',   // the silvered underside of an olive
    oliveDeep: '#6a7350',
    mapleRed: '#b05a41',    // autumn foliage, used sparingly
    autumn: '#c08b45'
  };

  NS.blooms = {
    blossomPink: '#dba0aa',
    blossomWhite: '#e7ddca',
    wisteria: '#9b90b6',
    lavender: '#8e8ab2',
    geranium: '#c2563f',
    mustardBloom: '#cfa74d',
    plum: '#a94a5c',
    jasmine: '#e0d5ad'
  };

  NS.barks = {
    warm: '#7a6349',
    grey: '#77736a',
    dark: '#5d4f3f',
    pale: '#8d7f68'
  };

  // Ceilings, not settings: every fill below is drawn under line work.
  NS.floraAlpha = {
    canopy: 0.26,   // tree crowns and shrub masses
    frond: 0.2,     // open forms — palms, bamboo leaves, grasses
    tuft: 0.17,     // ground planting
    bloom: 0.4,     // small dabs only, never a large area
    trunk: 0.24
  };

  /** Darken (k < 1) or lighten (k > 1) a #rrggbb string. */
  function shade(hex, k) {
    if (typeof hex !== 'string' || hex.charAt(0) !== '#' || hex.length !== 7) return hex;
    const out = ['#'];
    for (let i = 0; i < 3; i++) {
      const v = parseInt(hex.substr(1 + i * 2, 2), 16);
      const n = Math.max(0, Math.min(255, Math.round(v * k)));
      out.push((n < 16 ? '0' : '') + n.toString(16));
    }
    return out.join('');
  }
  NS.shade = shade;

  // What each planted form tends to be, before its family tints it.
  const SPECIES_FLORA = {
    round: { leaf: ['gardenGreen', 'hedge', 'springGreen'], bloomP: 0.12 },
    bush: { leaf: ['box', 'hedge', 'gardenGreen'], bloomP: 0.4 },
    cypress: { leaf: ['cedar', 'pineDeep', 'oliveDeep'], bloomP: 0 },
    pine: { leaf: ['pineDeep', 'cedar', 'moss'], bloomP: 0 },
    olive: { leaf: ['oliveGrey', 'oliveDeep'], bloomP: 0.08, bark: 'grey' },
    palm: { leaf: ['bamboo', 'springGreen', 'gardenGreen'], bloomP: 0, bark: 'pale' },
    bamboo: { leaf: ['bamboo', 'springGreen', 'willow'], bloomP: 0 },
    flowering: { leaf: ['springGreen', 'gardenGreen', 'moss'], bloomP: 1 },
    willow: { leaf: ['willow', 'springGreen', 'moss'], bloomP: 0.1, bark: 'grey' },
    maple: { leaf: ['mapleRed', 'autumn', 'gardenGreen'], bloomP: 0, bark: 'dark' },
    windowBox: { leaf: ['hedge', 'gardenGreen', 'springGreen'], bloomP: 0.75 },
    vine: { leaf: ['gardenGreen', 'moss', 'hedge'], bloomP: 0.3 },
    grass: { leaf: ['springGreen', 'gardenGreen', 'moss'], bloomP: 0.3 }
  };

  // Each family's own garden: the greens it leans on, the flowers it shows.
  const MOOD_FLORA = {
    town: { leaf: ['gardenGreen', 'hedge', 'moss'], bloom: ['geranium', 'blossomWhite', 'mustardBloom'], bark: 'warm' },
    tower: { leaf: ['box', 'hedge', 'gardenGreen'], bloom: ['blossomWhite', 'mustardBloom'], bark: 'grey' },
    industrial: { leaf: ['moss', 'box', 'oliveDeep'], bloom: ['mustardBloom', 'blossomWhite'], bark: 'grey' },
    mediterranean: { leaf: ['oliveGrey', 'oliveDeep', 'cedar'], bloom: ['geranium', 'jasmine', 'lavender'], bark: 'grey' },
    japanese: { leaf: ['moss', 'pineDeep', 'bamboo'], bloom: ['blossomPink', 'blossomWhite', 'wisteria'], bark: 'dark' },
    chinese: { leaf: ['bamboo', 'willow', 'gardenGreen'], bloom: ['blossomPink', 'plum', 'jasmine'], bark: 'warm' },
    european: { leaf: ['gardenGreen', 'hedge', 'springGreen'], bloom: ['geranium', 'lavender', 'blossomWhite'], bark: 'warm' },
    greek: { leaf: ['oliveGrey', 'oliveDeep', 'cedar'], bloom: ['jasmine', 'lavender', 'blossomWhite'], bark: 'grey' },
    moorish: { leaf: ['oliveDeep', 'bamboo', 'moss'], bloom: ['jasmine', 'geranium', 'blossomWhite'], bark: 'pale' },
    nordic: { leaf: ['pineDeep', 'cedar', 'moss'], bloom: ['blossomWhite', 'lavender'], bark: 'dark' },
    deco: { leaf: ['box', 'hedge', 'oliveDeep'], bloom: ['mustardBloom', 'plum'], bark: 'grey' },
    southasian: { leaf: ['bamboo', 'springGreen', 'gardenGreen'], bloom: ['geranium', 'mustardBloom', 'jasmine'], bark: 'warm' }
  };

  /**
   * plantColor(rng, mood, species) -> {leaf, deep, bloom, bark, hasBloom}
   * Species-aware first, family-tinted second: a cypress is dark whoever plants
   * it, but the flowers around it belong to the family. Pure function of the
   * rng handed in, so a plan's planting colours are fixed at generate time.
   */
  NS.plantColor = function (rng, mood, species) {
    const sp = SPECIES_FLORA[species] || SPECIES_FLORA.round;
    const fam = MOOD_FLORA[mood] || MOOD_FLORA.town;
    const fromSpecies = rng.chance(0.65);
    const pool = fromSpecies ? sp.leaf : (fam.leaf || sp.leaf);
    const leafKey = rng.pick(pool) || sp.leaf[0];
    const leaf = NS.greens[leafKey] || NS.greens.gardenGreen;
    const bloomKey = rng.pick(fam.bloom || ['blossomWhite']);
    const hasBloom = rng.chance(sp.bloomP == null ? 0.15 : sp.bloomP);
    return {
      leaf: leaf,
      deep: shade(leaf, 0.78),
      pale: shade(leaf, 1.14),
      bloom: hasBloom ? (NS.blooms[bloomKey] || NS.blooms.blossomWhite) : null,
      bark: NS.barks[sp.bark || fam.bark || 'warm'],
      hasBloom: hasBloom
    };
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
  //
  // Each family is a broad architectural temperament — a set of tendencies in
  // massing, roof pitch, opening rhythm, shading device and planting — not a
  // claim to reproduce any particular building. Every key below must name a
  // variant that actually exists in the el-* registries.
  //
  // `ornaments` weights the optional extra layers a façade may wear.
  // `detail`   holds the per-family knobs building.js reads when it decides how
  //            deep an eave runs, whether a band gets screened, and how much
  //            greenery the site carries.
  NS.moods = {
    town: {
      label: 'Town',
      massing: { slab: 3, longhouse: 3, lshape: 3, cluster: 2, tower: 0.6 },
      roofs: { gabled: 4, hipped: 3, shed: 1.2, flat: 1, barrel: 0.4, pantile: 1.2 },
      facades: { grid: 4, balconyGrid: 2, arcade: 1.2, solid: 1, timberFrame: 0.8 },
      windows: { plain: 2, sash: 3.5, shuttered: 3, arched: 1.4, round: 0.5, ribbon: 0.3 },
      doors: { plain: 3, arched: 2, dbl: 2, storefront: 1.2, plank: 1 },
      gear: { chimney: 5, flue: 1.5, antenna: 1.2, tank: 0.4, finial: 0.6 },
      trees: { round: 4, cypress: 1, bush: 2, flowering: 1.5, pine: 0.8 },
      ornaments: { cornice: 3, pilasters: 2, signage: 2, ac: 1.5, brackets: 1.5 },
      accentBias: { terracotta: 3, sage: 2, slate: 1, mustard: 1.5, ochre: 1 },
      detail: { eave: 0.35, planters: 0.4, windowBox: 0.4, vines: 0.25, groundPlant: 0.5, treeCount: 1 },
      floorHeight: 3.1,
      heightScale: 1.0
    },
    tower: {
      label: 'Tower',
      massing: { tower: 5, cluster: 2.5, slab: 1.2, lshape: 1, longhouse: 0.2 },
      roofs: { flat: 6, shed: 1, hipped: 0.4, gabled: 0.4, barrel: 0.4, steppedParapet: 1.5 },
      facades: { grid: 4, ribbonGrid: 3, balconyGrid: 3, solid: 1.4, arcade: 0.6 },
      windows: { ribbon: 3.5, plain: 3, sash: 1.5, round: 0.6, arched: 0.4, shuttered: 0.5 },
      doors: { storefront: 3, dbl: 2, plain: 1.5, arched: 0.6 },
      gear: { tank: 3.5, antenna: 3.5, flue: 2, chimney: 0.8, spire: 1.2 },
      trees: { round: 2, cypress: 1.5, bush: 2, bamboo: 0.8 },
      ornaments: { cornice: 2, pilasters: 1.5, signage: 2.5, ac: 3.5, sunshade: 1 },
      accentBias: { slate: 4, mustard: 1.5, sage: 1.5, terracotta: 1, ochre: 0.8 },
      detail: { eave: 0.1, planters: 0.35, windowBox: 0.25, vines: 0.15, groundPlant: 0.4, treeCount: 0.9 },
      floorHeight: 3.0,
      heightScale: 1.55
    },
    industrial: {
      label: 'Industrial',
      massing: { longhouse: 4, slab: 3, cluster: 2.5, tower: 1, lshape: 1.5 },
      roofs: { shed: 3.5, barrel: 3, flat: 2.5, gabled: 2, hipped: 0.4 },
      facades: { grid: 3, solid: 3, arcade: 1.5, balconyGrid: 0.6, colonnade: 0.8 },
      windows: { arched: 3, ribbon: 3, plain: 2.5, sash: 1.5, round: 1, shuttered: 0.2 },
      doors: { storefront: 2.5, dbl: 3, plain: 2, arched: 1.5 },
      gear: { flue: 4, chimney: 3, tank: 2.5, antenna: 2 },
      trees: { bush: 3, round: 1.5, cypress: 0.6, pine: 1, bamboo: 0.5 },
      ornaments: { cornice: 1.5, pilasters: 1.5, signage: 3, ac: 2.5, brackets: 1 },
      accentBias: { terracotta: 2, slate: 2, mustard: 2.5, sage: 1, ochre: 1.5 },
      detail: { eave: 0.2, planters: 0.25, windowBox: 0.1, vines: 0.3, groundPlant: 0.35, treeCount: 0.7 },
      floorHeight: 3.6,
      heightScale: 0.95
    },
    mediterranean: {
      label: 'Mediterranean',
      massing: { cluster: 4, lshape: 3, longhouse: 2.5, slab: 2, tower: 0.8 },
      roofs: { pantile: 4, hipped: 3, gabled: 2.5, flat: 2.5, shed: 1, barrel: 1 },
      facades: { grid: 3.5, arcade: 3, balconyGrid: 2.5, solid: 1, colonnade: 1.2 },
      windows: { shuttered: 4, arched: 3, plain: 2, sash: 1.2, round: 0.8, ribbon: 0.2 },
      doors: { arched: 3.5, plain: 2, dbl: 2, storefront: 1 },
      gear: { chimney: 3.5, flue: 2, antenna: 1.5, tank: 1.2, cupola: 1 },
      trees: { cypress: 4, olive: 3.5, round: 2, bush: 2.5, palm: 1 },
      ornaments: { cornice: 3, pilasters: 2, signage: 1.5, ac: 1, brackets: 1.5, sunshade: 1 },
      accentBias: { terracotta: 6, sage: 2.5, slate: 1, mustard: 1.2, ochre: 3 },
      detail: { eave: 0.5, planters: 0.7, windowBox: 0.6, vines: 0.45, groundPlant: 0.6, treeCount: 1.15 },
      floorHeight: 3.0,
      heightScale: 0.9
    },

    // --- new families ------------------------------------------------------
    japanese: {
      label: 'Japanese courtyard',
      massing: { longhouse: 4, lshape: 3.5, cluster: 3, slab: 1.5, tower: 0.3 },
      roofs: { broadEave: 6, sweptEave: 1.2, pantile: 1.5, hipped: 1.5, gabled: 1, flat: 0.3 },
      facades: { screened: 4, veranda: 4, timberFrame: 2.5, latticeBay: 1.5, grid: 1.5, solid: 0.8 },
      windows: { lattice: 5, timberPane: 3, plain: 1.2, ribbon: 0.5, round: 0.8 },
      doors: { plank: 3.5, gateway: 2.5, dbl: 1.5, plain: 1 },
      gear: { finial: 3, chimney: 1, cupola: 0.8, flue: 0.6 },
      trees: { bamboo: 4, flowering: 3.5, maple: 3, pine: 2.5, round: 1.5, bush: 2.5 },
      ornaments: { bracketTier: 3.5, brackets: 3, latticeBand: 3, cornice: 0.8, sunshade: 1.2, pilasters: 0.4 },
      accentBias: { sage: 4, olive: 3, slate: 2, terracotta: 1.5, ochre: 1.2 },
      detail: { eave: 1, planters: 0.8, windowBox: 0.3, vines: 0.25, groundPlant: 0.95, treeCount: 1.45 },
      floorHeight: 2.9,
      heightScale: 0.7
    },
    chinese: {
      label: 'Chinese courtyard',
      massing: { longhouse: 4, lshape: 3.5, cluster: 3.5, slab: 1.5, tower: 0.4 },
      roofs: { sweptEave: 6, broadEave: 2.5, pantile: 1.5, hipped: 1.2, gabled: 0.5 },
      facades: { latticeBay: 4.5, screened: 3, veranda: 2.5, colonnade: 1.2, grid: 1.5, solid: 1 },
      windows: { iceRay: 4.5, lattice: 3.5, round: 1.5, timberPane: 1.2, plain: 0.8 },
      doors: { moonGate: 3.5, gateway: 3, plank: 2, dbl: 1.2, plain: 0.6 },
      gear: { finial: 3, cupola: 1.2, chimney: 1, flue: 0.5 },
      trees: { bamboo: 4, willow: 3.5, flowering: 3, pine: 2.5, bush: 2, round: 1.5 },
      ornaments: { bracketTier: 4, latticeBand: 3, brackets: 2, cornice: 1, sunshade: 0.8 },
      accentBias: { terracotta: 3, ochre: 3, olive: 2.5, sage: 2, slate: 1.5 },
      detail: { eave: 1, planters: 0.8, windowBox: 0.25, vines: 0.3, groundPlant: 0.9, treeCount: 1.4 },
      floorHeight: 3.0,
      heightScale: 0.72
    },
    european: {
      label: 'European village',
      massing: { lshape: 3.5, cluster: 3.5, slab: 3, longhouse: 2.5, tower: 0.8 },
      roofs: { pantile: 3.5, steepGable: 3, gabled: 3, hipped: 2.5, shed: 0.8, flat: 0.4 },
      facades: { stuccoBays: 4.5, timberFrame: 3, grid: 2.5, balconyGrid: 2, arcade: 1.5, solid: 1 },
      windows: { casement: 4.5, shuttered: 3.5, sash: 2.5, timberPane: 2, arched: 1.2, round: 0.4 },
      doors: { plank: 3, arched: 2.5, plain: 2, dbl: 1.5, storefront: 1 },
      gear: { chimney: 5, dovecote: 2, flue: 1.5, finial: 1, cupola: 0.8, antenna: 0.4 },
      trees: { round: 3.5, flowering: 3, bush: 3, maple: 1.5, pine: 1.5, cypress: 0.8 },
      ornaments: { quoins: 3.5, cornice: 2.5, brackets: 2, pilasters: 1.5, signage: 1.2, sunshade: 0.6 },
      accentBias: { terracotta: 4, ochre: 3, sage: 2, mustard: 2, slate: 1.5 },
      detail: { eave: 0.5, planters: 0.7, windowBox: 0.95, vines: 0.5, groundPlant: 0.7, treeCount: 1.2 },
      floorHeight: 3.0,
      heightScale: 0.95
    },
    greek: {
      label: 'Greek classical',
      massing: { longhouse: 4, slab: 3, lshape: 2.5, cluster: 2, tower: 0.3 },
      roofs: { pediment: 6, hipped: 1.5, pantile: 1.5, gabled: 1, flat: 0.8 },
      facades: { colonnade: 5, stuccoBays: 2, arcade: 2, grid: 2, solid: 1.2 },
      windows: { trabeated: 4.5, plain: 2.5, shuttered: 2, arched: 1, round: 0.8 },
      doors: { pedimentDoor: 4, dbl: 2, plain: 1.5, arched: 1 },
      gear: { acroterion: 4, finial: 1.5, cupola: 1, chimney: 0.8 },
      trees: { olive: 4, cypress: 3.5, bush: 2.5, round: 1.5, flowering: 1 },
      ornaments: { triglyphs: 4, cornice: 3, pilasters: 2.5, brackets: 1, quoins: 0.8 },
      accentBias: { ochre: 3, slate: 3, terracotta: 2.5, sage: 1.5, olive: 1.5 },
      detail: { eave: 0.45, planters: 0.6, windowBox: 0.2, vines: 0.3, groundPlant: 0.6, treeCount: 1.1 },
      floorHeight: 3.4,
      heightScale: 0.8
    },
    moorish: {
      label: 'Moorish courtyard',
      massing: { cluster: 4, lshape: 3, slab: 2.5, longhouse: 2, tower: 1.2 },
      roofs: { crenellated: 4, flat: 3, pantile: 2.5, hipped: 1, broadEave: 0.6 },
      facades: { arcade: 4, screened: 3.5, colonnade: 2.5, grid: 2, solid: 1.2 },
      windows: { horseshoe: 4.5, lattice: 3.5, arched: 2, round: 1, plain: 0.8 },
      doors: { gateway: 4, arched: 3, dbl: 1.2, plain: 0.8 },
      gear: { cupola: 3.5, finial: 2, chimney: 1.5, flue: 0.8 },
      trees: { palm: 3.5, olive: 3, cypress: 2.5, bush: 2, flowering: 1.2 },
      ornaments: { latticeBand: 3.5, cornice: 2, pilasters: 1.5, brackets: 1, sunshade: 1.5 },
      accentBias: { ochre: 4, terracotta: 3, sage: 2, slate: 2, olive: 1.5 },
      detail: { eave: 0.3, planters: 0.8, windowBox: 0.35, vines: 0.4, groundPlant: 0.7, treeCount: 1.25 },
      floorHeight: 3.2,
      heightScale: 0.9
    },
    nordic: {
      label: 'Nordic timber',
      massing: { longhouse: 4, lshape: 3, slab: 2.5, cluster: 2.5, tower: 0.4 },
      roofs: { steepGable: 5, gabled: 3, shed: 1.5, hipped: 1, pantile: 0.6 },
      facades: { timberFrame: 4.5, grid: 3, balconyGrid: 1.5, solid: 1.5, veranda: 1 },
      windows: { timberPane: 4.5, shuttered: 2.5, plain: 2, sash: 1.5, round: 0.4 },
      doors: { plank: 4, plain: 2, dbl: 1.2, arched: 0.5 },
      gear: { chimney: 5, flue: 2, finial: 1.5, antenna: 0.6 },
      trees: { pine: 4.5, round: 2, bush: 2.5, flowering: 1 },
      ornaments: { brackets: 3, cornice: 1.5, pilasters: 1, latticeBand: 0.6, signage: 0.8 },
      accentBias: { terracotta: 4, sage: 2.5, ochre: 2, slate: 1.5, olive: 1.2 },
      detail: { eave: 0.75, planters: 0.5, windowBox: 0.65, vines: 0.15, groundPlant: 0.7, treeCount: 1.2 },
      floorHeight: 2.9,
      heightScale: 0.85
    },
    deco: {
      label: 'Art Deco',
      massing: { tower: 4, slab: 3, cluster: 1.5, lshape: 1.2, longhouse: 0.8 },
      roofs: { steppedParapet: 5, flat: 3, crenellated: 0.8, barrel: 0.5 },
      facades: { decoBanded: 4.5, grid: 2.5, ribbonGrid: 2, solid: 1.2, colonnade: 0.8 },
      windows: { decoBay: 4.5, ribbon: 2.5, plain: 2, sash: 1, round: 0.6 },
      doors: { decoPortal: 4, storefront: 2, dbl: 1.5, plain: 0.6 },
      gear: { spire: 3.5, finial: 2, antenna: 2, tank: 1, flue: 0.6 },
      trees: { cypress: 2.5, round: 2, bush: 1.5, palm: 1.5 },
      ornaments: { chevrons: 4, pilasters: 2.5, cornice: 2, signage: 2, ac: 1 },
      accentBias: { ochre: 3, mustard: 3, slate: 3, sage: 1, terracotta: 1.2 },
      detail: { eave: 0.05, planters: 0.4, windowBox: 0.15, vines: 0.1, groundPlant: 0.45, treeCount: 0.95 },
      floorHeight: 3.2,
      heightScale: 1.35
    },
    southasian: {
      label: 'South Asian veranda',
      massing: { longhouse: 4, lshape: 3, slab: 2.5, cluster: 2.5, tower: 0.8 },
      roofs: { pantile: 4, broadEave: 3, hipped: 2, flat: 1.5, gabled: 1 },
      facades: { veranda: 5, arcade: 2.5, screened: 2.5, grid: 2.5, solid: 1 },
      windows: { hooded: 4.5, lattice: 3, arched: 2, shuttered: 2, plain: 1 },
      doors: { gateway: 3, arched: 2.5, dbl: 1.5, plain: 1 },
      gear: { cupola: 2.5, finial: 2.5, chimney: 1, tank: 1.5, flue: 0.8 },
      trees: { palm: 4, flowering: 3, bamboo: 2.5, round: 2, bush: 2 },
      ornaments: { sunshade: 4, brackets: 3, latticeBand: 2, cornice: 1.5, signage: 1 },
      accentBias: { ochre: 4, terracotta: 3, sage: 2.5, mustard: 1.5, olive: 1.5 },
      detail: { eave: 0.85, planters: 0.8, windowBox: 0.4, vines: 0.4, groundPlant: 0.8, treeCount: 1.3 },
      floorHeight: 3.3,
      heightScale: 0.85
    },
    medievalcastle: {
      label: 'European medieval castle',
      massing: { castle: 7, tower: 2, cluster: 1 },
      roofs: { crenellated: 5, steepGable: 3, gabled: 2, hipped: 0.8 },
      facades: { solid: 5, arcade: 2, stuccoBays: 1, grid: 0.8 },
      windows: { arched: 4, plain: 3, round: 1, shuttered: 0.8 },
      doors: { gateway: 5, arched: 3, plank: 2, dbl: 1 },
      gear: { finial: 3, dovecote: 2, chimney: 1.5, spire: 0.8 },
      trees: { pine: 3, cypress: 2, bush: 3, round: 2, flowering: 0.8 },
      ornaments: { cornice: 3, quoins: 2.5, pilasters: 1.5, brackets: 1 },
      accentBias: { slate: 4, ochre: 2, terracotta: 2, sage: 1.5, mustard: 0.8 },
      detail: { eave: 0.35, planters: 0.25, windowBox: 0.1, vines: 0.2, groundPlant: 0.5, treeCount: 0.9 },
      floorHeight: 3.4,
      heightScale: 1.0
    },
    japanesecastle: {
      label: 'Japanese castle',
      massing: { japaneseCastle: 7, tower: 1.5, cluster: 0.8 },
      roofs: { sweptEave: 4, broadEave: 3, hipped: 2, crenellated: 0.8 },
      facades: { screened: 4, latticeBay: 3, timberFrame: 2, solid: 1.5, veranda: 1 },
      windows: { lattice: 4, timberPane: 3, round: 1, plain: 1 },
      doors: { gateway: 4, plank: 3, dbl: 1.5, plain: 0.8 },
      gear: { finial: 4, spire: 2, cupola: 1, chimney: 0.5 },
      trees: { pine: 4, bamboo: 2, maple: 3, flowering: 2, bush: 2 },
      ornaments: { bracketTier: 4, latticeBand: 3, brackets: 2, cornice: 1 },
      accentBias: { slate: 4, ochre: 2, sage: 2, terracotta: 1.5, olive: 1 },
      detail: { eave: 1, planters: 0.4, windowBox: 0.15, vines: 0.2, groundPlant: 0.8, treeCount: 1.2 },
      floorHeight: 3.1,
      heightScale: 1.1
    },
    southasiantemple: {
      label: 'South Asian temple',
      massing: { dravidianTemple: 6, steppedTemple: 1.5, tower: 1, classicalTemple: 0.5 },
      roofs: { tieredPyramid: 5, steppedParapet: 2, broadEave: 2, hipped: 1.2, pantile: 0.8, pediment: 0.4 },
      facades: { colonnade: 4, arcade: 3, veranda: 3, screened: 1.5, solid: 1 },
      windows: { arched: 3, round: 2, lattice: 2, plain: 1 },
      doors: { gateway: 5, arched: 3, dbl: 1.5, plain: 0.8 },
      gear: { cupola: 3, finial: 3, spire: 2, chimney: 0.5 },
      trees: { palm: 3, flowering: 4, bamboo: 2, round: 2, bush: 2 },
      ornaments: { pilasters: 3, cornice: 2, brackets: 2, latticeBand: 2, quoins: 1 },
      accentBias: { ochre: 4, terracotta: 3, mustard: 2, sage: 1.5, olive: 1 },
      detail: { eave: 0.8, planters: 0.8, windowBox: 0.25, vines: 0.35, groundPlant: 0.9, treeCount: 1.25 },
      floorHeight: 3.3,
      heightScale: 0.95
    },
    eastasiantemple: {
      label: 'East Asian temple',
      massing: { eastAsianTemple: 6, steppedTemple: 1.5, cluster: 1, longhouse: 0.8 },
      roofs: { sweptEave: 5, broadEave: 3, hipped: 1.5, pantile: 1 },
      facades: { latticeBay: 4, screened: 3, veranda: 3, timberFrame: 2, colonnade: 1 },
      windows: { iceRay: 4, lattice: 3, timberPane: 2, round: 1.5, plain: 0.5 },
      doors: { moonGate: 3, gateway: 3, plank: 2, dbl: 1 },
      gear: { finial: 4, cupola: 2, spire: 1, chimney: 0.5 },
      trees: { bamboo: 4, willow: 3, pine: 3, flowering: 2, bush: 2 },
      ornaments: { bracketTier: 4, latticeBand: 3, brackets: 2, cornice: 1 },
      accentBias: { terracotta: 3, ochre: 3, sage: 2, olive: 2, slate: 1 },
      detail: { eave: 1, planters: 0.7, windowBox: 0.2, vines: 0.25, groundPlant: 0.9, treeCount: 1.35 },
      floorHeight: 3.0,
      heightScale: 0.85
    },
    mesoamerican: {
      label: 'Mesoamerican stepped temple',
      massing: { mesoTemple: 7, steppedTemple: 1.5, tower: 0.8 },
      roofs: { steppedParapet: 5, flat: 3, crenellated: 1.5 },
      facades: { solid: 5, arcade: 2, colonnade: 1, grid: 0.5 },
      windows: { plain: 5, round: 1, arched: 0.5 },
      doors: { gateway: 5, plain: 2, arched: 1 },
      gear: { finial: 3, spire: 2, cupola: 0.5 },
      trees: { palm: 3, bush: 3, flowering: 2, round: 1.5 },
      ornaments: { pilasters: 3, chevrons: 2, cornice: 2, quoins: 1 },
      accentBias: { ochre: 5, terracotta: 3, mustard: 2, sage: 1, olive: 1 },
      detail: { eave: 0.1, planters: 0.15, windowBox: 0, vines: 0.2, groundPlant: 0.8, treeCount: 1.1 },
      floorHeight: 3.2,
      heightScale: 0.9
    },
    classicaltemple: {
      label: 'Classical Greek / Roman temple',
      massing: { peristyleTemple: 8, classicalTemple: 2 },
      roofs: { pediment: 8, hipped: 1, gabled: 0.5 },
      facades: { colonnade: 10, solid: 0.2 },
      windows: { trabeated: 8, plain: 0.5 },
      doors: { pedimentDoor: 8, dbl: 2, plain: 0.2 },
      gear: { acroterion: 5, finial: 2, cupola: 0.5, chimney: 0.3 },
      trees: { olive: 4, cypress: 3, round: 2, bush: 2, flowering: 1 },
      ornaments: { triglyphs: 5, cornice: 4, pilasters: 2, quoins: 0.5 },
      accentBias: { ochre: 4, slate: 3, terracotta: 2, sage: 1.5, olive: 1.5 },
      detail: { eave: 0.4, planters: 0.5, windowBox: 0.1, vines: 0.2, groundPlant: 0.6, treeCount: 1 },
      floorHeight: 3.5,
      heightScale: 0.85
    }
  };

  NS.moodNames = ['town', 'tower', 'industrial', 'mediterranean',
    'japanese', 'chinese', 'european', 'greek',
    'moorish', 'nordic', 'deco', 'southasian',
    'medievalcastle', 'japanesecastle', 'southasiantemple',
    'eastasiantemple', 'mesoamerican', 'classicaltemple'];

  /** Detail knobs, with defaults, for a mood name. Never returns undefined. */
  NS.detailOf = function (mood) {
    const m = NS.moods[mood] || NS.moods.town;
    const d = m.detail || {};
    return {
      eave: d.eave == null ? 0.3 : d.eave,
      planters: d.planters == null ? 0.4 : d.planters,
      windowBox: d.windowBox == null ? 0.35 : d.windowBox,
      vines: d.vines == null ? 0.25 : d.vines,
      groundPlant: d.groundPlant == null ? 0.5 : d.groundPlant,
      treeCount: d.treeCount == null ? 1 : d.treeCount
    };
  };

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

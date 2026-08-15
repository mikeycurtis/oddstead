// js/massing.js — volumes, faces, and the Frame abstraction.
//
// A building mass is an array of axis-aligned prisms {x, z, w, d, y0, h}.
// Deliberately restrictive: boxes plus roof geometry cover the whole Antitecture
// look, and they make painter-ordering trivial. Element functions never see 3D —
// they get a Frame, which hands them projected 2D points from face-local UV.
(function () {
  'use strict';
  const NS = {};
  const G = AD.geom;

  // --- prisms ---------------------------------------------------------------
  function prism(x, z, w, d, y0, h) {
    return { x: x, z: z, w: w, d: d, y0: y0, h: h };
  }

  // Deterministic footprint helpers. Recipes can use these to describe
  // courtyards, battered walls, and irregular compounds without introducing
  // ambient randomness into the design stream.
  function polygonRect(x, z, w, d) {
    return [{ x: x, z: z }, { x: x + w, z: z },
      { x: x + w, z: z + d }, { x: x, z: z + d }];
  }

  function polygonChamferedRect(x, z, w, d, c) {
    c = Math.max(0, Math.min(Math.min(w, d) * 0.45, c == null ? 0.7 : c));
    return [{ x: x + c, z: z }, { x: x + w - c, z: z },
      { x: x + w, z: z + c }, { x: x + w, z: z + d - c },
      { x: x + w - c, z: z + d }, { x: x + c, z: z + d },
      { x: x, z: z + d - c }, { x: x, z: z + c }];
  }

  function polygonIrregularRect(rng, x, z, w, d, variance) {
    const p = polygonChamferedRect(x, z, w, d, Math.min(w, d) * 0.12);
    const v = Math.max(0, variance == null ? 0.12 : variance);
    return p.map(function (q, i) {
      const edge = i % 2 ? d : w;
      return { x: q.x + rng.range(-w * v, w * v) * (edge === w ? 1 : 0.45),
        z: q.z + rng.range(-d * v, d * v) * (edge === d ? 1 : 0.45) };
    });
  }

  function polygonBounds(poly) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    poly.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
    return { x: x0, z: z0, w: x1 - x0, d: z1 - z0 };
  }

  function prismCorners(p) {
    const x0 = p.x, x1 = p.x + p.w, z0 = p.z, z1 = p.z + p.d;
    const ya = p.y0, yb = p.y0 + p.h;
    return [
      G.v3(x0, ya, z0), G.v3(x1, ya, z0), G.v3(x1, ya, z1), G.v3(x0, ya, z1),
      G.v3(x0, yb, z0), G.v3(x1, yb, z0), G.v3(x1, yb, z1), G.v3(x0, yb, z1)
    ];
  }

  function prismCentroid(p) {
    return G.v3(p.x + p.w / 2, p.y0 + p.h / 2, p.z + p.d / 2);
  }

  /**
   * prismFaces(p) -> [face]  (4 walls + top)
   * A face carries corners in [bl, br, tr, tl] order as seen from outside, so
   * face-local u runs left→right and v runs bottom→top.
   */
  function prismFaces(p) {
    const x0 = p.x, x1 = p.x + p.w, z0 = p.z, z1 = p.z + p.d;
    const ya = p.y0, yb = p.y0 + p.h;
    const wall = function (dir, nrm, blx, blz, brx, brz, width) {
      const bl = G.v3(blx, ya, blz), br = G.v3(brx, ya, brz);
      return {
        dir: dir,
        normal: nrm,
        corners: [bl, br, G.v3(brx, yb, brz), G.v3(blx, yb, blz)],
        width: width,
        height: p.h,
        prism: p
      };
    };
    return [
      wall('zmax', G.v3(0, 0, 1), x0, z1, x1, z1, p.w),
      wall('zmin', G.v3(0, 0, -1), x1, z0, x0, z0, p.w),
      wall('xmax', G.v3(1, 0, 0), x1, z1, x1, z0, p.d),
      wall('xmin', G.v3(-1, 0, 0), x0, z0, x0, z1, p.d),
      {
        dir: 'top',
        normal: G.v3(0, 1, 0),
        corners: [G.v3(x0, yb, z1), G.v3(x1, yb, z1), G.v3(x1, yb, z0), G.v3(x0, yb, z0)],
        width: p.w,
        height: p.d,
        prism: p
      }
    ];
  }

  // --- Frame ----------------------------------------------------------------
  /**
   * makeFrame(face, cam) -> Frame
   * frame.pt(u,v)  face-local UV -> projected canvas point (bilinear, so the
   *                perspective cheat and foreshortening come along for free)
   * frame.quad(u0,v0,u1,v1)  four projected corners of a sub-rect
   * frame.width/height       world dimensions
   * frame.px(u)              approximate projected pixel length of u*width
   */
  function makeFrame(face, cam) {
    const P = [
      G.project(face.corners[0], cam),
      G.project(face.corners[1], cam),
      G.project(face.corners[2], cam),
      G.project(face.corners[3], cam)
    ];
    const pxW = (Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) +
      Math.hypot(P[2].x - P[3].x, P[2].y - P[3].y)) * 0.5;
    const pxH = (Math.hypot(P[3].x - P[0].x, P[3].y - P[0].y) +
      Math.hypot(P[2].x - P[1].x, P[2].y - P[1].y)) * 0.5;

    const frame = {
      face: face,
      dir: face.dir,
      corners2d: P,
      width: face.width,
      height: face.height,
      pxWidth: pxW,
      pxHeight: pxH,
      depth: (P[0].z + P[1].z + P[2].z + P[3].z) / 4,
      pt: function (u, v) {
        const bx = P[0].x + (P[1].x - P[0].x) * u;
        const by = P[0].y + (P[1].y - P[0].y) * u;
        const tx = P[3].x + (P[2].x - P[3].x) * u;
        const ty = P[3].y + (P[2].y - P[3].y) * u;
        return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
      },
      quad: function (u0, v0, u1, v1) {
        return [
          frame.pt(u0, v0), frame.pt(u1, v0),
          frame.pt(u1, v1), frame.pt(u0, v1)
        ];
      },
      px: function (u) { return pxW * u; },
      pyv: function (v) { return pxH * v; }
    };
    return frame;
  }

  // --- massing recipes ------------------------------------------------------
  // Each returns {kind, prisms}. Footprints get centred on the origin afterwards.

  function recipeSlab(rng, cfg) {
    const w = rng.range(9, 16);
    const d = rng.range(6.5, 10);
    const floors = rng.int(2, 5);
    const h = floors * cfg.floorHeight * cfg.heightScale;
    const prisms = [prism(-w / 2, -d / 2, w, d, 0, h)];
    if (rng.chance(0.35)) {
      // low annex on one flank
      const aw = rng.range(3, 5.5), ad = d * rng.range(0.55, 0.9);
      const side = rng.chance(0.5) ? 1 : -1;
      prisms.push(prism(side > 0 ? w / 2 : -w / 2 - aw, -ad / 2, aw, ad, 0,
        cfg.floorHeight * rng.range(0.9, 1.6)));
    }
    return { kind: 'slab', prisms: prisms };
  }

  function recipeTower(rng, cfg) {
    const w = rng.range(6, 9.5);
    const d = rng.range(6, 9.5);
    const floors = Math.round(rng.int(6, 13) * cfg.heightScale);
    const total = floors * cfg.floorHeight;
    const prisms = [];
    const setbacks = rng.weighted([[0, 2], [1, 3], [2, 1.5]]);
    let y = 0, cw = w, cd = d, cx = -w / 2, cz = -d / 2;
    const parts = setbacks + 1;
    for (let i = 0; i < parts; i++) {
      const frac = i === parts - 1 ? 1 : rng.range(0.35, 0.6);
      const seg = (total - y) * frac;
      prisms.push(prism(cx, cz, cw, cd, y, seg));
      y += seg;
      const shrink = rng.range(0.62, 0.85);
      const nw = cw * shrink, nd = cd * shrink;
      cx += (cw - nw) * rng.range(0.2, 0.8);
      cz += (cd - nd) * rng.range(0.2, 0.8);
      cw = nw; cd = nd;
    }
    if (rng.chance(0.45)) {
      // podium
      const pw = w * rng.range(1.3, 1.9), pd = d * rng.range(1.1, 1.5);
      prisms.unshift(prism(-pw / 2 + rng.range(-1, 1), -pd / 2 + rng.range(-1, 1),
        pw, pd, 0, cfg.floorHeight * rng.range(1, 1.8)));
    }
    return { kind: 'tower', prisms: prisms };
  }

  function recipeLShape(rng, cfg) {
    const w1 = rng.range(8, 13), d1 = rng.range(6, 8.5);
    const w2 = rng.range(5, 7.5), d2 = rng.range(7, 12);
    const f1 = rng.int(2, 4), f2 = rng.int(1, 4);
    const h1 = f1 * cfg.floorHeight * cfg.heightScale;
    const h2 = Math.max(cfg.floorHeight, f2 * cfg.floorHeight * cfg.heightScale);
    const flip = rng.chance(0.5) ? 1 : -1;
    const a = prism(0, 0, w1, d1, 0, h1);
    const b = prism(flip > 0 ? w1 - w2 : 0, d1 - rng.range(0.2, 0.9), w2, d2, 0, h2);
    return { kind: 'lshape', prisms: [a, b] };
  }

  function recipeCluster(rng, cfg) {
    const n = rng.int(2, 4);
    const prisms = [];
    let cursor = 0;
    for (let i = 0; i < n; i++) {
      const w = rng.range(4.5, 9);
      const d = rng.range(5.5, 9);
      const floors = rng.int(1, 5);
      const h = Math.max(cfg.floorHeight, floors * cfg.floorHeight * cfg.heightScale);
      const z = rng.range(-1.6, 1.6);
      prisms.push(prism(cursor, z - d / 2, w, d, 0, h));
      cursor += w - rng.range(0.1, 1.1); // slight interpenetration reads as a terrace
    }
    return { kind: 'cluster', prisms: prisms };
  }

  function recipeLonghouse(rng, cfg) {
    const w = rng.range(14, 21);
    const d = rng.range(7.5, 11);
    const floors = rng.int(1, 2);
    const h = Math.max(cfg.floorHeight, floors * cfg.floorHeight * cfg.heightScale * 1.15);
    const prisms = [prism(-w / 2, -d / 2, w, d, 0, h)];
    if (rng.chance(0.4)) {
      const tw = rng.range(3.5, 5), td = rng.range(3.5, 5);
      const tx = rng.range(-w / 2 + 1, w / 2 - tw - 1);
      prisms.push(prism(tx, -td / 2 + rng.range(-0.5, 0.5), tw, td, 0,
        h + cfg.floorHeight * rng.range(1.2, 3)));
    }
    return { kind: 'longhouse', prisms: prisms };
  }

  function recipeCastle(rng, cfg) {
    const w = rng.range(12, 17), d = rng.range(10, 14);
    const wallH = cfg.floorHeight * rng.range(1.2, 2.1);
    const towerW = rng.range(2.4, 3.5), towerH = cfg.floorHeight * rng.range(3.5, 6.5);
    const t = rng.range(0.8, 1.25);
    const profile = rng.weightedKey({ concentric: 3, motte: 2, compact: 2 });
    const prisms = [];
    // A curtain wall is a perimeter, not a solid block. Leave the bailey open so
    // the courtyard and the gatehouse read in projection.
    prisms.push(prism(-w / 2, -d / 2, w, t, 0, wallH));
    prisms.push(prism(-w / 2, d / 2 - t, w, t, 0, wallH));
    prisms.push(prism(-w / 2, -d / 2 + t, t, d - t * 2, 0, wallH));
    prisms.push(prism(w / 2 - t, -d / 2 + t, t, d - t * 2, 0, wallH));
    if (profile === 'concentric') {
      const iw = w * rng.range(0.56, 0.72), id = d * rng.range(0.54, 0.7), it = t * 0.7;
      const ih = wallH * rng.range(0.8, 1.25);
      prisms.push(prism(-iw / 2, -id / 2, iw, it, wallH * 0.18, ih));
      prisms.push(prism(-iw / 2, id / 2 - it, iw, it, wallH * 0.18, ih));
      prisms.push(prism(-iw / 2, -id / 2 + it, it, id - it * 2, wallH * 0.18, ih));
      prisms.push(prism(iw / 2 - it, -id / 2 + it, it, id - it * 2, wallH * 0.18, ih));
    } else if (profile === 'motte') {
      const mw = w * rng.range(0.45, 0.65), md = d * rng.range(0.4, 0.58);
      prisms.push(prism(-mw / 2, -md / 2, mw, md, 0, wallH * 0.7));
    }
    if (profile !== 'compact') {
      [[-w / 2, -d / 2], [w / 2 - towerW, -d / 2],
        [-w / 2, d / 2 - towerW], [w / 2 - towerW, d / 2 - towerW]].forEach(function (p) {
        prisms.push(prism(p[0], p[1], towerW, towerW, 0, towerH));
      });
    } else {
      const kw = w * rng.range(0.32, 0.5), kd = d * rng.range(0.32, 0.5);
      prisms.push(prism(-kw / 2, -kd / 2, kw, kd, wallH, towerH * rng.range(0.7, 1.1)));
    }
    // A gatehouse projects toward the front bailey, while the keep may sit
    // central or against a rear curtain wall depending on the seed.
    const gateW = rng.range(2.8, 4.4), gateD = rng.range(1.4, 2.3);
    prisms.push(prism(-gateW / 2, d / 2 - gateD * 0.35, gateW, gateD, 0,
      wallH * rng.range(1.2, 1.8)));
    if (rng.chance(0.82)) {
      const kw = w * rng.range(0.28, 0.45), kd = d * rng.range(0.28, 0.45);
      const rear = rng.chance(0.65);
      prisms.push(prism(-kw / 2 + (rear ? 0 : rng.range(-2, 2)),
        rear ? -d / 2 + t : -kd / 2, kw, kd, wallH * 0.55,
        towerH * rng.range(0.55, 0.95)));
    }
    return { kind: 'castle', prisms: prisms };
  }

  function recipeJapaneseCastle(rng, cfg) {
    const baseW = rng.range(12, 17), baseD = rng.range(10, 14);
    const stoneH = cfg.floorHeight * rng.range(0.8, 1.35);
    const prisms = [prism(-baseW / 2, -baseD / 2, baseW, baseD, 0, stoneH)];
    const tiers = rng.int(3, 5);
    let w = baseW * rng.range(0.58, 0.72), d = baseD * rng.range(0.58, 0.72);
    let y = stoneH;
    for (let i = 0; i < tiers; i++) {
      const h = cfg.floorHeight * rng.range(0.8, 1.18);
      prisms.push(prism(-w / 2, -d / 2, w, d, y, h));
      y += h;
      w *= rng.range(0.78, 0.91);
      d *= rng.range(0.78, 0.91);
    }
    // Small corner yagura volumes create a castle compound rather than a lone
    // pagoda tower.
    const yagW = rng.range(1.8, 2.8);
    [[-baseW / 2, -baseD / 2], [baseW / 2 - yagW, -baseD / 2],
      [-baseW / 2, baseD / 2 - yagW], [baseW / 2 - yagW, baseD / 2 - yagW]].forEach(function (p) {
      if (rng.chance(0.72)) prisms.push(prism(p[0], p[1], yagW, yagW, stoneH * 0.55,
        cfg.floorHeight * rng.range(1.5, 2.8)));
    });
    return { kind: 'japaneseCastle', prisms: prisms };
  }

  function recipeDravidianTemple(rng, cfg) {
    const w = rng.range(11, 16), d = rng.range(10, 15);
    const plinth = cfg.floorHeight * rng.range(0.45, 0.75);
    const hallW = w * rng.range(0.52, 0.7), hallD = d * rng.range(0.45, 0.62);
    const shrineH = cfg.floorHeight * rng.range(2.2, 3.6);
    const prisms = [
      prism(-w / 2, -d / 2, w, d, 0, plinth),
      prism(-hallW / 2, -hallD / 2, hallW, hallD, plinth, cfg.floorHeight * rng.range(1.2, 2)),
      prism(-hallW * 0.34, -hallD * 0.3, hallW * 0.68, hallD * 0.6,
        plinth + cfg.floorHeight * 1.5, shrineH),
      // ceremonial entrance tower on the front axis
      prism(-w * rng.range(0.12, 0.18), d / 2 - rng.range(1.1, 1.8),
        w * rng.range(0.24, 0.36), rng.range(1.1, 1.8), 0,
        cfg.floorHeight * rng.range(2.5, 4.5))
    ];
    return { kind: 'dravidianTemple', prisms: prisms };
  }

  function recipeEastAsianTemple(rng, cfg) {
    const w = rng.range(13, 18), d = rng.range(11, 16);
    const wall = rng.range(1.2, 2.1), hallH = cfg.floorHeight * rng.range(0.9, 1.5);
    const gateW = w * rng.range(0.22, 0.34);
    const sanctuaryW = w * rng.range(0.34, 0.5), sanctuaryD = d * rng.range(0.3, 0.46);
    const prisms = [
      prism(-w / 2, -d / 2, w, wall, 0, hallH),
      prism(-w / 2, d / 2 - wall, w, wall, 0, hallH),
      prism(-w / 2, -d / 2 + wall, wall, d - wall * 2, 0, hallH),
      prism(w / 2 - wall, -d / 2 + wall, wall, d - wall * 2, 0, hallH),
      prism(-gateW / 2, d / 2 - wall * 0.5, gateW, wall * 1.8, 0, hallH * rng.range(1.4, 2.1)),
      prism(-sanctuaryW / 2, -sanctuaryD / 2, sanctuaryW, sanctuaryD, hallH,
        cfg.floorHeight * rng.range(1.6, 2.7))
    ];
    return { kind: 'eastAsianTemple', prisms: prisms };
  }

  function recipeMesoTemple(rng, cfg) {
    const w = rng.range(12, 18), d = rng.range(11, 16);
    const steps = rng.int(3, 5), prisms = [];
    let y = 0, cw = w, cd = d;
    for (let i = 0; i < steps; i++) {
      const h = cfg.floorHeight * rng.range(0.38, 0.62);
      prisms.push(prism(-cw / 2, -cd / 2, cw, cd, y, h));
      y += h;
      cw *= rng.range(0.75, 0.86);
      cd *= rng.range(0.75, 0.86);
    }
    const shrineW = cw * rng.range(0.72, 0.9), shrineD = cd * rng.range(0.62, 0.84);
    prisms.push(prism(-shrineW / 2, -shrineD / 2, shrineW, shrineD, y,
      cfg.floorHeight * rng.range(1.2, 2.2)));
    return { kind: 'mesoTemple', prisms: prisms };
  }

  function recipePeristyleTemple(rng, cfg) {
    const w = rng.range(11, 17), d = rng.range(8, 12);
    const podium = cfg.floorHeight * rng.range(0.55, 0.9);
    const cellaH = cfg.floorHeight * rng.range(2.1, 3.5);
    const cellaW = w * rng.range(0.46, 0.62), cellaD = d * rng.range(0.42, 0.62);
    const porticoW = cellaW * rng.range(0.72, 0.96);
    const porticoD = rng.range(1.2, 2.1);
    return { kind: 'peristyleTemple', prisms: [
      prism(-w / 2, -d / 2, w, d, 0, podium),
      prism(-cellaW / 2, -cellaD / 2, cellaW, cellaD, podium, cellaH),
      prism(-porticoW / 2, cellaD / 2 - 0.15, porticoW, porticoD, podium, cellaH * rng.range(0.72, 0.92))
    ] };
  }

  function recipeSteppedTemple(rng, cfg) {
    return recipeMesoTemple(rng, cfg);
  }

  function recipeClassicalTemple(rng, cfg) {
    return recipePeristyleTemple(rng, cfg);
  }

  const RECIPES = {
    slab: recipeSlab,
    tower: recipeTower,
    lshape: recipeLShape,
    cluster: recipeCluster,
    longhouse: recipeLonghouse,
    castle: recipeCastle,
    japaneseCastle: recipeJapaneseCastle,
    dravidianTemple: recipeDravidianTemple,
    eastAsianTemple: recipeEastAsianTemple,
    mesoTemple: recipeMesoTemple,
    peristyleTemple: recipePeristyleTemple,
    steppedTemple: recipeSteppedTemple,
    classicalTemple: recipeClassicalTemple
  };

  function centre(mass) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    mass.prisms.forEach(function (p) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w);
      z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z + p.d);
    });
    const dx = (x0 + x1) / 2, dz = (z0 + z1) / 2;
    mass.prisms.forEach(function (p) { p.x -= dx; p.z -= dz; });
    mass.footprint = { w: x1 - x0, d: z1 - z0 };
    return mass;
  }

  /** build(kind, rng, moodCfg) -> {kind, prisms, footprint} */
  function build(kind, rng, cfg) {
    const fn = RECIPES[kind] || recipeSlab;
    const mass = fn(rng, cfg);
    mass.prisms = mass.prisms.filter(function (p) {
      return p.w > 0.5 && p.d > 0.5 && p.h > 0.5 &&
        isFinite(p.x) && isFinite(p.z) && isFinite(p.h);
    });
    if (!mass.prisms.length) mass.prisms = [prism(-5, -4, 10, 8, 0, 9)];
    const m = Math.max(0.7, Math.min(1.4, cfg && cfg.monumentality != null ? cfg.monumentality : 1));
    const hs = Math.pow(m, 1.18);
    mass.prisms.forEach(function (p) {
      p.x *= m; p.z *= m; p.w *= m; p.d *= m;
      p.y0 *= hs; p.h *= hs;
    });
    mass.monumentality = m;
    return centre(mass);
  }

  NS.prism = prism;
  NS.polygonRect = polygonRect;
  NS.polygonChamferedRect = polygonChamferedRect;
  NS.polygonIrregularRect = polygonIrregularRect;
  NS.polygonBounds = polygonBounds;
  NS.prismCorners = prismCorners;
  NS.prismCentroid = prismCentroid;
  NS.prismFaces = prismFaces;
  NS.makeFrame = makeFrame;
  NS.build = build;
  NS.recipeNames = ['slab', 'tower', 'lshape', 'cluster', 'longhouse',
    'castle', 'japaneseCastle', 'dravidianTemple', 'eastAsianTemple',
    'mesoTemple', 'peristyleTemple', 'steppedTemple', 'classicalTemple'];

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.massing = NS;
})();

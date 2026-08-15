// js/building.js — recipes: from a seed to a plan, and from a plan to ink.
//
// generate() produces a serialisable plan and draws nothing. render() draws a
// plan and rolls no design decisions. That split is what lets the view sliders
// re-render at a new angle without touching the building's identity, and lets
// export re-render at 2× without redesigning anything.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const G = AD.geom;
  const M = AD.massing;
  const ST = AD.style;

  const WALL_DIRS = ['zmax', 'zmin', 'xmax', 'xmin'];

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // --- generate -------------------------------------------------------------

  function pickAccentMap(rng, mood) {
    const names = ST.pickAccents(rng, mood);
    const has = function (n) { return names.indexOf(n) >= 0; };
    const A = ST.accents;
    const map = {
      names: names, roof: null, veg: null, glass: null,
      door: null, sign: null, trim: null
    };
    if (has('terracotta')) map.roof = A.terracotta;
    if (has('sage')) map.veg = A.sage;
    if (has('slate')) map.glass = A.slate;
    if (has('mustard')) { map.door = A.mustard; map.sign = A.mustard; }
    // olive reads as planting; ochre as render, tile and screenwork
    if (has('olive')) { map.veg = A.olive; map.trim = A.olive; }
    if (has('ochre')) {
      map.trim = A.ochre;
      if (!map.roof) map.roof = A.ochre;
      if (!map.sign) map.sign = A.ochre;
    }
    if (!map.door && has('terracotta') && rng.chance(0.4)) map.door = A.terracotta;
    if (!map.sign && map.roof && rng.chance(0.4)) map.sign = map.roof;
    if (!map.trim && map.roof && rng.chance(0.5)) map.trim = map.roof;
    return map;
  }

  function footprintOverlap(a, b) {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
    if (ox <= 0 || oz <= 0) return 0;
    return (ox * oz) / (a.w * a.d);
  }

  function faceConfig(rng, cfgMood, prism, dir, faceW, opts) {
    const floorH = cfgMood.floorHeight;
    const floors = clamp(Math.round(prism.h / floorH), 1, 16);
    const bayW = rng.range(2.6, 3.6);
    const bays = clamp(Math.round(faceW / bayW), 1, 9);

    const det = opts.detail;

    let system = rng.weightedKey(cfgMood.facades);
    if (opts.shadow && rng.chance(0.45)) system = 'solid';
    if (opts.blank) system = 'solid';
    if (!AD.facade.systems[system]) system = 'grid';
    // systems that need a storey above their special ground floor
    if (floors < 2 && (system === 'arcade' || system === 'ribbonGrid' ||
      system === 'decoBanded')) system = 'grid';
    if (floors < 2 && (system === 'veranda' || system === 'colonnade') && faceW < 6) {
      system = 'grid';
    }

    const win = rng.weightedKey(cfgMood.windows);
    const cfg = {
      system: system,
      win: AD.openings.windows[win] ? win : 'plain',
      // repetition plus one deviation is where architectural charm lives
      altWin: rng.chance(0.15) ? rng.weightedKey(cfgMood.windows) : null,
      floors: floors,
      bays: bays,
      marginU: rng.range(0.05, 0.11),
      marginBottom: rng.range(0.015, 0.05),
      marginTop: rng.range(0.02, 0.06),
      winW: rng.range(0.42, 0.66),
      winH: rng.range(0.45, 0.72),
      floorLines: rng.chance(0.35),
      skip: rng.chance(0.25) ? rng.range(0.04, 0.14) : 0,
      balconyP: rng.range(0.3, 0.62),
      // a family that screens its façades tends to screen its balustrades too
      railing: rng.weightedKey({
        bars: 3,
        cross: 1.5,
        slab: 1.5,
        lattice: 1 + (cfgMood.facades.screened || 0),
        turned: 1 + (cfgMood.facades.veranda || 0) * 0.7 + (cfgMood.facades.colonnade || 0) * 0.5
      }),
      hatchAngle: rng.chance(0.5) ? -1.05 : -0.6,
      hatchGap: rng.range(0.055, 0.11),
      sparse: rng.range(0.03, 0.14),
      arcadeDense: rng.chance(0.4),
      mullions: rng.chance(0.6),
      // screens, posts and braces — read by the screened / veranda /
      // colonnade / timberFrame systems, ignored by the others
      screenP: clamp(rng.range(0.3, 0.75), 0, 1),
      screenDiagonal: rng.chance(0.4),
      posts: clamp(Math.round(faceW / rng.range(2.2, 3.4)), 2, 8),
      braceP: rng.range(0.2, 0.5),
      potP: clamp(det.planters * 0.5, 0, 0.6),
      windowBoxP: clamp(det.windowBox * 0.55, 0, 0.6),
      shadow: !!opts.shadow,
      hasDoor: !!opts.door,
      door: rng.weightedKey(cfgMood.doors),
      doorBay: rng.int(0, Math.max(0, bays - 1)),
      doorW: rng.range(0.5, 0.8),
      doorH: rng.range(0.72, 0.95),
      ornaments: []
    };
    if (!AD.openings.doors[cfg.door]) cfg.door = 'plain';
    if (cfg.altWin && !AD.openings.windows[cfg.altWin]) cfg.altWin = null;

    // --- ornament layers ---------------------------------------------------
    // Which extra layers a wall wears is a mood decision; how many is a density
    // decision. Layers that only make sense once (a cornice, a bracket course)
    // are never rolled twice on the same wall.
    const budget = opts.detailBudget;
    const table = cfgMood.ornaments || { cornice: 3, pilasters: 2, signage: 1.5, ac: 1.5 };
    const once = { cornice: 1, pilasters: 1, brackets: 1, sunshade: 1, chevrons: 1, latticeBand: 1 };
    const taken = {};
    const layers = clamp(Math.floor(rng.range(0.2, 1.6 + 2.4 * budget)), 0, 5);
    for (let i = 0; i < layers; i++) {
      let type = rng.weightedKey(table);
      if (!AD.details.ornament[type]) type = 'cornice';
      if (type === 'signage' && !opts.door) type = 'cornice';
      if (once[type] && taken[type]) continue;
      taken[type] = true;
      if (type === 'signage') {
        cfg.ornaments.push({
          type: type, u0: rng.range(0.08, 0.45), v0: rng.range(0.16, 0.3)
        });
      } else if (type === 'ac') {
        cfg.ornaments.push({ type: type, u: rng.range(0.1, 0.85), v: rng.range(0.22, 0.85) });
      } else if (type === 'chevrons') {
        cfg.ornaments.push({ type: type, v: rng.range(0.86, 0.93), h: rng.range(0.025, 0.055) });
      } else if (type === 'brackets') {
        cfg.ornaments.push({ type: type, v: rng.range(0.93, 0.97), drop: rng.range(0.03, 0.07) });
      } else if (type === 'sunshade') {
        // sit the shade on a floor line so it reads as built, not floating
        const fl = floors > 1 ? rng.int(1, floors - 1) / floors : 0.62;
        cfg.ornaments.push({ type: type, v: clamp(fl - 0.03, 0.2, 0.86) });
      } else if (type === 'latticeBand') {
        const u0 = rng.range(0.06, 0.4);
        cfg.ornaments.push({
          type: type, u0: u0, u1: Math.min(0.96, u0 + rng.range(0.3, 0.55)),
          v: rng.range(0.28, 0.66), h: rng.range(0.1, 0.2)
        });
      } else {
        cfg.ornaments.push({ type: type });
      }
    }

    // --- greenery on the wall ----------------------------------------------
    // A climber gets its own colours here, at generate time, so the same wall
    // is planted the same way every time it is drawn.
    const mood = opts.mood;
    if (rng.chance(clamp(det.vines * budget, 0, 0.5))) {
      cfg.ornaments.push({
        type: 'vine', u: rng.range(0.06, 0.9),
        col: ST.plantColor(rng, mood, 'vine')
      });
    } else if (rng.chance(clamp(det.vines * 0.55 * budget, 0, 0.35))) {
      cfg.ornaments.push({
        type: 'trellis', u: rng.range(0.06, 0.7),
        col: ST.plantColor(rng, mood, 'vine')
      });
    }
    return cfg;
  }

  /**
   * generate(seed, opts) -> plan
   * opts: {mood ('any' or a name), density (0.4..1.6)}
   */
  function generate(seed, opts) {
    opts = opts || {};
    const master = AD.rng.makeRng(seed);
    const density = clamp(opts.density == null ? 1 : opts.density, 0.2, 2);
    const monumentality = clamp(opts.monumentality == null ? 1 : opts.monumentality, 0.7, 1.4);

    const moodRng = master.fork('mood');
    let mood = opts.mood && opts.mood !== 'any' ? opts.mood : moodRng.pick(ST.moodNames);
    if (!ST.moods[mood]) mood = 'town';
    const cfgMood = ST.moods[mood];
    const det = ST.detailOf(mood);

    const styleRng = master.fork('style');
    const accents = pickAccentMap(styleRng, mood);
    const penName = styleRng.pick(ST.penNames);

    const massRng = master.fork('massing');
    const kind = massRng.weightedKey(cfgMood.massing);
    const buildCfg = Object.assign({}, cfgMood, { monumentality: monumentality });
    const mass = M.build(ST.moods[mood].massing[kind] !== undefined ? kind : 'slab', massRng, buildCfg);

    // which prisms are capped by another volume (tower setbacks) -> no roof
    mass.prisms.forEach(function (p, i) {
      p.index = i;
      p.capped = false;
      mass.prisms.forEach(function (q, j) {
        if (i === j) return;
        if (Math.abs(q.y0 - (p.y0 + p.h)) < 0.05 && footprintOverlap(p, q) > 0.3) p.capped = true;
      });
    });

    // the frontmost ground-level prism gets the entrance
    let frontIdx = 0, bestZ = -Infinity;
    mass.prisms.forEach(function (p, i) {
      const z = p.z + p.d;
      if (p.y0 < 0.01 && z > bestZ) { bestZ = z; frontIdx = i; }
    });

    const roofRng = master.fork('roofs');
    const mainRoof = roofRng.weightedKey(cfgMood.roofs);
    const roofs = mass.prisms.map(function (pr) {
      if (pr.capped) return { variant: null };
      let variant = roofRng.chance(0.3) ? roofRng.weightedKey(cfgMood.roofs) : mainRoof;
      if (!AD.roofs.roofs[variant]) variant = 'flat';
      const long = pr.d > pr.w;
      const flatTop = variant === 'flat' || variant === 'steppedParapet' ||
        variant === 'crenellated';
      // how far the roof reaches past its wall: the family's eave habit, plus
      // a real overhang for the broad-eave variant
      let ov = 0;
      if (!flatTop) {
        ov = roofRng.range(0.12, 0.4) + det.eave * roofRng.range(0.1, 0.5);
        if (variant === 'broadEave') ov += roofRng.range(0.45, 0.9);
        // a swept roof needs the reach for its corners to lift into
        if (variant === 'sweptEave') ov += roofRng.range(0.55, 1.05);
      }
      return {
        variant: variant,
        h: AD.roofs.roofHeight(variant, pr, roofRng),
        ov: ov,
        ridgeAxis: long ? 'z' : 'x',
        highSide: roofRng.pick(['xmax', 'xmin', 'zmax', 'zmin']),
        seamGap: roofRng.range(0.1, 0.2),
        upturn: roofRng.range(0.1, 0.16) + det.eave * roofRng.range(0.05, 0.22),
        steps: roofRng.int(2, 4),
        merlons: roofRng.int(3, 7),
        tileGap: roofRng.range(0.07, 0.14),
        accent: roofRng.chance(0.75) ? accents.roof : null
      };
    });

    // façades
    const faces = {};
    const light = ST.light;
    mass.prisms.forEach(function (pr, i) {
      WALL_DIRS.forEach(function (dir) {
        const key = i + ':' + dir;
        const rng = master.fork('facade:' + key);
        const nrm = dir === 'zmax' ? G.v3(0, 0, 1) : dir === 'zmin' ? G.v3(0, 0, -1)
          : dir === 'xmax' ? G.v3(1, 0, 0) : G.v3(-1, 0, 0);
        const faceW = (dir === 'zmax' || dir === 'zmin') ? pr.w : pr.d;
        const isDoor = i === frontIdx && dir === 'zmax' && pr.y0 < 0.01;
        faces[key] = faceConfig(rng, cfgMood, pr, dir, faceW, {
          shadow: G.dot(nrm, light) < -0.05,
          blank: pr.w * pr.d < 12 && rng.chance(0.3),
          door: isDoor,
          detail: det,
          mood: mood,
          detailBudget: density
        });
      });
    });

    // roof gear
    const gearRng = master.fork('gear');
    const gear = [];
    mass.prisms.forEach(function (pr, i) {
      if (pr.capped) return;
      const roof = roofs[i];
      const area = pr.w * pr.d;
      const n = clamp(Math.floor(gearRng.range(0, 1 + area * 0.045 * density)), 0, 4);
      for (let k = 0; k < n; k++) {
        let type = gearRng.weightedKey(cfgMood.gear);
        if (!AD.details.gear[type]) type = 'chimney';
        const pitched = roof.variant && roof.variant !== 'flat';
        // crowning pieces belong on the ridge or the centre of the deck;
        // working gear can wander, but pitched roofs pull it toward the ridge.
        // Corner pieces are the exception: they sit out at the roof's edge.
        const crown = type === 'finial' || type === 'cupola' || type === 'spire';
        const corner = type === 'acroterion';
        const inset = corner ? 0.03 : crown ? 0.44 : (pitched ? 0.34 : 0.16);
        const x = corner
          ? pr.x + pr.w * (gearRng.chance(0.5) ? inset : 1 - inset)
          : pr.x + pr.w * gearRng.range(inset, 1 - inset);
        const z = corner
          ? pr.z + pr.d * (gearRng.chance(0.5) ? inset : 1 - inset)
          : pr.z + pr.d * gearRng.range(inset, 1 - inset);
        const y = pr.y0 + pr.h + (corner ? 0
          : crown ? roof.h * (pitched ? 0.98 : 1)
            : roof.variant === 'flat' ? roof.h * 0.85 : roof.h * gearRng.range(0.3, 0.6));
        gear.push({
          prism: i, type: type,
          x: x, z: z, y: y,
          size: Math.min(pr.w, pr.d) * gearRng.range(0.08, 0.16) + 0.25
        });
      }
    });

    // site
    const siteRng = master.fork('site');
    const fw = mass.footprint.w, fd = mass.footprint.d;
    const site = {
      reach: fw * 0.85 + 6,
      z: -fd / 2 + siteRng.range(0.1, 0.6),
      frontZ: fd / 2,
      shadowLen: siteRng.range(2.5, 6),
      sidewalk: siteRng.chance(0.6),
      birds: siteRng.chance(0.42),
      plinth: siteRng.chance(0.45) ? {
        prismIndex: frontIdx, steps: siteRng.int(1, 3),
        grow: siteRng.range(0.25, 0.7), rise: siteRng.range(0.12, 0.3)
      } : null,
      fence: siteRng.chance(0.32) ? {
        side: siteRng.chance(0.5) ? 1 : -1,
        length: siteRng.range(4, 9),
        spacing: siteRng.range(0.7, 1.4),
        height: siteRng.range(0.9, 1.7),
        rails: siteRng.int(1, 2)
      } : null,
      trees: [],
      planters: [],
      planting: []
    };
    const treeN = clamp(Math.round(
      siteRng.range(0, 2.4 * density * det.treeCount) + (siteRng.chance(0.55) ? 1 : 0)
    ), 0, 6);
    for (let i = 0; i < treeN; i++) {
      let type = siteRng.weightedKey(cfgMood.trees);
      if (!AD.site.trees[type]) type = 'round';
      const side = siteRng.chance(0.5) ? 1 : -1;
      const z = siteRng.range(-fd / 2 - 1.5, fd / 2 + 3);
      let h = AD.site.treeHeight(type, siteRng);
      // planting always stands clear of the footprint, and anything in front of
      // the building stays low so it dresses the sheet instead of hiding it
      const inFront = z > fd / 2 - 0.5;
      if (inFront && h > 4.5) h = siteRng.range(2.4, 4.2);
      site.trees.push({
        type: type,
        x: side * (fw / 2 + siteRng.range(h > 5 ? 1.6 : 0.8, 5)),
        z: z,
        h: h
      });
    }

    // planters standing against the entrance volume
    const frontPr = mass.prisms[frontIdx];
    if (siteRng.chance(clamp(det.planters * density, 0, 0.9))) {
      const n = siteRng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const w = siteRng.range(0.9, 2);
        site.planters.push({
          x: frontPr.x + frontPr.w * siteRng.range(0.12, 0.88),
          z: frontPr.z + frontPr.d + siteRng.range(0.3, 0.8),
          w: w,
          d: siteRng.range(0.5, 0.9),
          h: siteRng.range(0.35, 0.7),
          tall: siteRng.chance(0.4)
        });
      }
    }

    // low ground planting where wall meets ground
    if (siteRng.chance(clamp(det.groundPlant * density, 0, 0.95))) {
      const n = siteRng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const alongFront = siteRng.chance(0.6);
        site.planting.push({
          x: alongFront
            ? frontPr.x + frontPr.w * siteRng.range(0.05, 0.95)
            : (siteRng.chance(0.5) ? 1 : -1) * (fw / 2 + siteRng.range(0.3, 2.4)),
          z: alongFront
            ? frontPr.z + frontPr.d + siteRng.range(0.15, 0.6)
            : siteRng.range(-fd / 2, fd / 2 + 2),
          spread: siteRng.range(0.6, 1.8),
          n: siteRng.int(2, 5),
          scale: siteRng.range(0.7, 1.3)
        });
      }
    }

    // --- planting colour ----------------------------------------------------
    // Colour is decided here, not at draw time: its own stream, so adding a
    // tree never re-rolls the building, and every plant on the sheet carries a
    // palette that is as reproducible as its position. Species first (a cypress
    // is dark wherever it grows), family second (the flowers around it are the
    // family's). `flora` is the building-wide palette used by wall planting —
    // window boxes, pots, climbers — so one hand plants the whole sheet.
    const floraRng = master.fork('flora');
    const flora = ST.plantColor(floraRng, mood, 'windowBox');
    site.trees.forEach(function (t) {
      t.col = ST.plantColor(floraRng, mood, t.type);
    });
    site.planters.forEach(function (b) {
      b.col = ST.plantColor(floraRng, mood, b.tall ? 'flowering' : 'windowBox');
    });
    site.planting.forEach(function (g) {
      g.col = ST.plantColor(floraRng, mood, 'grass');
    });

    return {
      seed: String(seed),
      mood: mood,
      density: density,
      monumentality: monumentality,
      penName: penName,
      accents: accents,
      flora: flora,
      kind: mass.kind,
      mass: mass,
      frontIdx: frontIdx,
      roofs: roofs,
      faces: faces,
      gear: gear,
      site: site
    };
  }

  // --- render ---------------------------------------------------------------

  /** All world points the drawing must fit inside its rect. */
  function fitPoints(plan) {
    const pts = [];
    plan.mass.prisms.forEach(function (pr, i) {
      M.prismCorners(pr).forEach(function (c) { pts.push(c); });
      const roof = plan.roofs[i];
      if (roof && roof.variant) {
        const top = pr.y0 + pr.h + roof.h;
        // the overhang counts: a deep eave has to stay inside the sheet too
        const ov = roof.ov || 0;
        const x0 = pr.x - ov, x1 = pr.x + pr.w + ov;
        const z0 = pr.z - ov, z1 = pr.z + pr.d + ov;
        pts.push(G.v3(x0, top, z0));
        pts.push(G.v3(x1, top, z1));
        pts.push(G.v3(x1, top, z0));
        pts.push(G.v3(x0, top, z1));
        if (ov > 0) {
          const eave = pr.y0 + pr.h;
          pts.push(G.v3(x0, eave, z0));
          pts.push(G.v3(x1, eave, z1));
        }
      }
    });
    plan.gear.forEach(function (g) {
      pts.push(G.v3(g.x, g.y + g.size * 8, g.z));
    });
    plan.site.trees.forEach(function (t) {
      pts.push(G.v3(t.x, t.h * 1.35, t.z));
      pts.push(G.v3(t.x, 0, t.z));
    });
    (plan.site.planters || []).forEach(function (b) {
      pts.push(G.v3(b.x, b.h * 2.2, b.z));
      pts.push(G.v3(b.x, 0, b.z + b.d / 2));
    });
    return pts;
  }

  /** Camera fitted to `rect`; identical design, any framing. */
  function fitCam(plan, view, rect) {
    const probe = G.makeCam({ yaw: view.yaw, pitch: view.pitch, scale: 1, cx: 0, cy: 0 });
    const pts = fitPoints(plan).map(function (p) { return G.project(p, probe); });
    const bb = G.bbox(pts);
    const pad = rect.pad == null ? 0.1 : rect.pad;
    const availW = rect.w * (1 - pad * 2);
    const availH = rect.h * (1 - pad * 2);
    const scale = Math.max(0.5, Math.min(availW / bb.w, availH / bb.h));
    const cx = rect.x + rect.w / 2 - ((bb.x0 + bb.x1) / 2) * scale;
    const cy = rect.y + rect.h / 2 - ((bb.y0 + bb.y1) / 2) * scale;
    return G.makeCam({ yaw: view.yaw, pitch: view.pitch, scale: scale, cx: cx, cy: cy });
  }

  function drawFace(ctx, R, plan, pens, pr, i, dir, lod, palette) {
    const key = i + ':' + dir;
    const cfg = plan.faces[key];
    if (!cfg) return;
    const face = R.facesOf[i].filter(function (f) { return f.dir === dir; })[0];
    if (!face) return;
    const frame = M.makeFrame(face, R.cam);
    if (!(frame.pxWidth > 3) || !(frame.pxHeight > 3)) return;

    const rng = AD.rng.makeRng(plan.seed + ':draw:' + key);
    const p = {
      lod: lod,
      glassAccent: palette.glass,
      doorAccent: palette.door,
      vegAccent: palette.veg,
      signAccent: palette.sign,
      trimAccent: palette.trim,
      flora: plan.flora
    };

    if (R.opaqueWalls) {
      const q = frame.quad(0, 0, 1, 1);
      if (q && q.length === 4) {
        ctx.save();
        ctx.fillStyle = AD.style.paper.base;
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let qi = 1; qi < q.length; qi++) ctx.lineTo(q[qi].x, q[qi].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // shaded side: hatch the whole wall first, then cut the openings into it
    if (cfg.shadow && lod >= 0.45 && cfg.system !== 'solid') {
      S.hatchQuad(ctx, pens.hatch, frame.quad(0.01, 0.005, 0.99, 0.995), {
        angle: cfg.hatchAngle, gap: cfg.hatchGap * 1.6, lod: lod,
        alpha: 0.34, max: lod >= 0.8 ? 18 : 8
      });
    }

    // A side wall can be narrow in projection while still being a perfectly
    // visible façade. Do not discard its windows at the old 26px cutoff.
    const small = frame.pxWidth < 12 || frame.pxHeight < 12;
    if (small) {
      // too small to read: a couple of ticks stand in for a façade
      if (lod >= 0.4 && frame.pxWidth > 8 && frame.pxHeight > 8) {
        S.hatchQuad(ctx, pens.hatch, frame.quad(0.12, 0.1, 0.88, 0.9), {
          angle: 1.5, gap: 0.3, lod: lod, alpha: 0.5, max: 4
        });
      }
      return;
    }

    const sys = AD.facade.systems[cfg.system] || AD.facade.systems.grid;
    sys(ctx, frame, pens, rng, p, cfg);

    // ornament layers — each has the LOD below which it stops being legible
    const ORN_LOD = {
      cornice: 0.45, pilasters: 0.6, signage: 0.55, ac: 0.7,
      chevrons: 0.55, brackets: 0.5, sunshade: 0.5, latticeBand: 0.55
    };
    for (let k = 0; k < cfg.ornaments.length; k++) {
      const o = cfg.ornaments[k];
      const orn = AD.details.ornament[o.type];
      if (orn) {
        if (lod >= (ORN_LOD[o.type] == null ? 0.6 : ORN_LOD[o.type])) {
          orn(ctx, frame, pens, rng, p, o);
        }
      } else if ((o.type === 'vine' || o.type === 'trellis') && lod >= 0.6) {
        // a climber keeps the colours it was planted with
        const pv = o.col ? Object.assign({}, p, { flora: o.col }) : p;
        AD.details.vegetation[o.type](ctx, frame, pens, rng, pv, o);
      }
    }
  }

  /**
   * render(ctx, plan, view, rect, lod)
   * view: {yaw, pitch}; rect: {x, y, w, h, pad}; lod: 1 single, ~0.5 plate.
   */
  function render(ctx, plan, view, rect, lod) {
    lod = lod == null ? 1 : lod;
    const cam = fitCam(plan, view, rect);
    const preset = ST.pens[plan.penName] || ST.pens.dryNib;
    const pens = S.makePens(AD.rng.makeRng(plan.seed + ':pen'), preset);
    const P = function (x, y, z) { return G.project({ x: x, y: y, z: z }, cam); };
    const R = {
      P: P, cam: cam, pxPerUnit: cam.scale,
      opaqueWalls: !!view.opaqueWalls,
      facesOf: plan.mass.prisms.map(function (pr) { return M.prismFaces(pr); })
    };
    const palette = plan.accents;
    const p = {
      lod: lod, glassAccent: palette.glass, doorAccent: palette.door,
      vegAccent: palette.veg, signAccent: palette.sign, trimAccent: palette.trim,
      flora: plan.flora
    };
    const siteRng = AD.rng.makeRng(plan.seed + ':drawsite');

    // --- ground -------------------------------------------------------------
    AD.site.groundLine(ctx, R, pens, siteRng, p, {
      reach: plan.site.reach, z: plan.site.frontZ * 0.4
    });
    if (plan.site.sidewalk) {
      AD.site.sidewalk(ctx, R, pens, siteRng, p, { reach: plan.site.reach, z: plan.site.frontZ });
    }
    AD.site.groundShadow(ctx, R, pens, siteRng, p, {
      prism: plan.mass.prisms[plan.frontIdx], length: plan.site.shadowLen
    });

    // planting sorted against the building's own depth, so what stands behind
    // the volumes is drawn before them and what stands in front is drawn after
    const depthOf = function (x, z) { return G.rot({ x: x, y: 0, z: z }, cam).z; };
    const frontDepth = depthOf(0, plan.mass.footprint.d / 2);
    const trees = plan.site.trees.map(function (t) {
      return { t: t, depth: depthOf(t.x, t.z) };
    });
    const patches = (plan.site.planting || []).map(function (g) {
      return { g: g, depth: depthOf(g.x, g.z) };
    });
    trees.forEach(function (e) {
      if (e.depth >= frontDepth) return;
      AD.site.trees[e.t.type](ctx, R, pens, siteRng, p, e.t);
    });
    patches.forEach(function (e) {
      if (e.depth >= frontDepth) return;
      AD.site.groundPlanting(ctx, R, pens, siteRng, p, e.g);
    });

    if (plan.site.plinth) {
      AD.site.plinth(ctx, R, pens, siteRng, p, {
        prism: plan.mass.prisms[plan.site.plinth.prismIndex],
        steps: plan.site.plinth.steps,
        grow: plan.site.plinth.grow,
        rise: plan.site.plinth.rise
      });
    }

    // --- volumes, far to near ----------------------------------------------
    const order = plan.mass.prisms.map(function (pr, i) {
      return { i: i, z: G.rot(M.prismCentroid(pr), cam).z };
    }).sort(function (a, b) { return a.z - b.z; });

    order.forEach(function (entry) {
      const i = entry.i;
      const pr = plan.mass.prisms[i];

      // visible wall faces, far to near
      const vis = [];
      WALL_DIRS.forEach(function (dir) {
        const face = R.facesOf[i].filter(function (f) { return f.dir === dir; })[0];
        const fv = G.facing(face.normal, cam);
        if (fv <= 0.05) return;
        const c = M.prismCentroid(pr);
        const nrm = face.normal;
        const cz = G.rot({
          x: c.x + nrm.x * pr.w * 0.5, y: c.y, z: c.z + nrm.z * pr.d * 0.5
        }, cam).z;
        vis.push({ dir: dir, z: cz });
      });
      vis.sort(function (a, b) { return a.z - b.z; });
      vis.forEach(function (v) {
        drawFace(ctx, R, plan, pens, pr, i, v.dir, lod, palette);
      });

      // silhouette re-stroke — this is what makes the volume pop off the page
      const hull = G.convexHull(M.prismCorners(pr).map(function (c) {
        return P(c.x, c.y, c.z);
      }));
      if (hull.length >= 3) {
        S.strokePoly(ctx, pens.outline, hull, {
          lod: lod, close: true, width: 1.05, overshootPx: 3.2
        });
      }

      // roof
      const roof = plan.roofs[i];
      if (roof && roof.variant) {
        const rr = AD.rng.makeRng(plan.seed + ':roof:' + i);
        const RR = { P: P, cam: cam, prism: pr, roof: roof, pxPerUnit: cam.scale, opaqueWalls: !!view.opaqueWalls };
        AD.roofs.roofs[roof.variant](ctx, RR, pens, rr, p);
      }

      // gear standing on this volume
      plan.gear.forEach(function (g, gi) {
        if (g.prism !== i) return;
        const gr = AD.rng.makeRng(plan.seed + ':gear:' + gi);
        AD.details.gear[g.type](ctx, R, pens, gr, p, g);
      });
    });

    // --- foreground ---------------------------------------------------------
    // planters sit against the wall, so they always belong over the volumes
    (plan.site.planters || []).forEach(function (b) {
      AD.site.planter(ctx, R, pens, siteRng, p, b);
    });
    patches.forEach(function (e) {
      if (e.depth < frontDepth) return;
      AD.site.groundPlanting(ctx, R, pens, siteRng, p, e.g);
    });
    trees.forEach(function (e) {
      if (e.depth < frontDepth) return;
      AD.site.trees[e.t.type](ctx, R, pens, siteRng, p, e.t);
    });

    if (plan.site.fence) {
      const f = plan.site.fence;
      const fw = plan.mass.footprint.w / 2;
      AD.site.fence(ctx, R, pens, siteRng, p, {
        x0: f.side * fw + f.side * 0.5, x1: f.side * (fw + f.length),
        z0: plan.mass.footprint.d / 2 + 0.4, z1: plan.mass.footprint.d / 2 + 0.4,
        spacing: f.spacing, length: f.length, height: f.height, rails: f.rails
      });
    }

    if (plan.site.birds && lod >= 0.5) {
      AD.site.birds(ctx, pens, siteRng, p, {
        x0: rect.x, y0: rect.y, w: rect.w, h: rect.h * 0.5
      });
    }

    return cam;
  }

  NS.generate = generate;
  NS.render = render;
  NS.fitCam = fitCam;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.building = NS;
})();

// js/el-facade.js — façade systems.
//
// A façade system lays out a whole wall: floor bands, bays, the window variant
// repeated across them, and (on a ground floor that faces the street) a door.
// Real buildings repeat their windows, so a façade picks ONE window variant and
// sticks to it — with a small chance of a different one on the top floor.
// Everything is laid out in the frame's UV space, so it foreshortens for free.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const OP = AD.openings;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /** Cell rectangles in UV for a rows × cols grid inside the given margins. */
  function layout(cfg) {
    const mu = cfg.marginU, mb = cfg.marginBottom, mt = cfg.marginTop;
    const rows = Math.max(1, cfg.floors);
    const cols = Math.max(1, cfg.bays);
    const usableV = Math.max(0.12, 1 - mb - mt);
    const usableU = Math.max(0.12, 1 - mu * 2);
    const bandH = usableV / rows;
    const cellW = usableU / cols;
    return {
      rows: rows, cols: cols, bandH: bandH, cellW: cellW,
      u0: function (c) { return mu + c * cellW; },
      v0: function (r) { return mb + r * bandH; }
    };
  }

  function drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant) {
    const wu = cfg.winW, wv = cfg.winH;
    const u0 = L.u0(c) + L.cellW * (1 - wu) * 0.5;
    const v0 = L.v0(r) + L.bandH * (1 - wv) * 0.45;
    const q = frame.quad(u0, v0, u0 + L.cellW * wu, v0 + L.bandH * wv);
    const fn = OP.windows[variant] || OP.windows.plain;
    fn(ctx, q, pens, rng, p);
    return q;
  }

  function drawDoor(ctx, frame, pens, rng, p, cfg, L) {
    const c = clamp(cfg.doorBay, 0, L.cols - 1);
    const wu = Math.min(0.94, cfg.doorW);
    const u0 = L.u0(c) + L.cellW * (1 - wu) * 0.5;
    const v0 = cfg.marginBottom * 0.15;
    const v1 = L.v0(0) + L.bandH * cfg.doorH;
    if (v1 - v0 < 0.03) return;
    const q = frame.quad(u0, v0, u0 + L.cellW * wu, v1);
    const fn = OP.doors[cfg.door] || OP.doors.plain;
    fn(ctx, q, pens, rng, p);
  }

  function floorLine(ctx, frame, pens, p, v) {
    S.strokePath(ctx, pens.hair, [frame.pt(0.01, v), frame.pt(0.99, v)],
      { lod: p.lod, alpha: 0.6 });
  }

  // --- systems --------------------------------------------------------------

  /** Regular window grid — the workhorse. */
  function facadeGrid(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    for (let r = 0; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        if (r === 0 && cfg.hasDoor && c === cfg.doorBay) continue;
        if (cfg.skip && rng.chance(cfg.skip)) continue;
        drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
      }
      if (cfg.floorLines && r > 0 && p.lod >= 0.6) floorLine(ctx, frame, pens, p, L.v0(r));
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Ground-floor arcade / colonnade with a grid above. */
  function facadeArcade(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const arcCols = Math.max(2, Math.min(7, Math.round(L.cols * (cfg.arcadeDense ? 1.4 : 1))));
    const vTop = L.v0(1) - L.bandH * 0.08;
    const vBase = cfg.marginBottom * 0.2;
    const usableU = 1 - cfg.marginU * 2;
    const cw = usableU / arcCols;

    for (let c = 0; c < arcCols; c++) {
      const u0 = cfg.marginU + c * cw + cw * 0.08;
      const u1 = cfg.marginU + (c + 1) * cw - cw * 0.08;
      const q = frame.quad(u0, vBase, u1, vTop);
      if (!S.quadOk(q)) continue;
      const vSpring = 0.55;
      // pier + arch
      S.strokePath(ctx, pens.detail, [S.quadPt(q, 0, 0), S.quadPt(q, 0, vSpring)], { lod: p.lod });
      S.strokePath(ctx, pens.detail, [S.quadPt(q, 1, 0), S.quadPt(q, 1, vSpring)], { lod: p.lod });
      S.strokePath(ctx, pens.detail, OP.uvArc(q, 0, 1, vSpring, 1, p.lod >= 0.6 ? 13 : 6),
        { lod: p.lod });
      if (p.lod >= 0.55) {
        // shadow inside the opening
        S.hatchQuad(ctx, pens.hatch, S.subQuad(q, 0.1, 0.05, 0.9, vSpring * 0.95), {
          angle: -1.1, gap: 0.22, lod: p.lod, alpha: 0.5, max: 7
        });
      }
    }
    if (p.lod >= 0.5) floorLine(ctx, frame, pens, p, vTop + L.bandH * 0.04);

    for (let r = 1; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
      }
    }
  }

  /** Mostly blind wall — used on shadow sides and blank flanks. */
  function facadeSolid(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    if (p.lod >= 0.45) {
      S.hatchQuad(ctx, pens.hatch, frame.quad(0.02, 0.01, 0.98, 0.99), {
        angle: cfg.hatchAngle, gap: cfg.hatchGap, lod: p.lod,
        alpha: 0.55, max: p.lod >= 0.8 ? 22 : 10
      });
    }
    // a handful of scattered openings so it doesn't read as a slab of hatching
    const n = Math.max(0, Math.round(cfg.sparse * L.rows * L.cols));
    for (let i = 0; i < n; i++) {
      const r = rng.int(0, L.rows - 1);
      const c = rng.int(0, L.cols - 1);
      drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, cfg.win);
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Grid with balconies on a share of the openings. */
  function facadeBalconyGrid(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const DET = AD.details;
    for (let r = 0; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        if (r === 0 && cfg.hasDoor && c === cfg.doorBay) continue;
        drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
        if (r > 0 && rng.chance(cfg.balconyP)) {
          const wu = Math.min(0.98, cfg.winW * 1.35);
          const u0 = L.u0(c) + L.cellW * (1 - wu) * 0.5;
          const v0 = L.v0(r) + L.bandH * 0.02;
          const q = frame.quad(u0, v0, u0 + L.cellW * wu, v0 + L.bandH * 0.34);
          DET.railings[cfg.railing](ctx, q, pens, rng, p);
          if (rng.chance(0.25) && p.lod >= 0.7) {
            DET.vegetation.windowBox(ctx, q, pens, rng, p);
          }
        }
      }
      if (cfg.floorLines && r > 0 && p.lod >= 0.6) floorLine(ctx, frame, pens, p, L.v0(r));
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Horizontal ribbon glazing — the tower/modern look. */
  function facadeRibbon(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    for (let r = 0; r < L.rows; r++) {
      if (r === 0 && cfg.hasDoor) continue;
      const v0 = L.v0(r) + L.bandH * 0.22;
      const v1 = L.v0(r) + L.bandH * 0.74;
      const q = frame.quad(cfg.marginU, v0, 1 - cfg.marginU, v1);
      if (!S.quadOk(q)) continue;
      OP.windows.ribbon(ctx, q, pens, rng, {
        lod: p.lod, glassAccent: p.glassAccent, doorAccent: p.doorAccent
      });
      if (p.lod >= 0.65 && cfg.mullions) {
        const n = Math.max(2, L.cols);
        for (let c = 1; c < n; c++) {
          S.strokePath(ctx, pens.hair,
            [S.quadPt(q, c / n, 0.05), S.quadPt(q, c / n, 0.95)], { lod: p.lod });
        }
      }
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  NS.systems = {
    grid: facadeGrid,
    arcade: facadeArcade,
    solid: facadeSolid,
    balconyGrid: facadeBalconyGrid,
    ribbonGrid: facadeRibbon
  };
  NS.systemNames = ['grid', 'arcade', 'solid', 'balconyGrid', 'ribbonGrid'];
  NS.layout = layout;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.facade = NS;
})();

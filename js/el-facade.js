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
        const q = drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
        if (cfg.windowBoxP && p.lod >= 0.7 && rng.chance(cfg.windowBoxP)) {
          AD.details.vegetation.windowBox(ctx, q, pens, rng, p);
        }
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
          (DET.railings[cfg.railing] || DET.railings.bars)(ctx, q, pens, rng, p);
          if (p.lod >= 0.7 && rng.chance(cfg.windowBoxP == null ? 0.25 : cfg.windowBoxP)) {
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

  // --- shared pieces --------------------------------------------------------

  /** A pierced screen laid into any projected quad. Also used as an ornament. */
  function latticePanel(ctx, q, pens, rng, p, opts) {
    opts = opts || {};
    if (!S.quadOk(q)) return;
    const size = S.quadSize(q);
    const cols = opts.cols || clamp(Math.round(size.w / 11), 2, 9);
    const rows = opts.rows || clamp(Math.round(size.h / 11), 1, 7);
    if (opts.accent && p.lod >= 0.5) S.accentFill(ctx, q, opts.accent, rng, { alpha: 0.2 });
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: opts.width || 0.85 });
    if (p.lod < 0.45) return;
    for (let c = 1; c < cols; c++) {
      S.strokePath(ctx, pens.hair, [S.quadPt(q, c / cols, 0.03), S.quadPt(q, c / cols, 0.97)],
        { lod: p.lod, alpha: 0.85 });
    }
    for (let r = 1; r < rows; r++) {
      S.strokePath(ctx, pens.hair, [S.quadPt(q, 0.02, r / rows), S.quadPt(q, 0.98, r / rows)],
        { lod: p.lod, alpha: 0.85 });
    }
    if (opts.diagonal && p.lod >= 0.65) {
      for (let c = 0; c < cols; c++) {
        S.strokePath(ctx, pens.hair,
          [S.quadPt(q, c / cols, 0.02), S.quadPt(q, (c + 1) / cols, 0.98)],
          { lod: p.lod, alpha: 0.5 });
        S.strokePath(ctx, pens.hair,
          [S.quadPt(q, c / cols, 0.98), S.quadPt(q, (c + 1) / cols, 0.02)],
          { lod: p.lod, alpha: 0.5 });
      }
    }
  }

  /** Post with a simple cap, base and head bracket — verandas and colonnades. */
  function post(ctx, frame, pens, p, u, v0, v1, w, opts) {
    opts = opts || {};
    const q = frame.quad(u - w / 2, v0, u + w / 2, v1);
    if (!S.quadOk(q)) return null;
    S.strokePath(ctx, pens.detail, [S.quadPt(q, 0, 0), S.quadPt(q, 0, 1)], { lod: p.lod, width: 0.85 });
    S.strokePath(ctx, pens.detail, [S.quadPt(q, 1, 0), S.quadPt(q, 1, 1)], { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.55) {
      // capital and base blocks
      S.strokePoly(ctx, pens.hair, S.subQuad(q, -0.55, 0.94, 1.55, 1), { lod: p.lod });
      S.strokePoly(ctx, pens.hair, S.subQuad(q, -0.45, 0, 1.45, 0.05), { lod: p.lod });
    }
    if (opts.bracket && p.lod >= 0.65) {
      const b = opts.bracketSpan == null ? 0.7 : opts.bracketSpan;
      S.strokePath(ctx, pens.hair,
        [S.quadPt(q, -b, 0.99), S.quadPt(q, 0.1, 0.9)], { lod: p.lod, alpha: 0.9 });
      S.strokePath(ctx, pens.hair,
        [S.quadPt(q, 1 + b, 0.99), S.quadPt(q, 0.9, 0.9)], { lod: p.lod, alpha: 0.9 });
    }
    if (opts.flute && p.lod >= 0.7) {
      S.strokePath(ctx, pens.hair, [S.quadPt(q, 0.5, 0.07), S.quadPt(q, 0.5, 0.92)],
        { lod: p.lod, alpha: 0.6 });
    }
    return q;
  }

  /** Windows for the floors above a special ground storey. */
  function upperFloors(ctx, frame, pens, rng, p, cfg, L, from) {
    for (let r = from; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        if (cfg.skip && rng.chance(cfg.skip)) continue;
        drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
      }
      if (cfg.floorLines && r > from && p.lod >= 0.6) floorLine(ctx, frame, pens, p, L.v0(r));
    }
  }

  // --- new systems ----------------------------------------------------------

  /** Deep shaded veranda across the ground storey, rooms above. */
  function facadeVeranda(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const vTop = L.rows > 1 ? L.v0(1) - L.bandH * 0.1 : 0.86;
    const vBase = cfg.marginBottom * 0.2;
    const bays = clamp(cfg.posts || L.cols, 2, 8);

    // shade behind the posts, then the opening it belongs to
    if (p.lod >= 0.45) {
      S.hatchQuad(ctx, pens.hatch, frame.quad(cfg.marginU * 0.6, vBase, 1 - cfg.marginU * 0.6, vTop), {
        angle: -1.1, gap: 0.11, lod: p.lod, alpha: 0.42, max: p.lod >= 0.8 ? 14 : 6
      });
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);

    const u0 = cfg.marginU * 0.5, u1 = 1 - cfg.marginU * 0.5;
    const step = (u1 - u0) / bays;
    const railV = vBase + (vTop - vBase) * 0.34;
    for (let i = 0; i <= bays; i++) {
      const u = u0 + step * i;
      post(ctx, frame, pens, p, u, vBase, vTop, 0.022, { bracket: true, bracketSpan: 0.9 });
      if (i < bays && p.lod >= 0.5) {
        const q = frame.quad(u + 0.012, vBase + (vTop - vBase) * 0.06, u + step - 0.012, railV);
        if (S.quadOk(q)) {
          (AD.details.railings[cfg.railing] || AD.details.railings.bars)(ctx, q, pens, rng, p);
          if (p.lod >= 0.7 && rng.chance(cfg.potP == null ? 0.25 : cfg.potP)) {
            AD.details.vegetation.potted(ctx, q, pens, rng, p);
          }
        }
      }
    }
    // veranda floor and its head beam
    S.strokePath(ctx, pens.detail, [frame.pt(u0 - 0.03, vBase), frame.pt(u1 + 0.03, vBase)],
      { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [frame.pt(u0 - 0.04, vTop), frame.pt(u1 + 0.04, vTop)],
      { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.55) {
      S.strokePath(ctx, pens.hair,
        [frame.pt(u0 - 0.04, vTop + 0.016), frame.pt(u1 + 0.04, vTop + 0.016)],
        { lod: p.lod, alpha: 0.8 });
    }
    upperFloors(ctx, frame, pens, rng, p, cfg, L, 1);
  }

  /** Window bands veiled by pierced screens. */
  function facadeScreened(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const screenP = cfg.screenP == null ? 0.5 : cfg.screenP;
    for (let r = 0; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      const screened = rng.chance(screenP) && !(r === 0 && cfg.hasDoor);
      if (screened) {
        // one continuous screen spanning the bays of this floor
        const v0 = L.v0(r) + L.bandH * 0.16;
        const v1 = L.v0(r) + L.bandH * 0.84;
        const q = frame.quad(cfg.marginU, v0, 1 - cfg.marginU, v1);
        latticePanel(ctx, q, pens, rng, p, {
          diagonal: cfg.screenDiagonal, accent: p.glassAccent,
          cols: clamp(L.cols * 3, 3, 12)
        });
        if (p.lod >= 0.6) {
          // framing rails top and bottom
          S.strokePath(ctx, pens.hair, [frame.pt(cfg.marginU * 0.8, v1 + 0.012),
            frame.pt(1 - cfg.marginU * 0.8, v1 + 0.012)], { lod: p.lod, alpha: 0.8 });
        }
      } else {
        for (let c = 0; c < L.cols; c++) {
          if (r === 0 && cfg.hasDoor && c === cfg.doorBay) continue;
          drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c, variant);
        }
      }
      if (cfg.floorLines && r > 0 && p.lod >= 0.6) floorLine(ctx, frame, pens, p, L.v0(r));
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Exposed frame: posts, rails, braced panels, small openings between. */
  function facadeTimberFrame(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const braceP = cfg.braceP == null ? 0.35 : cfg.braceP;
    const postW = 0.018;

    for (let r = 0; r < L.rows; r++) {
      const v0 = L.v0(r), v1 = L.v0(r) + L.bandH;
      // sill and head rails for the storey
      S.strokePath(ctx, pens.detail, [frame.pt(0.02, v0), frame.pt(0.98, v0)],
        { lod: p.lod, width: 0.85 });
      for (let c = 0; c <= L.cols; c++) {
        const u = clamp(L.u0(c), 0.02, 0.98);
        const q = frame.quad(u - postW / 2, v0, u + postW / 2, v1);
        if (!S.quadOk(q)) continue;
        S.strokePath(ctx, pens.detail, [S.quadPt(q, 0, 0), S.quadPt(q, 0, 1)],
          { lod: p.lod, width: 0.8 });
        if (p.lod >= 0.5) {
          S.strokePath(ctx, pens.hair, [S.quadPt(q, 1, 0), S.quadPt(q, 1, 1)], { lod: p.lod, alpha: 0.8 });
        }
      }
      for (let c = 0; c < L.cols; c++) {
        const panel = frame.quad(L.u0(c) + postW, v0 + L.bandH * 0.06,
          L.u0(c) + L.cellW - postW, v1 - L.bandH * 0.06);
        if (!S.quadOk(panel)) continue;
        const isDoor = r === 0 && cfg.hasDoor && c === cfg.doorBay;
        if (!isDoor && p.lod >= 0.6 && rng.chance(braceP)) {
          // diagonal brace across the panel
          const dir = rng.chance(0.5);
          S.strokePath(ctx, pens.hair, [
            S.quadPt(panel, dir ? 0.04 : 0.96, 0.04), S.quadPt(panel, dir ? 0.96 : 0.04, 0.96)
          ], { lod: p.lod, alpha: 0.9, width: 1.1 });
        } else if (!isDoor && p.lod >= 0.55 && rng.chance(0.3)) {
          // boarded infill
          S.hatchQuad(ctx, pens.hatch, panel, {
            angle: 1.5, gap: 0.2, lod: p.lod, alpha: 0.35, max: 6
          });
        }
        if (!isDoor && rng.chance(0.72)) {
          drawWindow(ctx, frame, pens, rng, p, cfg, L, r, c,
            (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win);
        }
      }
    }
    S.strokePath(ctx, pens.detail, [frame.pt(0.02, L.v0(L.rows)), frame.pt(0.98, L.v0(L.rows))],
      { lod: p.lod, width: 0.85 });
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Vertical piers with recessed spandrels between them. */
  function facadeDecoBanded(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const piers = clamp(L.cols + 1, 3, 9);
    const uA = cfg.marginU * 0.7, uB = 1 - cfg.marginU * 0.7;
    const step = (uB - uA) / (piers - 1);
    const vTop = L.v0(L.rows);

    for (let i = 0; i < piers; i++) {
      const u = uA + step * i;
      const q = frame.quad(u - 0.016, cfg.marginBottom * 0.4, u + 0.016, vTop + 0.02);
      if (!S.quadOk(q)) continue;
      S.strokePath(ctx, pens.detail, [S.quadPt(q, 0, 0), S.quadPt(q, 0, 1)], { lod: p.lod, width: 0.9 });
      S.strokePath(ctx, pens.detail, [S.quadPt(q, 1, 0), S.quadPt(q, 1, 1)], { lod: p.lod, width: 0.9 });
      if (p.lod >= 0.6) {
        // the pier steps up past the wall head
        S.strokePoly(ctx, pens.hair, S.subQuad(q, 0.15, 1, 0.85, 1.03), { lod: p.lod });
        S.strokePath(ctx, pens.hair, [S.quadPt(q, 0.5, 0.04), S.quadPt(q, 0.5, 0.99)],
          { lod: p.lod, alpha: 0.5 });
      }
    }

    // glazing strips between the piers, with a spandrel under each
    for (let i = 0; i < piers - 1; i++) {
      for (let r = 0; r < L.rows; r++) {
        if (r === 0 && cfg.hasDoor) continue;
        const u0 = uA + step * i + 0.02, u1 = uA + step * (i + 1) - 0.02;
        const v0 = L.v0(r) + L.bandH * 0.26, v1 = L.v0(r) + L.bandH * 0.86;
        const q = frame.quad(u0, v0, u1, v1);
        if (!S.quadOk(q)) continue;
        const fn = OP.windows[cfg.win] && cfg.win !== 'ribbon' ? OP.windows[cfg.win] : OP.windows.ribbon;
        fn(ctx, q, pens, rng, p);
        if (p.lod >= 0.65) {
          const sp = frame.quad(u0, L.v0(r) + L.bandH * 0.04, u1, v0 - L.bandH * 0.04);
          if (S.quadOk(sp)) {
            if (p.trimAccent) S.accentFill(ctx, sp, p.trimAccent, rng, { alpha: 0.2 });
            S.strokePoly(ctx, pens.hair, sp, { lod: p.lod });
            const n = rng.int(2, 4);
            for (let k = 0; k < n; k++) {
              const a = 0.1 + (0.8 * k) / n, b = a + 0.8 / n;
              S.strokePath(ctx, pens.hair, [
                S.quadPt(sp, a, 0.2), S.quadPt(sp, (a + b) / 2, 0.8), S.quadPt(sp, b, 0.2)
              ], { lod: p.lod, alpha: 0.75 });
            }
          }
        }
      }
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Free-standing columns carrying an entablature, rooms behind. */
  function facadeColonnade(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const storeys = L.rows > 3 ? 2 : 1;
    const vTop = Math.min(0.9, L.v0(storeys) - L.bandH * 0.08);
    const vBase = cfg.marginBottom * 0.2;
    const cols = clamp(cfg.posts || L.cols + 1, 3, 9);

    if (p.lod >= 0.45) {
      S.hatchQuad(ctx, pens.hatch, frame.quad(cfg.marginU * 0.6, vBase, 1 - cfg.marginU * 0.6, vTop), {
        angle: -1.05, gap: 0.1, lod: p.lod, alpha: 0.4, max: p.lod >= 0.8 ? 14 : 6
      });
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);

    const uA = cfg.marginU * 0.6, uB = 1 - cfg.marginU * 0.6;
    const step = (uB - uA) / (cols - 1);
    for (let i = 0; i < cols; i++) {
      post(ctx, frame, pens, p, uA + step * i, vBase, vTop, 0.03, { flute: true });
    }
    // entablature: architrave, frieze line, dentils
    S.strokePath(ctx, pens.detail, [frame.pt(uA - 0.04, vTop), frame.pt(uB + 0.04, vTop)],
      { lod: p.lod, width: 1 });
    S.strokePath(ctx, pens.detail,
      [frame.pt(uA - 0.045, vTop + 0.022), frame.pt(uB + 0.045, vTop + 0.022)],
      { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.65) {
      const n = clamp(Math.round(frame.pxWidth / 14), 4, 24);
      for (let i = 0; i <= n; i++) {
        const u = uA + ((uB - uA) * i) / n;
        S.strokePath(ctx, pens.hair, [frame.pt(u, vTop + 0.004), frame.pt(u, vTop + 0.02)],
          { lod: p.lod, alpha: 0.75 });
      }
    }
    upperFloors(ctx, frame, pens, rng, p, cfg, L, storeys);
  }

  /** Alternating corner blocks up both edges of a wall. */
  function quoins(ctx, frame, pens, rng, p, opts) {
    opts = opts || {};
    const w = opts.w == null ? 0.05 : opts.w;
    const n = clamp(Math.round(frame.pxHeight / 24), 3, 14);
    for (let i = 0; i < n; i++) {
      const v0 = 0.015 + (0.955 * i) / n;
      const v1 = 0.015 + (0.955 * (i + 1)) / n - 0.004;
      const ww = i % 2 === 0 ? w : w * 0.6;
      [[0.006, 0.006 + ww], [0.994 - ww, 0.994]].forEach(function (uu) {
        const q = frame.quad(uu[0], v0, uu[1], v1);
        if (!S.quadOk(q)) return;
        S.strokePoly(ctx, pens.hair, q, { lod: p.lod, width: 0.85, alpha: 0.9 });
      });
    }
  }

  // --- new systems, second wave --------------------------------------------

  /** Timber bay divisions: panelled dado, glazed middle, lattice transom band. */
  function facadeLatticeBay(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    const postW = 0.014;
    for (let r = 0; r < L.rows; r++) {
      const v0 = L.v0(r), v1 = v0 + L.bandH;
      // head and sill beams for the storey
      S.strokePath(ctx, pens.detail, [frame.pt(0.02, v1 - L.bandH * 0.03), frame.pt(0.98, v1 - L.bandH * 0.03)],
        { lod: p.lod, width: 0.95 });
      S.strokePath(ctx, pens.detail, [frame.pt(0.03, v0 + L.bandH * 0.02), frame.pt(0.97, v0 + L.bandH * 0.02)],
        { lod: p.lod, width: 0.8 });

      for (let c = 0; c <= L.cols; c++) {
        const u = clamp(L.u0(c), 0.02, 0.98);
        const q = frame.quad(u - postW / 2, v0 + L.bandH * 0.02, u + postW / 2, v1 - L.bandH * 0.03);
        if (!S.quadOk(q)) continue;
        if (p.trimAccent && p.lod >= 0.5) S.accentFill(ctx, q, p.trimAccent, rng, { alpha: 0.2 });
        S.strokePath(ctx, pens.detail, [S.quadPt(q, 0, 0), S.quadPt(q, 0, 1)], { lod: p.lod, width: 0.85 });
        S.strokePath(ctx, pens.detail, [S.quadPt(q, 1, 0), S.quadPt(q, 1, 1)], { lod: p.lod, width: 0.85 });
        if (p.lod >= 0.62) {
          // short braces easing the post into the beam
          S.strokePath(ctx, pens.hair,
            [S.quadPt(q, 0, 0.9), S.quadPt(q, -2.2, 0.99)], { lod: p.lod, alpha: 0.85 });
          S.strokePath(ctx, pens.hair,
            [S.quadPt(q, 1, 0.9), S.quadPt(q, 3.2, 0.99)], { lod: p.lod, alpha: 0.85 });
        }
      }

      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        const isDoor = r === 0 && cfg.hasDoor && c === cfg.doorBay;
        const u0 = L.u0(c) + postW, u1 = L.u0(c) + L.cellW - postW;
        // lattice transom band across the head of the bay
        const tq = frame.quad(u0, v0 + L.bandH * 0.72, u1, v0 + L.bandH * 0.94);
        if (S.quadOk(tq)) {
          latticePanel(ctx, tq, pens, rng, p, {
            diagonal: cfg.screenDiagonal, accent: p.glassAccent, rows: 1,
            cols: clamp(Math.round(S.quadSize(tq).w / 9), 2, 8), width: 0.75
          });
        }
        if (isDoor) continue;
        // panelled dado under the opening
        const dq = frame.quad(u0, v0 + L.bandH * 0.04, u1, v0 + L.bandH * 0.24);
        if (S.quadOk(dq) && p.lod >= 0.5) {
          S.strokePoly(ctx, pens.hair, dq, { lod: p.lod, width: 0.8 });
          S.hatchQuad(ctx, pens.hatch, S.subQuad(dq, 0.06, 0.12, 0.94, 0.88), {
            angle: 1.5, gap: 0.24, lod: p.lod, alpha: 0.35, max: 5
          });
        }
        const wq = frame.quad(u0, v0 + L.bandH * 0.27, u1, v0 + L.bandH * 0.69);
        if (!S.quadOk(wq)) continue;
        (OP.windows[variant] || OP.windows.lattice)(ctx, wq, pens, rng, p);
      }
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  /** Plastered wall: quoined corners, string courses, shuttered bays. */
  function facadeStuccoBays(ctx, frame, pens, rng, p, cfg) {
    const L = layout(cfg);
    if (p.lod >= 0.5) quoins(ctx, frame, pens, rng, p, { w: 0.045 });
    // a faint float texture, well under the line work
    if (p.lod >= 0.7 && rng.chance(0.7)) {
      S.hatchQuad(ctx, pens.hatch, frame.quad(0.08, 0.04, 0.92, 0.96), {
        angle: cfg.hatchAngle, gap: 0.26, lod: p.lod, alpha: 0.16, max: 6
      });
    }
    for (let r = 0; r < L.rows; r++) {
      const variant = (r === L.rows - 1 && cfg.altWin) ? cfg.altWin : cfg.win;
      for (let c = 0; c < L.cols; c++) {
        if (r === 0 && cfg.hasDoor && c === cfg.doorBay) continue;
        if (cfg.skip && rng.chance(cfg.skip)) continue;
        const wu = cfg.winW, wv = cfg.winH;
        const u0 = L.u0(c) + L.cellW * (1 - wu) * 0.5;
        const v0 = L.v0(r) + L.bandH * (1 - wv) * 0.45;
        const q = frame.quad(u0, v0, u0 + L.cellW * wu, v0 + L.bandH * wv);
        if (!S.quadOk(q)) continue;
        // rendered surround standing slightly proud of the wall
        if (p.lod >= 0.6) {
          S.strokePoly(ctx, pens.hair, S.subQuad(q, -0.16, -0.06, 1.16, 1.12),
            { lod: p.lod, width: 0.8, alpha: 0.85 });
        }
        (OP.windows[variant] || OP.windows.shuttered)(ctx, q, pens, rng, p);
        if (cfg.windowBoxP && p.lod >= 0.65 && r > 0 && rng.chance(cfg.windowBoxP)) {
          AD.details.vegetation.windowBox(ctx, q, pens, rng, p);
        }
      }
      // string course between the storeys
      if (r > 0 && p.lod >= 0.5) {
        const v = L.v0(r) - L.bandH * 0.04;
        S.strokePath(ctx, pens.detail, [frame.pt(0.01, v), frame.pt(0.99, v)],
          { lod: p.lod, width: 0.85 });
        S.strokePath(ctx, pens.hair, [frame.pt(0.02, v - 0.012), frame.pt(0.98, v - 0.012)],
          { lod: p.lod, alpha: 0.7 });
      }
    }
    if (cfg.hasDoor) drawDoor(ctx, frame, pens, rng, p, cfg, L);
  }

  NS.systems = {
    grid: facadeGrid,
    arcade: facadeArcade,
    solid: facadeSolid,
    balconyGrid: facadeBalconyGrid,
    ribbonGrid: facadeRibbon,
    veranda: facadeVeranda,
    screened: facadeScreened,
    timberFrame: facadeTimberFrame,
    decoBanded: facadeDecoBanded,
    colonnade: facadeColonnade,
    latticeBay: facadeLatticeBay,
    stuccoBays: facadeStuccoBays
  };
  NS.systemNames = ['grid', 'arcade', 'solid', 'balconyGrid', 'ribbonGrid',
    'veranda', 'screened', 'timberFrame', 'decoBanded', 'colonnade',
    'latticeBay', 'stuccoBays'];
  NS.layout = layout;
  NS.latticePanel = latticePanel;
  NS.post = post;
  NS.quoins = quoins;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.facade = NS;
})();

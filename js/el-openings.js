// js/el-openings.js — windows and doors.
//
// Contract: every element is a pure function of (ctx, quad, pens, rng, p).
// `quad` is [bottom-left, bottom-right, top-right, top-left] in canvas space,
// already projected; all internal layout happens in the quad's own UV so the
// element foreshortens with its wall automatically.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const Q = S.quadPt;

  function sub(q, u0, v0, u1, v1) { return S.subQuad(q, u0, v0, u1, v1); }
  function tiny(q, min) {
    const s = S.quadSize(q);
    return s.w < (min || 6) || s.h < (min || 6);
  }

  // arc across the top of a quad, in UV space, mapped through the quad
  function uvArc(q, u0, u1, vBase, vTop, segs) {
    const pts = [];
    const n = segs || 12;
    const uc = (u0 + u1) / 2, ur = (u1 - u0) / 2;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI - (Math.PI * i) / n;
      pts.push(Q(q, uc + Math.cos(a) * ur, vBase + Math.sin(a) * (vTop - vBase)));
    }
    return pts;
  }

  function glass(ctx, q, pens, rng, p, uv) {
    if (!p || p.lod < 0.5) return;
    const inner = uv ? sub(q, uv[0], uv[1], uv[2], uv[3]) : q;
    if (p.glassAccent) S.accentFill(ctx, inner, p.glassAccent, rng, { alpha: 0.24 });
    if (p.lod >= 0.6 && rng.chance(0.72)) {
      S.hatchQuad(ctx, pens.hatch, sub(inner === q ? q : inner, 0.05, 0.5, 0.95, 0.95), {
        angle: -0.95, gap: 0.3, lod: p.lod, alpha: 0.5, max: 5
      });
    }
  }

  function sill(ctx, q, pens, rng, p) {
    const a = Q(q, -0.12, 0), b = Q(q, 1.12, 0);
    S.strokePath(ctx, pens.detail, [a, b], { lod: p.lod, width: 1.05 });
    if (p.lod >= 0.7 && rng.chance(0.5)) {
      S.strokePath(ctx, pens.hair, [Q(q, -0.1, -0.09), Q(q, 1.1, -0.09)], { lod: p.lod });
    }
  }

  // --- windows --------------------------------------------------------------

  function windowPlain(ctx, q, pens, rng, p) {
    if (tiny(q, 4)) return;
    glass(ctx, q, pens, rng, p);
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    if (p.lod >= 0.5) sill(ctx, q, pens, rng, p);
    if (p.lod >= 0.7 && rng.chance(0.4)) {
      // lintel tick
      S.strokePath(ctx, pens.hair, [Q(q, -0.08, 1.06), Q(q, 1.08, 1.06)], { lod: p.lod });
    }
  }

  function windowSash(ctx, q, pens, rng, p) {
    if (tiny(q, 5)) return;
    glass(ctx, q, pens, rng, p);
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    const mv = rng.range(0.44, 0.56);
    const mu = rng.range(0.45, 0.55);
    S.strokePath(ctx, pens.detail, [Q(q, mu, -0.03), Q(q, mu, 1.03)],
      { lod: p.lod, width: 0.72 });
    S.strokePath(ctx, pens.detail, [Q(q, -0.03, mv), Q(q, 1.03, mv)],
      { lod: p.lod, width: 0.72 });
    if (p.lod >= 0.6) sill(ctx, q, pens, rng, p);
  }

  function windowArched(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) return;
    const vBase = rng.range(0.55, 0.7);
    glass(ctx, q, pens, rng, p, [0.03, 0.03, 0.97, vBase]);
    // jambs + sill
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 0, vBase)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, 1, 0), Q(q, 1, vBase)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, -0.05, 0), Q(q, 1.05, 0)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, uvArc(q, 0, 1, vBase, 1, p.lod >= 0.6 ? 14 : 7),
      { lod: p.lod });
    if (p.lod >= 0.65) {
      // keystone + impost ticks
      S.strokePath(ctx, pens.hair, [Q(q, 0.5, 0.98), Q(q, 0.5, 1.08)], { lod: p.lod });
      if (rng.chance(0.5)) {
        S.strokePath(ctx, pens.hair, [Q(q, -0.08, vBase), Q(q, 1.08, vBase)], { lod: p.lod });
      }
    }
  }

  function windowShuttered(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { windowPlain(ctx, q, pens, rng, p); return; }
    const sw = rng.range(0.2, 0.3);
    const core = sub(q, sw, 0, 1 - sw, 1);
    glass(ctx, core, pens, rng, p);
    S.strokePoly(ctx, pens.detail, core, { lod: p.lod });
    const left = sub(q, 0, 0.02, sw, 0.98);
    const right = sub(q, 1 - sw, 0.02, 1, 0.98);
    [left, right].forEach(function (sq) {
      S.strokePoly(ctx, pens.detail, sq, { lod: p.lod, width: 0.85 });
      if (p.lod >= 0.55) {
        S.hatchQuad(ctx, pens.hatch, sq, {
          angle: 0.02, gap: 0.2, lod: p.lod, max: 5, alpha: 0.75
        });
      }
    });
    if (p.lod >= 0.5) sill(ctx, q, pens, rng, p);
  }

  function windowRound(ctx, q, pens, rng, p) {
    const size = S.quadSize(q);
    if (size.w < 5 || size.h < 5) return;
    const c = Q(q, 0.5, 0.5);
    const rx = Math.hypot(Q(q, 1, 0.5).x - Q(q, 0, 0.5).x, Q(q, 1, 0.5).y - Q(q, 0, 0.5).y) / 2;
    const ry = Math.hypot(Q(q, 0.5, 1).x - Q(q, 0.5, 0).x, Q(q, 0.5, 1).y - Q(q, 0.5, 0).y) / 2;
    const f = rng.range(0.82, 0.98);
    const r = Math.min(rx, ry) * f;
    if (p.glassAccent && p.lod >= 0.5) {
      S.accentFill(ctx, sub(q, 0.15, 0.15, 0.85, 0.85), p.glassAccent, rng, { alpha: 0.22 });
    }
    // the opening is square in wall space, so it foreshortens into an ellipse
    S.strokeEllipse(ctx, pens.detail, c.x, c.y, rx * f, ry * f, { lod: p.lod });
    if (p.lod >= 0.6 && rng.chance(0.7)) {
      S.strokePath(ctx, pens.hair, [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }], { lod: p.lod });
      S.strokePath(ctx, pens.hair, [{ x: c.x, y: c.y - r }, { x: c.x, y: c.y + r }], { lod: p.lod });
    }
  }

  function windowRibbon(ctx, q, pens, rng, p) {
    if (tiny(q, 5)) return;
    glass(ctx, q, pens, rng, p);
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    const n = rng.int(3, 5);
    if (p.lod >= 0.45) {
      for (let i = 1; i < n; i++) {
        const u = i / n;
        S.strokePath(ctx, pens.detail, [Q(q, u, 0.02), Q(q, u, 0.98)],
          { lod: p.lod, width: 0.6 });
      }
    }
    if (p.lod >= 0.6) sill(ctx, q, pens, rng, p);
  }

  // --- alternative arch profiles -------------------------------------------
  // Both are drawn in the quad's UV, so they foreshorten with the wall like
  // everything else. `uvHorseshoe` bulges past its springing line and tucks
  // back in; `uvPointed` rises to an apex on two swung curves.
  function uvHorseshoe(q, u0, u1, vSpring, vTop, segs, ext) {
    const n = segs || 14;
    const e = ext == null ? 0.42 : ext;
    const uc = (u0 + u1) / 2, ur = (u1 - u0) / 2;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI + e) - ((Math.PI + 2 * e) * i) / n;
      pts.push(Q(q, uc + Math.cos(a) * ur, vSpring + Math.sin(a) * (vTop - vSpring)));
    }
    return pts;
  }

  function uvPointed(q, u0, u1, vSpring, vTop, segs) {
    const n = Math.max(4, segs || 12);
    const uc = (u0 + u1) / 2;
    const pts = [];
    const half = function (uA, cU) {
      const out = [];
      for (let i = 0; i <= n / 2; i++) {
        const t = i / (n / 2);
        const it = 1 - t;
        out.push(Q(q,
          it * it * uA + 2 * t * it * cU + t * t * uc,
          it * it * vSpring + 2 * t * it * vTop + t * t * vTop));
      }
      return out;
    };
    const left = half(u0, u0);
    const right = half(u1, u1).reverse();
    for (let i = 0; i < left.length; i++) pts.push(left[i]);
    for (let i = 1; i < right.length; i++) pts.push(right[i]);
    return pts;
  }

  /** Springing point of a horseshoe arch, in UV — where the jamb meets it. */
  function horseshoeFoot(vSpring, vTop, ext) {
    const e = ext == null ? 0.42 : ext;
    return { v: vSpring - Math.sin(e) * (vTop - vSpring), du: Math.cos(e) };
  }

  // --- lattice / screened opening ------------------------------------------
  // A pierced screen across the opening: fine grid, sometimes crossed on the
  // diagonal. Reads as shoji, jali or mashrabiya depending on its company.
  function windowLattice(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { windowPlain(ctx, q, pens, rng, p); return; }
    const inner = sub(q, 0.06, 0.05, 0.94, 0.95);
    if (p.glassAccent) S.accentFill(ctx, inner, p.glassAccent, rng, { alpha: 0.18 });
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    if (p.lod >= 0.45) S.strokePoly(ctx, pens.hair, inner, { lod: p.lod });
    if (p.lod < 0.5) return;
    const size = S.quadSize(q);
    const cols = Math.max(2, Math.min(5, Math.round(size.w / 9)));
    const rows = Math.max(2, Math.min(6, Math.round(size.h / 9)));
    const diagonal = rng.chance(0.35) && p.lod >= 0.7;
    for (let c = 1; c < cols; c++) {
      S.strokePath(ctx, pens.hair, [Q(inner, c / cols, 0), Q(inner, c / cols, 1)],
        { lod: p.lod, alpha: 0.9 });
    }
    for (let r = 1; r < rows; r++) {
      S.strokePath(ctx, pens.hair, [Q(inner, 0, r / rows), Q(inner, 1, r / rows)],
        { lod: p.lod, alpha: 0.9 });
    }
    if (diagonal) {
      for (let c = 0; c < cols; c++) {
        S.strokePath(ctx, pens.hair,
          [Q(inner, c / cols, 0), Q(inner, (c + 1) / cols, 1)], { lod: p.lod, alpha: 0.55 });
        S.strokePath(ctx, pens.hair,
          [Q(inner, c / cols, 1), Q(inner, (c + 1) / cols, 0)], { lod: p.lod, alpha: 0.55 });
      }
    }
    if (p.lod >= 0.55) sill(ctx, q, pens, rng, p);
  }

  // --- horseshoe / pointed arched opening in a rectangular surround --------
  function windowHorseshoe(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { windowArched(ctx, q, pens, rng, p); return; }
    const pointed = rng.chance(0.42);
    const vSpring = rng.range(0.5, 0.62);
    const segs = p.lod >= 0.6 ? 16 : 8;
    const foot = pointed ? { v: vSpring, du: 1 } : horseshoeFoot(vSpring, 1);
    const uL = 0.5 - 0.5 * foot.du, uR = 0.5 + 0.5 * foot.du;

    glass(ctx, q, pens, rng, p, [0.08, 0.04, 0.92, vSpring]);
    S.strokePath(ctx, pens.detail, [Q(q, uL, 0), Q(q, uL, foot.v)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, uR, 0), Q(q, uR, foot.v)], { lod: p.lod });
    S.strokePath(ctx, pens.detail,
      pointed ? uvPointed(q, 0, 1, vSpring, 0.97, segs)
        : uvHorseshoe(q, 0, 1, vSpring, 0.97, segs),
      { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, -0.06, 0), Q(q, 1.06, 0)], { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.55) {
      // rectangular surround band around the arch
      S.strokePath(ctx, pens.hair, [
        Q(q, -0.12, 0), Q(q, -0.12, 1.08), Q(q, 1.12, 1.08), Q(q, 1.12, 0)
      ], { lod: p.lod, alpha: 0.75 });
    }
    if (p.lod >= 0.65 && rng.chance(0.6)) {
      // voussoir ticks radiating from the arch
      const n = rng.int(4, 7);
      for (let i = 1; i < n; i++) {
        const a = Math.PI - (Math.PI * i) / n;
        const uu = 0.5 + Math.cos(a) * 0.5, vv = vSpring + Math.sin(a) * (0.97 - vSpring);
        S.strokePath(ctx, pens.hair,
          [Q(q, uu, vv), Q(q, 0.5 + (uu - 0.5) * 1.16, vSpring + (vv - vSpring) * 1.16)],
          { lod: p.lod, alpha: 0.7 });
      }
    }
  }

  // --- stepped-head bay, vertical emphasis ----------------------------------
  function windowDecoBay(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { windowPlain(ctx, q, pens, rng, p); return; }
    const shoulder = rng.range(0.1, 0.17);
    const head = 1 - shoulder;
    const body = sub(q, 0.12, 0, 0.88, head);
    glass(ctx, body, pens, rng, p);
    S.strokePoly(ctx, pens.detail, body, { lod: p.lod });
    // stepped head: two shoulders climbing to a narrow crown
    const steps = rng.int(2, 3);
    for (let i = 1; i <= steps; i++) {
      const inset = 0.12 + (0.26 * i) / steps;
      const v0 = head + (shoulder * (i - 1)) / steps;
      const v1 = head + (shoulder * i) / steps;
      S.strokePoly(ctx, pens.detail, sub(q, inset, v0, 1 - inset, v1),
        { lod: p.lod, width: 0.8 });
    }
    if (p.lod >= 0.6) {
      // fluting either side, and a mullion pair
      [0.04, 0.92].forEach(function (u) {
        S.strokePath(ctx, pens.hair, [Q(q, u, 0.02), Q(q, u, head + shoulder * 0.4)],
          { lod: p.lod, alpha: 0.8 });
        S.strokePath(ctx, pens.hair, [Q(q, u + 0.035, 0.02), Q(q, u + 0.035, head)],
          { lod: p.lod, alpha: 0.6 });
      });
      S.strokePath(ctx, pens.hair, [Q(body, 0.5, 0.03), Q(body, 0.5, 0.97)], { lod: p.lod });
    }
    if (p.lod >= 0.5) sill(ctx, q, pens, rng, p);
  }

  // --- hooded opening: a projecting sunshade over the head ------------------
  function windowHooded(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { windowPlain(ctx, q, pens, rng, p); return; }
    const vHead = rng.range(0.72, 0.82);
    const body = sub(q, 0, 0, 1, vHead);
    glass(ctx, body, pens, rng, p);
    S.strokePoly(ctx, pens.detail, body, { lod: p.lod });
    if (p.lod >= 0.5) {
      const bars = rng.int(1, 3);
      for (let i = 1; i <= bars; i++) {
        S.strokePath(ctx, pens.hair, [Q(body, i / (bars + 1), 0.04), Q(body, i / (bars + 1), 0.96)],
          { lod: p.lod, alpha: 0.85 });
      }
    }
    // the hood itself: a wide slab oversailing the opening
    const hood = [Q(q, -0.2, vHead + 0.02), Q(q, 1.2, vHead + 0.02),
      Q(q, 1.12, 1.02), Q(q, -0.12, 1.02)];
    if (p.trimAccent) S.accentFill(ctx, hood, p.trimAccent, rng, { alpha: 0.24 });
    S.strokePoly(ctx, pens.detail, hood, { lod: p.lod, width: 0.9 });
    if (p.lod >= 0.6) {
      S.hatchQuad(ctx, pens.hatch, hood, {
        angle: 1.5, gap: 0.13, lod: p.lod, alpha: 0.45, max: 8
      });
      // brackets carrying it
      [0.05, 0.95].forEach(function (u) {
        S.strokePath(ctx, pens.hair,
          [Q(q, u, vHead - 0.12), Q(q, u < 0.5 ? -0.16 : 1.16, vHead + 0.03)],
          { lod: p.lod, alpha: 0.85 });
      });
    }
    if (p.lod >= 0.5) sill(ctx, q, pens, rng, p);
  }

  // --- small-paned timber window with a board frame -------------------------
  function windowTimberPane(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { windowPlain(ctx, q, pens, rng, p); return; }
    const core = sub(q, 0.1, 0.08, 0.9, 0.9);
    glass(ctx, core, pens, rng, p);
    // board casing: outer frame doubled
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    S.strokePoly(ctx, pens.detail, core, { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.5) {
      const cols = rng.int(2, 3), rows = rng.int(2, 3);
      for (let c = 1; c < cols; c++) {
        S.strokePath(ctx, pens.hair, [Q(core, c / cols, 0.02), Q(core, c / cols, 0.98)],
          { lod: p.lod, alpha: 0.9 });
      }
      for (let r = 1; r < rows; r++) {
        S.strokePath(ctx, pens.hair, [Q(core, 0.02, r / rows), Q(core, 0.98, r / rows)],
          { lod: p.lod, alpha: 0.9 });
      }
    }
    if (p.lod >= 0.6) {
      // head board and a deep sill shelf
      S.strokePath(ctx, pens.detail, [Q(q, -0.14, 1.03), Q(q, 1.14, 1.03)],
        { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.hair, [Q(q, -0.14, 1.03), Q(q, -0.1, 0.96)], { lod: p.lod });
      S.strokePath(ctx, pens.hair, [Q(q, 1.14, 1.03), Q(q, 1.1, 0.96)], { lod: p.lod });
    }
    sill(ctx, q, pens, rng, p);
  }

  // --- ice-ray lattice ------------------------------------------------------
  // An irregular net of struts spanning the opening, sometimes set inside a
  // circular frame. A garden-pavilion cue: geometric, never figurative.
  function windowIceRay(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { windowLattice(ctx, q, pens, rng, p); return; }
    const circular = rng.chance(0.35);
    const inner = sub(q, 0.09, 0.08, 0.91, 0.92);
    if (p.glassAccent) S.accentFill(ctx, inner, p.glassAccent, rng, { alpha: 0.18 });
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    if (p.lod >= 0.45) S.strokePoly(ctx, pens.hair, inner, { lod: p.lod, alpha: 0.85 });
    if (circular && p.lod >= 0.5) {
      const c = Q(inner, 0.5, 0.5);
      const rx = Math.hypot(Q(inner, 1, 0.5).x - Q(inner, 0, 0.5).x,
        Q(inner, 1, 0.5).y - Q(inner, 0, 0.5).y) / 2;
      const ry = Math.hypot(Q(inner, 0.5, 1).x - Q(inner, 0.5, 0).x,
        Q(inner, 0.5, 1).y - Q(inner, 0.5, 0).y) / 2;
      S.strokeEllipse(ctx, pens.detail, c.x, c.y, rx * 0.96, ry * 0.96, { lod: p.lod });
    }
    if (p.lod < 0.55) return;

    // a point at parameter t around the opening's perimeter (t in [0, 4))
    const edge = function (t) {
      const e = ((Math.floor(t) % 4) + 4) % 4;
      const f = t - Math.floor(t);
      if (e === 0) return Q(inner, f, 0);
      if (e === 1) return Q(inner, 1, f);
      if (e === 2) return Q(inner, 1 - f, 1);
      return Q(inner, 0, 1 - f);
    };
    const struts = rng.int(4, 7);
    const mids = [];
    for (let i = 0; i < struts; i++) {
      const t0 = rng.range(0, 4);
      const t1 = t0 + rng.range(1.15, 2.6);
      const a = edge(t0), b = edge(t1);
      S.strokePath(ctx, pens.hair, [a, b], { lod: p.lod, alpha: 0.9, filament: 0 });
      mids.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    // short connectors knitting the struts into a cracked-ice net
    if (p.lod < 0.7) return;
    for (let i = 1; i < mids.length; i++) {
      if (!rng.chance(0.65)) continue;
      S.strokePath(ctx, pens.hair, [mids[i - 1], mids[i]], { lod: p.lod, alpha: 0.75, filament: 0 });
    }
  }

  // --- casement with folded-back shutters -----------------------------------
  function windowCasement(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { windowShuttered(ctx, q, pens, rng, p); return; }
    const sw = rng.range(0.15, 0.23);
    const core = sub(q, sw, 0.03, 1 - sw, 0.96);
    glass(ctx, core, pens, rng, p);
    S.strokePoly(ctx, pens.detail, core, { lod: p.lod });
    // transom over a pair of casements
    const vT = rng.range(0.68, 0.78);
    S.strokePath(ctx, pens.detail, [Q(core, -0.02, vT), Q(core, 1.02, vT)],
      { lod: p.lod, width: 0.75 });
    S.strokePath(ctx, pens.detail, [Q(core, 0.5, 0), Q(core, 0.5, vT)],
      { lod: p.lod, width: 0.72 });
    if (p.lod >= 0.6) {
      S.strokePath(ctx, pens.hair, [Q(core, 0.02, vT * 0.5), Q(core, 0.98, vT * 0.5)],
        { lod: p.lod, alpha: 0.8 });
    }
    // the shutters, folded flat against the wall either side
    [[0, sw], [1 - sw, 1]].forEach(function (uu, i) {
      const leaf = sub(q, uu[0], 0.02, uu[1], 0.97);
      if (!S.quadOk(leaf)) return;
      if (p.trimAccent && p.lod >= 0.5) S.accentFill(ctx, leaf, p.trimAccent, rng, { alpha: 0.2 });
      S.strokePoly(ctx, pens.detail, leaf, { lod: p.lod, width: 0.85 });
      if (p.lod >= 0.55) {
        S.hatchQuad(ctx, pens.hatch, sub(leaf, 0.12, 0.06, 0.88, 0.94), {
          angle: 0.02, gap: 0.16, lod: p.lod, max: 7, alpha: 0.7
        });
        S.strokePath(ctx, pens.hair, [Q(leaf, 0.05, 0.5), Q(leaf, 0.95, 0.5)], { lod: p.lod });
      }
      if (p.lod >= 0.7) {
        // hinge pins on the outer stile
        const u = i === 0 ? -0.06 : 1.06;
        [0.2, 0.8].forEach(function (v) {
          S.strokePath(ctx, pens.hair, [Q(leaf, i === 0 ? 0 : 1, v), Q(leaf, u, v)],
            { lod: p.lod, alpha: 0.85 });
        });
      }
    });
    // deep sill on two brackets
    const shelf = [Q(q, -0.16, -0.1), Q(q, 1.16, -0.1), Q(q, 1.1, 0.02), Q(q, -0.1, 0.02)];
    S.strokePoly(ctx, pens.detail, shelf, { lod: p.lod, width: 0.9 });
    if (p.lod >= 0.65) {
      [0.12, 0.88].forEach(function (u) {
        S.strokePath(ctx, pens.hair, [Q(q, u, -0.1), Q(q, u < 0.5 ? u + 0.06 : u - 0.06, -0.19)],
          { lod: p.lod, alpha: 0.8 });
      });
    }
  }

  // --- trabeated: heavy lintel on slightly tapering jambs -------------------
  function windowTrabeated(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { windowPlain(ctx, q, pens, rng, p); return; }
    const taper = rng.range(0.03, 0.075);
    const vHead = rng.range(0.82, 0.88);
    const opening = [
      Q(q, 0.04, 0), Q(q, 0.96, 0),
      Q(q, 0.96 - taper, vHead), Q(q, 0.04 + taper, vHead)
    ];
    if (!S.quadOk(opening)) { windowPlain(ctx, q, pens, rng, p); return; }
    if (p.glassAccent && p.lod >= 0.5) S.accentFill(ctx, opening, p.glassAccent, rng, { alpha: 0.22 });
    if (p.lod >= 0.55) {
      S.hatchQuad(ctx, pens.hatch, S.subQuad(opening, 0.06, 0.45, 0.94, 0.94), {
        angle: -0.95, gap: 0.28, lod: p.lod, alpha: 0.5, max: 5
      });
    }
    S.strokePoly(ctx, pens.detail, opening, { lod: p.lod });
    // lintel block, oversailing both jambs, with a fillet under it
    const lintel = [Q(q, -0.14, vHead), Q(q, 1.14, vHead), Q(q, 1.12, 1.02), Q(q, -0.12, 1.02)];
    if (p.trimAccent && p.lod >= 0.5) S.accentFill(ctx, lintel, p.trimAccent, rng, { alpha: 0.2 });
    S.strokePoly(ctx, pens.detail, lintel, { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.6) {
      S.strokePath(ctx, pens.hair, [Q(q, -0.12, vHead + 0.05), Q(q, 1.12, vHead + 0.05)],
        { lod: p.lod, alpha: 0.8 });
    }
    // sill block
    const sillQ = [Q(q, -0.12, -0.09), Q(q, 1.12, -0.09), Q(q, 1.06, 0.01), Q(q, -0.06, 0.01)];
    S.strokePoly(ctx, pens.detail, sillQ, { lod: p.lod, width: 0.9 });
    if (p.lod >= 0.7 && rng.chance(0.5)) {
      S.strokePath(ctx, pens.hair, [Q(q, -0.06, -0.13), Q(q, 1.06, -0.13)], { lod: p.lod, alpha: 0.7 });
    }
  }

  NS.windows = {
    plain: windowPlain,
    sash: windowSash,
    arched: windowArched,
    shuttered: windowShuttered,
    round: windowRound,
    ribbon: windowRibbon,
    lattice: windowLattice,
    horseshoe: windowHorseshoe,
    decoBay: windowDecoBay,
    hooded: windowHooded,
    timberPane: windowTimberPane,
    iceRay: windowIceRay,
    casement: windowCasement,
    trabeated: windowTrabeated
  };
  NS.windowNames = ['plain', 'sash', 'arched', 'shuttered', 'round', 'ribbon',
    'lattice', 'horseshoe', 'decoBay', 'hooded', 'timberPane',
    'iceRay', 'casement', 'trabeated'];

  // --- doors ----------------------------------------------------------------

  function stepTicks(ctx, q, pens, rng, p) {
    if (p.lod < 0.5) return;
    const n = rng.int(1, 3);
    for (let i = 1; i <= n; i++) {
      const o = 0.05 * i;
      S.strokePath(ctx, pens.hair,
        [Q(q, -0.15 - o * 0.6, -o), Q(q, 1.15 + o * 0.6, -o)], { lod: p.lod });
    }
  }

  function doorPlain(ctx, q, pens, rng, p) {
    if (tiny(q, 5)) return;
    if (p.doorAccent) S.accentFill(ctx, q, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    if (p.lod >= 0.55) {
      S.strokePoly(ctx, pens.hair, sub(q, 0.15, 0.1, 0.85, 0.82), { lod: p.lod });
      const knob = Q(q, 0.82, 0.45);
      S.strokeEllipse(ctx, pens.hair, knob.x, knob.y, 1.5, 1.5, { lod: p.lod });
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  function doorArched(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { doorPlain(ctx, q, pens, rng, p); return; }
    const vBase = rng.range(0.6, 0.74);
    if (p.doorAccent) S.accentFill(ctx, sub(q, 0, 0, 1, vBase), p.doorAccent, rng, {});
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 0, vBase)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, 1, 0), Q(q, 1, vBase)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, uvArc(q, 0, 1, vBase, 1, p.lod >= 0.6 ? 14 : 7),
      { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, -0.06, vBase), Q(q, 1.06, vBase)],
      { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.6) {
      // fanlight spokes
      const c = Q(q, 0.5, vBase);
      const n = rng.int(3, 5);
      for (let i = 1; i < n; i++) {
        const a = Math.PI - (Math.PI * i) / n;
        S.strokePath(ctx, pens.hair,
          [c, Q(q, 0.5 + Math.cos(a) * 0.48, vBase + Math.sin(a) * (1 - vBase) * 0.94)],
          { lod: p.lod });
      }
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  function doorDouble(ctx, q, pens, rng, p) {
    if (tiny(q, 6)) { doorPlain(ctx, q, pens, rng, p); return; }
    if (p.doorAccent) S.accentFill(ctx, q, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(q, 0.5, 0), Q(q, 0.5, 1)], { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.6) {
      S.strokePoly(ctx, pens.hair, sub(q, 0.08, 0.52, 0.44, 0.9), { lod: p.lod });
      S.strokePoly(ctx, pens.hair, sub(q, 0.56, 0.52, 0.92, 0.9), { lod: p.lod });
      const k1 = Q(q, 0.42, 0.42), k2 = Q(q, 0.58, 0.42);
      S.strokeEllipse(ctx, pens.hair, k1.x, k1.y, 1.3, 1.3, { lod: p.lod });
      S.strokeEllipse(ctx, pens.hair, k2.x, k2.y, 1.3, 1.3, { lod: p.lod });
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  function doorStorefront(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { doorPlain(ctx, q, pens, rng, p); return; }
    const vTop = 0.86;
    const body = sub(q, 0, 0, 1, vTop);
    if (p.glassAccent) S.accentFill(ctx, body, p.glassAccent, rng, { alpha: 0.2 });
    S.strokePoly(ctx, pens.detail, body, { lod: p.lod });
    if (p.lod >= 0.5) {
      S.hatchQuad(ctx, pens.hatch, sub(body, 0.04, 0.06, 0.96, 0.94), {
        angle: -0.9, gap: 0.16, lod: p.lod, alpha: 0.55, max: 8
      });
      // entry pair in the middle
      S.strokePoly(ctx, pens.detail, sub(body, 0.34, 0, 0.66, 0.86), { lod: p.lod, width: 0.8 });
      S.strokePath(ctx, pens.detail, [Q(body, 0.5, 0), Q(body, 0.5, 0.86)],
        { lod: p.lod, width: 0.6 });
    }
    // awning flap
    const aw = sub(q, -0.08, vTop, 1.08, 1);
    if (p.doorAccent) S.accentFill(ctx, aw, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, aw, { lod: p.lod });
    if (p.lod >= 0.6) {
      const n = rng.int(3, 6);
      for (let i = 1; i < n; i++) {
        S.strokePath(ctx, pens.hair, [Q(aw, i / n, 0), Q(aw, i / n, 1)], { lod: p.lod });
      }
    }
  }

  // --- recessed arched gateway in a rectangular surround --------------------
  function doorGateway(ctx, q, pens, rng, p) {
    if (tiny(q, 8)) { doorArched(ctx, q, pens, rng, p); return; }
    const pointed = rng.chance(0.5);
    const vSpring = rng.range(0.52, 0.64);
    const segs = p.lod >= 0.6 ? 16 : 8;
    const surround = sub(q, -0.1, 0, 1.1, 1.02);

    // the surround panel, then the opening cut into it
    S.strokePath(ctx, pens.detail, [Q(surround, 0, 0), Q(surround, 0, 1)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(surround, 1, 0), Q(surround, 1, 1)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(surround, -0.04, 1), Q(surround, 1.04, 1)], { lod: p.lod, width: 0.9 });

    const inner = sub(q, 0.14, 0, 0.86, 0.9);
    if (p.doorAccent) S.accentFill(ctx, sub(inner, 0.05, 0.02, 0.95, vSpring), p.doorAccent, rng, {});
    const foot = pointed ? { v: vSpring, du: 1 } : horseshoeFoot(vSpring, 0.98);
    const uL = 0.5 - 0.5 * foot.du, uR = 0.5 + 0.5 * foot.du;
    S.strokePath(ctx, pens.detail, [Q(inner, uL, 0), Q(inner, uL, foot.v)], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(inner, uR, 0), Q(inner, uR, foot.v)], { lod: p.lod });
    S.strokePath(ctx, pens.detail,
      pointed ? uvPointed(inner, 0, 1, vSpring, 0.98, segs)
        : uvHorseshoe(inner, 0, 1, vSpring, 0.98, segs),
      { lod: p.lod });
    if (p.lod >= 0.5) {
      // depth: the reveal reads as shade inside the opening
      S.hatchQuad(ctx, pens.hatch, sub(inner, 0.12, 0.04, 0.88, vSpring * 0.92), {
        angle: -1.15, gap: 0.2, lod: p.lod, alpha: 0.5, max: 8
      });
      S.strokePath(ctx, pens.hair, [Q(inner, 0.5, 0.04), Q(inner, 0.5, vSpring * 0.9)],
        { lod: p.lod, alpha: 0.8 });
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  // --- braced plank door under a hood board --------------------------------
  function doorPlank(ctx, q, pens, rng, p) {
    if (tiny(q, 5)) { doorPlain(ctx, q, pens, rng, p); return; }
    const leaf = sub(q, 0.04, 0, 0.96, 0.88);
    if (p.doorAccent) S.accentFill(ctx, leaf, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, leaf, { lod: p.lod });
    if (p.lod >= 0.5) {
      const planks = rng.int(3, 6);
      for (let i = 1; i < planks; i++) {
        S.strokePath(ctx, pens.hair, [Q(leaf, i / planks, 0.02), Q(leaf, i / planks, 0.98)],
          { lod: p.lod, alpha: 0.85 });
      }
      // ledges and a diagonal brace
      S.strokePath(ctx, pens.hair, [Q(leaf, 0.02, 0.22), Q(leaf, 0.98, 0.22)], { lod: p.lod });
      S.strokePath(ctx, pens.hair, [Q(leaf, 0.02, 0.78), Q(leaf, 0.98, 0.78)], { lod: p.lod });
      if (rng.chance(0.7)) {
        S.strokePath(ctx, pens.hair, [Q(leaf, 0.04, 0.24), Q(leaf, 0.96, 0.76)], { lod: p.lod });
      }
    }
    // hood board on two brackets
    const hood = [Q(q, -0.22, 0.9), Q(q, 1.22, 0.9), Q(q, 1.12, 1.02), Q(q, -0.12, 1.02)];
    if (p.trimAccent) S.accentFill(ctx, hood, p.trimAccent, rng, { alpha: 0.22 });
    S.strokePoly(ctx, pens.detail, hood, { lod: p.lod, width: 0.9 });
    if (p.lod >= 0.6) {
      S.strokePath(ctx, pens.hair, [Q(q, 0.02, 0.74), Q(q, -0.18, 0.9)], { lod: p.lod });
      S.strokePath(ctx, pens.hair, [Q(q, 0.98, 0.74), Q(q, 1.18, 0.9)], { lod: p.lod });
      const knob = Q(leaf, 0.88, 0.5);
      S.strokeEllipse(ctx, pens.hair, knob.x, knob.y, 1.4, 1.4, { lod: p.lod });
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  // --- stepped portal with a fluted leaf ------------------------------------
  function doorDecoPortal(ctx, q, pens, rng, p) {
    if (tiny(q, 7)) { doorPlain(ctx, q, pens, rng, p); return; }
    const rings = rng.int(2, 3);
    for (let i = 0; i < rings; i++) {
      const o = 0.06 * (rings - i);
      S.strokePath(ctx, pens.detail, [
        Q(q, -o, 0), Q(q, -o, 0.94 + o * 0.5), Q(q, 1 + o, 0.94 + o * 0.5), Q(q, 1 + o, 0)
      ], { lod: p.lod, width: i === rings - 1 ? 0.95 : 0.75 });
    }
    const leaf = sub(q, 0.1, 0, 0.9, 0.86);
    if (p.doorAccent) S.accentFill(ctx, leaf, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, leaf, { lod: p.lod });
    if (p.lod >= 0.55) {
      const n = rng.int(3, 6);
      for (let i = 1; i < n; i++) {
        S.strokePath(ctx, pens.hair, [Q(leaf, i / n, 0.04), Q(leaf, i / n, 0.96)],
          { lod: p.lod, alpha: 0.8 });
      }
      // chevron over the lintel
      const cs = rng.int(2, 4);
      for (let i = 0; i < cs; i++) {
        const u0 = 0.12 + (0.76 * i) / cs, u1 = u0 + 0.76 / cs;
        S.strokePath(ctx, pens.hair,
          [Q(q, u0, 0.88), Q(q, (u0 + u1) / 2, 0.95), Q(q, u1, 0.88)], { lod: p.lod, alpha: 0.85 });
      }
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  // --- circular garden opening ---------------------------------------------
  // A round doorway cut clean through a garden wall, with a rolled surround and
  // a paved threshold. Geometry only — no motifs, no symbols.
  function doorMoonGate(ctx, q, pens, rng, p) {
    if (tiny(q, 9)) { doorArched(ctx, q, pens, rng, p); return; }
    const size = S.quadSize(q);
    // the opening is a true circle on the wall, so take the smaller dimension
    const m = Math.min(size.w, size.h) * rng.range(0.9, 0.99);
    const fu = Math.min(1, m / Math.max(1e-6, size.w));
    const fv = Math.min(1, m / Math.max(1e-6, size.h));
    const v0 = 0.02;
    const sq = sub(q, 0.5 - fu / 2, v0, 0.5 + fu / 2, Math.min(1, v0 + fv));
    if (!S.quadOk(sq)) { doorArched(ctx, q, pens, rng, p); return; }
    const c = Q(sq, 0.5, 0.5);
    const rx = Math.hypot(Q(sq, 1, 0.5).x - Q(sq, 0, 0.5).x,
      Q(sq, 1, 0.5).y - Q(sq, 0, 0.5).y) / 2;
    const ry = Math.hypot(Q(sq, 0.5, 1).x - Q(sq, 0.5, 0).x,
      Q(sq, 0.5, 1).y - Q(sq, 0.5, 0).y) / 2;

    if (p.doorAccent && p.lod >= 0.5) {
      S.accentFill(ctx, sub(sq, 0.2, 0.08, 0.8, 0.6), p.doorAccent, rng, { alpha: 0.22 });
    }
    if (p.lod >= 0.5) {
      // the shade of the garden beyond, sitting low in the opening
      S.hatchQuad(ctx, pens.hatch, sub(sq, 0.18, 0.06, 0.82, 0.5), {
        angle: -1.1, gap: 0.22, lod: p.lod, alpha: 0.45, max: 7
      });
    }
    S.strokeEllipse(ctx, pens.detail, c.x, c.y, rx * 0.94, ry * 0.94, { lod: p.lod });
    S.strokeEllipse(ctx, pens.detail, c.x, c.y, rx, ry, { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.6) {
      // a rolled surround band, and the two wall panels it cuts through
      S.strokeEllipse(ctx, pens.hair, c.x, c.y, rx * 1.08, ry * 1.08,
        { lod: p.lod, alpha: 0.7 });
      S.strokePath(ctx, pens.hair, [Q(q, 0.02, 0.02), Q(q, 0.02, 0.9)], { lod: p.lod, alpha: 0.7 });
      S.strokePath(ctx, pens.hair, [Q(q, 0.98, 0.02), Q(q, 0.98, 0.9)], { lod: p.lod, alpha: 0.7 });
    }
    // threshold: a stone sill under the opening plus a few paving joints
    S.strokePath(ctx, pens.detail, [Q(q, -0.1, 0.01), Q(q, 1.1, 0.01)], { lod: p.lod, width: 0.9 });
    if (p.lod >= 0.6) {
      const n = rng.int(2, 4);
      for (let i = 1; i <= n; i++) {
        const u = i / (n + 1);
        S.strokePath(ctx, pens.hair, [Q(q, u, 0.01), Q(q, u + rng.range(-0.04, 0.04), -0.05)],
          { lod: p.lod, alpha: 0.65 });
      }
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  // --- doorway under a small pediment on pilasters --------------------------
  function doorPediment(ctx, q, pens, rng, p) {
    if (tiny(q, 8)) { doorDouble(ctx, q, pens, rng, p); return; }
    const vHead = rng.range(0.68, 0.76);
    const leaf = sub(q, 0.18, 0, 0.82, vHead - 0.03);
    if (p.doorAccent) S.accentFill(ctx, leaf, p.doorAccent, rng, {});
    S.strokePoly(ctx, pens.detail, leaf, { lod: p.lod });
    S.strokePath(ctx, pens.detail, [Q(leaf, 0.5, 0), Q(leaf, 0.5, 1)], { lod: p.lod, width: 0.75 });
    if (p.lod >= 0.6) {
      [[0.06, 0.46], [0.54, 0.94]].forEach(function (uu) {
        S.strokePoly(ctx, pens.hair, S.subQuad(leaf, uu[0], 0.55, uu[1], 0.92), { lod: p.lod });
        S.strokePoly(ctx, pens.hair, S.subQuad(leaf, uu[0], 0.08, uu[1], 0.45), { lod: p.lod });
      });
    }
    // flanking pilasters, each with a capital and a base block
    [[0.03, 0.15], [0.85, 0.97]].forEach(function (uu) {
      const pil = sub(q, uu[0], 0, uu[1], vHead);
      if (!S.quadOk(pil)) return;
      S.strokePath(ctx, pens.detail, [Q(pil, 0, 0), Q(pil, 0, 1)], { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.detail, [Q(pil, 1, 0), Q(pil, 1, 1)], { lod: p.lod, width: 0.85 });
      if (p.lod >= 0.6) {
        S.strokePoly(ctx, pens.hair, S.subQuad(pil, -0.3, 0.93, 1.3, 1), { lod: p.lod });
        S.strokePoly(ctx, pens.hair, S.subQuad(pil, -0.25, 0, 1.25, 0.05), { lod: p.lod });
        S.strokePath(ctx, pens.hair, [Q(pil, 0.5, 0.08), Q(pil, 0.5, 0.9)], { lod: p.lod, alpha: 0.55 });
      }
    });
    // entablature band, then the pediment sitting on it
    const band = [Q(q, -0.06, vHead), Q(q, 1.06, vHead), Q(q, 1.06, vHead + 0.06), Q(q, -0.06, vHead + 0.06)];
    if (p.trimAccent && p.lod >= 0.5) S.accentFill(ctx, band, p.trimAccent, rng, { alpha: 0.2 });
    S.strokePoly(ctx, pens.detail, band, { lod: p.lod, width: 0.9 });
    const apex = Q(q, 0.5, 1.0);
    const bl = Q(q, -0.08, vHead + 0.06), br = Q(q, 1.08, vHead + 0.06);
    S.strokePath(ctx, pens.detail, [bl, apex], { lod: p.lod, width: 0.95 });
    S.strokePath(ctx, pens.detail, [br, apex], { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.6) {
      const inset = function (a) {
        return { x: a.x + ((bl.x + br.x + apex.x) / 3 - a.x) * 0.22,
          y: a.y + ((bl.y + br.y + apex.y) / 3 - a.y) * 0.22 };
      };
      S.strokePath(ctx, pens.hair, [inset(bl), inset(apex), inset(br)],
        { lod: p.lod, alpha: 0.8, filament: 0 });
      const n = rng.int(4, 8);
      for (let i = 1; i < n; i++) {
        const u = i / n;
        S.strokePath(ctx, pens.hair, [Q(q, u, vHead + 0.005), Q(q, u, vHead + 0.03)],
          { lod: p.lod, alpha: 0.75 });
      }
    }
    stepTicks(ctx, q, pens, rng, p);
  }

  NS.doors = {
    plain: doorPlain,
    arched: doorArched,
    dbl: doorDouble,
    storefront: doorStorefront,
    gateway: doorGateway,
    plank: doorPlank,
    decoPortal: doorDecoPortal,
    moonGate: doorMoonGate,
    pedimentDoor: doorPediment
  };
  NS.doorNames = ['plain', 'arched', 'dbl', 'storefront', 'gateway', 'plank',
    'decoPortal', 'moonGate', 'pedimentDoor'];
  NS.uvArc = uvArc;
  NS.uvHorseshoe = uvHorseshoe;
  NS.uvPointed = uvPointed;
  NS.horseshoeFoot = horseshoeFoot;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.openings = NS;
})();

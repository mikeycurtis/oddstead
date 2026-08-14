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

  NS.windows = {
    plain: windowPlain,
    sash: windowSash,
    arched: windowArched,
    shuttered: windowShuttered,
    round: windowRound,
    ribbon: windowRibbon
  };
  NS.windowNames = ['plain', 'sash', 'arched', 'shuttered', 'round', 'ribbon'];

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

  NS.doors = {
    plain: doorPlain,
    arched: doorArched,
    dbl: doorDouble,
    storefront: doorStorefront
  };
  NS.doorNames = ['plain', 'arched', 'dbl', 'storefront'];
  NS.uvArc = uvArc;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.openings = NS;
})();

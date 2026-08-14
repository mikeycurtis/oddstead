// js/el-details.js — railings, roof gear, ornament, and vegetation on buildings.
//
// Two contracts live here:
//   * flat elements take a projected quad or Frame (railings, ornament, vines)
//   * roof gear takes {P, cam} plus a small 3D spec, because a chimney has to
//     stand on the roof and stay there through the orbit.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const G = AD.geom;
  const M = AD.massing;
  const Q = S.quadPt;

  // --- small 3D box, shared by chimney / tank / AC ---------------------------
  function box3(ctx, R, pens, rng, p, spec, opts) {
    opts = opts || {};
    const pr = M.prism(spec.x, spec.z, spec.w, spec.d, spec.y, spec.h);
    const faces = M.prismFaces(pr);
    const all = [];
    faces.forEach(function (f) {
      const fv = G.facing(f.normal, R.cam);
      if (fv <= 0.02) return;
      const q = [
        R.P(f.corners[0].x, f.corners[0].y, f.corners[0].z),
        R.P(f.corners[1].x, f.corners[1].y, f.corners[1].z),
        R.P(f.corners[2].x, f.corners[2].y, f.corners[2].z),
        R.P(f.corners[3].x, f.corners[3].y, f.corners[3].z)
      ];
      if (!S.quadOk(q)) return;
      all.push({ q: q, dir: f.dir, fv: fv });
    });
    // shade the least-lit visible side
    const lit = AD.style.light;
    all.forEach(function (a) {
      const f = faces.filter(function (x) { return x.dir === a.dir; })[0];
      a.lit = G.dot(f.normal, lit);
    });
    all.sort(function (a, b) { return a.lit - b.lit; });
    all.forEach(function (a, i) {
      if (i === 0 && p.lod >= 0.55 && a.dir !== 'top' && opts.shade !== false) {
        S.hatchQuad(ctx, pens.hatch, a.q, {
          angle: -1.15, gap: 0.26, lod: p.lod, alpha: 0.5, max: 6
        });
      }
      S.strokePoly(ctx, pens.detail, a.q, { lod: p.lod, width: opts.width || 0.9 });
    });
    return all;
  }

  // --- railings (used for balconies and roof terraces) ----------------------
  function railBars(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    S.strokePath(ctx, pens.detail, [Q(q, 0, 1), Q(q, 1, 1)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 1, 0)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 0, 1)], { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [Q(q, 1, 0), Q(q, 1, 1)], { lod: p.lod, width: 0.8 });
    if (p.lod < 0.55) return;
    const w = S.quadSize(q).w;
    const n = Math.max(2, Math.min(14, Math.round(w / 5)));
    for (let i = 1; i < n; i++) {
      S.strokePath(ctx, pens.hair, [Q(q, i / n, 0.05), Q(q, i / n, 0.98)], { lod: p.lod });
    }
  }

  function railCross(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    S.strokePath(ctx, pens.detail, [Q(q, 0, 1), Q(q, 1, 1)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 1, 0)], { lod: p.lod, width: 0.9 });
    const w = S.quadSize(q).w;
    const n = Math.max(1, Math.min(8, Math.round(w / 11)));
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      S.strokePath(ctx, pens.hair, [Q(q, a, 0.02), Q(q, b, 0.98)], { lod: p.lod });
      S.strokePath(ctx, pens.hair, [Q(q, a, 0.98), Q(q, b, 0.02)], { lod: p.lod });
    }
  }

  function railSlab(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.5) {
      S.hatchQuad(ctx, pens.hatch, S.subQuad(q, 0.03, 0.08, 0.97, 0.9), {
        angle: rng.chance(0.5) ? -1.2 : 1.2, gap: 0.16, lod: p.lod, alpha: 0.5, max: 9
      });
    }
  }

  NS.railings = { bars: railBars, cross: railCross, slab: railSlab };
  NS.railingNames = ['bars', 'cross', 'slab'];

  // --- roof gear ------------------------------------------------------------
  function gearChimney(ctx, R, pens, rng, p, g) {
    const w = g.size, d = g.size * rng.range(0.7, 1.1);
    const h = g.size * rng.range(2.2, 4.2);
    box3(ctx, R, pens, rng, p, { x: g.x - w / 2, z: g.z - d / 2, w: w, d: d, y: g.y, h: h });
    // cap
    const capW = w * 1.35, capD = d * 1.35;
    box3(ctx, R, pens, rng, p, {
      x: g.x - capW / 2, z: g.z - capD / 2, w: capW, d: capD,
      y: g.y + h, h: g.size * 0.35
    }, { shade: false });
    if (p.lod >= 0.7) {
      // brick courses
      const n = rng.int(2, 3);
      for (let i = 1; i <= n; i++) {
        const yy = g.y + (h * i) / (n + 1);
        S.strokePath(ctx, pens.hair,
          [R.P(g.x - w / 2, yy, g.z - d / 2), R.P(g.x + w / 2, yy, g.z - d / 2)],
          { lod: p.lod, alpha: 0.6 });
      }
    }
  }

  function gearFlue(ctx, R, pens, rng, p, g) {
    const h = g.size * rng.range(3, 6);
    const r = g.size * 0.22;
    const a = R.P(g.x, g.y, g.z);
    const b = R.P(g.x, g.y + h, g.z);
    S.strokePath(ctx, pens.detail, [{ x: a.x - r * 2, y: a.y }, { x: b.x - r * 2, y: b.y }],
      { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [{ x: a.x + r * 2, y: a.y }, { x: b.x + r * 2, y: b.y }],
      { lod: p.lod, width: 0.9 });
    S.strokeEllipse(ctx, pens.detail, b.x, b.y, r * 2.6, r * 1.1, { lod: p.lod });
    if (p.lod >= 0.6) {
      // guy wire
      const c = R.P(g.x + g.size * 1.6, g.y, g.z);
      S.strokePath(ctx, pens.hair, [{ x: b.x, y: b.y + 2 }, c], { lod: p.lod, alpha: 0.7 });
    }
  }

  function gearAntenna(ctx, R, pens, rng, p, g) {
    const h = g.size * rng.range(4, 8);
    const a = R.P(g.x, g.y, g.z);
    const b = R.P(g.x, g.y + h, g.z);
    S.strokePath(ctx, pens.detail, [a, b], { lod: p.lod, width: 0.85 });
    const n = rng.int(2, 4);
    for (let i = 1; i <= n; i++) {
      const t = 0.35 + (i / (n + 1)) * 0.6;
      const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      const arm = g.size * (2.4 - i * 0.35) * R.pxPerUnit * 0.5;
      S.strokePath(ctx, pens.hair, [{ x: c.x - arm, y: c.y + 1 }, { x: c.x + arm, y: c.y - 1 }],
        { lod: p.lod });
    }
    if (rng.chance(0.4)) {
      S.strokeEllipse(ctx, pens.hair, b.x, b.y - 2, 2, 2, { lod: p.lod });
    }
  }

  function gearTank(ctx, R, pens, rng, p, g) {
    const legH = g.size * rng.range(0.9, 1.8);
    const r = g.size * rng.range(0.8, 1.3);
    const h = g.size * rng.range(1.4, 2.4);
    // legs
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    legs.forEach(function (l) {
      const a = R.P(g.x + l[0] * r * 0.7, g.y, g.z + l[1] * r * 0.7);
      const b = R.P(g.x + l[0] * r * 0.7, g.y + legH, g.z + l[1] * r * 0.7);
      S.strokePath(ctx, pens.detail, [a, b], { lod: p.lod, width: 0.75 });
    });
    // drum
    const cTop = R.P(g.x, g.y + legH + h, g.z);
    const cBot = R.P(g.x, g.y + legH, g.z);
    const rx = r * R.pxPerUnit;
    const ry = rx * Math.max(0.12, Math.abs(R.cam.sp_)) * 0.9 + 1.5;
    S.strokePath(ctx, pens.detail, [{ x: cBot.x - rx, y: cBot.y }, { x: cTop.x - rx, y: cTop.y }],
      { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [{ x: cBot.x + rx, y: cBot.y }, { x: cTop.x + rx, y: cTop.y }],
      { lod: p.lod, width: 0.9 });
    S.strokeEllipse(ctx, pens.detail, cTop.x, cTop.y, rx, ry, { lod: p.lod });
    S.strokePath(ctx, pens.detail, G.arcPts(cBot.x, cBot.y, rx, ry, 0, Math.PI, 9),
      { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.6) {
      S.hatchQuad(ctx, pens.hatch, [
        { x: cBot.x - rx, y: cBot.y }, { x: cBot.x - rx * 0.35, y: cBot.y },
        { x: cTop.x - rx * 0.35, y: cTop.y }, { x: cTop.x - rx, y: cTop.y }
      ], { angle: 1.5, gap: 0.3, lod: p.lod, alpha: 0.45, max: 5 });
    }
  }

  NS.gear = {
    chimney: gearChimney, flue: gearFlue, antenna: gearAntenna, tank: gearTank
  };
  NS.gearNames = ['chimney', 'flue', 'antenna', 'tank'];
  NS.box3 = box3;

  // --- ornament -------------------------------------------------------------
  function ornCornice(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.985;
    const a = frame.pt(-0.02, v), b = frame.pt(1.02, v);
    const a2 = frame.pt(-0.03, v - 0.022), b2 = frame.pt(1.03, v - 0.022);
    S.strokePath(ctx, pens.detail, [a, b], { lod: p.lod, width: 1.05 });
    S.strokePath(ctx, pens.detail, [a2, b2], { lod: p.lod, width: 0.8 });
    if (p.lod < 0.65) return;
    const n = Math.max(3, Math.min(22, Math.round(frame.pxWidth / 12)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      S.strokePath(ctx, pens.hair,
        [frame.pt(u, v - 0.022), frame.pt(u, v - 0.045)], { lod: p.lod, alpha: 0.8 });
    }
  }

  function ornPilasters(ctx, frame, pens, rng, p) {
    const w = 0.035;
    [[0.012, 0.012 + w], [0.988 - w, 0.988]].forEach(function (uu) {
      const q = frame.quad(uu[0], 0.02, uu[1], 0.97);
      if (!S.quadOk(q)) return;
      S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 0, 1)], { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.detail, [Q(q, 1, 0), Q(q, 1, 1)], { lod: p.lod, width: 0.85 });
      if (p.lod >= 0.6) {
        S.strokePath(ctx, pens.hair, [Q(q, -0.4, 0.96), Q(q, 1.4, 0.96)], { lod: p.lod });
        S.strokePath(ctx, pens.hair, [Q(q, -0.4, 0.03), Q(q, 1.4, 0.03)], { lod: p.lod });
      }
    });
  }

  function ornSignage(ctx, frame, pens, rng, p, o) {
    const u0 = o && o.u0 != null ? o.u0 : rng.range(0.1, 0.4);
    const w = rng.range(0.2, 0.42);
    const v0 = o && o.v0 != null ? o.v0 : rng.range(0.55, 0.8);
    const q = frame.quad(u0, v0, Math.min(0.95, u0 + w), v0 + rng.range(0.05, 0.1));
    if (!S.quadOk(q)) return;
    if (p.signAccent) S.accentFill(ctx, q, p.signAccent, rng, {});
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9 });
    if (p.lod < 0.6) return;
    // scribbled "lettering" — never actual letterforms
    const words = rng.int(1, 3);
    let u = 0.08;
    for (let i = 0; i < words && u < 0.9; i++) {
      const wl = rng.range(0.15, 0.32);
      S.scribbleFill(ctx, pens.hair, S.subQuad(q, u, 0.3, Math.min(0.94, u + wl), 0.7), {
        density: Math.round(rng.range(4, 9)), lod: p.lod, width: 0.8, alpha: 0.85
      });
      u += wl + 0.07;
    }
  }

  function ornAC(ctx, frame, pens, rng, p, o) {
    const u = o && o.u != null ? o.u : rng.range(0.15, 0.8);
    const v = o && o.v != null ? o.v : rng.range(0.25, 0.8);
    const w = 0.055, h = 0.035;
    const q = frame.quad(u, v, u + w, v + h);
    if (!S.quadOk(q)) return;
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.75 });
    if (p.lod < 0.7) return;
    const c = Q(q, 0.5, 0.5);
    const r = Math.min(S.quadSize(q).w, S.quadSize(q).h) * 0.3;
    S.strokeEllipse(ctx, pens.hair, c.x, c.y, r, r, { lod: p.lod });
    S.strokePath(ctx, pens.hair, [Q(q, 0.1, 0.05), Q(q, 0.9, 0.05)], { lod: p.lod });
  }

  NS.ornament = {
    cornice: ornCornice, pilasters: ornPilasters, signage: ornSignage, ac: ornAC
  };
  NS.ornamentNames = ['cornice', 'pilasters', 'signage', 'ac'];

  // --- vegetation on buildings ---------------------------------------------
  function vegWindowBox(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    const box = S.subQuad(q, 0.05, -0.02, 0.95, 0.28);
    if (p.vegAccent) S.accentFill(ctx, box, p.vegAccent, rng, { alpha: 0.3 });
    S.strokePoly(ctx, pens.hair, box, { lod: p.lod });
    if (p.lod < 0.6) return;
    S.scribbleFill(ctx, pens.hair, S.subQuad(q, 0.05, 0.12, 0.95, 0.42), {
      density: Math.round(rng.range(5, 11)), lod: p.lod, width: 0.9, alpha: 0.9
    });
  }

  function vegVine(ctx, frame, pens, rng, p, o) {
    const u = o && o.u != null ? o.u : rng.range(0.05, 0.9);
    const top = rng.range(0.35, 0.9);
    const steps = p.lod >= 0.7 ? 12 : 6;
    const pts = [];
    let uu = u;
    for (let i = 0; i <= steps; i++) {
      const v = (top * i) / steps;
      uu += rng.range(-0.035, 0.035);
      pts.push(frame.pt(Math.max(0.01, Math.min(0.99, uu)), v));
    }
    S.strokePath(ctx, pens.detail, pts, { lod: p.lod, width: 0.8 });
    if (p.lod < 0.6) return;
    const leaves = Math.round(rng.range(4, 10));
    for (let i = 0; i < leaves; i++) {
      const t = rng.range(0.05, 0.98);
      const idx = Math.min(pts.length - 1, Math.floor(t * pts.length));
      const c = pts[idx];
      const r = rng.range(2.2, 5);
      if (p.vegAccent) {
        S.polyFill(ctx, [
          { x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r },
          { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }
        ], p.vegAccent, 0.22);
      }
      S.strokeEllipse(ctx, pens.hair, c.x + rng.range(-r, r), c.y + rng.range(-r, r),
        r * 0.7, r * 0.5, { lod: p.lod, rotation: rng.range(0, Math.PI) });
    }
  }

  NS.vegetation = { windowBox: vegWindowBox, vine: vegVine };

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.details = NS;
})();

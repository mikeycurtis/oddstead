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

  /** Fine lattice infill — the screened balustrade. */
  function railLattice(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    S.strokePath(ctx, pens.detail, [Q(q, 0, 1), Q(q, 1, 1)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 1, 0)], { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [Q(q, 0, 0), Q(q, 0, 1)], { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [Q(q, 1, 0), Q(q, 1, 1)], { lod: p.lod, width: 0.8 });
    if (p.lod < 0.55) return;
    const w = S.quadSize(q).w;
    const n = Math.max(2, Math.min(10, Math.round(w / 7)));
    for (let i = 0; i < n; i++) {
      const a = i / n, b = (i + 1) / n;
      S.strokePath(ctx, pens.hair, [Q(q, a, 0.04), Q(q, b, 0.96)], { lod: p.lod, alpha: 0.8 });
      S.strokePath(ctx, pens.hair, [Q(q, a, 0.96), Q(q, b, 0.04)], { lod: p.lod, alpha: 0.8 });
    }
    S.strokePath(ctx, pens.hair, [Q(q, 0.02, 0.5), Q(q, 0.98, 0.5)], { lod: p.lod, alpha: 0.7 });
  }

  /** Turned balusters: short posts with a swelling at mid height. */
  function railTurned(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    S.strokePath(ctx, pens.detail, [Q(q, -0.03, 1), Q(q, 1.03, 1)], { lod: p.lod, width: 1 });
    S.strokePath(ctx, pens.detail, [Q(q, -0.02, 0.06), Q(q, 1.02, 0.06)], { lod: p.lod, width: 0.9 });
    if (p.lod < 0.6) return;
    const w = S.quadSize(q).w;
    const n = Math.max(2, Math.min(11, Math.round(w / 7)));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      S.strokePath(ctx, pens.hair, [Q(q, u, 0.08), Q(q, u, 0.94)], { lod: p.lod, alpha: 0.9 });
      if (p.lod >= 0.75) {
        const c = Q(q, u, 0.5);
        S.strokeEllipse(ctx, pens.hair, c.x, c.y, 1.5, 2.2, { lod: p.lod });
      }
    }
  }

  NS.railings = {
    bars: railBars, cross: railCross, slab: railSlab,
    lattice: railLattice, turned: railTurned
  };
  NS.railingNames = ['bars', 'cross', 'slab', 'lattice', 'turned'];

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

  /** Ridge ornament: a short post carrying a disc and two small flares. */
  function gearFinial(ctx, R, pens, rng, p, g) {
    const h = g.size * rng.range(1.6, 2.8);
    const a = R.P(g.x, g.y, g.z);
    const b = R.P(g.x, g.y + h, g.z);
    const w = Math.max(1.2, g.size * R.pxPerUnit * 0.16);
    // tapered shaft
    S.strokePath(ctx, pens.detail, [{ x: a.x - w, y: a.y }, { x: b.x - w * 0.45, y: b.y }],
      { lod: p.lod, width: 0.85 });
    S.strokePath(ctx, pens.detail, [{ x: a.x + w, y: a.y }, { x: b.x + w * 0.45, y: b.y }],
      { lod: p.lod, width: 0.85 });
    const mid = R.P(g.x, g.y + h * 0.55, g.z);
    S.strokeEllipse(ctx, pens.detail, mid.x, mid.y, w * 1.9, w * 0.9, { lod: p.lod });
    S.strokeEllipse(ctx, pens.detail, b.x, b.y - w * 0.8, w * 1.1, w * 1.2, { lod: p.lod });
    if (p.lod >= 0.6) {
      // flares sweeping out at the base of the shaft
      const base = R.P(g.x, g.y + h * 0.16, g.z);
      S.strokePath(ctx, pens.hair, [
        { x: base.x - w * 3, y: base.y - w * 0.6 }, { x: base.x - w, y: base.y }
      ], { lod: p.lod, alpha: 0.85 });
      S.strokePath(ctx, pens.hair, [
        { x: base.x + w * 3, y: base.y - w * 0.6 }, { x: base.x + w, y: base.y }
      ], { lod: p.lod, alpha: 0.85 });
    }
  }

  /** Small domed lantern on a drum. */
  function gearCupola(ctx, R, pens, rng, p, g) {
    const drumH = g.size * rng.range(0.9, 1.6);
    const r = g.size * rng.range(0.7, 1.1);
    const rx = Math.max(2, r * R.pxPerUnit);
    const ry = rx * Math.max(0.12, Math.abs(R.cam.sp_)) * 0.9 + 1.2;
    const bot = R.P(g.x, g.y, g.z);
    const top = R.P(g.x, g.y + drumH, g.z);
    S.strokePath(ctx, pens.detail, [{ x: bot.x - rx, y: bot.y }, { x: top.x - rx, y: top.y }],
      { lod: p.lod, width: 0.85 });
    S.strokePath(ctx, pens.detail, [{ x: bot.x + rx, y: bot.y }, { x: top.x + rx, y: top.y }],
      { lod: p.lod, width: 0.85 });
    S.strokeEllipse(ctx, pens.detail, top.x, top.y, rx, ry, { lod: p.lod });
    // the dome: a flattened half-ellipse springing off the drum
    const domeH = rx * rng.range(1.0, 1.5);
    S.strokePath(ctx, pens.detail,
      G.arcPts(top.x, top.y, rx, domeH, Math.PI, Math.PI * 2, p.lod >= 0.7 ? 14 : 7),
      { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.6) {
      // meridian and a small finial pip
      S.strokePath(ctx, pens.hair, [
        { x: top.x, y: top.y - domeH }, { x: top.x, y: top.y - domeH - rx * 0.7 }
      ], { lod: p.lod });
      S.strokeEllipse(ctx, pens.hair, top.x, top.y - domeH - rx * 0.85, 1.5, 1.5, { lod: p.lod });
      S.strokePath(ctx, pens.hair,
        G.arcPts(top.x, top.y, rx * 0.45, domeH * 0.92, Math.PI, Math.PI * 2, 9),
        { lod: p.lod, alpha: 0.6 });
      const n = rng.int(2, 4);
      for (let i = 1; i < n; i++) {
        const x = bot.x - rx + (2 * rx * i) / n;
        S.strokePath(ctx, pens.hair, [{ x: x, y: bot.y }, { x: x, y: top.y }],
          { lod: p.lod, alpha: 0.55 });
      }
    }
  }

  /** Setback mast: two or three shrinking blocks under a thin spike. */
  function gearSpire(ctx, R, pens, rng, p, g) {
    const tiers = rng.int(2, 3);
    let y = g.y, s = g.size * rng.range(1.1, 1.7);
    for (let i = 0; i < tiers; i++) {
      const h = s * rng.range(0.8, 1.4);
      box3(ctx, R, pens, rng, p, {
        x: g.x - s / 2, z: g.z - s / 2, w: s, d: s, y: y, h: h
      }, { width: 0.8 });
      y += h;
      s *= rng.range(0.5, 0.72);
    }
    const a = R.P(g.x, y, g.z);
    const b = R.P(g.x, y + g.size * rng.range(2.5, 5), g.z);
    S.strokePath(ctx, pens.detail, [a, b], { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.6) {
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      S.strokePath(ctx, pens.hair, [{ x: c.x - 3, y: c.y + 1 }, { x: c.x + 3, y: c.y - 1 }],
        { lod: p.lod });
      S.strokeEllipse(ctx, pens.hair, b.x, b.y + 1.5, 1.4, 1.4, { lod: p.lod });
    }
  }

  /** Corner ornament: a small fan of ribs on a plinth, at the roof's edge. */
  function gearAcroterion(ctx, R, pens, rng, p, g) {
    const h = g.size * rng.range(1.3, 2.2);
    const base = R.P(g.x, g.y, g.z);
    const w = Math.max(1.6, g.size * R.pxPerUnit * 0.34);
    // plinth
    S.strokePoly(ctx, pens.detail, [
      { x: base.x - w, y: base.y }, { x: base.x + w, y: base.y },
      { x: base.x + w * 0.78, y: base.y - w * 0.7 }, { x: base.x - w * 0.78, y: base.y - w * 0.7 }
    ], { lod: p.lod, width: 0.85 });
    const c = { x: base.x, y: base.y - w * 0.7 };
    const span = Math.max(3, h * R.pxPerUnit * 0.45);
    const ribs = p.lod >= 0.6 ? rng.int(5, 7) : 3;
    const tips = [];
    for (let i = 0; i < ribs; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / (ribs - 1));
      const tip = {
        x: c.x - Math.cos(a) * span * rng.range(0.75, 1),
        y: c.y - Math.sin(a) * span * rng.range(0.85, 1.05)
      };
      tips.push(tip);
      S.strokePath(ctx, pens.detail, [
        c, { x: (c.x + tip.x) / 2 + (tip.x - c.x) * 0.1, y: (c.y + tip.y) / 2 }, tip
      ], { lod: p.lod, width: 0.8 });
    }
    if (p.lod >= 0.65 && tips.length > 2) {
      S.strokePath(ctx, pens.hair, tips, { lod: p.lod, alpha: 0.7, filament: 0 });
    }
  }

  /** Dovecote: a small gabled box lifted on a post, with landing holes. */
  function gearDovecote(ctx, R, pens, rng, p, g) {
    const postH = g.size * rng.range(1.4, 2.4);
    const s = g.size * rng.range(0.9, 1.4);
    const a = R.P(g.x, g.y, g.z);
    const b = R.P(g.x, g.y + postH, g.z);
    S.strokePath(ctx, pens.detail, [{ x: a.x - 1, y: a.y }, { x: b.x - 1, y: b.y }],
      { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [{ x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }],
      { lod: p.lod, width: 0.8 });
    const boxH = s * rng.range(1, 1.4);
    const faces = box3(ctx, R, pens, rng, p, {
      x: g.x - s / 2, z: g.z - s / 2, w: s, d: s, y: g.y + postH, h: boxH
    }, { width: 0.8 });
    // little gable over the box
    const top = R.P(g.x, g.y + postH + boxH, g.z);
    const apex = { x: top.x, y: top.y - s * R.pxPerUnit * 0.55 };
    const half = Math.max(2, s * R.pxPerUnit * 0.72);
    S.strokePath(ctx, pens.detail, [{ x: top.x - half, y: top.y }, apex], { lod: p.lod, width: 0.85 });
    S.strokePath(ctx, pens.detail, [{ x: top.x + half, y: top.y }, apex], { lod: p.lod, width: 0.85 });
    if (p.lod < 0.6) return;
    // holes and a landing ledge on whichever side faces the viewer
    let front = null;
    for (let i = 0; i < faces.length; i++) {
      if (faces[i].dir === 'top') continue;
      if (!front || faces[i].fv > front.fv) front = faces[i];
    }
    if (!front) return;
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const c = S.quadPt(front.q, (i + 1) / (n + 1), 0.62);
      S.strokeEllipse(ctx, pens.hair, c.x, c.y, 1.5, 1.7, { lod: p.lod });
    }
    S.strokePath(ctx, pens.hair,
      [S.quadPt(front.q, -0.1, 0.34), S.quadPt(front.q, 1.1, 0.34)],
      { lod: p.lod, alpha: 0.85 });
  }

  NS.gear = {
    chimney: gearChimney, flue: gearFlue, antenna: gearAntenna, tank: gearTank,
    finial: gearFinial, cupola: gearCupola, spire: gearSpire,
    acroterion: gearAcroterion, dovecote: gearDovecote
  };
  NS.gearNames = ['chimney', 'flue', 'antenna', 'tank', 'finial', 'cupola', 'spire',
    'acroterion', 'dovecote'];
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

  /** Zigzag band — the stepped, faceted ornament of the setback era. */
  function ornChevrons(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.9;
    const h = o && o.h != null ? o.h : 0.05;
    const n = Math.max(3, Math.min(18, Math.round(frame.pxWidth / 16)));
    const pts = [];
    for (let i = 0; i <= n * 2; i++) {
      const u = 0.03 + (0.94 * i) / (n * 2);
      pts.push(frame.pt(u, i % 2 === 0 ? v : v + h));
    }
    S.strokePath(ctx, pens.detail, pts, { lod: p.lod, width: 0.8, filament: 0 });
    if (p.lod < 0.6) return;
    const echo = pts.map(function (q, i) {
      return { x: q.x, y: q.y + (i % 2 === 0 ? 3.4 : 3.4) };
    });
    S.strokePath(ctx, pens.hair, echo, { lod: p.lod, alpha: 0.6, filament: 0 });
  }

  /** Row of brackets carrying an overhang, just under the wall head. */
  function ornBrackets(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.955;
    const n = Math.max(3, Math.min(16, Math.round(frame.pxWidth / 20)));
    const drop = o && o.drop != null ? o.drop : 0.05;
    S.strokePath(ctx, pens.detail, [frame.pt(-0.02, v), frame.pt(1.02, v)],
      { lod: p.lod, width: 0.95 });
    if (p.lod < 0.55) return;
    for (let i = 0; i <= n; i++) {
      const u = 0.02 + (0.96 * i) / n;
      const a = frame.pt(u, v);
      const b = frame.pt(u, v - drop);
      const c = frame.pt(u + 0.018, v - drop * 0.35);
      S.strokePath(ctx, pens.hair, [a, b], { lod: p.lod, alpha: 0.9 });
      if (p.lod >= 0.72) S.strokePath(ctx, pens.hair, [b, c], { lod: p.lod, alpha: 0.75 });
    }
  }

  /** Projecting shade band running the width of the wall. */
  function ornSunshade(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.6;
    const q = [
      frame.pt(-0.06, v), frame.pt(1.06, v),
      frame.pt(1.03, v + 0.035), frame.pt(-0.03, v + 0.035)
    ];
    if (!S.quadOk(q)) return;
    if (p.trimAccent) S.accentFill(ctx, q, p.trimAccent, rng, { alpha: 0.22 });
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9 });
    if (p.lod < 0.6) return;
    S.hatchQuad(ctx, pens.hatch, q, { angle: 1.5, gap: 0.05, lod: p.lod, alpha: 0.4, max: 16 });
    const n = Math.max(2, Math.min(12, Math.round(frame.pxWidth / 26)));
    for (let i = 0; i <= n; i++) {
      const u = 0.02 + (0.96 * i) / n;
      S.strokePath(ctx, pens.hair, [frame.pt(u, v - 0.045), frame.pt(u, v + 0.005)],
        { lod: p.lod, alpha: 0.8 });
    }
  }

  /** A screened band set into the wall — shade without shutting the light out. */
  function ornLatticeBand(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.5;
    const h = o && o.h != null ? o.h : 0.16;
    const u0 = o && o.u0 != null ? o.u0 : 0.1;
    const u1 = o && o.u1 != null ? o.u1 : 0.9;
    const q = frame.quad(u0, v, u1, Math.min(0.99, v + h));
    if (!S.quadOk(q)) return;
    AD.facade.latticePanel(ctx, q, pens, rng, p, {
      diagonal: rng.chance(0.4), accent: p.glassAccent, width: 0.8
    });
  }

  /** Alternating corner blocks — the rendered wall's dressed edges. */
  function ornQuoins(ctx, frame, pens, rng, p, o) {
    AD.facade.quoins(ctx, frame, pens, rng, p, { w: (o && o.w) || 0.05 });
  }

  /** Frieze band: grooved blocks alternating with plain fields, guttae under. */
  function ornTriglyphs(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.9;
    const h = o && o.h != null ? o.h : 0.055;
    S.strokePath(ctx, pens.detail, [frame.pt(-0.02, v + h), frame.pt(1.02, v + h)],
      { lod: p.lod, width: 0.95 });
    S.strokePath(ctx, pens.detail, [frame.pt(-0.02, v), frame.pt(1.02, v)],
      { lod: p.lod, width: 0.85 });
    if (p.lod < 0.55) return;
    const n = Math.max(3, Math.min(14, Math.round(frame.pxWidth / 28)));
    const cell = 0.96 / n;
    for (let i = 0; i < n; i++) {
      const uc = 0.02 + cell * (i + 0.5);
      const bw = cell * 0.2;
      const q = frame.quad(uc - bw, v + 0.004, uc + bw, v + h - 0.004);
      if (!S.quadOk(q)) continue;
      S.strokePoly(ctx, pens.hair, q, { lod: p.lod, width: 0.8 });
      if (p.lod >= 0.68) {
        [0.34, 0.66].forEach(function (u) {
          S.strokePath(ctx, pens.hair, [Q(q, u, 0.06), Q(q, u, 0.94)], { lod: p.lod, alpha: 0.8 });
        });
        // guttae hanging under the block
        for (let k = 0; k < 3; k++) {
          const u = uc + (k - 1) * bw * 0.7;
          S.strokePath(ctx, pens.hair, [frame.pt(u, v), frame.pt(u, v - 0.014)],
            { lod: p.lod, alpha: 0.75 });
        }
      }
    }
  }

  /** Stacked bracket blocks stepping out under the eave. */
  function ornBracketTier(ctx, frame, pens, rng, p, o) {
    const v = o && o.v != null ? o.v : 0.9;
    const n = Math.max(2, Math.min(10, Math.round(frame.pxWidth / 34)));
    const tiers = p.lod >= 0.7 ? 3 : 2;
    S.strokePath(ctx, pens.detail, [frame.pt(-0.02, v + 0.052), frame.pt(1.02, v + 0.052)],
      { lod: p.lod, width: 0.95 });
    if (p.lod < 0.5) return;
    for (let i = 0; i <= n; i++) {
      const u = 0.03 + (0.94 * i) / n;
      // the post the cluster sits on
      S.strokePath(ctx, pens.detail, [frame.pt(u, v - 0.03), frame.pt(u, v)],
        { lod: p.lod, width: 0.8 });
      for (let k = 0; k < tiers; k++) {
        const half = 0.012 + 0.011 * k;
        const vv = v + 0.017 * k;
        const a = frame.pt(u - half, vv), b = frame.pt(u + half, vv);
        S.strokePath(ctx, pens.hair, [a, b], { lod: p.lod, alpha: 0.9 });
        if (p.lod >= 0.72 && k < tiers - 1) {
          S.strokePath(ctx, pens.hair, [a, frame.pt(u - half - 0.006, vv + 0.017)],
            { lod: p.lod, alpha: 0.7 });
          S.strokePath(ctx, pens.hair, [b, frame.pt(u + half + 0.006, vv + 0.017)],
            { lod: p.lod, alpha: 0.7 });
        }
      }
    }
  }

  NS.ornament = {
    cornice: ornCornice, pilasters: ornPilasters, signage: ornSignage, ac: ornAC,
    chevrons: ornChevrons, brackets: ornBrackets, sunshade: ornSunshade,
    latticeBand: ornLatticeBand, quoins: ornQuoins, triglyphs: ornTriglyphs,
    bracketTier: ornBracketTier
  };
  NS.ornamentNames = ['cornice', 'pilasters', 'signage', 'ac',
    'chevrons', 'brackets', 'sunshade', 'latticeBand',
    'quoins', 'triglyphs', 'bracketTier'];

  // --- vegetation on buildings ---------------------------------------------
  // Planting colour is decided once per building (building.js forks a flora
  // stream and stores the result in the plan), then handed down in p.flora, so
  // every box and climber on the sheet belongs to the same garden. Fills are
  // translucent and always laid under the ink; the drawing is still the line.
  function leafOf(p) { return (p.flora && p.flora.leaf) || p.vegAccent || null; }
  function deepOf(p) { return (p.flora && p.flora.deep) || p.vegAccent || null; }
  function bloomOf(p) { return (p.flora && p.flora.bloom) || null; }
  function alphas() { return AD.style.floraAlpha; }

  /** A handful of flower dabs inside a quad: colour first, hairline after. */
  function bloomDabs(ctx, q, pens, rng, p, n) {
    const col = bloomOf(p);
    if (!col || p.lod < 0.65 || !S.quadOk(q)) return;
    for (let i = 0; i < n; i++) {
      const c = Q(q, rng.range(0.08, 0.92), rng.range(0.15, 0.9));
      const r = rng.range(1.1, 2.2);
      S.polyFill(ctx, [
        { x: c.x - r, y: c.y }, { x: c.x, y: c.y - r },
        { x: c.x + r, y: c.y }, { x: c.x, y: c.y + r }
      ], col, alphas().bloom);
      S.strokeEllipse(ctx, pens.hair, c.x, c.y, r * 0.8, r * 0.7, { lod: p.lod, alpha: 0.7 });
    }
  }

  function vegWindowBox(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    const box = S.subQuad(q, 0.05, -0.02, 0.95, 0.28);
    if (p.trimAccent) S.accentFill(ctx, box, p.trimAccent, rng, { alpha: 0.22 });
    else if (p.vegAccent) S.accentFill(ctx, box, p.vegAccent, rng, { alpha: 0.2 });
    S.strokePoly(ctx, pens.hair, box, { lod: p.lod });
    if (p.lod < 0.6) return;
    const foliage = S.subQuad(q, 0.05, 0.1, 0.95, 0.44);
    const leaf = leafOf(p);
    if (leaf && S.quadOk(foliage)) S.polyFill(ctx, foliage, leaf, alphas().canopy);
    S.scribbleFill(ctx, pens.hair, S.subQuad(q, 0.05, 0.12, 0.95, 0.42), {
      density: Math.round(rng.range(5, 11)), lod: p.lod, width: 0.9, alpha: 0.9
    });
    bloomDabs(ctx, foliage, pens, rng, p, rng.int(2, 4));
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
    const leafCol = leafOf(p);
    const deepCol = deepOf(p);
    const bloom = bloomOf(p);
    const leaves = Math.round(rng.range(4, 10));
    for (let i = 0; i < leaves; i++) {
      const t = rng.range(0.05, 0.98);
      const idx = Math.min(pts.length - 1, Math.floor(t * pts.length));
      const c = pts[idx];
      const r = rng.range(2.2, 5);
      const col = rng.chance(0.3) ? deepCol : leafCol;
      if (col) {
        S.polyFill(ctx, [
          { x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y - r },
          { x: c.x + r, y: c.y + r }, { x: c.x - r, y: c.y + r }
        ], col, alphas().canopy * 0.85);
      }
      S.strokeEllipse(ctx, pens.hair, c.x + rng.range(-r, r), c.y + rng.range(-r, r),
        r * 0.7, r * 0.5, { lod: p.lod, rotation: rng.range(0, Math.PI) });
      if (bloom && p.lod >= 0.7 && rng.chance(0.35)) {
        const bx = c.x + rng.range(-r, r), by = c.y + rng.range(-r, r);
        S.polyFill(ctx, [
          { x: bx - 1.6, y: by }, { x: bx, y: by - 1.6 },
          { x: bx + 1.6, y: by }, { x: bx, y: by + 1.6 }
        ], bloom, alphas().bloom);
      }
    }
  }

  /** Potted plants standing on a sill, balcony or veranda deck. */
  function vegPotted(ctx, q, pens, rng, p) {
    if (!S.quadOk(q)) return;
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const u = 0.12 + rng.range(0, 0.72);
      const w = rng.range(0.09, 0.16);
      const pot = [
        Q(q, u, 0.02), Q(q, u + w, 0.02),
        Q(q, u + w * 0.82, 0.3), Q(q, u + w * 0.18, 0.3)
      ];
      if (!S.quadOk(pot)) continue;
      if (p.trimAccent) S.accentFill(ctx, pot, p.trimAccent, rng, { alpha: 0.24 });
      S.strokePoly(ctx, pens.hair, pot, { lod: p.lod, width: 0.85 });
      if (p.lod < 0.6) continue;
      const leaf = [
        Q(q, u - w * 0.25, 0.28), Q(q, u + w * 1.25, 0.28),
        Q(q, u + w * 1.1, 0.85), Q(q, u - w * 0.1, 0.85)
      ];
      const col = leafOf(p);
      if (col && S.quadOk(leaf)) S.polyFill(ctx, leaf, col, alphas().canopy);
      S.scribbleFill(ctx, pens.hair, leaf, {
        density: Math.round(rng.range(5, 10)), lod: p.lod, width: 0.85, alpha: 0.85
      });
      bloomDabs(ctx, leaf, pens, rng, p, rng.int(1, 3));
    }
  }

  /** Trellis panel with a climber working its way up it. */
  function vegTrellis(ctx, frame, pens, rng, p, o) {
    const u0 = o && o.u != null ? o.u : rng.range(0.08, 0.6);
    const w = rng.range(0.16, 0.3);
    const vTop = rng.range(0.45, 0.85);
    const q = frame.quad(u0, 0.02, Math.min(0.97, u0 + w), vTop);
    if (!S.quadOk(q)) return;
    const cells = rng.int(2, 4);
    for (let i = 0; i <= cells; i++) {
      S.strokePath(ctx, pens.hair, [Q(q, i / cells, 0), Q(q, i / cells, 1)],
        { lod: p.lod, alpha: 0.8 });
    }
    const rows = Math.max(2, cells + rng.int(0, 2));
    for (let i = 0; i <= rows; i++) {
      S.strokePath(ctx, pens.hair, [Q(q, 0, i / rows), Q(q, 1, i / rows)],
        { lod: p.lod, alpha: 0.8 });
    }
    if (p.lod < 0.6) return;
    const leafy = S.subQuad(q, 0.02, 0.02, 0.98, rng.range(0.55, 0.95));
    const col = leafOf(p);
    if (col && S.quadOk(leafy)) S.polyFill(ctx, leafy, col, alphas().canopy * 0.9);
    S.scribbleFill(ctx, pens.hair, leafy, {
      density: Math.round(rng.range(7, 14)), lod: p.lod, width: 0.85, alpha: 0.8
    });
    bloomDabs(ctx, leafy, pens, rng, p, rng.int(2, 5));
  }

  NS.vegetation = {
    windowBox: vegWindowBox, vine: vegVine, potted: vegPotted, trellis: vegTrellis
  };
  NS.vegetationNames = ['windowBox', 'vine', 'potted', 'trellis'];

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.details = NS;
})();

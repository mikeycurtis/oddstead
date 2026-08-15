// js/el-roofs.js — roof variants.
//
// Roofs are the one element family that needs 3D: a ridge line has to sit above
// the top face and stay put as the camera orbits. They receive a projector
// R.P(x, y, z) rather than doing any camera maths themselves.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const G = AD.geom;

  function planeNormal(a, b, c) {
    const n = G.cross(G.sub(b, a), G.sub(c, a));
    // roof planes always point upward-ish; normalise the winding for visibility
    return n.y < 0 ? G.scale(n, -1) : n;
  }

  function visiblePlane(R, a, b, c) {
    return G.facing(planeNormal(a, b, c), R.cam) > 0.02;
  }

  function proj(R, pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) out.push(R.P(pts[i].x, pts[i].y, pts[i].z));
    return out;
  }

  function opaquePoly(ctx, R, pts2d) {
    if (!R.opaqueWalls || !pts2d || pts2d.length < 3) return;
    S.polyFill(ctx, pts2d, AD.style.paper.base, 1);
  }

  function accentPoly(ctx, pts2d, color, rng) {
    if (!color) return;
    const St = AD.style;
    const off = rng.range(St.accentOffset.min, St.accentOffset.max);
    const ang = rng.range(0, Math.PI * 2);
    const ox = Math.cos(ang) * off, oy = Math.sin(ang) * off;
    const q = pts2d.map(function (p) { return { x: p.x + ox, y: p.y + oy }; });
    S.polyFill(ctx, q, color, rng.range(St.accentAlpha.min, St.accentAlpha.max));
  }

  function slopeHatch(ctx, pens, quad2d, rng, p, gap) {
    if (p.lod < 0.5) return;
    S.hatchQuad(ctx, pens.hatch, quad2d, {
      angle: rng.chance(0.5) ? 1.5 : 0.05,
      gap: gap || 0.14,
      lod: p.lod,
      alpha: 0.6,
      max: p.lod >= 0.8 ? 14 : 7
    });
  }

  function box(R) {
    const pr = R.prism, ov = R.roof.ov;
    return {
      x0: pr.x - ov, x1: pr.x + pr.w + ov,
      z0: pr.z - ov, z1: pr.z + pr.d + ov,
      y: pr.y0 + pr.h,
      w: pr.w + ov * 2, d: pr.d + ov * 2
    };
  }

  // --- flat + parapet -------------------------------------------------------
  function roofFlat(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const deck = [
      G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1),
      G.v3(b.x1, b.y, b.z0), G.v3(b.x0, b.y, b.z0)
    ];
    const top = deck.map(function (v) { return G.v3(v.x, b.y + h, v.z); });
    const d2 = proj(R, deck), t2 = proj(R, top);

    if (G.facing(G.v3(0, 1, 0), R.cam) > 0.02) {
      opaquePoly(ctx, R, t2);
      accentPoly(ctx, t2, R.roof.accent, rng);
      if (p.lod >= 0.55 && rng.chance(0.6)) {
        S.hatchQuad(ctx, pens.hatch, t2, {
          angle: 0.5, gap: 0.24, lod: p.lod, alpha: 0.35, max: 6
        });
      }
      S.strokePoly(ctx, pens.outline, t2, { lod: p.lod });
    }
    // parapet wall: verticals at the corners + the deck edge line
    for (let i = 0; i < 4; i++) {
      const a = d2[i], c = t2[i];
      if (G.facing(G.v3(0, 1, 0), R.cam) > 0.02 || i < 2) {
        S.strokePath(ctx, pens.outline, [a, c], { lod: p.lod, width: 0.8 });
      }
    }
    S.strokePoly(ctx, pens.outline, d2, { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.6 && rng.chance(0.5)) {
      const mid = d2.map(function (q, i) {
        return { x: (q.x + t2[i].x) / 2, y: (q.y + t2[i].y) / 2 };
      });
      S.strokePoly(ctx, pens.hair, mid, { lod: p.lod, alpha: 0.7 });
    }
  }

  // --- gabled ---------------------------------------------------------------
  function roofGabled(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const xm = (b.x0 + b.x1) / 2, zm = (b.z0 + b.z1) / 2;
    let ra, rb, e0, e1;
    if (alongZ) {
      ra = G.v3(xm, b.y + h, b.z0); rb = G.v3(xm, b.y + h, b.z1);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x0, b.y, b.z1)];  // low eave, -X side
      e1 = [G.v3(b.x1, b.y, b.z0), G.v3(b.x1, b.y, b.z1)];  // low eave, +X side
    } else {
      ra = G.v3(b.x0, b.y + h, zm); rb = G.v3(b.x1, b.y + h, zm);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0)];
      e1 = [G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1)];
    }
    const slopes = [[e0[0], e0[1], rb, ra], [e1[0], e1[1], rb, ra]];
    slopes.forEach(function (sl) {
      if (!visiblePlane(R, sl[0], sl[1], sl[2])) return;
      const q = proj(R, sl);
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      slopeHatch(ctx, pens, q, rng, p, R.roof.seamGap);
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9, overshoot: 0.15 });
    });
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    S.strokePath(ctx, pens.outline, [P(ra), P(rb)], { lod: p.lod });
    // gable triangles at both ends
    [[ra, e0[0], e1[0]], [rb, e0[1], e1[1]]].forEach(function (tri) {
      const q = proj(R, tri);
      opaquePoly(ctx, R, q);
      S.strokePath(ctx, pens.outline, [q[1], q[0]], { lod: p.lod, width: 0.9 });
      S.strokePath(ctx, pens.outline, [q[2], q[0]], { lod: p.lod, width: 0.9 });
      S.strokePath(ctx, pens.detail, [q[1], q[2]], { lod: p.lod, width: 0.8 });
    });
  }

  // --- hipped ---------------------------------------------------------------
  function roofHipped(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const xm = (b.x0 + b.x1) / 2, zm = (b.z0 + b.z1) / 2;
    const inset = 0.24;
    let ra, rb;
    if (alongZ) {
      ra = G.v3(xm, b.y + h, b.z0 + b.d * inset);
      rb = G.v3(xm, b.y + h, b.z1 - b.d * inset);
    } else {
      ra = G.v3(b.x0 + b.w * inset, b.y + h, zm);
      rb = G.v3(b.x1 - b.w * inset, b.y + h, zm);
    }
    const c = [
      G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0),
      G.v3(b.x1, b.y, b.z1), G.v3(b.x0, b.y, b.z1)
    ];
    // four planes: two trapezoids along the ridge, two end triangles
    const planes = alongZ
      ? [[c[0], c[3], rb, ra], [c[1], c[2], rb, ra], [c[0], c[1], ra, ra], [c[3], c[2], rb, rb]]
      : [[c[0], c[1], rb, ra], [c[3], c[2], rb, ra], [c[0], c[3], ra, ra], [c[1], c[2], rb, rb]];
    planes.forEach(function (pl) {
      if (!visiblePlane(R, pl[0], pl[1], pl[2])) return;
      const q = proj(R, pl);
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      slopeHatch(ctx, pens, q, rng, p, R.roof.seamGap);
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.85, overshoot: 0.12 });
    });
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    S.strokePath(ctx, pens.outline, [P(ra), P(rb)], { lod: p.lod });
    const c2 = proj(R, c);
    S.strokePoly(ctx, pens.detail, c2, { lod: p.lod, width: 0.85 });
    // hip edges
    S.strokePath(ctx, pens.detail, [c2[0], P(ra)], { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [c2[1], P(alongZ ? ra : rb)], { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [c2[2], P(rb)], { lod: p.lod, width: 0.8 });
    S.strokePath(ctx, pens.detail, [c2[3], P(alongZ ? rb : ra)], { lod: p.lod, width: 0.8 });
  }

  // --- mono-pitch / shed ----------------------------------------------------
  function roofShed(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const side = R.roof.highSide || 'xmax';
    let lo, hi;
    if (side === 'xmax') {
      lo = [G.v3(b.x0, b.y, b.z0), G.v3(b.x0, b.y, b.z1)];
      hi = [G.v3(b.x1, b.y + h, b.z0), G.v3(b.x1, b.y + h, b.z1)];
    } else if (side === 'xmin') {
      lo = [G.v3(b.x1, b.y, b.z0), G.v3(b.x1, b.y, b.z1)];
      hi = [G.v3(b.x0, b.y + h, b.z0), G.v3(b.x0, b.y + h, b.z1)];
    } else if (side === 'zmax') {
      lo = [G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0)];
      hi = [G.v3(b.x0, b.y + h, b.z1), G.v3(b.x1, b.y + h, b.z1)];
    } else {
      lo = [G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1)];
      hi = [G.v3(b.x0, b.y + h, b.z0), G.v3(b.x1, b.y + h, b.z0)];
    }
    const plane = [lo[0], lo[1], hi[1], hi[0]];
    const q = proj(R, plane);
    if (visiblePlane(R, plane[0], plane[1], plane[2])) {
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      slopeHatch(ctx, pens, q, rng, p, R.roof.seamGap);
    }
    S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.95 });
    // the two triangular end walls
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    [[lo[0], hi[0]], [lo[1], hi[1]]].forEach(function (pair) {
      const foot = G.v3(pair[1].x, b.y, pair[1].z);
      const tri = [P(pair[0]), P(pair[1]), P(foot)];
      S.strokePath(ctx, pens.detail, [tri[1], tri[2]], { lod: p.lod, width: 0.8 });
      S.strokePath(ctx, pens.detail, [tri[2], tri[0]], { lod: p.lod, width: 0.8 });
    });
    S.strokePath(ctx, pens.outline, [P(hi[0]), P(hi[1])], { lod: p.lod });
  }

  // --- barrel vault ---------------------------------------------------------
  function roofBarrel(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const segs = p.lod >= 0.7 ? 14 : 7;

    // cross-section arc at parameter t along the ridge axis
    const arcAt = function (t) {
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI - (Math.PI * i) / segs;
        const cs = Math.cos(a), sn = Math.sin(a);
        if (alongZ) {
          const x = (b.x0 + b.x1) / 2 + cs * (b.w / 2);
          pts.push(G.v3(x, b.y + sn * h, b.z0 + (b.z1 - b.z0) * t));
        } else {
          const z = (b.z0 + b.z1) / 2 + cs * (b.d / 2);
          pts.push(G.v3(b.x0 + (b.x1 - b.x0) * t, b.y + sn * h, z));
        }
      }
      return pts;
    };

    const a0 = arcAt(0), a1 = arcAt(1);
    // shell fill + shading between the two end arcs
    const shell = a0.concat(a1.slice().reverse());
    const shell2 = proj(R, shell);
    accentPoly(ctx, shell2, R.roof.accent, rng);
    if (p.lod >= 0.5) {
      const nSeam = p.lod >= 0.8 ? 4 : 2;
      for (let k = 1; k <= nSeam; k++) {
        const seam = proj(R, arcAt(k / (nSeam + 1)));
        S.strokePath(ctx, pens.hatch, seam, { lod: p.lod, alpha: 0.55, width: 0.9 });
      }
    }
    S.strokePath(ctx, pens.outline, proj(R, a0), { lod: p.lod, width: 0.95 });
    S.strokePath(ctx, pens.outline, proj(R, a1), { lod: p.lod, width: 0.95 });
    // ridge + eaves
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    const mid = Math.floor(segs / 2);
    S.strokePath(ctx, pens.outline, [P(a0[mid]), P(a1[mid])], { lod: p.lod });
    S.strokePath(ctx, pens.detail, [P(a0[0]), P(a1[0])], { lod: p.lod, width: 0.85 });
    S.strokePath(ctx, pens.detail, [P(a0[segs]), P(a1[segs])], { lod: p.lod, width: 0.85 });
  }

  // --- broad overhanging eaves ---------------------------------------------
  // A shallow double-pitch whose eaves reach well past the wall and lift a
  // little at the ends, with a fascia band and exposed rafter ends beneath.
  function roofBroadEave(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const up = R.roof.upturn == null ? 0.22 : R.roof.upturn;
    const n = p.lod >= 0.6 ? 6 : 3;
    const P = function (v) { return R.P(v.x, v.y, v.z); };

    // eave polyline for one slope: lifts quadratically toward both ends
    const eave = function (sideSign) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const lift = up * (2 * t - 1) * (2 * t - 1);
        if (alongZ) {
          pts.push(G.v3(sideSign > 0 ? b.x1 : b.x0, b.y + lift, b.z0 + (b.z1 - b.z0) * t));
        } else {
          pts.push(G.v3(b.x0 + (b.x1 - b.x0) * t, b.y + lift, sideSign > 0 ? b.z1 : b.z0));
        }
      }
      return pts;
    };
    const ridge = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (alongZ) {
        ridge.push(G.v3((b.x0 + b.x1) / 2, b.y + h, b.z0 + (b.z1 - b.z0) * t));
      } else {
        ridge.push(G.v3(b.x0 + (b.x1 - b.x0) * t, b.y + h, b.z0 + (b.z1 - b.z0) / 2));
      }
    }

    const fascia = Math.max(0.14, Math.min(0.45, h * 0.2));
    [1, -1].forEach(function (side) {
      const ev = eave(side);
      const slope = [ev[0], ev[n], ridge[n], ridge[0]];
      if (!visiblePlane(R, slope[0], slope[1], slope[2])) return;
      const q = proj(R, ev.concat(ridge.slice().reverse()));
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      slopeHatch(ctx, pens, proj(R, slope), rng, p, R.roof.seamGap * 1.4);
      S.strokePath(ctx, pens.detail, proj(R, ev), { lod: p.lod, width: 0.95 });
      // fascia band under the overhang + rafter ends
      const low = ev.map(function (v) { return G.v3(v.x, v.y - fascia, v.z); });
      S.strokePath(ctx, pens.detail, proj(R, low), { lod: p.lod, width: 0.8 });
      if (p.lod >= 0.6) {
        const step = Math.max(1, Math.round(n / 4));
        for (let i = 0; i <= n; i += step) {
          S.strokePath(ctx, pens.hair, [P(ev[i]), P(low[i])], { lod: p.lod, alpha: 0.8 });
        }
      }
    });

    S.strokePath(ctx, pens.outline, proj(R, ridge), { lod: p.lod });
    // gable ends: ridge tip down to both lifted eave corners
    const e1 = eave(1), e0 = eave(-1);
    [[0, ridge[0]], [n, ridge[n]]].forEach(function (end) {
      const i = end[0], r = end[1];
      S.strokePath(ctx, pens.detail, [P(e0[i]), P(r)], { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.detail, [P(e1[i]), P(r)], { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.hair, [P(e0[i]), P(e1[i])], { lod: p.lod, alpha: 0.7 });
    });
  }

  // --- swept eaves, lifted corners -----------------------------------------
  // A dished double pitch: the slope sags away from a high ridge, the eave line
  // lifts sharply at the two ends, and the covering reads as courses of tile
  // running down the fall. A broad East Asian temperament, not a copy of any
  // particular building.
  function roofSweptEave(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const up = (R.roof.upturn == null ? 0.22 : R.roof.upturn) * 2.4 + h * 0.12;
    const n = p.lod >= 0.6 ? 10 : 5;
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    const mid = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };

    // lift(t): flat along the middle of the eave, rising hard at both ends
    const lift = function (t) {
      const k = 2 * t - 1;
      return up * k * k * k * k;
    };
    // surface point: t runs along the ridge, s crosses the slope (0 eave, 1 ridge)
    const surf = function (side, t, s) {
      const eaveY = b.y + lift(t);
      const y = eaveY + (b.y + h - eaveY) * Math.pow(s, 1.75);
      if (alongZ) {
        const ex = side > 0 ? b.x1 : b.x0;
        return G.v3(ex + (mid.x - ex) * s, y, b.z0 + (b.z1 - b.z0) * t);
      }
      const ez = side > 0 ? b.z1 : b.z0;
      return G.v3(b.x0 + (b.x1 - b.x0) * t, y, ez + (mid.z - ez) * s);
    };
    const rowAt = function (side, s) {
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(surf(side, i / n, s));
      return pts;
    };

    const ridge = rowAt(1, 1);
    const fascia = Math.max(0.12, Math.min(0.4, h * 0.18));

    [1, -1].forEach(function (side) {
      const eave = rowAt(side, 0);
      if (!visiblePlane(R, surf(side, 0, 0), surf(side, 1, 0), surf(side, 1, 1))) return;
      const shell = proj(R, eave.concat(rowAt(side, 1).slice().reverse()));
      opaquePoly(ctx, R, shell);
      accentPoly(ctx, shell, R.roof.accent, rng);
      // courses following the eave
      if (p.lod >= 0.5) {
        const rows = p.lod >= 0.75 ? 3 : 2;
        for (let k = 1; k <= rows; k++) {
          S.strokePath(ctx, pens.hatch, proj(R, rowAt(side, k / (rows + 1))),
            { lod: p.lod, alpha: 0.45, width: 0.85, filament: 0 });
        }
      }
      // ribs running down the fall of the roof
      if (p.lod >= 0.6) {
        const ribs = p.lod >= 0.8 ? 7 : 4;
        for (let i = 1; i < ribs; i++) {
          const t = i / ribs;
          const rib = [];
          for (let k = 0; k <= 4; k++) rib.push(surf(side, t, k / 4));
          S.strokePath(ctx, pens.hair, proj(R, rib), { lod: p.lod, alpha: 0.6, filament: 0 });
        }
      }
      // the eave itself, its fascia board, and the flared corner tips
      S.strokePath(ctx, pens.outline, proj(R, eave), { lod: p.lod, width: 0.95, filament: 0 });
      const low = eave.map(function (v) { return G.v3(v.x, v.y - fascia, v.z); });
      S.strokePath(ctx, pens.detail, proj(R, low), { lod: p.lod, width: 0.8, filament: 0 });
      [0, n].forEach(function (i) {
        const tip = P(eave[i]);
        const inn = P(eave[i === 0 ? 1 : n - 1]);
        const dx = tip.x - inn.x, dy = tip.y - inn.y;
        const l = Math.hypot(dx, dy) || 1;
        S.strokePath(ctx, pens.detail, [
          P(low[i]), tip,
          { x: tip.x + (dx / l) * 5, y: tip.y + (dy / l) * 5 - 5 }
        ], { lod: p.lod, width: 0.85 });
      });
    });

    // ridge: a capped band with a small upturn at each end
    S.strokePath(ctx, pens.outline, proj(R, ridge), { lod: p.lod, filament: 0 });
    const r2 = proj(R, ridge);
    S.strokePath(ctx, pens.hair, r2.map(function (q) { return { x: q.x, y: q.y - 2.8 }; }),
      { lod: p.lod, alpha: 0.75, filament: 0 });
    [0, n].forEach(function (i) {
      const a = r2[i], c = r2[i === 0 ? 1 : n - 1];
      const dx = a.x - c.x, dy = a.y - c.y;
      const l = Math.hypot(dx, dy) || 1;
      S.strokePath(ctx, pens.detail, [
        { x: a.x, y: a.y + 1 },
        { x: a.x + (dx / l) * 4, y: a.y + (dy / l) * 4 - 6 }
      ], { lod: p.lod, width: 0.8 });
    });
    // gable ends: ridge tip down to both lifted eave corners
    [0, n].forEach(function (i) {
      const e1 = P(surf(1, i / n, 0)), e0 = P(surf(-1, i / n, 0));
      S.strokePath(ctx, pens.detail, [e0, r2[i]], { lod: p.lod, width: 0.85 });
      S.strokePath(ctx, pens.detail, [e1, r2[i]], { lod: p.lod, width: 0.85 });
    });
  }

  // --- low pediment over an entablature ------------------------------------
  // A shallow gable whose ends read as a framed triangular field above a
  // banded cornice with dentils — the classical temperament, generically.
  function roofPediment(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const xm = (b.x0 + b.x1) / 2, zm = (b.z0 + b.z1) / 2;
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    let ra, rb, e0, e1;
    if (alongZ) {
      ra = G.v3(xm, b.y + h, b.z0); rb = G.v3(xm, b.y + h, b.z1);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x0, b.y, b.z1)];
      e1 = [G.v3(b.x1, b.y, b.z0), G.v3(b.x1, b.y, b.z1)];
    } else {
      ra = G.v3(b.x0, b.y + h, zm); rb = G.v3(b.x1, b.y + h, zm);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0)];
      e1 = [G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1)];
    }
    [[e0[0], e0[1], rb, ra], [e1[1], e1[0], ra, rb]].forEach(function (sl) {
      if (!visiblePlane(R, sl[0], sl[1], sl[2])) return;
      const q = proj(R, sl);
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      if (p.lod >= 0.5) {
        S.hatchQuad(ctx, pens.hatch, q, {
          angle: 0.02, gap: R.roof.tileGap == null ? 0.12 : R.roof.tileGap,
          lod: p.lod, alpha: 0.45, max: p.lod >= 0.8 ? 8 : 4, jitter: 0.02
        });
      }
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9, overshoot: 0.12 });
    });
    S.strokePath(ctx, pens.outline, [P(ra), P(rb)], { lod: p.lod });

    // the two gable fields, each framed by a raking cornice
    [[ra, e0[0], e1[0]], [rb, e0[1], e1[1]]].forEach(function (tri) {
      const q = proj(R, tri);
      opaquePoly(ctx, R, q);
      const cx = (q[0].x + q[1].x + q[2].x) / 3, cy = (q[0].y + q[1].y + q[2].y) / 3;
      S.strokePath(ctx, pens.outline, [q[1], q[0]], { lod: p.lod, width: 0.95 });
      S.strokePath(ctx, pens.outline, [q[2], q[0]], { lod: p.lod, width: 0.95 });
      if (p.lod >= 0.55) {
        // tympanum: the field set back inside the raking cornice
        const inner = q.map(function (pt) {
          return { x: pt.x + (cx - pt.x) * 0.16, y: pt.y + (cy - pt.y) * 0.16 };
        });
        S.strokePath(ctx, pens.hair, [inner[1], inner[0], inner[2]],
          { lod: p.lod, alpha: 0.8, filament: 0 });
        if (p.lod >= 0.75 && rng.chance(0.6)) {
          S.scribbleFill(ctx, pens.hair, [
            inner[1], inner[2],
            { x: inner[2].x + (inner[0].x - inner[2].x) * 0.45, y: inner[2].y + (inner[0].y - inner[2].y) * 0.45 },
            { x: inner[1].x + (inner[0].x - inner[1].x) * 0.45, y: inner[1].y + (inner[0].y - inner[1].y) * 0.45 }
          ], { density: rng.int(5, 9), lod: p.lod, width: 0.7, alpha: 0.4 });
        }
      }
      // the cornice band carrying the pediment, with dentils under it
      const band = Math.max(2.5, R.pxPerUnit * 0.16);
      const c0 = { x: q[1].x, y: q[1].y }, c1 = { x: q[2].x, y: q[2].y };
      S.strokePath(ctx, pens.detail, [c0, c1], { lod: p.lod, width: 0.9 });
      S.strokePath(ctx, pens.detail,
        [{ x: c0.x, y: c0.y + band }, { x: c1.x, y: c1.y + band }],
        { lod: p.lod, width: 0.8 });
      if (p.lod >= 0.65) {
        const n = rng.int(6, 12);
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const x = c0.x + (c1.x - c0.x) * t, y = c0.y + (c1.y - c0.y) * t;
          S.strokePath(ctx, pens.hair, [{ x: x, y: y + 1 }, { x: x, y: y + band - 0.5 }],
            { lod: p.lod, alpha: 0.75 });
        }
      }
    });
  }

  // --- hip planes, shared by hipped-family roofs ---------------------------
  function hipPlanes(b, h, alongZ, inset) {
    let ra, rb;
    if (alongZ) {
      ra = G.v3((b.x0 + b.x1) / 2, b.y + h, b.z0 + b.d * inset);
      rb = G.v3((b.x0 + b.x1) / 2, b.y + h, b.z1 - b.d * inset);
    } else {
      ra = G.v3(b.x0 + b.w * inset, b.y + h, (b.z0 + b.z1) / 2);
      rb = G.v3(b.x1 - b.w * inset, b.y + h, (b.z0 + b.z1) / 2);
    }
    const c = [
      G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0),
      G.v3(b.x1, b.y, b.z1), G.v3(b.x0, b.y, b.z1)
    ];
    const planes = alongZ
      ? [[c[0], c[3], rb, ra], [c[2], c[1], ra, rb], [c[1], c[0], ra, ra], [c[3], c[2], rb, rb]]
      : [[c[0], c[1], rb, ra], [c[2], c[3], ra, rb], [c[3], c[0], ra, ra], [c[1], c[2], rb, rb]];
    return { planes: planes, ra: ra, rb: rb, corners: c };
  }

  // --- pantiled pitch -------------------------------------------------------
  // Hipped, but read as a tiled roof: courses run parallel to the eave, the
  // ridge carries a capping line and the eave shows its tile ends.
  function roofPantile(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const hp = hipPlanes(b, h, alongZ, 0.2);
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    const gap = R.roof.tileGap == null ? 0.11 : R.roof.tileGap;

    hp.planes.forEach(function (pl) {
      if (!visiblePlane(R, pl[0], pl[1], pl[2])) return;
      const q = proj(R, pl);
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      if (p.lod >= 0.5) {
        // courses parallel to the eave (u runs along the eave in this quad)
        S.hatchQuad(ctx, pens.hatch, q, {
          angle: 0.02, gap: gap, lod: p.lod, alpha: 0.55,
          max: p.lod >= 0.8 ? 9 : 4, jitter: 0.02
        });
      }
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.85, overshoot: 0.12 });
      // tile ends along the eave
      if (p.lod >= 0.7) {
        const n = 6;
        for (let i = 1; i < n; i++) {
          S.strokePath(ctx, pens.hair,
            [S.quadPt(q, i / n, 0), S.quadPt(q, i / n, 0.13)], { lod: p.lod, alpha: 0.7 });
        }
      }
    });

    // ridge capping: a doubled line with course ticks
    const rA = P(hp.ra), rB = P(hp.rb);
    S.strokePath(ctx, pens.outline, [rA, rB], { lod: p.lod });
    S.strokePath(ctx, pens.hair, [{ x: rA.x, y: rA.y - 2.2 }, { x: rB.x, y: rB.y - 2.2 }],
      { lod: p.lod, alpha: 0.75 });
    if (p.lod >= 0.65) {
      const n = rng.int(4, 7);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = rA.x + (rB.x - rA.x) * t, y = rA.y + (rB.y - rA.y) * t;
        S.strokePath(ctx, pens.hair, [{ x: x, y: y }, { x: x, y: y - 2.4 }], { lod: p.lod, alpha: 0.8 });
      }
    }
    const c2 = proj(R, hp.corners);
    S.strokePoly(ctx, pens.detail, c2, { lod: p.lod, width: 0.85 });
  }

  // --- stepped / ornamented parapet ----------------------------------------
  // Flat roof crowned by two or three inset blocks — the setback silhouette,
  // with shallow fluting on the faces that read.
  function roofStepped(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const steps = Math.max(2, Math.min(4, R.roof.steps || 3));
    const shrink = Math.min(b.w, b.d) * 0.11;
    const topVisible = G.facing(G.v3(0, 1, 0), R.cam) > 0.02;

    for (let k = 0; k < steps; k++) {
      const in0 = shrink * k;
      const y0 = b.y + (h * k) / steps;
      const y1 = b.y + (h * (k + 1)) / steps;
      const x0 = b.x0 + in0, x1 = b.x1 - in0, z0 = b.z0 + in0, z1 = b.z1 - in0;
      if (x1 - x0 < 0.4 || z1 - z0 < 0.4) break;
      const top = [
        G.v3(x0, y1, z1), G.v3(x1, y1, z1), G.v3(x1, y1, z0), G.v3(x0, y1, z0)
      ];
      const t2 = proj(R, top);
      const bot = proj(R, top.map(function (v) { return G.v3(v.x, y0, v.z); }));
      if (k === 0) accentPoly(ctx, t2, R.roof.accent, rng);
      // the block's vertical faces
      for (let i = 0; i < 4; i++) {
        S.strokePath(ctx, pens.detail, [bot[i], t2[i]], { lod: p.lod, width: 0.8 });
      }
      S.strokePoly(ctx, pens.detail, bot, { lod: p.lod, width: 0.8 });
      if (topVisible || k === steps - 1) S.strokePoly(ctx, pens.outline, t2, { lod: p.lod, width: 0.9 });
      // fluting, only on the faces actually turned toward the viewer
      if (p.lod >= 0.65) {
        for (let i = 0; i < 4; i++) {
          const A = top[i], B = top[(i + 1) % 4];
          const outward = G.v3(-(B.z - A.z), 0, B.x - A.x);
          if (G.facing(outward, R.cam) <= 0.05) continue;
          const face = [bot[i], bot[(i + 1) % 4], t2[(i + 1) % 4], t2[i]];
          if (!S.quadOk(face)) continue;
          const n = rng.int(3, 6);
          for (let f = 1; f < n; f++) {
            S.strokePath(ctx, pens.hair,
              [S.quadPt(face, f / n, 0.12), S.quadPt(face, f / n, 0.88)],
              { lod: p.lod, alpha: 0.7 });
          }
        }
      }
    }
  }

  // --- steep timber gable ---------------------------------------------------
  // A tall pitch with projecting bargeboards, a ridge board and vertical
  // boarding on the gable ends.
  function roofSteepGable(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const alongZ = R.roof.ridgeAxis === 'z';
    const xm = (b.x0 + b.x1) / 2, zm = (b.z0 + b.z1) / 2;
    let ra, rb, e0, e1;
    if (alongZ) {
      ra = G.v3(xm, b.y + h, b.z0); rb = G.v3(xm, b.y + h, b.z1);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x0, b.y, b.z1)];
      e1 = [G.v3(b.x1, b.y, b.z0), G.v3(b.x1, b.y, b.z1)];
    } else {
      ra = G.v3(b.x0, b.y + h, zm); rb = G.v3(b.x1, b.y + h, zm);
      e0 = [G.v3(b.x0, b.y, b.z0), G.v3(b.x1, b.y, b.z0)];
      e1 = [G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1)];
    }
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    [[e0[0], e0[1], rb, ra], [e1[1], e1[0], ra, rb]].forEach(function (sl) {
      if (!visiblePlane(R, sl[0], sl[1], sl[2])) return;
      const q = proj(R, sl);
      opaquePoly(ctx, R, q);
      accentPoly(ctx, q, R.roof.accent, rng);
      if (p.lod >= 0.5) {
        // boards running up the slope
        S.hatchQuad(ctx, pens.hatch, q, {
          angle: 1.52, gap: R.roof.seamGap * 1.2, lod: p.lod, alpha: 0.5,
          max: p.lod >= 0.8 ? 12 : 6
        });
      }
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9, overshoot: 0.14 });
    });
    // ridge board: two close lines
    S.strokePath(ctx, pens.outline, [P(ra), P(rb)], { lod: p.lod });
    S.strokePath(ctx, pens.hair, [{ x: P(ra).x, y: P(ra).y - 2.6 }, { x: P(rb).x, y: P(rb).y - 2.6 }],
      { lod: p.lod, alpha: 0.75 });

    [[ra, e0[0], e1[0]], [rb, e0[1], e1[1]]].forEach(function (tri) {
      const q = proj(R, tri);
      opaquePoly(ctx, R, q);
      // bargeboards: the gable edge doubled slightly outside itself
      [[q[1], q[0]], [q[2], q[0]]].forEach(function (edge) {
        S.strokePath(ctx, pens.outline, edge, { lod: p.lod, width: 0.95 });
        if (p.lod >= 0.6) {
          const dx = (edge[0].x - edge[1].x), dy = (edge[0].y - edge[1].y);
          const l = Math.hypot(dx, dy) || 1;
          const ox = (-dy / l) * 2.6, oy = (dx / l) * 2.6;
          S.strokePath(ctx, pens.hair,
            [{ x: edge[0].x + ox, y: edge[0].y + oy }, { x: edge[1].x + ox, y: edge[1].y + oy }],
            { lod: p.lod, alpha: 0.7 });
        }
      });
      S.strokePath(ctx, pens.detail, [q[1], q[2]], { lod: p.lod, width: 0.8 });
      if (p.lod >= 0.7 && rng.chance(0.7)) {
        // small vent slot in the gable
        const c = { x: (q[1].x + q[2].x) / 2, y: (q[0].y + (q[1].y + q[2].y) / 2) / 2 };
        S.strokeEllipse(ctx, pens.hair, c.x, c.y, 3.4, 2.6, { lod: p.lod });
      }
    });
  }

  // --- crenellated parapet --------------------------------------------------
  // Flat deck behind a notched parapet, with a string course under the notches.
  function roofCrenellated(ctx, R, pens, rng, p) {
    const b = box(R), h = R.roof.h;
    const merlons = Math.max(2, Math.min(9, R.roof.merlons || 5));
    const deck = [
      G.v3(b.x0, b.y, b.z1), G.v3(b.x1, b.y, b.z1),
      G.v3(b.x1, b.y, b.z0), G.v3(b.x0, b.y, b.z0)
    ];
    const d2 = proj(R, deck);
    if (G.facing(G.v3(0, 1, 0), R.cam) > 0.02) {
      accentPoly(ctx, d2, R.roof.accent, rng);
      if (p.lod >= 0.55) {
        S.hatchQuad(ctx, pens.hatch, d2, {
          angle: 0.5, gap: 0.26, lod: p.lod, alpha: 0.3, max: 5
        });
      }
    }
    S.strokePoly(ctx, pens.detail, d2, { lod: p.lod, width: 0.85 });

    const low = b.y + h * 0.42;
    const top = b.y + h;
    for (let e = 0; e < 4; e++) {
      const A = deck[e], B = deck[(e + 1) % 4];
      const n = Math.max(2, Math.round(merlons *
        (Math.hypot(B.x - A.x, B.z - A.z) / Math.max(b.w, b.d))));
      const at = function (t, y) {
        return G.v3(A.x + (B.x - A.x) * t, y, A.z + (B.z - A.z) * t);
      };
      const path = [at(0, low)];
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 0.62) / n;
        path.push(at(t0, low), at(t0, top), at(t1, top), at(t1, low));
      }
      path.push(at(1, low));
      S.strokePath(ctx, pens.detail, proj(R, path), { lod: p.lod, width: 0.85, filament: 0 });
      // string course carrying the parapet
      S.strokePath(ctx, pens.hair, proj(R, [at(0, low - h * 0.16), at(1, low - h * 0.16)]),
        { lod: p.lod, alpha: 0.75 });
    }
  }

  NS.roofs = {
    flat: roofFlat,
    gabled: roofGabled,
    hipped: roofHipped,
    shed: roofShed,
    barrel: roofBarrel,
    broadEave: roofBroadEave,
    pantile: roofPantile,
    steppedParapet: roofStepped,
    steepGable: roofSteepGable,
    crenellated: roofCrenellated,
    sweptEave: roofSweptEave,
    pediment: roofPediment
  };
  NS.roofNames = ['flat', 'gabled', 'hipped', 'shed', 'barrel',
    'broadEave', 'pantile', 'steppedParapet', 'steepGable', 'crenellated',
    'sweptEave', 'pediment'];

  /** roofHeight — how far the roof rises above its prism, used for fit-to-rect. */
  NS.roofHeight = function (variant, pr, rng) {
    const small = Math.min(pr.w, pr.d);
    switch (variant) {
      case 'flat': return rng.range(0.35, 0.75);
      case 'gabled': return small * rng.range(0.3, 0.52);
      case 'hipped': return small * rng.range(0.26, 0.42);
      case 'shed': return small * rng.range(0.22, 0.4);
      case 'barrel': return small * rng.range(0.3, 0.46);
      case 'broadEave': return small * rng.range(0.22, 0.34);
      case 'pantile': return small * rng.range(0.28, 0.44);
      case 'steppedParapet': return rng.range(1.1, 2.4);
      case 'steepGable': return small * rng.range(0.55, 0.85);
      case 'crenellated': return rng.range(0.8, 1.5);
      case 'sweptEave': return small * rng.range(0.26, 0.4);
      case 'pediment': return small * rng.range(0.17, 0.27);
      default: return 0.5;
    }
  };

  NS.planeNormal = planeNormal;
  NS.projPts = proj;
  NS.accentPoly = accentPoly;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.roofs = NS;
})();

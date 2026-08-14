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
      accentPoly(ctx, q, R.roof.accent, rng);
      slopeHatch(ctx, pens, q, rng, p, R.roof.seamGap);
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.9, overshoot: 0.15 });
    });
    const P = function (v) { return R.P(v.x, v.y, v.z); };
    S.strokePath(ctx, pens.outline, [P(ra), P(rb)], { lod: p.lod });
    // gable triangles at both ends
    [[ra, e0[0], e1[0]], [rb, e0[1], e1[1]]].forEach(function (tri) {
      const q = proj(R, tri);
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

  NS.roofs = {
    flat: roofFlat,
    gabled: roofGabled,
    hipped: roofHipped,
    shed: roofShed,
    barrel: roofBarrel
  };
  NS.roofNames = ['flat', 'gabled', 'hipped', 'shed', 'barrel'];

  /** roofHeight — how far the roof rises above its prism, used for fit-to-rect. */
  NS.roofHeight = function (variant, pr, rng) {
    const small = Math.min(pr.w, pr.d);
    switch (variant) {
      case 'flat': return rng.range(0.35, 0.75);
      case 'gabled': return small * rng.range(0.3, 0.52);
      case 'hipped': return small * rng.range(0.26, 0.42);
      case 'shed': return small * rng.range(0.22, 0.4);
      case 'barrel': return small * rng.range(0.3, 0.46);
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

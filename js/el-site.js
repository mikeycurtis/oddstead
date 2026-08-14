// js/el-site.js — the ground and everything standing on it.
//
// Site elements live in world space on the ground plane (y = 0) and project
// through R.P, so a tree planted beside the building stays beside it when the
// camera orbits.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const G = AD.geom;

  function worldPath(R, pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) out.push(R.P(pts[i].x, pts[i].y, pts[i].z));
    return out;
  }

  /** Long wobbly ground line running past the building. */
  function groundLine(ctx, R, pens, rng, p, spec) {
    const half = spec.reach;
    const z = spec.z;
    const n = 8;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = -half + (2 * half * i) / n;
      pts.push({ x: x, y: rng.range(-0.04, 0.04), z: z + rng.range(-0.12, 0.12) });
    }
    S.strokePath(ctx, pens.outline, worldPath(R, pts), { lod: p.lod, width: 0.95 });
    if (p.lod >= 0.55 && rng.chance(0.75)) {
      const pts2 = pts.map(function (q) {
        return { x: q.x * rng.range(0.75, 0.95), y: -0.12, z: z + rng.range(0.3, 0.8) };
      });
      S.strokePath(ctx, pens.hair, worldPath(R, pts2), { lod: p.lod, alpha: 0.65 });
    }
  }

  /** Sidewalk ticks in front of the building. */
  function sidewalk(ctx, R, pens, rng, p, spec) {
    if (p.lod < 0.5) return;
    const n = Math.round(rng.range(5, 11));
    for (let i = 0; i < n; i++) {
      const x = rng.range(-spec.reach * 0.85, spec.reach * 0.85);
      const z = spec.z + rng.range(0.5, 2.2);
      S.strokePath(ctx, pens.hair, worldPath(R, [
        { x: x, y: 0, z: z }, { x: x + rng.range(-0.5, 0.5), y: 0, z: z + rng.range(0.6, 1.4) }
      ]), { lod: p.lod, alpha: 0.55 });
    }
  }

  /** Plinth / steps: nested rings at the base of a prism. */
  function plinth(ctx, R, pens, rng, p, spec) {
    const pr = spec.prism;
    const n = spec.steps;
    for (let i = n; i >= 1; i--) {
      const g = spec.grow * i;
      const y = spec.rise * i;
      const ring = [
        { x: pr.x - g, y: y, z: pr.z + pr.d + g },
        { x: pr.x + pr.w + g, y: y, z: pr.z + pr.d + g },
        { x: pr.x + pr.w + g, y: y, z: pr.z - g },
        { x: pr.x - g, y: y, z: pr.z - g }
      ];
      const q = worldPath(R, ring);
      S.strokePoly(ctx, pens.detail, q, { lod: p.lod, width: 0.85 });
      // vertical risers at the two front corners
      S.strokePath(ctx, pens.hair, [q[0], R.P(ring[0].x, y - spec.rise, ring[0].z)],
        { lod: p.lod });
      S.strokePath(ctx, pens.hair, [q[1], R.P(ring[1].x, y - spec.rise, ring[1].z)],
        { lod: p.lod });
    }
  }

  /** Fence run: posts with one or two rails. */
  function fence(ctx, R, pens, rng, p, spec) {
    const n = Math.max(3, Math.round(spec.length / spec.spacing));
    const tops = [], bots = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = spec.x0 + (spec.x1 - spec.x0) * t;
      const z = spec.z0 + (spec.z1 - spec.z0) * t + rng.range(-0.1, 0.1);
      const h = spec.height * rng.range(0.9, 1.1);
      const b = R.P(x, 0, z), tp = R.P(x, h, z);
      bots.push(b); tops.push(tp);
      S.strokePath(ctx, pens.detail, [b, tp], { lod: p.lod, width: 0.7 });
    }
    const rails = spec.rails || 2;
    for (let r = 1; r <= rails; r++) {
      const f = r / (rails + 1);
      const line = tops.map(function (t, i) {
        return { x: bots[i].x + (t.x - bots[i].x) * (1 - f * 0.55), y: bots[i].y + (t.y - bots[i].y) * (1 - f * 0.55) };
      });
      S.strokePath(ctx, pens.hair, line, { lod: p.lod, alpha: 0.85 });
    }
  }

  /** Round-canopy tree. */
  function treeRound(ctx, R, pens, rng, p, spec) {
    const base = R.P(spec.x, 0, spec.z);
    const top = R.P(spec.x, spec.h, spec.z);
    const trunkW = Math.max(1, spec.h * R.pxPerUnit * 0.035);
    S.strokePath(ctx, pens.detail, [{ x: base.x - trunkW, y: base.y }, { x: top.x - trunkW * 0.6, y: top.y }],
      { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [{ x: base.x + trunkW, y: base.y }, { x: top.x + trunkW * 0.6, y: top.y }],
      { lod: p.lod, width: 0.9 });
    const r = spec.h * R.pxPerUnit * rng.range(0.32, 0.46);
    const cy = top.y - r * 0.55;
    // lumpy canopy: a closed wobbled blob, not a circle
    const lobes = rng.int(7, 11);
    const pts = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const rr = r * rng.range(0.78, 1.18);
      pts.push({ x: top.x + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.9 });
    }
    if (p.vegAccent) S.polyFill(ctx, pts, p.vegAccent, 0.26);
    S.strokePath(ctx, pens.detail, pts, { lod: p.lod, close: true, width: 0.95 });
    if (p.lod >= 0.6) {
      S.scribbleFill(ctx, pens.hatch, [
        { x: top.x - r * 0.8, y: cy + r * 0.5 }, { x: top.x + r * 0.2, y: cy + r * 0.65 },
        { x: top.x + r * 0.2, y: cy - r * 0.5 }, { x: top.x - r * 0.8, y: cy - r * 0.35 }
      ], { density: Math.round(rng.range(6, 12)), lod: p.lod, width: 0.85, alpha: 0.6 });
    }
  }

  /** Tall narrow cypress. */
  function cypress(ctx, R, pens, rng, p, spec) {
    const base = R.P(spec.x, 0, spec.z);
    const top = R.P(spec.x, spec.h, spec.z);
    const w = spec.h * R.pxPerUnit * rng.range(0.1, 0.16);
    const n = p.lod >= 0.7 ? 9 : 5;
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = base.x + (top.x - base.x) * t;
      const y = base.y + (top.y - base.y) * t;
      const spread = Math.sin(Math.PI * Math.min(1, t * 1.15)) * w * (1 - t * 0.35) + 0.5;
      left.push({ x: x - spread + rng.range(-1, 1), y: y });
      right.push({ x: x + spread + rng.range(-1, 1), y: y });
    }
    const ring = left.concat(right.slice().reverse());
    if (p.vegAccent) S.polyFill(ctx, ring, p.vegAccent, 0.24);
    S.strokePath(ctx, pens.detail, left, { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, right, { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [left[0], right[0]], { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.65) {
      S.scribbleFill(ctx, pens.hatch, [
        left[1], right[1], right[n - 1], left[n - 1]
      ], { density: Math.round(rng.range(7, 13)), lod: p.lod, width: 0.8, alpha: 0.55 });
    }
  }

  /** Low bush / shrub clump. */
  function bush(ctx, R, pens, rng, p, spec) {
    const base = R.P(spec.x, 0, spec.z);
    const r = spec.h * R.pxPerUnit * rng.range(0.5, 0.8);
    const lobes = rng.int(5, 8);
    const pts = [];
    for (let i = 0; i < lobes; i++) {
      const a = Math.PI + (i / (lobes - 1)) * Math.PI;
      const rr = r * rng.range(0.75, 1.15);
      pts.push({ x: base.x + Math.cos(a) * rr, y: base.y + Math.sin(a) * rr * 0.75 });
    }
    pts.push({ x: base.x + r * 0.9, y: base.y });
    pts.unshift({ x: base.x - r * 0.9, y: base.y });
    if (p.vegAccent) S.polyFill(ctx, pts, p.vegAccent, 0.24);
    S.strokePath(ctx, pens.detail, pts, { lod: p.lod, width: 0.85 });
    if (p.lod >= 0.65) {
      S.scribbleFill(ctx, pens.hatch, [
        { x: base.x - r * 0.7, y: base.y }, { x: base.x + r * 0.7, y: base.y },
        { x: base.x + r * 0.5, y: base.y - r * 0.7 }, { x: base.x - r * 0.5, y: base.y - r * 0.7 }
      ], { density: Math.round(rng.range(5, 10)), lod: p.lod, width: 0.8, alpha: 0.55 });
    }
  }

  NS.trees = { round: treeRound, cypress: cypress, bush: bush };
  NS.treeNames = ['round', 'cypress', 'bush'];

  /** Two-stroke birds in the sky. */
  function birds(ctx, pens, rng, p, rect) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i++) {
      const x = rect.x0 + rng.range(0.08, 0.92) * rect.w;
      const y = rect.y0 + rng.range(0.02, 0.3) * rect.h;
      const s = rng.range(3.5, 8);
      S.strokePath(ctx, pens.hair, [
        { x: x - s, y: y }, { x: x - s * 0.35, y: y - s * 0.5 }, { x: x, y: y - s * 0.06 }
      ], { lod: p.lod, width: 1.1 });
      S.strokePath(ctx, pens.hair, [
        { x: x, y: y - s * 0.06 }, { x: x + s * 0.4, y: y - s * 0.55 }, { x: x + s, y: y }
      ], { lod: p.lod, width: 1.1 });
    }
  }

  /** Ground shadow: hatched parallelogram cast away from the light. */
  function groundShadow(ctx, R, pens, rng, p, spec) {
    const pr = spec.prism;
    const L = AD.style.light;
    const k = spec.length;
    const dx = -L.x * k, dz = -L.z * k;
    const ring = [
      { x: pr.x, y: 0.01, z: pr.z + pr.d },
      { x: pr.x + pr.w, y: 0.01, z: pr.z + pr.d },
      { x: pr.x + pr.w + dx, y: 0.01, z: pr.z + pr.d + dz },
      { x: pr.x + dx, y: 0.01, z: pr.z + pr.d + dz }
    ];
    const q = worldPath(R, ring);
    if (!S.quadOk(q)) return;
    S.hatchQuad(ctx, pens.hatch, q, {
      angle: 0.35, gap: 0.16, lod: p.lod, alpha: 0.4, max: p.lod >= 0.8 ? 9 : 4
    });
  }

  NS.groundLine = groundLine;
  NS.sidewalk = sidewalk;
  NS.plinth = plinth;
  NS.fence = fence;
  NS.birds = birds;
  NS.groundShadow = groundShadow;
  NS.worldPath = worldPath;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.site = NS;
})();

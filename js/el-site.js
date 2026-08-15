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

  /** Trunk helper: a slightly leaning, tapering stem from ground to crown. */
  function stem(ctx, R, pens, rng, p, spec, lean, thick) {
    const base = R.P(spec.x, 0, spec.z);
    const top = R.P(spec.x, spec.h, spec.z);
    const n = p.lod >= 0.6 ? 5 : 3;
    const bend = (top.x - base.x) * 0 + lean;
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = base.x + (top.x - base.x) * t + Math.sin(t * Math.PI * 0.5) * bend;
      const y = base.y + (top.y - base.y) * t;
      const w = thick * (1 - t * 0.45);
      left.push({ x: x - w, y: y });
      right.push({ x: x + w, y: y });
    }
    S.strokePath(ctx, pens.detail, left, { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, right, { lod: p.lod, width: 0.9 });
    return { crown: { x: (left[n].x + right[n].x) / 2, y: left[n].y }, left: left, right: right };
  }

  /** Palm: a leaning ringed trunk under a crown of arching fronds. */
  function palm(ctx, R, pens, rng, p, spec) {
    const thick = Math.max(1.1, spec.h * R.pxPerUnit * 0.022);
    const lean = spec.h * R.pxPerUnit * rng.range(-0.09, 0.09);
    const t = stem(ctx, R, pens, rng, p, spec, lean, thick);
    if (p.lod >= 0.6) {
      // ringed scars up the trunk
      const rings = rng.int(3, 6);
      for (let i = 1; i <= rings; i++) {
        const f = i / (rings + 1);
        const a = { x: t.left[0].x + (t.left[t.left.length - 1].x - t.left[0].x) * f,
          y: t.left[0].y + (t.left[t.left.length - 1].y - t.left[0].y) * f };
        const b = { x: t.right[0].x + (t.right[t.right.length - 1].x - t.right[0].x) * f,
          y: t.right[0].y + (t.right[t.right.length - 1].y - t.right[0].y) * f };
        S.strokePath(ctx, pens.hair, [a, b], { lod: p.lod, alpha: 0.6 });
      }
    }
    const c = t.crown;
    const span = spec.h * R.pxPerUnit * rng.range(0.26, 0.38);
    const fronds = rng.int(5, 8);
    for (let i = 0; i < fronds; i++) {
      const a = Math.PI + (Math.PI * (i + rng.range(0.1, 0.9))) / fronds;
      const ex = c.x + Math.cos(a) * span * rng.range(0.8, 1.15);
      const ey = c.y + Math.sin(a) * span * 0.55 + span * rng.range(0.1, 0.4);
      const mx = (c.x + ex) / 2, my = (c.y + ey) / 2 - span * rng.range(0.25, 0.45);
      const rib = [c, { x: mx, y: my }, { x: ex, y: ey }];
      if (p.vegAccent) {
        S.polyFill(ctx, [c, { x: mx, y: my - span * 0.12 }, { x: ex, y: ey },
          { x: mx, y: my + span * 0.12 }], p.vegAccent, 0.2);
      }
      S.strokePath(ctx, pens.detail, rib, { lod: p.lod, width: 0.85 });
      if (p.lod < 0.65) continue;
      // barbs along the frond
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        const bx = c.x + (ex - c.x) * f, by = c.y + (ey - c.y) * f - span * 0.2 * Math.sin(f * Math.PI);
        S.strokePath(ctx, pens.hair, [
          { x: bx, y: by }, { x: bx + rng.range(-3, 3), y: by + rng.range(2.5, 6) }
        ], { lod: p.lod, alpha: 0.7 });
      }
    }
  }

  /** Olive: a low forked trunk under two or three soft grey-green lobes. */
  function olive(ctx, R, pens, rng, p, spec) {
    const base = R.P(spec.x, 0, spec.z);
    const forkY = spec.h * 0.34;
    const fork = R.P(spec.x, forkY, spec.z);
    const w = Math.max(1.2, spec.h * R.pxPerUnit * 0.035);
    S.strokePath(ctx, pens.detail, [{ x: base.x - w, y: base.y }, { x: fork.x - w * 0.7, y: fork.y }],
      { lod: p.lod, width: 0.95 });
    S.strokePath(ctx, pens.detail, [{ x: base.x + w, y: base.y }, { x: fork.x + w * 0.7, y: fork.y }],
      { lod: p.lod, width: 0.95 });
    const arms = rng.int(2, 3);
    const spread = spec.h * R.pxPerUnit * rng.range(0.24, 0.36);
    for (let i = 0; i < arms; i++) {
      const dx = (i - (arms - 1) / 2) * spread * rng.range(0.8, 1.2);
      const cx = fork.x + dx;
      const cy = fork.y - spec.h * R.pxPerUnit * rng.range(0.28, 0.44);
      const r = spread * rng.range(0.62, 0.95);
      const lobes = rng.int(6, 9);
      const pts = [];
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * Math.PI * 2;
        const rr = r * rng.range(0.72, 1.14);
        pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.72 });
      }
      if (p.vegAccent) S.polyFill(ctx, pts, p.vegAccent, 0.22);
      S.strokePath(ctx, pens.detail, pts, { lod: p.lod, close: true, width: 0.85 });
      S.strokePath(ctx, pens.hair, [fork, { x: cx, y: cy + r * 0.5 }], { lod: p.lod, alpha: 0.8 });
      if (p.lod >= 0.65) {
        S.scribbleFill(ctx, pens.hatch, [
          { x: cx - r * 0.6, y: cy + r * 0.35 }, { x: cx + r * 0.35, y: cy + r * 0.4 },
          { x: cx + r * 0.35, y: cy - r * 0.3 }, { x: cx - r * 0.6, y: cy - r * 0.25 }
        ], { density: Math.round(rng.range(4, 8)), lod: p.lod, width: 0.8, alpha: 0.5 });
      }
    }
  }

  /** Bamboo: a handful of jointed culms with a few narrow leaves up top. */
  function bamboo(ctx, R, pens, rng, p, spec) {
    const culms = rng.int(3, 6);
    const spreadW = spec.h * R.pxPerUnit * 0.12;
    for (let i = 0; i < culms; i++) {
      const off = rng.range(-spreadW, spreadW);
      const hh = spec.h * rng.range(0.62, 1.05);
      const base = R.P(spec.x, 0, spec.z);
      const top = R.P(spec.x, hh, spec.z);
      const sway = rng.range(-5, 5);
      const a = { x: base.x + off, y: base.y };
      const b = { x: top.x + off + sway, y: top.y };
      S.strokePath(ctx, pens.detail, [a, { x: (a.x + b.x) / 2 + sway * 0.3, y: (a.y + b.y) / 2 }, b],
        { lod: p.lod, width: 0.8 });
      if (p.lod >= 0.6) {
        const nodes = rng.int(2, 4);
        for (let k = 1; k <= nodes; k++) {
          const f = k / (nodes + 1);
          const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
          S.strokePath(ctx, pens.hair, [{ x: x - 2, y: y }, { x: x + 2, y: y }],
            { lod: p.lod, alpha: 0.8 });
        }
        const leaves = rng.int(2, 4);
        for (let k = 0; k < leaves; k++) {
          const f = rng.range(0.55, 1);
          const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
          const dx = rng.range(6, 15) * (rng.chance(0.5) ? 1 : -1);
          const tip = { x: x + dx, y: y - rng.range(2, 9) };
          if (p.vegAccent) {
            S.polyFill(ctx, [{ x: x, y: y }, { x: (x + tip.x) / 2, y: (y + tip.y) / 2 - 2.5 },
              tip, { x: (x + tip.x) / 2, y: (y + tip.y) / 2 + 2.5 }], p.vegAccent, 0.22);
          }
          S.strokePath(ctx, pens.hair, [{ x: x, y: y }, tip], { lod: p.lod, alpha: 0.9 });
        }
      }
    }
  }

  /** Flowering tree: a light canopy stippled with blossom. */
  function flowering(ctx, R, pens, rng, p, spec) {
    const thick = Math.max(1, spec.h * R.pxPerUnit * 0.03);
    const t = stem(ctx, R, pens, rng, p, spec, spec.h * R.pxPerUnit * rng.range(-0.05, 0.05), thick);
    const c = t.crown;
    const r = spec.h * R.pxPerUnit * rng.range(0.3, 0.42);
    const cy = c.y - r * 0.45;
    const lobes = rng.int(8, 12);
    const pts = [];
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const rr = r * rng.range(0.7, 1.2);
      pts.push({ x: c.x + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.82 });
    }
    if (p.vegAccent) S.polyFill(ctx, pts, p.vegAccent, 0.2);
    S.strokePath(ctx, pens.detail, pts, { lod: p.lod, close: true, width: 0.9 });
    if (p.lod >= 0.55) {
      // a couple of branches reaching into the canopy
      for (let i = 0; i < 2; i++) {
        S.strokePath(ctx, pens.hair, [
          c, { x: c.x + rng.range(-r * 0.7, r * 0.7), y: cy + rng.range(-r * 0.4, r * 0.2) }
        ], { lod: p.lod, alpha: 0.8 });
      }
    }
    if (p.lod < 0.65) return;
    const blooms = rng.int(6, 12);
    for (let i = 0; i < blooms; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rr = r * rng.range(0.15, 0.95);
      const bx = c.x + Math.cos(a) * rr, by = cy + Math.sin(a) * rr * 0.8;
      S.strokeEllipse(ctx, pens.hair, bx, by, rng.range(1, 2.2), rng.range(1, 2.2), { lod: p.lod });
    }
    // a few petals on the ground below
    if (rng.chance(0.6)) {
      const base = R.P(spec.x, 0, spec.z);
      for (let i = 0; i < 4; i++) {
        const x = base.x + rng.range(-r, r), y = base.y + rng.range(-2, 3);
        S.strokePath(ctx, pens.hair, [{ x: x, y: y }, { x: x + rng.range(1, 3), y: y }],
          { lod: p.lod, alpha: 0.6 });
      }
    }
  }

  /** Conifer: stacked tiers of drooping branches on a straight leader. */
  function pine(ctx, R, pens, rng, p, spec) {
    const base = R.P(spec.x, 0, spec.z);
    const top = R.P(spec.x, spec.h, spec.z);
    const w = spec.h * R.pxPerUnit * rng.range(0.14, 0.22);
    S.strokePath(ctx, pens.detail, [{ x: base.x - 1.2, y: base.y }, { x: top.x - 0.6, y: top.y }],
      { lod: p.lod, width: 0.9 });
    S.strokePath(ctx, pens.detail, [{ x: base.x + 1.2, y: base.y }, { x: top.x + 0.6, y: top.y }],
      { lod: p.lod, width: 0.9 });
    const tiers = p.lod >= 0.6 ? rng.int(4, 6) : 3;
    const outline = [];
    for (let i = 0; i < tiers; i++) {
      const f0 = 0.12 + (0.88 * i) / tiers;
      const f1 = 0.12 + (0.88 * (i + 1)) / tiers;
      const y0 = base.y + (top.y - base.y) * f0;
      const y1 = base.y + (top.y - base.y) * f1;
      const x = base.x + (top.x - base.x) * f0;
      const spread = w * (1 - f0) * rng.range(0.85, 1.15) + 2;
      const tier = [
        { x: x - spread, y: y0 + 2 }, { x: x - spread * 0.25, y: y0 - 1 },
        { x: x, y: y1 }, { x: x + spread * 0.25, y: y0 - 1 }, { x: x + spread, y: y0 + 2 }
      ];
      if (p.vegAccent) S.polyFill(ctx, tier, p.vegAccent, 0.2);
      S.strokePath(ctx, pens.detail, tier, { lod: p.lod, width: 0.85 });
      outline.push(tier);
      if (p.lod >= 0.7) {
        S.scribbleFill(ctx, pens.hatch, [
          { x: x - spread * 0.7, y: y0 }, { x: x + spread * 0.7, y: y0 },
          { x: x + spread * 0.3, y: (y0 + y1) / 2 }, { x: x - spread * 0.3, y: (y0 + y1) / 2 }
        ], { density: Math.round(rng.range(4, 8)), lod: p.lod, width: 0.75, alpha: 0.5 });
      }
    }
    // leader poking out of the top tier
    S.strokePath(ctx, pens.detail, [{ x: top.x, y: top.y + 3 }, { x: top.x, y: top.y - w * 0.5 }],
      { lod: p.lod, width: 0.8 });
  }

  NS.trees = {
    round: treeRound, cypress: cypress, bush: bush,
    palm: palm, olive: olive, bamboo: bamboo, flowering: flowering, pine: pine
  };
  NS.treeNames = ['round', 'cypress', 'bush', 'palm', 'olive', 'bamboo', 'flowering', 'pine'];

  /** Typical height range for a planted form, in world units. */
  NS.treeHeight = function (type, rng) {
    switch (type) {
      case 'cypress': return rng.range(4, 9);
      case 'bush': return rng.range(0.9, 1.8);
      case 'palm': return rng.range(4.5, 8.5);
      case 'olive': return rng.range(2.6, 4.4);
      case 'bamboo': return rng.range(3, 6);
      case 'flowering': return rng.range(3, 5.5);
      case 'pine': return rng.range(4.5, 9);
      default: return rng.range(3, 7);
    }
  };

  // --- ground-level planting -------------------------------------------------

  /** Planter box standing against the building, with something growing in it. */
  function planter(ctx, R, pens, rng, p, spec) {
    const w = spec.w, d = spec.d, h = spec.h;
    const x0 = spec.x - w / 2, x1 = spec.x + w / 2;
    const z0 = spec.z - d / 2, z1 = spec.z + d / 2;
    const top = worldPath(R, [
      { x: x0, y: h, z: z1 }, { x: x1, y: h, z: z1 },
      { x: x1, y: h, z: z0 }, { x: x0, y: h, z: z0 }
    ]);
    if (!S.quadOk(top)) return;
    const front = [
      R.P(x0, 0, z1), R.P(x1, 0, z1), top[1], top[0]
    ];
    if (p.trimAccent) S.accentFill(ctx, front, p.trimAccent, rng, { alpha: 0.22 });
    S.strokePoly(ctx, pens.detail, front, { lod: p.lod, width: 0.85 });
    S.strokePoly(ctx, pens.detail, top, { lod: p.lod, width: 0.8 });
    if (p.lod >= 0.55) {
      S.hatchQuad(ctx, pens.hatch, front, { angle: 1.5, gap: 0.2, lod: p.lod, alpha: 0.35, max: 6 });
    }
    // the planting itself: a low mound of scribble sitting on the rim
    const cx = (top[0].x + top[1].x + top[2].x + top[3].x) / 4;
    const cy = (top[0].y + top[1].y + top[2].y + top[3].y) / 4;
    const r = Math.max(3, Math.hypot(top[1].x - top[0].x, top[1].y - top[0].y) * 0.45);
    const mound = [
      { x: cx - r, y: cy + 1 }, { x: cx + r, y: cy + 1 },
      { x: cx + r * 0.8, y: cy - r * rng.range(0.7, 1.3) },
      { x: cx - r * 0.8, y: cy - r * rng.range(0.7, 1.3) }
    ];
    if (p.vegAccent) S.polyFill(ctx, mound, p.vegAccent, 0.24);
    S.scribbleFill(ctx, pens.hair, mound, {
      density: Math.round(rng.range(5, 11)), lod: p.lod, width: 0.85, alpha: 0.85
    });
    if (p.lod >= 0.7 && spec.tall) {
      // a slim stem or two lifting out of the box
      for (let i = 0; i < 2; i++) {
        const sx = cx + rng.range(-r * 0.6, r * 0.6);
        S.strokePath(ctx, pens.hair, [
          { x: sx, y: cy }, { x: sx + rng.range(-3, 3), y: cy - r * rng.range(1.6, 2.6) }
        ], { lod: p.lod, alpha: 0.85 });
      }
    }
  }

  /** Tufts of ground planting: small sprays where wall meets ground. */
  function groundPlanting(ctx, R, pens, rng, p, spec) {
    if (p.lod < 0.45) return;
    const n = Math.max(1, Math.round(spec.n || 4));
    for (let i = 0; i < n; i++) {
      const x = spec.x + rng.range(-spec.spread, spec.spread);
      const z = spec.z + rng.range(-0.5, 0.5);
      const a = R.P(x, 0, z);
      const hh = rng.range(3, 8) * (spec.scale || 1);
      const blades = rng.int(3, 5);
      const fan = [];
      for (let k = 0; k < blades; k++) {
        const dx = ((k / (blades - 1)) - 0.5) * hh * 1.1;
        const tip = { x: a.x + dx, y: a.y - hh * rng.range(0.6, 1.1) };
        fan.push(tip);
        S.strokePath(ctx, pens.hair, [{ x: a.x, y: a.y }, tip], { lod: p.lod, alpha: 0.8 });
      }
      if (p.vegAccent && fan.length > 2) {
        S.polyFill(ctx, [{ x: a.x, y: a.y }].concat(fan), p.vegAccent, 0.16);
      }
    }
  }

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
  NS.planter = planter;
  NS.groundPlanting = groundPlanting;
  NS.birds = birds;
  NS.groundShadow = groundShadow;
  NS.worldPath = worldPath;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.site = NS;
})();

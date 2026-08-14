// js/geom.js — vector helpers, orbit camera, and the projection cheat.
//
// World: +Y up, ground at y = 0, footprints centred on the origin, +Z toward the
// viewer at yaw 0. Units are abstract "metres" (a building is 8–20 wide).
// Projection is orthographic with a tiny depth taper — hand-drawn perspective
// that never quite converges. There is no frustum, and there never will be.
(function () {
  'use strict';
  const NS = {};

  const DEG = Math.PI / 180;

  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function add(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function scale(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { const l = len(a) || 1; return scale(a, 1 / l); }
  function lerp3(a, b, t) {
    return v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  }
  function lerp2(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

  /**
   * makeCam({yaw, pitch, scale, cx, cy, perspK})
   * yaw/pitch in degrees. Positive yaw swings the +X wall into view; positive
   * pitch lifts the eye so the roof reads.
   */
  function makeCam(o) {
    o = o || {};
    const yaw = (o.yaw == null ? 24 : o.yaw) * DEG;
    const pitch = (o.pitch == null ? 16 : o.pitch) * DEG;
    return {
      yawDeg: o.yaw == null ? 24 : o.yaw,
      pitchDeg: o.pitch == null ? 16 : o.pitch,
      cy_: Math.cos(yaw), sy_: Math.sin(yaw),
      cp_: Math.cos(pitch), sp_: Math.sin(pitch),
      scale: o.scale == null ? 20 : o.scale,
      cx: o.cx || 0,
      cy: o.cy || 0,
      perspK: o.perspK == null ? 0.0062 : o.perspK
    };
  }

  /** rotate world point into camera space; +z is toward the viewer */
  function rot(p, cam) {
    const x1 = p.x * cam.cy_ - p.z * cam.sy_;
    const z1 = p.x * cam.sy_ + p.z * cam.cy_;
    const y2 = p.y * cam.cp_ - z1 * cam.sp_;
    const z2 = p.y * cam.sp_ + z1 * cam.cp_;
    return { x: x1, y: y2, z: z2 };
  }

  /** project(p, cam) -> {x, y, z} canvas point (z kept for painter ordering) */
  function project(p, cam) {
    const r = rot(p, cam);
    const persp = 1 + r.z * cam.perspK;
    return {
      x: cam.cx + r.x * cam.scale * persp,
      y: cam.cy - r.y * cam.scale * persp,
      z: r.z
    };
  }

  /** A world direction is facing the camera when its rotated z is positive. */
  function facing(nrm, cam) { return rot(nrm, cam).z; }

  // --- 2D helpers -----------------------------------------------------------
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (!isFinite(p.x) || !isFinite(p.y)) continue;
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1 };
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: Math.max(1e-6, x1 - x0), h: Math.max(1e-6, y1 - y0) };
  }

  /** Andrew's monotone chain — used for per-volume silhouettes. */
  function convexHull(points) {
    const pts = points.filter(function (p) { return isFinite(p.x) && isFinite(p.y); })
      .slice()
      .sort(function (a, b) { return a.x === b.x ? a.y - b.y : a.x - b.x; });
    if (pts.length < 3) return pts;
    const cr = function (o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    };
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  /** Flattened arc as a 2D polyline (all curves in this app are pre-flattened). */
  function arcPts(cx, cy, rx, ry, a0, a1, segs) {
    segs = segs || Math.max(6, Math.round(8 + (rx + ry) * 0.3));
    const out = [];
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return out;
  }

  NS.DEG = DEG;
  NS.v3 = v3; NS.add = add; NS.sub = sub; NS.scale = scale;
  NS.dot = dot; NS.cross = cross; NS.len = len; NS.norm = norm;
  NS.lerp3 = lerp3; NS.lerp2 = lerp2;
  NS.makeCam = makeCam;
  NS.rot = rot;
  NS.project = project;
  NS.facing = facing;
  NS.bbox = bbox;
  NS.convexHull = convexHull;
  NS.arcPts = arcPts;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.geom = NS;
})();

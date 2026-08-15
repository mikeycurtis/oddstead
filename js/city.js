// js/city.js — deterministic urban planner and renderer.
// The hierarchy is site -> streets -> blocks -> parcels -> buildings.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const G = AD.geom;
  const ST = AD.style;

  const B = { x0: -92, x1: 92, z0: -72, z1: 72 };
  const DOME = { classical: 'classicaltemple', south: 'southasiantemple', water: 'moorish', hill: 'european', market: 'southasian', ordinary: 'any' };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.z - q.x * p[i].z; }
    return Math.abs(a) * 0.5;
  }
  function heightAt(x, z) {
    const ridge = Math.max(0, 1 - Math.abs(x - 47) / 52);
    const undulation = Math.sin(x * 0.075 + z * 0.035) * 0.8 + Math.cos(z * 0.09) * 0.55;
    return clamp(ridge * 8 + undulation, 0, 9);
  }
  function coast(seed, rng) {
    const pts = [{ x: B.x0, z: B.z0 }, { x: B.x0 + rng.range(5, 16), z: B.z0 }];
    const depth = rng.range(18, 43), amp = rng.range(3, 11), phase = rng.range(-Math.PI, Math.PI), freq = rng.range(0.65, 1.35);
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, z = B.z0 + (B.z1 - B.z0) * t;
      const wave = Math.sin(phase + t * Math.PI * 2 * freq) * amp;
      const secondary = Math.cos(phase * 0.7 + t * Math.PI * 5) * amp * 0.35;
      const local = rng.range(-3.5, 3.5);
      pts.push({ x: B.x0 + depth + wave + secondary + local, z: z });
    }
    pts.push({ x: B.x0, z: B.z1 });
    return pts;
  }
  function lineRoad(id, kind, points, width) { return { id: id, kind: kind, points: points, width: width }; }
  function parcel(x0, x1, z0, z1, role, road, rng, index, scale) {
    scale = scale || 1;
    const pad = (role === 'civic' ? 3.2 : role === 'market' ? 2.3 : 1.8) / scale;
    const w = x1 - x0 - pad * 2, d = z1 - z0 - pad * 2;
    if (w < 10 / scale || d < 10 / scale) return null;
    const split = Math.max(w, d) > 25 ? 2 : 1;
    const out = [];
    for (let i = 0; i < split; i++) {
      const t0 = i / split, t1 = (i + 1) / split;
      const a0 = x0 + pad + (x1 - x0 - pad * 2) * (Math.max(w, d) === w ? t0 : 0);
      const a1 = x0 + pad + (x1 - x0 - pad * 2) * (Math.max(w, d) === w ? t1 : 1);
      const b0 = z0 + pad + (Math.max(w, d) === d ? (z1 - z0 - pad * 2) * t0 : 0);
      const b1 = z0 + pad + (Math.max(w, d) === d ? (z1 - z0 - pad * 2) * t1 : 1);
      const cx = (a0 + a1) / 2, cz = (b0 + b1) / 2;
      const r = rng.fork('parcel:' + index + ':' + i);
      out.push({ x0: a0, x1: a1, z0: b0, z1: b1, x: cx, z: cz,
        w: a1 - a0, d: b1 - b0, role: role, road: road,
        setback: pad, elevation: heightAt(cx, cz), rotation: road === 'eastWest' ? 0 : Math.PI / 2,
        seedTag: r.int(0, 999999) });
    }
    return out;
  }
  function scaleCity(plan, factor) {
    plan.cityScale = factor;
    if (factor === 1) return plan;
    const scalePoint = function (p) { p.x *= factor; p.z *= factor; };
    const scaleRect = function (p) { ['x0', 'x1', 'z0', 'z1', 'x', 'z', 'w', 'd'].forEach(function (k) { if (typeof p[k] === 'number') p[k] *= factor; }); };
    plan.bounds = { x0: B.x0 * factor, x1: B.x1 * factor, z0: B.z0 * factor, z1: B.z1 * factor };
    plan.water.forEach(scalePoint);
    plan.roads.forEach(function (r) { r.points.forEach(scalePoint); });
    plan.blocks.forEach(scaleRect);
    plan.parcels.forEach(scaleRect);
    plan.parks.forEach(scaleRect);
    scaleRect(plan.civic);
    plan.buildings.forEach(function (b) { b.x *= factor; b.z *= factor; });
    plan.cityScale = factor;
    return plan;
  }

  function generate(seed, opts) {
    opts = opts || {};
    const rng = AD.rng.makeRng(String(seed) + ':city');
    const cityScale = clamp(+opts.cityScale || 1, 1, 5);
    const size = Math.max(4, Math.round((+opts.count || 24) * cityScale));
    const latticeScale = Math.max(cityScale, Math.min(6, Math.ceil(Math.sqrt(size / 16))));
    const water = coast(seed, rng.fork('water'));
    const roads = [];
    const streetRng = rng.fork('streets');
    const civicBend = streetRng.range(-9, 9);
    roads.push(lineRoad('civic-axis', 'primary', [{ x: B.x0 + 5, z: -8 + civicBend * 0.2 }, { x: -43, z: -4 - civicBend * 0.15 }, { x: -8, z: civicBend * 0.1 }, { x: 32, z: 5 + civicBend * 0.18 }, { x: B.x1, z: 9 - civicBend * 0.2 }], 7.2));
    const hillBend = streetRng.range(-12, 12);
    roads.push(lineRoad('hill-boulevard', 'primary', [{ x: 14 + hillBend * 0.2, z: B.z0 }, { x: 20 - hillBend * 0.2, z: -30 }, { x: 26 + hillBend * 0.35, z: 0 }, { x: 42 - hillBend * 0.15, z: 34 }, { x: 64 + hillBend * 0.2, z: B.z1 }], 6.2));
    const xAxes = [-69, -42, -14, 16, 47, 76].map(function (x) { return x + streetRng.range(-7, 7); }).sort(function (a, b) { return a - b; });
    xAxes.forEach(function (x, i) {
      const drift = streetRng.range(-5, 5);
      roads.push(lineRoad('cross-' + i, 'secondary', [{ x: x, z: B.z0 + 2 }, { x: x + drift, z: B.z1 - 2 }], i === 2 ? 4.8 : 3.4));
    });
    const zAxes = [-55, -28, 0, 30, 58].map(function (z) { return z + streetRng.range(-6, 6); }).sort(function (a, b) { return a - b; });
    zAxes.forEach(function (z, i) {
      const drift = streetRng.range(-5, 5);
      roads.push(lineRoad('long-' + i, 'secondary', [{ x: B.x0 + 8, z: z }, { x: B.x1 - 2, z: z + drift }], i === 2 ? 4.8 : 3.2));
    });
    const civic = { x0: -17, x1: 18, z0: -18, z1: 18, x: 0, z: 0, role: 'civic', elevation: heightAt(0, 0) };
    const blocks = [], parcels = [], parks = [];
    function densify(values) {
      const out = [];
      for (let i = 0; i < values.length - 1; i++) {
        for (let j = 0; j < latticeScale; j++) out.push(values[i] + (values[i + 1] - values[i]) * j / latticeScale);
      }
      out.push(values[values.length - 1]);
      return out;
    }
    const xs = densify([-85, -69, -42, -14, 16, 47, 76, 88]);
    const zs = densify([-66, -55, -28, 0, 30, 58, 66]);
    let bi = 0;
    for (let xi = 0; xi < xs.length - 1; xi++) for (let zi = 0; zi < zs.length - 1; zi++) {
      const x0 = xs[xi], x1 = xs[xi + 1], z0 = zs[zi], z1 = zs[zi + 1];
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cx < -65) continue;
      if (cx > civic.x0 - 4 && cx < civic.x1 + 4 && cz > civic.z0 - 4 && cz < civic.z1 + 4) continue;
      const br = rng.fork('block:' + bi++);
      const role = Math.abs(cx) < 33 && Math.abs(cz) < 33 ? 'market' : (cx > 35 ? 'hill' : (cz > 42 ? 'waterfront' : 'ordinary'));
      if (br.chance(role === 'ordinary' ? 0.13 : 0.08)) { parks.push({ x0: x0 + 2, x1: x1 - 2, z0: z0 + 2, z1: z1 - 2, x: cx, z: cz, role: 'park', elevation: heightAt(cx, cz) }); continue; }
      blocks.push({ x0: x0, x1: x1, z0: z0, z1: z1, x: cx, z: cz, role: role });
      const ps = parcel(x0, x1, z0, z1, role, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'eastWest' : 'northSouth', br, bi, latticeScale);
      if (ps) ps.forEach(function (p) { parcels.push(p); });
    }
    parcels.unshift({ x0: civic.x0 + 4, x1: civic.x1 - 4, z0: civic.z0 + 4, z1: civic.z1 - 4, x: 0, z: 0, w: 27, d: 27, role: 'civic', road: 'eastWest', setback: 4, elevation: heightAt(0, 0), rotation: 0, seedTag: 0 });
    const target = Math.min(size, parcels.length);
    const selected = [parcels[0]];
    const available = parcels.slice(1);
    for (let i = 0; selected.length < target && available.length; i++) {
      const at = Math.floor(i * available.length / Math.max(1, target - 1));
      selected.push(available[Math.min(available.length - 1, at)]);
    }
    const buildings = selected.map(function (p, i) {
      const mood = p.role === 'civic' ? 'classicaltemple' : p.role === 'market' ? (i % 2 ? 'southasiantemple' : 'moorish') : p.role === 'hill' ? 'european' : p.role === 'waterfront' ? 'mediterranean' : 'any';
      return { index: i, seed: String(seed) + ':building:' + i + ':' + p.seedTag, mood: mood, x: p.x, z: p.z,
        elevation: p.elevation, rotation: p.rotation, parcel: p, scale: p.role === 'civic' ? 1.35 : p.role === 'market' ? 1.08 : rng.range(0.82, 1.08) };
    });
    const city = { seed: String(seed), bounds: B, water: water, roads: roads, blocks: blocks, parcels: parcels, parks: parks, civic: civic, buildings: buildings, size: size };
    return scaleCity(city, clamp(+opts.cityScale || 1, 1, 5));
  }
  function worldPath(R, pts, y) { return pts.map(function (q) { return R.P(q.x, y == null ? 0 : y, q.z); }); }
  function fillPoly(ctx, pts, color, alpha) { S.polyFill(ctx, pts, color, alpha); }
  function roadBand(road) {
    const pts = road.points, w = road.width / 2, out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      out.push({ x: pts[i].x - dz / l * w, z: pts[i].z + dx / l * w });
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      out.push({ x: pts[i].x + dz / l * w, z: pts[i].z - dx / l * w });
    }
    return out;
  }
  function render(ctx, city, opts) {
    opts = opts || {};
    const w = opts.w, h = opts.h;
    const baseLod = opts.lod == null ? 0.72 : opts.lod;
    const zoom = clamp(opts.zoom == null ? 1 : opts.zoom, 1, 5);
    const lod = Math.min(1, baseLod + (zoom - 1) * 0.14);
    const cityScale = clamp(opts.cityScale == null ? (city.cityScale || 1) : opts.cityScale, 1, 5);
    const cam = G.makeCam({ yaw: opts.yaw, pitch: opts.pitch, scale: Math.min(w / 218, h / 190) * zoom, perspK: 0.0062 / cityScale,
      cx: w / 2 + (opts.panX || 0) * w * 0.5, cy: h * 0.58 + (opts.panY || 0) * h * 0.5 });
    const R = { P: function (x, y, z) { return G.project({ x: x, y: y, z: z }, cam); }, cam: cam };
    const pens = S.makePens(AD.rng.makeRng(city.seed + ':city-pens'), ST.pens.dryNib);
    const land = [{ x: city.bounds.x0, z: city.bounds.z0 }, { x: city.bounds.x1, z: city.bounds.z0 }, { x: city.bounds.x1, z: city.bounds.z1 }, { x: city.bounds.x0, z: city.bounds.z1 }];
    fillPoly(ctx, worldPath(R, land), ST.paper.baseColor || '#f4efdf', 0.86);
    fillPoly(ctx, worldPath(R, city.water), '#b9d4d0', 0.72);
    S.strokePoly(ctx, pens.outline, worldPath(R, city.water), { lod: lod, close: true, width: 1.15 });
    for (let z = -55; z <= 55; z += 11) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const x = 25 + i * 4; pts.push({ x: x, z: z + Math.sin(i * 0.65 + z) * 1.5 }); }
      S.strokePath(ctx, pens.hair, worldPath(R, pts, heightAt(45, z) + 0.08), { lod: lod, alpha: 0.28, width: 0.72 });
    }
    city.parks.forEach(function (p, i) {
      const q = [{ x: p.x0, z: p.z0 }, { x: p.x1, z: p.z0 }, { x: p.x1, z: p.z1 }, { x: p.x0, z: p.z1 }];
      fillPoly(ctx, worldPath(R, q, p.elevation), '#c7d3b6', 0.5);
      if (lod > 0.5) S.strokePath(ctx, pens.hair, worldPath(R, [{ x: p.x0 + 2, z: p.z0 + 2 }, { x: p.x1 - 2, z: p.z1 - 2 }], p.elevation + 0.08), { lod: lod, alpha: 0.45 });
    });
    city.roads.forEach(function (road) {
      fillPoly(ctx, worldPath(R, roadBand(road), 0.08), road.kind === 'primary' ? '#d8cdb8' : '#e2d9c9', road.kind === 'primary' ? 0.78 : 0.58);
    });
    city.blocks.forEach(function (b) {
      const q = [{ x: b.x0 + 1, z: b.z0 + 1 }, { x: b.x1 - 1, z: b.z0 + 1 }, { x: b.x1 - 1, z: b.z1 - 1 }, { x: b.x0 + 1, z: b.z1 - 1 }];
      S.strokePoly(ctx, pens.hair, worldPath(R, q, heightAt(b.x, b.z) + 0.12), { lod: lod, close: true, alpha: 0.3, width: 0.58 });
    });
    const sorted = city.buildings.slice().sort(function (a, b) { return G.rot({ x: a.x, y: a.elevation, z: a.z }, cam).z - G.rot({ x: b.x, y: b.elevation, z: b.z }, cam).z; });
    sorted.forEach(function (b) {
      const bp = AD.building.generate(b.seed, { mood: b.mood, density: opts.density || 0.78, monumentality: (opts.monumentality || 1) * b.scale });
      AD.building.render(ctx, bp, { cam: cam, yaw: opts.yaw, pitch: opts.pitch, opaqueWalls: true, origin: { x: b.x, y: b.elevation, z: b.z }, rotation: b.rotation }, { x: 0, y: 0, w: w, h: h, pad: 0.08 }, lod);
    });
    const civic = city.civic;
    const cq = [{ x: civic.x0, z: civic.z0 }, { x: civic.x1, z: civic.z0 }, { x: civic.x1, z: civic.z1 }, { x: civic.x0, z: civic.z1 }];
    fillPoly(ctx, worldPath(R, cq, civic.elevation), '#d9cfbb', 0.28);
    ctx.save(); ctx.fillStyle = ST.caption.color; ctx.font = ST.caption.small; ctx.fillText('CIVIC CORE', R.P(0, civic.elevation + 0.2, -20).x - 30, R.P(0, civic.elevation + 0.2, -20).y); ctx.restore();
    ctx.save(); ctx.fillStyle = ST.caption.color; ctx.font = ST.caption.small; ctx.fillText('WATERFRONT', w * 0.055, h * 0.91); ctx.restore();
  }
  NS.generate = generate;
  NS.render = render;
  NS.bounds = B;
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.city = NS;
})();

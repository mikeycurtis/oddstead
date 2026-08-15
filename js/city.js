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
    if (plan.atmosphere) {
      plan.atmosphere.clouds.forEach(function (c) { c.x *= factor; c.z *= factor; c.w *= factor; c.d *= factor; c.y *= 1; });
      plan.atmosphere.birds.forEach(function (b) { b.x *= factor; b.z *= factor; });
    }
    plan.buildings.forEach(function (b) { b.x *= factor; b.z *= factor; });
    plan.cityScale = factor;
    return plan;
  }

  function makePark(x0, x1, z0, z1, role, rng) {
    const w = Math.max(1, x1 - x0), d = Math.max(1, z1 - z0);
    const count = Math.max(3, Math.min(18, Math.round((w * d) / 150)));
    const trees = [];
    for (let i = 0; i < count; i++) trees.push({
      x: rng.range(x0 + w * 0.12, x1 - w * 0.12),
      z: rng.range(z0 + d * 0.12, z1 - d * 0.12),
      r: rng.range(0.65, 1.25), h: rng.range(2.8, 5.2),
      type: rng.pick(['deciduous', 'cypress', 'fruit'])
    });
    const amenity = rng.pick(['fountain', 'garden', 'market-green', 'play-court']);
    return {
      x0: x0, x1: x1, z0: z0, z1: z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2,
      role: role, elevation: heightAt((x0 + x1) / 2, (z0 + z1) / 2), trees: trees,
      amenity: amenity, pathT: rng.range(0.25, 0.75)
    };
  }

  function makeAtmosphere(seed, cityScale) {
    const rng = AD.rng.makeRng(String(seed) + ':atmosphere');
    const clouds = [];
    const birds = [];
    const cloudCount = 3 + rng.int(0, Math.min(3, cityScale));
    const birdCount = 2 + rng.int(0, 1);
    for (let i = 0; i < cloudCount; i++) clouds.push({
      x: rng.range(B.x0 + 12, B.x1 - 12), z: rng.range(B.z0 + 10, B.z1 - 10),
      y: rng.range(18, 30), w: rng.range(6, 13), d: rng.range(3, 7),
      puff: rng.int(2, 4)
    });
    for (let i = 0; i < birdCount; i++) birds.push({
      x: rng.range(B.x0 + 15, B.x1 - 15), z: rng.range(B.z0 + 15, B.z1 - 15),
      y: rng.range(12, 20), s: rng.range(2.8, 5.2),
      wing: rng.range(-0.35, 0.35)
    });
    return { clouds: clouds, birds: birds };
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
    const civicRng = rng.fork('civic-space');
    const civicActive = civicRng.chance(0.58);
    const civicW = civicRng.range(24, 43), civicD = civicRng.range(24, 43);
    const civicX = civicRng.range(-30, 38), civicZ = civicRng.range(-18, 28);
    const civic = { x0: civicX - civicW / 2, x1: civicX + civicW / 2, z0: civicZ - civicD / 2, z1: civicZ + civicD / 2, x: civicX, z: civicZ, role: civicActive ? 'civic' : 'civic-park', active: civicActive, elevation: heightAt(civicX, civicZ) };
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
      if (br.chance(role === 'ordinary' ? 0.13 : 0.08)) { parks.push(makePark(x0 + 2, x1 - 2, z0 + 2, z1 - 2, 'park', br.fork('park'))); continue; }
      blocks.push({ x0: x0, x1: x1, z0: z0, z1: z1, x: cx, z: cz, role: role });
      const ps = parcel(x0, x1, z0, z1, role, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 'eastWest' : 'northSouth', br, bi, latticeScale);
      if (ps) ps.forEach(function (p) { parcels.push(p); });
    }
    if (civic.active) parcels.unshift({ x0: civic.x0 + 4, x1: civic.x1 - 4, z0: civic.z0 + 4, z1: civic.z1 - 4, x: civic.x, z: civic.z, w: civic.x1 - civic.x0 - 8, d: civic.z1 - civic.z0 - 8, role: 'civic', road: 'eastWest', setback: 4, elevation: civic.elevation, rotation: 0, seedTag: 0 });
    else parks.unshift(makePark(civic.x0, civic.x1, civic.z0, civic.z1, 'civic-park', civicRng.fork('park')));
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
    const city = { seed: String(seed), bounds: B, water: water, roads: roads, blocks: blocks, parcels: parcels, parks: parks, civic: civic, buildings: buildings, atmosphere: makeAtmosphere(seed, cityScale), size: size };
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
    const atmosphere = city.atmosphere || { clouds: [], birds: [] };
    atmosphere.clouds.forEach(function (c) {
      if (G.rot({ x: c.x, y: c.y, z: c.z }, cam).z <= 0) return;
      const center = R.P(c.x, c.y, c.z);
      if (center.x < -c.w * cam.scale || center.x > w + c.w * cam.scale || center.y < -c.d * cam.scale || center.y > h + c.d * cam.scale) return;
      ctx.save(); ctx.fillStyle = '#dbe7e2'; ctx.strokeStyle = '#a9c0bb'; ctx.lineWidth = 0.65; ctx.globalAlpha = 0.58;
      for (let i = 0; i < c.puff; i++) {
        const q = R.P(c.x + (i - (c.puff - 1) / 2) * c.w * 0.22, c.y + (i % 2) * 1.3, c.z);
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(3, c.w * cam.scale * (i % 2 ? 0.12 : 0.16)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    });
    atmosphere.birds.forEach(function (b) {
      if (G.rot({ x: b.x, y: b.y, z: b.z }, cam).z <= 0) return;
      const q = R.P(b.x, b.y, b.z);
      if (q.x < -20 || q.x > w + 20 || q.y < -20 || q.y > h + 20) return;
      const s = b.s * cam.scale * 0.42;
      S.strokePath(ctx, pens.hair, [{ x: q.x - s, y: q.y }, { x: q.x - s * 0.32, y: q.y - s * (0.45 + b.wing) }, { x: q.x, y: q.y }], { lod: lod, width: 1.25, alpha: 0.9 });
      S.strokePath(ctx, pens.hair, [{ x: q.x, y: q.y }, { x: q.x + s * 0.34, y: q.y - s * (0.48 - b.wing) }, { x: q.x + s, y: q.y }], { lod: lod, width: 1.25, alpha: 0.9 });
    });
    for (let z = -55; z <= 55; z += 11) {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const x = 25 + i * 4; pts.push({ x: x, z: z + Math.sin(i * 0.65 + z) * 1.5 }); }
      S.strokePath(ctx, pens.hair, worldPath(R, pts, heightAt(45, z) + 0.08), { lod: lod, alpha: 0.28, width: 0.72 });
    }
    city.parks.forEach(function (p) {
      const q = [{ x: p.x0, z: p.z0 }, { x: p.x1, z: p.z0 }, { x: p.x1, z: p.z1 }, { x: p.x0, z: p.z1 }];
      fillPoly(ctx, worldPath(R, q, p.elevation), '#c7d3b6', p.role === 'civic-park' ? 0.62 : 0.5);
      if (lod > 0.5) {
        const px = p.x0 + (p.x1 - p.x0) * p.pathT;
        const pz = p.z0 + (p.z1 - p.z0) * p.pathT;
        S.strokePath(ctx, pens.hair, worldPath(R, [{ x: p.x0 + 1, z: pz }, { x: p.x1 - 1, z: pz }], p.elevation + 0.08), { lod: lod, alpha: 0.5, width: 0.7 });
        S.strokePath(ctx, pens.hair, worldPath(R, [{ x: px, z: p.z0 + 1 }, { x: px, z: p.z1 - 1 }], p.elevation + 0.09), { lod: lod, alpha: 0.42, width: 0.65 });
      }
    });
    city.roads.forEach(function (road) {
      fillPoly(ctx, worldPath(R, roadBand(road), 0.08), road.kind === 'primary' ? '#d8cdb8' : '#e2d9c9', road.kind === 'primary' ? 0.78 : 0.58);
    });
    city.parks.forEach(function (p) {
      if (lod < 0.5) return;
      p.trees.forEach(function (t) {
        const base = R.P(t.x, p.elevation + 0.1, t.z);
        const top = R.P(t.x, p.elevation + t.h, t.z);
        ctx.save();
        ctx.strokeStyle = '#706452'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.fillStyle = t.type === 'cypress' ? '#6f896c' : t.type === 'fruit' ? '#8d9b69' : '#78917a';
        ctx.beginPath(); ctx.arc(top.x, top.y, Math.max(1.8, t.r * cam.scale * 0.42), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      const a = R.P(p.x, p.elevation + 0.14, p.z);
      ctx.save(); ctx.strokeStyle = '#8f8067'; ctx.fillStyle = '#e4d8bd'; ctx.lineWidth = 0.8;
      if (p.amenity === 'fountain') { ctx.beginPath(); ctx.arc(a.x, a.y, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      else if (p.amenity === 'play-court') { ctx.beginPath(); ctx.moveTo(a.x - 5, a.y - 3); ctx.lineTo(a.x + 5, a.y - 3); ctx.lineTo(a.x + 5, a.y + 3); ctx.lineTo(a.x - 5, a.y + 3); ctx.closePath(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(a.x, a.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
    city.blocks.forEach(function (b) {
      const q = [{ x: b.x0 + 1, z: b.z0 + 1 }, { x: b.x1 - 1, z: b.z0 + 1 }, { x: b.x1 - 1, z: b.z1 - 1 }, { x: b.x0 + 1, z: b.z1 - 1 }];
      S.strokePoly(ctx, pens.hair, worldPath(R, q, heightAt(b.x, b.z) + 0.12), { lod: lod, close: true, alpha: 0.3, width: 0.58 });
    });
    const sorted = city.buildings.slice().sort(function (a, b) { return G.rot({ x: a.x, y: a.elevation, z: a.z }, cam).z - G.rot({ x: b.x, y: b.elevation, z: b.z }, cam).z; });
    sorted.forEach(function (b) {
      const bp = AD.building.generate(b.seed, { mood: b.mood, density: opts.density || 0.78, monumentality: (opts.monumentality || 1) * b.scale });
      AD.building.render(ctx, bp, { cam: cam, yaw: opts.yaw, pitch: opts.pitch, opaqueWalls: true, cityMode: true, origin: { x: b.x, y: b.elevation, z: b.z }, rotation: b.rotation }, { x: 0, y: 0, w: w, h: h, pad: 0.08 }, lod);
    });
    const civic = city.civic;
    if (civic.active) {
      const cq = [{ x: civic.x0, z: civic.z0 }, { x: civic.x1, z: civic.z0 }, { x: civic.x1, z: civic.z1 }, { x: civic.x0, z: civic.z1 }];
      fillPoly(ctx, worldPath(R, cq, civic.elevation), '#d9cfbb', 0.28);
      ctx.save(); ctx.fillStyle = ST.caption.color; ctx.font = ST.caption.small; ctx.fillText('CIVIC CORE', R.P(civic.x, civic.elevation + 0.2, civic.z - (civic.z1 - civic.z0) * 0.58).x - 30, R.P(civic.x, civic.elevation + 0.2, civic.z - (civic.z1 - civic.z0) * 0.58).y); ctx.restore();
    }
    ctx.save(); ctx.fillStyle = ST.caption.color; ctx.font = ST.caption.small; ctx.fillText('WATERFRONT', w * 0.055, h * 0.91); ctx.restore();
  }
  NS.generate = generate;
  NS.render = render;
  NS.bounds = B;
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.city = NS;
})();

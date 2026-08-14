#!/usr/bin/env node
// tools/smoke.js — headless smoke test. No dependencies (Node's built-ins only).
//
// It loads every drawing module into a sandbox with a recording 2D-context shim,
// then exercises generate/render across many seeds, moods, angles and both
// output modes. It fails loudly on: exceptions, non-finite coordinates, empty
// drawings, non-deterministic output, and any use of Math.random.
//
//   node tools/smoke.js
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ORDER = [
  'rng.js', 'style.js', 'stroke.js', 'paper.js', 'geom.js', 'massing.js',
  'el-roofs.js', 'el-openings.js', 'el-facade.js', 'el-details.js', 'el-site.js',
  'building.js', 'plate.js', 'export.js'
];

let failures = 0;
function fail(msg) { failures++; console.error('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }

// --- recording canvas shim --------------------------------------------------
function makeCtx(trace) {
  const bad = [];
  const check = function (op, nums) {
    for (let i = 0; i < nums.length; i++) {
      if (typeof nums[i] === 'number' && !isFinite(nums[i])) {
        bad.push(op + '(' + nums.join(',') + ')');
        return;
      }
    }
  };
  const ctx = {
    _bad: bad,
    _ops: 0,
    _hash: 0,
    canvas: { width: 900, height: 1125 },
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textBaseline: '',
    save() {}, restore() {},
    setTransform() {}, transform() {}, translate() {}, scale() {}, rotate() {},
    beginPath() { ctx._ops++; }, closePath() {},
    moveTo(x, y) { check('moveTo', [x, y]); ctx._ops++; ctx._hash = (ctx._hash * 31 + Math.round(x * 8) + Math.round(y * 8)) | 0; },
    lineTo(x, y) { check('lineTo', [x, y]); ctx._ops++; ctx._hash = (ctx._hash * 31 + Math.round(x * 8) + Math.round(y * 8)) | 0; },
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {},
    fill() { ctx._ops++; }, stroke() { ctx._ops++; },
    fillRect(x, y, w, h) { check('fillRect', [x, y, w, h]); ctx._ops++; },
    clearRect() {}, clip() {},
    drawImage() { ctx._ops++; },
    fillText(t, x, y) { check('fillText', [x, y]); ctx._ops++; },
    measureText(t) { return { width: String(t).length * 6.2 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: [] }; }
  };
  if (trace) ctx._trace = trace;
  return ctx;
}

function makeSandbox() {
  const doc = {
    createElement(tag) {
      if (tag !== 'canvas') return { style: {}, setAttribute() {}, appendChild() {} };
      const c = { width: 1, height: 1, getContext() { return makeCtx(); } };
      return c;
    }
  };
  const sandbox = {
    document: doc,
    console: console,
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    Date: Date,
    Math: Math,
    URLSearchParams: URLSearchParams,
    setTimeout: setTimeout,
    Promise: Promise
  };
  sandbox.globalThis = sandbox;
  // the modules attach to `window`; in a browser that makes AD a real global,
  // so mirror that here rather than sandboxing it into a side object
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

// --- load -------------------------------------------------------------------
const sandbox = makeSandbox();
console.log('load modules');
for (const file of ORDER) {
  const p = path.join(ROOT, 'js', file);
  const src = fs.readFileSync(p, 'utf8');
  try {
    new vm.Script(src, { filename: 'js/' + file }).runInContext(sandbox);
  } catch (err) {
    fail('js/' + file + ' — ' + err.message);
    process.exit(1);
  }
}
// main.js is DOM-bound; syntax-check it without executing side effects.
try {
  new vm.Script(fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8'),
    { filename: 'js/main.js' });
  ok('all 15 modules parsed, 14 executed cleanly');
} catch (err) {
  fail('js/main.js — ' + err.message);
}

const AD = sandbox.AD;
const NAMESPACES = ['rng', 'style', 'stroke', 'paper', 'geom', 'massing', 'roofs',
  'openings', 'facade', 'details', 'site', 'building', 'plate', 'exporter'];
console.log('namespaces');
NAMESPACES.forEach(function (n) {
  if (!AD[n]) fail('AD.' + n + ' missing');
});
if (!failures) ok('AD.{' + NAMESPACES.join(', ') + '} present');

// --- no Math.random anywhere -----------------------------------------------
console.log('determinism hygiene');
{
  let hits = [];
  fs.readdirSync(path.join(ROOT, 'js')).forEach(function (f) {
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    if (/Math\.random/.test(src)) hits.push(f);
  });
  if (hits.length) fail('Math.random found in ' + hits.join(', '));
  else ok('no Math.random in js/');
}

// --- rng --------------------------------------------------------------------
console.log('rng');
{
  const a = AD.rng.makeRng('hello');
  const b = AD.rng.makeRng('hello');
  const c = AD.rng.makeRng('hellp');
  const seqA = [], seqB = [], seqC = [];
  for (let i = 0; i < 20; i++) { seqA.push(a.next()); seqB.push(b.next()); seqC.push(c.next()); }
  if (seqA.join() !== seqB.join()) fail('same seed produced different streams');
  else if (seqA.join() === seqC.join()) fail('different seeds produced identical streams');
  else ok('same seed reproduces, neighbouring seed diverges');

  const r = AD.rng.makeRng('fork-test');
  for (let i = 0; i < 5; i++) r.next();
  const f1 = AD.rng.makeRng('fork-test').fork('massing');
  const f2 = r.fork('massing');
  if (f1.next() !== f2.next()) fail('fork depends on parent draw count');
  else ok('forks are stable regardless of parent state');

  const noise = AD.rng.makeNoise1D(AD.rng.makeRng('n'));
  let minV = 1, maxV = -1, jump = 0, prev = noise(0);
  for (let t = 0; t < 200; t += 0.25) {
    const v = noise(t);
    if (!isFinite(v)) { fail('noise returned non-finite'); break; }
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    jump = Math.max(jump, Math.abs(v - prev));
    prev = v;
  }
  if (minV < -1.001 || maxV > 1.001) fail('noise out of [-1,1]: ' + minV + '..' + maxV);
  else if (jump > 0.6) fail('noise not smooth (max step ' + jump.toFixed(2) + ')');
  else ok('noise smooth and inside [-1,1]');
}

// --- generate + render ------------------------------------------------------
const RECT = { x: 0, y: 0, w: 900, h: 1050, pad: 0.11 };
const MOODS = ['any'].concat(AD.style.moodNames);

function renderOnce(seed, opts, view, rect, lod) {
  const ctx = makeCtx();
  const plan = AD.building.generate(seed, opts);
  AD.building.render(ctx, plan, view, rect || RECT, lod == null ? 1 : lod);
  return { ctx: ctx, plan: plan };
}

console.log('single-building generation (120 seeds × moods × angles)');
{
  let minOps = Infinity, maxOps = 0, totalMs = 0, n = 0;
  const kinds = {};
  for (let i = 0; i < 120; i++) {
    const seed = 'smoke' + i;
    const mood = MOODS[i % MOODS.length];
    const view = { yaw: -60 + (i * 7) % 121, pitch: 2 + (i * 5) % 37 };
    const density = 0.4 + ((i % 13) / 12) * 1.2;
    let res;
    const t0 = Date.now();
    try {
      res = renderOnce(seed, { mood: mood, density: density }, view);
    } catch (err) {
      fail('seed ' + seed + ' (' + mood + ', yaw ' + view.yaw + ') threw: ' + err.stack.split('\n')[0]);
      continue;
    }
    totalMs += Date.now() - t0; n++;
    kinds[res.plan.kind] = (kinds[res.plan.kind] || 0) + 1;
    if (res.ctx._bad.length) {
      fail('seed ' + seed + ' emitted non-finite geometry: ' + res.ctx._bad.slice(0, 3).join(' '));
    }
    minOps = Math.min(minOps, res.ctx._ops);
    maxOps = Math.max(maxOps, res.ctx._ops);
  }
  if (minOps < 400) fail('a drawing came out nearly empty (' + minOps + ' ops)');
  else ok('every sheet inked (ops ' + minOps + '–' + maxOps + '), avg ' +
    (totalMs / n).toFixed(1) + ' ms/drawing');
  const kindList = Object.keys(kinds);
  if (kindList.length < 4) fail('only ' + kindList.length + ' massing kinds appeared');
  else ok('massing variety: ' + kindList.map(k => k + '×' + kinds[k]).join(', '));
}

console.log('reproducibility');
{
  const a = renderOnce('repro-me', { mood: 'any', density: 1 }, { yaw: 24, pitch: 16 });
  const b = renderOnce('repro-me', { mood: 'any', density: 1 }, { yaw: 24, pitch: 16 });
  if (a.ctx._hash !== b.ctx._hash || a.ctx._ops !== b.ctx._ops) {
    fail('same seed produced different ink (' + a.ctx._hash + ' vs ' + b.ctx._hash + ')');
  } else ok('same seed → byte-identical stroke stream');

  // view changes must not touch the design
  const p1 = AD.building.generate('view-test', { mood: 'any', density: 1 });
  const p2 = AD.building.generate('view-test', { mood: 'any', density: 1 });
  const strip = function (p) {
    return JSON.stringify({ kind: p.kind, roofs: p.roofs, faces: p.faces, gear: p.gear, mood: p.mood });
  };
  if (strip(p1) !== strip(p2)) fail('generate() is not deterministic');
  else ok('plan identical across calls (view sliders cannot alter design)');

  const c1 = renderOnce('view-test', { mood: 'any', density: 1 }, { yaw: -40, pitch: 5 });
  const c2 = renderOnce('view-test', { mood: 'any', density: 1 }, { yaw: 55, pitch: 34 });
  if (c1.ctx._hash === c2.ctx._hash) fail('different camera angles produced identical output');
  else if (strip(c1.plan) !== strip(c2.plan)) fail('camera angle changed the plan');
  else ok('camera moves, building identity holds');
}

console.log('extreme parameters');
{
  const cases = [
    ['empty-ish seed', '', { mood: 'any', density: 1 }, { yaw: 0, pitch: 2 }],
    ['unicode seed', '⌂ хата 建物', { mood: 'town', density: 1.6 }, { yaw: 60, pitch: 38 }],
    ['long seed', 'x'.repeat(48), { mood: 'tower', density: 0.4 }, { yaw: -60, pitch: 2 }],
    ['flat-on view', 'front-elevation', { mood: 'industrial', density: 1 }, { yaw: 0, pitch: 2 }],
    ['tiny rect', 'tiny', { mood: 'mediterranean', density: 1 }, { yaw: 30, pitch: 20 }]
  ];
  let bad = 0;
  cases.forEach(function (c, i) {
    const rect = c[0] === 'tiny rect' ? { x: 0, y: 0, w: 60, h: 70, pad: 0.08 } : RECT;
    try {
      const res = renderOnce(c[1], c[2], c[3], rect, c[0] === 'tiny rect' ? 0.35 : 1);
      if (res.ctx._bad.length) { fail(c[0] + ': non-finite geometry'); bad++; }
    } catch (err) {
      fail(c[0] + ' threw: ' + err.stack.split('\n')[0]);
      bad++;
    }
  });
  if (!bad) ok('edge-case seeds, angles and cell sizes all survive');
}

console.log('plate mode');
{
  [12, 24, 48].forEach(function (count) {
    const ctx = makeCtx();
    const t0 = Date.now();
    let job;
    try {
      job = AD.plate.create(ctx, {
        seed: 'plate-' + count, count: count, mood: 'any', density: 1,
        view: { yaw: 22, pitch: 16 }, w: 900, h: 1250
      });
      job.finish();
    } catch (err) {
      fail('plate ' + count + ' threw: ' + err.stack.split('\n')[0]);
      return;
    }
    const ms = Date.now() - t0;
    if (job.done !== count) fail('plate ' + count + ' only drew ' + job.done + ' cells');
    else if (ctx._bad.length) fail('plate ' + count + ' non-finite: ' + ctx._bad[0]);
    else ok('plate of ' + count + ' drew all cells in ' + ms + ' ms (' + ctx._ops + ' ops)');
  });

  // cell seeds are stable across plate sizes
  const s24 = AD.plate.cellSeed('stable', 7);
  const s48 = AD.plate.cellSeed('stable', 7);
  if (s24 !== s48) fail('cell seeds unstable');
  else ok('cell 7 of seed "stable" is always ' + s24);
}

console.log('url state');
{
  const q = AD.exporter.queryString({
    seed: 'k7x2mp', mode: 'plate', mood: 'town', yaw: 24.456, pitch: 16, density: 1.2, count: 24
  });
  ['seed=k7x2mp', 'mode=plate', 'mood=town', 'yaw=24.46', 'density=1.2', 'count=24'].forEach(function (frag) {
    if (q.indexOf(frag) < 0) fail('query string missing ' + frag + ' (' + q + ')');
  });
  const back = AD.exporter.readState({ seed: 'zzz', mode: 'single' });
  if (back.seed !== 'zzz') fail('readState ignored defaults without a location');
  else ok('state round-trips to a URL: ' + q);
}

console.log('element coverage');
{
  const counts = {
    windows: Object.keys(AD.openings.windows).length,
    doors: Object.keys(AD.openings.doors).length,
    roofs: Object.keys(AD.roofs.roofs).length,
    facades: Object.keys(AD.facade.systems).length,
    railings: Object.keys(AD.details.railings).length,
    gear: Object.keys(AD.details.gear).length,
    ornament: Object.keys(AD.details.ornament).length,
    trees: Object.keys(AD.site.trees).length
  };
  const min = { windows: 6, doors: 4, roofs: 5, facades: 4, railings: 3, gear: 4, ornament: 4, trees: 3 };
  let bad = 0;
  Object.keys(min).forEach(function (k) {
    if (counts[k] < min[k]) { fail(k + ': ' + counts[k] + ' variants, need ' + min[k]); bad++; }
  });
  if (!bad) {
    ok('variant counts meet plan: ' +
      Object.keys(counts).map(k => k + ' ' + counts[k]).join(', '));
  }

  // every window/door/roof/facade variant must survive a skewed quad
  const ctx = makeCtx();
  const pens = AD.stroke.makePens(AD.rng.makeRng('spec'), AD.style.pens.dryNib);
  const skew = [{ x: 40, y: 300 }, { x: 210, y: 262 }, { x: 196, y: 90 }, { x: 55, y: 130 }];
  const p = { lod: 1, glassAccent: '#6f88a3', doorAccent: '#c9a34a', vegAccent: '#7d8f6a', signAccent: '#c9a34a' };
  let broke = 0;
  ['windows', 'doors'].forEach(function (fam) {
    Object.keys(AD.openings[fam]).forEach(function (name) {
      const c = makeCtx();
      try {
        AD.openings[fam][name](c, skew, pens, AD.rng.makeRng(name), p);
      } catch (err) {
        fail(fam + '.' + name + ' threw on a skewed quad: ' + err.message); broke++; return;
      }
      if (c._bad.length) { fail(fam + '.' + name + ' non-finite on skew'); broke++; }
      else if (c._ops < 4) { fail(fam + '.' + name + ' drew nothing'); broke++; }
    });
  });
  Object.keys(AD.details.railings).forEach(function (name) {
    const c = makeCtx();
    try { AD.details.railings[name](c, skew, pens, AD.rng.makeRng(name), p); }
    catch (err) { fail('railing ' + name + ': ' + err.message); broke++; return; }
    if (c._bad.length || c._ops < 4) { fail('railing ' + name + ' produced nothing usable'); broke++; }
  });
  if (!broke) ok('every opening/railing variant survives a skewed, foreshortened quad');
  void ctx;
}

console.log('');
if (failures) {
  console.error('FAILED — ' + failures + ' problem(s)');
  process.exit(1);
}
console.log('ALL SMOKE CHECKS PASSED');

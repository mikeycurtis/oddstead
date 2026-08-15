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
  'building.js', 'plate.js', 'city.js', 'export.js'
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
  'openings', 'facade', 'details', 'site', 'building', 'plate', 'city', 'exporter'];
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
  // Headroom over the measured cost, so this catches a real regression rather
  // than the noise of a busy machine.
  const avg = totalMs / n;
  if (avg > 250) fail('generate+render averaged ' + avg.toFixed(1) + ' ms (budget 250)');
  else ok('single-sheet budget held: ' + avg.toFixed(1) + ' ms/drawing < 250');
}

console.log('mood families');
{
  const names = AD.style.moodNames;
  if (names.length < 12) fail('only ' + names.length + ' mood families (need 12)');
  else ok(names.length + ' families: ' + names.join(', '));

  // the families this extension added must all be present and labelled
  ['chinese', 'european', 'greek', 'japanese'].forEach(function (m) {
    if (names.indexOf(m) < 0) fail('mood family "' + m + '" missing from moodNames');
  });

  // Every weight table must name variants that actually exist, or a mood will
  // silently fall back to the default and its identity disappears.
  const registries = {
    massing: AD.massing.recipeNames,
    roofs: AD.roofs.roofNames,
    facades: AD.facade.systemNames,
    windows: AD.openings.windowNames,
    doors: AD.openings.doorNames,
    gear: AD.details.gearNames,
    trees: AD.site.treeNames,
    ornaments: AD.details.ornamentNames
  };
  let dangling = 0;
  names.forEach(function (m) {
    const mood = AD.style.moods[m];
    if (!mood) { fail('moodNames lists "' + m + '" but moods has no entry'); return; }
    if (!mood.label) fail(m + ' has no label for the dropdown');
    Object.keys(registries).forEach(function (fam) {
      const table = mood[fam];
      if (!table) {
        if (fam !== 'ornaments') fail(m + ' has no ' + fam + ' table');
        return;
      }
      Object.keys(table).forEach(function (k) {
        if (registries[fam].indexOf(k) < 0) {
          fail(m + '.' + fam + ' names unknown variant "' + k + '"');
          dangling++;
        }
      });
    });
  });
  if (!dangling) ok('every mood weight table resolves to a real variant');

  // "Any" must be able to reach every family, or new moods are dropdown-only
  const seen = {};
  for (let i = 0; i < 400; i++) {
    seen[AD.building.generate('any-' + i, { mood: 'any', density: 1 }).mood] = true;
  }
  const unseen = names.filter(function (m) { return !seen[m]; });
  if (unseen.length) fail('Any mode never produced: ' + unseen.join(', '));
  else ok('Any mode samples all ' + names.length + ' families');

  // and asking for a family must actually get you that family
  let wrong = 0;
  names.forEach(function (m) {
    for (let i = 0; i < 5; i++) {
      if (AD.building.generate('pick-' + m + i, { mood: m, density: 1 }).mood !== m) wrong++;
    }
  });
  if (wrong) fail(wrong + ' generations ignored the requested mood');
  else ok('each family is selectable on its own');
}

console.log('planting palette');
{
  const HEX = /^#[0-9a-f]{6}$/i;
  if (typeof AD.style.plantColor !== 'function') {
    fail('AD.style.plantColor is missing');
  } else {
    let badCol = 0;
    AD.style.moodNames.forEach(function (m) {
      AD.site.treeNames.concat(['windowBox', 'vine', 'grass']).forEach(function (sp) {
        const c = AD.style.plantColor(AD.rng.makeRng('pal:' + m + ':' + sp), m, sp);
        ['leaf', 'deep', 'pale', 'bark'].forEach(function (k) {
          if (!HEX.test(String(c[k]))) {
            fail(m + '/' + sp + ' produced a bad ' + k + ': ' + c[k]); badCol++;
          }
        });
        if (c.bloom !== null && !HEX.test(String(c.bloom))) {
          fail(m + '/' + sp + ' produced a bad bloom: ' + c.bloom); badCol++;
        }
      });
    });
    // an unknown species must still come back with a usable palette
    const fallback = AD.style.plantColor(AD.rng.makeRng('x'), 'nosuchmood', 'nosuchplant');
    if (!HEX.test(String(fallback.leaf))) { fail('plantColor has no fallback path'); badCol++; }
    if (!badCol) ok('every family × species yields a valid palette (plus fallbacks)');

    const a = AD.style.plantColor(AD.rng.makeRng('same'), 'chinese', 'willow');
    const b = AD.style.plantColor(AD.rng.makeRng('same'), 'chinese', 'willow');
    if (JSON.stringify(a) !== JSON.stringify(b)) fail('plantColor is not deterministic');
    else ok('same stream → same planting colours');
  }

  // colour must stay a wash under the ink, never a covering
  const fa = AD.style.floraAlpha;
  const loud = Object.keys(fa).filter(function (k) { return fa[k] > 0.42; });
  if (loud.length) fail('flora alpha too opaque: ' + loud.join(', '));
  else ok('all planting fills stay translucent (max alpha ' +
    Math.max.apply(null, Object.keys(fa).map(function (k) { return fa[k]; })) + ')');

  // the plan must actually carry colour to every planted thing
  let missing = 0, leafSet = {};
  for (let i = 0; i < 160; i++) {
    const mood = AD.style.moodNames[i % AD.style.moodNames.length];
    const plan = AD.building.generate('flora' + i, { mood: mood, density: 1.3 });
    if (!plan.flora || !HEX.test(String(plan.flora.leaf))) { missing++; continue; }
    leafSet[plan.flora.leaf] = true;
    plan.site.trees.forEach(function (t) {
      if (!t.col || !HEX.test(String(t.col.leaf))) missing++;
      else leafSet[t.col.leaf] = true;
    });
    plan.site.planters.forEach(function (b) { if (!b.col) missing++; });
    plan.site.planting.forEach(function (g) { if (!g.col) missing++; });
  }
  if (missing) fail(missing + ' planted items reached render without a palette');
  else ok('every tree, planter and tuft carries its own colours');
  const distinct = Object.keys(leafSet).length;
  if (distinct < 6) fail('only ' + distinct + ' distinct greens across all families');
  else ok(distinct + ' distinct greens in play across the families');

  // a family's planting should read differently from another's
  const leavesOf = function (mood) {
    const seen = {};
    for (let i = 0; i < 40; i++) {
      const plan = AD.building.generate('cmp' + i, { mood: mood, density: 1.4 });
      plan.site.trees.forEach(function (t) { seen[t.col.leaf] = true; });
    }
    return Object.keys(seen);
  };
  const greekLeaves = leavesOf('greek');
  const japaneseLeaves = leavesOf('japanese');
  const shared = greekLeaves.filter(function (c) { return japaneseLeaves.indexOf(c) >= 0; });
  if (!greekLeaves.length || !japaneseLeaves.length) {
    fail('a family produced no planting at all');
  } else if (shared.length === greekLeaves.length && shared.length === japaneseLeaves.length) {
    fail('Greek and Japanese planting use identical palettes');
  } else {
    ok('family palettes diverge (greek ' + greekLeaves.length + ', japanese ' +
      japaneseLeaves.length + ', shared ' + shared.length + ')');
  }
}

console.log('new style families');
{
  // Each new family must actually reach its own signature variants, not fall
  // back to the defaults — that is the difference between a family and a label.
  const WANT = {
    chinese: { roofs: 'sweptEave', facades: 'latticeBay', windows: 'iceRay', doors: 'moonGate' },
    european: { facades: 'stuccoBays', windows: 'casement', gear: 'dovecote' },
    greek: { roofs: 'pediment', facades: 'colonnade', windows: 'trabeated', doors: 'pedimentDoor' },
    japanese: { roofs: 'broadEave', facades: 'veranda', windows: 'lattice' }
  };
  Object.keys(WANT).forEach(function (mood) {
    const hit = { roofs: false, facades: false, windows: false, doors: false, gear: false };
    for (let i = 0; i < 90; i++) {
      const plan = AD.building.generate('sig-' + mood + i, { mood: mood, density: 1.3 });
      plan.roofs.forEach(function (r) { if (r.variant === WANT[mood].roofs) hit.roofs = true; });
      Object.keys(plan.faces).forEach(function (k) {
        const f = plan.faces[k];
        if (f.system === WANT[mood].facades) hit.facades = true;
        if (f.win === WANT[mood].windows) hit.windows = true;
        if (f.hasDoor && f.door === WANT[mood].doors) hit.doors = true;
      });
      plan.gear.forEach(function (g) { if (g.type === WANT[mood].gear) hit.gear = true; });
    }
    const want = WANT[mood];
    const missed = Object.keys(want).filter(function (fam) { return !hit[fam]; });
    if (missed.length) {
      fail(mood + ' never produced its signature ' +
        missed.map(function (f) { return f + ':' + want[f]; }).join(', '));
    } else {
      ok(mood + ' reaches its own ' + Object.keys(want).map(function (f) {
        return want[f];
      }).join(', '));
    }
  });

  // and each of them has to survive the whole camera and detail range, at both
  // single-sheet and plate levels of detail
  let stressBad = 0, stressN = 0;
  ['chinese', 'european', 'greek', 'japanese'].forEach(function (mood) {
    for (let i = 0; i < 40; i++) {
      const view = { yaw: -60 + (i * 13) % 121, pitch: 2 + (i * 7) % 37 };
      const lod = [1, 0.5, 0.35][i % 3];
      const density = 0.4 + ((i % 7) / 6) * 1.2;
      let res;
      try {
        res = renderOnce('stress-' + mood + i, { mood: mood, density: density }, view,
          RECT, lod);
      } catch (err) {
        fail(mood + ' seed ' + i + ' threw: ' + err.stack.split('\n')[0]);
        stressBad++; continue;
      }
      stressN++;
      if (res.ctx._bad.length) {
        fail(mood + ' seed ' + i + ' emitted non-finite geometry: ' + res.ctx._bad[0]);
        stressBad++;
      } else if (res.ctx._ops < 400) {
        fail(mood + ' seed ' + i + ' came out nearly empty (' + res.ctx._ops + ' ops)');
        stressBad++;
      }
    }
  });
  if (!stressBad) ok(stressN + ' new-family sheets across the full orbit and all three LODs');
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
    ['unicode seed', '⌂ хата 建物', { mood: 'town', density: 1.6 }, { yaw: 180, pitch: 38 }],
    ['long seed', 'x'.repeat(48), { mood: 'tower', density: 0.4 }, { yaw: -180, pitch: 2 }],
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
  [4, 12, 24, 48].forEach(function (count) {
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
    const budget = count >= 48 ? 1200 : 900;
    if (job.done !== count) fail('plate ' + count + ' only drew ' + job.done + ' cells');
    else if (ctx._bad.length) fail('plate ' + count + ' non-finite: ' + ctx._bad[0]);
    else if (ms > budget) fail('plate ' + count + ' took ' + ms + ' ms (budget ' + budget + ')');
    else ok('plate of ' + count + ' drew all cells in ' + ms + ' ms (' + ctx._ops + ' ops)');
  });

  // cell seeds are stable across plate sizes
  const s24 = AD.plate.cellSeed('stable', 7);
  const s48 = AD.plate.cellSeed('stable', 7);
  if (s24 !== s48) fail('cell seeds unstable');
  else ok('cell 7 of seed "stable" is always ' + s24);
}

console.log('city mode');
{
  ['city-a', 'city-b', 'city-c'].forEach(function (seed) {
    const city = AD.city.generate(seed, { count: 24, density: 0.85, monumentality: 1 });
    const ctx = makeCtx();
    try {
      AD.city.render(ctx, city, { w: 900, h: 1125, yaw: 24, pitch: 18, density: 0.85, monumentality: 1, lod: 0.6 });
    } catch (err) {
      fail('city ' + seed + ' threw: ' + err.stack.split('\n')[0]);
      return;
    }
    if (city.roads.length < 8 || city.blocks.length < 12 || city.buildings.length < 20) fail('city ' + seed + ' lacks urban structure');
    else if (city.water.length < 8) fail('city ' + seed + ' lacks waterfront');
    else if (ctx._bad.length) fail('city ' + seed + ' non-finite: ' + ctx._bad[0]);
    else if (ctx._ops < 1000) fail('city ' + seed + ' drew too few operations');
    else ok('city ' + seed + ' drew ' + city.buildings.length + ' buildings, ' + city.roads.length + ' roads, ' + city.blocks.length + ' blocks');
  });
  const a = JSON.stringify(AD.city.generate('city-stable', { count: 24 }));
  const b = JSON.stringify(AD.city.generate('city-stable', { count: 24 }));
  if (a !== b) fail('city plan is not deterministic');
  else ok('city plan is deterministic across calls');
}

console.log('url state');
{
  const q = AD.exporter.queryString({
    seed: 'k7x2mp', mode: 'plate', mood: 'town', yaw: 24.456, pitch: 16, density: 1.2, monumentality: 1.3, count: 24
  });
  ['seed=k7x2mp', 'mode=plate', 'mood=town', 'yaw=24.46', 'density=1.2', 'monumentality=1.3', 'count=24'].forEach(function (frag) {
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
    vegetation: Object.keys(AD.details.vegetation).length,
    trees: Object.keys(AD.site.trees).length
  };
  const min = {
    windows: 14, doors: 9, roofs: 12, facades: 12,
    railings: 5, gear: 9, ornament: 11, vegetation: 4, trees: 10
  };
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
  const p = {
    lod: 1, glassAccent: '#6f88a3', doorAccent: '#c9a34a', vegAccent: '#7d8f6a',
    signAccent: '#c9a34a', trimAccent: '#b3873f',
    flora: AD.style.plantColor(AD.rng.makeRng('spec:flora'), 'japanese', 'windowBox')
  };
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

  // Roofs, ornament layers and planting are 3D-ish: they need a camera, a
  // prism and a frame rather than a bare quad. Exercise each of them once.
  const cam = AD.geom.makeCam({ yaw: 27, pitch: 17, scale: 16, cx: 450, cy: 700 });
  const P = function (x, y, z) { return AD.geom.project({ x: x, y: y, z: z }, cam); };
  const pr = AD.massing.prism(-5, -4, 10, 8, 0, 9);
  const frame = AD.massing.makeFrame(AD.massing.prismFaces(pr)[0], cam);
  const R = { P: P, cam: cam, pxPerUnit: cam.scale };
  let broke3d = 0;
  const run = function (label, fn) {
    const c = makeCtx();
    try { fn(c); } catch (err) {
      fail(label + ' threw: ' + err.stack.split('\n')[0]); broke3d++; return;
    }
    if (c._bad.length) { fail(label + ' emitted non-finite geometry'); broke3d++; }
    else if (c._ops < 4) { fail(label + ' drew nothing'); broke3d++; }
  };

  AD.roofs.roofNames.forEach(function (name) {
    const rr = AD.rng.makeRng('roof:' + name);
    const roof = {
      variant: name, h: AD.roofs.roofHeight(name, pr, rr), ov: 0.6,
      ridgeAxis: 'x', highSide: 'xmax', seamGap: 0.15, upturn: 0.3,
      steps: 3, merlons: 5, tileGap: 0.1, accent: '#c1633f'
    };
    run('roof ' + name, function (c) {
      AD.roofs.roofs[name](c, {
        P: P, cam: cam, prism: pr, roof: roof, pxPerUnit: cam.scale
      }, pens, AD.rng.makeRng('r:' + name), p);
    });
  });
  AD.details.gearNames.forEach(function (name) {
    run('gear ' + name, function (c) {
      AD.details.gear[name](c, R, pens, AD.rng.makeRng('g:' + name), p,
        { prism: 0, type: name, x: 0, y: 9, z: 0, size: 0.9 });
    });
  });
  AD.details.ornamentNames.forEach(function (name) {
    run('ornament ' + name, function (c) {
      AD.details.ornament[name](c, frame, pens, AD.rng.makeRng('o:' + name), p, {});
    });
  });
  AD.site.treeNames.forEach(function (name) {
    // once with no palette at all (the vegAccent fallback path)…
    run('tree ' + name, function (c) {
      const rr = AD.rng.makeRng('t:' + name);
      AD.site.trees[name](c, R, pens, rr, p,
        { type: name, x: 7, z: 2, h: AD.site.treeHeight(name, rr) });
    });
    // …and once fully coloured, the way building.js hands it over
    run('tree ' + name + ' (coloured)', function (c) {
      const rr = AD.rng.makeRng('tc:' + name);
      AD.site.trees[name](c, R, pens, rr, p, {
        type: name, x: -7, z: 1, h: AD.site.treeHeight(name, rr),
        col: AD.style.plantColor(AD.rng.makeRng('pc:' + name), 'chinese', name)
      });
    });
    // …and once with no colour hints whatsoever, to prove nothing assumes them
    run('tree ' + name + ' (mono)', function (c) {
      const rr = AD.rng.makeRng('tm:' + name);
      AD.site.trees[name](c, R, pens, rr, { lod: 1 },
        { type: name, x: 3, z: 0, h: AD.site.treeHeight(name, rr) });
    });
  });
  run('planter', function (c) {
    AD.site.planter(c, R, pens, AD.rng.makeRng('planter'), p,
      { x: 1, z: 4.6, w: 1.4, d: 0.7, h: 0.5, tall: true });
  });
  run('planter (coloured)', function (c) {
    AD.site.planter(c, R, pens, AD.rng.makeRng('planter2'), p, {
      x: 1, z: 4.6, w: 1.4, d: 0.7, h: 0.5, tall: true,
      col: AD.style.plantColor(AD.rng.makeRng('pc:box'), 'european', 'flowering')
    });
  });
  run('ground planting', function (c) {
    AD.site.groundPlanting(c, R, pens, AD.rng.makeRng('tufts'), p,
      { x: 0, z: 4.4, spread: 1.2, n: 4, scale: 1 });
  });
  run('ground planting (coloured)', function (c) {
    AD.site.groundPlanting(c, R, pens, AD.rng.makeRng('tufts2'), p, {
      x: 0, z: 4.4, spread: 1.2, n: 4, scale: 1,
      col: AD.style.plantColor(AD.rng.makeRng('pc:grass'), 'greek', 'grass')
    });
  });
  ['windowBox', 'potted'].forEach(function (name) {
    run('vegetation ' + name, function (c) {
      AD.details.vegetation[name](c, skew, pens, AD.rng.makeRng('v:' + name), p);
    });
  });
  run('vegetation trellis', function (c) {
    AD.details.vegetation.trellis(c, frame, pens, AD.rng.makeRng('v:trellis'), p, {});
  });
  run('vegetation vine', function (c) {
    AD.details.vegetation.vine(c, frame, pens, AD.rng.makeRng('v:vine'), p, {});
  });

  // façade systems get a real frame and a plausible config
  const cfg = {
    system: 'grid', win: 'lattice', altWin: null, floors: 4, bays: 4,
    marginU: 0.08, marginBottom: 0.03, marginTop: 0.04, winW: 0.55, winH: 0.6,
    floorLines: true, skip: 0, balconyP: 0.5, railing: 'lattice',
    hatchAngle: -0.9, hatchGap: 0.08, sparse: 0.1, arcadeDense: true,
    mullions: true, screenP: 0.5, screenDiagonal: true, posts: 4, braceP: 0.4,
    potP: 0.5, windowBoxP: 0.5, shadow: false, hasDoor: true, door: 'gateway',
    doorBay: 1, doorW: 0.7, doorH: 0.85, ornaments: []
  };
  AD.facade.systemNames.forEach(function (name) {
    run('facade ' + name, function (c) {
      AD.facade.systems[name](c, frame, pens, AD.rng.makeRng('f:' + name), p, cfg);
    });
  });
  if (!broke3d) {
    ok('every roof, gear, ornament, façade and planting variant inks cleanly ' +
      '(' + (AD.roofs.roofNames.length + AD.details.gearNames.length +
        AD.details.ornamentNames.length + AD.site.treeNames.length * 3 +
        AD.facade.systemNames.length + 8) + ' checks, planting run coloured, ' +
      'uncoloured and mono)');
  }
}

console.log('');
if (failures) {
  console.error('FAILED — ' + failures + ' problem(s)');
  process.exit(1);
}
console.log('ALL SMOKE CHECKS PASSED');

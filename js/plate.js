// js/plate.js — sketchbook plate mode: a grid of independent buildings.
//
// Every cell gets its own forked stream, so cell 7 is the same building whether
// the plate holds 12 or 48. Rendering is a job you step through, which lets the
// UI draw the plate progressively (it visibly inks itself) while export runs the
// exact same job to completion in one go.
(function () {
  'use strict';
  const NS = {};
  const S = AD.stroke;
  const ST = AD.style;

  const GRIDS = { 4: [2, 2], 12: [3, 4], 24: [4, 6], 48: [6, 8] };
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  NS.counts = [4, 12, 24, 48];

  function grid(count) {
    return GRIDS[count] || GRIDS[24];
  }

  function lodFor(count) {
    if (count >= 48) return 0.35;
    if (count <= 4) return 0.78;
    if (count >= 24) return 0.5;
    return 0.62;
  }

  function cellSeed(masterSeed, i) {
    return AD.rng.randomSeedFrom(AD.rng.makeRng(masterSeed + ':cell:' + i));
  }

  function focusRect(o, p) {
    const base = cellRect(o, o.focusIndex);
    const target = { x: o.w * 0.06, y: o.h * 0.09, w: o.w * 0.88, h: o.h * 0.78 };
    return {
      x: base.x + (target.x - base.x) * p,
      y: base.y + (target.y - base.y) * p,
      w: base.w + (target.w - base.w) * p,
      h: base.h + (target.h - base.h) * p
    };
  }

  function clipOutsideFocus(ctx, o) {
    if (!o.showBackground || o.focusIndex == null) return;
    const r = focusRect(o, o.focusProgress);
    ctx.beginPath();
    ctx.rect(0, 0, o.w, o.h);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip('evenodd');
  }

  function drawHeader(ctx, opts, seedLabel) {
    const w = opts.w, h = opts.h;
    const pens = S.makePens(AD.rng.makeRng(seedLabel + ':platepen'), ST.pens.dryNib);
    const rng = AD.rng.makeRng(seedLabel + ':plate');
    const y = h * 0.052;
    const m = w * 0.045;
    S.strokePath(ctx, pens.outline, [{ x: m, y: y }, { x: w - m, y: y }],
      { lod: 1, width: 0.9 });
    ctx.save();
    ctx.fillStyle = ST.caption.color;
    ctx.font = ST.caption.header;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ANTITECTURE — PLATE ' + seedLabel.toUpperCase(), m, y - 9);
    ctx.font = ST.caption.small;
    const label = opts.count + ' STUDIES · ' + (opts.mood === 'any' ? 'MIXED' : opts.mood.toUpperCase());
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, w - m - tw, y - 10);
    ctx.restore();
    // a couple of margin scribbles so the sheet reads as a working page
    if (rng.chance(0.8)) {
      S.strokePath(ctx, pens.hair, [
        { x: m, y: y + 5 }, { x: m + rng.range(30, 90), y: y + 5 + rng.range(-1, 1) }
      ], { lod: 1, alpha: 0.6 });
    }
  }

  function cellRect(opts, i) {
    const g = grid(opts.count);
    const cols = g[0], rows = g[1];
    const top = opts.h * 0.075;
    const bottom = opts.h * 0.03;
    const sideM = opts.w * 0.035;
    const gw = (opts.w - sideM * 2) / cols;
    const gh = (opts.h - top - bottom) / rows;
    const c = i % cols, r = Math.floor(i / cols);
    return {
      x: sideM + c * gw,
      y: top + r * gh,
      w: gw,
      h: gh * 0.86,
      pad: 0.09
    };
  }

  /**
   * create(ctx, opts) -> job
   * opts: {seed, count, mood, density, view:{yaw,pitch}, w, h, showCaptions}
   * job.next(n) draws up to n more cells and returns true while work remains.
   */
  function create(ctx, opts) {
    const count = GRIDS[opts.count] ? opts.count : 24;
    const o = {
      seed: String(opts.seed), count: count, mood: opts.mood || 'any',
      density: opts.density == null ? 1 : opts.density,
      monumentality: opts.monumentality == null ? 1 : opts.monumentality,
      view: opts.view || { yaw: 22, pitch: 16 },
      w: opts.w, h: opts.h,
      focusIndex: opts.focusIndex == null ? null : +opts.focusIndex,
      focusProgress: clamp(opts.focusProgress == null ? (opts.focusIndex == null ? 0 : 1) : opts.focusProgress, 0, 1),
      showBackground: opts.showBackground === true,
      showCaptions: opts.showCaptions !== false
    };
    const lod = lodFor(count);
    ctx.save();
    clipOutsideFocus(ctx, o);
    ctx.globalAlpha = o.showBackground ? 1 : 1 - o.focusProgress;
    drawHeader(ctx, o, o.seed);
    ctx.restore();

    let i = 0;
    const job = {
      total: count,
      done: 0,
      next: function (n) {
        n = n || 1;
        for (let k = 0; k < n && i < count; k++, i++) {
          drawCell(ctx, o, i, lod);
          job.done = i + 1;
        }
        return i < count;
      },
      finish: function () {
        while (job.next(6)) { /* keep going */ }
        return job;
      }
    };
    return job;
  }

  function drawCell(ctx, o, i, lod) {
    const seed = cellSeed(o.seed, i);
    const baseRect = cellRect(o, i);
    const p = o.focusProgress;
    const focused = o.focusIndex != null;
    const isFocus = focused && i === o.focusIndex;
    const rect = isFocus ? Object.assign(focusRect(o, p), { pad: baseRect.pad }) : baseRect;
    const opacity = o.showBackground ? 1 : (focused && !isFocus ? 1 - p : 1);
    if (focused && !isFocus && !o.showBackground) return;
    const jitter = AD.rng.makeRng(seed + ':view');
    // per-cell yaw variation so the plate reads as varied studies, not a stamp
    const view = {
      yaw: Math.max(-180, Math.min(180, o.view.yaw + jitter.range(-26, 26))),
      pitch: Math.max(2, Math.min(38, o.view.pitch + jitter.range(-6, 9))),
      opaqueWalls: !!o.view.opaqueWalls
    };
    ctx.save();
    if (!isFocus) clipOutsideFocus(ctx, o);
    ctx.globalAlpha *= opacity;
    let plan = null;
    S.setCaptureGroup(i);
    try {
      plan = AD.building.generate(seed, { mood: o.mood, density: o.density, monumentality: o.monumentality });
      AD.building.render(ctx, plan, view, rect, lod);
    } catch (err) {
      if (typeof console !== 'undefined') console.error('plate cell ' + i + ' failed', err);
      const pens = S.makePens(AD.rng.makeRng(seed + ':fallback'), ST.pens.fineNib);
      S.strokePoly(ctx, pens.hair, [
        { x: rect.x + rect.w * 0.3, y: rect.y + rect.h * 0.4 },
        { x: rect.x + rect.w * 0.7, y: rect.y + rect.h * 0.4 },
        { x: rect.x + rect.w * 0.7, y: rect.y + rect.h * 0.62 },
        { x: rect.x + rect.w * 0.3, y: rect.y + rect.h * 0.62 }
      ], { lod: lod, close: true });
    }
    if (o.showCaptions) {
      ctx.save();
      ctx.fillStyle = ST.caption.color;
      ctx.font = ST.caption.small;
      const label = 'Nº ' + seed;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, rect.x + (rect.w - tw) / 2, rect.y + rect.h + 11);
      ctx.restore();
    }
    S.setCaptureGroup(null);
    ctx.restore();
  }

  NS.create = create;
  NS.grid = grid;
  NS.lodFor = lodFor;
  NS.cellSeed = cellSeed;
  NS.cellRect = cellRect;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.plate = NS;
})();

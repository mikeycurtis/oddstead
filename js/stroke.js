// js/stroke.js — dry-nib stroke engine.
//
// Every visible mark in the app goes through strokePath(). A stroke is drawn as
// a filled ribbon (one fill() per stroke) rather than a variable-width polyline,
// which is both faster and far better looking: it lets the width swell, taper,
// and momentarily "run dry" along the path.
(function () {
  'use strict';
  const NS = {};
  let captureTarget = null;
  let captureGroup = null;

  const MAX_SAMPLES = 400;
  const MAX_HATCH = 34;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function finite(p) { return p && isFinite(p.x) && isFinite(p.y); }

  // --- pens -----------------------------------------------------------------
  /**
   * makePen(rng, preset, tier) -> Pen
   * tier: 'outline' | 'detail' | 'hatch' | 'hair'
   * All pens of one drawing share a preset so the whole page reads as one hand.
   */
  function makePen(rng, preset, tier) {
    const mult = (preset.tiers && preset.tiers[tier]) || 1;
    return {
      rng: rng,
      noise: AD.rng.makeNoise1D(rng),
      tier: tier,
      baseWidth: preset.baseWidth * mult,
      wobbleAmp: preset.wobbleAmp * (tier === 'hatch' || tier === 'hair' ? 0.72 : 1),
      wobbleFreq: preset.wobbleFreq,
      taper: preset.taper,
      dryness: preset.dryness * (tier === 'hatch' ? 1.5 : 1),
      overshoot: preset.overshoot,
      filament: preset.filament,
      color: preset.ink
    };
  }

  /** makePens(rng, preset) -> {outline, detail, hatch, hair} */
  function makePens(rng, preset) {
    return {
      preset: preset,
      outline: makePen(rng.fork('outline'), preset, 'outline'),
      detail: makePen(rng.fork('detail'), preset, 'detail'),
      hatch: makePen(rng.fork('hatch'), preset, 'hatch'),
      hair: makePen(rng.fork('hair'), preset, 'hair')
    };
  }

  // --- resampling -----------------------------------------------------------
  function resample(pts, step) {
    const out = [{ x: pts[0].x, y: pts[0].y, s: 0 }];
    let S = 0, acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-9) continue;
      let t = 0;
      while (acc + (d - t) >= step) {
        t += step - acc;
        acc = 0;
        out.push({ x: a.x + dx * (t / d), y: a.y + dy * (t / d), s: S + t });
        if (out.length >= MAX_SAMPLES) return out;
      }
      acc += d - t;
      S += d;
    }
    const last = pts[pts.length - 1];
    const lp = out[out.length - 1];
    if (Math.hypot(last.x - lp.x, last.y - lp.y) > step * 0.4) {
      out.push({ x: last.x, y: last.y, s: S });
    } else {
      lp.x = last.x; lp.y = last.y; lp.s = S;
    }
    return out;
  }

  // --- the core -------------------------------------------------------------
  /**
   * strokePath(ctx, pen, pts, opts)
   * opts: {close, lod, width, amp, color, alpha, noTaper, filament}
   */
  function strokePath(ctx, pen, pts, opts) {
    opts = opts || {};
    if (!pts || pts.length < 2) return;
    const lod = clamp(opts.lod == null ? 1 : opts.lod, 0.25, 1);

    let src = pts;
    for (let i = 0; i < src.length; i++) if (!finite(src[i])) return;
    if (opts.close) src = src.concat([src[0]]);

    const step = 3.1 / lod;
    const S = resample(src, step);
    if (S.length < 2) return;

    const total = S[S.length - 1].s;
    if (!(total > 0.05)) return;

    const phase = pen.rng.range(0, 971);
    const amp = pen.wobbleAmp * (opts.amp == null ? 1 : opts.amp);
    const wMul = (opts.width == null ? 1 : opts.width);
    const doTaper = !opts.close && !opts.noTaper;
    const taperLen = clamp(pen.taper, 0.02, 0.49);
    const dryThresh = 1 - pen.dryness * 3.1;

    const L = [], R = [], C = [];
    for (let i = 0; i < S.length; i++) {
      const prev = S[i > 0 ? i - 1 : 0];
      const next = S[i < S.length - 1 ? i + 1 : S.length - 1];
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;

      const s = S[i].s;
      const off = pen.noise(s * pen.wobbleFreq + phase) * amp;
      const cx = S[i].x + nx * off;
      const cy = S[i].y + ny * off;

      // pressure-like swell
      let w = pen.baseWidth * wMul *
        (0.62 + 0.38 * (0.5 + 0.5 * pen.noise(s * 0.085 + phase + 311)));

      if (doTaper) {
        const t = s / total;
        const e = Math.min(1, t / taperLen) * Math.min(1, (1 - t) / taperLen);
        w *= 0.4 + 0.6 * Math.sqrt(Math.max(0, e));
      }
      // dry-nib dropout: the line momentarily loses contact with the paper
      if (pen.noise(s * 0.032 + phase + 733) > dryThresh) w *= 0.17;

      w = Math.max(0.24, w);
      const h = w * 0.5;
      C.push({ x: cx, y: cy });
      L.push({ x: cx + nx * h, y: cy + ny * h });
      R.push({ x: cx - nx * h, y: cy - ny * h });
    }

    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.fillStyle = opts.color || pen.color;
    ctx.beginPath();
    ctx.moveTo(L[0].x, L[0].y);
    for (let i = 1; i < L.length; i++) ctx.lineTo(L[i].x, L[i].y);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i].x, R[i].y);
    ctx.closePath();
    ctx.fill();

    // split-nib filaments: a hairline running alongside part of the stroke
    const fp = opts.filament == null ? pen.filament : opts.filament;
    if (lod >= 0.85 && C.length > 6 && fp > 0 && pen.rng.chance(fp)) {
      const n = C.length;
      const i0 = pen.rng.int(0, Math.max(0, n - 4));
      const i1 = Math.min(n - 1, i0 + pen.rng.int(3, Math.floor(n * 0.5) + 3));
      const side = pen.rng.chance(0.5) ? 1 : -1;
      const d = pen.rng.range(0.7, 1.6) * side;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        const prev = C[i > 0 ? i - 1 : 0];
        const next = C[i < n - 1 ? i + 1 : n - 1];
        let tx = next.x - prev.x, ty = next.y - prev.y;
        const tl = Math.hypot(tx, ty) || 1;
        const px = (-ty / tl) * d, py = (tx / tl) * d;
        if (i === i0) ctx.moveTo(C[i].x + px, C[i].y + py);
        else ctx.lineTo(C[i].x + px, C[i].y + py);
      }
      ctx.strokeStyle = opts.color || pen.color;
      ctx.globalAlpha = (opts.alpha == null ? 1 : opts.alpha) * 0.5;
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
    ctx.restore();
    if (captureTarget) {
      captureTarget.push({
        left: L.map(function (p) { return { x: p.x, y: p.y }; }),
        right: R.map(function (p) { return { x: p.x, y: p.y }; }),
        color: opts.color || pen.color,
        alpha: opts.alpha == null ? 1 : opts.alpha,
        group: captureGroup
      });
    }
  }

  function beginCapture(target) { captureTarget = target || []; return captureTarget; }
  function setCaptureGroup(group) { captureGroup = group; }
  function endCapture() { const out = captureTarget; captureTarget = null; captureGroup = null; return out || []; }

  function strokeLine(ctx, pen, a, b, opts) {
    strokePath(ctx, pen, [a, b], opts);
  }

  // Extend segment end past the corner — the classic sketch crossing.
  function extended(a, b, by) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: b.x + (dx / d) * by, y: b.y + (dy / d) * by };
  }

  /**
   * strokePoly — draws each edge as its own stroke with random corner
   * overshoots. Rectangles drawn this way stop looking like CAD instantly.
   */
  function strokePoly(ctx, pen, pts, opts) {
    opts = opts || {};
    if (!pts || pts.length < 2) return;
    const close = opts.close !== false;
    const n = pts.length;
    const last = close ? n : n - 1;
    const os = opts.overshoot == null ? pen.overshoot : opts.overshoot;
    const mag = opts.overshootPx || 2.6;
    for (let i = 0; i < last; i++) {
      let a = pts[i];
      let b = pts[(i + 1) % n];
      if (!finite(a) || !finite(b)) continue;
      if (os > 0 && pen.rng.chance(os)) b = extended(a, b, pen.rng.range(0.8, mag));
      if (os > 0 && pen.rng.chance(os * 0.6)) a = extended(b, a, pen.rng.range(0.6, mag * 0.7));
      strokePath(ctx, pen, [a, b], opts);
    }
  }

  function strokeEllipse(ctx, pen, cx, cy, rx, ry, opts) {
    opts = opts || {};
    const segs = Math.max(10, Math.round(12 + (rx + ry) * 0.35));
    const pts = [];
    const rot = opts.rotation || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push({ x: cx + x * cr - y * sr, y: cy + x * sr + y * cr });
    }
    const o = {};
    for (const k in opts) o[k] = opts[k];
    o.close = true;
    strokePath(ctx, pen, pts, o);
  }

  // --- quad helpers ---------------------------------------------------------
  // quad = [p00 (u0,v0), p10, p11, p01] — u right, v up.
  function quadPt(q, u, v) {
    const bx = q[0].x + (q[1].x - q[0].x) * u;
    const by = q[0].y + (q[1].y - q[0].y) * u;
    const tx = q[3].x + (q[2].x - q[3].x) * u;
    const ty = q[3].y + (q[2].y - q[3].y) * u;
    return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
  }

  function subQuad(q, u0, v0, u1, v1) {
    return [
      quadPt(q, u0, v0), quadPt(q, u1, v0),
      quadPt(q, u1, v1), quadPt(q, u0, v1)
    ];
  }

  function quadSize(q) {
    const w = (Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y) +
      Math.hypot(q[2].x - q[3].x, q[2].y - q[3].y)) * 0.5;
    const h = (Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y) +
      Math.hypot(q[2].x - q[1].x, q[2].y - q[1].y)) * 0.5;
    return { w: w, h: h };
  }

  function quadOk(q) {
    if (!q || q.length !== 4) return false;
    for (let i = 0; i < 4; i++) if (!finite(q[i])) return false;
    const s = quadSize(q);
    return s.w > 0.5 && s.h > 0.5;
  }

  // Liang–Barsky clip of a parametric line against the unit UV square.
  function clipUnit(px, py, dx, dy) {
    let t0 = -1e9, t1 = 1e9;
    const p = [-dx, dx, -dy, dy];
    const q = [px, 1 - px, py, 1 - py];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) {
        if (q[i] < 0) return null;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
    }
    if (t1 - t0 < 1e-6) return null;
    return [px + dx * t0, py + dy * t0, px + dx * t1, py + dy * t1];
  }

  /**
   * hatchQuad — parallel lines laid out in the quad's own UV space, so they
   * foreshorten with the wall for free.
   * opts: {angle (rad, UV space), gap (UV), jitter (px), lod, max, width, alpha}
   */
  function hatchQuad(ctx, pen, quad, opts) {
    opts = opts || {};
    if (!quadOk(quad)) return;
    const angle = opts.angle == null ? -1.0 : opts.angle;
    const gap = Math.max(0.03, opts.gap == null ? 0.13 : opts.gap);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const px = -dy, py = dx;

    let lo = 1e9, hi = -1e9;
    const cor = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let i = 0; i < 4; i++) {
      const t = cor[i][0] * px + cor[i][1] * py;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    const span = hi - lo;
    let n = Math.floor(span / gap);
    const max = Math.min(MAX_HATCH, opts.max || MAX_HATCH);
    if (n > max) n = max;
    if (n < 1) return;

    const jit = opts.jitter == null ? 0.012 : opts.jitter;
    for (let i = 1; i <= n; i++) {
      const t = lo + (span * i) / (n + 1);
      const seg = clipUnit(px * t, py * t, dx, dy);
      if (!seg) continue;
      const j = function () { return pen.rng.range(-jit, jit); };
      const a = quadPt(quad, clamp(seg[0] + j(), 0, 1), clamp(seg[1] + j(), 0, 1));
      const b = quadPt(quad, clamp(seg[2] + j(), 0, 1), clamp(seg[3] + j(), 0, 1));
      strokePath(ctx, pen, [a, b], {
        lod: opts.lod, width: opts.width, alpha: opts.alpha, filament: 0
      });
    }
  }

  /** scribbleFill — zigzag pass across a quad; foliage, signage, deep shadow. */
  function scribbleFill(ctx, pen, quad, opts) {
    opts = opts || {};
    if (!quadOk(quad)) return;
    const passes = Math.max(3, Math.min(26, Math.round(opts.density == null ? 9 : opts.density)));
    const pts = [];
    for (let i = 0; i <= passes; i++) {
      const u = i / passes;
      const up = clamp(u + pen.rng.range(-0.03, 0.03), 0, 1);
      const v = i % 2 === 0 ? pen.rng.range(0.02, 0.16) : pen.rng.range(0.84, 0.98);
      pts.push(quadPt(quad, up, v));
    }
    strokePath(ctx, pen, pts, {
      lod: opts.lod, width: opts.width == null ? 0.9 : opts.width,
      alpha: opts.alpha, filament: 0
    });
  }

  /** inkFill — flat accent fill with wobbled edges. Always drawn UNDER line work. */
  function inkFill(ctx, quad, color, alpha, rng, jitter) {
    if (!quadOk(quad)) return;
    const j = jitter == null ? 1.4 : jitter;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = quad[i];
      const x = p.x + (rng ? rng.range(-j, j) : 0);
      const y = p.y + (rng ? rng.range(-j, j) : 0);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function polyFill(ctx, pts, color, alpha) {
    if (!pts || pts.length < 3) return;
    for (let i = 0; i < pts.length; i++) if (!finite(pts[i])) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Misregistered accent: offset the fill from its outline like a bad print run. */
  function accentFill(ctx, quad, color, rng, opts) {
    opts = opts || {};
    const S = AD.style;
    const a = rng.range(S.accentAlpha.min, S.accentAlpha.max);
    const off = rng.range(S.accentOffset.min, S.accentOffset.max);
    const ang = rng.range(0, Math.PI * 2);
    const ox = Math.cos(ang) * off, oy = Math.sin(ang) * off;
    const q = [];
    for (let i = 0; i < 4; i++) q.push({ x: quad[i].x + ox, y: quad[i].y + oy });
    inkFill(ctx, q, color, opts.alpha == null ? a : opts.alpha, rng, opts.jitter);
  }

  NS.makePen = makePen;
  NS.makePens = makePens;
  NS.strokePath = strokePath;
  NS.beginCapture = beginCapture;
  NS.setCaptureGroup = setCaptureGroup;
  NS.endCapture = endCapture;
  NS.strokeLine = strokeLine;
  NS.strokePoly = strokePoly;
  NS.strokeEllipse = strokeEllipse;
  NS.hatchQuad = hatchQuad;
  NS.scribbleFill = scribbleFill;
  NS.inkFill = inkFill;
  NS.polyFill = polyFill;
  NS.accentFill = accentFill;
  NS.quadPt = quadPt;
  NS.subQuad = subQuad;
  NS.quadSize = quadSize;
  NS.quadOk = quadOk;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.stroke = NS;
})();

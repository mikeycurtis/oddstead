// js/paper.js — paper base colour, cached grain tile, vignette.
//
// The grain tile is generated once at boot from a FIXED seed: paper is the same
// sheet for every drawing, like a real sketchbook. Ink never recomputes paper —
// rendering is strictly (1) ink pass, (2) paper pass on top with multiply.
(function () {
  'use strict';
  const NS = {};
  const TILE = 256;
  let tile = null;

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    return null;
  }

  function buildTile() {
    const c = makeCanvas(TILE, TILE);
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const rng = AD.rng.makeRng('paper-tooth-v1');
    const S = AD.style.paper;

    // soft large-scale mottling
    for (let i = 0; i < 14; i++) {
      const x = rng.range(0, TILE), y = rng.range(0, TILE);
      const r = rng.range(40, 130);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(138,122,95,0.030)');
      g.addColorStop(1, 'rgba(138,122,95,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // tooth specks
    const specks = 9000;
    for (let i = 0; i < specks; i++) {
      const x = rng.range(0, TILE), y = rng.range(0, TILE);
      const a = rng.range(0.018, 0.055);
      ctx.fillStyle = 'rgba(138,122,95,' + a.toFixed(3) + ')';
      const s = rng.chance(0.12) ? 2 : 1;
      ctx.fillRect(x, y, s, s);
    }

    // a few long paper fibres
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 40; i++) {
      const x = rng.range(0, TILE), y = rng.range(0, TILE);
      const ang = rng.range(0, Math.PI * 2);
      const len = rng.range(18, 70);
      ctx.strokeStyle = 'rgba(156,141,112,' + rng.range(0.05, 0.11).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x, cy = y, a = ang;
      const steps = Math.max(3, Math.round(len / 6));
      for (let k = 0; k < steps; k++) {
        a += rng.range(-0.3, 0.3);
        cx += Math.cos(a) * (len / steps);
        cy += Math.sin(a) * (len / steps);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    // keep unused var lint-free
    void S;
    return c;
  }

  function getTile() {
    if (!tile) tile = buildTile();
    return tile;
  }

  /** base(ctx, w, h, seedRng) — clear to warm off-white with a touch of variance */
  function base(ctx, w, h, rng) {
    let color = AD.style.paper.base;
    if (rng) {
      // ±3 lightness so no two sheets are quite identical
      const d = Math.round(rng.range(-3, 3));
      const hex = AD.style.paper.base;
      const r = clamp255(parseInt(hex.slice(1, 3), 16) + d);
      const g = clamp255(parseInt(hex.slice(3, 5), 16) + d);
      const b = clamp255(parseInt(hex.slice(5, 7), 16) + d);
      color = 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }

  /**
   * overlay(ctx, w, h, scale) — grain + vignette pass. `scale` lets exports tile
   * the grain larger so a 2× export doesn't look like an upscaled screenshot.
   */
  function overlay(ctx, w, h, scale) {
    scale = scale || 1;
    const t = getTile();
    ctx.save();
    if (t) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1;
      const size = TILE * scale;
      for (let y = 0; y < h; y += size) {
        for (let x = 0; x < w; x += size) {
          ctx.drawImage(t, x, y, size, size);
        }
      }
    }
    // vignette
    ctx.globalCompositeOperation = 'multiply';
    const cx = w / 2, cy = h / 2;
    const r0 = Math.min(w, h) * 0.34;
    const r1 = Math.hypot(w, h) * 0.62;
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, AD.style.paper.vignette);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  NS.base = base;
  NS.overlay = overlay;
  NS.getTile = getTile;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.paper = NS;
})();

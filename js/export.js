// js/export.js — URL state, clipboard, and PNG export.
//
// Export re-renders the whole pipeline into an offscreen canvas at 2× (paper
// grain included and re-tiled at scale), so a saved file is a real drawing, not
// an upscaled screenshot.
(function () {
  'use strict';
  const NS = {};
  const MAX_PIXELS = 4096 * 4096;

  const FIELDS = {
    seed: 'string',
    mode: 'string',
    mood: 'string',
    yaw: 'number',
    pitch: 'number',
    density: 'number',
    count: 'number',
    opaqueWalls: 'boolean'
  };

  function readState(defaults) {
    const out = {};
    for (const k in defaults) out[k] = defaults[k];
    if (typeof location === 'undefined' || !location.search) return out;
    let params;
    try {
      params = new URLSearchParams(location.search);
    } catch (e) {
      return out;
    }
    for (const k in FIELDS) {
      if (!params.has(k)) continue;
      const raw = params.get(k);
      if (raw === null || raw === '') continue;
      if (FIELDS[k] === 'number') {
        const v = parseFloat(raw);
        if (isFinite(v)) out[k] = v;
      } else if (FIELDS[k] === 'boolean') {
        out[k] = raw === '1' || raw === 'true' || raw === 'on';
      } else {
        out[k] = String(raw).slice(0, 64);
      }
    }
    return out;
  }

  function queryString(state) {
    const parts = [];
    for (const k in FIELDS) {
      if (state[k] === undefined || state[k] === null) continue;
      let v = state[k];
      if (FIELDS[k] === 'number') v = Math.round(v * 100) / 100;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    return '?' + parts.join('&');
  }

  function writeState(state) {
    if (typeof history === 'undefined' || !history.replaceState) return;
    try {
      history.replaceState(null, '', queryString(state));
    } catch (e) {
      /* file:// in some browsers refuses replaceState — harmless */
    }
  }

  function shareURL(state) {
    if (typeof location === 'undefined') return queryString(state);
    return location.origin + location.pathname + queryString(state);
  }

  /** copyText -> Promise<boolean>; falls back to execCommand for file:// pages. */
  function copyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    if (typeof document === 'undefined') return false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function download(canvas, filename) {
    return new Promise(function (resolve, reject) {
      const finish = function (href, revoke) {
        try {
          const a = document.createElement('a');
          a.href = href;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
          resolve(true);
        } catch (e) {
          reject(e);
        }
      };
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (!blob) {
            try { finish(canvas.toDataURL('image/png'), false); } catch (e) { reject(e); }
            return;
          }
          finish(URL.createObjectURL(blob), true);
        }, 'image/png');
      } else {
        try { finish(canvas.toDataURL('image/png'), false); } catch (e) { reject(e); }
      }
    });
  }

  /**
   * exportPNG({w, h, scale, filename, draw})
   * `draw(ctx, w, h, scale)` must render the complete scene, paper included.
   */
  function exportPNG(opts) {
    let scale = opts.scale || 2;
    const baseW = opts.w, baseH = opts.h;
    while (baseW * scale * baseH * scale > MAX_PIXELS && scale > 1) scale -= 0.25;
    const w = Math.round(baseW * scale);
    const h = Math.round(baseH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.reject(new Error('2D canvas unavailable'));
    opts.draw(ctx, w, h, scale);
    return download(canvas, opts.filename || 'antitecture.png');
  }

  NS.readState = readState;
  NS.writeState = writeState;
  NS.queryString = queryString;
  NS.shareURL = shareURL;
  NS.copyText = copyText;
  NS.exportPNG = exportPNG;

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.exporter = NS;
})();

// js/main.js — boot, state, UI wiring, render orchestration.
//
// State discipline: seed / mood / density determine the DESIGN (changing them
// regenerates the plan); yaw / pitch / mode / plate size only determine the
// VIEW (changing them re-renders the same plan). That is why dragging the orbit
// sliders never turns your building into a different building.
(function () {
  'use strict';

  const S = AD.stroke;
  const ST = AD.style;

  const DEFAULTS = {
    seed: '',
    mode: 'single',
    mood: 'any',
    yaw: 24,
    pitch: 16,
    density: 1,
    count: 24,
    opaqueWalls: false,
    focus: null
  };

  const ASPECT = { single: 0.8, plate: 0.72 };
  const MAX_DPR = 2;

  const state = AD.exporter.readState(DEFAULTS);
  let canvas = null, ctx = null;
  let cssW = 900, cssH = 1100, dpr = 1;
  let plan = null;
  let job = null, rafId = null;
  let animationId = 0;
  let focusRafId = 0;
  let statusTimer = null;
  let debug = false;
  const el = {};

  // --- helpers --------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function wrapYaw(v) { return ((v + 180) % 360 + 360) % 360 - 180; }

  function sanitizeState() {
    if (!state.seed) state.seed = AD.rng.freshSeed();
    state.seed = String(state.seed).trim().slice(0, 48) || AD.rng.freshSeed();
    if (state.mode !== 'plate') state.mode = 'single';
    if (state.mood !== 'any' && !ST.moods[state.mood]) state.mood = 'any';
    state.yaw = clamp(isFinite(state.yaw) ? state.yaw : 24, -180, 180);
    state.pitch = clamp(isFinite(state.pitch) ? state.pitch : 16, 2, 38);
    state.density = clamp(isFinite(state.density) ? state.density : 1, 0.4, 1.6);
    state.count = AD.plate.counts.indexOf(+state.count) >= 0 ? +state.count : 24;
    state.opaqueWalls = state.opaqueWalls === true || state.opaqueWalls === 'true' || state.opaqueWalls === 1;
    state.focus = state.mode === 'plate' && state.focus !== null && state.focus !== '' && Number.isInteger(+state.focus) && +state.focus >= 0 && +state.focus < state.count ? +state.focus : null;
  }

  function status(msg, sticky) {
    if (!el.status) return;
    el.status.textContent = msg || '';
    if (statusTimer) clearTimeout(statusTimer);
    if (msg && !sticky) {
      statusTimer = setTimeout(function () {
        if (el.status.textContent === msg) el.status.textContent = '';
      }, 2200);
    }
  }

  // --- canvas sizing --------------------------------------------------------
  function layoutCanvas() {
    const aspect = ASPECT[state.mode] || ASPECT.single;
    const parentW = canvas.parentNode ? canvas.parentNode.clientWidth : 0;
    cssW = Math.max(280, Math.round(canvas.clientWidth || parentW || 900));
    cssH = Math.round(cssW / aspect);
    canvas.style.height = cssH + 'px';
    dpr = Math.min(MAX_DPR, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const pw = Math.round(cssW * dpr), ph = Math.round(cssH * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
  }

  // --- drawing --------------------------------------------------------------
  function drawCaption(c, w, h, plan_) {
    c.save();
    c.fillStyle = ST.caption.color;
    c.font = ST.caption.font;
    c.textBaseline = 'alphabetic';
    c.fillText('Nº ' + plan_.seed, w * 0.062, h * 0.962);
    c.font = ST.caption.small;
    const right = (ST.moods[plan_.mood] ? ST.moods[plan_.mood].label : plan_.mood).toUpperCase() +
      ' · ' + plan_.kind.toUpperCase() + ' · ' + plan_.mass.prisms.length +
      (plan_.mass.prisms.length === 1 ? ' VOLUME' : ' VOLUMES');
    const tw = c.measureText(right).width;
    c.fillText(right, w - w * 0.062 - tw, h * 0.962);
    c.restore();
  }

  function drawError(c, w, h, message) {
    c.save();
    c.fillStyle = 'rgba(35,38,48,0.8)';
    c.font = ST.caption.font;
    c.textBaseline = 'top';
    c.fillText('Could not ink this drawing.', w * 0.08, h * 0.44);
    c.font = ST.caption.small;
    c.fillText(String(message).slice(0, 120), w * 0.08, h * 0.44 + 22);
    c.fillText('Press space for a new seed.', w * 0.08, h * 0.44 + 40);
    c.restore();
  }

  function ensurePlan() {
    if (plan && plan.seed === state.seed &&
      plan.density === state.density &&
      plan.requestedMood === state.mood) return plan;
    const t0 = now();
    plan = AD.building.generate(state.seed, { mood: state.mood, density: state.density });
    plan.requestedMood = state.mood;
    if (debug) console.log('[antitecture] generate', (now() - t0).toFixed(1) + 'ms', plan.kind, plan.mood);
    return plan;
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /** Ink one single-building sheet into a prepared context (logical units). */
  function inkSingle(c, w, h, plan_, view) {
    AD.building.render(c, plan_, view, { x: 0, y: 0, w: w, h: h * 0.93, pad: 0.11 }, 1);
    drawCaption(c, w, h, plan_);
  }

  function beginFrame(c, w, h, scale) {
    c.setTransform(scale, 0, 0, scale, 0, 0);
    AD.paper.base(c, w, h, AD.rng.makeRng(state.seed + ':paper'));
  }

  function endFrame(c, w, h, scale) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    AD.paper.overlay(c, w * scale, h * scale, scale);
  }

  /** Keep the canvas's accessible name describing what is actually drawn. */
  function updateA11y() {
    if (!canvas) return;
    let label;
    if (state.mode === 'plate') {
      label = 'Sketchbook plate of ' + state.count + ' generated buildings, seed ' +
        state.seed + ', ' + (state.mood === 'any' ? 'mixed moods' : state.mood + ' mood') + '.';
    } else if (plan) {
      label = 'Hand-drawn sketch of an imaginary ' + plan.kind + ' building, ' +
        plan.mass.prisms.length + ' volume(s), ' + plan.mood + ' mood, seed ' + plan.seed +
        ', viewed at ' + Math.round(state.yaw) + ' degrees.';
    } else {
      label = 'Generated architectural doodle, seed ' + state.seed + '.';
    }
    canvas.setAttribute('aria-label', label);
  }

  function stopAnimation() {
    if (animationId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(animationId);
    animationId = 0;
    if (el.animate) el.animate.textContent = 'Animate drawing';
  }

  function stopJob() {
    if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
    rafId = null;
    job = null;
  }

  function render(options) {
    const immediate = !!(options && options.immediate);
    if (!ctx) return;
    stopAnimation();
    stopJob();
    sanitizeState();
    syncControls();
    AD.exporter.writeState(state);
    layoutCanvas();

    const focusIndex = options && Object.prototype.hasOwnProperty.call(options, 'focusIndex') ? options.focusIndex : state.focus;
    const focusProgress = options && Object.prototype.hasOwnProperty.call(options, 'focusProgress') ? options.focusProgress : (state.focus == null ? 0 : 1);
    const t0 = now();
    try {
      beginFrame(ctx, cssW, cssH, dpr);
      if (state.mode === 'single') {
        const p = ensurePlan();
        inkSingle(ctx, cssW, cssH, p, { yaw: state.yaw, pitch: state.pitch, opaqueWalls: state.opaqueWalls });
        endFrame(ctx, cssW, cssH, dpr);
        if (debug) console.log('[antitecture] render', (now() - t0).toFixed(1) + 'ms');
        updateA11y();
        status('');
      } else {
        // progressive: the plate visibly inks itself, cell by cell
        job = AD.plate.create(ctx, {
          seed: state.seed, count: state.count, mood: state.mood,
          density: state.density, view: { yaw: state.yaw, pitch: state.pitch, opaqueWalls: state.opaqueWalls },
          focusIndex: focusIndex, focusProgress: focusProgress,
          w: cssW, h: cssH
        });
        if (immediate) {
          job.finish();
          endFrame(ctx, cssW, cssH, dpr);
          if (debug) console.log('[antitecture] immediate plate', (now() - t0).toFixed(1) + 'ms');
          updateA11y();
          status('');
          job = null;
          rafId = null;
          return;
        }
        status('inking 0/' + job.total + '…', true);
        const step = function () {
          if (!job) return;
          const more = job.next(state.count >= 48 ? 3 : 2);
          if (more) {
            status('inking ' + job.done + '/' + job.total + '…', true);
            rafId = requestAnimationFrame(step);
          } else {
            endFrame(ctx, cssW, cssH, dpr);
            if (debug) console.log('[antitecture] plate', (now() - t0).toFixed(1) + 'ms');
            updateA11y();
            status('');
            job = null;
            rafId = null;
          }
        };
        rafId = requestAnimationFrame(step);
      }
    } catch (err) {
      console.error(err);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawError(ctx, cssW, cssH, err && err.message ? err.message : err);
      endFrame(ctx, cssW, cssH, dpr);
      status('render failed — try a new seed', true);
    }
  }

  /** Full-quality re-render used by PNG export (no progressive batching). */
  function drawForExport(c, w, h, scale) {
    const lw = w / scale, lh = h / scale;
    beginFrame(c, lw, lh, scale);
    if (state.mode === 'single') {
      inkSingle(c, lw, lh, ensurePlan(), { yaw: state.yaw, pitch: state.pitch, opaqueWalls: state.opaqueWalls });
    } else {
      AD.plate.create(c, {
        seed: state.seed, count: state.count, mood: state.mood,
        density: state.density, view: { yaw: state.yaw, pitch: state.pitch, opaqueWalls: state.opaqueWalls },
        focusIndex: state.focus, focusProgress: state.focus == null ? 0 : 1,
        w: lw, h: lh
      }).finish();
    }
    endFrame(c, lw, lh, scale);
  }

  function animateDrawing() {
    if (!ctx) return;
    if (animationId) { stopAnimation(); render(); return; }
    stopJob();
    sanitizeState();
    syncControls();
    AD.exporter.writeState(state);
    layoutCanvas();

    const off = document.createElement('canvas');
    off.width = Math.round(cssW * dpr);
    off.height = Math.round(cssH * dpr);
    const oc = off.getContext('2d');
    if (!oc) return;
    const strokes = [];
    AD.stroke.beginCapture(strokes);
    drawForExport(oc, off.width, off.height, dpr);
    AD.stroke.endCapture();

    function drawCapturedStroke(stroke) {
      if (!stroke || stroke.left.length < 2) return;
      ctx.save();
      ctx.globalAlpha = stroke.alpha;
      ctx.fillStyle = stroke.color;
      ctx.beginPath();
      ctx.moveTo(stroke.left[0].x, stroke.left[0].y);
      for (let i = 1; i < stroke.left.length; i++) ctx.lineTo(stroke.left[i].x, stroke.left[i].y);
      for (let i = stroke.right.length - 1; i >= 0; i--) ctx.lineTo(stroke.right[i].x, stroke.right[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const groupsByKey = Object.create(null);
    strokes.forEach(function (stroke) {
      const key = stroke.group == null ? 'header' : 'cell-' + stroke.group;
      (groupsByKey[key] || (groupsByKey[key] = [])).push(stroke);
    });
    const groups = Object.keys(groupsByKey).sort(function (a, b) {
      if (a === 'header') return -1;
      if (b === 'header') return 1;
      return Number(a.slice(5)) - Number(b.slice(5));
    }).map(function (key) { return groupsByKey[key]; });
    const maxGroupStrokes = groups.reduce(function (max, group) { return Math.max(max, group.length); }, 0);
    const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const duration = Math.max(3500, Math.min(10000, maxGroupStrokes * 14));
    el.animate.textContent = 'Stop animation';
    status('drawing 0/' + strokes.length + '…', true);

    function frame(nowTime) {
      const nowValue = nowTime == null ? Date.now() : nowTime;
      const raw = Math.max(0, Math.min(1, (nowValue - started) / duration));
      const count = Math.min(maxGroupStrokes, Math.max(0, Math.floor(raw * maxGroupStrokes)));
      let drawn = 0;
      let currentTip = null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      AD.paper.base(ctx, cssW, cssH, AD.rng.makeRng(state.seed + ':animation-paper'));
      // Keep final color fills and paper-backed walls hidden until the ink is mostly complete.
      // This makes the line-by-line construction unmistakable instead of looking like a fade.
      const ghostAlpha = raw > 0.86 ? ((raw - 0.86) / 0.14) * 0.055 : 0;
      if (ghostAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = ghostAlpha;
        ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, cssW, cssH);
        ctx.restore();
      }
      groups.forEach(function (group) {
        const n = Math.min(group.length, count);
        drawn += n;
        for (let i = 0; i < n; i++) drawCapturedStroke(group[i]);
        if (n > 0 && n < group.length) currentTip = group[n - 1];
      });
      if (currentTip) {
        const tip = currentTip.left[Math.floor(currentTip.left.length * 0.5)];
        if (tip) {
          ctx.save();
          ctx.fillStyle = 'rgba(214, 58, 92, 0.8)';
          ctx.beginPath();
          ctx.arc(tip.x, tip.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (raw < 1 && animationId !== 0) {
        status('drawing ' + drawn + '/' + strokes.length + '…', true);
        animationId = requestAnimationFrame(frame);
      } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(off, 0, 0);
        animationId = 0;
        el.animate.textContent = 'Animate drawing';
        status('');
        updateA11y();
      }
    }
    animationId = requestAnimationFrame(frame);
  }

  // --- actions --------------------------------------------------------------
  function regenerate(newSeed) {
    state.seed = newSeed || AD.rng.freshSeed();
    plan = null;
    render();
  }

  function applySeedInput() {
    const v = (el.seed.value || '').trim();
    if (!v) {
      status('seed cannot be empty — randomising instead');
      regenerate();
      return;
    }
    if (v === state.seed) { render(); return; }
    regenerate(v);
  }

  function toggleMode() {
    state.mode = state.mode === 'single' ? 'plate' : 'single';
    render();
  }

  function doCopy() {
    AD.exporter.copyText(AD.exporter.shareURL(state)).then(function (ok) {
      status(ok ? 'link copied ✓' : 'copy failed — seed is ' + state.seed);
    });
  }

  function doExport() {
    if (el.png) { el.png.disabled = true; el.png.textContent = 'inking…'; }
    status('rendering export…', true);
    const filename = 'antitecture-' + state.seed + '-' + state.mode + '.png';
    // yield a frame so the disabled state paints before the sync render
    setTimeout(function () {
      AD.exporter.exportPNG({
        w: cssW, h: cssH, scale: 2, filename: filename, draw: drawForExport
      }).then(function () {
        status('saved ' + filename);
      }).catch(function (err) {
        console.error(err);
        status('export failed: ' + (err && err.message ? err.message : err));
      }).then(function () {
        if (el.png) { el.png.disabled = false; el.png.textContent = 'Export PNG'; }
      });
    }, 30);
  }

  // --- controls -------------------------------------------------------------
  function syncControls() {
    if (!el.seed) return;
    if (document.activeElement !== el.seed) el.seed.value = state.seed;
    el.mood.value = state.mood;
    el.mode.value = state.mode;
    el.count.value = String(state.count);
    el.yaw.value = String(state.yaw);
    el.pitch.value = String(state.pitch);
    el.density.value = String(state.density);
    el.opaqueWalls.checked = state.opaqueWalls;
    el.yawOut.textContent = Math.round(state.yaw) + '°';
    el.pitchOut.textContent = Math.round(state.pitch) + '°';
    el.densityOut.textContent = Number(state.density).toFixed(1) + '×';
    el.countWrap.hidden = state.mode !== 'plate';
    el.countWrap.setAttribute('aria-hidden', state.mode !== 'plate' ? 'true' : 'false');
  }

  function bind() {
    el.canvas = canvas;
    el.seed = document.getElementById('seed');
    el.apply = document.getElementById('apply-seed');
    el.random = document.getElementById('randomize');
    el.copy = document.getElementById('copy-link');
    el.animate = document.getElementById('animate-drawing');
    el.png = document.getElementById('export-png');
    el.mode = document.getElementById('mode');
    el.count = document.getElementById('count');
    el.countWrap = document.getElementById('count-wrap');
    el.mood = document.getElementById('mood');
    el.yaw = document.getElementById('yaw');
    el.pitch = document.getElementById('pitch');
    el.density = document.getElementById('density');
    el.yawOut = document.getElementById('yaw-out');
    el.pitchOut = document.getElementById('pitch-out');
    el.densityOut = document.getElementById('density-out');
    el.opaqueWalls = document.getElementById('opaque-walls');
    el.status = document.getElementById('status');

    el.random.addEventListener('click', function () { regenerate(); });
    el.apply.addEventListener('click', applySeedInput);
    el.seed.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applySeedInput(); }
    });
    el.seed.addEventListener('change', applySeedInput);
    el.copy.addEventListener('click', doCopy);
    el.animate.addEventListener('click', animateDrawing);
    el.png.addEventListener('click', doExport);

    el.mode.addEventListener('change', function () {
      state.mode = el.mode.value === 'plate' ? 'plate' : 'single';
      state.focus = null;
      render();
    });
    el.count.addEventListener('change', function () {
      state.count = +el.count.value;
      state.focus = null;
      render();
    });
    el.mood.addEventListener('change', function () {
      state.mood = el.mood.value;
      state.focus = null;
      plan = null;
      render();
    });
    el.yaw.addEventListener('input', function () {
      state.yaw = +el.yaw.value;
      el.yawOut.textContent = Math.round(state.yaw) + '°';
      render();
    });
    el.pitch.addEventListener('input', function () {
      state.pitch = +el.pitch.value;
      el.pitchOut.textContent = Math.round(state.pitch) + '°';
      render();
    });
    el.density.addEventListener('input', function () {
      state.density = +el.density.value;
      el.densityOut.textContent = Number(state.density).toFixed(1) + '×';
      plan = null;
      render();
    });
    el.opaqueWalls.addEventListener('change', function () {
      state.opaqueWalls = el.opaqueWalls.checked;
      render();
    });

    function plateCellAt(e) {
      const box = canvas.getBoundingClientRect();
      const x = (e.clientX - box.left) * cssW / box.width;
      const y = (e.clientY - box.top) * cssH / box.height;
      for (let i = 0; i < state.count; i++) {
        const r = AD.plate.cellRect({ count: state.count, w: cssW, h: cssH }, i);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return null;
    }

    function animatePlateFocus(target) {
      if (focusRafId) cancelAnimationFrame(focusRafId);
      const opening = target != null;
      const focusIndex = opening ? target : state.focus;
      const from = opening ? 0 : 1;
      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const duration = 620;
      state.focus = target;
      function step(t) {
        const raw = Math.max(0, Math.min(1, ((t == null ? Date.now() : t) - started) / duration));
        const smooth = raw * raw * (3 - 2 * raw);
        const progress = from + (opening ? 1 : -1) * smooth;
        render({ immediate: true, focusIndex: focusIndex, focusProgress: progress });
        if (raw < 1) focusRafId = requestAnimationFrame(step);
        else {
          focusRafId = 0;
          state.focus = target;
          render({ immediate: true });
        }
      }
      focusRafId = requestAnimationFrame(step);
    }

    function handleCanvasClick(e) {
      if (state.mode === 'plate') {
        const target = state.focus == null ? plateCellAt(e) : null;
        if (target != null || state.focus != null) {
          animatePlateFocus(target);
          return;
        }
      }
      regenerate();
    }

    let drag = null;
    let suppressClick = false;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, startX: e.clientX, startY: e.clientY, moved: false, yaw: state.yaw, pitch: state.pitch };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      canvas.classList.add('is-dragging');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      state.yaw = wrapYaw(drag.yaw - dx * 0.55);
      state.pitch = clamp(drag.pitch - dy * 0.24, 2, 38);
      el.yaw.value = String(state.yaw);
      el.pitch.value = String(state.pitch);
      el.yawOut.textContent = Math.round(state.yaw) + '°';
      el.pitchOut.textContent = Math.round(state.pitch) + '°';
      render({ immediate: true });
    });
    function endDrag(e) {
      if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
      suppressClick = drag.moved;
      try { canvas.releasePointerCapture(drag.id); } catch (_) {}
      drag = null;
      canvas.classList.remove('is-dragging');
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('click', function (e) {
      if (suppressClick) { suppressClick = false; e.preventDefault(); return; }
      handleCanvasClick(e);
    });

    document.addEventListener('keydown', function (e) {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let handled = true;
      switch (e.key) {
        case ' ': case 'Spacebar': regenerate(); break;
        case 'p': case 'P': toggleMode(); break;
        case 's': case 'S': doExport(); break;
        case 'c': case 'C': doCopy(); break;
        case 'ArrowLeft': state.yaw = clamp(state.yaw - 5, -180, 180); render(); break;
        case 'ArrowRight': state.yaw = clamp(state.yaw + 5, -180, 180); render(); break;
        case 'ArrowUp': state.pitch = clamp(state.pitch + 3, 2, 38); render(); break;
        case 'ArrowDown': state.pitch = clamp(state.pitch - 3, 2, 38); render(); break;
        case '[': state.density = clamp(state.density - 0.1, 0.4, 1.6); plan = null; render(); break;
        case ']': state.density = clamp(state.density + 0.1, 0.4, 1.6); plan = null; render(); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    });

    let resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        // same seed, so a resize never changes the drawing — only its resolution
        render();
      }, 200);
    });
  }

  function populateSelects() {
    const moodSel = document.getElementById('mood');
    ST.moodNames.forEach(function (m) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = ST.moods[m].label;
      moodSel.appendChild(o);
    });
    const countSel = document.getElementById('count');
    AD.plate.counts.forEach(function (n) {
      const o = document.createElement('option');
      o.value = String(n);
      o.textContent = n + ' studies';
      countSel.appendChild(o);
    });
  }

  function boot() {
    canvas = document.getElementById('sheet');
    if (!canvas || !canvas.getContext) {
      const note = document.getElementById('status');
      if (note) note.textContent = 'This browser cannot draw on a 2D canvas.';
      return;
    }
    ctx = canvas.getContext('2d');
    debug = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search);
    populateSelects();
    bind();
    sanitizeState();
    syncControls();
    AD.paper.getTile(); // build the grain tile once, before first paint
    render();
    if (debug) window.AD_DEBUG = { state: state, plan: function () { return plan; } };
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  const root = typeof window !== 'undefined' ? window : globalThis;
  root.AD = root.AD || {};
  root.AD.app = { render: render, state: state, regenerate: regenerate };
})();

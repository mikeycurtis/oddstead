# PLAN.md — Antitecture Doodles

Implementation plan for a vanilla JavaScript + HTML5 Canvas 2D generative architecture
doodle app, per `PRD.txt`. This document is the single source of truth for the
implementing agent. Every decision below is deliberate; do not substitute frameworks,
libraries, or build tooling. **Zero dependencies. No build step. No ES modules.**

---

## 0. Core decisions (read first)

1. **Plain `<script>` tags, not ES modules.** ES modules fail on `file://` in Chrome.
   The app must work by double-clicking `index.html`. Each JS file attaches one
   namespace object to a single global `AD` (e.g. `AD.rng`, `AD.stroke`). Script order
   in `index.html` is the dependency order.
2. **One canvas, CPU-friendly.** A single visible `<canvas>`; offscreen canvases only
   for the paper texture (cached) and export re-render.
3. **Orthographic-with-cheat projection, not a real 3D pipeline.** Yaw + pitch orbit,
   orthographic projection with a small fake-perspective shrink. No matrices exposed in
   element code — elements only ever see projected 2D points handed to them by the
   face/frame system (§3).
4. **Determinism by construction:** exactly one PRNG implementation, forked per
   subsystem via labeled sub-streams, and `Math.random` is never called (Stage 8
   verifies this with a grep).
5. **Two-pass render:** (a) ink pass — all strokes/fills into the scene; (b) paper
   pass — pre-rendered grain overlay composited on top with `multiply`, plus a
   subtle vignette. Ink never recomputes paper.
6. **Style is a first-class module.** All colors, line-weight hierarchy, wobble
   amplitudes, and probabilities live in `style.js` presets — never inline magic
   numbers in element functions.

---

## 1. File structure and responsibilities

```
antitecture-doodles/
├── index.html          Page shell, canvas, control bar, script tags (order matters)
├── style.css           UI chrome styling (controls, header, buttons) — NOT drawing style
├── PLAN.md             This file
├── PRD.txt             Requirements (do not edit)
└── js/
    ├── rng.js          Seeded PRNG: xmur3 hash, mulberry32, stream forking, helpers
    ├── style.js        Ink/paper palette, pen presets, weight hierarchy, mood presets
    ├── stroke.js       Dry-nib stroke engine: wobble, width envelope, dropouts, hatching
    ├── paper.js        Paper texture generation + cached grain canvas + vignette
    ├── geom.js         Vec3 math, camera (yaw/pitch), project(), face visibility
    ├── massing.js      Volume recipes (box, L, tower, cluster...), Face/Frame helpers
    ├── el-roofs.js     Roof drawing functions (variants)
    ├── el-openings.js  Windows, doors, arches (variants)
    ├── el-facade.js    Façade systems: window grids, arcades, balconies, hatched walls
    ├── el-details.js   Cornices, chimneys, antennas, AC units, signage, vegetation on
    │                   buildings, railings
    ├── el-site.js      Ground line, plinth/steps, sidewalk, trees, fences, birds
    ├── building.js     Building recipes: pick massing + style, place elements on faces
    ├── plate.js        Plate mode: grid layout, per-cell seeds, captions, page header
    ├── export.js       PNG export (2x re-render), copy-seed, URL param read/write
    └── main.js         Boot, state, UI wiring, keyboard, resize, render orchestration
```

`index.html` script order: `rng, style, stroke, paper, geom, massing, el-roofs,
el-openings, el-facade, el-details, el-site, building, plate, export, main`.

Each file follows this skeleton:

```js
// js/stroke.js
(function () {
  'use strict';
  const NS = {};
  // ...functions...
  NS.strokePath = strokePath;
  window.AD = window.AD || {};
  AD.stroke = NS;
})();
```

---

## 2. Seeded PRNG and deterministic state (`rng.js`)

### 2.1 Implementation

- `xmur3(str) -> () => uint32` — string hash used to seed from arbitrary strings.
- `mulberry32(seedUint32) -> () => float in [0,1)` — the one and only PRNG core.
- `makeRng(seed)` — accepts an integer or string; strings hashed via xmur3; returns
  an `Rng` object.

### 2.2 Rng API (used everywhere; raw generators never passed around)

```js
const rng = AD.rng.makeRng(seed);
rng.next()                  // float [0,1)
rng.range(a, b)             // float [a,b)
rng.int(a, b)               // integer [a,b] inclusive
rng.chance(p)               // boolean, true with probability p
rng.pick(array)             // uniform choice
rng.weighted([[item, w], ...])  // weighted choice
rng.gauss(mu, sigma)        // Box–Muller normal (cache the spare value)
rng.shuffle(array)          // Fisher–Yates, in place, returns array
rng.fork(label)             // NEW independent Rng seeded from (this.seed + ':' + label)
```

### 2.3 Stream discipline (the important part)

A naive single-stream PRNG makes every element's randomness depend on draw order, so
adding one window changes the whole building. Therefore:

- `building.js` receives the master rng and immediately forks named streams:
  `rng.fork('massing')`, `rng.fork('style')`, `rng.fork('facade:0')` (per face),
  `rng.fork('details')`, `rng.fork('site')`.
- The **stroke engine gets its own fork per building** (`rng.fork('pen')`) so wobble
  jitter never consumes structural randomness. Camera/view angle does NOT come from
  the seed — it is UI state — so the same seed at different angles is the same building.
- Plate mode: cell `i` uses `masterRng.fork('cell:' + i)`; the plate never shares a
  stream across cells.

### 2.4 Seed format and app state

- Displayed/canonical seed: base-36 string of a 32-bit int (e.g. `k7x2mp`), but any
  user-typed string is valid (hashed).
- Full reproducible state = `{ seed, mode ('single'|'plate'), yaw, pitch, density,
  mood, plateCount }`, serialized to the URL query string by `export.js`
  (`?seed=k7x2mp&mode=plate&yaw=28&...`). On load, `main.js` reads the URL; absent
  params get defaults. Regenerating writes a new seed to the URL via
  `history.replaceState` (no page reload, back-button not polluted).

### 2.5 Deterministic value noise (also in `rng.js`)

The stroke engine needs smooth 1D noise. Implement `makeNoise1D(rng)`: a lattice of
256 random values from the given rng, cosine-interpolated, `noise(t)` returns
[-1, 1]. No simplex/perlin dependency needed; this is 15 lines and fully seeded.

---

## 3. Lightweight 3D massing & projection (`geom.js`, `massing.js`)

### 3.1 Coordinate system & camera

- World: **+Y is up**, ground plane at y = 0, building footprint centered on origin.
  Units are abstract "meters"; a typical building is 8–20 wide, 6–40 tall.
- Camera = `{ yaw, pitch }` only (no roll — roll adds nothing to this aesthetic and
  complicates the ground line). Yaw in degrees [-60, 60], pitch in [5, 35].
- Projection: rotate point by yaw (around Y) then pitch (around X), then:

```js
// geom.js
function project(p, cam) {
  const r = rotXY(p, cam);              // rotated 3D point, z = depth toward viewer
  const persp = 1 - r.z * cam.perspK;   // cheat perspective; perspK ≈ 0.004
  return {
    x: cam.cx + r.x * cam.scale * persp,
    y: cam.cy - r.y * cam.scale * persp,
    z: r.z                              // kept for painter's ordering
  };
}
```

  `perspK = 0` gives pure axonometric; default 0.004 gives a barely-there depth taper
  that reads as "hand-drawn perspective that doesn't quite converge" — exactly the
  naïve look we want. Never implement a real frustum.

### 3.2 Volumes

A building mass is an array of **prisms**: `{ x, z, w, d, y0, h }` (axis-aligned
footprint rect, base height y0, height h — y0 lets towers stack setbacks). Roof
geometry is separate (ridge lines computed by roof functions from the top face).
This is deliberately restrictive: axis-aligned boxes + roof prisms cover the entire
Antitecture look; arbitrary polyhedra are out of scope.

`massing.js` recipes (each returns `{ prisms: [...], kind }`):

1. `slab` — one wide box, 2–5 floors.
2. `tower` — tall box, optional 1–2 setbacks (stacked shrinking prisms).
3. `lshape` — two boxes sharing a corner.
4. `cluster` — 2–4 boxes of differing heights packed side by side / overlapping.
5. `longhouse` — low 1–2 floor box, wide, made for big roofs.

Weighted selection lives in `building.js` per mood (§8).

### 3.3 Faces and visibility

For each prism, generate its 4 wall faces + top face. A face is:

```js
{ corners: [v0, v1, v2, v3],  // 3D, CCW seen from outside
  normal, prism, dir }         // dir: 'N'|'S'|'E'|'W'|'top'
```

- **Visibility:** face is drawn iff `dot(normal, viewDir) < -0.05` (small epsilon so
  edge-on faces drop out rather than rendering as degenerate slivers).
- **Painter's order:** sort prisms by projected centroid `z` (far → near); within a
  prism draw far faces then near. With axis-aligned boxes and this camera range,
  centroid sort is sufficient — no z-buffer, no polygon clipping. Overlap glitches
  at cluster seams are acceptable per PRD ("slight sliding is desirable"); hide the
  worst by drawing each prism's silhouette outline last with the heaviest pen weight.

### 3.4 The Frame abstraction (how elements stay pure & 2D)

Element functions never touch 3D. `massing.makeFrame(face, cam)` returns a **Frame**:

```js
frame.pt(u, v)      // face-local UV in [0,1]² -> projected {x, y} canvas point
frame.quad(u0,v0,u1,v1)  // 4 projected corners of a sub-rect (for windows etc.)
frame.width, frame.height   // world-space dimensions of the face
frame.px(u)         // approx projected pixel length of u world units (for LOD)
```

`pt` is bilinear interpolation across the four projected corners — cheap, and it
bakes the perspective cheat in automatically. All façade layout happens in UV space;
foreshortening comes for free. This is the single trick that makes "features stay
correctly placed under rotation" work with almost no 3D code.

---

## 4. Dry-nib stroke engine (`stroke.js`)

This is the soul of the app. Build and visually tune it **before** any architecture.

### 4.1 Pen model

A `Pen` = `{ rng, noise, baseWidth, wobbleAmp, wobbleFreq, taper, dryness, inkColor }`
created per building from a `style.js` preset via `makePen(penRng, preset, weightTier)`.
Weight tiers (multipliers on preset base): `outline` ×1.0 (≈2.2 px at scale 1),
`detail` ×0.55, `hatch` ×0.38. One pen personality per drawing; tiers only scale it.

### 4.2 Core algorithm — `strokePath(ctx, pen, points, opts)`

Input: array of `{x, y}` canvas points (a polyline; curves are pre-flattened by
callers). Steps:

1. **Resample** to roughly one point per 3.5 px of arc length (cap 400 pts/stroke).
2. **Wobble:** displace each point along its normal by
   `noise(s * wobbleFreq + strokePhase) * wobbleAmp`, where `s` is arc length and
   `strokePhase = pen.rng.range(0, 1000)` per stroke — every stroke wobbles
   differently but deterministically. Also add a tiny endpoint miss: start/end
   points offset by `pen.rng.gauss(0, 0.6)` px, and corners **overshoot** by 1–3 px
   with probability 0.3 (classic sketch crossing at rectangle corners — big
   style win, trivial to do: extend first/last segment).
3. **Width envelope:** `w(s) = baseWidth * (0.55 + 0.45 * noise2(s)) * taperFn(s)`
   where `taperFn` eases from ~0.4 at the tips to 1 in the middle (pressure swell).
4. **Render as a ribbon:** build left/right offset polylines from `w(s)/2` along
   normals; fill the closed polygon with `inkColor`. One `fill()` per stroke — far
   cheaper and better-looking than many `lineTo` strokes of varying `lineWidth`.
5. **Dry-nib dropouts:** where `noise3(s) > 1 - dryness` (dryness ≈ 0.12), pinch the
   ribbon width toward ~15% for a few samples — the line "runs dry" mid-stroke.
6. **Filaments (cheap, capped):** with probability `0.25 * dryness` per stroke, draw
   1–2 hairlines (width 0.4) offset ~1px alongside a random sub-span — dry-brush
   split-nib effect. Skip entirely when `opts.lod < 1` (plate mode small cells).

### 4.3 Public API

```js
AD.stroke.makePen(rng, preset, tier)          // -> Pen
AD.stroke.strokePath(ctx, pen, pts, opts)     // opts: {close, lod, overshoot}
AD.stroke.strokeLine(ctx, pen, a, b, opts)
AD.stroke.strokePoly(ctx, pen, pts, opts)     // close + corner overshoots
AD.stroke.strokeEllipse(ctx, pen, cx, cy, rx, ry)  // flattened to polyline
AD.stroke.hatchQuad(ctx, pen, quad, {angle, gap, jitter})  // clipped parallel lines
AD.stroke.inkFill(ctx, quad, color, alpha)    // flat tinted fill (accents), drawn
                                              // UNDER line work by callers
AD.stroke.scribbleFill(ctx, pen, quad, density) // zigzag scribble for foliage/shadow
```

`hatchQuad` works in the quad's own bilinear UV space (parallel lines in UV, each
jittered ±1px, each drawn with `strokePath`) — so hatching foreshortens with the
wall. Used for: shadow sides of buildings, roof shading, door glass, ground shadow.

### 4.4 LOD

Every stroke call takes `opts.lod` (1 = single view, 0.5 = plate ≤24, 0.35 = plate
48). LOD scales resample density, disables filaments below 1, reduces wobble sample
count, and lets element functions skip micro-detail (`if (lod < 0.5) return` inside
tiny ornaments). This is the main plate-performance lever.

---

## 5. Paper texture strategy (`paper.js`)

- **Base:** CSS-visible canvas cleared to warm off-white `#f2ecdd` per render
  (slight per-seed variance: ±3 lightness via style rng).
- **Grain (cached):** at boot, render ONE 512×512 offscreen grain tile:
  ~14,000 1px specks at alpha 0.02–0.05 in gray-brown, plus ~40 faint long fibers
  (low-alpha wobbled hairlines), plus a very soft large-scale mottling (12 blurred
  radial blobs, alpha 0.015). Grain uses its own fixed-seed rng (`makeRng('paper')`)
  — paper is the same across all seeds, like a real sketchbook.
- **Compositing:** after the ink pass, `ctx.globalCompositeOperation = 'multiply'`,
  tile the grain canvas across the frame, restore. Then a vignette: radial gradient,
  transparent center → `rgba(60,50,35,0.08)` edges, also multiply.
- **Tooth interaction (fake, cheap):** true per-pixel tooth-breaking of ink is too
  slow; the multiply grain pass over slightly-transparent ink (ink alpha 0.9)
  reads convincingly as tooth. Do not build a per-stroke texture mask.
- Export re-renders at 2× and re-tiles grain at 2× so exports aren't upscaled.

---

## 6. Element functions — pure drawing APIs (`el-*.js`)

### 6.1 Contract

Every element is a pure function of `(ctx, frame_or_quad, pen(s), rng, params)`:
no globals, no retained state, all randomness from the passed rng, all geometry from
the passed frame/quad. Signature pattern:

```js
// el-openings.js
function windowGridSash(ctx, quad, pens, rng, p) { /* p: {lod, accent} */ }
```

Variant registries per category, e.g.:

```js
NS.windows = [windowPlain, windowSash, windowArched, windowShuttered,
              windowRound, windowRibbon];
```

`building.js` picks variants via `rng.weighted` using per-mood weight tables in
`style.js`. **A building picks ONE window variant per façade system** (real
buildings repeat their windows) with a 15% chance of a second variant for the top
floor — repetition + one deviation is the core of architectural charm.

### 6.2 Required variants (minimum counts — build all of these)

| Category | Variants (≥) |
|---|---|
| Windows (`el-openings`) | 6: plain rect w/ sill tick; sash (cross mullion); arched top; shuttered (side flaps + hatch); round/porthole; ribbon (wide, 3–5 mullions) |
| Doors (`el-openings`) | 4: plain + steps tick; arched + fanlight; double w/ center line; storefront (wide, glass hatch, awning flap) |
| Roofs (`el-roofs`) | 5: flat + parapet line; gabled (ridge from top-face frame, end triangles); hipped; mono-pitch/shed; barrel-vault (2–3 flattened arcs) — each with optional tile/seam hatching at lod ≥ 0.5 |
| Façade systems (`el-facade`) | 4: regular window grid (rows × cols in UV with margins); arcade/colonnade (ground-floor arches); solid hatched wall (shadow side); balconied grid (grid + balcony on 30–60% of windows) |
| Balconies/railings (`el-details`) | 3 railing styles: vertical bars; X-cross; solid slab w/ hatch |
| Chimneys/roof gear (`el-details`) | 4: brick chimney (2–3 hatch ticks); thin flue + cap; antenna (mast + 2–3 cross ticks); water tank (cylinder on 4 legs) |
| Ornament (`el-details`) | 4: cornice (double line + tick marks under); pilasters (vertical pairs at façade edges); signage blob (rect + scribble "text"); AC unit (small box + fan circle) |
| Vegetation (`el-details`/`el-site`) | 4: window-box scribble; climbing vine (wobbly line up wall + leaf scribbles); round-canopy tree (trunk + scribbleFill blob); cypress (tall narrow scribble) |
| Site (`el-site`) | 4: ground line (long wobbly horizontal through building base ±2px); plinth/steps (2–3 nested quads); fence run (posts + 1–2 rails); sidewalk ticks + optional birds (2-stroke 'v's in sky, 40% of drawings) |

That's ~38 hand-authored drawing functions. Each is 15–60 lines. This is the bulk
of the implementation work and where the charm lives — budget the most time here.

### 6.3 Composition flow (`building.js`)

```js
AD.building.generate(seed, opts)  // -> Building {seed, mood, massing, plan}
AD.building.render(ctx, building, cam, layout, lod)
```

`generate` (pure data, no drawing): fork streams → pick mood → pick massing recipe →
for each prism face, choose a façade system + variants + parameters (floor count from
height, bay count from width) → choose roof per prism → choose details (Poisson-ish:
`detailBudget = density * area`) → choose site elements. Result is a **plan object**
(serializable, debuggable).

`render`: compute cam + fit-to-rect scale from the massing's projected bounding box
(so every building fills its cell nicely regardless of size) → painter-sort faces →
per face: optional `inkFill` accent, façade system, then details → roofs → per-prism
silhouette re-stroke with outline pen → site elements → ground shadow
(`hatchQuad` on the shadow-side ground, 3–5 lines).

Separating generate/render means: re-rendering at a new angle or export scale never
re-rolls the design, and plate captions can show per-cell seeds cheaply.

---

## 7. Modes, controls, keyboard, export

### 7.1 Single mode

One building, canvas ~900×1100 CSS px (portrait, like a sketchbook page), centered
with generous margins (building occupies ~62% of height). Caption bottom-left in
small ink-colored text: `Nº k7x2mp` (13px, the UI monospace font at low size reads
fine as a pencil note; do not hand-render letterforms in v1).

### 7.2 Plate mode (`plate.js`)

- Counts: 12 (3×4), 24 (4×6), 48 (6×8) — cycle via control. Default 24.
- Page header drawn in ink: rule line + `ANTITECTURE — PLATE <seed>` text top-left,
  date-ish scribble top-right (just the seed of the plate in base36, not a real date
  — determinism).
- Each cell: `building.generate(masterRng.fork('cell:'+i))`, rendered with
  `ctx.translate` into its cell rect, lod 0.5 (0.35 at 48), per-cell mini-caption
  (cell seed) under each building. Cell yaw: alternate small yaw variations
  (−25°…25°, from the cell's own fork) so the plate reads varied, not stamped.
- Progressive render: draw cells in `requestAnimationFrame` batches of 4, ink pass
  only; run the paper pass once after the last batch. Keeps the tab responsive and
  makes the plate visibly "draw itself" — a free delight feature.

### 7.3 Controls (top bar, `index.html` + `main.js`)

Left-to-right:
- **Generate** button (primary).
- **Seed** text input (canonical seed shown; typing + Enter regenerates from it).
- **Copy seed/link** button (copies full URL; flashes "copied ✓").
- **Mode** toggle: Single / Plate; **Plate size** select (12/24/48, visible in plate mode).
- **View**: yaw slider (−60…60), pitch slider (5…35) — live re-render (no regen).
- **Density** slider (0.4…1.6): scales `detailBudget`.
- **Mood** select: `any | town | tower | industrial | mediterranean` (§8).
- **Export PNG** button.

### 7.4 Keyboard

| Key | Action |
|---|---|
| `Space` / canvas click | New generation (current mode) |
| `p` | Toggle single/plate |
| `s` | Export PNG |
| `c` | Copy seed URL |
| `←` `→` | Yaw −5° / +5° (re-render only) |
| `↑` `↓` | Pitch +3° / −3° |
| `[` `]` | Density −0.1 / +0.1 (regenerate) |

Ignore keys when the seed input is focused. Show the map in a one-line hint under
the canvas: `space new · p plate · s save · c copy · arrows orbit`.

### 7.5 Export (`export.js`)

- Re-render current state into an offscreen canvas at `2 × devicePixelRatio` scale
  (cap total pixels at ~4096² to avoid mobile canvas limits), full pipeline
  including paper.
- `canvas.toBlob('image/png')` → temporary `<a download>` click. Filename:
  `antitecture-<seed>-<mode>.png`.
- Plate export is synchronous (no progressive batching) — 1–2 s is acceptable for
  an explicit export action; disable the button and show "inking…" while it runs.

---

## 8. Visual direction & UI polish

### 8.1 Ink & paper palette (`style.js`)

- Paper: `#f2ecdd` (warm off-white), grain specks `#8a7a5f` at low alpha.
- Ink: near-black warm navy `#232630` at alpha 0.92 (never pure #000 — real ink
  isn't). One drawing = one ink color.
- Accents (each building: 55% chance of exactly ONE accent, 15% two, else mono):
  terracotta `#c1633f` (roofs), sage `#7d8f6a` (vegetation, green roofs), slate blue
  `#6f88a3` (window glass hint), mustard `#c9a34a` (doors/awnings). Applied only via
  `inkFill` at alpha 0.28–0.4, always under line work, always slightly misregistered
  (offset 1.5–3 px from the outline — like a hand-pulled print). Misregistration is
  mandatory; perfectly aligned fills kill the aesthetic.

### 8.2 Line hierarchy & pen character

- Outline tier: silhouettes, roof edges, ground line. Detail tier: windows, doors,
  ornaments. Hatch tier: shading, tiles, glass. The re-stroked silhouette (§6.3)
  is what makes buildings pop off the page — never skip it.
- Wobble defaults: amp 1.1 px, freq 0.035 /px, dryness 0.12, corner-overshoot
  p=0.3. These are starting values; Stage 2 includes a tuning page to lock them.

### 8.3 Moods (weight tables in `style.js`, all data, no new code paths)

- `town`: slab/longhouse/lshape, gabled+hipped roofs, shutters, chimneys, trees.
- `tower`: tower/cluster, flat roofs + water tanks/antennas, ribbon windows, AC units.
- `industrial`: longhouse/slab, shed + barrel roofs, big arched windows, flues, fences.
- `mediterranean`: cluster/lshape, low pitched roofs + terracotta accent bias,
  arches, shutters, cypress, vines.
- `any`: uniform over moods (default).

### 8.4 UI chrome (`style.css`)

The page should look like a tool made by the same hand as the drawings:
- Page background a slightly darker warm gray `#e6e1d3`; canvas has a 1px
  `#b8b09c` border and a soft shadow — reads as a paper sheet on a desk.
- Controls: single top bar, 13px system-ui/monospace mix, flat buttons with 1px
  borders in ink color, no gradients, no icon fonts. Generate button filled ink.
- Seed displayed in monospace. "Copied ✓" feedback via 1.2 s inline text swap.
- Canvas is `max-width: min(92vw, 980px)`, centered; internal resolution =
  CSS size × `devicePixelRatio` (crisp on retina; re-render on resize, debounced
  200 ms — same seed, so resize never changes the drawing).
- No layout shift: control bar fixed height; plate/single swap only changes canvas
  aspect via a class.

---

## 9. Performance tactics

Targets (PRD): single building < 100 ms; plate of 24 < 1.5 s.

1. **Ribbon-fill strokes** (§4.2): one path fill per stroke; no shadowBlur, no
   per-point `ctx.stroke()`.
2. **LOD** (§4.4): plate cells drop filaments, halve resample density, skip
   micro-ornament. Expected ~3–4× per-building speedup at lod 0.5.
3. **Cached paper**: grain tile rendered once at boot; per-frame cost is one tiled
   `drawImage` pass.
4. **No allocation churn:** stroke engine reuses scratch arrays on the Pen object;
   `pt()` returns into caller-provided objects in hot loops where profiling says so
   (only optimize after measuring — write the clear version first).
5. **Progressive plate** (§7.2): rAF batches keep long plates responsive; total time
   may slightly exceed the sync target but perceived latency is near-zero.
6. **Budget instrumentation:** `main.js` logs `generate` and `render` timings via
   `performance.now()` to the console (debug flag `?debug=1`); Stage 8 acceptance
   uses these numbers.
7. **Stroke caps:** hard caps — 400 samples/stroke, ~35 hatch lines/quad, detail
   budget ceiling — so pathological seeds can't blow the frame budget.

---

## 10. Browser verification checklist & acceptance criteria

### 10.1 Manual verification (run in Chrome + Firefox; Safari/Edge spot-check)

- [ ] `index.html` opens from `file://` with zero console errors and renders a building.
- [ ] Space, click, `p`, `s`, `c`, arrows, `[`/`]` all behave per §7.4; keys ignored
      while seed input focused.
- [ ] Same seed URL pasted into a fresh tab reproduces the identical image
      (compare exported PNGs — byte-equality not required, visual identity is).
- [ ] Changing yaw/pitch sliders does NOT change the building design, only the view.
- [ ] Generate 30 singles: no blank canvases, no NaN geometry, no building escaping
      its margins, silhouette always closed.
- [ ] Plate 24 and plate 48 render fully; captions legible; header present.
- [ ] Export PNG at both modes: file downloads, is 2×+ resolution, includes paper
      grain, filename contains seed.
- [ ] Copy seed puts a working URL on the clipboard.
- [ ] Resize window: drawing re-renders identically (debounced), stays crisp on a
      retina display.
- [ ] `grep -rn "Math.random" js/` returns nothing.
- [ ] Throttle CPU 4× in DevTools: single still < 400 ms, UI never freezes on plate.

### 10.2 Aesthetic acceptance (subjective but checkable)

- [ ] Lines visibly wobble, swell, and occasionally run dry; rectangle corners
      cross/overshoot sometimes.
- [ ] At yaw 0 the building reads as a flat elevation; at yaw 30/pitch 20 it reads
      as a naïve ¾ sketch with visible side-face hatching.
- [ ] Accent color, when present, is misregistered from its outline.
- [ ] 20 consecutive generations produce clearly distinct buildings (different
      massing at least every 2–3, different façade rhythm nearly always).
- [ ] A plate of 24 looks like one sketchbook page by one hand: same pen character
      everywhere, varied subjects.
- [ ] Nothing looks CAD-perfect: no perfectly straight long line anywhere in the ink.

### 10.3 Performance acceptance

- [ ] `?debug=1` timings on a modern laptop: single generate+render < 100 ms
      median over 10 runs; plate 24 total < 1.5 s (progressive batches summed).

---

## 11. Staged implementation order

Execute strictly in order. Every stage ends with a working page — never leave the
app broken between stages. Stages 2–5 include throwaway debug harnesses behind
`?debug=1`; keep them (they're cheap and useful), just hidden by default.

**Stage 0 — Scaffold (small).**
`index.html` (canvas, control bar markup, script tags), `style.css` (§8.4),
`main.js` boot: sized canvas, DPR handling, resize handler, empty render loop that
clears to paper color. All controls present but inert. ✔ Page renders a blank
warm sheet, no console errors.

**Stage 1 — RNG (`rng.js`).**
Full §2 API incl. `fork` and `makeNoise1D`. ✔ In console: same seed → same first
20 draws; forked streams independent; `makeNoise1D` smooth in [-1,1].

**Stage 2 — Stroke engine + paper (`stroke.js`, `paper.js`, `style.js` pen presets).**
Implement §4 and §5. Debug harness (`?debug=stroke`): a test sheet of lines,
rectangles with overshoot corners, ellipses, hatched quads, scribble fills at all
three weight tiers, over paper. **Tune wobble/dryness/taper here until it looks
like a dry fountain pen — this gate is aesthetic, not just functional.**
✔ Test sheet matches §10.2 line-quality bullets.

**Stage 3 — Geometry (`geom.js`, `massing.js`).**
Vec3 helpers, camera, `project`, prisms, faces, visibility, painter sort, `makeFrame`.
Debug harness (`?debug=geom`): render all 5 massing recipes as stroked wireframes,
orbit with arrow keys, draw a test 3×4 dot grid via `frame.pt` on each visible face.
✔ Dots stay glued to faces through the full yaw/pitch range; hidden faces cull.

**Stage 4 — Elements (`el-roofs.js`, `el-openings.js`, `el-facade.js`,
`el-details.js`, `el-site.js`).**
All ~38 variant functions per §6.2 against the Frame/quad contract. Debug harness
(`?debug=elements`): a specimen sheet — every variant drawn once in a labeled grid
on a flat frontal quad, plus one arbitrary skewed quad row to prove foreshortening.
This is the longest stage; commit per file. ✔ Specimen sheet complete; every
variant survives a skewed quad without geometry blowups.

**Stage 5 — Building recipes (`building.js`).**
`generate`/`render` split, mood tables in `style.js`, fit-to-rect, silhouette
re-stroke, accents with misregistration, ground shadow, site dressing.
✔ 30 generations via space-mash meet §10.2 diversity + coherence bullets.

**Stage 6 — Modes, controls, export (`plate.js`, `export.js`, `main.js` wiring).**
Plate layout + progressive render + captions/header; all controls live; URL state;
keyboard map; PNG export; copy-link. ✔ Full §10.1 interaction bullets pass.

**Stage 7 — Polish & performance.**
Profile with `?debug=1`; apply §9 items 4/7 where measurements demand; final tuning
pass on style constants; vignette; empty-state and export-busy affordances; hint
line under canvas. ✔ §10.3 numbers met.

**Stage 8 — Verification.**
Run the entire §10 checklist in Chrome and Firefox (spot-check Safari if
available), fix findings, run the `Math.random` grep, final commit.

Suggested commit cadence: one commit per stage minimum, per element file during
Stage 4. Do not start Stage 4 until the Stage 2 aesthetic gate is genuinely met —
element work built on a bad pen all needs re-tuning later.

---

## 12. Out of scope (do not build in v1)

WebGL/real 3D, SVG export, animation/boiling-line, named architectural movements
beyond the 4 moods, exploded/diagrammatic view (PRD lists it as secondary — defer),
interiors, backends, touch-gesture orbit (sliders suffice), hand-rendered
letterforms for captions.

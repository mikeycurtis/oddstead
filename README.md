# Oddstead

**Procedural buildings for imaginary places.**

Oddstead is a dependency-free generative architecture sketchbook for making seeded, hand-drawn building studies. It combines deterministic procedural generation with a dry-nib canvas style, cultural roof and façade families, planting, full-orbit camera controls, plate layouts, and animated stroke replay.

## Features

- Deterministic seeded building generation
- Single-building and multi-study plate modes
- Full orbit controls with eye-height adjustment
- Cultural building families including Japanese, Chinese, European, Greek, Moorish, Nordic, Art Deco, South Asian, medieval castle, Japanese castle, South Asian temple, East Asian temple, Mesoamerican temple, and Classical Greek/Roman temple
- Paper-backed roof and wall rendering with optional opaque walls
- Plate building focus with animated cover-style zoom-out restoration
- True stroke-by-stroke drawing replay
- PNG export
- Browser-native video recording with MP4 preference and WebM fallback
- Save/delete prompt before recording downloads
- Shareable URL state for seeds and view settings
- No dependencies, build step, or framework

## Run locally

Oddstead is plain HTML, CSS, and JavaScript. Serve the directory with any static web server:

```bash
python3 -m http.server 4173
```

Then open <http://127.0.0.1:4173>.

Opening `index.html` directly may work, but a local server is recommended.

## Controls

- **Seed**: enter any text to deterministically regenerate a design
- **Mode**: switch between a single building and a study plate
- **View angle**: orbit around the buildings
- **Eye height**: change the camera elevation
- **Detail**: adjust rendering density
- **Monumentality**: change the generated building's footprint and height hierarchy without changing its seed
- **Domed roofs**: deterministic drum-supported, ribbed, and onion dome profiles with solid backing and finials
- **City mode**: deterministic waterfront cities with seed-generated coastlines and connected street networks, blocks, parcels, randomized civic buildings or tree-filled civic parks, multiple functional parks with internal paths and amenities, hill contours, a `1×–5×` district-scale control, and city building-count toggles up to `384` buildings
- **Opaque walls**: add paper backing to wall and roof surfaces
- **Animate drawing**: replay the generated ink in draw order
- **Record video**: capture the canvas, then choose whether to save or delete it

The recorder prefers MP4 only when the browser's `MediaRecorder` implementation supports it. Otherwise it uses the best available WebM format. Browser-native recording support varies by browser.

## Development checks

Run the deterministic smoke suite and syntax checks:

```bash
for f in js/*.js tools/*.js; do node --check "$f" || exit 1; done
node tools/smoke.js
git diff --check
```

## License

Oddstead is released under the MIT License. See [LICENSE](LICENSE).

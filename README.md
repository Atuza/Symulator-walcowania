# Symulator walcowania

Plate rolling calculator for 4-roll plate bending machines: blank length, diameters, springback estimate,
3D rolling preview, 2D drawing, PDF report and DXF cut contour. Runs entirely in the browser, works
offline once loaded, stores nothing outside the device.

**App:** https://atuza.github.io/Symulator-walcowania/

## Features

- Cylinder: target Ø or R on the inner or outer surface → blank length, or blank length → Ø.
- Cone: large Ø, small Ø and axial height → annular sector development (R1, R2, angle, plate size).
- Neutral axis from R/t (DIN 6935), optional flat-end allowance, mass.
- Springback estimate with the machine set diameter; certificate Re and a calibration factor improve it.
- Material database: structural, high-strength, pressure vessel, stainless and aluminium grades (EN standards).
- Indicative warnings: R/t, outer fibre strain, springback, machine limits.
- PDF report (A4) and DXF R12 contour: one closed polyline, layer `cut`, red, 1:1 mm.
- Polish and English, light and dark theme, touch and mouse.

## Development

```bash
npm ci
npm run dev
npm test
npm run build
```

Requires Node 22 or newer. Every push to `main` is tested and deployed to GitHub Pages.

## Layout

```
src/
  domain/     calculations and material data, no DOM
  drawing/    renderer-independent 2D views (screen and PDF)
  viz/        SVG view and Three.js scene
  export/     DXF, PDF, file saving
  state/      inputs, settings, history (localStorage)
  i18n/       the only place with user-facing text
  ui/         app shell and components
tests/        unit tests
docs/         formulas, architecture, decisions
```

## Accuracy

The neutral axis and springback are models. Verify on a trial part and use the calibration factor
for the machine and material. Material values are standard minimums; mill certificate values take
precedence.

## Licence

All rights reserved. The fonts in `src/export/fonts` are under the SIL Open Font License (see `OFL.txt`).

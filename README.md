# Symulator walcowania

Plate rolling calculator for 4-roll plate bending machines: blank length, diameters, springback estimate,
3D rolling preview, 2D drawing, PDF report and DXF cut contour. Runs entirely in the browser, works
offline once loaded, stores nothing outside the device.

**Version:** 1.1.10

**App:** https://atuza.github.io/Symulator-walcowania/

## Shapes and dimensions

Sizes use the selected inner, mid or outer surface. Mid means half the thickness; it is the neutral
fibre only when `k = 0.5`. Plate width is the length along the rolls, not the developed blank length.
Dimensions are in mm and angles in degrees.

| Shape          | Dimensions                                                                           |
| -------------- | ------------------------------------------------------------------------------------ |
| Cylinder       | Inner/mid/outer Ø, R, circumference C or cut length; edit any of them on the drawing |
| Cone           | Large and small end Ø, axial height H; concentric circular ends                      |
| Eccentric cone | Separate tile: both Ø, height H and centre offset e; Flat side sets e = (D1 - D2)/2  |
| Half round     | Ø or R and arc angle strictly between 0° and 360°                                    |
| U shape        | Overall width A and straight length B of each leg                                    |
| Obround        | Overall length A and width B, A ≥ B                                                  |
| Rectangle      | Overall sides A and B, corner radius R                                               |
| Bucket         | Straight back A, bend radius R, turning angle, straight bottom B                     |

Concentric cones develop to an annular sector. Eccentric cones use a numerical contour and list
generator lengths every 30° from the shortest. Other shapes share a straight-and-arc profile engine,
with the neutral fibre calculated per bend. Closed profiles have fixed seam positions. Tank, ellipse
and free shapes are no longer offered for new parts; existing saved calculations remain readable.

## Features

- Cylinder: edit Ø, R, circumference C or cut length directly on the drawing, without switching modes.
- Thickness stays beside the material grade in the sidebar. Diameter dimensions show an independently
  editable R beside Ø; cone end dimensions also carry C1/C2 at the measured feature.
- Both cone types: edit C1/C2 on the selected reference surface to calculate the matching end Ø and
  development. Circumferences exclude flat allowances and stay synchronized with radii and diameters.
- Cone: large Ø, small Ø and axial height → annular sector development (R1, R2, angle, plate size).
- Eccentric cone: constant normal wall thickness, parallel neutral-surface development and
  generator table; numerical refinement targets 0.01 mm for contour and edge lengths.
  The development dimensions follow both numerical edges (L1/L2), measuring their net arc lengths
  rather than endpoint chords; flat allowances remain separate process inputs.
- Neutral axis from R/t (DIN 6935), optional flat-end allowance, mass.
- P460NL2 cylinder cut-length calibration from five real trials: −3.989 mm, with a visible switch,
  active-status explanation and extrapolation warning. Applies at t = 9.2–10.0 mm without flat-end
  allowance or manual k; both cone types are excluded. Existing saved jobs and old links retain
  their previous model. See [scope and formulas](docs/adr/0010-p460-cylinder-cut-calibration.md).
- Springback estimate with the machine set diameter; certificate Re and a calibration factor improve it.
- Material database: structural, high-strength, pressure vessel, stainless and aluminium grades (EN standards).
- Indicative warnings: R/t, outer fibre strain, springback, machine limits.
- Dimensioned SVG drawing and landscape PDF reports in A4 or A3, with vector views at preferred
  technical scales, a title block, results and warnings.
- Cone development views frame the cut sheet without remote apex construction lines or an apex-angle
  annotation. Nearly cylindrical cones remain visible, with slant and sheet-height dimensions on
  opposite sides of the blank.
- Click an underlined dimension on any shape's drawing to edit it. Each profile bend has its own
  radius R1, R2, etc.; straight lengths and overall sizes can be changed independently. Closed
  contours stay closed, and the editor previews any automatically adjusted dimensions. No separate
  corner-angle fields are shown. Arc sweeps remain available for half-round and bucket profiles.
- Geometry fields move from the sidebar to the drawing, with a larger drawing dialog when needed.
  Feature labels occupy separate gutters, and their leaders avoid dimension text on screen and paper.
  Enter or Apply validates and updates both views and all results; Esc cancels. Profile blank-length
  edits scale the reference section proportionally, preserving thickness, plate width and allowances.
  Cone arc-length edits adjust the corresponding end; blank-extent edits scale the cone proportionally.
  Cone development radii and eccentric generator lengths are edited at their actual drawing measures.
  Invalid or non-finite changes leave the last valid part intact. Modified profiles persist in templates,
  history and calculation links.
- DXF R12: one closed red `POLYLINE` on layer `cut`, 1:1 mm; discrete profile bend lines are blue
  `LINE` entities on layer `bend`. Eccentric cone contours
  use sampled line segments. R12 has no unit header: select mm on CAD import.
- Fixed installed-machine geometry: top roll Ø 338.38 mm, bottom Ø 310.12 mm, both side rolls
  Ø 240.02 mm, working roll length 3100 mm and maximum plate width 3000 mm. These values are
  read-only and survive old settings, imported files and reset. The 3D rolls retain their actual
  size even when the part is too tight or too wide; machine warnings flag those cases.
- Local machine capacity charts for rolling/pre-bending, cone thickness limits and JSON machine
  import/export. Non-circular profile checks use the tightest bend and are indicative.
- Edit mode (behind an explicit warning, blueprint colours): read-only machine geometry, additional
  machine limits, process defaults, material
  database, calibration from trial parts and templates; the Shapes tab explains every shape's
  dimensions, effects, valid ranges, formulas, examples and model limits in Polish and English.
  Other editable parameters are documented with what each is,
  what it affects, its range, formulas with symbol legends, examples and sources; JSON export/import
  of all settings.
- Templates for frequent jobs, one tap in the calculator.
- History capped at 50 entries; existing links, templates and saved inputs remain readable.
- PDF report with a QR code that reopens the same calculation, read by the app's own scanner
  (“Scan QR”) or a phone camera.
- Polish and English, light and dark theme, touch and mouse.

## Development

```bash
npm ci
npm run dev
npm test
npm run build
```

Requires Node 22 or newer; CI uses Node 24. Before publishing, run `npm run lint`,
`npm run typecheck`, `npm test`, `npx prettier --check src tests docs README.md` and `npm run build`.
Every push to `main` is tested and deployed to GitHub Pages.

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

See [formulas](docs/formulas.md), [architecture](docs/architecture.md) and the
[1.1.3 release record](docs/releases/1.1.3.md).

## Accuracy

The neutral axis and springback are models. Verify on a trial part and use the calibration factor
for the machine and material. Material values are standard minimums; mill certificate values take
precedence.

The 3D preview illustrates geometry and rolling progress. It does not calculate CNC axis settings,
tool collisions or material deformation. Tight profiles can intersect the illustrated rolls even
when warnings are present. Both cone types show the installed machine, with the contact generator
aligned with the pinch line. Roll dimensions stay fixed; conical roll tilt and CNC setup are not simulated.

Eccentric-cone geometry offsets each wall along its local normal. Circular end diameters belong to
the selected reference surface; other offset surfaces generally have non-circular end curves, reported
as equivalent diameters (perimeter / π). The numerical development has a 0.01 mm refinement target;
the material neutral factor and circular-section springback estimate still require process calibration.
Legacy ellipse jobs use 256 short arcs while their inner perimeter is integrated numerically.
Legacy free-profile closure does not detect self-intersections. Oblique end cuts, splitting a blank into
several pieces and the v1.2 machine-program editor remain outside this release.

## Licence

All rights reserved. The fonts in `src/export/fonts` are under the SIL Open Font License (see `OFL.txt`).

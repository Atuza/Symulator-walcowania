# Symulator walcowania

Plate rolling calculator for 4-roll plate bending machines: blank length, diameters, springback estimate,
3D rolling preview, 2D drawing, PDF report and DXF cut contour. Runs entirely in the browser, works
offline once loaded, stores nothing outside the device.

**Version:** 1.1.2

**App:** https://atuza.github.io/Symulator-walcowania/

## Shapes and dimensions

Sizes use the selected inner, mid or outer surface. Mid means half the thickness; it is the neutral
fibre only when `k = 0.5`. Plate width is the length along the rolls, not the developed blank length.
Dimensions are in mm and angles in degrees.

| Shape          | Dimensions                                                                          |
| -------------- | ----------------------------------------------------------------------------------- |
| Cylinder       | Inner/mid/outer Ø or R to blank length; reverse blank-length-to-Ø mode              |
| Cone           | Large and small end Ø, axial height H; concentric circular ends                     |
| Eccentric cone | Separate tile: both Ø, height H and centre offset e; Flat side sets e = (D1 - D2)/2 |
| Half round     | Ø or R and arc angle strictly between 0° and 360°                                   |
| U shape        | Overall width A and straight length B of each leg                                   |
| Obround        | Overall length A and width B, A ≥ B                                                 |
| Rectangle      | Overall sides A and B, corner radius R                                              |
| Tank           | Four-tangent-arc oval: overall width A, height B, side radius R                     |
| Bucket         | Straight back A, bend radius R, turning angle, straight bottom B                    |
| Ellipse        | Full horizontal and vertical axes A and B                                           |
| Free           | Ordered list of straight lengths and arcs with signed turning angles                |

Concentric cones develop to an annular sector. Eccentric cones use a numerical contour and list
generator lengths every 30° from the shortest. Other shapes share a straight-and-arc profile engine,
with the neutral fibre calculated per bend. Closed profiles have fixed seam positions; free profiles
close only when their ends meet and the total turn is ±360°.

## Features

- Cylinder: target Ø or R on the inner or outer surface → blank length, or blank length → Ø.
- Cone: large Ø, small Ø and axial height → annular sector development (R1, R2, angle, plate size).
- Eccentric cone: constant normal wall thickness, parallel neutral-surface development and
  generator table; numerical refinement targets 0.01 mm for contour and edge lengths.
- Neutral axis from R/t (DIN 6935), optional flat-end allowance, mass.
- Springback estimate with the machine set diameter; certificate Re and a calibration factor improve it.
- Material database: structural, high-strength, pressure vessel, stainless and aluminium grades (EN standards).
- Indicative warnings: R/t, outer fibre strain, springback, machine limits.
- Dimensioned SVG drawing and landscape PDF reports in A4 or A3, with vector views at preferred
  technical scales, a title block, results and warnings.
- Click an underlined dimension on the drawing to edit it, including radii, straight lengths,
  angles and plate width. Enter or Apply validates the change and updates both views and all results;
  Esc cancels. Developed blank length and other derived dimensions remain read-only.
- DXF R12: one closed red `POLYLINE` on layer `cut`, 1:1 mm; discrete profile bend lines are blue
  `LINE` entities on layer `bend`. Ellipses have no artificial bend lines. Eccentric cone contours
  use sampled line segments. R12 has no unit header: select mm on CAD import.
- Local machine capacity charts for rolling/pre-bending, cone thickness limits and JSON machine
  import/export. Non-circular profile checks use the tightest bend and are indicative.
- Edit mode (behind an explicit warning, blueprint colours): machine data, process defaults, material
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
[1.1.2 release record](docs/releases/1.1.2.md).

## Accuracy

The neutral axis and springback are models. Verify on a trial part and use the calibration factor
for the machine and material. Material values are standard minimums; mill certificate values take
precedence.

The 3D preview illustrates geometry and rolling progress. It does not calculate CNC axis settings,
tool collisions or material deformation. Tight profiles can intersect the illustrated rolls even
when warnings are present. Cones show the plate without the machine or tilted rolls.

Eccentric-cone geometry offsets each wall along its local normal. Circular end diameters belong to
the selected reference surface; other offset surfaces generally have non-circular end curves, reported
as equivalent diameters (perimeter / π). The numerical development has a 0.01 mm refinement target;
the material neutral factor and circular-section springback estimate still require process calibration.
Ellipses are drawn as 256 short arcs while their inner perimeter is integrated numerically.
Free-profile closure does not detect self-intersections. Oblique end cuts, splitting a blank into
several pieces and the v1.2 machine-program editor remain outside this release.

## Licence

All rights reserved. The fonts in `src/export/fonts` are under the SIL Open Font License (see `OFL.txt`).

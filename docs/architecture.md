# Architecture

Static single-page PWA. No backend, no accounts, no network calls after load.

```
inputs (text) ──► state/derive ──► domain/calculate ──► CalcOutput
                                                         │
               ┌─────────────────────────────────────────┼──────────────────────┐
               ▼                                         ▼                      ▼
        ui/rows (labels)                       drawing/build (views)    viz/sceneModel
               │                                    │          │                │
        results panel, PDF tables         viz/view2d (SVG)  export/pdf    viz/scene3d (Three.js)
                                                                              (lazy)
export/dxf ◄── CalcOutput (contour)
```

- **domain**: pure functions, fully unit-tested, no DOM or i18n.
- **state**: typed text inputs (so "12,5" survives re-renders), validated with Zod when read from storage.
- **drawing**: one renderer-independent model drives both the SVG view and the PDF, so they always match.
- **viz/scene3d** and **export/pdf** are loaded on demand to keep the first load small.
- **viz/machine3d** draws the plate roll around the rolls (housings, drop-end yoke, bed, feed
  table). The application always uses the installed machine's fixed roll sizes and 3100 mm barrel
  length. Generic domain callers without machine data retain a symbolic fallback. The exit-side roll follows the bend under the rolls
  (`domain/profile.bendAt`).
- **i18n**: the only place with user-facing text; code, comments and identifiers are English.

Storage keys (`localStorage`): `rolling.inputs.v1`, `rolling.settings.v1` (language, theme, machine),
`rolling.process.v1`, `rolling.materials.v1` (edit-mode overrides; absent = built-in defaults),
`rolling.calibration.v1` (trial parts), `rolling.templates.v1` (saved inputs) and
`rolling.history.v1` (capped at 50 entries). The app works with storage disabled.

`state/fixedMachine.ts` defines the five immutable physical machine dimensions. The settings schema
normalizes older storage, machine-file imports and configuration backups to those values while
preserving other limits, charts and preferences. Application defaults, setters and reset use the same
normalization. The editor presents dimensions as definitions rather than input fields. A supplied
working roll length is never stretched to fit the plate in the 3D model. See
[fixed machine geometry](adr/0008-fixed-machine-geometry.md).

Edit mode (`ui/editor.ts`) replaces the calculator screen and sets `data-mode="edit"` on the root, which
switches the palette to blueprint colours. Every saved change goes through `state/config.ts`: the
material schema plus cross-field checks (band order, Rm range, unique names). Settings exports are
JSON with a `format`/`version` header and are validated the same way on import. Every editable
parameter carries reference text (what it is, what it affects, valid range, formula) in `i18n/docs.ts`.
The read-only Shapes tab uses `i18n/geometry.ts` and the same MathML reference renderer. It starts
with the calculator's selected shape and explains geometry inputs and model limitations.

`domain/shapes.ts` builds straight-and-arc profiles, including the numerical ellipse approximation
and free segment lists. `domain/eccentric.ts` develops eccentric cones independently of the profile
engine. `CalcOutput` distinguishes cylinders, concentric cones, eccentric cones and generic profiles;
result rows, drawing views and exports consume that union rather than duplicating calculations.

The eccentric cone has its own shape code (`eccentric`, `ec` in calculation links). Legacy cone
inputs with a non-zero offset migrate to it without changing dimensions. Its geometric reference is
the circular-ended surface selected by the user. Inner, neutral and outer walls are constant normal
offsets trimmed by the same end planes. The solver integrates an isometric tangent frame with
adaptive refinement; the same wall construction feeds the side drawing and the solid 3D preview.
See [the geometric contract](adr/0005-eccentric-normal-offset.md) and [formulas](formulas.md).

Drawing notes wrap inside each view's cell. PDF uses its actual font metrics; SVG uses a conservative
monospace estimate. The PDF QR caption occupies its own area above the code, reserved separately from
the drawing and results column.
PDF tables measure wrapped labels and values before choosing row spacing. Sections and warnings
continue on another numbered page when they cannot fit above the footer; the drawing and QR stay
on the first page.

Drawing primitives and annotations carry optional semantic input-dimension identifiers. SVG renders
these as labelled, keyboard-accessible controls; PDF treats them as ordinary technical annotations.
`state/dimensions.ts` maps a selected measure to a complete candidate input set, preserving reference
surface and radius/diameter semantics. `ui/dimensionEditor.ts` validates the candidate through the
existing derivation pipeline before a single commit. Cancel and invalid values never modify the
calculator. The resulting inputs use the same persistence, history, links and export paths as the form.
See [drawing dimension editing](adr/0006-drawing-dimensions.md).

Independent bend radii and straight lengths use a reference-surface segment chain stored in
`profileSegs`, with `profileClosed` preserving the original closure constraint. The original shape
remains selected, and resetting its geometry restores its preset. `domain/editableProfile.ts` computes
exact arc extrema and fits connected dimensions while keeping the requested driver fixed. The editor
lists the linked changes before committing. Every consumer still receives one derived profile.
Ellipse curvature radii map back to exact semi-axis relations; cone sector radii and generator lengths
map back through their existing cone models. The sidebar hides fields already available on a valid
drawing; invalid input retains a recovery form and a modified-profile reset.

Feature annotations occupy two reserved gutters and are packed in non-overlapping rows. Leader
routing avoids all dimension-label rectangles and penalizes crossings. Small interactive views stack
and scroll; the enlarged drawing uses the same model and disposes its resize observer on close.
Crowded developed-interval chains become a wrapped list below the blank, retaining every value.
See [independent profile dimensions](adr/0007-independent-profile-dimensions.md).

Calculation links (`state/share.ts`, ADR 0004) put the inputs that differ from frozen link defaults into
the URL fragment (`#c=1;key=value;…`). The fragment never reaches the server; the PDF prints it as a
QR code, `ui/scanner.ts` reads it with the camera, and the app also loads and clears it on start.

Formulas in edit mode are written in a small TeX-like notation and rendered as native MathML by
`ui/math.ts`; a test parses every formula in the reference.

Security: Content-Security-Policy meta tag in production builds, self-hosted fonts, no third-party
requests, pinned dependencies and SHA-pinned GitHub Actions, Dependabot.

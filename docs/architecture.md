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
- **i18n**: the only place with user-facing text; code, comments and identifiers are English.

Storage keys (`localStorage`): `rolling.inputs.v1`, `rolling.settings.v1` (language, theme, machine),
`rolling.process.v1`, `rolling.materials.v1` (edit-mode overrides; absent = built-in defaults),
`rolling.calibration.v1` (trial parts), `rolling.templates.v1` (saved inputs) and
`rolling.history.v1` (capped at 50 entries). The app works with storage disabled.

Edit mode (`ui/editor.ts`) replaces the calculator screen and sets `data-mode="edit"` on the root, which
switches the palette to blueprint colours. Every saved change goes through `state/config.ts`: the
material schema plus cross-field checks (band order, Rm range, unique names). Settings exports are
JSON with a `format`/`version` header and are validated the same way on import. Every editable
parameter carries reference text (what it is, what it affects, valid range, formula) in `i18n/docs.ts`.

Calculation links (`state/share.ts`) put the inputs that differ from the defaults into the URL fragment
(`#c=` + base64url JSON). The fragment never reaches the server; the PDF prints it as a QR code and the
app loads and clears it on start.

Security: Content-Security-Policy meta tag in production builds, self-hosted fonts, no third-party
requests, pinned dependencies and SHA-pinned GitHub Actions, Dependabot.

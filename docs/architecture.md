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

Storage keys (`localStorage`): `rolling.inputs.v1`, `rolling.settings.v1`, `rolling.history.v1`
(capped at 50 entries). The app works with storage disabled.

Security: Content-Security-Policy meta tag in production builds, self-hosted fonts, no third-party
requests, pinned dependencies and SHA-pinned GitHub Actions, Dependabot.

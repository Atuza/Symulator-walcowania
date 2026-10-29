# 0008 — Fixed installed-machine geometry

Status: accepted, 2026-10-28.

## Context

The application serves one installed four-roll machine. Editable roll dimensions and empty defaults
allow old settings or imported files to replace its physical geometry. The 3D preview also used the
larger of the configured roll length and a width-dependent fallback, stretching a real machine.

## Decision

Keep the following dimensions in one immutable application constant, in millimetres:

- Top roll diameter: 338.38 (configured radius 169.19).
- Bottom roll diameter: 310.12 (configured radius 155.06).
- Both side-roll diameters: 240.02 (configured radius 120.01).
- Working roll length: 3100.
- Maximum permitted plate width: 3000.

The diameters keep two decimals rather than rounded values. No source document, machine identifier or
network configuration is published.

Normalize application defaults, old settings, machine-file imports, configuration backups, setters
and reset to these dimensions. Preserve language, theme, other machine limits, capacity charts,
materials and saved jobs. Show fixed dimensions as read-only definitions in the machine editor.
Keep the calculation engine usable with explicitly supplied generic machine data for independent tests.

Use the configured working length exactly in 3D. A part that exceeds a physical limit remains available
for geometric calculation, with the existing machine warnings. Do not resize the rolls to conceal
an impossible bend or an over-wide plate.

## Consequences

Previously unconfigured installations gain real top-roll and width warnings. Geometry, developed
length, mass, springback and cut contours do not change. Additional material-dependent limits and
capacity charts retain their existing editing and import workflow. The v1.2 machine-program editor
remains deferred.

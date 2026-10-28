# 0005 — Eccentric cone with constant normal thickness

Status: accepted, 2026-10-28.

## Context

The cone tile previously hid eccentric geometry behind its offset field. Its thickness conversion
used the mean concentric slope, so the radial correction did not follow the local eccentric wall.

## Decision

Expose Eccentric cone as a separate tile. Preserve old inputs, templates and printed links by
migrating a cone with non-zero offset to the new shape code. Keep the concentric cone's closed-form
solver and use the dedicated eccentric solver for all values of offset in the new tile.

Input end circles define one selected reference surface. Construct every other wall as a signed
constant offset along its local unit normal, then trim it by the same end planes. Offsets of a cone
are developable but generally no longer circular-ended cones. Label derived end diameters as
perimeter-equivalent diameters. Do not claim that all three walls simultaneously have circular ends.

Integrate an isometric tangent frame rather than developing around a remote apex. Refine both the
integral and the exported polyline, targeting 0.01 mm chord and edge-length error. Reject singular
or unconverged cases. Use the same three-dimensional wall points for side views and the solid preview.
The equations and numerical acceptance checks are in [formulas](../formulas.md#eccentric-cone).

## Consequences

Normal thickness is exact in the geometric model. Development is numerical and independently tested
against three-dimensional surface lengths, mixed metric terms, area and the concentric closed form.
The selected neutral factor remains a process model; springback remains an equivalent circular
estimate. No material deformation or CNC axis solver is introduced. The v1.2 program editor remains
deferred.

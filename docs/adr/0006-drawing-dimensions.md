# 0006 — Edit input dimensions on the drawing

Status: accepted, 2026-10-28.

## Context

Users should be able to change a part's dimensions directly on its drawing, without locating the
corresponding form field. A developed length is a calculated result and does not uniquely determine
the input geometry of a profile.

## Decision

Attach stable semantic identifiers to input dimensions and radius/length/angle annotations. Never
infer an input binding by parsing formatted labels or their order in the SVG. Keep computed overall
sizes, sector measures and developed blank lengths read-only. Plate width remains editable because
it is an independent input.

SVG exposes editable values as underlined controls with mouse, touch and Enter/Space activation.
The editor accepts either decimal separator, selects the existing full-precision value, previews
the resulting blank length and commits with Enter or Apply. Esc or Close cancels.

Build a complete candidate input object and pass it through the existing derivation function before
changing state. An invalid candidate stays in the editor and leaves the last valid part intact.
A successful transaction updates both views, results, warnings and the form, then uses the existing
local persistence and export paths. Restore keyboard focus to the edited measure.

Radiuses and diameters use the explicitly selected reference surface. Editing a cylinder's actual
inner/outer diameter switches to the matching diameter and surface input. Editing a semicircle radius
updates its dependent diameter. A free-profile edit changes only that segment's value or angle.

## Consequences

There is one calculation model and one input source of truth. No reverse constraint solver or new
storage format is introduced. PDF prints normal technical annotations, without the SVG controls.
Long drawings can scroll so their dimensions remain accessible on small screens.
The v1.2 machine-program editor remains deferred.

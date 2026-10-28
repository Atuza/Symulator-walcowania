# 0007 — Independent profile dimensions

Status: accepted, 2026-10-28. Extends ADR 0006.

## Context

A single shared radius cannot describe a part whose corners have different radii. Editing a straight
or bend in a closed profile also requires connected dimensions to adapt so the seam still meets.
Duplicated sidebar fields become misleading after a profile no longer matches a symmetric preset.

## Decision

Expose every straight length and bend radius on each profile drawing. Do not add corner-angle
controls. Retain the existing arc-sweep inputs for half-round, bucket and free profiles. Preserve the
selected shape and store a modified reference-surface segment chain separately from its preset.
The chain and its closure flag are part of the existing input schema, templates, history and QR links.

Keep the edited driver fixed. For a closed profile, constrain the endpoints to meet and the total turn
to remain one revolution. Fit the remaining straight lengths first, allowing other radii to adapt when
necessary. An overall-size edit first tries to preserve the other overall size. Tangency follows from
the connected straight-and-arc chain. Impossible candidates leave the current part intact. Preview
the adjusted dimensions before applying. The user can restore the preset from the sidebar.

Measure radii using the selected reference surface. Overall extents include any flat-end allowances;
feature lengths exclude those allowances. Translate drawing anchors past the leading allowance.
Ellipse curvature extrema invert to semi-axes. Cone sector radii, sector angle and generator lengths
invert through the existing thickness-aware cone calculation. Total developed blank length remains
read-only because it does not determine one unique profile.

Place feature values in dedicated gutters, grouped by anchor and sorted vertically. Reserve enough
rows in the interactive canvas and stack narrow views. Route leaders around label rectangles. Use
the same placement for SVG and PDF. The enlarged drawing is another view of the same current model.

## Consequences

Modified profiles remain reproducible in reports, saved jobs and links. Sidebar geometry inputs are
hidden when the same dimensions are available on a valid drawing; a recovery form remains available
for invalid initial inputs. Source preset dimensions are not printed as the modified profile's geometry.
No new dependencies or backend are introduced. The v1.2 machine-program editor remains deferred.

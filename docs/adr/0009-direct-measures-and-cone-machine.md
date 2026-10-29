# 0009 - Direct measures and cone machine context

Status: accepted, 2026-10-29. Extends ADRs 0006-0008.

## Decision

Keep the material thickness field permanently next to the grade in the sidebar and omit its duplicate
drawing control. Offer eight shapes: cylinder, cone, eccentric cone, half round, U, obround, rectangle
and bucket. Hidden legacy shapes retain their solvers and saved-input compatibility.

Place radius and circumference controls beside the corresponding diameter dimension. Give each
value its own semantic binding and a separate label row, including a zero small end on a valid apex.
Place development radii on their measured arcs and eccentric generator lengths on their side-view
edges. Avoid disconnected footer controls when the same measure belongs at a feature.

Every dimension line on active shapes has an input binding. Cone L1/L2 edits vary the matching end
diameter while keeping height, offset and the other end fixed. Cone developed-box edits proportionally
scale both diameters, height and offset. Profile total-length edits proportionally scale reference
straight lengths and radii, retaining angles, thickness, plate width and flat allowances. A developed
arc interval varies its bend radius with sweep fixed, fitting the remaining closed contour as before.
These are explicit driver rules for otherwise underdetermined inverse dimensions; the editor previews
linked changes before Enter or Apply commits the candidate. Invalid/non-finite candidates never
replace the last valid part. Crowded interval labels stagger into separate lanes at the blank.

Attach the installed machine to both cone scene models. Align the current forming generator with
the roll axis and the inner normal with the pinch normal; the flat tangent of a concentric cone then
lies in the feed plane. Preserve true barrel lengths and diameters. Cone side-roll placement is
indicative; the view does not calculate tilted-roll settings, collisions or CNC programs.

## Consequences

SVG and PDF consume the same dimension primitives. No storage migration, new dependency or remote
service is needed. Existing legacy jobs remain readable. The v1.2 machine-program editor stays deferred.

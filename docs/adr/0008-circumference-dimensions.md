# 0008 - Circumference and numerical edge dimensions

Status: accepted, 2026-10-29. Extends ADRs 0006 and 0007.

## Context

A workshop measurement may start with circumference rather than diameter. Requiring a separate
diameter-to-blank or blank-to-diameter mode interrupts drawing edits. An eccentric cone also needs
lengths along its curved developed edges; its bounding dimensions measure different quantities.

## Decision

Show editable circumference C on the cylinder section and C1/C2 on both cone types. These are
circumferences of the selected circular reference surface: D = C / pi. Convert an edit to the existing
diameter input, retaining reference surface, thickness, height, offset and allowances. Other offset
surfaces of an eccentric cone need not have circular ends; their perimeter-equivalent diameters are
still solver results. No new independently stored circumference can drift from a diameter.

Remove the cylinder mode selector and its duplicate sidebar length field. Editing cylinder cut length
selects the existing thickness-aware blank-length inverse; editing diameter, radius or circumference
selects diameter input automatically. Legacy saved reverse calculations remain readable. This is an
explicit exception to the earlier read-only blank-length decision: cylinder length is uniquely
invertible with thickness, neutral factor and allowances fixed. Profile total lengths stay read-only.

Preview the resulting blank and adjusted diameters, radii and circumferences before commit. Validate
the complete candidate and require finite output. Non-positive sizes, collapsed walls, reversed cone
end sizes and other invalid geometry cannot replace the last valid part. A zero small end remains
allowed when the existing solver accepts an apex. Machine-capacity warnings remain separate from
geometric validity.

Dimension eccentric net edges with `curveDim`, using the solver's actual developed polylines and
integrated arc lengths L1/L2. Exclude straight flat-end allowances from those arc dimensions and list
allowances separately. Place dimensions on opposite sides and reserve another lane for bounding
width. Use identical primitives in SVG and PDF; never replace a curved length with an endpoint chord.

## Consequences

Existing links, templates and exports need no schema migration. Every view consumes the same solved
geometry. The v1.2 machine-program editor remains deferred.

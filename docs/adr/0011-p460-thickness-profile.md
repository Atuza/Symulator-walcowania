# P460NL2 process profile for all cylinder thicknesses

Date: 2026-10-30. Supersedes the default profile of ADR 0010, retaining it for saved cuts.

## User workflow and evidence

The user wants to select P460NL2 and enter any thickness, without managing separate thickness
calibrations. The 9.2–10.0 mm interval describes the five measured specimens, not a material
boundary. A constant 3.989 mm shortening cannot be established for every thickness from that series.

Use the alternative zero-intercept least-squares fit already calculated in report revision 2:

```
e_i = C_outer,i - L_cut,i - pi*t_i
gamma = sum(t_i*e_i) / sum(t_i^2) = 0.41108378691481007
correction(t) = gamma*t
L_cut = pi*(Di + 2*k_geometric*t) - correction(t) + 2*f
Di = (L_cut - 2*f + correction(t))/pi - 2*k_geometric*t
```

At geometric k = 0.5 this is equivalent in the cut formula to the report's substitute
`k_eff = 0.4345739832875726`. The correction is about 2.055 mm at t5, 4.111 mm at t10 and 8.222 mm
at t20. Do not add the previous constant correction or another fit to the same observations.
The geometric neutral axis and springback calculation keep their existing definitions; this fit
does not measure physical neutral-axis displacement or prove thickness-proportional elongation.

The report could not identify which of its three nearly equivalent fits describes the physical
cause. Extending this particular fit is a modeling choice requested for operational use. It is a
P460NL2 **process profile for the installed machine**, not a universal property of that steel.

## Scope

- Enable automatically when the user selects P460NL2 or a new P460NL2 cylinder. Keep a visible
  switch. Apply at every finite, positive thickness, without a hard thickness-range cutoff.
- At t outside 9.2–10.0 mm or outer C outside 6916–7548 mm, show an extrapolation/prediction warning
  and preserve those evidence limits in the result and PDF. The same machine/process condition
  remains visible. No accuracy or tolerance outside the measured series is asserted.
- Retain manual-k precedence and suspend with positive flat-end allowances, since the measured
  process had neither. Neither cone type nor other shapes/materials receives the correction.
- Use the same correction for both calculation directions and all input reference surfaces.
  It depends on thickness, not on which of Ø/R/C/cut length was last edited.
- For very tight bends the underlying geometric k varies with R/t. The extrapolated correction
  remains separate and does not replace that radius-dependent geometry with a fixed physical k.

## Existing calculations

Add `cylinderCalibrationModel` with `constant` as the default for older stored inputs. Fresh inputs
use `thickness`. Version-1/legacy links keep calibration disabled; version-2 links keep it enabled
with the constant model. New version-3 links default to the thickness profile and encode either
non-default model/disabled state as needed. No added bytes are needed in the common new QR case.

An old enabled profile displays its previous-model status and one button, "Use profile for all
thicknesses". Clicking it, or enabling the main checkbox, explicitly selects the current profile.
Choosing the grade for a new part also selects it. Merely opening an old report preserves its cut.

## Verification

Independently recompute the weighted slope from aggregate observations. Exercise all references
and both directions over positive thicknesses, including either side of the old cutoff and R/t < 5.
Preserve target geometry, springback, geometric ring, and consistency of corrected mass/DXF/PDF/3D.
Test old links, saved models, the explicit upgrade, automatic grade selection, manual-k and allowance
precedence, and both cone exclusions. v1.2 remains deferred.

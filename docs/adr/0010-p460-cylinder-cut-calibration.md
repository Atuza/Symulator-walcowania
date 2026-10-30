# P460NL2 cylinder cut-length calibration

Date: 2026-10-30.

## Evidence and decision

The user confirmed five actual cylindrical P460NL2 specimens made on the installed DAVI machine
with the same program (pinch-pressure **setpoint** P = 55 bar), without flat-end allowances or
trimming. Cones were expressly excluded. The reviewed report, revision 2 dated 2026-10-30, gives
the mean residual against `C_outer = L_cut + pi*t` as **3.989383113250804 mm**. The sample standard
deviation is 1.294751 mm. These are empirical observations, not a measured constitutive material
property, pressure-to-elongation law, springback calibration or production tolerance. The report
and the manufacturer's private documents/photos stay outside the public repository.

Use the constant cut-length adjustment, rather than also fitting a neutral factor or strain:

```
L_cut = pi*(Di + 2*k*t) - b + 2*f
Di = (L_cut - 2*f + b)/pi - 2*k*t
b = 3.989383113250804 mm when this profile is active, otherwise 0
```

The geometric ring circumference, neutral diameter, k, target diameters and springback calculation
retain their original meanings. Mass and DXF use the actual corrected cut length. The drawing/PDF
identify the adjustment. The illustrative 3D preview maps the cut blank onto the full target ring;
the actual cut length remains the feed length. This is not a physical strain simulation.

## Scope and control

- Only the `cylinder` shape and built-in material ID `p460nl2` select this profile. Neither cone type,
  other profiles, other grades nor custom materials inherit it.
- New calculations enable the profile. A visible checkbox can disable it.
- Automatically suspend it outside t = 9.2–10.0 mm, with positive flat-end allowances, or whenever
  the operator supplies a valid manual k (including 0.5). Show the reason beside the results.
- The observed outer circumference range is 6916–7548 mm. Outside it, prominently label the result
  as extrapolated and offer the same checkbox to return to geometry. Do not silently switch the
  cut model at a diameter boundary: that would make a fixed offset discontinuous and create gaps
  or multiple answers in the cut-length inverse. The trial range and same-process condition remain
  visible in the results and PDF. Further extrapolation needs a confirming production trial.
- P = 55 bar is provenance, not a commanded setting or a claim of constant measured pressure.

## Persistence

Old stored inputs/templates/history that lack `cylinderCalibration` default to **false** so an existing
cut list is not silently shortened. Version-1 and legacy calculation links also default to false.
New links use version 2, with this field defaulting to true and `lc=0` for a disabled profile. All other
link defaults remain frozen. This preserves both old results and the printed QR module-size budget.

## Verification

Use independent sample arithmetic, forward/inverse tests on Ø/R/C for all reference surfaces,
scope and double-correction tests, cone/profile exclusion, old/new links, and cross-output checks
for drawing/PDF rows, mass, DXF and full 3D closure. Exercise Enter commits, persistence and exports
in desktop Chromium, phone Chromium and iPad WebKit. No v1.2 machine-program editor is included.

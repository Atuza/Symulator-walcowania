# Formulas

All lengths in mm, stresses in MPa. Code: `src/domain`.

## Neutral axis

Fraction of the thickness from the inner surface:

```
k = (0.65 + 0.5 · log10(ri / t)) / 2     for ri / t < 5
k = 0.5                                   for ri / t ≥ 5
```

From the DIN 6935 correction factor, which puts the neutral fibre at `k_DIN · t / 2`. Clamped to
`k ≥ 0.25` below the validity range. Plate rolling mostly works at R/t > 5, where k = 0.5.

## Cylinder

```
Di = D − 2t                (when the outer surface is given)
Dn = Di + 2·k·t            neutral diameter
ring = π · Dn              closed ring length
blank = ring + 2·f         f = flat end per side
```

**Flat ends.** Pre-bending leaves short unbent ends. With the allowance on, both ends are added to the
blank and trimmed after rolling, so the ring itself is exactly `π·Dn`. Default `f = 1.5·t`, an estimate
to replace with the machine's real value.

**Blank → Ø.** `Dn = (blank − 2f) / π`, then `Di = Dn − 2·k·t`. Since k depends on Di, a fixed-point
iteration is used (converges in a few steps).

## Cone

Inputs are diameters in the end planes and the axial height, all on the same surface.

```
α = atan((D1 − D2) / (2·H))               half apex angle
t_r = t / cos α                           thickness measured radially in an end plane
Dn = Di + 2·k·t_r                          neutral diameters at both ends
R1 = Dn1 / (2·sin α),  R2 = Dn2 / (2·sin α)
θ = 2π · sin α                            sector angle
s = R1 − R2 = H / cos α                   generator length
```

The wall is perpendicular to the generator, so in an end plane the thickness spans `t / cos α`. k is
taken at mid-height using the principal curvature radius `r / cos α`. Flat ends extend the angle by
`2f / R_mean`.

## Springback

Gardiner, elastic / perfectly plastic, mid-surface radius:

```
Ri / Rf = 4x³ − 3x + 1 = (2x − 1)²(x + 1),   x = Ri · Re / (E' · t),   E' = E / (1 − ν²)
```

`Ri` is the radius under load (machine setting), `Rf` after unloading. Plane strain (`E'`) because the
plate is wide. The relation is solved for `Ri` by bisection on `(0, E't / 2Re)`, where it is monotonic.

Calibration: `Ri' = Rf − c · (Rf − Ri)`. `c = 1` is the model as-is; tune it from trial parts.

Expect large values for thin plate at large radii (tens of percent): the bending strain there is only a
few times the yield strain. The model ignores work hardening and uses minimum Re, so the actual Re from
the certificate gives a markedly better estimate.

## Calibration from trial parts

A trial rolled at a known machine setting `Rs` and measured at `Rf` after release gives

```
Rm = model setting for target Rf (c = 1)
c  = (Rf − Rs) / (Rf − Rm)
```

All radii are neutral (mid-surface) radii, converted from inner diameters with `R = (Di + t) / 2`.
The calculator uses, in this order: a factor typed into the calculator, the mean `c` of the selected
material's trials, the default factor from edit mode. With `c` from a trial, asking for that trial's
measured diameter returns exactly its machine setting.

A measured diameter not larger than the set one is rejected: springback always opens the shell.

## Machine checks

The machine has to roll the springback-compensated set diameter, which is smaller than the final one,
so the minimum diameter and top roll checks use `min(Di, Ds)` (cylinder) or the small end (cone).

## Strain

Outer fibre engineering strain, the pressure-vessel cold-forming expression
`ε = 50·t / Rn · (1 − Rn / R0) %` with `R0 = ∞` for flat plate, i.e. `ε = t / (2·Rn) = t / (2·ri + t)`. Warning thresholds are indicative: 5 % for
ferritic steels, 10 % for duplex, 15 % for austenitic grades (cold-forming limits used in pressure
equipment codes such as EN 13445-4). Check the applicable code for the actual requirement.

## Materials

Minimum yield (ReH or Rp0.2) by thickness band, tensile range, modulus and density:

| Group                           | Standard                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| Structural                      | EN 10025-2:2019                                                 |
| Thermomechanical                | EN 10025-4:2019                                                 |
| Quenched and tempered           | EN 10025-6:2019                                                 |
| Cold-forming high strength      | EN 10149-2:2013                                                 |
| Pressure, elevated temperature  | EN 10028-2:2017                                                 |
| Pressure, fine grain normalized | EN 10028-3:2017                                                 |
| Stainless                       | EN 10088-2:2014 (≤ 8 mm strip C values, thicker plate P values) |
| Aluminium, O/H111               | EN 485-2:2016+A1:2018                                           |

`minRt` is indicative rolling guidance, not a standard requirement.

## Capacity charts

Maker's charts give the maximum thickness `t(B, D)` for plate width `B` (rows) and inner diameter
`D` (columns) at one yield strength, separately for rolling and for pre-bending the ends.

- Reading: bilinear between grid points. A width beyond the last row or a diameter below the first
  column has no reading; a narrower plate reads the first row and a larger diameter the last column.
- The diameter checked is the set diameter (springback-compensated), as for the other machine limits.
- Between charts: linear in `Re`. Below the weakest chart: that chart unchanged. Above the strongest:
  `t_max = t_chart · √(Re_chart / Re)`, since the bending moment needed grows with `Re · t²`.
- Pre-bending above the chart is a warning, or a note when the flat-end allowance is on.
- Cones: `t ≤ u · t_nom` with `t_nom` read from the rolling chart at the small-end set diameter and
  the slant length as width (machine maximum thickness when there is no chart);
  `u = 0.5` for `s ≤ ½ L_w`, `0.4` for `s ≤ ¾ L_w`, `0.3` above.
- Note when `D_set < 10 t`.

## Reference surface

The given diameter can be on the inner, mid or outer surface: `D_in = D − 2·c·t` with
`c = 0, ½, 1`; for a cone `t` is replaced by the radial thickness `t / cos α`.

## Profiles

Every rolled cross-section is a chain of straight segments and circular arcs (`domain/profile.ts`).
An arc is given by its inner-surface radius `r` and turning angle `φ` (positive left, negative
right). The blank length is the sum along the neutral fibre:

    L = Σ l_i + Σ (r_j + k_j · t) · |φ_j|

with `k_j` taken per arc from its own `r_j / t` (DIN 6935, above), unless `k` is overridden. Bend
lines on the blank sit where each arc starts and ends; lines on the blank edges are dropped and
touching arcs share one line. A cylinder is a single arc of `2π` with a flat at each end, which gives
exactly `L = π · (D_in + 2 k t) + 2 f` as before.

## Shapes

All sizes are on the chosen surface (inner, mid, outer). A size across the part is reduced by
`2·c·t` and a radius by `c·t` to reach the inner surface (`c = 0, ½, 1`). Each shape becomes a profile:

| Shape      | Sizes                               | Profile (from the seam or first edge)                            |
| ---------- | ----------------------------------- | ---------------------------------------------------------------- |
| Half round | Ø or R, angle φ                     | arc R, φ                                                         |
| U shape    | width A, leg B                      | line B, arc A/2 by 180°, line B                                  |
| Obround    | length A, width B                   | ½(A−B), arc B/2 by 180°, A−B, arc, ½(A−B)                        |
| Rectangle  | sides A, B, corner R                | ½ straight of A, then four 90° corners with straights A−2R, B−2R |
| Tank       | width A, height B, side R           | four-arc oval, seam mid-bottom                                   |
| Bucket     | back A, radius R, angle φ, bottom B | line A, arc R by φ, line B                                       |

Tank: the top and bottom radius `R_b` follows from tangency of the arcs,
`(A/2 − r)² + (R_b − B/2)² = (R_b − r)²`, so `R_b = ((A/2 − r)² + B²/4 − r²) / (B − 2r)`; each side
arc turns `2β` with `β = atan2(R_b − B/2, A/2 − r)` and the top and bottom arcs `π − 2β`.

Springback is estimated for every distinct bend radius. Machine limits and capacity charts are made
for cylinders; for other shapes they are checked at the tightest bend as a warning, not a guarantee.
The DXF carries the bend lines as LINE entities on layer `bend` (colour 5).

## Ellipse

Semi-axes `a`, `b` on the inner surface (after the surface conversion). The ellipse is split into
`4 × 64` pieces of equal turning angle `Δψ`; each becomes a circular arc whose length is the exact
inner-surface length of its piece (Simpson's rule on `|r′(θ)| = √(a² sin²θ + b² cos²θ)`) and whose
radius is that length over `Δψ`. The inner perimeter is therefore exact, and the blank is

    L = P_inner + t · Σ k_i · Δψ        (= P_inner + 2π·k·t for a constant k)

with `k_i` from each piece's radius. The arcs stand in for the varying curvature, so the drawn
outline is within about 0.15 mm of the true ellipse at 2.4 m; dimension labels show the input axes.
The reported radii are the exact extremes `b²/a` and `a²/b`; the blank has no bend lines, since the
curvature changes continuously.

## Free shape

A list of straights `L` and arcs `R` with angle `φ` (negative turns the other way), in plate order,
stored as `L300_R400a90_L300`. Radii are on the chosen surface of each bend. The shape is closed when
it turns ±360° and its ends meet within 0.5 mm.

## Eccentric cone

Circular ends `D1 > D2` in parallel planes `H` apart, centres offset by `e` (flat side:
`e = (D1 − D2) / 2`). Points at the same angle `φ` on both ends lie on one generator; all meet in the
apex `A = (0, e·s, H·s)`, `s = R1 / (R1 − R2)`. The development is the cone unrolled about `A`:
`ρ(φ) = |P1(φ) − A|`, `dθ = |(P1 − A) × P1′| / ρ² · dφ` (Simpson, 1440 steps), the small end at
`ρ·R2/R1`. Diameters move to the neutral surface with the mean slope `t / cos α`. Seam at the
shortest generator. Machine checks use the longest generator and the small end.

The axis offset is a distance (`e ≥ 0`); invalid or negative inputs are rejected. For `d = (D1-D2)/2`,
the extreme generator lengths are `sqrt(H² + (d-e)²)` and `sqrt(H² + (d+e)²)`. Thus a flat-side
reducer with D1 = 2400, D2 = 2200, H = 1250 and e = 100 mm has generators 1250.00 and 1265.90 mm.

The sampled outline is a numerical development of the model's neutral surface. The constant radial
thickness conversion uses the mean concentric slope, not the varying local normal of the eccentric
wall. It is therefore an approximation for a finite-thickness eccentric part, not an exact offset
surface construction. Validate a trial part before using the contour for production cutting.

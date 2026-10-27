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

## Strain

Outer fibre engineering strain: `ε = t / (2·ri + t)`. Warning thresholds are indicative: 5 % for
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

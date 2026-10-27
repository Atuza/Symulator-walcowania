# 0003. Analytical springback with a calibration factor

Status: accepted
Date: 2026-10-27

## Context

The exact machine and real material properties are not known yet. A finite-element model is out of scope
for a browser tool.

## Decision

Use the Gardiner relation in plane strain on minimum or certificate Re, and expose a single calibration
factor scaling the predicted springback.

## Consequences

Instant results with a clear physical basis. Accuracy depends on Re and work hardening, so results are
marked as estimates and the factor should be tuned from trial parts per machine and material.

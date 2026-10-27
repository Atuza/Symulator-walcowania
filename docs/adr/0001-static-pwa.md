# 0001. Static PWA without a backend

Status: accepted
Date: 2026-10-27

## Context

The tool runs on shop-floor tablets, needs no shared data and must cost nothing to host.

## Decision

A static Vite + TypeScript app on GitHub Pages, installable as a PWA with an offline cache. No UI
framework: the interface is small, and plain DOM keeps the bundle and the dependency surface minimal.

## Consequences

Free hosting and no server to secure. History lives only on the device. Adding sync later would need a
separate backend.

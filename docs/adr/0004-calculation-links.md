# 0004. Calculation links and QR codes

Status: accepted
Date: 2026-10-27

## Context

A printed report should reopen the same calculation on a tablet, without a server or accounts. Codes
printed by the first version (base64 JSON, about 0.45 mm modules) were too dense for phone cameras.

## Decision

Put the inputs in the URL fragment as `#c=1;key=value;…` with short keys, writing only fields that
differ from a frozen set of link defaults. Print the code at 32 mm with error correction L and a
4-module quiet zone. The app reads it with its own scanner (native BarcodeDetector where available,
a JS decoder otherwise) or through the phone camera opening the link. Version-0.9 links are still read.

## Consequences

Typical codes are version 3–5 with modules near 0.9 mm, readable from paper and from a screen. The
fragment never reaches the server. Link defaults must never change; a new format gets a new version
prefix instead.

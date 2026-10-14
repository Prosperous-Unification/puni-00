## Context

WBS writes v8. Navigator currently reconstructs its pinned v7 shape from WBS contracts and normalizes internally to v8, but still correctly hashes the original bytes.

## Goals / Non-Goals

Support current native units while retaining historical artifact identity. No unit conversion or record rewrite.

## Decisions

Keep separate strict v7 and v8 wire decoders behind a header classifier pinned to 7 and 8. Return the original version beside the internal current document. Derivation selects schema 1 for v7 and schema 2 for v8. Schema 2 replaces `estimateDays` with `estimates`, each carrying `unit`; shared task identifiers, ancestry and dependency shapes remain identical. The PlanTasks decoder is an untransformed discriminated union. Receipt mapping reads common fields and hashes the decoded original schema. Burokrat accepts v8 by an explicit literal amendment while retaining its digest check.

## Risks / Trade-offs

Future WBS versions require deliberate review. Historical schema 1 carries workdays implicitly and is never relabeled. The exporter-generated mixed-unit fixture prevents current wire fields being guessed from the historical fixture.

## Migration Plan

No stored artifacts change. Existing v7 producers and schema-1 receipts continue working; current v8 plans use schema 2.

## Open Questions

None; the approved packet settles the version and unit boundary.

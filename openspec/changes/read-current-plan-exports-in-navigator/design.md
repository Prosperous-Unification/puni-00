## Context

WBS writes v9. Navigator reconstructs historical v7/v8 wire shapes from WBS contracts and adapts them internally to v9 with empty direct facts while hashing the original bytes. Current v9 is decoded strictly and its direct fact references are checked at the input boundary.

## Goals / Non-Goals

Support current native units while retaining historical artifact identity. No unit conversion or record rewrite.

## Decisions

Keep separate strict v7, v8 and v9 wire decoders behind a header classifier pinned to 7, 8 and 9. Return the original version beside the internal current document. Derivation selects schema 1 for v7 and schema 2 for v8/v9. Schema 2 replaces `estimateDays` with `estimates`, each carrying `unit`; shared task identifiers, ancestry and dependency shapes remain identical. The PlanTasks decoder is an untransformed discriminated union. Receipt mapping reads common fields and hashes the decoded original schema. Burokrat accepts v8 and v9 by explicit literals while retaining its digest check.

## Risks / Trade-offs

Future WBS versions require deliberate review. Historical schema 1 carries workdays implicitly and is never relabeled. The exporter-generated mixed-unit fixture prevents current wire fields being guessed from the historical fixture.

## Migration Plan

No stored artifacts change. Existing v7 producers and schema-1 receipts continue working; current v8/v9 plans use schema 2.

## Open Questions

None; the approved packet settles the version and unit boundary.

## WBS080.25 strict v9 read and receipt amendment

Navigator accepts strict external v9, requiring direct `stepBlockages` facts. The narrow input validator checks existing leaf owners, existing steps, unique owner/step pairs and safe integer timestamps, including negative instants and retained facts on done progress. Unknown nested keys and v10 fail before output. V9 uses task schema 2 with unchanged native estimates; historical v7/v8 behavior and v6 reference compatibility remain. Original wire version and raw input bytes bind the reference. Facts stay in the original export, with no blockage command or eligibility calculation. Receipt consistency binds the six-field PlanRef and does not certify blockage freshness. A blockedAt-only change keeps tasks and tasksDigest equal while exportDigest and referenceDigest change.

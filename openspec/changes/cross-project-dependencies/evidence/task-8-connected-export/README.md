# Task 8.1 connected export boundary checkpoint

Inspected source `957df78af` on 2026-10-22 in isolated clone
`/tmp/puni-export-v11`. No production source or test is changed by this packet.
Task 8.1 remains unchecked; connected export and external import remain inactive.

## Why a serializer-only packet cannot activate export

The existing production refusal is deliberate and necessary:

- `libs/wbs/application/core/src/ports/shared-people-values.ts` excludes
  `connected` from `LivePlanExportRead`. Its document evidence currently contains
  catalogs, markers, resource facts and sparse parallelism, without a connected
  selected-schedule/boundary observation.
- `libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts` runs connected capture
  inside the owned read snapshot, then `readExport` explicitly throws
  `connected export is unsupported`. Catalog/marker export capture follows that
  fence and is implemented only for the shared arm.
- `libs/wbs/application/core/src/module/work-item/work-item.resource.ts`
  `exportWithin` projects only the shared arm. The HTTP project export route
  consumes this bundle; its isolated fallback rereads the project/tree.
- `plan-document.resource.ts` serializes local tree endpoints using only
  work-item/step IDs. The tree endpoint shape does not carry the owning project
  or a stable external identity discriminator. A local-looking v10 file cannot
  truthfully encode those external endpoints.
- `plan-document-shapes.ts` has dormant v11 relationship syntax, but its response
  schema and `PlanDocument` still require v10, and no v11 selected-schedule and
  boundary-evidence response contract is declared. The connected projection has
  distinct scheduled, unavailable, calendar-missing and engine-unavailable
  placements; those outcomes cannot be converted into invented dates.

A new writer alone would either remain unreachable or require a second route/tree
composition that bypasses the coherent capture. Retaining the refusal is the
bounded outcome until the connected capture/selected placement contract is
available. This checkpoint does not claim task 7.4 must complete in full first;
its selected schedule and boundary meaning must be agreed and represented before
export can preserve it.

## Required next implementation slice

1. Define v11's explicit captured selected-schedule/boundary evidence and modeled
   unavailable states. Separate successor-owned authored external prerequisites
   from outgoing relationships and derived scheduling evidence. Keep stable IDs,
   scope, type and captured descriptive labels; never rebind by address.
2. Extend `LivePlanExportRead` and SQLite `readExport` so connected metadata,
   project/catalog/resource/marker facts, external labels/readiness and selected
   placement detach from one authorized read snapshot. No post-snapshot rereads
   or solver admission.
3. Extend the existing `exportWithin` projection and its HTTP response contract
   together. Serialize v11 only when needed to preserve external meaning; retain
   v10 local-only golden bytes. Model unsupported evidence explicitly.
4. Add source and mounted positive exports (stable identity through rename,
   node/descendant-step scopes, FS/SS/FF, captured selected placement) and
   negatives for absent/malformed evidence, unavailable placement, access and
   snapshot races. Watch each changed safety fence fail under its injected fault.
5. Keep external import dormant until transaction-bound stable-ID/mapping
   resolution, destination abbreviation allocation, ownership/access/shape,
   duplicate/converged-mapping/graph validation, external writes, announcements
   and post-write rollback proofs are implemented. Navigator v11 support and
   generated API integration remain separate open work.

## Fresh observations

Using Bun 1.4.2 and the existing workspace dependency installation:

- `bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts apps/wbs/be-01/src/http/elysia/plan-document-boundary.test.ts`
  exited 0: **110 pass, 0 fail, 293 assertions**; see
  [current-export.log](current-export.log). This includes the actual SQLite
  connected-export refusal, v10 resource canonical bytes, v11 classification
  and mounted historical external-declaration refusal tests. It establishes
  existing behavior, not a positive connected HTTP export.
- R5 injection: removed only the `readExport` connected refusal in
  `chain-snapshot.ts`, then ran
  `bun test libs/wbs/adapters/store-sqlite/src/connected-live-plan.db.test.ts --test-name-pattern 'connected export refuses'`.
  It exited 1: **1 fail**, `expected refusal`, because incomplete connected
  evidence escaped the fence; see [refusal-fault.log](refusal-fault.log).
  Restored source with `git restore`, reran the identical command: exit 0,
  **1 pass**, [refusal-restored.log](refusal-restored.log). The existing adjacent
  production `Proof:` comment describes this fault accurately.

No implementation was added, so TDD, production lint and typecheck were not run
for this documentation-only blocker packet. No full build, OpenSpec validation,
browser, secrets/migration checks, h2/h4 gate, deployment or integration claim.

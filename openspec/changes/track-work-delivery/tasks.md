## Task 1: Provider-neutral delivery contract

- [x] 1.1 Add `libs/shared/domain/delivery` schemas, reader port, provenance and timing calculations, Nx targets and alias. Write failing tests before implementation. Test: `observation.test.ts` synthetic provider and schema cases; `timing.test.ts` parallel executions, attempts, carryovers, unknown and partial timing. Negative: malformed identities/timestamps and duplicate execution identity must fail through the exported production boundary; remove each guard and observe its negative test fail, record adjacent Proof comments.

## Task 2: Read-only GitHub observation

- [x] 2.1 Add `libs/shared/adapters/delivery-github` with canonical detection, fixed-origin bounded GET transport and API validation. Test: `reader.test.ts` exact requests, unsupported URLs, redirects, timeout, body/request/page limits, 404/rate limit and malformed records. Negative: mutate every safety guard and observe the production-reader negative fail; preserve evidence.
- [x] 2.2 Translate PR/check/run/attempt/job records into the shared model, retaining source provenance, revision consistency, carryovers and partial coverage. Test: `reader.test.ts` merged/open/closed PR, parallel jobs, three-attempt partial rerun, empty checks, truncated history and changed head. Negative: wrong PR/head/run association and copied execution accounting fail when their guards are removed. Capture a read-only real puni-00 PR sample as documented evidence.

## Task 3: Authorized WBS endpoint

- [x] 3.1 Add the delivery HTTP shape/inventory and route, compose the reader in be-01 and expose the typed client operation. Test: HTTP shape tests plus mounted `delivery.controller.db.test.ts` for member success and unknown refs; negatives: unauthenticated, unbound/foreign organization, wrong-project work item and wrong-work-item ref produce zero reader calls; remove access/association checks and observe failing tests. Assert reads do not change progress or refs.

## Task 4: Links editor delivery view

- [x] 4.1 Add an explicit delivery panel to the existing links modal and typed API integration. Test: `delivery-panel.test.tsx` successful reading, empty checks, unsupported/unavailable, partial timing, stale clock, failed refresh and late responses after link/work-item/organization changes. Negative: remove stale/context protection and observe the corresponding production-component test fail. Preserve existing link-edit tests and add focused browser coverage for opening the panel from a real linked row.

## Task 6: Review fixes 2026-10-24

- [x] 6.1 Stop the attempt/job scan inside the request budget with partial inventories (S2-2). Test: `reader.test.ts` five suites of three attempts and truncated job pages; `transport.test.ts` 33rd GET. Negative: removing each stop answers unavailable.
- [x] 6.2 Add `DeliveryGate` (cache, per-organization bucket, in-flight cap) with typed 429/503 refusals, server `servedAt`, semantic response validation and request `AbortSignal` (S2-3, S3-3, S3-5, S3-6). Test: `delivery-gate.test.ts`, `delivery.controller.db.test.ts`, `delivery-shapes.test.ts`, `delivery-panel.test.tsx`. Negative: removing each guard fails its named test.
      Follow-up (WBS, outside this change; S3-1): resolve the delivery reference through organization admission and work-item rows instead of `treeWithin`, which may reserve a solver seat; keep refusal parity tests.
      Follow-up (outside this change; S3-C): coalesce concurrent reads of one URL inside the TTL (single-flight) so they share one token and one provider read.

## Task 5: End-to-end proof and review

- [x] 5.1 Demonstrate one real Puni change through an organization-scoped local WBS read and the GitHub adapter; record source identity, timing basis, coverage and provider limits in `verify.md`. Verify OpenSpec, formatting and focused tests/lint/typecheck/build; obtain independent review and fix findings. Record the failure-proof table and every skipped/unavailable check. Complete this implementation record before publication.

Final acceptance follows publication: prepare the reviewed commits and PR, obtain the required gate and pixels verdicts on its final head, and retain actual CI scope, logs and timings in the PR verification receipt referenced by `verify.md`. Do not change the tested head just to duplicate that external evidence. Use the locked host wrapper if additional host validation becomes necessary. Merged under the 2026-10-24 goal; deployment stays outside this change.

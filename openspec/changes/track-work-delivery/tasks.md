## Task 1: Provider-neutral delivery contract

- [ ] 1.1 Add `libs/shared/domain/delivery` schemas, reader port, provenance and timing calculations, Nx targets and alias. Write failing tests before implementation. Test: `observation.test.ts` synthetic provider and schema cases; `timing.test.ts` parallel executions, attempts, carryovers, unknown and partial timing. Negative: malformed identities/timestamps and duplicate execution identity must fail through the exported production boundary; remove each guard and observe its negative test fail, record adjacent Proof comments.

## Task 2: Read-only GitHub observation

- [ ] 2.1 Add `libs/shared/adapters/delivery-github` with canonical detection, fixed-origin bounded GET transport and API validation. Test: `reader.test.ts` exact requests, unsupported URLs, redirects, timeout, body/request/page limits, 404/rate limit and malformed records. Negative: mutate every safety guard and observe the production-reader negative fail; preserve evidence.
- [ ] 2.2 Translate PR/check/run/attempt/job records into the shared model, retaining source provenance, revision consistency, carryovers and partial coverage. Test: `reader.test.ts` merged/open/closed PR, parallel jobs, three-attempt partial rerun, empty checks, truncated history and changed head. Negative: wrong PR/head/run association and copied execution accounting fail when their guards are removed. Capture a read-only real puni-00 PR sample as documented evidence.

## Task 3: Authorized WBS endpoint

- [ ] 3.1 Add the delivery HTTP shape/inventory and route, compose the reader in be-01 and expose the typed client operation. Test: HTTP shape tests plus mounted `delivery.controller.db.test.ts` for member success and unknown refs; negatives: unauthenticated, unbound/foreign organization, wrong-project work item and wrong-work-item ref produce zero reader calls; remove access/association checks and observe failing tests. Assert reads do not change progress or refs.

## Task 4: Links editor delivery view

- [ ] 4.1 Add an explicit delivery panel to the existing links modal and typed API integration. Test: `delivery-panel.test.tsx` successful reading, empty checks, unsupported/unavailable, partial timing, stale clock, failed refresh and late responses after link/work-item/organization changes. Negative: remove stale/context protection and observe the corresponding production-component test fail. Preserve existing link-edit tests and add focused browser coverage for opening the panel from a real linked row.

## Task 5: End-to-end proof and review

- [ ] 5.1 Demonstrate one real Puni change through an organization-scoped local WBS read and the GitHub adapter; record source identity, timing basis, coverage and provider limits in `verify.md`. Verify OpenSpec, formatting and affected tests/lint/typecheck/build; run the required host gate on the reviewed committed SHA, recording actual output and timings. Obtain independent review, fix findings and prepare reviewable commits plus a PR without merging or deploying. Record skipped/unavailable checks explicitly and a failure-proof table for every changed safety boundary.

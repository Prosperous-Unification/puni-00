# Independent connected Fast/calendar review

Review date: 2026-10-22. Reviewed the frozen six-file foundation in `/tmp/puni-cross-fast-calendar` together with `/tmp/puni-connected-fast-live-wrapper.patch`, the approved connected-scheduling/core-fast-lane architecture, actual callers, and tests. All seven manifest hashes matched before and after review. No shared source or Git metadata was changed; integration and mutation probes ran only in `/tmp/puni-connected-fast-review-integration`.

**Disposition: request changes before integrating the complete helper/live-wrapper slice.** The scheduling arithmetic and graph behavior examined are sound, but the required live replacement does not typecheck and does not lint. Detached green checks do not cover that replacement. The bounded preparation extraction should also remove the new resource/helper import cycle as described below. This is not a claim that production tasks 6.1/6.2 are complete.

## Findings

### P1 — The required live replacement cannot pass the shared helper's project parameter

Location: `/tmp/puni-cross-fast-calendar/libs/wbs/application/core/src/service/schedule-parts.ts:27`; integrated caller `/tmp/puni-connected-fast-review-integration/libs/wbs/application/core/src/module/work-item/work-item.resource.ts:489` (the `project` argument in the supplied patch).

`prepareScheduleParts` accepts all of `PlanInputReads['project']`, which is `CapturedProject`. The live `canonicalScheduleParts` caller has a `Project`. Live projects do not carry the captured `timezone` field. Applying the required patch produces:

```text
error TS2741: Property 'timezone' is missing in type 'Project' but required in type 'CapturedProject'.
```

I reproduced this with `bunx tsc --noEmit -p libs/wbs/application/core/tsconfig.lib.json` in the integration copy; its actual subprocess exit was 1. Log: `/tmp/puni-connected-fast-review-integration-types.log`.

Fix: accept a structural settings type containing only the fields consumed by preparation: `estimateMethod`, `pertWeights`, `estimateRounding`, `startDate`, and `depReach`. A `Pick` of those captured project fields is sufficient and matches the approved shared-settings boundary. Do not invent timezone, cast `Project` to `CapturedProject`, or weaken the capture contract. Re-run integrated core typecheck after applying the helper and live wrapper together.

### P2 — The supplied live patch leaves the required lint gate red

Location: `/tmp/puni-connected-fast-live-wrapper.patch`, initial import hunk and removed canonical body; integrated resource lines 1, 14, 21, 27, 92, 93.

Full repository ESLint configuration, run uncached using `ESLint.lintText` against the exact patched resource contents and its actual repository path, exits 1. It reports import ordering plus unused `chargedDemandsOf`, `deadlineOffsetsOf`, `effectiveTeamsOf`, `withoutHeldSubtrees`, and `workdaysBetween`. The worker report correctly anticipated import cleanup; this review confirms it is required, not hypothetical.

Fix: complete the resource import cleanup and sorting as part of integrating the patch, then run the named uncached lint check against the integrated files. The six-file worker lint result does not prove this seventh-file integration passes.

## Module ownership decision

The live patch creates this direct cycle:

```text
work-item.resource -> schedule-parts -> work-item.resource
```

The backedge is `/tmp/puni-cross-fast-calendar/libs/wbs/application/core/src/service/schedule-parts.ts:14`, importing `slicesOf` and `NO_DEADLINES`. Current initialization is safe by inspection: imported functions are invoked only after evaluation, and the `NO_DEADLINES` constant is read from inside preparation rather than at helper module top level. The integrated runtime tests also pass. I found no present temporal-dead-zone failure and do not claim one.

Nevertheless, use a bounded extraction before accepting the final integrated architecture: move the existing `slicesOf` implementation and the empty-deadline value into a shared leaf preparation module, or move them into `schedule-parts` itself, and have the resource consume that implementation. Preserve compatibility re-exports from the resource where existing tests/callers need them. Preserve the implementation and its proofs, rather than copying it. This leaves both saved/connected preparation and the live resource depending on one owner, without making the reusable preparation depend back on its 9,000-line consumer. This is an architecture recommendation based on dependency ownership; passing tests alone is not its resolution. No broad work-item-resource refactor is needed.

## Verified behavior and contract limits

- Canonical preparation matches the previous implementation. An independent probe compared the old live body, patched live wrapper, captured helper, display facts, and canonical serialized bytes across 32 combinations of estimate method, rounding, dated/undated project and hold reduction, with parent floors/deadlines, teams and resource demands. All 192 comparisons passed. Probe: `/tmp/puni-connected-fast-review-integration/libs/wbs/application/core/src/service/connected-preparation-review.test.ts`. The probe temporarily exports private functions only in the review copy.
- The required callback is synchronous and has no fallback. Tests invoke real domain `scheduleResolved`. One combined placement permits A.design → B.build → A.test and refuses real node cycles. Eligibility remains domain-owned before the project-rank comparator.
- Each member's settings determine real effort, widths and local graph resolution before joining. Required optimized members are inspected across the whole component before missing-calendar refusal; an installed local optimizer honestly reports connected optimization unsupported.
- Authored graph/capture ownership remains complete, including held rows. Placement uses reduced rows, reduced ownership and surviving endpoint selectors; partly held parent selectors retain surviving descendants. Rank entries include reduced-empty members. The known `ConnectedProjectGraph` “unreduced” JSDoc still needs the root-owned clarification already requested in the handoff.
- Calendar origin is the minimum absolute workday ordinal, independent of rank/target. Manual offsets/deadlines translate by addition; every surviving leaf gets its own start floor. Shared-person peers require anchors even without an external dependency endpoint. All-held components have null origin and empty schedules. Fractional arithmetic and signed helper offsets survive.
- Team/resource keys are injectively project-local; people share only in shared mode. Returned slice identities are decoded. Stable foreign blocker keys have complete ownership evidence. Project projections subtract their own shifts and recalculate waiting counts; `eventsVisited` explicitly remains the component computation count.
- Unexpected scheduling failures rethrow. Calendar-range conversion is modeled in the callback catch, but real rendered calendar range behavior is not exercised here: these detached schedules expose offsets, not a mounted date-rendering path.
- The callback seam does **not** establish snapshot lifetime. Runtime integration must add required `readResolvedFast`, apply the irreversible lifetime guard, and invoke it through `snapshot.scheduler.readResolvedFast(input)`. Passing bare `scheduleResolved` from a retained snapshot callback would bypass that guard. No live selector, readiness/admission integration, connected optimizer, historical connected export or activation is established by this slice.

## Independent checks and R5 audit

| Check                                                                                       | Observed result                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Frozen manifest, before and after review                                                    | All seven entries match                                                                   |
| Frozen connected + saved-input suites                                                       | 45 pass, 0 fail, 118 assertions                                                           |
| Live patch applied in review copy                                                           | Applies successfully                                                                      |
| Integrated connected/saved-input/work-item resource/step allowance/resource-schedule suites | 188 pass, 0 fail, 517 assertions; `/tmp/puni-connected-fast-review-integration-tests.log` |
| Integrated core library TypeScript                                                          | **Fails, exit 1**, TS2741 above                                                           |
| Patched resource, actual full ESLint configuration                                          | **Fails, exit 1**, imports above                                                          |
| Independent live/captured equivalence probe plus restored focused suites                    | 46 pass, 0 fail, 310 assertions                                                           |
| All 21 mutations replayed independently with live patch applied                             | Each returns exit 1 with the named failure; originals restored                            |

Mutation records: `/tmp/puni-connected-fast-review-mutations.json`; replay log: `/tmp/puni-connected-fast-review-mutations.log`; individual outputs: `/tmp/connected-fast-review-proof-<fault>.log`.

The mutation claims are reproducible, with the disclosed limits. Removing `prepared-calendar` still throws on property access; removing `uncaptured-project` still throws in graph resolution. These two establish diagnostic specificity, not independent acceptance prevention. Removing the missing-calendar branch still throws on null-date parsing, so that proof establishes preservation of the modeled refusal rather than acceptance of a bogus schedule. Rank and target-membership unavailable-path cases independently fail as claimed. The internal prepared-project/shift and null-origin assertions are invariant diagnostics, not separately reachable safety proofs. The reverse-identity negative reaches the production restoration helper with a real placed schedule, although it deliberately corrupts its detached mapping rather than reaching that corruption through normal capture.

The full host gate, full build, runtime/snapshot integration, installed live routes, readiness, optimization and deployment checks were not run. No network or WBS writes occurred. No conclusion above substitutes for the final integrated host gate.

## Durable artifacts

Referenced reports/proof outputs are retained in [task-6-fast-proofs](task-6-fast-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.

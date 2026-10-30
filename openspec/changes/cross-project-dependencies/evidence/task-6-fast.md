# Pure core connected Fast/calendar handoff

Worktree: `/tmp/puni-cross-fast-calendar`; branch supplied by root: `feat/cross-project-fast-calendar`; base: `2f40cd06d`. No commits, Git metadata writes, pushes, WBS writes, runtime edits, shared barrels or ports were made by this lane.

## Implemented scope

- Required three-argument `deriveConnectedPlan(capture, scheduler, scheduleFast)`; real synchronous placement callback, no optional capability or local scheduling fallback.
- Shared canonical preparation extracts real project arithmetic/capacity/hold/calendar work. Saved capture delegates to it. `unreducedInput` preserves real slices before hold reduction for authored graph inspection; `input` is the held-reduced canonical placement tuple.
- Strict scoped relationship owner, endpoint project, local evidence equality, project identity, rank and row-ownership checks; approved domain graph resolver supplies strict scoped selectors/ownership.
- One reduced connected graph and one real combined Fast pass, per-project steps/reach/settings/widths, injective local team/resource keys, mode-specific person identity. Public slices restore actual IDs; separate ownership evidence explains foreign blocker slice keys.
- Workday ordinal origin/own shifts, translated signed fractional numeric floors/deadlines, every active project start floor, own-axis project projection and per-project wait counts. `eventsVisited` remains explicitly the component computation count.
- Missing calendar retains complete authored graph/capture. All-held empty component has null origin and empty schedules. Every required optimized member is inspected; installed local optimizer remains explicitly unsupported for connected optimization. Enabled Fast comparison stays real Fast, without invented optimization metadata/cache identity.
- Target selection validates membership before returning any placement/refusal. Only known cycle/calendar-range scheduling failures are modeled; unexpected failures rethrow.

## Integration contract

Root must integrate the helper/saved wrapper and `/tmp/puni-connected-fast-live-wrapper.patch` together. The patch replaces the complete existing canonical preparation body with the same helper; `git apply --check` passed. It was deliberately not applied in this lane.

The helper uses the existing exported `slicesOf` and `NO_DEADLINES` from work-item.resource.ts. Applying the live wrapper introduces an ordinary function-binding module cycle. Root should run the mounted live/captured equivalence tests after applying it; this worker did not modify or test the live wrapper integration itself. Its import may need normal import sorting/unused import cleanup in root’s owned resource file.

The encoded resolved input immediately before `scheduleFast` is the future optimization integration seam. Select stages there before restoring IDs and own-axis output offsets. Do not reconstruct prepared inputs from output schedules.

`ResolvedScheduleInput.order.projectIdByWorkItem` is exactly reduced rows, including retained parents, from the reduced connected graph. Rank metadata covers every captured project, including reduced-empty members. Authored ownership is separate and retains held rows. Successful placement exposes that authored ownership in `identities` for blocker explanation.

The requested graph-model JSDoc clarification is outside this lane’s allowed domain edits: `ConnectedProjectGraph` currently says “unreduced” although the approved resolver also accepts reduced prepared local graph contexts. Root should update that JSDoc without weakening the explicit unreduced guard contract.

No runtime `readResolvedFast`, snapshot lifetime wrapper, LivePlanRead switch, admission/readiness producer, actual selected live consumer, optimization cache/admission, historical connected export, activation, or release integration is claimed. 6.1/6.2 production delivery is not complete on this helper alone.

## Fresh verification

| Check                                                                                                                    | Observed outcome                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `bun test .../service/connected-plan.test.ts .../service/saved-plan-input.test.ts`                                       | 45 pass, 0 fail, 118 assertions (27 new connected + 18 existing saved input)  |
| `NX_DAEMON=false bunx nx run wbs-core:test`                                                                              | 1195 pass, 0 fail, 4307 assertions across 107 files; Nx success, no cache hit |
| `NX_DAEMON=false bunx nx run wbs-core:typecheck`                                                                         | module target and core typecheck both pass, 0/2 cache hits                    |
| Focused domain schedule-connected/typed/weighted/priority/capacity/resources/elsewhere/held/golden/connected-node suites | 151 pass, 0 fail, 15510 assertions across 10 files                            |
| Focused deadline-order/placement-order/resource-corpus/joint-capacity/workday/property/deadline-offset/shapes suites     | 134 pass, 0 fail, 2874 assertions across 8 files                              |
| `NX_DAEMON=false bunx nx graph --file=/tmp/puni-connected-fast-nx-graph.json`                                            | actual generated graph; no boundary lint skip                                 |
| Named uncached `bunx eslint` on the six manifest files                                                                   | exit 0, no warnings/errors                                                    |
| Named `bunx prettier --check` on the six manifest files                                                                  | all matched files pass                                                        |
| `git diff --check`                                                                                                       | exit 0                                                                        |
| `git apply --check /tmp/puni-connected-fast-live-wrapper.patch`                                                          | exit 0                                                                        |

Nx reported a restricted-socket warning and explicitly ran plugins in the main process; graph creation, module boundaries, lint and typecheck ran successfully. No required tool was absent. Full host gate, build, installed runtime, snapshot lifetime/live route integration, release and deployment checks were not run by this lane (root-owned/integration scope).

Full output: `/tmp/connected-fast-focused.log`, `/tmp/connected-fast-core.log`, `/tmp/connected-fast-domain.log`, `/tmp/connected-fast-calendar-regressions.log`, `/tmp/connected-fast-nx-typecheck-final.log`, `/tmp/connected-fast-lint-final.log`, `/tmp/connected-fast-format.log`. Initial typecheck/lint/fixture errors were corrected; these are final restored outputs.

## R5 observations

21 separately injected production faults each returned exit 1 with a named assertion failure; originals were restored after each run and focused suites returned green. Script: `/tmp/puni-connected-fast-mutations.py`; machine record: `/tmp/puni-connected-fast-mutations.json`; individual outputs: `/tmp/connected-fast-proof-<fault>.log`.

The absent-prepared-calendar and uncaptured-project explicit checks are diagnostic redundancies: removing them still refused downstream but changed the asserted context. Rank and target checks were initially masked by downstream refusals; unavailable-path tests now independently fail when those checks are removed. Null-origin and internal preparation/shift lookups are explicitly marked invariant diagnostics; no claim of an independently reachable safety mutation is made for those redundant invariants.

| Injected fault     | Observed failing test(s)                                                                                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prepared-calendar  | refuses absent prepared calendars and broken reverse identities on real placements                                                                                                                                                      |
| reverse-identity   | refuses absent prepared calendars and broken reverse identities on real placements                                                                                                                                                      |
| owner              | refuses wrong relationship ownership and mismatched local captured evidence                                                                                                                                                             |
| uncaptured-project | refuses foreign project rows, absent endpoint project and cross owned endpoint identity                                                                                                                                                 |
| project-identity   | refuses corrupted project identity and nonfinite rank, and throws unknown scheduling failures                                                                                                                                           |
| rank-finiteness    | validates rank before an engine refusal and target membership before any unavailable return                                                                                                                                             |
| row-ownership      | refuses foreign project rows, absent endpoint project and cross owned endpoint identity                                                                                                                                                 |
| local-evidence     | refuses wrong relationship ownership and mismatched local captured evidence                                                                                                                                                             |
| required-engine    | inspects the nontarget required optimized member before calendar refusal                                                                                                                                                                |
| team-namespace     | uses own rounding, units, allowance, team capacity and width before injective namespacing                                                                                                                                               |
| resource-namespace | keeps identical resource catalog IDs project local and restores binding identities                                                                                                                                                      |
| person-namespace   | shares people only in shared mode and restores actual person identity and own waiting counts                                                                                                                                            |
| missing-calendar   | retains graph and capture when a required calendar is missing; requires an active shared-person peer anchor even without its external endpoint                                                                                          |
| own-start-floor    | retains own Wednesday floor and projects back to each own anchor; uses the earliest anchor independent of project rank and capture order                                                                                                |
| own-shift          | retains own Wednesday floor and projects back to each own anchor; retains fractional effort and translates a weekend manual floor and deadline under own anchor; uses the earliest anchor independent of project rank and capture order |
| fraction-roundtrip | preserves signed fractional numeric calendar constraints without date round trips                                                                                                                                                       |
| own-method         | applies each project minute conversion, estimate method and allowance exactly once                                                                                                                                                      |
| own-reach          | resolves every project local dependency under its own reach and step order                                                                                                                                                              |
| own-rounding       | uses own rounding, units, allowance, team capacity and width before injective namespacing; retains fractional effort and translates a weekend manual floor and deadline under own anchor                                                |
| hold-reduction     | retains authored held endpoints but schedules no held work and needs no empty anchor; reduces partial held parent selectors without losing authored pairs; expands partly held parent relationships to surviving leaves only            |
| target-membership  | validates rank before an engine refusal and target membership before any unavailable return                                                                                                                                             |

## Frozen manifest

Machine-readable SHA-256 manifest: `/tmp/puni-connected-fast-calendar-manifest.json`. Freeze applies to these exact files; root owns subsequent review/integration edits.

| Path                                                                      | SHA-256                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `libs/wbs/application/core/src/service/schedule-parts.ts`                 | `81a58c50323fcd09b6c1075ea145a4a9e757ee94894c124f3a6ed8487150946c` |
| `libs/wbs/application/core/src/service/connected-plan.ts`                 | `0f656c8665e99dc6c4abd10c49e8eaac657a413433b3096fa85186223a4b11e9` |
| `libs/wbs/application/core/src/service/connected-plan-calendar.ts`        | `8f5fbb2c0aea703544ac6434b627541d0db269f80a70f597057e565ed536e815` |
| `libs/wbs/application/core/src/service/connected-plan-projection.ts`      | `bdc01c7075da44dc85cc86673f831289ac3ef778480c6f0ed48b70539fb66dd5` |
| `libs/wbs/application/core/src/service/connected-plan.test.ts`            | `513e8f4b7cdbbe793270485e15fa544d228def9ca5bff3ebd77ce35964b18584` |
| `libs/wbs/application/core/src/module/saved-plans/saved-plan-schedule.ts` | `6321e69dd98b1951d30bf842ae3e2390547652716fa3db31acee45f7a3593a00` |
| `/tmp/puni-connected-fast-live-wrapper.patch`                             | `3c7779f18b12ff5d33b5dba1cec9b21bf5128444eab45868f7beda42b5b2ce66` |

## Durable artifacts

Referenced reports/proof outputs are retained in [task-6-fast-proofs](task-6-fast-proofs/). Probe/driver source is stored as text, not discovered tests. Log trailing whitespace alone was normalized. Initial failing, diagnostic-only and superseded observations remain classified in these reports.

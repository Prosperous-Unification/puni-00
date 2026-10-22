# Bounded connected optimization core packet

2026-10-22, isolated clone `/tmp/puni-optimized-stages`, base `833ceff80`.

This is the pure stage construction and sequential-selection portion of 7.3.
It does not complete 7.3 or 7.4 and does not enable optimized connected production reads.
The existing `deriveConnectedPlan` refusal remains authoritative until the actual
captured connected adapter, runtime, persistence and publication paths are wired.
The input is the prepared common-axis reduced component before restoration of
capacity identities or local calendar offsets.

## Verification

- Initial focused Bun run failed because the new production module was absent.
- The calendar-less entirely empty component initially failed with `engine_unavailable`; the restored implementation returns idle metadata without requiring an origin or optimizer.
- `bun test libs/wbs/application/core/src/service/connected-optimization.test.ts`: 27 pass, 0 fail.
- `bun test libs/wbs/application/core/src/service/connected-optimization.test.ts libs/wbs/application/core/src/service/connected-plan.test.ts libs/wbs/domain/domain/src/connected-publication.test.ts`: 97 pass, 0 fail, 268 assertions.
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.json`: exit 0.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-optimized-stages-graph.json`: created the graph. Initial graph attempt with default socket behavior exited 0 without creating a graph and therefore proved nothing. The explicit socket-free invocation supplied the needed graph.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx eslint libs/wbs/application/core/src/ports/scheduler.ts libs/wbs/application/core/src/service/connected-optimization.ts libs/wbs/application/core/src/service/connected-optimization.test.ts`: exit 0 with the graph available; earlier direct lint had explicitly skipped the module-boundary rule.
- `bunx prettier --check libs/wbs/application/core/src/ports/scheduler.ts libs/wbs/application/core/src/service/connected-optimization.ts libs/wbs/application/core/src/service/connected-optimization.test.ts`: all matched files conform.

## Watched negatives

Each fault was injected into the production module separately, the named focused
Bun test exited 1 on the stated observable failure, and production was restored.
The restored focused suites passed afterwards. Temporary mutation logs are under
`/tmp/puni-stage-proof-*.log`; they are execution artifacts, not durable fixtures.

| Injected fault                                                                                          | Observed failure                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove stage membership                                                                                 | Unknown project returns idle instead of throwing.                                                                                                                                     |
| Remove active-origin guard                                                                              | Diagnostic test receives downstream `finite origin` instead of the specific active-calendar error; domain validation remains a redundant refusal.                                     |
| Remove structured cloning                                                                               | Detachment test sees newly added source floor in stage (`true`, expected `false`).                                                                                                    |
| Remove baseline replay                                                                                  | Forged finish 100 is accepted instead of throwing.                                                                                                                                    |
| Bypass required capability refusal                                                                      | `selected`, expected `engine_unavailable`.                                                                                                                                            |
| Ignore enablement                                                                                       | Disabled C appears among adapter observations.                                                                                                                                        |
| Ignore selected engine                                                                                  | Fast placement changes instead of retaining the exact baseline.                                                                                                                       |
| Select Time unconditionally                                                                             | PRI-selected project moves using the comparison variant.                                                                                                                              |
| Build every stage from original baseline                                                                | Later stage sees A at 3 instead of previously selected 0.                                                                                                                             |
| Bypass rank/ID sorting                                                                                  | Adapter sees C,B,A instead of A,B,C.                                                                                                                                                  |
| Drop graph edges during candidate publication replay                                                    | Final B stage moves before fixed A finishes; whole-component test loses exact baseline retention. The invalid stage is last so no later baseline replay masks this missing validator. |
| Bypass certificate identity check                                                                       | Old-boundary certificate remains terminal instead of becoming corrupt.                                                                                                                |
| Drop canonical stage-byte equality                                                                      | Stale candidate replaces the exact baseline.                                                                                                                                          |
| Independently drop project, objective, input hash, installed contract, budget, quantum or wire equality | Each matching parameterized test observes replacement instead of exact baseline retention.                                                                                            |
| Allow empty question hash                                                                               | Matching identity test observes replacement instead of exact baseline retention.                                                                                                      |

The domain's existing publication suite supplies independent real foreign-pin,
capacity, floor/deadline and scoped-score coverage. This packet adds no alternate
scheduler, graph resolver, materializer or hashing implementation.

## Remaining integration

- Expose the actual prepared component from connected derivation and invoke selection
  within its owning snapshot, then restore/project the final composite.
- Supply the connected captured adapter with validated cache outcomes and local
  starts, actual hash/question construction and concrete solver certification.
  Core checks echoed mathematical identity and canonical stage bytes; it cannot
  establish cryptographic hash construction, CP-SAT status, runtime compatibility
  or certificate provenance merely from a typed adapter value.
- Preserve the callback lifetime on new captured reads; implement post-close live
  admission, exact publication fences, durable terminal outcomes, restart/Retry
  rules, full hash sweep and activation evidence in 7.4.
- Production whole-reader/exit/coordinator negatives, installed Python/runtime
  checks, OpenSpec validation and the required host gate were not run by this packet.

## P2 correction after independent review

The initial packet `87551bc3d` was rejected because its empty-local return skipped
trusted placement validation. The executable reviewer probe returned stale slice
`a\u0000` for an empty prepared input. Initial regression runs reproduced four
failures: stale surplus placement, missing/unknown active ownership and forged
foreign timing behind an idle member.

Both public entry points now validate unique project membership, complete finite ranks,
component ownership and exact slice/work-item
placement keys before engine refusal or idle handling. An idle member in a nonempty
component runs canonical validation and real replay using an actual active owner
solely for evidence validation; it returns no stage question. Entirely empty
components retain null origin and no optimizer requirement, and the actual resolved
engine validates their empty graph. No calendar origin is invented.

Fresh restored checks after correction:

- The reviewer probe `bun /tmp/puni-optimized-stages-empty-probe.ts` now exits 1 at
  `connected optimization placement keys`, before returning idle/selected.
- Focused new suite: 38 tests. Combined three-file Bun run: **108 pass, 0 fail,
  284 assertions**.
- Core `bunx tsc --build --force libs/wbs/application/core/tsconfig.json`: exit 0.
- Named-file ESLint with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`: exit 0 after
  using `.at(0)` for the explicitly optional first slice.

New production-path watched faults, restored afterwards:

| Injected fault                                                                 | Observed failure                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove the empty-component membership guard                                    | Duplicate projects and absent/nonfinite ranks return idle instead of refusing.                                                                                                                            |
| Remove the pre-idle exact-key guard                                            | Both public entry-point regressions return idle/selected for stale surplus slice placement; separate stale work-item-only cases also fail.                                                                |
| Return idle before validating foreign evidence                                 | Forged foreign finish 100 is accepted by the idle member.                                                                                                                                                 |
| Remove the pre-idle ownership guard alone                                      | Unknown ownership still refuses through canonical validation, changing the expected ownership diagnostic to `stage owner`; missing ownership remains redundantly protected by owner narrowing.            |
| Remove ownership validation together with canonical/replay and owner narrowing | Both missing and unknown active owners are accepted as idle by the builder regression. This is deliberately recorded as a combined fault because independent downstream checks protect the same evidence. |
| Remove the actual resolved replay for entirely empty input                     | An empty component with invented graph nodes returns idle instead of refusing.                                                                                                                            |

The new logs are `/tmp/puni-stage-proof-empty-placement-keys.log`,
`idle-foreign-replay.log`, `idle-ownership-diagnostic.log`,
`idle-ownership-combined.log`, `empty-membership.log` and `empty-graph-replay.log`, with the same
`/tmp/puni-stage-proof-` prefix. Earlier mutation logs above remain historical
observations and are not presented as a new complete mutation sweep.

This correction leaves 7.3 and 7.4 open and preserves every production integration
limitation listed above.

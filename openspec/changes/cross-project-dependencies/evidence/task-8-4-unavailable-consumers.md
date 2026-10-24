# Bounded unavailable-tree consumer compatibility — 2026-10-22

Base: reviewed unavailable-tree presenter `5de47861a51a2c3cb5da30b5d38252fed4adf048`.
Implementation checkout: `/tmp/puni-unavailable-aggregate`, a separate local shared
clone. Dependencies reuse `/tmp/puni-unavailable-tree/node_modules` via symlink;
this packet did not install dependencies or change the lockfile.

## Behavior

Person load maps the structured tree outcomes to its deliberate coarse codes:
`dependency_calendar_missing` and `engine_unavailable`; local cycle/range and
standalone engine-unavailable behavior remain intact. Unavailable trees produce
no bookings, overlaps or weekly booked work. Assignment selection remains the
existing policy. Detailed contributing identities remain in the project tree.

Roll-ups retain exact `ScheduleError` evidence, accounting and current status.
Connected unavailable trees report null dates and `displayed: null`, including
connected `calendar_range`; local displayed-engine strings remain unchanged.
`ROLLUP_DTO_VERSION` is now 2. Tree and roll-up HTTP contracts reuse one exact
ArkType availability shape, retaining required nonempty contributing identities
and the two explicit optimized engine reasons. No duplicate broad string schema
or invented Fast placement was introduced.

Connected trees obtained through the isolated-capacity path are not stored in
person-load or space target-only caches. Remote calendar edits can change their
availability without moving the target sequence/revision. The mounted witness
restores and then removes only the remote anchor and verifies that target load
bookings and roll-up dates reappear and disappear accordingly.

## Observed verification

```sh
bun test libs/wbs/application/core/src/service/person-load.feature.test.ts libs/wbs/application/core/src/service/space.resource.test.ts libs/wbs/domain/domain/src/project-roll-up.test.ts libs/wbs/domain/contracts/src/http/work-item-response.test.ts libs/wbs/domain/contracts/src/http/unavailable-consumer-shapes.test.ts apps/wbs/be-01/src/controller/person-load.controller.db.test.ts apps/wbs/be-01/src/controller/space-organization.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-live.controller.db.test.ts
```

Exit 0: **96 tests, 490 assertions**. This includes existing local/shared incoming
calendar regressions, access isolation and the new unavailable consumers.
After strengthening the recovery witness to exact booking dates and retained
ready counts, the four new mounted cases passed again: **4 tests, 48 assertions**.
The source packet's existing optimized fixture emits its already documented
`connected optimization input is unsupported` child logs; modeled invalid-input
cases also emit expected errors.

```sh
bunx tsc --build --force libs/wbs/application/core/tsconfig.json
bunx tsc --build --force apps/wbs/be-01/tsconfig.json
node_modules/.bin/openspec validate cross-project-dependencies --strict --json
```

All exited 0. Backend typecheck includes its spec project. Named-file ESLint
passed after generating a fresh Nx project graph; the first lint run had no
graph and found test matcher assignments, which were corrected. Prettier wrote
the changed TypeScript files. The final recorded format and diff checks are
listed in `verify.md`.

A search of `ProjectRollUp`, `RollUpTree` and space `displayed` consumers found no
production frontend usage of the roll-up engine field. The domain/core/backend
compile checks cover their nullable consumers. Frontend handling of the new
coarse missing-calendar code remains outside this packet.

## Watched production faults

Each fault was injected independently, its test command exited 1, and the file
was restored before the next fault. Adjacent production `Proof:` comments name
the observed regressions.

| Injected fault                                            | Observed production-path failure                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pass a structured error directly as the load reason       | Mounted person load returned 500, expected 200, because the response representation was undeclared. Initial red: 0/3; repeat mutation caught the same error. |
| Restore unconditional `optimization?.displayed ?? 'fast'` | All four mounted unavailable cases returned `displayed: 'fast'`, expected null, including calendar range.                                                    |
| Store connected load readings under the target memo key   | Remote anchor restoration left Target in missing-calendar unavailability instead of restoring its booking.                                                   |
| Store connected roll-ups under the target cache key       | Remote anchor restoration left Target dates/displayed null and missing-calendar evidence instead of the restored schedule.                                   |
| Replace the roll-up availability schema with `unknown`    | `space roll-up boundary rejects incomplete or invented connected evidence` received no issues for invalid evidence.                                          |

Initial mounted red output: `/tmp/aggregate-red.log`; warm-cache red:
`/tmp/aggregate-cache-red.log`; independent fault outputs:
`/tmp/aggregate-fault-{reason,displayed,load-cache,space-cache,schema}.log`.
Passing regression output: `/tmp/aggregate-regressions.log`; strengthened mounted
output: `/tmp/aggregate-strengthened.log`. These paths are local execution logs;
the permanent observations are recorded above.

## Explicit limits

The real mounted cases use **isolated capacity**: `readAggregate` returns its
existing isolated arm, then the actual `treeWithin` path captures and projects
connected scheduling. There are no spies in the new cases. This proves the
consumer behavior for real connected trees; it does not prove shared connected
aggregate capture, overlap deduplication, null-basis aggregate identities,
retained observations or snapshot lifetime behavior. The explicit connected
aggregate refusal remains unchanged.

No frontend UI, arrangement, optimizer admission/persistence, publication fanout,
saved/export/import path, migration or activation change was made. Full frontend
coverage, full CI, full lint/build, the exact-SHA host gate, release and deployment
were not run. Tasks 8.4 and 9.2 remain open.

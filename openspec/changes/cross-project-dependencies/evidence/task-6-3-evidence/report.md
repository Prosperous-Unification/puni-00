# Task 6.3 required execution evidence matrix

2026-10-23. Isolated clone `/tmp/puni-63-evidence`, exact base
`025c5ac9446b59d193e977e8830aa29332ae3c47`. This packet adds tests and evidence
only; production evaluation and read ownership remain unchanged. Parent 6.3
remains unchecked pending MCP/skip-policy reconciliation, independent review and
integrated gates. No task 7.3 optimization or task 5.2 browser files changed.

## Mounted contracts

Ten added cases cross the installed HTTP startable/tree/command routes and real
migrated SQLite. The existing FS/SS/FF and coherent-observation matrices remain.

- Missing attempt/progress collections and throwing remote readers each produce
  explicit HTTP 500 on startable, tree and claims. `undefined` is an injected
  violation of the trusted repository contract; it differs from legitimate empty
  arrays, which the existing unfinished-FS/unknown-SS cases treat as unknown.
  Missing attempts report `missing live attempts`; missing progress currently
  throws a TypeError while consuming the required collection. No diagnostic
  wording or typed transport distinction between these internal failures is
  promised. These cases assert refusal rather than a graceful empty response.
- Foreign-step progress and attempts are delivered after the real project-owned
  SQL read. The work item remains remote and the substituted step belongs to the
  target, so a union-wide step set would incorrectly accept the fact. Injecting
  persisted corruption directly was intercepted earlier by admitted-scope
  validation; the final tests instead exercise the evaluator boundary directly
  while retaining the actual mounted read/command consumers.
- A remote `findInOrganization` returning null refuses all three surfaces. A
  null result represents required-project absence; the HTTP contract does not
  distinguish it from unreadable required metadata.
- A remote hold renders both the target row and its first node
  `blocked_by_proxy`, excludes startable work and refuses its claim.
- Missing remote calendar retains links, row readiness and node readings in the
  tree while reporting `dependency_calendar_missing`. Startable still refuses an
  unmet FS and admits the exact target step after observed completion.
- Shared resource scope uses B→A authored FS and A–C shared executor assignments.
  C has no authored dependency. Attempt-query evidence includes exactly A/B/C.
  A and C share resource catalog identity `machine`, with respective capacities
  two/seven and demands two/seven. C's persisted claim occupies seven units.
  A's response reports capacity two, occupied zero, free two, project scope and
  a fitting target; A's accepted claim then reports occupied two/free zero while
  both occupancy rows persist. No global person-occupancy policy is inferred.

Every refused command compares every user SQLite table before/after and checks
zero publication through the installed push transport. Evidence-failure commands
include an earlier rename in their batch. Admission/fanout may refuse before
that rename executes (notably missing-project and persisted-corruption admission);
this packet does not claim every such case reached the staged-write point.
Existing mixed-step tests separately prove rollback after an actual staged edit.
Manual `startAttempt`/`setProgress` correction policy remains covered by the
existing suite. FF remains a finish reading, without blanket completion refusal.

## Watched independent faults

Each production mutation was restored byte-for-byte before the next injection.
No mutation is committed. Commands used the mounted test file:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts --timeout=10000 --test-name-pattern '<pattern>'
```

| Receipt prefix     | Fault                                                                    | Pattern                                   | Observed fault run                                                                    |
| ------------------ | ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `attempt`          | Remove `attempted.has(key)` from started evidence                        | `SS observes ended unsuccessful attempts` | Exit 1, one failed assertion: ended failed SS no longer releases startability         |
| `progress`         | Empty the captured `stated` collection in readiness                      | `missing remote calendar`                 | Exit 1, one failed assertion: completed remote FS remains blocked                     |
| `hold`             | Replace captured row holds with null before readiness projection         | `remote holds`                            | Exit 1, one failed assertion: tree status ready replaces blocked_by_proxy             |
| `external-edge`    | Replace execution read's external graph relationships with `[]`          | `remote unfinished FS`                    | Exit 1, one failed assertion: unfinished target advertised                            |
| `union-steps`      | Validate step membership against all component projects                  | `foreign step in own-project`             | Exit 1, two failed assertions: both corrupt startable reads answer 200 instead of 500 |
| `resource-scope`   | Remove occupancy query's project predicate                               | `exact project-local`                     | Exit 1, one failed assertion: occupied seven/free minus five instead of zero/two      |
| `required-project` | Continue instead of throwing when a captured project lookup returns null | `required remote project absence`         | Exit 0, original refusal remains; diagnostic only                                     |

Each prefix has `*-fault.log` and `*-restored.log`; each restored invocation
exited zero. Readable receipts normalize LF and trailing whitespace only. For
the three fault receipts containing source-frame trailing spaces, exact original
bytes are additionally retained as `.log.raw.gz`. The required-project omission is **not an independently killed
safety guard**. Startable still throws `no project ... in connected graph`, tree
throws `relationship prerequisite has uncaptured project`, and command admission
throws `dependency fan-out endpoint is unreadable`. No resolver was weakened to
manufacture unsafe success. Adjacent Proof comments name only observed failures.

The initial fixture log records a rejected `step_blockage_inactive` setup, not a
production behavior failure or TDD red. That extraneous blockage case was removed;
`fixture-restored.log` records the corrected ownership/resource tests. No
production defect was exposed and no implementation code was needed.

## Verification and limits

The restored focused packet passes **122 tests, 652 assertions** (`focused.log`):

```sh
bun test apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts libs/wbs/application/core/src/module/work-item/startable.test.ts libs/wbs/application/core/src/service/connected-readiness.test.ts libs/wbs/domain/domain/src/execution-eligibility.test.ts libs/wbs/domain/domain/src/claim.test.ts --timeout=10000
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck
bunx openspec validate cross-project-dependencies
```

Configured lint/typecheck, OpenSpec and formatting all exited zero; receipts
live alongside this report. OpenSpec reported seventeen existing long-requirement
warnings. Configured Nx checks ran without cache hits. Initial typecheck/lint caught test helper typing/import/unbound-method
issues; the helper now reads the actual method descriptor, preserves complete
facts and scopes the deliberate missing-collection cast to its fault boundary.

Frozen install with `BUN_TMPDIR=/tmp` failed EROFS (`install.log`). With parent
authorization, this clone links its `node_modules` to the primary checkout's
installed dependencies. No primary source or dependencies were edited; a fresh
frozen installation has not been established here. No full backend coverage,
build, browser/socket test, CI, host gate, push, merge or activation was performed.
Independent review is arranged by the parent after the normal commit.

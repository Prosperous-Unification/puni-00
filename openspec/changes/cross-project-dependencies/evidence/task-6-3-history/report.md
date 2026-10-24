# Task 6.3 historical and manual execution observations

Bounded acceptance packet based on feature commit `16df14095`, implemented in
`/tmp/puni-task63-history`. No production behavior, new eligibility guard,
activation or dependency-participation/skip semantics changed. The existing
[scheduling ruling](../../architecture/connected-scheduling.md#readiness-startable-and-actual-execution-eligibility)
separates current execution permission from authored observations and historical
ownership restoration.

## Mounted acceptance

`cross-project-execution-observations.controller.db.test.ts` adds 24 cases over
local/remote prerequisites and isolated/shared organization modes. Each fixture
uses composed production SQLite services and authenticated HTTP routes; synthetic
stored dependency authority keeps runtime activation dormant. Target projects
have one step, avoiding unrelated workflow prerequisites in this bounded matrix.

- Attempt-only continuation starts and ends a failed attempt without a progress
  statement. An unmet FS prerequisite remains `canStart: false`, while the target
  is `started: true`, advertised and claimable. Claim undo/redo retains the exact
  attempt number, start/end times and outcome. The replay can restore its new
  progress statement because the historical attempt establishes continuation.
- Statement-only continuation records `in_progress` with no attempts. It remains
  advertised and claimable despite current `canStart: false`.
- Both continuation families first refuse a fresh claim with HTTP 409, compare
  every SQLite table before/after, and assert zero publication. Thus continuation
  does not bless a never-started node.
- Manual `setProgress(done)` succeeds with unmet FS/SS start conditions and unmet
  FF finish conditions. Its undo removes the statement; redo restores `done`.
  Readings keep prerequisite permission separate and exclude the done target from
  startable leaves. `setActual(2.5)` persists that exact correction and survives
  undo/redo without altering completion. A later `in_progress` correction succeeds
  and retains the actual. These actions create no attempts.
- Release undo restores the same recorded claim identity after later synthetic
  observations remove both upstream completion and target progress. It creates
  neither progress nor an attempt. The current reading remains `started: false`,
  `canStart: false` and exposes the restored claim. This restores ownership rather
  than replaying a new governed start. The existing startable suite separately
  proves a fresh claim redo refuses after prerequisite regression.

Shared mode here exercises organization mode routing with local/remote edges;
this packet does not add another shared-person topology bridge fixture. Existing
startable cases in the restored run retain that coverage. No universal dependency
lock on manual completion/actual corrections or attempt observation is claimed.

## Watched production faults

Each fault changed exactly one production expression, ran the selected mounted
cases, exited 1 at the stated assertion, and was restored before the next fault.
Adjacent test `Proof:` comments identify these witnesses. This is tests-only
acceptance of existing behavior; no new production safety check was introduced.

| Injected fault                                                                                    | Selected pattern      | Observed failure                                                    | Log                                               |
| ------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| `startable.ts`: replace `!evidence.started && !eligibility.canStart` with `!eligibility.canStart` | `continuation`        | 8 failures: target absent from advertised leaves                    | [startable](startable-continuation.log)           |
| Domain `claim.ts`: remove `!admission.started &&`                                                 | `continuation`        | 8 failures: continuation claim returns 409 instead of 200           | [claim](claim-continuation.log)                   |
| Replay in `work-item.resource.ts`: remove `!evidence.started &&`                                  | `attempt-only`        | 4 failures: claim redo returns 409 instead of 200                   | [replay](replay-continuation.log)                 |
| Replay: use `command.claims` instead of `command.stated` as new starts                            | `release undo`        | 4 failures: historical release undo returns 409 instead of 200      | [classification](release-classification.log)      |
| `connected-readiness.ts`: remove `attempted.has(key)` from started evidence                       | `remote attempt-only` | 2 failures: target's `started` reading becomes false                | [attempt evidence](attempt-evidence.log)          |
| Progress replay: replace `command.state` with `in_progress`                                       | `manual completion`   | 12 failures: completion redo stores `in_progress` instead of `done` | [completion replay](manual-completion-replay.log) |
| `setActual`: replace authored `days` with `1`                                                     | `manual completion`   | 12 failures: stored correction is 1 instead of 2.5                  | [actual correction](manual-actual-correction.log) |

Fault command for each selected pattern:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-execution-observations.controller.db.test.ts --test-name-pattern '<pattern>'
```

The manual faults prove the actual production writes/replay are observed, rather
than relying on success status alone. The continuation faults distinguish the
advertising, claim and replay consumers. Failure of the attempt-evidence reading
stops before its later claim assertion; claim consumer proof is the separate
claim fault above.

## Verification

```sh
bun test apps/wbs/be-01/src/controller/cross-project-execution-observations.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-execution-observation.controller.db.test.ts
bunx tsc --noEmit --incremental false -p apps/wbs/be-01/tsconfig.spec.json
NX_DAEMON=false bunx nx show project wbs-be-01 --json
bunx eslint apps/wbs/be-01/src/controller/cross-project-execution-observations.controller.db.test.ts
bunx prettier --check apps/wbs/be-01/src/controller/cross-project-execution-observations.controller.db.test.ts openspec/changes/cross-project-dependencies/evidence/task-6-3-history/report.md openspec/changes/cross-project-dependencies/verify.md
bunx openspec validate cross-project-dependencies --json
```

The [restored run](restored.log) passes 63 tests with 1031 assertions across three
files. Expected error logs originate in the existing absent/unreadable evidence
negative tests. The backend spec typecheck exits 0. Scoped eslint exits 0 without
skipped-rule warnings after generating the Nx graph; its initial graphless run
warned that the module-boundary rule was skipped and is not the lint proof.
Scoped formatting and OpenSpec validation pass; OpenSpec retains 18 existing
long-requirement warnings. Nx falls back to in-process plugin execution because
sandbox socket creation is denied; graph generation itself exits 0.

No h2puni/h4claw exact-SHA gate, full repository gate, browser, CI or deployment
was run for this bounded packet. Parent Task 6.3 remains unchecked pending its
independent review and integrated gate. Activation remains unclaimed.

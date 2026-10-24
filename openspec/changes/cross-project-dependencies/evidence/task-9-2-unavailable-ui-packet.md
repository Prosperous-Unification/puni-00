# Task 9.2 bounded unavailable schedule presentation

This packet starts at `091ce60a8` in `/tmp/puni-persisted-dependency-ui`.
It renders the captured `dependency_calendar_missing` and `engine_unavailable`
read outcomes in the table and Gantt panel. Missing calendars name the captured
project abbreviation and name. The table retains its rows and dependency editor;
the chart draws no dates even if its caller supplies stale slices. Legacy cycle
and calendar-range explanations retain their existing wording.

The chart, schedule, toolbar and export prop contracts now take
`PlanRead['scheduleError']`, preserving the exact captured union through their
callers. Export and arrange availability already use the null/non-null distinction.
This packet changes no backend capture, dependency storage or person-load files.

## Watched production-path negatives

Before implementation, the configured Vitest runner executed four new mounted
cases. Both table cases failed because no `alert` existed for the structured
outcome. Both chart cases failed because the rendered status incorrectly said
that the plan exceeded the calendar range. The test deliberately supplies a
nonempty chart with slices, proving the view suppresses dates rather than merely
receiving an empty chart. Recorded output: `/tmp/persisted-ui-red.log` (4 failed,
396 skipped). The table tests also retain the dependency input and assert dash
forecasts. Adjacent `Proof:` comments identify the omitted rendering branches.

After implementation, the same selection passed 4/4 with 396 skipped in
`/tmp/persisted-ui-green.log`. The selected test names begin `explains
 dependency_calendar_missing` or `explains engine_unavailable`.

## Commands

From `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run src/components/wbs/plan-dependencies.test.tsx src/components/wbs/gantt-panel.test.tsx --no-file-parallelism --maxWorkers=1 -t 'explains (dependency_calendar_missing|engine_unavailable)'
```

From the repository root:

```sh
bunx tsc --build apps/wbs/fe-01/tsconfig.json --pretty false
```

Frontend TypeScript exited 0 (`/tmp/persisted-ui-tsc.log`).

## Remaining boundaries

Task 9.2 stays unchecked. The `workItemTree.connectedDependencies` producer
already captures external endpoint project IDs, labels and own-project step
identity. However, no frontend view currently consumes `connectedDependencies`:
the displayed `TypedDependencyView` shape has no owning project IDs or captured
labels, and its label builder resolves work items in the local rows. Stable remote
relationship navigation and absent-row arrow suppression need the existing
captured projection delivered through frontend readings and views. This packet
does not invent external facts from lookup requests. The frontend also has no
boundary-infeasible certificate outcome DTO yet, so retained Fast/certificate
scope and terminal Retry suppression are unimplemented here. Existing abbreviation settings and conflict tests were
already present in the base commit and are not newly claimed by this packet.

Full frontend Nx tests, browser tests, build, full lint/gate, host gate, push and
deployment are not claimed by this bounded packet.

## Additional verification status

Scoped Prettier check and `git diff --check` passed. The first scoped ESLint run
found five import-order errors; `eslint --fix` completed successfully. Its Nx
module-boundary rule initially skipped because this isolated clone lacked a
cached graph. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph
--file=/tmp/persisted-ui-project-graph-no-worker.json` then produced the graph;
scoped ESLint then passed with that graph (exit 0; log
`/tmp/persisted-ui-lint-final.log`). The earlier graph attempt reported sandbox
socket refusal before this supported in-process fallback.

The broader five-suite Vitest command passed 551/551 tests in 185.66 seconds
(`/tmp/persisted-ui-regression.log`):

```sh
TZ=UTC bunx vitest run src/components/wbs/plan-dependencies.test.tsx src/components/wbs/gantt-panel.test.tsx src/components/wbs/plan-export.test.ts src/components/wbs/plan-toolbar.test.tsx src/components/wbs/plan-mermaid.test.ts --no-file-parallelism --maxWorkers=1
```

## Review corrections — export reasons and inspection wording

Astra's bounded review found that the production CSV/Markdown header writer still
classified every non-cycle refusal as calendar overflow, despite the widened
export type. It also found that the new shared refusal sentences promised
inspection of external dependencies/readiness before frontend delivery existed.
The corrections use the captured structured reason in both export formats,
preserve legacy cycle/range wording, and remove the inspection promise. Only the
editable table says “The plan remains editable”, next to the tested local editor.
The shared chart/export explanation makes no inspection or editability promise.

Six new production export cases cover CSV and Markdown for missing-calendar
project labels and both unavailable-engine reasons. Each also checks that
unscheduled dates remain suppressed. Two mounted table cases assert the limited
editability wording and reject the unsupported inspection promise.

Before changes, the selection failed all eight new assertions
(`/tmp/persisted-ui-review-fix-red2.log`). After changes, all six export cases and
the four existing structured table/chart cases passed (10 tests;
`/tmp/persisted-ui-review-fix-green.log`). Independent fault injections then
proved each correction:

- Forced the export reason branch back to its old calendar-range catch-all,
  leaving the wording correction intact: all six new CSV/Markdown tests failed
  (`/tmp/persisted-ui-export-negative.log`, exit 1).
- Restored only the unsupported shared inspection promise, with the export
  correction restored: both mounted table cases failed the negative wording
  assertion (`/tmp/persisted-ui-promise-negative.log`, exit 1).

Both mutations were restored. Adjacent `Proof:` comments name those observations.
Task 9.2 remains unchecked; this correction adds no external relationship view,
readiness delivery, terminal certificate or Retry behavior.

Final restored verification used the configured Vitest runner with
`--no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`:
full `plan-export.test.ts` passed 73/73 (`/tmp/persisted-ui-review-fix-export-final.log`),
and the table/Gantt selection `-t 'explains
(dependency_calendar_missing|engine_unavailable)'` passed 4/4 with 396 explicitly
skipped (`/tmp/persisted-ui-review-fix-views-final.log`).
`bunx tsc --build --force apps/wbs/fe-01/tsconfig.json --pretty false` and scoped
ESLint on the five changed frontend files exited 0 with no output. Scoped
Prettier and `git diff --check` passed. No broader five-suite rerun, full frontend
Nx target, browser tests, build or host gate was run for this correction.

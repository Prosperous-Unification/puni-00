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

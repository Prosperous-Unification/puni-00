# Bounded structured-unavailability UI review

**Verdict: changes requested for this packet.** This review covers only `091ce60a8..12b0208a77640010ab07bbdc8af7a83f92777137` in `/tmp/puni-persisted-dependency-ui`. It does not approve full task 9.2, merge readiness, activation or deployment. No repository files were edited during review.

## Findings, ordered by severity

### P2 — The widened export contract still misidentifies both structured refusals as calendar overflow

Changed location: `apps/wbs/fe-01/src/components/wbs/plan-export-model.ts:217`, and the corresponding propagation in `plan-export-actions.ts:44`. Affected production writer: `plan-export.ts:198–204`.

`PlanExport.scheduleError` now accepts the exact `PlanRead` union, and `usePlanExportActions` passes the structured refusal through. However, the common CSV/Markdown header writer still branches only on `cycle`; everything else becomes “this plan extends beyond the supported calendar range.” Thus an undated prerequisite or unavailable optimized engine is correctly identified on screen but incorrectly described in a downloaded/shared plan. The ordinary CSV and Markdown toolbar actions remain available and reach this writer. Non-null guards do suppress forecast numbers, but do not make the explanatory metadata correct.

Fresh production-function reproduction, run from `apps/wbs/fe-01` with `bun -e` (exit 0), imported `planToCsv` and `planToMarkdown` from `./src/components/wbs/plan-export.ts` and used this complete empty-plan fixture:

```ts
const base = {
  projectName: 'Review plan',
  generatedAt: '2026-10-22T00:00:00.000Z',
  method: 'pert',
  startDate: '2026-10-22',
  steps: [],
  teams: [],
  tags: [],
  services: [],
  people: [],
  priorityBands: [],
  rows: [],
  slices: [],
};
for (const refusal of [
  {
    kind: 'dependency_calendar_missing',
    projects: [{ projectId: 'remote', abbreviation: 'PUNI', name: 'Remote plan' }],
  },
  {
    kind: 'engine_unavailable',
    engine: 'optimized',
    projects: ['remote'],
    reason: 'adapter_missing',
  },
]) {
  const plan = { ...base, scheduleError: refusal };
  console.log(
    planToCsv(plan)
      .split('\r\n')
      .filter((line) => line.startsWith('Schedule,')),
  );
  console.log(
    planToMarkdown(plan)
      .split('\n')
      .filter((line) => line.includes('Schedule')),
  );
}
```

For **both** input kinds, both formats produced the calendar-range explanation. Exact output is `/tmp/persisted-ui-review-export-repro.log`.

**Required correction:** handle the full union in the common export explanation, retain legacy cycle/range wording, and name the captured missing-calendar projects or engine refusal accurately. Add CSV and Markdown assertions for both structured kinds and engine reasons; prove the assertions fail with the old catch-all branch. Keep the unscheduled-number suppression intact.

### P2 — New user-facing reassurance promises external dependency inspection that the frontend cannot provide

Changed location: `apps/wbs/fe-01/src/components/wbs/schedule-unavailable-words.ts:10–14`.

All three new sentences promise “Dependencies and readiness remain inspectable.” For the external relationship that causes the missing-calendar refusal, that is not currently true in this frontend. `use-plan-read.ts:282` selects only `tree.value.typedDependencies`; no frontend consumer reads `connectedDependencies`. The rendered chip/editor label code still resolves endpoints against local rows (`typed-dependency-editor.ts:54–80`). The new mounted table fixture has no dependency at all (`dependsOn: []`), and its assertion checks only the “Add a dependency to 010” input. That proves the local editor remains available, not that the external relationship or its readiness evidence is inspectable.

The backend producer **does exist**: `workItemTree.connectedDependencies` is declared in `libs/wbs/domain/contracts/src/http/work-item-response.ts:230`, and `work-item.resource.ts:9036,9054` returns the captured projection even for unavailable schedules. The missing piece is frontend delivery/presentation/navigation, as the packet correctly documents. This finding does not require implementing that deferred scope now; it concerns the new promise shown to users today.

**Required correction:** remove or narrow the reassurance to behavior actually provided by this bounded packet (for example, that the plan remains editable), and test that wording. Alternatively, deliver and prove actual external relationship/readiness inspection, which is larger task 9.2 work. Do not treat the current empty-dependency fixture as proof of persisted remote inspection.

## Other review conclusions

- The shared `PlanRead['scheduleError']` type reaches `usePlanSchedule`, Gantt, toolbar and exports without an unchecked cast or union truncation. `usePlanSchedule` correctly returns dashes for every non-null refusal.
- The table and Gantt choose distinct missing-calendar, unavailable-engine and legacy range/cycle messages. Missing-calendar labels come from captured project abbreviation/name; React escapes their text. The Gantt early return suppresses even deliberately nonempty stale slices.
- Gantt memoization compares `scheduleError`; the table derives schedule, rows and chart from the same delivered tree. No new stale-read or local dependency regression was found in the reviewed changes.
- Arrange remains disabled for any non-null refusal, and Mermaid refuses any non-null schedule. The arrange button's explanatory hint still has no dedicated structured-refusal case; the visible table alert supplies the reason, so this is not an additional blocker here.
- Existing local dependencies/editor availability are retained. Persisted remote qualified labels, stable navigation, absent-row arrow suppression, boundary-infeasible certificates, retained Fast scope and terminal Retry suppression remain deferred. Task 9.2 must remain unchecked. Existing abbreviation behavior was not introduced by this packet.

## Proof audit and fresh checks

The implementer's `/tmp/persisted-ui-red.log` and `/tmp/persisted-ui-green.log` were read. Red records four intended failures: two missing table alerts and two chart statuses wrongly claiming calendar-range overflow. Green records four passes. These are credible mounted production-path red/green proofs for the newly added explanation branches; the stale-slice fixture also exercises the existing no-dates guard. They do not prove remote relationship inspection, export explanations or terminal Retry behavior. No mutation was applied by this read-only review.

Fresh checks at the exact reviewed HEAD:

- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json --pretty false`: passed, exit 0; `/tmp/persisted-ui-review-tsc.log`.
- Scoped ESLint on all nine changed frontend TypeScript/TSX files: passed, exit 0, no output/skipped-rule warning; `/tmp/persisted-ui-review-eslint.log`.
- `git diff --check 091ce60a8 12b0208a77640010ab07bbdc8af7a83f92777137`: passed, exit 0.
- Production CSV/Markdown reproduction above: passed execution, reproduced the defect; `/tmp/persisted-ui-review-export-repro.log`.
- Five-suite frontend Vitest regression: **545 passed, 6 failed**, exit 1, 246.41 seconds. All six failures explicitly report `Test timed out in 5000ms`, in pre-existing dependency/editor cases; `/tmp/persisted-ui-review-tests.log`.
- Targeted rerun of those six cases plus the four new structured-refusal cases with the repository Nx target's 30-second test/hook budget: **10 passed, 390 skipped**, exit 0, 30.58 seconds; `/tmp/persisted-ui-review-recheck.log`. The failures were not semantic assertions. This establishes fresh passes for all 551 cases across the two runs, not a single clean 551-test run under the default timeout.
- Final `git rev-parse HEAD` matched the reviewed commit, and `git status --short` was empty.

Exact Vitest commands, from `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run src/components/wbs/plan-dependencies.test.tsx src/components/wbs/gantt-panel.test.tsx src/components/wbs/plan-export.test.ts src/components/wbs/plan-toolbar.test.tsx src/components/wbs/plan-mermaid.test.ts --no-file-parallelism --maxWorkers=1
TZ=UTC bunx vitest run src/components/wbs/plan-dependencies.test.tsx src/components/wbs/gantt-panel.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 -t 'opens Customize for the highlighted result|keeps QA preselected|proposes the same QA step|wears no truncation fade|keeps clipped chips out|explains (dependency_calendar_missing|engine_unavailable)'
```

Not run: full frontend Nx target including zoned/module suites, browser/E2E, build, full repository lint/format, OpenSpec validation, secrets/migration checks, CI or either host gate. Existing evidence claims were not substituted for these checks. No merge, push or deployment was performed.

## Correction re-review — 7c6089ebd65d35e1edbe68ac7a89786b0efb123d

**Updated verdict: both P2 findings are resolved; the bounded correction packet is approved.** This supersedes the original changes-requested verdict only for the reviewed structured-unavailability UI/export packet. Full task 9.2 remains open; this is not merge, release, activation or deployment approval.

Scope was `12b0208a..7c6089ebd65d35e1edbe68ac7a89786b0efb123d`. The checkout was at that exact correction commit and clean. No source edits or mutations were made during this re-review.

- **P2 export explanation fixed:** the common CSV/Markdown header now handles `cycle`, `calendar_range` and the structured union separately. The structured branch uses `scheduleUnavailableWords`, retaining captured project labels and distinguishing both engine refusal reasons. Legacy cycle/range wording is unchanged. The six added tests call the real format writers and also check dash output without invented `day 0` forecasts.
- **P2 unsupported inspection reassurance fixed:** all three branches of the shared words function now state only the schedule refusal. Only the mounted editable table appends “The plan remains editable.” Gantt and export explanations carry neither an inspection promise nor an editability promise. Remote `connectedDependencies` delivery/navigation remains explicitly deferred; the backend producer is still correctly acknowledged.
- No new actionable finding was found in the correction diff.

The independent negative logs discriminate the two fixes:

- `/tmp/persisted-ui-export-negative.log`: six intended export assertions fail with the old range catch-all. Received CSV/Markdown output explicitly contains the incorrect calendar-range sentence; expected text names the captured missing-calendar project or the appropriate engine reason. These are semantic assertion failures, not collection errors or timeouts.
- `/tmp/persisted-ui-promise-negative.log`: both mounted table tests fail specifically at `.not.toHaveTextContent('readiness remain inspectable')`. Received content includes **both** the restored unsupported promise and the correct “The plan remains editable.” suffix. This proves the negative check detects the bad promise independently of the positive editability assertion.
- The initial red and restored green logs agree with the recorded progression. These logs were inspected, not regenerated by applying source mutations in this read-only re-review.

Fresh reviewer verification:

```sh
# From apps/wbs/fe-01
TZ=UTC bunx vitest run src/components/wbs/plan-export.test.ts src/components/wbs/plan-dependencies.test.tsx src/components/wbs/gantt-panel.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 -t 'structured schedule refusal exports|explains (dependency_calendar_missing|engine_unavailable)|says so when a cycle left'
```

Passed **11 tests**, with **462 explicitly skipped**, across three suites; exit 0 in 17.94 seconds. Log: `/tmp/persisted-ui-review-correction-tests.log`. This covers six structured export cases, four mounted table/Gantt cases and the legacy cycle export case.

A separate fresh Bun invocation of the production CSV and Markdown writers checked missing-calendar labels, both engine reasons, legacy cycle and legacy range (ten writer/case combinations). It asserted that structured outputs never claim range overflow and that no output promises inspection or editability. All assertions passed, exit 0; `/tmp/persisted-ui-review-correction-export.log`.

`git diff --check 12b0208a 7c6089ebd65d35e1edbe68ac7a89786b0efb123d` passed, and final `git status --short` was empty. Typecheck/lint and the full export suite are recorded by the implementer for this correction but were not independently rerun here. No broader five-suite run, full frontend Nx target, browser/E2E, build, CI or host gate was performed for this re-review.

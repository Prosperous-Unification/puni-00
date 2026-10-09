# Performance level target design

## Intent

Give the Performance level one isolated Nx target with an explicit empty-state refusal. A later real fixture must prove a measured threshold through Playwright; ordinary Browser passes cannot satisfy this level. There is no qualifying fixture today, so this design records an implementable contract without a passing Performance result.

## Candidate and authority

Keep `apps/wbs/fe-01/playwright.performance.cases.json` beside a dedicated `playwright.performance.config.ts`. The candidate-owned declaration uses schema version 1 and records the exact Playwright config path, project name, and an array of case records. Each case records a stable case ID, fixture path, full test title hierarchy, measurement name, enumerated unit, enumerated comparison operator and finite threshold. Several cases may share one fixture. Fixture paths are normalized and contained; case IDs and `(config, project, fixture, title hierarchy)` tuples are unique. A missing manifest is an error, while a valid empty case array is a named `no-cases` outcome. Missing, malformed or nonfinite thresholds are errors, never empty cases.

The existing external Burokrat `RulePolicy`, read outside the candidate through its stable
artifact boundary, gains an optional `performance` input. The registered Performance rule
requires that input in every mode, including observe; missing or unreadable policy is
unevaluated and disallowed. The input pins the declaration path, exact config path and content digest, exact
Playwright project, reviewed runner version, and exact `caseId → canonical case-record digest`
set. The digest covers the full fixture, title hierarchy, measurement, unit, operator and
threshold with an explicit schema/domain discriminator. The run evidence binds the full
candidate declaration digest. Candidate data cannot select the policy path, reviewer or
enforcement mode. The external policy digest is bound into each evaluation, so changing
policy invalidates earlier evidence even when the candidate is unchanged. No separate
Performance policy artifact is selected.

`libs/shared/domain/test-evidence` is a narrow Nx domain library tagged `product:shared`. It owns versioned declaration/evidence schemas, normalized identities, supported units/operators and pure threshold comparison. The frontend runner imports that public contract to collect evidence; Burokrat imports it to judge the same records. Burokrat alone owns trusted policy, authorization, currency and verdict. Neither side imports the other's application source.

## Collection and execution

The Nx target invokes one dynamic runner adapter, which removes its prior JUnit and companion manifest before collection. The adapter validates the candidate declaration and config identity, then runs `playwright test --list --reporter=json` for the exact config and project. It requires exit 0 and strictly validates the machine-readable output, including each fixture's normalized path and every case's full title hierarchy. It compares the discovered `(config, project, fixture, title hierarchy)` set with declared cases, refusing unknown, duplicate, ambiguous or missing cases. A valid empty declaration exits nonzero with `no-cases: no performance fixtures declare thresholds` without launching Playwright; it cannot leave a passing JUnit behind. A nonempty declaration with a zero-case Playwright list is a mismatch, not a passing empty suite. Discovery and execution use one immutable candidate checkout or detect any change in their inputs before accepting the run; a digest of a mutable checkout at one instant is insufficient. The adapter records the effective selection, CLI arguments, explicit selection-affecting environment values and actual runner version, omitting secrets.

Each case fixture records a finite measured observation in its declared unit through a narrow reporter channel. A plain Playwright pass with no observation is invalid. The adapter emits JUnit and a companion binding manifest containing the candidate snapshot identity, config and declaration digests, policy digest, project, exact collected case identities, measured observations, invocation identity, effective selection and report digest. It reconciles executed cases against discovery: a failed runner, failed/skipped/missing case or extra executed case cannot pass even when observations satisfy thresholds. The static Burokrat judge validates those bindings, rejects missing, duplicate, skipped or nonfinite observations, and independently recomputes every threshold comparison; it never trusts a fixture-supplied `comparisonOutcome`. Changing the candidate, config, declaration, policy or selected runner inputs invalidates older evidence. The classifier still assigns the whole fixture file to Performance only when it is a member of the declared Playwright suite and has at least one validated threshold case; case evidence does not split a file across levels.

## Proof order

1. A valid empty declaration clears a stale Performance JUnit, returns named `no-cases`, exits nonzero and does not start Playwright. Disable the early refusal and observe unrelated Browser discovery or a false pass.
2. Missing and malformed declarations, missing or nonfinite thresholds, duplicate/unknown/ambiguous cases, and candidate/config/project mismatch each fail distinctly through the Nx command.
3. A temporary synthetic fixture can prove the comparison path without becoming a repository obligation. Its observation must be finite, match its declared measurement and unit, and be independently compared by Burokrat. A skipped or duplicate observation, removed comparison or threshold violation makes a named production test fail.
4. A changed declaration, config, candidate, trusted policy or effective runner selection invalidates the previous report/manifest pair. Removing each binding check makes its negative fail. Mutate inputs between discovery and execution to prove the adapter detects the race.
5. Run a real qualifying reviewed fixture through the isolated target and read its JUnit plus manifest before claiming Task 2.1 Performance execution complete.

Temporary synthetic fixtures may prove items 3 and 4 in scratch repositories. They do not fulfill the operational item 5. No invented threshold is permitted to close the task.

## Implementation checkpoint

The candidate declaration, dedicated Playwright config, shared declaration decoder and
`wbs-fe-01:test:performance:level` adapter implement the empty/refusal boundary.
The target clears its prior JUnit and binding file, then distinguishes absent, unreadable,
malformed and invalid declarations. A valid empty declaration exits nonzero with the named
`no-cases` reason before any Playwright process starts. Nonempty discovery and execution
currently refuse explicitly; they cannot produce a passing report. Burokrat now has the
external `RulePolicy.performance` authority, pure comparison judge and a `check
--performance-evidence` JSON transport for synthetic production-path judge tests. That JSON
is caller supplied and unauthenticated: it is **not** proof of Playwright discovery, execution
or a human review. It cannot certify or close the Performance target. The runner-produced
binding manifest, validated collection/execution reconciliation and real fixture/run remain
to be built. The registered rule reports a valid empty declaration as `no-cases` and
disallows a missing declaration, including when the reviewed set is empty.

## Reviewed repository Performance case

The bounded repository case ID is `wbs-folded-mounted-cells`; its test title cites the
allocated scenario `[TEST-AXES-038]`: `apps/wbs/fe-01/e2e-performance/mounted-cells.perf.spec.ts` renders a
real WBS table seeded with 100 sparse rows and two steps, closes Gantt, folds estimates,
sets a 1400×900 viewport, verifies the server tree has exactly 100 logical rows and two
steps, and measures actual mounted table cells through the existing `renderingGeometry`
helper. It opens the first row's name editor and samples settled, nonempty geometry at
logical rows 0, 50 and 99; the editor row must remain mounted in the final sample. The
observation is the maximum of those three samples, with no threshold-based readiness wait.
The `folded-mounted-cells` observation is a count with comparison `lte 1200`.

The historical geometry budget is documented at [measured-rendering/verify.md:65](../../../openspec/changes/measured-rendering/verify.md#L65); its full-mount negative is at line 628. The 21-column derivation is the eight-step folded envelope: 30 intersecting rows, 12 overscan rows on each side, and a full editor row gives `(30 + 12 + 12 + 1) × 21 = 1155`, rounded to 1200. The proposed two-step, 100-row fixture previously measured 1500 cells when fully mounted. This supports a discriminating 1200 budget. The new exact candidate still must measure its actual maximum before any pass is claimed, and this single case does not prove full-scale rendering or latency.

The lifecycle and publication contract below is the sole definition of process ownership,
readiness, deadlines, diagnostics and current-evidence publication for this target.

### Lifecycle and publication contract

Reuse the ordinary Browser configuration's exact FE/BE/GW command, cwd, URL and environment
descriptors through a shared module. The Performance adapter starts those descriptors itself
after `tools/dev/setup.ts`, with `CI=1`, a validated non-default `E2E_PORT_SHIFT`, and no
server reuse. It refuses before admission if a selected port is occupied, preserving the
existing listener. After launch, it polls all three descriptor URLs for the ordinary config's
acceptable 2xx/3xx readiness semantics under a startup deadline; only after readiness does
the separate Playwright execution deadline begin.

Before launch, set and verify Linux `PR_SET_CHILD_SUBREAPER` and verify `pidfd_open` plus
`pidfd_send_signal`; refuse before launch if any is unavailable. Keep the adapter alive as
subreaper until cleanup finishes, stop launching new work before draining, and record every
service root with a pidfd and `/proc/<pid>/stat` start-time identity. Repeatedly enumerate
descendants and adopted children during shutdown, including separate-session children whose
intermediate wrapper exits immediately. Open pidfds and revalidate start-time plus
descendant/adopted ownership before signaling. Send SIGTERM through pidfds, discover and stop
new descendants during the bounded grace period, then send SIGKILL through the same validated
pidfds to remaining processes. Await direct Bun child exits and reap adopted children with
`waitpid` without stealing Bun-owned waits. Continue until every owned process exited and was
reaped and no live/adopted child remains. Any enumeration, identity, signal, reap or
convergence failure refuses publication. Verify owned shifted listeners are closed. Never
signal a foreign process; an unexpected foreign listener causes a named refusal.

Serialize invocations with one target lock held through cleanup and publication. A port
preflight or busy-lock refusal is not an admitted attempt. Once admitted, remove the old
`tmp/junit/wbs-fe-01.performance.current.json` pointer. Store immutable files under
`tmp/junit/performance/<invocation-id>/` (`discovery.json`, `run.json`, `evidence.json`,
`report.xml`, `manifest.json`, plus an optional `failure.json`). Failed threshold runs retain
their failing JUnit and observations in that bundle, but never publish a current-success
pointer. A passing run publishes the pointer by atomic rename only after cleanup and all
evidence checks succeed. The lock prevents an older run from publishing after newer admission.

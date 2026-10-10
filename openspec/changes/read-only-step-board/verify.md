# Tasks 1.1–1.2 — projection and mounted view

At the original tasks 1.1–1.2 checkpoint, those tasks were implemented while
project-page integration, browser proofs, full gate and integration remained pending. No API or wire contract changed.
The delivered workItems order and each delivered PlanRead.steps array order are
preserved. Card identity uses formatStepNodeId, independently of labels.

## TDD evidence

From apps/wbs/fe-01:

`TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts`

- Before production implementation: exit 1; typed empty-column scaffold produced
  seven assertion failures and one passing no-steps control. The exact all-Unknown
  fixture expected sn1.z-leaf.qa, sn1.z-leaf.dev, sn1.a-leaf.qa, sn1.a-leaf.dev;
  it received an empty array. Separate leaf/step duplicate tests each failed no-throw.
- After implementation: exit 0; eight tests passed.
- Reverse steps in a second projection: exact per-leaf reversed IDs are asserted,
  retaining identity. Mixed progress checks literal arrays: Unknown 2, In progress 1,
  Done 1, preserving the separate server-derived row status.

## R5 watched faults

Each mutation ran individually through the real projector with the same Vitest
command plus `-t <test name>`, then the original source was restored. Every mutation
exited 1 with one assertion failure and seven skipped tests. Adjacent Proof comments
name these watched faults and tests; the local transcript is
`.superpowers/sdd/tasks/task-1-mutations.log`.

| Fault                                          | Observed assertion                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bypass malformed-progress union check          | rejects malformed progress instead of treating it as Unknown: expected function to throw                                        |
| Bypass absent-step membership                  | rejects progress naming a step absent from this delivered tree: expected function to throw                                      |
| Bypass identity membership with duplicate leaf | rejects duplicate card identities from repeated leaf IDs: expected function to throw                                            |
| Bypass identity membership with duplicate step | rejects duplicate card identities from repeated step IDs: expected function to throw                                            |
| Reverse workItems traversal                    | preserves delivered leaf and step order independently of IDs and numbers: received sn1.a-leaf.qa first instead of sn1.z-leaf.qa |
| Reverse steps traversal                        | same order test: received sn1.z-leaf.dev first instead of sn1.z-leaf.qa                                                         |
| Bypass parent exclusion                        | literal mixed projection gained extra sn1.parent.qa and sn1.parent.dev cards                                                    |

## Focused verification

- `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts src/test-tiers.test.ts`: exit 0, 14 tests passed in two files.
- `bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`: exit 0.
- `bunx eslint apps/wbs/fe-01/src/components/board/step-board.ts apps/wbs/fe-01/src/components/board/step-board.test.ts apps/wbs/fe-01/vitest.node-suites.ts`: exit 0 after building Nx graph.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/board-projection-graph.json`: exit 0, JSON graph emitted; avoids sandbox-denied sockets and provides the lint rule graph.
- Scoped Prettier and git diff checks are rerun before the candidate commit.

The first lint run lacked a cached graph and found the static union made runtime
fault guards appear redundant. The final guard explicitly reads stored progress
as unknown at the delivered-store fault boundary; Object.hasOwn distinguishes
legitimate absence before column mapping. No union widening or eslint suppression.
Vitest prints the existing native-config warning for extensionless imports and __dirname.

## Task 1.2 mounted-view checkpoint

The mounted view reads `ProjectRuntime.plan` with `useSyncExternalStore` and projects
only `tree.value`. It renders loading, first-read failure, empty work, missing
steps, retained cards with an explicit stale warning and cause, Retry through
`reread(['tree'])`, and disconnection. Separate steps delivered ahead of a tree
do not alter cards; invalid delivered progress reaches `AppFaultBoundary`.

From `apps/wbs/fe-01`,
`TZ=UTC bunx vitest run src/components/board/step-board-view.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=dot`:

- Initial behavior RED: exit 1, six mounted cases failed against the typed empty
  view scaffold. First assertion expected `Loading board…` and found none.
- Initial GREEN: exit 0, six cases passed. Two more cases cover literal column
  order/counts/status and a stale-only feed publication; latest exit 0, 8/8.
- Review correction RED: the retained-card case expected “Showing the last
  delivered board; it may be out of date.”; the alert contained only the
  engine-unavailable cause and Retry. After adding the retained-tree sentence,
  all eight passed, and removing that sentence failed the same assertion.
  First-read failure still shows its cause without retained-board wording.

R5 mutations each ran alone with the mounted Vitest command and `-t` matching
the named case, exited 1 with one failure and seven skipped, and were restored.
Raw local logs are at `/tmp/board-mounted-view-r5/` in the reviewed worktree
session. The adjacent `Proof:` comments name each fault and case.

| Fault/log                                                                                | Observed failure                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `hybrid-steps-mutation.log`: replace tree steps with separately delivered steps          | QA disappeared when Development arrived before the newer tree. |
| `invalid-progress-mutation.log`: bypass projector malformed-progress throw               | No visible app-fault alert; an Unknown card appeared.          |
| `stale-wording-red.log`, `stale-wording-mutation.log`: omit retained-tree stale sentence | Alert contained cause and Retry but no explicit stale wording. |
| `initial-failure-mutation.log`: suppress tree failure warning                            | No first-read alert.                                           |
| `stale-resource-mutation.log`: ignore staleResources                                     | No alert on stale-only publication.                            |
| `failure-cause-mutation.log`: substitute generic text                                    | Engine refusal absent from first-read alert.                   |
| `retry-resource-mutation.log`: reread steps                                              | Called with `['steps']`, expected `['tree']`.                  |
| `retain-stale-cards-mutation.log`: drop board on stale read                              | Retained Build card vanished.                                  |
| `disconnection-mutation.log`: suppress warning                                           | No reconnecting status.                                        |
| `empty-project-mutation.log`: suppress empty-work branch                                 | No “No work items” text.                                       |
| `no-project-steps-mutation.log`: suppress no-steps branch                                | No “No project steps” text.                                    |

Latest focused checks: mounted view 8/8; node projection 8/8; scoped Prettier
pass; strict pinned OpenSpec validation valid (1/1); Nx `wbs-fe-01:typecheck`
(including module dependency), `wbs-fe-01:lint`, and `wbs-fe-01:build` all exit 0.
Nx reported that sandbox socket isolation was unavailable and ran its targets
in-process with explicit successful target summaries. Astra independently reran
the mounted 8/8 and inspected mandatory fault logs, with no remaining findings.
This is a task 1.2 checkpoint, not overall change acceptance.

## Pending and unavailable

During task 1.1, `openspec validate read-only-step-board --strict --json`
could not run locally: exit 127, openspec command missing.

Subsequent targeted validation succeeded with the pinned CLI:
`OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate read-only-step-board --strict --json`:
exit 0; 1 passed, 0 failed, valid true, no issues.
Astra's task 1.1 review found no Important or Critical issues; the Minor
validation-evidence gap was closed with the pinned CLI result above.

Full OpenSpec validation remains pending in the coordinator's canonical
exact-SHA h2puni gate, along with full format/test/lint/typecheck/build and exact-head CI.
The task 1.1-only skip list is superseded by the task 1.2 focused checks above.
Project-page/router regression, browser tests, the 500-leaf fixture measurement,
full node/conformance suites and exact-SHA gate remain pending under later tasks.
This artifact does not claim overall board acceptance.

## Task 2.1 draft-suspension planning amendment — proofs pending

Planning starts from the reviewed task 1.2 local checkpoint `14bf46132` on the
isolated `plan/board-draft-suspension` branch. This amendment changes only the
existing intent/glossary/spec/design/task/evidence artifacts. Task 1.2 acceptance
above is unchanged; task 2.1 and all later tasks remain unchecked.

Read-only inspection found `CellInput` blur invokes `LiveField.leave()`, which
submits a changed value, while `LiveField.sync()` protects an unsent edit only
while its node is focused. Hiding/inerting Plan also leaves its window-level
undo/redo listener active. These are source findings, not observed task 2.1 REDs.
The PM adopted an opt-in runtime-owned suspension boundary to fulfill the already
planned no-write/draft-preservation behavior. The glossary term is **Suspended
unsent draft**, distinct from an in-flight or refused edit.

All task 2.1 implementation evidence remains pending:

| Planned production-path fault                                           | Required observed failure                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Permit switch-related leave/flush                                       | Pointer or keyboard handoff submits an unsent draft.                                  |
| Remove suspended sync protection                                        | Peer delivery overwrites suspended text or its baseline.                              |
| Release hold on return before refocus                                   | A delivery overwrites the returned but unfocused draft.                               |
| Drop same-identity remount retention                                    | Column/renderer remount loses the suspended edit.                                     |
| Remove deletion/runtime cleanup                                         | A removed identity or replacement runtime inherits the old draft.                     |
| Bypass hidden keyboard guard                                            | Board keys issue undo/redo or open hidden Plan controls.                              |
| Inject Board setStatus through the existing frontend PlanCommands route | A Board interaction causes a forbidden command; no frontend setProgress route exists. |
| Bypass current-runtime guard                                            | An old-project completion draws after withdrawal.                                     |

Run focused mounted page/router/Board and field/keyboard/draft regression suites,
node projector tests, affected frontend lint/typecheck/build, scoped formatting
and OpenSpec validation. Task 2.2 adds real-browser focus/blur verification; task
3.2 retains the canonical exact-SHA gate and current-head CI. No task 2.1 test,
mutation, browser run, full gate or publication is claimed by this amendment.

Planning validation for this amendment:

- `openspec validate read-only-step-board --strict --json`: exit 0, 1/1 passed.
- `openspec validate --all --json`: exit 0, 148/148 passed.
- `openspec validate --all --strict --json`: exit 1, 142/148 passed; all 130
  changes passed. The six unchanged canonical specs `dev-deploy`,
  `live-plan-snapshot`, `plan-command-registry`, `plan-import`, `saved-plans` and
  `scheduler-optimization` retain placeholder Purpose warnings promoted to
  failures by strict mode. This amendment changes no canonical spec.
- Scoped Prettier and `git diff --check`: passed. Intent: 253 words.
- Local validation outputs: `/tmp/board-draft-design-targeted.json`,
  `/tmp/board-draft-design-all.json`, `/tmp/board-draft-design-all-strict.json`.

No product tests were rerun for this planning-only commit. Implementation proofs
and the live/browser/full-gate obligations above remain pending.

## Task 2.1 local implementation checkpoint — historical pre-review record

The selected `ProjectRuntime` now owns one Plan/Board choice and one Plan
interaction scope. Plan is initial, its table remains mounted while hidden and
inert on Board, and Board reads that same runtime. Focusing the selector
suspends an unsent field before blur can submit it. The hold survives later
peer trees and same-identity face remounts, but is removed by authoritative
row/step deletion or runtime withdrawal. Returning to Plan alone neither
submits nor releases the hold; refocusing the field resumes ordinary editing.
Issued commands retain their existing acknowledgement/refusal path. Hidden Plan
shortcuts, dialogs, and the saved-plan shelf are inactive on Board.

Initial REDs: `/tmp/board-page-pointer-focus-red.log` recorded an actual
`patchWorkItem('w1', {name: 'Draft build'})` before the Board click;
`/tmp/board-livefield-suspend-red.log` showed the missing field suspension.
The hidden-key RED `/tmp/board21-hidden-key-red.log` issued undo on Board,
and the dialog/shelf REDs are `/tmp/board21-dialog-red.log`,
`/tmp/board21-dialog-return-red.log`, and `/tmp/board21-shelf-red.log`.
Focused GREEN checkpoints include `/tmp/board-page-handoff-green.log`,
`/tmp/board-page-peer-draft-test.log`, `/tmp/board21-inflight-ack-test.log`,
`/tmp/board21-inflight-refusal-test.log`, `/tmp/board21-one-feed-test.log`,
`/tmp/board21-old-tree-test.log`, `/tmp/board21-step-remount-test.log`,
`/tmp/board21-responsive-remount-test.log`, `/tmp/board21-row-delete-restore-green.log`,
`/tmp/board21-step-deletion-test.log`, and `/tmp/board21-phone-portal-test.log`.

Each fault below was injected independently in the production path, watched
fail with focused Vitest, and restored. Adjacent `Proof:` comments identify
the guards and watched cases. The logs preserve commands and assertion output.

| Fault and log                                                                         | Observed negative                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit selector-focus suspension, `/tmp/board21-fault-focus-suspend.log`                | Keyboard focus submitted a draft; expected no writes.                                                                                                                                                                               |
| Omit suspended leave guard, `/tmp/board21-fault-leave-alone.log`                      | Pointer focus submitted `Draft build`; expected no writes.                                                                                                                                                                          |
| Omit suspended sync guard, `/tmp/board21-fault-sync.log`                              | Direct `LiveField` test received `Peer` instead of `Draft`, including its original baseline.                                                                                                                                        |
| Release on Plan return, `/tmp/board21-fault-return-release.log`                       | Subsequent peer delivery replaced `Draft build` with `Peer two`.                                                                                                                                                                    |
| Omit same-identity restoration, `/tmp/board21-fault-remount.log`                      | Step-face remount showed `Build` instead of the draft.                                                                                                                                                                              |
| Omit row pruning, `/tmp/board21-fault-prune.log`                                      | Deleted row's old textarea reappeared with its held draft.                                                                                                                                                                          |
| Omit step pruning, `/tmp/board21-fault-step-prune.log`                                | A removed step retained the original `LiveField` identity.                                                                                                                                                                          |
| Share scope across runtimes and omit disposal, `/tmp/board21-fault-runtime-scope.log` | New project showed `Only p2 draft` where its own `Build` value belonged.                                                                                                                                                            |
| Bypass hidden keyboard guard, `/tmp/board21-fault-hidden-key.log`                     | Board Ctrl/Cmd+Z called undo.                                                                                                                                                                                                       |
| Inject `setStatus` on Board interaction, `/tmp/board21-setstatus-fault.log`           | Board no-command assertion failed on the actual `PlanCommands` → `ProjectApi.setStatus` route. The frontend has no `setProgress` route, so no API was added.                                                                        |
| Bypass existing current-runtime guard, `/tmp/board21-fault-current-owner.log`         | Runtime property test reported a withdrawn reader changing its delivered plan. The separate mounted old-project Board test passes because its stores remain isolated; that mounted case alone does not prove the lower-level guard. |
| Omit issued-command exclusion, `/tmp/board21-fault-issued-guard.log`                  | `suspendUnsent()` returned true for an already issued edit, rather than false.                                                                                                                                                      |

Fresh affected mounted command from `apps/wbs/fe-01`:
`TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx src/components/wbs/live-editing.test.tsx src/components/wbs/project-replacement.test.tsx src/components/wbs/plan-read-and-write.test.tsx src/components/board/step-board-view.test.tsx src/app-router.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=dot`:
exit 0, six files and 230 tests passed (`/tmp/board21-focused-final.log`).
The run emitted existing React `act` warnings in older picker tests; no test
failed. From the repository root, the following all exited 0 with visible
target summaries: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-fe-01:lint --skip-nx-cache --outputStyle=static`, the corresponding
`wbs-fe-01:typecheck` and `wbs-fe-01:build` targets
(`/tmp/board21-final-{lint,typecheck,build}.log`). Scoped `bunx prettier
--check` passed (`/tmp/board21-final-format.log`), and pinned strict targeted
OpenSpec validation passed 1/1 (`/tmp/board21-final-openspec.log`).

At that checkpoint, task 2.1 remained unchecked pending independent diff/proof review. Real-browser
focus, blur, Tab and drag verification belongs to task 2.2; the canonical
exact-SHA h2puni gate and current-head CI belong to task 3.2. No full gate,
browser run, publication, or overall board acceptance is claimed here.

### Task 2.1 pointer-cancel draft continuation

The selector's `pointerdown` can suspend a dirty field without moving focus or
activating Board. If the pointer is then cancelled, another keystroke in the
same focused field has no new focus event to release the hold. The mounted
Plan/Board test reproduces this path, delivers a peer tree, checks that the
newest draft remains visible, and confirms ordinary blur sends exactly that
newest text once. No command is sent before blur.

`TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx -t 'keeps typing after a cancelled Board pointer' --no-file-parallelism --maxWorkers=1`
from `apps/wbs/fe-01` failed before the fix: `Draft one` replaced `Draft two`
after the peer tree (`/tmp/board-pointercancel-red.log`). Resuming the field
when a Plan-active box receives actual input made the same command pass
(`/tmp/board-pointercancel-green.log`). Removing only that resume call made it
fail again with the same observed stale text
(`/tmp/board-pointercancel-mutation.log`); the restored source has an adjacent
`Proof:` comment.

The six-file mounted Board/field/router regression command listed above passed
231 tests after this change (`/tmp/board-pointercancel-focused-final.log`).
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/nx-board-pointercancel bunx nx run-many -t lint,typecheck,build -p wbs-fe-01 --skip-nx-cache --outputStyle=static`
passed all affected targets (`/tmp/board-pointercancel-targets.log`). The
mounted run emitted React `act` warnings in existing cases; no test failed.
Independent Astra review cleared the task 2.1 implementation and the pointer-cancel
follow-up on 2026-10-06. Task 2.1 is now checked; 2.2 browser acceptance,
3.1 final review and 3.2 exact-head gate remain pending.

### Task 2.2 authenticated Chromium acceptance — historical review checkpoint

`bun run tools/dev/setup.ts` exited 0 (`/tmp/board22-setup.log`). With the
coordinator's reserved `E2E_PORT_SHIFT=1900`, Bun bind probes found be/gw/fe
ports 5000/5100/6100 free before Playwright started its own CI servers. All
fixtures created disposable local-dev projects through the authenticated
browser's generated HTTP shapes; progress setup happened before the watched
Board interval. No shared or hosted data was used.

From the worktree root, the exact command
`CI=1 E2E_PORT_SHIFT=1900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts step-board.spec.ts --project=chromium`
exited 0 after the independent-review amendments: six Chromium cases passed
in 47.0 seconds (`/tmp/board22-browser-astra-final.log`). It verified delivered Unknown /
In progress / Done order and counts 2/1/1, leaf numbers/names/step names and
the separate row statuses, selected Plan/Board state, drag/undo/redo/help/view
changes without a mutation request, synthetic `pointercancel` followed by real
Chromium typing/click, clean-selector Tab / Shift+Tab / Enter / Space navigation,
and direct selector focus with a dirty field. The suspended name survived a
same-field server rename plus a later bystander delivery, then committed once
on ordinary leave. A 390px renderer remount preserved the next held draft
without another write. It
also observed first-read loading, typed failure and Retry, retained cards on a
later peer-triggered failed refresh and Retry, and a late old-project read
released and awaited through `route.fulfill` after a project switch without
old cards or draft in the new runtime.
The disconnection case takes Chromium offline, closes **all active page `/ws`
sockets**, and asserts the Board's visible `Reconnecting` status alongside its
last delivered cards. This is a broad page outage; it does not identify one
specific feed socket. A prior fixture that closed only the last observed socket
intermittently left the selected Plan feed online (failed full runs
`/tmp/board22-browser-full1.log` and `/tmp/board22-browser-full2.log`).

The dirty keyboard traversal is intentionally bounded. In a real Chromium
focus-order probe, Board was tabbable position 6 and `Name of 010` position 59;
Shift+Tab from that dirty name landed on `Unfold QA estimates`, an intermediate
Plan control, and ordinary blur sent a second `/commands` POST. The observed
focus target, intervening controls and write are in
`/tmp/board22-keyboard-focus-order-map.log`. This is not a dirty selector
handoff. Browser tests exercise actual clean-selector Tab/Shift+Tab/Enter/Space
and label the dirty direct-focus seam as programmatic; mounted tests protect
the corresponding focus-before-activation suspension. No tab-order, shortcut
or general blur behavior was changed.

The first independent review found that a bystander-only peer edit did not
stress the held field and that releasing the old route was not a completion
witness. The amended browser test now commits a peer rename of the held row,
commits a later bystander rename, waits until Board shows both server values,
and still finds the local held text before refocus. The old-project route marks
completion only after `route.fulfill` resolves; the test awaits that mark before
checking the new project's cards and draft. The targeted amended cases passed
2/2 (`/tmp/board22-astra-review-fixes2.log`). An intermediate native dirty
Shift+Tab probe failed as expected on the QA control and ordinary write
(`/tmp/board22-astra-review-fixes1.log`); it is not counted as a successful
dirty keyboard handoff.

The desktop and 390px screenshots, exact card/column geometry, 2500-card
screenshot and raw measurement are preserved at
`/tmp/board22-artifacts-astra-final/step-board-{desktop.png,390.png,geometry.json,500x5.png,500x5.json}`.
The geometry JSON records desktop column left edges 16, 477.328125,
938.65625 and mobile top edges 181, 319, 421; every recorded card has
`scrollWidth === clientWidth`, and every column right edge is inside its
viewport. The final measurement JSON reports 500 leaves × five steps = 2500
rendered cards, 8923 ms fixture setup, and 1027.864 ms from Board click through
all cards and two animation frames. It records Chromium 153.0.8010.12,
Linux/x64, 1400×900, local SHA `5db3680a7fd556877d05724938c01402a6d8443a`
and the then-dirty test and three OpenSpec files. This is one local observation,
not an SLA.

Two independent production-path faults were watched in Chromium and restored;
the new test has adjacent `Proof:` comments. Blanking `card.title` in
`step-board-view.tsx` failed the ordered mixed-board case on missing
`Review the second task` (`/tmp/board22-r5-card-title.log`). Suppressing the
Board's `!connected` warning failed the outage case on missing `Reconnecting`
(`/tmp/board22-r5-disconnect-warning.log`). The first attempt at the browser
cases also exposed fixture errors rather than product defects: an invalid
progress command order, an unescaped project-name regex, a mistaken assumption
that a project switch keeps Board selected, and an offline-only probe that did
not close the established socket. Each was corrected before the final run;
intermediate terminal logs remain under `/tmp/board22-browser-*.log`.

Fresh focused checks after restoration: node Board projection 8/8
(`/tmp/board22-node-final.log`); six mounted Board/field/project/router files
231/231 (`/tmp/board22-mounted-final.log`, with existing React `act` warnings);
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/nx-board22-final bunx nx run-many -t lint,typecheck,build -p wbs-fe-01 --skip-nx-cache --outputStyle=static`
exited 0 for all affected FE targets (`/tmp/board22-targets-final.log`). The
initial target run failed only on an ESLint `no-confusing-void-expression` in
the new double-animation-frame measurement callback; braces fixed it before
the passing target run. Scoped new-file ESLint, e2e TypeScript, Prettier and
`git diff --check` also exited 0. Task 2.2 is checked; task 3.1 independent
review and the task 3.2 exact-SHA host gate remain pending. No push, merge,
gate, or publication occurred. Strict targeted OpenSpec validation with
`bunx @fission-ai/openspec@1.12.0 validate read-only-step-board --strict --json`
passed 1/1 (`/tmp/board22-openspec-scoped.log`). The first bare
`bunx openspec` invocation could not determine a package executable; the
versioned package command supplied the required validation.

After the independent-review amendments, the exact Chromium command above
passed 6/6 (`/tmp/board22-browser-astra-final.log`), and its five final
artifacts were copied before another Playwright run could clear them. The
affected `wbs-fe-01:lint` Nx target passed without cache
(`/tmp/board22-review-lint.log`); e2e TypeScript, scoped Prettier,
`git diff --check`, and strict targeted OpenSpec 1/1 also passed
(`/tmp/board22-review-{e2e-typecheck,format,openspec}.log`). Product code did
not change during task 2.2. The earlier 231/231 mounted, 8/8 node, FE
typecheck/build and two watched browser faults remain applicable; an
at that historical checkpoint an independent follow-up review was pending before any commit.
The amended browser slice was subsequently committed as
`fa39a39e944575cfeb2179c5c90a2e3818d8d6a9`. Astra reviewed the runtime source at
that exact SHA without a defect or architecture mismatch; this is source review,
not a new acceptance-run claim. Final task 3.1 review remains separate below.

## Task 3.1 consolidated local acceptance — exact review pending

Starting worktree `.worktrees/board-page-view`, branch `feat/board-page-view`,
clean exact HEAD `fa39a39e944575cfeb2179c5c90a2e3818d8d6a9`. This slice changes
only this evidence ledger. The complete board/draft-suspension diff, callers,
projection, per-runtime scope, field sync/leave/restoration and issued-command
paths, hidden keyboard/portal guards and browser completion witnesses were reviewed
against the accepted spec/design. Ordinary Plan blur, estimate drafts and native
traversal through intervening controls retain their existing behavior. No safety
behavior changed, so existing individual watched mutations were inspected rather
than reinjected. Astra separately reviewed the runtime at the starting exact SHA
with no defect or architecture mismatch; final evidence-commit review is pending.

All commands below were fresh on the starting exact runtime bytes. Vitest commands
ran from `apps/wbs/fe-01`; browser and Nx commands ran from the worktree root.

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fresh terminal evidence                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts src/test-tiers.test.ts`                                                                                                                                                                                                                                                                                                                                        | Exit 0, two files, 14/14 tests (`/tmp/board31-node-final.log`)                                                              |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/estimate-draft.test.ts`                                                                                                                                                                                                                                                                                                                                                             | Exit 0, 26/26 tests (`/tmp/board31-estimate-final.log`)                                                                     |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/runtime/project-runtime.model.test.ts`                                                                                                                                                                                                                                                                                                                                                             | Exit 0, 1/1 property test (`/tmp/board31-runtime-model-final.log`)                                                          |
| `TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx src/components/wbs/live-editing.test.tsx src/components/wbs/project-replacement.test.tsx src/components/wbs/plan-read-and-write.test.tsx src/components/wbs/plan-cells.test.tsx src/components/wbs/plan-keyboard.test.tsx src/components/board/step-board-view.test.tsx src/app-router.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=dot` | Exit 0, all eight files, 473/473 tests in 214.42 seconds (`/tmp/board31-mounted-final.log`)                                 |
| `CI=1 E2E_PORT_SHIFT=2400 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts step-board.spec.ts --project=chromium`                                                                                                                                                                                                                                                                                                                            | Exit 0, 6/6 Chromium cases, 1.1 minutes (`/tmp/board31-browser-final.log`)                                                  |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/nx-board31 bunx nx run-many -t lint,typecheck,build -p wbs-fe-01 --skip-nx-cache --outputStyle=static`                                                                                                                                                                                                                                                                                           | Exit 0; FE lint/typecheck/build and module dependency explicitly executed, cache skipped (`/tmp/board31-targets-final.log`) |
| `bunx tsc --noEmit -p apps/wbs/fe-01/tsconfig.e2e.json`                                                                                                                                                                                                                                                                                                                                                                                                       | Exit 0 (`/tmp/board31-e2e-typecheck-final.log`)                                                                             |

The coordinator knew no competing reservation for shift 2400. Before harness
startup, actual Bun bind probes reported ports 5500, 5600 and 6600 free
(`/tmp/board31-port-probes.log`). Playwright created its own authenticated
disposable projects and database. Dev setup reported existing local env files
left intact (`/tmp/board31-setup.log`); no credential contents were logged.
The mounted run emitted existing React `act` warnings, Vitest emitted its existing
native-config warning, and the intentional browser socket outage emitted Vite
proxy EPIPE warnings. All named commands above reached passing terminal summaries.

Astra's complete hard-negative checklist maps to these real production paths:

| Contract / hard negative                                                                 | Fresh assertion coverage and retained watched fault                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivered order, leaves × steps, identity and valid progress                             | Pure projection/tier suite; original seven projection faults. Its raw transcript remains in `.worktrees/board-projection/.superpowers/sdd/tasks/task-1-mutations.log` and was inspected.                                                                                                                                               |
| Tree-owned steps; malformed progress reaches Error Boundary                              | Mounted Board cases plus inspected `hybrid-steps-mutation.log` and `invalid-progress-mutation.log` under `/tmp/board-mounted-view-r5/`.                                                                                                                                                                                                |
| Distinct first loading/failure/empty/no-steps; stale cards, disconnection and Retry      | Mounted Board and Chromium failure/outage cases; all eleven mounted-view mutation logs and two browser faults were inspected, retaining their exact earlier failure claims.                                                                                                                                                            |
| No Board status/PlanCommands/undo/redo/help/drag writes; hidden portals inactive         | Mounted project-page, keyboard and Chromium watched-request interval; retained hidden-key and real `setStatus` route faults. No frontend `setProgress` route is invented.                                                                                                                                                              |
| Dirty pointer/direct selector focus suppresses flush, including focus without activation | Real mounted focus/blur and Chromium pointer/direct-focus cases; retained selector-focus and leave-guard faults.                                                                                                                                                                                                                       |
| Peer delivery preserves typed text and original baseline through unfocused return        | Mounted same-field peer updates before and after return, direct `LiveField` submission asserting literal `['Draft', 'Original']`, Chromium same-field and later bystander delivery; retained sync/return-release faults.                                                                                                               |
| Surviving step/responsive face remount restores draft                                    | Mounted step/remount and responsive cases plus Chromium 390px change; retained restoration fault.                                                                                                                                                                                                                                      |
| Row and step deletion discard holds                                                      | Mounted authoritative row deletion/restore and field step-prune tests; retained separate row/step pruning faults.                                                                                                                                                                                                                      |
| Runtime withdrawal isolates drafts and late old answers                                  | Mounted withdrawal/replacement/router and Chromium `route.fulfill` completion witness; retained shared-scope/runtime fault and fresh runtime property suite. The mounted isolated-store old-project test alone does not break the lower current-runtime guard; `/tmp/board21-fault-current-owner.log` is its precise watched evidence. |
| Already issued acknowledgment/refusal stays distinct from unsent hold                    | Mounted page/field acknowledgment/refusal and issued-exclusion cases; retained issued-command guard fault.                                                                                                                                                                                                                             |
| Pointer cancellation followed by more typing                                             | Mounted and Chromium newest-draft case; retained pointercancel resume mutation.                                                                                                                                                                                                                                                        |
| Native keyboard selection and ordinary Plan blur                                         | Chromium clean-selector Tab/Shift+Tab/Enter/Space and mounted keyboard/cell regressions. Direct dirty selector focus is programmatic; native traversal through intervening Plan controls remains ordinary commit-on-blur, not a dirty handoff claim.                                                                                   |
| Desktop/390 text/geometry and full large fixture                                         | All six Chromium cases; exact geometry and 2500-card count below.                                                                                                                                                                                                                                                                      |

Mandatory historical projection, mounted, draft-suspension, pointercancel and
browser mutation logs were present and inspected; no fault remains in source.
Restored paths passed the fresh suites above. Their original commands, failures
and caveats remain in the earlier tables rather than being relabeled as new REDs.

Five fresh browser artifacts were copied before any subsequent harness run could
clear them: `/tmp/board31-artifacts/step-board-{desktop.png,390.png,geometry.json,500x5.png,500x5.json}`.
Desktop column left edges are 16, 477.328125 and 938.65625; mobile column top
edges are 181, 319 and 421. Every recorded card has equal scroll/client widths,
and every column right edge lies within its viewport. The raw large-fixture
measurement records clean starting SHA `fa39a39e944575cfeb2179c5c90a2e3818d8d6a9`,
Chromium 153.0.8010.12, Linux/x64, 1400×900, 500 leaves × five steps = 2500 cards,
10143 ms setup and 889.876801 ms click-through-render/two-frame paint. This is one
local observation, not an SLA.

Final scoped `bunx prettier --check` passed 23 paths: the paths changed since
`f49cef02a` plus the projection source/test, node-tier registration and ADR 0035
(`/tmp/board31-format-final.log`). Pinned `bunx @fission-ai/openspec@1.12.0 validate read-only-step-board --strict --json`
passed 1/1, and `validate --all --json` passed 148/148
(`/tmp/board31-openspec-{strict,all}-final.json`). `git diff --check` exited 0.
Only this ledger differs from the starting SHA; implementation and other worktrees
remain untouched.

Task 3.1 stays unchecked until Astra reviews the exact final evidence SHA.
Task 3.2 exact-SHA canonical h2puni gate, exact-head CI and coordinator integration
remain open. WBS acceptance was not changed. No push, gate, PR, merge, richer
step status or Backlog cutover is claimed.

## 2026-10-10 wrapping regression and integration preparation

Started from clean `feat/board-page-view` at
`48e1f76a341010b0c50a97f8adb0e85f76b2f399` in the existing isolated
`.worktrees/board-page-view`; the preparation branch is
`fix/read-only-step-board-wrapping`. The existing selected-runtime implementation,
its OpenSpec scope and historical fault evidence were inspected. No newer WBS
frontend changes were present on the then-current `origin/main` (`a3b1526bd`).
Unrelated user files and other worktrees were preserved.

A public-API-seeded Chromium regression exposed a violation of the existing
no-clipping requirement: an unbroken 390-character work-item title overflowed a
405px card to a 2970px scroll width. The fixture also adds a 96-character unbroken
step name. The failed assertion was the production card's
`scrollWidth <= clientWidth + 1`, recorded in `/tmp/board-wrapping-red.log`.
The first sandboxed browser attempt could not bind a local listener (`EPERM`);
the watched failure came from the subsequent approved run with local listeners
and Chromium available. It was a layout assertion failure, not a fixture failure.

The sole production change applies `overflow-wrap:anywhere` to each card, letting
all its text labels wrap inside the existing columns. An adjacent `Proof:` names
the watched negative. The regression checks column viewport bounds and card
scroll widths at 1400px and 390px. It uses the existing authenticated disposable
project fixture and public step-create boundary; no new behavior or spec scope
was introduced.

Fresh checks on these runtime bytes (Vitest from `apps/wbs/fe-01`, others from the
worktree root):

- `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/board/step-board.test.ts src/test-tiers.test.ts`: exit 0, 14/14 tests (`/tmp/board-prep-node.log`).
- `TZ=UTC bunx vitest run src/components/board/step-board-view.test.tsx src/components/wbs/project-page.test.tsx src/app-router.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000 --reporter=dot`: exit 0, 115/115 tests (`/tmp/board-prep-mounted.log`; this run began before the CSS fix).
- `TZ=UTC bunx vitest run src/components/board/step-board-view.test.tsx --no-file-parallelism --maxWorkers=1 --reporter=dot`: exit 0, 8/8 tests after the CSS fix (`/tmp/board-wrapping-mounted-final.log`).
- `CI=1 E2E_PORT_SHIFT=2400 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts apps/wbs/fe-01/e2e/step-board.spec.ts --project chromium`: exit 0, 7/7 cases, 57.7 seconds (`/tmp/board-wrapping-green.log`). Existing Vite configuration and socket shutdown warnings remain in the terminal output.
- `bunx tsc -p apps/wbs/fe-01/tsconfig.e2e.json --noEmit`: exit 0 (`/tmp/board-wrapping-e2e-typecheck.log`).
- `bunx @fission-ai/openspec@1.12.0 validate read-only-step-board --strict --json`: exit 0, 1/1 valid (`/tmp/board-wrapping-openspec.json`).

Task 3.1 remains unchecked pending independent Astra review of the committed
candidate. Task 3.2 remains unchecked pending the coordinator's post-Spaces
composition, canonical exact-SHA h2puni gate and exact-head CI. This local evidence
makes no claim about those future composed bytes, push, PR, merge, richer step
status or Backlog cutover.

The affected FE command
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/nx-board-wrap bunx nx run-many -t lint,typecheck,build -p wbs-fe-01 --skip-nx-cache --outputStyle=static`
completed with exit 0 for all three targets and their module typecheck dependency
(`/tmp/board-wrapping-targets.log`). Scoped Prettier on the three changed paths
and `git diff --check` also exited 0. Full canonical checks remain with the
coordinator as stated above.

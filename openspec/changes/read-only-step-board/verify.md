# Tasks 1.1–1.2 — projection and mounted view

Tasks 1.1 and 1.2 are implemented. Project-page integration, browser proofs,
full gate and integration remain pending. No API or wire contract changed.
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

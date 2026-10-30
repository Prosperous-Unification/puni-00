# Task 5.2 bounded successor schedule-date browser closure

Base `cb6585dd6`, isolated branch `proof/task52-date-refresh`. This closes the
bounded browser date witness identified by the audit. Parent task 5.2 remains
unchecked for review, remaining writer breadth and the exact-SHA host gate.

## Writer → capture → fingerprint → receipt

| Boundary             | Production path                                                                                                                 | Acceptance evidence                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Estimate writer      | Mounted `POST /api/projects/:id/commands`, `setEstimate` binding in core `module/plan-commands/command-bindings.ts`             | HTTP 200 after DatedA changes 1 → 3 workdays; A has no open browser                                                  |
| Borrowed capture     | Command composition's before/after fanout capture, store `readDependencyFanoutIn`                                               | Independent DatedA → DatedB → DatedC FS node relationships, no assignments or shared people                          |
| Semantic fingerprint | `fanout-capture.ts`: `scheduleInputHash(scheduleInputOfCaptured(captured))`; `compareDependencyFanout`; `recordCommittedFanout` | Removing only this captured scheduling hash prevents the covering GET; watched fault below                           |
| Committed delivery   | Existing event log, gateway admission and production `plan-feed.resource.ts` `owner.invalidate`                                 | Each successor receives one `elsewhere_changed` frame, one covering authoritative GET and a newer installed sequence |
| Displayed projection | Production ProjectPage and its delivered PlanTree, start/finish columns                                                         | Literal `[data-start]` / `[data-finish]` text, independent of expected values derived from HTTP payloads             |

The fixture seeds independent projects with start date 2026-09-07 and one
one-day estimate each. B initially displays **8 Sep / 8 Sep**, C **9 Sep / 9 Sep**.
A's three-day estimate must move B to **10 Sep / 10 Sep** and C to
**11 Sep / 11 Sep**. B's covering GET is held after its real response is captured:
B retains both old dates and its old installed sequence, while C installs its new
dates. Releasing B installs both new displayed dates and its newer sequence.
The complete relationship projection remains identical, including the two stable
UUIDs. Only B/C are opened by this case.

Disconnected and foreign socket silence remains covered by the existing completion
browser case in this same configured target; this new case does not independently
establish silence for the estimate writer. The prior
[isolated writer packet](verify-task-5.2-isolated-fanout.md),
[step writer packet](verify-step-fanout.md), and
[hold writer packet](verify-hold-fanout.md) retain their individual scope and limits.
This packet does not replace those proofs with a blanket writer-coverage claim.

## Watched independent faults

Each production file is restored in `finally` before the next mutation. No
production modification is retained.

- Captured scheduling hash: replace only
  `scheduleInputHash(scheduleInputOfCaptured(captured))` in the dependency
  fingerprint with a constant. The new browser assertion fails because no
  covering GET is captured: expected true, received false.
- Socket refresh: replace only `owner.invalidate({ resources: resourcesFor(changed), seq })`
  in the live `onChange` arm with a resolved promise. The browser likewise fails
  the covering-GET assertion despite real socket admission.
- Retained displayed tree: allow `nextDelivery` to deliver a tree only while
  `applied.tree === 0`, retaining the initial displayed tree after newer reads.
  The literal C start assertion must fail with old **9 Sep** instead of **11 Sep**.

All three independent faults exited 1. Exact source substitutions are in
[mutations](evidence/task-5.2-closure/mutations.json); observed receipts are
[captured hash](evidence/task-5.2-closure/captured-hash-negative.log),
[socket invalidation](evidence/task-5.2-closure/socket-invalidation-negative.log),
and [retained tree](evidence/task-5.2-closure/retained-tree-negative.log).
The retained-tree run also logged a response-read cancellation while closing the
held request after the targeted date assertion failed. The literal 11 Sep versus
9 Sep failure is independently present in that same receipt. A first mutation
runner stopped before its third edit because a source match also included a
comment; the retained receipts rerun all faults with the final bounded predicate.

## Verification and limits

All Nx commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and
`--skip-nx-cache`. Existing locked dependencies are linked, with no install.
Browser runs use the localhost-capable execution boundary. Initial test request
setup used the wrong organization-expectation header and received a modeled 409;
the final mounted request uses `X-WBS-Expected-Organization: org-a`.
The initial application typecheck caught an optional baseline sequence in the
new test (`TS2345`); explicitly requiring the initial authoritative read resolved
it. The final receipt below records both application typechecks passing.

- `bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache`: exit 0,
  **6 passed in 56.9 seconds**, including the pre-existing completion/replay and
  four desktop/phone scope cases. [Configured browser receipt](evidence/task-5.2-closure/browser-final.log).
- `bunx nx run-many --targets=typecheck --projects=wbs-fe-01,wbs-be-01 --parallel=1 --skip-nx-cache`:
  exit 0, both applications and module prerequisites, 20.4 seconds.
  [Typecheck receipt](evidence/task-5.2-closure/frontend-backend-typecheck.log).
- File-scoped ESLint: exit 0, no diagnostics.
  [Lint receipt](evidence/task-5.2-closure/scoped-lint.log).
- Changed TypeScript and closure-document Prettier check and `git diff --check`:
  exit 0 after normalizing the three retained Playwright failure logs to LF
  and removing trailing horizontal whitespace. The test outcomes and diagnostic
  text were preserved. Commit hooks additionally check all staged file formats.
- `bunx openspec validate --all --json`: exit 0, **274 passed / 0 failed**;
  existing informational warnings remain.
  [Summary](evidence/task-5.2-closure/openspec-summary.json).

No production omission was established, so no production change is retained.
No push, merge, deployment, activation, full build, full lint or exact-SHA host
gate was run. These are local browser and scoped static checks, not release
acceptance. Shared disk constrained artifacts; no dependency install or broad
build artifacts were created.

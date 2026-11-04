# Current-authority merge integration, 2026-10-23

Runtime merge resolutions retain current authenticated principals, undo/redo admission,
execution prerequisites, import composition and browser lifecycle. Coordinator expiry owns
its specific transaction operation: fresh lifecycle ownership, scoped fan-out capture,
NO_ADMISSION, raw dependency context with no endpoint authority, closed Working plan and
dependency capabilities, durable recipient records inside the writer and delivery afterward.
Only a nonzero release supplies the addressed cause; unchanged captures alone omit claims.

The mounted integration fixture takes a resource-backed claim through HTTP on the first
eligible workflow step. Historical external component reads use the existing synthetic
dependency authority helper; this does not prove production dependency activation or enable
mounted external authoring. Its chain has two connected recipients and one unconnected plan.

## Fresh checks

- `bun test apps/wbs/be-01/src/controller/claim-lease.controller.db.test.ts libs/wbs/application/core/src/module/plan-commands/claim-lease-sweep.test.ts apps/wbs/be-01/src/controller/claim-lease-integration.controller.db.test.ts libs/wbs/application/core/src/compose.test.ts`: 36 pass, zero failures, 111 assertions. Includes eight integration cases, absent-project silence, exact optimizer invalidations and explicit denial of dependency endpoint evidence.
- `bun test libs/wbs/adapters/store-sqlite/src/claim-lease.db.test.ts libs/wbs/adapters/store-sqlite/src/claim-lease-race.db.test.ts`: 13 pass, zero failures, 2840 assertions, including the 80-run generated lifecycle/race model. Storage fixtures now provide explicit principals and the neighboring storage-only `localCommandAccess`; they preserve the prior machine/upstream credential pin evidence and claim only the eligible first workflow step.
- `bun test apps/wbs/be-01/src/boot.db.test.ts`: 38 pass, zero failures, 90 assertions with permission for ephemeral local listeners. The first sandbox run refused listeners with EPERM; its failures were environmental and the complete rerun passed.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0. First sandbox attempt could not write generated outputs; rerun with worktree write permission passed.
- Final `bunx tsc --build --force apps/wbs/be-01/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json libs/wbs/application/core/tsconfig.json libs/wbs/application/conformance/tsconfig.json`: exit 0, empty diagnostics. No further fixture expansions were needed for `CommandAdmission`.
- Focused ESLint over the runtime resolutions, mounted lease tests and the two SQLite lease fixtures: exit 0 after correcting test matcher style and migrating the public graph's dependency context/project-create union handling.
- `git diff --check` over assigned runtime files: exit 0. Full-file merge review retained file tails and combined both parents' changes; no index mutation was performed by this worker.

## Watched production-path faults

Each injected fault changed only the real `commandTransaction` implementation, ran the
selected mounted integration negative, and restored the original implementation in `finally`.

| Injected fault                                   | Observed failure                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Skip required lifecycle owner refusal            | Missing capture and missing owner each reached the throwing write factory; 2 selected failures.                                       |
| Skip missing committed delivery prewrite refusal | Missing-delivery negative reached the throwing write factory; 1 selected failure.                                                     |
| Remove initial lifecycle observation assertion   | Escaped lifecycle operation returned borrowed `read snapshot is closed` instead of the command observation error; 1 selected failure. |
| Omit the nonzero release's addressed cause       | Claim was released but both required connected recipient rows disappeared; 1 selected failure.                                        |

Adjacent `Proof:` comments identify these checks. The unmutated integration suite also
verifies that revoking the claimant account's membership does not invoke human admission,
optimizer reactions include both recipients, repeated zero release writes no history/events,
a second-recipient insert fault rolls back claims/occupancy/history/event sequences, held
transport permits an independent SQLite writer, and retained capabilities refuse after close.

No host gate, Docker, deployment, push or production action was performed by this worker.
The repository-wide host gate remains the root task's responsibility.

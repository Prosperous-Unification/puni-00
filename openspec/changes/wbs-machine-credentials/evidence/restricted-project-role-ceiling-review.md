# Bounded machine/consent role-cap review

Reviewed commit: `db67e5ece99e2ffc5faec75d11e437d5bfd083b9`.
Base: `ba129970fddf0d1d2f2419bc38459485b3d80d54`.
Review date: 2026-10-22. Source tree: `/tmp/puni-machine-role-cap-fix`.

**Verdict: approve the bounded P1 recovery-ceiling repair. No introduced P0, P1, P2 or P3 findings identified. This is not approval of the complete integration or a merge-readiness assertion.**

## Findings and scope

No actionable findings in the reviewed diff. I read AGENTS.md, LLM_README.md, the machine-credential specification and verification record, all changed production call sites, relevant callers and tests. No source was edited.

`ORGANIZATION_ROLES` is ordered `super_admin`, `admin`, `member`, `viewer`; choosing the role with the greater index correctly intersects stored authority with the authenticated ceiling. Stored roles still pass their existing validators before intersection. Missing membership continues to refuse, malformed stored roles continue to throw, and fresh demotion can only reduce authority. Ordinary human super-admin recovery remains possible because its authenticated ceiling is still super-admin.

The ceiling reaches command batch/undo/redo admission, step and calendar-marker recovery, transactional project edits, saved-plan save/rename/delete, optimizer Retry, and borrowed project/step/import admission. Retry checks authority before eligibility and slot/audit writes. Saved-plan refusals roll back before writing; command and dependent-write refusals retain their existing unit-of-work rollback. Machine and consent authentication both obtain the existing member-at-most ceiling; ordinary OAuth/human sessions retain their normal role. The unchanged rank/mode-switch borrowed membership checks are preceded by service checks that refuse a capped member, so they do not provide the reviewed recovery bypass.

## Fresh verification

- Machine controller and real MCP OAuth boot suites: **48 passed, 0 failed**, 179 assertions. Covers restricted-project refusals, saved-plan save/touch, ordinary and creator writes, person pinning, and the ordinary human session. Log: `/tmp/role-cap-review-mounted.log`.
- Human command/project/saved-plan organization suites and SQLite organization-audit suite: **73 passed, 0 failed**, 429 assertions. Includes human super-admin recovery and membership revocation. Log: `/tmp/role-cap-review-human.log`.
- SQLite saved-plan organization, fanout-capture and optimizer repository suites: **35 passed**. The initial combined invocation also attempted the machine suite, whose setup failed because sandbox sockets were unavailable; that suite was rerun successfully with approved local socket access above. Log: `/tmp/role-cap-review-focused.log`.
- The three resource-command/resource-schedule/assignee-calendar suites: **15 passed, 3 failed** on both the repair and an unchanged checkout of the exact base. All failures concern existing prerequisite behavior. Logs: `/tmp/role-cap-review-core.log`, `/tmp/role-cap-review-baseline.log`.
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.lib.json`: the same two errors on repair and base, at `person-load.feature.ts:432` and `space.resource.ts:405`, involving scheduling error unions. SQLite spec typechecking reports those same two errors. No ceiling-related diagnostics appeared. Logs: `/tmp/role-cap-review-typecheck.log`, `/tmp/role-cap-review-baseline-types.log`, `/tmp/role-cap-review-store-types.log`.
- ESLint freshly reproduces the 10 lazy-loaded-core/static-import errors in five changed files. Their flagged core imports are unchanged from the base, independently compared against `git show`; the existing dynamic import responsible for the graph classification is outside this diff. These are baseline integration lint failures, not introduced role-cap errors. Log: `/tmp/role-cap-review-lint.log`.

The first mounted test attempts failed with sandbox `EPERM: listen`, followed by teardown errors because server setup never completed. Approved socket-enabled reruns passed. An initial typecheck command named a nonexistent `tsconfig.app.json`; it was corrected to the actual `tsconfig.lib.json`. Two all-changed-file ESLint wrapper attempts exited 1 without diagnostics; the explicit five-file rerun with Nx daemon/plugin isolation disabled produced the 10 errors described above. The remaining changed files were not freshly lint-verified by this review. None of those initial attempts is counted as a successful check.

## Watched-negative evidence

I inspected the retained fault logs against the production checks and their adjacent `Proof:` comments; I did not mutate source during this review.

- `/tmp/puni-role-cap-proof-red.log`: returning stored authority unchanged caused machine batch/step/marker/saved-plan negatives to admit, undo/redo to reach replay handling, capped saved-plan storage to write, and capped Retry to answer `not-retryable` instead of `forbidden`.
- `/tmp/puni-role-cap-fanout-proof-red.log`: removing the borrowed ceilings caused all four restricted-project/viewer-project/viewer-step/viewer-import negatives to admit.
- `/tmp/puni-role-cap-consent-proof-red.log`: the complete ordered real MCP OAuth suite failed its consent restricted-project recovery assertion under the cap fault; 15 other tests passed.

This supports the recorded R5 proofs. Fresh unmutated test runs above establish the restored behavior; mutation runs were inspected evidence, not independently repeated experiments.

## Remaining limits

The full host gate, full build, CI secrets/migration checks, browser/live acceptance and the entire integration were not run in this review. Typechecking and lint are not green because of the baseline issues above. No broader readiness claim follows from this bounded approval.

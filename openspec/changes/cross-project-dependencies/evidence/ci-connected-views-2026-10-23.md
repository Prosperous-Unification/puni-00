# Connected-view CI failure triage — 2026-10-23

Scope: the old PR run `39882705993` at pushed head `e86fdfb10`, from
“shared live projection” onward. Reproduction used an isolated shared clone at
`3fbdf7928`; the primary workspace was not edited. No task 7.3 implementation,
production behavior, safety check, architecture or activation contract changed.

The old run lists 31 failures in this scope. Commit `a7259d72b` already repaired
the mounted fixture by seeding dependency authority, using a browser consumer
entrypoint resolved from the test module, and aligning optimizer cases with the
implemented connected optimizer behavior. The old two optimized refusal cases
and two load/Space “connected_optimization_not_supported” cases therefore do not
have identical current test names. The entire current mounted suite passes;
this establishes current behavior, not a rerun of the historical checkout.
The historical failure listing and failed-job output were inspected from
`/tmp/puni-ci-backend-old-failures.txt` and
`/tmp/puni-ci-39882705993-failed.log`; that output does not establish every old
failure's individual root cause.

The eight remaining current failures all came from four exact comparison
expectations that omitted required `left` and `right` summaries. The existing
[saved-plan delta](../specs/saved-plans/spec.md) requires side summaries even
for an empty diff. These pre-input9 fixture captures correctly have
`legacy-unknown` provenance. Expectations now retain strict whole-response
equality and explicitly check saved/current source identities, availability,
absence reason or algorithm ID, provenance, and the empty diff. The tests keep
their schedule and solver-table preservation assertions.

## Commands and observations

Run from `apps/wbs/be-01` unless otherwise stated:

- Before repair: `bun test ./src/controller/cross-project-live.controller.db.test.ts ./src/controller/schedule-organization.controller.db.test.ts --timeout=10000`
  exited 1: 85 pass, 8 fail, 474 assertions across 93 cases. Every failure was
  additional required comparison side metadata; log `/tmp/puni-connected-current.log`.
- After repair: the same command exited 0: 93 pass, 0 fail, 500 assertions;
  log `/tmp/puni-connected-fixed.log`.
- Final helper naming rerun: `bun test ./src/controller/schedule-organization.controller.db.test.ts --test-name-pattern 'installed saved capture|stores shared S4|stores the selected ready|stores selected' --timeout=10000`
  exited 0: 8 pass, 0 fail, 61 assertions, 64 filtered;
  log `/tmp/puni-connected-eight.log`.
- Root command `bunx eslint apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts`
  exited 0 but reported that module-boundary enforcement was skipped because a
  cached Nx project graph was unavailable.
- Root configured target `NX_DAEMON=false bunx nx run wbs-be-01:lint` exited 0,
  uncached, with “Successfully ran target lint for project wbs-be-01”. Nx
  reported denied plugin-worker sockets and ran plugins in the main process;
  the target emitted no skipped module-boundary warning. Log
  `/tmp/puni-connected-lint.log`.
- Root command `bunx prettier --check apps/wbs/be-01/src/controller/schedule-organization.controller.db.test.ts`
  exited 0; `git diff --check` exited 0.

No new or changed safety check needs an R5 fault here: the change only restores
strict fixture expectations to the existing response contract. Existing mounted
negative cases ran unchanged. The full host gate, backend typecheck/build,
whole-repository checks and historical-head execution are not claimed by this
bounded triage.

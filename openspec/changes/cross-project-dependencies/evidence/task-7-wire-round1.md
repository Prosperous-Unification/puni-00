# Solver correction checkpoint and pending re-review

The original wire checkpoint `05a5b85d5` now has correction commit
`388fb5410fe1198282a105c83e4c263dbaaf284d` in its isolated worktree. Neither
is integrated into the feature branch. Root verified all nine source hashes
before and after the normal-hook commit. The unrelated lookup shape change
was excluded. Tool Wiki reported inactive/uncertified.

[Author report](task-7-wire-round1-proofs/puni-connected-solver-wire-round1-report.md.txt),
[source manifest](task-7-wire-round1-proofs/puni-connected-solver-wire-round1-sha256.txt)
and [byte-preserved proof artifacts](task-7-wire-round1-proofs/) capture the
checkpoint. `SHA256SUMS` hashes the retained bytes. Test source is stored as
`.ts.txt` to avoid accidental test collection.

## Reported restored checks

The Sol author reports configured Python **276 tests**, contracts **516 tests**,
contracts typecheck/lint, isolated installed solver setup with golden feasible
request, and installed CLI **3 tests / 36 assertions** passing. Exact commands
and output are retained; these are focused checks, not a full backend or host
gate. Independent Astra re-review is still running.

The corrections separate objective question hashes, validate complete requests
before terminal classification, reject nonfinite and unrepresentable numeric
evidence, classify invalid feasible witnesses as CLI exit 64, and add effective
foreign-owner and active-boundary UNKNOWN checks. The author recorded watched
assertion failures for the guards, including nine malformed cross-field cases.

A final audit found that `math.isfinite` itself overflows on a 401-digit JSON
integer. Root's first precommit hash check detected the reopened source before
any Git mutation. After safe-range comparison was moved first, the configured
Python and rebuilt installed CLI checks passed. The failing and restored
outputs are preserved rather than treating the first freeze as final.

## New bundled-runtime defect

Astra re-review found that `validate-connected-solver-request.ts` reads
`../solver-wire.v5.json` using `import.meta.url` during module initialization.
The backend's configured Bun build bundles the import but does not copy that
relative schema asset. Its explicit asset copy only includes public email policy.

The reviewer bundled an existing local `revalidateSolverResult` import with
`--target=bun`. Root independently executed the generated artifact twice.
Execution exits **1** with **ENOENT** for `solver-wire.v5.json` before any solver
call. The small source and exact root output are retained here. This is a
confirmed bundled-artifact defect, not a full backend build or deploy test.
The current Dockerfile copies source libraries and runs `src/main.ts`; this
probe does not establish that the source-run image is broken. The compiled
bundle itself is temporary and is not committed.

The source remains frozen while Astra finishes all original findings and
mutation audits. The final review verdict and next correction belong in a
subsequent record; this checkpoint is not approved. Required backend active
wire/version fixture reconciliation, runtime publication/cache integration,
full task 7 completion, exact-SHA gate and deployment remain open.

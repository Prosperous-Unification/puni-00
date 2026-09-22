# Verification

## Slice 1

- `git rev-parse HEAD`: exit 0; `b3b3ab6a066783861955e491eccab42158a3b1b4`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 42 files passed and 614 tests passed (`slice1-step0-unit.log`).
- OpenSpec baseline: exit 0; 112 items passed and 0 failed (`slice1-step0-openspec.json`).
- `openspec new change adopt-frontend-lifetimes --schema sdd-lean`: exit 0; created the change with only `.openspec.yaml`, whose schema is `sdd-lean` (`slice1-openspec-new.log`).
- OpenSpec validation after creation: exit 0; 113 items passed and 0 failed, one more than the baseline; `adopt-frontend-lifetimes` was valid with no issues (`slice1-openspec-after.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`: exit 0; all matched files used Prettier code style (`slice1-prettier-check.log`).

## Slice 2

- `git rev-parse HEAD`: exit 0; `38fc228dcc1b41fb67874ee2bfe945bfadc67dd5`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 42 files passed and 614 tests passed (`slice2-step0-unit.log`).
- Runtime skeleton red: exit 1; 2 files failed and all 25 tests failed on `Error: the lifetime slot is not implemented` (`slice2-red.log`).
- Runtime suites after implementation: exit 0; 2 files passed and 25 tests passed (`slice2-green-runtime.log`).
- Sandbox unit tier after implementation: exit 0; 44 files passed and 639 tests passed, exactly F0 + 2 and T0 + 25 (`slice2-green-unit.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck`: exit 0; Nx successfully ran the target (`slice2-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-fe-01:lint`: exit 0; Nx successfully ran the target (`slice2-lint.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write` on the five slice-owned paths: exit 0; every path was unchanged (`slice2-prettier-write.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --check` on the five slice-owned paths: exit 0; all matched files used Prettier code style (`slice2-prettier-check.log`).
- `NX_DAEMON=false bun run format:check --all`: exit 0 (`slice2-format-check.log`).

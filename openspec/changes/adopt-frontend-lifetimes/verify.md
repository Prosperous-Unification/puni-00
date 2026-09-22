# Verification

## Slice 1

- `git rev-parse HEAD`: exit 0; `b3b3ab6a066783861955e491eccab42158a3b1b4`.
- `git status --short --untracked-files=all`: exit 0; no paths before the slice.
- Sandbox unit baseline: exit 0; 42 files passed and 614 tests passed (`slice1-step0-unit.log`).
- OpenSpec baseline: exit 0; 112 items passed and 0 failed (`slice1-step0-openspec.json`).
- `openspec new change adopt-frontend-lifetimes --schema sdd-lean`: exit 0; created the change with only `.openspec.yaml`, whose schema is `sdd-lean` (`slice1-openspec-new.log`).
- OpenSpec validation after creation: exit 0; 113 items passed and 0 failed, one more than the baseline; `adopt-frontend-lifetimes` was valid with no issues (`slice1-openspec-after.json`).
- `GSETTINGS_BACKEND=memory bunx prettier --check openspec/changes/adopt-frontend-lifetimes`: exit 0; all matched files used Prettier code style (`slice1-prettier-check.log`).

# Verification

The execution slices append observed commands, statuses and proof evidence here. Evidence names are relative to each attempt's evidence directory.

## Slice 1 — 2026-09-26

- `git status --short --untracked-files=all`: status 0, no entries before applying the patch.
- `bun -e "import p from 'di-bag/package.json'; console.log(p.version)"`: status 0, `0.5.0`.
- Strict OpenSpec baseline: status 0, 117 passed, 0 failed; `openspec-validation-baseline.dD7uth.json`.
- `git apply --check` and `git apply` on `slice1.patch`: status 0 for each.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json`: status 0; 118 items passed, 0 failed (106 changes and 12 specs).
- Validation reports: `openspec-validation-slice1.fxCB9R.json`, `openspec-validation-final.Uj9q3X.json` (each 118 passed, 0 failed).
- Scoped Prettier write: status 0, all six files unchanged; scoped check twice: status 0 both times, `All matched files use Prettier code style!`.
- `NX_DAEMON=false bunx nx format:check --all`: status 0; `format-check.log`.

## Slice 2 — 2026-09-26

- Base `29a6ed86810c946099eba07500086cb87ff773ec` was clean. Installed `di-bag` printed `0.5.0`; the focused label and pin files had 25 pass, 0 fail. Strict OpenSpec baseline: 118 passed, 0 failed; `openspec-baseline.c8nTiV.json`.
- `git apply --check` and `git apply` on `slice2.patch`, excluding this verification file: status 0 each.
- `env -u CLAUDECODE -u AGENT bun install --frozen-lockfile`: status 0, `+ di-bag@0.5.1`, `1 package installed`. The manifest and lock both pin 0.5.1; `bun -e` printed `0.5.1`. The other two owner package pins stayed at 0.7.0 and 13.0.0.
- Installed declarations expose `Module.moduleLabel`, `GraphSnapshot.moduleInstallations`, `installationId`, `parentInstallationId` and binding `moduleInstallationId`. `runtime-probe.log`: status 0; an unlabelled wrapper had an `undefined` getter and parent, a labelled child and renamed view retained `inner/label`, two empty repeated installations had distinct IDs, a slash key joined to the child by installation ID, and `Reflect.set` returned false without changing the getter.
- Focused label, pin and Capacity files: 30 pass, 0 fail. `NX_DAEMON=false bunx nx run tool-devsync:lint --skip-nx-cache`: status 0 (`lint.log`). Matching typecheck: status 0 (`typecheck.log`).
- F1 forged private key: the old checker passed 1/0 (`F1-old.log`); the getter check failed 0/1 with `moduleLabel undefined, expected application.capacity` (`F1.patch`, `F1-new.log`); comparison disabled passed 1/0 (`F1-twin.patch`, `F1-twin.log`); `cp`/`cmp` restoration and rerun passed 1/0 (`F1-restored.log`).
- F2 labelled child in unlabelled wrapper: old checker passed 1/0 (`F2-old.log`); getter check failed 0/1 with `moduleLabel undefined, expected application.capacity` (`F2.patch`, `F2-new.log`); comparison disabled passed 1/0 (`F2-twin.patch`, `F2-twin.log`); `cp`/`cmp` restoration and rerun passed 1/0 (`F2-restored.log`).
- P1 manifest reverted to 0.5.0: exact-pin test failed 0/1 with expected 0.5.1 and received 0.5.0 (`P1.patch`, `P1-new.log`); expectation changed to 0.5.0 passed 1/0 (`P1-twin.patch`, `P1-twin.log`); `cp`/`cmp` restoration and rerun passed 1/0 (`P1-restored.log`).
- Exporting Capacity's `capacityOptions` as well as `capacity` left the getter label test passing 1/0 (`exported-capacity-options.patch`, `exported-capacity-options.log`); `cp`/`cmp` restoration and rerun passed 1/0 (`exported-restored.log`). Capacity's own five tests passed on unmodified source.
- Final focused files: 30 pass, 0 fail (`focused-final.log`). Final lint and typecheck: status 0 (`lint-final.log`, `typecheck-final.log`). `tool-devsync:build --skip-nx-cache`: status 0 (`build.log`).
- Scoped Prettier write including `bun.lock` exited 2 because no parser could be inferred for that lockfile; the eight supported owned files were unchanged. Scoped write excluding the lockfile exited 0; scoped check twice exited 0, `All matched files use Prettier code style!`. `NX_DAEMON=false bunx nx format:check --all`: status 0 (`format-check.log`).
- Strict final OpenSpec validation: status 0, 118 passed, 0 failed, 106 changes and 12 specs (`openspec-final.RQpBMH.json`).

Planner-only checks pending after the slice commit: whole `tool-devsync:test`, committed index check and host gate. Whole frontend targets remain planner-only if selected by the gate.

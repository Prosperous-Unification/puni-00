# Verification Report

**Change**: `migrate-di-bag`

Each slice of packet 140.3 appends its own entry below: the attempt, its starting hash, its
baselines, every command's status, the red and green counts, every fault observed, and what stayed
pending planner verification.

## Packet 140.3, slice 1 — intent and delta spec

Observed 2026-09-26 in attempt `140-3-di-bag-migration.1.20260925T211941Z`, starting at
`0ba59e0df5ff246358f6fc27467c14a3c557175e`.

- Starting tree: `git rev-parse HEAD` matched the reviewed base; `git status --porcelain
--untracked-files=all` was empty (`base.txt`, `status-before.txt`; status 0).
- Packet extraction: seven code patches, 169 fault patches; `bash -n` on the fault-loop helper
  passed (status 0). No fault was injected in this documentation slice.
- Strict OpenSpec baseline: 115 items passed, zero failed (`openspec-base-totals.txt`; status 0).
- `new change migrate-di-bag --schema sdd-lean` created the change; the metadata says
  `schema: sdd-lean` and `created: 2026-09-26` (status 0).
- Section 7.1 `git apply --check` and `git apply` both exited 0.
- Strict OpenSpec validation after the spec: 116 items passed, zero failed, and
  `migrate-di-bag` was valid (`openspec-s1-totals.txt`; status 0).
- Prettier write and check over the five owned paths exited 0; the check printed
  `All matched files use Prettier code style!`. The owned-path hand-over diff was empty
  (`status-after.txt`, `status-paths.txt`, `owned-sorted.txt`; status 0).
- `NX_DAEMON=false bunx nx format:check --all` exited 0 (`format-check.log`).

Pending planner verification: the whole `tool-devsync:test` target and committed index check
write Git objects; the host gate needs h2puni. The code, model, browser, lint, typecheck and build
checks belong to later slices after the package move; no code changed in this slice.

## Packet 140.3, slice 2 — codemod, pin and residual

Observed 2026-09-26 in attempt `140-3-di-bag-migration.2.20260925T212943Z`, starting at
`cc142fda225d2f48ec8c6436e82fbc1bb90f7471`.

- Starting tree: reviewed hash matched and `status-before.txt` was empty (status 0). Packet
  extraction produced seven code patches and 169 fault patches; strict OpenSpec baseline was
  116 passed, zero failed (`openspec-base-totals.txt`; status 0).
- Installed baseline: `di-bag` was 0.4.0. Focused devsync, core and backend suites passed
  25, 626 and 36 tests; frontend passed 25 files and 222 tests. Four project typechecks passed
  (`base-*.log`; all status 0).
- Registry metadata matched the four expected lines in `registry.txt`: `di-bag` latest 0.5.0,
  `di-bag-codemod` latest 0.1.0, and `di-bag` 0.5.0 declared no dependency, peer dependency or
  engine (status 0).
- The eight codemod passes matched `codemod-summary.txt`: 45/434/31, 0/0/29, 11/113/35,
  0/0/35, 18/149/22, 0/0/8, 2/11/11 and 1/2/0 (files/rewrites/manual items). All 77 touched
  paths were plain modifications; their sorted path hash was
  `900a70bbaf29c7a62721a11c29eaa082c73cc0c5d896e5ba2e0b9dcc32471590` (status 0).
- Section 7.2 applied; `bun install --frozen-lockfile` exited 0 and installed `di-bag` 0.5.0
  (`install.log`, `di-bag-after.txt`). Prettier over the 77 codemod paths and section 7.3 applied
  (status 0).
- Red checkpoint: devsync/core/backend passed 25/626/36 (`red-*.log`; status 0); frontend
  failed 14 files and 94 tests, with 42 `DI_BAG_INVALID_ARGUMENT: invalid close options` lines
  (`red-frontend.log`; status 1). Typecheck failed on seven distinct TS2345 locations, all in
  `application-runtime.ts`, its test, `project-runtime.ts` and `session-runtime.ts`
  (`red-typecheck.errors.txt`; status 1). This is the slice's observed negative before the
  production translation.
- Section 7.4 applied. The 82 owned paths equalled `owned-expected.txt`; their content hash was
  `858e7d973fdbdc3fac6823dd87184e68a7b221d7b32bd8da3e22e3f6e1460244`
  (`tree-hash.txt`; status 0).
- Green checkpoint: devsync/core/backend again passed 25/626/36, frontend passed 25 files and
  224 tests; four project typechecks, four project lints and the frontend module typecheck
  passed (`green-*.log`; all status 0). The Bun probe printed all eleven expected `ok` lines,
  and TypeScript 7.0.2 and 6.0.3 compiled it silently (`probe-*.log`; all status 0).
- The build command succeeded for three projects and four dependent tasks (`green-build.log`;
  status 0). Strict OpenSpec validation stayed at 116 passed, zero failed
  (`openspec-s2-totals.txt`; status 0); `nx format:check --all` exited 0 (`format-check.log`).

Pending planner verification: the whole `tool-devsync:test` target and committed index check
write Git objects; the complete frontend targets include tests that cannot spawn Bun inside this
sandbox. The host gate cannot run on this machine. Slice 3 owns fault injection for the two new
budget tests and the browser entry point; slice 4 owns the recorded example faults; slice 5 owns
the model sabotages.

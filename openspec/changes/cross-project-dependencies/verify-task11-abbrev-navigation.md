# Task 11.1 bounded abbreviation edit and stable navigation browser acceptance

Based on clean feature HEAD `82e98f7e8`, branch `proof/task11-abbrev-navigation`, isolated worktree `/tmp/puni-task11-abbrev-navigation`. Parent Task 11.1 remains open.

The dedicated real-stack browser fixture adds independent `RenameSource` and `RenameTarget` projects and one persisted external FS relationship. Existing A/AXX fixtures are unchanged. The source starts with abbreviation `NAV_OLD` and a whole-work-item predecessor, so the destination uses the production work-item focus branch without a step-node coordinate.

A real desktop browser opens the target's captured dependency and records its actual predecessor anchor. Its URL must contain the source project UUID and work-item UUID. A second page opens the source's actual Project settings → General panel, types lowercase `nav_new2` and presses Enter. The case requires the real PATCH body, HTTP 200 and returned same project identity with canonical `NAV_NEW2`. A full source reload and reopening General requires the persisted canonical field. A full target reload and reopening captured details requires the renamed `NAV_NEW2.010` label with exactly the original anchor. A direct SQLite fixture read requires every original relationship coordinate and its identity unchanged.

Clicking that actual anchor navigates to its exact root URL, then requires a destination-specific real `/api/projects/<source UUID>/work-items` GET with HTTP 200, the `RenameSource row` value and focus on `Name of 010`. The production table consumes its project/work-item query after focus. Playwright attaches the accepted project, stable anchor, exact relationship and destination tree.

## Fixture boundary

The fixture mounts real `ProjectPage`, catalog, HTTP APIs and project owner. Settings initially exposed a missing organization resource provider; the entry now mounts the production `OrganizationResourcesProvider` with its explicit active scope, or explicit legacy scope for existing unscoped fixtures. This adds no API or owner substitute.

For click-through only, this case intercepts **only** the root document request `http://localhost:7600/?…` and fulfills it with Vite's real dedicated fixture HTML. The browser retains the actual anchor URL/query and the module source is root-absolute `/e2e/cross-project-refresh-entry.tsx`. API requests, navigation click and owner/focus behavior are real. Production root authentication, onboarding and organization-session composition are **not** covered. The real composed SQLite backend, production gateway and existing explicit synthetic external-authoring authority remain the fixture boundary; production activation is unchanged.

## Watched faults

The retained [Bun harness](evidence/task11-abbrev-navigation/mutations.ts) runs each fault separately through the configured browser Nx target and requires exit 1 plus the intended assertion. It restores exact original source bytes in `finally` and on cancellation. [Receipts](evidence/task11-abbrev-navigation/mutations.json):

- Omit the production SQLite abbreviation write. The PATCH remains accepted but its readback returns `NAV_OLD`, failing the expected canonical `NAV_NEW2` project response. This fails before the later fresh-settings assertion. [Output](evidence/task11-abbrev-navigation/persistence-negative.log).
- Substitute the captured abbreviation for `projectId` in production `DependencyNavigation`. The actual initial predecessor href contains `project=NAV_OLD` instead of the captured UUID and fails the stable anchor assertion. [Output](evidence/task11-abbrev-navigation/stable-link-negative.log).
- Return before the production work-item deep-link branch. Navigation still fetches the source tree and displays the source row, but `Name of 010` stays inactive and fails `toBeFocused`. [Output](evidence/task11-abbrev-navigation/focus-negative.log).

Adjacent browser `Proof:` comments name these observed failures. No production source changes remain. The initial test-first run failed on absent dedicated rename fixtures ([output](evidence/task11-abbrev-navigation/fixture-red.log)). Initial test-authoring attempts also exposed missing settings resource context and the PATCH response envelope; those are not counted as production fault proofs.

## Verification

Commands use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; Nx checks disable cache. Browser commands require the localhost-capable execution boundary because sandbox sockets are unavailable. Dependency checks reuse the root locked `node_modules` through an untracked symlink. No fresh install was attempted because of the existing disk constraint; both lockfiles freshly hash to `ce438c27003f3ac7cbf0ab95019c9058dfcb10707be6310871de680cda8b471b`.

- `bunx nx run wbs-fe-01:e2e-cross-project --skip-nx-cache`: exit **0**, **8 passed (2.3 minutes)**. [Output](evidence/task11-abbrev-navigation/browser-final.log).
- `bun openspec/changes/cross-project-dependencies/evidence/task11-abbrev-navigation/mutations.ts`: exit **0**, all three intended browser negatives exit **1**. Exact production source restoration was checked by the harness and a fresh Git diff.
- `bunx nx run-many --targets=typecheck,lint --projects=wbs-fe-01,wbs-be-01 --skip-nx-cache --parallel=2`: exit **0**, all **6 tasks** successful, including both module typecheck prerequisites. [Output](evidence/task11-abbrev-navigation/configured-checks.log).
- `bunx tsc -p openspec/changes/cross-project-dependencies/evidence/task11-abbrev-navigation/tsconfig.json --noEmit`: exit **0**. [Output](evidence/task11-abbrev-navigation/harness-typecheck.log).
- Scoped ESLint over the changed browser entry/spec, backend server and retained Bun harness: exit **0**. [Output](evidence/task11-abbrev-navigation/scoped-lint.log).
- `bunx openspec validate --all --json`: exit **0**, **274/274**, zero failed. [Summary](evidence/task11-abbrev-navigation/openspec-summary.json).
- Explicit Prettier checks and packet-scoped `git diff --check` passed. Terminal carriage returns/trailing whitespace in retained logs were normalized; assertion content is preserved. Existing NO_COLOR/FORCE_COLOR and Vite configuration warnings remain visible.

This bounded desktop whole-predecessor slice does not establish phone abbreviation editing, conflicts, live label refresh without reload, production root/login routing, the entire Task 11.1 matrix, production activation, deployment or release readiness. Full frontend/solver/API/conformance tests, build and canonical exact-SHA host gate were not run. No push, host mutation or activation is part of this packet.

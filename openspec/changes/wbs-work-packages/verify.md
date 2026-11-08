# Verify: wbs-work-packages

## Slice 1 — task 1.1, the rename tool (2026-10-25)

Worktree `feat/wbs-work-packages-1`, base `origin/main` (`830e774d2`). Laptop run, every Bun
test under `env -u CLAUDECODE`; the h2puni gate was not run (CI carries the full suites).
`apply` ran only on scratch repositories inside the tests, never over this tree (task 1.4).

### Commands and results

| Command                                                                                     | Result                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:test --skip-nx-cache`               | exit 0; 37 pass, 0 fail across 4 files                                                              |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:lint --skip-nx-cache`               | exit 0                                                                                              |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:typecheck --skip-nx-cache`          | exit 0                                                                                              |
| `env -u CLAUDECODE bunx nx run tool-devsync:test --skip-nx-cache`                           | exit 0; 921 pass, 0 fail across 49 files (tool-devsync not edited; run because a project was added) |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0; the tool README is not a module index (tools carry none but tool-dagger's)                  |
| `bunx prettier --check` on every touched file                                               | exit 0                                                                                              |
| `bun tools/tool-rename-work-package/src/cli.ts report`                                      | exit 0; table below                                                                                 |
| `bun tools/tool-rename-work-package/src/cli.ts check`                                       | exit 1 as expected before 1.4: 25,836 residuals in 1,520 files, 85 of them path names               |

`report` on `830e774d2` (schema from the 93 migrations applied in memory; routes from the
document `emit-openapi-cli.ts` writes):

| Surface                                | Count |
| -------------------------------------- | ----: |
| tables named project                   |     9 |
| columns named project                  |    19 |
| project_id columns                     |    19 |
| indexes named project                  |    16 |
| automatic indexes of project tables    |     9 |
| indexes whose definition names project |     3 |
| triggers named project                 |     9 |
| triggers whose body names project      |    16 |
| paths with a projects segment          |    33 |
| paths naming project in a segment      |    34 |
| operationIds containing Project        |    40 |
| tracked paths apply would move         |    85 |

The design's 25 indexes are the 16 named ones plus the 9 automatic indexes, which SQLite
renames with their table.

### Failure proofs

Each fault was injected into the tool's production code, the named test watched failing, and
the code restored; the adjacent `Proof:` comments carry the same.

| Guard                                       | Fault injected                                                              | Test that observed it                                                                              | Result          |
| ------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| `check` reports a residual outside          | `{ glob: '**' }` prepended to `EXCLUDED_PATHS` (matches every path)         | cli `check exits 1 listing an injected residual…`, `reports a path that still names the word`      | 2 pass, 3 fail  |
| `apply` is idempotent                       | plural path target `work-packages` respelled `work-projects`                | cli `apply equals itself run twice…`: second run printed `rewrote 1 files`                         | 4 pass, 1 fail  |
| new-sense line `client projects`            | pattern removed from `PROTECTED_LINES`                                      | allow-list `leaves every new-sense witness line…`; cli `check exits 0 … on a protected line`       | 6 pass, 2 fail  |
| new-sense line `[PROJECT-ASSIGNMENT-READS]` | pattern removed from `PROTECTED_LINES`                                      | allow-list witness case (`requested project` became `requested work package`); the respelling case | 26 pass, 2 fail |
| line patterns are held to the tree          | a `\bprojectType\b` pattern whose lines sit only in excluded `project.json` | allow-list `holds every line pattern to at least one line…` named it; the pattern was dropped      | observed        |
| targets collide with nothing in scope       | dated `docs/wbs/research` record in scope                                   | rename-map `collides with no identifier…` named `work_package` lines of the authorization research | observed        |

Not run: tasks.md's `ScopeChain` fault (pattern removed, `apply` makes a second
`workPackageId`, typecheck fails). `ScopeChain` and the other `wbs-permissions` identifiers have
not landed on `main`, so no pattern exists to remove; `allow-list.ts` records that their slices
add the patterns, and the allow-list test then holds them to the code.

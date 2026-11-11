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

## Slice 1 — task 1.2, verified local window controls (2026-11-11)

Implemented the report-mode producer/readonly verifier, Bun host gate and four exact future-window waivers. The report remains exactly eight fields; observed artifact locations are separately returned and printed on stderr. The new wrapper never deletes stages or failure reports, because pathname rechecking cannot authorize identity-conditional deletion. See [ADR0084](../../../docs/adr/0084-retain-window-backup-artifacts-without-pathname-deletion.md) and [window runbook](../../../docs/runbook-work-package-windows.md). No-flag snapshot behavior and lower snapshot ownership/cleanup are unchanged.

The durable barrier remains stopped services plus paused poller and the host-wide lock. Checkpoint busy0 proves completed truncation/empty WAL, not absence of idle connections. Source-only immutable readonly acquisition requires that barrier and physical WAL checks; snapshots remain ordinary readonly. The host verifies exact stopped-container identity/name, selected readonly artifact mounts and pinned candidate image, invokes Bun explicitly, then rechecks state. Fake Docker proves argv/control flow only.

Exact argv/status/log SHA+bytes and fault recipes are in [verification-1.2.json](verification-1.2.json). All nine final commands ran sequentially against frozen32 source paths with before/after drift checks:

- Affected13-file regression:437 passed,0 failed,2679 assertions,138.20s; includes legacy snapshot, capture and rollback paths.
- Actual import-policy tests:4/0/79,5.38s.
- Existing source conformance:84/0/7703,70.32s; this is not standalone window certification.
- Six solution roots freshly compiled with --force:0; explicit bin project nonincremental compile:0.
- Exact owned TypeScript/JavaScript lint:0; supported-extension format:0; OpenSpec all:343/343; gitdiffcheck:0. The five SQL lint fixtures have no supported Prettier parser and were explicitly excluded from format.

R5:144 unique comprehensive faults/192 named RED→GREEN pairs, plus14 separately reviewed retention faults/15 pairs =158 canonical faults/207 named pairs. Six comprehensive attempts are excluded and fully retained. All144 current recipes reproduce exact archived mutants; all source/log SHA+bytes and complete32-file post-GREEN restoration checks (includingfinalrow) passed. Nine independently reproduced executable equalities bridge annotations/formatting only. Astra independently audited the archive/source/comment epoch; it ran no tests.

Qualifications: SHA+bytes physical tuples count once, with no independent byte-comparison claim; grouped checkpoint settlement distinguishes actual closed-writer admission failure from post-close ordering. Native prerequisite failures, explicit diagnostics, structural policy options and actual resolvableNx refusal are classified separately. StrictJSON alias proof comments live beside the actual compiler consumer. The noncanonical singleton pilot and six unqualified comprehensive attempts are not counted. Initial wrong matcher/selector, parse-only and masked-host attempts remain in the JSON, along with earlier failed/partial/unverified worker receipts. No permissive production fallback was added.

The baseline inventory is110 ledger identities,13 project-named tables,28 columns,23 named indexes,13 named triggers and one allocator view; the dated task1.1 survey above is historical. The five full SQL fixtures test lint shape only; no future semantic migration was created. Actual rename/view/allocator migration and permission new-project positives remain task1.3+ later work. No live Docker/mount certification, h2/h4 gate, maintenance window, deployment or remote publication was run. No remote publication occurred; no alternate route was used, and further publication remains blocked pending approval. Both rejected push attempts are preserved in the evidence.

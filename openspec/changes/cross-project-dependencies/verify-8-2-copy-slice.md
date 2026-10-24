# Task 8.2 bounded mounted copy/history proof

Based on `fe73674ec`, in isolated local worktree `/tmp/puni-copy-slice-82`.
This packet adds acceptance evidence; parent task 8.2 remains unchecked.

`cross-project-mounted-copy.controller.db.test.ts` exercises the actual HTTP
commands, ordinary PlanCommandRunner and SQLite history using the existing
explicit `syntheticExternalCommands` test fixture option. `seedIncidents` now
forwards that option to `openFixture`. Production service composition and
authoring dormancy are unchanged.

The test duplicates a successor with an incoming remote node prerequisite and
outgoing local and remote links. It asserts the original predecessor project,
work-item, scope and step identity; a new relationship identity; exact original
incident rows; unchanged foreign-owned relationship rows including audit columns;
unchanged foreign command journals; exactly one predecessor revision increment
per copy, undo and redo; removed copied rows after undo; and stable copied row
and relationship identities after redo through the same journal entry.

## Watched failures

Command for each fault:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts
```

- Initial red: without forwarding `seedIncidents` options, mounted duplicate
  returned 409 rather than 200. Forwarding the explicit synthetic option gave
  green (1 pass, 27 assertions at that point).
- Production-path negative: added a both-inside condition to
  `selectCopiedDependencies`, requiring the predecessor work item in the copy
  map. The real HTTP request returned success but the test observed zero retained
  prerequisites instead of one. Exit 1, 0 pass/1 fail.
- Production-path negative: changed successor-only selection to incident OR
  selection (a copied predecessor was sufficient). The real mounted request
  returned HTTP 500 instead of 200, with the required successor-map guard
  reporting `copied successor is absent from the work-item map`. Exit 1,
  0 pass/1 fail. This demonstrates detection of an unsafe selection, not an
  observed foreign write; the independent required-map guard refused first.
- Restored the exact production selector after each mutation. Its adjacent
  `Proof:` comment records only these observed assertions.

During verification, the new audit-row query initially used `project_id` instead
of the external table's `successor_project_id`; the four-suite run failed on that
SQL error. Corrected the query and reran the entire focused group. ESLint also
caught `expect.any(String)` as an unsafe assignment; replaced it with separate
string-type and exact endpoint assertions before rerunning lint. Final typechecking
also caught an optional relationship ID in that assertion; explicitly narrowed
the selected relationship before checking its identity and reran the checks.

## Checks

- Baseline existing cross-project copy suite: 25 pass, 0 fail, 369 assertions.
- Final focused test group (command below): 42 pass, 0 fail, 481 assertions.
- Changed-file ESLint: pass.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: pass, including module
  typechecking. Nx fell back to in-process plugins because sandbox socket
  creation was denied; both targets completed successfully.
- Changed-file Prettier check and `git diff --check`: pass.
- `./node_modules/.bin/openspec validate cross-project-dependencies --json`:
  pass, one valid change.
- Additional strict OpenSpec validation: fails on 16 existing requirement-length
  warnings in unchanged delta specs; no spec file is changed by this packet.

```sh
bun test apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-copy.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts libs/wbs/application/core/src/module/work-item/copy-typed-dependencies.test.ts
```

No full test/lint/build, browser, MCP, host gate, deploy or production activation
check was run. This packet covers subtree duplicate and its mounted history;
it does not establish whole-project copy, all endpoint/type combinations,
concurrency, complete task 8.2 or release readiness. The pre-existing mounted
production-dormant copy test was rerun in the focused group.

## Review amendment: intermediate undo and journal identity checkpoints

Follow-up to `7e5643f16`, addressing the Astra High evidence review. Only the
mounted acceptance test and this verification record change.

Immediately after undo, before requesting redo, the test now compares the full
foreign-owned external relationship rows (including audit columns) and foreign
journal rows with their original snapshots. Redo can no longer hide a transient
foreign write during undo.

Before copy, the test records every owner journal entry's ID and undone flag in
sequence order. Copy must append exactly one new ID, preserve every prior entry,
and set that new entry's flag to zero. Undo must retain that exact ID list/count
with only the copied entry changed to one. Redo must restore the exact post-copy
ID/flag list. These complete-list comparisons detect appended or replaced entries
at either replay checkpoint and prove the copied entry's `undone` transition
`0 → 1 → 0`.

Fresh checks for the amendment:

- `bun test apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts`:
  1 pass, 0 fail, 36 assertions.
- Changed-test ESLint and Prettier checks: pass.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: pass, including module
  checks; the same sandbox socket warning caused in-process plugin fallback.
- `./node_modules/.bin/openspec validate cross-project-dependencies --json`:
  one valid change, zero failures.
- `git diff --check`: pass.

The four-suite group above was not repeated for these test-only assertions.
Strict OpenSpec, full gates, browser, MCP, build, deploy and activation checks
were not repeated. No production behavior changes or new safety guards are added.
Parent task 8.2 remains open; this amendment does not establish release readiness.

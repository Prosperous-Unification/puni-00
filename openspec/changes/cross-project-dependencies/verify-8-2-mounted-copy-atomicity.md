# Task 8.2 bounded mounted active-copy atomicity acceptance

2026-10-23, based on feature commit `7d172b1f6`, isolated managed worktree
`/home/df/.codex/worktrees/cb74/puni-00`, branch `proof/task82-mounted-copy`.
Only acceptance tests and this evidence packet change; production code is restored.
Parent Task 8.2 remains open.

## Acceptance boundary

The real mounted `/api/projects/:owner/commands` route receives a two-command
batch: first patch the source row's notes, then duplicate it. The fixture uses
real SQLite, current organization/session admission, synthetic stored dependency
authority and explicitly synthetic active external commands. This does not
activate production external authoring.

- A connected graph reader throw during the duplicate's structural preflight
  returns HTTP 500. Every application table equals its original snapshot and
  the captured gateway push list remains unchanged. A fresh source-owned read
  proves the failed transaction closed and the original relationships remain.
- A real SQLite `BEFORE INSERT` trigger aborts the batch journal insertion.
  Its transaction-local predicate first requires a copied row carrying the
  earlier notes edit and a copied incoming prerequisite. A different error is
  raised if that state is absent, and the test checks the exact nested SQLite
  cause. Thus the fault occurs after staged copy/relationship writes, rather
  than before duplication. All application tables and gateway pushes remain
  unchanged; a fresh source read proves transaction recovery.
- After each fault is removed, the same mounted two-command batch succeeds.
  Its copied successor retains exactly one incoming prerequisite with a fresh
  relationship ID and the original remote endpoint and node/step identity.
  Every other incident edge remains unchanged and committed pushes resume.
- The existing successful duplicate/undo/redo case still checks exact owner
  journal IDs/flags, incoming identity and remote revision changes, complete
  foreign journals and foreign relationship rows at each replay checkpoint.

`readTables` compares all application tables, including journals, event log,
sequencer, work items, revisions and external relationships; SQLite internal
metadata and the injected trigger definition are outside that helper.
Expected error-level endpoint logs are retained for both injected HTTP 500s.

## Independently watched production negatives

Each mutant was applied alone and restored in `finally` before the next run.

| Injected fault                                               | Observed failure                                                           | Receipt                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Replace duplicate's `structuralRefusal` call with `null`     | Actual mounted route answers 200; test expected 500                        | [structural](evidence/task-8-2-mounted-copy/red-structural.log) |
| Omit exception-path `db.run(ROLLBACK)` in `sqliteUnitOfWork` | Fresh source read throws `cannot start a transaction within a transaction` | [omission](evidence/task-8-2-mounted-copy/red-rollback.log)     |
| Replace that exception rollback with `COMMIT`                | Complete table comparison detects persisted batch writes                   | [commit](evidence/task-8-2-mounted-copy/red-commit.log)         |

Each selected mutant run exited 1 with one failed mounted acceptance test.
The omission proof deliberately uses a fresh source read: the harness raw
connection represents another process and cannot observe uncommitted writes.
The independent COMMIT mutation proves the complete-table comparison detects
incorrectly persisted state. Adjacent `Proof:` comments name these faults.

## Fresh checks

```sh
bun test apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-copy.controller.db.test.ts apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts libs/wbs/application/core/src/module/work-item/copy-typed-dependencies.test.ts --timeout=20000
bunx eslint apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts
bunx tsc --noEmit --project apps/wbs/be-01/tsconfig.spec.json
bunx openspec validate cross-project-dependencies --json
```

- Focused group: **44 pass, 0 fail, 529 assertions**, including dormant copy
  controls. [Output](evidence/task-8-2-mounted-copy/focused.log).
- Changed-test ESLint: exit 0 after correcting unbound method references in the
  test spies. `@nx/enforce-module-boundaries` was skipped because no cached
  ProjectGraph was available; that rule is unverified in this scoped run.
  [Output](evidence/task-8-2-mounted-copy/lint.log).
- Changed-test/document Prettier and `git diff --check`: pass.
- Test-source TypeScript: exit 0, no diagnostics.
  [Output](evidence/task-8-2-mounted-copy/typecheck.log).
- Scoped OpenSpec: valid, zero errors; existing requirement-length warnings.
  [Output](evidence/task-8-2-mounted-copy/openspec.log).

Dependencies reuse the existing feature checkout's `node_modules` via an
untracked symlink; no fresh frozen install was performed. During verification,
the host filesystem reached zero available bytes and one lint invocation exited
1 without diagnostics; the recorded lint outcome below is its fresh rerun after
space recovered. No unrelated files were removed by this task.

No full test/lint/typecheck/build, browser, MCP, strict/full OpenSpec validation,
independent review, host gate, push, merge, deploy or activation was performed.
This packet does not establish whole-project copy, the full scope/type matrix,
concurrency, complete Task 8.2 or release readiness. Integrated exact-SHA host
gating and the broader Task 8.2 reconciliation remain open.

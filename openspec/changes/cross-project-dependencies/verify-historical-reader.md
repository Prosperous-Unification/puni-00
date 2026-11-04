# Task 8.1 bounded historical reader acceptance

This packet adds compatibility evidence only. Task 8.1, public external import
activation and the integrated exact-SHA host gate remain open. No production code,
reader policy, host configuration or activation marker changes.

Run this explicit, uncached acceptance target:

```sh
NX_DAEMON=false bunx nx run wbs-be-01:acceptance:historical-plan-reader --skip-nx-cache
```

`apps/wbs/be-01/scripts/historical-plan-reader.acceptance.ts` is deliberately
outside the default Bun test filename patterns and the backend `src` test tiers.
The ordinary `test`, `test:unit` and `test:store` targets do not collect it.
This keeps a fixed historical dependency pin from blocking unrelated dependency
updates in ordinary backend CI. The explicit acceptance target still refuses
a changed lockfile. It remains a dependency-pinned replay that fails visibly
on dependency divergence.

The mounted current backend exports a connected v11 artifact over authenticated
`GET /api/projects/:id/export?format=json`. Each compatibility case archives exact
pre-v11 commit `937da8cb59cec1edbcd7a9eb22fe420f6ff8e264` into a fresh temporary
source tree, preserves its contracts and TypeScript aliases, and executes its
real composed SQLite backend in a separate Bun process. Only the test worker is
copied into that tree; neither classifier nor production contract is copied from
the feature branch. The worker checks that aliases resolve inside the historical
tree. Dependency reuse requires byte-identical historical and current lockfiles;
the existing repository install is linked, with no install or network request.

The old backend successfully imports its historical v3 fixture, downloads an
actual v10 export and imports that v10 document successfully. This control rules
out a generally broken old importer. The same running old backend then receives
the current connected v11 download. A separate case replaces its `workItems` with
malformed content. Both require exactly:

```json
{
  "status": 400,
  "body": {
    "error": "unsupported_version",
    "path": "document.version",
    "detail": null
  }
}
```

All application tables, including directory, project/row, history, journal,
event and sequence tables and WITHOUT ROWID tables, remain equal to their
pre-request snapshots. The actual composed broadcaster's `pushFetch` records no
additional transport calls. Each child has a 45-second abort bound; parent test
budget is 60 seconds. Temporary source/database state is removed afterward.
Missing historical Git objects, archive tools or dependency identities refuse
rather than skip or select a current reader.

## Watched negative

Only inside each temporary historical archive, changed the historical version
fence from `version !== PLAN_DOCUMENT_VERSION` to
`version !== PLAN_DOCUMENT_VERSION && version !== 11`. Both exact-refusal cases in the dedicated acceptance target
failed: connected content produced `invalid_typed_dependency` at
`typedDependencies[0].predecessor.step`; malformed content produced `invalid_body`
at `workItems`. Both still returned 400, so a status-only assertion would have
missed this boundary regression. The mutation log is
[evidence/historical-reader/version-fence-fault.log](evidence/historical-reader/version-fence-fault.log).
The injector was removed; no historical source mutation is committed. An adjacent
`Proof:` comment names the fault and observed cases.

## Checks and limits

The implementation worktree is `/tmp/puni-historical-reader`, branch
`proof/historical-reader`, based on `82e98f7e8`. Focused checks are recorded below.
The bounded proof covers this exact historical reader, not every old release or
installed binary. No public activation, host adoption, deploy or full host gate
was attempted. Full backend lint and broad runtime suites are not claimed.

- `NX_DAEMON=false bunx nx run wbs-be-01:acceptance:historical-plan-reader --skip-nx-cache`: **2 pass, 0 fail, 10 expectations**, 11.47 seconds. Configured target output: [acceptance-target.log](evidence/historical-reader/acceptance-target.log).
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`: **passed**, including `typecheck:module`; 10.9 seconds.
- `bunx eslint apps/wbs/be-01/scripts/historical-plan-reader.acceptance.ts apps/wbs/be-01/src/testing/historical-plan-reader.worker.ts`: **passed**, after populating the Nx project graph so module-boundary checking runs. Initial direct lint without a graph reported that module-boundary checking was skipped; that run is not the passing lint evidence.
- The configured acceptance target with the historical-fence mutation: **0 pass, 2 fail** for the expected refusal differences. Restored configured target: **2 pass, 0 fail**.
- `NX_DAEMON=false bunx nx run wbs-be-01:test --skip-nx-cache --args='historical-plan-reader --pass-with-no-tests'`: discovery check reports **no matching test files** across 842 searched files. This is exclusion evidence, not a passing backend suite. Output: [default-discovery.log](evidence/historical-reader/default-discovery.log).
- `bunx openspec validate cross-project-dependencies --json`: **passed**, with existing requirement-length warnings; no delta specification changed.
- Changed-file Prettier write/check and `git diff --check`: **passed**. Commit hooks run normally; no bypass.

Captured logs retain command output with terminal color escapes and trailing
whitespace removed.

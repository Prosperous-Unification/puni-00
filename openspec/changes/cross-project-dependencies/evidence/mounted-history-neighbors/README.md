# Mounted neighboring-history conflict proof

Base: `95051c235308e1747bafb2d6bf7e020563bbbf36`. Isolated shared clone:
`/tmp/puni-history-neighbors`. No primary checkout or branch edits, push, or
production change. Dependencies reuse the primary checkout's `node_modules` by
symlink; a fresh frozen install was not run.

Scope: bounded Task 4.4 mounted neighboring-history coverage only. Task 4.4 and
activation remain open. The existing dependency fixture is unchanged; the test
opts into its synthetic external authoring boundary, not production activation.

The real mounted commands add A→B, optionally patch A's endpoint notes, and
update the B-owned relationship from FS to SS. Undoing the newer B update succeeds
and restores FS. With the A edit, the older B entry retains its originally
captured scoped A revision, A's journal is unchanged, and undoing the older add
returns HTTP 409 `stale_undo` with external-endpoint-changed detail. A complete
snapshot of every application table remains equal except deletion of precisely
the selected older B journal entry; publication capture remains unchanged. Without
the A edit both undos succeed and remove the relationship.

## Observed production-path negative

In `WorkItemService.rebase`, temporarily replaced:

```ts
if (current === undefined || revision.revision !== before.get(key)) return revision;
```

with:

```ts
if (current === undefined) return revision;
```

Command:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-history-neighbors.controller.db.test.ts --timeout=10000
```

[Mutation output](revision-guard-red.log.txt): exit 1, one control pass and one
conflict failure. The conflict assertion observed HTTP 200, a successful undo
body and an empty external relationship table instead of 409 and the preserved
relationship. This is a real mounted unsafe compensation, not source matching.
The source was restored byte-for-byte from its pre-mutation copy; both copies'
SHA-256 is `b961961c72375c6be5e0c68d0d2ac59057cb6cefb6052e770e96f328bed508c6`.

An adjacent `Proof:` comment records observation in the owned test. The existing
production guard already has a SQLite-path proof comment; no shared production
comment was edited. A future production-comment update can cite this mounted
case beside that guard at `work-item.resource.ts:7679`.

## Verification

- [Restored focused test](restored-green.log.txt): command above, exit 0; two
  tests, 41 assertions. Original unmutated baseline also passed before mutation.
- [Focused ESLint](focused-lint.log.txt):
  `bunx eslint apps/wbs/be-01/src/controller/cross-project-history-neighbors.controller.db.test.ts`,
  exit 0; empty output is ESLint's success contract.
- [Formatting](format.log.txt):
  `bunx prettier --check apps/wbs/be-01/src/controller/cross-project-history-neighbors.controller.db.test.ts`,
  exit 0.
- [Configured typecheck](typecheck.log.txt):
  `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`, exit 0, including its
  `typecheck:module` dependency. Nx printed socket-sandbox guidance before
  completing both targets successfully.

Not run: full backend suite, full repository CI checks, h2puni/h4claw SHA gate,
secrets scan, migration lint, OpenSpec validation, or build. This packet proves
only the mounted history behavior and named focused checks; it does not close
the parent Task 4.4 or establish deployment readiness.

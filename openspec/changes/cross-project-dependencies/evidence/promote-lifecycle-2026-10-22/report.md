# Bounded task 4.4 promotion lifecycle packet

Base: `a9f022563`. Worktree: `/tmp/puni-promote-lifecycle`.
Task 4.4 remains open. This packet enables no production external authoring,
changes no API/schema, and covers only existing `deleteWorkItem(strategy: 'promote')`.
The production composition retains `INACTIVE_EXTERNAL_DEPENDENCIES`.

## Behavior evidence

Three selected-organization, authenticated mounted HTTP scenarios use only
`syntheticExternalCommands` and the test step-blockage activation. The parent
already has two children before links are authored. Its incoming whole-scope
relationships include two remote prerequisites and one local prerequisite.
A surviving child has an incoming remote link and an outgoing link owned by a
fourth project; an unrelated remote relationship is also present.

The replay case checks parent-only deletion, promoted parentage and sibling
ordering, exact surviving child/unrelated relationship rows including audit
fields, exact removed/restored relationship IDs and scopes, local link cleanup,
remote prerequisite revisions (+1 for delete, undo and redo), exact owner-journal
external revision coverage, unchanged unrelated remote endpoint revision, and
unchanged remote journals. Undo restores the surviving rows' numeric positions
and sibling ordering. The restored root is placed by existing `placeAfter`
semantics; its numeric position need not equal the deleted root's old position.

The stale case edits a remote prerequisite through its mounted command route
before undo. It asserts typed 409 `stale_undo`, identical domain/persistence tables
and push list, and exactly the existing stale-entry pruning policy: only the
refused journal entry disappears and every other journal row stays identical.
This is an atomic refusal with intentional history pruning, not unchanged history.

The outgoing case authors two direct parent prerequisite relationships, then checks
typed 409 `referenced_by_external_dependency`, exact sorted relationship IDs,
identical tables and no pushes.

The tests were written before production edits. The existing promotion behavior
already passed after fixture corrections; this is a coverage/proof packet, not a
new behavior fix. Early failures were invalid fixture scope (`subtree`; corrected
to supported `whole`), expecting stable root numeric position rather than its
existing ordered restoration, expecting stale history retention rather than
its documented pruning, and assuming child insertion order rather than reading
the authored tree order. None is claimed as a missing-feature TDD red.

## Watched independent production faults

Each fault was injected alone, run through the mounted scenario, and restored
before the next mutation. After the mutation sweep, the full lifecycle suite
was rerun clean. Adjacent production `Proof:`
comments were added only after observation. Full command for each:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts --test-name-pattern 'synthetic mounted promote <scenario>' --timeout 10000
```

| Fault                                                                  | Scenario | Observed failure                                                                                 | Receipt                                  |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Promotion inverse `withRemovedTyped` receives `[]`                     | replay   | undo 404 instead of 200; exit 1                                                                  | [inverse](promote-fault-inverse.log)     |
| Promotion typed `removeAllFor([id])` broadened to `subtreeOf(rows,id)` | replay   | delete 500 instead of 200; surviving child outgoing relationship triggers SQLite refusal; exit 1 | [overbroad](promote-fault-overbroad.log) |
| Promotion-only `externalBefore` replaced with `[]`                     | replay   | delete 500 instead of 200: journal external revision coverage is incomplete; exit 1              | [before-image](promote-fault-before.log) |
| Replay external revision comparison replaced with `false`              | stale    | undo 200 instead of 409; exit 1                                                                  | [revision](promote-fault-revision.log)   |
| Outgoing external predecessor refusal replaced with `false`            | outgoing | delete 500 instead of typed 409; later graph guard refuses; exit 1                               | [outgoing](promote-fault-outgoing.log)   |

The inverse, broadened-removal, missing-before-image and outgoing faults prove
consumer-visible failure, not unsafe committed deletion. Only the revision fault
observed an unsafe successful stale replay. Existing redundant guards remain intact.

## Verification

- Baseline mounted cascade case: 1 pass, 0 fail, 35 assertions.
- Final lifecycle file: `bun test apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts --timeout 10000`: **24 pass, 0 fail, 433 assertions** ([receipt](promote-full.log)).
- `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json`: exit 0.
- Changed-file `bunx eslint`: exit 0, including module-boundary checks after graph generation.
- Prettier checked all four changed TypeScript/Markdown files; `git diff --check`: exit 0.
- Normal commit hooks passed lint, format, plaintext-secrets, private-nesting, prepare-commit-msg and commit-msg ([receipt](commit-hooks.log)). Tool-wiki explicitly returned inactive/uncertified because no external activation root is provisioned. Migration and doc-cap hooks skipped because no matching files were staged. No hooks were bypassed.

The initial Nx graph attempt could not use sandbox sockets and produced no graph.
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/promote-project-graph.json`
then created the graph, allowing module-boundary lint to run. Initial typecheck/lint
found missing SQLite query generics in the new tree reader; the reader now has
explicit row/argument types.

No full repository Nx/CI gate, production build, frontend/browser/solver suites,
secrets CI/migration checks or canonical h2/h4 exact-SHA gate ran in this packet.
This local bounded packet does not establish deployment or parent task completion.

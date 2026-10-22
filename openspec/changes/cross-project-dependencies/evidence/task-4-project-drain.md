Packet B, 2026-10-22, based on `821550c94`, isolated clone `/tmp/puni-deletion-guard`.

The installed `optimizationLifecycle.beginDrain` and raw maintenance adapter previously accepted stored external A→B facts and committed A's deletion marker, audit update, generation cancellation, queued-work deletion and slot cancellation. The existing finalizer's `foreignTyped` query covers `typed_dependency`, not the separate `external_dependency` representation. Independent late-reference finalization reached an estimate cleanup witness before the external FK eventually blocked graph deletion.

The adapter now refuses named external predecessor references before begin writes and before final cleanup. Project-pending contract retirement also revalidates: without that defense raw reconciliation committed its earlier generation/slot sweep before the project refusal. Ordinary contract retirement without a project deletion marker remains allowed. The existing typed store's endpoint assertion rejects new or updated facts on either delete-pending endpoint; reads remain available. Whole-project successor cleanup explicitly removes its incoming owned links with the graph; surviving predecessors retain revisions. This maintenance lifecycle has no undo journal. No HTTP route, authoring activation, optimizer public contract or saved-plan file changed.

The tests seed authority through the existing synthetic storage fixture. They do not establish production activation readiness or a new public writer.

Verification:

- `bun test apps/wbs/be-01/src/services.db.test.ts libs/wbs/adapters/store-sqlite/src/optimization-drain.db.test.ts libs/wbs/adapters/store-sqlite/src/typed-dependency.db.test.ts --timeout=15000`: **207 pass, 0 fail, 1184 assertions**. After adding an explicit installed restart test and unrelated C→D retention assertion, the final focused `--test-name-pattern 'installed external project deletion safety'` run passed **10 tests, 38 assertions**.
- `NX_DAEMON=false bunx nx run-many -t lint -p wbs-store-sqlite,wbs-be-01`: both targets passed with fresh output. Nx printed its sandbox socket fallback warning; the direct full ESLint commands also passed with a cached project graph, so module boundaries were checked.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json`: passed. Backend typecheck repeated after final test additions.
- `bunx openspec validate --all --json`: **268 passed, 0 failed** (existing archive warnings remain).
- Changed-file Prettier and `git diff --check`: passed.

Watched production-path negatives, each restored before green verification:

| Injected fault                                 | Observed failure                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove begin guard only                        | Both installed/raw tests failed persistent-table equality: marker/audit, queue, slot and generation changed. `/tmp/puni-deletion-begin-mutant.log` |
| Remove project finalizer guard only            | The estimate BEFORE DELETE witness fired instead of the named external-reference refusal; no FK-only proof. `/tmp/puni-deletion-finish-mutant.log` |
| Remove endpoint pending fence                  | New links on pending A and B resolved instead of refusing. `/tmp/puni-deletion-fence-mutant.log`                                                   |
| Remove pending-project retirement defense only | Raw reclaim lost slot/generation before later project refusal; exact-table snapshot failed. `/tmp/puni-deletion-retirement-mutant.log`             |
| Remove successor cleanup ownership predicate   | Unrelated C→D was deleted; successor-retention assertion failed. `/tmp/puni-deletion-cleanup-mutant.log`                                           |

The successor fixture additionally injects a late step-cleanup failure and asserts exact rollback including relationships, endpoint revisions, audit, queue/generation/slots, journal, event log and sequencer. Installed release and startup fixtures assert the same complete snapshot under late external references. Existing populated lifecycle event-failure rollback tests passed in the regression run.

No canonical exact-SHA host gate, build, remote deployment or public command activation was run. Task 4.4 remains unchecked because its history/structural obligations extend beyond this packet.

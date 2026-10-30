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

Review correction: mounted typed-command conflict

Review reproduced a local typed add after begin-drain returning HTTP500 from the raw persistence fence. That was an expected lifecycle conflict reaching the fault channel. Mounted add and update tests first observed HTTP500, then HTTP409 `project_deleting` after the correction. Each starts while the composed source writer is held, sets the durable marker before releasing that turn, and includes an earlier successful batch patch. All application tables (including journal, audit, events and sequencer) and outbound pushes remain equal to the post-marker snapshot.

`TypedDependencyStore.hasDeletingEndpoint` now reads both endpoint markers in the current writer observation. The working-plan adapter delegates to the same borrowed store; the command service consumes it before persistence and returns the modeled conflict. SQLite's independent persistence guard remains intact. The memory typed fixture has no optimizer lifecycle and explicitly reports no deleting endpoint. Missing project state and unreadable marker state throw. The latter test renames the marker column: SQLite otherwise treats its quoted missing column as a string literal, so decoding is required. The shared response arm and frontend exhaustive refusal consumer recognize `project_deleting`; the writer displays a deleting-project sentence without retry or reread.

Correction verification:

- Full connected admission, cross-project lifecycle and typed-store suites: **135 pass, 0 fail, 1805 assertions** (`/tmp/puni-deletion-modeled-tests.log`). After adding outbound-push capture, final mounted pending add/update tests passed **2 tests, 23 assertions** (`/tmp/puni-deletion-modeled-final-focused.log`).
- Working-plan and memory typed fixture suites: **28 pass, 0 fail, 114 assertions**. Original installed deletion-safety suite: **10 pass, 0 fail, 38 assertions**.
- Frontend plan-writer Vitest suite: **22 passed**; its new test first failed at the exhaustive refusal consumer before the frontend case was added. Existing Vite native-config warnings were printed.
- Changed backend/core/store/contract ESLint passed. Final normal hooks also cover the added frontend files.
- Final `tsc --build --force` passed backend, frontend and production memory configurations. Frontend TypeScript initially identified the new exhaustive refusal case and was corrected. Full memory test-project compilation exposed pre-existing saved-plan role omissions in unchanged `memory-source.test.ts`; those unrelated saved-plan tests were not edited.
- OpenSpec all-change validation: **268 passed, 0 failed**.

Independent watched correction negatives: removing the service consumer, forcing the persisted-marker predicate false, and removing the HTTP409 schema arm each made both mounted tests return HTTP500 instead of HTTP409. Accepting a missing project and removing marker decoding independently made the named absent/unreadable-state tests resolve instead of throw. Logs are `/tmp/puni-deletion-modeled-{consumer,read,schema,absence,unreadable}-mutant.log`; all faults were restored before green verification.

No canonical host gate, build, deployment or external authoring activation is established by this correction.

Second review correction: implicit typed writes

The review's first-child reproduction was confirmed on the mounted production composition: an existing local node relationship remapped by `createWorkItem` reached the raw pending-project fence and returned HTTP500. A local duplicate that copies an incoming typed prerequisite and a mounted first-child transfer of external incidents independently reproduced the same fault.

`WorkItemService.structuralRefusal` now checks lifecycle state for newly added or changed typed facts before graph expansion and persistence. This shared proposed-state path covers first-child local node remaps and duplicate/copy; unchanged relationships do not create an additional lifecycle gate. `createIncidentNodeTransition` checks both current endpoint markers after endpoint authority and before any detach, so derived external restoration retains its borrowed writer and grants no remote edit permission. Its post-await authority assertion rejects an observation closed during the marker read. Raw SQLite fences remain unchanged.

Audit of the remaining typed writers: explicit add/update and compensating add/update already call `typedRefusal`; incident restoration uses the bound transition; typed import builds a fresh target project, and production external import remains dormant and refuses before relationship persistence. No authoring activation or saved-plan change was added.

Fresh forward implicit-write refusals return HTTP409 `project_deleting`, preserving every application table and outbound pushes, including an earlier patch in the batch. Undo/redo retain the documented existing stale-history policy: they return HTTP409 `stale_undo` and discard exactly the refused entry. Their tests assert that graph, revisions, audit, events, sequences and every other journal entry remain unchanged; this packet does not silently change history semantics.

Verification:

- Full connected-command admission, cross-project lifecycle, typed-copy and cross-project history controller suites: **157 pass, 0 fail, 2316 assertions** (`/tmp/puni-deletion-implicit-regression.log`).
- Backend/core `tsc --build --force` and changed-file ESLint passed. All-change OpenSpec validation: **268 pass, 0 fail**.
- Removing the structural lifecycle consumer independently restored HTTP500 in both mounted create and duplicate tests (`/tmp/puni-deletion-implicit-structural-mutant.log`: 2 failures).
- Removing the incident lifecycle consumer independently restored HTTP500 in mounted fresh/undo/redo tests (`/tmp/puni-deletion-implicit-incident-mutant.log`: 3 failures).
- Removing only the post-marker-read authority assertion returned a modeled refusal after the injected observation close instead of throwing (`/tmp/puni-deletion-implicit-lifetime-mutant.log`: 1 failure).

All injected faults were restored before green verification. Existing no-host-gate, no-build, no-deploy and no-activation limits remain.

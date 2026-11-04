# Task 4.4 bounded mounted compound remote-cycle replay

Base: `c06a5e91d`, isolated shared-object clone `/tmp/puni-compound-replay`.
Production external authoring remains inactive. Only the existing test-only
`syntheticExternalCommands: true` fixture seam admits external command payloads.
Task 4.4 remains open; this packet adds four mounted HTTP/database scenarios and
observed production `Proof:` comments without changing runtime behavior.

The predecessor project holds A/Y and the successor owner holds B/X. Real mounted
commands seed B.Dev→X.Dev and Y.Dev→A.Dev. Undo starts from an existing A.Dev→B.Dev
relationship, then authors one batch removing it and patching B.notes. Redo authors
one batch patching B.notes and adding A.Dev→B.Dev, then undoes that batch. Both
selected replay commands are parsed from the actual journal and asserted to be
exactly `batch[patch, add_typed_dependency]`; the selected entry's undone bit proves
the initial journal direction. Separate healthy controls restore the exact stable
relationship ID, FS type, project/work-item/step IDs and node scopes and flip that
selected entry to the opposite direction.

With A→B absent, the cycle cases add X.Dev→Y.Dev through the predecessor project's
mounted command route. A/B revisions are asserted unchanged across this write.
The owner replay returns exactly HTTP 409 `stale_undo` with
`that relationship would now be refused: cycle.`. B.notes/revision/updated_at match
the pre-replay values, every nonjournal table matches byte-for-byte row snapshots,
no push is sent, and the complete journal table equals its previous contents with
exactly the selected stale entry removed. This includes the predecessor's new
journal and all other project journals.

## Observed production-path faults

For each fault, the command was:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts --test-name-pattern 'synthetic mounted compound.*remote-only cycle'
```

Each run produced **0 pass / 2 fail**. The first two fault runs used the same
semantic assertions before Prettier normalized the test. The commit fault was
rerun after adding the explicit B patch snapshot assertion. The temporary
diagnostic in the combined-fault run was removed afterward.

1. In `WorkItemService.typedRefusal`, replace only the final connected-cycle
   classification return with `return null`; retain the real graph call and every
   other check. Both exact HTTP-envelope assertions fail: HTTP remains 409
   `stale_undo`, but detail changes to the final replay fallback
   `that would now close a dependency cycle between steps.`.
   [Raw output](proofs/early-fault.txt).
2. Retain fault 1, then change the final `walkStack` cycle consumer from
   `if (cycle !== null)` to `if (false && cycle !== null)`. Both exact envelope
   assertions fail with **observed HTTP 200**, body
   `{"done":"2 changes","detail":null}`. A temporary observation immediately
   before the assertion records restored A→B with its exact endpoints/type, B.notes
   patched in the replay direction and the selected journal flipped. The changed
   tables are `command_journal`, `event_log`, `event_sequencer`,
   `external_dependency` and `work_item` in both directions. No 200 outcome was
   assumed before observing the actual mounted response and database.
   [Raw output and observations](proofs/both-fault.txt).
3. Restore both graph consumers. In `PlanCommandRunner.walk`, change only the
   refusal unit-of-work verdict from `commit: false` to `commit: true`. HTTP still
   matches the required 409 envelope, but the explicit B patch snapshot fails:
   undo persists notes `""` and revision 5 instead of notes `"Compound replay patch"`
   and revision 4; redo persists the patch and revision 6 instead of empty notes
   and revision 5. Updated timestamps also differ.
   [Raw output](proofs/commit-fault.txt).
4. Restore the rollback verdict. Replace only `await repair.discardEntry(entryId)`
   in the runner's `afterRollback` callback with `void repair`. Both HTTP, domain
   snapshot and push assertions pass; the complete journal comparison fails with
   exactly one additional selected stale entry, undoable for undo and undone for
   redo. [Raw output](proofs/prune-fault.txt).

Both source files were restored from saved pre-fault bytes before adding adjacent
observed `Proof:` comments. The focused restored run passed **4 tests / 104
assertions**. No fault or temporary diagnostic remains in the committed source.

## Verification

Fresh local checks used Bun 1.4.2 and the existing workspace `node_modules`
through a symlink; no new dependency installation is claimed.

- `bun test apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-lifecycle.controller.db.test.ts --timeout=10000`:
  **54 pass / 0 fail, 969 assertions**. [Output](proofs/suites.txt).
- The final focused command with `--test-name-pattern 'synthetic mounted compound'`:
  **4 pass / 0 fail, 104 assertions**. [Output](proofs/focus.txt).
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: **exit 0**, both module and
  backend targets succeeded. Nx used its documented in-process plugin fallback
  after sandbox socket denial. [Output](proofs/typecheck.txt).
- Full backend lint returned **exit 1** three times without a rule diagnostic:
  `NX_DAEMON=false bunx nx run wbs-be-01:lint` (75s);
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --skip-nx-cache --verbose`
  (53s); and the same command with `NODE_OPTIONS=--max-old-space-size=8192`
  and `--output-style=static` replacing `--verbose` (47.5s). The first attempt
  reported the sandbox plugin socket fallback; all reached the backend ESLint
  invocation. The cause of these diagnostic-free failures is unverified; **full
  backend lint is not claimed passing**.
  [Initial](proofs/lint-initial.txt), [retry](proofs/lint-retry.txt),
  [memory-adjusted](proofs/lint-memory.txt).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx eslint apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts libs/wbs/application/core/src/module/work-item/work-item.resource.ts libs/wbs/application/core/src/module/plan-commands/plan-commands.feature.ts`:
  **exit 0**, no diagnostics and no skipped-boundary warning; the real generated
  `.nx/workspace-data/project-graph.json` was present. An initial scoped run
  identified the matcher `expect.any(String)` as an unsafe assignment; its value
  now enters the assertion as `unknown`.
- `bunx prettier --check` on the test, both production comment files and this
  report: **exit 0**. [Output](proofs/format.txt).
- `bunx openspec validate --all --json`: **270 passed / 0 failed** (252 changes,
  18 specs). [Output](proofs/openspec.txt).
- `git diff --check`: **exit 0**.

Full host gates and build were not run. The normal commit hooks run the scoped
lint, format, plaintext-secrets, private-nesting and tool-wiki checks; no full CI
secrets scan or migration lint is claimed. No migration file changed. Production
activation and deploy were not performed. Task 4.4 remains open.

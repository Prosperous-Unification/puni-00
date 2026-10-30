# Task 4.4 bounded final replay graph consumer proof

Base: `927e8c79594fe9df4c694d18a0171bd9ebec7ae8`, isolated clone
`/tmp/puni-44-final-replay`. This packet adds acceptance evidence and an adjacent
production `Proof:` comment; production behavior is unchanged. Parent task 4.4
remains unchecked. No gateway, 3.2 or 6.3 implementation changed.

The existing mounted compound undo/redo fixture now has three observations per
direction: healthy success, a real remote-only cycle, and a final-only returned
finding. Healthy controls restore the exact stable relationship and replay the
preceding patch, flipping the selected journal entry. The existing remote-cycle
cases still exercise the genuine early typed refusal.

For the new final-only cases, saved `DependencyGraphGuard.findCycle` and
`ConnectedDependencyGraphReader.read` methods are called with their genuine
receivers inside the mounted request. Every genuine graph answer is asserted
healthy. Proposed-state graph calls return their genuine answer unchanged. Only
the empty-change final graph observation injects a cycle finding. Before returning
it, the test requires an earlier proposed-state read and inspects the genuine
reader's transaction-bound capture: the exact external relationship is already
reattached and the earlier compound patch is applied. The separate harness SQLite
connection cannot observe these uncommitted writes, so it is used only for
before/after persistence comparisons. Both method wrappers are restored in
`finally`.

Undo and redo each return HTTP 409 `stale_undo` with the final consumer's exact
`that would now close a dependency cycle between steps.` detail. The notes,
revision and update audit of the preceding patch roll back. Complete application
table snapshots match except for deletion of exactly the selected stale journal
entry; all remote and other journal entries remain byte-for-byte unchanged.
Publication requests are unchanged. The delta spec's general preservation rule
now explicitly names that established stale-entry pruning policy and includes the
compound-patch rollback/no-publication scenario. This reconciles wording with
existing behavior; it does not add a journal policy or change its implementation.

## Independently watched production fault

Only the final `WorkItemService.walkStack` consumer was changed temporarily:

```diff
 const cycle = await this.findDependencyCycle(projectId, actorId);
-if (cycle !== null) {
+if (false && cycle !== null) {
```

`typedRefusal`, the genuine final graph call and all other replay checks remained
intact. The focused command was:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts --test-name-pattern 'final-only graph finding'
```

[Observed output](proofs/final-consumer-fault.txt): **0 pass / 2 fail, exit 1**.
Both directions returned unsafe HTTP 200 with `{"done":"2 changes","detail":null}`.
Each recorded exactly one proposed-state read and one final read. A temporary
observation before the refusing HTTP assertion recorded the restored exact
relationship, persisted replay-direction patch, flipped selected journal and
changed `command_journal`, `event_log`, `event_sequencer`, `external_dependency`
and `work_item` tables. Both publication-request counts increased from 14 to 17.
Undo persisted empty notes/revision 6 instead of the prior patch/revision 4; redo
persisted the patch/revision 7 instead of prior empty notes/revision 5. The output
also records the exact IDs and timestamps.

Both source files were restored from saved bytes in `finally`; the temporary
observation is absent from committed tests. The restored focused command with
`--test-name-pattern 'synthetic mounted compound'` passed **6 tests / 172
assertions** after the final watched mutation. This is independent consumer
coverage; the injected finding does not claim a new real graph algorithm defect.

## Verification

Bun 1.4.2; dependencies reused through a symlink to the original workspace's
`node_modules`. No fresh or frozen install is claimed. Retained Nx logs normalize carriage-return
line endings to LF; diagnostic content is unchanged.

- Combined lifecycle/history/mounted incident suites, `bun test` with the three
  controller files and `--timeout=10000`: **58 pass / 0 fail, 1099 assertions**.
  [Output](proofs/suites.txt).
- Final compound focus after fault restoration: **6 pass / 0 fail, 172
  assertions**. [Output](proofs/focus.txt).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`:
  backend and module prerequisite passed, exit 0. [Output](proofs/typecheck.txt).
  The first run found two new test typing errors, corrected by declaring the SQL
  row's selected ID and binding the expected captured relationship before equality.
- Configured backend lint's first attempt exited 1 without rule diagnostics
  after 53 seconds. [Output](proofs/lint-initial.txt). Retrying with
  `NODE_OPTIONS=--max-old-space-size=8192 NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --skip-nx-cache --output-style=static`
  passed. The retained [final output](proofs/lint.txt) is a fresh run after all
  production mutations were restored. The original failure's cause is unverified.
- Scoped ESLint over the changed test and production comment file passed,
  exit 0, no diagnostics; a generated Nx project graph was present.
- `bunx openspec validate cross-project-dependencies --json`: **1 passed / 0
  failed**, existing long-requirement warnings retained. [Output](proofs/openspec.txt).
- Prettier over all changed TypeScript/Markdown files and `git diff --check` pass.

No canonical host gate, full CI, full build, migration lint, full secrets scan,
activation or deployment was run. Normal commit hooks run the repository's
configured scoped checks. No push, merge or full task 4.4 completion is claimed;
independent Astra High review remains the parent's next step.

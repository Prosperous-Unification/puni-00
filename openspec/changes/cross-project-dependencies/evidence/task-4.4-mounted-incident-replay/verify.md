# Task 4.4 bounded mounted incident replay

Base: `6bb0b0833b920d44c628d736cf1591e447c1b2ea`.

The new `cross-project-incident-replay.controller.db.test.ts` exercises the real
mounted command/undo/redo HTTP boundary, SQLite writer UoW, graph context,
compensating history and publication path. Existing service behavior suffices;
this packet changes tests and evidence only. Parent task 4.4 remains open.

Ada owns structural project B; Grace owns restricted successor C. Ada is reduced
to an organization member. A mounted ordinary C work-item patch returns 403,
leaves all application tables unchanged and emits no push. Historical incoming
A→B and outgoing B→C node relationships, plus a B→C whole relationship, are
seeded through the real SQLite typed store in a UoW. This uses the existing
fixture's synthetic stored authority, with external command authoring inactive;
it does not introduce production activation.

A single mounted B batch creates B's first child and patches an unrelated B row.
The inverse is explicitly checked to execute `patch` before
`transition_incident_nodes`. Exactly one B history entry is added and remote
history remains byte-for-byte unchanged. Incoming successor and outgoing
predecessor node IDs follow the child; ID, organization, successor project,
type, scope, step and creation audit remain exact. The whole relationship,
including its update timestamp, remains byte-for-byte unchanged. Mounted undo
and redo preserve these facts, flip the same B entry and restore/reapply the
unrelated patch without creating additional entries. Node relationship
`updated_at` is intentionally not immutable: remapping updates it; the query
compares all authored relationship fields and creation audit.

The negative changes only outgoing `created_at` from 10 to 11 directly, proves
all work-item revisions unchanged, then calls mounted undo. It returns HTTP 409
`stale_undo`; notes, revision and update audit from the earlier inverse patch
roll back. `readTables()` compares every application table, allowing only the
existing stale-history policy's deletion of the selected B journal entry.
Publication requests are unchanged.

## Watched production fault

Temporarily removed only these comparisons from
`libs/wbs/application/core/src/service/incident-node-transition.ts`:

- `recorded.from.createdAt !== from.createdAt`
- `recorded.to.createdAt !== from.createdAt`

Relationship identity, mapped identity, `createdBy` equality and receipt-set
coverage remained intact. The positive case passed; the negative failed at its
HTTP assertion: expected 409, received unsafe 200 (1 pass, 1 fail, exit 1).
Restoring the exact original production file returned the focused suite to
2 passes, 0 failures. An adjacent test `Proof:` comment records the injection.
No production guard was added or changed.

## Verification

- `bun test apps/wbs/be-01/src/controller/cross-project-incident-replay.controller.db.test.ts --timeout=10000`:
  2 passed, 0 failed before and after the watched fault restoration.
- Initial plain Nx lint/typecheck calls exited 0 after daemon/plugin socket
  refusals without target execution. Those exits are not accepted as evidence.
  Reruns use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`.
- `bunx openspec validate cross-project-dependencies --json`: valid, 1 passed,
  0 failed; 15 existing long-requirement warnings.

- Combined new mounted and existing dependency-history suites:
  `bun test apps/wbs/be-01/src/controller/cross-project-incident-replay.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts --timeout=10000`:
  32 passed, 0 failed, 598 assertions.
- Final focused mounted suite: 2 passed, 0 failed, 62 assertions.
- `bunx eslint apps/wbs/be-01/src/controller/cross-project-incident-replay.controller.db.test.ts`:
  exit 0 after correcting the required interface style. The initial configured
  backend typecheck exposed an unknown SQL row type; adding an explicit
  `IncidentRow` query type fixed it.
- `bunx prettier --check` on the new test and this evidence: passed.
- `git diff --exit-code -- libs/wbs/application/core/src/service/incident-node-transition.ts`:
  exit 0, confirming the watched production mutation was fully restored.
- The first configured backend lint attempt exited 1 without diagnostics after
  2m17s; it ran while the test was still being corrected. Final configured
  results:
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:lint --skip-nx-cache`:
  configured backend lint passed, exit 0 (1m20s).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck --skip-nx-cache`:
  configured backend typecheck and its module prerequisite passed, exit 0 (27.3s).
- `git diff --check`: exit 0.

## Limits

No production activation, shared fixture changes, work-item service changes,
parent task completion, push, deploy or canonical h2puni/h4claw host gate is
claimed. This bounded packet covers mounted first-child mixed incoming/outgoing
replay and the creation-timestamp receipt fault. Existing history tests supply
broader corruption and authority-race coverage; this packet does not claim all
structural operations, all scope combinations or full task 4.4 acceptance.

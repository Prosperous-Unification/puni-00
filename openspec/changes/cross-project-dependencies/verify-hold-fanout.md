# Task 5.2 bounded blocked-hold dependency fanout (2026-10-23)

`setStatus('blocked')` persists a work-item hold that changes connected readiness,
including downstream `blocked_by_proxy` readings. The dependency fingerprint
previously omitted that hold; the scheduler input alone did not distinguish this
transition. `readDependencyFanoutIn` now includes `row.hold` beside the existing
row facts. It does not use project revision as semantic evidence.

The mounted `cross-project-hold-events.controller.db.test.ts` uses the production
composed `OrganizationHarness`, migrated SQLite and synthetic stored dependency
authority. It leaves release activation and authoring dormant. A→B→C whole SS
relationships have no assignments. Isolated and shared modes independently cover:

- Initially unknown A blocked through HTTP and initially blocked A cleared through
  HTTP `setStatus('unknown')`; these fixtures change only the hold.
- Durable A hold and both B/C next-read row/node proxy transitions, followed by
  exactly one A-caused `elsewhere_changed` per recipient and semantic transition.
- Repeated identical commands produce no additional dependency events; source A,
  disconnected same-organization and both foreign component projects stay silent.
  Complete external relationships and project revisions remain unchanged.
- Mounted undo/redo of both block and clear each publish their own exact B/C pair
  and restore the corresponding durable hold and row/node readings.
- A SQLite trigger aborting the second dependency-event insert returns 500,
  restores work items, progress, projects, external relationships, journal, plan
  events, event log, sequencer and organization audit, and leaves the push observer
  count unchanged. Restored B/C reads have no proxy block. The expected injected
  SQLite errors are reported by the normal endpoint logger.

## Watched proof

The initial mounted regression failed in both modes: B read `blocked_by_proxy`
while its expected event array was empty; the second-recipient trigger was not
reached (HTTP 200 instead of 500). After the complete suite passed, removing only
`row.hold` from the production fingerprint made all eight cases fail (0 pass,
8 fail, 148 assertions). All four block-first/clear-first cases verified the
changed durable hold and both B/C reads before failing on their absent event.
The two rollback cases again returned 200 instead of 500; the two history cases
failed on their first missing event. The member was restored before final checks.
An adjacent production `Proof:` comment names this fault and observation.

## Scoped verification

- `bun test apps/wbs/be-01/src/controller/cross-project-hold-events.controller.db.test.ts --timeout=30000`:
  8 pass, 0 fail, 502 assertions.
- `bun test apps/wbs/be-01/src/controller/cross-project-hold-events.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-attempt-events.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts --timeout=30000`:
  49 pass, 0 fail, 970 assertions after restoring the omission fault.
- `NX_DAEMON=false bunx nx run-many -t typecheck -p wbs-store-sqlite wbs-be-01 --skip-nx-cache`:
  passed both configured projects and backend module checking.
- `bunx --no-install openspec validate cross-project-dependencies --json`:
  passed with 18 requirement-length warnings in untouched specifications.
  Adding `--strict` returned 1 for those same warnings; strict validation remains
  unresolved by this bounded packet.
- `NX_DAEMON=false bunx nx run-many -t lint -p wbs-store-sqlite wbs-be-01 --skip-nx-cache`:
  passed both configured projects.
- Changed TypeScript files and this verification record pass Prettier checking.

Independent review, the integrated exact-SHA host gate, full CI and socket/browser
acceptance are not performed by this packet. Parent task 5.2 remains open.

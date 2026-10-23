# Saved-history lifecycle packet (2026-10-23)

This bounded task 8.3 packet exercises the installed saved-plan service and mounted
HTTP routes against real migrated SQLite in isolated and shared people modes. The
fixture captures mixed optimized/Fast connected scheduling with durable ready cache
rows. Each case makes two genuine saves, closes the writer, and reopens a fresh
store and service for every historical observation.

The saved read is compared with the originally stored input and schedule bodies,
including input bytes and SHA-256. Saved/saved comparison has no input or schedule
diff, retains connected mode, and exposes each exact canonical pre-selection stage
boundary. Mounted `GET /api/saved-plans/:id` and saved/saved comparison return the
same saved record and comparison. Capture, shared capture, scheduler, clock and ID
capabilities on the reader throw if invoked. Reopened reads and mounted requests
are repeated after foreign project rename, abbreviation, work number, step,
estimate and fact edits, and after deleting that foreign project and its
relationships.

Watched production-path faults are in
[`evidence/saved-history-lifecycle`](evidence/saved-history-lifecycle): routing a
historical read through `captureAndAttempt` failed both modes at the poisoned live
capability; independently routing saved/saved comparison through that same capture
failed both modes. Both faults were restored. The logs retain the test's original
`service/` path from before the final lint-required move to `http/elysia/`. The
`Proof:` comment is adjacent to the poison in the test.

Focused command: `bun test apps/wbs/be-01/src/http/elysia/saved-plan-connected-lifecycle.db.test.ts`
with the configured `--timeout=10000` — 2 pass, 0 fail, 78 assertions. Changed-file
ESLint and Prettier checks passed. Uncached
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-be-01:typecheck`
passed the backend and its module prerequisite. `bunx openspec validate
cross-project-dependencies --json` reported one valid change with existing
long-requirement warnings. `git diff --check` passed.

This is a bounded lifecycle proof. It
does not establish missing or unreadable required save evidence rollback, full
active writer integration, navigation access after deletion, client rendering,
or the canonical h2puni host gate. Parent task 8.3 remains open.

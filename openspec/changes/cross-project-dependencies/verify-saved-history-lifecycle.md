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
does not establish missing or unreadable required save evidence rollback,
production active-semantic rollout, navigation access after deletion, client
rendering, or the canonical h2puni host gate. Parent task 8.3 remains open.

## Integrated-head receipt (2026-10-23)

Astra High reviewed the corrected packet without remaining code findings. The
original commit's two evidence logs had four trailing-space lines; the
additive integration `4aa50eade` and normalization `a3f269785` preserve the
same observed fault output while passing exact committed-range whitespace
inspection. On `a3f269785`, running Bun's configured backend test runner over
`src/http/elysia/saved-plan-connected-lifecycle.db.test.ts`,
`src/service/saved-plan-connected-writer.db.test.ts`, and
`src/service/saved-plan-read.db.test.ts` passed 23 tests / 206 assertions in
7.24 seconds. The integrated lifecycle file itself passed both isolated and
shared cases. The packet's changed-file lint/format, uncached backend typecheck,
OpenSpec validation and independent fault receipts remain recorded above. The
full exact-head CI and h2puni gate, missing/unreadable save-evidence matrix and
parent 8.3 completion remain outstanding.

## Persisted external relationship edit acceptance (2026-10-23)

The earlier packet changed foreign metadata and then removed the relationship;
it did not change a live external relationship after saving. The lifecycle cases
now make both genuine connected saves with `ab` captured as SS, verify the stored
SQL type, update `ab` to FS on a separate connection and verify the persisted FS
row together with both project/work/step endpoint identities. This edit precedes
the first historical inspector, so every reopened read and mounted request runs
after the relationship has changed. Both isolated and shared modes retain SS and
the original node endpoint identities (`a1/a/design` → `a2/b/build`) in decoded
input9, exact original input/schedule body bytes and input hash, an empty
saved/saved diff, and the exact stage boundaries on **both** comparison sides.
Those assertions repeat after the existing foreign metadata/fact/estimate edits
and after deletion of the relationship and foreign project.

Independent production-path negatives were run against the changed cases:

- In `SavedPlanService.read`, after `resource.readPlan`, inject
  `await this.captureAndAttempt(opened.plan.projectId, { kind: 'legacy' })` for
  the read arm. Both post-edit cases fail at the injected live capture capability:
  **0 pass, 2 fail, 12 assertions, exit 1**.
  [Read receipt](evidence/saved-history-lifecycle/read-live-after-relationship-edit.log).
- At the entry to `SavedPlanService.compare`, independently inject
  `await this.captureAndAttempt(projectId, access)`. Both post-edit cases fail at
  the same live capability: **0 pass, 2 fail, 22 assertions, exit 1**.
  [Comparison receipt](evidence/saved-history-lifecycle/compare-live-after-relationship-edit.log).

Each fault was restored before the next run; the production feature has no final
diff. The adjacent `Proof:` comment names these new receipts. With production
restored, `bun test src/http/elysia/saved-plan-connected-lifecycle.db.test.ts
src/service/saved-plan-connected-writer.db.test.ts src/service/saved-plan-read.db.test.ts
--timeout=10000` from `apps/wbs/be-01` passed **23 tests, 234 assertions, 0 failures**.
The lifecycle file alone passed **2 tests, 106 assertions**.

The isolated worktree reuses `/home/df/wd/puni/puni-00/node_modules` via an ignored
symlink; `cmp bun.lock /home/df/wd/puni/puni-00/bun.lock` exited 0. No fresh install
was run. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-be-01:typecheck --skip-nx-cache` passed the backend and module prerequisite.
Changed-file ESLint passed after the Nx graph was generated; the initial lint
attempt exited 0 but reported that its module-boundary rule lacked a cached graph,
so that attempt alone was insufficient. Changed-file Prettier, change-specific
OpenSpec validation and whitespace checks passed.

Scope remains test and evidence only. Full Nx checks, canonical exact-SHA host
gate, production activation, push and deployment were not run. Navigation access,
other remaining save-evidence lifecycle cases and parent task 8.3 stay open.

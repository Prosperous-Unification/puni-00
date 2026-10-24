# Task 5.2 bounded bare-step dependency fanout

The mounted bare `POST /api/projects/:id/steps` and name-only
`PATCH /api/projects/:id/steps/:stepId` paths now take their dependency fanout
before/after observations on the admitted recovery writer. The new optional
`BeforeStepWrite` hook runs after the real StepService preflights: after
creation's resulting-graph check and usable-context assertion, and after
rename's clean-name and project/step authority gate. Storage's uniqueness
refusals still follow capture. Removal retains its separate existing hook after
its graph/reference/usage preflights. Combined allowance/unit PATCH requests
retain their command-batch path.

The scoped observation reuses the existing recovery admission and audit; it
does not admit or audit twice. The existing committed-fanout path writes events
in the same transaction and delivers them after commit and writer release.

## Mounted acceptance

`cross-project-events.controller.db.test.ts` adds ten cases:

- A → B → C with no assignments, in both isolated and shared organization
  modes. Bare A step creation changes B's whole-predecessor readiness from
  `waiting` to `unknown`; B and C receive exactly one A-caused invalidation.
- Name-only A step rename refreshes B's projected remote step name while
  preserving stable endpoint identity, qualified reference, relationship rows
  and readiness. Both modes invalidate exactly B and C. Repeating the same
  rename produces no new dependency invalidation.
- Unrelated same-organization and foreign projects remain silent; the complete
  event-log count excludes additional recipients. Invalid/duplicate adds and
  blank renames produce no dependency events.
- A real SQLite trigger aborts the second fanout event insert for add and
  rename separately. Step/project/work-item/audit/history/event/sequencer rows
  remain identical and no gateway push is attempted.
- Gateway delivery observes the committed step plus both durable fanout rows
  and obtains a separate writer, for add and rename independently.
- Broken capture preserves add's blank/invalid/reserved-code 422s and rename's
  blank-name 422 and foreign/absent-step 404s, with zero attempted captures,
  mutations or pushes. A valid request reaches the same broken capture,
  returns 500 and leaves the complete snapshot unchanged.

## Verification receipt

This packet is based on `d4cede3c9261dd97d758228adff272a615df7d0f`, in isolated
clone `/tmp/puni-step-fanout-52`, branch `fix/step-dependency-fanout`. Dependencies
reuse the already-installed workspace `node_modules` by symlink; this packet
has not independently established a frozen dependency installation.

Fresh command outcomes:

- Configured `nx run wbs-core:test --skip-nx-cache --output-style=stream`:
  exit 0, 1526 passed, 0 failed, 5989 assertions across 124 files.
- Configured `nx run wbs-be-01:test --skip-nx-cache --output-style=stream
--args='src/controller/cross-project-events.controller.db.test.ts
src/controller/step-marker-organization.controller.db.test.ts
src/controller/command-current-authority.controller.db.test.ts'`:
  exit 0, 143 passed, 0 failed, 1153 assertions across those three files.
- A restored focused `bun test
apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts
-t 'bare step' --timeout=30000`: exit 0, 10 passed, 0 failed, 175 assertions.

All configured Nx commands use `NX_DAEMON=false`,
`NX_ISOLATE_PLUGINS=false`, `NX_NATIVE_COMMAND_RUNNER=false`, and isolated
`NX_CACHE_DIRECTORY=/tmp/step-fanout-nx-cache` and
`NX_WORKSPACE_DATA_DIRECTORY=/tmp/step-fanout-nx-workspace`.

Watched independent production faults ran in a second isolated clone,
`/tmp/puni-step-fanout-52-proof`, so checks reading the implementation checkout
could not observe injected code:

1. Remove only the add hook call from real `StepService.addWithin`. Both
   mounted bare-step-add mode cases fail: B has no `elsewhere_changed` row
   instead of the expected A-caused row. Exit 1, 0 passed, 2 failed.
2. Restore add and remove only the rename hook call from real
   `StepService.renameWithin`. Both mounted bare-step-rename mode cases fail
   on the same missing B recipient. Exit 1, 0 passed, 2 failed.
3. Restore the hooks, then move capture ahead of `perform` in
   `runRecoveryWrite` and omit the late calls. Both broken-capture preflight
   cases fail: blank add/rename returns 500 instead of 422. Exit 1, 0 passed,
   2 failed. Restore all production code; the ten-case focused suite passes
   with 175 assertions.

The SQL-trigger and broken-capture cases intentionally log their injected
endpoint errors while asserting 500 and unchanged durable state. These are
expected test diagnostics.

Local logs: `/tmp/step-fanout-{core-tests,backend-tests,restored}.log` and
`/tmp/step-fanout-{add-capture-off,rename-capture-off,eager-capture}.log`.
The fault script restores both production files in a `finally` block.

An earlier parallel lint/typecheck invocation reported backend lint failure
without a diagnostic; it is not counted as passing. The configured commands
were rerun serially:

- Configured `nx run-many -t lint,typecheck -p wbs-core,wbs-be-01
--parallel=1 --skip-nx-cache --output-style=stream`: exit 0, both lint and
  typecheck targets plus both required module typechecks passed. Log:
  `/tmp/step-fanout-checks-final.log`.
- `bunx openspec validate cross-project-dependencies --json`: exit 0,
  valid with 18 existing long-requirement warnings and no errors.
  Changed-file Prettier and `git diff --check` passed.

No required local check remains unavailable for this bounded packet.

## Limits

This bounded writer correction does not finish the broader Task 5.2 writer
coverage audit or socket/browser acceptance. No exact-SHA h2/h4 host gate,
full backend suite, build, image rehearsal or production activation is claimed.
Task 5.2 remains unchecked.

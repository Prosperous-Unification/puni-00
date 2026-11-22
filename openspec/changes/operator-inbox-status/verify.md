# Operator inbox status verification

- `bun test apps/website/be-01/src/server.test.ts -t 'an operator can mark any workflow status irrelevant'` passed with 61 assertions. The mounted API test marks a request from Submitted, Reviewing, Contacted, and Closed. Each keeps its ID, receipt, email, and brief. The route rejects a missing CSRF token, a repeated mark, and an attempt to advance a marked request.
- The mounted inbox test exercises All statuses and each status option. Marking a closed request preserves the Closed filter selection and moves the request to the Irrelevant view.
- The local fixture command `bun /tmp/puni-inbox-status-smoke.mjs` ran Chromium and exercised sign-in, normal status progression, marking a closed request Irrelevant, and retrieving it under the Irrelevant filter against the local website API and SQLite.
- The migration test applied the forward and down SQL to a database with a pre-existing request. The request survived both operations. The website migration linter passed on the SQL pair with `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts libs/website/adapters/store-sqlite/src/migrations/016_submission_irrelevant/{migration,down}.sql`.
- `bunx --no-install openspec validate operator-inbox-status --strict` passed.
- `bunx --no-install prettier --check --ignore-unknown` passed for all changed files. `git diff --check` passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run-many -t test,lint,typecheck,build -p website-store-sqlite --output-style=static` passed after the final migration-test edit. SQLite reported 282 passing tests.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run-many -t test,lint,typecheck,build -p website-be-01,website-fe-01,website-store-sqlite,website-contracts,website-analytics --output-style=static` passed all 20 tasks, with nine cache hits. The five suites reported 1,247 passing tests and zero failures in total.

## Fault proofs

- Removing the route's CSRF guard let the mounted status test change a request using only the session cookie.
- Omitting the marker's null predicate let the mounted status test mark the same request twice.
- Omitting the normal update's irrelevance predicate let the mounted status test advance a marked request.
- Inverting the UI predicate made the Closed filter display the submitted request and omit the closed request.

## Release scope

The browser and migration checks used local fixtures. The full monorepo gate, deployment, and deployed-environment smoke checks were outside this change's validation scope.

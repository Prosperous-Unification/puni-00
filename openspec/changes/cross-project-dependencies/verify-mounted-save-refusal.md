# Mounted connected-save capture refusal — 2026-10-23

This bounded task 8.3 packet adds ten production HTTP refusal cases in
`saved-plan-connected.controller.db.test.ts`: absent foreign readiness status,
unreadable foreign metadata, and contradictory foreign project name, each in
isolated and shared mode. It changes no runtime behavior.

Each case creates an authenticated composed application with real SQLite and a
real Alpha → Beta relationship, then POSTs Beta's saved-plan route. The test
observes Alpha's actual `ProjectRepository.findInOrganization` on the exact
Drizzle connection returned by the injected read-only opener. It verifies one
read connection, closed before historical conversion. Faults affect the real
detached capture received by the production converter: delete Alpha's required
status, throw from Alpha's metadata lookup, or change Alpha's historical name
while keeping placement facts intact. Each injected fault is counted exactly
once and its precise exception is observed, excluding unrelated 500s.

Every refusal returns 500, preserves all tables discovered from `sqlite_schema`
(including saved bodies, optimizer state, journals, events and sequencers), and
leaves both every push invocation and saved-plan announcement counts unchanged.
After hooks are restored, the same application saves successfully with 201,
one header, two bodies and exactly one saved-plan announcement. No late insert
rollback or detached writer test is duplicated.

The additional source-boundary cases delete Alpha's actual persisted
`project_abbreviation` row or throw from its actual `WorkItemRepository.listByProject`
on the exact owned capture connection. They assert precise exception text, fault
reach once, one open, one close, one rollback, no remaining live read, all-table
identity and no push. They restore the missing address and repository hooks before
a successful save on the same application. Unlike the detached metadata cases,
these refusals happen inside the owned transaction before conversion.

## Watched controls

Independent temporary mutations were restored in Python `finally` blocks:

- [Missing-status proof](evidence/mounted-save-refusal/missing-status.log): replace
  both required status lookups with a fallback to Beta's status. Both mounted
  absence cases fail: expected HTTP 500, received unsafe 201 (0 pass, 2 fail).
- [Fact-agreement proof](evidence/mounted-save-refusal/contradictory-facts.log):
  remove `requireFact`'s metadata/read equality refusal. Both mounted contradictory
  cases fail: expected HTTP 500, received unsafe 201 (0 pass, 2 fail).
- [Persisted-address proof](evidence/mounted-save-refusal/absent-abbreviation.log):
  replace missing persisted address refusal with a valid invented address. Both
  source-boundary absence cases return unsafe 201 instead of 500 (0 pass, 2 fail).
- [Owned-rollback proof](evidence/mounted-save-refusal/owned-rollback.log): remove
  read transaction rollback calls. Both source-boundary unreadable-row cases
  observe zero rollback calls instead of exactly one (0 pass, 2 fail).
- [Owned-close proof](evidence/mounted-save-refusal/owned-close.log): remove
  read connection closes. Both source-boundary unreadable-row cases observe zero
  closes instead of exactly one (0 pass, 2 fail).
- Unreadability is the deliberately broken required lookup dependency itself;
  restored source observes its named injected exception, returns 500, closes
  the read and leaves all durable/publication state unchanged in both modes.

Adjacent source `Proof:` comments point to the watched mutation logs. These
controls were restored before final focused verification.

## Verification

Commands ran locally in `/tmp/puni-mounted-save-proof`, an isolated shared clone
at `14aea09578e845cf26dfb1a29e3cea5a3e4142bd`. Native worktree creation was blocked
by read-only `.git/worktrees`; the clone leaves the user's checkout untouched.
Existing dependencies are exposed through an ignored `node_modules` symlink.
No frozen install, host gate, full repository suite, CI, deployment, integration,
push or merge was performed. Parent task 8.3 and the integrated exact-SHA host
gate remain open.

Fresh verification receipts:

- `bun test apps/wbs/be-01/src/controller/saved-plan-connected.controller.db.test.ts apps/wbs/be-01/src/service/saved-plan-connected.test.ts apps/wbs/be-01/src/service/saved-plan-connected-writer.db.test.ts apps/wbs/be-01/src/http/elysia/saved-plan-connected-lifecycle.db.test.ts --timeout=30000`: 49 pass, 0 fail, 554 assertions across four files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint typecheck -p wbs-be-01 --skip-nx-cache --output-style=stream`: exit 0; backend lint/typecheck and dependent module typechecks succeeded uncached. Earlier lint runs failed on test typing/import issues, corrected before this receipt.
- Direct `bunx eslint` on the changed mounted test and three source comment files: exit 0.
- `bunx prettier --check` on all seven changed TypeScript/Markdown files: exit 0.
- `node_modules/.bin/openspec validate cross-project-dependencies --json`: exit 0, one valid change with existing long-requirement warnings.
- `node_modules/.bin/openspec validate --all --json`: exit 0, 273/273 items valid (255 changes and 18 specs).

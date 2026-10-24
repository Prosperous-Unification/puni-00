# Dormant activation slice A: P2 rereview

**Approved for the scoped dormant storage slice. No actionable new findings in the follow-up.** The original boolean protocol-version P2 is fixed. This is not approval for activation, deployment or task 10.1 completion.

Reviewed clean checkout `/tmp/puni-dependency-dormant` at `5e4435a7ae6bca1bc49dd8f42fc3a57b5f4fac03`, specifically its follow-up over `5ab49ed705ef78d5faa45dfa55ff3b159d544087`. Read the original `/tmp/puni-dependency-dormant-review.md`, the complete six-file follow-up, inspector, production repository test callers, rollback SQL and task/evidence records. No repository edits; the independent probe and this report are outside the checkout. Final `git status --short` was empty.

The three SQL triggers now require a JSON numeric type (`integer` or `real`) and value 1. That excludes JSON boolean true while preserving numeric 1.0 and 1e0, matching the strict parser. The inspector mirrors the changed definitions exactly. The new tests exercise real repository insert/update/delete with the admission override OPEN, observe native SQLite refusal, and compare the full side-effect snapshot. The fix does not add activation or startup wiring.

## Fresh independent evidence

- `bun /tmp/puni-dormant-protocol-probe.ts`: exit 1 at its actual external-dependency INSERT, with native `SQLiteError: external_dependencies_inactive` / `SQLITE_CONSTRAINT_TRIGGER`. The original reproduction expected successful admission and is intentionally not updated; this observed failure demonstrates closure of its finding.
- `bun /tmp/puni-dormant-protocol-rereview-probe.ts`: exit 0. New independent direct-SQL matrix runs the real migration runner into isolated temporary stores. All INSERT/UPDATE/DELETE actions refuse a full attributed receipt with literal JSON version true and preserve existing external rows. The strict inspector rejects that receipt too. All six action/version combinations using literal numeric 1.0 and 1e0 succeed, and the strict inspector returns the expected numeric version 1 receipt. Log: `/tmp/puni-dormant-rereview-probe.log`.
- The same independent probe removes only the new numeric-type predicate from each respective trigger in its disposable database. Each previously rejected boolean-version SQL action then succeeds and changes rows; the unchanged strict inspector rejects the altered trigger definition. Thus the new predicate is independently proved breakable for INSERT, UPDATE and DELETE, and the exact inspection mirror rejects each weakened definition. No tracked source or migration was mutated.
- `bun test libs/wbs/domain/contracts/src/dependency-runtime.test.ts libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts libs/wbs/adapters/store-sqlite/src/project-abbreviation-migration.db.test.ts`: exit 0; **157 pass, 0 fail, 374 assertions, four files**, 16.65 seconds. Log: `/tmp/puni-dormant-rereview-tests.log`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/migration.sql apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/down.sql`: exit 0.
- `git diff --check 5ab49ed705..5e4435a7ae6bca1bc49dd8f42fc3a57b5f4fac03`: exit 0.

The targeted tests freshly cover successful dormant rollback with local rows retained; refusal of enabled-empty rollback; refusal and ledger preservation for malformed/missing authority or replacement schemas; retained external-row refusal with full ledger and snapshot preservation; and atomic forward migration refusal over existing external rows. The follow-up changes no rollback SQL. Applied-migration hash enforcement remains the existing runner's responsibility; this review did not independently rerun its edited-migration cases.

The evidence record accurately limits the SQL check to protocol admission and keeps full attribution validation adapter-owned. Its 59 recorded mutation injections were inspected; only the three new numeric-type predicate mutations were independently re-exercised here. No claim is made that SQL performs full receipt or participant-proof validation.

## Retained task 10.1 and delivery limits

Tasks 10.1/10.2 remain unchecked. Startup refusal of unsupported ENABLED authority, including enabled-empty, and dormant retained external rows before listeners/workers/writes is still required. Commands/import/copy/history must consume one live authority. Backend, gateway and MCP capability declarations/handshakes, complete participant discovery and immutable image identity, reader/writer/background/retained-socket fencing, durable activation intent, receipt transport, independent commit readback, activation transaction/CLI and compatible attended recovery/removal remain outside this slice.

The inherited task 10.2 wording still says generic abort reverses migrations. Reconcile it on the integrated branch with the accepted architecture's preservation of bytes/evidence after possible activation/exposure and Compose's post-stop attended recovery requirement before claiming rollout readiness.

Full affected regression, formatter, full lint/typecheck, builds, fresh frozen installation, OpenSpec validation and h2/h4 exact-SHA host gate were not rerun in this scoped review. The prior evidence's browser-auth subprocess EPERM and preexisting store typecheck error remain uncleared by this review. No live activation, deployment or semantic downgrade safety is established.

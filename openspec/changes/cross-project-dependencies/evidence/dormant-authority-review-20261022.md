# Dormant activation slice A review

Reviewed commit `5ab49ed705ef78d5faa45dfa55ff3b159d544087`, base `351ce5d43adf6dd2d5ffd28085ce31800008187d`, in `/tmp/puni-dependency-dormant`. Review only; no repository edits. Read AGENTS.md, LLM_README.md, task 10.1/10.2, the architecture handoff, and ADR 0057 from `/tmp/puni-external-copy/docs/adr/0057-cross-project-dependency-activation-is-monotone.md` (that ADR is absent from the reviewed slice checkout).

## Finding

**P2 — Reject JSON boolean protocol versions in the independent SQL admission guard.** `apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/migration.sql:22` (also lines 33 and 44), mirrored by `libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.ts:25`.

Trigger: an ENABLED marker and receipt containing `{"protocol":"wbs-dependency-activation","version":true}`. SQLite `json_extract` converts JSON true to SQL integer 1, so the version comparison passes. A real independent SQL external-dependency insert succeeds, although `inspectDependencyActivation` rejects this persisted authority as an invalid receipt. Thus the SQL check does not enforce even the stated valid-protocol boundary. The existing wrong-version tests use numeric 2 and miss this coercion.

Require an appropriate JSON numeric type as well as value 1 (preserve compatibility with the TypeScript parser's numeric 1, including a JSON representation such as 1.0), mirror the exact trigger text, and add production repository insert/update/delete negatives for boolean version true. Watch the new type predicate fail when removed. Full attribution-field validation remains adapter-owned under the explicit slice A design; this finding does not demand participant-proof verification inside SQLite.

Reproduction: `bun /tmp/puni-dormant-protocol-probe.ts` against the real migration runner and connection emitted `SQL boolean-version receipt admitted: [{ id: "edge" }]`, followed by `adapter rejected: Error: invalid dependency activation receipt`. The script remains in `/tmp` and changes only its own temporary database.

## Bounded assessment

Apart from that narrow protocol validation issue, the slice matches the planned dormant storage boundary:

- Forward migration is additive and rejects preexisting external relationships atomically. Existing migration files are not rewritten.
- No production activation CLI, active override, source wiring or startup bypass was introduced. The authority seeder is under `testing/`, is not barrel-exported, and only test callers use it.
- Inspection verifies the required ledger identity, exact constrained table and trigger definitions, singleton state, and exact receipt shape. The getter rereads persisted authority on each access.
- Down migration preserves ENABLED authority even when external rows are empty, and refuses retained external rows, malformed authority and replacement table schemas. Existing runner hash validation remains responsible for edited migration refusal.
- The historical external-storage suite explicitly rolls back only the new authority migration. Connected storage/reader fixtures synthesize authority openly. Changed migration inventory/order expectations remain explicit; the abbreviation fixture's predecessor correction matches its intended migration boundary.
- SQL admission and strict adapter inspection are deliberately different boundaries. The triggers are not a defense against a database owner who changes authority tables/triggers. Monotonicity is currently a supported-operation and rollback contract, not an immutable ledger against arbitrary privileged SQL.
- Reviewed the checked-in mutation record and adjacent proof comments. They are implementation evidence, not independently re-executed mutation proofs in this review.

## Fresh verification

- `bun test libs/wbs/domain/contracts/src/dependency-runtime.test.ts libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts libs/wbs/adapters/store-sqlite/src/external-dependency-migration.db.test.ts libs/wbs/adapters/store-sqlite/src/project-abbreviation-migration.db.test.ts`: **151 pass, 0 fail, 361 assertions**, 4 files. Log: `/tmp/puni-dormant-review-tests.log`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/migration.sql apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/down.sql`: exit 0.
- Independent malformed-protocol SQL probe: exit 0, demonstrated the finding above.
- The checkout was initially clean. At review completion, two test files had concurrent edits (`cross-project-dependency-activation.db.test.ts` and `dependency-runtime.test.ts`); those were not made by this reviewer. The focused run and finding target the reviewed commit, not approval of those later changes.

Full affected regression, formatting, lint, typecheck, builds, fresh frozen install, OpenSpec validation and exact-SHA host gate were not rerun in this review. The implementation evidence already reports an unresolved browser-auth subprocess EPERM and a preexisting store typecheck error; this review does not clear either.

## Remaining delivery boundary

Tasks 10.1/10.2 must remain open. Startup must reject unsupported ENABLED authority (including enabled-empty) and dormant retained external rows before listeners, workers or writes. Commands/import/copy/history must consume one live authority instead of cached/constant admission. Backend, gateway and MCP capability declarations and startup handshakes remain absent. No coordinator establishes complete participant discovery, immutable image identity, reader/writer/background/retained-socket fencing, durable activation intent, receipt transport or independent commit readback. No activation transaction/CLI or compatible attended recovery/removal command is implemented here.

The task 10.2 wording in this checkout still says generic abort reverses migrations; the architecture handoff and accepted ADR require preserving current bytes and evidence after possible activation/exposure, and preserving Compose's post-stop attended recovery rule. Reconcile that wording on the integrated branch before claiming rollout readiness. No live activation, deployment or downgrade safety approval is given.

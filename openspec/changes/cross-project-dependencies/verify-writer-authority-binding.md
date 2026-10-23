# Writer authority binding — bounded task 10.1 correction

Base: `1c0724328`. This packet replaces production composition's inactive constants
with required catalog authority consumed at each external command/import admission
point. It adds no activation API, V1 advertisement, deployment change or permission
to activate. Parent tasks 10.1/10.2 remain open.

`ExternalDependencyAuthoringSource` preserves explicit semantic fixture objects and
adds a lazy reader. Explicit objects are validated eagerly; constructing the public
graph never invokes a borrowed reader. `PlanTransactionalStores` requires the
source capability. Memory adapters explicitly remain inactive. Public SQLite
catalog readers refuse; each admitted SQLite scope supplies a fresh reader over
its exact `BEGIN IMMEDIATE` owner and irreversible lifetime. Both unbound and
live-plan-bound UoWs install it. Working-plan catalogs preserve the same reader.
Import composition selects `scope.stores` inside its admitted transaction; explicit
lower-level semantic fixtures retain their original authority.

Every production read validates trusted durable authority afresh. DISABLED yields
inactive; ENABLED (including no relationships) throws unsupported semantic runtime.
A receipt or table presence cannot grant this binary semantic support. Missing,
malformed or unreadable authority throws. The external operation then abandons
its complete transaction, including earlier writes, history and durable events.

This operation seam preserves local-operation independence. It does not establish
global startup/current-client admission or independently fence every local-only
write when authority is ENABLED; existing runtime admission owns that policy.
Complete semantic runtime support and owner/participant proof remain outside this
packet. Conformance CRUD family keys exclude this source lifetime capability;
SQLite source and mounted consumer tests prove its ownership separately.
Readers resolve at most once: callable returns, including a self-returning reader,
are malformed authority rather than a higher-order source.

## TDD and watched R5 faults

The first three SQLite source tests failed before implementation: missing catalog
capability could neither distinguish a public reader nor supply borrowed authority
nor produce the required unsupported-runtime refusal. Restored implementation
passed them. Additional tests cover two simultaneously admitted independent
sources, deleted migration ledger, malformed ENABLED without receipt, removed
receipt schema, fresh reads after a prior successful read, and expired authority.

Six separate production mutations were run and restored; each selected run exited
1 with exactly one failing test:

| Injected fault                                   | Observed consumer failure                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public reader returns inactive                   | `public catalog cannot lend writer authority`: expected throw absent                                                                              |
| Remove borrowed lifetime guard                   | `borrowed authority sees staged writer state and expires after settlement`: expired reader answered                                               |
| Replace writer inspection with constant inactive | Same staged-writer test: deleted authority was hidden                                                                                             |
| Remove ENABLED unsupported-runtime refusal       | `enabled authority refuses unsupported production semantics even with no edges`: expected rejection absent                                        |
| Restore inactive command composition constant    | `mounted production commands reread writer authority after dormant refusal`: HTTP 409 instead of 500 after deleted marker                         |
| Restore inactive import composition constant     | `mounted production imports resolve fresh writer authority before external allocation`: HTTP 409 instead of 500 for ENABLED unsupported authority |

Root review identified unbounded recursive callable resolution. Two new tests
failed the recursive implementation: a returned callable gained active permission,
and a self-returning reader repeated invocation (the test bounds its own injected
fault). Resolution now happens once, followed by object/state validation. Seven
reader tests passed, including undefined/null/malformed returns and construction
without writer consumption.

Adjacent production `Proof:` comments identify these faults and tests. Mounted
controls assert the complete durable table snapshots are unchanged after refusal
and exception. The original dormant controls now use actual DISABLED storage;
synthetic active lower-level fixtures remain explicit. Expected malformed trusted
state and unsupported-runtime HTTP 500 tests emit structured error diagnostics.

## Verification

- Focused source + mounted production controls: 14 passed, 0 failed before final formatting.
- Broad scoped regression: 1910 passed, 2 failed across 141 files. Both failures
  were exact memory-catalog key assertions missing the new required capability.
  After correcting those assertions and four duplicate fixture fields exposed by
  module typechecking, the complete affected subset passed: 88 tests, 0 failures
  across six files (memory-source, four work-item fixture suites and the new source
  authority suite). No unrelated failing test remains from that run.
- Final mounted production controls: 5 passed, 0 failed, covering dormant rollback,
  malformed fresh authority and ENABLED unsupported-runtime command/import refusal.
- `bunx openspec validate cross-project-dependencies --json`: passed.
  `--strict --json`: exit 1 solely for existing long-requirement WARNINGs in
  unchanged `spec.md`; this packet does not rewrite shared spec artifacts.
- Final focused source, bounded-reader and mounted controls: 21 passed, 0 failed
  across three files after the review correction and lint fixes.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p wbs-core wbs-store-sqlite wbs-store-memory wbs-conformance wbs-be-01 --parallel=1 --outputStyle=stream`:
  passed all five projects plus two module-typecheck dependencies, zero cache hits.
  After the bounded-reader correction, fresh direct `bunx tsc --build --force`
  for the core and SQLite project configurations also passed.
- Configured Nx lint passed core, memory and conformance; after fixing new SQLite
  test callback/matcher lint, `bunx nx run wbs-store-sqlite:lint` passed separately.
  Final staged-file ESLint passed all changed TypeScript, including new tests.
- Final changed-file Prettier check and `git diff --check` passed.
- The first parallel Nx attempt hit sandbox Unix-socket EPERM; disabling daemon
  and plugin isolation used Nx's in-process mode. Its cancelled typecheck and
  diagnostic-free lint failures were superseded by the serial successful checks.
- Normal repository hooks are installed and required for the packet commit.

## Limits

No h2puni/h4claw integrated gate, push, deployment, activation, image/supervisor
work, V1 semantic proof or parent-task completion is claimed.

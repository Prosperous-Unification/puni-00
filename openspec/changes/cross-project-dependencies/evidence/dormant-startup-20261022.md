# Task 10.1 bounded startup refusal — 2026-10-22

Scope: TDD slice B, based on `7efc7c029`. The compiled backend capability is
`wbs-dependency-runtime` version 1, role `backend`, with frozen empty semantics.
There is no boot override, activation operation or deployment change. Task 10.1
remains unchecked.

`bootBe01` owns an `admittedSource` provider. Development migration runs before
inspection; production inspects the migrated store without running migrations.
The existing step-blockage check and the cross-project authority inspector run
before backfill, local identity creation, browser/service factories, retention,
listener, optimizer or DNS worker startup. Browser, services and server depend
on the admitted source; retention depends on services. Admission failure closes
the owned source. Existing readiness and reverse disposal remain covered.

## Red, green and watched faults

The first useful red run of
`bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts -t refuses`
failed five tests: the original boot reached browser, services and app factories
for enabled-empty, missing, unreadable-table, malformed and disabled-with-receipt
authority. After adding pre-service admission the same five tests passed. The
retained-external-edge case was added with its predicate disabled and failed by
reaching service/app factories, then passed with the predicate restored.

Final negatives run real boot, with actual listener and DNS lifecycle forwarding
and observable retention/optimizer state. An injected authority read error is
reported through the real DiBag failure chain and the real source closes. The
synthetic persisted authority fixture establishes storage state only; none of
these tests claims complete participant exclusion or real activation.

Four temporary faults were applied separately, each test run exited 1, and all
production files were restored:

| Fault                                                            | Selected real boot test | Observed unsafe behavior                                                                                |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Remove `assertDependencyRuntime` invocation                      | `enabled empty`         | A `local-dev` users row was persisted; unchanged-store assertion failed.                                |
| Disable ENABLED/semantic-support refusal                         | `enabled empty`         | A `local-dev` users row was persisted; unchanged-store assertion failed.                                |
| Disable DISABLED/retained-edge refusal                           | `retaining`             | A `local-dev` users row was persisted; unchanged-store assertion failed.                                |
| Replace all admitted-source factory dependencies with raw source | `enabled empty`         | Listener and DNS started; retention and optimizer were running. The starts assertion reported all four. |

Removing only one of the redundant direct admitted-source dependencies remains
protected by the other factories' transitive dependencies. The fourth fault
therefore removes the admission cut across all three factories. It does not
claim that every redundant edge independently permits unsafe boot when removed.
The authority inspector's individual persisted-state predicates retain their
separate slice-A proofs.

## Verification

- `bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts apps/wbs/be-01/src/boot.db.test.ts apps/wbs/be-01/src/domain-proof.boot.db.test.ts apps/wbs/be-01/src/boot-browser-session.db.test.ts apps/wbs/be-01/src/authoritative-dns.boot.db.test.ts apps/wbs/be-01/src/boot-email-delivery.db.test.ts`: **85 pass, 0 fail, 312 assertions**. This includes the actual pre-migration development boot, source failure disposal, occupied-port refusal and DNS join/abort regressions.
- Final focused boot rerun after removing a duplicate assertion and updating the lifecycle test name: `bun test apps/wbs/be-01/src/cross-project-dependency.boot.db.test.ts apps/wbs/be-01/src/boot.db.test.ts`: **42 pass, 0 fail, 115 assertions**.
- `bun test libs/wbs/domain/contracts/src/dependency-runtime.test.ts libs/wbs/adapters/store-sqlite/src/cross-project-dependency-activation.db.test.ts`: **113 pass, 0 fail, 183 assertions**.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit **0**, no diagnostics.
- `bunx openspec validate --all --json`: **268 passed, 0 failed** (250 changes, 18 specs).
- Focused ESLint runs after building the Nx project graph, scoped Prettier checks and `git diff --check`: passed.

Bun tests with listeners required sandbox escalation because loopback bind was
otherwise refused with EPERM. Dependencies were reused from the existing local
workspace via an untracked node_modules symlink; this is not a frozen-install
proof. The full exact-SHA h2/h4 gate, CI secrets/migration checks, production
activation, participant inventory, gateway/MCP handshakes, deployment rehearsal
and runtime semantic support remain unverified by this packet. No full gate or
production readiness claim is made.

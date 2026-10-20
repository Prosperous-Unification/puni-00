# Verification Report

## Isolated scheduler checkpoint

Base: `87a2b7edbfaabae889d91daa823f16f520a51cec`. This checkpoint implements the injected scheduling loop only; it does not activate production scheduling or change the existing core service.

- `bun test apps/wbs/be-01/src/runtime/domain-proof-worker.test.ts`: 6 pass, 0 fail, 19 assertions.
- Red baseline: new test file failed because `startDomainProofWorker` was absent.
- `bunx eslint` for both worker files: exit 0. Nx module-boundary rule skipped because the isolated clone has no cached project graph; this rule remains unverified.
- `bunx prettier --check` for both worker files: passed.
- `bunx @fission-ai/openspec@1.12.0 validate organization-domain-proof-scheduling --json`: 1 passed, 0 failed, no issues.

## Failure proofs

All mutations were applied separately to the production worker and restored before the green run.

| Check                         | Injected fault                                | Observed production-path failure                                                |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| Immediate sweep               | Remove sweep call                             | `sweeps immediately`: expected 1 call, received 0                               |
| Serialization                 | Remove sweep await                            | `joins a running sweep`: expected 0 waits while held, received 1                |
| Stop cancellation             | Remove abort call                             | `aborts and joins in-flight work`: expected aborted signal true, received false |
| Stop join                     | Return resolved promise instead of completion | Same test: expected stopped false while lookup held, received true              |
| Post-stop wait refusal        | Remove post-sweep cancellation check          | Same test: expected 0 waits after stop, received 1                              |
| Production timer cancellation | Remove abort listener                         | `joins cancellation of the production timer`: timeout after 200 ms              |

## Bounded sweep checkpoint

The runtime now validates its limit (integer 1 through 32), reads the repository's fully validated due snapshot set, sorts by last check time then claim ID, and selects the bounded lookup/commit batch. The repository still materializes and validates all verified claims. This is not a bounded database read.

Red baseline after fixing the activation fixture: matching and missing-TXT startup checked 65 instead of 32; the one-claim oldest-first case checked 2 instead of 1. The activation fixture now explicitly removes the irreversible trigger to model storage rollback, as the existing mounted currentness test does.

- `bun test apps/wbs/be-01/src/runtime/domain-proof-worker.test.ts apps/wbs/be-01/src/runtime/domain-proof-worker.db.test.ts apps/wbs/be-01/src/controller/domain-organization.controller.db.test.ts`: 68 pass, 0 fail, 245 assertions. Existing endpoint fault-injection tests emitted their expected error reports.
- Both 65-claim scheduler cases observed 32, 32 and 1 checked claims. Missing TXT preserved all 65 last-success times and verified ownership during grace.
- Focused ESLint for all three worker files: exit 0, with the same unverified module-boundary-rule warning.
- Changed-file Prettier formatting and change-specific OpenSpec validation passed (1 change, no issues).

Additional separately watched and restored production-path mutations:

| Check                         | Injected fault                                   | Observed failure                                                                        |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Integer batch limit           | Remove integer validation                        | Invalid-limit test accepted NaN instead of throwing RangeError                          |
| Positive batch limit          | Remove lower bound                               | Invalid-limit test accepted zero                                                        |
| Maximum batch limit           | Remove upper bound                               | Invalid-limit test accepted 33                                                          |
| Batch selection               | Remove slice                                     | Both scheduled progress cases checked 65 on startup instead of 32                       |
| Oldest-first selection        | Remove timestamp ordering                        | Selected claim-00 instead of older claim-01                                             |
| Stable tie-break              | Remove ID ordering                               | Both progress cases selected reverse-inserted IDs instead of claim-00 through claim-31  |
| Full trusted-state validation | Replace repository missing-proof throw with skip | Malformed out-of-batch claim was hidden; worker returned checked 32 instead of throwing |
| Digest currentness            | Remove repository digest comparison              | Changed proof committed checked 1 instead of stale 1                                    |
| Timestamp currentness         | Remove repository timestamp comparison           | Changed check timestamp committed checked 1 instead of stale 1                          |
| Release currentness           | Remove repository missing/status check           | Released snapshot threw TypeError on absent current claim instead of returning stale 1  |
| Activation currentness        | Remove repository finish-time activation check   | Rolled-back activation committed checked 1 instead of stale 1                           |

Existing repository proof comments remain adjacent to the currentness and trusted-state guards; repository source was restored byte-for-byte after mutations.

## Pending work and checks

Cancellation before proof commit, modeled DNS failure contract, production boot/disposal binding, entrypoint failure ownership, exact Astra review and push remain pending. Full typecheck, build, host gate, CI, external live-domain evidence, spec synchronization and archive have not run. The full feature is not complete.

## Core modeled failure and pre-completion cancellation checkpoint

New core tests first observed a missing error export, then seven failures against the old service: unexpected errors were recorded as failed proofs; pre-abort read storage; snapshot-read and DNS cancellation still committed; the lookup signal did not abort; delayed unexpected cleanup was hidden. The new core contract exports DomainDnsUnavailableError without framework dependencies. Core catches that expected class only, propagates unexpected failures, forwards parent cancellation to DNS, joins modeled cancellation through the resolver, and checks cancellation before reading, looking up and completing proof work.

Focused green run: 17 tests passed, 0 failed, 42 assertions across the new core service tests and repository worker tests. A day-fourteen repository case observed no timestamp change or suspension after cancellation during DNS.

Seven separately watched and restored mutations failed: remove typed error narrowing; return early for parent abort before narrowing unexpected errors; remove the composed lookup signal; race parent abort before resolver cleanup; remove pre-read cancellation; remove pre-lookup cancellation; remove pre-completion cancellation. Receipts are `/tmp/domain-proof-cancellation-*.log`.

Race reproduced at this historical checkpoint (resolved below): held-gate RED fixture saved at `/tmp/domain-proof-worker.queued-cancellation.db.test.ts` showed a cancelled queued completion still wrote last_checked_at=1210600000 instead of 1000000 and suspended the claim. The proposed transaction-entry signal/outcome amendment is in design.md; production port/store cancellation change awaits Astra review. DNS adapter subclassing, boot and entrypoints remain untouched. This checkpoint does not claim full cancellation safety or feature completion.

Final checkpoint regression: `bun test` for core proof service, runtime worker unit/DB, and mounted domain controller suites passed 77 tests, 0 failed, 265 assertions. Focused ESLint exited 0 (module-boundary rule still skipped); formatting and change-specific OpenSpec validation passed. Full gate, typecheck/build and adapter integration remain unverified.

## Queued completion cancellation checkpoint

Astra approved the optional trailing AbortSignal on finishProofCheck and the explicit cancelled outcome. The immediate transaction now checks cancellation after the write gate, before mutations. Core forwards that signal and returns partial counts without incrementing checked or stale counts for cancelled completion. There is no asynchronous boundary after transaction admission; an admitted synchronous transaction may complete and is counted truthfully.

New repository integration tests first failed for both matching and missing TXT on day fourteen: matching proof advanced both timestamps after stop; missing TXT advanced the check timestamp and suspended the claim. The partial-count core test also failed by counting cancellation as stale. These tests now pass, including stop remaining pending until the held write turn releases. They are repository integration tests, not HTTP-mounted evidence.

Five separately watched production-path mutations were restored before verification:

| Fault                                          | Observed failure                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Remove runtime signal forwarding               | Both queued completion cases mutated timestamps; missing TXT suspended      |
| Remove core finishProofCheck signal forwarding | Both queued completion cases mutated timestamps; missing TXT suspended      |
| Remove transaction-entry cancellation check    | Both queued completion cases mutated timestamps; missing TXT suspended      |
| Remove explicit cancelled-count branch         | Partial counts returned stale=1 instead of stale=0                          |
| Return immediately from stop                   | Both queued cases observed stopped=true while the write turn was still held |

Receipts: `/tmp/domain-proof-queued-*.log`. An additional repository case verifies cancellation during the already-admitted synchronous commit clock still returns checked=1 and the committed timestamps. A core case preserves completion exceptions raised after parent cancellation. Adapter files, boot and entrypoints remain untouched; no push was performed.

Verification for queued completion checkpoint: the same four focused suites passed 82 tests, 0 failed, 276 assertions (`/tmp/domain-proof-queued-checkpoint-tests.log`). Focused ESLint for the six changed code files exited 0; the absent cached Nx graph still skips module-boundary lint. Change-specific OpenSpec validation returned 1 valid change with no issues. Changed-file formatting and whitespace checks passed. Full typecheck, build, host gate, CI, adapter integration, production activation and external live-domain evidence remain unverified.

## Boot, adapter and process ownership integration

The reviewed DNS successor `0f6f8f2796ef4eab0a8f8a4e9fcbf0fdcc7e9798` was merged with ancestry preserved at `161c225cc`. The private expected error now subclasses the framework-free core DNS unavailable error. Boot shares one mounted domain repository/resolver with the immediate sweep and owns its stop/join disposer before yielding. Scheduler configuration defaults to enabled with authoritative DNS and disabled without it; explicit enabled without DNS fails before source/listener acquisition.

RunningBe now exposes a terminal failure latch with synchronous observer replay. Unexpected worker rejection and premature normal completion are observed before their first asynchronous turn can be lost. Both entrypoints use the shared supervisor: background failure initiates memoized disposal, a signal uses the same path, disposal is awaited before exit, and failure wins a concurrent signal. Failure during shutdown remains terminal.

The new boot suite uses the existing real-app makeApp/startListener composition seams with a virtual listener because native listen returned EPERM in this sandbox. It exercises the real boot, repository, core service and authoritative adapter. This is boot/repository composition evidence, not live socket or external-domain evidence. The entrypoint tests run both real entrypoint scripts in separate Bun subprocesses with boot/solver boundary fixtures and the real supervisor, proving disposal markers are written before exit 1.

Initial RED evidence included absent supervisor module, absent RunningBe failure source, and missing configuration refusal. Final serial focused command selected the core proof service, worker unit/SQLite suites, boot scheduling, supervisor, both entrypoints, config, existing authoritative-DNS boot, mounted domain controller, and all four DNS adapter unit suites: **304 pass, 0 fail, 800 assertions across 13 files, 21.01 seconds**. Full output: `/tmp/domain-proof-scheduler-final-tests.log`.

The watched fault set is recorded in [proofs/boot-faults.json](proofs/boot-faults.json). At `05fb0b0ba`, 24 mutations established production behavior failures. The original listener-first receipt was invalid: its edit left an empty if body and produced `Unexpected }`, so its exit code proved no listener behavior. The correction below replaces that receipt with a valid behavior failure, bringing the corrected set to 25. The list covers:

- missing-DNS admission; explicit/default scheduling selection; worker startup binding; shared resolver binding;
- owned release; awaited release; listener-first release;
- startup before listener/schema readiness; worker rejection observation; premature completion; expected-stop distinction;
- adapter modeled-error inheritance; organization activation read;
- first-failure latch; observer registration; already-latched replay;
- repeated and reentrant shutdown memoization; awaited shutdown; disposal-failure and concurrent-background-failure exit outcomes; failure-triggered shutdown;
- configuration enum; each real entrypoint supervisor binding.

The missing worker-stop await initially survived the original ten-microtask assertion. The test was strengthened to hold DNS cleanup across a full event-loop turn. Repeating the same fault then observed `close` while only `abort` was permitted. No joined-disposal claim relies on the earlier weak test.

Additional green cases prove absent organization marker is not recreated and performs no DNS, failed synchronous listener/schema admission starts no worker, stop waits for held DNS cleanup and held write admission before SQLite closes, repeated stop closes once, expected stop produces no background failure, and actual DnsCleanupError remains terminal during stop. Prior 32/32/1, per-process serialization, currentness and queued-cancellation proofs remain in the selected regression run.

No full local Nx, build, typecheck, browser, native socket, live DNS ownership, hosted CI, exact-SHA h2puni gate, deployment, synchronization, archive or push has been performed for this checkpoint. Module-boundary lint remains unverified without a cached Nx graph. External attended domain evidence remains open; this source checkpoint does not close WBS010.5.4.

Reproduction command for the final focused regression:

```sh
bun test libs/wbs/application/core/src/service/domain-proof.service.test.ts \
  apps/wbs/be-01/src/runtime/domain-proof-worker.test.ts \
  apps/wbs/be-01/src/runtime/domain-proof-worker.db.test.ts \
  apps/wbs/be-01/src/runtime/be-supervisor.test.ts \
  apps/wbs/be-01/src/runtime/be-entrypoints.test.ts \
  apps/wbs/be-01/src/domain-proof.boot.db.test.ts \
  apps/wbs/be-01/src/config.test.ts \
  apps/wbs/be-01/src/authoritative-dns.boot.db.test.ts \
  apps/wbs/be-01/src/controller/domain-organization.controller.db.test.ts \
  apps/wbs/be-01/src/runtime/authoritative-dns/*.test.ts --timeout 10000
```

Fresh focused ESLint exited 0 for all twelve changed TypeScript files (with the disclosed module-boundary warning). Changed-file Prettier and whitespace checks and both scheduler/DNS change validations are recorded at the source checkpoint. Exact Astra source review remains pending before publishing.

## Listener-first evidence correction

Astra identified the original listener-first mutation as a syntax error rather than a production-path negative. That receipt is excluded from the original checkpoint's valid count; the earlier claim of 25 observed behavior failures was incorrect.

The corrected edit targets only the exact server `disposeService` block, replacing the entire async listener disposer with `disposeService: () => Promise.resolve(),`. The startup-rollback if statement is left intact. The valid module executed the boot-owned shutdown test and reached `expect(listenerStops).toBe(1)`: **expected 1, received 0**, with one failed test and no syntax error. Controlled DNS cleanup is now always released in a test `finally` block, including after the intentionally failing assertion. The listener disposer source was restored byte-for-byte before adding the adjacent corrected Proof comment.

Watched command:

```sh
bun test apps/wbs/be-01/src/domain-proof.boot.db.test.ts \
  --test-name-pattern 'stop aborts DNS' --timeout 1500
```

The corrected [listener-first receipt](proofs/boot-faults.json) records exact before/after mutation text, command, assertion output, and matching original/restored source hashes. Fresh restored control: `bun test apps/wbs/be-01/src/domain-proof.boot.db.test.ts` — **13 pass, 0 fail, 48 assertions**, 2.65 seconds. No production behavior changed in this correction. The prior 304-test run is historical evidence; it was not repeated for this evidence/test-cleanup-only successor. No full gate or heavy checks were run.

## Source and merge reconciliation — 2026-10-19

[The parent reconciliation](../organization-ownership-and-access/verify.md#source-and-merge-reconciliation--2026-10-19)
verifies merged checkpoint `05fb0b0ba` and PR #565 ancestry. Current `bootBe01`
starts configured retained-proof scheduling, owns stop/join before storage
disposal and exposes background failure to the shared entrypoint supervisor.
The worker is implemented; earlier local-only and unwired annotations retain
their checkpoint meaning.

Live resolver/egress configuration, activated-domain observation and attended
acceptance remain open. No new runtime test, gate or activation result is
claimed, and the review/acceptance checkbox remains unchanged.

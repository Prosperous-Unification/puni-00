# Bounded connected optimizer runtime handoff

2026-10-22, isolated clone `/tmp/puni-connected-runtime`, base `5cb98ca31`.

This supplies the deterministic connected exit evaluator and a synchronous captured
adapter bridge for task 7.3. It does **not** complete 7.3 or 7.4, install connected
runtime support, or change the existing required-capability refusal.

The bridge computes SHA-256 of canonical stage bytes and of the full tuple
`(projectId, inputHash, objective, installed contract, budget, quantum, wire version)`.
It prepares both actual connected requests and passes them together to an explicit
read-only `readPair` source. A test drives the production core selector through this
adapter, observes the exact fixed foreign requests, evaluates a response with the
real domain materializer and selects only the configured engine/objective. The next
stage sees the earlier replacement while a Fast-selected project keeps its placement.

The connected exit evaluator verifies the request against the authoritative stage
before classifying response status. It preserves direct quantized contradictions and
solver boundary infeasibility as distinct in-memory evidence carrying the actual
stage, request and mathematical finding/response. Boundary-free infeasibility retains
ordinary local deadline classification; unknown and invalid output cannot certify.
Whole-component replay validates the exact foreign pins and local real constraints.
The Q48 candidate at `10/48` that reconciles fixed foreign C from `1.208333334` is
refused as `invalid-output` despite passing integer request-relative validation.

## Verification

- Initial tests failed at absent modules; after adding explicit unimplemented stubs,
  the corrected production fixtures failed on those stubs before implementation.
- Baseline focused connected request/core selection run: 59 pass, 0 fail.
- Restored solver contracts plus connected publication/canonical/core/adapter suites:
  558 pass, 0 fail across 31 files (the command below).
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`: exit 0.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-connected-runtime-graph.json`:
  created the graph. The initial socket-based invocation printed refusals, exited 0
  and supplied no graph; that invocation is not evidence of a usable graph.
- Focused `bunx eslint` over the four new TypeScript files after graph creation:
  exit 0, including module-boundary rules. The earlier no-graph runs skipped that rule.
- `bunx prettier --check` over the four new TypeScript files and `tsconfig.base.json`:
  all matched files conform.
- `bunx openspec validate cross-project-dependencies --json`: one change passed,
  zero issues.

```sh
bun test libs/wbs/domain/contracts/solver/src \
  libs/wbs/domain/domain/src/connected-publication.test.ts \
  libs/wbs/domain/domain/src/canonical-connected-stage-input.test.ts \
  libs/wbs/application/core/src/service/connected-optimization.test.ts \
  libs/wbs/adapters/store-sqlite/src/connected-optimization-reader.test.ts
```

## Watched R5 negatives

Each fault was injected separately into its real production dependency and the
named Bun suite exited 1; each source was restored before the passing run. Logs are
temporary `/tmp/puni-connected-fault-*.log` execution artifacts.

| Injected fault                                                  | Observed failure                                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Bypass request-relative refusal                                 | Forged foreign request is accepted as a terminal certificate in the malformed echo/request test (8 pass, 1 fail at that run). |
| Map solver boundary infeasibility to failed                     | Exit test receives `failed`, expected `boundary-infeasible` (8/1).                                                            |
| Map adapter boundary state to failed                            | Fractional 10/9 production adapter/core selection receives `failed`, expected boundary state (4/1).                           |
| Drop foreign pins in real connected publication replay          | Real captured adapter selection fails its fixed/current placement assertions (4/1).                                           |
| Drop both exact foreign start/finish comparisons in real replay | Integer-valid fractional drift response becomes `ok`, expected `failed/invalid-output` (9/1).                                 |
| Omit objective from full question hash                          | Request-pair builder rejects equal hashes through the real captured adapter path (1 pass, 4 fail).                            |
| Remove trusted captured replay from exit evaluation             | Forged finish 999 no longer throws the required baseline replay failure (8/1).                                                |
| Remove preflight evidence detachment                            | Certificate's retained C start changes to 999, expected 1.2 (8/1).                                                            |
| Bypass ordinary/boundary discriminator                          | Effective-boundary fixture with a nonbinding deadline fabricates local deadline evidence (9/1).                               |
| Permit an empty local deadline certificate                      | Boundary-free/no-deadline infeasibility becomes a certificate instead of invalid output (9/1).                                |

The initial ordinary/boundary fault was masked by the later empty-certificate guard
when no deadline existed (10 tests stayed green). Adding a nonbinding deadline 10
made the classification error observable, then the separate fault failed as above.
No proof is claimed from the redundant initial fixture.

## Required installation and unverified work

`connectedOptimizationReaderOf` requires a coherent `readPair` implementation bound
to the same owned/borrowed snapshot as component capture. This packet supplies no
SQLite implementation, runtime constructor registration, source lifetime wrapper or
live reader. The lifetime test proves that callback refusal propagates on every read;
it does not prove real database snapshot isolation. The callback has no admission
method, and current tests run no generation/queue/slot/event writers, but a genuine
SQLite read-only integration negative remains required.

The current core certificate projection remains its existing question/evidence
summary. Full detached evidence exists in the new contracts evaluator; strict stored
certificate/result envelopes, durable companion-table retention, coherent conflicting
outcomes, publication fencing, post-close admission, queued/restart/Retry recapture
and exact terminal durability are still 7.4 work. Raw response evaluation here is not
a persistence codec or an installed process supervisor integration.

No shared tree/resource integration, production publication/restart test, Python
runtime/installed handshake, full host gate, secrets scan or migration lint was run.
No schema, migration, runtime manifest or activation barrier changed. The full host
gate remains required before claiming integrated completion.

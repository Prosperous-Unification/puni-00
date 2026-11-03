# Verification Report

**Change:** website-conversation-readiness

**Date:** 2026-11-03

**Verifier:** implementation agent; independent controller review and actual QA pending.

## Completeness and correctness

Four scoped implementation slices complete; full backend suite and scoped checks passed. All three delta requirements map to implementation and focused tests:

| Requirement                        | Implementation                                    | Evidence                                                                                                                          |
| ---------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Concrete exploration guidance      | system-prompt.ts; explicit v9 shared presentation | Policy/source equality, mounted exploration and historical replay tests; actual model behavior remains unverified                 |
| Bounded positive provider evidence | eval-provider.ts; eval-usage.ts                   | Mounted API/SDK and direct meter fixtures for exact fields,401/403/503, missing/malformed/truncated/oversized/unreadable metadata |
| Explicit guarded attack evaluation | eval-scoping.ts; eval-cli.ts; named corpus opt-in | Mounted prefix, wire/state, unknown full reservation, exact operation, single call and real synthetic manual submission           |

The manual submission occurs after attack state/prefix assertions, in the evaluator's in-memory store; no email is sent. A guarded outcome omits confirmedReplies/streamEqualsStored and reports confirmedPrefixEqualsStored plus confirmedPrefix safety assertions. Ordinary confirmed answers retain all original checks. No canContinue/refusal/storage migration change.

## Structural validation

`bunx @fission-ai/openspec@1.12.0 validate --all --json` exited0:320items,320passed,0failed (301changes,19specs). Delta sync remains pending archive; the new delta explicitly supersedes earlier active v8 identity wording. Only the stale harness absent-usage sentence is corrected; historical evidence remains unchanged.

## RED / GREEN

- V9 policy/identity: initial run64pass/3fail; after implementation67pass/0fail (224 then234assertions) across prompt/shared tests.
- Guarded mounted positive initially failed corpus field validation because the declaration was unsupported.
- Metadata-header test initially failed (expected enabled, received null); after observer implementation it passed without exporting private fixture content.
- Focused evaluator run67pass/0fail,281assertions,15.81s before later fault coverage was added.
- Mounted wire/state/manual/extra-call negative group11pass/0fail,32assertions before later prefix/accounting cases were added.
- Provider fixture debugging: missing required total_tokens made SDK usage unconfirmed; corrected synthetic envelopes. No product fallback added.

## Failure proofs

Every mutation was restored in finally before the next mutation. All30mutations produced a real failing selected test. Faults were applied only to this owned clone. The initial-prefix proof replaces the entire guarded gate to show that failed initial inference would otherwise be incorrectly accepted; it is broader than an individual clause mutation. Malformed/unreadable proofs rethrow the observational failure, proving original-response preservation matters.

| Check                | Injected fault / selected test                                                                                                           | Observed result                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| status               | Removed its predicate/dependency; `generic401`                                                                                           | Exit1; 1 fail; 3 expect() calls  |
| stage-type           | Removed its predicate/dependency; `wrong-type`                                                                                           | Exit1; 1 fail; 3 expect() calls  |
| stage-name           | Removed its predicate/dependency; `wrong-name`                                                                                           | Exit1; 1 fail; 3 expect() calls  |
| action               | Removed its predicate/dependency; `wrong-action`                                                                                         | Exit1; 1 fail; 3 expect() calls  |
| detected             | Removed its predicate/dependency; `wrong-detected`                                                                                       | Exit1; 1 fail; 3 expect() calls  |
| error-envelope       | Removed its predicate/dependency; `missing-error`                                                                                        | Exit1; 1 fail; 3 expect() calls  |
| body-bound           | Removed its predicate/dependency; `too-large`                                                                                            | Exit1; 1 fail; 3 expect() calls  |
| pipeline-bound       | Removed its predicate/dependency; `excessive-pipeline`                                                                                   | Exit1; 1 fail; 3 expect() calls  |
| pipeline-shape       | Removed its predicate/dependency; `invalid-stage`                                                                                        | Exit1; 1 fail; 3 expect() calls  |
| declaration          | Removed its predicate/dependency; `undeclared attack failure`                                                                            | Exit1; 1 fail; 2 expect() calls  |
| wire-finish          | Removed its predicate/dependency; `forged-finish`                                                                                        | Exit1; 1 fail; 2 expect() calls  |
| durable-state        | Removed its predicate/dependency; `advanced-revision\|changed-question\|changed-brief\|changed-candidate\|changed-turns\|changed-prefix` | Exit1; 4 fail; 14 expect() calls |
| prefix-equality      | Removed its predicate/dependency; `prefix-mismatch`                                                                                      | Exit1; 1 fail; 3 expect() calls  |
| unknown-state        | Removed its predicate/dependency; `latest-completed`                                                                                     | Exit1; 1 fail; 2 expect() calls  |
| operation-identity   | Removed its predicate/dependency; `wrong-operation`                                                                                      | Exit1; 1 fail; 2 expect() calls  |
| single-call          | Removed its predicate/dependency; `extra-call`                                                                                           | Exit1; 1 fail; 2 expect() calls  |
| durable-reservation  | Removed its predicate/dependency; `zero-reservation\|partial-reservation`                                                                | Exit1; 2 fail; 4 expect() calls  |
| prefix-safety        | Removed its predicate/dependency; `guarded prefix safety remains`                                                                        | Exit1; 1 fail; 3 expect() calls  |
| manual-contract      | Removed its predicate/dependency; `manual-refused`                                                                                       | Exit1; 1 fail; 2 expect() calls  |
| scenario-boundary    | Removed its predicate/dependency; `guarded declaration`                                                                                  | Exit1; 1 fail; 1 expect() calls  |
| v9-presentation      | Removed its predicate/dependency; `puni-scoping-v9 omits`                                                                                | Exit1; 1 fail; 1 expect() calls  |
| known-charge         | Removed its predicate/dependency; `meter receipt refuses known`                                                                          | Exit1; 1 fail; 2 expect() calls  |
| positive-reservation | Removed its predicate/dependency; `meter receipt refuses empty`                                                                          | Exit1; 1 fail; 2 expect() calls  |
| full-reservation     | Removed its predicate/dependency; `meter receipt refuses zero\|meter receipt refuses partial`                                            | Exit1; 2 fail; 4 expect() calls  |
| pending-accounting   | Removed its predicate/dependency; `meter defers accounting`                                                                              | Exit1; 1 fail; 1 expect() calls  |
| metadata-header      | Removed its predicate/dependency; `metadata observation adds`                                                                            | Exit1; 1 fail; 1 expect() calls  |
| wire-interrupted     | Removed its predicate/dependency; `missing-error-wire`                                                                                   | Exit1; 1 fail; 2 expect() calls  |
| initial-prefix       | Removed its predicate/dependency; `initial failure cannot`                                                                               | Exit1; 1 fail; 2 expect() calls  |
| malformed-json       | Removed its predicate/dependency; `refuses malformed and`                                                                                | Exit1; 1 fail                    |
| unreadable-clone     | Removed its predicate/dependency; `unreadable metadata`                                                                                  | Exit1; 1 fail                    |

Production checks carry adjacent Proof comments. Logs and exact commands remain in `/tmp/puni-readiness-proof-<check>.log` and `/tmp/puni-readiness-proofs.json` for controller review.

## Scoped command output

`bun test libs/website/domain/contracts/src/scoping.test.ts`:

```
61 pass
0 fail
210 expect() calls
Ran61tests across1file.[90.00ms]
```

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -p website-be-01 -t lint typecheck build --parallel=1`:

```
NX   Running targets lint, typecheck, build for project website-be-01 and 2 tasks it depends on:

- website-be-01


✔  nx run website-contracts:build
✔  nx run website-store-sqlite:build
✔  nx run website-be-01:lint
✔  nx run website-be-01:build
✔  nx run website-be-01:typecheck



 NX   Successfully ran targets lint, typecheck, build for project website-be-01 and 2 tasks it depends on


Output of 5 successful tasks were not shown. Run with --verbose or --output-style=static to see it.

  Run duration:      11.7s
  Cache:             0/5 hit (0%)
  Critical path:     10.6s (1 task)
  Recoverable time:  1.1s (9% of the run)
```

Initial sandboxed Nx runs could not create/connect plugin sockets. Corrected socket-capable runs exposed import/type/lint issues, which were fixed before the successful required scoped run. No missing tool remains.

## Full backend suite

`bun test ./apps/website/be-01/src --timeout=30000` exited0:

```
441 pass
0 fail
8588 expect() calls
Ran 441 tests across 21 files. [238.15s]
```

This includes54guarded evaluation/metadata/accounting tests, v1–v8/opaque replay, new v9 presentation, exploratory ending negatives, refusal/missing-usage, timeout, cancellation, ownership and erasure regressions. The complete scoped Nx targets passed without cache hits. `git diff --check` exited0. Changed/new files were formatted; the final explicit formatting check is recorded in the controller report.

## Outstanding verification

The controller owns independent code review, actual source-pinned paid pilot/full QA, canonical host gate, portability integration and any release decisions. Full monorepo Nx/format gate, live activation, deployment and paid inference were not run by this task. No production/model quality acceptance is claimed by these local tests.

## Implementation signal

Base f6b2fec through the local commit containing this report. No push, SSH, account control change or deployment. Controller report receives the final commit SHA after commit.

## Assessment

Local implementation verification passed. No known local blocker remains. Delta sync/archive, independent review, the canonical full host gate and actual model-quality QA remain controller-owned follow-up. Production remains held.

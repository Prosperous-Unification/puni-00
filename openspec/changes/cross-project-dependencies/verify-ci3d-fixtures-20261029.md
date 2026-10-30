# Published 3dfe3df CI fixture compatibility corrections

CI `40771250604` ran source `3dfe3dffcc7921416803a9c6020791518314cb84`.
Gate checks, remote, remote model, frontend and all eight pixel shards/aggregate
passed. The remaining failures were backend (39), contracts (one golden matrix)
and Twilight (one explicit 20-second test timeout). This note records local
corrections on that exact source epoch, not integration of later upstream main.

## Backend pooled observation ownership

The original backend artifact reported 4,900 pass, three skips and 39 failures:
15 in services-connected, seven in services-connected-publication, 14 in
saved-plan-connected.controller and three in isolated-connected-aggregate.controller.
The old fixtures counted physical open/close, which pooling legitimately retains,
and attached fault callbacks to physical allocation/disposal. Both local-deletion
cases failed their deletion counter before reaching the intended observation.

A test-only forwarding Drizzle proxy now retains actual outer production pooled
loan receivers observed at their first property access. It excludes the physical
wrapper used by the pool's internal transaction inspection. Property access on the
exact retained loan establishes expiry only through the production pool's exact
post-release error; unrelated errors propagate. Physical allocation/disposal
counters remain separate. Saved-plan identity checks use the actual loan receiver;
the pre-SQL transaction spy first touches its guarded property to observe it.

The beforeRead hook runs before actual BEGIN. Successful original COMMIT/ROLLBACK
execution queues a callback that first verifies that same loan has really expired.
The callback runs before the waiting writer continuation. Missing SQL observation
refuses. Disabled/draining, saved-plan reauthorization, exact target/foreign pins,
slots, terminal outcomes and deletion-before-aggregate assertions remain intact.
No production pool API, global spy, callback readiness grant, runtime behavior,
direct unpooled close assertion or budget changed.

Original three-owner local RED: 27 pass, 32 fail, 627 assertions. The separate
publication owner reproduced its seven failures. Final five-file owner run:
**72 pass, zero fail, 1,307 assertions**, including six new oracle cases.

Six watched faults each failed their intended real owner, followed by exact
restoration: omit actual production observeCommitted release; classify unrelated
errors as expiry; omit SQL-observation refusal; queue callbacks in the pre-execution
logger; omit beforeRead (both local-deletion HTTP cases); omit onReleased (both
live disabled/draining cases and saved-plan reauthorization). The correctly bound
pre-execution fault fails only the logger-rejected COMMIT owner; this is a logger
rejecting the real run before SQLite executes COMMIT, not an SQLite-engine failure.
An earlier malformed fault produced ReferenceError and is explicitly rejected.
Transient production DB changes were restored byte-exactly.

Final review identified raw-target binding inside the test wrapper's run forwarding.
A new actual retained-run control first failed (the cached method executed after
loan release). Forwarding Reflect.apply with the same actual outer loan receiver
then passed all six oracle cases and all four owners. Earlier six-fault receipts
retain their original helper pins; this forwarding correction has its own precise
RED/GREEN and final owner run, without relabelling those earlier bytes.

## Contracts and Twilight

The complete protected/exempt golden now includes the four existing main AgentPool
operations, derived from agent-pool-shapes.ts. No classifier policy changed.
Both owner tests pass (six assertions). Temporarily exempting all four operations
failed the matrix; exact classifier restoration passed. This is classification
proof, not a new HTTP or full public-contract parity claim. Memory/performance
limits were untouched and were not the contracts failure.

The Twilight test performed five real extractions under its unchanged explicit
20-second limit; CI timed out at 20,642.64 ms. One unchanged local diagnostic
passed: fixture 2,357 ms, baseline freeze 1,803, refresh 1,766, changed freeze 1,715,
stale freeze 1,780; total 9,421 ms (process 10.01 seconds). This does not reproduce
the CI timeout or establish its contention cause. The exact temporary prints were
restored. The initial missing trusted-module environment attempt is setup-only.

Only the disposable boolean-export fixture tsconfig gains explicit `lib: ['ES5']`.
All five extractions, identity/evidence/stale-graph assertions and 20-second limit
remain. No noLib, skipLibCheck, production extraction cache or production compiler
setting changed. The focused case passes in 2.30 seconds; the complete owner file
passes **21 cases, 117 assertions** in 23.54 seconds.

## Static checks and evidence

All three owning spec compiler programs pass: be-01, contracts and Twilight
Burokrat. Scoped lint passes for all eight TypeScript paths after mechanical
imports/arrow factories and explicit expected-rejection assertions; no cast or
disable was added. Formatting is checked on the final files. Full gates/builds,
later-main reconciliation and native qualification were not replayed; fresh CI
on the reviewed normal-hook checkpoint remains required.

Private evidence prefix: `/tmp/puni-ci3d-failures-20261029`. The original artifact
logs remain under `artifacts/{backend,workspace,twilight}/nx-gate-plain.log`.

- `backend-owning-red.log`: SHA256 `513dc965320f1d9a673a9f4ea39a288f845a83875afd4fe28d21331ff35b07fc`.
- `backend-publication-red.log`: SHA256 `0a63e90590bb0f9666527086ac3e0aed1d788411e93927e95f602a9dd7125885`.
- `backend-owning-final-receiver.log`: SHA256 `ce33c4865bb2499e6b3c48729b57768263d6f90c610baf70494e88194cab720c`.
- `read-oracle-proof-receipts-final.json`: SHA256 `412c302e2da6562847c686f164fece7ba42a72d54aa7317cd17d534b45b384ac`.
- `contracts-agent-pool-proof.json`: SHA256 `f0a3293c94fdfc6ff88a4e33f6d19581505ec8966064e35ce525a1c98fa50765`.
- `twilight-focused-diagnostic-receipt.json`: SHA256 `d83002e5b43e72a64bb732617c603e95dfabd12eba9b8da54591d8c294dadf09`.
- `twilight-focused-es5.log`: SHA256 `d239d0d286a2e170f0b75a262664afd6168dab9e5e26458f5d15eb7378402b6e`.
- `twilight-owner-es5.log`: SHA256 `4b2868f98410e51524aa2b5a51af4b686c357f8c1c2b3cf994afcbe702e11de7`.
- `scoped-lint-final-receiver.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `typecheck-be-final-receiver.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `typecheck-1.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `typecheck-2.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

- `read-oracle-retained-run-red.log`: SHA256 `e6982ceb4c2b2ffd9896b785c2280aeb0dbfa5ff33ee347bebc40a8ecb449352`.
- `read-oracle-retained-run-green.log`: SHA256 `e2526801aabc3bb820d9275b1d0ade0ab674efecead2177a801fabd778d9e856`.

Other retained diagnostic/setup/type/lint failures are not credited as proofs. Architecture adoption, full feature completion, MAIN and deployment remain held.

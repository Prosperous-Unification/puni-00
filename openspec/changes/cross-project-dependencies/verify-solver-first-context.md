# Original-context solver-first restoration

This bounded P2b-3 component restores only the pinned compatible solver after
actual activation finalizers. It retains the same consumed in-memory context,
outer owner, absolute deadline, parked inventory, solver intent and original
`authorities.solver.tuple`. The request decoder already checks the independent
solver pins; no second installed baseline or owner is introduced.

`restoreSolverForPreparedParticipants` requires the original transport's callable
socket operation before any primitive/removal/policy/start effect. The original
context, evidence, artifact, stores, cold source and parked inventory are checked
before restoration and again after the last authority/readiness observations.
Fresh authority must retain every original static field and tuple, the full
original stopped service before startup, running phase afterwards and no DB
openers. The real primitive's unchanged readiness monitor brackets that census.
Only its actual successful return is retained privately under the consumed
context. The closed returned summary grants no subsequent startup or exposure.
Failure is terminal, including repair of a missing transport after refusal.

The existing parked-solver-only backend callable is unchanged. Products,
controllers, ingress and original restart policies are not restored. The public
fenced-only activation entry remains unchanged; there is no new restoration CLI,
controller adoption or serving handoff.

## Actual setup and RED

Worktree `/home/df/.codex/worktrees/9242/puni-00`, isolated branch
`integration/dependencies-solver-first-20261028`, base
`766ce699dc14eb9a157f8b7ad2b4fe2b91380fe7`. Frozen Bun installation added no
tracked dependency or lockfile changes. Bun 1.4.4.

- Existing closed-reader baseline: 19 pass, 0 fail, 58 assertions, 31ms.
- Approved V3 genuine positive: 0 pass, 1 fail, 1 filtered, 131 assertions,
  45.94s. Actual preparation/finalizers/consumption and baseline assertions reached
  the explicit throwing entry stub. The preceding wrong-directory invocation
  failed preload lookup before testing and earns no RED credit.
- First GREEN attempt: 1 pass / 1 fail. The positive reached real restoration,
  then its test incorrectly expected only one `solver-restore-complete` record.
  Existing publishers actually write policy-publication-intent, policy-published
  and solver-ready. The corrected test requires all three ordered full payloads,
  original owner/hash/references and exactly one actual unit/process/cgroup ready
  record. No production assertion was weakened.
- A new late-source case then observed RED: missing closing reinspection accepted
  restart-policy drift at the third real socket callback; expected Error was
  undefined (150 assertions, 50.77s). Closing barrier reinspection was added before
  private ready-state retention.

## Final ordinary observations

From `tools/tool-remote-scripts`:

```sh
bun test src/lib/dependency-participant-solver-restoration.test.ts --preload ../test/scratch/preload.ts --timeout=300000
```

Actual final ordinary file: **6 pass, 0 fail, 1,016 assertions, 378.79s total**.
Per-case durations were 50–73s, each under its existing 300s budget; 300s is not a
whole-file bound. Cases cover actual solver readiness with copied/reused context
refusal, absent socket plus repaired terminal attempt, released original context,
late source restart-policy drift, raw collector boot drift and raw collector DB
openers. Every ordinary cleanup hook returned. No old backend fourteen/five,
public-parity, native or performance campaign was replayed.

The raw fixture now opens the actual independently created `installed-0` file
for REQUEST's solver PID. Other PIDs and stopped requests delegate unchanged.
Its real descriptor supplies executable inode/hash to the unchanged production
collector. This replaces the old PID123 memfd mismatch, without manufacturing
expected identities, collector output or ready observations. The same modeled
host transition drives solver and authority transports, preserving the canonical
state-path rewrite. Two actual post-start authority observations retain original
static facts and exact tuple. A scratch Unix listener/connection is real;
service/process/cgroup and installed binary bytes are modeled fixture inputs,
not installed-host or native supervisor acceptance.

## Five watched production-path omissions

Each pair used one exact selected case with normal preload and 300s test budget,
then exact source restoration and the same case once. Every omitted run exited1
at its intended consumer (5 filtered), and every restored run exited0 (5 filtered).
All three source control hashes were checked after each pair and at the end.

| Omission  | Selected case   | Actual omitted consumer                                         | Exact-restored observation              |
| --------- | --------------- | --------------------------------------------------------------- | --------------------------------------- |
| socket    | absent          | primitive calls: expected 0, received 1; 150 assertions, 66.72s | 1 pass / 0 fail; 158 assertions, 68.71s |
| terminal  | absent          | expected Error, received undefined; 156 assertions, 73.51s      | 1 pass / 0 fail; 158 assertions, 52.95s |
| context   | present         | expected Error, received undefined; 150 assertions, 53.51s      | 1 pass / 0 fail; 207 assertions, 54.27s |
| authority | authority-drift | expected Error, received undefined; 150 assertions, 63.09s      | 1 pass / 0 fail; 170 assertions, 53.95s |
| closing   | late-source     | expected Error, received undefined; 150 assertions, 65.78s      | 1 pass / 0 fail; 171 assertions, 58.19s |

The context proof removes the original-context admission dependency at both new
call sites; it does not qualify each call or every existing invariant separately.
The authority proof removes the grouped equality and uses actual boot drift; it
does not separately qualify every field/subclause. The ordinary real-collector
opener negative independently covers the no-opener phase contract. The closing
proof removes only the last barrier call after actual authority/readiness.

Raw assertions, source restoration and cleanup returns were independently
accepted in private review
`puni-r18-solver-first-six-and-five-actual-independent-review-20261028.md`, SHA
`db1a9f4f9ff7014f92f09a2ce29853ccf004ce6b0298fd6a92bdcaaa8967facf`.
Actual logs, receipts and control readbacks are retained privately under
`/tmp/puni-r18-solver-first-focused-proofs-20261028/execution`.
The ten runs qualify these finite guards, not every field or a universal cleanup
claim. Python orchestration joins the Bun process and restores source in finally;
it has no independent wall-clock/process-group deadline. Adjacent `Proof:`
comments were added only after these actual outcomes were accepted. Removing
only those comments reconstructs tested production SHA
`3132b9c3b61716f9978425ee770cefe72091e2df5df138fb7195e8a6fb35511c`.

## Scoped checks and remaining delivery

Final commented source passed the configured project lint and typecheck targets
with Nx cache bypassed (22.1s). Formatting passed for all five changed paths, and
the new internal entry bundled successfully with its actual dependency closure.
OpenSpec validation passed this change (1 valid, 0 failed), with 29 warnings
about long text in unchanged requirement files. Final independent source review
is required before private commit. Normal hooks are retained.

The full tool-remote-scripts test target, full CI and isolated host gate were not
run in this lane. These scoped checks do not qualify the integrated final SHA or
replace the parent release gates.

Next work remains solver→backend→gateway→source readiness under the retained
phase, exact restart-policy restoration, ordinary-controller adoption, owner
retirement and verified exposure. Kubernetes retains its separate unfinished
ownership/drain/activation/restoration lifecycle. Native acceptance, full P2b-3,
P2b-4/P3, 10.2/S4/O4, architectural adoption, MAIN and deployment remain open.

## Root composition with the main pool integration

Root applied the reviewed five-file solver checkpoint
`d38325120468cedc2ddfc71d04fb8d02840bca7e` without source changes onto
`22d9a7a7e84c7b0571cb13109375dd7ea21e046e`, whose parents retain feature
checkpoint `766ce699dc14eb9a157f8b7ad2b4fe2b91380fe7` and main
`25b873b1d49c2d2cd3e130958af682e309e9f844`. All five applied bodies were
checked byte for byte against the reviewed solver commit before this note was
appended.

From `tools/tool-remote-scripts`, the complete owning file passed again on this
combined code:

```sh
bun test src/lib/dependency-participant-solver-restoration.test.ts --preload ../test/scratch/preload.ts --timeout=300000
```

Session 18248, terminal `46b634`, exit 0 reported 6 passed / 0 failed / 1,016
assertions in 421.30s; scratch cleanup returned. This checks the real owning
composition against the newer main pool/authority interfaces. It does not
repeat or expand the earlier five omission proofs. The remote-scripts spec
compiler also passed (session 71908, terminal `f2ad15`). The original 300000ms
per-case budget remains unchanged. The raw log is retained privately at
`/tmp/puni-r18-solver-first-combined-main-20261028.log`.

Later main drift through `6beace79abb5c7c465fe380bb86b6d19c1f4a061` contains
documentation/plans only and had not been merged during this run. Full
participant restoration, native acceptance, exact-current-SHA host gate/CI and
MAIN/deployment acceptance remain separate obligations.

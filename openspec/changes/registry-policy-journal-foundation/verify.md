# Foundation verification — local checkpoint 2026-11-08

This records local foundation checks only. The original [PR #843](https://github.com/Prosperous-Unification/puni-00/pull/843) remains separate and unfinished. Whole-slice independent review, remote CI and a canonical exact-revision host gate remain required before merge. Their final receipts belong in [foundation PR #888](https://github.com/Prosperous-Unification/puni-00/pull/888) so the reviewed candidate can stay frozen through gating.

## Source and scope

Base: `acfdc02c7f0acc98606c87312a694ed2b89302ea`, freshly confirmed with `git ls-remote origin refs/heads/main`. Original `fix/runtime-dispatch-preparation-20261103` remains at `f04ac32c907e705f981983ae273115fca7944fce`. The original rollout worktrees were not changed.

The policy/test source is extracted from `043f75f0e1e27bdd3e95c6a8d33e323e5e5135fc`. Journal/test/CLI source is extracted from reviewed checkpoint `2b1119372ebe11327c22f8a90a8f7ec482cf0494`. Additions are nine actual-command chronology cases, eight pure-policy ownership/accounting cases, the numeric timestamp correction and scoped proof/JSDoc clarifications. No package, lockfile, alias, entrypoint, target, installer or caller wiring changed.

The exact five file hashes below match the source restored after every final fault observation, including the directory-enumeration portability correction recorded below. The paired tests reach the actual policy/command/CLI paths. Ordinary owned-file, child-process, SIGKILL, FIFO and kernel-flock tests ran; privileged native/isolation fixtures, installed storage, provider operations, enrollment and activation did not run.

| File                                            | SHA-256                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `tools/tool-fleet/src/registry-journal-cli.ts`  | `82b275422a3f9fe50843092474b20df0f4e4bc7e4c86b8895287a10789811ae1` |
| `tools/tool-fleet/src/registry-journal.test.ts` | `0e13d1e3bdeed84e1da9be53308de47d32616c897cd83a306d6d1e9b01edc8fd` |
| `tools/tool-fleet/src/registry-journal.ts`      | `cf230dd6a77955a32a2e938ac3153a01846d98770343531cee903e0927767519` |
| `tools/tool-fleet/src/registry-policy.test.ts`  | `576ba2c3cf929d53654e5327dadb22127d6cf14ddf17bcc01da72a9ebc67245a` |
| `tools/tool-fleet/src/registry-policy.ts`       | `6addac94bafc1e0e90dc05257f16d6499effde534c3620783d4db5804ca105ab` |

## Completeness and correctness

The six foundation requirements are implemented by the pure policy, durable journal and explicit CLI. Existing source/spec TypeScript globs include the additions. Search found no pre-existing runtime caller of the new modules. Reconciliation and maintenance phases remain trusted caller assertions; these tests do not establish physical lifecycle authority.

Delta spec sync is pending: this change remains open for independent review and integration. No archive or broader rollout completion is claimed.

## Local checks

```text
bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 \
  tools/tool-fleet/src/registry-policy.test.ts tools/tool-fleet/src/registry-journal.test.ts
86 pass
0 fail
362 expect() calls
Ran 86 tests across 2 files. [13.35s]
```

Scoped ESLint over all five files: exit 0, no diagnostics. The first lint invocation found an awaited Bun matcher typed as void; the chronology regression now uses the existing typed refusal helper and the final lint passed.

```text
NX_DAEMON=false bunx nx run tool-fleet:typecheck
> bunx tsc --build --force tools/tool-fleet/tsconfig.json
NX Successfully ran target typecheck for project tool-fleet
Run duration: 2.8s
Cache: 0/1 hit (0%)
```

`openspec validate registry-policy-journal-foundation --strict --json`: 1 item, 1 passed, zero failed, no issues. `openspec validate --all --json`: 329 items, 329 passed, zero failed (309 changes and 20 specs); unrelated existing warnings remain nonfatal.

Explicit changed-file Prettier passed, including normal commit-hook formatting. Full `NX_DAEMON=false bunx nx format:check --all` remains running at this dated local checkpoint; its final output belongs in [PR #888](https://github.com/Prosperous-Unification/puni-00/pull/888), separately from the completed changed-file check. The parent agent owns observing that existing process and final merge requirements. `git diff --check` passed before staging.

Not run locally: whole-repo `bunx nx run-many -t test lint typecheck build`, full package test selection, e2e, remote CI and canonical host gate. The root agent arranges remote CI and the canonical gate against the final pushed SHA. There is no tool-fleet build target; broader build validation belongs to that gate.

## Chronology RED and independent fault observations

Before the numeric correction, the nine new production-command cases reported **5 pass / 4 fail**. Expanded-boundary and negative-expanded reversals were wrongly admitted; valid advancements were wrongly rejected. Standard and equal-instant controls passed. The corrected numeric comparison passes all nine. Removing its predicate fails all three backwards-clock cases; restoring lexical ordering fails the four expanded-year cases again.

The [machine-readable failure inventory](evidence/failure-proofs.json) records each exact replacement, test selection, source hash, exit and observed named failures. Each fault was injected alone and restored in a finally block; the full final run observed **84/84 faults** failing their covering tests. The final green suites above ran after restoration. Missing, unreadable and corrupt canonical state are distinguished by the actual command tests. Failures are named test assertions, not reliance on a subprocess exit alone.

| Injected fault                     | Production file           | Observing test                                                                                          | Observation               |
| ---------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- |
| P01 safe counts                    | `registry-policy.ts`      | publication admission > rejects missing capacity, zero budgets and fractional counts                    | Named test failed; exit 1 |
| P02 positive capacity              | `registry-policy.ts`      | publication admission > rejects missing capacity, zero budgets and fractional counts                    | Named test failed; exit 1 |
| P03 immutable digest               | `registry-policy.ts`      | retirement planning > rejects unknown roots and mutable identities even when both references agree      | Named test failed; exit 1 |
| P04 canonical timestamp            | `registry-policy.ts`      | retirement planning > throws for malformed timestamp                                                    | Named test failed; exit 1 |
| P05 required inode envelope        | `registry-policy.ts`      | publication admission > throws for missing inode envelope                                               | Named test failed; exit 1 |
| P06 complete history               | `registry-policy.ts`      | retirement planning > throws for absent or incomplete history instead of assuming first install         | Named test failed; exit 1 |
| P07 complete graph                 | `registry-policy.ts`      | retirement planning > throws for incomplete graph, unknown references and mutable identities            | Named test failed; exit 1 |
| P08 actual usable budget           | `registry-policy.ts`      | publication admission > uses actual usable capacity when smaller than the configured budget             | Named test failed; exit 1 |
| P09 exact arithmetic               | `registry-policy.ts`      | publication admission > refuses the exact byte cutoff near the safe-integer capacity limit              | Named test failed; exit 1 |
| P10 byte stop                      | `registry-policy.ts`      | publication admission > fences writes at actual stop pressure or low host reserve                       | Named test failed; exit 1 |
| P11 inode stop                     | `registry-policy.ts`      | publication admission > reports warning and stop pressure from inodes independently                     | Named test failed; exit 1 |
| P12 byte cleanup                   | `registry-policy.ts`      | publication admission > admits strictly below both cutoffs and reports pressure                         | Named test failed; exit 1 |
| P13 inode cleanup                  | `registry-policy.ts`      | retirement planning > targets below seventy percent and requests pressure cleanup at eighty             | Named test failed; exit 1 |
| P14 byte warning                   | `registry-policy.ts`      | publication admission > admits strictly below both cutoffs and reports pressure                         | Named test failed; exit 1 |
| P15 inode warning                  | `registry-policy.ts`      | publication admission > reports warning and stop pressure from inodes independently                     | Named test failed; exit 1 |
| P16 byte reservation               | `registry-policy.ts`      | publication admission > charges existing reservations to both budgets                                   | Named test failed; exit 1 |
| P17 inode reservation              | `registry-policy.ts`      | publication admission > charges existing reservations to both budgets                                   | Named test failed; exit 1 |
| P18 byte admission                 | `registry-policy.ts`      | publication admission > refuses the exact byte cutoff near the safe-integer capacity limit              | Named test failed; exit 1 |
| P19 inode admission                | `registry-policy.ts`      | publication admission > refuses the exact inode cutoff near the safe-integer capacity limit             | Named test failed; exit 1 |
| P20 root reserve                   | `registry-policy.ts`      | publication admission > fences writes at actual stop pressure or low host reserve                       | Named test failed; exit 1 |
| P21 publisher slot                 | `registry-policy.ts`      | publication admission > charges existing reservations to both budgets                                   | Named test failed; exit 1 |
| P22 unique identity                | `registry-policy.ts`      | retirement planning > rejects duplicate graph nodes, registered environments and histories              | Named test failed; exit 1 |
| P23 cycle                          | `registry-policy.ts`      | retirement planning > rejects cyclic dependencies                                                       | Named test failed; exit 1 |
| P24 unknown dependencies           | `registry-policy.ts`      | retirement planning > rejects unknown roots and mutable identities even when both references agree      | Named test failed; exit 1 |
| P25 partial owner                  | `registry-policy.ts`      | refuses partial operations without an abandoned owning bundle                                           | Named test failed; exit 1 |
| P26 retired identity               | `registry-policy.ts`      | refuses unknown unfinished or empty-root retired declarations                                           | Named test failed; exit 1 |
| P27 known graph owner              | `registry-policy.ts`      | retirement planning > throws for unknown owner                                                          | Named test failed; exit 1 |
| P28 physical owner                 | `registry-policy.ts`      | refuses duplicate physical content owners and unknown or graph-overlapping content                      | Named test failed; exit 1 |
| P29 staging owner                  | `registry-policy.ts`      | refuses staged content without an owning bundle                                                         | Named test failed; exit 1 |
| P30 future bundle                  | `registry-policy.ts`      | retirement planning > rejects future publication receipts and unregistered environment histories        | Named test failed; exit 1 |
| P31 missing history                | `registry-policy.ts`      | retirement planning > throws for absent or incomplete history instead of assuming first install         | Named test failed; exit 1 |
| P32 registered history             | `registry-policy.ts`      | retirement planning > rejects future publication receipts and unregistered environment histories        | Named test failed; exit 1 |
| P33 first-install chronology       | `registry-policy.ts`      | retirement planning > throws for duplicate identities, future receipts and unknown historical releases  | Named test failed; exit 1 |
| P34 known history                  | `registry-policy.ts`      | retirement planning > throws for duplicate identities, future receipts and unknown historical releases  | Named test failed; exit 1 |
| P35 newest ten                     | `registry-policy.ts`      | retirement planning > keeps ten complete bundles                                                        | Named test failed; exit 1 |
| P36 rollback history               | `registry-policy.ts`      | retirement planning > preserves older environment rollback                                              | Named test failed; exit 1 |
| P37 retired history                | `registry-policy.ts`      | refuses retired releases still required by successful history                                           | Named test failed; exit 1 |
| P38 unfinished retention           | `registry-policy.ts`      | retirement planning > retains unfinished work regardless of age and excludes it from successful history | Named test failed; exit 1 |
| P39 seven day grace                | `registry-policy.ts`      | retirement planning > waits seven days after abandonment                                                | Named test failed; exit 1 |
| P40 exact protection closure       | `registry-policy.ts`      | current consumer shared tier preserves its image while oldest four unique tiers retire                  | Named test failed; exit 1 |
| P41 protected digest               | `registry-policy.ts`      | retirement planning > does not count shared blobs twice                                                 | Named test failed; exit 1 |
| P42 already retired                | `registry-policy.ts`      | does not retire an already retired abandoned operation again                                            | Named test failed; exit 1 |
| P43 every orphan owner             | `registry-policy.ts`      | retains shared unreferenced content until every owning operation releases it                            | Named test failed; exit 1 |
| P44 byte cleanup target            | `registry-policy.ts`      | retirement planning > reports all-protected exhaustion without weakening retention                      | Named test failed; exit 1 |
| P45 inode cleanup target           | `registry-policy.ts`      | retirement planning > targets below seventy percent and requests pressure cleanup at eighty             | Named test failed; exit 1 |
| J01 schema boundary                | `registry-journal.ts`     | rejects malformed claims and insecure journal paths before mutations                                    | Named test failed; exit 1 |
| J02 owner-only directory           | `registry-journal.ts`     | rejects malformed claims and insecure journal paths before mutations                                    | Named test failed; exit 1 |
| J03 trusted file mode              | `registry-journal.ts`     | rejects missing unreadable and corrupt trusted state on command paths                                   | Named test failed; exit 1 |
| J04 nofollow journal               | `registry-journal.ts`     | rejects malformed claims and insecure journal paths before mutations                                    | Named test failed; exit 1 |
| J05 bounded journal read           | `registry-journal.ts`     | bounds valid oversized command and journal inputs and refuses exhausted revisions                       | Named test failed; exit 1 |
| J06 read invariants                | `registry-journal.ts`     | refuses reinitialization, clock reversal, duplicate roots and malformed trusted ownership               | Named test failed; exit 1 |
| J07 unique journal identities      | `registry-journal.ts`     | refuses reinitialization, clock reversal, duplicate roots and malformed trusted ownership               | Named test failed; exit 1 |
| J08 image references               | `registry-journal.ts`     | rejects malformed claims and insecure journal paths before mutations                                    | Named test failed; exit 1 |
| J09 replacement names              | `registry-journal.ts`     | refuses unsafe replacement entries without deleting canonical or unrelated files                        | Named test failed; exit 1 |
| J10 replacement regular file       | `registry-journal.ts`     | refuses unsafe replacement entries without deleting canonical or unrelated files                        | Named test failed; exit 1 |
| J11 replacement owner              | `registry-journal.ts`     | refuses a foreign-owner replacement reported by the filesystem boundary                                 | Named test failed; exit 1 |
| J12 replacement mode               | `registry-journal.ts`     | refuses unsafe replacement entries without deleting canonical or unrelated files                        | Named test failed; exit 1 |
| J13 replacement links              | `registry-journal.ts`     | refuses unsafe replacement entries without deleting canonical or unrelated files                        | Named test failed; exit 1 |
| J14 orphan cleanup                 | `registry-journal.ts`     | reclaims a crashed pre-rename replacement only after validating canonical state                         | Named test failed; exit 1 |
| J15 orphan fsync                   | `registry-journal.ts`     | propagates orphan directory fsync failure without acknowledging the read command                        | Named test failed; exit 1 |
| J16 kernel lock                    | `registry-journal.ts`     | refuses a competing process holding the actual kernel lock without a locked bypass                      | Named test failed; exit 1 |
| J17 failure growth                 | `registry-journal.ts`     | reserves failure growth below the bounded journal read limit                                            | Named test failed; exit 1 |
| J18 physical replacement           | `registry-journal.ts`     | charges physical replacement allocation before spending recovery headroom                               | Named test failed; exit 1 |
| J19 journal budget                 | `registry-journal.ts`     | refuses a full journal including atomic replacement and retains failure headroom                        | Named test failed; exit 1 |
| J20 file fsync                     | `registry-journal.ts`     | propagates failed file and directory fsync without acknowledging mutation                               | Named test failed; exit 1 |
| J21 directory fsync                | `registry-journal.ts`     | propagates failed file and directory fsync without acknowledging mutation                               | Named test failed; exit 1 |
| J22 failed replacement unlink      | `registry-journal.ts`     | removes its replacement after repeated fsync failures while preserving canonical state                  | Named test failed; exit 1 |
| J23 cleanup failure propagation    | `registry-journal.ts`     | propagates replacement cleanup failure and reclaims the orphan after permission recovery                | Named test failed; exit 1 |
| J24 operation token                | `registry-journal.ts`     | rejects stale operation tokens and foreign owners before releasing protections                          | Named test failed; exit 1 |
| J25 operation owner                | `registry-journal.ts`     | rejects stale operation tokens and foreign owners before releasing protections                          | Named test failed; exit 1 |
| J26 maintenance phase membership   | `registry-journal.ts`     | rejects corrupted active and failed maintenance phase combinations before recovery                      | Named test failed; exit 1 |
| J27 maintenance phase consistency  | `registry-journal.ts`     | rejects corrupted active and failed maintenance phase combinations before recovery                      | Named test failed; exit 1 |
| J28 failed phase evidence          | `registry-journal.ts`     | rejects corrupted active and failed maintenance phase combinations before recovery                      | Named test failed; exit 1 |
| J29 stale revision                 | `registry-journal.ts`     | rejects stale revision without changing durable state                                                   | Named test failed; exit 1 |
| J30 maintenance exclusion          | `registry-journal.ts`     | preserves failed maintenance ownership until explicit recovery and verified completion                  | Named test failed; exit 1 |
| J31 publication reconciliation     | `registry-journal.ts`     | rejects invalid journal measurements and preserves unresolved publication ownership                     | Named test failed; exit 1 |
| J32 phase sequence                 | `registry-journal.ts`     | recovers crashed maintenance at its durable phase and completes only after every verification phase     | Named test failed; exit 1 |
| J33 bounded command                | `registry-journal.ts`     | bounds valid oversized command and journal inputs and refuses exhausted revisions                       | Named test failed; exit 1 |
| J34 initialize recovery evidence   | `registry-journal.ts`     | refuses initialize when an orphan may be the only recoverable journal                                   | Named test failed; exit 1 |
| J35 numeric chronology omission    | `registry-journal.ts`     | chronology rejects standard reversal before durable mutation                                            | Named test failed; exit 1 |
| J36 exhausted revisions            | `registry-journal.ts`     | bounds valid oversized command and journal inputs and refuses exhausted revisions                       | Named test failed; exit 1 |
| J37 lexical chronology restoration | `registry-journal.ts`     | chronology rejects expanded-boundary reversal before durable mutation                                   | Named test failed; exit 1 |
| C01 streaming input bound          | `registry-journal-cli.ts` | runs the owner-only stdin CLI with real measurements and bounds input                                   | Named test failed; exit 1 |
| C02 argument count                 | `registry-journal-cli.ts` | runs the owner-only stdin CLI with real measurements and bounds input                                   | Named test failed; exit 1 |

The inventory establishes the listed local guard observations only. It does not replace independent whole-slice review or prove the unfinished installed registry lifecycle.

## Publication checkpoint

The first normal-hook commit `69dfa6b43158e8df65b5a3b53f178e02ee096d9c` was pushed and [draft PR #888](https://github.com/Prosperous-Unification/puni-00/pull/888) created. Its hooks passed scoped lint, formatting, plaintext-secrets and private-nesting; tool-wiki returned explicitly inactive because its external activation root is not provisioned. This final documentation checkpoint links later external receipts without changing the five pinned source/test files. All four implementation/local-verification/publication tasks are complete; independent review, remote CI, full-format completion and the canonical gate remain merge requirements recorded on that PR.

## Directory enumeration portability correction — 2026-11-08

The first PR #888 fleet-check exposed five test assertions that treated directory enumeration order as meaningful. Its `037654411a89682d8f753b72be6288eb07fa6160` run returned `journal.json` before `authority.lock`; exact directory membership was correct. This is a test portability fix restoring the existing no-orphan contract, with no production behavior change.

Before editing, a preload that calls the real filesystem and returns directory entries in deterministic descending order reproduced precisely those five failures: **31 pass / 5 fail / 245 assertions**. Sorting the actual enumeration at those five assertions passed the same fixture: **36 pass / 0 fail / 264 assertions**. Expected names and exact-array membership remain unchanged, so extra or missing files still fail. The reproducible preload source is preserved in `directoryEnumerationCorrection` in the [failure inventory](evidence/failure-proofs.json).

All **84** production-guard faults were repeated against the corrected test bytes and produced named failures. In particular, removed orphan cleanup and failed-replacement unlink still fail their exact-membership assertions. The inventory and hash table now bind this rerun; all production source hashes remain unchanged.

Fresh ordinary focused suite: **86 pass / 0 fail / 362 assertions**, two files, 6.94 seconds. The full uncached tool-fleet check also passed:

```text
NX_DAEMON=false bunx nx run tool-fleet:check --skip-nx-cache
690 pass
0 fail
2522 expect() calls
Ran 690 tests across 46 files. [67.48s]
[tool-fleet:check] every family passed
NX Successfully ran target check for project tool-fleet and 3 tasks it depends on
Run duration: 1m 25s
Cache: Skipped (--skip-nx-cache)
```

This includes whole-package tests, lint, typecheck and all static artifact families. Earlier text stating full package selection was not run describes the initial checkpoint; this fresh follow-up supersedes that limitation. Strict change validation and normal-hook changed-file formatting are checked again for this correction. The earlier whole-repository local formatting session ended without recoverable terminal output, so its result remains unavailable; final required formatting, remote CI, review and canonical host-gate receipts remain on PR #888.

Base composition was inspected against newly advanced public main `a2a9764f3b3ba5d83a8e309b766ada9c9f82156e`: its ten changed paths have no intersection with this foundation. No rebase or unrelated source change was made.

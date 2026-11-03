# Published measures reconciliation

Source parents: dependency feature `e67ab186cc72f1bf974aeefa7b414f46742a5860`
and main `b6b021dfb744eb9a9b9e1a4d6583d46791e5e176`. This is source reconciliation
in an isolated worktree; no deployment, activation, public push or production
store operation follows from these checks.

The [design](design.md#reconcile-the-published-measures-contract-2026-10-24)
preserves published ordinary document11/input9, introduces connected
document12/input10, and retains schedule1/2. Archival import discards read-only
history; strict export and saved-history validation remain separate boundaries.

## Observed failures and corrections

- Initial merge retained conflicting document11/input9 meanings. Frozen1–8
  readers, published9 measure comparison, connected10 persistence/read/compare
  and ordinary11/connected12 export tests cover the corrected dispatch.
- Before captured enrichment, scheduled and unavailable connected rows carried
  no measure estimates or derived budgets. The new presenter folds detached
  target reads; both tree entry points poison live measure/project/attempt
  reads. Mounted tests mutate figures, factor, budgets and attempts after
  capture and retain the earlier response, including priced bases and holds.
- The broad core/domain/contracts run initially reported3496 pass,3 skip,6 fail.
  Stale ordinary export version expectations and protected operation inventory,
  a merged import ordering error and main's later-workflow-step headroom fixture
  were corrected to the combined contracts. The later step remains absent
  until prerequisites permit it; the first/running step retains budget coverage.
- The unchanged500 MB shape-load check measured563 MB. Production eagerly compiled
  standalone historical/connected document validators with no production
  consumers in addition to the response union. Moving those standalone
  constructions to their tests measured490 MB;135 tests/425 assertions passed with
  the bound and strict validators unchanged. No memory limit was raised.
- A draft stricter import-history check was rejected after finding the explicit
  tolerant archival-import spec. It was removed; absent/arbitrary history still
  projects away, while connected export responses require complete evidence.
- Raw Bun cannot execute the frontend's Vitest suites. The configured frontend
  framework subsequently passed120 tests in2files. Nx/test subprocess stdout and
  worker sockets required sandbox escalation; the earlier EPERM/no-case runs
  are not passing evidence.

## Watched negatives

Each fault was restored before the green runs. Logs remain under
`/tmp/reconcile-*` in the reconciliation workspace's host.

| Injected production fault                                                                     | Observed failure                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Remove the lifetime continuation guard after definitions, estimates or budgets, independently | Each selected connected capture test issued the forbidden following query and failed (1 failure each) |
| Drop captured measure-estimate ownership from input10 validation                              | Saved-body integrity returned null for a foreign component member's trio; the caller test failed      |
| Drop captured budget ownership from input10 validation                                        | Saved-body integrity returned null for a foreign component member's budget; the caller test failed    |

## Final checks

Official Bun 1.4.4 in the isolated reconciliation worktree:

| Check                                                                                                                                           | Fresh result                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Core/domain/contracts (`bun test ./libs/wbs/application/core/src ./libs/wbs/domain/domain/src ./libs/wbs/domain/contracts/src --timeout=10000`) | 3502 pass, 3 existing performance skips, 76062 assertions, 276 files; after the six initial integration corrections            |
| Finite mounted connected live/export/import/save, ordinary measures/budget admission, capture/race/main-upgrade, document and Navigator suites  | 252 pass, 2545 assertions across 11 files                                                                                      |
| Final review-delta reader/integrity/document/Navigator replay                                                                                   | 54 pass, 212 assertions; includes all nine semantic and three historical-metadata negatives                                    |
| Configured frontend contract/view suites (`wbs-api.test.ts`, `plan-toolbar.test.tsx`)                                                           | 120 pass in 2 files, after regenerating the real mounted connected transfer fixture                                            |
| Prepared MCP declaration/tool suites                                                                                                            | 47 pass, 480 assertions; actual generated inventory 93 tools, including both measure reads                                     |
| Exact-main migration upgrade/rollback                                                                                                           | 1 pass, 608 assertions; all main migration blobs verified before the late four-migration upgrade and complete capture rollback |
| Frozen-source TypeScript build                                                                                                                  | Seven project roots pass with `tsc --build --force`: core, memory/SQLite stores, backend, frontend, MCP and Navigator          |
| Configured module compiler                                                                                                                      | 17 core and 3 backend modules pass                                                                                             |
| OpenSpec (`openspec validate --all --json`)                                                                                                     | 287/287 pass                                                                                                                   |
| Configured test classification                                                                                                                  | `tool-devsync:test-levels:verify` passes outside the sandbox after the recorded stdout EPERM                                   |

Three fresh cold probes after deferring the unused historical document factory
measured **488, 485 and 493 MB**, all below the unchanged 500 MB bound. The first
standalone-validator optimization alone had measured 499, 493 and 501 MB; the
third failed and prompted the additional historical-only construction change.
These are bounded shape-load observations, not total service or hosted pod
capacity claims. The final independent reviewer measured 486 MB.

The final source checkpoint contains 321 frozen paths. Its manifest SHA-256 is
`acdea776bcdce17bbed06ecca1fee8eb99e21c1bad3ec14e7e30dcd4b378e6f7`.
The [independent finite rereview](evidence/main-measures-source-review.md)
approved that exact checkpoint, independently passed 186 tests/646 assertions,
removed each semantic guard to watch the intended real caller failure, restored
all hashes and verified nine negatives plus a boundary-value positive.

Additional observed omission controls: captured factor replaced with 1;
captured attempts replaced with an empty list; input10 dispatched through the
legacy normalizer; input10 omitted from the supported version set. Each selected
mounted caller test failed. Each of the five input10 semantic guards was also
omitted independently: factor, facts, trio order, paired basis and budgets. All
selected actual integrity-caller negatives failed and were restored. The
historical factory and awaited Navigator 7/10 metadata tests first failed
because the injected embedded project factor was accepted, then passed after
the historical schema correction.

The three ordinary-domain skips measure scheduling CPU/elapsed time and certify
600 slices under 20 ms; they require the separate configured performance lane.
No performance certification is claimed here. Full host-wide h2/h4 gate, hosted
CI/public integration, refreshed native rehearsal input pins, native authority
review and delivery remain parent-owned work. No deployment or activation was
performed by this reconciliation.

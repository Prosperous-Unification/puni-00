# Bounded initial connected live admission

2026-10-23. Base `94b6fd44ba2547876a852419fa1156019e0d2bc3`.
This packet adds target-only initial admission to the installed public connected
`treeWithin` path. It does not complete cross-project tasks 7.3/7.4 or activate
external dependency authoring.

## Installed behavior

`ConnectedOptimizationAdmission` is a core-owned detached-stage callback.
`buildServices` supplies it when the optimizer runtime exists; the public core
composition forwards it through Work item installation and DI. Borrowed command
graphs remain in capture mode. A scheduled enabled connected public tree consumes
the target's retained pre-selection stage after `livePlans.read` returns and
returns its original projected tree. A configured reader missing admission throws;
missing runtime retains the existing explicit unavailable response.

The coordinator and source-owned repository remain responsible for objective
pairs, retained terminal answers, generations, reservations, queues, enabled and
draining states, launches, durable outcomes and event fanout. The initial public
read only admits its requested target. Completing its outcomes can trigger
existing event reactions that admit another enabled component member; the tests
distinguish that later behavior from the initial target read.

## Tests and watched production negatives

The mounted `buildServices` fixture uses migrated SQLite, real source-owned
optimizer writers and an external process adapter that returns valid
boundary-infeasible wire answers. Held children make repeated cold reads and
background notification overlap existing work. Initial stage expectations come
from the installed reader's retained selection, independently of the Work item
capture helper. The read opens exactly one owned connection; every first-read
source writer turn sees zero owned read connections. Both objective spawn handoffs
also require zero open owned readers.

The borrowed mounted HTTP case stages an upstream estimate of 3, presents target
start 3, observes committed estimate 1 from a separate connection, retains the
staged value on its borrowed stores and rolls back to 1. A deliberately leaked
throwing admission callback stays unreachable. Disabled target, missing calendar,
foreign-organization refusal, missing runtime and post-close disable/drain races
allocate no solver work. `tree`, export, aggregate and capture paths reserve none.
Terminal rereads preserve the complete generation/queue/slot/event ledger.

The initial TDD run in [tdd-red.log.txt](tdd-red.log.txt) failed both cold-read
cases at zero launches and the missing-admission case at a resolved promise.
Subsequent production mutations were restored after each run:

| Fault                                     | Watched failure                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Bypass capture-mode guard                 | Borrowed mounted HTTP returns 500 after leaked callback executes          |
| Silently return when admission is missing | Missing-installation promise resolves                                     |
| Remove target enablement guard            | Disabled configured reader throws for missing callback                    |
| Bypass scheduled-state guard              | Missing-calendar mounted response changes to 500                          |
| Omit public runtime forwarding            | Cold mounted response changes to 500                                      |
| Omit DI module forwarding                 | Cold mounted response changes to 500                                      |
| Omit coordinator admission call           | Cold target launches zero objective children                              |
| Recapture via `optimizationCapture`       | Cold target opens two owned observations instead of one                   |
| Break owned reader close                  | Spawn closure guard prevents launch; expected two children, observed zero |

The unclosed-reader mutation first failed the launched-child count: the spawn
closure guard prevented launch, leaving zero children instead of two. The
`writerReads` assertion was not reached in that retained run; this receipt does
not independently prove that assertion detects an unclosed reader. The exact
[unclosed-read.log.txt](unclosed-read.log.txt) remains unchanged.

Raw receipts are the correspondingly named `*.log.txt` files. The retained
`proofs.py.txt` and `extra-proofs.py.txt` scripts document each mutation and run the
Bun production-path tests; every mutation restores source in `finally`.

## Explicit proof limits

Replacing retained stage start/finish maps with final composite placement
**survived** the cold fixture: its selected candidate equals Fast, so those maps
are equal. [final-placement-unproven.log.txt](final-placement-unproven.log.txt)
records exit 0. This is not a proven distinction. The implementation selects the
existing retained stage, but a displaced three-project selected-stage versus
final-composite regression still needs its own fixture. The broader stage/capacity
matrix, mounted genuinely idle connected member, installed Python/image process,
full repository checks and canonical host gate are unverified for this packet.
The pre-composition callback error is an invariant diagnostic: public services are
not exposed before coordinator installation; no separate reentrant installation
probe was run.

## Verification

Final restored checks and normal commit-hook receipt are recorded below before
handoff. An earlier changed-file ESLint run passed but skipped module-boundary
rules because no Nx graph existed; `NX_DAEMON=false bunx nx graph
--file=/tmp/connected-live-graph.json` then succeeded using main-process plugins
after sandbox socket refusal. Only the post-graph lint result is final evidence.
No canonical host gate ran; it belongs to the exact integrated SHA.

## Composition fixture prerequisite

The wider regression run found one stale expectation in the existing mounted
saved-plan no-admission test. Running that single test on untouched composition
base `94b6fd4` reproduced the same failure: expected `schedule_absent_reason` was
`unavailable`, while the actual value was null. The optimizer-enabled fixture now
has a configured connected reader; a cache miss preserves the valid captured Fast
schedule and saves its schedule body. It is no longer an unavailable reader.
[composition-baseline-save.log.txt](composition-baseline-save.log.txt) retains the
before receipt. The narrow assertion correction requires null absence reason and
one persisted schedule body. Existing zero-generation, zero-cache, forbidden
admission spy and single-announcement assertions remain required. This is a
composition fixture correction, separate from initial public live admission.

Final restored verification:

- `bun test apps/wbs/be-01/src/services-connected.db.test.ts apps/wbs/be-01/src/service/saved-plan-connected.test.ts apps/wbs/be-01/src/controller/saved-plan-connected.controller.db.test.ts apps/wbs/be-01/src/controller/connected-retry.controller.db.test.ts libs/wbs/application/core/src/module/work-item/module.test.ts libs/wbs/application/core/src/service/connected-optimization-view.test.ts --timeout=15000`: exit 0; exact test/assertion totals are in [restored-tests.log.txt](restored-tests.log.txt).
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0, no diagnostics.
- Changed-file ESLint over the nine changed TypeScript files, after Nx graph
  generation: exit 0, no diagnostics or skipped-boundary warnings.
- Changed-file Prettier: exit 0; [restored-format.log.txt](restored-format.log.txt).
- `bunx openspec validate cross-project-dependencies --json`: exit 0, one valid
  change with existing long-requirement warnings; no warning for the new requirement.
  [restored-openspec.log.txt](restored-openspec.log.txt).
- `git diff --check`: exit 0.

Normal commit hooks passed without bypass: lint, format, plaintext secrets and
private nesting, plus both agent attribution hooks. The tool-wiki hook returned
its explicit inactive/not-certified observation because no external activation
root is provisioned; it does not prove certification. Migration and doc-cap
hooks skipped for lack of matching staged files. The normalized transcript is
[normal-hooks.log.txt](normal-hooks.log.txt).

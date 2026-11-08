# R13: principal authority and per-person undo composition

The private dependency runner accepted complete authenticated principals, while
new main selected undo history by acting person. R13 reconciles those contracts
without exposing a caller-selected actor, credential or undo stack. Independent
review accepted this finite private source checkpoint under the adopted actor
ruling on 2026-10-26. **Required contracts-memory verification still fails; repair
is required before full-gate or delivery acceptance.**

Parents are private `8dac0b287cfd06c9a09c1dfbcc5b90f65ad280ec` and main
`dacf0f10f384ec3a21bde70db0500ba0b7a38d90`, with merge base
`1049aef49d63cdc8134a1d23ee06dbfc9c6dbb11`. The source review covered the 111-path
main delta, 25 reconciled conflicts and necessary downstream callers: 124 pinned
source paths in total. All 202 forward/down SQL files match every containing
parent byte-for-byte. The person migration and four private dependency migrations
remain intact; the exact-main upgrade fixture compares the complete captured
name/hash ledger, schema and seeded values after rollback.

## Reconciled behavior

The shared runner synchronously retains the complete principal and expected
access before awaiting the writer. Actor, credential pin and acting person come
from that same retained request used for admission. Database credential,
membership, organization and scope authority are freshly resolved in the writer;
retaining request evidence does not retain an earlier grant. Directory and
prelude calls use the same boundary; public runner APIs remain principal-based.

Runtime uses its existing detached authentication for both authority and acting
person. Machine and consent credentials select their authenticated person;
first-party, upstream and absent authentication select the account's null-person
stack, independently of a runtime target person. Exact runtime retries return
before ordinary graph, capture, journal, history and announcement effects.

Main's `UndoStack` reaches append, returned undo state, undo/redo and keyed flip.
Neighbor rebasing uses only entries read from that stack. Compound recordings
retain the earliest `externalBefore` per scoped revision key. Remote revision,
cycle, lifetime and late-recipient failures retain transaction rollback and no
announcements; stale-entry repair discards only the selected row after rollback.
SQLite/memory journal semantics and immutable project-wide plan history remain
main's semantics.

## Executed evidence

Commands below ran from the repository root with Bun 1.4.4. These selections
**overlap**; their counts must not be summed into a repository-wide total. The
independent review inspected source and terminal receipts, without independently
executing the suites.

| Adopted ruling requirement       | Actual fixture evidence and observed scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mounted person selection         | [undo-acting-person](../../../apps/wbs/be-01/src/controller/undo-acting-person.controller.db.test.ts): all six human/agent, two-person, redo-retention, 51-edit pruning and step-allowance cases; two credentials for one person share a stack. Tree/batch selection and exhaustive null-person derivation also remain covered by core/principal tests.                                                                                                                                                                                                                       |
| Runtime attribution and retries  | [runtime-write](../../../apps/wbs/be-01/src/controller/runtime-write.db.test.ts) and [runtime-claim](../../../apps/wbs/be-01/src/controller/runtime-claim.db.test.ts): machine/consent journal rows, first-party/upstream null despite a target agent, exact retries with unchanged journal/history and graph/capture tripwires; existing principal-cap and credential-pin controls retained.                                                                                                                                                                                 |
| Same queued request evidence     | [command-current-authority](../../../apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts), tests named `keeps original request evidence`: batch/prelude/undo/redo each retain original identity despite nested/replaced principal, account, scopes, delegation and expected-context alias changes. Revoked original A replaced by valid B still refuses before capture, with all durable tables and pushes unchanged.                                                                                                                               |
| Fresh current authority          | The complete current-authority/runtime selection below exercises queued membership, credential revocation/binding, organization, read-only and replay refusals. The request copy supplies evidence, never a cached database grant.                                                                                                                                                                                                                                                                                                                                            |
| Connected recording and rollback | [cross-project-history-neighbors](../../../apps/wbs/be-01/src/controller/cross-project-history-neighbors.controller.db.test.ts), `connected replay rebases only its acting person stack and discards only its stale selected row`: undo/redo/undo preserves the other person's full rows, then a remote edit causes stale refusal with only the selected row discarded and no pushes. Existing connected history tests separately exercise earliest-before collection, remote-cycle rollback, lifetime and late fan-out. No new mixed-person remote-cycle fixture is claimed. |
| Store/migration composition      | SQLite terminal certification and memory offered-case certification include `journal.append:acting-person-stacks`. The store/boot selection exercises journal, claim/race, snapshot-lifetime, mounted parser and person migration paths; the separate ledger rerun passed 19 tests/699 assertions, including exact-main upgrade and full captured rollback.                                                                                                                                                                                                                   |

```sh
bun test ./libs/wbs/application/core/src/module/plan-commands ./libs/wbs/application/core/src/module/work-item ./libs/wbs/application/core/src/http/work-item.routes.test.ts ./libs/wbs/domain/contracts/src/principal.test.ts --timeout=10000
# 523 pass, 0 fail, 4819 assertions

bun test ./apps/wbs/be-01/src/controller/runtime-write.db.test.ts ./apps/wbs/be-01/src/controller/undo-acting-person.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-history-neighbors.controller.db.test.ts --timeout=15000
# 71 pass, 0 fail, 463 assertions

bun test ./apps/wbs/be-01/src/controller/cross-project-dependency-history.controller.db.test.ts ./apps/wbs/be-01/src/controller/cross-project-history-endpoint.controller.db.test.ts ./apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts ./apps/wbs/be-01/src/controller/current-dependency-authoring.controller.db.test.ts --timeout=15000
# 198 pass, 0 fail, 2953 assertions

bun test ./apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts ./apps/wbs/be-01/src/controller/runtime-principal-cap.db.test.ts ./apps/wbs/be-01/src/controller/runtime-credential-pin.db.test.ts ./apps/wbs/be-01/src/controller/runtime-claim.db.test.ts ./apps/wbs/be-01/src/controller/runtime-authority.db.test.ts --timeout=15000
# 206 pass, 0 fail, 1263 assertions

bun test ./libs/wbs/adapters/store-sqlite/src/claim-lease.db.test.ts ./libs/wbs/adapters/store-sqlite/src/claim-lease-race.db.test.ts ./libs/wbs/adapters/store-sqlite/src/claim-limit-race.db.test.ts ./libs/wbs/adapters/store-sqlite/src/capacity-limit-race.db.test.ts ./libs/wbs/adapters/store-sqlite/src/read-snapshot-lifetime.db.test.ts ./libs/wbs/adapters/store-sqlite/src/command-journal.db.test.ts ./apps/wbs/be-01/src/command-journal-person-migration.db.test.ts ./apps/wbs/be-01/src/mcp-delegation.boot.db.test.ts ./apps/wbs/be-01/src/http/elysia/work-item.test.ts --timeout=15000
# 89 pass, 0 fail, 4217 assertions

bun test libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'terminal certification'
# 1 pass, 0 fail, 2477 assertions

bun test ./libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts --test-name-pattern 'every offered existing case|Task 5'
# 6 pass, 0 fail, 1990 assertions

bun test ./apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts --test-name-pattern 'keeps original request evidence' --timeout=15000
# Final post-format restoration: 8 pass, 0 fail, 70 assertions
```

## Causal negatives and restoration

Each injected fault below reached an actual behavioral consumer and was restored
with identical before/after source hashes; final formatting hashes were pinned
separately. Subsequent person, store certification and final queued controls
passed. Historical upstream proof comments remain attributed to their original
runs; they are not claims of fresh R13 mutation execution.

| Injected fault                                  | Observed failure                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Omit synchronous request snapshot               | All four revoked-A/valid-B batch/prelude/undo/redo controls reached forbidden fan-out capture. This proves forbidden admission/capture, **not** an observed unauthorized durable commit. Restored cases refuse with no durable effects. |
| Replace ordinary acting person with null        | Agent undo left Codex renamed instead of restoring its original name.                                                                                                                                                                   |
| Replace runtime acting person with null         | Both machine and consent journal assertions received `[null, null]` instead of their authenticated persons.                                                                                                                             |
| Force connected replay to the null-person stack | Actual connected undo returned 409 instead of 200.                                                                                                                                                                                      |
| Omit journal person predicate                   | Actual `journal.append:acting-person-stacks` row oracle failed.                                                                                                                                                                         |
| Remove keyed flip guard                         | Cross-stack flip resolved when the actual conformance case required rejection.                                                                                                                                                          |

Retained failed attempts: initial explicit ledgers omitted main's new migration;
initial scoped compilers exposed obsolete service/journal calls; a same-person
fixture reused a credential name; two HTTP spies omitted installed operation
evidence. Those were corrected before the recorded passing selections. Concurrent
fixture/compiler runs timed out and were interrupted (exit 130), with cascading
closed-database failures; no timeout or resource cap was raised. A bare-directory
Bun selection also collected ignored emitted JavaScript and failed resolution;
source-only paths corrected that selection. Initial journal mutation filters
matched zero tests and are invalid proofs; only corrected consumer failures above
count. The first memory filter omitted full offered-case certification and was
replaced. Intermediate lint found two import-sort errors and one async callback
without await; sorting and a Promise-returning callback resolved them. A partial
final alias run stopped after two cases and supplies no terminal receipt; the
8-case final run above replaces it without erasing the interruption.

## Static checks and remaining hold

Final changed-file Prettier check and ESLint exited zero. The module/ADR index
selection passed 7 tests/10 assertions:

```sh
bun test --preload ./tools/test/scratch/preload.ts ./tools/tool-devsync/src/module-labels.test.ts ./tools/tool-devsync/src/adr-index.test.ts --timeout=60000
bunx tsc -p libs/wbs/application/core/src/module/plan-commands/tsconfig.json
bunx tsc -p libs/wbs/application/core/src/module/work-item/tsconfig.json
bunx tsc --build apps/wbs/be-01/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json libs/wbs/adapters/store-memory/tsconfig.json libs/wbs/application/conformance/tsconfig.json libs/wbs/domain/contracts/tsconfig.json
openspec validate --all --json
git diff --check
```

Both module compilers, scoped build and diff check exited zero. OpenSpec reported
300 valid items (282 changes/18 specs), zero failures, with warnings. These are
scoped source checks, not a full repository build or gate.

The required memory test was freshly compared on the same Bun version:

```sh
bun test ./libs/wbs/domain/contracts/src/http/contracts-boot-memory.test.ts --test-name-pattern 'bounds the memory' --timeout=30000
```

Main baseline `077063e1ab5aa3653e0c1250067c57cc66469971` passed at **411 MB**;
the frozen private R13 candidate failed at **511 MB**, against the unchanged strict
**<500 MB** requirement. This is a real candidate-versus-main failure; it is not
waived or dismissed as host noise. The child-process HTTP-shape import measurement
does not execute the queued runner snapshot. Cause and repair remain open; do not
raise the cap. Older R12 510/511 MB observations remain historical only.

Main's later one-file [PR #757](https://github.com/Prosperous-Unification/puni-00/pull/757)
merged as `78e62ff`; its attempt-race test is already byte-identical in R13
(SHA256 `a6b88aa66d2963a14b300f1b99c84d4da80304d207275d3e91e431d4a708f895`).
That reversible test delta does not adopt the dependency architecture on main.

R13 CI, exact-SHA host gates, secrets/migration CI lint, full repository tests and
build were not run. Native/FFI, B2 provider/full-constructor, physical measurement,
deployment and full-goal acceptance are not established. Parent task checkboxes,
architectural MAIN/PR #630 merge and delivery remain open; source review acceptance
does not waive the memory failure or complete those obligations.

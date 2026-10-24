# Bounded semantic rank fanout evidence

Base: `1cef3d8e4`. This packet supplies the rank-only dependency invalidation gap within task 5.2. Task 5.2 remains unchecked; authoring admission remains dormant and edges are fixture-only.

`readDependencyFanoutIn` discovers components independently, reads `ProjectRankRepository.orderIn(organizationId)` on the borrowed writer, filters that order separately to each component, and includes each member's zero-based ordinal in its fingerprint. Missing authoritative member evidence throws. Neither physical rank positions nor unrelated global placement enters that fingerprint.

## Validation

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0; 1801 installs across 1648 packages checked. The initial invocation without `BUN_TMPDIR` failed EROFS; the explicit writable temporary directory resolved it.
- `bun test libs/wbs/adapters/store-sqlite/src/fanout-capture.db.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts apps/wbs/be-01/src/controller/project-rank.controller.db.test.ts`: exit 0, 41 passing, 264 assertions. See [focused output](focused-tests.log.txt). Expected injected refusal/transport failures produce error/warn logs.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0, no diagnostics.
- `bunx eslint` on the four changed TypeScript files: exit 0, no diagnostics after import sorting and test typing fixes. An initial direct lint lacked the Nx project graph; `NX_DAEMON=false bunx nx show project wbs-store-sqlite --json` generated it successfully using Nx's main-process fallback because worker sockets were denied.
- `git diff --check`: exit 0.

The DB witness includes two disconnected external components, staged rank moves inside `BEGIN IMMEDIATE`, unrelated component interleaving, physical respacing, semantic reversal, exact event pairs, rollback and restoration. Mounted witnesses cover isolated external chains and shared-person bridge tails, exact rank event causes, unrelated moves, no-ops, foreign targets, a second-recipient insert failure, and independent post-commit transport after a first delivery failure.

## Observed injected faults

Each mutation ran alone and was restored before validation. All returned exit 1.

| Fault                                     | Observed failure                                                                                    | Output                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Omit ordinal fingerprint                  | Both staged and both mounted rank reversal tests fail with unchanged fingerprints or missing events | [ordinal omission](ordinal-omission.log.txt)     |
| Substitute organization-wide ordinal      | Unrelated component move changes fingerprints                                                       | [global order](global-order.log.txt)             |
| Remove missing-order refusal              | Missing authoritative rank member test resolves instead of rejecting                                | [missing order](missing-order-guard.log.txt)     |
| Remove lifetime check after rank await    | One dependency member is read after evidence expires                                                | [expired rank](expired-rank.log.txt)             |
| Use after capture as before               | Both mounted rank reversal tests lose events                                                        | [stale before](stale-before.log.txt)             |
| Commit in the UoW exception branch        | Second-recipient failure retains rank/event state instead of restoring tables                       | [rollback commits](rollback-commits.log.txt)     |
| Move delivery inside the rank transaction | Independent reader sees no committed rank/event rows; delivery count is zero instead of six         | [precommit delivery](precommit-delivery.log.txt) |

No full host gate, complete backend suite, gateway integration suite, build, or live deployment was run for this isolated packet. No changes to saved-plan modules, composition, task checkboxes or shared `verify.md` are included. Existing fanout/delivery boundaries were exercised and temporarily mutated for proof, then restored.

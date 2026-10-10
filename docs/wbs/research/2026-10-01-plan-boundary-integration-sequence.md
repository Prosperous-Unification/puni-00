# 040.11 integration sequence and transaction boundary

Status: proposed follow-up to the [architecture review](2026-10-01-plan-import-and-command-boundaries.md),
2026-10-01. Read-only source/history inspection and an isolated runtime probe;
no source edits, commits, branch switches, merges or pushes. The recommendation
below resolves the earlier callback concern into a concrete design, not an
accepted implementation decision.

## Exact prerequisite chain

Local `main` remains `4bb71e5fdf7f753b9a67ce7dd56abff387ce3a29`
(integration-31). Cached `origin/main` is already
`72ec365d2c397d193fd5325e3cb609b9eba0e1a6` (integration-36). No fetch was
performed; these are local ref observations, not a claim about the live remote.

| Order | Exact observed commit                      | Branch/history meaning                                           |
| ----- | ------------------------------------------ | ---------------------------------------------------------------- |
| 1     | `4979a4217`                                | PR #231, `batch-9/integration-32`                                |
| 2     | `6e71aebd4`                                | PR #239, `batch-9/integration-33`                                |
| 3     | `082579f97`                                | PR #241, `batch-9/integration-34`                                |
| 4     | `53e8dc9a1`                                | PR #245, `batch-9/integration-35`                                |
| 5     | `72ec365d2`                                | PR #249, `batch-9/integration-36`; candidate's shared baseline   |
| 6     | `0e6befe47dd42d98015cf79442c851d6926edf92` | `batch-9/040-07-shims-2`; 22 linear commits after integration-36 |
| 7     | `cd7d8ff7911d417fd2169afbdc0e3bc40db36fe2` | 040.11 implementation; parent is exactly `0e6befe47`             |
| 8     | `dc00832e702cf41198facbd396ad2d8b60b4530c` | 040.11 contracts, indexes, task and evidence updates             |
| 9     | `ec9ca4afe1e82e6b1bd5c8db8d13f845f587477b` | Runtime-private scope follow-up; candidate tip                   |

Stage 6 is the exact range `72ec365d2..0e6befe47`, not a request to select
only two convenient renames. Its ordered manifest is reproducible with
`git log --reverse --first-parent --format='%H %s' 72ec365d2..0e6befe47`.
It begins at `cea412b9c`, retires Commands shims at `7929f9edd`, Import/
Document/History shims at `1e96b4eb2`, retires the remaining resource/backend
shims, and ends with boundary/index/proof updates through `0e6befe47`.

One concrete intervening semantic dependency is `912b29703`: Plan document
v6 readiness/holds changes Import, preparation and its source-contract fixture.
The candidate was built with these semantics, whereas local main lacks them.
Integration-32 through -36 also contain unrelated completed work. They are the
baseline lineage, not new deliverables to credit to 040.11.

Both cached remote candidate refs equal their local tips. Candidate worktree
`.claude/worktrees/agent-ac8a465aeda9a44ee` was clean. The older collector branch
`batch-9/040-11-collector-ports` at `625ac8737` is not a new prerequisite: main
already uses the neutral collector port. Do not replay it.

Recommended integration procedure:

1. In the integration lane, refresh refs and compare the actual base with
   integration-36. Preserve any newer commits; do not reset the shared checkout
   to make this manifest fit. Review intervening Import/Commands contracts.
2. Complete review and required verification of `040-07-shims-2` independently.
   Integrate its exact range onto the established baseline, or verify it is
   already present. Its module indexes and boundary checks are part of the
   prerequisite, not optional cleanup.
3. Review the three 040.11 commits together as a candidate, retaining the
   existing branch as evidence. Add the correction below on top; no wholesale
   rewrite of its source-contract, privacy and rollback tests is needed.
4. Amend the implementation packet before correction, marking the complete
   boundary obligation open until the callback negative is proved. Correct the
   debt-closure claim with the code; do not weaken the audit to accept leakage.
5. Run the Import and Commands matrices below on the resulting integration SHA,
   then the h2puni gate under its lock. Only then merge the reviewed candidate.
   A gate over `0e6befe47` or `ec9ca4afe` alone does not certify later corrections.

## Concrete correction: feature-owned mapped transactions

The candidate's `#scope` field is hidden, but its public generic `graphOf`
accepts a function whose argument is the original `Scope`. A fresh Bun probe
at `ec9ca4afe` constructed a frozen empty scope and asserted:

```ts
admitted.graphOf((scope) => scope, broadcaster, NO_ADMISSION) === original;
Reflect.get(admitted, 'scope') === undefined;
```

Both assertions held, exit 0: `Private field is hidden; public graphOf callback
receives and returns the original scope. No stores were called.` This was a
runtime identity probe, not a compiler test or an attempt to mutate repository
state. The first invocation emitted host dconf warnings; rerunning with
`GSETTINGS_BACKEND=memory` and no login shell produced the clean output.

Remove that capability from the feature-facing interface. Composition captures
the raw source unit of work and service factories once. Each feature receives
a typed transaction runner whose callback sees resources only. Conceptual
contract, with `G` and `R` fixed at each composition boundary:

```ts
interface FeatureTransaction<G, R> {
  run<T>(
    announcements: Broadcaster,
    act: (resources: G) => Promise<FeatureDecision<T, R>>,
  ): Promise<T>;
}

type FeatureDecision<T, R> =
  | { commit: true; value: T }
  | {
      commit: false;
      value: T;
      afterRollback?: (resources: R) => Promise<void>;
    };
```

This is a composition abstraction, not a fifth service kind or a repository.
It delegates once to the existing source `UnitOfWork.run`; it neither creates
another coordinator nor changes the source's terminal-atomicity contract.
The feature initiates the run and chooses commit/refusal/repair. Composition
maps source scopes to resource graphs and maps the source's fresh repair scope
to repair resources. Resources never initiate `uow.run`, and no feature gets a
callback that accepts stores, a graph factory, or a generic `execute` escape.

For **Import**, `G` contains the specific initialization resources and Directory
reconciliation from the architecture review. The Import feature owns preparation,
identity mapping, sequence, summary and post-commit announcements. Initializers
belong to the existing Project, Work item, Capacity, Priority band and Calendar
marker owners. No opaque class that merely wraps every store is needed.

For **Commands**, `G` exposes Project admission/cross-reference operations and
a narrowly typed method to open the command resource graph using the feature's
edit admission and project identity. Its answer contains `services:
PlanCommandServices` and `close()`, never `Scope` or `stores`; composition
captures the actual factory. The feature retains grant creation/expiry and
closes the Working plan in `finally`. `R` exposes only the journal repair
operation required after rollback, built over surviving state with
`NO_ADMISSION`. Project-less directory batches and undo/redo keep their
existing graph/lifetime choices.

Replace feature constructor options `uow` and `batchServices` with these mapped
runners. If old host-construction options need compatibility, provide a
composition factory accepting them and returning the service; keep raw types
out of the feature's own constructor. Public service methods and HTTP/document
contracts remain unchanged. This is an internal TypeScript construction API
change: inventory callers and obtain a compatibility decision for any supported
consumer outside this repository rather than pretending the signature did not
change.

## What the present audit proves

Main's core audit resolves imports and aliases, repository-file declarations,
selected value/parameter/property types and direct `scope.stores`. It exempts
resource implementations and wiring, stops inspecting class fields, and does
not walk function call signatures. Thus a green audit plus `#scope` privacy
does not prove a callback cannot return a raw scope. The earlier fresh main
run passed 10/10 with both modules deliberately in its debt ledger.

Strengthen the audit with positive resource callbacks and negative raw-scope
callback parameters/returns, including through generic aliases and public
class methods. Recursively inspect the feature-facing callable surface with
cycle protection, while preserving private implementation exemptions. Apply
this at exported constructor/options and used resource-method boundaries;
do not indiscriminately reject a resource merely because its hidden fields use
stores. The separate be-01 audit is an Optimization/Supervisor import tripwire,
not evidence for the Import/Commands boundary.

## Acceptance matrices on the integrated candidate

| Area                           | Existing executable or target                                                                                   | Required evidence and new negative                                                                                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Import values and transaction  | `wbs-store-memory:test` and `wbs-store-sqlite:test`, both running `import-service-source-contract.ts`           | Exact document values including v6 readiness/holds, fresh IDs, unchanged existing directory metadata, no history/journal; late refusal and throw leave no writes or announcements. Substitute root resources for admitted resources and observe rollback/isolation tests fail. |
| Import access and concurrency  | be-01 `import-export-organization.controller.db.test.ts`; shared source contract                                | Scoped name/slug resolution and fan-out, viewer refusal, two competing imports serialized. Bypass scoped lookup or use root graph and observe the precise existing refusal/isolation assertion fail.                                                                           |
| Import turn and performance    | Shared held-publisher case; SQLite `import-performance.db.test.ts`                                              | Turn released before publishing, ordinary write proceeds; compare 500-row work and transaction counts with the integrated baseline, preserving bulk initialization.                                                                                                            |
| Commands authority             | Core `plan-command-admission.test.ts`; be-01 `command-organization.controller.db.test.ts`                       | Current-role/project admission and cross-reference closure preserved in run/undo/redo, including project-less directory commands. Move checks outside admission or skip them and observe named failures.                                                                       |
| Commands rollback and lifetime | `plan-command-scope.test.ts`, `compose.test.ts`, `working-plan.test.ts`, SQLite `working-plan-order.db.test.ts` | Fresh surviving repair state, no stale Working plan reuse, closure on success/refusal/throw. Reuse rolled-back graph or disable closure and observe existing negatives fail.                                                                                                   |
| Command result types           | `working-plan.types.test.ts`, command producer fixtures and `wbs-core:typecheck`                                | Exact minted IDs/entity types preserved; intended invalid producer rejected and repaired fixture compiles.                                                                                                                                                                     |
| Boundary closure               | Core `module-boundaries.test.ts`, module typechecks                                                             | Empty debt ledger, positive resource callbacks accepted; raw-scope callback parameters/returns rejected. Remove the signature traversal and watch the new negative fail.                                                                                                       |
| Composition and portability    | Both module suites, `wbs-core:test:portable`, both store `test:conformance` targets                             | Fresh graph/collector for every run, no ambient scope, both source contracts preserved, real browser execution.                                                                                                                                                                |
| Delivery and final gate        | Public import browser flow, affected backend regressions, `bin/h2puni-gate.sh <integrated-sha>`                 | Unchanged public status/body/events and working file import; gate prints exactly the tested SHA. Required CI/OpenSpec checks also pass.                                                                                                                                        |

These are required future checks, not fresh passes from this review. Reuse the
candidate's recorded proofs where still applicable, but rerun moved safety
checks with faults and preserve the observed failures in `verify.md`. Check
absence versus unreadability where the changed boundary distinguishes them.

The concrete next action is a review/correction task on the existing candidate
after its shim prerequisite is established. No implementation can be called
complete from the current local-main audit or the candidate's historical test
counts alone. No glossary or ADR decision was added by this review.

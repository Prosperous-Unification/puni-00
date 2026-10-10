# Plan Import and Plan Commands boundaries

Status: architecture review for WBS 040.11, 2026-10-01. Recommendations await
the R4 design interview; this is neither an accepted specification nor an ADR.
No implementation or integration is authorized by this note.

The [integration follow-up](2026-10-01-plan-boundary-integration-sequence.md)
records exact prerequisite commits, a runtime callback probe and the concrete
feature-owned transaction recommendation that follows this initial review.

## Recommendation

Review and finish the existing 040.11 branch instead of starting a second
implementation. Separate three concerns in its acceptance: neutral value-type
ownership, Plan Import's admitted initialization, and Plan Commands' admitted
scope and organization checks. They share transaction composition, but neither
feature should depend on the other. Keep HTTP, document versions, source
atomicity and event timing unchanged.

The [package adoption plan](../../superpowers/plans/2026-09-17-personal-package-adoption.md)
and its 2026-09-19 amendment were read first. Its later amendments establish
di-bag 0.5.1 for this checkout; obsolete API examples and the original frontend
exclusion must not guide this work. No dependency upgrade is needed to resolve
these boundaries. The [service-kind design](../../superpowers/specs/2026-09-19-code-organization-design.md)
requires features to coordinate resources (K3), forbids cross-module sibling
imports (K6), and assigns the transaction to the feature (K7).

## What exists and what the old task description misses

Local `main` is `4bb71e5fdf7f753b9a67ce7dd56abff387ce3a29`. Its
`module-boundaries.test.ts` still permits exactly `plan-import` and
`plan-commands` as debt. The
[040.10 evidence](../../../openspec/changes/adopt-di-composition/verify.md)
and module contracts describe why they were deferred.

- Plan Import directly accesses project, priority-band, capacity, calendar-marker,
  subtree, typed-dependency and work-item stores. It also reads project stores
  for solution-slug collision and scoped directory-refresh recipients. Its
  Directory and Work item collaborators are already resources composed over
  the import's admitted scope.
- Plan Commands has outgrown the description “older type-level debt.” Besides
  value imports and `Scope`, its feature now calls project stores for current
  organization edit admission, recovery audit and cross-reference closure
  before/during commands and undo. These are authorization-sensitive runtime
  checks, not aliases to rename.
- Existing `ProjectService.create` initializes ordinary defaults and starting
  steps. Import explicitly requires exact document settings and steps; its
  source contract has a negative for accidentally using ordinary creation.
  Capacity/Priority band edit methods also publish edit announcements and read
  back state. Wrapping import in those methods indiscriminately changes its
  initialization behavior.

The domain already defines **Import** as making a new project, whole or not at
all, **Working plan** as one admitted command batch's live values, and
**Unit of work** as terminal atomicity. Import is not a saved-plan restore, an
undoable command batch or an update to an existing project. No glossary change
is needed unless the operator accepts a new aggregate boundary.

## Existing candidate branch

`batch-9/040-11-plan-import-ports` is checked out at
`.claude/worktrees/agent-ac8a465aeda9a44ee`, clean when inspected, with tip
`ec9ca4afe`. Local main is its ancestor; `git rev-list --left-right --count`
reports `0 108`. Do not infer that all 108 commits belong to 040.11.

The task-specific commits are `cd7d8ff79` (implementation), `dc00832e7`
(contracts/evidence), and `ec9ca4afe` (runtime-private scopes), based on
`0e6befe47` from `batch-9/040-07-shims-2`. The separate
`batch-9/040-11-collector-ports` tip is `625ac8737`; collector extraction is
already represented on main and is not this remaining authority boundary.

The candidate introduces `ImportedPlanResource`/`runImportAdmission`,
`AdmittedScope`/`runAdmitted`, neutral value files and Working plan resource
suffixes. It empties the debt ledger. Recorded tests cover both sources,
organization isolation, stale-journal repair, Working plan lifetime and
production-path negatives. The last fix changes TypeScript-private scope
fields to `#scope`, after a reflection probe exposed the former fields.

Two architecture questions remain despite those useful proofs:

1. `runImportAdmission` and `runAdmitted` live in resource-suffixed files and
   call `uow.run`. Keep transaction orchestration in the feature/composition
   boundary, or explicitly justify how these are transaction plumbing rather
   than resource-service operations. A suffix exemption from the audit does
   not establish K7 compliance.
2. `AdmittedScope.graphOf` accepts a caller-supplied factory whose argument is
   raw `Scope`; `#scope` privacy does not remove that callback capability.
   The import feature's options likewise retain `UnitOfWork` and a
   scope-bearing factory. Review the public signatures, not just reflective
   field access. Prefer composition to capture these factories before exposing
   a resource-only admitted graph to a feature.

These are source-based design concerns; no exploit, branch test failure or
independent reproduction of its recorded negative tests is claimed here.

## Proposed ownership and interfaces

The feature owns preparation, orchestration, commit/refusal decision and
post-commit publication. Composition adapts the existing source unit of work
into a callback that exposes only resources for that admission. Raw `Scope`,
store aggregates and graph builders stay inside composition/resource
implementation. Do not replace the existing source coordinator or add a
nested application-level transaction.

For Import, that admitted graph exposes Directory reconciliation, exact Project
initialization and slug checks, initial Capacity/Priority band/Calendar marker
writes, and Work item tree/relationship/label initialization. Publish no new
general-purpose “execute any store callback” method. Each resource accepts
precise initialization values, owns its persistence invariants and opens no
unit of work; the feature retains the sequence and summary.

Prefer initialization methods on the existing resource owners. The candidate's
private `ImportedPlanResource` is a smaller alternative, but its cross-resource
surface needs an explicit decision about aggregate ownership: forwarding seven
stores through a new class does not establish a new domain aggregate or resolve
K8/K9. Do not rename “Import” to “Imported plan” in the glossary just to justify
the class.

Plan Commands uses its own admitted resource graph. Project admission and
cross-reference checks belong behind Project's resource boundary; retained
Working plan stores remain private to its resource/composition. The feature
still grants and expires per-operation edit authority, decides whether to
commit, and requests stale-journal repair. Repair must receive newly composed
resources over the surviving post-rollback scope, before the write turn ends.
Working plan closure must still invalidate retained callbacks on every exit.

Move repository-independent records to neutral value modules and re-export
them from store ports temporarily for adapter compatibility. Do not duplicate
definitions or narrow the command-result unions: minted IDs and exact entity
types remain part of their existing compile-time contract. A generic mapped
transaction helper may be shared if it is only composition plumbing, with no
feature-specific policy; neither feature imports its sibling to reuse it.

## Smallest coherent slices

| Slice                               | Scope and completion                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Reconcile candidate and baseline | Identify the integration base and prerequisite shim removal; review the three task commits against current authorization/document changes. Keep unrelated branch work out of the task claim.                               |
| 1. Neutral value ownership          | Move the value declarations and their consumers; preserve adapter re-exports and producer type assertions. This can land independently and does not claim transaction debt closed.                                         |
| 2. Plan Import                      | Introduce the resource-only admitted graph and exact initialization methods; switch composition and feature together; run the common memory/SQLite source contract and scoped HTTP cases; remove only Import's debt entry. |
| 3. Plan Commands                    | Encapsulate admitted scope, Project checks, Working plan lifetime and rollback repair; run command/type/organization tests; remove only Commands' debt entry.                                                              |
| 4. Integration evidence             | Check module contracts, graph privacy, direction/coverage fences, portable execution and public import flow on the integrated SHA. Update the OpenSpec verification and remaining K2 ledger accurately.                    |

After the design choice, amend the existing `adopt-di-composition` packet or
create a narrowly linked follow-up if its accepted scope no longer fits. This
is architecture and contract work, so OpenSpec is required. Record intent,
testable delta scenarios, design, ordered TDD tasks and factual verification.
Do not mark the parent complete merely because the candidate's ledger is empty.

## Failure, rollback and acceptance

Preserve these executable outcomes on both the in-memory and SQLite sources:

- An invalid document refuses before writes. A later modeled label refusal
  returns `source_refused` with its existing row path; thrown storage failures
  roll back and rethrow. Neither path leaves project/directory/tree writes or
  announcements behind. Rollback failure retains both causes as the unit-of-work
  contract specifies.
- Exact settings, nondefault steps, capacity, bands, markers, authored values
  and typed/legacy dependencies survive with fresh identities. Existing named
  people/directories retain their metadata. Import creates no command journal
  or plan-history entries.
- Two imports competing for one same-scope slug serialize; scoped imports
  ignore another organization's slug and notify only their own projects.
  Viewer/foreign/missing-project refusals keep their existing status and shape.
- Announcements drain after commit and turn release. A held publisher cannot
  block a queued ordinary write. A publication failure after commit must not be
  represented as a storage rollback or trigger an automatic duplicate import.
- Separate commands/imports receive separate admitted resources and collectors.
  A refused undo repairs only through surviving state; Working plan callbacks
  refuse after close. Current member authority and cross-reference checks remain
  inside the admitted operation.
- Features cannot reach repository declarations through imports, aliases,
  parameter/return types, public fields or callback signatures. Both debt
  entries disappear only when their complete modules pass the resolved-type
  audit; re-adding a debt entry and exposing raw `Scope` must fail negatives.

For every changed safety boundary, temporarily break it and observe the real
production-path assertion fail; record that fault beside `Proof:` and in
`verify.md`. Reuse the existing shared import source contract, module-boundary
suite, command scope/Working plan/producer-type tests and mounted organization
controller tests. Also run portable core browser execution and the public import
browser path after composition changes. The 500-row SQLite import measurement
is the existing performance reference; compare transaction/read amplification
instead of inventing an unmeasured timing budget.

No storage migration or wire change is intended. Rollback is a source revert of
a coherent slice, including composition, declarations, audit ledger and module
contracts, followed by its checks. Do not retain a closed-debt claim after
restoring the old feature. Deploy rollback remains the existing runbook's work.

## First interview decision and limits

First decide whether to finish the candidate using existing resource owners
with a feature-owned mapped transaction boundary (recommended), or accept its
private cross-resource wrapper design after explicitly resolving K7/K8/K9 and
scope-bearing callbacks. Then settle compatibility for any callers of exported
composition options. No implementation decision is recorded as accepted here.

This review inspected local source, callers, tests, branch commits and recorded
verification. No refs were fetched, branch switched, other worktree edited,
live service queried or implementation changed. Candidate `verify.md` reports
core 797, memory 146, SQLite 1191 and backend 1592 passing tests, with one backend
skip; these are historical branch evidence, not freshly rerun results. It
explicitly omits frontend, a full affected run and the host gate. The integrated
candidate still needs appropriate fresh checks and `bin/h2puni-gate.sh <sha>`
before completion can be claimed on h2puni.

Fresh local check: `env -u CLAUDECODE bun test
libs/wbs/application/core/src/module-boundaries.test.ts` passed 10/10 on the
inspected main (6.94 seconds). That confirms its current audit and live debt
ledger, not closure of either debt. The note passed Prettier and
`git diff --check`. No candidate implementation tests, browser checks or host
gate were run in this review.

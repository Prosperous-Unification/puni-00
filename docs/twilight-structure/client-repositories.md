# Client repositories and Backlog-backed WBS

Status: user-directed target; storage protocol below is proposed. Updated
2026-09-06. Sources: [Backlog.md findings](research/backlog-patterns.md), existing
[WBS MCP contract](../../apps/mcp-01/README.md), and
[refactor prerequisite](../2026-09-02-refactoring-plan.md).

Every client gets an Nx monorepo containing its projects, OpenSpec, linked domain
wiki, per-repo Backlog.md, and versioned workflow configuration. `puni-00` is the
first consumer of that setup. A central Twilight installation can coordinate
several authorized repos; source, planning, credentials, and context permissions
remain scoped to each client. A dedicated per-client installation uses the same
contracts. Distribution topology does not alter task meaning or safety gates.

## Template contract

The versioned starter supplies Nx/Bun targets, the four-artifact schema, context
navigation, test/evidence conventions, workflow profile schema, WBS/Backlog bridge
configuration, and upgrade metadata. Client content is never copied from
`puni-00` into the starter. Projects live under that repo's `apps/` and `libs/`.
Secrets are provisioned separately. Client variation is explicit configuration
or extension code with tests, not a private fork of the core workflow.

Proposed manifest: `.twilight/repository.yaml` records stable repository ID,
template version, workflow package version, planning adapter version, context
roots, gate targets, permitted integration references, and planning ref. It
contains no credentials. Validate before activation and reject unsupported
versions. Pin upgrades in a change; show the diff, migrate with fixtures, verify
locally, canary on `puni-00`, then offer the same version to clients.

The planning manifest is tagged: initially `kind: openspec` with change/task roots;
after migration `kind: wbs-backlog` with adapter version, planning ref and extension
version. A clean M1 client needs no invented Backlog revision. A trusted operator
bootstrap binds repository ID, verified remote identity, organization owner, policy
package and integration references to the server. Importing a client-authored
manifest cannot grant that binding or credentials. Bootstrap precedes any run and
is separate from per-run plan approval.

Task 8 changes the OpenSpec default to `twilight-v1` in both puni-00 and generated
clients after pinning each pre-existing change's schema metadata. Template parity
includes that default; the current opt-in pilot is the pre-acceptance state.

Self-growth uses that identical path: Twilight proposes a change to its own
repo/template, another review evaluates it, independent gates verify it, and the
existing release authority promotes it. The running factory cannot replace the
policy that currently judges its own run. A protected bootstrap/recovery command
must operate without the latest factory process being healthy.

## Storage ownership

| Record                                                                                                                           | Target persistence                                      | Owner                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| Task title/body/status/assignees/labels/dependencies/acceptance                                                                  | Native Backlog task files in client repo                | Planning adapter using pinned Backlog contracts    |
| WBS hierarchy/order/frozen numbering, per-step triples, measures, calendars, capacity, directory references, saved-plan metadata | Versioned extension files under `backlog/wbs/`          | WBS domain codec with lossless fixtures            |
| Stable planning identity, command intent and accepted batch revisions                                                            | Git-versioned planning manifest/journal, scoped to repo | Planning broker                                    |
| Derived schedules/indexes                                                                                                        | Rebuildable cache from a planning revision              | WBS; cache is never authoritative planning storage |
| Workflow checkpoints, active leases, budgets, event delivery, transient presence                                                 | Durable service store appropriate to deployment         | Twilight coordinator/runtime                       |
| Credentials and protected raw evidence                                                                                           | Secret/evidence service, client-scoped                  | Integration authority                              |

“Backlog instead of SQLite” applies to the authoritative WBS planning model. The
existing SQLite planning database must not survive as an undisclosed write
authority. Authentication or operational persistence can remain separate, with
an explicit table-by-table classification. Backlog does not natively claim all
WBS semantics, so preserve them in a documented extension instead of lossy
Markdown conventions or unknown frontmatter that an upstream edit may discard.

## Proposed transaction protocol

Use one designated planning broker per repo and an accepted Git ref such as
`refs/heads/twilight-planning`. The server reads a complete immutable Git tree at
that ref. A materialized Backlog checkout is a view; readers never combine files
from different revisions. [Proposed transaction ADR](../adr/0015-planning-commits-are-the-transaction-boundary.md).

1. A command carries `repositoryId`, `planId`, stable command ID, expected planning
   revision, actor, and typed WBS operations. Authorize before reading private files.
2. Resolve that revision into an isolated staging tree. Apply native Backlog edits
   through the pinned adapter and WBS extension edits through their codecs. Validate
   the entire resulting graph, hierarchy, identities, and batch invariants.
3. Write a commit object containing all changed files plus the command record.
   Advance the accepted ref with expected-old-ref compare-and-swap. A conflict
   returns typed 409 and the current revision; partial work remains unaccepted.
4. Publish events only after acceptance, deduplicated by command/revision. On crash,
   reread the accepted ref and journal to reconcile an uncertain acknowledgment.
   A repeated command returns its prior accepted answer; it cannot apply twice.
5. Undo creates a compensating commit with the existing WBS conflict refusal rules.
   It never force-resets shared history. Outside CLI/Git edits are imported as a
   candidate revision through the same validation and policy; malformed or divergent
   material stays quarantined with visible repair instructions.

The broker must own advancement of the accepted ref, including remote pushes:
Git access controls prevent an external writer bypassing validation. Editing a
branch elsewhere proposes input, not an accepted mutation. Cross-clone conflicts
require fetch/import and fresh expected revision; local lock files do not solve
them. A bare Backlog numeric ID is not durable identity: scope to repository and
retain a stable task UUID mapping through archive, renumber, and restoration.

The first deployment uses a self-hosted bare Git remote with an SSH forced-command
gateway deriving principal identity from the authenticated key. The accepted-ref
policy runs server-side under an OS account ordinary writers cannot modify; only
the designated broker principal may advance it. Commit author fields and client
environment variables are not identity. Restrict direct filesystem/ref writes to
that service account and protected recovery administration. Other client branches
remain ordinary proposal inputs. A different host must pass the same denial tests
before replacing this mechanism. The [Git pre-receive contract](https://git-scm.com/docs/githooks#_pre_receive)
supports rejecting the receive operation before refs update; the actual identity
wrapper and protection are Task 9 work, not supplied by Git automatically.

Native Backlog CLI/MCP tools edit a materialized candidate view and always import
through the broker to affect accepted planning state. WBS is the hosted UI; this
plan does not expose the upstream unauthenticated Backlog browser server. The
versioned stable UUID map is authoritative across native ID reuse; numeric task
names are display/interop identifiers. Test native edit → import → WBS and WBS
edit → materialize → native read in both directions, including extension fields.

Git-object/ref behavior, Backlog invocation, and WBS round trips must be measured
in a storage spike. This design does not claim they are implemented. If latency
is unacceptable, batch several UI operations using the existing command batch
contract and rebuild indexes; never silently reinstate SQLite as plan authority.

## Joining planning and source revisions

A `PlanRef` carries repository, plan and change IDs, immutable planning commit,
source base commit and requirements digest. The planning commit records the source
basis and requirement/workflow inputs; it does not contain its own commit hash.
The source candidate contains `.twilight/plan-lock.json` naming that `PlanRef`
and the generated `openspec/changes/<change>/tasks.md`. Generate those after the
planning commit exists, then commit the source candidate. This avoids a circular
hash dependency. CI checks exports against the pinned planning commit, not the
latest planning branch at verification time.

Accepted completion receipts identify task, approved plan commit, source candidate,
tests/verdicts and integration status. Completion on an unmerged feature branch
does not satisfy dependent work whose source basis lacks that change. Admission
requires predecessors be integrated into the selected source basis or explicitly
composed/tested into the dependent candidate. Rebase or changed requirements
invalidates affected evidence; task IDs alone cannot carry greens across branches.

Progress receipts do not mutate the run's approved task definition. Progress-only
commits retain the approved planning commit reference and are separately versioned;
the exported checkbox view names both plan and receipt revisions. Editing intent,
estimates, dependencies, ownership or resource policy creates a new plan definition
and revalidates affected admission/approvals. The broker classifies changes against
its versioned schema. This avoids invalidating unrelated tasks on each completed
checkbox while preventing substantive edits masquerading as progress.

## Cutover after the refactors land

The [2026-09-02 handoff](../2026-09-02-refactoring-handoff.md) already records much
of `wbs-tool-v1` (this repository's legacy project name) as done. It also names
remaining work. The prerequisite owner records a closure revision and the
following checklist in the migration change, updating the handoff from fresh
commit/gate evidence rather than treating its historical counts as current:

| Entry condition                                                                              | Required evidence                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W4-3 command registry / export contract                                                      | Landed descriptor/export contract and gates, or an explicit recorded decision to retain/version the present command contract for M2; inspect the resulting FE/BE/MCP callers.                                                                                   |
| W4-4 table split and its deferred W2-7 cell half, W2-11 shell and W3-3 work; W2-1 write half | Landed work or an explicit scoped deferral/refusal with affected contract and gate evidence. No item silently disappears because another refactor landed.                                                                                                       |
| WBS typecheck coverage                                                                       | Source and spec-project targets used by the adapter/FE/MCP contracts compile real files in CI; fix any measured errors and inject a type error to prove each target covers its files. Do not inherit the old handoff's 218-error figure as a fresh measurement. |
| Stable migration source                                                                      | Record the accepted closure commit, concrete repository/command interfaces, full table/field/history inventory and full WBS gate result against that revision.                                                                                                  |

`apps/be-01/src/repository/` is an existing interface to inspect at that revision,
not a module whose creation must be awaited. The user requested Backlog planning
after the refactorings land: Task 9's adapter implementation and Task 10's migration
start only after this closure is recorded. M1 and OpenSpec-origin automation can
proceed meanwhile. These entry conditions are future work, not a claim of closure
or a request for the user to resolve them during this planning trial.

Then run the same domain/repository contract suite against SQLite and the new
adapter. Include nested work items, all reference types, three-point estimates,
weights/rounding, capacity calendars, numbering, undo refusals, concurrent commands,
saved plans, history/actor retention, and fresh-clone reads. Compare canonical
exports, not merely row counts. Native Backlog CLI and MCP edits must preserve
extension identity, content, and unknown fields according to the explicit contract.

Shadow-read comparisons precede a short write freeze. Export and checksum the
source database, construct the accepted Git revision, compare full canonical
plans, switch the WBS backend, and exercise actual FE and MCP flows. No dual-write
period. Keep the backup read-only. If rollback is needed after new Git writes,
replay/export those accepted revisions into the old backend during a controlled
freeze before switching; restoring the old snapshot alone would lose work.

Planning bridge cutover also changes `tasks.md` authority. Until then, this repo
keeps its current single authored OpenSpec plan. Afterward WBS/Backlog owns tasks
and emits a deterministic task artifact with stable IDs and planning revision.
Progress writes go to the broker and regenerate that artifact. CI detects edited
exports; contradictions require import/reconciliation. Specifications still own
behavior, and task records link their requirements instead of copying them.

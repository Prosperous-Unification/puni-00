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

A generated client's Backlog configuration starts from a required baseline, and
each item is a refusal of an upstream default that the
[serializer, lock and configuration findings](research/backlog-patterns.md)
record: the global task ID lock stays **on**, because
`USE_GLOBAL_TASK_ID_LOCK=false` bypasses the allocation lock that sibling
worktrees share; remote operations stay **off**, because a fetch during a read
makes the corpus depend on network state the broker did not accept; and the
cross-branch board is **read-only**, because a task seen as Done on an unmerged
branch must not authorize dependent work. A client may not relax these three in
its own manifest; changing one is a template change with its own tests.

Proposed manifest: `.twilight/repository.yaml`. It contains no credentials.
Validate before activation and reject unsupported versions. Pin upgrades in a
change; show the diff, migrate with fixtures, verify locally, canary on
`puni-00`, then offer the same version to clients. Its fields:

- `repositoryId` — stable identity for this repository; scopes planning
  identity, retrieval, streams and jobs.
- `templateVersion`, `workflowPackageVersion`, `planningAdapterVersion` — the
  starter, workflow package and planning adapter revisions this repo runs.
- `contextRoots` — directories that own domain knowledge and glossaries.
- `gateTargets` — the Nx targets that constitute this repo's gate.
- `integrationReferences` — the integrations this repo is permitted to reach.
- `planning.kind` — `openspec` before migration, `wbs-backlog` after it.
- `planning.ref` — the accepted planning ref, such as `refs/heads/twilight-planning`.
- `planning.backlogDir` — the client's configured Backlog directory. Backlog
  supports `backlog/`, `.backlog/` or another project-relative path, so every
  WBS extension path below is written `<planning.backlogDir>/wbs/…` and nothing
  hardcodes `backlog/`.
- `planning.remote` — the planning remote's kind and its identity mechanism.
  A31's self-hosted bare repository with an SSH forced-command gateway is the
  default, not the only option; another kind must pass the same denial tests
  before it is selectable here.
- `planning.exportPath` — the single authority for where the deterministic tasks
  export is written. The plan lock and CI validate against this field; no other
  document states that path.
- `planning.expectedScale` — the client's declared planning scale (plans, active
  tasks, archived tasks, accepted command/receipt records) that the storage
  acceptance profile is evaluated at.
- `profiles.default` — the delivery profile name, defined in
  `openspec/schemas/twilight-v1/execution.yaml` under `profiles`.
- `retention` — a reference to an organization retention policy revision, never
  a copy of its values.
- `capacity.defaults` — a reference to an organization capacity defaults
  revision, resolved at admission.
- `extensionVersion` — the WBS extension format version; required once
  `planning.kind` is `wbs-backlog`.

An M1 client has no accepted Backlog planning revision, and none is invented for
it: `planning.kind` stays `openspec` with its change/task roots until the
migration in [Cutover after the refactors land](#cutover-after-the-refactors-land)
flips it to `wbs-backlog`. A trusted operator bootstrap binds repository ID,
verified remote identity, organization owner, policy package and integration
references to the server. Importing a client-authored manifest cannot grant that
binding or credentials. Bootstrap precedes any run and is separate from per-run
plan approval.

Task 8 changes the OpenSpec default to `twilight-v1` in both puni-00 and generated
clients after pinning each pre-existing change's schema metadata. Template parity
includes that default; the current opt-in pilot is the pre-acceptance state.

Self-growth uses that identical path: Twilight proposes a change to its own
repo/template, another review evaluates it, independent gates verify it, and the
existing release authority promotes it. The running factory cannot replace the
policy that currently judges its own run. A protected bootstrap/recovery command
must operate without the latest factory process being healthy.

## Storage ownership

| Record                                                                                                                           | Target persistence                                           | Owner                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| Task title/body/status/assignees/labels/dependencies/acceptance                                                                  | Native Backlog task files in client repo                     | Planning adapter using pinned Backlog contracts    |
| WBS hierarchy/order/frozen numbering, per-step triples, measures, calendars, capacity, directory references, saved-plan metadata | Versioned extension files under `<planning.backlogDir>/wbs/` | WBS domain codec with lossless fixtures            |
| Stable planning identity, command intent and accepted batch revisions                                                            | Git-versioned planning journal, scoped to repo               | Planning broker                                    |
| Derived schedules/indexes                                                                                                        | Rebuildable cache from a planning revision                   | WBS; cache is never authoritative planning storage |
| Workflow checkpoints, active leases, budgets, event delivery, transient presence                                                 | Durable service store appropriate to deployment              | Twilight coordinator/runtime                       |
| Credentials and protected raw evidence                                                                                           | Secret/evidence service, client-scoped                       | Integration authority                              |

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
   revision, actor, typed WBS operations and `reconciliation: exact | disjoint`.
   Missing reconciliation selects `exact`. Authorize before reading private files.
   The broker derives semantic read/write sets from the versioned command registry:
   affected task/plan fields, shared references, dependency edges and collection
   membership/range predicates. Caller-supplied sets cannot narrow them. Unknown
   command semantics and native imports require exact-basis acceptance.
2. Resolve that revision into an isolated staging tree. Apply native Backlog edits
   through the pinned adapter and WBS extension edits through their codecs. Validate
   the entire resulting graph, hierarchy, identities, and batch invariants.
3. Write a commit object containing all changed files plus the command record.
   Advance the accepted ref with expected-old-ref compare-and-swap. A conflict
   returns typed 409 and the current revision; partial work remains unaccepted.
   Ref publication is serialized; semantic conflicts are scoped to the derived
   preconditions. Under `disjoint`, a lost CAS may be recomputed on the current tree
   only if all original read predicates and write preconditions still hold. The
   broker reauthorizes and revalidates the full graph, including cross-plan
   dependencies, before retrying CAS, at most three times. The receipt records the
   original basis, each reconciliation and the accepted commit under the same
   idempotency key. Changed predicates, an exact command or exhausted CAS retries
   return 409; the client then explicitly reconciles and submits a new linked
   command ID. No losing attempt publishes events or claims acceptance.
4. Publish events only after acceptance, deduplicated by command/revision. On crash,
   reread the accepted ref and journal to reconcile an uncertain acknowledgment.
   A repeated command returns its prior accepted answer; it cannot apply twice.
5. Undo creates a compensating commit with the existing WBS conflict refusal rules.
   It never force-resets shared history. Outside CLI/Git edits are imported as a
   candidate revision through the same validation and policy; malformed or divergent
   material stays quarantined with visible repair instructions.

The broker must own advancement of the accepted ref, including remote pushes:
Git access controls prevent an external writer bypassing validation. Editing a
branch elsewhere proposes input, not an accepted mutation. Cross-clone proposals use the same server-derived preconditions and bounded
reconciliation; local lock files do not establish acceptance. A bare Backlog numeric ID is not durable identity: scope to repository and
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

### Storage workload acceptance budget

These figures are a named acceptance profile, **`storage-acceptance/default`**,
rather than one global constant. A client declares its own size in the repository
manifest's `planning.expectedScale` — plans, active tasks, archived tasks and
accepted command/receipt records — and the profile is instantiated at that
declared scale. The numbers below are the profile's default values and are the
scale `puni-00` declares for itself. A client declaring a different scale runs
the same profile against its own fixture size and reports against the same
budgets. Changing a budget changes the profile, once, rather than adding a
per-client footnote.

The spike measures the real broker, remote CAS, native Backlog adapter and WBS
reads on a pinned fixture at the declared scale. At `storage-acceptance/default`
that scale is 20 plans, 10,000 active tasks, 10,000 archived tasks, 100,000
accepted command/receipt records, and all WBS extension fields. Run five writer
clients and ten readers for 30 minutes at two offered commands/second; 90% are
single-task edits and 10% are atomic 100-operation batches. Writers cycle across
disjoint plans and deliberately contend on one plan. Record host/storage, network
latency, package pins, fixture digest, warm/cold cache conditions, sample counts,
accepted/conflicted commands and raw latency distributions.

Proposed acceptance budgets, **not measurements**: p95 command-to-accepted-ref
latency ≤ 1 second for single edits and ≤ 3 seconds for batches; p95 complete-plan
read ≤ 500 ms warm and ≤ 2 seconds cold; typed conflict response p95 ≤ 1 second;
accepted revision visible to subscribed WBS clients within 2 seconds p95; restart
reconciliation ≤ 30 seconds with that history. Successful-command latency excludes
conflicts, whose counts and latency are reported separately; no dropped command or
mixed-revision read is permitted. Restore throughput to at least two accepted
commands/second for a five-minute uncontended control after the contention run.

Run forced disjoint-plan CAS races separately: exact commands yield one acceptance
and one 409; authorized disjoint commands preserve both edits with one durable
receipt per command. Inject a changed cross-plan edge, collection member and shared
reference separately: each must refuse disjoint reconciliation. Hold a response
across restart and retry its command; one receipt and one accepted effect remain.

Add 1/2/4/8/16 writer sweeps with offered load of one command/second per writer,
ten readers and ten minutes per point on the same fixture/host. Report offered and
accepted throughput, command-to-final-answer p50/p95, conflicts, retry count and
human reconciliation effort, including failed commands in denominators. The
uncontended disjoint workload must accept at least 95% within three seconds p95
at eight writers; the contended control must retain typed conflicts without lost
updates. These are proposed budgets, not observations. A low-load latency pass
cannot stand in for this sweep. If any
budget fails, Task 9 remains incomplete; measure batching/index improvements within
this authority model or explicitly revise the proposed acceptance contract before
cutover. Never silently reinstate SQLite as plan authority.

The spike is the first slice of Task 9, so it runs after — not before — the
closure recorded in
[Cutover after the refactors land](#cutover-after-the-refactors-land). That
section is the only gate on this work; no other document states a second
prerequisite for it.

## Joining planning and source revisions

A `PlanRef` carries repository, plan and change IDs, an immutable planning commit,
a source base commit and a requirements digest. The planning commit records the
source basis and the requirement/workflow inputs it was accepted against; it does
not contain its own commit hash.

The source candidate carries `.twilight/plan-lock.json`, a versioned `changes`
map keyed by change ID. Each entry names its `PlanRef`, the input receipt
snapshot's immutable revision and digest, and the deterministic export's digest
and path. That path comes from the manifest's `planning.exportPath`; the lock
repeats it so the two can be compared, and no other document states it.

An empty input receipt snapshot is explicit and immutable. A missing or
unreadable snapshot is an error, never an empty default.

Validate that the map key, the plan's change ID, the repository and the export
path all agree. Different changes pin different accepted planning commits; they
do not track one moving head.

### A worked example

`puni-00` has two changes in flight, `alpha` and `beta`. `alpha`'s plan was
accepted at planning commit `p1`, `beta`'s at `p2`. Those are different commits,
and neither entry moves when the other's plan changes.

One source candidate, `s1`, is built on source base `b0`. Its plan lock holds two
entries: `alpha → { PlanRef(p1, b0, …), snapshot r7, export digest d1 }` and
`beta → { PlanRef(p2, b0, …), snapshot r7, export digest d2 }`. Both exports were
generated from the accepted plans _before_ `s1` was committed, which is why `s1`
can pin them.

CI verifies `s1` by resolving exactly those pins — `p1`, `p2`, snapshot `r7`, and
the two export digests. It never reads the current head of the planning ref,
because that head may have moved since `s1` was written.

`s1` passes and merges. Only then is a completion receipt accepted: task
`alpha.3` completed on candidate `s1`, with its tests, verdicts and integration
status. That receipt is an _output_ of `s1`, so it is absent from `s1`'s own lock
and cannot be added to it.

A later candidate, `s2`, may pin that receipt as a prior input. Its snapshot `r8`
contains `alpha.3`'s receipt, and `s2` regenerates its own exports against the
plans as they stand then.

### Ordering, merging and receipts

Publication order is acyclic: accept planning definitions and prior completion
receipts → freeze input receipt snapshots → generate the lock and exports →
commit the source candidate → verify and execute it → accept new completion
receipts naming it.

CI resolves only pinned inputs. A candidate never pins its own output receipt and
never rewrites its own checkbox export after completion. A later candidate may
pin those outputs as prior inputs and regenerate its export.

Two independent branches add distinct change entries and distinct task exports.
Merging them preserves the union of entries and verifies every entry against the
merged source basis; no single-value plan lock is overwritten by the second plan.

A shared change key with different references or snapshots, incompatible source
bases, or changed cross-plan dependencies produces an explicit conflict. The
integration queue reconciles only within the approved envelope, regenerates the
candidate and verifies it. Changed requirements or work outside permitted lineage
requires a new approval; a fresh source hash alone is not a new authority request.

Even disjoint entries need fresh verification of the merged candidate. Merging
does not carry candidate-bound greens or approvals to a new commit.

Accepted completion receipts identify task, approved plan commit, source
candidate, tests/verdicts and integration status. Completion on an unmerged
feature branch does not satisfy dependent work whose source basis lacks that
change.

Admission therefore requires predecessors to be integrated into the selected
source basis, or explicitly composed and tested into the dependent candidate. A
rebase or a changed requirement invalidates the affected evidence; task IDs alone
cannot carry greens across branches.

Progress receipts do not mutate the run's approved task definition. A
progress-only commit retains the approved planning commit reference and is
versioned separately, and the exported checkbox view names the plan and input
receipt snapshot revisions it was generated from.

A change in a receipt's integration status is a new attributed record, not an
edit to a pinned snapshot. If authority has since been revoked or the plan
superseded, the factory can refuse to dispatch further work on that task; that
refusal decides what happens next and leaves the pinned plan, snapshot and
exports untouched, because those are the historical inputs CI is verifying the
candidate against.

Editing intent, estimates, dependencies, ownership or resource policy is not
progress: it creates a new plan definition and revalidates the affected admission
and approvals. The broker classifies each change against its versioned schema, so
a completed checkbox does not invalidate unrelated tasks and a substantive edit
cannot pass as progress.

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
after the refactorings land, so the whole of Task 9 — its storage spike first,
then the adapter — and Task 10's migration start only after this closure is
recorded. M1 and OpenSpec-origin automation proceed meanwhile.

**This checklist is the single gate.** Every other statement of the backlog
migration prerequisite, here or elsewhere, points at this section rather than
restating a condition of its own. These entry conditions are future work, not a
claim of closure or a request for the user to resolve them during this planning
trial.

Then run the same domain/repository contract suite against SQLite and the new
adapter. Include nested work items, all reference types, three-point estimates,
weights/rounding, capacity calendars, numbering, undo refusals, concurrent commands,
saved plans, history/actor retention, and fresh-clone reads. Compare canonical
exports, not merely row counts. Native Backlog edits are expected to drop unknown
frontmatter: the [serializer findings](research/backlog-patterns.md) show it
writes only the fields it knows. So no WBS-owned value lives in a task file's
frontmatter; the extension lives in its own files under
`<planning.backlogDir>/wbs/`, keyed by stable task identity, and a native edit
must leave that identity intact. The
adapter drives Backlog only through its pinned CLI and MCP surfaces; importing
its internal Core package is not a verified contract and is not used until proved.

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

## Contract for the M2 storage delta

The M2 OpenSpec delta (Task 9) adopts these requirements. They are not part of
the M1 delta.

### Requirement: WBS storage replacement has a gated migration contract

The Backlog/WBS adapter MUST be implemented only against an identified landed WBS
refactor interface. Its migration MUST preserve the complete WBS planning model,
atomic batches, stable identity, conflict-aware undo, and actor/history semantics
or explicitly specify any accepted contract change before cutover.

- A multi-file command is interrupted: WHEN the planning writer crashes between
  preparing files and publishing a revision THEN readers see either the entire
  prior plan or the entire accepted new plan, with no mixed revision and no
  duplicate command on recovery.
- Native Backlog editing changes a display ID: WHEN a task is archived, restored,
  renumbered or assigned a reused Backlog ID THEN its stable planning identity and
  historical evidence cannot bind to a different task.
- Two clones propose exact-basis edits from one planning revision: WHEN both
  attempt to publish against the same accepted revision THEN only one publishes
  and the other receives a conflict requiring explicit reconciliation; local lock
  success cannot imply global acceptance.
- Two disjoint plans race on the accepted ref: WHEN both commands authorize
  disjoint reconciliation and their derived semantic preconditions remain true
  THEN both edits can be accepted through bounded CAS retries, with original and
  accepted bases recorded; exact commands still return 409 on a changed basis.
- A dependency changes during disjoint reconciliation: WHEN an original read
  predicate or shared-reference precondition no longer holds THEN acceptance is
  refused even if the edited files are disjoint; a caller cannot omit that predicate.
- Cutover comparison loses an estimate: WHEN export/round-trip comparison finds a
  missing estimate, ordering value, reference, capacity rule, command history, or
  other required planning field THEN cutover is refused and the current backend
  remains authoritative.

### Requirement: Planning storage meets a measured workload budget

Before accepting the proposed Git transaction design or switching WBS authority,
the storage spike MUST execute the acceptance profile above at the client's
declared scale. Evidence MUST include package/host/fixture identity,
command/conflict counts and latency distributions. These budgets are proposed
requirements, not measurements.

- Storage preserves fields but misses its latency budget: WHEN the full workload
  round-trips losslessly but any specified acceptance budget is exceeded THEN
  storage acceptance and cutover remain blocked pending measured improvement or an
  explicitly revised contract, without substituting SQLite planning authority.

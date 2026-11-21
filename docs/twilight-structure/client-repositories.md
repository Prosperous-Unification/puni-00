# Client repositories and WBS planning

Each client uses the same versioned Nx monorepo template as `puni-00` for its projects, OpenSpec, linked wiki, workflow configuration and pinned planning artifacts. A client’s authoritative plan and progress live in its scoped WBS project. Dash owns runtime checkpoints and leases. Client credentials and protected evidence stay with their respective authorities.

## Template contract

The versioned starter supplies Nx/Bun targets, the four-artifact schema, context
navigation, test/evidence conventions, workflow profile schema, WBS export
configuration, and upgrade metadata. Client content is never copied from
`puni-00` into the starter. Projects live under that repo's `apps/` and `libs/`.
Secrets are provisioned separately. Client variation is explicit configuration
or extension code with tests, not a private fork of the core workflow.

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
- `planning.kind` (`openspec` or `wbs`) selects authored OpenSpec tasks during the pre-bridge workflow or WBS-exported tasks after the bridge is enabled for that change.
- `planning.exportPath` identifies the deterministic task export, checked by the plan lock and CI.
- `profiles.default` — the delivery profile name, defined in
  `openspec/schemas/twilight-v1/execution.yaml` under `profiles`.
- `retention` — a reference to an organization retention policy revision, never
  a copy of its values.
- `capacity.defaults` — a reference to an organization capacity defaults
  revision, resolved at admission.

A trusted operator binds repository identity, organization, WBS project, policy and permitted integrations at the server. Client configuration supplies references and cannot grant access. Per-run approval is separate.

Task 8 changes the OpenSpec default to `twilight-v1` in both puni-00 and generated
clients after pinning each pre-existing change's schema metadata. Template parity
includes that default; the current opt-in pilot is the pre-acceptance state.

Self-growth uses that identical path: Twilight Navigator proposes a change to the
product's own repo/template, another review evaluates it, Twilight Burokrat verifies
it, and the existing Twilight Dash release authority promotes it. The running Vesper
Shipyards installation cannot replace the policy that currently judges its own run. A
protected bootstrap/recovery command must operate without the latest factory process
being healthy.

## Planning authority

WBS retains SQLite and its existing plan model. For one organization, project, repository and change, WBS will accept an immutable export/reference, replace it by exact version comparison and apply a bound receipt only on an explicit authorized request. Concurrent changes conflict and require explicit resolution. Project-configured leaf-step workflow states and board drags address the existing WBS step progress. Board columns add no separate progress authority. The [decision](../adr/0079-wbs-accepts-planning-references-and-progress.md) and [transaction contract](../../openspec/changes/progress-receipt-authority/design.md) record the approved, unimplemented additions. The earlier Backlog adapter, Git-ref broker, load spike and migration were withdrawn before implementation.

The repo's currently authored OpenSpec task lists remain authoritative for those changes. A change using the versioned bridge has one WBS-owned plan and a deterministic exported task artifact. Resolve divergence by regenerating from the pinned acceptance, or by explicitly editing WBS, reaccepting the reference and repinning a new candidate. A source branch or regenerated task list cannot publish accepted progress.

## Joining planning and source revisions

A `PlanRef` carries repository, plan and change IDs, two operator-selected Git object IDs (planning artifact and source base), and the digest of the original requirements bytes. WBS checks the supplied requirements/export bytes and binds their reference to the operator's chosen coordinates. CI independently resolves and verifies source content at its pins.

A source candidate carries a versioned, change-keyed `.twilight/plan-lock.json`. For a WBS-origin change each entry supplies organization, repository, WBS project, change, acceptance version, complete reference digest and PlanRef, immutable input receipt snapshot revision/digest, and export path/digest. The export path must match the manifest's `planning.exportPath`. Historical lookup checks the response against the full entry. Equal PlanRef tuples and equal tasks can name different export bytes, and identical bytes can be reaccepted under a new version.

An empty input receipt snapshot is explicit and immutable. A missing or
unreadable snapshot is an error, never an empty default.

Validate that the map key, the plan's change ID, the repository and the export
path all agree. Different changes pin different WBS-accepted references; they
do not track one moving head.

### A worked example

`puni-00` has two changes in flight, `alpha` and `beta`. `alpha`'s plan was
accepted by WBS at version `v1` with planning artifact `p1`, `beta`'s at `v2` with artifact `p2`. The entries are scoped to their changes,
and neither entry moves when the other's plan changes.

One source candidate, `s1`, is built on source base `b0`. Its plan lock holds two
entries under their respective organization/project/repository/change scopes: `alpha → { v1, reference digest h1, PlanRef(p1, b0, …), snapshot r7, export digest d1 }` and
`beta → { v2, reference digest h2, PlanRef(p2, b0, …), snapshot r7, export digest d2 }`. Both exports were
generated from the accepted plans _before_ `s1` was committed, which is why `s1`
can pin them.

CI verifies `s1` by resolving the scoped historical pins `v1/h1` and `v2/h2`, both source coordinates, snapshot `r7` and the export digests. It never reads the current accepted reference in WBS,
because that reference may have changed since `s1` was written.

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

Accepted completion receipts identify task, accepted plan reference, source
candidate, tests/verdicts and integration status. Completion on an unmerged
feature branch does not satisfy dependent work whose source basis lacks that
change.

Admission therefore requires predecessors to be integrated into the selected
source basis, or explicitly composed and tested into the dependent candidate. A
rebase or a changed requirement invalidates the affected evidence; task IDs alone
cannot carry greens across branches.

Progress receipts do not mutate the run's approved task definition. A
progress-only WBS transaction retains the approved reference and is
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
and approvals. WBS classifies each change against its versioned schema, so
a completed checkbox does not invalidate unrelated tasks and a substantive edit
cannot pass as progress.

## Context

The approved intent is in [proposal.md](proposal.md); the terms are in
[`CONTEXT.md`](../../../CONTEXT.md). The current typed relationship store and
`DependencyGraphGuard` require both endpoints to belong to one project. The
shared-people reader schedules complete projects in rank order and considers
only higher-ranked shared-person influencers. Neither boundary can represent
`A.design → B.build → A.test` correctly by adding a remote search result alone.

The existing seams to extend are `TypedDependencyStore`, `DependencyGraphGuard`,
`canonicalScheduleParts`, `ChainSnapshotStore`/`LivePlanStore`, the domain
step-node graph and scheduler, and the optimized request/publication adapters.
HTTP/MCP commands, live reads, saved plans and export already depend on these
seams. The change must reach them together before external writes activate.

## Goals / Non-Goals

**Goals:** Address projects and work items unambiguously; preserve typed
relationships across projects; validate the actual combined step-node graph;
produce coherent dates and readiness through existing read surfaces; preserve
access, undo, capture and deployment safety.

**Non-Goals:** Cross-organization relationships, indivisible project ordering,
whole-project dependency endpoints, a new organization-wide optimization
objective, global optimality claims, or changing existing progress/hold rules.

## Decisions

### D1. Approved syntax and stable identities

Approved: generated/recommended abbreviations use 3–5 uppercase ASCII letters.
Manual values normalize lowercase and validate against
`^[A-Z][A-Z0-9_-]{0,19}$`: 1–20 characters, first character a letter, subsequent
characters letters, digits, hyphens or underscores. Uniqueness is case-insensitive
within the organization; pre-activation projects use an explicit legacy
namespace. Qualified addresses use a dot, for example `PUNI-CORE.080.39`.
The first dot separates the abbreviation from the existing work-item/step
reference grammar. Local numeric addresses retain their existing interpretation.

Relationships store stable project, work-item and step identities, not address
strings. Labels derive from the current abbreviation and current frozen or
derived number. A rename or renumber never reconnects an existing relationship.
Address resolution returns identities which the command revalidates against
current ownership; an earlier autocomplete answer is not write authorization.

### D2. Additive abbreviation allocation

Add a project-abbreviation side table with a unique project identity, normalized
abbreviation, and explicit namespace, backed by unique namespace/abbreviation
indexes. The application exposes the abbreviation as a required project field.
Missing or malformed trusted rows throw rather than generating a read fallback.

Backfill all projects transactionally and install an allocator for legacy
project inserts. Normal creation suggests a name-derived 3–5-letter code,
resolves collisions with alphabetic suffixes, and writes the selected code with
the project. The old-writer trigger allocates a five-letter code from an atomic
counter, skips occupied codes, and refuses exhaustion. It reserves generated
codes across existing namespaces so assigning the new project to its organization
cannot collide. The organization-mapping insert updates the abbreviation's
namespace in the same transaction. A new scoped writer applies a manual code
after ownership exists. This avoids requiring an old binary to supply a column
it does not know while retaining organization-scoped manual uniqueness.

The migration and its rollback must prove old-style inserts, concurrent
allocation, ownership mapping, duplicate manual codes and the full backfill.
Generated fallback codes need not resemble a name; visible editing does not
change endpoint identity.

Modern allocation tries the ordered name recommendations, then the first
recommendation's three-letter stem followed by AA through ZZ, deduplicated in
order: at most 679 candidates. Occupancy excludes the newly inserted project.
Candidate-family exhaustion and the exact legacy-trigger exhaustion become
`abbreviation_exhausted` (409); broken counter state remains an unexpected
failure. All creation writes, including counter advance, ownership, selected
code and steps, roll back together. Optional manual POST/PATCH input is
normalized once; invalid input is 422 and a taken abbreviation is 409. Existing
authorization and foreign-project refusal ordering precede conflict disclosure.
An unchanged code alone does not bump revision; a combined patch bumps once.

Live project types and responses require the persisted abbreviation. Version-10
plan documents use a separate shape that accepts absent abbreviation metadata
and validates it when present; no historical live lookup fills it in. Import
allocates a destination code and propagates allocation refusal transactionally.
This metadata-only change does not bump the transfer version. Strict new clients
are released only after compatible backend routing; rollback preserves compatible
frontend/backend ordering. Old clients retain additive-response compatibility.

Joined project reads reuse one strict abbreviation decoder with LEFT JOINs so
missing trusted rows fail rather than vanish. Namespace filtering precedes
decoding, and project listings preserve their one-statement contract.

### D3. One domain relationship, distinct additive persistence

Existing local typed rows retain their schema and meaning. Add external typed
rows with the same relationship identity, endpoint scopes and FS/SS/FF type,
plus explicit predecessor and successor project identities. The successor
project owns the relationship. Composite ownership checks prove that each
work item and optional step belong to its declared project, and that both
projects belong to the same organization. Index both incident directions.

The application consumes a single typed relationship model. The store combines
local and external rows for owned reads and supplies incident reads for graph
capture and structural edits. It does not introduce separate reference-only
semantics. Duplicate detection covers the unified endpoint/type key. Updating
between local and external endpoints preserves the relationship identity and
moves its physical representation atomically.

The store uses required project-scoped endpoint types; existing local domain
and historical payload types remain explicit legacy shapes. Local constructors
attach their known owner to each endpoint. Owned and incident reads observe one
coherent union, validate required endpoint/ownership evidence and reject duplicate
physical identities instead of hiding them through deduplication. Incident reads
return each relationship once even when both endpoint projects are requested.

External persistence requires real organization ownership for both projects,
composite work-item/step ownership foreign keys and restrictive deletion. Both
physical tables guard cross-table identity and endpoint/type duplicates on insert
and update. Representation changes retain creation audit values, preserve the
successor owner and bump each old/new affected endpoint once in one transaction.
Bulk deletion refuses a doomed external predecessor whose successor survives.
Rollback refuses while external relationships remain; when empty, it preserves
all existing local rows and audit values. This storage foundation does not enable
external authoring before the complete semantic activation barrier.

Creating, editing or removing an external relationship requires successor edit
permission and readable predecessor access. Every command checks the current
organization and role inside its transaction. Foreign and absent endpoints
receive the same not-found response. Restricted projects remain readable under
the existing policy; predecessor edit permission is not required.
An admitted batch remains scoped to one successor project. A client creating
relationships owned by two successor projects submits separate authorized
batches; external endpoint lookup does not broaden batch authority.

#### Command endpoint admission

Extend the existing typed commands and their authoritative shared command
registry, not a separate external-link write route. An omitted endpoint
`projectId` means the batch owner and retains existing local ID/alias forms.
An explicit `projectId` requires stable endpoint IDs (or the existing `sn1`
node encoding), never `workItemRef`, even when naming the owner. Whole, node
and descendant-step combinations retain their current field exclusions.
Explicit IDs are opaque nonempty strings without surrounding whitespace; no
new UUID-only restriction applies to existing opaque identities. Normalize
these forms once into a precise local-versus-explicit command union, then
bind both to required scoped endpoints. Qualified text resolves before writes;
write commands never rebind an address string or require a lookup revision
for already resolved stable IDs.

One coupled implementation lane owns shared wire shapes, semantic parsing,
local alias binding and endpoint admission. The admitted transaction rechecks
current session/binding/organization membership and successor edit authority.
A narrow required capability supplies checked detached predecessor evidence;
it does not expose remote mutation or broaden the retained working plan.
External authoring requires scoped organization authority; deployment-wide
legacy access continues local commands but does not acquire an external write
grant from a project's ownership record. Update/remove look up the existing
relationship only in the owner's set and recheck old as well as new endpoints.
Foreign/absent endpoints and a second successor owner remain concealed.

Refresh the retained owner's rows only for owner-local endpoint IDs. The unified
store already bumps the actual old/new endpoint union; remote revision/label
evidence comes from the checked transaction capability. History stays owned by
the successor. Resulting-state graph validation, remote replay preconditions and
post-commit connected announcements must be integrated before authoring is
activated. A parser fixture or permissive graph mock cannot prove a valid
external mounted write. Calendar and solver availability do not gate endpoint
admission. Calendar-unavailable and optimization response producers remain
with their real derivation slices; do not invent successful placeholder results.

The [command integration ruling](architecture/command-admission.md) pins principal
propagation, current same-writer authority, checked scoped endpoint evidence,
the connected guard facade and exact remote revision replay preconditions.
Generic stores remain owner-scoped. Until real connected live/fanout consumers
and the semantic activation barrier exist, a required explicitly dormant
capability rejects external writes before mutation with
`external_dependencies_inactive`; no optional absence means enabled. Real
admitted SQLite transaction positives are distinct from mounted public success.

### D4. Coherent capture and actual graph validation

Extend the captured-plan port with a detached collection of connected projects,
their own settings/steps/rows/estimates/progress, authored relationships,
capacities, assignments, rank and endpoint labels. One dedicated SQLite snapshot
owns authorization, closure discovery, input capture and optimized-cache
selection. Capture reads never admit solver work or publish events.

For externally connected components, including isolated capacity mode, keep
that snapshot open through combined derivation and sequential optimized-cache
selection. Detach the final inputs, boundary evidence and selected schedules
before closing it. A cache publication committed after the snapshot begins is
visible only to a later capture, never to a later optimization stage in the
current capture. Close on success, modeled refusal and throw. Ordinary isolated
captures without external dependencies still close before scheduling their
detached values. Saved body hashing, serialization, quota checks and persistence
remain outside every capture transaction.

Graph validation captures a smaller authored observation than scheduling:
per-project trees, steps, estimate presence, legacy reach/edges and scoped typed
relationships. Its transaction-bound reader borrows the command's admitted
transaction and applies proposed local overrides before discovering new closure.
It does not open a second connection, invoke scheduling or reduce held subtrees.
Both this observation and the full plan capture adapt to one domain graph
resolver that reuses the existing endpoint expansion helper with separate
predecessor/successor project contexts. Resulting-state guards therefore do not
wait for placement or solver implementation.

Owned relationship counts cannot establish the absence of external constraints;
incoming relationships may belong to another successor owner. Read incident
relationships in both directions, including for step-reference guards. Each
staged graph-affecting command gets a fresh effective observation; preserve the
existing per-command validation and whole-batch rollback behavior. A proposed
new edge may introduce a new component, so closure must include proposed endpoints
rather than only the previously connected set.

For graph validation, follow incident external relationships to closure. For a
connected schedule, also include shared-person connections in both directions
when capacity mode is shared. Every project read starts from the same captured
component, rather than computing different schedules according to the requested
project. Isolated mode follows explicit dependencies but namespaces people per
project. Components without external dependencies keep the existing local or
shared-people path.

The full detached connected capture carries explicit organization, capacity
mode, rank-ordered project inputs with required live abbreviations and one
scoped relationship collection. Per-project historical input fields retain their
local relationship representation; the unified collection preserves external
identity separately. In shared mode, topology discovery alternates dependency
and shared-person connections to a fixed point before capturing each required
project once. An external edge anywhere across shared-person bridges selects
the connected path. Ordinary isolated plans with no incident external edges
retain the existing early-close path; no search-page bound truncates closure.

The capture foundation and minimal graph observation can be implemented in
parallel. A discriminated live connected projection is wired only when actual
connected derivation exists; until then the capture task's live integration
remains incomplete. Never disguise a connected component as an old rank chain
or manufacture a schedule to satisfy a type.

Resolve each project's workflow and legacy edges using its own step order and
`depReach`, then combine those resolved nodes with typed external edges. Whole
and descendant-step scopes expand only under their own endpoint project. The
cycle guard examines the combined step-node graph, including proposed tree,
step and relationship changes. A cycle in a graph of project names is not a
refusal. A real node cycle or self-node pair is refused atomically.

The same resulting-state guard runs for command batches, direct commands,
structural changes, estimate changes affecting legacy anchors and undo/redo.
Readiness and startable reads evaluate external progress through this same
captured relationship graph, preserving the current relationship-type rules.

Borrowed observation capabilities require an irreversible adapter-owned lifetime,
separate from organization authority. SQLite creates a fresh scope and borrowed
live/fanout readers for each unit-of-work run; a source-wide reader or a mutable
current-token slot would revive an old capability in a later transaction. The
lifetime expires before COMMIT/ROLLBACK on every outcome. Acquisition, retained
capture/scheduler/cache callbacks, early returns and asynchronous continuations
check it before further reads. Owned observations apply the same expiry rule
while retaining connection ownership; borrowed observations never settle or
close their caller's transaction.

Refused replay's existing journal-only repair receives a fresh OPEN-gated base
store scope after successful rollback, without borrowed live/fanout capability.
It remains inside the coordinator turn and outside the transaction catch; a
repair failure must not trigger another rollback. Existing WorkingPlan close
and edit-grant expiry remain independent. This requires an adapter scope factory,
not a generic core Scope redesign. Production-source tests must prove that old
callbacks cannot revive during the next transaction and suspended captures
cannot resume reads after settlement.

### D5. Combined Fast scheduling with project-specific inputs

Introduce a resolved scheduling input boundary beside the existing graph seam.
It carries resolved nodes/edges, project membership, rank and scoped capacity
keys. Existing single-project scheduling adapts to it without copying the
levelling algorithm or weakening local validation.

Compute each project's slices with its own estimate method, rounding, step
ordering and widths. Preserve the existing removal of on-hold subtrees before
both engines; do not reinterpret hold, completion or readiness as part of this
change. The hard scheduling constraints are those remaining after this hold
reduction: remove held leaves, fully held ancestors and incident scheduling
edges; partly held selectors expand over their surviving leaves. Apply that
same reduction to external edges, so a successor does not wait for a held
external predecessor solely because of that relationship. The authored
relationship, captured hold evidence and existing readiness semantics remain
visible; cycle and structural validation still examine the unreduced authored
graph. Keep legacy reach per project rather than assigning one reach to the
combined forest.

Map dated projects onto a shared workday origin using
`workdayOrdinalOf(startDate)`. Retain each project start as a floor, translate
manual floors/deadlines without losing fractional offsets, and map the resulting
projection back through the project's own anchor. The current calendar uses
Monday–Friday workdays; timezone remains the existing progress/actual-day
interpretation and is not a new scheduling calendar.

Namespace team and resource pool keys by project. Share person identity only in
shared-capacity mode. Dependency eligibility and FS/SS/FF inequalities remain
hard constraints. Among eligible work, project rank precedes the existing
within-project ordering; neither project rank nor work-item priority can make
an unmet prerequisite eligible. Do not create artificial whole-project edges.

Implementation default: accepting a link does not require a start date. If a
connected dependency schedule needs an absent project anchor, return a typed
`dependency_calendar_missing` unavailable schedule naming the readable project;
keep the tree, relationships and readiness inspectable. Do not fabricate day
zero, drop the edge or publish a partial dated answer as complete. Existing
undated plans without external dependencies retain their current behavior.

The [connected scheduling ruling](architecture/connected-scheduling.md) fixes the
resolved-input seam in the existing leveller, own-project preparation and
capacity namespaces, affine calendar translation, required runtime callback,
and detached connected projection. Local golden and pinned behavior retain
their meaning. An optimized-selected member remains explicitly unavailable
until connected optimization exists; local optimizer availability is not proof
of connected support. Required node/edge integrity is checked before placement.

The [core lane staging decision](architecture/core-fast-lane.md) permits pure
connected derivation against the accepted capture value before unrelated
adapter lifetime repairs finish. Its Fast callback is required and tested with
the real resolved engine. The integrator later supplies the snapshot-guarded
runtime method; no optional callback or alternate placement implementation is
introduced.

Execution eligibility is a separate domain reading from forecast placement and
node-reading labels. FS start requires predecessor completion; SS start requires
actual start or completion; FF constrains finishing rather than starting. Apply
the same rules to local and remote resolved edges and advertised startability,
using attempts/progress from the same observation. Governed step claim/start
admission shares that evaluator. Existing manual progress/actual corrections
remain explicit observations and are not newly prohibited. Rank and priority
never supply missing prerequisite progress. The current local startable code
has an unfinished-FS gap; task 6.3 must close it rather than copy it remotely.

### D6. Coherent optimization while retaining per-project controls

The approved semantics require Fast/optimized constraint parity; they do not
request one engine or objective for an entire organization. Independently mixing
projections of different combined schedules is unsafe. Use one deterministic
composite placement for an affected component instead:

1. Compute the combined Fast baseline.
2. Visit projects in rank order, with stable identity as the final tie-break.
3. Build each project's optimization question with every other project's
   current starts fixed. Retain its own engine, enablement and objective
   settings. A Fast-selected project leaves its current placement unchanged.
4. Apply a selected ready optimized variant only after validating the complete
   resulting component. Pending/failed states retain the current valid placement
   with the existing visible optimization state; an unavailable required engine
   remains an explicit refusal.
5. Derive every displayed project projection from the final composite placement.

This is a single bounded pass, not recursive per-project tree reads or an
unbounded fixed-point iteration. Earlier stages use later projects' baseline
placements; later stages respect already selected earlier placements. A change
to a later stage cannot invalidate an earlier placement because publication
rechecks all constraints with those earlier starts fixed.

Incoming external relations produce lower bounds on local starts/finishes;
outgoing relations to fixed external nodes produce upper bounds. Translate
FS, SS and FF separately and retain provenance for diagnostics. External person
occupancy produces fixed intervals; local teams/resources retain their own
capacities. Add explicit boundary constraints to the versioned solver request,
its Python model and independent Bun response validation. Validate both
quantized solver values and materialized real workday boundaries. Quantization
never weakens an external constraint.

Fixed external boundaries introduce a modeled infeasible optimization subproblem
even when the real composite is feasible. For example, A finishing at 0.2 and C
starting at 1.2 force a one-day B between them to start at 0.2. At quantum 48,
the conservative lower start is 10 and upper start is 9: there is no integer
solution. This is neither invalid solver output nor proof that the plan's
authored deadlines are impossible. The existing `evaluateSolverOutcome` rule
classifying infeasible by presence of deadline entries must not be reused for
these requests.

Add a distinct `boundary-infeasible` terminal outcome for a validated connected
stage's fixed-boundary quantized subproblem. Its certificate records the exact
question identity, stage project/objective, quantum and contract version,
external boundary identities/values, and all effective local constraints.
The certificate's scope is that captured subproblem only, regardless of whether
the question also contains authored deadlines. A validated contradictory-bound
preflight or a proven-infeasible solver response can establish this outcome;
unknown, timeout, malformed requests and invalid answers retain their separate
failure dispositions. Existing no-external-boundary behavior is unchanged.
Preparation must permit this modeled answer before requiring a feasible
quantized baseline. Keep the feasible real composite as separate evidence;
never fabricate a feasible `baselineOffsets` witness for an empty integer
window or classify that expected window as a malformed request. Any solver
seed remains distinct from a validated feasible baseline in the new contract.

Persist this outcome separately from failed/invalid-output and plan-infeasible
deadline certificates, with versioned cache/wire/public DTOs and strict decoding.
Keep the valid composite placement, release the solver slot, and explain visibly
that optimization cannot fit the captured external boundaries at the stated
resolution. Do not mark the complete connected plan unschedulable, blame an
unrelated deadline or call this an optimality/quantisation-floor result.
Repeated reads do not automatically re-admit the exact certified question;
manual Retry returns the typed not-retryable boundary-infeasible state. Changed
boundaries or other placement-relevant inputs produce a fresh identity and
normal admission, without discarding historical evidence. Exercise this outcome
through preparation, solver exit, persistence, capture, restart and Retry, not
only the Python model.

Each cache identity includes the local inputs, boundary placements for that
stage, relationship identities/types, calendar anchors, capacity mode, rank
and contract versions. Earlier selected variant changes invalidate later stage
questions. Later selected variants do not feed back into earlier stage hashes;
the captured stage boundary is explicit. Labels are captured for presentation
but do not substitute for constraint identity. Publication compares the exact
question identity, validates unchanged foreign placements and checks every
incident constraint before exposing a result.

The scope of an optimization proof is the project's objective under these fixed
external boundaries. It is not a proof of global optimality. Fast/optimized
comparison is also evaluated under its stated captured boundary, rather than
showing a projection from an unrelated component placement as interchangeable.
Unaffected projects retain the existing optimization path. This bounded policy
is the implementation recommendation, not an additional approved product-wide
engine policy.

The [optimization integration ruling](architecture/connected-optimization.md)
pins immutable stage inputs, all six normalized boundary inequalities,
conservative quantization, movement references separate from feasible witnesses,
full pinned real replay and stage-scoped publication comparison. Terminal
boundary certificates use additive immutable persistence and exact-question
Retry suppression; the current cache schema cannot represent them unchanged.
Wire/runtime/migration versions remain proposed until the integrator reserves
unused identities. Task 7.4 is required for production completion. Its ownership
appendix separates new core preparation/derivation files from shared live and
command integration files.

### D7. Lifecycle, snapshots and downstream readers

Implementation default: refuse deletion of an externally referenced predecessor
or project until its incoming external references are removed. Deleting a
successor removes its own relationships in the existing undoable command.
Do not cascade another project's blocker away silently.

Structural hand-down follows step facts and updates all incident external
endpoints transactionally. Journal touched identities and compensating commands
cover those updates; undo revalidates endpoint ownership, shape and the combined
graph, refusing concurrent changes atomically. No structural edit silently
broadens or narrows an authored endpoint scope. Exact first-child incident mapping
is derived structural continuity: editing the structural project and currently
reading all required endpoints permits the mapping even when a remote successor
is restricted against edits. Successor ownership, ID, type, scope, step and
creation audit remain unchanged. This grants no general remote relationship
writer. One compound compensation belongs to the structural owner's entry; no
remote history is created or silently rebased. Replay requires the exact original
and mapped receipts, current endpoint evidence and scoped revisions, and validates
the staged connected graph after reattachment. Missing replay evidence is trusted
corruption, never a fresh-capture fallback.

Extend committed-event fan-out to all affected readable projects, independent
of whether they share a person. Recompute component identity on topology,
progress, estimate, calendar, capacity, rank and engine-selection changes.
Abbreviation/name/number changes refresh labels without retargeting links.
Events are emitted after commit and carry no foreign-organization labels.

Live tree, retained batch reads, person load, spaces, saved/current comparison,
arrange-by-schedule and optimizer restarts use the same capture/derivation.
Saved plans capture external identities, labels and selected schedule evidence;
historical reads never fetch live foreign rows. Version export/import to
distinguish external references from remapped internal endpoints. Import must
resolve external references explicitly within the destination organization or
refuse; it must not reconnect by a reused abbreviation or silently omit a link.
Copying remaps copied identities and preserves authorized external prerequisites
of copied successors. It does not duplicate outgoing relationships from a copied
predecessor into successor-owned projects elsewhere: those relationships keep
their original predecessor, and copying introduces no new implicit blockers in
another project.

Scoped import preparation retains authored diagnostic paths. Allocation produces
one complete successor-owned relationship set in document order before typed
persistence. The private import resource binds the admitted actor/access and
created owner; its dependency context reads raw stores on the borrowed writer
with no incident mutation admission. It checks endpoint ownership/readability,
shape, final scoped tuples and the complete proposed connected graph before the
first typed insert. If a refused graph names only existing corrupt edges,
subsequent read-only closure checks identify the external declaration for the
refusal; they never grant per-edge admission. Composition closes context and
observation on every settlement, captures durable consequences inside the writer
and delivers them only after release.

Production import supplies inactive authoring explicitly, independently of the
persisted storage marker. Every import carries explicit `CommandCaller` evidence.
Composition resolves `CommandAccess` after writer admission and `BEGIN IMMEDIATE`,
before resource construction, capture, directory access or endpoint admission;
the returned current access supplies callback, resource and dependency context.
Expected access pins context and identity and supplies no current write authority.
The existing process resolver rereads browser binding/revocation, membership and
credential policy and the persisted machine/consent credential/person binding.
Read-only direct principals refuse before writer admission; explicit legacy
callers require durable pre-activation. Modeled resolver refusals retain their
complete wire bodies; trusted state failures throw and roll back.

Retained evidence does not identify a selected API secret or carry upstream JWT
or delegation verifier expiry, and the local consent credential family column
is not independently current remote MCP family state. Those verifier and rotation
limits remain outside this slice. Test-only active capability plus synthetic
persisted authority proves transaction semantics, never public activation.
Export/schedule/boundary evidence, copy/history rollout, participant activation
and a mounted successful external import remain task 8.1 debts.

### D8. Picker and implementation boundaries

The active empty or numeric token searches locally only. An alphabetic initial
character enables bounded, debounced project autocomplete while preserving
local title matches. Selecting a project scopes remote work-item/step lookup.
Cancel or ignore stale answers after token changes, including a return to a
numeric token. Model loading, no matches and query failure explicitly.

Remote result DTOs contain only the authorized identity/label/step metadata
needed for the picker. A step-cell default cannot compare step UUIDs across
projects: suggest an unambiguous matching step code, otherwise show the choice
unavailable and require an explicit endpoint selection. Use qualified labels
on chips/cards and a navigation affordance instead of drawing an arrow to a row
which is not present in the current Gantt.

The additive lookup operations are `GET /api/project-addresses/projects`,
`GET /api/projects/:id/address-candidates` and
`GET /api/projects/:id/address-references`. The selected path ID is the observed
stable project identity; resolution never follows an abbreviation to a different
holder. Existing local `/step-references` and its `ar1` contract stay unchanged.
New candidate and resolution operations use `qar1:` plus the injected SHA-256
of `JSON.stringify(['qar1', projectId, abbreviation,
describeAddressSpace(projectId, space)])`. Parse syntax before comparing the
revision; compare revision before resolving a changed prefix. Missing endpoints
or a current prefix mismatch return generic 404; stale observations return 409;
malformed, parent-step or ambiguous/alias-mismatched references return typed 422.

Discovery and candidates default to 25 entries, at most 200. Discovery has no
work-item reads and uses scoped SQL keyset chunks ordered by abbreviation/ID.
A safe SQL superset followed by the existing exact name predicate preserves
non-ASCII name matching without claiming SQLite performs Unicode case folding.
Empty or non-letter-leading discovery returns an empty external page after
admission and query validation. Selected-project queries may be empty/numeric.
Candidate pages count whole, leaf-node and parent descendant-step options under
one bound; uncoded and parent-step candidates have no textual reference.
Minimal complete placements and ordered steps of the selected project are
captured once for derived numbering and revision, then iterated lazily.

A dedicated authorized read snapshot binds access, required abbreviation
metadata and selected-project facts, and closes on every outcome. No scheduler,
optimizer admission or write belongs in lookup. Versioned cursors bind the
normalized query and server-derived access namespace through the injected digest;
endpoint cursors also bind project ID and qualified revision. Wrong bindings or
impossible coordinates refuse as invalid query; changed address meaning refuses
as stale. Cursor contents confer no authority. Legacy deployment-wide readers
may see duplicate abbreviations from different organizations: return separate
stable project choices and require explicit disambiguation, including checking
continuation before treating an exact code match as unique.

Keep pure abbreviation/address parsing and connected graph/scheduling
derivation in `libs/wbs/domain/domain`. Add narrow application capture/search
ports and orchestration beside `dependency-graph.ts` and `shared-people.ts` in
`libs/wbs/application/core`; avoid adding another complete scheduler to the
work-item service. SQLite adapters own coherent capture, allocation, constraints
and transactional incident writes. Shared contracts own HTTP/MCP versioned
shapes. The solver adapters own wire conversion/publication checks. Frontend
reference fields consume bounded lookup and detached external projections.

## Risks / Trade-offs

- Connected capture can grow beyond one plan. Indexed closure reads, one
  capture per project, deterministic ordering and benchmark fixtures bound
  implementation cost; never truncate required prerequisites to meet a budget.
- Mixed engine choices require captured boundary provenance and full-component
  publication checks. The bounded optimization pass preserves choices and
  feasibility but does not search all jointly improvable placements.
- Older binaries ignore additive external rows. Schema compatibility alone
  does not make overlapping runtime versions semantically compatible.
- Abbreviation reuse makes textual addresses unsuitable durable identities.
  Export/import and existing relationships must use UUIDs, with addresses as
  captured explanatory labels.
- Existing unarchived scheduler changes also modify solver wire contracts.
  Reconcile against the installed schema/version at implementation time; never
  allocate a version by assuming the oldest main spec describes runtime.

## Migration Plan

1. Ship additive abbreviation/allocation and external-relationship tables with
   rollback scripts and old-writer proofs; external authoring remains dormant.
2. Implement unified relationship stores, same-organization admission,
   incident lifecycle/undo, capture and combined graph validation.
3. Implement combined Fast scheduling and projection, including interleaving,
   per-project anchors/capacities and the explicit undated refusal.
4. Extend solver boundary constraints, stage hashes and coherent publication;
   prove Fast/optimized parity, stale-result refusal and mixed-engine reads.
5. Integrate readiness, event fan-out, retained reads, historical capture,
   exports/imports, copies, HTTP/MCP and the frontend picker/settings.
6. Advertise an immutable cross-project-dependency runtime capability distinct
   from additive schema support. Activate authoring only after the deployment
   owner proves incompatible readers, writers, workers, gateways, MCP processes
   and retained clients cannot serve or resume against the store. Keep activation
   authority durable even when no live external relationship remains; never
   infer downgrade safety from row count. Retain current writes and exposure
   evidence after possible activation, and use attended compatible recovery
   rather than automatic migration reversal or an unproven removal command.
7. Record targeted tests and every watched production-path negative in
   `verify.md`, validate all OpenSpec changes, and run the isolated h2puni gate
   on the actual candidate SHA plus required CI migration/secrets checks.

Each slice carries its own focused positive/negative verification; no partial
release exposes reference-only dependencies. The backfill, namespace guards,
graph/cycle guards, capture authorization, solver boundaries, cache identity,
undo concurrency and activation/downgrade guards each need an observed R5 fault
proof. This document records design, not evidence that those checks have run.

## Open Questions

No unanswered question blocks artifact preparation. The approved decisions are
the abbreviation syntax/length and dot delimiter, alphabetic external lookup,
same-organization real dependencies, dependency-first priority and valid
cross-project interleaving. Automatic backfill, deletion refusal, explicit
undated scheduling unavailability and bounded per-project optimization are
stated implementation defaults, not additional user quotations. Any later
change to those defaults must preserve the approved behavior and update the
corresponding specs before implementation.

### Bounded read-only runtime observations

The first transport slice shares the frozen backend advertisement in the DB-free
`runtime/dependency-support.ts` module between startup admission and
`dependency-capabilities-cli.ts`. The advertised semantics remain empty.
`dependency-activation-cli.ts inspect` uses the existing read-only connection and
strict `inspectDependencyActivation`; it does not reinterpret missing older
schema as dormant authority. SQLite may create WAL coordination sidecars while
opening a read-only database; inspection grants no database write authority.
These observations do not prove participant exclusion and do not activate
production authoring. The bounded Compose prerequisite now consumes binary observations only; stopped-store admission and activation remain later slices.

### Bounded Compose binary capability prerequisite

Intent: refuse a backend transition before durable stop intent when either the
candidate or retained rollback image cannot execute the exact dependency capability
protocol. Bind each observation to its independently invoked digest and preserve
existing attended recovery after stop intent. This slice grants no store,
participant-fencing, activation or semantic downgrade admission.

Infrastructure owns a narrow closed backend wire decoder because infra imports
cannot cross the WBS product boundary. Candidate and nonnull rollback run their
image-local argument-free CLI without mounts, DB_PATH, network or application
startup, under one finite Docker deadline. Explicit empty support is accepted as
an observation; absent, failed, timed-out or malformed CLI refuses. The ordinary
pre-stop path and the shared standalone recovery admission both invoke the pair.
First installation invokes only the candidate.

Task 10.2 remains unchecked. The coordinator-owned strict DISABLED/no-edge scanner,
ledger/schema/trigger validation, stopped pre-maintenance and fresh stopped
post-maintenance/pre-exposure observations, historical compatibility limits,
complete participant fencing and all Kubernetes work remain unimplemented in this
slice. Binary observations alone cannot establish that an ENABLED store is safe.

## Compose dormant preservation boundary

The coordinator owns the dependency scanner and closed observation decoder. Its
self-contained function is embedded into a `bun:sqlite` command, independent of
image application imports, and exported narrowly through `@tools/deploy-contract`
for future transport reuse. Ledger hash shape does not assert migration artifact
identity; applied-set capture remains responsible for byte/hash comparisons.

Shared recovery admission scans only after fresh stopped-writer proof. Following
maintenance, a separate narrow admission repeats canonical family resolution,
retained image readback, exact outgoing/replacement-maintenance inventory and all
stopped checks before a new scanner subprocess. It deliberately avoids invoking
the whole first-install recovery helper against its now-existing maintenance
container. Existing durable-stop catch behavior retains current bytes and evidence.
Historical stores without authority refuse; this packet has no bootstrap adapter,
semantic participant proof, activation mutation or Kubernetes admission.

### Continuous participant exclusion before activation

Binary observations and stopped-store snapshots are inputs to deployment
admission, not the exclusion itself. The deployment owner must record a closed
roster of actual backend readers/writers, background workers, gateway/MCP
processes, retained sockets/streams and every restart or reconcile owner. After
persisting stop intent, it must close ingress, fence those restart owners, drain
or terminate each incompatible participant, and read back exact identities and
effective fences. The exclusion interval begins only after the final drain is
acknowledged. It remains continuously enforced through fresh store/participant
inspection, migration, activation intent, atomic authority flip/readback,
compatible process startup, route exposure and ownership handoff. A repeated
inventory can detect drift but cannot substitute for a fence; uncertainty or a
lost controller Lease parks the release for attended compatible recovery.

First installation stays `DISABLED`. The activation receipt requires a real,
digest-pinned retained image; the deployment owner must first establish a
compatible dormant installation and independently observe that retained image
before a later activation. It must neither copy the candidate observation into
retained attribution nor infer retained compatibility from an equal digest.
Candidate and retained role executables run independently even when their image
digests match. Missing executable evidence is a refusal, not a valid empty
semantic declaration. Before activation, an independently admitted dormant
rollback may reverse the exact captured migration set; after activation intent,
possible dispatch or exposure, automatic schema reversal, old-tier restart and
controller restoration are forbidden pending attended compatible recovery.

The current Compose check covers known writers only; Kubernetes B2b is a
prepared GET/checkpoint primitive, and B3a records claims without enforcing
exclusion. Neither path has a production-consumed complete participant policy.
The runtime's fresh HTTP/upgrade guards do not close already-open sockets or
stop old binaries. No activation caller should use this design text as an
admission result until the deployment effects and their production-path R5
negatives exist.

### Private connected derivation and capture slice (2026-10-22)

The actual component derivation feeds its encoded common-axis resolved input and
one combined Fast placement to the bounded rank/ID selector before restoring
public capacity identities or projecting project offsets. The detached projection
retains the Fast baseline, each immutable pre-selection stage, its objective states
and publication decisions, and the final coherent composite. The internal tree
projection carries its target selection alongside dates from that composite.

`createLivePlanStore` accepts a private connected reader configuration for owned
and borrowed fixtures. `services.ts` and source installation still omit it.
`optimizationCapture` and `optimizationCaptureWithin` expose the detached
local/connected input union and captured enablement without admitting solver work;
missing calendars and empty target stages are modeled outcomes. Legacy
`optimizationInput` methods temporarily remain for the existing local coordinator.
Slice 2 replaces those callers with the capture union and removes the temporary
dual API. Connected inputs are never reconstructed from final dates or passed
through the legacy local coordinator. This slice does not complete tasks 7.3/7.4.

As of 2026-10-23, the bounded production-composition packet supersedes the
installation and coordinator statements above: `buildServices` now installs
connected reader configuration through owned and borrowed sources, and the
coordinator consumes detached `optimizationCapture` inputs. Source-owned
transactional optimizer owners remain installed. This does not activate
external relationship authoring or admit connected solver work from tree reads.

### Kubernetes dependency observation transport (task 10.2, B1)

`dependency-capability.ts` owns the shared pure command and closed capability wire decoder; Compose retains its independent invocation/deadline policy. Kubernetes `dependency-observation.ts` owns fresh observation names, DB-free capability manifests, coordinator-generated scratch store manifests and Job/Pod attribution. `kubectlEffects` exposes these through an observation interface and preserves rendered manifests. The bounded release binary prerequisite below consumes binary observations without treating them as semantic permission; store observation remains separate.

The effective Pod spec is compared as a closed security boundary, allowing only a `serviceAccount` alias equal to the pinned `serviceAccountName` and a nonempty scheduler-assigned `nodeName` beyond the pinned manifest. Kubernetes generated controller/job labels and selector must agree with the created Job UID. Store observations require `recursiveReadOnly: Enabled` in runtime container mount status as well as the requested mount; unsupported runtimes refuse. Actual cluster API defaulting and mount enforcement remain to be rehearsed during the B2/B3 integration. Local API fixtures establish refusal behavior and emitted-command tests establish scanner source invariance, not live runtime admission.

B2 must independently establish and retain the stopped-storage/PVC-identity interval. B3 must integrate durable admissions, exposure intent and conservative recovery classification together. B1 transport alone does not change migration, rollout, rollback, journal, activation or participant-fencing behavior; tasks 10.1 and 10.2 remain open.

### Kubernetes storage readback prerequisite (task 10.2, B2a)

`storage-fence.ts` supplies read-only inspection through `kubectlEffects`, separately from the release transaction and scanner transport. It pins actual PVC/PV binding identities and the canonical database path; reads policy, backend and optional Flux state; lists all namespace Pods and standard workload templates without labels; and binds source-controller UIDs and template hashes across calls. Only the stopped backend and its stopped owned ReplicaSets, suspended known backup CronJob and terminal Jobs are accepted as source controllers. Unknown source controllers and live source readers refuse conservatively. Separate scratch-only verification templates do not reference `wbs-data` and are classified by their actual volumes.

This is a narrower prerequisite than B2. It does not suspend or drain controllers, durably record prior suspension ownership, restore controllers, persist a journal barrier or enforce a continuous interval. It adds no scanner calls or release state-machine changes. Those controls must ship before the readback can participate in B3 admission; preserving existing rollback behavior here does not authorize semantic rollback. Custom controller admission, privileged operator changes and complete semantic participant fencing remain outside this bounded standard-resource readback.

### Kubernetes ownership preparation primitive (task 10.2, bounded B2b)

The prepared-only codec binds canonical payload bytes and SHA-256 to the transaction, cluster UID, namespace, PVC/PV identity, explicit Flux topology and pinned Flux UID, backup UID/resourceVersion, complete CronJob spec hash excluding suspension, original absent/false/true suspension and fresh token. It accepts only `prepared`; no later stage can be fabricated through this codec. SHA-256 detects inconsistent evidence and provides no authenticity claim.

`inspectStorageIdentity` reuses B2a's strict binding parser without requiring stopped backend. `inspectStorageOwner` reads cluster, storage, suspended configured Flux and the required backup twice through a caller-supplied bounded GET transport. Stable observations may advance resourceVersion but refuse changed UIDs, templates or suspension. Existing ownership annotations refuse; an attributable post-patch acknowledgment is outside this primitive. A validated local request explicitly selects null Flux.

`prepareStorageOwnership` checks current Lease before observation and immediately before its mandatory checkpoint. The checkpoint resolves only when the enclosing authoritative record is durable; the coordinator waits before returning. Tests use fsync, rename and directory fsync. No second production journal is added and the schema-3 release journal is unchanged. `validateStorageOwnership` checks loaded history before any GET, reasserts Lease, and compares fresh original state without replacing the snapshot or token.

Intent: preserve exact original controller history before a later conditional mutation. Outcome: reusable read-only preparation and conservative restart validation. Non-goals: controller patching, suspension/drain/restoration, task admission, scanners, release wiring or recovery changes. Constraint: full B2/B3 release integration must land atomically because existing generic failure routing can attempt schema reversal or old-writer restart. This primitive cannot establish an exclusive or continuously stopped storage interval.

### Bounded synthetic mounted command acceptance (2026-10-22)

`OrganizationHarness.openComposedWith({ syntheticExternalCommands: true })`
replaces only the app's admitted `writes.batch` work-item service with an active
instance. It retains the actual batch stores, runtime clock/scheduler in capture
mode, admission, dependency context and announcement collector. The ordinary app
constructs its own `PlanCommandRunner`; source live-plan readers, SQLite history,
connected graph, fanout capture and tree projection remain real. Public services,
operator activation, production compose and the normal dormant 409 control remain
unchanged.

This bounded packet covers two isolated Fast projects with a restricted readable
predecessor, FS placement, committed delivery, relationship identity/revisions,
local/external update and remove history, rollback, stale replay and foreign
organization concealment. It does not establish the full 3.2/4.2 command matrix,
MCP active parity, shared capacity, all endpoint scopes/types, optimizer or rollout
acceptance. Those parent tasks remain unchecked.

### Bounded connected Retry HTTP authority bridge (2026-10-22)

The human-scoped `optimizationInputWithin` now returns the existing detached
connected capture union alongside its legacy local/shared ScheduleInput shape.
Its connected path delegates to `captureConnectedOptimization`, preserving the
pre-selection stage; the route handles idle and missing-calendar observations
before asking the coordinator. Missing-calendar HTTP refusal carries the target
ID and the complete captured missing-project identity list. Existing shared
unavailable project identity remains unchanged.

The ordinary mounted HTTP adapter feeds that union into the existing connected
coordinator and source-owned Retry writer. Current input hash comparison precedes
retained terminal preflight; terminal preflight precedes generation lookup. A
closed authorized read grants no writer authority: the writer rechecks membership
before terminal lookup or reservation. The test fixture explicitly installs a
private connected read store and controlled launcher around real SQLite and real
service/route/coordinator/writer code. `buildServices`, public source binding,
background production capture and dependency activation remain dormant.

This is the first coherent B4 backend slice. It establishes terminal/stale/failed
sibling/refusal and read-to-writer authority behavior; it does not complete the
three-project captured C=8 versus final C=6 mounted Retry proof, browser HTTP
reconciliation, complete optimizer acceptance or tasks 7.3/7.4/9.2. Settings PATCH
keeps its existing semantics; terminal-setting refusal is not introduced.

### Plan-wide migration rollback admission (bounded task 10.2 prerequisite)

Intent: refuse a migration selection that would remove cross-project dependency
activation authority before any selected down statement changes the database.
Outcome: the common `rollbackAppliedRows` seam first resolves every selected row,
folder and forward hash, then admits the complete name set through the adapter's
`assertDependencyRollbackAdmitted` on the same native SQLite connection. Selecting
the activation migration requires the existing strict authority inspector to prove
DISABLED authority and an empty `external_dependency` table. Missing, unreadable,
malformed or replaced authority/ledger/triggers refuses. ENABLED authority and
retained edges require compatible recovery under ADR 0057.

Unrelated selections and no-ops do not inspect activation. Legacy `--to` and
captured-set restoration converge through this admission; existing independent SQL
down guards remain. Each admitted migration retains its own transaction, ledger
deletion and foreign-key-off rebuild behavior, including committed earlier
reversals and exact-set retry after a later script failure. No blanket transaction
is added. Non-goals: participant fencing, activation, automatic recovery after
semantic exposure, Compose/Kubernetes release integration or completion of parent
tasks 10.1/10.2.

### Bounded backend startup migration admission (2026-10-23)

Intent: prevent an incompatible backend from changing source schema or ledger before
its semantic authority refusal. `assertDependencyMigrationRuntime` runs before the
existing migration runner; the existing strict runtime check remains after migrations
and before services, backfill, local identity, workers and listening.

`inspectDependencyBootstrap` distinguishes an empty schema, present/recorded authority,
and a historical source. Present or recorded authority reaches the strict existing
inspector; its failures are never caught as historical bootstrap. Historical admission
requires an exact finite prefix of the supplied migration files, entirely preceding
activation, with exact names and SHA256 hashes. It reproduces that prefix using the
ordinary runner in disposable scratch storage and compares every sqlite_master object.
Both scratch connections and directories are released on failure. This costs one
historical schema replay (about 220 ms in the focused local historical positive test)
only for historical startup, rather than current startup. Operator-added schema or
schema differences dependent on historical content require attended upgrade; they
are not silently treated as certified history.

Non-goals: activating authoring, changing service composition or connected solver
admission, providing participant fencing, or authorizing deployment recovery.

### Kubernetes journal-owned backup lifecycle prerequisite (bounded task 10.2)

Intent: prevent the known source backup controller from overlapping source replay,
capture or migration work, while preserving exact controller history and conservative
restart behavior. Outcome: the production release coordinator owns two bounded
storage intervals in the existing fsync/rename file journal. Non-goals: dependency
authoring activation, semantic rollback admission, B3 exposure, custom-controller
admission or complete participant fencing. Prepared ownership remains its independent
version-1, prepared-only contract.

Journal schema 4 retains separate `controllers.forward` and `controllers.rollback`
histories. Forward source work runs after the backend stops and before its rollout:
prepare, durable suspend intent, conditional suspension, exact acknowledgment,
bounded descendant drain, repeated unfiltered storage readback, replay/capture/migrate,
and conditional restoration with durable acknowledgment. The adapter tests the actual
CronJob UID, resourceVersion, complete spec and annotation state atomically. The
immutable prepared template hash remains mandatory while an interval is active.
Restoration distinguishes absent, false and true suspension and progresses through
restore intent, restored field, token cleanup intent and completed acknowledgment.
A restart reconciles only the exact recorded UID/template/token and expected current
state; foreign or ambiguous state retains the barrier.

Existing backend rollout legitimately changes the backup image. Therefore the
forward interval is restored before `rollout-backend`; its completed template is not
revalidated after that rollout. An abort while the forward interval remains active
reuses it. An abort after completed forward restoration prepares a new rollback
interval, retaining both histories and a new token, before schema reversal or rollback
replay. That interval is restored after rollback replay and before `rollback-tiers`.
No writer rollout runs before the relevant restoration acknowledgment is durable.

Drain follows actual CronJob→Job→Pod controller UID references. API deletes include
UID preconditions and orphan propagation with normal graceful Pod termination; Pods disappear before their Jobs are
deleted. Repeated inventories use no writer labels and require two empty descendant
observations, then the existing standard-resource storage inspector twice. Unrelated
live or deleting source consumers, including readers, refuse without receiving deletion.
Strictly terminal Job/Pod history is accepted through the shared B2a classifier
without granting ownership or deletion authority; active/terminating workers and
missing or false completion conditions remain refusals. Every source
task repeats this bounded proof and finally revalidates the exact recorded backup
UID/template/token/suspension after fence reads, before replay or other source work. Controller uncertainty parks `rollback-failed`
before generic schema reversal or writer restart; Lease loss and journal-write
failure propagate as interruptions.

Before controller intent, the release Lease acquires a sticky
`puni.dev/journal-required=true` marker under UID/resourceVersion/session CAS and
readback. A marked Lease never authorizes a fresh start without its journal. The
adapter pins the Lease UID per session, preserves the marker across renewal,
takeover and parking, and refuses UID replacement or a cleared marker. Marked Lease
cleanup requires an eligible completed journal and restored controller histories,
then deletes with UID/resourceVersion preconditions. A lost marker patch response
is reconciled only through the same UID/session with the marker present. The marker
is a conservative journal-retention latch, not a transactional fence against
privileged API actors. Full storage-interval and semantic participant exclusion
remain B2/B3 integration work.

### Kubernetes release binary prerequisite (bounded task 10.2)

Intent: detect an absent or unusable image-owned dependency capability executable
before disrupting serving, including on a resumed transaction. This is the bounded
consumption of B1 transport; it does not activate semantic admission. No store
scan, participant exclusion, activation, exposure or recovery classification is
added, and parent 10.1/10.2 remain open.

`ReleaseEffects` includes only the existing binary observation port from the
separate dependency observation interface. `executeRelease` refreshes F6 admission
and invokes both exact backend images once per coordinator execution, after
admission and before its first protected effect. A fresh transaction uses the
existing admission step; a resumed transaction writes/readbacks admission again.
The per-process Lease holder identifies the invocation, while the adapter creates
independent nonce-named candidate/previous Jobs even for equal image digests.
Existing Job/Pod UID, image, command and completion validation remains the boundary.
Explicit empty semantics is accepted as observation only.

The barrier runs outside generic step-failure handling. Failure propagates with
no schema rollback, tier work, source-controller work, Lease cleanup or serving
interruption. Interrupted-state journal normalization waits until this barrier
passes, retaining exact durable bytes on refusal. Lease claim/takeover, heartbeat
and renewal still enforce coordinator ownership; successful observations are
followed by a Lease renewal and sticky heartbeat-loss refusal before journal normalization or protected effects. A later successful renewal never clears prior heartbeat loss. Evidence is per execution,
not a persisted authorization receipt. A subsequent invocation probes both images
again before forward completion or rollback work. Evidence/Job artifacts remain
available for inspection without automatic cleanup.

### Bounded task 10.1 HTTP client admission (2026-10-23)

Intent: refuse a retained resource client after durable dependency activation,
including an enabled store with zero current edges. Production app composition
requires an admission callable and refuses a missing callable at runtime. After
existing origin and identity policies, all routes except the explicit process/authentication/immutable-catalogue exemptions, including organization control, onboarding and internal replay/forward routes
inspect authority afresh through the same SQLite connection in one read transaction.
The exact HTTP claim is `X-WBS-Dependency-Semantics: cross-project-dependencies-v1`;
the reserved WebSocket protocol is `wbs.cross-project-dependencies.v1`. Enabled
authority requires both the exact claim and immutable runtime support; refusal is
409 `{error: "client_dependency_incompatible", required: "cross-project-dependencies-v1"}`.
Valid disabled authority preserves legacy admission. Missing, malformed or unreadable
trusted authority is an infrastructure failure. Health, authentication and immutable
binary observations remain exempt because they carry no project resource state.
The shared operation document adds the 409 alternative. Header parameter publication is deferred because the current MCP tool parser accepts only path/query inputs.
Standalone generic adapter fixtures may omit the callable; production buildApp cannot.

This packet does not advertise semantic support, activate authoring, alter the
activation writer, or send client claims. WebSocket admission and endpoint-specific
shared client refusal decoding remain later slices. Parent task 10.1 remains open.

SCIM is a separately mounted foreign protocol, not a shared-shape or MCP
operation, and therefore requires independent resource admission. Its required
request-level callback runs after provisioning-token authentication and existing
rate admission, before route dispatch or body reading. Production composition
passes the same dependency admission callable used by typed resource routes.
A modeled incompatibility retains SCIM media/error fields and HTTP409, with
`detail: "client_dependency_incompatible"` and `required` naming the exact semantics.
Trusted authority failures retain the existing SCIM infrastructure500 boundary.
The protected/exempt shared-shape matrix does not enumerate this foreign route;
its mounted SQLite matrix independently covers list/read/create/patch/delete.

`GET /api/openapi.json` is the other separately mounted route: an immutable
schema observation, explicitly exempt from dependency-client admission. Its
mounted request remains available even when the app's authority callback throws;
this exemption exposes no persisted application resources.

### Bounded task 10.1 awaitable gateway delivery prerequisite (2026-10-23)

Intent: make application delivery awaitable before a later retained-session fence
introduces asynchronous authority work. The synchronous wrapper previously discarded
physical send outcomes, push counted recipients before completion, and replay or
presence could detach an asynchronous writer. This packet supplies ordering,
bounded waiting and accurate accepted-frame accounting. Authority inspection,
activation, semantic claims, participant exclusion and authoring remain outside it.

`DeliverySocket.send` returns `Promise<DeliveryOutcome>`. One `SocketDelivery` per
connection is shared by unsolicited push, presence, replay and control replies.
Production binds its required writer port to the existing synchronous
`socketWriter`; there is no optional application preparation hook. Deferred writers
belong to service/controller integration tests. Physical Bun `send > 0` maps to
`sent`, `-1` to accepted `backpressured`, and `0` or a synchronous throw to a drop
that retires the connection. Acceptance is not a browser receipt, and native Bun
buffering is not retried by this queue.

The application FIFO admits at most 64 pending frames and gives each five seconds
including queue time. Each enqueue captures an absolute monotonic expiry; after
waiting for its predecessor, the delivery rechecks both cancellation and that
expiry synchronously immediately before invoking its writer. A delayed timer
callback cannot authorize an expired physical write. Overflow, expiry, writer rejection or physical drop aborts
the queue, immediately removes subscriptions and closes the socket with 1013.
Retirement reports its reason and original asynchronous failure to the gateway logger. Lifetime
cancellation settles pending callers as `retired` and prevents queued writes.
A signal-ignoring injected writer can outlive settlement; cancellation cannot undo
its own side effects. Production's terminal physical writer is synchronous.

Push awaits every recipient and counts only `sent`/`backpressured` in its response
and fanout metric. Replay awaits each event before later events and `resume_ack`,
and stops at retirement. Presence returns awaited outcomes; an unexpected rejected
recipient is surfaced while other recipients have already been dispatched. Lease
revocation awaits its presence/control deliveries. This is transport preparation,
not an existing-socket semantic fence; task 10.1 remains open and binary semantic
advertisement remains empty.

### Bounded task 10.1 browser compatibility decoding prerequisite (2026-10-23)

Intent: preserve exact resource admission incompatibility at the browser boundary
and show a useful plan read failure. This prerequisite does not claim client V1
support: the production project stream still has a legacy handshake, and the
current incapable gateway refuses every offered protocol. Claim sending,
negotiation, activation and authoring remain outside this packet.

The shared client validates the existing admission schema only for protected 409
responses, with a closed two-key envelope, and preserves `required` in a typed
`dependency_incompatible` boundary failure. It is a runtime/client compatibility
condition shared by resource operations, rather than an operation-specific business
refusal. Existing operation-specific 409 alternatives continue through their own
schemas. Cancellation retains precedence after validation. The plan read presenter
uses the typed condition for visible compatible-client guidance.

### Bounded task 10.1 retained gateway egress admission (2026-10-23)

Intent: prevent an existing incapable socket from receiving newly produced frames
once a fresh authority observation refuses it. Retained push, replay, presence and
control replies already share one FIFO. This packet puts fresh semantic admission
at each FIFO head while preserving synchronous physical acceptance, the 64-frame
bound and the absolute five-second enqueue budget. Activation, authoring, ingress
fencing, participant exclusion and semantic advertisement remain outside it.

The required asynchronous admission port reuses the secret-authenticated backend
`/internal/gateway/dependency-admission` endpoint and its closed 204/typed409 decoder.
It receives the delivery signal; connection cancellation and the existing enqueue
budget bound both transport and body consumption. No authority observation is cached
between frames. The immutable gateway capability remains empty and the retained
socket has no negotiated dependency protocol. Every routed backend must expose this
endpoint: an older backend's 404 is authority unavailable, never compatibility.

At each FIFO head the queue awaits its predecessor, checks cancellation and absolute
expiry, awaits admission, then checks cancellation and expiry again. An admitted
frame invokes the required synchronous physical writer immediately, without another
await. Typed incompatibility retires with its own reason; malformed/404/transport
errors retire with their original failure and deadline errors retain deadline status.
Retirement synchronously aborts connection work and removes subscriptions and presence
before physical close. Physical close broadcasts the already removed projects without
waiting for `joined` or the retiring FIFO. Late identity verification and held
subscription continuations check cancellation before restoring membership.

This is a fresh-observation fence, not a linearizable authority/write fence. A backend
can read DISABLED and delay its 204 while authority becomes ENABLED; the gateway can
then write after that response. The unresolved post-read/pre-send race belongs to the
deployment owner's participant exclusion/activation protocol. No claim here proves
safe activation, excludes old processes, recalls bytes already accepted by Bun or
changes backend/gateway/MCP semantic support.

### Bounded managed Compose gateway physical exclusion prerequisite (2026-10-23)

Intent: close the physical managed gateway overlap window before any future
semantic activation. The outcome is a retained, lock-owned proof for exactly the
blue/green names in the selected Compose environment. Non-goals are activation,
ordinary-deploy integration or bypass, evidence clearance, gateway recreation,
backend/MCP/browser/background exclusion and claims about unmanaged gateways.
The approved prerequisite requires an attended operation and all existing
container prerequisites; neither a marker nor historical completion proves
current exclusion. Requested git SHA records provenance only.

The executor owns `deploy.lock` and dispatches dedicated fence/inspection modes
before ordinary image/registry/planning work. It inventories all full container
IDs, validates expected names and complete Docker process/image/security/network/
Compose identity, then exclusively fsyncs/readbacks the unchanged v1 two-field
marker and separately versioned intent. Intent binds attempt, layout, SHA, exact
membership/absence, original restart policies and process identity. Reobservation
precedes exact-ID restart-policy updates, followed by exact-ID bounded stops;
every effect has a complete cohort readback under one shared Docker deadline.
A fresh stopped/PID0/no-restart cohort is bound into an exclusive completion by
attempt and SHA256 of the exact intent bytes. A final complete fresh observation
is required before return; read-only inspection repeats it and trusts no historical
receipt alone. Both absent proves an empty managed cohort only.

Publication or later failure retains current Docker state and all published
evidence, with no automatic restart, cleanup, policy restoration or retry.
Marker-only is interrupted, intent without completion uncertain, and orphan or
changed evidence corrupt. Ordinary admission refuses every retained record,
including orphan companions. The deploy lock cannot fence external Docker
administrators/controllers, so the bounded proof assumes their cooperation;
continuous participant exclusion and activation remain parent 10.1/10.2 work.
Operational procedure and limits live in the managed Compose gateway exclusion
section of `docs/runbook-prod-deploy.md`.

### Bounded managed Compose backend exclusion prerequisite (2026-10-23)

Intent: retain the backend half of the physical managed-cohort exclusion interval
before a future activation owner can establish continuous participant exclusion.
Outcome: a dedicated attended backend fence and read-only inspection under the
same deploy lock as gateway exclusion and ordinary deployment. Non-goals:
migration, semantic activation, restart, evidence clearance, ordinary swap bypass,
MCP/ingress/browser/background/host-process exclusion or external supervisor control.
An empty backend cohort refuses because it cannot identify a database family.

The operation requires freshly verified gateway exclusion and binds the exact
marker/intent/completion byte hashes into its closed backend intent and completion.
The public gateway inspector continues to own its lock; its narrow under-lock
variant shares the backend owner's deadline without nested flock. Shared managed
inventory primitives preserve the gateway contract. Every backend observation
uses a complete unfiltered full-ID Docker inventory, validates both cohorts from
that same inventory, resolves installed image IDs, and compares current gateway
evidence. Both backend colours bind exact IDs, image references/IDs, process/start
and restart identity, fixed security/network/Compose prerequisites, and explicit
absences. Exactly one DB_PATH per member must resolve through an ordinary writable
directory bind to the same canonical main/WAL/SHM/journal family. The directory
and main-file dev/inode identities are retained; sidecar presence may change as
SQLite writers stop. Unmanaged writable mounts overlapping that directory refuse,
including stopped foreign containers. This conservative mount check does not scan
host processes or alternative namespaces controlled by external administrators.

Exclusive fsynced/readback marker and intent publication precede effects. Disable
restart for every exact backend ID with independent complete readbacks before any
stop; stop each exact ID under the shared deadline and freshly verify identities,
PID zero and no restart. Completion binds the exact intent bytes and gateway
hashes. A final joint inventory after publication is mandatory; inspection repeats
it. Failure retains all evidence and current Docker state without recovery effects.
Ordinary execution also refuses backend marker and orphan companions. This receipt
is bounded historical evidence, never an activation authority or an exclusive-store
claim. Operator procedure: `docs/runbook-prod-deploy.md#managed-compose-backend-exclusion`.

The unmanaged-mount adapter additionally reuses the existing
`verifyContainerNamespace()` initialized metadata protocol. Canonical host path
and inode overlap are early refusal evidence only. Host Source EACCES/ENOENT
supplies no exclusion evidence; every unmanaged persistent mount, including
Docker-read-only mounts, requires its exact inspected ID, all declared destinations,
the canonical SQLite family and a pinned backend image to pass actual namespace
admission under the shared fence deadline. Unsupported privilege/capabilities/PID
or init state, missing tools, unreadable or incomplete/malformed census, timeout
and unproved scanner cleanup refuse. After namespace audits, a second complete
joint inventory must match membership, mount/config/security/network identities
and process/PID/start/restart identity before intent can be published. Source
rebinds, hardlinks and nested writable aliases are covered by the existing census
contract; it retains its documented trusted-quiescence/static-namespace limits.
No BuildKit/controller exemption or automatic stop is authorized.

Before publication every running managed backend additionally proves its actual
mounted main file and parent directory against the captured canonical family with
the shared managed-mode namespace census. Host source resolution alone is not
evidence: a running bind can retain an old directory after Source replacement.
Captured host main/directory identities are checked before and after each census;
parent directory identity and a complete directory receipt are required even if
all current files are hardlinks. Host directory readback closes the census race.
This continues to prove only the managed backend/gateway DB cohort.

## MCP startup document preparation

The Task 3.2/11 delivery correction keeps the generated HTTP/MCP command
contract while moving its expensive schema construction out of server startup.
The k3s MCP rollout repeatedly reported `OOMKilled` / exit 137 at 512 MiB;
importing the HTTP descriptor registry eagerly compiles validators even when
MCP only needs the resulting OpenAPI document. Increasing the limit or making
Ajv lazy leaves that unnecessary runtime dependency in place.

The existing backend `emit-openapi-cli.ts` emits the document from the same
checkout during MCP image preparation and build. Source serve/tests require
an uncached `prepare` target; the source artifact is ignored by Git. Bundles
receive a sibling `openapi.json`; both source-running Dockerfiles generate in
a separate stage and copy the artifact beside `src/main.ts`. Startup reads
that required sibling and retains `toolsFromDocument` admission/exclusions.
Missing, unreadable and malformed artifacts refuse startup. There is no
runtime generator fallback or committed snapshot. Credential rules, trusted
issuer URL checks and logging use leaf imports so startup reaches neither
the contracts nor core runtime barrel. Dev source deployment fingerprints every
generator input source tree (the whole contracts tree, the emitter, WBS/shared validation) and the three library alias
configs; a change restarts the container so Nx reruns preparation. Runtime
watchers alone cannot regenerate the document.

This correction proves bounded startup and generated parity, not dependency
activation, a final image build, cluster acceptance or Task 11 completion.

### Bounded shared edge owner admission prerequisite (2026-10-23)

The source swap CLI, durable dev poller, target candidate loader, manual dev
launcher and standalone bootstrap/configure writers serialize on the canonical
host-wide `edge.lock`. Lock order is edge, optional poll, optional devsync, then
selected deploy. Existing backend/gateway fences and selected deploy locks remain.
Inherited lock reuse verifies descriptor syntax, canonical device/inode and real
nonblocking flock; a separately opened description competes normally.

Every present `edge-owner.json` or orphan `edge-owner.pending` closes ordinary
effects, irrespective of content or readability. Legacy absence is admitted and
establishes no owner fence. Direct swap/devsync executors repeat the marker guard.
This packet has no owner publication, activation, route mutation or installation.
The already installed poller may reset before candidate extraction; source-only
admission cannot prove that it or other installed launchers adopted this protocol.
Participant inspection remains blocked pending installed writer identity/drain,
installed-byte audit, retained publication and continuous participant exclusion.
Operational details live in the prod runbook's shared edge admission section.

The admission prerequisite's review correction retains the actual kernel open
description through devsync's unlocked parent, real `flock`, and locked Bun child
by explicitly mapping it to child descriptor 3. Passing the environment token
through Bun shell alone loses the descriptor at the second spawn on pinned Bun
1.4.2. The child still verifies inode identity and calls real flock. The manual
SSH launcher now checks both retained paths under the outer lock before fetch.

Provisioning uploads base Compose bytes to a unique, non-live staging path.
`configure.sh` moves that candidate to a sibling of live `base.yml`, then renames
it into place while retaining shared-edge admission. The sibling step keeps the
final move within one filesystem even if `/tmp` is mounted separately. A retained
marker or competing writer leaves both live configuration and staged bytes intact.

### Bounded installed executor replacement admission (2026-10-23)

The swap/smoke installer captures local SHA-256 identities, uploads uniquely named
sibling staging files, and runs one remote critical section against the existing
canonical production `state/edge.lock` for both environments. It neither creates
nor inherits a substitute lock. The canonical state root must be a real directory;
regular-file and no-symlink lock predicates execute as separate required commands
to avoid POSIX `set -e` AND-list exemptions. Required state enumeration must succeed, and any
`edge-owner.json` or `edge-owner.pending` path refuses publication regardless of
contents or readability. Both staged hashes pass before chmod or replacement;
both installed hashes pass before the lock is released. The two renames are
individually atomic, never a transaction. A failed rename, readback or disconnected
SSH session reports partial or uncertain publication; operators inspect both
installed identities under the same lock before retrying. Failed uploads can
leave invocation-owned staging, and no automatic rollback is promised.

This closes only installer source admission. It does not install host bytes,
replace the durable poller, drain older executors, publish owner state, prove
installed adoption, or authorize activation. The durable poller recovery recipe
must likewise refuse retained owner state before replacing its recovery copies.

### Read-only installed-writer file inventory prerequisite

Problem: source admission does not establish the bytes of installed prod/dev
writers or their launch/restart surfaces. Outcome: a versioned offline comparison
of a separately reviewed manifest and explicitly supplied local captures. This
packet cannot adopt writers, activate dependencies, stop processes, publish owner
markers or establish complete host authority. No live collector is included.

`inspect-installed-writers <reviewed-manifest.json> <capture-root>` strictly decodes
v1 source/build commit identities, build identifier and fixed member set. Each
member declares source/build origin, absolute claimed host location, independent
expected digest, reviewed artifact path and installed capture path. Prod/dev
swap and smoke, durable dev poller/helper and interpreter are required. Manual
launcher/bootstrap/configure slots describe declared copies; they do not assert
canonical installed host locations. Two required authority slots describe captured
launch/restart configuration bytes, not effective host configuration. Reviewed
hashes must predate and be independent of installed captures; this tool provides
no discovery-to-expectation generator. Manifest provenance remains external review.

All expected/captured files are ordinary readable files of at most 128 MiB under the supplied
canonical root, without symlink paths or cross-path dev/inode aliases; required observations are read twice. Exact membership uses cardinality, unique names and comparison against fixed role names, never delimiter-joined strings. Each opened descriptor is bound to its path observation by dev/inode/size/time/mode before reading, then checked against the descriptor and path again afterward. The 128 MiB bound admits the observed 79,500,640-byte Bun interpreter while keeping reads bounded.
Missing, unreadable, malformed, aliased, incomplete, mismatching or observed
changing evidence refuses with no inventory output. Interpreter substitution is
an ordinary pinned-byte mismatch. The CLI additionally rereads the manifest and
binds its exact raw-byte digest; the library digest binds normalized manifest fields.

Every report says `activation: blocked` and `scope: local-supplied-capture`.
Equal snapshots establish bounded captured-byte equality only. Unknowns explicitly
include actual interpreter selection, running/prior processes, continuous exclusion,
manual controllers, host capture attribution/freshness and effective cron/systemd/
Docker launch/restart authority. Cron bytes do not prove installed crontab or no
duplicate timer; systemd bytes do not prove loaded/drop-in/transient units/MainPID;
Compose bytes do not prove Docker configuration/restart policy. Solver supervisor
bundle/config/runtime/systemd and its installer admission are an unsupported known
restart surface. Parent 10.1/10.2 remain open.

### Bounded solver local descriptor handoff prerequisite (2026-10-23)

`runSolverBindingCommand` is the production default command runner and exposes
an explicit `edgeLock: 'inherit'` invocation mode. It validates canonical local
state and the actual inherited open description, rejects retained owner paths,
and explicitly maps that description to child FD3. It pins the child lock token
and state environment to those verified by the parent, including when ordinary
invocation environment overrides are supplied. It neither closes nor reopens the
parent descriptor. Child failure remains an ordinary nonzero command outcome.

The existing solver install caller intentionally does not request this mode and
still uses its original remote CLI. Wiring that caller now would leave remote
self-contention unresolved. The next packet must share the local/remote install
operation, capture reviewed hashes before transport, use unique staging, and
hold one canonical admission interval through four replacements, installed
readback, service operations and readiness. No installer admission, owner writer,
activation, rollback or host adoption is implemented by this prerequisite.

### Solver supervisor continuous exclusion and restoration delivery boundary

[ADR 0059](../../../docs/adr/0059-supervisor-exclusion-does-not-require-an-identity-broker.md) separates delivery from the [proposed solver identity broker](../solver-supervisor-identity-broker/proposal.md). The broker's root provisioning, captured-byte bootstrap and per-client TLS identity protocol are future hardening; they are not a prerequisite for completing cross-project-dependencies. They establish no participant exclusion and grant no activation or recovery authority.

Task 10.2 still requires actual coordinator-owned solver stop/drain and admission closure before protected storage work. Inventory and fence the effective supervisor service, Restart=always/user-manager and manual launch paths, every supported installer/replacement caller and the active managed solver attempts. Keep those restart/install/request barriers continuously enforced with the other required backend/gateway/MCP/ingress/replay/background participant barriers through maintenance, activation decision and final pre-exposure recheck. Existing canonical edge admission and retained owner guards are necessary but source lock adoption or a one-time stop cannot prove the whole interval. Missing, unreadable, changed, unrecognized or incomplete authority refuses, retaining evidence for attended recovery; no narrower exclusion promise is introduced.

Restoration names an independently pinned compatible supervisor Bun/bundle/config/unit/solver-image mapping and admitted compatible participants. Under retained admission, verify actual installed/mapping identities, effective restart configuration, readiness and final pre-exposure exclusion readback before reopening requests. A failed or uncertain restoration retains barriers and the manual completion procedure. [ADR 0057](../../../docs/adr/0057-cross-project-dependency-activation-is-monotone.md) remains binding: possible semantic activation or uncertain exposure preserves the current store and requires attended compatible recovery; incapable old writers cannot return merely because live edges are absent. Only the separately proven eligible dormant rollback may reverse exact captured additions and compare the full ledger. The ordered S1–S4 tasks require production-path watched negatives and separate live acceptance; nothing in this docs reconciliation claims implementation or host authority.

### Dedicated dependency owner: first managed exclusion slice

`activate-dependencies.ts` has an explicit `--fence-managed` operation. It owns
canonical edge.lock, dev poll.lock/devsync.lock when selected, then prod/dev
ordered deploy.lock descriptions once. An exclusive synced `edge-owner.pending`
binds a fresh attempt and exact reviewed SHA/layout plan before any Docker work.
Only an in-memory owner bound to those live descriptions and exact retained bytes
can call owner fence cores; serialized plans, hashes, environment tokens and
historical receipts cannot recreate authority. Every Docker call publishes and
reads back a numbered intent before execution and retains its response afterward.
Owner identity and marker bytes are checked on both sides of the boundary.

This slice returns only `managed-excluded`, retaining all markers even on success.
Existing fence intents preserve exact gateway/backend preflight snapshots and
readbacks. An interruption retains pending intent and current physical state;
there is no resume, cleanup, restoration, exposure or activation operation. The
live capability expires on callback exit. Future owners must establish ingress,
MCP, solver, replay/background and restart exclusion, complete installed-writer
adoption/drain and participant roster proofs, then perform atomic activation and
compatible restoration under continuous ownership. Handoff must explicitly bind
that complete proof and independently read it back; this slice cannot mint it.
Ordinary swap admission remains closed throughout and after this operation.

Owner lifecycle review correction: initialized namespace scanner and cleanup
processes use an owner-scoped streaming DockerExec port as well as the ordinary
Docker command port. Durable intent precedes each exec, actual DONE/REAPED token
observations are retained, and marker/description identity is rechecked before
any next session. A lost owner refuses even cleanup session creation and retains
uncertainty for attended recovery. Canonical owner locks use kernel no-follow
opening plus synchronous opened-regular-inode/path validation before any holder
record write; legacy lock callers retain their prior contract.

### Bounded solver runtime admission prerequisite

The actual supervisor executable takes canonical `<edge state>/solver-runtime.lock`
before reading config, sweeping or binding; it never takes edge.lock. Its callback
remains open after listener readiness until process termination, including request
continuations. The kernel releases it on SIGTERM/SIGKILL; no signal handler
releases admission early. Read-only mapping preflight bypasses this lock.
The installer retains edge.lock across restart/readiness without self-contention.
A live dependency owner can take the same runtime lock in a structured callback,
checking its owner and adding the descriptor to all owner boundary checks for
that callback. Protected work must remain inside it. This only excludes adopted
guarded source executables: old unguarded live processes still require census,
stop/drain and restart-authority adoption. S1/S2/O4 and activation remain open.

### Owner-bound persistent WBS ingress exclusion

A new explicit ingress-inclusive operation closes selected WBS sites before the
managed gateway/backend slice. The existing managed-only operation stays intact.
Capture the live shared Caddy's full immutable container ID, fixed non-resume
Caddyfile startup and canonical read-only `/etc/caddy` directory bind. Snapshot
all regular configuration files privately. Adapt that persistent root/import
configuration and require equality with fresh live admin JSON before changing
anything; unknown files, unreadable state, aliases and unexplained drift refuse.

Retain original file identities/bytes and durable owner intent before replacing
only selected `site.caddy`/`site-dev.caddy`. A narrow owner-only publisher writes
exclusive UUID siblings without following links, syncs file/directory, verifies
expected original identity/bytes before rename and reads back exact replacement.
The replacement is an explicit whole-site 503 plus the shared access-log import.
No unselected WBS, registry, AIVN or unrelated config may change. Adapt the new
persistent configuration, require explicit selected-host static 503 routes and
structural equality of every unrelated live route/configuration, then reload
only the captured full container ID. Fresh admin JSON must equal the independently
adapted expected configuration; a zero-exit no-op is not success. Fresh inspection
repeats owner, container, disk and live-config checks. Retained evidence cannot
recreate a live owner. Any interruption preserves current files, pending owner
and uncertainty; no restore, shared Caddy stop/recreate or activation occurs.

Disposable actual-Caddy acceptance uses unique names/directories and fixture
hostnames only. Mock Docker output proves boundary/retention behavior, never
actual serving or restart persistence. Actual serving/reload/restart acceptance
remains separately pending until observed under the canonical host lock.

### Owner-bound solver drain (bounded S1/S2 prerequisite)

The next callable slice stops the independently pinned host-wide supervisor only
under a live owner covering both prod and dev. It observes fixed installed paths,
strict effective systemd execution and the initial process/cgroup identity before
publishing stop intent. Empty original cgroup and stopped unit readback precede
canonical solver runtime lock acquisition. The lock encloses complete managed
Docker cohort discovery, exact-ID stop/terminal evidence, the protected callback
and final installed/unit/cohort readback. Terminal containers and deadline timers
remain intact. Unknown authority, unreadable evidence, drift, owner loss or timeout
refuse while retaining numbered durable evidence. This creates no writable CLI or
activation grant. Old unguarded manual adoption and live authority inventory remain
explicitly unproven; parent S1/S2/O4 and 10.2 stay open.

### Disposable solver drain host acceptance

The acceptance adapter runs the reviewed drain with real kernel locks, user
systemd and Docker, using only an unpredictable invocation's linked unit and
predeclared containers. It preserves native command serialization and container
projections; physical fixture identities must validate before the few fixed
logical path/service fields are translated. Independent expected tuple hashes
precede installed fixture copies. No production service, broad Docker census,
configuration, credential, mount or socket is accessed. Explicit source SHA,
already-installed digest image and external private receipt are mandatory.
Per-command bounds and a separate cleanup budget retain uncertainty instead of
accepting orphaned resources. Actual-host mutation runs remain a separate reviewed
packet; local source fault evidence does not become live fault evidence.

### Owner-bound whole source-dev exclusion

The source dev container runs BE/GW/FE/MCP and background consent work in one private PID namespace. Exact bounded stop plus coherent terminal/PID-zero observation excludes that namespace without requiring init. The running managed namespace scanner keeps its init requirement. A private-symbol/WeakMap token binds the live owner, both exact layouts, SHA, retained intent/completion bytes and exact stopped identity. Only the identical member of the backend audit inventory may be recognized, after independent fresh source observation. Every owner backend observation carries this context. All other mounted containers retain strict ordinary audit admission.

An explicit callable composes ingress for both environments, solver drain, source-dev exclusion, prod gateway/backend fences, fresh inspections, awaited continuation and final inspections in that order. It refuses transitional dev colour members. Final source verification expires authority on all outcomes and retains all evidence. Activation remains blocked.

Solver namespace-audit recognition uses a second opaque live token, scoped to the existing runtime lock. Full native terminal/inert inspection is projected into the unchanged solver lifecycle grammar and bound by durable private snapshot hashes. Source/solver tokens recognize only their exact raw members of the same backend inventory; unknown stopped mounts remain strict. Docker inspection receipts retain hashes so full Config.Env bytes remain in memory only.

Review correction: source audit recognition compares the supplied complete inventory identity with independent fresh complete inventory before granting recognition. Private full-inspection JSON failures expose fixed field-oriented diagnostics without parser excerpts or causes. Composed Caddy inspection receipts and durable edge configuration identity retain hashes; live config remains in memory for exact comparison. Running source containers may retain a historical FinishedAt at or before the current StartedAt, matching Docker restart state. Terminal evidence remains current and ordered.

### Mandatory ordinary edge policy prerequisite (P1)

The canonical edge directory contains one mandatory `edge-policy.json`, with
exactly `{format:"dependency-edge-policy",version:1,phase:"ordinary",edgeState}`.
`edgeState` equals the canonical absolute directory. Additional fields, different
versions and `restoring`/`active` phases refuse; those phases require the complete
P2 verifier before support can be added. This document grants no store scanner,
dormancy, restoration or compatible-controller authority.

An explicit dry-run-default `initialize-edge-policy` command performs first
adoption only. Execute takes canonical `edge.lock`, refuses retained owner
markers, exclusively creates the policy, syncs file and directory, then reads it
independently. Every existing path refuses. Partial publication remains evidence;
there is no reset, repair or implicit installer initialization.

Adopted supervisor unit argv ends with `--config=<fixed> --admission=policy`.
Legacy argv remains usable only as ordinary startup and is not adopted by the
strict unit observer. Policy startup takes the same lifetime
`solver-runtime.lock`, reads the mandatory bounded policy, refuses owner markers,
then reads config, sweeps and binds. The read-only `--check-edge-policy` mode uses
the same reader and marker refusal without taking the lifetime lock or reading
config. The installer invokes the staged Bun and staged bundle in this mode
under existing edge admission after staged hash/runtime validation and before
installed-file replacement. Policy is preserved separately from the four
installed artifacts. First adoption therefore requires explicit initialization,
installation, then a separate installed audit. These source prerequisites do not
complete S4 restoration or authorize live adoption.

### Solver-only compatible restoration under retained ownership (P2a)

`restoreSolverAfterDependencyExclusion()` accepts independent `SolverPins` and
performs no caller maintenance callback, storage activation, migration, participant
startup, ingress reopening or marker retirement. The existing source-inclusive
entrypoint and the new structured entrypoint share the same internal exclusion
sequence and final inspections. Compatibility is observed inside the innermost
live source/solver scope: pinned installed tuple, complete configured image set,
immutable Docker IDs, actual backend capability probes requiring v1 semantics,
then fresh tuple and image readback. The numbered private restoration intent uses
the existing exact owner-publication envelope and contains only pins and image
identities/semantics.

All source and solver finalizers must succeed and their tokens expire before
eligibility can be published. A private in-memory parked-dependency baseline is
monitoring only: fresh complete Docker inventory, exact non-solver configuration,
mount/network/restart/process identity, source image/tag/entrypoint and stopped
state, managed backend/gateway and database-family identities, retained evidence
bytes and closed ingress. It never recreates tokens or supplies namespace/storage
admission. Outer edge/poll/devsync/deploy locks remain held throughout.

The reviewed cleanup correction removes every captured terminal or never-started
inert solver attempt before eligibility publication. Generic orphan sweep waits
for terminal evidence and cannot safely wait on a never-started container. Under
the still-live owner, fresh exact full terminal/inert snapshot and complete parked
inventory checks precede each `docker rm <full-id>` without force or volume flags.
Private durable intent records ID/image/snapshot hash before each effect; fresh
inventory must equal the baseline minus exactly the already removed IDs. Terminal
receipts and deadline timers remain retained. No new or changed solver member is
accepted; after cleanup and startup the expected managed solver cohort is empty.

Only then may the fixed private `edge-policy.json` be atomically replaced through
the retained directory descriptor. The original ordinary bytes and file/parent
identities, live joint owner, exact pending bytes, newly retained intent identity,
intent hash and absence of a committed marker are required. Exclusive private
sibling creation, file/directory sync and exact inode/byte/parent readback precede
success. Partial state is retained without repair.

The closed restoring policy references the numbered intent and hashes the exact
pending publication. The runtime consumes these documents under its canonical
process-lifetime lock, validates the existing exact prod/dev publication grammar,
independent tuple pins and complete immutable image coverage, and rereads
policy/intent/pending identities and bytes before config or startup. Its own
executable and kernel inode, bundled module path and actual arguments must match
the fixed installed entrypoint; caller-supplied execution context is unsupported.
A trusted restoring decode only selects the full under-lock verifier. Every other
retained-owner startup retains the typed exit-78 precheck and restart suppression.
Full restoring-admission failure under an observed retained owner also exits 78,
with a sanitized field-oriented cause. Lock contention and failures after
admission remain ordinary exit 1. Ordinary policy preflight/installers/deployers
continue refusing retained state. `active` is unsupported.

Fixed service start must be followed by strict effective-unit, fresh PID/start
identity and populated cgroup observation, unchanged pinned tuple and image
mapping/resolution, bounded actual socket connection and repeated service/process
readback. Only modeled missing/refusing-listener startup races retry within the
shared cancellation bound. Final fresh parked monitoring and exact retained-policy readback precede the exact
`solver-restored-participants-fenced` / `not-performed` / `closed` return. Any
failure retains pending ownership, policy and barriers; a published restoring
policy permits only that compatible supervisor to restart. P2b, P3, parent S4 and
the full activation/exposure goal remain open. Local source evidence is recorded
in [the P2a receipt](verify-solver-restoration.md); no host adoption is claimed.

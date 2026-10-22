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

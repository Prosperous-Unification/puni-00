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

Creating, editing or removing an external relationship requires successor edit
permission and readable predecessor access. Every command checks the current
organization and role inside its transaction. Foreign and absent endpoints
receive the same not-found response. Restricted projects remain readable under
the existing policy; predecessor edit permission is not required.
An admitted batch remains scoped to one successor project. A client creating
relationships owned by two successor projects submits separate authorized
batches; external endpoint lookup does not broaden batch authority.

### D4. Coherent capture and actual graph validation

Extend the captured-plan port with a detached collection of connected projects,
their own settings/steps/rows/estimates/progress, authored relationships,
capacities, assignments, rank and endpoint labels. One dedicated SQLite snapshot
owns authorization, closure discovery, input capture and optimized-cache
selection. Capture reads never admit solver work or publish events.

For graph validation, follow incident external relationships to closure. For a
connected schedule, also include shared-person connections in both directions
when capacity mode is shared. Every project read starts from the same captured
component, rather than computing different schedules according to the requested
project. Isolated mode follows explicit dependencies but namespaces people per
project. Components without external dependencies keep the existing local or
shared-people path.

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

### D5. Combined Fast scheduling with project-specific inputs

Introduce a resolved scheduling input boundary beside the existing graph seam.
It carries resolved nodes/edges, project membership, rank and scoped capacity
keys. Existing single-project scheduling adapts to it without copying the
levelling algorithm or weakening local validation.

Compute each project's slices with its own estimate method, rounding, step
ordering and widths. Preserve the existing removal of on-hold subtrees before
both engines; do not reinterpret hold, completion or readiness as part of this
change. Keep legacy reach per project rather than assigning one reach to the
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
quantized solver values and materialized real workday boundaries. A quantization
refusal retains the existing visible refusal/floor policy; it never weakens an
external constraint.

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

### D7. Lifecycle, snapshots and downstream readers

Implementation default: refuse deletion of an externally referenced predecessor
or project until its incoming external references are removed. Deleting a
successor removes its own relationships in the existing undoable command.
Do not cascade another project's blocker away silently.

Structural hand-down follows step facts and updates all incident external
endpoints transactionally. Journal touched identities and compensating commands
cover those updates; undo revalidates endpoint ownership, shape and the combined
graph, refusing concurrent changes atomically. No structural edit silently
broadens or narrows an authored endpoint scope.

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
6. Advertise an explicit cross-project-dependency runtime capability. Activate
   authoring only once incompatible readers/writers have drained. Reject
   downgrade while external relationships exist, with an exact backup/removal
   recovery command; never deploy an old reader against active external rows.
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

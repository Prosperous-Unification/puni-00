## Context

Today `step(id, project_id, name, order, code, estimate_unit, allowance_bps)` belongs to
one work package (today's `project`); `estimate(work_item_id, step_id, optimistic,
realistic, pessimistic)` keys on it; a **step node** exists for every leaf and every step
of its package (ADR 0031); work item types are directory-global, do not inherit (ADR 0009)
and have no relation to steps. `wbs-work-packages` E21 (deferred 2026-10-25) would have
lifted the step set to the project. Dany's rule replacing it: "steps by work item type;
first configured on the org level; then can be added on the space level; then on the
project". This change is designed after `wbs-work-packages` slices 1–3a and replaces its
slice 3b. Open questions Q1–Q4 are Dany's; every SC decision is the planner's assumption.

## Goals / Non-Goals

Goals: one vocabulary of steps per organization; which steps a leaf carries follows its
type and its place in the organization → space → project chain; adding is cheap at any
level; nothing silently disappears. Non-goals: proposal.md.

## Decisions

- **SC1. One catalogue per organization.** `step_definition(id, organization_id, code,
name, estimate_unit, default_allowance_bps, position, created_at, created_by)`; `code`
  unique per organization (today's shape, scope widened: `dev`, `qa`, `review`). A space or
  a project that "adds a step" creates a definition in the organization catalogue (so the
  code namespace stays one) and binds it at its own scope (SC2); the definition records
  `defined_at_scope_kind/id` as provenance only. Rejected: catalogues per space or project
  (three namespaces, and the same `qa` meaning three things).
- **SC2. Bindings add; nothing hides.** `step_binding(id, organization_id, scope_kind
CHECK IN ('organization','space','project'), scope_id, step_id → step_definition,
work_item_type_id NULL → work_item_type, position, UNIQUE (scope_kind, scope_id,
step_id, work_item_type_id))`. A leaf's resolved steps are the bindings on its chain
  (organization, its project's space if any, its project) whose type is the leaf's type or
  NULL, deduplicated by step, ordered by SC4, each read with provenance (which scope, which
  type). Removing a step at a lower scope than its binding is not expressible (E19's rule
  for markers). **Q1 (Dany):** is a project-level exclusion needed ("this project's spikes
  skip QA")? Recommend no for now; if yes later, a `step_exclusion` row with the same
  columns, evaluated as a subtraction after the union, no reshape.
- **SC3. Untyped leaves get the type-unbound steps.** A leaf with no work item type
  resolves only bindings with `work_item_type_id IS NULL`. **Q2 (Dany):** should an
  organization be able to require a type on every leaf? Recommend no in this change; it is
  one setting (`requireWorkItemType`, E18 catalogue) later.
- **SC4. Order.** Resolved steps sort by the binding's `position` at the organization
  scope first, then space, then project bindings interleaved by their own `position`;
  ties by code. A project may reorder only the steps it bound. **Q3 (Dany):** should a
  project be able to reorder inherited steps for its own tables and Gantt? Recommend no
  (one order per organization reads the same everywhere); a display preference later if
  wanted.
- **SC5. Who may bind.** Organization bindings and definitions:
  `organization.manage_settings` (P19); space bindings and definitions:
  `organization.manage_spaces`; project bindings and definitions:
  `project.manage_settings`. Deleting a definition needs `organization.manage_settings`
  and is refused `409 step_bound` while any binding names it.
- **SC6. Per work package stays per work package.** `work_package_step(work_package_id,
step_id, estimate_unit, allowance_bps, allowance_revision)` holds what genuinely differs
  per package, defaulting from the definition when first written (explicit row, not a
  fallback read: the migration and `createWorkPackage` write the rows for every resolved
  step so a read never defaults). Changing the unit while estimates exist stays refused
  (ADR 0042). Rounding rules unchanged (ADR 0011).
- **SC7. A step node exists for every leaf and resolved step; dropping one that holds
  data is refused.** Unbinding, re-typing a leaf, or changing a leaf's project so a step
  leaves its set is refused `409 step_nodes_in_use { stepId, count }` while any
  `estimate`, actual, measure, progress, assignment, dependency or claim row exists for a
  (leaf, step) pair that would vanish; the caller clears or moves them first. **Q4 (Dany):**
  alternative is to keep orphan rows hidden and restore them when the step returns.
  Recommend refusal: hidden state is the kind of silence R5 forbids, and a hidden estimate
  still sums into nothing visible.
- **SC8. Migration** (one folder, after `wbs-work-packages` 3a): for each organization,
  `step_definition` rows are created from the distinct `(code)` across its work packages'
  steps; two packages with the same code and different name, unit or allowance are
  **reported** in the migration's report table (`step_merge_conflict`) and the migration
  refuses until an operator rules (`--merge-rules=<file>` naming the winning name per
  code, like the cleanup CLI's rules); each package's steps are bound at the package's
  project for every type (`work_item_type_id NULL`), so every leaf resolves exactly its
  old set; `work_package_step` rows written from the old `step` rows; `estimate`,
  `step_progress`, `step_measure`, `measure_estimate`, `step_node_attempt*`,
  `step_blockage`, `step_parallel` re-keyed from old step ids to definition ids; journal
  payloads and saved-plan input bodies rewritten once with `json_set` (E33), refusing on
  an unrecognised shape naming the row. `down.sql` refuses while any binding or definition
  exists outside the migration's own (`origin = 'migration'`).
- **SC9. Reads and documents.** The tree read carries per leaf `steps: [{ stepId, code,
name, via: { scopeKind, scopeId, workItemTypeId } }]`; the work package read carries the
  resolved set for its project plus the package's unit and allowance per step; plan
  document version +1 (catalogue, bindings, per-package rows) and saved-plan input +1,
  older versions converted on read; Navigator reads the new version, Burokrat admits it.
- **SC10. Twilight.** `twib validate workflow-binding --steps <codes>` (#601) reads the
  project's resolved codes per type from `GET /api/projects/:id/steps?type=`; the binding
  file names codes, never ids.

## Routes

| Route                                                                         | Permission                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET /api/organization/steps`                                                 | `organization.read`; definitions with bindings   |
| `POST /api/organization/steps` / `PATCH …/:id` / `DELETE …/:id`               | `organization.manage_settings`; `409 step_bound` |
| `POST /api/organization/step-bindings` / `DELETE …/:id`                       | by scope kind: SC5; `409 step_nodes_in_use`      |
| `GET /api/projects/:id/steps?type=`                                           | `project.read`; resolved with provenance         |
| `PATCH /api/work-packages/:id/steps/:stepId { estimateUnit?, allowanceBps? }` | `package.manage_settings`; unit change rule      |

Plan commands `addStep`, `renameStep`, `reorderSteps`, `deleteStep` on a work package are
removed; `setStepAllowance` stays (per package). `setEstimate` refuses
`422 step_not_resolved` for a step outside the leaf's resolved set.

## Risks / Trade-offs

- A type change on a leaf becomes a potentially refused write (SC7); fe-01 shows the count
  and the pairs to clear.
- The migration's merge step needs an operator decision on dev where codes collide; the
  report lists them before anything is written.
- Workflow bindings in Twilight that assumed one step set per package now resolve per type;
  #601's validator gains the `type` argument.

## Context

Today `step(id, project_id, name, order, code, estimate_unit, allowance_bps)` belongs to
one work package (today's `project`); `estimate(work_item_id, step_id, optimistic,
realistic, pessimistic)` keys on it; a **step node** exists for every leaf and every step
of its package (ADR 0031); work item types are directory-global, do not inherit (ADR 0009)
and have no relation to steps. `wbs-work-packages` E21 (deferred 2026-10-25) would have
lifted the step set to the project. Dany's rule replacing it: "steps by work item type;
first configured on the org level; then can be added on the space level; then on the
project". This change is designed after `wbs-work-packages` slices 1–3a and replaces its
slice 3b. Open questions Q1–Q5 are Dany's; every SC decision is the planner's assumption.

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
  `defined_at_scope_kind/id` as provenance only, plus `origin` (`'migration'` or
  `'authored'`) and `legacy_work_package_id` (set by the migration only, SC14). Creation
  authority: SC20; uncoded legacy steps: SC23; the definition's unit and allowance are
  **default estimate unit** and **default allowance**, copied into package rows (SC21).
  Rejected: catalogues per space or project
  (three namespaces, and the same `qa` meaning three things).
- **SC2. Bindings add; nothing hides.** `step_binding(id, organization_id, scope_kind
CHECK IN ('organization','space','project'), scope_id, step_id → step_definition,
work_item_type_id NULL → work_item_type, position, origin)`; identity and uniqueness
  are SC18 (the four-column UNIQUE first written here admits duplicate every-type rows). A leaf's resolved steps are the bindings on its chain
  (organization, its project's space if any, its project) whose type is the leaf's type or
  NULL, deduplicated by step, ordered by SC18, each read with provenance (every matching
  binding). Removing a step at a lower scope than its binding is not expressible (E19's rule
  for markers). **Q1b (Dany):** is a project-level exclusion needed ("this project's spikes
  skip QA")? Recommend no for now; if yes later, a `step_exclusion` row with the same
  columns, evaluated as a subtraction after the union, no reshape.
- **SC3. Untyped leaves get the type-unbound steps.** A leaf with no work item type
  resolves only bindings with `work_item_type_id IS NULL`. An every-type binding is not
  an untyped leaf's binding: it reaches typed leaves too. A leaf in the stored type
  conflict state resolves nothing (SC19). **Q2b (Dany):** should an
  organization be able to require a type on every leaf? Recommend no in this change; it is
  one setting (`requireWorkItemType`, E18 catalogue) later.
- **SC4. Order** (comparator made total by SC18). A scope reorders only its own bindings.
  **Q3b (Dany):** should a
  project be able to reorder inherited steps for its own tables and Gantt? Recommend no
  (one order per organization reads the same everywhere); a display preference later if
  wanted.
- **SC5. Who may bind** (revised by SC20: definitions are created only through
  `defineAndBindStep`; renaming or retiring needs `organization.manage_settings`).
  Organization bindings and definitions: `organization.manage_settings` (P19); space bindings and definitions:
  `organization.manage_spaces`; project bindings and definitions:
  `project.manage_settings`. Deleting a definition needs `organization.manage_settings`
  and is refused `409 step_bound` while any binding names it.
- **SC6. Per work package stays per work package** (row set defined by SC21).
  `work_package_step(work_package_id, step_id, estimate_unit, allowance_bps,
allowance_revision)` holds what genuinely differs per package, defaulting from the
  definition when first written (explicit row, not a fallback read: SC21 says which rows
  exist, so a read never defaults). Changing the unit while estimates exist stays refused
  (ADR 0042). Rounding rules unchanged (ADR 0011).
- **SC7. A step node exists for every leaf and resolved step; dropping one that holds
  data is refused** (protected facts and paths enumerated by SC17). A write that drops a
  step from a leaf's set is refused `409 step_nodes_in_use { stepId, count, projectIds }`
  while any protected fact exists for a vanishing pair; the caller clears or moves them
  first. **Q4 (Dany):**
  alternative is to keep orphan rows hidden and restore them when the step returns.
  Recommend refusal: hidden state is the kind of silence R5 forbids, and a hidden estimate
  still sums into nothing visible.
- **SC8. Migration** (superseded by SC11–SC15 and SC23: no re-key of unmerged steps, no
  rewrite of stored JSON). One folder after `wbs-work-packages` 3a; the SC23 report runs
  first and the folder refuses until every reported row has a rule.
- **SC9. Reads and documents.** The tree read carries per leaf `steps: [{ stepId, code,
name, via: [{ bindingId, scopeKind, scopeId, workItemTypeId }] }]`, `via` listing every
  matching binding in SC18 order; the work package read carries the
  resolved set for its project plus the package's unit and allowance per step; plan
  document version +1 (catalogue, bindings, per-package rows) and saved-plan input +1,
  older versions converted on read; Navigator reads the new version, Burokrat admits it.

  Saved input13 requires a complete `leafSteps: [{ workItemId, stepIds }]` census,
  including empty lists and excluding parents. Connected member history records the
  same census for every captured package. Only the declared root input version selects
  this history grammar; original1–12 retain their explicit uniform interpretation and
  their original closed readers and bytes. Comparisons derive uniform execution lists
  from validated older versions without inventing binding provenance, recorded parents
  or retired owners. Identity projection translates ordered IDs in both target input
  and connected members while retaining the captured evidence unchanged.

  Input13 validates tree ancestry, leaf/policy identities, six serialized point
  collections, local selectors, complete captured workflow/authored graph constraints
  and target census agreement. Existing schedule3/4 shapes can represent leaf orders;
  input13 selects own-inventory membership validation for local slices and connected
  baseline/composite placements. A null step is valid only for a captured empty leaf.
  Held work can be absent from a schedule, so membership checks do not fabricate missing
  placements. Original uniform cross-body checks retain their separate entry point.

  Current local and connected saved-store writers select input13, including every
  captured member's own inventories. Required resolved captures flow through local,
  shared and connected preparation. Live canonical preparation reads the tree purpose
  and selects each leaf's order explicitly. Original1–12 constructors and readers retain
  their uniform interpretation. Connected comparisons derive uniform order before alias
  translation and canonicalize detached metadata sets while preserving execution order
  and exact captured evidence.

  Current tree node readings and resource records use each retained leaf's own order.
  Empty leaves expose empty records, parents expose neither, and held leaves retain
  their resource records before schedule reduction. Domain resources require a complete
  leaf map and reject extra owners and repeated identities. The graph kernel also
  requires explicit interpretation; its own-order control finds a cycle uniform order misses.

  Document15/16 writers, proposed-edit cycle guards, execution/startable/claim readers and fake/UI consumers
  still need document17/18 and the remaining current-consumer cutover. Actual local
  Memory/SQLite save/read/compare and live preparation controls do not certify activated
  connected HTTP, complete Source ownership, saved replay or import.
  These intermediate private changes are not a completed SC9/SC16 release.

Current local step references use each leaf's resolved SC18 order and count, including explicit empty lists for zero-step or conflicting leaves. Their opaque revision uses `ar2`, hashing effective numbers, leafhood and each leaf's ordered step identities/codes; names, provenance-only changes and unused package-union columns do not change an address. Uniform legacy address descriptions retain their exact `ar1` representation through an explicit uniform constructor mode. A changed resolved set or order makes the old revision stale before lookup. Current local callers always require leaf metadata; partial or wholly absent leaf lists are corrupt trusted state and never select a uniform fallback.

Qualified address search captures current catalogue values and each leaf's resolved metadata synchronously inside its existing read-only authorization transaction, using the same SQLite tree helper with minimal placement columns. It never queries the retired local-step table. Discovery remains a bounded header-only query; selected capture reads only that package's placements, with stable ID ordering matching local numbering. Its `qar2` hash envelope contains the current `ar2` address description and stable ID/parent-ID ancestry, so a frozen-number reparenting invalidates descendant-selector observations even if local leaf addresses remain unchanged. The wire revision remains opaque. Candidate node ordinals and reference padding use each leaf's order/count. Parent selectors include the union of actual matching descendant leaves, in first matching descendant order (effective number/ID, then that leaf’s SC18 order), and retain null reference/no node identity. Candidate step position remains compatibility metadata from that union, distinct from the leaf ordinal. These are recorded implementation assumptions under standing authorization. Current isolated/shared HTTP and exact read-transaction/lifetime evidence qualify this purpose only; complete local tree/fact ownership, the old qualified HTTP fixture migration and other Source purposes remain required.

- **SC10. Twilight** (superseded by SC22: validation stays offline over a fetched
  manifest). The binding file names codes, never ids.

## Decisions after the Codex review

Current attempt-history sentences use the actual leaf's current resolved order/count from the tree read purpose. Later binding changes affect future sentences only; recorded event rows remain exact. Current catalogue definitions are coded, so new attempt labels always use that coded reference. Connected endpoint projection also uses each leaf's captured ordered identities/count, rejects missing metadata, unresolved node steps and parent-as-node endpoints, and retains parent selector address/null-node-reference behavior. Package step position remains display metadata. These purpose changes do not certify complete write/read ownership or the per-leaf scheduler.

Detached projection fixtures explicitly author uniform leaf inventories as a sidecar without changing their historical PlanInputReads. A historical uncoded step has a synthetic sidecar code used only to satisfy that fixture's current metadata shape; label code/null behavior still reads its original separate catalogue metadata. These fixtures are not Source captures or genuine predecessor evidence. Actual isolated/shared HTTP proves future attempt labels, unchanged recorded event rows and actual leaf addresses. Full connected HTTP label verification remains required: the existing inactive external-dependency gate rejects even a fixture SQL insertion. Do not fabricate activation evidence to get that case through.

Codex review of #725 at `0bc934e4a` (13 findings, verdict NEEDS AMENDMENTS). Every
decision below is the planner's, **assumed, overrulable**; each names the finding it answers.

- **SC11. Every step keeps its id** (F1, F2; confirmed 2026-10-25). Each existing `step` row
  becomes the `step_definition` row with the **same id**, `origin = 'migration'`,
  `legacy_work_package_id` = its package, and one binding at its package's project for every
  type; its unit, allowance and `allowance_revision` become that package's
  `work_package_step` row. Foreign keys keep pointing at valid ids, so no fact row, journal
  entry, saved-plan body, `plan_event` or cache row changes for a step that is not merged
  (SC12). This removes the saved-plan rewrite F1 objects to: `saved_plan_body.bytes` stay
  immutable and `saved_plan.input_sha256`/`schedule_sha256` stay valid.
- **SC12. Identical shared codes merge; divergent ones wait for a rule** (F2, F11; revised
  2026-10-25 by the coordinator, confirmed the same day). Step rows of one organization sharing
  a code whose name, estimate unit and allowance are **all** equal merge automatically: the
  survivor is the row with the earliest `created_at` (NULL, from rows older than
  `20260901120000_add_audit_columns`, sorts after every value), then the lowest id, a stated
  total order rather than a default. Each such code is one `shared_code_identical` report
  row naming survivor and losers. An identical merge loses nothing, and every work package
  starts with `Dev` and `QA`, so ruling them would fill the dev rules file with no decision.
  Rows sharing a code with any differing field are one `shared_code` row listing the fields
  and refuse until the rules file (SC23) names the surviving step id. Merging, inside the
  migration, re-points the fifteen current foreign-key columns of the
  thirteen tables (inventory below) from each losing id to the survivor, re-keys the loser's
  `work_package_step` row to the survivor keeping that package's unit, allowance and
  `allowance_revision`, drops the loser's binding and definition, and records
  `step_identity_history(old_step_id PRIMARY KEY, step_id → step_definition, merged_at)`.
  Codes are unique per package today (`step_project_code`), so the map is injective per
  package and no per-work-item key collides; a fact whose work item lies in another package
  than its step's is a `foreign_package_fact` report row and refuses.
- **SC13. History is translated on read, never rewritten** (F1; **settled by Dany 2026-10-25, "ok go SC13"; supersedes E33**). Historical readers translate an old id through
  `step_identity_history` after the integrity check, on read only, and never write
  translated bytes back: saved-plan input and schedule bodies (slice keys included), journal
  `payload`, `inverse` and `preconditions` (`estimateUnits` keys, `moveProgress`, and
  `step:<id>` revision keys, which name the `work_package_step` row of the journal's
  package), `plan_event.step_id`/`before`/`after`, `optimized_schedule_cache.result_json`,
  and `event_log.message` on reconnect replay. Saved-plan hashes stay valid because the bytes
  are untouched. E33 rejected an alias table as a compatibility layer; this table is a
  **historical identity map** read by history readers only and never consulted by a live
  write (a live write naming a merged id is `404 not_found`). Rejected: E33's `json_set`
  rewrite (breaks saved-plan integrity, F1).
  Saved comparison keeps captured evidence separate from resolved meaning. Every side has an
  explicit comparison state: captured, or step-resolved with detached input, dependency and
  schedule meanings. The shared verified-plan path serves observed reads and legacy comparison;
  original bytes, hashes and header links are checked before identity translation. Current
  captures explicitly use captured meaning; there is no optional translator fallback.
  Connected `inputEvidence`, schedule bodies, stage bytes, question hashes and signatures remain
  captured evidence, including in detail responses and provenance summaries. Comparison meanings
  decode supported stage packets and translate only typed identity sites and their derived keys;
  they are not serialized back or presented as newly captured packets. Historical labels and
  opaque fields are preserved. Derived digest spelling may be normalized only when its packet
  change is explained by the supported format/identity projection; solver configuration, timing,
  membership and variant differences still compare. This path neither schedules nor rehashes
  translated packets. Missing trusted history and projected identity collisions refuse.
- **SC14. Storage transition** (F2; confirmed 2026-10-25). Not additive: it runs in the E14
  stop-the-world window with the backup as rollback, with a migration-lint waiver shaped
  like `20260831120000_rename_role_to_step`; the proposal's former "additive" constraint is
  withdrawn. The folder carries the foreign-keys-off marker; renaming `step` to
  `step_definition` (`ALTER TABLE … RENAME`) makes SQLite rewrite the thirteen current children's foreign-key clauses, the parent
  is then rebuilt to the SC1 shape, and an orphan count per column feeds the
  `CHECK (violations = 0)` guard before commit. The six triggers that join `step`
  (`claim_step_project_insert`/`_update`, `step_blockage_owner_insert`/`_update`,
  `step_parallel_owner_insert`/`_update`) are dropped and recreated against
  `step_definition` and `work_package_step`: the step must hold a row for the work item's
  package. `down.sql` (required by lint) renames back and restores `project_id` from
  `legacy_work_package_id` only while every definition is migration-origin and bound once,
  `step_identity_history` is empty and no fact lies outside its
  definition's legacy package; otherwise it refuses naming the first row, and the rollback
  is the backup. For task 1.2, reversing an unmerged database means restoring the original
  predecessor representation of each step, including its raw nullable code. An SC23 confirmation
  may promote a NULL code during apply; down must restore that original NULL, not carry the
  promoted code back or derive another value from the name. Preserve explicit lossless legacy-code
  provenance before promotion. A missing or incoherent provenance row is a refusal naming the step
  before destructive down statements, not permission to infer a value. Facts, historical JSON/hash
  bytes, IDs and the complete predecessor name/hash ledger retain their existing guarantees.
  This clarifies lossless unmerged rollback, not a claim that current private down already does it.
  Tests: `bin/assert-rename-window.sh` refuses with a live colour; restore
  from the backup is drilled in `verify.md`.
- **SC15. One project, different old sets: refuse, and no package gains a step** (F3; settled by Dany 2026-10-25, Q1a: "make sure no new steps for now"). Packages of one project whose old step sets differ cannot keep them under project bindings. The migration refuses with one `divergent_project_set` report row per project naming each package's codes, and there is no `expand` rule: the operator regroups the packages into projects whose packages share one set (or aligns the sets by hand) before `apply`, so after the migration every package resolves exactly the codes it had, no more and no fewer. Because `wbs-work-packages` slice 2 puts every existing package of an organization into one migration project, this migration cannot run for an organization until its packages are regrouped or their sets agree; the report says which. Automatic union is deferred until Dany asks for it.
- **SC16. The scheduler slices per leaf** (F4; assumed, overrulable; Q2a). `slicesOf` builds
  each leaf's slices from its resolved order, not a package-wide order. A leaf resolving no
  step keeps one boundary-only slice of zero duration (the **work-item boundary**), so whole
  dependencies and folds keep an endpoint. A `descendant-step` endpoint applies to the
  descendants that resolve the step and throws `no_descendant_resolves_step` when none does
  (`slice-edges.ts`). Whole and node endpoints are unchanged; cycle validation runs on
  the per-leaf graph. Saved plans schedule through SC13. Fast and solver must agree on a
  mixed story/spike fixture.

  The shared slicing kernel requires an explicit interpretation: ordered IDs for every
  actual leaf, including an empty list, or the package-wide uniform interpretation.
  Missing leaf inventories, repeated IDs, unknown policies and estimates outside a leaf's
  resolution throw. Holding every originally matching descendant suppresses the reduced
  constraint while retaining its authored input; an originally unmatched selector or
  absent owner/slice evidence still throws. Both engines share the resolved graph and
  solver request baseline. Scheduler contract 20 excludes earlier cached outcomes.
  Current live, captured and connected preparation now requires explicit own inventories;
  saved-store writers select input13. Current tree node readings/resources also require
  own inventories. Scheduler-free SQLite execution captures the same required own
  inventories synchronously on its admitted read transaction; connected members use
  their captured inventories. The local service fallback reads current tree metadata.
  Execution eligibility, startable work and claims enumerate the addressed leaf's own
  steps. The by-person view sorts each leaf's assignments and step claims in its own
  order; nullable subtree claims retain their prior place. Live progress, blockages
  and attempts must name resolved leaf pairs. Scoped claim writes still require the
  actual unit of work and its limits gauge. Proposed-edit cycle snapshots still
  explicitly select uniform interpretation pending actual candidate type/owner capture;
  current execution evidence does not close that purpose or the complete SC16 contract.

  Status commands also capture required own leaf inventories before building point
  recipes. First-silent and reopened-last choices use the addressed leaf's order;
  parent starts skip empty leaves while retaining unheld preference. The selected
  subtree, rather than an unrelated package policy, determines `no_steps`. Assumption
  for SC19 bulk intent: `done`/`in_progress` refuse the whole selected scope if any
  addressed leaf has a stored type conflict, before any point/date/hold write. Nonpoint
  readiness/hold commands remain allowed. Mixed-scope completion retains prior nonpoint
  date/hold effects on empty leaves without inventing their step nodes. Claims likewise
  refuse a conflicted leaf, preserving package-unknown step precedence and nullable
  non-leaf claims. Current replay records actual own-step recipes; it is not evidence
  for the fifteen genuine historical guarantees.

  Candidate-cycle design: add a required WorkItemStore
  `resolveStepOrders(workPackageId, projection)` observation. Its projection contains
  proposed row identities/parents and explicit direct-type replacements. Existing
  rows use actual stored direct types, including current parents becoming leaves;
  every fresh/restored identity requires explicit type evidence. Both adapters resolve
  against actual same-observation bindings, ownership and explicit package values;
  a missing type declaration never becomes untyped. Validated SubtreeCopy recipes
  retain their documented absent-type meaning through an explicit caller conversion.
  Reusing current leaf display metadata cannot describe those future leaves, and
  caller-built uniform inventories cannot supply Source evidence. Current connected
  graph reads must use the required capture and reject interpretation overrides;
  explicit uniform history remains in its existing versioned readers/kernel inputs.
  Preserve ownership-before-labels, both incident directions, queue retention and
  Source/ordinary/repair fences. Actual Source negatives and each structural consumer
  are required; a new unused capture helper does not complete the cycle cutover.

  First-child transfer preflight uses required `SubtreeStore.inspectFirstChild` on
  that same Source/loan. It runs the existing complete protected-fact decision
  before prospective graph slicing, so an inapplicable transferred estimate
  receives SC17's modeled refusal instead of becoming a malformed candidate graph.
  Inspection publishes nothing and grants no write authority. The atomic writer
  still captures and checks the complete decision itself; inspection never replaces
  its protection. Both initial creation and current replay use this ordering.

  Candidate preflight must preserve SC17 before graph slicing: an invalid proposed
  transfer is an expected protected-node refusal, not corrupt stored state. Add a
  required `SubtreeStore.inspectFirstChild` purpose using the existing complete
  same-owner first-child decision before any mutation. Inspect retains inputs and
  obeys public/ordinary/repair admission, but grants no later write authority;
  `writeFirstChild` still recaptures and validates on its actual writer. Both initial
  creation and replay inspect before projecting transferred estimates into a cycle
  graph. This internal read purpose reuses all13 fact capture and the existing pure
  decision; it does not weaken current slicing or discard invalid prospective facts.

  Current Source capture now returns `ResolvedPlanInputReads` with required `leafSteps`
  beside ordinary stored work-item rows. Its row census determines actual leaves, and
  each captures its own ordered IDs or an explicit empty list. Memory reads its detached
  epoch; SQLite resolves metadata synchronously on the existing capture transaction.
  SQLite must not start another tree transaction or acquire a new metadata connection.
  Capture admission and delivery retain Source lifetime checks; the first-read continuation
  also checks Source lifetime before further reads. This purpose supplies no complete
  fact/access owner certificate. Current saved-store persistence selects input13;
  document15/16, proposed-edit cycle guards and execution/startable/claim readers remain
  pending their cutover. Actual Memory/SQLite current tree controls cover node readings
  and resource records, not complete snapshot ownership or activated connected HTTP.

- **SC17. One applicability invariant guards every protected fact, and lists what it protects before and when it refuses** (F5; settled by Dany 2026-10-25 with his rule "if changing configs breaks smth - must list what will be broken before change can happen"). Protected facts per (leaf, step): `estimate`, `actual`, `step_progress`,
  `step_measure`, `measure_estimate`, `step_node_attempt`, `step_node_attempt_issued`,
  `assignment`, `claim` (lease, revocation and delegation fields included),
  `typed_dependency` and `external_dependency` at either endpoint (parent-scoped references included), `step_blockage`
  and `step_parallel`. Applicability-changing paths: unbind, retype, type deletion (today it
  cascades its labels), moving a leaf or a package across projects, changing a project's
  space, deleting a space, undo/redo/restore and copy, and a leaf becoming a parent. One
  store-level check, evaluated in the writer's transaction by every such path and by every
  fact writer (`setEstimate`, `setActual`, … refuse `422 step_not_resolved`), refuses `409 step_nodes_in_use { count, pairs }`: `pairs` lists each vanishing (work item `id`, `name`, `stepId`, `workPackageId`) with the kinds of protected facts on it, the first 200 by package and rank, `count` the total. Every applicability-changing write (unbind, retype, type deletion, leaf and package move, space change, space deletion) accepts `dryRun: true` and answers `200 { wouldRefuse: 'step_nodes_in_use', count, pairs }` or `200 { wouldRefuse: null }` from a rolled-back transaction under the write's own permission, writing and announcing nothing; `GET …/step-nodes-in-use` stays for browsing a binding's usage. Issued-attempt counters are retained facts: they block removal, so attempt numbers are never reused. Rejected: dropping the facts (the schedule changes and nobody can tell why) and hiding the node with its facts (the data leaves every read).
  Clarification accepted 2026-11-18: A42 already retains a parent’s issued-attempt counter when copying it to its first child. Treat that retained address as an **allocator reservation**, separately from a visible leaf step node. Configuration admission checks the reservation against the parent’s own direct type/current chain and exact definition/WPS identity and values; it reports the parent’s actual tree rank with `attempt_issued`. It does not substitute a descendant type, filter away the parent, reset its counter, or defer invalidity until a later last-child deletion. Current leaf counter-only protection remains unchanged. An unrelated sibling/foreign reservation is not a global veto. This is a clarification of existing retained numbering history, not authorization for parent estimates, progress, measures or attempts. The alternative of allowing unbind and refusing only later revival was rejected because it admits invalid retained history and loses the original binding order needed for a precise configuration preview.

  First-child conversion must deepen the existing store-owned structural operation: capture all 13 protected families/current direct types and already-admitted incident receipts, construct the actual untyped child, validate every transferred address, then mutate in one same-writer savepoint or memory staged publication. A refusal leaves unrelated outer work committable and exposes no partial tree/fact state. Budgets stay on their existing parent owner; assignments, demands, claim satellites, endpoint identity and counters retain their established transfer semantics. Parallel facts without a lawful transfer refuse. Current undo/redo must use the same atomic transition, rather than replaying transient parent point rows through repeated working-plan refreshes. Existing remote incident admission/restoration remains the authority; captured receipts cannot manufacture permission. The first combined point-fact tests do not complete all-family, SQL, failure-recovery or history coverage.

  Existing-work moves require their own writer boundary. The current service clears destination progress, blockage and demands before its row move; placing a guard only on that final row operation would miss the cleared protected facts. Capture the complete before snapshot and proposed parent change before any clear or renumbering, compare lost leaf nodes using their original direct types/rank, and refuse protected values without treating incoming existing work as a fresh-child transfer. Explicit allocator reservations retain their own type semantics. Shared pure topology comparison is a component; atomic Memory/SQLite ownership, lawful nonpoint state changes, typed caller/replay/preview propagation and actual negatives remain required before this path is complete.

  The actual store boundary is SubtreeStore.writeMove, beside first-child and subtree restoration. It takes the complete within-package placement, retains plain inputs before admission, and captures current catalogue/all13 usage on the actual writer. Memory transforms a fresh private clone after suspension and publishes only after its Source/loan fence; SQLite owns one synchronous writeSubtreeIn transaction/savepoint. Lost destination step nodes refuse before nonpoint statement/demand clears or respacing. A transient MoveRecord reports actual previous placement and cleared nonpoint values; it grants no historical replay authority and is not a journal descriptor. Candidate endpoint validation fails before mutation. Caller-facing endpoint outcomes, current/historical compensation descriptors, raw move retirement and full application/preview propagation remain required.

  Current ordinary and compensating application moves call that actual transition. New forward history records the move without independent destination clears; inverse nonpoint values come from its actual writer before-image. Replay retains its previously watched revision identities plus current touched identities, including when one direction has no physical nonpoint inverse. A newly admitted live protected-node conflict keeps its journal entry and count/pairs; genuinely revision-stale entries retain the existing discard policy. Undo/redo response schemas expose the same precise conflict fields. This adds no historical authority to current writes: legacy journals must come from their actual prior producer and explicit report/apply/history admission before choosing projection/repair. Command scopes own whole-service rollback/publication; standalone compound prelude isolation is not newly promised.

  A genuine old deletion inverse can retain progress for its surviving parent even
  though undo recreates that parent's children. This recipe is permanently
  inapplicable to the current leaf-only model: refuse it as `stale_undo` after existing
  deletion/sparse admission and before any restore prelude. The normal stale-entry
  discard/outer-rollback repair applies only to the mutable undo entry; immutable
  plan-event bodies remain unchanged. A lawful old leaf-only deletion remains
  replayable with its recorded timestamp. Unknown required-state failures still
  throw and preserve the entry. This resolves the runtime failure mode, not the
  separate original parent-history read/projection guarantees under 1.6.2a–c.

- **SC18. Binding identity and a total order** (F6; assumed, overrulable). `type_key` is a
  virtual generated column `COALESCE(work_item_type_id, '*')` and
  `UNIQUE (scope_kind, scope_id, step_id, type_key)`; on bun's SQLite 3.53.4 this refused
  both a duplicate every-type and a duplicate typed row (checked 2026-10-25). A step's
  ordering binding is its matching binding with the least (scope rank organization < space <
  project, position, binding id); resolved steps sort by (that binding's scope rank, its
  position, code, step id). Provenance lists every matching binding; removing one of several
  leaves the step resolved, so SC17 does not fire. A same-organization trigger requires the
  scope, definition and type to belong to the binding's organization.
- **SC19. A type conflict resolves nothing** (F7; assumed, overrulable). A leaf in the stored
  **type conflict** state resolves no step and every step write on it is refused
  `409 type_conflict` until its type is corrected; reads show it flagged. The resolver takes
  `{ kind: 'untyped' } | { kind: 'typed', typeId } | { kind: 'conflict', typeIds }`, never
  a nullable id. Migration: a conflict leaf holding a protected fact is a
  `type_conflict_leaf` report row and refuses; undo, copy and replay restore the conflict
  exactly and the leaf then resolves nothing.

Current claim observations apply SC18 to each leaf. The internal observation must carry a required map of ordered resolved step IDs for every actual leaf, including an explicit empty list for zero-step leaves. Package-union IDs may remain compatibility metadata, but `findWorkPackageClaims` sorts step claims by their own leaf's map and never falls back to the union. Tree order and nullable subtree claims before step claims remain; published claim payloads and stored claim bytes/stamps do not change. A missing map entry, unresolved point claim, missing explicit values or broken ancestry is corrupt trusted state. Capture current chains, bindings, direct types and values synchronously under the existing observation owner after its access recheck; an asynchronous catalogue-port reentry cannot stand in for that snapshot. Memory uses its actual captured state maps. Existing display fixtures must author real current definitions and bindings, rather than manufacturing metadata around obsolete local step writes. The opposing-type-order and absence controls in task1.6.1 precede implementation.

Current creation replies capture the package header and its inherited any-type catalogue union inside the same birth owner. The required `WorkPackageStore.createWithSteps` capability accepts the new package, stamp and an explicit legacy/scoped creation scope; scoped creation also supplies its retained creator grant. It takes no legacy step seed. The direct service uses this atomic reply. Current birth preparation mints only actual package/grant/audit identities and never generates Dev/QA definitions. Combined project-with-first-package creation reads the same current union inside its existing owner, including organization bindings on a new project. Empty catalogues answer `steps: []`. A later definition edit cannot be combined with the earlier birth header by a post-commit `stepsOf` read. Current Memory Sources capture from the prepared state immediately before publication; SQLite captures inside its existing transaction. Header-only import/table-fixture interfaces retain their explicit compatibility scope while callers migrate; a bare legacy table fixture has no current catalogue birth capability and must fail visibly if asked to provide it. Public, ordinary and repair lifetimes, complete pre-queue input retention and rollback of grants/audits/values remain required. Task1.5.1 first records actual Source service regressions, then implements and proves these boundaries.

- **SC20. `defineAndBindStep`** (F8; assumed, overrulable; Q3a). One atomic operation
  creates the organization-wide definition and binds it at one scope, with that scope's
  permission (SC5) checked at the scope id: `organization.manage_settings` (#723 P19) for
  the organization, `organization.manage_spaces` for a space, `project.manage_settings` at
  that project. Renaming or retiring a definition afterwards needs
  `organization.manage_settings`. Scope, definition and type must share the caller's
  organization; otherwise `404 not_found`. Negatives: another organization's project, and a
  manager of a sibling project. Depends on #723 (projects, spaces, scope chain, moves) and
  #724 (set membership).
- **SC21. A package's rows are the union over its project** (F9; assumed, overrulable).
  rows(p) = { s | some binding at the organization, at project(p)'s space or at project(p)
  names s, for any type }, independent of current leaves; it covers every leaf's resolved
  set. Rows are written when a package is created and on every binding add, project move
  or space change, from the definition's defaults at that moment. Unused rows persist with
  their authored unit and allowance; later default changes never touch them.
- **SC22. Burokrat validates offline over a manifest** (F10; assumed, overrulable). WBS
  serves `GET /api/projects/:id/step-manifest` (`project.read`): per work item type and for
  untyped leaves the resolved codes, plus the project revision.
  `twib validate workflow-binding --manifest <file>` reads it offline, checks every type and
  code pair and the `default` mapping, refuses a manifest whose revision is not the one the
  binding names, and adds the manifest digest to the binding digest. Coordinated with
  `twilight-agentic-workflows/specs/twilight/workflow-binding/spec.md` (#601), whose
  `--steps` stays as the untyped shorthand.
- **SC23. Rules file, report, then apply** (F11; assumed, overrulable).
  `step-catalogue-cli.ts report` writes only `step_migration_report` rows (kinds
  `shared_code_identical` (informational, never refuses), `shared_code`, `uncoded`,
  `name_clash`, `divergent_project_set`, `type_conflict_leaf`,
  `foreign_package_fact`) and a fingerprint of the step rows. `apply --merge-rules=<file>`
  takes the JSON file below and runs the folder under the window. A missing, unreadable, malformed (arktype at the
  boundary) or stale (fingerprint differs) file refuses with nothing written. An uncoded
  step gets the code `backfill-step-codes-cli.ts` derives from its name, shown in the report
  and applied only when the operator confirms it in `uncoded` (replaces E21's refusal). Names
  stay unique per catalogue (`name_clash`, E21's rule carried forward).

  Genuine predecessor probes on 2026-11-20 found that accepting a live parent progress
  statement left current catalogue readers unable to read the package. Report, rule
  preflight and guarded apply therefore refuse concrete parent points after tree
  ownership validation, naming table/work item/step. This is a diagnostic refusal,
  not an eighth report kind or permission to discard history. Issued counters retain
  their explicit allocator exception; null whole/subtree claim reservations retain
  their scope. No current point writer or frozen journal bytes are relaxed. Historical
  replay and any explicit operator disposition remain separate unfinished work under
  tasks 1.6.2a–c.

  ```json
  {
    "version": 1,
    "fingerprint": "<sha256 printed by report>",
    "organizations": {
      "<organizationId>": {
        "codes": { "dev": { "survivorStepId": "<stepId>" } },
        "uncoded": { "<stepId>": { "code": "deploy" } }
      }
    }
  }
  ```

- **SC24. Endpoint and tool inventory; import** (F12; assumed, overrulable). Removed:
  `postApiProjectsByIdSteps`, `patchApiProjectsByIdStepsByStepId` (its allowance half moves
  to the package route, still the journalled `setStepAllowance`) and
  `deleteApiProjectsByIdStepsByStepId`, with their three mcp-01 tools.
  `getApiProjectsByIdStep-references` stays and reads the leaf's resolved order. No plan
  command adds, renames, reorders or deletes a step today; the removed list names
  endpoints only. Import: codes in the catalogue reuse their definition; codes not resolved
  at the target project are bound there for every type (`project.manage_settings`); unknown
  codes are refused `422 unknown_step_codes` unless `defineMissing: true` (SC20).

  Current import reconciliation runs on the existing admitted import writer.
  The request body accepts optional `defineMissing` (omission means false);
  programmatic callers pass explicit import options when enabling it. Resolve
  file codes against the actual active organization catalogue and the target
  project's untyped/default manifest. A known code absent from that default gets
  an any-type project binding even if it already has a type-specific binding;
  this interprets "for every type" for an archival file's complete step inventory.
  Existing inherited/default matches require no binding write. Both binding and
  define-and-bind require `project.manage_settings` at the actual admitted project
  (SC20); organization-wide edit permission is not an additional prerequisite for
  project-scoped definition birth.

  Unknown codes are reported together in file step order before directory or
  package writes unless definition was explicitly requested. Existing definition
  names/defaults and retired namespaces are authoritative. `defineMissing` never
  reactivates a retired identity: the required Source retirement read identifies
  retained codes separately from unknown codes. Any retired file codes answer
  grouped `422 retired_step_codes` in file order, with or without definition opt-in,
  before unknown-code or binding admission. The current119 retirement decoder and
  actual Source read/ordinary/repair owners remain authoritative; active catalogue
  omission alone never selects "unknown". New bindings append after actual project bindings
  in file step order. Their returned reached-package IDs drive buffered catalogue
  refreshes only after the entire import commits.

  If appending would exceed safe integer ranks, add the binding provisionally on
  the same writer and use the complete own-project reorder census, across every
  type, to compact ranks while retaining every prior binding's relative order and
  appending the imported binding. No intermediate order is published. Refusal or
  later import failure rolls back both insertion and compaction.

  If appending would overflow a safe integer binding position, insert the new
  binding at a temporary safe rank on the same writer and reorder the complete
  own-project census to its original relative order followed by the new binding.
  The existing catalogue reorder owner normalizes ranks to 10,20,…; every type's
  existing relative order is preserved. Include its returned reached-package IDs
  in the same post-commit refresh set. Refusal rolls back the whole import.

  Package birth receives no file-local legacy step seed. It materializes the real
  catalogue union; before importing facts, the import writes file-authored units
  and allowances to that new package's explicit rows only. Every point and typed
  endpoint uses the resulting file-ID-to-definition-ID mapping. Row direct types
  are included in the same subtree insertion, so facts and graph checks see the
  actual type. Current cycles use the resulting Source own inventories, including
  imports with only legacy edges. The archival file's uniform order is not a veto
  on a valid current catalogue graph. Pure document-order preparation stays
  explicit for detached historical tests; current preparation defers binding-based
  cycles and reserved-code birth policy to the admitted catalogue owner. A retained
  migration code can be reused; a new reserved syntax code remains invalid to define.

Current step-key inventory: `estimate.step_id`, `actual.step_id`, `step_progress.step_id`,
`step_measure.step_id`, `measure_estimate.step_id`, `step_node_attempt.step_id`,
`step_node_attempt_issued.step_id`, `assignment.step_id`, `claim.step_id`,
`step_blockage.step_id`, `step_parallel.step_id`, both `typed_dependency` step endpoints,
and both `external_dependency` step endpoints: fifteen columns in thirteen tables. The
external endpoints extend the original thirteen-column inventory and retain their paired
work-package/item/step composite ownership. Nullable whole endpoints name no step and are
not foreign-step facts. `plan_event.step_id` has no foreign key and remains SC13 historical
read translation only. Lease/revocation/delegation state lives on `claim`;
`claim_occupancy` keys on claim ids, untouched.

## Retained identity retirement (SC25)

Accepted implementation assumption under the standing authorization to resolve this change's remaining details; it closes the conflict between SC5's definition deletion and SC11/SC13/SC21's retained identity and package values. See [Step retirement preserves identity](../../../docs/adr/0085-step-retirement-preserves-identity.md).

`DELETE /api/organization/steps/:id` retires an active definition. It requires `organization.manage_settings`, conceals foreign/absent/already-retired definitions as `404 not_found`, and refuses `409 step_bound` while any binding names the definition. An unbound definition retires successfully whether it has no references, unused package values, a legacy merge alias, or immutable history. It never deletes the definition or those references. The HTTP result is 204; `GET /api/organization/steps` lists active definitions and active bindings only. Retirement is not unbinding, clearing facts, renaming, or permission to rewrite a stored plan.

The definition's id, code, organization, name, defaults, origin, legacy metadata and historical alias records are retained. Its code and name remain reserved in that organization, including after every package is removed; defining either again returns the existing precise `code_taken` or `name_taken` outcome. Retirement cannot be reversed through bind, defineMissing, rename, replay or an implicit fallback. A future explicit reactivation purpose, if wanted, requires its own contract and tests. This is deliberate namespace retention, not a hidden physical-deletion restriction.

Storage uses a required additive retirement relation keyed by definition id, with actual organization ownership and retirement audit. A missing retirement record is the modeled active state; a missing relation, malformed record, orphan definition or inconsistent ownership is a trusted-state failure. A paired down migration must refuse while retirement records exist rather than silently reactivate identities. Empty-state forward/down ownership and actual complete name/hash ledger restoration remain required. Do not edit migration117 or previously applied bodies.

The current catalogue read decodes selected identities and retirement metadata before projecting active entries. A binding that names a retired definition is corrupt trusted state, not an edge to filter away: public/current reads and admission must throw rather than silently omit it. Both insert and update of bindings must refuse retired identities on the actual same writer. Definition retirement and its final zero-binding check share the owned method-local transaction/savepoint, including when a borrowed caller catches a modeled refusal and commits unrelated work. Memory stages the same definition/retirement/binding graph before publication. All current Source/lifetime/queue guarantees remain required.

Historical readers deliberately retain physical identity access. SC13's saved-plan read translation still sees the retained survivor and old-id aliases; stored input/schedule hashes, raw JSON, command/event history, signatures, resource-use snapshots and runtime bindings remain unchanged. Current package projection still comes from live bindings and each package's explicit values; unused `work_package_step` rows are neither deleted nor replaced from definition defaults. Current point writes/restores against a retired step cannot resolve, and command replay refuses through its existing modeled stale/current-applicability boundary without reactivation. Frozen historical reads do not apply current active-catalogue filtering.

Import distinguishes an unknown code from a retired reserved code. A retired code is refused as a named `retired_step_codes` 422 with the affected codes, including with `defineMissing: true`; it is not silently recreated or bound. This response is a planned explicit contract requiring its own first owner before implementation. Definition PATCH and binding by retired id answer `not_found`, without revealing a foreign retirement record.

Required first owners beyond the initial mounted catalogue slice:

1. Actual current Source creates and binds a definition, materializes two packages, authors distinct package values/revisions, safely unbinds, retires via mounted HTTP, and observes active catalogue absence while the complete original definition and package rows remain exact. Repeated/foreign operations and code/name reuse are explicit outcomes.
2. A genuinely migrated merged-survivor fixture safely loses its final binding, then retires through current admitted authority. Actual saved-read alias translation and frozen body/hash verification remain unchanged; no fabricated survivor/history rows substitute for the existing genuine fixture.
3. Same-writer binding-versus-retirement serialization, a late native fault with full rollback, and a caught borrowed refusal followed by independent outer COMMIT. Memory publication and SQL savepoint omissions need their own observed state failures.
4. Corrupt selected retirement ownership/orphan/scalar metadata and a retained binding to a retired definition must reach production-path trusted-state negatives; removing each new/changed dependency must produce the intended failure before an adjacent Proof is added.
5. Actual import/replay behavior for retired codes/ids, plus active catalogue omission versus historical retention, before API/MCP/UI retirement is certified.

The additive SQL shape does not itself prove mixed-version runtime compatibility. Old binary bind/read behavior, migration window capabilities, deployment ordering, down refusal and disposal must be observed under their actual owners. No such gate, migration, runtime or R5 result is claimed by this design candidate.

## Routes

| Route                                                                         | Permission                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| `GET /api/organization/steps`                                                 | `organization.read`; definitions, bindings   |
| `PATCH /api/organization/steps/:id` / `DELETE …/:id`                          | `organization.manage_settings`; `step_bound` |
| `POST /api/organization/step-bindings` (`stepId` or `define`, SC20)           | SC20 at the scope; `409 duplicate_binding`   |
| `DELETE /api/organization/step-bindings/:id`                                  | SC20 at the scope; `409 step_nodes_in_use`   |
| `POST /api/organization/step-bindings/reorder { scopeKind, scopeId, ids }`    | SC20 at the scope; `409 stale_order`         |
| `GET /api/projects/:id/steps?type=`                                           | `project.read`; resolved with provenance     |
| `GET /api/projects/:id/step-nodes-in-use?stepId=`                             | `project.read`; the pairs to clear and facts |
| `GET /api/projects/:id/step-manifest`                                         | `project.read`; SC22                         |
| `PATCH /api/work-packages/:id/steps/:stepId { estimateUnit?, allowanceBps? }` | `package.manage_settings`; unit change rule  |

`reorder` names exactly the scope's complete bindings across every type or is refused `409 stale_order` atomically. Missing, duplicate, extra and inherited/foreign-scope ids all refuse. The actual same-organization scope is resolved under the write loan before census; a foreign/absent scope is404. Keeping the existing total order (position, then binary binding id), including an empty scope, is a no-op and retains its ranks/revisions. A changed order writes positions10,20,… and advances every actually reached package/project once, including empty projects; definitions, explicit values and facts stay exact. It never reorders inherited bindings on behalf of a child scope.

The project step read uses the existing actual `ProjectChain`, never a made-up work-package identity or current package defaults. Under the standing authorization to settle remaining details, an absent `type` query selects the untyped mapping (SC3); a supplied nonempty value is an organization-owned work-item type id. Unknown or foreign type ids are404 after actual project admission. Empty, repeated or unknown query fields are400. The response is `{ steps: [{ stepId, code, name, via }] }`, listing every matching binding in SC18 order, with no package unit/allowance projection. The actual project’s `project.read` permission is sufficient even when the caller cannot read the organization-wide catalogue. Empty projects resolve without creating package rows or advancing revisions. Project read refusal matches the existing dedicated reader: a currently readable actual child makes a project shell visible and yields403 project.read; otherwise missing project.read conceals the project as404. Readable IDs and actual children are observed inside the same admitted owner before type lookup. Unrelated readable packages never establish shell visibility. SC22’s manifest separately enumerates the untyped default and every type mapping.

The binding DELETE body requires an explicit `{ dryRun: boolean }`. `true` answers200 with `wouldRefuse: null` or the bounded `step_nodes_in_use` count/pairs and rolls back; `false` applies204 or refuses409 with the same protected pairs. Both modes use the binding's stored scope under the write's permission, not a body-provided scope; malformed or omitted mode is422. Successful removal preserves explicit package values and publishes only after commit; preview/refusal publishes nothing.

## Open questions for Dany

- **Q1.** (a) _Settled 2026-10-25 by Dany: refuse until regrouped, no `expand`, no package gains a step (SC15)._ (b) Project-level exclusion: no (SC2); _settled 2026-10-25 by adopting the recommendation (Dany, 2026-10-25: "go with your best assumptions")_.
- **Q2.** _Settled 2026-10-25 by adopting the recommendations: (a) SC16, (b) no (SC3)._ (a) What a parent's "QA across descendants" dependency means when only some
  descendant types resolve QA: recommend matching descendants, refusing when none (SC16); a
  leaf with no resolved step reads as a leaf with no worked steps does today (this change
  does not touch the fold; ADR 0046's "every project step" becomes "every resolved step").
  (b) Required work item type: recommend no (SC3).
- **Q3.** _Settled 2026-10-25 by adopting the recommendations: (a) yes, through `defineAndBindStep` (SC20), (b) no (SC4)._ (a) May space and project managers create organization-wide definitions? Recommend
  yes, only through `defineAndBindStep`, with renaming and defaults afterwards
  organization-level (SC20). (b) Reorder inherited steps per project: recommend no (SC4).
- **Q4.** _Settled 2026-10-25 by Dany: refuse, listing the pairs in the refusal and in a `dryRun` preview (SC17)._ (Was: refuse versus hide step nodes that would vanish.)
- **Q5.** _Settled 2026-10-25 by Dany: SC13 confirmed, E33 superseded._ (Was: the historical identity map revises E33's rejection of an alias table: confirm.)

## Risks / Trade-offs

- A type change on a leaf becomes a potentially refused write (SC17); fe-01 shows the count
  and fetches the pairs to clear from `step-nodes-in-use`.
- Divergent shared codes on dev need a survivor in the rules file; the report lists them,
  and the automatic identical merges, before anything is written.
- History readers depend on `step_identity_history` for merged ids for as long as old
  journals and saved plans are read (SC13, Q5).

### Current119 retirement and catalogue cache ownership

The current runtime requires the additive 119 `step_retirement` relation and an applied-ledger header with the required exact name/timestamp and a lowercase64hex hash. This is required header presence/shape, not content agreement with a universal expected migration hash; actual folder/name/hash acquisition and rollback checks retain their existing independent owners. Its marker retains the physical117 definition, code/name reservation, WPS values and historical aliases. Present markers are decoded against the actual same-organization definition, organization and audit actor. Current binding projections reject a marker/binding combination as trusted corruption; they never silently filter the bad binding. The single-statement package projection carries the required profile columns in its own snapshot; other multi-statement captures borrow the actual existing transaction. Historical saved identity readers remain on their precise117 path and do not reinterpret saved bytes through active catalogue visibility.

Definition name/default edits, first definition/binding creation, new binding provenance and successful unbind advance each actually reached package and project revision once. Empty projects participate independently of package existence. Overlapping bindings deduplicate affected IDs. Results return sorted actual `workPackageIds` and `projectIds`; an exact metadata no-op returns two empty lists and writes nothing. Preview/refusal performs no touch. Existing WPS unit, allowance and allowanceRevision remain untouched. Retirement writes only its immutable marker after a strict unbound check; it performs no definition/cache/value touch.

The memory Source clones its entire graph once, preserving shared table aliases. The retirement map belongs to that same staged graph and complete commit publication. Neither per-field clone reconstruction nor an old Step DTO shadow supplies current retirement or package values. SQL fixture acquisition uses the authentic private117 transition followed by ordinary118/119 folders and their full applied name/hash ledger. Genuine merged-history tests keep the original117 artifact and apply later additive folders normally.

Native119 guards require same-organization physical identity, an existing audit user, no active binding, immutable markers and no implicit binding reactivation. Its paired down refuses any recorded retirement before schema or ledger change; an empty marker relation can be reversed without deleting definitions/WPS. No117/applied SQL is edited.

This private source cohort does not certify mixed-version deployment. Additive staging alone cannot teach already-running older readers to hide retirement markers. Retirement activation requires the explicit rollout/drain/current-profile boundary from SC25; no host/session authority is invented by a lower store or fixture. Exact retired-code import/replay refusal, migration-guard omission proofs, active-corruption variants and current-profile rollout owners remain separate verification obligations. Physical namespace uniqueness already keeps retired names/codes reserved; active catalogue DTOs do not expose a retired record as an unknown-code substitute.

Project usage browsing is distinct from a single-binding unbind preview: redundant inherited bindings do not hide existing usage. A required internal catalogue read captures all actual organization package/type/definition/fact evidence on its current owner, including both external endpoints. The existing pure protected-pair projector validates that complete evidence and compares against removal of all bindings naming the requested step. A final explicit selection retains only the actual addressed project's currently readable packages and the selected step before computing count/order/the200pair cap. Private child names and counts follow the existing project reader's visibility policy. Mutating unbind safety retains its complete protected census. Missing/foreign/unreachable step ids answer404 after same-owner project admission; project-shell403, hidden404 and query400 match project steps. No writes, revisions or notifications follow a usage read.

SC22 wire details, settled under standing authorization: the project step manifest is `{version:1,project:{id,revision},default:[code,...],types:[{workItemTypeId,codes:[code,...]},...]}`. Type entries enumerate every actual organization-owned type, in binary ID order, even without a type-specific binding. Work-item types have stable IDs and display names, not a separate code; type mapping addresses therefore use IDs. The array keeps a legitimate type ID `default` distinct from the untyped default mapping. Codes retain SC18 resolution order and may be empty. Foreign types and sibling-only bindings never appear. Project.read alone permits this applicability metadata; package private fields, units, allowances and names are absent. Revision, actual project chain, current type ownership and bindings must come from the same admitted owner, including empty projects. No package or values are invented, and the read advances no revision or announcements. Burokrat's offline consumer and revision-naming binding format remain required by task2.3; this API wire refinement does not complete that task.

SC22 revision completeness also includes organization work-item type membership. A successful scoped creation/removal that changes the actual owned type set advances every actual project in that organization once, including empty projects, inside the same writer. Idempotent creation, refusals and rollbacks do not advance revisions; foreign projects and explicit package values remain unchanged. This is required because the manifest enumerates every owned type, even without typed bindings. The existing directory write path currently lacks this invalidation; a mounted directory-command regression must fail before the implementation is changed. The offline Burokrat consumer remains required after this producer invariant is established.

The type-set invalidation joins the directory writer at its actual ownership transition: `mapInOrganization` now requires the original write stamp and atomically writes a type mapping plus each actual organization's project revision. Non-type mappings preserve revisions. Type deletion captures its actual mapping before removal and advances those projects inside its existing transaction only after successful removal; explicitly unowned legacy roots retain legacy behavior. The shared target capture includes empty projects and excludes foreign organizations; no global catalogue activation or package mutation is needed merely to advance these project tokens. Standalone forwarding retains the stamp before any queued owner.

### SC22 offline consumer format and compatibility

Under standing authorization, extend the existing offline validation flow with `validate workflow-binding <file> --manifest <file>`. Preserve the strict version1 binding, `--steps` grammar, acceptance schema1 reader and existing digest bytes. The manifest consumer uses a distinct version2 binding: `{version:2,project:{id,revision},default:[{code,class}],types:[{workItemTypeId,steps:[{code,class}]}],classes:{...}}`. Stable IDs and codes are nonempty strings; arrays allow valid IDs such as default, constructor and whitespace without treating them as object properties. Duplicate type IDs or codes refuse before lookup. Classes retain existing strict executor/model/path validation; an empty class dictionary is valid only when no mapped class is needed.

The manifest is strict JSON matching the producer version1 wire. Default mapping must cover exactly its untyped codes. Every actual owned type uses its entire explicit mapping or the entire default mapping, checked against that type alone; never fill an incomplete explicit mapping from default. Unknown binding types and dangling classes refuse. Compare both exact project ID and safe nonnegative revision before coverage. Empty manifests/mappings are valid. Missing and unreadable manifest files remain distinct, nonregular files refuse before opening, malformed UTF-8/JSON/schema refuse, and no network is used. Binding YAML/prompt containment/UTF-8/original-byte rules remain unchanged.

Type entry order and binding mapping presentation order are nonsemantic and canonicalize in binary UTF-8 order. Manifest code order is SC18 behavior and remains ordered. A separate schema2 acceptance snapshots the canonical binding, canonical manifest, manifest digest and original prompt byte descriptors; its digest includes all of them. The old schema1 acceptance reader and RunStore behavior remain strict and unchanged. A distinct schema2 reader validates descriptor coverage and recomputes the manifest digest before reconstructing acceptance. This introduces no runtime execution authority. Shared class/prompt decoding is reused with unchanged version1 behavior; no synthetic type/code mapping is introduced to bypass the legacy checker.

Tests first exercise the actual exported command helper, typed/default/literal-default coverage, project/revision mismatch, empty mappings, real file permission failures, prompt-byte and manifest-content digest changes, and presentation invariance. Then add strict decoder/acceptance cases and actual Burokrat/PUNI grammar integration. Required negatives independently omit type checking, project/revision equality, exact coverage, uniqueness, descriptor and digest checks, plus changed shared boundaries. Astra follow-up remains required and currently unavailable; no parent task is closed by this design refinement.

## Current claim observations

Current claim observations apply SC18 to each leaf. The internal observation must carry a required map of ordered resolved step IDs for every actual leaf, including an explicit empty list for zero-step leaves. Package-union IDs may remain compatibility metadata, but `findWorkPackageClaims` sorts step claims by their own leaf's map and never falls back to the union. Tree order and nullable subtree claims before step claims remain; published claim payloads and stored claim bytes/stamps do not change. A missing map entry, unresolved point claim, missing explicit values or broken ancestry is corrupt trusted state. Capture current chains, bindings, direct types and values synchronously under the existing observation owner after its access recheck; an asynchronous catalogue-port reentry cannot stand in for that snapshot. Memory uses its actual captured state maps. Existing display fixtures must author real current definitions and bindings, rather than manufacturing metadata around obsolete local step writes. The opposing-type-order and absence controls in task1.6.1 precede implementation.

### Settings owners — 2026-11-20

The current router has SpacePage at `/spaces/$spaceId`, whose actual read distinguishes named spaces from virtual `all`. It has no project page. WorkPackageSettingsModal owns package fields and a blur/unsaved/busy model; it is not the owner of a project's scope. ProjectPicker already selects actual server-listed projects, including empty ones and list shells.

Use the existing named SpacePage for space step settings. Add `/projects/$projectId/settings` as an explicit project settings page, linked from an observed ProjectPicker selection. The route parameter is a request address: the page must read the actual project, verify returned identity/organization against the captured owner, and handle403/404 before mounting controls. A list shell or display membership role grants no write authority. Empty projects need no invented package. This is an intentional new screen after owner inventory, not a claim that a project route already existed. Package settings keep their present commit/dirty/busy behavior.

The shared definition editor creates and binds at an explicit observed organization/space/project scope with a real work-item type or every type. Global name/default edits and retirement remain on the organization screen; scoped creation cannot imply those permissions. Binding controls continue to use their actual scope and complete cross-type census. Current project resolution reads the selected actual type (or explicit untyped default), renders every matching `via`, and offers no inherited-binding mutation. Definition/binding writes trigger authoritative rereads. Each directory/project/catalogue/resolution request retains its own loading/failure and lifetime state; a changed owner retires its drafts and late callbacks. Separate directory observations can be stale, never silently every-type. Missing or contradictory owner metadata is a fault. Actual server checks remain the authority for read/write permission and protected facts.

### Browser import choice — 2026-11-21

Under standing authorization, keep the existing immediate file chooser and add an unchecked Define missing steps checkbox beside it in both the transfer menu and empty state. Capture the choice synchronously for one admitted attempt. Disable it while busy or without an actual destination project; reset after success, refusal or file failure and on project/session lifetime replacement. The server remains the permission authority: no role-derived write grant and no invented project. Forward an explicit required options object through browser API and catalog so omission cannot silently discard this choice. Preserve all existing read/parse/write/fetch/navigation/publication fences and synchronous duplicate-attempt admission. Unknown and retired code lists preserve server order and get distinct messages. Never retry automatically, opt in automatically or reactivate a retired code. A project settings permission refusal explains that requirement accurately. Tests must exercise both rendered entry points, captured options, resets, unchanged ordinary imports, refused imports and stale callback lifetimes. Native browser and host gates remain required beyond these DOM tests.

The catalog and captured publication callback own admitted IO, busy state and all publication fences. A separate choice owner adds the visible destination-project identity and retires its setters and file callbacks when that choice changes. Admission captures destination and consent once; changing only the visible destination resets future consent without cancelling the already admitted request or releasing its duplicate-read lock. Catalog/publication replacement and unmount still retire that admitted request. These are client lifetimes, not resource grants; the server's current project authority remains unchanged.

### Memory Source configuration references — 2026-11-21

Restore the already specified CapacityStore and PriorityBandStore not_found outcomes at Memory Source composition. The standalone Map fixtures intentionally hold no reference tables and retain that limited contract. The real Source has actual work-package and team maps: check them synchronously at the existing writer invocation before delegating, including null clears. An engagement project is not a work package. Public writes use their current coordinator turn and borrowed writes use their actual staged owner; do not add pre-queue asynchronous lookups or infer ownership from ids. Retire only the two configuration exclusions after real Source controls pass. The four absent-family declarations, scoped authorization, historical guarantees and full CLI goal remain separate open requirements.

The Memory space store is already installed on public and borrowed Source composition. Its absent conformance declaration is stale. Offer the existing shared round-trip case through that actual store, seeding only a real organization in the same Source tables. Do not build a parallel port or claim full membership/permission/lifetime closure from this one registration. Access decisions, live plans and package ranks remain declared absent pending separate actual capability work.

### Shared current import Source contracts — 2026-11-21

The shared current import cohort predates SC24 and frequently requests new definitions while omitting consent; some preservation assertions even pass after a refused import. Require actual successful imports for those assertions and keep separate real omitted/false refusal cases. Every creation scenario supplies explicit defineMissing true at its call site; never default the test factory or production importer to authoring. Preserve actual legacy/preactivation authority rather than inventing current user grants. Hold the actual createWithSteps operation and settle test-owned admission/publication actors before closing their Source. Multiple imports in one scenario reuse the actual feature clock. Assert global definition reuse, current resolved order and explicit package values rather than package-local step identities or incidental position spacing. Old authored archives and genuine historical producers stay unchanged. SQL setup must use the real report/apply and current migration path, not ad hoc schema or a migration bypass. All broader protected-history, source ownership, caller permission and CLI requirements remain open.

The shared Source contract supplies two explicit real project identities: destination and holding project. Existing definitions use global catalogue operations, and the holding package is born through createWithSteps. The import must reuse held codes while preserving the original package rows, explicit values and definition metadata. A factor-only scenario populates the catalogue before its observation so legitimate binding revision changes cannot masquerade as inherited-setting writes. Memory ownership is part of the complete transaction publication, and detached local exports carry actual resolved tree rows rather than an absent per-leaf inventory.

### Current Memory safety fixtures — 2026-11-21

A current test must reach the boundary it claims. Catalogue definitions are organization identities, so distinct package applicability is established through real project bindings and current package birth. Ordinary successful point writes are asserted before read controls. Invalid persisted values are injected only through the existing fixture corruption owner and restored before any Source closes; this supplies no authoring permission or historical migration provenance. All targeted rejection assertions settle their actual promises. Empty organization metadata may be refused by the earlier birth boundary; retain a separate existing-package capture control rather than forcing malformed current creation to succeed. Current queued creation expects inherited catalogue steps, while the legacy starting-step arguments remain compatibility inputs. Keep standalone legacy cascade coverage distinct from actual Source unbind preview/apply and retirement tests. Value1 parallelism is still a protected fact. The final subtree fault uses a real package, resolved step and stored estimate so its missing-dependency negative reaches the actual staged writer. These fixture repairs do not choose a policy for any of the fifteen genuine historical scenarios.

### Genuine move replay clocks — 2026-11-21

The actual predecessor `set_progress` recipe carries state and intentionally omits `statedAt`: replay says the statement again at its current audit stamp. The two genuine standalone move fixtures therefore retain the moving row's original time11 while destination progress restored by the recipe receives1000, then1002 on a later undo. Exact blockage replacement timestamps remain part of their separate sparse-fact recipe. Do not invent absent old timestamp metadata or reject a lawful state-only recipe for omitting it. Migration compares original journal/event bodies and full ledgers; the physical project-to-package header rename is explicit rather than treated as frozen body mutation. A native current stored-point fault preserves row revisions to isolate the recorded progress snapshot comparison. Its restoration permits a healthy redo. Such current faults are test controls over genuinely produced history, never substitutes for its producer or migration admission. Other original parent-progress, hand-up and laundering guarantees remain separate.

### Genuine historical refusal owners — 2026-11-21

Predecessor facts must reach current readers through the actual catalogue migration path before testing replay. A former parent that is now a leaf can retain its original statement; undo that would make it a parent again is subject to the current protected-pair refusal. A database with live parent progress still present is refused by the migration report. Neither case permits a new ordinary parent-point write. Genuine state/time/extra/missing and hand-up histories currently reach the existing revision-stale check before their late snapshot/prelude guards. Test the exact stale diagnostic, complete fact preservation, borrowed rollback and normal runner stale-entry repair, but do not infer an independent late-guard proof from that earlier refusal. Captured old Memory laundering journals reach a checkpoint their old SQLite counterparts do not; keep that provenance distinction and do not invent a SQLite checkpoint or historical event rows to make a current test pass. Current rollback tests use a separately lawful empty destination and assert that the later command actually ran.

### Genuine Memory journal fixture owner — 2026-11-21

The predecessor Memory capture must include its actual account, scoped package metadata, published steps, explicit units/allowances/revisions, priority/timezone, rows, point facts, journals and stored plan events. Its archive decoder accepts only the recorded schema and supported complete arrangements. Current metadata and lawful leaf facts are materialized through the actual Source and compared with that capture before loading history. A fixture-only serialized restore then publishes a staged copy of the original journal/event rows, preserving sequence, undone flags and all opaque body values; only the explicit project-to-work-package header is normalized. It checks current package/scope identity and refuses an existing target history. It retains queued input, respects Source closure and exposes the existing late journal-write seam before publication, so a late failure leaves all state exact. This is physical fixture state, alongside existing fixture corruption owners: no repository method is overridden, no fake PlanEvent is supplied to append, and no current parent point is authored. Actual current undo/redo and readers provide the behavioral evidence. General runtime checkpoint restore, SQLite admission, other historical matrices and requested Astra review remain separate requirements.

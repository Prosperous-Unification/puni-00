# design — `add-work-item-statuses`

Rationale for storing holds beside readiness, removing held input and keeping blocked in the
schedule lives in [ADR 0032](../../../docs/adr/0032-a-hold-leaves-the-plan-blocked-is-a-reading.md).
This file is the shape.

## Allocated numbers (checked 2026-09-28)

| What                                      | Value                                       | Checked against                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN_DOCUMENT_VERSION`                   | 6                                           | main and `batch-9/integration-25` hold 4; typed dependency stage B (`batch-9/010-4-7-step-deps-b-commands`, `-ui`, #183) takes 5                          |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION`     | 4                                           | 3 on main, `integration-25`, every stage B branch and `010-5-2-orgs-36`                                                                                   |
| Migration stamp                           | `20260928200000_add_work_item_status_facts` | newest on main, `integration-25` and `010-5-2-orgs-36` is `20260928030000`; the orgs stack reserves `20260928040000` onward. Recheck the queue at slice 3 |
| ADR                                       | 0032                                        | `adr-index.test.ts` requires contiguous numbers; `feat/puni-website-funnel` (unmerged) also holds a 0032, so whichever lands second renumbers             |
| `SCHEDULER_CONTRACT_VERSION`, solver wire | unchanged                                   | the input is smaller, never differently shaped                                                                                                            |

## D1 — Vocabulary in `@wbs/domain/progress`

`WorkItemStatus` widens to eight words. New closed sets `READINESSES` (`draft`, `ready`) and
`HOLDS` (`on_hold`, `blocked`) with `isReadiness` and `isHold` boundary guards;
`SETTABLE_STATUSES` becomes the seven words the menu offers, in menu order, in slice 3, when
they can be stored. `agree` and `statusOf` stay as the step-progress fold only and return
`ProgressStatus` (`unknown | StepState`); core's roll-up and fe-01's wire type use it until the
work item contract widens in slices 3 and 6, so a reader cannot meet a status its `Record`
cannot name.

## D2 — Leaf fold, proxy and parent fold

- `leafStatusOf({ progress, hold, readiness })` answers everything but the proxy: progress
  `done`, then hold, then progress `in_progress`, then readiness, else `unknown`.
- `blockedByProxyOf(index, dependencies, leafStatuses)` returns the leaf statuses with the
  proxy applied. **Deviation from the memo's "one topological pass":** typed dependency stage A allows a
  step-node DAG whose work items appear cyclic (`add-step-finish-start-dependencies`), so the
  leaf graph may hold a cycle. The derivation is a breadth-first spread from every `on_hold` or `blocked`
  leaf through leaves reading `unknown`, `draft` or `ready`; each leaf is visited once, so a
  cycle terminates. Predecessors come from legacy edges and from every typed endpoint scope
  expanded to leaves.
- `foldStatuses(children)` is the parent rule in the spec. Every clause is an all or any
  predicate over a class that each child's own fold preserves, which is what makes it
  partition-consistent; the property test states that directly.

## D3 — Hold reduction

`withoutHeldSubtrees(input: ScheduleInput, heldLeafIds)` in `@wbs/domain` returns a smaller
`ScheduleInput`: rows minus held leaves and ancestors all of whose leaves are held; their
slices; legacy edges and typed dependencies with either endpoint's work item removed; their
`notBefore` and `deadlines` entries. A typed or legacy endpoint on a partly held parent stays
and expands to the unheld leaves. Slice 4 applies it in `canonicalScheduleParts`, the one seam
Fast, the solver request builder and saved-plan schedules share.

## D4 — Storage, command, contracts (slices 3 and 5)

As the ADR and spec state: two nullable CHECKed columns, vocabularies in
`stored-vocabularies.ts`; `setStatus` widened with a verbatim journal inverse; read shape adds
`readiness`, `hold`, `schedule: Scheduled | null`; plan document v6 and saved-plan schema 4 with
`[3, withNoHolds]` in `PLAN_INPUT_UPGRADES`; rollback CLI `work-item-hold-rollback-cli.ts
save|remove|restore`; the swap's `relationship-types` step generalises to a stored-vocabularies
step reading `supported-vocabularies-cli.ts`.

## Settled by the design authority for slice 3 (Fable review, 2026-09-28)

The three `in_progress` cases are specified in `specs/wbs-domain/spec.md` under "A work item's
status is set by one act for every settable status": a parent starts one leaf and clears only
its hold, a done leaf reopens its last step, and a project with no steps refuses `409
no_steps` for `in_progress` and, new in slice 3, for `done`. On a parent reading done, the
parent's own fact end (filled by today's `setStatus done`) is cleared with its first leaf's.

## Open after the slice 3 review

All three findings trace to one rule: the tree read throws when a parent holds a readiness or hold. Two paths can still leave one there:

- **Critical 1.** An undo can restore a statement on a row that has since gained a child.
- **Important 3.** An older image can create or move a child under a ready leaf.

The options, for the design authority:

- **A. Keep the invariant strict.** The read refuses a parent with statements. Undo and redo validate the replayed tree and refuse `stale_undo`. The swap guard also compares stored readiness on parents.
- **B. Make parent statements dormant.** The read ignores readiness and hold on a row with children. Writers still clear or hand them down, and they return when the row is a leaf again. An older writer and an undo can then no longer break a read. This loosens "never stored on a parent" into "never read on a parent".
- **C. Render a query-failure state instead of throwing.** Parent statements stay invalid, but the plan cannot be opened until an operator repairs it.

**Important 4** is separate. The post-stop recheck of every stored vocabulary refuses only after routing has moved to green; #179's relationship-type guard shares this limitation. Fencing writers across the final comparison would fix both.

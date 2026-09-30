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
`[3, withNoStatusFacts]` in `PLAN_INPUT_UPGRADES`; rollback CLI `work-item-status-facts-rollback-cli.ts
save|remove|restore`; the swap's `relationship-types` step generalises to a stored-vocabularies
step reading `supported-vocabularies-cli.ts`.

## Settled by the design authority for slice 3 (Fable review, 2026-09-28)

The three `in_progress` cases are specified in `specs/wbs-domain/spec.md` under "A work item's
status is set by one act for every settable status": a parent starts one leaf and clears only
its hold, a done leaf reopens its last step, and a project with no steps refuses `409
no_steps` for `in_progress` and, new in slice 3, for `done`. On a parent reading done, the
parent's own fact end (filled by today's `setStatus done`) is cleared with its first leaf's.

## Decided after the slice 3 review (Fable, 2026-09-29)

- **A parent never holds a statement, enforced at the write (option A).**
  - `apply`'s `patch` arm refuses a non-null readiness or hold on a row that has children. A stale undo or redo is therefore refused, not replayed.
  - `WorkItemRepository.patch` writes a statement only under `NOT EXISTS (child)` in the same `UPDATE`, and answers `has_children`. A live `setStatus` racing a first child cannot produce the state either.
  - The plan read keeps throwing on a parent with a statement.
- **A move's inverse moves back first, then restores the statements.** The row a moved row came from is a leaf again only after the move-back.
- **Readiness joins the swap guard.** The swap compares readiness as it compares holds, through a `readiness-kinds-cli.ts` beside `hold-kinds-cli.ts`. The rollback save file carries both columns, so a code rollback with readiness stored saves and removes it first. `down.sql` still guards holds only; readiness is dropped as fact dates are.
- **Accepted as is:**
  - The post-stop recheck refuses only after routing has moved (#179's limitation, shared by every stored vocabulary).
  - Holding a parent takes the hold off its done leaves.
- **Delivery.** Slices 3 and 6 need not ship together. Slice 4 ships with the fe-01 reader of `schedule: null`.

## Decided at the slice 6 review (Fable, 2026-09-29)

- **The row's own status takes precedence over "would change nothing".** A row is never offered
  the status it reads, even where the write would still change something beneath it: a parent
  reading `on_hold` is not offered On hold although one of its leaves is `blocked`. Accepted.
- **Blocked by proxy is muted in chroma, not lightness.** Its light token is L 0.55, 5.07:1
  against white; L 0.72 was 2.57:1.

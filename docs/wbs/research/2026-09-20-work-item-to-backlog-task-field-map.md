# K4 field map: WBS work item/step to Backlog.md task (E7)

Status: desk research plus experiment E7 of `docs/superpowers/plans/2026-09-20-wbs-backlog-md-kanban-research.md`
(work item K4), 2026-09-20. WBS field shapes are read from source in
this repository (file and line cited; the store ports are under `libs/wbs/application/core/src/ports` and the domain types under `libs/wbs/domain/domain/src`). Backlog.md facts marked "observed" come
from `docs/wbs/research/2026-09-20-backlog-md-observed.md` (E1/E5/E6/E8, binary
1.52.0). Facts marked "tested here" are new CLI runs against a scratch
`backlog.md@1.52.0` project (parent/subtask, milestone, dependency, custom
status, label survival), not previously recorded. Facts marked "plan" are
unverified, from the CLI's own `--help` text only.

## 1. WBS field to Backlog.md field

| WBS field                                                                                                                   | Backlog task field                                                                 | Fidelity                   | Evidence                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkItem.id` (work-item-store.ts:6)                                                                                        | none native; a `labels` entry can carry it                                         | lossy                      | tested here: a `wbs:<uuid>` label survives a CLI edit; see §5                                                                                                                                                                          |
| `WorkItem.parentId` (work-item-store.ts:8)                                                                                  | `parent_task_id` / `--parent`                                                      | exact, to unverified depth | tested here: `task-2.1.1` created as a subtask of a subtask; arbitrary nesting appears to work                                                                                                                                         |
| `WorkItem.position` (work-item-store.ts:9)                                                                                  | `ordinal`                                                                          | lossy                      | Backlog assigns ordinal in creation-order steps of 1000 (observed); WBS position uses steps of 10 (`STEP_POSITION_STEP`, step.ts:7) and both are re-padded, not identical semantics                                                    |
| `WorkItem.name` (work-item-store.ts:10)                                                                                     | `title`                                                                            | exact                      | observed                                                                                                                                                                                                                               |
| `WorkItem.notes` (work-item-store.ts:11)                                                                                    | `description`                                                                      | exact for plain text       | observed; body is Markdown with `SECTION:DESCRIPTION` HTML-comment fences, not just a string                                                                                                                                           |
| `WorkItem.frozenNumber` (work-item-store.ts:12)                                                                             | none                                                                               | none                       | Backlog's own `id` is derived from live parent structure, not a frozen historical label                                                                                                                                                |
| `startNoEarlierThan` + `...Reason` (work-item-store.ts:14,23)                                                               | none                                                                               | none                       | no floor-date field in the observed `Task` type                                                                                                                                                                                        |
| `deadline` (work-item-store.ts:32)                                                                                          | `dueDate`                                                                          | lossy                      | Backlog's `dueDate` is a single date with no reason field, and nothing says whether it is a floor, a ceiling, or a promise the way WBS's `deadline` is documented (CONTEXT.md)                                                         |
| `factStart` / `factEnd` (work-item-store.ts:40,48; ADR 0024)                                                                | none                                                                               | none                       | no actual-start/actual-end field observed; `createdDate`/`updatedDate` are write-time stamps, not stated facts, and are minute-grained (observed) vs WBS's date-only but planner-typed fact                                            |
| `priority` (work-item-store.ts:57, integer, unbounded, band-named)                                                          | `priority` (`--priority`, one of configured `priorities`, default High/Medium/Low) | lossy                      | observed config table; a closed 3-label set cannot hold an unbounded integer with 5 renamable bands (CONTEXT.md "Priority band")                                                                                                       |
| `serviceId` (work-item-store.ts:77, one of, global directory)                                                               | `project` (`--project`, one of configured `projects`)                              | lossy                      | both are a single closed-set label per item, but vocab and semantics differ (component label vs. delivering service)                                                                                                                   |
| `serviceTeamId` (work-item-store.ts:59)                                                                                     | none                                                                               | none                       | no team/capacity concept in Backlog's config keys                                                                                                                                                                                      |
| `maxParallel` (work-item-store.ts:86)                                                                                       | none                                                                               | none                       | no field found                                                                                                                                                                                                                         |
| `revision` (work-item-store.ts:92)                                                                                          | none                                                                               | none                       | Backlog has no per-task write counter; concurrent CLI writes are last-writer-wins with no version check (observed E8)                                                                                                                  |
| `tagIds` (work-item-store.ts:126, inherits, unioned)                                                                        | `labels`                                                                           | lossy                      | Backlog labels are flat strings with no inheritance; WBS's effective-tag union down the tree has no counterpart                                                                                                                        |
| `typeIds` (work-item-store.ts:160, 0..n, never inherits)                                                                    | `type` (single value, configured closed set)                                       | lossy                      | WBS allows several types per item; Backlog's `type` is one value                                                                                                                                                                       |
| `externalRefs` (work-item-store.ts:172, id+systemId+url+name)                                                               | `references[]` (`--ref`, URL or file path)                                         | lossy                      | Backlog references are bare strings; WBS's structured system id and display name are dropped                                                                                                                                           |
| `Step` (step-store.ts:7-15, per-project, named, ordered)                                                                    | none as a first-class entity                                                       | none                       | a Backlog task has no sub-unit; see §4                                                                                                                                                                                                 |
| `ThreePointEstimate` (estimate.ts:29-32, per work item per step)                                                            | none                                                                               | none                       | no estimate/points/effort field in the observed `Task` type                                                                                                                                                                            |
| `StoredProgress.state` (progress-store.ts:13-19, `in_progress`/`done`, per step)                                            | `status` (one of configured `statuses`, per task)                                  | lossy unless card = slice  | one flat status per task vs. WBS's per-step statement; see §4                                                                                                                                                                          |
| `StoredMeasure` (measure-store.ts:15-23: token_estimate/token_actual/hours_actual, per step)                                | none                                                                               | none                       | no numeric-figure field beyond dates and priority                                                                                                                                                                                      |
| `Assignment` (directory-store.ts:114-118, workItemId+stepId+personId)                                                       | `assignees[]` (flat list per task)                                                 | lossy unless card = slice  | Backlog cannot scope an assignee to one step of a task                                                                                                                                                                                 |
| `Dependency` (dependency-store.ts:4-9, predecessorId/successorId, either end may be a parent meaning every leaf beneath it) | `dependencies[]` (task id to task id)                                              | lossy                      | Backlog's edge is task-to-task with `isReady`/`blockingDependencies` computed (tested here); it has no `DependencyReach` (whole-item vs anchor-slice, ADR-cited in CONTEXT.md) to say which of a parent's leaves the wait is really on |
| `PersonKind` (stored-vocabularies.ts:59, person/agent, global directory)                                                    | none                                                                               | none                       | Backlog assignees are free-text `@name` strings with no directory and no kind                                                                                                                                                          |
| `SavedPlanRow` (saved-plan-store.ts:2-17, immutable hashed whole-project snapshot)                                          | none                                                                               | none                       | no per-project snapshot/versioning feature in Backlog itself; the tasks directory's own git history is the nearest analogue and was not tested here                                                                                    |

## 2. Backlog.md field to WBS field

| Backlog field                                                                                                                                    | WBS field                                        | Fidelity                   | Evidence                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `title`                                                                                                                                    | `WorkItem.id`, `.name`                           | exact                      | as above                                                                                                                                                                                                                                              |
| `status`                                                                                                                                         | `StepState`/`WorkItemStatus` (progress.ts:38,52) | lossy unless card = slice  | one column, no per-step split                                                                                                                                                                                                                         |
| `assignees[]`                                                                                                                                    | `Assignment.personId`                            | lossy unless card = slice  | no step scoping; also no `PersonKind`                                                                                                                                                                                                                 |
| `labels`                                                                                                                                         | `tagIds`, or a smuggled `WorkItem.id`            | lossy / carrier            | tags don't inherit the way `labels` don't either, so this is actually the closest structural match; also the one place an id can ride (§5)                                                                                                            |
| `milestone`                                                                                                                                      | none                                             | none                       | tested here: `milestone add`/`task edit -m` works; WBS has no milestone entity in the files read                                                                                                                                                      |
| `parent_task_id` / `subtasks[]`                                                                                                                  | `WorkItem.parentId`                              | exact, to unverified depth | tested here                                                                                                                                                                                                                                           |
| `dependencies[]`, `dependencyGraph`, `readiness.isBlocked/blockingDependencies`                                                                  | `StoredDependency`                               | lossy                      | tested here (`task <id> --json` on a 2-task chain): Backlog computes a blocked flag per task, which is richer than WBS's raw edge list for a board's "blocked badge" (research question 9 in the sibling plan), but still task-level, not reach-aware |
| `priority`                                                                                                                                       | `WorkItem.priority`                              | lossy                      | 3-value closed set vs. unbounded integer                                                                                                                                                                                                              |
| `ordinal`                                                                                                                                        | `WorkItem.position`                              | lossy                      | different step sizes, see §1                                                                                                                                                                                                                          |
| `type`                                                                                                                                           | `typeIds` (single-valued only)                   | lossy                      | see §1                                                                                                                                                                                                                                                |
| `project`                                                                                                                                        | `serviceId`                                      | lossy                      | see §1                                                                                                                                                                                                                                                |
| `dueDate`                                                                                                                                        | `deadline`                                       | lossy                      | see §1                                                                                                                                                                                                                                                |
| `description`, `acceptanceCriteriaItems[]`, `definitionOfDoneItems[]`, `implementationPlan`, `implementationNotes`, `finalSummary`, `comments[]` | `WorkItem.notes` (only)                          | lossy                      | Backlog has several free-text bodies; WBS has one `notes` string                                                                                                                                                                                      |
| `createdDate`/`updatedDate` (minute-grained, observed)                                                                                           | none read by any WBS field                       | none                       | no per-item audit timestamp in the ports read                                                                                                                                                                                                         |
| `branch`, `source`, `modifiedFiles[]`, `reporter`                                                                                                | none                                             | none                       | no counterpart found                                                                                                                                                                                                                                  |

## 3. Lossy sets and the worked example's round trip

**Lost going WBS to Backlog** (unconditionally, regardless of card unit): frozen
number, start-no-earlier-than and its reason, fact start/end, service team,
max parallel, revision, the three-point estimate itself, every measure
(`token_estimate`/`token_actual`/`hours_actual`), person kind, dependency
reach, the saved-plan snapshot.

**Lost going Backlog to WBS**: milestone, most of the free-text bodies beyond
one `notes` string, branch/source/modifiedFiles/reporter, and the
minute-grained timestamps (already known coarser than what the sibling
agentic-planning research asks of WBS instants — `2026-09-20-backlog-md-observed.md`).

**Worked example**, from the commands that scheduled the agentic planning research in the
development WBS on 2026-09-20 (kept beside the planning files): work items `R1` ("Desk research: step
graphs, kinds, gates, loops"), `R5` ("Model experiment: step graph into slice
edges...", depends on `R1`), `R9` ("Design interview, glossary and ADRs...",
depends on `R3`, `R6`, `R6b`), `R10` ("OpenSpec changes and packet-ready task
lists...", depends on `R7`, `R8`, `R9`) — all children of one parent
`wbsagentic`, each holding one `ThreePointEstimate` in days and one
`token_estimate` measure on its implementation step.

Round trip WBS -> Backlog -> WBS for these four: name, parent/child shape and
the dependency edges (`R5`<-`R1`; `R9`<-`R3`,`R6`,`R6b`; `R10`<-`R7`,`R8`,`R9`)
come back unchanged. The three-point estimate (0.5/1/2 days for `R1`, up to
1/2/4 for `R10`) and every `token_estimate` measure do not survive the trip at
all — there is nowhere to put them in a Backlog task, so a Backlog-native edit
of any of these four items silently strips the numbers a Twilight Structure
planner used to schedule and cost them. This confirms the plan document's
"lossy set... includes estimates" branch of E7's pass condition.

## 4. The card-unit question (K7 input)

**Card = work item.** Status, assignee and dependency all land on one Backlog
task per WBS work item, matching §§1-2 above one-for-one for those three
fields. But every per-step fact (progress, estimate, measure, assignment) must
be flattened onto that one task or dropped — there is no field to hold "Plan:
done, Impl: in progress" on one card. This is a full loss of per-step status,
which is exactly what the owner wants a board for (theme P, "a status for
every step", and theme S's agent/human step kinds — `docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`).

**Card = slice** (`CONTEXT.md`'s "Slice": one leaf work item's work for one
step). Each WBS step of each leaf becomes its own Backlog task. `status` and
`assignees[]` now map exactly, one WBS step statement to one Backlog task
(§§1-2, no longer "unless card = slice"). Backlog's `type` field, otherwise a
poor fit for `typeIds`, becomes available to carry a step's agent/human kind
(theme S2) since it is now per-step. Dependencies improve too: the WBS
scheduler already chains a leaf's own steps unconditionally in step order
(`slice-edges.ts`, `sliceEdgesOf`, cited in the sibling plan's "What exists
today" table), which is precisely Backlog's flat task-to-task `dependencies[]`
shape — so a slice card's own step-chain edges need no `DependencyReach`
decision at all, only cross-item edges still do. The cost: a three-step work
item becomes three Backlog tasks that did not natively exist as separate
things, needing an invented grouping (tested here: a parent task per work item
with one subtask per step works mechanically) and each slice card now needs
its own smuggled identifier (`wbs:<workItemId>:<stepId>`, not just
`wbs:<workItemId>`), doubling the addressing problem in §5.

## 5. Where a WBS identifier can durably live

Tested here, not guessed. A CLI edit of an unrelated field (`priority`)
strips a hand-added unknown top-level front-matter key (`wbs_id: <uuid>`) —
reproducing `2026-09-20-backlog-md-observed.md`'s E6 exactly. But the same
edit leaves a `labels` array entry untouched: a task created with
`-l "wbs:<uuid>"` still carries that label after `backlog task edit ... -s
"In Progress"` and after `--priority low`. `labels` is a field Backlog's
serializer knows and writes back, so anything living inside a known field
survives; anything living in a field the serializer does not know does not.
A `wbs:<id>` label convention is therefore the one durable carrier found for
a Twilight Structure identifier on a Backlog task — confirming the plan
document's existing decision to keep the real extension data in a separate
versioned file under `wbs/`, and using the label only as an address back to
it, not as the data itself.

## 6. Recommendation (judgement, not evidence)

On this evidence, Backlog.md can be **projection/export at the work-item
grain, not storage, for the WBS's own planning data** — the same conclusion
`docs/superpowers/plans/2026-09-20-wbs-backlog-md-kanban-research.md` already
reached about the board and, independently, what `docs/twilight-structure/client-repositories.md`'s
storage-ownership line already assumes: native fields stay native, WBS's own
model lives in an extension file. §1 shows nothing about a three-point
estimate, a measure, a fact date or a dependency reach can be written into a
Backlog task without inventing a place for it Backlog's serializer will keep;
§5 shows even a bare identifier needs the one durable field (`labels`) rather
than an obvious one (a custom key). Backlog.md is strong as a _board and CLI
projection_ of whatever the WBS already computed — its dependency/readiness
computation (§2) is genuinely more useful there than raw edges — but weak as
the record of estimates, measures or per-step status themselves. Card = slice
is the more faithful projection for a board that wants per-step status, at
the cost of one more layer of invented structure (a shell task per work item)
that Backlog does not model natively.

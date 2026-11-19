## Context

The current `StepBoardView` projects one delivered tree with `projectStepBoard`; the mounted Plan and Board share a selected `ProjectRuntime`. The complete six-requirement read-only Board capability was synced into `openspec/specs/step-progress-board` at baseline SHA-256 `e32ec62062aa1bcbc753e998499f334f0cd2c09e866c02123ae86010fa43e437`. This descendant's delta is now synced into that main capability: five predecessor requirements remain unchanged, the interaction requirement is renamed and replaced, and four writable requirements are added. The main spec has ten requirements. The predecessor change remains open with historical unchecked acceptance; its old no-write-on-deliberate-drag interaction text is superseded by this descendant, not retroactively passed.

The backend already accepts `setProgress` and `clearProgress` through the project commands batch route, validates and journals them, and supplies undo/redo. The FE `ProjectApi` and `createPlanCommands` surfaces now forward these existing command kinds in completed facade tasks 1.1–1.2.

## Goals / Non-Goals

**Goals:** One card gesture writes the existing leaf step node's progress through the selected runtime's writer; preserve delivered card authority, Plan drafts, refusals and undo. Offer a keyboard/touch control with the same action.

**Non-Goals:** New persistence or wire command, direct status/attempt/reading writes, cross-source precedence, configurable workflow, Board-local undo, offline replay and forward compare-and-swap. Server-derived status and node readings still recompute and their delivered labels render.

## Decisions

1. Add typed `ProjectApi.setProgress(workItemId, stepId, state)` and `clearProgress(workItemId, stepId)` and forward them through `WORK_ITEM_COMMAND_ROUTES` and `createPlanCommands`. Use the existing `onRow`/batch-of-one path, including its typed refusal transport. No endpoint or shared command schema changes.
2. Keep projection pure. `ProjectViews`, mounted for one selected runtime across Plan/Board switches, constructs one framework-free `step-board-action.ts` object. `StepBoardView` renders its stable snapshot and subscribes only while mounted. No global cache, runtime service, second feed, timer or disposed-effect flag is needed. The action's own tagged state is the synchronous Board admission authority; the shared boolean busy store is advisory only and cannot release a Board request. Leaving Board cancels only an unsent gesture; an admitted request remains pending until its writer promise and covering reread settle.
3. Capture the current runtime, work-item and step IDs, and observed progress (null for no statement). A reusable validator checks `isCurrent`, usable latest tree, surviving leaf and step membership, and unchanged progress at admission **and inside the real writer callback immediately before `write.perform`**. `commandsIssued` can synchronously retire the owner or deliver a peer update between those checks. Rename or unrelated delivery does not invalidate the pair. Same-column, cancelled and outside targets send nothing; external drag text never names an identity. A pending Board move blocks a second Board move to any target, including across Board remount. An already-issued Plan write is not blocked merely because busy is true.
   Entry refusal occurs before `writer.run` publishes `commandsIssued` or pending, so it does not disturb Plan focus. The callback validation is distinct: it prevents a request after that synchronous notification changes the owner or delivered progress. A typed captured card may also be presented against a current runtime whose first tree has not arrived; that absent tree is refused. A feed delivery with `tree:null` after an installed tree retains the prior tree and is not the absent case.
4. Use `project.writer.run` and `write.perform(['tree'], ...)`, then the existing command facade. Keep the card in the delivered column until a covering read installs a new tree. Release Board pending only in `finally` for its own writer promise, never on view cleanup, busy lowering, tree delivery or another gesture. Current writer recovery handles typed or ambiguous refusal; a failed covering read retains last delivered cards with a stale warning and read-only Retry. A disconnected socket alone is a warning, not an offline queue.
5. Reuse the hidden Plan's existing `project.refusals` subscription and `ProjectPage` toast stack. Do not subscribe a second time in Board. Count actual toast-sink invocations as well as visible toasts in tests: the stack deduplicates by kind/text, so one visible toast alone cannot prove one subscriber. Return to Plan for its existing undo/redo; hidden Plan shortcuts remain disabled on Board.
6. The selected runtime passes a required action to Board. Card target buttons include number, title and step in their accessible names; clearing progress is named explicitly. Native drag begins only on a local card surface and retains the captured card in the action; column drop chooses a target, while dragend, Escape, an outside drop and leaving Board cancel only an unsent capture. External transfer text is never an identity source. A successful delivered move restores focus to the corresponding card only while Board and its original focused surface remain active. Pending has an explicit status and never relocates a card before a delivered tree does.

## Risks / Trade-offs

The command body has no expected progress or revision. The gesture check stops changes already delivered to this client; a peer write after dispatch can still race under existing server semantics. `clearProgress` also permits an absent statement, so a deletion race after dispatch can be idempotent. No contract here claims forward CAS or a new server refusal. The pending product answers can require a later revised contract but do not change this slice's existing-progress meaning.

## Migration Plan

No data migration. Integrate this delta only after reconciling the unarchived read-only Board capability into the main spec; preserve its other requirements. Runtime rollout uses the existing command endpoint and journal.

## Open Questions

The broader product interview still has two pending answers: independent progress, attempt and derived-reading facts versus configurable workflow states; explicit cross-source conflict resolution versus WBS/Backlog precedence. Neither is decided here.

The selected-runtime `ProjectViews` owns pending admission. A view-local pending guard is insufficient because `StepBoardView` unmounts on Return to Plan; shared busy is a boolean that another Plan write can lower. Test a held request across Board → Plan → Board, Plan-write overlap in both completion orders, retirement and same-project reopening, a suspended draft, and one real refusal sink call. The two broader product questions above remain open.

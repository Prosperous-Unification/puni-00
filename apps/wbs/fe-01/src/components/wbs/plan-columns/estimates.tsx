import type { EstimateRule } from '@wbs/domain/estimate';
import { useState } from 'react';

import { type StepView } from '@/lib/wbs-api';

import { CellInput } from '../cell-input';
import { STEP_FINAL_HINT } from '../column-hints';
import { CreatablePicker, pickerOptionId } from '../creatable-picker';
import { minuteCharge, showDuration } from '../duration-words';
import { cellKey } from '../editable-grid';
import { POINTS, showTrio } from '../estimate-draft';
import { altMoveIn, commandChordIn } from '../keyboard-bindings';
import { flushCell, unsent } from '../live-editing';
import type { PlanLive } from '../plan-live';
import { MismatchMark } from '../plan-mismatch';
import { showFinal } from '../plan-number-format';
import {
  type EstimateReadings,
  type FoldedEstimateReadings,
  type PlanRenderRow,
} from '../plan-render-rows';
import { READING_CORNER_PX, StepReadingCorner } from '../step-reading';
import { useCardOpenOn } from '../use-card-open-on';
import { column } from './column';
import { EstimatePresentation, QUIET_TRIO_PX, RolledEstimateTrio } from './estimate-presentation';

export { ASSIGNEE_SLOT_PX, QUIET_TRIO_PX } from './estimate-presentation';
import { unwatchTrioFit, watchTrioFit } from './trio-fit';

function estimateReading(row: PlanRenderRow, stepId: string): EstimateReadings {
  const reading = row.readings.estimateReadings.get(stepId);
  if (reading === undefined) {
    throw new Error(`Missing estimate reading for visible step ${stepId} on row ${row.id}`);
  }
  return reading;
}

function foldedReading(reading: EstimateReadings, stepId: string): FoldedEstimateReadings {
  if (reading.layout !== 'folded') {
    throw new Error(`Expected folded estimate reading for step ${stepId}`);
  }
  return reading;
}

/** Null means an older read omitted all node metadata or this row is a parent. */
function readStepNode(row: PlanRenderRow, stepId: string) {
  if (row.rolledUp || row.readings.stepNodes === null) return null;
  const node = row.readings.stepNodes.get(stepId);
  if (node === undefined)
    throw new Error(`Missing step node for leaf ${row.id} and step ${stepId}`);
  return node;
}

/** Builds the estimates column family against the stable live cell contract. */
export function createEstimatesColumns({
  steps,
  unfoldedSteps,
  live,
  rule,
}: {
  steps: StepView[];
  unfoldedSteps: readonly string[];
  live: PlanLive;
  rule: EstimateRule;
}) {
  return steps.flatMap((step) => {
    const unfolded = unfoldedSteps.includes(step.id);
    return [
      column.display({
        id: `${step.id}-final`,
        meta: { isEditable: (row) => !unfolded && !row.rolledUp },
        // The toggle lives on the column that never goes away, so nothing
        // jumps when the group opens: it extends to the right of this one.
        header: () => (
          <button
            type="button"
            aria-expanded={unfolded}
            aria-label={`${unfolded ? 'Fold' : 'Unfold'} ${step.name} estimates`}
            // The step's own name, in full, because the button now shows as
            // much of it as the column has room for and no more. A step
            // called "Infrastructure and platform" used to set the width of
            // everything under it instead.
            // The assignee no longer folds away — it is beside the figure
            // in this very cell, and `@` assigns from there — so the
            // button is about the three points and nothing else. It said
            // "any other step folds" until `unfolding-may-scroll`, and no
            // other step folds now; what the reader is owed instead is
            // that the table may become wider than the window, which is
            // the one thing unfolding can do that it could not before.
            // The column's own sentence first, then the toggle's: this
            // button covers most of its `<th>`, so a title naming only the
            // fold would be the one heading in the table where hovering
            // teaches nothing about the column (`column-hints.ts`).
            data-hint={`${step.estimateUnit === 'minutes' ? STEP_FINAL_HINT.replace('days', 'minutes') : STEP_FINAL_HINT} ${
              unfolded
                ? 'Click to fold the three points back into the figure.'
                : 'Click to show the three points; the table may scroll sideways.'
            }`}
            onClick={() => {
              live.current.toggleStep(step.id);
            }}
            style={{
              font: 'inherit',
              fontWeight: 'inherit',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {/* The disclosure triangle leads, as it does on a parent row's
                number (`▾ 010`), so the heading reads as the same control
                (UI review F-006, 2026-10-13: a trailing `▸` read as
                decoration). */}
            {unfolded ? '▾' : '▸'} {step.name}
            {step.allowancePercent === 0 ? '' : ` +${String(step.allowancePercent)}%`}
          </button>
        ),
        cell: ({ row }) => {
          const reading = estimateReading(row.original, step.id);
          if (reading.layout !== (unfolded ? 'unfolded' : 'folded')) {
            throw new Error(`Estimate reading layout disagrees for step ${step.id}`);
          }
          // A subscription and not a reading off `live`: this cell is a
          // component, so it can be told about its own card without the table
          // rendering. First, and unconditionally, because it is a hook.
          // `flexRender` builds this with `React.createElement`, so it **is** a
          // component and the hook below is legal; the rule reads the property
          // name `cell` and cannot see the call site.
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const cardOpen = useCardOpenOn(
            live.current.cellCards,
            cellKey(row.original.id, `${step.id}-final`),
          );
          // Whether this cell is being typed in, which is the one thing that decides
          // whether the trio is at full strength. Local state and not a read off
          // `live`: the box is the cell's only focusable thing, and a store entry for
          // "which cell has the focus" already exists for the cards and answers a
          // different question — it survives a pointer visiting another cell.
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const [typing, setTyping] = useState(false);
          // A folded step must not be able to hide a complaint: a typed
          // trio that saves nothing stays visible as a mark on the figure
          // the fold leaves behind.
          const problem = reading.layout === 'folded' ? reading.combinedProblem : null;
          // The whole trio in one cell, but only where both halves of that
          // sentence hold: a folded step, so the three boxes are not on
          // screen to disagree with it, and a leaf, because a parent's
          // figure is a sum of what is below it and nothing to type into.
          const shorthand = !unfolded && !row.original.rolledUp;
          // What this row holds, off the row: the trio as it would be
          // typed, and the figure the project's estimate method makes of
          // it. Both read through `row.original` and **not** through
          // `combinedValue` beside them, which answers with the draft
          // where there is one. That is right for the box somebody is
          // typing in and wrong for the pair below, for the reason
          // [FoldedStepCard](../folded-step-card.tsx)'s points give at length: a figure is
          // what be-01 holds, and one recomputed per keystroke would
          // stand `2.2` beside `9/9/` claiming to be its answer.
          const stored = showTrio(row.original.estimates[step.id]);
          const charge =
            step.estimateUnit === 'minutes' ? minuteCharge(row.original, step.id) : undefined;
          const final =
            charge === undefined
              ? showFinal(row.original.finalDays[step.id])
              : showDuration(charge);
          // What this cell says without a box in it — a parent's roll-up
          // while the step is folded, and every row's while it is
          // unfolded. The trio when it is the only place the trio is, and
          // the figure once the three boxes are on screen beside it: an
          // unfolded step already prints `2 | 2 | 3`, and a fourth column
          // repeating it would be the fold's own reading with nothing
          // folded.
          const atRest = unfolded ? final : stored;
          // What the cell already reads without a result span: the box's own
          // text on a folded leaf (a refused draft included), and `atRest`
          // everywhere else — a folded parent's roll-up, or an unfolded
          // step's figure, which is `final` itself.
          const shown = shorthand ? foldedReading(reading, step.id).combinedValue : atRest;
          // The result is drawn only where it says something the cell does not
          // already read. That one comparison covers every case: an unfolded
          // cell reads `final` as `atRest`; a flat `5` in the box, or an equal
          // roll-up, reads it as the trio; a row with no estimate has neither a
          // trio nor a figure because be-01 computes `finalDays` from
          // `estimates` in the same call (see `WorkItemRow.finalDays`), so
          // `final !== ''` keeps an empty span off it.
          //
          // Proof: with `final !== shown` removed, six tests failed, among them
          // `says a flat trio once`, `shows a parent’s rolled-up trio once when
          // it equals the result` and `draws no result beside an unfolded
          // step’s own figure`, each on `expected <span …(2)></span> to be
          // null`. With `atRest` compared in place
          // of `shown`, `keeps a flat estimate’s figure beside a cell holding a
          // refused entry` failed on `expected undefined to be '5'`. Watched
          // 2026-09-27.
          const showsResult = final !== '' && final !== shown;
          // Nobody on this step and exactly one person on another: they are
          // assumed to be doing this step too. The same rule the unfolded
          // column has, in the cell that is always on screen — which is the
          // whole reason the assignee stopped folding away. Read through
          // {@link assigneeOn}, which is where a card reads it too.
          const doing = reading.doing;
          // Only while this step is folded: unfolded, the assignee has a
          // column of its own with a picker in it, and two ways to assign
          // one person side by side is two things to keep in step.
          const options = reading.layout === 'folded' ? reading.mentionOptions : [];
          const listId = `mention-${row.original.id}-${step.id}`;
          const finalCell = cellKey(row.original.id, `${step.id}-final`);
          // The card opens on the cell itself — not on a marker, the way
          // the Name cell's preview does. The difference is size: this one
          // is four lines over a 96px cell, so a mouse crossing the column
          // is told something rather than interrupted.
          //
          // Not while a mention is being typed in this cell, because the
          // list and the card open from the bottom edge of this same
          // wrapper and the one somebody is typing into owns the cell.
          //
          // The **mention**, not its entries. Reading `options.length === 0`
          // was the same rule for every case but one, and that one is
          // reachable: a deployment with nobody on it yet answers a bare `@`
          // with no entries at all — nobody to match, and no `Add "…"` until
          // something follows the `@` — so the card opened over a box being
          // typed into. agy round 3, finding 7.
          // Proof: put back to `options.length === 0`, `keeps the cell to a
          // mention that has nobody to offer` failed on `expected 'Dev…' to
          // contain 'QA'`. Watched, 2026-08-09.
          const mentioning = reading.layout === 'folded' && reading.mentioning;
          const cardable = !unfolded && !mentioning;
          const carded = cardable && cardOpen;
          // The card's own id, which the box below points
          // `aria-describedby` at while it is open — this cell's answer to
          // "a card only a pointer can open is data withheld from anybody
          // who does not use one" (codex round 3, finding 2). The box is
          // the cell's only focusable thing, so it is the one that can
          // carry it; a parent's rolled-up figure has no box and no
          // keyboard route, which is its own entry in `design.md`.
          const cardId = `folded-${row.original.id}-${step.id}`;
          const readingId = `reading-${row.original.id}-${step.id}`;
          // The reading's words first, then the card: both describe the box.
          const describers = [
            ...(reading.node === null ? [] : [readingId]),
            ...(carded ? [cardId] : []),
          ];
          const describedBy = describers.length === 0 ? undefined : describers.join(' ');
          return (
            <span
              data-final={step.id}
              onMouseEnter={() => {
                // No card to show, no store notification. See the Depends on
                // cell's own enter for why passing an empty cell must not
                // close the card open somewhere else.
                if (!cardable) return;
                live.current.cellCards.arriveOn(finalCell);
              }}
              onMouseLeave={() => {
                // The same-cell guard the Name cell's marker gives its
                // reason for: a leave lands after the enter of whatever the
                // pointer moved on to.
                live.current.cellCards.holdHovered(finalCell);
              }}
              // No native `title` here or on the input below: the card is
              // this cell's one hint (CONTEXT.md, "Hover preview"), and a
              // browser tooltip raced it over the same pixels. The
              // complaint still marks the figure (the `!` and the colour)
              // and rides the card.
              // A flex row, because this cell holds two things now: the
              // figure (or the box it is typed into) and who is doing it.
              // `relative` makes it the positioned ancestor the `@` list
              // opens against — the clip that would cut the list to 96px is
              // the `<td>`'s, which {@link opensAPopover} lifts.
              // The blur is the mention's: it bubbles from the box inside,
              // and leaving the cell has to take a half-typed `@ka` with
              // it. Moving focus to a copy action inside the card stays here.
              onBlur={(event) => {
                // Proof: removing this guard made `names a coded leaf step in
                // its open detail` fail on `element could not be found in the
                // document` when focus moved to Copy reference. Watched 2026-09-27.
                if (event.currentTarget.contains(event.relatedTarget)) return;
                // Proof: deleting only this reset left the box at full strength after blur;
                // `gives the trio back its strength on focus and quiets it again on blur`
                // failed on `expected 'inherit' to be '10px'`. Watched 2026-09-20.
                setTyping(false);
                live.current.leaveFoldedCell();
                // The focus-opened card goes with the focus. Guarded like
                // every other clear: a blur can land after the next cell has
                // already taken the focus.
                live.current.cellCards.updateFocused((current) =>
                  current === finalCell ? null : current,
                );
              }}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'baseline',
                maxWidth: '100%',
                minWidth: 0,
                fontWeight: 600,
                color: problem === null ? undefined : 'var(--destructive)',
                // Room for the corner glyph, so it never sits over a figure,
                // kept on every step cell — a parent's too, which draws no
                // glyph — so a parent's figure stands in its leaves' slot.
                // Proof: kept on leaves alone and CI's `stands a parent’s figure
                // in the same slot as its leaves’` (e2e/layout.spec.ts) failed on
                // `Expected: 894.765625, Received: 904.765625`, 10px apart; seen
                // on PR #355, 2026-10-12.
                paddingRight: READING_CORNER_PX,
              }}
            >
              {reading.node !== null && (
                <StepReadingCorner id={readingId} reading={reading.node.reading} />
              )}
              {shorthand ? (
                <CellInput
                  aria-label={`${step.name} estimate for ${row.original.number}`}
                  // In the keyboard grid, which is what makes Down-type-
                  // Down-type work down a step's column. Proof: dropped,
                  // `is a cell of the keyboard grid, so a column can be
                  // typed down` fails. Watched, 2026-08-06.
                  cellKey={cellKey(row.original.id, `${step.id}-final`)}
                  role="combobox"
                  aria-expanded={options.length > 0}
                  aria-controls={options.length > 0 ? listId : undefined}
                  // Which line Enter takes, for a reader who cannot see
                  // the highlight — `CreatablePicker`'s rule, carried to
                  // the one list it does not render. Cleared with
                  // `aria-controls` the moment the list closes, because
                  // both read the same `options.length > 0`.
                  aria-activedescendant={options.length > 0 ? pickerOptionId(listId, 0) : undefined}
                  aria-autocomplete="list"
                  placeholder="o/r/p"
                  aria-invalid={problem !== null}
                  // Every keystroke, so an `@` opens the people picker as
                  // it is typed. The estimate half is not read here and no
                  // draft is written — that is still the blur's job.
                  onTyped={(box) => {
                    live.current.readFoldedCell(row.original.id, step.id, box);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'F2' && carded && readStepNode(row.original, step.id) !== null) {
                      e.preventDefault();
                      const card = document.getElementById(cardId);
                      const action = card?.querySelector('button');
                      if (!(action instanceof HTMLButtonElement)) {
                        throw new Error(`Missing step card action for ${finalCell}`);
                      }
                      action.focus();
                      return;
                    }
                    // `mentioning`, not `options.length > 0`, and the two
                    // are not the same thing: a deployment with nobody in it
                    // answers a bare `@` with no entries at all, and this
                    // branch then handed the keyboard back to a cell a
                    // mention owned — Alt+ArrowDown moved the row and
                    // Cmd+Enter made one, under a half-typed mention. The
                    // card's guard was corrected in round 3 and this one was
                    // left counting entries; round 4 caught the divergence.
                    // The hole itself predates the change: the same branch
                    // counts entries on the merge-base at `75d01a8`.
                    // Proof: put back to `options.length > 0`, `every chord
                    // is inert on a mention that has nobody to offer` failed
                    // on `expected [ 'Strip', 'Paint', 'Sand', '' ] to deeply
                    // equal [ 'Strip', 'Sand', 'Paint' ]` — the row moved and
                    // a row created. Watched, 2026-08-09.
                    if (mentioning) {
                      // Inert means consumed, and this is the one open list
                      // that had two ways out of it. Cmd/⌘+Enter fell
                      // through to the bare Enter below and assigned the
                      // first person offered; every Alt+arrow went on to
                      // `onAltMove` underneath and moved the row while its
                      // list was open — codex round 2, finding 2.
                      //
                      // Proof, two faults, both watched 2026-08-08. This
                      // guard removed: `Cmd+Enter in the folded cell’s open
                      // @ list assigns nobody` failed on `expected
                      // [ 'assign w2 step-dev person1' ] to deeply equal []`,
                      // and `Alt+arrows in the folded cell’s open @ list
                      // move no row` on `expected [ 'Strip', 'Paint',
                      // 'Sand' ] to deeply equal [ 'Strip', 'Sand',
                      // 'Paint' ]`.
                      if (commandChordIn(e) !== null || altMoveIn(e) !== null) {
                        e.preventDefault();
                        return;
                      }
                      if (e.key === 'Escape') {
                        // Closes the list and strips nothing: what was
                        // typed is still on screen to be corrected, and the
                        // blur that follows is what takes it back out.
                        e.preventDefault();
                        live.current.closeMention();
                        return;
                      }
                      if (e.key === 'Enter') {
                        // The first entry, which is `CreatablePicker`'s
                        // rule: what is offered first is what is taken —
                        // and where there is nothing on offer, Enter is
                        // consumed and takes nothing rather than falling
                        // through to "new work item" under a live mention.
                        e.preventDefault();
                        options[0]?.take();
                        return;
                      }
                    } else {
                      // Enter saves, exactly as Prio and People-at-once do
                      // and for the same reason — see the comment on Prio's.
                      // This cell is the one it mattered most in and the
                      // last to get it: a trio typed and confirmed sat as a
                      // draft with the plan's dates unmoved until somebody
                      // happened to click elsewhere. Observed live on dev by
                      // `wbs-e2e-planning-qa`, 2026-08-22.
                      //
                      // Inside the `else`, and that is the whole placement
                      // argument: with a mention open Enter belongs to the
                      // list above, which takes the first person offered.
                      // The modifier guard leaves Ctrl/⌘ + Enter to
                      // `onCommandKey` underneath, which saves *and* makes
                      // the next row.
                      if (
                        e.key === 'Enter' &&
                        !e.metaKey &&
                        !e.ctrlKey &&
                        !e.altKey &&
                        !e.shiftKey
                      ) {
                        e.preventDefault();
                        void flushCell(e.currentTarget);
                        return;
                      }
                      // The routing matrix's inert row is this `else` and
                      // nothing more: while the `@` list is open it owns
                      // the keyboard, and Escape above is how it is given
                      // back. A chord that fired through an open list
                      // would create a row under a half-typed name search.
                      live.current.onCommandKey(e, row.original, `${step.id}-final`);
                    }
                    live.current.onAltMove(e, row.original, `${step.id}-final`);
                    live.current.onTabKey(e, row.original.id, `${step.id}-final`);
                    live.current.onArrowKey(e, row.original.id, `${step.id}-final`);
                  }}
                  // Selected on arrival, because the value at rest is a
                  // computed figure and the syntax is a trio: there is no
                  // sensible edit to make *inside* `4`, and a caret dropped
                  // into it turns `2/3/8` into `2/3/84`. What the selection
                  // replaces is remembered first — see `enterFoldedCell`.
                  aria-describedby={describedBy}
                  onFocus={(e) => {
                    setTyping(true);
                    live.current.enterFoldedCell(e.currentTarget);
                    // The focus opens the card the pointer opens — through
                    // its own state, so a mouse crossing the table cannot
                    // take it away from a box somebody is still typing in
                    // (round 4, finding 9). Cleared by the wrapper's
                    // `onBlur`, which this bubbles to.
                    // Proof, both watched 2026-08-09. This line dropped:
                    // `opens the card on the focus too, and points the box
                    // at it` failed on `Unable to find an accessible element
                    // with the role "tooltip"`. Written back to
                    // the hover's writer, with the open card folded back to the
                    // hover: `keeps the focused cell's card when the pointer
                    // visits another and leaves` failed the same way.
                    live.current.cellCards.updateFocused(() => finalCell);
                    e.currentTarget.select();
                  }}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    fontStyle: 'inherit',
                    lineHeight: 'inherit',
                    // Grows, and that is only safe because what sits to
                    // its right is now the **same width on every row** —
                    // see [ASSIGNEE_SLOT_PX](./estimate-presentation.tsx). Growing against a
                    // varying sibling is what made the derived figure's x
                    // depend on whether somebody was assigned: measured on
                    // Dany's plan, 2026-08-31, `· 2` at 1143.75 on the
                    // seven assigned rows and 1172.32 on the one without.
                    //
                    // `0 1 59px` was tried instead — stop growing, keep a
                    // basis wide enough for `20/24/30`. It aligns on a
                    // roomy column and not on a tight one: at the declared
                    // 96px the box's `shrink` takes the difference, and
                    // how much it shrinks depends on the assignee again.
                    // Measured at 91.22px: assigned rows 40.52, unassigned
                    // 59, figures 18.48px apart. The slot is the fix; this
                    // is back to what it was.
                    flex: 1,
                    minWidth: 0,
                    // The one state this cell has: quiet at rest, the row's own type while
                    // somebody is typing in it. A complaint is never quiet — a refusal that
                    // receded would be the cell hiding its own objection.
                    // Proof: replacing this branch with the full-strength arm made `quiets the
                    // trio while the cell is not being typed in` fail on `expected 'inherit' to
                    // be '10px'`. Dropping `typing` made the focus-and-blur test fail on
                    // `expected '10px' to be 'inherit'`; dropping `problem !== null ||` made the
                    // refused-trio test fail on `expected '10px' to be 'inherit'`. Watched
                    // separately, 2026-09-20.
                    ...(problem !== null || typing
                      ? { fontSize: 'inherit', fontWeight: 600 }
                      : {
                          fontSize: QUIET_TRIO_PX,
                          fontWeight: 400,
                          // Proof: restoring transparent ink for an equal trio made
                          // `says a flat trio once` fail on `expected 'transparent'
                          // to be 'var(--muted-foreground)'`. Watched 2026-09-27.
                          color: 'var(--muted-foreground)',
                          // The trio is what yields when all three do not fit, and it yields
                          // **visibly**: `20/24/30` beside `24.3` on a staffed row has 16px more
                          // trio than box, and without this the box cut `20/24` off mid-glyph and
                          // said nothing about the rest. Only at rest — the full-strength arm
                          // above declares no `text-overflow`, so a box being typed in scrolls its
                          // whole value the way a text box does, and the hover card carries the
                          // trio in full either way.
                          // Proof, both watched 2026-09-21. This line dropped: `ends a resting
                          // trio in an ellipsis, and only while it is resting` failed on
                          // `expected '' to be 'ellipsis'`. The same declaration added to the
                          // full-strength arm above: the same test failed on its focus
                          // assertion, `expected 'ellipsis' to be ''`.
                          textOverflow: 'ellipsis',
                        }),
                    ...(problem === null
                      ? {}
                      : {
                          background: 'var(--grid-invalid)',
                          borderColor: 'var(--destructive)',
                        }),
                  }}
                  value={foldedReading(reading, step.id).combinedValue}
                  // The trio beside a drawn result is measured, and dropped
                  // whole when it does not fit (`data-trio-clipped`). Only
                  // there: a box with no result beside it holds the cell's one
                  // figure, and a complaint is never quiet.
                  // Proof: `watchTrioFit` made a no-op, `keeps the initials whole
                  // and drops a trio that does not fit` in
                  // `e2e/plan-table-review.spec.ts` failed on `0.5/0.5/1 is
                  // drawn cut`. Watched 2026-10-13.
                  onAttach={(box) => {
                    if (showsResult && problem === null) watchTrioFit(box);
                    // Proof: the `unobserve` taken out of `unwatchTrioFit`,
                    // `keeps a refused draft’s ink after a resize` in
                    // `e2e/plan-table-review.spec.ts` failed on `Expected: not
                    // "rgba(0, 0, 0, 0)"`. Watched 2026-10-13.
                    else unwatchTrioFit(box);
                  }}
                  commit={(typed, baseline) =>
                    live.current.commitCombinedEstimate(row.original, step.id, typed, baseline)
                  }
                />
              ) : unfolded ? (
                atRest
              ) : (
                <RolledEstimateTrio step={step} showsResult={showsResult} atRest={atRest} />
              )}
              <EstimatePresentation
                row={row}
                step={step}
                live={live}
                rule={rule}
                reading={reading}
                showsResult={showsResult}
                final={final}
                problem={problem}
                doing={doing}
                options={options}
                listId={listId}
                carded={carded}
                finalCell={finalCell}
                cardId={cardId}
                typing={typing}
                readStepNode={readStepNode}
              />
            </span>
          );
        },
      }),
      ...(!unfolded
        ? []
        : [
            ...POINTS.map((point) =>
              column.display({
                id: `${step.id}-${point}`,
                // The step's name is on the group column; repeating it three
                // times over is how the headers came to set the table's width.
                //
                // The word itself in a `title`, because the column is 44px
                // and the word is not: measured on 2026-08-09, `optimistic`
                // wants 84px and reads `optimi`, `pessimistic` wants 95px
                // and reads `pessin`. There is no ellipsis to hint at it
                // either — the same answer the `Days` header takes, where
                // the sentence that would not fit moved into the `title`.
                //
                // One letter since `spreadsheet-geometry`, which is the
                // shorthand these cells already teach: the folded column's
                // box takes `o/r/p` as its placeholder and reads a trio
                // typed as `2/3/8`. A clipped word said less than its own
                // first letter does — `optimi` is not a word — and the
                // letter is what let the column drop to 44px. The word is
                // still the heading's accessible name, and it is the first
                // word of the `<th>`'s hint — which is why that one hint
                // opens with the column's name and the other fourteen open
                // with the effect (`column-hints.ts`).
                meta: { isEditable: (row) => !row.rolledUp, spokenHeading: point },
                header: () => <span>{point.slice(0, 1)}</span>,
                cell: ({ row }) => {
                  const reading = estimateReading(row.original, step.id);
                  if (reading.layout !== 'unfolded') {
                    throw new Error(`Expected unfolded estimate reading for step ${step.id}`);
                  }
                  const problem = reading.trioProblem;
                  const wrong = problem?.points.includes(point) ?? false;
                  return (
                    <CellInput
                      aria-label={`${step.name} ${point} for ${row.original.number}`}
                      cellKey={cellKey(row.original.id, `${step.id}-${point}`)}
                      // Narrow on purpose: these hold a number of days, and a box
                      // sized for a sentence reads as if it wants one. Which is
                      // the column's width to say now, not this box's.
                      //
                      // `decimal` and not `numeric` because half-days are typed
                      // here (`0.5`), and not `type="number"` for the folded
                      // cell's reason one column back — spinners a thumb cannot
                      // use. These three boxes had **no** `inputMode` at all
                      // until `wbs-mobile-orp-input`, so a touch device offered
                      // a letters keyboard for a box that only ever holds a
                      // number: the one three-box path a tablet can reach was
                      // the one path with no keypad on it.
                      inputMode={step.estimateUnit === 'minutes' ? 'numeric' : 'decimal'}
                      aria-invalid={wrong}
                      data-fact={problem?.message}
                      onKeyDown={(e) => {
                        // Enter saves, the folded cell's rule in the face
                        // an estimator opens to argue about one number.
                        // A box with no list over it, so there is no
                        // `mentioning` arm to sit inside — the modifier
                        // guard is still the chord's, and is the whole of
                        // what this branch has to be careful about.
                        if (
                          e.key === 'Enter' &&
                          !e.metaKey &&
                          !e.ctrlKey &&
                          !e.altKey &&
                          !e.shiftKey
                        ) {
                          e.preventDefault();
                          void flushCell(e.currentTarget);
                          return;
                        }
                        live.current.onAltMove(e, row.original, `${step.id}-${point}`);
                        live.current.onCommandKey(e, row.original, `${step.id}-${point}`);
                        live.current.onTabKey(e, row.original.id, `${step.id}-${point}`);
                        live.current.onArrowKey(e, row.original.id, `${step.id}-${point}`);
                      }}
                      // A parent's figures are sums of what is below it, so the cell is
                      // shown and not editable — greyed rather than blank, because the
                      // number is real and worth reading.
                      readOnly={row.original.rolledUp}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        ...(row.original.rolledUp
                          ? { color: 'var(--muted-foreground)', background: 'var(--muted)' }
                          : wrong
                            ? {
                                background: 'var(--grid-invalid)',
                                borderColor: 'var(--destructive)',
                              }
                            : {}),
                      }}
                      value={reading.estimateValues[point]}
                      commit={(typed) =>
                        // A rolled-up figure is a sum of the rows below it:
                        // the box is read-only and there is nothing to send.
                        row.original.rolledUp
                          ? unsent()
                          : live.current.commitEstimate(row.original, step.id, point, typed)
                      }
                    />
                  );
                },
              }),
            ),
            column.display({
              id: `${step.id}-assignee`,
              meta: { isEditable: () => true },
              header: 'by',
              cell: ({ row }) => {
                const reading = estimateReading(row.original, step.id);
                if (reading.layout !== 'unfolded') {
                  throw new Error(`Expected unfolded estimate reading for step ${step.id}`);
                }
                const assigned = row.original.assignees[step.id];
                // Nobody on this step, and exactly one person on another: they are
                // assumed to be doing this step too, so the cell says so rather
                // than reading as unassigned. Assigning anyone here ends the
                // assumption by itself.
                const assumed = assigned === undefined ? row.original.doesEveryStep : null;
                // Task 7.2's second marker. Read through `assigneeOn` and
                // not off the row, because that is the one function that
                // resolves *which* person this cell shows — the named one
                // or the assumed one — and a marker computed from
                // `assigned` alone would go quiet on exactly the assumed
                // case, where nobody has looked at the assignment at all.
                const doing = reading.doing;
                const nameOf = (id: string) =>
                  row.original.readings.assigneeEntries.find((each) => each.id === id)?.name ??
                  '(unknown)';
                return (
                  // A flex row because the picker inside it is one now: the
                  // assumed name has to sit beside the box and shrink with
                  // it, rather than being pushed onto a line of its own.
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      maxWidth: '100%',
                      minWidth: 0,
                    }}
                  >
                    <CreatablePicker
                      label={`${step.name} assignee for ${row.original.number}`}
                      placeholder="search"
                      entries={row.original.readings.assigneeEntries}
                      value={assigned ?? null}
                      onChoose={(id) => {
                        live.current.assignTo(row.original.id, step.id, id);
                      }}
                      onCreate={(name) => {
                        live.current.createPersonFor(row.original, step.id, name);
                      }}
                      onClear={() => {
                        live.current.assignTo(row.original.id, step.id, null);
                      }}
                      gridCell={{
                        dataCell: cellKey(row.original.id, `${step.id}-assignee`),
                        onTabKey: (e) => {
                          live.current.onTabKey(e, row.original.id, `${step.id}-assignee`);
                        },
                        onCommandKey: (e) => {
                          live.current.onCommandKey(e, row.original, `${step.id}-assignee`);
                        },
                        onAltMove: (e) => {
                          live.current.onAltMove(e, row.original, `${step.id}-assignee`);
                        },
                      }}
                    />
                    {assumed !== null && (
                      <span
                        data-assumed={step.id}
                        data-fact="Only one person is assigned, so they are assumed to do this step too"
                        style={{
                          color: 'var(--muted-foreground)',
                          marginLeft: 4,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ({nameOf(assumed)})
                      </span>
                    )}
                    {doing?.outside != null && (
                      <MismatchMark kind="assignee" note={doing.outside} />
                    )}
                  </span>
                );
              },
            }),
          ]),
    ];
  });
}

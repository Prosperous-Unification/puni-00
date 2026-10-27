import type { EstimateRule } from '@wbs/domain/estimate';

import type { StepView } from '@/lib/wbs-api';

import { CLAIM_SLOT_PX, ClaimChip } from '../claim-chip';
import { PickerList } from '../creatable-picker';
import { cellIn } from '../editable-grid';
import { POINTS } from '../estimate-draft';
import { FoldedStepCard, type FoldedStepCardProps } from '../folded-step-card';
import type { PlanLive } from '../plan-live';
import { MismatchMark } from '../plan-mismatch';
import { showDays } from '../plan-number-format';
import type { EstimateReadings, FoldedEstimateReadings, PlanRenderRow } from '../plan-render-rows';
import { unwatchTrioFit, watchTrioFit } from './trio-fit';

/**
 * How much of a folded step cell is kept for the assignee, **when that column
 * has one at all**.
 *
 * The derived figure beside the trio is a number people read down the column,
 * and it only lines up if everything to its right is the same width on every
 * row. The assignee is not: `· AI` is 19.51px, `· VS` 24.57, `· WW` 31.76 and
 * an assumed `· (WW)` 40.42, all measured in Chromium at this cell's `13px
 * sans-serif` on 2026-08-31. A row with nobody assigned reserved nothing at
 * all, which is the 28.57px Dany photographed.
 *
 * **Reserved per column and only when somebody is assigned in it** — his own
 * call, asked directly: "if there is no assignees on any work item, then
 * everything is aligned vertically without assignee, if there is at least one
 * assignee, then every row moves". So a plan nobody has staffed pays nothing
 * and its trio boxes stay full width; the moment one person is named, every row
 * in that column gives up the same 32px and the figures line up again.
 *
 * 32 and not 41 until 2026-10-13: it seated `· WW` and let an assumed
 * `· (WW)` clip by 8px. The UI review (F-034) caught that clip as `1 · (GH` —
 * half a bracket reads as broken text, not as a cue. The assumed form lost its
 * dot instead (`(WW)`, 33.2px; `· WW` is 32.5, Chromium, 13px sans-serif,
 * 2026-10-13), and the slot is 34 so both forms sit whole. What gives way in a
 * narrow cell is the trio, dropped whole to the card ({@link watchTrioFit}).
 */
export const ASSIGNEE_SLOT_PX = 34;

/**
 * The type the typed trio recedes to while its cell is not being written in.
 *
 * 10px is this table's caption size — the heading row's (`styles.css`) and the
 * size the derived figure was drawn at from 2026-08-30 until this change — so
 * it is a size this column is already known to be readable at. It is also what
 * pays for the result growing to the row's own 13px: at 13px the trio
 * `20/24/30` wants about 50px of a box in a 96px column shared with a 32px
 * assignee slot, and at 10px it wants about 39px. The measurement that decides
 * it is Chromium's, in `e2e/layout.spec.ts`'s `holds a trio and its figure on
 * one line of a folded step cell`; `plan-estimates.test.tsx` asserts against
 * this constant rather than against the number, so changing it changes no test.
 */
export const QUIET_TRIO_PX = 10;

/**
 * A parent's folded cell reads the shape its leaves do —
 * a column that printed a trio on a leaf and a bare
 * figure one row up would be two readings of one heading.
 * A parent's trio is the sum of its descendants', per
 * point, and the method applied to that sum is the sum of
 * the methods applied (PERT is linear), so the pair below
 * cannot contradict the leaves it is made of.
 *
 * `flex: 1`, the box above's own width rule, so the
 * figure and the assignee after this land in the same
 * right-hand slot on a parent as on the leaves under it —
 * a column where `· 5` stands two different places on
 * adjacent rows reads as two columns (Dany, 2026-08-30).
 * The clip mirrors the box's own: a wide roll-up loses
 * characters to the same edge a wide typed trio scrolls
 * behind, and the card carries the whole of both.
 */
export function RolledEstimateTrio({
  step,
  showsResult,
  atRest,
}: {
  step: Pick<StepView, 'id'>;
  showsResult: boolean;
  atRest: string;
}) {
  return (
    <span
      data-rolled-trio={step.id}
      // A parent's trio yields the way its leaves' does.
      ref={(rolled) => {
        if (rolled === null) return;
        if (showsResult) watchTrioFit(rolled);
        else unwatchTrioFit(rolled);
      }}
      style={{
        // **The leaf box's width rule, spelled the same way.**
        // This span and that box are two spellings of one
        // slot, and the moment they disagree a parent's figure
        // and its leaves' stop lining up: left behind while
        // the box was briefly `0 1 59px`, `stands a parent's
        // figure in the same slot as its leaves'` failed on
        // `Expected: 858 · Received: 872.875`. Watched in
        // Chromium, 2026-08-31.
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        // **The box under a leaf's trio, spelled again.** A
        // leaf types into an `<input>`, which carries the
        // user agent's own `padding: 2px` and 1px border;
        // this span carried neither, so a parent's first
        // digit stood three pixels left of its children's
        // and the column read as two columns — the same
        // fault the figure had, one box further in (Dany,
        // 2026-08-30). Transparent rather than absent: the
        // border has to take its pixels for the text to
        // start where the typed text starts, and a visible
        // one would draw a box around a figure nobody can
        // type into. `styles.css` does this for the Name
        // cell's two boxes and gives the argument in full.
        //
        // **2px, which is the `<input>`'s own and not the
        // `<textarea>`'s 1px** — Chromium's user agent
        // defaults them differently and the box beside this
        // one is an input. Written as the figure the browser
        // reports rather than guessed: at 1px the test below
        // failed on `borderLeftWidth "2px" / "1px"`, which is
        // how the number was learned.
        boxSizing: 'border-box',
        padding: 2,
        border: '2px solid transparent',
        // The resting box's type, spelled again, for the reason the padding and
        // the border above are: `e2e/layout.spec.ts`'s `stands a parent’s figure in
        // the same slot as its leaves’` compares this span's computed size and
        // weight with an unfocused leaf box's, and one column that reads in two
        // sizes is two columns.
        // Proof: dropping these three declarations made `quiets a parent’s rolled-up
        // trio exactly as a leaf’s` fail on `expected '' to be '10px'`. Watched
        // 2026-09-20.
        fontSize: QUIET_TRIO_PX,
        fontWeight: 400,
        // Proof: restoring transparent ink for an equal roll-up made
        // `shows a parent’s rolled-up trio once when it equals the result`
        // fail on `expected 'transparent' to be 'var(--muted-foreground)'`.
        // Watched 2026-09-27.
        color: 'var(--muted-foreground)',
      }}
    >
      {atRest}
    </span>
  );
}

interface EstimatePresentationProps {
  row: { original: PlanRenderRow };
  step: StepView;
  live: PlanLive;
  rule: EstimateRule;
  reading: EstimateReadings;
  showsResult: boolean;
  final: string;
  problem: string | null;
  doing: EstimateReadings['doing'];
  options: FoldedEstimateReadings['mentionOptions'];
  listId: string;
  carded: boolean;
  finalCell: string;
  cardId: string;
  typing: boolean;
  readStepNode: (row: PlanRenderRow, stepId: string) => FoldedStepCardProps['stepNode'];
}

/** The result, assignment and detail surfaces sharing the cell's existing DOM. */
export function EstimatePresentation({
  row,
  step,
  live,
  rule,
  reading,
  showsResult,
  final,
  problem,
  doing,
  options,
  listId,
  carded,
  finalCell,
  cardId,
  typing,
  readStepNode,
}: EstimatePresentationProps) {
  return (
    <>
      {showsResult && (
        // A distinct step result, and the cell's main reading: the
        // row's own type and foreground, which it takes by **declaring neither**
        // and inheriting from the wrapper — so a complaint recolours it for free
        // — and tabular numerals, so results line up down a column and can be
        // scanned like a ledger. No leading `·`: the separator was the
        // annotation's, and this is not an annotation any more. Dropping it also
        // returns about six pixels, which is most of what growing from the
        // caption size to the row's costs.
        //
        // `flex: none`, so a narrow column takes its pixels out
        // of the box rather than out of this: a clipped `2.` is worse than a
        // clipped trio the box can still be scrolled through.
        //
        // **What pays for it is the trio going quiet** ({@link QUIET_TRIO_PX}).
        // This span was drawn at 10px from 2026-08-30 until this change, for the
        // opposite reason: at the row's own 13px the widest trio anybody has
        // typed here in anger — `20/24/30`, live on dev, 2026-08-22 — did not fit,
        // and the box clipped by 8px in a 96px column. Proof from that day, kept
        // because it is what the budget is known from: the figure written at the
        // row's own type instead, `holds a trio and its figure on one line of a
        // folded step cell` failed on `the trio does not fit the box beside its
        // figure — Expected: <= 0, Received: 8`. Watched in Chromium, 2026-08-30.
        // The same test is what holds the budget now, with the sizes the other
        // way round: the committed cases are the seeded one and the unstaffed
        // wide one, and they now also pin that the box is unfocused at 10px and
        // that this span takes the row's own size, ink and tabular numerals.
        //
        // **The staffed, fractional case is committed too, since 2026-09-21.** It
        // clips by 16px before this change and after it, and no size the trio can
        // be set at closes that, so what `yields the trio to an ellipsis where a
        // staffed cell's result is fractional` pins is not a fit: it is that the
        // trio ends in an ellipsis rather than a sliced glyph while this span and
        // the assignee keep their boxes inside the cell.
        <span
          data-folded-final={step.id}
          style={{
            marginLeft: 4,
            flex: 'none',
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {final}
        </span>
      )}
      {problem !== null && ' !'}
      {doing !== null && (
        // `4.8 · VA`, and the whole name in the tooltip. 96px holds
        // a figure and about four characters of a person, which is
        // how this printed `vad…` and `kuc…` — two people who read
        // identically. `assignInitials` is the same length
        // every time and distinct among the plan's people, so the
        // column lines up, nothing needs an ellipsis and `CC` is
        // never two people (C22). Grey and in brackets where nobody is assigned
        // and somebody is assumed, exactly as the unfolded column
        // reads it.
        <span
          data-folded-assignee={step.id}
          {...(doing.assumed ? { 'data-assumed': step.id } : {})}
          // No `title`, still. One was written here for the
          // initials and taken back out: `leaves the assignee no
          // title of its own to say it twice` is a decision from
          // 2026-08-09 — a native tooltip is one line, a second
          // late, and the hover card already names them in full
          // (`folded-step-card.tsx`). Initials make the card more
          // load-bearing, not the tooltip more welcome.
          style={{
            marginLeft: 4,
            flex: 'none',
            // The slot, so every row in a staffed column gives up
            // the same width and the figure before it lands at one
            // x. Both forms fit it whole since 2026-10-13 (F-034:
            // `1 · (GH` was cut mid-bracket); `hidden` is only a
            // backstop for a script wider than two Latin capitals.
            width: ASSIGNEE_SLOT_PX,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            fontWeight: 'normal',
            color: doing.assumed ? 'var(--muted-foreground)' : undefined,
          }}
        >
          {/* `(AL)` with no dot when assumed, as the unfolded `by`
                      column writes it: the brackets already set it apart, and
                      the dot is what made `· (WW)` 40px in a 34px slot. */}
          {doing.assumed ? `(${doing.initials})` : `· ${doing.initials}`}
        </span>
      )}
      {doing === null && reading.anyAssignee && (
        // The empty half of {@link ASSIGNEE_SLOT_PX}: a row with
        // nobody on it still gives up the slot, **but only in a
        // column where somebody is assigned**. That condition is
        // the whole of Dany's answer — an unstaffed plan pays
        // nothing and keeps its trio boxes full width.
        //
        // `aria-hidden` and empty: it is a spacer, and a screen
        // reader being told a row has an unnamed assignee would be
        // worse than it being told nothing. The cell's card is
        // where absence is stated in words.
        <span
          aria-hidden="true"
          data-folded-assignee-slot={step.id}
          style={{ marginLeft: 4, flex: 'none', width: ASSIGNEE_SLOT_PX }}
        />
      )}
      {/*
                      Task 7.2's marker on the folded cell as well as the
                      unfolded one, and that is the point rather than a
                      duplication: steps start folded (`unfoldedSteps` is `[]`),
                      so a marker living only in the `by` column would be absent
                      from every plan nobody has unfolded. This cell already
                      holds the rule as `A folded step must not be able to hide
                      a complaint`; a signal is not a complaint, but it hides
                      exactly as easily.

                      `carded`, so the sentence rides {@link FoldedStepCard}
                      with the assignee's own name rather than fighting it as a
                      native tooltip.
                    */}
      {doing?.outside != null && <MismatchMark kind="assignee" note={doing.outside} carded />}
      {reading.layout === 'folded' && reading.anyClaim && (
        // The claim slot, beside the assignee's (`wbs-claim-display` C7): kept
        // on every row of a column where some drawn row holds a claim, so the
        // figures stay lined up, and on no row of any other column, so an
        // unclaimed plan pays nothing. The chip shows initials only; the step
        // card below says the rest.
        // Proof: the slot kept whatever `anyClaim` says made `reserves no claim
        // slot in a column nobody holds a claim in` and `leaves an unclaimed
        // plan exactly as it was` fail on `expected <span …(3)></span> to be
        // null`; watched 2026-10-24.
        <span
          data-folded-claim-slot={step.id}
          aria-hidden={reading.claim === null ? 'true' : undefined}
          style={{
            marginLeft: 3,
            flex: 'none',
            width: CLAIM_SLOT_PX - 3,
            display: 'inline-flex',
            justifyContent: 'flex-start',
          }}
        >
          {reading.claim !== null && <ClaimChip drawn={reading.claim} form="initials" />}
        </span>
      )}
      {options.length > 0 && (
        <PickerList
          id={listId}
          label={`${step.name} assignee for ${row.original.number}`}
          options={options}
        />
      )}
      {carded && (
        <FoldedStepCard
          isLeaf={!row.original.rolledUp}
          stepName={step.name}
          estimateUnit={step.estimateUnit}
          projectId={live.current.projectId}
          stepNode={readStepNode(row.original, step.id)}
          onAddDependency={() => {
            live.current.openStepDependency(row.original.id, step.id);
          }}
          onPointerArrives={() => {
            live.current.cellCards.arriveOnCard();
          }}
          onExitActions={() => {
            const grid = live.current.gridElement.current;
            const cell =
              grid && cellIn(grid, { rowId: row.original.id, columnId: `${step.id}-final` });
            if (cell === null || cell === undefined) {
              throw new Error(`Missing focused step cell ${finalCell}`);
            }
            cell.focus();
          }}
          pushToast={live.current.pushToast}
          number={row.original.number}
          id={cardId}
          points={POINTS.map((point) => ({
            point,
            // The row's own trio, off the row — **not** through
            // `estimateValue`, and not through `combinedValue`
            // below it. Those two answer with the draft where there
            // is one, which is right for a box somebody is typing
            // in and wrong for this: a card is what the fold left
            // behind, and what the fold hid is the estimate be-01
            // holds — the one the figure beside it is computed
            // from, and the one every other reader of the plan
            // sees. Reading the draft made a card say
            // `realistic —` beside `Final 3.7 days`, and
            // `Final 8/3/2 days` where a number of days belongs.
            // The draft is not lost: unfolding the step puts it
            // back in the box it was typed into, with its
            // complaint, which is the only place it can be
            // corrected. codex round 3, finding 4.
            // Proof, two faults watched 2026-08-09. Points read
            // through `estimateValue`: `reads the trio off the row,
            // not out of the boxes it was typed into` failed on
            // `expected 'Devoptimistic 2 · realistic — · pessi…' to
            // contain 'realistic 3'`. `final` read through
            // `combinedValue`: `says Final in days, whatever
            // half-typed shorthand the cell is holding` failed on
            // `expected 'Dev…Final 8/3/2 days' to contain 'Final
            // 3.7 days'`.
            days: showDays(row.original.estimates[step.id], point),
          }))}
          // The same read as the figure beside the box, and the
          // same local: a card that computed its own would be a
          // second opinion about one number, one element away.
          final={final}
          // A leaf's own trio only: a parent's is a sum of trios, and
          // its charged figure is the sum of its leaves' charges, not
          // the allowance applied to that sum.
          estimate={row.original.rolledUp ? undefined : row.original.estimates[step.id]}
          allowancePercent={step.allowancePercent}
          rule={rule}
          doing={doing}
          claim={reading.claim}
          problem={problem}
          typing={typing}
          node={reading.node}
          // Built here, per open card, off `live` at the moment of the
          // click — never pinned into the column definitions.
          setBlocked={(isBlocked) => {
            void live.current.run((write) =>
              write.perform(['tree'], () =>
                live.current.commands.setStepBlocked(row.original.id, step.id, isBlocked),
              ),
            );
          }}
          attemptActions={{
            start: () => {
              live.current.startAttempt(row.original.id, step.id);
            },
            end: () => {
              live.current.openEndAttempt(row.original.id, step.id);
            },
            remove: (attemptNumber) => {
              live.current.removeAttempt(row.original.id, step.id, attemptNumber);
            },
          }}
        />
      )}
    </>
  );
}

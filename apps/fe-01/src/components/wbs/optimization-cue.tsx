import { useId, useLayoutEffect, useRef, useState } from 'react';

import type {
  PlanOptimizationView,
  ProjectOptimizationPatch,
  ScheduleObjectiveView,
} from '@/lib/wbs-api';

import { type MenuAction, MenuControl } from './actions-menu';
import { type AnchorRect, HoverCard } from './hover-card';
import { cueReading, type CueRow, type UnmeetableDeadline } from './optimization-cue-reading';
import { days, deadlineWords, OBJECTIVE_LABEL } from './optimization-words';

export interface OptimizationCueProps {
  readonly optimization: PlanOptimizationView;
  /** The plan on screen may have moved under this comparison. */
  readonly stale?: boolean;
  readonly projectStart: string | null;
  readonly today: Date;
  readonly workItemName: (id: string) => string | null;
  /** Whether this cue's menu is the open one. Held by the caller: one at a time. */
  readonly menuOpen: boolean;
  readonly onMenuOpen: () => void;
  readonly onMenuClose: () => void;
  /** A write is in flight, so the items show unavailable rather than leaving the menu. */
  readonly busy: boolean;
  /**
   * Moves the project onto another schedule.
   *
   * Absent on a screen with no settings writer, and that absence is the whole
   * of the permission rule: `schedule_engine` and `schedule_objective` are
   * **project-wide**, so one reader's switch moves every collaborator's plan,
   * and a cue that offered the switch to somebody who cannot make it would be
   * a control that fails with a toast. Such a screen still reads everything —
   * see the second arm of the pill below.
   */
  readonly onChoose?: (patch: ProjectOptimizationPatch) => void;
  /** Asks for one more solve of a variant whose own state a Retry may recover. */
  readonly onRetry?: (objective: ScheduleObjectiveView, inputHash: string) => void;
}

/**
 * The pill, at rest and in every state.
 *
 * A `<button>`'s own padding and border in both arms, so the two are the same
 * object to a reader: the writer's arm opens a menu and the reader's arm opens
 * the card, and nothing about the shape says which one you have.
 */
const PILL =
  'inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-transparent bg-muted px-2 text-sm whitespace-nowrap hover:border-border';

/** The state the dot paints, worst-first: something broken outranks something pending. */
function dotState(optimization: PlanOptimizationView): string {
  const states = [optimization.variants.pri.state, optimization.variants.time.state];
  if (states.includes('failed') || states.includes('corrupt')) return 'unavailable';
  if (states.includes('plan-infeasible')) return 'infeasible';
  if (states.includes('pending') || states.includes('retrying')) return 'solving';
  // An admitted `idle` is waiting for a solver seat, which is the same news as
  // `pending` — `variantStateWords` has the whole of why the two words differ.
  if (optimization.generation !== null && states.includes('idle')) return 'solving';
  if (states.includes('ready')) return 'ready';
  return 'idle';
}

/** One unmeetable work item deadline, as a line of the card. */
function unmeetableLine(
  unmeetable: UnmeetableDeadline,
  nameOf: (id: string) => string,
  projectStart: string | null,
  today: Date,
): string {
  const who =
    unmeetable.ownerWorkItemId === unmeetable.boundWorkItemId
      ? nameOf(unmeetable.boundWorkItemId)
      : `${nameOf(unmeetable.ownerWorkItemId)} → ${nameOf(unmeetable.boundWorkItemId)}`;
  return `${who} · Work item deadline ${deadlineWords(projectStart, unmeetable.effectiveDeadlineOffset, today)}`;
}

/**
 * What one row reads, in the order a reader needs it — its name, its finish,
 * how it compares with Fast, and what its own state is doing.
 *
 * `refusedBecause` is deliberately **not** here. It is the menu item's
 * `data-fact` and its `aria-disabled` reason, and a row whose state is already
 * in these words would otherwise say the same sentence twice.
 */
function rowWords(row: CueRow): string {
  const parts = [row.label];
  if (row.finishDays !== null) parts.push(days(row.finishDays));
  if (row.comparedWithFast !== null) parts.push(row.comparedWithFast);
  if (row.stateWords !== null) parts.push(row.stateWords);
  return parts.join(' · ');
}

/**
 * The compact schedule cue: which schedule this plan is on, what the optimizer
 * found, and the switch onto it — one pill in the toolbar row.
 *
 * **It replaced a full-width banner above the table** (tasks.md 8b.6). The
 * banner said one sentence about the variant on screen and, because the plan
 * read only compared *that* variant, drew nothing at all while Fast was
 * displayed — which is the state a project spends its first solve in and the
 * state the toggle leaves it in. Both halves are gone: the plan read now
 * compares every ready variant, and this says so in the width of a control.
 *
 * Three surfaces, and each one has a job the others cannot do:
 *
 * - **The pill** carries the state and, when a variant would land the plan
 *   earlier than the schedule on screen, the saving. Its accessible name is the
 *   whole sentence (`cueReading`), because the visible text is two words.
 * - **The menu** carries the actions: the three schedules with their figures,
 *   and a Retry for a variant a Retry can recover. Actions are here and not on
 *   the card because a `HoverCard` **takes no pointer** — a control drawn on
 *   one cannot be pressed (R5, `reference-cell-escape-and-hover`).
 * - **The card** carries the reading: every row's figures, why a row is
 *   refused, and the work item deadlines an infeasible variant proved
 *   unmeetable. It opens on hover **and on focus**, and the pill points
 *   `aria-describedby` at it, so a reader who never touches a mouse gets the
 *   same words.
 *
 * A live region beside them says the sentence again when it changes: an
 * `aria-label` moving under a button announces nothing.
 */
export function OptimizationCue({
  optimization,
  stale = false,
  projectStart,
  today,
  workItemName,
  menuOpen,
  onMenuOpen,
  onMenuClose,
  busy,
  onChoose,
  onRetry,
}: OptimizationCueProps) {
  const [pointed, setPointed] = useState(false);
  const [focused, setFocused] = useState(false);
  const cardId = useId();
  const pill = useRef<HTMLSpanElement | null>(null);
  /**
   * The pill's own rectangle while the card is open, or `null`.
   *
   * The card is **portalled and placed from a measurement** rather than
   * absolutely positioned inside this wrapper, which is the one arrangement
   * that promises both of its edges stay on screen: `surfacePlacement` clamps
   * the left edge and flips the card above the pill when there is no room
   * below. An absolutely positioned card carries `max-width: 420px` with no
   * viewport clamp, and this pill sits at the left end of a toolbar that a
   * 390px phone also draws — 420px of card from x=8 is a document that scrolls
   * sideways, which is the fault `e2e/optimization-cue.spec.ts` measures.
   */
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const cardOpen = pointed || focused;
  useLayoutEffect(() => {
    if (!cardOpen) {
      setAnchor(null);
      return;
    }
    // Narrowing rather than a guard: a layout effect runs on a mounted tree, so
    // the ref is set. jsdom answers zeroes here and the card still renders,
    // which is why the placement itself is a browser assertion (`hover-card.ts`
    // says the same about every other card in this app).
    const box = pill.current?.getBoundingClientRect();
    if (box === undefined) return;
    setAnchor({ left: box.left, top: box.top, bottom: box.bottom });
  }, [cardOpen]);
  // Hooks first, and the early return after them: a project with optimization
  // off has nothing to say — the settings panel is where its one sentence
  // lives ("Fast is active while optimization is off") — and this component
  // must not change its hook order on the way there.
  if (!optimization.enabled) return null;

  const reading = cueReading(optimization, stale);
  const nameOf = (id: string): string => workItemName(id) ?? 'Work item no longer in this plan';

  const switches: MenuAction[] =
    onChoose === undefined
      ? []
      : reading.rows.map((row) => ({
          id: `schedule-${row.which}`,
          label: rowWords(row),
          ...(row.refusedBecause === null ? {} : { refusedBecause: row.refusedBecause }),
          run: () => {
            onChoose(
              row.which === 'fast'
                ? { scheduleEngine: 'fast' }
                : { scheduleEngine: 'optimized', scheduleObjective: row.which },
            );
          },
        }));
  const retries: MenuAction[] =
    onRetry === undefined
      ? []
      : reading.retryable.map((objective) => ({
          id: `retry-${objective}`,
          label: `Retry ${OBJECTIVE_LABEL[objective]}`,
          run: () => {
            // `inputHash` is the plan the reader is looking at. Sending it is
            // what lets be-01 refuse a Retry aimed at a screen that has since
            // moved on, rather than re-solving a plan nobody asked about.
            onRetry(objective, optimization.inputHash);
          },
        }));
  const actions = [...switches, ...retries];

  const face = (
    <>
      <span
        data-cue-dot={dotState(optimization)}
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
      />
      <span data-cue-active>{reading.activeLabel}</span>
      {reading.suggestionWords !== null && (
        <span data-cue-suggestion className="text-primary truncate font-medium">
          · {reading.suggestionWords}
        </span>
      )}
    </>
  );

  return (
    <span
      ref={pill}
      data-optimization-cue
      data-cue-suggesting={reading.suggestion ?? undefined}
      className="relative inline-block min-w-0"
      onMouseEnter={() => {
        setPointed(true);
      }}
      onMouseLeave={() => {
        setPointed(false);
      }}
    >
      {actions.length === 0 ? (
        // No writer and nothing to retry: there is nothing to press, so the
        // pill is a disclosure for its own card rather than a menu button with
        // an empty menu — `MenuControl` refuses to open with no item to focus,
        // and it is right to.
        <button
          type="button"
          className={PILL}
          aria-label={reading.sentence}
          aria-expanded={cardOpen}
          aria-describedby={cardOpen ? cardId : undefined}
          data-hint="What the optimizer found for this plan"
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
        >
          {face}
        </button>
      ) : (
        <MenuControl
          name={reading.sentence}
          data-hint="Switch this project between Fast, PRI and Time, or retry a variant"
          align="left"
          open={menuOpen}
          onOpen={onMenuOpen}
          onClose={onMenuClose}
          busy={busy}
          actions={actions}
          trigger={{
            className: PILL,
            'aria-describedby': cardOpen ? cardId : undefined,
            onFocus: () => {
              setFocused(true);
            },
            onBlur: () => {
              setFocused(false);
            },
          }}
        >
          {face}
        </MenuControl>
      )}
      {/*
        One node, always rendered, text changing — so a state change is
        announced rather than silently swapped under a button whose
        `aria-label` no screen reader re-reads.
      */}
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {reading.sentence}
      </span>
      {anchor !== null && (
        <HoverCard id={cardId} anchor={anchor}>
          {reading.rows.map((row) => (
            // `break-words`, and it is load-bearing rather than tidy: a work
            // item name is one unbroken token as often as not, and the phone
            // case in `e2e/project-settings.spec.ts` measured a 192-character
            // name laying 1386px of text inside a 348px card. The card's own
            // box is clamped to the viewport; what its **content** does inside
            // that box is this line.
            <div key={row.which} data-cue-card-row={row.which} className="min-w-0 break-words">
              {/*
                The refusal is appended only where it is not already in the
                words: a variant's reason for being unavailable **is** its
                state, and a card that spelled both said `Plan infeasible · 3
                Work item deadlines` twice in one line.
              */}
              {row.refusedBecause === null || row.refusedBecause === row.stateWords
                ? rowWords(row)
                : `${rowWords(row)} · ${row.refusedBecause}`}
              {row.unmeetable !== null && (
                <ul className="mt-1 min-w-0 list-disc pl-5">
                  {row.unmeetable.map((unmeetable) => (
                    <li
                      key={`${unmeetable.ownerWorkItemId}:${unmeetable.boundWorkItemId}`}
                      data-cue-unmeetable
                      className="min-w-0 break-words"
                    >
                      {unmeetableLine(unmeetable, nameOf, projectStart, today)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </HoverCard>
      )}
    </span>
  );
}

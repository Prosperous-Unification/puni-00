import { defaultSavedPlanName } from '@wbs/domain/saved-plan-default-name';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { SavedPlanListEntryView } from '../../lib/saved-plan-api';
import type { SavedPlanListState } from '../../modules/saved-plans/contract';
import { longInstant } from './short-date';

/** 6.4's sentence, in one place so the test and the surface cannot drift apart. */
export const SAVED_PLANS_UNAVAILABLE = 'Saved plans are not available on this node yet.';

/**
 * Whether be-01 named this saved plan after its own time, because the save
 * came with no name (assumption A-1) and nobody has renamed it since.
 *
 * Asked of be-01's own naming function rather than of a pattern, so a name a
 * reader typed that only looks like a timestamp stays theirs.
 */
export function isNamedByTime(saved: { name: string; createdAt: number }): boolean {
  return saved.name === defaultSavedPlanName(saved.createdAt / 1000);
}

/**
 * A saved plan's name as the shelf shows it: the name somebody gave it, or
 * for a plan be-01 named after its time, that time in the app's words
 * (`14 Oct 2026, 06:41`) rather than be-01's `2026-10-14 06:41:50 UTC`.
 *
 * One spelling of one instant (UI review F-067): the status line, the row, its
 * meta line and the comparison's pickers all said the same moment three ways.
 */
export function savedPlanTitle(saved: { name: string; createdAt: number }): string {
  return isNamedByTime(saved) ? longInstant(saved.createdAt) : saved.name;
}

/**
 * What a row says about its schedule.
 *
 * Three answers and not two. A saved plan either carries a schedule, or carries
 * a recorded reason it does not, or carries neither — and the third is a row
 * saved by a be-01 whose reasons this build has never heard of, which the API
 * layer deliberately passes through rather than narrowing. Saying "no schedule
 * was saved" for it would be true; saying it *without* the reason throws away
 * the only thing distinguishing an infeasible plan from one saved on purpose
 * without its dates.
 */
export function scheduleWords(row: SavedPlanListEntryView): string {
  if (row.scheduleBytes !== null) return 'with its schedule';
  return row.scheduleAbsentReason === null
    ? 'no schedule was saved'
    : `no schedule was saved (${row.scheduleAbsentReason})`;
}

/**
 * A row's meta line as one sentence — when (unless the name already is the
 * time), by whom, and what came along — for its hover card, where a clause the
 * row had to ellipsise is read whole: the line's `data-fact`, the app's hover
 * card in place of a native `title`.
 */
export function metaWords(row: SavedPlanListEntryView): string {
  const who = `saved by ${row.createdBy} ${scheduleWords(row)}`;
  return isNamedByTime(row) ? who : `${longInstant(row.createdAt)} ${who}`;
}

/**
 * A row's name, and the rename that is an edit on it rather than a modal.
 *
 * 8.2's second half. The saved plan itself is immutable — `name` is the one
 * column any `UPDATE` may target, which slice 2's source check enforces — so
 * this is the only edit the shelf offers, and it is offered where the name is
 * rather than behind a dialog that would put a decision in front of the reader
 * before they had one to make.
 *
 * The idiom is `ProjectPage`'s `ProjectNameField`, one screen up, and so are its
 * two lessons. The field is a **component**, mounted on arming, so the focus and
 * the whole-draft selection happen once instead of on every keystroke — an
 * inline callback ref is a new function per render, so React reattaches it each
 * time and a `select()` there would put the draft back under the next character.
 * And a draft that trims to nothing, or to the name the row already has, is a
 * **cancel**: an empty name would leave the row unidentifiable on a shelf whose
 * whole job is telling checkpoints apart, and an unchanged one is a request that
 * changes nothing.
 */
function SavedPlanName({
  row,
  onRename,
}: {
  row: SavedPlanListEntryView;
  onRename: (savedPlanId: string, name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Narrowing rather than a guard: this runs only while the field is mounted.
    if (draft === null || field.current === null) return;
    field.current.focus();
    field.current.select();
    // Once per arming. `draft` in the array would refocus on every keystroke;
    // the arming transition is `null` → a string and that is what is watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft === null]);

  const title = savedPlanTitle(row);
  const commit = () => {
    if (draft === null) return;
    const typed = draft.trim();
    setDraft(null);
    // The words the field opened with are a cancel too: a row named by its
    // time opens on `14 Oct 2026, 06:41`, and leaving it as it opened is not
    // a request to store those words over be-01's name.
    if (typed === '' || typed === row.name || typed === title) return;
    onRename(row.id, typed);
  };

  if (draft === null) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="saved-plan-list__name truncate font-medium" data-fact={title}>
          {title}
        </span>{' '}
        <Button
          variant="ghost"
          size="square"
          type="button"
          className="saved-plan-list__rename size-6 shrink-0"
          // Named for the plan it renames, because a shelf renders one of these
          // per row and `Rename` alone would give a screen reader a list of
          // identical controls.
          aria-label={`Rename ${title}`}
          onClick={() => {
            setDraft(title);
          }}
        >
          <span aria-hidden="true">✎</span>
        </Button>
      </span>
    );
  }
  return (
    <Input
      ref={field}
      className="saved-plan-list__name-field h-7 text-xs"
      aria-label="Saved plan name"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      // Blur commits, which also gives the rename a mouse exit: click anywhere
      // else and the mode resolves instead of sitting open forever.
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') setDraft(null);
      }}
    />
  );
}

/**
 * A project's saved plans, newest first as be-01 orders them.
 *
 * Presentational: it is handed a state and renders it. The read, the broadcast
 * refresh and the save action are the caller's, which is what lets every branch
 * below — including the two nobody can reach by clicking — be a case.
 */
export function SavedPlanList({
  state,
  onRename,
  onCompare,
  onRemove,
}: {
  state: SavedPlanListState;
  /**
   * Renames a row, or absent where nothing may be renamed.
   *
   * Optional because every other branch of this component renders without one
   * and the three states above have no rows to rename. Absent, no row offers
   * the control at all — a ✎ that opens a field whose commit goes nowhere is a
   * worse surface than a name that plainly cannot be changed.
   */
  onRename?: (savedPlanId: string, name: string) => void;
  /** Puts a row on the comparison's left against the current plan; absent offers no Compare. */
  onCompare?: (savedPlanId: string) => void;
  /** Deletes a row once its confirmation is pressed; absent offers no ✕. */
  onRemove?: (savedPlanId: string) => void;
}) {
  if (state.kind === 'unavailable') {
    return (
      <p className="saved-plan-list__note text-muted-foreground text-xs">
        {SAVED_PLANS_UNAVAILABLE}
      </p>
    );
  }
  if (state.kind === 'loading') {
    return (
      <p className="saved-plan-list__note text-muted-foreground text-xs" role="status">
        Loading saved plans…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className="saved-plan-list__note text-destructive text-xs" role="alert">
        Saved plans could not be read ({state.code}).
      </p>
    );
  }
  if (state.rows.length === 0) {
    // The Views panel's empty line, in its words' shape and its ink (F-061).
    return (
      <p className="saved-plan-list__note text-muted-foreground text-xs">No plans saved yet.</p>
    );
  }
  return (
    <ol className="saved-plan-list m-0 flex list-none flex-col p-0" aria-label="Saved plans">
      {state.rows.map((row) => (
        <SavedPlanRow
          key={row.id}
          row={row}
          {...(onRename === undefined ? {} : { onRename })}
          {...(onCompare === undefined ? {} : { onCompare })}
          {...(onRemove === undefined ? {} : { onRemove })}
        />
      ))}
    </ol>
  );
}

/**
 * One saved plan: its name over when and by whom, then Compare and ✕ — the Views
 * row's shape with the facts a checkpoint carries (F-061).
 *
 * The ✕ asks before it deletes. A view is a filter a reader can tick again; a
 * saved plan is a checkpoint of a plan that has since moved, and nothing can
 * write it back, so one stray press must not be the end of it.
 */
function SavedPlanRow({
  row,
  onRename,
  onCompare,
  onRemove,
}: {
  row: SavedPlanListEntryView;
  onRename?: (savedPlanId: string, name: string) => void;
  onCompare?: (savedPlanId: string) => void;
  onRemove?: (savedPlanId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  /**
   * Where the focus goes as the confirmation opens and closes. Pressing ✕
   * unmounts the focused button, so without this the focus fell to `<body>` and
   * the next Escape closed the whole popover instead of the question (Fable
   * review of #453, D): it opens on Keep, the safe answer, and Keep or Escape
   * hands it back to the ✕.
   */
  const keep = useRef<HTMLButtonElement | null>(null);
  const cross = useRef<HTMLButtonElement | null>(null);
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    if (confirming) keep.current?.focus();
    else if (returning) {
      cross.current?.focus();
      setReturning(false);
    }
  }, [confirming, returning]);
  const dismiss = (): void => {
    setConfirming(false);
    setReturning(true);
  };
  /** The question's own Escape answers Keep; the popover's dismiss hook leaves a handled key alone. */
  const keepOnEscape = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    dismiss();
  };
  return (
    <li className="saved-plan-list__row flex items-center gap-1 border-b py-1.5 text-xs last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col">
        {onRename === undefined ? (
          <span className="saved-plan-list__name truncate font-medium">{savedPlanTitle(row)}</span>
        ) : (
          <SavedPlanName row={row} onRename={onRename} />
        )}
        {/*
          The time in the app's words and the reader's own zone (F-067), the
          instant itself in `dateTime` for a machine. Left out for a row whose
          name already is the time: the same moment twice in two lines was
          the defect. (Until 2026-10-14 the words were `toLocaleString`'s, so
          one shelf spelt one instant three ways.)

          Three clauses that wrap between each other and never inside one
          (F-103): one `truncate` line cut a named row at `with it…` in the
          panel's 380 px, which is the one clause that says what the
          checkpoint holds. A name too long for the row still ellipsises
          inside `saved by …`, and the fact (the app's own title; the plan
          draws no native tooltips) carries the whole sentence.
        */}
        <span
          className="saved-plan-list__meta text-muted-foreground flex flex-wrap gap-x-1"
          data-fact={metaWords(row)}
        >
          {!isNamedByTime(row) && (
            <time
              className="saved-plan-list__when whitespace-nowrap"
              dateTime={new Date(row.createdAt).toISOString()}
            >
              {longInstant(row.createdAt)}
            </time>
          )}{' '}
          <span className="saved-plan-list__who max-w-full truncate whitespace-nowrap">
            saved by {row.createdBy}
          </span>{' '}
          <span className="saved-plan-list__schedule whitespace-nowrap">{scheduleWords(row)}</span>
        </span>
      </div>
      {confirming && onRemove !== undefined ? (
        <>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onKeyDown={keepOnEscape}
            onClick={() => {
              setConfirming(false);
              onRemove(row.id);
            }}
          >
            Delete
          </Button>
          <Button
            ref={keep}
            variant="ghost"
            size="sm"
            type="button"
            onClick={dismiss}
            onKeyDown={keepOnEscape}
          >
            Keep
          </Button>
        </>
      ) : (
        <>
          {onCompare !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="px-2"
              aria-label={`Compare ${savedPlanTitle(row)} with the current plan`}
              onClick={() => {
                onCompare(row.id);
              }}
            >
              Compare
            </Button>
          )}
          {onRemove !== undefined && (
            <Button
              ref={cross}
              variant="ghost"
              size="square"
              type="button"
              aria-label={`Delete saved plan ${savedPlanTitle(row)}`}
              data-hint="Delete this saved plan. The plan itself is untouched."
              onClick={() => {
                setConfirming(true);
              }}
            >
              <span aria-hidden="true">✕</span>
            </Button>
          )}
        </>
      )}
    </li>
  );
}

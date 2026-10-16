import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { CellRef } from './cell-navigation';
import type { CellAttacher } from './editable-grid';
import { undoChord } from './keyboard-bindings';
import { opensCheatSheet } from './keyboard-cheat-sheet';
import { FocusIntent } from './live-editing';
import { type Toast, toastKey } from './toasts';

/**
 * How long an armed Ctrl+D waits for its second press.
 *
 * Long enough to read the toast that says what it will do, short enough that a
 * row cannot still be armed when the reader has moved on and forgotten. The
 * timer is the *only* thing that expires an arm — there is no second elapsed
 * check at the confirm, because a check the timer has already made unreachable
 * is a check that cannot fail.
 */
export const ARM_WINDOW_MS = 3000;

const planIsActive = (): boolean => true;

/**
 * The keyboard's two standing listeners: the cheat sheet's chord, and the
 * countdown that disarms a half-pressed delete.
 *
 * Effects rather than handlers because neither belongs to a cell — one is a
 * document-level chord and the other is a timer, and both have to be taken back
 * when the table goes away.
 */
export function usePlanKeyboardEffects({
  setCheatSheetOpen,
  stepStack,
  armedDelete,
  pushToast,
  setArmedDelete,
  dismissToast,
  dReleased,
  isPlanActive = planIsActive,
}: {
  setCheatSheetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stepStack: (direction: 'undo' | 'redo') => Promise<void>;
  armedDelete: { rowId: string; number: string } | null;
  pushToast: (toast: Toast) => void;
  setArmedDelete: React.Dispatch<React.SetStateAction<{ rowId: string; number: string } | null>>;
  dismissToast: (key: string) => void;
  dReleased: React.RefObject<boolean>;
  isPlanActive?: () => boolean;
}) {
  /**
   * `?` anywhere on the page opens the cheat sheet.
   *
   * On the window rather than on the table, because the point is that it works
   * from wherever the reader is — and because the keys it documents are spread
   * over the cells, the toolbar and two pickers, none of which is a single
   * element to hang this on. {@link opensCheatSheet} is what keeps it out of
   * the text boxes: it judges the event's target, so a `?` on its way into a
   * name or the Find box is left alone.
   *
   * Never `preventDefault`: the keystrokes this takes are the ones no field
   * wanted.
   */
  useEffect(() => {
    const openOnQuestionMark = (event: KeyboardEvent) => {
      // Proof: removing this and the undo/redo guard below made `keeps the
      // hidden Plan window shortcuts inactive on Board` issue undo for p2.
      // Watched 2026-10-06.
      if (!isPlanActive()) return;
      if (!opensCheatSheet(event, event.target)) return;
      setCheatSheetOpen(true);
    };
    window.addEventListener('keydown', openOnQuestionMark);
    return () => {
      window.removeEventListener('keydown', openOnQuestionMark);
    };
  }, [setCheatSheetOpen, isPlanActive]);

  /**
   * Cmd/Ctrl+Z anywhere on the page, and Shift with it to go the other way.
   *
   * On the window for the same reason `?` is: the change being reversed could
   * have been made from any cell, any picker or the toolbar, and there is no
   * one element to hang it on. {@link undoChord} is what keeps it out of the
   * text boxes, where the browser's own undo is better than anything this
   * could offer for a word somebody is halfway through typing.
   *
   * `preventDefault` here and nowhere else in this file's listeners: this is
   * the one chord a browser would otherwise act on itself, undoing text in
   * whatever field it last remembers rather than the change that was asked for.
   */
  useEffect(() => {
    const walk = (event: KeyboardEvent) => {
      if (!isPlanActive()) return;
      const direction = undoChord(event, event.target);
      if (direction === null) return;
      event.preventDefault();
      void stepStack(direction);
    };
    window.addEventListener('keydown', walk);
    return () => {
      window.removeEventListener('keydown', walk);
    };
  }, [stepStack, isPlanActive]);

  /**
   * Everything that takes a pending Ctrl+D off, other than another keystroke.
   *
   * The arm is a promise about one row, made in a toast, and it is kept only
   * while the reader is still looking at the row it was made about. Leaving the
   * cell — by Tab, by a chord, or by clicking somewhere else entirely — ends
   * it; so does the window losing the focus, the tab being hidden, and the
   * three seconds running out. Nothing here is a nicety: a row that stays armed
   * across a coffee break is a Ctrl+D that deletes something the person has
   * stopped thinking about.
   *
   * `focusout` rather than a blur handler on the cell: the focus can leave by
   * the pointer, and the cell that was armed may not be the one that had it.
   *
   * **The toast belongs to this effect**, which is the whole of the second
   * change here. It used to be pushed from `armOrDeleteRow` and never taken
   * off, so "Ctrl+D again deletes 020" outlived every one of the ways above —
   * and the delete itself — for the five seconds an info toast lasts. Pushing
   * it where the arm begins and dismissing it in the cleanup ties the sentence
   * to the state that makes it true, re-arms included: a fresh arm is a fresh
   * object, so the cleanup takes the old sentence off before the new one goes
   * up.
   *
   * Proof, two faults. This effect's listeners removed: `leaving the cell
   * disarms it, however the focus went` failed with the row still tinted —
   * watched 2026-08-08. The `dismissToast` below dropped: `the arm toast
   * leaves with the arm, however the arm ends`, `the arm toast leaves when the
   * delete it promised happens` and `a peer renumbering the armed row disarms
   * it` all failed on `expected [ … ] to not include 'Ctrl+D again deletes 020
   * — its children move up'` — watched 2026-08-09.
   */
  useEffect(() => {
    if (armedDelete === null) return undefined;
    const promise: Toast = {
      // `info`: it is context with a way out of it, not a failure waiting to be
      // dismissed — and it takes itself off if the reader walks away.
      kind: 'info',
      text: `Ctrl+D again deletes ${armedDelete.number} — its children move up`,
    };
    pushToast(promise);
    const disarm = () => {
      setArmedDelete(null);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') disarm();
    };
    // A fresh timer per arm, because `armedDelete` is a fresh object per arm:
    // re-arming the same row starts the three seconds again.
    const expiry = setTimeout(disarm, ARM_WINDOW_MS);
    window.addEventListener('focusout', disarm);
    window.addEventListener('blur', disarm);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      dismissToast(toastKey(promise));
      clearTimeout(expiry);
      window.removeEventListener('focusout', disarm);
      window.removeEventListener('blur', disarm);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [armedDelete, pushToast, dismissToast, setArmedDelete]);

  /**
   * A `keyup` of D, which is what the confirming press waits for.
   *
   * On the window rather than on the cell: the chord is pressed in a cell, and
   * the key can be let go after the focus has moved or with the pointer
   * somewhere else entirely. Missing the release would leave a row that can
   * never be confirmed, which is the failure mode that reads as "the shortcut
   * is broken".
   */
  useEffect(() => {
    const released = (event: KeyboardEvent) => {
      if (event.key === 'd' || event.key === 'D') dReleased.current = true;
    };
    window.addEventListener('keyup', released);
    return () => {
      window.removeEventListener('keyup', released);
    };
  }, [dReleased]);
  return {};
}

/**
 * The two pieces of state the keyboard owns and nothing else reads: whether the
 * cheat sheet is open, and which row a first Ctrl+D has armed.
 *
 * Held apart from the handlers because they outlive a keystroke — an armed
 * delete waits three seconds for its second press, and a cheat sheet waits for
 * Escape.
 */
export function usePlanKeyboardState() {
  /** Whether the key bindings are on screen. See {@link KeyboardCheatSheet}. */
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  /**
   * The row one Ctrl+D has pointed at, waiting for the second one that deletes
   * it — or null, which is almost always.
   *
   * The **number** is held beside the id because the toast promised it: "Ctrl+D
   * again deletes 020". A refresh that renumbered the row, or moved it, or took
   * it away has made that sentence untrue, and an arm whose sentence is untrue
   * is disarmed rather than re-aimed. A fresh object per arm, because it is
   * what the three-second timer fires on: re-arming the same row restarts it.
   *
   * State rather than a ref: the armed row is tinted, so this is rendered.
   * Read through {@link live} for the reason `openMenuRowId` is.
   */
  const [armedDelete, setArmedDelete] = useState<{ rowId: string; number: string } | null>(null);

  /**
   * Whether D has been let go since the arm, which the confirm waits for.
   *
   * A ref, because nothing renders it, and it is the guard that makes a *held*
   * Ctrl+D harmless: a key that is still down has produced no `keyup`, so the
   * second press it appears to make can never be one. `event.repeat` is the
   * other half — see {@link onCommandKey}.
   */
  const dReleased = useRef(false);

  /**
   * Whether a command chord's request is still out.
   *
   * A ref rather than `busy`, and the difference is the whole of what it buys:
   * `busy` is state, so two chords in one tick both read the value from before
   * either of them ran. Two Cmd+Enters on the last row are one gesture arriving
   * twice; without this they are two work items.
   */
  const commandInFlight = useRef(false);

  /**
   * Where a structural edit has asked the focus to go once its refetch lands.
   *
   * A ref holding one object for the life of the component, so the two things
   * that read it — the effect below and the Name cell's `onAttach` — are
   * talking about the same intent whichever render they were built in.
   */
  const focusIntent = useRef(new FocusIntent());

  /**
   * Where the readiness walk has got to: the leaf it last put the focus in,
   * and the cell it asked for.
   *
   * The row rather than an index into the list of gaps, because that list is
   * rebuilt by every edit — estimating the row you were standing on takes it
   * out, and an index would then point at whichever row slid into its place. A
   * row that has left the list starts the walk again from the top.
   *
   * A fresh object on every click on purpose: it is what the effect below
   * fires on, so a plan with one gap left focuses that same cell again rather
   * than the button doing nothing.
   */
  const [gapVisit, setGapVisit] = useState<{ rowId: string; cell: CellRef } | null>(null);

  /**
   * The rendered grid, so the focus can be found in the DOM that is committed.
   *
   * An `HTMLElement` rather than an `HTMLTableElement` since `M mobile-cards`:
   * it holds the `<table>` at laptop width and {@link PlanCards}' list below the
   * breakpoint. The attachment functions in `editable-grid.ts` only ask it
   * for `[data-cell]` descendants, so none of them knows the difference.
   */
  const gridElement = useRef<HTMLElement | null>(null);

  /** The editable cell order published only after its rows have committed. */
  const logicalCells = useRef<readonly CellRef[]>([]);
  const attachCell = useRef<CellAttacher>(() => false);
  return {
    cheatSheetOpen,
    setCheatSheetOpen,
    armedDelete,
    setArmedDelete,
    dReleased,
    commandInFlight,
    focusIntent,
    gapVisit,
    setGapVisit,
    gridElement,
    logicalCells,
    attachCell,
  };
}

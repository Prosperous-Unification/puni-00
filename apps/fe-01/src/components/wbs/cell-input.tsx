import { type ComponentProps, useCallback, useEffect, useRef } from 'react';

type PassedThrough = Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
>;

/**
 * The two element types a cell can be.
 *
 * A `<textarea>` is what makes a long name wrap instead of scrolling out of
 * sight, and it carries the same `selectionStart`/`selectionEnd`/`value` the
 * keyboard code reads — so Tab, Backspace and the arrows keep working without
 * knowing which one they are standing in.
 */
export type CellElement = HTMLInputElement | HTMLTextAreaElement;

export interface CellInputProps extends PassedThrough {
  /**
   * Renders a `<textarea>` instead of an `<input>`, so the text wraps.
   *
   * The Name cell is the one that uses it, and it holds real newlines: the
   * first line is the work item's name and everything under it is its notes
   * (`name-notes.ts`). Enter is still bound to "new work item" by the table
   * and preventDefaulted there — the chord that makes it a newline is its own
   * change.
   */
  multiline?: boolean;
  /** Rows at rest. Only meaningful with `multiline`; a `<textarea>` prop, not an input's. */
  rows?: number;
  /**
   * Grows the box to fit its text instead of cropping it at `rows`.
   *
   * Dany, 2026-08-06: the name "must wrap instead of cutting text". A textarea
   * wraps, but at one row it still hides everything past the first line — the
   * name reads as `…dlkfjas;` and the rest is a guess. With this on, the height
   * follows the content whether or not the cell has the focus, capped by
   * `maxRestRows` so one essay does not push the table off the screen.
   *
   * The cap is what keeps a long note from pushing the rest of the plan off
   * the screen now that the notes live in this box: past `maxRestRows` the
   * cell scrolls, and the rendered preview on hover is where a long note is
   * read.
   */
  autoSize?: boolean;
  /** Lines an auto-sizing cell will grow to at rest before it scrolls instead. */
  maxRestRows?: number;
  /** What the server says this cell holds, as it should read on screen. */
  value: string;
  /**
   * Sends what the cell holds, on blur, and only when that differs from the
   * value this cell was last showing.
   *
   * A focus and a blur with nothing typed is not an edit. Sending one anyway
   * writes the value that was on screen when the focus arrived over whatever has
   * happened since — which is a peer's edit reverted by someone who only clicked
   * through the row.
   *
   * @param typed What the box holds now.
   * @param baseline What it was showing when this typing began — rule 2's held
   * value, which is *not* the same as the current server value whenever a peer's
   * edit arrived mid-word and was held back. A cell that edits more than one
   * field at once (the Name cell holds the notes under the name) must diff
   * against this rather than against the row it renders from, or the field the
   * local user never touched reads as one they emptied. Cells with one field
   * ignore it: for them `typed !== baseline` is the whole answer, and this
   * component has already asked it.
   */
  commit: (typed: string, baseline: string) => void;
  /**
   * Called with the node every time React attaches it, which is more than once —
   * the ref callback is rebuilt on each render. Must be idempotent.
   */
  onAttach?: (element: CellElement) => void;
}

/**
 * One editable cell of the table: an uncontrolled input that still follows the
 * server, without ever being remounted to do it.
 *
 * The obvious version of "follow the server" is `key={value}` on an input with a
 * `defaultValue` — a new key, a new node, and the new value is picked up because
 * the old node is gone. That shipped, and it meant a peer editing the field you
 * are typing in unmounted your input mid-word and dropped the focus to the body.
 * Every edit here refetches the whole tree (see {@link WbsTable}), so that is not
 * a rare collision: it is what happens whenever two people work on one row.
 *
 * So the node is kept and its `value` is assigned directly instead. Three rules,
 * and the third is the one worth reading twice:
 *
 * 1. A new server value is written into the node, not rendered — no remount, no
 *    lost focus, no lost caret.
 * 2. Nothing is written while the person is typing in this cell. Their word wins
 *    until they leave it, and their own blur is what resolves the disagreement.
 * 3. A blur sends only what actually differs from the value this cell was last
 *    showing. Clicking through a row writes nothing.
 */
export function CellInput({
  value,
  commit,
  onAttach,
  multiline = false,
  autoSize = false,
  maxRestRows = 4,
  ...rest
}: CellInputProps) {
  const element = useRef<CellElement | null>(null);
  /** The value this node is currently showing, as far as this component knows. */
  const shown = useRef(value);
  /** Whether anyone has typed here since `shown` and the node last agreed. */
  const typed = useRef(false);
  /** The newest server value, readable from a blur handler as well as an effect. */
  const latest = useRef(value);

  /**
   * Sets the height to the text's own height, and caps how tall that gets
   * while the cell is not being written in.
   *
   * `height = 'auto'` first, always: without it `scrollHeight` reports the
   * height the box already has, so a box that grew could never shrink again
   * when the text was deleted.
   *
   * The cap is `max-height` in `em` rather than arithmetic on `scrollHeight`.
   * The first attempt divided `scrollHeight` by `rows` to get a line height,
   * which at one row is the whole content — so the cap computed to four times
   * the text and never capped anything. Ems are the browser's own line
   * measurement and need no guess.
   */
  const resize = useCallback(
    (node: CellElement | null) => {
      if (!autoSize || node === null || !(node instanceof HTMLTextAreaElement)) return;
      const focused = node === document.activeElement;
      node.style.height = 'auto';
      node.style.height = `${String(node.scrollHeight)}px`;
      // Uncapped while it is being written in: the cap keeps the table
      // readable, it is not there to stop anyone writing.
      node.style.maxHeight = focused ? 'none' : `${String(maxRestRows * 1.4)}em`;
      node.style.overflowY = 'auto';
    },
    [autoSize, maxRestRows],
  );

  const sync = useCallback(() => {
    const input = element.current;
    if (input === null || latest.current === shown.current) return;
    // Rule 2. `document.activeElement` rather than a focus/blur flag of our own:
    // the question is only ever asked about right now, and the DOM already knows
    // the answer without a second copy of it to keep in step.
    if (typed.current && input === document.activeElement) return;
    input.value = latest.current;
    shown.current = latest.current;
    typed.current = false;
  }, []);

  useEffect(() => {
    latest.current = value;
    sync();
    // After the sync, not before: the height has to follow the value the node
    // is actually showing, and a peer's edit arrives through `sync` rather
    // than through any keystroke of ours.
    resize(element.current);
  }, [value, sync, resize]);

  /**
   * What leaving a cell means, shared by both elements.
   *
   * Rule 3: only a value that actually differs from what this cell was last
   * showing is sent. Clicking through a row writes nothing.
   */
  const onLeave = (): void => {
    const node = element.current;
    if (node === null) return;
    // Cleared before either branch: it means "typed since `shown` and the node
    // last agreed", and leaving it set would have the *next* visit to this cell
    // hold back a peer's edit on the strength of typing that happened before
    // the focus ever left.
    typed.current = false;
    if (node.value !== shown.current) {
      // No `sync()` afterwards: `shown` is deliberately left holding the old
      // value until the refetch this commit triggers comes back. Advancing it
      // here would be recording a write that has not happened yet, and a failed
      // request would then have nothing left to correct the cell from.
      //
      // `shown.current` is handed over as the baseline for the same reason it
      // is compared against here: it is what this box was showing when the
      // typing started, which a peer's edit held back by rule 2 has
      // deliberately not moved. A composite cell diffs its fields against it.
      commit(node.value, shown.current);
      return;
    }
    // Nothing typed, or typed back to what it already said — so anything rule 2
    // held back while the focus was here is safe to apply now.
    sync();
  };

  const shared = {
    defaultValue: value,
    onChange: () => {
      typed.current = true;
    },
  };

  if (multiline) {
    return (
      <textarea
        // The same props an input takes; React accepts the overlap and the two
        // elements agree on everything this component uses.
        {...(rest as ComponentProps<'textarea'>)}
        ref={(node) => {
          element.current = node;
          if (node !== null) {
            onAttach?.(node);
            // On attach as well as on change: a row arriving from a refresh has
            // never been typed in, and its name is exactly the one most likely
            // to be long.
            resize(node);
          }
        }}
        {...shared}
        onChange={(event) => {
          typed.current = true;
          resize(event.currentTarget);
        }}
        onFocus={(event) => {
          // The cap comes off while the cell is being written in and goes back
          // on when it is left: `resize` reads `document.activeElement` for
          // which of the two this is.
          resize(event.currentTarget);
          rest.onFocus?.(event as unknown as React.FocusEvent<HTMLInputElement>);
        }}
        onBlur={(event) => {
          resize(event.currentTarget);
          onLeave();
        }}
      />
    );
  }

  return (
    <input
      {...rest}
      ref={(node) => {
        element.current = node;
        if (node !== null) onAttach?.(node);
      }}
      {...shared}
      onBlur={onLeave}
    />
  );
}

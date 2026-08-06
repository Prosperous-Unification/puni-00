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
   * Enter is not a newline in one of these: the table binds it to "new work
   * item" and preventDefaults it, which is the behaviour a bulleted list has
   * and the reason a name is one line of meaning however many lines it takes
   * to show.
   */
  multiline?: boolean;
  /** Visible rows while this textarea has the focus; ignored for an input. */
  expandedRows?: number;
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
   */
  commit: (typed: string) => void;
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
  expandedRows = 6,
  ...rest
}: CellInputProps) {
  const element = useRef<CellElement | null>(null);
  /** The value this node is currently showing, as far as this component knows. */
  const shown = useRef(value);
  /** Whether anyone has typed here since `shown` and the node last agreed. */
  const typed = useRef(false);
  /** The newest server value, readable from a blur handler as well as an effect. */
  const latest = useRef(value);

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
  }, [value, sync]);

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
      commit(node.value);
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
          if (node !== null) onAttach?.(node);
        }}
        {...shared}
        onFocus={(event) => {
          // Grown while it is being written in, back to one line when it is
          // not: a table of six-line boxes is unreadable, and a one-line box
          // is unwritable for anything longer than a sentence.
          event.currentTarget.rows = expandedRows;
          rest.onFocus?.(event as unknown as React.FocusEvent<HTMLInputElement>);
        }}
        onBlur={(event) => {
          event.currentTarget.rows = 1;
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

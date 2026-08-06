import { type ComponentProps, useCallback, useEffect, useRef } from 'react';

type PassedThrough = Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
>;

export interface CellInputProps extends PassedThrough {
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
  onAttach?: (element: HTMLInputElement) => void;
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
export function CellInput({ value, commit, onAttach, ...rest }: CellInputProps) {
  const element = useRef<HTMLInputElement | null>(null);
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

  return (
    <input
      {...rest}
      ref={(node) => {
        element.current = node;
        if (node !== null) onAttach?.(node);
      }}
      defaultValue={value}
      onChange={() => {
        typed.current = true;
      }}
      onBlur={() => {
        const input = element.current;
        if (input === null) return;
        // Cleared before either branch: it means "typed since `shown` and the
        // node last agreed", and leaving it set would have the *next* visit to
        // this cell hold back a peer's edit on the strength of typing that
        // happened before the focus ever left.
        typed.current = false;
        if (input.value !== shown.current) {
          // No `sync()` afterwards: `shown` is deliberately left holding the old
          // value until the refetch this commit triggers comes back. Advancing it
          // here would be recording a write that has not happened yet, and a
          // failed request would then have nothing left to correct the cell from.
          commit(input.value);
          return;
        }
        // Nothing typed, or typed back to what it already said — so anything rule
        // 2 held back while the focus was here is safe to apply now.
        sync();
      }}
    />
  );
}

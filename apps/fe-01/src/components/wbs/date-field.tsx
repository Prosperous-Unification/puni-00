import { type ComponentProps, useEffect, useRef } from 'react';

type PassedThrough = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'onBlur'
>;

export interface DateFieldProps extends PassedThrough {
  /** The day the server holds, as `YYYY-MM-DD`, or `''` for no day at all. */
  value: string;
  /**
   * Sends the day in the box, as `YYYY-MM-DD` or `''` for "no day".
   *
   * Called on the way out of the field and on Enter, and only when what is in
   * the box differs from what was last sent or last read from the server. A
   * focus and a blur with nothing typed is not an edit — the same rule
   * {@link import('./cell-input').CellInput}'s `commit` keeps, for the same
   * reason: sending anyway writes the value that was on screen when the focus
   * arrived over whatever has happened since.
   */
  commit: (day: string) => void;
}

/**
 * A `<input type="date">` that saves the date somebody typed, rather than every
 * date they passed through on the way to it.
 *
 * **The fault it exists for.** A native date input fires `change` on *every*
 * segment that completes, so typing a year digit by digit fires four of them:
 * `0002-08-17`, `0020-08-17`, `0202-08-17`, `2026-08-17`. Each one was
 * committed, each commit refetched the project, and the controlled `value`
 * re-rendered the box from the server's answer mid-word — so the year segment
 * reset under the caret and the remaining digits were lost. A plan typed into
 * on 2026-08-09 was saved starting in **year 0002**, and one intermediate year
 * (`82026`) was refused with a raw `http_422`. Observed live, in Chrome.
 *
 * **The rule, and it is one rule: the box is left, then it is sent.** Nothing
 * is committed while the field has the focus, however many `change` events the
 * browser fires into it — Enter is the one way to send without leaving. That is
 * deliberately the *same* rule in jsdom and in a browser, which is what makes a
 * jsdom test an honest oracle for it: a rule that tried to tell segment typing
 * apart from a calendar pick would be judged by an environment that performs
 * neither.
 *
 * The cost, stated twice over. A date chosen from the native calendar popup is
 * saved when the reader moves on rather than the instant they click a day —
 * Chrome returns the focus to the input when that popup closes, so there is no
 * earlier moment this component can see, and "saved when you leave the field"
 * is what every other box on this page already does. And **Tab does not leave a
 * date input in Chrome**: it steps between the day, month and year segments, so
 * a keyboard leaves this box on the third Tab or on Enter. Measured on
 * 2026-08-09 rather than assumed — `document.activeElement` was still the box
 * after a Tab, which is why `e2e/gantt.spec.ts` blurs rather than tabbing and
 * why Enter is here at all. A row's `Not before` is unaffected: the table's own
 * `onTabKey` takes Tab from that cell and moves the caret itself.
 *
 * **Uncontrolled while it is on screen**, which is the other half of the fault:
 * a `value` prop is React re-asserting the server's answer on every render, and
 * a re-assertion that lands between two keystrokes is the lost digit. The
 * server's answer is assigned to the node instead, and never over a reader who
 * is in the box — the same shape `CellInput` uses to hold a half-typed name
 * against a peer's edit.
 *
 * Proof: `commit` moved back onto an `onChange` here, the table's `holds a date
 * typed one segment at a time, and saves the one that was typed` failed on
 * `expected [ '0002-08-17', '0020-08-17', …(2) ] to deeply equal []` and its
 * `Not before` twin on `expected [ …(4) ] to deeply equal []`; the
 * `document.activeElement` guard in the effect removed, `never writes an answer
 * over a reader who is in the box` failed on `expected '2026-09-01' to be
 * '2026-08-17'`. All watched, 2026-08-09.
 */
export function DateField({ value, commit, onKeyDown, ...rest }: DateFieldProps) {
  const box = useRef<HTMLInputElement | null>(null);
  /**
   * The day this box last agreed with the server about — what a commit is
   * compared against.
   *
   * Written on the way out as well as on the way in, so a second blur with
   * nothing typed in between sends nothing, and a refetch that answers with the
   * day just sent is not a change to react to.
   */
  const agreed = useRef(value);

  useEffect(() => {
    agreed.current = value;
    const node = box.current;
    if (node === null) return;
    // Never over a reader who is in the box: this is the assignment that used
    // to reset the year segment mid-word.
    if (node === document.activeElement) return;
    if (node.value !== value) node.value = value;
  }, [value]);

  const commitIfChanged = (): void => {
    const node = box.current;
    // The ref is this component's own wiring, not a condition to model: a blur
    // can only have come from the node React attached here.
    if (node === null) throw new Error('A date field was left without ever being attached.');
    const typed = node.value;
    if (typed === agreed.current) return;
    // A date input reports `''` for a date it cannot parse as well as for one
    // that was cleared, and `badInput` is what tells the two apart. Leaving a
    // half-typed date behind must not clear a constraint somebody set — that is
    // the same lost edit this whole component is about, one gesture along.
    // Proof: this line removed, `leaves a half-typed date alone instead of
    // clearing the day it had` failed on `expected [ '' ] to deeply equal []`.
    // Watched, 2026-08-09.
    if (typed === '' && node.validity.badInput) return;
    agreed.current = typed;
    commit(typed);
  };

  return (
    <input
      {...rest}
      type="date"
      ref={box}
      // Uncontrolled: see the note above. `defaultValue` seeds the box, the
      // effect keeps it in step, and neither of them writes over typing.
      defaultValue={value}
      onKeyDown={(event) => {
        // Before the caller's handler, because the caller's is what moves the
        // caret on: `Ctrl/⌘ + Enter` from a row's date cell lands in the next
        // row, and the date has to have been sent by then.
        if (event.key === 'Enter') commitIfChanged();
        onKeyDown?.(event);
      }}
      onBlur={commitIfChanged}
    />
  );
}

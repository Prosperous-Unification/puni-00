import { type ComponentProps, useCallback, useEffect, useRef } from 'react';

import type { CellElement } from './editable-grid';
import { LiveField, type SendEdit } from './live-editing';
import { splitNameCell } from './name-notes';

type PassedThrough = Omit<
  ComponentProps<'input'>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'ref'
>;

export interface CellInputProps extends PassedThrough {
  /**
   * Which cell of the grid this is — `rowId::columnId`, the same string every
   * other part of the keyboard finds a cell by.
   *
   * Rendered as this box's `data-cell` rather than passed beside one: two
   * spellings of one identity is how the navigation and the held refusal come
   * to disagree about which box they are talking about.
   *
   * Required, and that is the point: a cell with no identity has nowhere to
   * leave a refused draft, and a component that silently held nothing would be
   * the hold that cannot fail.
   */
  cellKey: string;
  /**
   * Renders a `<textarea>` instead of an `<input>`, so the text wraps.
   *
   * The Name cell is the one that uses it, and it holds real newlines: the
   * first line is the work item's name and everything under it is its notes
   * (`name-notes.ts`). Enter is the browser's own newline there since
   * `command-keys` — a new work item is Ctrl+N, or Cmd/Ctrl+Enter at the end
   * of the plan.
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
   * What keeps a long note from pushing the rest of the plan off the screen
   * now that the notes live in this box is one of two things, per face: the
   * card's is `maxRestRows`, past which the cell scrolls; the table's is
   * {@link CellInputProps.restShowsFirstLineOnly}, which gives the notes no
   * height at rest at all. The rendered preview on hover is where the table's
   * are read.
   */
  autoSize?: boolean;
  /**
   * Lines an auto-sizing cell will grow to at rest before it scrolls instead.
   *
   * Ignored under {@link CellInputProps.restShowsFirstLineOnly}, which decides
   * the at-rest height by measuring rather than by counting lines.
   */
  maxRestRows?: number;
  /**
   * Shows only the first line of the text while the cell is not being written
   * in — the whole of it, wrapped, and nothing under it.
   *
   * The Name cell's, and the reason it exists: that box holds the name on its
   * first line and the notes under it (`name-notes.ts`), so a plan with notes
   * was mostly notes at rest and the name — the one part that must always be
   * readable — competed for its own box. At rest the height is the wrapped
   * height of the first line at this box's current width, **measured**: a name
   * long enough to wrap is still shown whole, which is why `maxRestRows` does
   * not bind a cell that sets this.
   *
   * Hidden rather than clipped-but-scrollable: `overflow-y: hidden` at rest and
   * `auto` while focused. A clamped box that still scrolled would put the notes
   * one wheel-turn away, which is the height cap this replaces wearing a hat.
   *
   * The card face deliberately does not set it — a phone has no hover, so edit
   * would be the only place left to read a note.
   */
  restShowsFirstLineOnly?: boolean;
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
   * The rules that decide whether this is called at all, and what happens to
   * what it answers, are {@link LiveField}'s — this component only renders one.
   */
  commit: SendEdit;
  /**
   * Called with the node every time React attaches it, which is more than once —
   * the ref callback is rebuilt on each render. Must be idempotent.
   */
  onAttach?: (element: CellElement) => void;
  /**
   * Called with the node on every keystroke, before anything is committed.
   *
   * For a cell that has to react to text as it is typed rather than when it is
   * left — the folded estimate cell opens its `@` people picker from here. It
   * is deliberately given the node rather than the text: the caller both reads
   * what is in the box and, on a pick, writes the mention back out of it.
   *
   * A prop rather than the `onInput` this component would otherwise pass
   * through: `onChange` is the event this component already treats as "somebody
   * typed here", and hanging a second meaning off a second name for the same
   * event is how the two come to disagree about which keystrokes counted.
   */
  onTyped?: (box: CellElement) => void;
}

/**
 * One editable cell of the table, as a box: the DOM face of a {@link LiveField}.
 *
 * Everything about *what a field knows* — the value the server last sent, the
 * word somebody is halfway through, the draft be-01 refused, the request that
 * is still out — is the field's, and lives in `live-editing.ts` so that a
 * second renderer can mount the same field. What is left here is the part that
 * is genuinely about an `<input>`: which of the two elements to render, the
 * height a textarea takes, and which browser events mean "somebody typed" and
 * "somebody left".
 */
export function CellInput({
  cellKey,
  value,
  commit,
  onAttach,
  onTyped,
  multiline = false,
  autoSize = false,
  maxRestRows = 4,
  restShowsFirstLineOnly = false,
  ...rest
}: CellInputProps) {
  /**
   * This face's field. Constructed once per mount, which is what re-derives
   * everything but the held refusal from the server value — see
   * {@link LiveField} for what a new face inherits and what it does not.
   */
  const held = useRef<LiveField>(undefined);
  held.current ??= new LiveField(cellKey, value);
  const field = held.current;

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
   *
   * Under {@link CellInputProps.restShowsFirstLineOnly} the at-rest height is
   * the first line's instead, and the browser is asked for it the only way it
   * answers such a question: the box is made to hold that line alone for the
   * length of one `scrollHeight` read. The swap is safe on two counts and on
   * no others — it is synchronous, so nothing else can run between taking the
   * text out and putting it back, and it never happens while the cell has the
   * focus, where it would drop the caret to the end. Everything downstream —
   * the blur that follows, {@link LiveField}'s diff against its baseline, the
   * next person to click into the cell — sees the whole text.
   */
  const resize = useCallback(
    (node: CellElement | null) => {
      if (!autoSize || node === null || !(node instanceof HTMLTextAreaElement)) return;
      const focused = node === document.activeElement;
      const clamped = restShowsFirstLineOnly && !focused;
      // `height = 'auto'` before the swap as well as before the read: the
      // measurement below is of the text, not of the box it is currently in.
      node.style.height = 'auto';
      const whole = node.value;
      // The same rule that decides which part of this box is the name, called
      // rather than copied — a second `indexOf('\n')` here is how the box and
      // the field come to disagree about where the first line ends.
      if (clamped) node.value = splitNameCell(whole).name;
      node.style.height = `${String(node.scrollHeight)}px`;
      if (clamped) node.value = whole;
      // Uncapped while it is being written in: the cap keeps the table
      // readable, it is not there to stop anyone writing. Uncapped at rest too
      // when the first line is all that shows — the height above is already
      // the whole of what there is to see, and a cap over it would crop a name
      // that wrapped.
      node.style.maxHeight =
        focused || restShowsFirstLineOnly ? 'none' : `${String(maxRestRows * 1.4)}em`;
      // Hidden, not `auto`: a clamped box that scrolled would hand back the
      // notes a wheel-turn at a time.
      node.style.overflowY = clamped ? 'hidden' : 'auto';
    },
    [autoSize, maxRestRows, restShowsFirstLineOnly],
  );

  // Assigned during render rather than in an effect, and that is deliberate:
  // `commit` closes over the row this cell belongs to and is rebuilt on every
  // render, an effect would publish it one render late, and a chord can be
  // pressed before effects flush. `LiveField.send` says the same thing from
  // the other side.
  field.send = commit;
  field.afterSync = resize;

  // `resize` is a dependency as well as the value: it is rebuilt when the cap
  // changes, and the box has to be re-measured against the new one.
  useEffect(() => {
    field.serverSaid(value);
  }, [field, value, resize]);

  const takeNode = (node: CellElement | null): void => {
    field.takeNode(node);
    if (node !== null) onAttach?.(node);
  };

  /** One keystroke: the field's own bookkeeping, then the caller's. */
  const tookAKeystroke = (node: CellElement): void => {
    field.tookAKeystroke();
    onTyped?.(node);
  };

  const shared = {
    'data-cell': cellKey,
    defaultValue: value,
    onChange: (event: { currentTarget: CellElement }) => {
      tookAKeystroke(event.currentTarget);
    },
  };

  if (multiline) {
    return (
      <textarea
        // The same props an input takes; React accepts the overlap and the two
        // elements agree on everything this component uses.
        {...(rest as ComponentProps<'textarea'>)}
        ref={(node) => {
          takeNode(node);
          // On attach as well as on change: a row arriving from a refresh has
          // never been typed in, and its name is exactly the one most likely
          // to be long.
          if (node !== null) resize(node);
        }}
        {...shared}
        onChange={(event) => {
          tookAKeystroke(event.currentTarget);
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
          void field.leave();
        }}
      />
    );
  }

  return (
    <input
      {...rest}
      ref={takeNode}
      {...shared}
      onBlur={() => {
        void field.leave();
      }}
    />
  );
}

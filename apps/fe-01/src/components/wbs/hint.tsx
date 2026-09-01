import { useEffect, useState } from 'react';

import { type AnchorRect, HoverCard } from '@/components/wbs/hover-card';

/**
 * The attribute a control carries its hint in, in place of a `title`.
 *
 * A `title` is the **browser's** tooltip, not this app's: Chromium waits about
 * a second before showing one, draws it in the platform's own chrome rather
 * than the page's, and puts it where the pointer is rather than under the
 * control. Nothing in a stylesheet reaches any of that, and where a card and a
 * `title` describe the same pixels the browser's raced the app's — which
 * `start-date-hover-card` fixed for one cell and the folded step cell's own
 * comment had said a fortnight earlier.
 *
 * Dany, 2026-08-31: _"make sure that all places where we show hint — this is
 * not slow system hint, but custom instant pretty hint"_. So the words move to
 * this attribute, {@link HintLayer} draws them in the page's own card with no
 * timer, and no control in this app carries a `title` it means as a hint.
 *
 * **The words stay in the DOM** rather than living in a closure, for the reason
 * `data-start-said` does: several oracles read a control's hint back out, and
 * none of them can hover. Anything that read a `title` reads this instead.
 */
export const HINT_ATTRIBUTE = 'data-hint';

/**
 * What a component adds to its own props to let a caller hint it.
 *
 * A wrapper component's props are an interface, not a set of intrinsic JSX
 * attributes, so React's blanket permission for `data-*` on a DOM element does
 * not reach it: `<Button data-hint="…">` is a type error until the component
 * says it takes one. Extending this is what says so, and it is deliberately one
 * optional string rather than a `Record<string, unknown>` escape hatch.
 */
export interface Hintable {
  [HINT_ATTRIBUTE]?: string;
}

/** The selector {@link HintLayer} finds a hinted control by. */
const HINTED = `[${HINT_ATTRIBUTE}]`;

/** The id of the one card this layer draws, so a hinted control can point at it. */
const HINT_CARD_ID = 'hint-card';

/** What the layer is showing: the words, and the rectangle to place them under. */
interface OpenHint {
  words: string;
  anchor: AnchorRect;
  /** The control the words belong to, held so `aria-describedby` can be taken off it again. */
  node: HTMLElement;
}

/**
 * The one card every hint in this app is drawn in, mounted once per document.
 *
 * **One listener and one piece of state**, and that is the whole of why it is a
 * layer rather than a wrapper component at ninety-odd call sites. Every
 * `pointerover` replaces the reading outright — the hinted control the pointer
 * is now inside, or none — so there is no departure to miss and no stale
 * opening that can outlive the pointer. A per-control `onMouseEnter` /
 * `onMouseLeave` pair is the arrangement that can drop half of itself; this one
 * cannot, because there is nothing to drop.
 *
 * `pointerover` alone closes as well as opens: the pointer is always inside
 * some element or other, so leaving a hinted control fires the event on
 * whatever it moved to, and that element's `closest` answers null.
 * `pointerleave` on the document is the one case the bubbling event cannot
 * report — the pointer leaving the window entirely.
 *
 * **The touch seam**, as on the Gantt's bars and the table's rows: Chromium
 * synthesizes a whole mouse sequence from a tap, and a tap has no departure
 * behind it, so a card opened on one would be stuck on whatever was touched
 * last. Only a mouse opens a hint; a phone gets the control's own label.
 *
 * A **disabled `Button` is out of reach**, and it is a real limit rather than
 * an oversight. `buttonVariants`' base carries `disabled:pointer-events-none`,
 * so a disabled control is not a hit target and no `pointerover` ever names it
 * — measured in Chromium, `elementFromPoint` at a disabled Undo's own centre
 * answering the toolbar `<div>`. The controls that affects are Undo, Redo and
 * Reset layout, whose hints restate what their labels already say. Where the
 * hint is the *reason* a control is off, it is written on the live `<label>`
 * around the control rather than on the disabled `<input>` inside it —
 * `wbs-table.tsx`'s facet boxes — so that sentence still reaches a reader.
 *
 * The keyboard opens the same card from `focusin`, for the reason the Start
 * cell's does: a `title` on a focusable control is announced as its
 * description, so a card only a pointer can open is data withheld from anybody
 * who does not use one. Escape closes it without leaving the control.
 */
export function HintLayer(): React.JSX.Element | null {
  const [open, setOpen] = useState<OpenHint | null>(null);

  useEffect(() => {
    /** The hinted control an event happened inside, and the words it carries. */
    const hintAt = (target: EventTarget | null): OpenHint | null => {
      if (!(target instanceof Element)) return null;
      const node = target.closest(HINTED);
      if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return null;
      const words = node.getAttribute(HINT_ATTRIBUTE);
      // An empty hint is a control that has nothing to say today — a toggle
      // whose reason is only there while it is off, say — and is not a fault:
      // the attribute is written from a value that may be absent. No card.
      if (words === null || words === '') return null;
      const box = node.getBoundingClientRect();
      return {
        words,
        anchor: { left: box.left, top: box.top, bottom: box.bottom },
        // Narrowed rather than cast: an `SVGElement` is an `HTMLElement` for
        // everything used here — `setAttribute`, `removeAttribute` — but the
        // two do not share a type, so the state holds the wider one.
        node: node as HTMLElement,
      };
    };

    const pointed = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse') return;
      setOpen(hintAt(event.target));
    };
    const left = (): void => {
      setOpen(null);
    };
    const focused = (event: FocusEvent): void => {
      setOpen(hintAt(event.target));
    };
    const blurred = (): void => {
      setOpen(null);
    };
    const escaped = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null);
    };

    document.addEventListener('pointerover', pointed);
    document.addEventListener('pointerleave', left);
    document.addEventListener('focusin', focused);
    document.addEventListener('focusout', blurred);
    document.addEventListener('keydown', escaped);
    // A card is placed from a rectangle measured once, so anything that moves
    // the control out from under it closes it rather than leaving it adrift.
    // Capture, because the scroll that matters is the table frame's and a
    // scroll event does not bubble.
    document.addEventListener('scroll', left, true);
    window.addEventListener('resize', left);
    return () => {
      document.removeEventListener('pointerover', pointed);
      document.removeEventListener('pointerleave', left);
      document.removeEventListener('focusin', focused);
      document.removeEventListener('focusout', blurred);
      document.removeEventListener('keydown', escaped);
      document.removeEventListener('scroll', left, true);
      window.removeEventListener('resize', left);
    };
  }, []);

  /*
    The description, written onto the control itself while its card is open.

    Imperative because the control is not this component's to render — it is any
    of ninety-odd elements across the app — and `aria-describedby` has to name
    an id that exists. The cleanup takes it off again, so a control that has
    been hinted is indistinguishable at rest from one that never was.

    A control that already had an `aria-describedby` keeps it: the hint is added
    to the list and removed from it, rather than replacing what was there.
  */
  useEffect(() => {
    if (open === null) return undefined;
    const { node } = open;
    const had = node.getAttribute('aria-describedby');
    node.setAttribute('aria-describedby', had === null ? HINT_CARD_ID : `${had} ${HINT_CARD_ID}`);
    return () => {
      if (had === null) node.removeAttribute('aria-describedby');
      else node.setAttribute('aria-describedby', had);
    };
  }, [open]);

  if (open === null) return null;
  return (
    <HoverCard id={HINT_CARD_ID} anchor={open.anchor} compact>
      {open.words}
    </HoverCard>
  );
}

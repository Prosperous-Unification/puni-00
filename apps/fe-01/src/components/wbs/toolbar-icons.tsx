import type { SVGProps } from 'react';

/**
 * What every toolbar icon shares, and why each part of it is load-bearing.
 *
 * - `stroke="currentColor"` and no `fill`: the icon takes the colour of the
 *   control it sits in, so an `outline` button, a `ghost` one and a disabled
 *   one need no icon variant of their own.
 * - `width`/`height` in `em`: it takes the button's font size, so `size="sm"`
 *   and `size="square"` draw the same shape at the size the text beside it
 *   would have been.
 * - `aria-hidden` and `focusable="false"`: every control that carries one of
 *   these already has an `aria-label`, and an icon that named itself as well
 *   would give that control two names. `focusable` is IE/Edge's separate
 *   answer for the same question — an SVG is a tab stop there without it.
 *
 * `viewBox` is the 24×24 grid the three shapes below are drawn on, so their
 * stroke weights match without each one repeating the number.
 */
const ICON: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
};

/**
 * The cheat-sheet control's icon: a keyboard, drawn.
 *
 * It replaces `⌨` (U+2328), which macOS has no colour presentation for and
 * renders as a hairline outline in the UI font at button size — illegible,
 * reported by Dany on 2026-08-29. The fix is not a different codepoint: the
 * next one has the same class of problem on the next platform. A glyph the app
 * draws renders identically everywhere; a glyph it names does not.
 */
export function KeyboardIcon(): React.JSX.Element {
  return (
    <svg {...ICON}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  );
}

/**
 * `Expand all`'s icon: two chevrons pointing **apart**.
 *
 * Apart and together rather than the single down/right chevron a disclosure
 * control uses, because this table already spends that shape on a row: `▾`/`▸`
 * opens and closes one branch. One shape with a per-row meaning and a per-plan
 * meaning is a shape a reader has to disambiguate by position, which is what
 * `design.md` D2 refuses.
 */
export function ExpandIcon(): React.JSX.Element {
  return (
    <svg {...ICON}>
      <path d="M7 9l5-5 5 5" />
      <path d="M7 15l5 5 5-5" />
    </svg>
  );
}

/** `Collapse all`'s icon: the same two chevrons, pointing together. */
export function CollapseIcon(): React.JSX.Element {
  return (
    <svg {...ICON}>
      <path d="M7 4l5 5 5-5" />
      <path d="M7 20l5-5 5 5" />
    </svg>
  );
}

/**
 * `Project settings`' icon: a gear.
 *
 * The one control on the bar that stands for three (`project-config-modal`, D5):
 * `Teams`, `Priorities` and `Phases` were three labelled buttons somebody uses
 * once and then not for weeks, permanently beside `Add work item` and `Undo` on a
 * bar whose width is the scarce resource. The word moved into the button's
 * `aria-label`, exactly as `Expand all`'s did; the phone's sheet, which has the
 * room, shows the label beside this.
 */
export function SettingsIcon(): React.JSX.Element {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2" />
    </svg>
  );
}

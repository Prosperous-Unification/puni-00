import { Fragment, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { usePageShortcutsSuspended } from '@/components/ui/page-shortcuts';

import {
  type AltStyle,
  altStyleOf,
  KEY_BINDINGS,
  showKeys,
  WHERE_ORDER,
} from './keyboard-bindings';

export type { KeyPress } from './keyboard-bindings';
// The predicate moved to `keyboard-bindings.ts`, where `isPageShortcut` can
// reach it without a component importing a component. Re-exported because this
// is the module its callers ask, and a move is not a reason to change them.
export { opensCheatSheet } from './keyboard-bindings';

/**
 * What `navigator` says about the platform, or nothing.
 *
 * Read through `Reflect.get` rather than as a property: `navigator.platform`
 * is deprecated, absent in some runtimes and empty in others, so it is probed
 * and type-checked rather than assumed. Missing is a modeled answer here —
 * {@link altStyleOf} renders `⌥/Alt` for it — not an invariant to throw on.
 */
function navigatorSaid(field: 'platform' | 'userAgent'): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const said: unknown = Reflect.get(navigator, field);
  return typeof said === 'string' ? said : undefined;
}

export interface KeyboardCheatSheetProps {
  onClose: () => void;
  /**
   * Which keyboard the chords are labelled for. Detected from `navigator` when
   * absent; passed in by tests, which are not on the Mac they assert about.
   */
  altStyle?: AltStyle;
}

const TITLE_ID = 'keyboard-cheat-sheet-title';

/**
 * Every key binding this table has, on screen, in one modal dialog.
 *
 * Rendered only while it is open, so mounting is opening: the element that had
 * the focus is stored on mount and focused again on unmount, which is why
 * closing by Escape, by the ✕ and by clicking away all put the focus back
 * without any of them saying so.
 *
 * There is no focus trap. Tab leaves the dialog, which is a real gap and a
 * named non-goal of the change that added this — the ways out it does prove
 * are Escape, the ✕ and the backdrop. It is also precisely why
 * {@link usePageShortcutsSuspended} is called below rather than only from
 * `ModalContent`: Tab out of this sheet lands in a cell of the table behind it,
 * and until this change Ctrl+N there created a work item nobody could see. This
 * sheet is a modal, so it holds the page's keyboard like one.
 *
 * Hand-rolled rather than Radix, and that is a decision rather than an
 * oversight — `openspec/changes/shadcn-foundation/design.md`, the routing
 * matrix. What this change gives it is the token palette and the shared rule;
 * its markup, its focus handling and every one of its tests are untouched.
 *
 * The list itself is {@link KEY_BINDINGS} and nothing else. A binding written
 * out here instead would be a second description of the keyboard, and the
 * second one is always the one that goes stale.
 */
export function KeyboardCheatSheet({ onClose, altStyle }: KeyboardCheatSheetProps) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const style = altStyle ?? altStyleOf(navigatorSaid('platform'), navigatorSaid('userAgent'));

  // Mounting is opening, so the sheet is open for exactly as long as this
  // component exists.
  usePageShortcutsSuspended(true);

  useEffect(() => {
    const had = document.activeElement;
    returnFocusTo.current = had instanceof HTMLElement ? had : null;
    const panel = dialog.current;
    // React attaches refs before effects run; a null here is not a condition
    // to model around, it is this component being wrong about itself.
    if (panel === null) throw new Error('The cheat sheet was mounted without its dialog');
    panel.focus();
    return () => {
      const back = returnFocusTo.current;
      // Still on the page: the row it belonged to may have been deleted by
      // somebody else while the sheet was open, and focusing a detached node
      // silently sends the focus to the body instead of where it was.
      // Proof: this whole cleanup removed, `takes the focus on open and gives
      // it back on close` failed with the focus on the body. Watched,
      // 2026-08-07.
      if (back?.isConnected === true) back.focus();
    };
  }, []);

  return (
    // Presentation, because it is a backdrop: the dialog inside it is the
    // thing, and Escape and the ✕ are the ways out that assistive technology
    // is told about. The click and the key handler are on it together, so a
    // click away and Escape are one element's business.
    <div
      role="presentation"
      data-cheat-sheet-backdrop
      onClick={(event) => {
        // The backdrop itself, never a click that started inside the panel and
        // bubbled out — that one is a person reading, not leaving.
        // Proof: narrowed to a bare `onClose()`, `stays open when the click
        // lands inside it` failed on a sheet that closed when its own heading
        // was clicked. Watched, 2026-08-07.
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={dialog}
        // Focusable without being in the tab order: the focus is put here on
        // open so the next Escape lands in this dialog rather than in the
        // table behind it.
        tabIndex={-1}
        className="bg-background text-foreground max-h-[80vh] max-w-[46em] overflow-y-auto rounded-lg border p-5 shadow-lg"
      >
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id={TITLE_ID} className="text-lg font-semibold tracking-tight">
            Keyboard shortcuts
          </h2>
          <Button
            variant="ghost"
            size="square"
            type="button"
            aria-label="Close the keyboard shortcuts"
            title="Close (Escape)"
            onClick={onClose}
            className="ml-auto"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
        {WHERE_ORDER.map((where) => (
          <section key={where} className="mb-4 last:mb-0">
            <h3 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
              {where}
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
              {KEY_BINDINGS.filter((binding) => binding.where === where).map((binding) => (
                <Fragment key={binding.keys}>
                  <dt className="whitespace-nowrap">
                    <kbd className="bg-muted text-foreground rounded-sm border px-1.5 py-0.5 text-xs">
                      {showKeys(binding.keys, style)}
                    </kbd>
                  </dt>
                  <dd>{binding.does}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

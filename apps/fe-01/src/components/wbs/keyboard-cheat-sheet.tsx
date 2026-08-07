import { Fragment, useEffect, useRef } from 'react';

import {
  type AltStyle,
  altStyleOf,
  isTypingInto,
  KEY_BINDINGS,
  type KeyPress,
  showKeys,
  WHERE_ORDER,
} from './keyboard-bindings';

export type { KeyPress } from './keyboard-bindings';

/**
 * Whether this keystroke should open the cheat sheet.
 *
 * `?` alone, and only where it is not being typed. A modifier means somebody
 * else's shortcut — the same rule the grid's arrows apply.
 *
 * Proof: the `isTypingInto` guard removed, `a question mark typed into a name
 * stays a question mark` failed with the sheet open over the row. Watched,
 * 2026-08-07.
 *
 * @param pressed The keystroke, as much of it as this decision needs.
 * @param target What the keystroke was aimed at — `event.target`, not the focus.
 * @returns True when the sheet should open.
 */
export function opensCheatSheet(pressed: KeyPress, target: EventTarget | null): boolean {
  if (pressed.key !== '?') return false;
  if (pressed.ctrlKey || pressed.metaKey || pressed.altKey) return false;
  return !isTypingInto(target);
}

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
 * are Escape, the ✕ and the backdrop.
 *
 * The list itself is {@link KEY_BINDINGS} and nothing else. A binding written
 * out here instead would be a second description of the keyboard, and the
 * second one is always the one that goes stale.
 */
export function KeyboardCheatSheet({ onClose, altStyle }: KeyboardCheatSheetProps) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const style = altStyle ?? altStyleOf(navigatorSaid('platform'), navigatorSaid('userAgent'));

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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
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
        style={{
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          padding: '16px 20px',
          maxWidth: '46em',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h2 id={TITLE_ID} style={{ margin: 0, fontSize: '1.1em' }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            aria-label="Close the keyboard shortcuts"
            title="Close (Escape)"
            onClick={onClose}
            style={{ marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>
        {WHERE_ORDER.map((where) => (
          <section key={where}>
            <h3 style={{ fontSize: '0.95em', marginBottom: 4 }}>{where}</h3>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content 1fr',
                gap: '4px 12px',
                margin: 0,
              }}
            >
              {KEY_BINDINGS.filter((binding) => binding.where === where).map((binding) => (
                <Fragment key={binding.keys}>
                  <dt style={{ whiteSpace: 'nowrap' }}>
                    <kbd
                      style={{
                        border: '1px solid #ccc',
                        borderRadius: 3,
                        background: '#f6f6f6',
                        padding: '1px 5px',
                      }}
                    >
                      {showKeys(binding.keys, style)}
                    </kbd>
                  </dt>
                  <dd style={{ margin: 0 }}>{binding.does}</dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}

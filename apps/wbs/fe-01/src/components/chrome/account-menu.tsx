import { Button } from '@ui/saas-01';
import { authMethod, type AuthMethodId } from '@wbs/contracts';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { ThemeChoiceItems } from '@/components/chrome/theme-choice';
import { THEME_CHOICES, type ThemeChoice } from '@/lib/theme';

export interface AccountMenuProps {
  /** Who is signed in. It names the trigger, so it is the account's own word. */
  username: string;
  onSignOut: () => void;
  /** The palette this browser is on, and the way to change it. See `lib/theme.ts`. */
  theme: ThemeChoice;
  onChooseTheme: (choice: ThemeChoice) => void;
  /** Enabled sign-in methods this account has not linked; none renders no item. */
  addMethods?: readonly AuthMethodId[];
  /** Starts linking one of {@link addMethods}; the menu stays open for its answer. */
  onAddMethod?: (method: AuthMethodId) => void;
  /** What the last link start said, when it did not leave the page. */
  addMessage?: string;
}

/**
 * Where the "Add <method>" items start: after the three palette answers.
 * `Log out` follows them (`signOutAt` below), and is **still the item the menu
 * opens onto**.
 * That is deliberate rather than left over: somebody who opens this menu is far
 * more often leaving than repainting, the palette is a thing you set once, and
 * the arrows reach it in one press. It is also the assertion `moves the focus
 * onto the item it opens` has always made, and nothing here is worth breaking
 * it for.
 */
const FIRST_ADD_AT = THEME_CHOICES.length;

/**
 * One row of the account menu: the row ⋯ menu's shape — borderless, its words
 * from the left edge at the same inset as the "Signed in as" line and the
 * Theme label — and lit with the accent while it holds the focus rather than
 * ringed by the platform's outline. The menu moves the focus onto `Log out`
 * as it opens, and that row — with the platform's own button border, which the
 * scoped reset in `styles.css` leaves on a `<button>` — drew a bordered box
 * beside a segmented Theme control: two control styles in one small menu (UI
 * review F-017). `border-0` is the half of the fix that removes the box.
 */
const MENU_ROW =
  'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground w-full cursor-pointer rounded-sm border-0 bg-transparent px-2 py-1.5 text-left outline-none';

/**
 * Who is signed in, the palette, and the way out — one button in the header bar
 * rather than the "Signed in as … / Log out" pair that used to take a line of
 * the page.
 *
 * The ARIA menu button pattern, hand rolled the way `ActionsMenu` in the grid
 * is, and narrowed the same two ways: it is **not a focus trap** (Tab closes it
 * and carries on), and the DOM focus really moves onto the item rather than
 * staying on the trigger with `aria-activedescendant` — an "active" button that
 * is not focused takes no Enter of its own.
 *
 * **The roving tab stop arrived with the palette.** With one item there was
 * nothing to rove between and the focus effect below said so; with four there
 * is, and the model is `ActionsMenu`'s to the letter — `active` is the index
 * holding the focus, every other item is `tabIndex={-1}`, and the arrows wrap.
 * Left and Right move as Up and Down do, because the three palette answers are
 * drawn as a row and a reader who reaches for the arrow that points along it
 * should not find a dead key.
 *
 * One difference from the grid's menu, and it is why there is no throw here.
 * `ActionsMenu` throws from its focus effect when the item it was told to focus
 * is missing, because its items are a caller's list and an empty one is
 * reachable. This menu's items are rendered by this file, unconditionally,
 * whenever it is open — so the failure that throw guards cannot be constructed,
 * and a check that cannot fail is the thing this repository keeps shipping by
 * accident. `moves the focus onto the item it opens` is the assertion instead:
 * it fails if the ref wiring below ever stops working.
 *
 * The line naming the account is `role="none"`: a `menu` whose children are
 * anything but menu items is not a menu to a screen reader. The identity is
 * carried by the menu's own accessible name instead, which is what `aria-label`
 * says, and the visible line repeats it for everybody else. The palette's own
 * `role="group"` is a menu child a `menu` **does** allow, and it is what gives
 * the three radios a question to be answers to.
 */
export function AccountMenu({
  username,
  onSignOut,
  theme,
  onChooseTheme,
  addMethods = [],
  onAddMethod,
  addMessage = '',
}: AccountMenuProps): React.JSX.Element {
  // Log out follows the palette and the add items; the keyboard walks all of them.
  const signOutAt = FIRST_ADD_AT + addMethods.length;
  const itemCount = signOutAt + 1;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(signOutAt);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapper = useRef<HTMLSpanElement | null>(null);

  /**
   * Moves the DOM focus onto the active item, so the keyboard is where the eye
   * is. `?.` and not a throw — see the note on the component.
   */
  useEffect(() => {
    if (!open) return;
    items.current[active]?.focus();
  }, [open, active]);

  /**
   * A press anywhere else closes it.
   *
   * `mousedown` rather than `click`, for `ActionsMenu`'s reason: the press is
   * what the person means by "somewhere else", and waiting for the click leaves
   * the menu open over whatever has already taken the caret. The press on the
   * trigger is inside the wrapper and so left alone — its own click then closes
   * the menu, which is what makes the button a toggle.
   */
  useEffect(() => {
    if (!open) return undefined;
    const closeOnPressOutside = (event: MouseEvent) => {
      const pressed = event.target;
      if (pressed instanceof Node && wrapper.current?.contains(pressed) === true) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', closeOnPressOutside);
    return () => {
      document.removeEventListener('mousedown', closeOnPressOutside);
    };
  }, [open]);

  const closeAndReturnFocus = (): void => {
    setOpen(false);
    setActive(signOutAt);
    trigger.current?.focus();
  };

  /**
   * The keyboard every item in this menu shares, lent to the palette group
   * through `itemProps` below.
   *
   * `Enter` and `Space` are deliberately absent: a `<button>` fires a click of
   * its own from both unless the keydown is prevented, and each item's `onClick`
   * is where its action already lives. What is here instead is the **modified**
   * pair being taken away — R5 #14 in one line. A guard that returned without
   * `preventDefault` would leave the browser to fire the click it had just
   * refused, which is how a chord aimed at the plan once duplicated a branch.
   */
  const menuKeys = (at: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((at + step + itemCount) % itemCount);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      setActive((at + step + itemCount) % itemCount);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.key === 'Tab') {
      // No `preventDefault` on Tab. The menu closes and the focus is back on
      // the trigger synchronously, so the browser's own Tab — which acts on
      // whatever holds the focus when this returns — moves on from there.
      closeAndReturnFocus();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) return;
    // Modified, so it was aimed at something else. Taken away here, before the
    // browser can turn it into a click on this item.
    event.preventDefault();
  };

  const itemProps = (at: number) => ({
    ref: (element: HTMLButtonElement | null) => {
      items.current[at] = element;
    },
    tabIndex: at === active ? 0 : -1,
    onKeyDown: menuKeys(at),
    /**
     * Keeps `active` on whatever really holds the focus.
     *
     * The arrows compute the next index from `active`, and until this existed
     * only the arrows ever moved it — so a **mouse** put the focus on an item
     * the state had never heard of, and the next arrow key was computed from
     * the wrong place. Once the two disagree by exactly the step the arrow
     * takes, the arrow is dead: `setActive` is handed the value it already
     * holds, React bails out of the re-render, and the focus effect above —
     * deps `[open, active]` — does not re-run. Click `Dark`, press ArrowDown:
     * nothing moves at all. That is the interaction this control is built
     * around, since the menu is kept open on purpose so a reader can compare
     * palettes and keep choosing.
     *
     * On the focus event and not on each item's `onClick`, because the fault
     * is the disagreement rather than the click: anything that moves the focus
     * — a browser, an assistive technology, a future item — is answered by the
     * same line. Re-entrant by construction: focusing an element that already
     * has the focus fires no `focus` event, so the effect above and this
     * cannot chase each other.
     */
    onFocus: () => {
      setActive(at);
    },
  });

  return (
    // `data-account-menu` is how `styles.css` finds this surface on a phone,
    // and it is on the wrapper rather than on the `role="menu"` div so that the
    // trigger is inside it: the trigger is `size="sm"` — 32px — and it is the
    // control a finger has to hit *first*. Named rather than reached through
    // `[role="menu"]`, which would also catch the table's own row-actions menu
    // and the cards', and both of those size themselves.
    <span ref={wrapper} data-account-menu className="relative inline-block">
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        data-hint="This account"
        className="max-w-40"
        onClick={() => {
          // Computed beside the setter rather than inside it: a state updater
          // React may call twice is no place for a second setter, which is the
          // rule `lib/theme.ts`'s `chooseTheme` states and keeps. `open` is
          // this render's value and a click handler has no newer one.
          const opening = !open;
          if (opening) setActive(signOutAt);
          setOpen(opening);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowDown') return;
          // Enter and Space are left to the browser: they fire a click of their
          // own on a button, and the toggle above is what they land on. Only
          // ArrowDown needs saying, because nothing else opens a menu with it.
          event.preventDefault();
          setActive(signOutAt);
          setOpen(true);
        }}
      >
        <span className="truncate">{username}</span>
        <span aria-hidden="true">▾</span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={`Signed in as ${username}`}
          className="bg-popover text-popover-foreground absolute top-full right-0 z-20 mt-1 min-w-40 rounded-md border p-1 text-sm shadow-md"
        >
          <p role="none" className="text-muted-foreground px-2 py-1.5 text-xs">
            Signed in as <strong className="text-foreground font-medium">{username}</strong>
          </p>
          <ThemeChoiceItems
            choice={theme}
            onChoose={onChooseTheme}
            itemProps={itemProps}
            firstAt={0}
          />
          {addMethods.map((method, index) => (
            <button
              key={method}
              type="button"
              role="menuitem"
              {...itemProps(FIRST_ADD_AT + index)}
              className={MENU_ROW}
              onClick={() => {
                onAddMethod?.(method);
              }}
            >
              {authMethod(method).addLabel}
            </button>
          ))}
          {addMessage !== '' && (
            <p role="status" className="text-muted-foreground max-w-56 px-2 py-1 text-xs">
              {addMessage}
            </p>
          )}
          <div role="separator" className="bg-border my-1 h-px" />
          <button
            type="button"
            role="menuitem"
            {...itemProps(signOutAt)}
            className={MENU_ROW}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </span>
  );
}

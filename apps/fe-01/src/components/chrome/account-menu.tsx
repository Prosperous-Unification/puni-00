import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { ThemeChoiceItems } from '@/components/chrome/theme-choice';
import { Button } from '@/components/ui/button';
import { type ThemeChoice, THEME_CHOICES } from '@/lib/theme';

export interface AccountMenuProps {
  /** Who is signed in. It names the trigger, so it is the account's own word. */
  username: string;
  onSignOut: () => void;
  /** The palette this browser is on, and the way to change it. See `lib/theme.ts`. */
  theme: ThemeChoice;
  onChooseTheme: (choice: ThemeChoice) => void;
}

/**
 * Where `Log out` stands in the menu's flat list of items.
 *
 * After the three palette answers, and **still the item the menu opens onto**.
 * That is deliberate rather than left over: somebody who opens this menu is far
 * more often leaving than repainting, the palette is a thing you set once, and
 * the arrows reach it in one press. It is also the assertion `moves the focus
 * onto the item it opens` has always made, and nothing here is worth breaking
 * it for.
 */
const SIGN_OUT_AT = THEME_CHOICES.length;

/** How many items the keyboard walks: the three answers, and the way out. */
const ITEM_COUNT = SIGN_OUT_AT + 1;

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
}: AccountMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(SIGN_OUT_AT);
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
    setActive(SIGN_OUT_AT);
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
      setActive((at + step + ITEM_COUNT) % ITEM_COUNT);
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      setActive((at + step + ITEM_COUNT) % ITEM_COUNT);
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
  });

  return (
    <span ref={wrapper} className="relative inline-block">
      <Button
        ref={trigger}
        variant="outline"
        size="sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="This account"
        className="max-w-40"
        onClick={() => {
          setOpen((wasOpen) => {
            if (!wasOpen) setActive(SIGN_OUT_AT);
            return !wasOpen;
          });
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowDown') return;
          // Enter and Space are left to the browser: they fire a click of their
          // own on a button, and the toggle above is what they land on. Only
          // ArrowDown needs saying, because nothing else opens a menu with it.
          event.preventDefault();
          setActive(SIGN_OUT_AT);
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
          <p role="none" className="text-muted-foreground px-2 py-1 text-xs">
            Signed in as <strong className="text-foreground font-medium">{username}</strong>
          </p>
          <ThemeChoiceItems
            choice={theme}
            onChoose={onChooseTheme}
            itemProps={itemProps}
            firstAt={0}
          />
          <button
            type="button"
            role="menuitem"
            {...itemProps(SIGN_OUT_AT)}
            className="hover:bg-accent hover:text-accent-foreground w-full cursor-pointer rounded-sm bg-transparent px-2 py-1 text-left"
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

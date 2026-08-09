import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

export interface AccountMenuProps {
  /** Who is signed in. It names the trigger, so it is the account's own word. */
  username: string;
  onSignOut: () => void;
}

/**
 * Who is signed in, and the way out — one button in the header bar rather than
 * the "Signed in as … / Log out" pair that used to take a line of the page.
 *
 * The ARIA menu button pattern, hand rolled the way `ActionsMenu` in the grid
 * is, and narrowed the same two ways: it is **not a focus trap** (Tab closes it
 * and carries on), and the DOM focus really moves onto the item rather than
 * staying on the trigger with `aria-activedescendant` — an "active" button that
 * is not focused takes no Enter of its own.
 *
 * One difference from the grid's menu, and it is why there is no throw here.
 * `ActionsMenu` throws from its focus effect when the item it was told to focus
 * is missing, because its items are a caller's list and an empty one is
 * reachable. This menu's single item is rendered by this file, unconditionally,
 * whenever it is open — so the failure that throw guards cannot be constructed,
 * and a check that cannot fail is the thing this repository keeps shipping by
 * accident. `moves the focus onto the item it opens` is the assertion instead:
 * it fails if the ref wiring below ever stops working.
 *
 * The line naming the account is `role="none"`: a `menu` whose children are
 * anything but `menuitem`s is not a menu to a screen reader. The identity is
 * carried by the menu's own accessible name instead, which is what
 * `aria-label` says, and the visible line repeats it for everybody else.
 */
export function AccountMenu({ username, onSignOut }: AccountMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const item = useRef<HTMLButtonElement | null>(null);
  const wrapper = useRef<HTMLSpanElement | null>(null);

  /**
   * Moves the focus onto the item as the menu opens, so the keyboard is where
   * the eye is. `?.` and not a throw — see the note on the component.
   */
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
  }, [open]);

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
    trigger.current?.focus();
  };

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
          setOpen((wasOpen) => !wasOpen);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
          if (event.key !== 'ArrowDown') return;
          // Enter and Space are left to the browser: they fire a click of their
          // own on a button, and the toggle above is what they land on. Only
          // ArrowDown needs saying, because nothing else opens a menu with it.
          event.preventDefault();
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
          <button
            ref={item}
            type="button"
            role="menuitem"
            className="hover:bg-accent hover:text-accent-foreground w-full cursor-pointer rounded-sm px-2 py-1 text-left"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeAndReturnFocus();
                return;
              }
              // No `preventDefault` on Tab. The menu closes and the focus is
              // back on the trigger synchronously, so the browser's own Tab —
              // which acts on whatever holds the focus when this returns —
              // moves on from there.
              if (event.key === 'Tab') closeAndReturnFocus();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </span>
  );
}

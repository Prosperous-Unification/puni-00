import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AccountMenu } from './account-menu';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * The account menu's accessible shape.
 *
 * It exists in the form R5 keeps asking for. The pair this replaces — a
 * paragraph reading "Signed in as kat" and a "Log out" button beside it — had
 * **no assertion anywhere in the repository**: nothing named either of them,
 * so a change could have deleted the way out of the app and every test would
 * have stayed green. `F shadcn-foundation` learned that lesson on the auth
 * panel's heading and wrote the rule down: where a swap finds no assertion on a
 * role or a name, the swap writes one.
 *
 * Watched failures for every test here are quoted in
 * `openspec/changes/header-fits-a-row/verify.md`.
 */
describe('the account menu', () => {
  const nothing = () => {
    // Most tests here never take the item; the callback is required.
  };

  itDom('names its trigger with the account it belongs to', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    const trigger = screen.getByRole('button', { name: 'kat' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  itDom('opens a menu that says who is signed in', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));

    // The name carries the identity because the visible line is `role="none"`:
    // a `menu` with a paragraph in its children is not a menu to a reader.
    expect(screen.getByRole('menu', { name: 'Signed in as kat' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'kat' }).getAttribute('aria-expanded')).toBe('true');
  });

  itDom('moves the focus onto the item it opens', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));

    // The assertion that stands in for `ActionsMenu`'s throw: if the ref
    // wiring stops working, the menu opens with the focus still on the trigger
    // and the keyboard has nowhere to go.
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Log out' }));
  });

  itDom('opens on ArrowDown, which is the only key the trigger claims', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'kat' }), { key: 'ArrowDown' });

    expect(screen.getByRole('menu', { name: 'Signed in as kat' })).toBeDefined();
  });

  itDom('signs out when the item is taken, and closes', () => {
    const signOut = vi.fn();
    render(<AccountMenu username="kat" onSignOut={signOut} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  itDom('closes on Escape and gives the focus back to the trigger', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Log out' }), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'kat' }));
  });

  itDom('closes on a press anywhere else', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  itDom('leaves a press on its own trigger to the toggle', () => {
    render(<AccountMenu username="kat" onSignOut={nothing} />);

    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    // The press the outside-listener must not act on: it is inside the
    // wrapper, and the click that follows is what closes the menu. Without the
    // `contains` guard the listener closes it first and the click reopens it —
    // a toggle that never shuts.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'kat' }));

    expect(screen.getByRole('menu', { name: 'Signed in as kat' })).toBeDefined();
  });
});

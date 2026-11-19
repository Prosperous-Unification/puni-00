import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useClosedOnDismiss } from '../wbs/close-on-dismiss';
import { AccountMenu } from './account-menu';
import { HeaderAccount } from './header-account';

const hasDom = typeof window !== 'undefined';
const itDom = hasDom ? it : it.skip;
const initialWidth = hasDom ? window.innerWidth : null;

function resize(width: number): void {
  act(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
    window.dispatchEvent(new Event('resize'));
  });
}

function accountPanel(): HTMLDetailsElement {
  const panel = screen.getByLabelText('Account and organization').closest('details');
  if (!(panel instanceof HTMLDetailsElement)) throw new Error('The account disclosure is absent');
  return panel;
}

function AccountFixture({ mounted }: { mounted: () => () => void }): React.JSX.Element {
  useEffect(mounted, [mounted]);
  return <AccountMenu username="kat" theme="system" onChooseTheme={vi.fn()} onSignOut={vi.fn()} />;
}

function OtherPanel(): React.JSX.Element {
  return (
    <details ref={useClosedOnDismiss()}>
      <summary>Other actions</summary>
    </details>
  );
}

function Fixture(): React.JSX.Element {
  return (
    <>
      <button type="button">Plan control</button>
      <HeaderAccount
        presence={<span>Kat and Bea are here</span>}
        account={
          <>
            <details>
              <summary>Organization: Long fixture organization</summary>
              <button type="button">Organization choice</button>
            </details>
            <AccountMenu
              username="kat"
              theme="system"
              onChooseTheme={vi.fn()}
              onSignOut={vi.fn()}
            />
          </>
        }
      />
      <OtherPanel />
    </>
  );
}

describe('the responsive header account', () => {
  afterEach(() => {
    cleanup();
    if (initialWidth !== null)
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: initialWidth,
      });
  });

  itDom('keeps real account and organization controls mounted behind one compact summary', () => {
    resize(375);
    render(<Fixture />);
    expect(accountPanel().open).toBe(false);
    expect(screen.getByRole('button', { name: 'kat' })).not.toBeVisible();
    fireEvent.click(screen.getByLabelText('Account and organization'));
    expect(accountPanel().open).toBe(true);
    expect(screen.getByRole('button', { name: 'kat' })).toBeVisible();
    expect(screen.getByText('Organization: Long fixture organization')).toBeVisible();
    expect(screen.getByText('Kat and Bea are here')).toBeVisible();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  itDom(
    'lets the actual account menu own first Escape and the compact disclosure own the next',
    () => {
      resize(375);
      render(<Fixture />);
      fireEvent.click(screen.getByLabelText('Account and organization'));
      fireEvent.click(screen.getByRole('button', { name: 'kat' }));
      const logOut = screen.getByRole('menuitem', { name: 'Log out' });
      expect(logOut).toHaveFocus();
      fireEvent.keyDown(logOut, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
      expect(accountPanel().open).toBe(true);
      expect(screen.getByRole('button', { name: 'kat' })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole('button', { name: 'kat' }), { key: 'Escape' });
      expect(accountPanel().open).toBe(false);
      expect(screen.getByLabelText('Account and organization')).toHaveFocus();
    },
  );

  itDom('keeps Tab natural and closes the outer branch after focus lands outside', async () => {
    resize(375);
    render(<Fixture />);
    fireEvent.click(screen.getByLabelText('Account and organization'));
    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    const key = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    fireEvent(screen.getByRole('menuitem', { name: 'Log out' }), key);
    expect(key.defaultPrevented).toBe(false);
    expect(screen.getByRole('button', { name: 'kat' })).toHaveFocus();
    screen.getByRole('button', { name: 'Plan control' }).focus();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(accountPanel().open).toBe(false);
    expect(screen.getByRole('button', { name: 'Plan control' })).toHaveFocus();
  });

  itDom('dismisses outside without returning focus to a hidden username', () => {
    resize(375);
    render(<Fixture />);
    fireEvent.click(screen.getByLabelText('Account and organization'));
    fireEvent.click(screen.getByRole('button', { name: 'kat' }));
    const outside = screen.getByRole('button', { name: 'Plan control' });
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    outside.focus();
    expect(accountPanel().open).toBe(false);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(outside).toHaveFocus();
  });

  itDom('moves focused wide content to the summary when it becomes compact', () => {
    resize(900);
    render(<Fixture />);
    screen.getByRole('button', { name: 'kat' }).focus();
    resize(375);
    expect(accountPanel().open).toBe(false);
    expect(screen.getByLabelText('Account and organization')).toHaveFocus();
  });

  itDom('moves only the newly hidden summary focus to the stable wide content surface', () => {
    resize(375);
    render(<Fixture />);
    screen.getByLabelText('Account and organization').focus();
    resize(768);
    expect(accountPanel().open).toBe(true);
    expect(screen.getByRole('group', { name: 'Account and organization controls' })).toHaveFocus();
    expect(accountPanel()).not.toHaveAttribute('data-dismissible');
  });

  itDom('does not steal unrelated plan focus in either breakpoint direction', () => {
    resize(900);
    render(<Fixture />);
    const outside = screen.getByRole('button', { name: 'Plan control' });
    outside.focus();
    resize(375);
    expect(outside).toHaveFocus();
    resize(1440);
    expect(outside).toHaveFocus();
  });

  itDom('keeps desktop account visible when an unrelated disclosure opens after resizing', () => {
    resize(375);
    render(<Fixture />);
    resize(900);
    fireEvent.click(screen.getByText('Other actions'));
    expect(accountPanel().open).toBe(true);
    expect(accountPanel()).not.toHaveAttribute('data-dismissible');
    expect(screen.getByRole('button', { name: 'kat' })).toBeVisible();
    expect(screen.getByText('Kat and Bea are here')).toBeVisible();
  });

  itDom(
    'keeps the same account subtree and local menu state across compact and wide layouts',
    () => {
      resize(375);
      let mounts = 0;
      let releases = 0;
      const mounted = (): (() => void) => {
        mounts += 1;
        return () => {
          releases += 1;
        };
      };
      render(<HeaderAccount account={<AccountFixture mounted={mounted} />} />);
      fireEvent.click(screen.getByLabelText('Account and organization'));
      const account = screen.getByRole('button', { name: 'kat' });
      fireEvent.click(account);
      const menu = screen.getByRole('menu', { name: 'Signed in as kat' });
      resize(1440);
      expect(screen.getByRole('button', { name: 'kat' })).toBe(account);
      expect(screen.getByRole('menu', { name: 'Signed in as kat' })).toBe(menu);
      resize(375);
      expect(screen.getByRole('button', { name: 'kat' })).toBe(account);
      expect(mounts).toBe(1);
      expect(releases).toBe(0);
      expect(screen.getAllByRole('button', { name: 'kat' })).toHaveLength(1);
    },
  );

  itDom('registers a compact branch again after a StrictMode wide round trip', () => {
    resize(375);
    render(
      <StrictMode>
        <Fixture />
      </StrictMode>,
    );
    const account = accountPanel();
    resize(900);
    expect(account).not.toHaveAttribute('data-dismissible');
    resize(375);
    expect(accountPanel()).toBe(account);
    expect(account).toHaveAttribute('data-dismissible');
    fireEvent.click(screen.getByLabelText('Account and organization'));
    fireEvent.click(screen.getByText('Other actions'));
    expect(account.open).toBe(false);
  });
});

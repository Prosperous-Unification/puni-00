import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useClosedOnDismiss } from './close-on-dismiss';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

function Panel(): React.JSX.Element {
  return (
    <>
      <details ref={useClosedOnDismiss()} open data-panel>
        <summary>Filters</summary>
        <label>
          <input type="checkbox" /> Critical
        </label>
      </details>
      <button type="button">Elsewhere</button>
    </>
  );
}

function Panels(): React.JSX.Element {
  return (
    <>
      <details ref={useClosedOnDismiss()}>
        <summary>Filters</summary>
      </details>
      <details ref={useClosedOnDismiss()}>
        <summary>Views</summary>
      </details>
    </>
  );
}

const panel = (): HTMLDetailsElement => {
  const node = document.querySelector('[data-panel]');
  if (!(node instanceof HTMLDetailsElement)) throw new Error('no panel rendered');
  return node;
};

describe('a dismissible panel', () => {
  afterEach(cleanup);

  itDom('keeps the latest activated panel open before queued toggles settle (F-028)', async () => {
    render(<Panels />);

    // Native summary activation queues toggle tasks; both activations land before either task.
    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByText('Views'));
    await new Promise((settle) => setTimeout(settle, 0));

    expect(
      [...document.querySelectorAll('details[open] > summary')].map(
        (summary) => summary.textContent,
      ),
    ).toEqual(['Views']);
  });

  itDom(
    'closes the previous panel when disclosure state changes without summary activation',
    async () => {
      render(<Panels />);
      const filters = screen.getByText('Filters').parentElement;
      const views = screen.getByText('Views').parentElement;
      if (!(filters instanceof HTMLDetailsElement) || !(views instanceof HTMLDetailsElement))
        throw new Error('no panels rendered');

      filters.open = true;
      await new Promise((settle) => setTimeout(settle, 0));
      views.open = true;
      await new Promise((settle) => setTimeout(settle, 0));

      expect(filters.open).toBe(false);
      expect(views.open).toBe(true);
    },
  );

  itDom('closes on Escape from inside and gives the focus to its summary (F-028)', () => {
    render(<Panel />);
    const box = screen.getByRole('checkbox');
    box.focus();

    fireEvent.keyDown(box, { key: 'Escape' });

    // Proof: on 2026-10-13, with the keydown listener left out of `useClosedOnDismiss`, this
    // failed on `expected true to be false`.
    expect(panel().open).toBe(false);
    expect(document.activeElement).toBe(screen.getByText('Filters'));
  });

  itDom('closes on Escape with nothing focused, as a clicked summary leaves Safari', () => {
    render(<Panel />);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(panel().open).toBe(false);
  });

  itDom('leaves an Escape another control already handled', () => {
    render(<Panel />);
    const box = screen.getByRole('checkbox');
    box.addEventListener('keydown', (event) => {
      event.preventDefault();
    });

    fireEvent.keyDown(box, { key: 'Escape' });

    // Proof: on 2026-10-13, with the `defaultPrevented` test dropped, this failed on `expected
    // false to be true` — the Import with AI dialog's Escape would have shut the menu too.
    expect(panel().open).toBe(true);
  });

  itDom('leaves the panel open for an Escape aimed at another control', () => {
    render(<Panel />);
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();

    fireEvent.keyDown(elsewhere, { key: 'Escape' });

    expect(panel().open).toBe(true);
  });

  itDom('closes when Tab takes the focus out of it (F-028)', async () => {
    render(<Panel />);
    const box = screen.getByRole('checkbox');
    box.focus();

    fireEvent.keyDown(box, { key: 'Tab' });
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    // The panel judges where the focus landed a task later.
    await new Promise((settle) => setTimeout(settle, 0));

    // Proof: on 2026-10-13, without the focusout listener, this failed on `expected true to
    // be false`.
    expect(panel().open).toBe(false);
  });

  itDom('stays open when the page moves the focus by itself', async () => {
    render(<Panel />);
    screen.getByRole('checkbox').focus();

    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await new Promise((settle) => setTimeout(settle, 0));

    // Proof: on 2026-10-14, with every focusout closing the panel, this failed on `expected
    // false to be true` — the shape of `status.spec.ts`'s CI failure.
    expect(panel().open).toBe(true);
  });

  itDom('stays open while the focus moves inside it', async () => {
    render(<Panel />);
    screen.getByText('Filters').focus();

    screen.getByRole('checkbox').focus();
    await new Promise((settle) => setTimeout(settle, 0));

    expect(panel().open).toBe(true);
  });
});

function NestedPanels({
  openBranch = false,
  openOther = false,
}: {
  openBranch?: boolean;
  openOther?: boolean;
}): React.JSX.Element {
  const outerRef = useClosedOnDismiss();
  const innerRef = useClosedOnDismiss();
  const otherRef = useClosedOnDismiss();
  const otherInnerRef = useClosedOnDismiss();
  return (
    <>
      <details ref={outerRef} open={openBranch} data-nested-panel="outer">
        <summary>Package actions</summary>
        <button type="button">Outer action</button>
        <details ref={innerRef} open={openBranch} data-nested-panel="inner">
          <summary>Saved plans</summary>
          <label>
            <input type="checkbox" /> Inner option
          </label>
        </details>
      </details>
      <details ref={otherRef} open={openOther} data-nested-panel="other">
        <summary>Other actions</summary>
        <details ref={otherInnerRef} open={openOther} data-nested-panel="other-inner">
          <summary>Other saved plans</summary>
          <label>
            <input type="checkbox" /> Other option
          </label>
        </details>
      </details>
      <button type="button">Outside branch</button>
    </>
  );
}

function nestedPanel(name: 'outer' | 'inner' | 'other' | 'other-inner'): HTMLDetailsElement {
  const node = document.querySelector(`[data-nested-panel="${name}"]`);
  if (!(node instanceof HTMLDetailsElement))
    throw new Error('Nested fixture panel is absent: ' + name);
  return node;
}

describe('nested dismissible panels', () => {
  afterEach(cleanup);

  itDom(
    'keeps the rapid outer and child activation open while closing the unrelated branch',
    async () => {
      render(<NestedPanels openOther />);
      fireEvent.click(screen.getByText('Package actions'));
      fireEvent.click(screen.getByText('Saved plans', { exact: true }));
      expect(nestedPanel('outer').open).toBe(true);
      expect(nestedPanel('inner').open).toBe(true);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(nestedPanel('outer').open).toBe(true);
      expect(nestedPanel('inner').open).toBe(true);
      expect(nestedPanel('other').open).toBe(false);
      expect(nestedPanel('other-inner').open).toBe(false);
    },
  );

  itDom(
    'keeps directly opened ancestor and child together after queued toggle observation',
    async () => {
      render(<NestedPanels openOther />);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      nestedPanel('outer').open = true;
      nestedPanel('inner').open = true;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(nestedPanel('outer').open).toBe(true);
      expect(nestedPanel('inner').open).toBe(true);
      expect(nestedPanel('other').open).toBe(false);
      expect(nestedPanel('other-inner').open).toBe(false);
    },
  );

  itDom(
    'closes the innermost Escape owner before its earlier-registered ancestor and returns focus at each level',
    () => {
      render(<NestedPanels openBranch />);
      const inner = screen.getByRole('checkbox', { name: 'Inner option' });
      inner.focus();
      fireEvent.keyDown(inner, { key: 'Escape' });
      expect(nestedPanel('outer').open).toBe(true);
      expect(nestedPanel('inner').open).toBe(false);
      expect(screen.getByText('Saved plans', { exact: true })).toHaveFocus();
      fireEvent.keyDown(screen.getByText('Saved plans', { exact: true }), { key: 'Escape' });
      expect(nestedPanel('outer').open).toBe(false);
      expect(nestedPanel('inner').open).toBe(false);
      expect(screen.getByText('Package actions')).toHaveFocus();
    },
  );

  itDom(
    'closes only the innermost branch for a body-origin Safari Escape before the outer branch',
    () => {
      render(<NestedPanels openBranch />);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(nestedPanel('outer').open).toBe(true);
      expect(nestedPanel('inner').open).toBe(false);
      expect(screen.getByText('Saved plans', { exact: true })).toHaveFocus();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(nestedPanel('outer').open).toBe(false);
      expect(nestedPanel('inner').open).toBe(false);
      expect(screen.getByText('Package actions')).toHaveFocus();
    },
  );

  itDom('closes only the child when the pointer lands elsewhere inside its outer branch', () => {
    render(<NestedPanels openBranch />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outer action' }));
    expect(nestedPanel('outer').open).toBe(true);
    expect(nestedPanel('inner').open).toBe(false);
  });

  itDom('closes the whole branch when the pointer lands outside it', () => {
    render(<NestedPanels openBranch />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside branch' }));
    expect(nestedPanel('outer').open).toBe(false);
    expect(nestedPanel('inner').open).toBe(false);
  });

  itDom('closes only the child when Tab moves from the child into the outer branch', async () => {
    render(<NestedPanels openBranch />);
    const inner = screen.getByRole('checkbox', { name: 'Inner option' });
    inner.focus();
    fireEvent.keyDown(inner, { key: 'Tab' });
    screen.getByRole('button', { name: 'Outer action' }).focus();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(nestedPanel('outer').open).toBe(true);
    expect(nestedPanel('inner').open).toBe(false);
    expect(screen.getByRole('button', { name: 'Outer action' })).toHaveFocus();
  });

  itDom('closes both levels when Tab moves from the child outside the whole branch', async () => {
    render(<NestedPanels openBranch />);
    const inner = screen.getByRole('checkbox', { name: 'Inner option' });
    inner.focus();
    fireEvent.keyDown(inner, { key: 'Tab' });
    screen.getByRole('button', { name: 'Outside branch' }).focus();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(nestedPanel('outer').open).toBe(false);
    expect(nestedPanel('inner').open).toBe(false);
    expect(screen.getByRole('button', { name: 'Outside branch' })).toHaveFocus();
  });
});

describe('an inactive nested disclosure branch', () => {
  afterEach(cleanup);

  itDom(
    'leaves body Escape and visible focus alone when an open child has a natively closed ancestor',
    () => {
      render(<NestedPanels openBranch />);
      const outerSummary = screen.getByText('Package actions');
      const innerSummary = screen.getByText('Saved plans', { exact: true });
      let innerFocusEvents = 0;
      innerSummary.addEventListener('focus', () => {
        innerFocusEvents += 1;
      });
      outerSummary.focus();
      fireEvent.click(outerSummary);
      expect(nestedPanel('outer').open).toBe(false);
      expect(nestedPanel('inner').open).toBe(true);
      expect(outerSummary).toBeVisible();
      expect(innerSummary).not.toBeVisible();
      expect(outerSummary).toHaveFocus();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(innerFocusEvents).toBe(0);
      expect(nestedPanel('outer').open).toBe(false);
      expect(nestedPanel('inner').open).toBe(true);
      expect(outerSummary).toHaveFocus();
    },
  );
});

import { StrictMode, useCallback, useRef } from 'react';
import { vi } from 'vitest';

/** Probes real ref deactivation before returning to React, with the same node connected. */
function ResponsivePanels({
  compact,
  inspectWide,
}: {
  compact: boolean;
  inspectWide: (account: HTMLDetailsElement, peer: HTMLDetailsElement) => void;
}): React.JSX.Element {
  const accountRef = useClosedOnDismiss();
  const peerRef = useClosedOnDismiss();
  const currentCompact = useRef(compact);
  const accountNode = useRef<HTMLDetailsElement | null>(null);
  currentCompact.current = compact;
  const rememberAccount = useCallback(
    (node: HTMLDetailsElement | null): void => {
      if (node !== null) {
        accountNode.current = node;
        accountRef(node);
        return;
      }
      accountRef(null);
      const previous = accountNode.current;
      if (previous !== null && previous.isConnected && !currentCompact.current) {
        // Model the wide owner's required open state before any unrelated event can arrive.
        previous.open = true;
        inspectWide(previous, registrationPanel('peer'));
      }
    },
    [accountRef, inspectWide],
  );
  return (
    <>
      <details
        ref={compact ? rememberAccount : undefined}
        open={!compact}
        data-registration-panel="account"
      >
        <summary>Account and organization</summary>
        <button type="button">Account content</button>
      </details>
      <details ref={peerRef} data-registration-panel="peer">
        <summary>Unrelated actions</summary>
      </details>
      <button type="button">Outside account</button>
    </>
  );
}

function registrationPanel(name: 'account' | 'peer'): HTMLDetailsElement {
  const node = document.querySelector(`[data-registration-panel="${name}"]`);
  if (!(node instanceof HTMLDetailsElement))
    throw new Error('Registration panel is absent: ' + name);
  return node;
}

describe('a responsive disclosure registration', () => {
  afterEach(cleanup);

  itDom(
    'keeps a still-mounted wide disclosure open when an unrelated summary activates before passive cleanup',
    () => {
      const observed: { open: boolean; registered: boolean; connected: boolean }[] = [];
      const inspectWide = (account: HTMLDetailsElement): void => {
        screen.getByText('Unrelated actions').click();
        observed.push({
          open: account.open,
          registered: account.hasAttribute('data-dismissible'),
          connected: account.isConnected,
        });
      };
      const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
      const account = registrationPanel('account');
      expect(account).toHaveAttribute('data-dismissible');
      view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
      expect(observed).toEqual([{ open: true, registered: false, connected: true }]);
      expect(registrationPanel('account')).toBe(account);
      expect(account).not.toHaveAttribute('data-dismissible');
      expect(registrationPanel('peer').open).toBe(true);
    },
  );

  itDom('leaves wide content and outside focus unchanged on Escape before passive cleanup', () => {
    const observed: { open: boolean; outsideFocused: boolean }[] = [];
    const inspectWide = (account: HTMLDetailsElement): void => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
      observed.push({
        open: account.open,
        outsideFocused:
          document.activeElement === screen.getByRole('button', { name: 'Outside account' }),
      });
    };
    const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
    screen.getByRole('button', { name: 'Outside account' }).focus();
    view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
    expect(observed).toEqual([{ open: true, outsideFocused: true }]);
  });

  itDom('leaves wide content open on an outside pointer before passive cleanup', () => {
    const observed: boolean[] = [];
    const inspectWide = (account: HTMLDetailsElement): void => {
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside account' }));
      observed.push(account.open);
    };
    const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
    view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
    expect(observed).toEqual([true]);
  });

  itDom(
    'leaves an unrelated open panel unchanged on a detached wide disclosure toggle before passive cleanup',
    () => {
      const observed: boolean[] = [];
      const inspectWide = (account: HTMLDetailsElement, peer: HTMLDetailsElement): void => {
        peer.open = true;
        fireEvent(account, new Event('toggle'));
        observed.push(peer.open);
      };
      const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
      view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
      expect(observed).toEqual([true]);
    },
  );

  itDom(
    'does not schedule a detached wide disclosure Tab focus check before passive cleanup',
    () => {
      const scheduled: number[] = [];
      const timer = vi.spyOn(globalThis, 'setTimeout');
      try {
        const inspectWide = (): void => {
          const accountSummary = screen.getByText('Account and organization');
          const before = timer.mock.calls.length;
          fireEvent.keyDown(accountSummary, { key: 'Tab' });
          fireEvent.focusOut(accountSummary);
          scheduled.push(timer.mock.calls.length - before);
        };
        const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
        view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
        expect(scheduled).toEqual([0]);
      } finally {
        timer.mockRestore();
      }
    },
  );

  itDom(
    'leaves an unrelated panel open when a detached summary activates before passive cleanup',
    () => {
      const observed: { accountOpen: boolean; peerOpen: boolean }[] = [];
      const inspectWide = (account: HTMLDetailsElement, peer: HTMLDetailsElement): void => {
        peer.open = true;
        account.open = false;
        screen.getByText('Account and organization').click();
        observed.push({ accountOpen: account.open, peerOpen: peer.open });
      };
      const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
      view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
      expect(observed).toEqual([{ accountOpen: true, peerOpen: true }]);
    },
  );

  itDom('registers the same node again after compact wide compact transitions', () => {
    const inspectWide = (account: HTMLDetailsElement): void => {
      expect(account.isConnected).toBe(true);
    };
    const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
    const account = registrationPanel('account');
    view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
    expect(account).not.toHaveAttribute('data-dismissible');
    view.rerender(<ResponsivePanels compact inspectWide={inspectWide} />);
    expect(registrationPanel('account')).toBe(account);
    expect(account).toHaveAttribute('data-dismissible');
    screen.getByText('Account and organization').click();
    expect(account.open).toBe(true);
    fireEvent.keyDown(screen.getByText('Account and organization'), { key: 'Escape' });
    expect(account.open).toBe(false);
    expect(screen.getByText('Account and organization')).toHaveFocus();
  });

  itDom('cancels already queued compact Tab work immediately when its live ref deactivates', () => {
    let primary: { cause: unknown } | null = null;
    try {
      vi.useFakeTimers();
      const observed: boolean[] = [];
      const inspectWide = (account: HTMLDetailsElement): void => {
        vi.runOnlyPendingTimers();
        observed.push(account.open);
      };
      const view = render(<ResponsivePanels compact inspectWide={inspectWide} />);
      vi.runOnlyPendingTimers();
      const account = registrationPanel('account');
      account.open = true;
      const accountSummary = screen.getByText('Account and organization');
      accountSummary.focus();
      fireEvent.keyDown(accountSummary, { key: 'Tab' });
      screen.getByRole('button', { name: 'Outside account' }).focus();
      view.rerender(<ResponsivePanels compact={false} inspectWide={inspectWide} />);
      expect(observed).toEqual([true]);
      expect(account.open).toBe(true);
    } catch (cause) {
      primary = { cause };
    }
    const cleanupFailures: unknown[] = [];
    try {
      cleanup();
    } catch (cause) {
      cleanupFailures.push(cause);
    }
    try {
      vi.useRealTimers();
    } catch (cause) {
      cleanupFailures.push(cause);
    }
    if (cleanupFailures.length > 0) {
      if (primary !== null) {
        throw new AggregateError(
          [primary.cause, ...cleanupFailures],
          'Queued Tab control and cleanup failed',
          { cause: primary.cause },
        );
      }
      throw new AggregateError(cleanupFailures, 'Queued Tab control cleanup failed');
    }
    if (primary !== null) throw primary.cause;
  });

  itDom(
    'retains a fresh compact registration through StrictMode replay and responsive reentry',
    () => {
      const inspectWide = (account: HTMLDetailsElement): void => {
        expect(account.isConnected).toBe(true);
      };
      const view = render(
        <StrictMode>
          <ResponsivePanels compact inspectWide={inspectWide} />
        </StrictMode>,
      );
      const account = registrationPanel('account');
      expect(account).toHaveAttribute('data-dismissible');
      view.rerender(
        <StrictMode>
          <ResponsivePanels compact={false} inspectWide={inspectWide} />
        </StrictMode>,
      );
      expect(account).not.toHaveAttribute('data-dismissible');
      view.rerender(
        <StrictMode>
          <ResponsivePanels compact inspectWide={inspectWide} />
        </StrictMode>,
      );
      expect(registrationPanel('account')).toBe(account);
      expect(account).toHaveAttribute('data-dismissible');
      screen.getByText('Account and organization').click();
      expect(account.open).toBe(true);
      screen.getByText('Unrelated actions').click();
      expect(account.open).toBe(false);
      expect(registrationPanel('peer').open).toBe(true);
    },
  );
});

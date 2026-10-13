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

const panel = (): HTMLDetailsElement => {
  const node = document.querySelector('[data-panel]');
  if (!(node instanceof HTMLDetailsElement)) throw new Error('no panel rendered');
  return node;
};

describe('a dismissible panel', () => {
  afterEach(cleanup);

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
});

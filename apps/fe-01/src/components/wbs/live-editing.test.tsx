import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CellInput } from './cell-input';
import { type CommitOutcome, refusedDraftFor } from './live-editing';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

afterEach(cleanup);

/** The cell both faces below render, and the only one these tests use. */
const CELL = 'w1::name';

/**
 * The desktop renderer, as small as it can be and still be one: a `[data-grid]`
 * table with the cell in a `<td>`.
 */
function TableFace({
  value,
  commit,
}: {
  value: string;
  commit: (typed: string, baseline: string) => Promise<CommitOutcome>;
}): React.JSX.Element {
  return (
    <table data-grid>
      <tbody>
        <tr>
          <td>
            <CellInput aria-label="Name of 010" cellKey={CELL} value={value} commit={commit} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The other renderer, standing in for `M mobile-cards`: the same cell, the same
 * `data-cell`, no table anywhere. Two components rather than one with a flag,
 * because "the same state under a different renderer" is the whole claim and a
 * flag would let one component keep its own state through the switch.
 */
function CardFace({
  value,
  commit,
}: {
  value: string;
  commit: (typed: string, baseline: string) => Promise<CommitOutcome>;
}): React.JSX.Element {
  return (
    <div data-grid>
      <article>
        <CellInput aria-label="Name of 010" cellKey={CELL} value={value} commit={commit} />
      </article>
    </div>
  );
}

/** Types `text` into the one cell on screen and leaves it, which is what commits. */
function typeAndLeave(text: string): void {
  const box = screen.getByLabelText<HTMLInputElement>('Name of 010');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
}

const refuses = (): Promise<CommitOutcome> => Promise.resolve('refused');
const takes = (): Promise<CommitOutcome> => Promise.resolve('landed');

describe('a field outliving the thing that renders it', () => {
  /**
   * The mobile-rotate case, which is `X live-editing-extraction`'s reason to
   * exist: the phone turns, the table renderer goes and the card renderer
   * arrives, and the only copy of what be-01 refused was in the box that went
   * with it.
   *
   * Not the phase-change remount `wbs-table.test.tsx` already covers — that one
   * unmounts and remounts *the same* renderer, so a hold living anywhere that
   * survives a React unmount would pass it. This one changes the component
   * doing the rendering, which is what a breakpoint does.
   *
   * Two faults, both watched 2026-08-09.
   *
   * - The hold moved back inside the face: `takeNode` restoring from a private
   *   field of `LiveField`, which is constructed once per mount. This and the
   *   test below it failed on `expected 'Rewire the shed' to be 'Strip the
   *   wiring'` — and so did `keeps a draft be-01 refused when a new phase
   *   rebuilds every column`, which is the fault it was written for.
   * - The restore gated on `node.closest('table') !== null`, which is the
   *   assumption this change exists to remove. **Only this test saw it**: 695
   *   others passed, including both of the ones above, because everything else
   *   in this repo renders the grid as a table.
   */
  itDom('carries a refused draft from one renderer to the next', async () => {
    const table = render(<TableFace value="Rewire the shed" commit={refuses} />);
    typeAndLeave('Strip the wiring');
    await waitFor(() => {
      expect(refusedDraftFor(CELL)).toBe('Strip the wiring');
    });

    table.unmount();
    render(<CardFace value="Rewire the shed" commit={refuses} />);

    expect(screen.getByLabelText<HTMLInputElement>('Name of 010').value).toBe('Strip the wiring');
  });

  /**
   * The other direction, because a phone is turned back: the card is where the
   * refusal happened and the table is what has to show it.
   */
  itDom('carries it back the other way too', async () => {
    const card = render(<CardFace value="Rewire the shed" commit={refuses} />);
    typeAndLeave('Strip the wiring');
    await waitFor(() => {
      expect(refusedDraftFor(CELL)).toBe('Strip the wiring');
    });

    card.unmount();
    render(<TableFace value="Rewire the shed" commit={refuses} />);

    expect(screen.getByLabelText<HTMLInputElement>('Name of 010').value).toBe('Strip the wiring');
  });

  /**
   * The negative that keeps the one above from being "the module remembers
   * everything". An edit be-01 took is on the server, so the next renderer
   * reads it from the tree like any other value — and a field that carried its
   * typed text across regardless would be showing text nobody could explain.
   */
  itDom('carries nothing across when be-01 took the edit', async () => {
    const table = render(<TableFace value="Rewire the shed" commit={takes} />);
    typeAndLeave('Strip the wiring');
    await waitFor(() => {
      expect(refusedDraftFor(CELL)).toBeUndefined();
    });

    table.unmount();
    render(<CardFace value="Strip the wiring" commit={takes} />);

    expect(screen.getByLabelText<HTMLInputElement>('Name of 010').value).toBe('Strip the wiring');
  });

  /**
   * Resolving the refusal in the second renderer clears it for both, which is
   * what stops a draft nobody is being asked about any more from following the
   * reader around for the life of the page.
   */
  itDom('lets the second renderer put the refusal back and be done with it', async () => {
    const table = render(<TableFace value="Rewire the shed" commit={refuses} />);
    typeAndLeave('Strip the wiring');
    await waitFor(() => {
      expect(refusedDraftFor(CELL)).toBe('Strip the wiring');
    });

    table.unmount();
    render(<CardFace value="Rewire the shed" commit={refuses} />);
    typeAndLeave('Rewire the shed');

    await waitFor(() => {
      expect(refusedDraftFor(CELL)).toBeUndefined();
    });
  });
});

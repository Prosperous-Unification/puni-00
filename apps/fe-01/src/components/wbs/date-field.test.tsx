import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { DateField } from './date-field';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/** The field with a day on it, and the list of everything it has sent. */
function shownDay(day: string): { box: HTMLInputElement; sent: string[] } {
  const sent: string[] = [];
  render(
    <DateField
      aria-label="Starts"
      value={day}
      commit={(typed) => {
        sent.push(typed);
      }}
    />,
  );
  return { box: screen.getByLabelText<HTMLInputElement>('Starts'), sent };
}

describe('a date field holds what is being typed into it', () => {
  itDom('sends nothing while the box has the focus, however many segments land', () => {
    const { box, sent } = shownDay('');
    box.focus();

    for (const partial of ['0002-08-17', '0020-08-17', '0202-08-17', '2026-08-17']) {
      fireEvent.change(box, { target: { value: partial } });
    }

    expect(sent).toEqual([]);
  });

  itDom('sends the one date that was typed, on the way out', () => {
    const { box, sent } = shownDay('');
    box.focus();
    fireEvent.change(box, { target: { value: '2026-08-17' } });

    fireEvent.blur(box);

    expect(sent).toEqual(['2026-08-17']);
  });

  itDom('sends nothing for a focus and a blur with nothing typed', () => {
    // A person clicking through a row is not a person editing it. Sending
    // anyway writes what was on screen when the focus arrived over whatever has
    // happened since — `CellInput.commit` keeps the same rule.
    const { box, sent } = shownDay('2026-08-20');
    box.focus();

    fireEvent.blur(box);

    expect(sent).toEqual([]);
  });

  itDom('sends nothing twice for one edit', () => {
    const { box, sent } = shownDay('2026-08-20');
    box.focus();
    fireEvent.change(box, { target: { value: '2026-08-17' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    fireEvent.blur(box);

    expect(sent).toEqual(['2026-08-17']);
  });

  itDom('takes an emptied box as "no day", which is a change like any other', () => {
    const { box, sent } = shownDay('2026-08-20');
    box.focus();
    fireEvent.change(box, { target: { value: '' } });

    fireEvent.blur(box);

    expect(sent).toEqual(['']);
  });

  itDom('leaves a half-typed date alone instead of clearing the day it had', () => {
    // A date input reports `''` for a date it **cannot parse** as well as for
    // one that was cleared, and `validity.badInput` is the only thing that
    // tells them apart. jsdom parses nothing and answers `false` to everything,
    // so the browser's answer is given here — which is also what makes this the
    // negative of the test above rather than a second copy of it.
    //
    // Proof: the `badInput` line removed from `commitIfChanged`, this failed on
    // `expected [ '' ] to deeply equal []` — a constraint somebody set, cleared
    // by somebody who typed two digits and walked away.
    const { box, sent } = shownDay('2026-08-20');
    Object.defineProperty(box, 'validity', { configurable: true, value: { badInput: true } });
    box.focus();
    fireEvent.change(box, { target: { value: '' } });

    fireEvent.blur(box);

    expect(sent).toEqual([]);
  });
});

describe('a date field and the server’s answer', () => {
  /** The field with a day a button can change under it, as a refetch would. */
  function Host() {
    const [day, setDay] = useState('2026-08-20');
    return (
      <>
        <DateField aria-label="Starts" value={day} commit={() => undefined} />
        <button
          type="button"
          onClick={() => {
            setDay((current) => (current === '2026-08-20' ? '2026-09-01' : '2026-09-02'));
          }}
        >
          answer
        </button>
      </>
    );
  }

  itDom('never writes an answer over a reader who is in the box', () => {
    // The other half of the year-0002 fault: the box was controlled, so every
    // render re-asserted be-01's answer into it — and the render that landed
    // between two keystrokes reset the segment under the caret.
    //
    // Proof: the `document.activeElement` line removed from the effect, this
    // failed on `expected '2026-09-01' to be '2026-08-17'`.
    render(<Host />);
    const box = screen.getByLabelText<HTMLInputElement>('Starts');
    box.focus();
    fireEvent.change(box, { target: { value: '2026-08-17' } });

    fireEvent.click(screen.getByRole('button', { name: 'answer' }));

    expect(box.value).toBe('2026-08-17');
  });

  itDom('takes the answer once the reader has left', () => {
    render(<Host />);
    const box = screen.getByLabelText<HTMLInputElement>('Starts');

    fireEvent.click(screen.getByRole('button', { name: 'answer' }));

    expect(box.value).toBe('2026-09-01');
  });
});

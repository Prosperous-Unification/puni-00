import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SettableStatus, WorkItemStatus } from '@wbs/domain/progress';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusCell } from './status-cell';

const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

function cell(status: WorkItemStatus, offers: readonly SettableStatus[] = []) {
  const chosen: SettableStatus[] = [];
  render(
    <StatusCell
      cellKey="w1:status"
      rowNumber="010"
      rowId="w1"
      status={status}
      offers={offers}
      choose={(each) => {
        chosen.push(each);
      }}
      onGridKey={() => undefined}
      onOpenChange={() => undefined}
    />,
  );
  return { box: screen.getByLabelText<HTMLInputElement>('Status of 010'), chosen };
}

describe('the Status cell (add-work-item-statuses)', () => {
  afterEach(cleanup);

  itDom('draws each status in its own glyph and palette colour, a proxy muted', () => {
    const drawn = (
      [
        'unknown',
        'draft',
        'ready',
        'in_progress',
        'blocked_by_proxy',
        'on_hold',
        'blocked',
        'done',
      ] as const
    ).map((status) => {
      const { box } = cell(status);
      const seen = [box.value, box.style.color, box.getAttribute('data-fact-lead')];
      cleanup();
      return seen;
    });
    expect(drawn).toEqual([
      ['○', 'var(--muted-foreground)', 'Unknown'],
      ['◌', 'var(--status-draft)', 'Draft'],
      ['◎', 'var(--status-ready)', 'Ready'],
      ['◐', 'var(--status-in-progress)', 'In progress'],
      ['⊘', 'var(--status-blocked-by-proxy)', 'Blocked by proxy'],
      ['‖', 'var(--status-on-hold)', 'On hold'],
      ['⊘', 'var(--status-blocked)', 'Blocked'],
      ['✓', 'var(--status-done)', 'Done'],
    ]);
  });

  itDom('lists exactly the statuses it is offered, and hands the one taken back', () => {
    const { box, chosen } = cell('on_hold', ['ready', 'blocked', 'unknown']);
    fireEvent.click(box);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Ready',
      'Blocked',
      'Unknown',
    ]);
    fireEvent.click(screen.getByRole('option', { name: 'Blocked' }));
    expect(chosen).toEqual(['blocked']);
  });
});

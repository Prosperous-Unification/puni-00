import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NODE_READINGS } from '@wbs/domain/node-reading';
import type { SettableStatus, WorkItemStatus } from '@wbs/domain/progress';
import { afterEach, describe, expect, it } from 'vitest';

import {
  NODE_READING_GLYPH,
  NODE_READING_LABEL,
  readingWords,
  STATUS_GLYPH,
  StatusCell,
} from './status-cell';
import { NODE_READING_TOKEN, STATUS_TOKEN } from './status-palette';

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
      ['⊖', 'var(--status-blocked-by-proxy)', 'Blocked by proxy'],
      ['‖', 'var(--status-on-hold)', 'On hold'],
      ['⊘', 'var(--status-blocked)', 'Blocked'],
      ['✓', 'var(--status-done)', 'Done'],
    ]);
  });

  itDom('gives every status its own glyph, so blocked by proxy never reads as blocked', () => {
    const glyphs = (
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
      const glyph = box.value;
      cleanup();
      return glyph;
    });
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  itDom('says its status word to assistive tech, not only in the hover card', () => {
    const { box } = cell('blocked_by_proxy');
    // Proof: the `aria-describedby` dropped from the box, and this failed on
    // an empty description; watched 2026-09-29.
    expect(box).toHaveAccessibleDescription('Status: Blocked by proxy');
    expect(box).toHaveAccessibleName('Status of 010');
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

describe('the node reading glyphs (step-node-readings D4)', () => {
  it('gives every reading its own glyph', () => {
    const glyphs = NODE_READINGS.map((reading) => NODE_READING_GLYPH[reading]);
    expect(glyphs).toHaveLength(8);
    expect(new Set(glyphs).size).toBe(8);
  });

  it('reuses the status glyph and token for every word a status shares', () => {
    const shared = [
      'unknown',
      'in_progress',
      'done',
      'on_hold',
      'blocked',
      'blocked_by_proxy',
    ] as const;
    expect(shared.map((word) => NODE_READING_GLYPH[word])).toEqual(
      shared.map((word) => STATUS_GLYPH[word]),
    );
    expect(shared.map((word) => NODE_READING_TOKEN[word])).toEqual(
      shared.map((word) => STATUS_TOKEN[word]),
    );
    expect([NODE_READING_GLYPH.waiting, NODE_READING_GLYPH.skipped]).toEqual(['◇', '∅']);
    expect([NODE_READING_TOKEN.waiting, NODE_READING_TOKEN.skipped]).toEqual([
      'var(--reading-waiting)',
      'var(--reading-skipped)',
    ]);
  });

  it('says each reading in words for assistive tech', () => {
    expect(NODE_READINGS.map(readingWords)).toEqual([
      'Reading: Skipped',
      'Reading: Done',
      'Reading: On hold',
      'Reading: Blocked',
      'Reading: In progress',
      'Reading: Blocked by proxy',
      'Reading: Waiting',
      'Reading: Unknown',
    ]);
    expect(NODE_READING_LABEL.waiting).toBe('Waiting');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { InProgressList, readInProgress } from './in-progress-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const leaf = (overrides: Record<string, unknown>) => ({
  projectId: 'p1',
  projectName: 'Shed',
  position: 10,
  workItemId: 'w1',
  number: '1.2',
  name: 'Wire the lights',
  dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
  lateBy: null,
  assignees: [{ id: 'kat', name: 'Kat' }],
  step: { id: 'dev', name: 'Dev' },
  ...overrides,
});

const names = new Map([
  ['p1', 'Shed'],
  ['p2', 'Fence'],
]);

/** Reads the list through the stubbed route, then draws what the read answered. */
async function renderRead(answered: () => Response) {
  stubServer({ 'GET /api/spaces/s/in-progress': [answered] });
  render(<InProgressList state={await readInProgress('s')} projectNames={names} />);
}

describe('in progress now', () => {
  it('lists each leaf with its project, step, end, lateness and people', async () => {
    await renderRead(() =>
      answer(200, {
        items: [
          leaf({}),
          leaf({ workItemId: 'w2', number: '2', name: 'Paint', lateBy: 3 }),
          leaf({ workItemId: 'w3', number: '3', name: 'Seal', lateBy: 1, step: null }),
        ],
        truncated: false,
        unavailable: [],
      }),
    );
    const list = screen.getByRole('list', { name: 'Work in progress' });
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Shed 1.2 Wire the lights · Dev · ends 2026-10-09 · Kat',
      'Shed 2 Paint · Dev · ends 2026-10-09 · 3 days late · Kat',
      'Shed 3 Seal · ends 2026-10-09 · 1 day late · Kat',
    ]);
  });

  it('says the list was cut and names unavailable schedules', async () => {
    await renderRead(() =>
      answer(200, { items: [leaf({})], truncated: true, unavailable: ['p2'] }),
    );
    expect(screen.getByText('Showing the first 1.')).toBeDefined();
    expect(screen.getByText('Schedule unavailable for Fence.')).toBeDefined();
  });

  it('renders the loading, empty and failure states', async () => {
    render(<InProgressList state={{ kind: 'loading' }} projectNames={names} />);
    expect(screen.getByText('Loading work in progress…')).toBeDefined();
    cleanup();
    await renderRead(() => answer(200, { items: [], truncated: false, unavailable: [] }));
    expect(screen.getByText('Nothing is in progress in this space.')).toBeDefined();
    cleanup();
    await renderRead(() => answer(404, { error: 'not_found' }));
    expect(screen.getByRole('alert').textContent).toBe('That space or project no longer exists.');
  });
});

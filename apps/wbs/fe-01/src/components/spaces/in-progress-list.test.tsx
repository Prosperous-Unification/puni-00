import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { InProgressList } from './in-progress-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item = (overrides: Record<string, unknown>) => ({
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

describe('in progress now', () => {
  it('lists each leaf with its project, step, end, lateness and people', async () => {
    stubServer({
      'GET /api/spaces/s/in-progress': [
        () =>
          answer(200, {
            items: [item({}), item({ workItemId: 'w2', number: '2', name: 'Paint', lateBy: 3 })],
            truncated: false,
            unavailable: [],
          }),
      ],
    });
    render(<InProgressList spaceId="s" projectNames={names} />);
    const list = await screen.findByRole('list', { name: 'Work in progress' });
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Shed 1.2 Wire the lights · Dev · ends 2026-10-09 · Kat',
      'Shed 2 Paint · Dev · ends 2026-10-09 · 3 days late · Kat',
    ]);
  });

  it('says the list was cut and names unavailable schedules', async () => {
    stubServer({
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [item({})], truncated: true, unavailable: ['p2'] }),
      ],
    });
    render(<InProgressList spaceId="s" projectNames={names} />);
    expect(await screen.findByText('Showing the first 1.')).toBeDefined();
    expect(screen.getByText('Schedule unavailable for Fence.')).toBeDefined();
  });

  it('renders the loading, empty and failure states', async () => {
    stubServer({
      'GET /api/spaces/s/in-progress': [
        () => answer(200, { items: [], truncated: false, unavailable: [] }),
      ],
    });
    render(<InProgressList spaceId="s" projectNames={names} />);
    expect(await screen.findByText('Loading work in progress…')).toBeDefined();
    expect(await screen.findByText('Nothing is in progress in this space.')).toBeDefined();
    cleanup();
    stubServer({
      'GET /api/spaces/s/in-progress': [() => answer(404, { error: 'not_found' })],
    });
    render(<InProgressList spaceId="s" projectNames={names} />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That space or project no longer exists.',
    );
  });
});

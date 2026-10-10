import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { loadWindowFrom } from './load-window';
import { PersonLoadPage } from './person-load-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WINDOW = loadWindowFrom('2026-10-07');
const ROUTE = 'GET /api/people/pe-a/load';

const booking = (workItemId: string, startsOn: string, endsOn: string) => ({
  workItemId,
  number: '010',
  name: `Work ${workItemId}`,
  stepId: 'dev',
  startsOn,
  endsOn,
  width: 1,
});

const load = (overrides: Record<string, unknown> = {}) => ({
  person: { id: 'pe-a', name: 'Ana' },
  projects: [],
  overlaps: [],
  undated: [],
  unavailable: [],
  ...overrides,
});

function renderPage() {
  render(<PersonLoadPage personId="pe-a" window={WINDOW} />);
}

describe('the person load page', () => {
  it('reads the eight weeks from the Monday of the week it opens in', async () => {
    const sent = stubServer({ [ROUTE]: [() => answer(200, load())] });
    renderPage();
    expect(screen.getByText('Loading load…')).toBeDefined();
    expect(await screen.findByText('Nothing booked in these weeks.')).toBeDefined();
    expect(WINDOW).toEqual({ from: '2026-10-05', to: '2026-11-27', workdays: 40 });
    expect(sent.map((call) => [call.route, call.search])).toEqual([
      [ROUTE, '?from=2026-10-05&to=2026-11-27'],
    ]);
  });

  it('draws one lane per project and hatches the bookings be-01 names in an overlap', async () => {
    stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            load({
              projects: [
                {
                  projectId: 'p',
                  rank: 1,
                  name: 'Platform',
                  engine: 'fast',
                  bookings: [booking('w1', '2026-10-05', '2026-10-07')],
                },
                {
                  projectId: 'q',
                  rank: 2,
                  name: 'Billing',
                  engine: 'optimized',
                  bookings: [booking('w2', '2026-10-05', '2026-10-06')],
                },
              ],
              overlaps: [
                {
                  startsOn: '2026-10-05',
                  endsOn: '2026-10-06',
                  bookings: [
                    { projectId: 'p', workItemId: 'w1', stepId: 'dev' },
                    { projectId: 'q', workItemId: 'w2', stepId: 'dev' },
                  ],
                },
              ],
            }),
          ),
      ],
    });
    renderPage();
    const platform = await screen.findByRole('list', { name: 'Bookings in Platform' });
    const bar = within(platform).getByRole('listitem');
    expect(bar.getAttribute('aria-label')).toBe(
      '010 Work w1, 2026-10-05 to 2026-10-07, booked twice',
    );
    // Three of forty workdays, from the window's first.
    expect(bar.style.left).toBe('0%');
    expect(bar.style.width).toBe('7.5%');
    expect(bar.getAttribute('title')).toBe('010 Work w1');
    expect(screen.getByText('Billing (optimized)')).toBeDefined();
    expect(screen.getByText('Booked twice on 2026-10-05 to 2026-10-06.')).toBeDefined();
  });

  it('does not hatch a hand-off inside one day', async () => {
    stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            load({
              projects: [
                {
                  projectId: 'p',
                  rank: 1,
                  name: 'Platform',
                  engine: 'fast',
                  bookings: [booking('w1', '2026-10-05', '2026-10-07')],
                },
                {
                  projectId: 'q',
                  rank: 2,
                  name: 'Billing',
                  engine: 'fast',
                  bookings: [booking('w2', '2026-10-07', '2026-10-08')],
                },
              ],
            }),
          ),
      ],
    });
    renderPage();
    await screen.findByRole('list', { name: 'Bookings in Billing' });
    const bars = ['Platform', 'Billing'].map((name) =>
      within(screen.getByRole('list', { name: `Bookings in ${name}` })).getByRole('listitem'),
    );
    expect(bars.map((bar) => bar.getAttribute('data-overlapping'))).toEqual(['false', 'false']);
  });

  it('names undated and unreadable projects', async () => {
    stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            load({
              undated: [{ projectId: 'u', name: 'Someday' }],
              unavailable: [{ projectId: 'c', name: 'Loop', reason: 'cycle' }],
            }),
          ),
      ],
    });
    renderPage();
    expect(await screen.findByText('No start date, so nothing booked yet: Someday.')).toBeDefined();
    expect(
      screen.getByText('Loop could not be read: its dependencies run in a circle.'),
    ).toBeDefined();
  });

  it('shows the query failure for a reason the contract does not name, not a blank lane', async () => {
    stubServer({
      [ROUTE]: [
        () =>
          answer(
            200,
            load({ unavailable: [{ projectId: 'x', name: 'Mystery', reason: 'solver_melted' }] }),
          ),
      ],
    });
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The server returned an unexpected response. Try again.',
    );
    expect(screen.queryByText(/Mystery/)).toBeNull();
  });

  it('says a person outside the directory is not there', async () => {
    stubServer({ [ROUTE]: [() => answer(404, { error: 'not_found' })] });
    renderPage();
    expect(
      await screen.findByText('This person is not in your organization’s directory.'),
    ).toBeDefined();
  });

  it('shows a transport failure as a query failure', async () => {
    stubServer({});
    renderPage();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Could not reach the server. Try again.',
    );
  });
});

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  clientFromShapes,
  type ClientReply,
  type getWorkItems,
  readWorkPackage,
} from '@wbs/contracts';
import { DEFAULT_PRIORITY_BANDS } from '@wbs/domain/priority-band';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SessionFeaturesProvider } from '@/lib/session-features';
import { httpWorkPackageApi } from '@/lib/wbs-api';
import type { WorkPackageStreamDeps } from '@/lib/work-package-stream';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { WorkPackagePageOverOwner } from '@/testing/work-package-page-over-owner';

publishApplicationRuntimeForEachTest();
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

const PACKAGE_ID = 'settings-package';
const PROJECT_ID = 'settings-project';

/** Real declared HTTP envelopes; no new settings prop or fake API method supplies the UI. */
async function openGeneralSettings(budgetFactor: number | undefined) {
  const workPackage = {
    id: PACKAGE_ID,
    projectId: PROJECT_ID,
    name: 'Delivery plan',
    abbreviation: 'PLAN',
    restricted: false,
    estimateMethod: 'pert' as const,
    depReach: 'whole-item' as const,
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil' as const,
    startDate: null,
    solutionRef: null,
    revision: 0,
    createdAt: 1,
    optimizationEnabled: false,
    scheduleEngine: 'fast' as const,
    scheduleObjective: 'pri' as const,
    timezone: 'UTC',
    ...(budgetFactor === undefined ? {} : { budgetFactor }),
  };
  const envelope = { workPackage, steps: [] } satisfies Extract<
    ClientReply<typeof readWorkPackage>,
    { kind: 'success' }
  >['body'];
  const declared = clientFromShapes([readWorkPackage], () =>
    Promise.resolve({ kind: 'json', status: 200, body: envelope }),
  );
  const decoded = await declared.getApiWorkPackagesById({ params: { id: PACKAGE_ID } });
  expect(decoded.kind).toBe('success');
  if (decoded.kind !== 'success') throw new Error('actual package response fixture was refused');
  expect(decoded.body.workPackage.projectId).toBe(PROJECT_ID);
  expect(decoded.body.workPackage.budgetFactor).toBe(budgetFactor);

  const treeEnvelope = {
    workItems: [],
    seq: 1,
    scheduleError: null,
    waitingForPerson: 0,
    waitingForCapacity: 0,
    slices: [],
    steps: [],
    assignedPeople: [],
    teamCapacities: [],
    priorityBands: [...DEFAULT_PRIORITY_BANDS],
    estimateMethod: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'ceil',
    depReach: 'whole-item',
    startDate: null,
    workPackageRevision: 0,
    undoable: false,
    redoable: false,
    timezone: 'UTC',
  } satisfies Extract<ClientReply<typeof getWorkItems>, { kind: 'success' }>['body'];
  const requests: string[] = [];
  const replies = new Map<string, unknown>([
    ['GET /api/projects', { projects: [{ id: PROJECT_ID, name: 'Delivery' }] }],
    [
      'GET /api/work-packages',
      {
        workPackages: [{ ...workPackage, createdByName: 'Ada', lastOpenedAt: null }],
        nextCursor: null,
      },
    ],
    ['GET /api/work-packages/' + PACKAGE_ID, envelope],
    ['GET /api/work-packages/' + PACKAGE_ID + '/work-items', treeEnvelope],
    ['GET /api/work-packages/' + PACKAGE_ID + '/calendar-markers', { markers: [] }],
    ['GET /api/work-packages/' + PACKAGE_ID + '/claims', { readAt: 1, claims: [] }],
    ['GET /api/teams', { teams: [] }],
    ['GET /api/tags', { tags: [] }],
    ['GET /api/services', { services: [] }],
    ['GET /api/work-item-types', { workItemTypes: [] }],
    ['GET /api/external-systems', { externalSystems: [] }],
    ['GET /api/people', { people: [] }],
    ['GET /api/measures', { measures: [] }],
    ['GET /api/timezones', { timezones: ['UTC', 'Europe/Kyiv'] }],
  ]);
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const path = new URL(input, location.origin).pathname;
      const request = (init?.method ?? 'GET') + ' ' + path;
      requests.push(request);
      if (path.startsWith('/api/projects/'))
        throw new Error('package settings must not require project detail/settings authority');
      if (request === 'POST /api/work-packages/' + PACKAGE_ID + '/opened')
        return Promise.resolve(new Response(null, { status: 204 }));
      if (!replies.has(request)) throw new Error('unexpected settings UI request ' + request);
      return Promise.resolve(
        new Response(JSON.stringify(replies.get(request)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  const api = httpWorkPackageApi('settings-ui-fixture');
  expect(await api.listProjects()).toEqual([{ id: PROJECT_ID, name: 'Delivery' }]);
  expect(await api.steps(PACKAGE_ID)).toEqual([]);
  expect((await api.tree(PACKAGE_ID)).priorityBands).toEqual([...DEFAULT_PRIORITY_BANDS]);
  const streamDeps: WorkPackageStreamDeps = {
    openSocket: () => ({ send: () => undefined, close: () => undefined }),
    schedule: () => 0,
    cancel: () => undefined,
    random: () => 0,
  };
  render(
    <SessionFeaturesProvider value={{ onboarding: false, organizations: true }}>
      <WorkPackagePageOverOwner api={api} streamDeps={streamDeps} />
    </SessionFeaturesProvider>,
  );
  const picker = await screen.findByLabelText('Work package');
  fireEvent.focus(picker);
  const choice = await screen.findByRole('option', { name: /Delivery plan/u });
  fireEvent.click(choice);
  await waitFor(() => {
    expect(requests).toContain('GET /api/work-packages/' + PACKAGE_ID + '/work-items');
    expect(screen.getByRole('button', { name: 'Work package settings' })).toBeEnabled();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Work package settings' }));
  const dialog = await screen.findByRole('dialog', { name: 'Work package settings' });
  fireEvent.click(await within(dialog).findByRole('tab', { name: 'General' }));
  expect(within(dialog).getByRole('textbox', { name: 'Work package abbreviation' })).toHaveValue(
    'PLAN',
  );
  expect(requests).toContain('GET /api/work-packages/' + PACKAGE_ID + '/work-items');
  return { dialog, requests };
}

it('shows the project budget factor read-only from the actual package response beside a project shell', async () => {
  const { dialog, requests } = await openGeneralSettings(2.5);
  const budget = await within(dialog).findByRole('group', { name: 'Budget factor' });
  expect(within(budget).getByText('2.5')).toBeVisible();
  expect(within(budget).getByText('Managed at project level')).toBeVisible();
  expect(within(budget).queryByRole('spinbutton')).toBeNull();
  expect(within(budget).queryByRole('textbox')).toBeNull();
  expect(within(budget).queryByRole('button')).toBeNull();
  expect(requests.some((request) => request.startsWith('PATCH '))).toBe(false);
  expect(requests.some((request) => request.includes('/api/projects/'))).toBe(false);
});

it('shows an unavailable project budget state when the actual optional package field is absent', async () => {
  const { dialog, requests } = await openGeneralSettings(undefined);
  const budget = await within(dialog).findByRole('group', { name: 'Budget factor' });
  expect(within(budget).getByText('Budget factor is unavailable.')).toBeVisible();
  expect(within(budget).queryByText('1')).toBeNull();
  expect(within(budget).queryByRole('spinbutton')).toBeNull();
  expect(within(budget).queryByRole('textbox')).toBeNull();
  expect(within(budget).queryByRole('button')).toBeNull();
  expect(requests.some((request) => request.startsWith('PATCH '))).toBe(false);
});

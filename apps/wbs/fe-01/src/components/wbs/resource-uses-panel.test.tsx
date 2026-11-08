import { render as renderBare } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { ResourceUsesPanel } from './resource-uses-panel';

const NOW = Date.UTC(2026, 9, 25, 10);
const LIST = 'GET /api/projects/p1/resource-uses';
const EVENT = 'POST /api/projects/p1/resource-uses/u1/events';
const HISTORY = 'GET /api/projects/p1/resource-uses/u1/history';
const scope: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};
const useOf = (fields: Record<string, unknown> = {}) => ({
  id: 'u1',
  source: 'reported',
  organizationId: 'org-a',
  projectId: 'p1',
  projectName: 'Plan',
  resourceId: 'r1',
  resourceName: 'Scratch disk',
  unitLabel: 'GB',
  providerId: 'cp1',
  providerName: 'Host',
  workItemId: 'w1',
  workItemName: 'Compile',
  stepId: null,
  attemptNumber: null,
  agentRun: 'run-7',
  responsiblePersonId: 'agent-1',
  responsiblePersonName: 'Build agent',
  locator: '/work/build-7',
  units: 12,
  state: 'active',
  revision: 1,
  createdAt: NOW - 60000,
  updatedAt: NOW - 60000,
  createdBy: 'u1',
  updatedBy: 'u1',
  retention: null,
  ...fields,
});
const eventOf = (revision: number) => ({
  id: `e${String(revision)}`,
  useId: 'u1',
  revision,
  kind: 'cleanup_requested',
  source: 'reported',
  actorId: 'u1',
  actorName: 'Alice',
  actorPersonId: null,
  at: NOW - 1000,
  reason: `Reason ${String(revision)}`,
  evidence: null,
  ownerPersonId: null,
  reviewAt: null,
});
function mount(projectId = 'p1', shown = true, onBusyChange?: (busy: boolean) => void) {
  return renderBare(
    <OrganizationResourcesProvider scope={scope}>
      <ResourceUsesPanel
        projectId={projectId}
        shown={shown}
        onDirtyChange={() => undefined}
        onBusyChange={onBusyChange}
      />
    </OrganizationResourcesProvider>,
  );
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reported resource uses', () => {
  it('reads only when shown and treats cleanup request as pending, not released', async () => {
    const sent = stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      [EVENT]: [() => answer(200, { use: useOf({ state: 'cleanup_pending', revision: 2 }) })],
    });
    const mounted = mount('p1', false);
    expect(sent).toHaveLength(0);
    mounted.rerender(
      <OrganizationResourcesProvider scope={scope}>
        <ResourceUsesPanel projectId="p1" shown onDirtyChange={() => undefined} />
      </OrganizationResourcesProvider>,
    );
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Job ended' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(within(row).getByText('Cleanup pending')).toBeDefined();
    });
    expect(within(row).queryByText('Release reported')).toBeNull();
    expect(screen.getByText(/cleanup requests do not delete files/i)).toBeDefined();
    expect(sent.find((request) => request.route === EVENT)?.body).toMatchObject({
      kind: 'cleanup_requested',
      expectedRevision: 1,
      reason: 'Job ended',
    });
  });

  it('requires evidence for release and waits for server response', async () => {
    const sent = stubServer({
      [LIST]: [
        () => answer(200, { uses: [useOf({ state: 'cleanup_pending' })], nextCursor: null }),
      ],
      [EVENT]: [() => answer(200, { use: useOf({ state: 'release_reported', revision: 2 }) })],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Report release' }));
    fireEvent.change(within(row).getByLabelText('Reason'), {
      target: { value: 'Removed workspace' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    expect(sent.filter((request) => request.route === EVENT)).toHaveLength(0);
    expect(within(row).getByRole('alert')).toHaveTextContent('Evidence is required');
    fireEvent.change(within(row).getByLabelText('Evidence'), { target: { value: 'job-log-21' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(within(row).getByText('Release reported')).toBeDefined();
    });
    expect(sent.find((request) => request.route === EVENT)?.body).toMatchObject({
      kind: 'release_reported',
      expectedRevision: 1,
      reason: 'Removed workspace',
      evidence: 'job-log-21',
    });
  });

  it('shows retained metadata without claiming free capacity', async () => {
    stubServer({
      [LIST]: [
        () =>
          answer(200, {
            uses: [
              useOf({
                state: 'retained',
                revision: 2,
                retention: { ownerPersonId: 'p2', reason: 'Audit', reviewAt: NOW + 86400000 },
              }),
            ],
            nextCursor: null,
          }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    expect(within(row).getByText('Retained')).toBeDefined();
    expect(within(row).getByText(/Audit/)).toBeDefined();
    expect(within(row).queryByText(/free|freed/i)).toBeNull();
  });

  it('shows conflict and rereads current revision', async () => {
    const sent = stubServer({
      [LIST]: [
        () => answer(200, { uses: [useOf()], nextCursor: null }),
        () => answer(200, { uses: [useOf({ state: 'blocked', revision: 2 })], nextCursor: null }),
      ],
      [EVENT]: [() => answer(409, { error: 'conflict' })],
    });
    const onBusyChange = vi.fn();
    mount('p1', true, onBusyChange);
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'done' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/conflict/i);
    await waitFor(() => {
      expect(sent.filter((request) => request.route === LIST)).toHaveLength(2);
      expect(within(row).getByText('Blocked')).toBeDefined();
      expect(within(row).getByRole('button', { name: 'Send report' })).toBeEnabled();
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
    });
  });

  it('keeps Cancel unavailable until a refused write returns', async () => {
    let finishWrite: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const route = `${init?.method ?? 'GET'} ${new URL(url, 'http://wbs.test').pathname}`;
        if (route === LIST)
          return Promise.resolve(answer(200, { uses: [useOf()], nextCursor: null }));
        if (route === EVENT)
          return new Promise<Response>((resolve) => {
            finishWrite = resolve;
          });
        return Promise.reject(new Error(`unexpected ${route}`));
      }),
    );
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Job done' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(finishWrite).toBeDefined();
    });
    const cancel = within(row).getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeDisabled();
    fireEvent.click(cancel);
    await act(async () => {
      finishWrite?.(answer(403, { error: 'forbidden' }));
      await Promise.resolve();
    });
    expect(within(row).getByRole('alert')).toHaveTextContent(
      'Your role cannot change this resource use',
    );
  });

  it('paginates history with actor, reason and evidence', async () => {
    const sent = stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      [HISTORY]: [
        () => answer(200, { events: [eventOf(1)], nextCursor: 'page-2' }),
        () => answer(200, { events: [{ ...eventOf(2), evidence: 'log-2' }], nextCursor: null }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Show history' }));
    expect(await within(row).findByText('Reason 1')).toBeDefined();
    fireEvent.click(within(row).getByRole('button', { name: 'More history' }));
    expect(await within(row).findByText('log-2')).toBeDefined();
    expect(within(row).getAllByText('Alice').length).toBeGreaterThan(0);
    expect(
      sent.find((request) => request.route === HISTORY && request.search?.includes('page-2')),
    ).toBeDefined();
  });

  it('pages reported uses without treating another page as a new list', async () => {
    const sent = stubServer({
      [LIST]: [
        () => answer(200, { uses: [useOf()], nextCursor: 'after-u1' }),
        () =>
          answer(200, {
            uses: [useOf({ id: 'u2', resourceName: 'Staging slot', workItemName: 'Publish' })],
            nextCursor: null,
          }),
      ],
    });
    mount();
    expect(await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'More resource uses' }));
    expect(await screen.findByRole('listitem', { name: /Staging slot.*Publish/ })).toBeDefined();
    expect(screen.getByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeDefined();
    expect(
      sent.find((request) => request.route === LIST && request.search?.includes('after-u1')),
    ).toBeDefined();
  });

  it('keeps loaded uses when a later page fails and retries the same cursor', async () => {
    const sent = stubServer({
      [LIST]: [
        () => answer(200, { uses: [useOf()], nextCursor: 'after-u1' }),
        () => answer(503, { error: 'resource_tracking_unavailable' }),
        () =>
          answer(200, {
            uses: [useOf({ id: 'u2', resourceName: 'Staging slot' })],
            nextCursor: null,
          }),
      ],
    });
    mount();
    expect(await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'More resource uses' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /More resource uses could not be read/,
    );
    expect(screen.getByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry resource uses page' }));
    expect(await screen.findByRole('listitem', { name: /Staging slot.*Compile/ })).toBeDefined();
    expect(
      sent.filter((request) => request.route === LIST && request.search?.includes('after-u1')),
    ).toHaveLength(2);
  });

  it('keeps loaded history when a later page fails and retries the same cursor', async () => {
    const sent = stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      [HISTORY]: [
        () => answer(200, { events: [eventOf(1)], nextCursor: 'after-e1' }),
        () => answer(503, { error: 'resource_tracking_unavailable' }),
        () => answer(200, { events: [eventOf(2)], nextCursor: null }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Show history' }));
    expect(await within(row).findByText('Reason 1')).toBeDefined();
    fireEvent.click(within(row).getByRole('button', { name: 'More history' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(
      /More history could not be read/,
    );
    expect(within(row).getByText('Reason 1')).toBeDefined();
    fireEvent.click(within(row).getByRole('button', { name: 'Retry history page' }));
    expect(await within(row).findByText('Reason 2')).toBeDefined();
    expect(
      sent.filter((request) => request.route === HISTORY && request.search?.includes('after-e1')),
    ).toHaveLength(2);
  });

  it('ignores an old project response after switching projects', async () => {
    let finishOld: ((response: Response) => void) | undefined;
    const sent: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const address = new URL(url, 'http://wbs.test');
        sent.push(address.pathname);
        if (address.pathname === '/api/projects/p1/resource-uses')
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        return Promise.resolve(
          answer(200, {
            uses: [useOf({ id: 'u2', projectId: 'p2', resourceName: 'New project disk' })],
            nextCursor: null,
          }),
        );
      }),
    );
    const mounted = mount();
    await waitFor(() => {
      expect(finishOld).toBeDefined();
    });
    mounted.rerender(
      <OrganizationResourcesProvider scope={scope}>
        <ResourceUsesPanel projectId="p2" shown onDirtyChange={() => undefined} />
      </OrganizationResourcesProvider>,
    );
    expect(
      await screen.findByRole('listitem', { name: /New project disk.*Compile/ }),
    ).toBeDefined();
    await act(async () => {
      finishOld?.(answer(200, { uses: [useOf()], nextCursor: null }));
      await Promise.resolve();
    });
    expect(screen.queryByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeNull();
    expect(sent).toContain('/api/projects/p2/resource-uses');
  });

  it('ignores an old organization response after scope changes', async () => {
    let finishOld: ((response: Response) => void) | undefined;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        calls++;
        if (calls === 1)
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        return Promise.resolve(
          answer(200, {
            uses: [
              useOf({ id: 'u2', organizationId: 'org-b', resourceName: 'Other organization disk' }),
            ],
            nextCursor: null,
          }),
        );
      }),
    );
    const mounted = mount();
    await waitFor(() => {
      expect(finishOld).toBeDefined();
    });
    const otherScope: ResourceScope = {
      organization: { kind: 'active', organizationId: 'org-b' },
      isCurrent: () => true,
      refuse: () => undefined,
    };
    mounted.rerender(
      <OrganizationResourcesProvider scope={otherScope}>
        <ResourceUsesPanel projectId="p1" shown onDirtyChange={() => undefined} />
      </OrganizationResourcesProvider>,
    );
    expect(
      await screen.findByRole('listitem', { name: /Other organization disk.*Compile/ }),
    ).toBeDefined();
    await act(async () => {
      finishOld?.(answer(200, { uses: [useOf()], nextCursor: null }));
      await Promise.resolve();
    });
    expect(screen.queryByRole('listitem', { name: /Scratch disk.*Compile/ })).toBeNull();
  });

  it('names the retention owner from the people directory when available', async () => {
    stubServer({
      [LIST]: [
        () =>
          answer(200, {
            uses: [
              useOf({
                state: 'retained',
                retention: { ownerPersonId: 'p2', reason: 'Audit', reviewAt: NOW + 86400000 },
              }),
            ],
            nextCursor: null,
          }),
      ],
      'GET /api/people': [
        () => answer(200, { people: [{ id: 'p2', name: 'Alice', kind: 'person', teamIds: [] }] }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    expect(await within(row).findByText(/Retained by Alice/)).toBeDefined();
  });

  it('requires a named retention owner and future review date', async () => {
    const sent = stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      'GET /api/people': [
        () => answer(200, { people: [{ id: 'p2', name: 'Alice', kind: 'person', teamIds: [] }] }),
      ],
      [EVENT]: [
        () =>
          answer(200, {
            use: useOf({
              state: 'retained',
              revision: 2,
              retention: { ownerPersonId: 'p2', reason: 'Audit', reviewAt: NOW + 86400000 },
            }),
          }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Retain' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Audit' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    expect(sent.filter((request) => request.route === EVENT)).toHaveLength(0);
    expect(within(row).getByRole('alert')).toHaveTextContent(/retention owner/i);
    await within(row).findByRole('option', { name: 'Alice' });
    fireEvent.change(within(row).getByLabelText('Retention owner'), { target: { value: 'p2' } });
    fireEvent.change(within(row).getByLabelText('Review date'), {
      target: { value: '2026-10-27' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Send report' }));
    await waitFor(() => {
      expect(within(row).getByText('Retained')).toBeDefined();
    });
    expect(sent.find((request) => request.route === EVENT)?.body).toMatchObject({
      kind: 'retained',
      ownerPersonId: 'p2',
    });
  });

  it('names an empty event history', async () => {
    stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      [HISTORY]: [() => answer(200, { events: [], nextCursor: null })],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Show history' }));
    expect(await within(row).findByText('No events reported')).toBeDefined();
  });

  it('shows a history refusal and recovers on retry', async () => {
    stubServer({
      [LIST]: [() => answer(200, { uses: [useOf()], nextCursor: null })],
      [HISTORY]: [
        () => answer(403, { error: 'forbidden' }),
        () => answer(200, { events: [eventOf(1)], nextCursor: null }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Show history' }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/role cannot/);
    fireEvent.click(within(row).getByRole('button', { name: 'Retry history' }));
    expect(await within(row).findByText('Reason 1')).toBeDefined();
  });

  it('shows network failure without inventing an empty list', async () => {
    stubServer({});
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Resource uses could not be read/);
    expect(screen.queryByText('No resource uses registered')).toBeNull();
  });

  it('queues cleanup for a managed use without claiming cleanup happened', async () => {
    const managed = useOf({
      source: 'runtime',
      runtimeId: 'dash-host-a',
      runtimeRevision: 3,
      incarnation: 'inc-7',
      pendingCleanupRequest: false,
      reclaimedBytes: null,
    });
    const sent = stubServer({
      [LIST]: [() => answer(200, { uses: [managed], nextCursor: null })],
      [EVENT]: [() => answer(200, { use: { ...managed, pendingCleanupRequest: true } })],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    expect(within(row).getByText('Managed by Dash')).toBeDefined();
    expect(within(row).getByRole('button', { name: 'Request cleanup' })).toBeDefined();
    expect(within(row).queryByRole('button', { name: 'Retain' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Report release' })).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Run ended' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send cleanup request' }));
    expect(await within(row).findByText('Cleanup request queued for Dash')).toBeDefined();
    expect(within(row).getByText('Active')).toBeDefined();
    expect(within(row).queryByText('Release verified')).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Retry cleanup' })).toBeNull();
    expect(sent.find((request) => request.route === EVENT)?.body).toMatchObject({
      kind: 'cleanup_requested',
      expectedRevision: 1,
    });
  });

  it('closes an open cleanup form when a conflict reread finds a queued managed request', async () => {
    const managed = useOf({
      source: 'runtime',
      runtimeId: 'dash-host-a',
      runtimeRevision: 3,
      incarnation: 'inc-7',
      pendingCleanupRequest: false,
      reclaimedBytes: null,
    });
    const sent = stubServer({
      [LIST]: [
        () => answer(200, { uses: [managed], nextCursor: null }),
        () =>
          answer(200, {
            uses: [{ ...managed, pendingCleanupRequest: true, revision: 2 }],
            nextCursor: null,
          }),
      ],
      [EVENT]: [() => answer(409, { error: 'conflict' })],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Job done' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send cleanup request' }));
    await waitFor(() => {
      expect(sent.filter((request) => request.route === LIST)).toHaveLength(2);
    });
    expect(await within(row).findByText('Cleanup request queued for Dash')).toBeDefined();
    await waitFor(() => {
      expect(within(row).queryByRole('button', { name: 'Send cleanup request' })).toBeNull();
    });
  });

  it('shows a delayed managed conflict after its queued reread closes the form', async () => {
    const managed = useOf({
      source: 'runtime',
      runtimeId: 'dash-host-a',
      runtimeRevision: 3,
      incarnation: 'inc-7',
      pendingCleanupRequest: false,
      reclaimedBytes: null,
    });
    let finishWrite: ((response: Response) => void) | undefined;
    let listReads = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        const route = `${init?.method ?? 'GET'} ${new URL(url, 'http://wbs.test').pathname}`;
        if (route === LIST) {
          listReads++;
          return Promise.resolve(
            answer(200, {
              uses: [
                listReads === 1
                  ? managed
                  : { ...managed, pendingCleanupRequest: true, revision: 2 },
              ],
              nextCursor: null,
            }),
          );
        }
        if (route === EVENT)
          return new Promise<Response>((resolve) => {
            finishWrite = resolve;
          });
        return Promise.reject(new Error(`unexpected ${route}`));
      }),
    );
    const onBusyChange = vi.fn();
    mount('p1', true, onBusyChange);
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Request cleanup' }));
    fireEvent.change(within(row).getByLabelText('Reason'), { target: { value: 'Job done' } });
    fireEvent.click(within(row).getByRole('button', { name: 'Send cleanup request' }));
    await waitFor(() => {
      expect(finishWrite).toBeDefined();
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => {
      finishWrite?.(answer(409, { error: 'conflict' }));
      await Promise.resolve();
    });
    expect(await within(row).findByText('Cleanup request queued for Dash')).toBeDefined();
    await waitFor(() => {
      expect(onBusyChange).toHaveBeenLastCalledWith(false);
      expect(within(row).queryByRole('button', { name: 'Send cleanup request' })).toBeNull();
      expect(within(row).queryByRole('button', { name: 'Retry cleanup' })).toBeNull();
      expect(within(row).getByRole('alert')).toHaveTextContent(
        /Conflict: this resource use changed.*review it before retrying/i,
      );
    });
  });

  it('offers only a cleanup retry for a managed pending use', async () => {
    const managed = useOf({
      source: 'runtime',
      state: 'cleanup_pending',
      runtimeId: 'dash-host-a',
      runtimeRevision: 4,
      incarnation: 'inc-7',
      pendingCleanupRequest: false,
      reclaimedBytes: null,
    });
    stubServer({ [LIST]: [() => answer(200, { uses: [managed], nextCursor: null })] });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    expect(within(row).getByRole('button', { name: 'Retry cleanup' })).toBeDefined();
    expect(within(row).queryByRole('button', { name: 'Report blocked' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Report release' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Retain' })).toBeNull();
  });

  it('shows verified release only from runtime state and exposes no report actions', async () => {
    const managed = useOf({
      source: 'runtime',
      state: 'release_verified',
      runtimeId: 'dash-host-a',
      runtimeRevision: 7,
      incarnation: 'inc-7',
      pendingCleanupRequest: false,
      reclaimedBytes: null,
    });
    stubServer({
      [LIST]: [() => answer(200, { uses: [managed], nextCursor: null })],
      [HISTORY]: [
        () =>
          answer(200, {
            events: [
              {
                ...eventOf(7),
                id: 'verified',
                kind: 'release_verified',
                source: 'runtime',
                actorName: 'Dash host a',
                evidence: 'provider:absent/23',
              },
            ],
            nextCursor: null,
          }),
      ],
    });
    mount();
    const row = await screen.findByRole('listitem', { name: /Scratch disk.*Compile/ });
    expect(within(row).getByText('Release verified')).toBeDefined();
    expect(
      within(row).queryByRole('button', { name: /Report release|Request cleanup|Retain/ }),
    ).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Show history' }));
    expect(await within(row).findByText('provider:absent/23')).toBeDefined();
    expect(within(row).getByText('Dash host a')).toBeDefined();
  });

  it('shows tracking failure locally and retries', async () => {
    stubServer({
      [LIST]: [
        () => answer(503, { error: 'resource_tracking_unavailable' }),
        () => answer(200, { uses: [], nextCursor: null }),
      ],
    });
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/resource uses/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry resource uses' }));
    expect(await screen.findByText('No resource uses registered')).toBeDefined();
  });
});

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { clientFromShapes, getWorkItems } from '@wbs/contracts';
import { afterEach, expect, it, vi } from 'vitest';

import { httpProjectApi } from '@/lib/wbs-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

// eslint-disable-next-line @nx/enforce-module-boundaries -- Only this test imports the runner-free producer; production frontend modules never import scheduling code.
import {
  createConnectedOptimizationTree,
  createFractionalConnectedOptimizationTree,
  createUnavailableConnectedOptimizationTree,
} from '../../../../../../libs/wbs/application/core/src/testing/connected-optimization-view.fixture';
import type { SubscriptionHandlers } from './wbs-table';

publishApplicationRuntimeForEachTest();
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

function serveTree(tree: unknown) {
  const fetchTree = vi.fn((url: string) => {
    if (!['A', 'B', 'C'].some((projectId) => url === `/api/projects/${projectId}/work-items`))
      throw new Error(`unexpected connected fixture request ${url}`);
    return Promise.resolve(
      new Response(JSON.stringify(tree), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchTree);
  return fetchTree;
}

it.each(['idle', 'pending', 'failed'] as const)(
  'decodes actual fractional dates and certificate beside independent Pri %s',
  async (sibling) => {
    const tree = createFractionalConnectedOptimizationTree(sibling);
    const serialized: unknown = JSON.parse(JSON.stringify(tree));
    const decoded = await clientFromShapes([getWorkItems], () =>
      Promise.resolve({ kind: 'json', status: 200, body: serialized }),
    )['getApiProjectsByIdWork-items']({ params: { id: 'B' } });
    if (decoded.kind !== 'success')
      throw new Error(`decoder refused fixture: ${JSON.stringify(decoded)}`);
    expect(decoded.body).toEqual(tree);
    expect(tree.slices).toMatchObject([{ earliestStart: 0.2, earliestFinish: 1.2 }]);
    expect(tree.workItems[0]?.schedule).toMatchObject({ earliestStart: 0.2, earliestFinish: 1.2 });
    expect(tree.optimization?.variants.pri.state).toBe(sibling);
    expect(tree.optimization?.variants.time).toMatchObject({
      state: 'boundary-infeasible',
      certificate: { evidence: 'contradictory-bounds' },
    });
    expect(tree.optimization?.finishDays).toEqual({ fast: 1.2 });
    expect(tree.optimization?.sameOrderAsFast).toEqual({});
    serveTree(tree);
    expect((await httpProjectApi('token').tree('B')).optimization).toEqual(tree.optimization);
  },
);

it.each(['ready', 'boundary-infeasible', 'pending', 'floor'] as const)(
  'retains the complete mixed producer %s packet through generated decoding',
  async (state) => {
    const tree = createConnectedOptimizationTree(state);
    const serialized: unknown = JSON.parse(JSON.stringify(tree));
    const decoded = await clientFromShapes([getWorkItems], () =>
      Promise.resolve({ kind: 'json', status: 200, body: serialized }),
    )['getApiProjectsByIdWork-items']({ params: { id: 'A' } });
    if (decoded.kind !== 'success')
      throw new Error(`decoder refused fixture: ${JSON.stringify(decoded)}`);
    expect(decoded.body).toEqual(tree);
    expect(tree.optimization?.scope?.fixed.find((fixed) => fixed.projectId === 'C')).toMatchObject({
      start: 8,
      finish: 9,
    });
    if (state === 'ready') {
      const final = createConnectedOptimizationTree(state, 'C');
      expect(final.workItems[0]?.schedule?.earliestStart).toBe(4);
      expect(final.startDate).toBe('2026-10-07');
      expect(tree.startDate).toBe('2026-10-05');
      // Wednesday's anchor is two workdays after this component's Monday origin.
      expect((final.workItems[0]?.schedule?.earliestStart ?? NaN) + 2).toBe(6);
    }
    serveTree(tree);
    expect((await httpProjectApi('token').tree('A')).optimization).toEqual(tree.optimization);
    await expect(httpProjectApi('token').tree('B')).rejects.toThrow(
      'connected_optimization_project_mismatch',
    );
  },
);

it.each(['missing-calendar', 'required-engine'] as const)(
  'mounts real producer %s reads through HTTP on table and cards without fabricated figures',
  async (reason) => {
    const tree = createUnavailableConnectedOptimizationTree(reason);
    const fetchTree = serveTree(tree);
    const http = httpProjectApi('token');
    const read = await http.tree('B');
    expect(read.optimization).toBeUndefined();
    expect(read.scheduleError).toEqual(tree.scheduleError);
    expect(read.typedDependencies).toHaveLength(1);
    expect(read.workItems[0]?.nodeReadings).toEqual(tree.workItems[0]?.nodeReadings);
    const api = fakeProjectApi();
    api.tree = (projectId) => http.tree(projectId);
    const retry = vi.spyOn(api, 'retryOptimization');
    const mounted = render(
      <WbsTableOverClient projectId="B" projectServices={projectServicesOf(api)} />,
    );
    const name = await screen.findByDisplayValue('b');
    expect(name).toBeEnabled();
    expect(document.querySelector('[data-node-reading]')).toHaveAttribute(
      'data-node-reading',
      'unknown',
    );
    expect(document.querySelector('[data-cue-active]')).toBeNull();
    expect(document.querySelector('[data-gantt-bar]')).toBeNull();
    expect(document.querySelector('[data-start]')?.textContent).toBe('—');
    expect(document.querySelector('[data-finish]')?.textContent).toBe('—');
    expect(screen.queryByRole('button', { name: /is the active schedule/ })).toBeNull();
    expect(document.body).toHaveTextContent(
      reason === 'missing-calendar'
        ? 'Dates are unavailable because a dependency project has no start date: A · A.'
        : 'The required optimized scheduling engine is unavailable.',
    );
    fireEvent.mouseEnter(screen.getByLabelText('Add a dependency to 010').closest('td')!);
    expect(await screen.findByRole('link', { name: 'Open A.010' })).toHaveAttribute(
      'href',
      '/?project=A&workItem=a',
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    fireEvent.resize(window);
    await waitFor(() => {
      expect(document.querySelector('[data-card]')).not.toBeNull();
    });
    expect(screen.getByDisplayValue('b')).toBeEnabled();
    expect(document.querySelector('[data-card-reading]')).toHaveAttribute(
      'data-card-reading',
      'unknown',
    );
    expect(document.querySelector('[data-cue-active]')).toBeNull();
    expect(document.querySelector('[data-card-span]')?.textContent).toBe('— → —');
    fireEvent.click(screen.getByRole('button', { name: 'Depends on for 010' }));
    expect(await screen.findByRole('link', { name: 'Open A.010' })).toHaveAttribute(
      'href',
      '/?project=A&workItem=a',
    );
    mounted.unmount();
    expect(fetchTree.mock.calls.length).toBeGreaterThan(1);
    expect(retry).not.toHaveBeenCalled();
  },
);

it.each(['unknown-state', 'unknown-evidence', 'sibling-objective', 'sibling-bytes'] as const)(
  'refuses %s in an actual producer packet before connected presentation',
  async (fault) => {
    const tree = createFractionalConnectedOptimizationTree();
    const terminal = tree.optimization?.variants.time;
    if (terminal?.state !== 'boundary-infeasible') throw new Error('missing terminal fixture');
    if (fault === 'unknown-state') Reflect.set(terminal, 'state', 'future-state');
    if (fault === 'unknown-evidence')
      Reflect.set(terminal.certificate, 'evidence', 'future-evidence');
    if (fault === 'sibling-objective')
      Reflect.set(terminal.certificate.question, 'objective', 'pri');
    if (fault === 'sibling-bytes')
      Reflect.set(terminal.certificate.question, 'stageBytes', 'foreign');
    serveTree(tree);
    await expect(httpProjectApi('token').tree('B')).rejects.toThrow('invalid_response');
  },
);

it('mounts fractional Fast dates, bars and card spans beside captured terminal evidence', async () => {
  const tree = createFractionalConnectedOptimizationTree();
  serveTree(tree);
  const http = httpProjectApi('token');
  const api = fakeProjectApi();
  api.tree = (projectId) => http.tree(projectId);
  render(<WbsTableOverClient projectId="B" projectServices={projectServicesOf(api)} />);
  expect(await screen.findByDisplayValue('b')).toBeEnabled();
  expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Fast');
  expect(document.querySelector('[data-start]')?.textContent).toBe('5 Oct');
  expect(document.querySelector('[data-finish]')?.textContent).toBe('6 Oct');
  const cue = screen.getByRole('button', { name: /Fast is the active schedule/ });
  expect(cue.getAttribute('data-fact')).toContain('captured fixed positions');
  expect(cue.getAttribute('data-fact')).toContain('rounded bounds');
  fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
  await waitFor(() => {
    expect(document.querySelector('[data-gantt-bar]')).toHaveAttribute('data-start', '0.2');
    expect(document.querySelector('[data-gantt-bar]')).toHaveAttribute('data-finish', '1.2');
  });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  fireEvent.resize(window);
  await waitFor(() => {
    expect(document.querySelector('[data-card-span]')).not.toBeNull();
  });
  expect(document.querySelector('[data-card-span]')).toHaveTextContent('5 Oct → 6 Oct');
  expect(document.querySelector('[data-card-span]')?.getAttribute('data-fact')).toBe(
    '2026-10-05 → 2026-10-06',
  );
});

it.each(['ready', 'floor'] as const)(
  'mounts retained %s scope independently from final C placement',
  async (state) => {
    const tree = createConnectedOptimizationTree(state);
    serveTree(tree);
    const http = httpProjectApi('token');
    const api = fakeProjectApi();
    api.tree = (projectId) => http.tree(projectId);
    const mounted = render(
      <WbsTableOverClient projectId="A" projectServices={projectServicesOf(api)} />,
    );
    await screen.findAllByDisplayValue('a');
    expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Time');
    const cue = screen.getByRole('button', { name: /Finish-first is the active schedule/ });
    expect(cue.getAttribute('data-fact')).toContain(
      'start 8, finish 9 workdays from the captured component origin',
    );
    expect(cue.getAttribute('data-fact')).toContain(
      state === 'floor'
        ? 'Published placement retains the captured baseline'
        : 'Earlier project deadline by 6 days',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'The selected Finish-first schedule remains displayed',
    );
    mounted.unmount();
    serveTree(createConnectedOptimizationTree(state, 'C'));
    render(<WbsTableOverClient projectId="C" projectServices={projectServicesOf(api)} />);
    await screen.findByDisplayValue('c');
    expect(document.querySelector('[data-start]')?.textContent).toBe(
      state === 'ready' ? '13 Oct' : '15 Oct',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
    await waitFor(() =>
      expect(document.querySelector('[data-gantt-bar]')).toHaveAttribute(
        'data-start',
        state === 'ready' ? '4' : '6',
      ),
    );
  },
);

function serveActions(read: () => unknown) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (method === 'GET' && /^\/api\/projects\/[ABC]\/work-items$/.test(path))
      return Promise.resolve(
        new Response(JSON.stringify(read()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    if (method === 'POST' && /^\/api\/projects\/[ABC]\/optimization\/retry$/.test(path))
      return Promise.resolve(
        new Response(JSON.stringify({ state: 'retrying', generation: 1, inputHash: 'accepted' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    if (method === 'PATCH' && /^\/api\/projects\/[ABC]$/.test(path))
      return Promise.resolve(new Response('injected unexpected settings write', { status: 500 }));
    throw new Error(`unexpected connected request ${method} ${path}`);
  });
  const http = httpProjectApi('token');
  const api = {
    ...fakeProjectApi(),
    tree: http.tree.bind(http),
    retryOptimization: http.retryOptimization.bind(http),
    setOptimizationSettings: http.setOptimizationSettings.bind(http),
  };
  let changed: SubscriptionHandlers['onChange'] = () => {
    throw new Error('missing mounted subscription');
  };
  const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
    changed = handlers.onChange;
    return { seen: () => undefined, unsubscribe: () => undefined };
  };
  return {
    api,
    requests,
    subscribe,
    refresh: () => {
      act(() => {
        changed('project_settings_changed');
      });
    },
  };
}

function refuseTerminal(): void {
  const cue = screen.getByRole('button', { name: /is the active schedule/ });
  fireEvent.click(cue);
  const time = screen.getByRole('menuitem', { name: /^Time/ });
  expect(time).toHaveAttribute('aria-disabled', 'true');
  expect(time).not.toHaveTextContent(/days|earlier|same order/);
  fireEvent.keyDown(screen.getByRole('menuitem', { name: /^✓ Fast/ }), { key: 'ArrowDown' });
  fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Pri/ }), { key: 'ArrowDown' });
  expect(time).toHaveFocus();
  fireEvent.keyDown(time, { key: 'Enter' });
  fireEvent.keyDown(time, { key: ' ' });
  fireEvent.click(time);
  expect(screen.queryByRole('menuitem', { name: /Retry/ })).toBeNull();
  fireEvent.keyDown(time, { key: 'Escape' });
  fireEvent.click(cue);
  expect(screen.getByRole('menuitem', { name: /^Time/ })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.queryByRole('menuitem', { name: /Retry/ })).toBeNull();
  fireEvent.keyDown(screen.getByRole('menuitem', { name: /^Time/ }), { key: 'Escape' });
}

it.each([1024, 390])(
  'suppresses terminal HTTP actions across reopen/refetch/remount at width %s',
  async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    let current = createFractionalConnectedOptimizationTree();
    const transport = serveActions(() => current);
    const draw = () =>
      render(
        <WbsTableOverClient
          projectId="B"
          projectServices={projectServicesOf(transport.api)}
          subscribe={transport.subscribe}
        />,
      );
    const mounted = draw();
    await screen.findByDisplayValue('b');
    refuseTerminal();
    current = createFractionalConnectedOptimizationTree('idle', 'refetched');
    transport.refresh();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /is the active schedule/ }).getAttribute('data-fact'),
      ).toContain('Question hash refetched-time');
    });
    refuseTerminal();
    const readsBeforeRemount = transport.requests.filter(
      (request) => request.method === 'GET',
    ).length;
    mounted.unmount();
    draw();
    await screen.findByDisplayValue('b');
    await waitFor(() => {
      expect(
        transport.requests.filter((request) => request.method === 'GET').length,
      ).toBeGreaterThan(readsBeforeRemount);
    });
    refuseTerminal();
    expect(transport.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    if (width === 390)
      expect(document.querySelector('[data-card-span]')).toHaveTextContent('5 Oct → 6 Oct');
    else expect(document.querySelector('[data-start]')).toHaveTextContent('5 Oct');
    expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Fast');
  },
);

it.each([1024, 390])(
  'retries only failed Pri with the refetched connected hash at width %s',
  async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    let current = createFractionalConnectedOptimizationTree('failed');
    const transport = serveActions(() => current);
    render(
      <WbsTableOverClient
        projectId="B"
        projectServices={projectServicesOf(transport.api)}
        subscribe={transport.subscribe}
      />,
    );
    await screen.findByDisplayValue('b');
    current = createFractionalConnectedOptimizationTree('failed', 'current-connected');
    transport.refresh();
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /is the active schedule/ }).getAttribute('data-fact'),
      ).toContain('Question hash current-connected-time');
    });
    fireEvent.click(screen.getByRole('button', { name: /is the active schedule/ }));
    expect(screen.getByRole('menuitem', { name: /^Time/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('menuitem', { name: 'Retry Time' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Pri' }));
    await waitFor(() => {
      expect(transport.requests.filter((request) => request.method !== 'GET')).toEqual([
        {
          method: 'POST',
          path: '/api/projects/B/optimization/retry',
          body: { objective: 'pri', inputHash: 'current-connected' },
        },
      ]);
    });
    expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Fast');
  },
);

it('announces the pending sibling while retaining terminal scope and real dates', async () => {
  const transport = serveActions(() => createFractionalConnectedOptimizationTree('pending'));
  render(<WbsTableOverClient projectId="B" projectServices={projectServicesOf(transport.api)} />);
  await screen.findByDisplayValue('b');
  expect(screen.getByRole('status')).toHaveTextContent('Priority-first: Optimizing');
  expect(document.querySelector('[data-cue-dot]')).toHaveAttribute('data-cue-dot', 'solving');
  expect(
    screen.getByRole('button', { name: /is the active schedule/ }).getAttribute('data-fact'),
  ).toContain('rounded bounds');
  expect(document.querySelector('[data-finish]')).toHaveTextContent('6 Oct');
  expect(transport.requests.filter((request) => request.method !== 'GET')).toEqual([]);
});

it.each([1024, 390])(
  'retains selected ready Time beside terminal Pri at width %s',
  async (width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const transport = serveActions(() => createConnectedOptimizationTree('ready-sibling'));
    render(<WbsTableOverClient projectId="A" projectServices={projectServicesOf(transport.api)} />);
    const rows = await screen.findAllByDisplayValue('a');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toBeEnabled();
    expect(screen.queryByText(/fake_invalid_response|invalid_response/)).toBeNull();
    expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Time');
    const cue = screen.getByRole('button', { name: /is the active schedule/ });
    expect(cue).toHaveAccessibleName(/selected Finish-first schedule remains displayed/);
    expect(cue).not.toHaveAccessibleName(/Fast is retained/);
    expect(cue.getAttribute('data-fact')).toContain('start 8, finish 9');
    expect(document.querySelector('[data-cue-active]')).toHaveTextContent('Time');
    fireEvent.click(cue);
    expect(screen.getByRole('menuitem', { name: /^Pri/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /^✓ Time/ })).toHaveTextContent(
      'captured fixed positions',
    );
    expect(screen.queryByRole('menuitem', { name: /Retry/ })).toBeNull();
    expect(transport.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    if (width === 390)
      expect(document.querySelector('[data-card-span]')).toHaveTextContent('5 Oct → 5 Oct');
    else expect(document.querySelector('[data-start]')).toHaveTextContent('5 Oct');
  },
);

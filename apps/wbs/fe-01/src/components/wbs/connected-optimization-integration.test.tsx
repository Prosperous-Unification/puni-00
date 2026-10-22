import { fireEvent, screen, waitFor } from '@testing-library/react';
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

publishApplicationRuntimeForEachTest();
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

function serveTree(tree: unknown) {
  const fetchTree = vi.fn((url: string) => {
    if (url !== '/api/projects/B/work-items' && url !== '/api/projects/A/work-items')
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
    await expect(httpProjectApi('token').tree('B')).rejects.toThrow(
      'connected_optimization_presentation_unavailable',
    );
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
    await expect(httpProjectApi('token').tree('A')).rejects.toThrow(
      'connected_optimization_presentation_unavailable',
    );
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

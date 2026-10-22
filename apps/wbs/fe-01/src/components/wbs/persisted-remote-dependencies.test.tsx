import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { dependencyViewsOf, type ProjectApi } from '@/lib/wbs-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { chartTypedDependencies } from './plan-chart-input';
import type { SubscriptionHandlers } from './wbs-table';
publishApplicationRuntimeForEachTest();
afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  window.history.replaceState(null, '', '/');
});
async function mount(
  phone = false,
  reference: string | null = 'REMOTE.080.s2-dev',
  calendarMissing = false,
  scope: 'node' | 'descendant-step' = 'node',
) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: phone ? 390 : 1024 });
  const api = fakeProjectApi();
  const row = await api.createWorkItem('p1', {
    parentId: null,
    afterId: null,
    name: 'Local successor',
  });
  const local = {
    endpoint: { projectId: 'p1', scope: 'whole' as const, workItemId: row.id },
    isLeaf: true,
    revision: 2,
    name: 'Local successor',
    projectAbbreviation: 'PLAN',
    workItemNumber: '010',
    step: null,
    qualifiedReference: 'PLAN.010',
    stepReference: null,
    stepNodeId: null,
  };
  const remote = {
    ...local,
    endpoint: {
      projectId: 'remote-stable',
      scope,
      workItemId: 'remote-row',
      stepId: 'remote-dev',
    },
    isLeaf: scope !== 'descendant-step',
    name: 'Captured remote build',
    projectAbbreviation: 'REMOTE',
    workItemNumber: '080',
    step: { id: 'remote-dev', name: 'Remote development', code: 'DEV', position: 1 },
    qualifiedReference: reference,
    stepReference: scope === 'descendant-step' ? null : '080.s2-dev',
    stepNodeId: scope === 'descendant-step' ? null : 'sn1.remote-row.remote-dev',
  };
  let capture = remote;
  let notify: (() => void) | undefined;
  const tree: ProjectApi['tree'] = async (projectId) => ({
    ...(await api.tree(projectId)),
    ...(calendarMissing
      ? {
          scheduleError: {
            kind: 'dependency_calendar_missing' as const,
            projects: [
              {
                projectId: 'remote-stable',
                abbreviation: 'REMOTE',
                name: 'Captured remote project',
              },
            ],
          },
        }
      : {}),
    connectedDependencies: [
      { id: 'external', projectId: 'p1', type: 'FS', predecessor: capture, successor: local },
    ],
  });
  const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
    notify = handlers.onChange;
    return { seen: () => undefined, unsubscribe: () => undefined };
  };
  const update = vi.fn<ProjectApi['updateTypedDependency']>().mockResolvedValue(undefined);
  render(
    <WbsTableOverClient
      projectId="p1"
      projectServices={projectServicesOf({ ...api, tree, updateTypedDependency: update })}
      subscribe={subscribe}
    />,
  );
  await screen.findByLabelText('Name of 010');
  if (phone) fireEvent.click(await screen.findByRole('button', { name: 'Depends on for 010' }));
  return {
    update,
    rename: () => {
      capture = {
        ...remote,
        projectAbbreviation: 'RENAMED',
        qualifiedReference: 'RENAMED.080.s2-dev',
      };
      if (notify === undefined) throw new Error('No subscription');
      notify();
    },
    tree,
  };
}
for (const phone of [false, true]) {
  it(`renders captured remote endpoint and stable navigation without a local arrow on ${phone ? 'phone' : 'desktop'}`, async () => {
    await mount(phone);
    if (!phone)
      fireEvent.mouseEnter(screen.getByLabelText('Add a dependency to 010').closest('td')!);
    const link = await screen.findByRole('link', { name: /Open REMOTE.080.s2-dev/ });
    expect(link.getAttribute('href')).toBe(
      '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
    );
    expect(screen.getAllByText(/Captured remote build/).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-gantt-arrow]')).toBeNull();
  });
}
it('uses captured step words when its reference is null', async () => {
  await mount(true, null);
  expect(
    await screen.findByRole('link', { name: /Open REMOTE.080 · Remote development step/ }),
  ).toHaveAttribute(
    'href',
    '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
  );
});
it('opens a stable work-item link and consumes it after focusing its name', async () => {
  const api = fakeProjectApi();
  const row = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Linked row' });
  window.history.replaceState(null, '', `/?project=p1&workItem=${row.id}`);
  render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
  await waitFor(() => expect(screen.getByLabelText('Name of 010')).toHaveFocus());
  expect(window.location.search).toBe('');
});

it('keeps captured details inspectable instead of claiming its remote predecessor was removed', async () => {
  const { update } = await mount();
  fireEvent.click(screen.getByRole('button', { name: /^Edit dependency: REMOTE/ }));
  expect(await screen.findByRole('dialog', { name: 'Captured dependency' })).toBeVisible();
  expect(screen.getByRole('link', { name: /Open REMOTE/ })).toHaveAttribute(
    'href',
    '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
  );
  expect(update).not.toHaveBeenCalled();
});
it('renames the captured label while retaining its stable target', async () => {
  const { rename } = await mount(true);
  act(() => {
    rename();
  });
  const link = await screen.findByRole('link', { name: /Open RENAMED.080.s2-dev/ });
  expect(link).toHaveAttribute(
    'href',
    '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
  );
});
it('excludes captured foreign endpoints from local chart input while retaining local relationships', async () => {
  const { tree } = await mount();
  const remote = dependencyViewsOf(await tree('p1'), 'p1');
  expect(
    chartTypedDependencies([
      ...remote,
      {
        id: 'local',
        type: 'SS',
        predecessor: { scope: 'whole', workItemId: 'a' },
        successor: { scope: 'whole', workItemId: 'b' },
      },
    ]).map(({ id }) => id),
  ).toEqual(['local']);
});
it('refuses an absent stable work-item target visibly', async () => {
  window.history.replaceState(null, '', '/?project=p1&workItem=absent');
  const api = fakeProjectApi();
  await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Existing row' });
  render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Work-item link does not name a work item in this plan.',
  );
  expect(window.location.search).toBe('');
});

it('opens phone captured details without resolving a local predecessor', async () => {
  await mount(true);
  fireEvent.click(screen.getByRole('button', { name: /^Edit REMOTE/ }));
  expect(await screen.findByRole('dialog', { name: 'Captured dependency' })).toBeVisible();
  expect(screen.queryByText('This predecessor was removed.')).toBeNull();
});
it('leaves another project’s stable work-item link untouched', async () => {
  window.history.replaceState(null, '', '/?project=other&workItem=absent&view=plan');
  const api = fakeProjectApi();
  await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Existing row' });
  render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
  await screen.findByLabelText('Name of 010');
  expect(window.location.search).toBe('?project=other&workItem=absent&view=plan');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('keeps the mounted chart available with captured foreign endpoints absent from its rows', async () => {
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Gantt' }));
  expect(await screen.findByRole('region', { name: 'Gantt chart' })).toBeVisible();
  expect(document.querySelector('[data-gantt-bar]')).not.toBeNull();
  expect(document.querySelector('[data-gantt-arrow]')).toBeNull();
});

it('expands ancestors before focusing a stable work-item link and preserves unrelated query state', async () => {
  const api = fakeProjectApi();
  const parent = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Parent' });
  const child = await api.createWorkItem('p1', {
    parentId: parent.id,
    afterId: null,
    name: 'Linked child',
  });
  let notify: (() => void) | undefined;
  const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
    notify = handlers.onChange;
    return { seen: () => undefined, unsubscribe: () => undefined };
  };
  render(
    <WbsTableOverClient
      projectId="p1"
      projectServices={projectServicesOf(api)}
      subscribe={subscribe}
    />,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Collapse 010' }));
  window.history.replaceState(null, '', `/?project=p1&workItem=${child.id}&view=plan`);
  act(() => {
    if (notify === undefined) throw new Error('No subscription');
    notify();
  });
  await waitFor(() => expect(screen.getByLabelText('Name of 010.1')).toHaveFocus());
  expect(window.location.search).toBe('?view=plan');
});

it('keeps the persisted remote relationship inspectable when its captured calendar is unavailable', async () => {
  await mount(true, 'REMOTE.080.s2-dev', true);
  expect(await screen.findByRole('link', { name: /Open REMOTE.080.s2-dev/ })).toHaveAttribute(
    'href',
    '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
  );
  expect(screen.getAllByText(/REMOTE.*Captured remote project/).length).toBeGreaterThan(0);
});

for (const phone of [false, true]) {
  it(`preserves non-null captured descendant selector in labels and details on ${phone ? 'phone' : 'desktop'}`, async () => {
    await mount(phone, 'REMOTE.080', false, 'descendant-step');
    const words = /REMOTE\.080.*Remote development.*all descendant work items/i;
    if (phone) {
      expect(screen.getByRole('button', { name: /^Edit REMOTE/ })).toHaveAccessibleName(words);
      expect(screen.getAllByText(words).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: /^Edit REMOTE/ }));
    } else {
      const chip = screen.getByRole('button', { name: /^Edit dependency: REMOTE/ });
      expect(chip).toHaveAccessibleName(words);
      expect(chip).toHaveTextContent(words);
      fireEvent.click(chip);
    }
    const details = screen.getByRole('dialog', { name: 'Captured dependency' });
    expect(details).toHaveTextContent(words);
    expect(within(details).getByRole('link', { name: /Open REMOTE\.080/ })).toHaveAttribute(
      'href',
      '/?project=remote-stable&workItem=remote-row',
    );
  });

  it(`focuses captured details on keyboard entry on ${phone ? 'phone' : 'desktop'}`, async () => {
    await mount(phone);
    if (phone) {
      const edit = screen.getByRole('button', { name: /^Edit REMOTE/ });
      edit.focus();
      fireEvent.click(edit, { detail: 0 });
    } else {
      const chip = screen.getByRole('button', { name: /^Edit dependency: REMOTE/ });
      chip.focus();
      fireEvent.keyDown(chip, { key: 'Enter' });
    }
    const back = screen.getByRole('button', { name: 'Back to dependency picker' });
    await waitFor(() => expect(back).toHaveFocus());
  });

  for (const key of ['Escape', 'ArrowLeft'])
    it(`dismisses captured details with ${key} and returns focus on ${phone ? 'phone' : 'desktop'}`, async () => {
      await mount(phone);
      fireEvent.click(
        screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
      );
      const back = screen.getByRole('button', { name: 'Back to dependency picker' });
      back.focus();
      fireEvent.keyDown(back, { key });
      expect(screen.queryByRole('dialog', { name: 'Captured dependency' })).toBeNull();
      await waitFor(() => expect(screen.getByLabelText('Add a dependency to 010')).toHaveFocus());
    });
}

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { dependencyViewsOf, httpProjectApi, type ProjectApi } from '@/lib/wbs-api';
import { projectServicesOver } from '@/modules/project/composition';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { NO_SAVED_PLANS } from '@/testing/no-saved-plans';
import { projectServicesOf } from '@/testing/project-services-of';
import { createRefusingAddressApi } from '@/testing/refusing-address-api';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { CapturedDependencyDetails } from './dependency-navigation';
import { serializePersistedDependencyEndpoint } from './dependency-selection';
import { chartTypedDependencies } from './plan-chart-input';
import { buildPersistedSuccessorEditor } from './typed-dependency-editor';
import type { SubscriptionHandlers } from './wbs-table';
publishApplicationRuntimeForEachTest();
afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  window.history.replaceState(null, '', '/');
});
async function mount(
  phone = false,
  reference: string | null = 'REMOTE.080.s2-dev',
  calendarMissing = false,
  scope: 'whole' | 'node' | 'descendant-step' = 'node',
  owned = true,
  successorScope: 'whole' | 'node' | 'descendant-step' = 'whole',
  parent = successorScope === 'descendant-step',
  remoteScopes: false | 'ready' | 'ready-parent' | 'paged' | 'wrong-row' | 'refused' = false,
) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: phone ? 390 : 1024 });
  const api = fakeProjectApi();
  const row = await api.createWorkItem('p1', {
    parentId: null,
    afterId: null,
    name: 'Local successor',
  });
  if (parent)
    await api.createWorkItem('p1', { parentId: row.id, afterId: null, name: 'Local child' });
  const local = {
    endpoint: {
      projectId: 'p1',
      scope: successorScope,
      workItemId: row.id,
      ...(successorScope === 'whole' ? {} : { stepId: 'step-dev' }),
    },
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
      ...(scope === 'whole' ? {} : { stepId: 'remote-dev' }),
    },
    isLeaf: scope !== 'descendant-step',
    name: 'Captured remote build',
    projectAbbreviation: 'REMOTE',
    workItemNumber: '080',
    step:
      scope === 'whole'
        ? null
        : { id: 'remote-dev', name: 'Remote development', code: 'DEV', position: 1 },
    qualifiedReference: reference,
    stepReference: scope === 'descendant-step' ? null : '080.s2-dev',
    stepNodeId: scope === 'descendant-step' ? null : 'sn1.remote-row.remote-dev',
  };
  const retainedNodes = (await api.tree('p1')).stepNodes;
  let capture = remote;
  let present = true;
  let notify: (() => void) | undefined;
  const tree: ProjectApi['tree'] = async (projectId) => ({
    ...(await api.tree(projectId)),
    // Retain the observed persisted endpoint node while the hierarchy refreshes.
    // This isolates editor staleness from the separate node-read integrity refusal.
    ...(successorScope === 'node'
      ? {
          stepNodes: [
            ...new Map(
              [...(retainedNodes ?? []), ...((await api.tree(projectId)).stepNodes ?? [])].map(
                (node) => [node.id, node],
              ),
            ).values(),
          ],
        }
      : {}),
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
    connectedDependencies: present
      ? [
          {
            id: 'external',
            projectId: owned ? 'p1' : 'remote-stable',
            type: 'FS',
            predecessor: owned ? capture : local,
            successor: owned
              ? local
              : { ...capture, endpoint: { ...capture.endpoint, workItemId: row.id } },
          },
        ]
      : [],
  });
  const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
    notify = handlers.onChange;
    return { seen: () => undefined, unsubscribe: () => undefined };
  };
  const update = vi.fn<ProjectApi['updateTypedDependency']>().mockResolvedValue(undefined);
  const remove = vi.fn<ProjectApi['removeTypedDependency']>().mockResolvedValue(undefined);
  const add = vi.fn<ProjectApi['addTypedDependency']>();
  const addresses = createRefusingAddressApi();
  if (remoteScopes)
    addresses.candidates = (_projectId, query) =>
      Promise.resolve(
        remoteScopes === 'refused'
          ? {
              kind: 'refusal',
              representation: 'json',
              status: 401,
              headers: new Headers(),
              body: { error: 'unauthenticated' },
            }
          : {
              kind: 'success',
              status: 200,
              representation: 'json',
              headers: new Headers(),
              body: {
                project: {
                  projectId: 'remote-stable',
                  abbreviation: 'REMOTE',
                  name: 'Remote project',
                },
                addressRevision: 'current',
                nextCursor: remoteScopes === 'paged' && query.cursor === undefined ? 'next' : null,
                candidates: [
                  {
                    projectId: 'remote-stable',
                    workItemId: 'remote-row',
                    number: '080',
                    name: 'Remote build',
                    endpoint: { scope: 'whole' as const, workItemId: 'remote-row' },
                    reference: 'REMOTE.080',
                  },
                  {
                    projectId: 'remote-stable',
                    workItemId: 'remote-row',
                    number: '080',
                    name: 'Remote build',
                    endpoint: {
                      scope:
                        remoteScopes === 'ready-parent'
                          ? ('descendant-step' as const)
                          : ('node' as const),
                      workItemId: 'remote-row',
                      stepId:
                        remoteScopes === 'ready' || remoteScopes === 'ready-parent'
                          ? 'remote-test'
                          : 'remote-dev',
                    },
                    reference: null,
                    step: {
                      id:
                        remoteScopes === 'ready' || remoteScopes === 'ready-parent'
                          ? 'remote-test'
                          : 'remote-dev',
                      code: 'DEV',
                      name: 'Remote testing',
                      position: 2,
                      ordinal: 3,
                    },
                  },
                ].flatMap((candidate) => [
                  {
                    ...candidate,
                    workItemId:
                      remoteScopes === 'wrong-row' ? 'different-row' : candidate.workItemId,
                    endpoint: {
                      ...candidate.endpoint,
                      workItemId:
                        remoteScopes === 'wrong-row'
                          ? 'different-row'
                          : candidate.endpoint.workItemId,
                    },
                  },
                ]),
              },
            },
      );
  const discover = vi.spyOn(addresses, 'projects');
  const search = vi.spyOn(addresses, 'candidates');
  const resolve = vi.spyOn(addresses, 'resolve');
  render(
    <WbsTableOverClient
      projectId="p1"
      projectServices={projectServicesOver(
        {
          ...api,
          tree,
          updateTypedDependency: update,
          addTypedDependency: add,
          removeTypedDependency: remove,
        },
        NO_SAVED_PLANS,
        addresses,
      )}
      subscribe={subscribe}
    />,
  );
  await screen.findByLabelText('Name of 010');
  if (phone) fireEvent.click(await screen.findByRole('button', { name: 'Depends on for 010' }));
  return {
    update,
    remove,
    add,
    discover,
    search,
    resolve,
    row,
    withdraw: () => {
      present = false;
      if (notify === undefined) throw new Error('No subscription');
      notify();
    },
    rename: () => {
      capture = {
        ...remote,
        projectAbbreviation: 'RENAMED',
        qualifiedReference: 'RENAMED.080.s2-dev',
      };
      if (notify === undefined) throw new Error('No subscription');
      notify();
    },
    grow: async () => {
      await api.createWorkItem('p1', { parentId: row.id, afterId: null, name: 'New child' });
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

for (const phone of [false, true]) {
  for (const destination of ['work-item', 'step'] as const) {
    for (const criteria of ['Find', 'facet', 'Find and facet'] as const) {
      it(`reveals a nested stable ${destination} through ${criteria} on ${phone ? 'phone' : 'desktop'} until criteria change`, async () => {
        localStorage.clear();
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          value: phone ? 390 : 1024,
        });
        const api = fakeProjectApi();
        const parent = await api.createWorkItem('p1', {
          parentId: null,
          afterId: null,
          name: 'Parent',
        });
        const branch = await api.createWorkItem('p1', {
          parentId: parent.id,
          afterId: null,
          name: 'Branch',
        });
        const child = await api.createWorkItem('p1', {
          parentId: branch.id,
          afterId: null,
          name: 'Linked child',
        });
        const match = await api.createWorkItem('p1', {
          parentId: null,
          afterId: parent.id,
          name: 'Visible match',
        });
        const tag = await api.addTag('Selected');
        api.labelWithTag(match.id, [tag.id]);
        const workItemId = '11111111-1111-4111-8111-111111111111';
        const stepId = '22222222-2222-4222-8222-222222222222';
        if (destination === 'step')
          localStorage.setItem('wbs.hiddenColumns.p1', JSON.stringify([stepId]));
        const steps: ProjectApi['steps'] = async (projectId) =>
          (await api.steps(projectId)).map((step) =>
            step.id === 'step-dev' ? { ...step, id: stepId } : step,
          );
        const tree: ProjectApi['tree'] = async (projectId) => {
          const plan = await api.tree(projectId);
          return {
            ...plan,
            workItems: plan.workItems.map((row) =>
              row.id === child.id ? { ...row, id: workItemId } : row,
            ),
            steps: plan.steps.map((step) =>
              step.id === 'step-dev' ? { ...step, id: stepId } : step,
            ),
            stepNodes: plan.stepNodes?.map((node) => {
              const rowId = node.workItemId === child.id ? workItemId : node.workItemId;
              const nodeStepId = node.stepId === 'step-dev' ? stepId : node.stepId;
              return {
                ...node,
                id: `sn1.${rowId}.${nodeStepId}`,
                workItemId: rowId,
                stepId: nodeStepId,
              };
            }),
          };
        };
        let notify: (() => void) | undefined;
        const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
          notify = handlers.onChange;
          return { seen: () => undefined, unsubscribe: () => undefined };
        };
        render(
          <WbsTableOverClient
            projectId="p1"
            projectServices={projectServicesOf({ ...api, tree, steps })}
            subscribe={subscribe}
          />,
        );
        fireEvent.click(await screen.findByRole('button', { name: 'Collapse 010' }));
        const storedExpansion = localStorage.getItem('wbs.expanded.p1');
        const openControls = () => {
          if (phone) fireEvent.click(screen.getByRole('button', { name: 'Plan actions' }));
        };
        const closeControls = () => {
          if (phone) fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        };
        openControls();
        if (criteria.includes('Find'))
          fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'Visible' } });
        if (criteria.includes('facet')) {
          fireEvent.click(screen.getByText(/^Filters/));
          fireEvent.click(await screen.findByLabelText('Tag Selected'));
          fireEvent.click(screen.getByText(/^Filters/));
        }
        closeControls();
        await waitFor(() => {
          expect(screen.queryByLabelText('Name of 010')).toBeNull();
        });
        const stepQuery = destination === 'step' ? `&stepNode=sn1.${workItemId}.${stepId}` : '';
        window.history.replaceState(
          null,
          '',
          `/?project=p1&workItem=${workItemId}${stepQuery}&view=plan`,
        );
        act(() => {
          if (notify === undefined) throw new Error('No subscription');
          notify();
        });
        await waitFor(() =>
          expect(
            screen.getByLabelText(
              destination === 'step' ? 'Dev estimate for 010.1.1' : 'Name of 010.1.1',
            ),
          ).toHaveFocus(),
        );
        expect(screen.getByLabelText('Name of 010')).toBeVisible();
        expect(screen.getByLabelText('Name of 010.1')).toBeVisible();
        expect(window.location.search).toBe('?view=plan');
        openControls();
        expect(screen.getByLabelText('Find')).toHaveValue(
          criteria.includes('Find') ? 'Visible' : '',
        );
        expect(localStorage.getItem('wbs.expanded.p1')).toBe(storedExpansion);
        if (criteria.includes('facet')) {
          fireEvent.click(screen.getByText(/^Filters/));
          expect(screen.getByLabelText('Tag Selected')).toBeChecked();
          fireEvent.click(screen.getByText(/^Filters/));
        }
        fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'Visible match' } });
        closeControls();
        await waitFor(() => {
          expect(screen.queryByLabelText('Name of 010.1.1')).toBeNull();
        });
        openControls();
        fireEvent.change(screen.getByLabelText('Find'), { target: { value: '' } });
        if (criteria.includes('facet')) {
          fireEvent.click(screen.getByText(/^Filters/));
          fireEvent.click(screen.getByLabelText('Tag Selected'));
          fireEvent.click(screen.getByText(/^Filters/));
        }
        closeControls();
        await screen.findByLabelText('Name of 010');
        expect(screen.queryByLabelText('Name of 010.1')).toBeNull();
      });
    }
  }
}

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

for (const phone of [false, true])
  it(`keeps captured node step name beside non-null address on ${phone ? 'phone' : 'desktop'}`, async () => {
    await mount(phone);
    const edit = screen.getByRole('button', {
      name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/,
    });
    expect(edit).toHaveAccessibleName(/REMOTE\.080\.s2-dev.*Remote development/);
    expect(edit).toHaveAccessibleName(/Captured remote build/);
    if (!phone) expect(edit).toHaveTextContent(/REMOTE\.080\.s2-dev.*Remote development/);
    fireEvent.click(edit);
    const details = screen.getByRole('dialog', { name: 'Captured dependency' });
    expect(details).toHaveTextContent(
      /REMOTE\.080\.s2-dev.*Remote development.*Captured remote build/,
    );
    expect(
      within(details).getByRole('link', { name: /Open REMOTE\.080\.s2-dev.*Remote development/ }),
    ).toHaveAttribute(
      'href',
      '/?project=remote-stable&workItem=remote-row&stepNode=sn1.remote-row.remote-dev',
    );
  });

for (const phone of [false, true]) {
  const editor = () => within(screen.getByRole('dialog', { name: 'Captured dependency' }));
  const openEdit = () => {
    const control = screen.getByRole('button', {
      name: phone ? /^Edit REMOTE/ : /^(Edit dependency: REMOTE|Stop 010 waiting for REMOTE)/,
    });
    if (phone) fireEvent.click(control);
    else fireEvent.keyDown(control, { key: 'Enter' });
  };
  for (const scope of ['whole', 'node', 'descendant-step'] as const)
    for (const type of ['FS', 'SS', 'FF'] as const)
      it(`updates persisted remote ${scope} to ${type} with fixed endpoints on ${phone ? 'phone' : 'desktop'}`, async () => {
        const fixture = await mount(phone, undefined, false, scope);
        openEdit();
        const dialog = screen.getByRole('dialog', { name: 'Captured dependency' });
        fireEvent.change(within(dialog).getByLabelText('Relationship'), {
          target: { value: type },
        });
        expect(within(dialog).queryByLabelText('Predecessor')).toBeNull();
        expect(within(dialog).queryByRole('button', { name: 'Add' })).toBeNull();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
        await waitFor(() => {
          expect(fixture.update).toHaveBeenCalledExactlyOnceWith(
            'p1',
            'external',
            {
              projectId: 'remote-stable',
              scope,
              workItemId: 'remote-row',
              ...(scope === 'whole' ? {} : { stepId: 'remote-dev' }),
            },
            { scope: 'whole', workItemId: fixture.row.id },
            type,
          );
        });
        await waitFor(() => {
          expect(screen.queryByRole('dialog', { name: 'Captured dependency' })).toBeNull();
        });
        expect(fixture.add).not.toHaveBeenCalled();
        expect(fixture.discover).not.toHaveBeenCalled();
        expect(fixture.search).not.toHaveBeenCalled();
        expect(fixture.resolve).not.toHaveBeenCalled();
      });

  it(`retains the relationship draft after inactive refusal on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update } = await mount(phone);
    const fetcher = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { error: 'external_dependencies_inactive', at: 0, kind: 'updateTypedDependency' },
          { status: 409 },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetcher);
    update.mockImplementation((...args) => httpProjectApi('token').updateTypedDependency(...args));
    openEdit();
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'FF' } });
    const scope = screen.getByLabelText('This work item');
    fireEvent.change(scope, {
      target: {
        value: within(scope).getByRole('option', { name: 'Dev step' }).getAttribute('value'),
      },
    });
    fireEvent.click(editor().getByRole('button', { name: 'Save' }));
    await screen.findByText(/Dependency refused/);
    expect(screen.getByLabelText('Relationship')).toHaveValue('FF');
    expect(
      within(screen.getByLabelText('This work item')).getByRole('option', { selected: true }),
    ).toHaveTextContent('Dev step');
    expect(editor().getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(
      await screen.findByText('Dependencies between projects are not enabled on this server.'),
    ).toBeVisible();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it(`retires a pending captured edit before reopening on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update } = await mount(phone);
    let finish: (() => void) | undefined;
    update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    openEdit();
    fireEvent.click(editor().getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
    expect(editor().getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByLabelText('This work item')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit predecessor scope' })).toBeDisabled();
    fireEvent.click(editor().getByRole('button', { name: 'Save' }));
    expect(update).toHaveBeenCalledTimes(1);
    openEdit();
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'SS' } });
    const selector = screen.getByLabelText('This work item');
    fireEvent.change(selector, {
      target: {
        value: within(selector).getByRole('option', { name: 'Dev step' }).getAttribute('value'),
      },
    });
    await act(async () => {
      if (finish === undefined) throw new Error('No pending edit');
      finish();
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Relationship')).toHaveValue('SS');
    expect(
      within(screen.getByLabelText('This work item')).getByRole('option', { selected: true }),
    ).toHaveTextContent('Dev step');
    expect(editor().getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it(`refuses a withdrawn captured edit without recreating it on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { withdraw, update, add } = await mount(phone);
    openEdit();
    act(withdraw);
    await screen.findByText(/This dependency was removed/);
    expect(screen.queryByRole('dialog', { name: 'Captured dependency' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it(`removes the existing captured relationship on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { remove } = await mount(phone);
    if (!phone)
      fireEvent.mouseEnter(screen.getByLabelText('Add a dependency to 010').closest('td')!);
    fireEvent.click(await screen.findByRole('button', { name: /^Remove .*REMOTE/ }));
    await waitFor(() => {
      expect(remove).toHaveBeenCalledExactlyOnceWith('p1', 'external');
    });
  });
}

for (const phone of [false, true])
  it(`keeps a foreign-owned relationship details-only even when work-item ids collide on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update, add } = await mount(phone, undefined, false, 'node', false);
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit .*REMOTE/ : /^Edit dependency: .*REMOTE/ }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
    expect(dialog.queryByLabelText('This work item')).toBeNull();
    expect(dialog.queryByLabelText('Relationship')).toBeNull();
    expect(dialog.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

for (const phone of [false, true]) {
  it(`preserves the local successor node when saving a remote type on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update, row } = await mount(phone, undefined, false, 'node', true, 'node');
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
    );
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'SS' } });
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Captured dependency' })).getByRole('button', {
        name: 'Save',
      }),
    );
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        'p1',
        'external',
        {
          projectId: 'remote-stable',
          scope: 'node',
          workItemId: 'remote-row',
          stepId: 'remote-dev',
        },
        { scope: 'node', stepNodeId: `sn1.${row.id}.step-dev` },
        'SS',
      );
    });
  });

  it(`keeps ArrowLeft in the captured relationship selector on ${phone ? 'phone' : 'desktop'}`, async () => {
    await mount(phone);
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
    );
    const selector = screen.getByLabelText('Relationship');
    selector.focus();
    fireEvent.keyDown(selector, { key: 'ArrowLeft' });
    expect(selector).toHaveFocus();
    expect(screen.getByRole('dialog', { name: 'Captured dependency' })).toBeVisible();
  });
}

it('rejects a persisted scoped endpoint without its step identity before producing a write', () => {
  expect(() =>
    serializePersistedDependencyEndpoint(
      { projectId: 'p1', scope: 'node', workItemId: 'row' },
      'p1',
    ),
  ).toThrow('Missing persisted dependency step identity');
});

it('rejects an unknown captured relationship instead of offering a writable default', () => {
  expect(() =>
    render(
      <CapturedDependencyDetails
        dependency={{
          id: 'external',
          type: 'SF',
          predecessor: { scope: 'whole', workItemId: 'remote' },
          successor: { scope: 'whole', workItemId: 'local' },
        }}
        onClose={() => undefined}
      />,
    ),
  ).toThrow('Unknown dependency relationship SF');
});

for (const phone of [false, true]) {
  for (const initial of ['whole', 'node'] as const)
    it(`edits persisted local successor scope from ${initial} on ${phone ? 'phone' : 'desktop'}`, async () => {
      const fixture = await mount(phone, undefined, false, 'node', true, initial);
      fireEvent.click(
        screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
      );
      const dialog = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
      const selector = dialog.getByLabelText('This work item');
      expect(within(selector).getByRole('option', { selected: true })).toHaveTextContent(
        initial === 'whole' ? 'Whole work item' : 'Dev step',
      );
      const option = within(selector).getByRole('option', {
        name: initial === 'whole' ? 'Dev step' : 'Whole work item',
      });
      fireEvent.change(selector, { target: { value: option.getAttribute('value') } });
      fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(fixture.update).toHaveBeenCalledExactlyOnceWith(
          'p1',
          'external',
          {
            projectId: 'remote-stable',
            scope: 'node',
            workItemId: 'remote-row',
            stepId: 'remote-dev',
          },
          initial === 'whole'
            ? { scope: 'node', stepNodeId: `sn1.${fixture.row.id}.step-dev` }
            : { scope: 'whole', workItemId: fixture.row.id },
          'FS',
        );
      });
      for (const call of [fixture.add, fixture.discover, fixture.search, fixture.resolve])
        expect(call).not.toHaveBeenCalled();
    });
}

for (const phone of [false, true]) {
  const open = () =>
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
    );
  it(`initializes exact persisted descendant-step successor on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update, row } = await mount(phone, undefined, false, 'node', true, 'descendant-step');
    open();
    const dialog = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
    expect(
      within(dialog.getByLabelText('This work item')).getByRole('option', { selected: true }),
    ).toHaveTextContent('All descendant work items · Dev');
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledWith(
        'p1',
        'external',
        {
          projectId: 'remote-stable',
          scope: 'node',
          workItemId: 'remote-row',
          stepId: 'remote-dev',
        },
        { scope: 'descendant-step', workItemId: row.id, stepId: 'step-dev' },
        'FS',
      );
    });
  });
  for (const initial of ['whole', 'node'] as const)
    it(`refuses stale ${initial === 'whole' ? 'draft' : 'persisted'} node after hierarchy refresh on ${phone ? 'phone' : 'desktop'}`, async () => {
      const fixture = await mount(phone, undefined, false, 'node', true, initial);
      open();
      const dialog = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
      if (initial === 'whole') {
        const selector = dialog.getByLabelText('This work item');
        fireEvent.change(selector, {
          target: {
            value: within(selector).getByRole('option', { name: 'Dev step' }).getAttribute('value'),
          },
        });
      }
      await act(fixture.grow);
      await waitFor(() => expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled());
      expect(dialog.getByRole('alert')).toHaveTextContent(/scope unavailable/);
      expect(fixture.update).not.toHaveBeenCalled();
      const selector = dialog.getByLabelText('This work item');
      fireEvent.change(selector, {
        target: {
          value: within(selector)
            .getByRole('option', { name: /All descendant work items · Dev/ })
            .getAttribute('value'),
        },
      });
      fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(fixture.update).toHaveBeenCalledWith(
          'p1',
          'external',
          {
            projectId: 'remote-stable',
            scope: 'node',
            workItemId: 'remote-row',
            stepId: 'remote-dev',
          },
          { scope: 'descendant-step', workItemId: fixture.row.id, stepId: 'step-dev' },
          'FS',
        );
      });
    });
}

it('rejects a persisted local successor missing its step identity', () => {
  expect(() =>
    buildPersistedSuccessorEditor('p1', { scope: 'node', workItemId: 'absent' }, [], []),
  ).toThrow('Missing persisted dependency step identity');
});

for (const phone of [false, true])
  it(`changes parent Whole to local descendant-step on ${phone ? 'phone' : 'desktop'}`, async () => {
    const fixture = await mount(phone, undefined, false, 'node', true, 'whole', true);
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
    const selector = dialog.getByLabelText('This work item');
    fireEvent.change(selector, {
      target: {
        value: within(selector)
          .getByRole('option', { name: /All descendant work items · Dev/ })
          .getAttribute('value'),
      },
    });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(fixture.update).toHaveBeenCalledExactlyOnceWith(
        'p1',
        'external',
        {
          projectId: 'remote-stable',
          scope: 'node',
          workItemId: 'remote-row',
          stepId: 'remote-dev',
        },
        { scope: 'descendant-step', workItemId: fixture.row.id, stepId: 'step-dev' },
        'FS',
      );
    });
    for (const call of [fixture.add, fixture.discover, fixture.search, fixture.resolve])
      expect(call).not.toHaveBeenCalled();
  });

for (const phone of [false, true]) {
  for (const sourceScope of ['whole', 'node', 'descendant-step'] as const)
    it(`edits persisted remote predecessor ${sourceScope} scope on ${phone ? 'phone' : 'desktop'}`, async () => {
      const { update, row, search, discover } = await mount(
        phone,
        undefined,
        false,
        'node',
        true,
        'whole',
        false,
        sourceScope === 'descendant-step' ? 'ready-parent' : 'ready',
      );
      fireEvent.click(
        screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(search).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Edit predecessor scope' }));
      const details = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
      expect(details.getByRole('button', { name: 'Save' })).toBeDisabled();
      const selector = await screen.findByLabelText('Predecessor scope');
      await waitFor(() =>
        expect(
          within(selector).getByRole('option', {
            name:
              sourceScope === 'descendant-step'
                ? 'Remote testing across all descendants'
                : 'Remote testing step',
          }),
        ).toBeInTheDocument(),
      );
      expect(details.getByRole('button', { name: 'Save' })).toBeDisabled();
      fireEvent.change(selector, {
        target: {
          value: JSON.stringify([
            'remote-stable',
            'remote-row',
            sourceScope,
            sourceScope === 'whole' ? null : 'remote-test',
          ]),
        },
      });
      fireEvent.click(details.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(update).toHaveBeenCalledWith(
          'p1',
          'external',
          {
            projectId: 'remote-stable',
            scope: sourceScope,
            workItemId: 'remote-row',
            ...(sourceScope === 'whole' ? {} : { stepId: 'remote-test' }),
          },
          { scope: 'whole', workItemId: row.id },
          'FS',
        );
      });
      expect(search).toHaveBeenCalledWith(
        'remote-stable',
        { q: '080', limit: '25' },
        expect.any(AbortSignal),
      );
      expect(discover).not.toHaveBeenCalled();
    });
}

for (const phone of [false, true]) {
  for (const evidence of ['paged', 'wrong-row', 'refused'] as const) {
    it(`refuses ${evidence} persisted predecessor scopes on ${phone ? 'phone' : 'desktop'}`, async () => {
      const { update } = await mount(
        phone,
        undefined,
        false,
        'node',
        true,
        'whole',
        false,
        evidence,
      );
      if (!phone)
        fireEvent.mouseEnter(screen.getByLabelText('Add a dependency to 010').closest('td')!);
      fireEvent.click(
        screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Edit predecessor scope' }));
      const details = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
      if (evidence === 'paged') {
        await screen.findByRole('button', { name: 'More scopes' });
        expect(details.getByRole('button', { name: 'Save' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'More scopes' }));
        await waitFor(() => expect(details.getByRole('button', { name: 'Save' })).toBeEnabled());
      } else {
        await waitFor(() => {
          expect(screen.queryByText('Loading predecessor scopes…')).toBeNull();
        });
        expect(details.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(
          within(screen.getByLabelText('Predecessor scope')).queryAllByRole('option', {
            name: 'Whole work item',
          }),
        ).toHaveLength(0);
        fireEvent.click(details.getByRole('button', { name: 'Save' }));
        expect(update).not.toHaveBeenCalled();
      }
    });
  }
}

for (const phone of [false, true]) {
  it(`retains predecessor scope drafts and pending controls on ${phone ? 'phone' : 'desktop'}`, async () => {
    const { update } = await mount(phone, undefined, false, 'node', true, 'whole', false, 'ready');
    let finish: (() => void) | undefined;
    update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: phone ? /^Edit REMOTE/ : /^Edit dependency: REMOTE/ }),
    );
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'FF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit predecessor scope' }));
    expect(screen.getByLabelText('Relationship')).toHaveValue('FF');
    const selector = screen.getByLabelText('Predecessor scope');
    await waitFor(() =>
      expect(
        within(selector).getByRole('option', { name: 'Remote testing step' }),
      ).toBeInTheDocument(),
    );
    const choice = JSON.stringify(['remote-stable', 'remote-row', 'node', 'remote-test']);
    fireEvent.change(selector, { target: { value: choice } });
    const details = within(screen.getByRole('dialog', { name: 'Captured dependency' }));
    fireEvent.click(details.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
    expect(selector).toBeDisabled();
    expect(details.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(selector).toHaveValue(choice);
    act(() => {
      if (finish === undefined) throw new Error('Missing pending update');
      finish();
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Captured dependency' })).toBeNull();
    });
  });
}

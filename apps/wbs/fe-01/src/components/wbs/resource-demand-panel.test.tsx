import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { fakeProjectApi } from '@/testing/fake-project-api';
import { publishApplicationRuntimeForEachTest, render } from '@/testing/live-application';
import { projectServicesOf } from '@/testing/project-services-of';
import { recordCalls } from '@/testing/record-calls';
import { WbsTableOverClient } from '@/testing/wbs-table-over-client';

import { refusalSentence } from './plan-refusal';
import { demandStatements } from './resource-demand-panel';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

publishApplicationRuntimeForEachTest();

beforeEach(() => {
  localStorage.clear();
  // Every column on screen: Resources is hidden by default.
  localStorage.setItem('wbs.hiddenColumns.p1', '[]');
  window.history.replaceState(null, '', '/');
  window.innerWidth = 1440;
});

const RAM = {
  id: 'r-ram',
  name: 'RAM',
  kind: 'divisible' as const,
  unitLabel: 'GiB',
  providerId: null,
};
const STAGING = {
  id: 'r-stg',
  name: 'staging',
  kind: 'exclusive' as const,
  unitLabel: 'env',
  providerId: null,
};

/** Two roots and a child under the first, `010` a parent; RAM and staging in the directory. */
async function planWithResources() {
  const api = fakeProjectApi();
  const parent = await api.createWorkItem('p1', { parentId: null, afterId: null, name: 'Build' });
  const leaf = await api.createWorkItem('p1', {
    parentId: null,
    afterId: parent.id,
    name: 'Deploy',
  });
  const child = await api.createWorkItem('p1', {
    parentId: parent.id,
    afterId: null,
    name: 'Compile',
  });
  api.resources.push(RAM, STAGING);
  api.resourceCapacities.push({ resourceId: RAM.id, units: 32 });
  return { api, parent: parent.id, leaf: leaf.id, child: child.id };
}

function drawTable(api: ReturnType<typeof fakeProjectApi>) {
  return render(<WbsTableOverClient projectId="p1" projectServices={projectServicesOf(api)} />);
}

async function openFromCell(number: string): Promise<HTMLElement> {
  fireEvent.click(await screen.findByLabelText(`Resources for ${number}`));
  return screen.findByRole('dialog', { name: `Resources for ${number}` });
}

describe('the Resources cell (wbs-resources 1.5)', () => {
  itDom('reads a leaf’s demands off the tree and shows a parent’s muted, with no box', async () => {
    const { api, parent, leaf } = await planWithResources();
    api.demands.push(
      { workItemId: leaf, resourceId: STAGING.id, units: 1 },
      { workItemId: leaf, resourceId: RAM.id, units: 6 },
      { workItemId: parent, resourceId: RAM.id, units: 2 },
    );
    drawTable(api);
    const cell = await screen.findByLabelText<HTMLInputElement>('Resources for 020');
    expect(cell.value).toBe('RAM 6 GiB · staging');
    expect(screen.queryByLabelText('Resources for 010')).toBeNull();
    const muted = document.querySelector(`[data-resources="${parent}"]`);
    expect(muted?.textContent).toBe('RAM 2 GiB');
    expect(muted?.getAttribute('data-fact')).toMatch(/consumes nothing of its own/);
    expect(screen.getByLabelText<HTMLInputElement>('Resources for 010.1').value).toBe('');
  });

  itDom('steps over a parent’s Resources cell', async () => {
    const { api } = await planWithResources();
    drawTable(api);
    const types = await screen.findByLabelText('Types for 010');
    types.focus();
    expect(fireEvent.keyDown(types, { key: 'Tab' })).toBe(false);
    // The parent's trio, People at once and dates take no typing either, so
    // the next stop is its Fact start.
    expect(document.activeElement).toBe(screen.getByLabelText('Fact start of 010'));
  });

  itDom('states demands as one batch the plan reads back, and clears one to none', async () => {
    const { api, leaf } = await planWithResources();
    api.demands.push({ workItemId: leaf, resourceId: RAM.id, units: 6 });
    const sent = recordCalls(api, 'setDemands');
    drawTable(api);
    let panel = await openFromCell('020');
    const ram = await within(panel).findByLabelText<HTMLInputElement>('RAM units for 020');
    expect(ram.value).toBe('6');
    expect(within(panel).getByText(/This project states 32 GiB/)).toBeDefined();
    expect(within(panel).getByText(/Unstated by this project/)).toBeDefined();
    fireEvent.change(ram, { target: { value: '8' } });
    fireEvent.click(within(panel).getByLabelText('staging needed by 020'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Save resources' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Resources for 020' })).toBeNull();
    });
    // One batch, so one journal entry the plan's Undo takes back whole.
    expect(sent).toEqual([
      [
        'p1',
        [
          { workItemId: leaf, resourceId: RAM.id, units: 8 },
          { workItemId: leaf, resourceId: STAGING.id, units: 1 },
        ],
      ],
    ]);
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Resources for 020').value).toBe(
        'RAM 8 GiB · staging',
      );
    });

    panel = await openFromCell('020');
    fireEvent.change(await within(panel).findByLabelText('RAM units for 020'), {
      target: { value: '' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save resources' }));
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Resources for 020').value).toBe('staging');
    });
    expect(sent.at(-1)).toEqual(['p1', [{ workItemId: leaf, resourceId: RAM.id, units: null }]]);
  });

  itDom('says a box that is not a number in place and sends nothing', async () => {
    const { api } = await planWithResources();
    const sent = recordCalls(api, 'setDemands');
    drawTable(api);
    const panel = await openFromCell('020');
    fireEvent.change(await within(panel).findByLabelText('RAM units for 020'), {
      target: { value: 'lots' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save resources' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe(
      'RAM takes a whole number of units, or blank for none.',
    );
    expect(sent).toEqual([]);
  });

  itDom('says a refused save in place and stays open', async () => {
    const { api } = await planWithResources();
    drawTable(api);
    const panel = await openFromCell('020');
    fireEvent.change(await within(panel).findByLabelText('RAM units for 020'), {
      target: { value: '0' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save resources' }));
    expect((await within(panel).findByRole('alert')).textContent).toBe(
      refusalSentence(new Error('units_must_be_a_whole_number_from_1')),
    );
    expect(screen.getByRole('dialog', { name: 'Resources for 020' })).toBeDefined();
    expect(api.demands).toEqual([]);
  });

  itDom('renders a failed read with retry, and recovers', async () => {
    const { api } = await planWithResources();
    const real = api.readResources.bind(api);
    let refusals = 1;
    api.readResources = (projectId) =>
      refusals-- > 0 ? Promise.reject(new Error('not_found')) : real(projectId);
    drawTable(api);
    const panel = await openFromCell('020');
    expect((await within(panel).findByRole('alert')).textContent).toBe(
      refusalSentence(new Error('not_found')),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry resources' }));
    expect(await within(panel).findByLabelText('RAM units for 020')).toBeDefined();
  });

  itDom('says where resources are made when the directory holds none', async () => {
    const { api } = await planWithResources();
    api.resources.splice(0);
    drawTable(api);
    const panel = await openFromCell('020');
    expect((await within(panel).findByText(/holds no resources yet/)).textContent).toMatch(
      /Project settings → Resources/,
    );
    expect(within(panel).queryByRole('button', { name: 'Save resources' })).toBeNull();
  });

  itDom('is offered from a leaf’s menu and never from a parent’s', async () => {
    const { api } = await planWithResources();
    localStorage.setItem('wbs.hiddenColumns.p1', JSON.stringify(['resources']));
    drawTable(api);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for 010' }));
    expect(screen.queryByRole('menuitem', { name: 'Resources…' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for 020' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Resources…' }));
    expect(await screen.findByRole('dialog', { name: 'Resources for 020' })).toBeDefined();
  });
});

describe('demand statements', () => {
  it('states only what changed, an exclusive resource as 1 or null', () => {
    const resources = [
      { ...RAM, kind: 'divisible' as const },
      { ...STAGING, kind: 'exclusive' as const },
    ];
    const held = [
      { resourceId: RAM.id, name: 'RAM', kind: 'divisible' as const, unitLabel: 'GiB', units: 6 },
    ];
    expect(demandStatements('w1', resources, held, { [RAM.id]: '6', [STAGING.id]: false })).toEqual(
      {
        kind: 'statements',
        statements: [],
      },
    );
    expect(demandStatements('w1', resources, held, { [RAM.id]: ' ', [STAGING.id]: true })).toEqual({
      kind: 'statements',
      statements: [
        { workItemId: 'w1', resourceId: RAM.id, units: null },
        { workItemId: 'w1', resourceId: STAGING.id, units: 1 },
      ],
    });
  });

  it('words every resource refusal the panels can reach', () => {
    for (const code of [
      'exclusive_demand_is_one',
      'units_must_be_a_whole_number_from_1',
      'units_must_be_a_whole_number_from_0',
      'units_must_be_at_most_1000000000',
      'unknown_resource',
      'unitLabel_must_be_at_most_40_characters',
      'kind_is_immutable',
    ])
      expect(refusalSentence(new Error(code)), code).not.toContain(code);
  });
});

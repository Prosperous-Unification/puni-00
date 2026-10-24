import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DependencyLookup } from '@/modules/dependency-lookup/contract';

import type { DependencySelection } from './dependency-selection';
import { RemoteDependencyEditor } from './remote-dependency-editor';

const project = { projectId: 'remote', abbreviation: 'PUNI', name: 'Remote' };
const whole = {
  projectId: 'remote',
  workItemId: 'r',
  number: '080',
  name: 'Build',
  endpoint: { scope: 'whole' as const, workItemId: 'r' },
  reference: 'PUNI.080',
};
const dev = {
  ...whole,
  endpoint: { scope: 'node' as const, workItemId: 'r', stepId: 'remote-dev' },
  reference: null,
  step: { id: 'remote-dev', code: 'DEV', name: 'Remote Development', position: 0, ordinal: 1 },
};
const selection: Extract<DependencySelection, { kind: 'remote' }> = {
  kind: 'remote',
  endpoint: { projectId: 'remote', ...whole.endpoint },
  project,
  addressRevision: 'r1',
  candidate: whole,
};
const successor = {
  heading: '010 Local',
  preferredKey: 'local-dev',
  unavailable: 'Local Dev unavailable',
  choices: [
    {
      key: 'local-dev',
      endpoint: {
        projectId: 'local',
        scope: 'node' as const,
        workItemId: 'l',
        stepId: 'local-dev',
      },
      label: 'Local Dev',
      description: '010 Dev',
      step: { id: 'local-dev', name: 'Local Development', code: 'DEV' },
    },
  ],
};
const page = (candidates: (typeof whole | typeof dev)[], nextCursor: string | null) => ({
  kind: 'success' as const,
  body: { project, addressRevision: 'r1', candidates, nextCursor },
});
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
}
afterEach(() => vi.useRealTimers());

describe('remote Customize completeness', () => {
  it('suggests its own unique matching step only after explicit pagination proves completeness', async () => {
    vi.useFakeTimers();
    const service: DependencyLookup = {
      discoverProjects: vi.fn(),
      resolveReference: vi.fn(),
      searchEndpoints: vi
        .fn()
        .mockResolvedValueOnce(page([whole, dev], 'page2'))
        .mockResolvedValueOnce(page([], null)),
    };
    const onSave = vi.fn().mockResolvedValue('landed');
    render(
      <RemoteDependencyEditor
        selection={selection}
        lookup={service}
        ownerProjectId="local"
        ownerId="l"
        successor={successor}
        preferredCode="DEV"
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await tick();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
    expect(service.searchEndpoints).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'More scopes' }));
    await tick();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSave).toHaveBeenCalledWith(
      { projectId: 'remote', scope: 'node', workItemId: 'r', stepId: 'remote-dev' },
      successor.choices[0]?.endpoint,
      'FS',
    );
    expect(screen.queryByText(/PUNI\.080\..*remote-development/)).toBeNull();
  });
  it('ambiguous or absent code requires an explicit scope, and explicit node selection wins', async () => {
    vi.useFakeTimers();
    const duplicate = {
      ...dev,
      endpoint: { ...dev.endpoint, stepId: 'other-dev' },
      step: { ...dev.step, id: 'other-dev' },
    };
    const service: DependencyLookup = {
      discoverProjects: vi.fn(),
      resolveReference: vi.fn(),
      searchEndpoints: vi.fn().mockResolvedValue(page([whole, dev, duplicate], null)),
    };
    const mounted = render(
      <RemoteDependencyEditor
        selection={selection}
        lookup={service}
        ownerProjectId="local"
        ownerId="l"
        successor={successor}
        preferredCode="DEV"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await tick();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Predecessor'), {
      target: { value: JSON.stringify(['remote', 'r', 'whole', null]) },
    });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(false);
    mounted.unmount();
    render(
      <RemoteDependencyEditor
        selection={{
          ...selection,
          endpoint: { projectId: 'remote', ...dev.endpoint },
          candidate: dev,
        }}
        lookup={service}
        ownerProjectId="local"
        ownerId="l"
        successor={successor}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await tick();
    expect(screen.getByLabelText<HTMLSelectElement>('Predecessor').value).toBe(
      JSON.stringify(['remote', 'r', 'node', 'remote-dev']),
    );
  });
});

it('changed address revision discards choices until explicit stable-project refresh', async () => {
  vi.useFakeTimers();
  const service: DependencyLookup = {
    discoverProjects: vi.fn(),
    resolveReference: vi.fn(),
    searchEndpoints: vi.fn().mockResolvedValue({
      ...page([whole, dev], null),
      body: { ...page([whole, dev], null).body, addressRevision: 'r2' },
    }),
  };
  render(
    <RemoteDependencyEditor
      selection={selection}
      lookup={service}
      ownerProjectId="local"
      ownerId="l"
      successor={successor}
      preferredCode="DEV"
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  await tick();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh scopes' }));
  await tick();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(false);
  expect(service.searchEndpoints).toHaveBeenCalledTimes(2);
  expect(service.discoverProjects).not.toHaveBeenCalled();
});

it.each([null, undefined])(
  'missing local code %j requires explicit remote scope despite matching names',
  async (preferredCode) => {
    vi.useFakeTimers();
    const service: DependencyLookup = {
      discoverProjects: vi.fn(),
      resolveReference: vi.fn(),
      searchEndpoints: vi.fn().mockResolvedValue(page([whole, dev], null)),
    };
    render(
      <RemoteDependencyEditor
        selection={selection}
        lookup={service}
        ownerProjectId="local"
        ownerId="l"
        successor={successor}
        preferredCode={preferredCode}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await tick();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
  },
);

it('new revision or lookup resets manual scopes and relationship type for the same endpoint', async () => {
  vi.useFakeTimers();
  const service: DependencyLookup = {
    discoverProjects: vi.fn(),
    resolveReference: vi.fn(),
    searchEndpoints: vi.fn().mockResolvedValue(page([whole, dev], null)),
  };
  const onSave = vi.fn().mockResolvedValue('landed');
  const view = (lookup: DependencyLookup, revision: string) => (
    <RemoteDependencyEditor
      selection={{ ...selection, addressRevision: revision }}
      lookup={lookup}
      ownerProjectId="local"
      ownerId="l"
      successor={successor}
      preferredCode="DEV"
      onSave={onSave}
      onCancel={vi.fn()}
    />
  );
  const mounted = render(view(service, 'r1'));
  await tick();
  fireEvent.change(screen.getByLabelText('Predecessor'), {
    target: { value: JSON.stringify(['remote', 'r', 'whole', null]) },
  });
  fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'SS' } });
  vi.mocked(service.searchEndpoints).mockResolvedValue({
    ...page([whole, dev], null),
    body: { ...page([whole, dev], null).body, addressRevision: 'r2' },
  });
  mounted.rerender(view(service, 'r2'));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
  await tick();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(false);
  expect(screen.getByLabelText<HTMLSelectElement>('Relationship').value).toBe('FS');
  expect(screen.getByLabelText<HTMLSelectElement>('Predecessor').value).toBe(
    JSON.stringify(['remote', 'r', 'node', 'remote-dev']),
  );
  fireEvent.change(screen.getByLabelText('Predecessor'), {
    target: { value: JSON.stringify(['remote', 'r', 'whole', null]) },
  });
  const replacement: DependencyLookup = {
    ...service,
    searchEndpoints: vi.fn().mockResolvedValue({
      ...page([whole, dev], null),
      body: { ...page([whole, dev], null).body, addressRevision: 'r2' },
    }),
  };
  mounted.rerender(view(replacement, 'r2'));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Add' }).disabled).toBe(true);
  await tick();
  expect(screen.getByLabelText<HTMLSelectElement>('Predecessor').value).toBe(
    JSON.stringify(['remote', 'r', 'node', 'remote-dev']),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onSave).toHaveBeenCalledWith(
    { projectId: 'remote', ...dev.endpoint },
    successor.choices[0]?.endpoint,
    'FS',
  );
});

it.each(['project', 'work-item'] as const)(
  'offers no scope when observed %s identity differs from the selected coordinate',
  async (mismatch) => {
    vi.useFakeTimers();
    const observedProject = mismatch === 'project' ? { ...project, projectId: 'other' } : project;
    const observedWorkItemId = mismatch === 'work-item' ? 'other-row' : whole.workItemId;
    const observed = {
      ...whole,
      projectId: observedProject.projectId,
      workItemId: observedWorkItemId,
      endpoint: { scope: 'whole' as const, workItemId: observedWorkItemId },
    };
    const service: DependencyLookup = {
      discoverProjects: vi.fn(),
      resolveReference: vi.fn(),
      searchEndpoints: vi.fn().mockResolvedValue({
        kind: 'success',
        body: {
          project: observedProject,
          addressRevision: 'r1',
          candidates: [observed],
          nextCursor: null,
        },
      }),
    };
    const onSave = vi.fn();
    // Inject a broken selected-project descriptor while retaining its stable coordinate.
    render(
      <RemoteDependencyEditor
        selection={{ ...selection, project: observedProject }}
        lookup={service}
        ownerProjectId="local"
        ownerId="l"
        successor={successor}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    await tick();
    const selector = screen.getByLabelText<HTMLSelectElement>('Predecessor');
    expect([...selector.options].filter((option) => !option.disabled)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSave).not.toHaveBeenCalled();
  },
);

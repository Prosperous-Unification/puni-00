import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ScopedDependencyEditor } from './typed-dependency-editor';

it('customizes remote coordinates without local rows or a shared step catalogue', async () => {
  const onSave = vi.fn().mockResolvedValue('landed');
  const source = {
    projectId: 'remote',
    scope: 'node' as const,
    workItemId: 'remote-row',
    stepId: 'remote-dev',
  };
  const target = {
    projectId: 'local',
    scope: 'node' as const,
    workItemId: 'local-row',
    stepId: 'local-dev',
  };
  render(
    <ScopedDependencyEditor
      predecessor={{
        heading: 'PUNI.080 - Remote',
        preferredKey: 'remote-dev',
        choices: [
          {
            key: 'remote-dev',
            endpoint: source,
            label: 'Remote Dev',
            description: 'PUNI.080 Dev',
            step: { id: 'remote-dev', name: 'Dev', code: 'DEV' },
          },
        ],
        unavailable: 'Choose predecessor',
      }}
      successor={{
        heading: '010 - Local',
        preferredKey: 'local-dev',
        choices: [
          {
            key: 'local-dev',
            endpoint: target,
            label: 'Local Dev',
            description: '010 Dev',
            step: { id: 'local-dev', name: 'Dev', code: 'DEV' },
          },
        ],
        unavailable: 'Choose successor',
      }}
      onCancel={vi.fn()}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'SS' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(source, target, 'SS');
  });
});

it('a retired removal completion cannot cancel a replacement editor session', async () => {
  let release: ((outcome: 'landed') => void) | undefined;
  const onRemove = vi.fn(
    () =>
      new Promise<'landed'>((resolve) => {
        release = resolve;
      }),
  );
  const oldCancel = vi.fn();
  const endpoint = { projectId: 'local', scope: 'whole' as const, workItemId: 'row' };
  const model = {
    heading: 'Local',
    preferredKey: 'whole',
    unavailable: 'Choose scope',
    choices: [{ key: 'whole', endpoint, label: 'Whole', description: 'Local', step: null }],
  };
  const mounted = render(
    <ScopedDependencyEditor
      key="old"
      predecessor={model}
      successor={model}
      isEditing
      onSave={vi.fn()}
      onRemove={onRemove}
      onCancel={oldCancel}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  mounted.rerender(
    <ScopedDependencyEditor
      key="new"
      predecessor={model}
      successor={model}
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'SS' } });
  if (release === undefined) throw new Error('Removal did not start');
  await act(async () => {
    release?.('landed');
    await Promise.resolve();
  });
  expect(oldCancel).not.toHaveBeenCalled();
  expect(screen.getByLabelText<HTMLSelectElement>('Relationship').value).toBe('SS');
});

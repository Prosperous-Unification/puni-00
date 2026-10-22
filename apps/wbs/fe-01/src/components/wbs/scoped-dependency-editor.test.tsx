import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

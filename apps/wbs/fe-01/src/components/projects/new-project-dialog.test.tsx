import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModalContentProps } from '@/components/wbs/modal';

import { NewProjectDialog, type NewProjectDialogState } from './new-project-dialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function DialogProbe({
  open = true,
  state = { kind: 'editing' },
  create = vi.fn(),
  close = vi.fn(),
  refresh = vi.fn(),
  restoreFocus,
}: {
  open?: boolean;
  state?: NewProjectDialogState;
  create?: (projectName: string, workPackageName: string) => void;
  close?: (open: boolean) => void;
  refresh?: () => void;
  restoreFocus?: ModalContentProps['onCloseAutoFocus'];
}) {
  const [projectName, setProjectName] = useState('');
  const [workPackageName, setWorkPackageName] = useState('');
  return (
    <>
      <button type="button">Background shortcut target</button>
      <NewProjectDialog
        open={open}
        state={state}
        projectName={projectName}
        workPackageName={workPackageName}
        onProjectNameChange={setProjectName}
        onWorkPackageNameChange={setWorkPackageName}
        onOpenChange={close}
        onCreate={create}
        onRetryRefresh={refresh}
        onCloseAutoFocus={restoreFocus}
      />
    </>
  );
}

function typeNames(projectName = 'WBS product', workPackageName = 'Editor') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Project name' }), {
    target: { value: projectName },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'First work package name' }), {
    target: { value: workPackageName },
  });
}

describe('the controlled named project dialog', () => {
  it('names its surface and requires both nonblank names at the actual submit handler', () => {
    const create = vi.fn();
    render(<DialogProbe create={create} />);
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const submit = within(dialog).getByRole('button', { name: 'Create project' });
    const form = within(dialog).getByRole('form', {
      name: 'Create project and first work package',
    });
    expect(submit).toBeDisabled();
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    typeNames('   ', 'Editor');
    expect(submit).toBeDisabled();
    fireEvent.submit(form);
    expect(create).not.toHaveBeenCalled();
    typeNames();
    expect(submit).toBeEnabled();
    fireEvent.submit(form);
    expect(create).toHaveBeenCalledExactlyOnceWith('WBS product', 'Editor');
  });

  it('retains the entered names on a modeled refusal', () => {
    const view = render(<DialogProbe />);
    typeNames();
    view.rerender(
      <DialogProbe state={{ kind: 'refused', message: 'A project already uses this name.' }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('A project already uses this name.');
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('WBS product');
    expect(screen.getByRole('textbox', { name: 'First work package name' })).toHaveValue('Editor');
    expect(screen.getByRole('button', { name: 'Create project' })).toBeEnabled();
  });

  it.each(['creating', 'created-refreshing'] as const)(
    'keeps fields, submit, Cancel and dismissal inert while %s',
    async (kind) => {
      const create = vi.fn();
      const close = vi.fn();
      const view = render(<DialogProbe create={create} close={close} />);
      typeNames();
      view.rerender(<DialogProbe create={create} close={close} state={{ kind }} />);
      const dialog = screen.getByRole('dialog', { name: 'New project' });
      expect(screen.getByRole('textbox', { name: 'Project name' })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: 'First work package name' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(
        kind === 'creating' ? 'Creating project' : 'Refreshing lists',
      );
      await act(async () => {
        fireEvent.keyDown(dialog, { key: 'Escape' });
        fireEvent.pointerDown(document.body, { button: 0 });
        await Promise.resolve();
      });
      fireEvent.submit(
        within(dialog).getByRole('form', { name: 'Create project and first work package' }),
      );
      expect(create).not.toHaveBeenCalled();
      expect(close).not.toHaveBeenCalled();
    },
  );

  it('lets Cancel close before a request is sent', () => {
    const create = vi.fn();
    const close = vi.fn();
    render(<DialogProbe create={create} close={close} />);
    typeNames();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('offers only refresh and close after a confirmed creation could not refresh lists', () => {
    const create = vi.fn();
    const close = vi.fn();
    const refresh = vi.fn();
    const view = render(<DialogProbe create={create} close={close} refresh={refresh} />);
    typeNames();
    view.rerender(
      <DialogProbe
        create={create}
        close={close}
        refresh={refresh}
        state={{ kind: 'created-refresh-failed' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project created; lists could not be refreshed.',
    );
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('does not offer a POST retry when creation could not be confirmed', () => {
    const create = vi.fn();
    render(<DialogProbe create={create} state={{ kind: 'unconfirmed' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Creation could not be confirmed. Refresh the project list before trying again.',
    );
    expect(screen.queryByRole('button', { name: 'Create project' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    expect(create).not.toHaveBeenCalled();
  });

  it('holds page shortcuts only while the modal surface is actually open', () => {
    const shortcut = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      const view = render(<DialogProbe open={false} />);
      const background = screen.getByRole('button', { name: 'Background shortcut target' });
      fireEvent.keyDown(background, { key: '?', shiftKey: true });
      expect(shortcut).toHaveBeenCalledTimes(1);
      view.rerender(<DialogProbe />);
      fireEvent.keyDown(background, { key: '?', shiftKey: true });
      expect(shortcut).toHaveBeenCalledTimes(1);
      view.rerender(<DialogProbe open={false} />);
      fireEvent.keyDown(background, { key: '?', shiftKey: true });
      expect(shortcut).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', shortcut);
    }
  });
});

it('returns focus through the supplied presentation callback on actual close', async () => {
  const restoreFocus: ModalContentProps['onCloseAutoFocus'] = (event) => {
    event.preventDefault();
    screen.getByRole('button', { name: 'Background shortcut target' }).focus();
  };
  const view = render(<DialogProbe restoreFocus={restoreFocus} />);
  expect(screen.getByRole('dialog', { name: 'New project' })).toBeVisible();
  view.rerender(<DialogProbe open={false} restoreFocus={restoreFocus} />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Background shortcut target' })).toHaveFocus(),
  );
});

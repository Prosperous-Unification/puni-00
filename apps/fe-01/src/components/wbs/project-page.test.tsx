import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectApi, ProjectSummary } from '@/lib/wbs-api';

import { ProjectPage } from './project-page';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

/**
 * A ProjectApi over an in-memory project list. The table's methods answer
 * emptily rather than throwing: selecting a project renders a real WbsTable,
 * and these tests are about the page around it, not the table.
 */
function fakeProjects(
  initial: ProjectSummary[],
): ProjectApi & { renamed: [string, string][]; drop: (id: string) => void } {
  let projects = [...initial];
  const renamed: [string, string][] = [];
  return {
    renamed,
    // A deletion that happened somewhere else: the next listProjects simply
    // no longer has the project.
    drop(id) {
      projects = projects.filter((p) => p.id !== id);
    },
    listProjects: () => Promise.resolve([...projects]),
    createProject(name) {
      const project = { id: `p${String(projects.length + 1)}`, name, restricted: false };
      projects = [...projects, project];
      return Promise.resolve(project);
    },
    renameProject(id, name) {
      renamed.push([id, name]);
      projects = projects.map((p) => (p.id === id ? { ...p, name } : p));
      return Promise.resolve();
    },
    tree: () => Promise.resolve({ workItems: [], seq: -1, scheduleError: null }),
    roles: () => Promise.resolve([]),
    create: () => Promise.reject(new Error('not_in_these_tests')),
    patch: () => Promise.reject(new Error('not_in_these_tests')),
    move: () => Promise.reject(new Error('not_in_these_tests')),
    remove: () => Promise.reject(new Error('not_in_these_tests')),
    setEstimate: () => Promise.reject(new Error('not_in_these_tests')),
    freeze: () => Promise.reject(new Error('not_in_these_tests')),
    unfreezeProject: () => Promise.reject(new Error('not_in_these_tests')),
    unfreeze: () => Promise.reject(new Error('not_in_these_tests')),
    addDependency: () => Promise.reject(new Error('not_in_these_tests')),
    removeDependency: () => Promise.reject(new Error('not_in_these_tests')),
  };
}

const TWO = [
  { id: 'p1', name: 'Rewire the shed', restricted: false },
  { id: 'p2', name: 'Paint the fence', restricted: false },
];

const pageWith = (api: ProjectApi) => render(<ProjectPage token="t" api={api} />);

const picker = () => screen.getByLabelText<HTMLSelectElement>('Project');

async function selectProject(id: string) {
  await waitFor(() => {
    expect(picker().options.length).toBeGreaterThan(1);
  });
  fireEvent.change(picker(), { target: { value: id } });
}

beforeEach(() => {
  localStorage.clear();
});

describe('the chosen project survives a refresh', () => {
  itDom('selects the remembered project on the next load, with no click', async () => {
    pageWith(fakeProjects(TWO));
    await selectProject('p2');
    expect(picker().value).toBe('p2');

    cleanup();
    pageWith(fakeProjects(TWO));

    await waitFor(() => {
      expect(picker().value).toBe('p2');
    });
  });

  itDom('ignores a remembered project the list no longer has', async () => {
    localStorage.setItem('wbs.project', 'gone');
    const api = fakeProjects(TWO);
    // The select's value is no evidence here: a value with no matching option
    // reads back as '' whether or not the page believed it. What the guard
    // prevents is the table asking be-01 for the deleted project's tree.
    const asked: string[] = [];
    const realTree = api.tree.bind(api);
    api.tree = (projectId) => {
      asked.push(projectId);
      return realTree(projectId);
    };
    pageWith(api);

    await waitFor(() => {
      expect(picker().options.length).toBe(3);
    });
    expect(picker().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(asked).toEqual([]);
  });

  itDom('forgets the choice when the picker is put back to none', async () => {
    pageWith(fakeProjects(TWO));
    await selectProject('p2');
    fireEvent.change(picker(), { target: { value: '' } });
    expect(localStorage.getItem('wbs.project')).toBeNull();
  });
});

describe('renaming a project', () => {
  itDom('commits on Enter and shows the new name, still selected', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    expect(name.value).toBe('Paint the fence');
    fireEvent.change(name, { target: { value: 'Stain the fence' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    await waitFor(() => {
      expect(picker().value).toBe('p2');
      expect(within(picker()).getByText('Stain the fence')).toBeDefined();
    });
    expect(api.renamed).toEqual([['p2', 'Stain the fence']]);
  });

  itDom('cancels on Escape without a request', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    fireEvent.change(name, { target: { value: 'Never this' } });
    fireEvent.keyDown(name, { key: 'Escape' });

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Project name')).toBeNull();
    expect(within(picker()).getByText('Paint the fence')).toBeDefined();
  });

  itDom('shows be-01’s refusal and keeps the old name', async () => {
    const api = fakeProjects(TWO);
    api.renameProject = () => Promise.reject(new Error('forbidden'));
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    fireEvent.change(name, { target: { value: 'Not allowed' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('forbidden');
    });
    // The draft survives the refusal — a `forbidden` must not eat what was
    // typed. Without this the test passed with a catch that closed the input.
    expect(screen.getByLabelText<HTMLInputElement>('Project name').value).toBe('Not allowed');
    expect(screen.getByText('Paint the fence')).toBeDefined();
  });

  itDom('creating a project mid-rename cancels the draft instead of retargeting it', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Meant for p2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    // The draft is gone, nothing was renamed, and the new project keeps the
    // name it was created with.
    await waitFor(() => {
      expect(screen.queryByLabelText('Project name')).toBeNull();
    });
    expect(api.renamed).toEqual([]);
    await waitFor(() => {
      expect(within(picker()).getByText('New project')).toBeDefined();
    });
  });

  itDom('commits on blur when the name changed', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    fireEvent.change(name, { target: { value: 'Stain the fence' } });
    fireEvent.blur(name);

    await waitFor(() => {
      expect(within(picker()).getByText('Stain the fence')).toBeDefined();
    });
    expect(api.renamed).toEqual([['p2', 'Stain the fence']]);
  });

  itDom('a blur that changed nothing cancels without a request', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.blur(screen.getByLabelText('Project name'));

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Project name')).toBeNull();
    expect(within(picker()).getByText('Paint the fence')).toBeDefined();
  });

  itDom('an emptied draft cancels rather than blanking the name', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    fireEvent.change(name, { target: { value: '   ' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    expect(api.renamed).toEqual([]);
    expect(screen.queryByLabelText('Project name')).toBeNull();
    expect(within(picker()).getByText('Paint the fence')).toBeDefined();
  });
});

describe('the selection is a claim too', () => {
  itDom('a selected project deleted elsewhere is dropped on the next list load', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    // p2 vanishes behind our back; the next load is triggered by a rename
    // commit, which is one of the two paths that refetch the list.
    api.drop('p2');
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText<HTMLInputElement>('Project name');
    fireEvent.change(name, { target: { value: 'Too late' } });
    fireEvent.keyDown(name, { key: 'Enter' });

    // The one project left is auto-selected — the read-back is 'p1', which a
    // held-forever 'p2' cannot produce (it would read back '').
    await waitFor(() => {
      expect(picker().value).toBe('p1');
    });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDefined();
  });
});

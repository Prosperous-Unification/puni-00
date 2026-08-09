import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
): ProjectApi & { renamed: [string, string][]; opened: string[]; drop: (id: string) => void } {
  let projects = [...initial];
  const renamed: [string, string][] = [];
  const opened: string[] = [];
  return {
    renamed,
    opened,
    // A deletion that happened somewhere else: the next listProjects simply
    // no longer has the project.
    drop(id) {
      projects = projects.filter((p) => p.id !== id);
    },
    listProjects: () => Promise.resolve([...projects]),
    openProject(id) {
      opened.push(id);
      return Promise.resolve();
    },
    createProject(name) {
      const project = {
        id: `p${String(projects.length + 1)}`,
        name,
        restricted: false,
        lastOpenedAt: null,
      };
      projects = [...projects, project];
      return Promise.resolve(project);
    },
    renameProject(id, name) {
      renamed.push([id, name]);
      projects = projects.map((p) => (p.id === id ? { ...p, name } : p));
      return Promise.resolve();
    },
    tree: () =>
      Promise.resolve({
        workItems: [],
        seq: -1,
        scheduleError: null,
        slices: [],
        estimateMethod: 'pert' as const,
        startDate: null,
        projectRevision: 0,
        undoable: false,
        redoable: false,
      }),
    setEstimateMethod: () => Promise.resolve(),
    setStartDate: () => Promise.resolve(),
    listTeams: () => Promise.resolve([]),
    addTeam: () => Promise.reject(new Error('not_in_these_tests')),
    listPeople: () => Promise.resolve([]),
    addPerson: () => Promise.reject(new Error('not_in_these_tests')),
    assign: () => Promise.reject(new Error('not_in_these_tests')),
    roles: () => Promise.resolve([]),
    addRole: () => Promise.reject(new Error('not_in_these_tests')),
    renameRole: () => Promise.reject(new Error('not_in_these_tests')),
    removeRole: () => Promise.reject(new Error('not_in_these_tests')),
    create: () => Promise.reject(new Error('not_in_these_tests')),
    patch: () => Promise.reject(new Error('not_in_these_tests')),
    move: () => Promise.reject(new Error('not_in_these_tests')),
    duplicate: () => Promise.reject(new Error('not_in_these_tests')),
    remove: () => Promise.reject(new Error('not_in_these_tests')),
    setEstimate: () => Promise.reject(new Error('not_in_these_tests')),
    clearEstimate: () => Promise.reject(new Error('not_in_these_tests')),
    freeze: () => Promise.reject(new Error('not_in_these_tests')),
    unfreezeProject: () => Promise.reject(new Error('not_in_these_tests')),
    unfreeze: () => Promise.reject(new Error('not_in_these_tests')),
    addDependency: () => Promise.reject(new Error('not_in_these_tests')),
    removeDependency: () => Promise.reject(new Error('not_in_these_tests')),
    undo: () => Promise.reject(new Error('not_in_these_tests')),
    redo: () => Promise.reject(new Error('not_in_these_tests')),
  };
}

const TWO = [
  { id: 'p1', name: 'Rewire the shed', restricted: false, lastOpenedAt: null },
  { id: 'p2', name: 'Paint the fence', restricted: false, lastOpenedAt: null },
];

const pageWith = (api: ProjectApi) => render(<ProjectPage token="t" api={api} />);

const picker = () => screen.getByLabelText<HTMLInputElement>('Project');

/** The names on offer, in the order the picker is showing them. */
const optionNames = () => screen.queryAllByRole('option').map((entry) => entry.textContent);

/** Opens the list — the picker offers everything when it takes the focus. */
function openPicker() {
  fireEvent.focus(picker());
}

async function selectProject(id: string) {
  await waitFor(() => {
    expect(screen.getByLabelText('Project')).toBeDefined();
  });
  openPicker();
  await waitFor(() => {
    expect(document.getElementById(`project-option-${id}`)).not.toBeNull();
  });
  const entry = document.getElementById(`project-option-${id}`);
  if (entry === null) throw new Error(`no option for ${id}`);
  fireEvent.click(entry);
}

beforeEach(() => {
  localStorage.clear();
});

/**
 * Where the project controls are, and what they are called there.
 *
 * `H header-fits-a-row` moved every one of them into a `banner` and turned two
 * of them into icon buttons. Nothing in the repository asserted that the page
 * had a landmark, or that the two buttons kept their names — `Rename` and
 * `New project` were found by name in eleven places and named in none of them,
 * which is a contract every test depends on and no test states. These are the
 * assertions, written by the change that moved them, per `F
 * shadcn-foundation`'s rule.
 */
describe('the header bar', () => {
  itDom('puts the project controls in a banner', async () => {
    pageWith(fakeProjects(TWO));
    await selectProject('p2');

    const bar = screen.getByRole('banner');
    expect(bar.contains(picker())).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'Rename' }))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'New project' }))).toBe(true);
  });

  itDom('gives the header the slots the app fills, in the bar itself', async () => {
    render(
      <ProjectPage
        token="t"
        api={fakeProjects(TWO)}
        presence={<p>who is here</p>}
        account={<button type="button">the account</button>}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });

    const bar = screen.getByRole('banner');
    expect(bar.contains(screen.getByText('who is here'))).toBe(true);
    expect(bar.contains(screen.getByRole('button', { name: 'the account' }))).toBe(true);
  });

  itDom('leaves the table out of the banner and in the page’s main', async () => {
    pageWith(fakeProjects(TWO));
    await selectProject('p2');

    // The half that says the landmark is a bar rather than the whole page: a
    // `<header>` wrapped around everything would satisfy the assertions above.
    const bar = screen.getByRole('banner');
    const grid = document.querySelector('[data-grid]');
    expect(grid).not.toBeNull();
    expect(bar.contains(grid)).toBe(false);
    expect(document.querySelector('main')?.contains(grid)).toBe(true);
  });
});

describe('the chosen project survives a refresh', () => {
  itDom('selects the remembered project on the next load, with no click', async () => {
    pageWith(fakeProjects(TWO));
    await selectProject('p2');
    expect(picker().value).toBe('Paint the fence');

    cleanup();
    pageWith(fakeProjects(TWO));

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
  });

  itDom('ignores a remembered project the list no longer has, and forgets it', async () => {
    localStorage.setItem('wbs.project', 'gone');
    const api = fakeProjects(TWO);
    // What the guard prevents is the table asking be-01 for the deleted
    // project's tree.
    const asked: string[] = [];
    const realTree = api.tree.bind(api);
    api.tree = (projectId) => {
      asked.push(projectId);
      return realTree(projectId);
    };
    pageWith(api);

    await waitFor(() => {
      expect(localStorage.getItem('wbs.project')).toBeNull();
    });
    expect(picker().value).toBe('');
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(asked).toEqual([]);
  });
});

describe('the picker searches', () => {
  itDom('narrows the list to what was typed, ignoring case', async () => {
    pageWith(fakeProjects(TWO));
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames()).toEqual(['Rewire the shed', 'Paint the fence']);
    });

    fireEvent.change(picker(), { target: { value: 'FENCE' } });

    expect(optionNames()).toEqual(['Paint the fence']);
  });

  itDom('chooses with the keyboard alone, and shows that project’s table', async () => {
    const api = fakeProjects(TWO);
    const asked: string[] = [];
    const realTree = api.tree.bind(api);
    api.tree = (projectId) => {
      asked.push(projectId);
      return realTree(projectId);
    };
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'Enter' });

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    expect(asked).toEqual(['p2']);
  });

  itDom('offers be-01’s order rather than sorting the names itself', async () => {
    // be-01 answers in this account's recency order. `Paint` before `Rewire` is
    // not alphabetical and not the id order — a client that re-sorted by either
    // would show these two the other way round.
    pageWith(
      fakeProjects([
        { id: 'p2', name: 'Paint the fence', restricted: false, lastOpenedAt: 900 },
        { id: 'p1', name: 'Rewire the shed', restricted: false, lastOpenedAt: null },
      ]),
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });
    openPicker();

    await waitFor(() => {
      expect(optionNames()).toEqual(['Paint the fence', 'Rewire the shed']);
    });
  });

  itDom('an Enter with nothing highlighted picks nothing', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'Enter' });

    expect(picker().value).toBe('');
    expect(api.opened).toEqual([]);
  });

  itDom('Escape closes the list without choosing', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toBeDefined();
    });
    openPicker();
    await waitFor(() => {
      expect(optionNames().length).toBe(2);
    });

    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'Escape' });

    expect(optionNames()).toEqual([]);
    expect(api.opened).toEqual([]);
  });
});

describe('opening a project is recorded', () => {
  itDom('records the project that was picked', async () => {
    const api = fakeProjects(TWO);
    pageWith(api);
    await selectProject('p2');

    await waitFor(() => {
      expect(api.opened).toEqual(['p2']);
    });
  });

  itDom('records the project restored from a previous visit', async () => {
    // The commonest arrival of all. Recording only on the click would leave
    // the projects people return to most looking never-opened, and the
    // ordering would drift by exactly those.
    localStorage.setItem('wbs.project', 'p1');
    const api = fakeProjects(TWO);
    pageWith(api);

    await waitFor(() => {
      expect(api.opened).toEqual(['p1']);
    });
  });

  itDom('shows no error when recording fails', async () => {
    const api = fakeProjects(TWO);
    api.openProject = () => Promise.reject(new Error('offline'));
    pageWith(api);
    await selectProject('p2');

    await waitFor(() => {
      expect(picker().value).toBe('Paint the fence');
    });
    // Navigation history nobody can act on: the project still opened.
    expect(screen.queryByRole('alert')).toBeNull();
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
      expect(picker().value).toBe('Stain the fence');
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
    expect(picker().value).toBe('Paint the fence');
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
    // And the project is still called what it was called. This used to read
    // the "Working in …" line, which `H header-fits-a-row` removed with the
    // rest of the stacked chrome; the picker is where a project's name is
    // shown now, and it shows it the moment the rename mode ends. Same claim,
    // one keystroke later, against the control that carries it today.
    fireEvent.keyDown(screen.getByLabelText('Project name'), { key: 'Escape' });
    expect(picker().value).toBe('Paint the fence');
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
    openPicker();
    await waitFor(() => {
      expect(optionNames()).toContain('New project');
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
      expect(picker().value).toBe('Stain the fence');
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
    expect(picker().value).toBe('Paint the fence');
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
    expect(picker().value).toBe('Paint the fence');
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
      expect(picker().value).toBe('Rewire the shed');
    });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDefined();
  });
});

import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  Days,
  EstimateMethod,
  ProjectApi,
  RoleView,
  UndoResult,
  WorkItemView,
} from '@/lib/wbs-api';

import { type SubscriptionHandlers, WbsTable } from './wbs-table';

/** The two elements a table cell can be, since a wrapping cell is a textarea. */
const isCell = (node: unknown): node is HTMLInputElement | HTMLTextAreaElement =>
  node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

const DEV: RoleView = { id: 'role-dev', name: 'Dev' };
// A second role, because "one assignee is assumed to do every phase" is only
// observable when there is another phase for them to be assumed into.
const QA: RoleView = { id: 'role-qa', name: 'QA' };

/**
 * A ProjectApi over an in-memory tree, numbering rows the way be-01 does.
 *
 * It has to renumber on every change rather than assign once: the whole point
 * of the component's "refetch, never patch" rule is that a create or move moves
 * numbers it never touched, and a fake that kept numbers stable would let a
 * broken component pass.
 */
function fakeApi(): ProjectApi & {
  rows: WorkItemView[];
  stack: { undoable: boolean; redoable: boolean };
  stackCalls: ('undo' | 'redo')[];
  answerStackWith: (answer: UndoResult) => void;
} {
  const rows: WorkItemView[] = [];
  const edges: { predecessorId: string; successorId: string }[] = [];
  let next = 0;
  let seq = -1;
  let estimateMethod: EstimateMethod = 'pert';
  let startDate: string | null = null;
  const teams: { id: string; name: string }[] = [];
  const people: { id: string; name: string; teamIds: string[] }[] = [];
  const assigned = new Map<string, string>();
  /**
   * The undo stack as far as this table can see it, which is only what be-01
   * reports and what it answers.
   *
   * Set by the tests rather than derived from the mutations above, deliberately:
   * whether there is anything to undo is a fact about a per-account stack on
   * the server — cleared by a refusal, cleared by anybody's forward edit — and
   * a fake that guessed at it would be a second implementation of a rule this
   * component does not own.
   */
  const stack = { undoable: false, redoable: false };
  const stackCalls: ('undo' | 'redo')[] = [];
  let stackAnswer: UndoResult = { ok: true, done: 'rename “Strip”', detail: null };

  /** The final figure be-01 would report, under whichever method is set. */
  const finalOf = (days: Days): number =>
    estimateMethod === 'pert'
      ? (days.optimistic + 4 * days.realistic + days.pessimistic) / 6
      : days[estimateMethod];

  /**
   * The schedule be-01 would compute, in miniature.
   *
   * Not the real algorithm — one pass over rows already in tree order is enough
   * for a fake, because these tests are about the table. What it does model
   * faithfully is the part the table renders differently: an unestimated row,
   * and a parent's span being its children's rather than their sum.
   */
  function scheduleOf(row: WorkItemView): WorkItemView['schedule'] {
    const children = rows.filter((r) => r.parentId === row.id);
    const own = Object.values(row.estimates).reduce(
      (total, days) => total + (days.optimistic + 4 * days.realistic + days.pessimistic) / 6,
      0,
    );
    const waits = edges
      .filter((e) => e.successorId === row.id)
      .map((e) => rows.find((r) => r.id === e.predecessorId))
      .map((r) => (r === undefined ? 0 : scheduleOf(r).earliestFinish));
    const start = Math.max(0, ...waits);
    const duration = children.length > 0 ? 0 : own;
    const finish =
      children.length > 0
        ? Math.max(0, ...children.map((c) => scheduleOf(c).earliestFinish))
        : start + duration;
    return {
      duration,
      estimated: children.length > 0 ? children.some((c) => scheduleOf(c).estimated) : own > 0,
      earliestStart: start,
      earliestFinish: finish,
      latestStart: start,
      latestFinish: finish,
      float: 0,
      critical: true,
    };
  }

  function renumber(): void {
    seq += 1;
    const numberOf = new Map<string | null, string>([[null, '']]);
    const assign = (parentId: string | null, prefix: string): void => {
      const group = rows.filter((r) => r.parentId === parentId);
      group.forEach((row, i) => {
        row.number =
          prefix === '' ? String((i + 1) * 10).padStart(3, '0') : `${prefix}.${String(i + 1)}`;
        numberOf.set(row.id, row.number);
        assign(row.id, row.number);
      });
    };
    assign(null, '');
    rows.sort((a, b) => (a.number < b.number ? -1 : 1));
    for (const row of rows) row.rolledUp = rows.some((r) => r.parentId === row.id);
  }

  return {
    rows,
    stack,
    stackCalls,
    /** What the next undo or redo answers, for the refusals be-01 models. */
    answerStackWith(answer: UndoResult) {
      stackAnswer = answer;
    },
    listProjects: () =>
      Promise.resolve([
        { id: 'p1', name: 'Rewire the shed', restricted: false, lastOpenedAt: null },
      ]),
    createProject: (name: string) =>
      Promise.resolve({ id: 'p1', name, restricted: false, lastOpenedAt: null }),
    openProject: () => Promise.resolve(),
    renameProject: () => Promise.resolve(),
    tree: () =>
      // The sequence advances with every mutation, the way be-01's does, so a
      // test that asserts what the stream was told is asserting something real.
      Promise.resolve({
        workItems: rows.map((r) => ({
          ...r,
          dependsOn: edges.filter((e) => e.successorId === r.id).map((e) => e.predecessorId),
          schedule: scheduleOf(r),
          finalDays: Object.fromEntries(
            Object.entries(r.estimates).map(([roleId, days]) => [roleId, finalOf(days)]),
          ),
          finalTotal: Object.values(r.estimates).reduce((total, days) => total + finalOf(days), 0),
          // be-01 works the dates out; the fake only has to place them on the
          // calendar the same way, so the table is asserted on what it renders.
          dates: startDate === null ? null : { startsOn: startDate, endsOn: startDate },
          assignees: Object.fromEntries(
            [...assigned.entries()]
              .filter(([key]) => key.startsWith(`${r.id}::`))
              .map(([key, personId]) => [key.split('::')[1] ?? '', personId]),
          ),
          doesEveryPhase: (() => {
            const mine = [...assigned.entries()].filter(([key]) => key.startsWith(`${r.id}::`));
            return mine.length === 1 ? (mine[0]?.[1] ?? null) : null;
          })(),
        })),
        seq,
        scheduleError: null,
        estimateMethod,
        startDate,
        // Never moved by anything the table does: the fake's mutations are all
        // work item writes, and be-01 keeps the project's revision off them.
        projectRevision: 0,
        undoable: stack.undoable,
        redoable: stack.redoable,
      }),
    setEstimateMethod(_projectId, method) {
      estimateMethod = method;
      renumber();
      return Promise.resolve();
    },
    listTeams: () => Promise.resolve([...teams]),
    addTeam(name: string) {
      // Idempotent by name, exactly as be-01 is: the picker's "type it if it
      // is not in the list" must not be able to make two `Platform`s.
      const already = teams.find((t) => t.name === name);
      if (already !== undefined) return Promise.resolve(already);
      const team = { id: `team${String(teams.length + 1)}`, name };
      teams.push(team);
      return Promise.resolve(team);
    },
    listPeople: () => Promise.resolve(people.map((p) => ({ ...p, teamIds: [...p.teamIds] }))),
    addPerson(name: string, teamIds: readonly string[]) {
      const already = people.find((p) => p.name === name);
      if (already !== undefined) return Promise.resolve(already);
      const person = { id: `person${String(people.length + 1)}`, name, teamIds: [...teamIds] };
      people.push(person);
      return Promise.resolve(person);
    },
    assign(workItemId: string, roleId: string, personId: string | null) {
      const key = `${workItemId}::${roleId}`;
      if (personId === null) assigned.delete(key);
      else assigned.set(key, personId);
      renumber();
      return Promise.resolve();
    },
    setStartDate(_projectId, day) {
      startDate = day;
      renumber();
      return Promise.resolve();
    },
    roles: () => Promise.resolve([DEV, QA]),
    create(_projectId, input) {
      next += 1;
      const id = `w${String(next)}`;
      const at =
        input.afterId === null ? rows.length : rows.findIndex((r) => r.id === input.afterId) + 1;
      rows.splice(at, 0, {
        id,
        parentId: input.parentId,
        // A new row has never been written to since it came into being, and
        // this fake never writes to a row again — the table sends patches and
        // refetches, so nothing here would move it.
        revision: 0,
        number: '',
        name: input.name ?? '',
        notes: '',
        frozenNumber: null,
        startNoEarlierThan: null,
        serviceTeamId: null,
        assignees: {},
        doesEveryPhase: null,
        rolledUp: false,
        estimates: {},
        dependsOn: [],
        finalDays: {},
        finalTotal: 0,
        schedule: {
          duration: 0,
          estimated: false,
          earliestStart: 0,
          earliestFinish: 0,
          latestStart: 0,
          latestFinish: 0,
          float: 0,
          critical: true,
        },
      });
      renumber();
      return Promise.resolve({ id });
    },
    patch(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) Object.assign(row, patch);
      return Promise.resolve();
    },
    move(id, parentId, afterId) {
      const index = rows.findIndex((r) => r.id === id);
      const row = rows.splice(index, 1).at(0);
      if (row === undefined) return Promise.resolve();
      row.parentId = parentId;
      const at = afterId === null ? 0 : rows.findIndex((r) => r.id === afterId) + 1;
      rows.splice(at, 0, row);
      renumber();
      return Promise.resolve();
    },
    duplicate(id) {
      const source = rows.find((r) => r.id === id);
      if (source === undefined) return Promise.reject(new Error('not_found'));
      // be-01's rules in miniature, because the table is asserted against
      // them: the whole branch, the root renamed, no frozen numbers, and only
      // the edges with both ends inside it.
      const subtree: WorkItemView[] = [];
      const collect = (row: WorkItemView): void => {
        subtree.push(row);
        for (const child of rows.filter((r) => r.parentId === row.id)) collect(child);
      };
      collect(source);
      const copyOf = new Map<string, string>();
      for (const row of subtree) {
        next += 1;
        copyOf.set(row.id, `w${String(next)}`);
      }
      const copyId = (originalId: string): string => {
        const copied = copyOf.get(originalId);
        if (copied === undefined) throw new Error(`no copy for ${originalId}`);
        return copied;
      };
      const copies = subtree.map((row, index) => ({
        ...row,
        id: copyId(row.id),
        parentId: index === 0 ? row.parentId : copyId(row.parentId ?? row.id),
        name: index === 0 ? `${row.name} (copy)` : row.name,
        frozenNumber: null,
        estimates: { ...row.estimates },
      }));
      const inside = new Set(subtree.map((r) => r.id));
      for (const edge of edges.filter(
        (e) => inside.has(e.predecessorId) && inside.has(e.successorId),
      )) {
        edges.push({
          predecessorId: copyId(edge.predecessorId),
          successorId: copyId(edge.successorId),
        });
      }
      for (const [key, personId] of [...assigned.entries()]) {
        const [workItemId = '', roleId = ''] = key.split('::');
        if (inside.has(workItemId)) assigned.set(`${copyId(workItemId)}::${roleId}`, personId);
      }
      const last = subtree.at(-1);
      rows.splice(last === undefined ? rows.length : rows.indexOf(last) + 1, 0, ...copies);
      renumber();
      const root = copies.at(0);
      if (root === undefined) throw new Error('a duplication copied nothing');
      return Promise.resolve({ id: root.id });
    },
    remove(id) {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      renumber();
      return Promise.resolve();
    },
    setEstimate(id, roleId, days: Days) {
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) row.estimates[roleId] = days;
      return Promise.resolve();
    },
    clearEstimate(id, roleId) {
      const row = rows.find((r) => r.id === id);
      // Rebuilt without the role rather than `delete`d on a computed key, the
      // same way the table drops a trio's drafts.
      if (row !== undefined) {
        row.estimates = Object.fromEntries(
          Object.entries(row.estimates).filter(([key]) => key !== roleId),
        );
      }
      return Promise.resolve();
    },
    freeze() {
      for (const row of rows) row.frozenNumber ??= row.number;
      return Promise.resolve();
    },
    unfreezeProject() {
      for (const row of rows) row.frozenNumber = null;
      return Promise.resolve();
    },
    unfreeze(id) {
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) row.frozenNumber = null;
      return Promise.resolve();
    },
    addDependency(id, predecessorId) {
      // Mirrors the unique pair the real table has: adding the same edge twice
      // is not two edges, and a fake that let it be would not be modelling it.
      const already = edges.some((e) => e.predecessorId === predecessorId && e.successorId === id);
      if (!already) edges.push({ predecessorId, successorId: id });
      renumber();
      return Promise.resolve();
    },
    removeDependency(id, predecessorId) {
      const at = edges.findIndex((e) => e.predecessorId === predecessorId && e.successorId === id);
      if (at >= 0) edges.splice(at, 1);
      renumber();
      return Promise.resolve();
    },
    undo() {
      stackCalls.push('undo');
      renumber();
      return Promise.resolve(stackAnswer);
    },
    redo() {
      stackCalls.push('redo');
      renumber();
      return Promise.resolve(stackAnswer);
    },
  };
}

const numbersOnScreen = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('[data-number]')?.textContent ?? '');

/** What the toast stack is saying, newest first. */
const toastTexts = (): string[] =>
  [...document.querySelectorAll('[data-toast-text]')].map((node) => node.textContent);

/** The stale-tree banner, or null while the tree on screen is believed current. */
const staleBanner = (): Element | null => document.querySelector('[data-stale-tree]');

const click = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
};

const typeName = (number: string, value: string) => {
  fireEvent.change(screen.getByLabelText(`Name of ${number}`), { target: { value } });
};

/**
 * Keys are fired at a named row rather than at `document.activeElement`.
 *
 * Focus is a real behaviour and gets its own assertion, but using it to steer
 * these tests would make every one of them fail for the same reason if focus
 * broke — and none of them would say which behaviour was actually wrong.
 */
const pressEnter = (number: string) => {
  fireEvent.keyDown(screen.getByLabelText(`Name of ${number}`), { key: 'Enter' });
};

/**
 * Opens a role's folded columns — the trio and the assignee. Folded is the
 * default, so every test that types an estimate or assigns someone does this
 * first, exactly as a person would.
 */
const unfoldRole = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: `Unfold ${name} estimates` }));
};

const pressTab = (number: string, shiftKey = false) => {
  fireEvent.keyDown(screen.getByLabelText(`Name of ${number}`), { key: 'Tab', shiftKey });
};

// The table remembers each project's open branches in localStorage, so one
// test's collapsing would arrive as the next test's starting shape.
beforeEach(() => {
  localStorage.clear();
});

describe('the WBS table', () => {
  itDom('types a three-level breakdown without touching the mouse', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');
    typeName('010', 'Strip');

    // Enter makes a sibling; Tab makes that sibling a child of the row above.
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });

    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });

    typeName('010.1', 'Sockets');
    pressEnter('010.1');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2']);
    });

    pressTab('010.2');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1']);
    });
  });

  itDom('outdents with shift-tab', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });

    pressTab('010.1', true);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
  });

  itDom('backspace at the start of the name outdents the row', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });

    const name = screen.getByLabelText<HTMLInputElement>('Name of 010.1');
    name.setSelectionRange(0, 0);
    fireEvent.keyDown(name, { key: 'Backspace' });

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
  });

  itDom('backspace anywhere else, or over a selection, stays a backspace', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');
    typeName('010.1', 'Sockets');

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 010.1');

    // Mid-text: an ordinary backspace.
    name.setSelectionRange(3, 3);
    fireEvent.keyDown(name, { key: 'Backspace' });
    // A selection anchored at the start: deleting it, not moving the row.
    name.setSelectionRange(0, 3);
    fireEvent.keyDown(name, { key: 'Backspace' });

    expect(moved).toEqual([]);
    expect(numbersOnScreen()).toEqual(['010', '010.1']);
  });

  itDom('backspace in an empty root row removes it and puts the focus above', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });

    const name = screen.getByLabelText<HTMLInputElement>('Name of 020');
    name.setSelectionRange(0, 0);
    fireEvent.keyDown(name, { key: 'Backspace' });

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010']);
    });
    expect(document.activeElement).toBe(screen.getByLabelText('Name of 010'));
  });

  itDom('a nested empty row outdents on backspace, and is not removed', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');

    const removed: unknown[] = [];
    api.remove = (...args: unknown[]) => {
      removed.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 010.1');
    name.setSelectionRange(0, 0);
    fireEvent.keyDown(name, { key: 'Backspace' });

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    expect(removed).toEqual([]);
  });

  itDom('anything the item holds vetoes the backspace removal', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    // 010 gets its child first, so the numbering of everything after is settled.
    pressEnter('010');
    await screen.findByLabelText('Name of 020');
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');
    // Four more root rows: one per remaining kind of content that must veto.
    for (const upTo of ['020', '030', '040', '050'] as const) {
      click('Add work item');
      await screen.findByLabelText(`Name of ${upTo}`);
    }

    // 030 gets notes, 040 an estimate, 050 a dependency — committed by blur.
    const notes = screen.getByLabelText<HTMLInputElement>('Notes for 030');
    fireEvent.change(notes, { target: { value: 'measure twice' } });
    fireEvent.blur(notes);
    unfoldRole('Dev');
    // A whole trio on 040 — one point alone is a draft, not an estimate, since
    // the table stopped inventing the other two.
    for (const point of ['optimistic', 'realistic', 'pessimistic'] as const) {
      const estimate = screen.getByLabelText<HTMLInputElement>(`Dev ${point} for 040`);
      fireEvent.change(estimate, { target: { value: '3' } });
      fireEvent.blur(estimate);
    }
    const depends = screen.getByLabelText<HTMLInputElement>('Add a dependency to 050');
    fireEvent.change(depends, { target: { value: '010' } });
    fireEvent.keyDown(depends, { key: 'Enter' });
    fireEvent.blur(depends);
    await waitFor(() => {
      expect(screen.getByLabelText('Notes for 030')).toHaveValue('measure twice');
    });

    const removed: unknown[] = [];
    api.remove = (...args: unknown[]) => {
      removed.push(args);
      return Promise.resolve();
    };

    // 020: text typed into the Name and not yet committed is still a name.
    const named = screen.getByLabelText<HTMLInputElement>('Name of 020');
    fireEvent.change(named, { target: { value: 'Sand' } });
    named.setSelectionRange(0, 0);
    fireEvent.keyDown(named, { key: 'Backspace' });

    for (const number of ['010', '030', '040', '050'] as const) {
      const name = screen.getByLabelText<HTMLInputElement>(`Name of ${number}`);
      name.setSelectionRange(0, 0);
      fireEvent.keyDown(name, { key: 'Backspace' });
    }

    expect(removed).toEqual([]);
    expect(numbersOnScreen()).toEqual(['010', '010.1', '020', '030', '040', '050']);
  });

  itDom('tab inside the text walks to the next cell instead of indenting', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    // Unfolded before typing: the fold rebuilds the column set, which
    // remounts every cell, and a name typed but not yet committed would be
    // reset to the server's value — the one cost of folding, paid on an
    // explicit click.
    unfoldRole('Dev');
    typeName('020', 'Sand');

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 020');
    name.focus();
    name.setSelectionRange(2, 2);
    fireEvent.keyDown(name, { key: 'Tab' });

    // The next field, which is the one beside the name: what a row waits for.
    const next = screen.getByLabelText<HTMLInputElement>('Add a dependency to 020');
    expect(document.activeElement).toBe(next);
    expect(moved).toEqual([]);
    expect(numbersOnScreen()).toEqual(['010', '020']);
  });

  itDom('shift-tab inside the text walks backwards instead of outdenting', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    // Unfolded before typing: the fold rebuilds the column set, which
    // remounts every cell, and a name typed but not yet committed would be
    // reset to the server's value — the one cost of folding, paid on an
    // explicit click.
    unfoldRole('Dev');
    typeName('020', 'Sand');

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 020');
    name.focus();
    name.setSelectionRange(2, 2);
    fireEvent.keyDown(name, { key: 'Tab', shiftKey: true });

    // The row above's last editable cell — 010 is a leaf, so its notes.
    expect(document.activeElement).toBe(screen.getByLabelText('Notes for 010'));
    expect(moved).toEqual([]);
  });

  itDom('tab over a selection navigates rather than indenting', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    // Unfolded before typing: the fold rebuilds the column set, which
    // remounts every cell, and a name typed but not yet committed would be
    // reset to the server's value — the one cost of folding, paid on an
    // explicit click.
    unfoldRole('Dev');
    typeName('020', 'Sand');

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 020');
    name.focus();
    // Anchored at the start: atStart alone would still indent this.
    name.setSelectionRange(0, 3);
    fireEvent.keyDown(name, { key: 'Tab' });

    expect(document.activeElement).toBe(
      screen.getByLabelText<HTMLInputElement>('Add a dependency to 020'),
    );
    expect(moved).toEqual([]);
  });

  itDom('backspace at the start of a root row moves nothing', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    const name = screen.getByLabelText<HTMLInputElement>('Name of 010');
    name.setSelectionRange(0, 0);
    fireEvent.keyDown(name, { key: 'Backspace' });

    expect(moved).toEqual([]);
    expect(numbersOnScreen()).toEqual(['010']);
  });

  itDom('shows a parent estimate cell as read-only and a leaf as editable', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');
    unfoldRole('Dev');

    // A parent's figures are sums of what is below it. Typing into them would be
    // either ignored or double-counted, and neither is visible to whoever typed.
    expect(screen.getByLabelText('Dev optimistic for 010')).toHaveProperty('readOnly', true);
    expect(screen.getByLabelText('Dev optimistic for 010.1')).toHaveProperty('readOnly', false);
  });

  itDom('locks a frozen row and offers to unfreeze it', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');

    click('Freeze numbering');

    await waitFor(() => {
      expect(screen.getByLabelText('Number is frozen')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: 'Unfreeze' })).toBeDefined();
  });
});

describe('duplicating a branch', () => {
  /** A one-row project, already loaded, so the button has something to copy. */
  async function shownRow(api: ProjectApi): Promise<void> {
    await api.create('p1', { parentId: null, afterId: null, name: 'Strip' });
    render(<WbsTable projectId="p1" api={api} />);
    await screen.findByLabelText('Name of 010');
  }

  itDom('copies the branch and lands the caret in the copy’s name', async () => {
    const api = fakeApi();
    await api.create('p1', { parentId: null, afterId: null, name: 'Strip' });
    await api.create('p1', { parentId: api.rows[0]?.id ?? null, afterId: null, name: 'Sockets' });
    render(<WbsTable projectId="p1" api={api} />);
    await screen.findByLabelText('Name of 010');

    click('Duplicate 010');

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020', '020.1']);
    });
    expect(screen.getByLabelText('Name of 020')).toHaveProperty('value', 'Strip (copy)');
    expect(screen.getByLabelText('Name of 020.1')).toHaveProperty('value', 'Sockets');
    // Proof: with the `focusNext` write removed from `duplicateRow`, this
    // failed with the focus left on the Duplicate button. Watched 2026-08-07.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Name of 020'));
    });
  });

  itDom('offers Duplicate on a frozen row, which cannot be moved', async () => {
    // Freezing stops a row moving, not a row being copied — the copy gets no
    // frozen number of its own, so nothing that left the tool is duplicated.
    const api = fakeApi();
    await shownRow(api);

    click('Freeze numbering');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unfreeze' })).toBeDefined();
    });

    click('Duplicate 010');

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
  });

  itDom('says why a duplication was refused, and copies nothing', async () => {
    const api = fakeApi();
    await shownRow({
      ...api,
      duplicate: () => Promise.reject(new Error('too_large')),
    });

    click('Duplicate 010');

    await waitFor(() => {
      expect(toastTexts()).toContain('too_large');
    });
    expect(numbersOnScreen()).toEqual(['010']);
  });
});

describe('live edits from other people', () => {
  itDom('focuses a newly created row so the next keystroke lands in it', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    const first = await screen.findByLabelText('Name of 010');
    pressEnter('010');

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Name of 020'));
    });
    expect(document.activeElement).not.toBe(first);
  });

  itDom('refetches when the subscription reports a change', async () => {
    const api = fakeApi();
    // Throws rather than doing nothing: if the component never subscribes, this
    // test should fail loudly instead of quietly asserting a tree that never
    // needed refreshing.
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    let unsubscribed = false;
    const seen: number[] = [];
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return {
        seen: (seq: number) => seen.push(seq),
        unsubscribe: () => {
          unsubscribed = true;
        },
      };
    };

    const view = render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(1);
    });

    // Somebody else's edit, arriving through the socket rather than this client.
    await api.create('p1', { parentId: null, afterId: null, name: 'Theirs' });
    notify();

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010']);
    });

    // The stream resumes from what the table read, so every read must report
    // where it landed — otherwise the next reconnect asks for a range that
    // starts before the rows already on screen.
    expect(seen.at(-1)).toBe(api.rows.length - 1);

    view.unmount();
    expect(unsubscribed).toBe(true);
  });

  itDom('says so while the connection is down', async () => {
    // A table that looks identical whether or not it is live is the failure this
    // is here to remove: other people's edits stop arriving silently.
    const api = fakeApi();
    let report: (connected: boolean) => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      report = handlers.onConnectionChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };

    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    await waitFor(() => {
      expect(screen.getAllByRole('row')).toHaveLength(1);
    });
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      report(false);
    });
    expect(screen.getByRole('status').textContent).toContain('Reconnecting');

    act(() => {
      report(true);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('collapsing a branch', () => {
  itDom('hides the children of a collapsed parent and brings them back', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });
    unfoldRole('Dev');

    click('Collapse 010');

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010']);
    });
    // The parent is still there and still shows its rolled-up figures; only the
    // work beneath it is folded away.
    expect(screen.getByLabelText('Dev optimistic for 010')).toBeDefined();

    click('Expand 010');

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });
  });

  itDom('offers no expander on a leaf', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);

    click('Add work item');
    await screen.findByLabelText('Name of 010');

    expect(screen.queryByLabelText('Collapse 010')).toBeNull();
    expect(screen.queryByLabelText('Expand 010')).toBeNull();
  });
});

describe('teams and assignees', () => {
  async function oneRow() {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    // Both phases, since assigning and the every-phase assumption span them.
    unfoldRole('Dev');
    unfoldRole('QA');
    return api;
  }

  /** The entries a creatable picker is offering, scoped to its own listbox. */
  const offeredIn = (label: string) => {
    const list = screen
      .queryAllByRole('listbox')
      .find((box) => box.getAttribute('aria-label') === label);
    return list === undefined
      ? []
      : [...list.querySelectorAll('[role="option"]')].map((o) => o.textContent);
  };

  itDom('adds a team by typing a name the list does not have', async () => {
    const api = await oneRow();
    const label = 'Service or team for 010';

    const picker = screen.getByLabelText(label);
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Platform' } });
    expect(offeredIn(label)).toEqual(['Add “Platform”']);
    fireEvent.keyDown(picker, { key: 'Enter' });

    await waitFor(() => {
      expect(api.rows[0]?.serviceTeamId).toBe('team1');
    });
  });

  itDom('offers an existing team rather than adding a second one', async () => {
    const api = await oneRow();
    await api.addTeam('Platform');
    // Added behind the component's back, so a refresh has to bring it in —
    // adding a row is the cheapest one to trigger.
    click('Add work item');
    await screen.findByLabelText('Name of 020');
    const label = 'Service or team for 010';

    const picker = screen.getByLabelText(label);
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'plat' } });

    // A partial match offers the team *and* the chance to add a team actually
    // called `plat` — both are things somebody might mean.
    expect(offeredIn(label)).toEqual(['Platform', 'Add “plat”']);

    // The exact name offers no "Add": that is how a list grows a second
    // `Platform`, and be-01 is idempotent by name because it will be tried
    // from two browsers at once anyway.
    fireEvent.change(picker, { target: { value: 'Platform' } });
    expect(offeredIn(label)).toEqual(['Platform']);
  });

  itDom('assigns a person who is in no team as a free agent', async () => {
    const api = await oneRow();
    const label = 'Dev assignee for 010';

    const picker = screen.getByLabelText(label);
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Ada' } });
    fireEvent.keyDown(picker, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(label).value).toBe('Ada');
    });
    const people = await api.listPeople();
    expect(people).toEqual([{ id: 'person1', name: 'Ada', teamIds: [] }]);
  });

  itDom('joins a new person to the work item’s team', async () => {
    const api = await oneRow();
    const team = await api.addTeam('Billing');
    await api.patch('w1', { serviceTeamId: team.id });
    // The tree has to come back carrying the team before the assignee picker
    // can act on it.
    const teamPicker = screen.getByLabelText('Service or team for 010');
    fireEvent.focus(teamPicker);
    fireEvent.change(teamPicker, { target: { value: 'Billing' } });
    fireEvent.keyDown(teamPicker, { key: 'Enter' });
    await waitFor(() => {
      expect(api.rows[0]?.serviceTeamId).toBe(team.id);
    });

    const picker = screen.getByLabelText('Dev assignee for 010');
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Grace' } });
    fireEvent.keyDown(picker, { key: 'Enter' });

    await waitFor(async () => {
      expect(await api.listPeople()).toContainEqual({
        id: 'person1',
        name: 'Grace',
        teamIds: [team.id],
      });
    });
  });

  itDom('says the single assignee is doing the other phase too', async () => {
    await oneRow();

    const picker = screen.getByLabelText('Dev assignee for 010');
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: 'Ada' } });
    fireEvent.keyDown(picker, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Dev assignee for 010').value).toBe('Ada');
    });
    // The QA cell is empty and says who is assumed to be covering it — which
    // is a reading of one assignment, not a second one written down.
    expect(rowFor('010').querySelector('[data-assumed]')?.textContent).toContain('Ada');
  });
});

describe('the plan on a calendar', () => {
  async function oneRow() {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    return api;
  }

  itDom('shows day offsets until the project has a start date', async () => {
    await oneRow();

    expect(rowFor('010').querySelector('[data-start]')?.textContent).toBe('0');
  });

  itDom('shows dates once the project starts on a day', async () => {
    const api = await oneRow();

    fireEvent.change(screen.getByLabelText('Project start date'), {
      target: { value: '2026-08-06' },
    });

    await waitFor(() => {
      expect(rowFor('010').querySelector('[data-start]')?.textContent).toBe('2026-08-06');
    });
    expect(api.rows.length).toBe(1);
  });

  itDom('will not take an earliest start while the plan has no start date', async () => {
    // Without a project start date there is no day zero, so be-01 ignores the
    // constraint entirely. A date that saves and does nothing is worse than a
    // field that will not take one — this shipped and was found on dev.
    await oneRow();

    const cell = screen.getByLabelText<HTMLInputElement>('Earliest start for 010');

    expect(cell.disabled).toBe(true);
    expect(cell.title).toContain('project start date');
    // And the columns say which of the two they are showing.
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent.trim())).toContain(
      'Starts (day)',
    );
  });

  itDom('takes one once the plan is on a calendar, and drops the "(day)" label', async () => {
    await oneRow();

    fireEvent.change(screen.getByLabelText('Project start date'), {
      target: { value: '2026-08-06' },
    });

    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Earliest start for 010').disabled).toBe(
        false,
      );
    });
    // Scoped to the column headers: the toolbar has a "Starts" label of its own.
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent.trim());
    expect(headers).toContain('Starts');
    expect(headers).not.toContain('Starts (day)');
  });

  itDom('sends a work item’s earliest start, and clears it again', async () => {
    const api = await oneRow();
    // The field only takes a date once the plan is on a calendar.
    fireEvent.change(screen.getByLabelText('Project start date'), {
      target: { value: '2026-08-06' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Earliest start for 010').disabled).toBe(
        false,
      );
    });
    const patched: unknown[] = [];
    const realPatch = api.patch.bind(api);
    api.patch = (id: string, patch: Record<string, unknown>) => {
      patched.push(patch);
      return realPatch(id, patch);
    };

    const cell = screen.getByLabelText('Earliest start for 010');
    fireEvent.change(cell, { target: { value: '2026-08-12' } });
    await waitFor(() => {
      expect(patched).toEqual([{ startNoEarlierThan: '2026-08-12' }]);
    });

    // Cleared reads as '' from a date input, and means "no constraint" rather
    // than "an empty date".
    fireEvent.change(screen.getByLabelText('Earliest start for 010'), { target: { value: '' } });

    await waitFor(() => {
      expect(patched).toEqual([{ startNoEarlierThan: '2026-08-12' }, { startNoEarlierThan: null }]);
    });
  });
});

describe('names wrap and notes carry markdown', () => {
  /** The wrapper the hover lives on — the cell's own parent. */
  const notesCellOf = (number: string): HTMLElement => {
    const found = screen.getByLabelText(`Notes for ${number}`).parentElement;
    if (found === null) throw new Error(`notes cell for ${number} has no wrapper`);
    return found;
  };

  async function oneRowWithNotes(notes: string) {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    const cell = screen.getByLabelText('Notes for 010');
    fireEvent.change(cell, { target: { value: notes } });
    fireEvent.blur(cell);
    await waitFor(() => {
      expect(api.rows[0]?.notes).toBe(notes);
    });
    return api;
  }

  /**
   * jsdom does no layout, so `scrollHeight` is 0 for everything. Faking it is
   * what makes the auto-sizing testable at all: the component reads it, and
   * this is the only place its value can come from here.
   */
  const withScrollHeight = (node: HTMLElement, height: number) => {
    Object.defineProperty(node, 'scrollHeight', { value: height, configurable: true });
  };

  itDom('grows the name box to fit a long name, focus or no focus', async () => {
    // Dany, 2026-08-06: the name "must wrap instead of cutting text". A
    // one-row textarea wraps and then hides everything past the first line,
    // which is the same crop with extra steps.
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

    withScrollHeight(name, 60);
    fireEvent.change(name, { target: { value: 'a name long enough to need three lines' } });
    // `name.blur()`, not `fireEvent.blur`: the latter dispatches the event
    // without moving `document.activeElement`, so the component would still
    // read the cell as focused and this test would prove nothing.
    name.blur();

    // Sized from its own content while nobody is in it — the whole point.
    expect(name.style.height).toBe('60px');
    expect(document.activeElement).not.toBe(name);
  });

  itDom('caps how tall a name box gets at rest, and lifts the cap to write in', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    const name = await screen.findByLabelText<HTMLTextAreaElement>('Name of 010');

    withScrollHeight(name, 400);
    name.blur();
    const restCap = name.style.maxHeight;
    name.focus();

    // At rest the table stays readable; in the cell, an essay is writable.
    expect(restCap).toBe('5.6em');
    expect(name.style.maxHeight).toBe('none');
    expect(name.style.overflowY).toBe('auto');
  });

  itDom('gives the name a box that wraps rather than one that scrolls', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    await screen.findByLabelText('Name of 010').catch(() => undefined);
    click('Add work item');

    const name = await screen.findByLabelText('Name of 010');

    // A textarea is the wrapping half of this; an input scrolls a long name
    // out of sight one character at a time.
    expect(name.tagName).toBe('TEXTAREA');
  });

  itDom('grows the notes box while it is being written in, and shrinks after', async () => {
    await oneRowWithNotes('one');
    const cell = screen.getByLabelText<HTMLTextAreaElement>('Notes for 010');

    expect(cell.rows).toBe(1);
    fireEvent.focus(cell);
    expect(cell.rows).toBeGreaterThan(1);
    fireEvent.blur(cell);
    expect(cell.rows).toBe(1);
  });

  itDom('renders the markdown on hover, and nothing when there is no note', async () => {
    await oneRowWithNotes('## Risks\n\n- the fuse box is *old*');

    fireEvent.mouseEnter(notesCellOf('010'));

    const preview = await screen.findByRole('tooltip');
    // Rendered, not printed: a heading is an element and the emphasis is one
    // too, which is the whole difference between this and the cell beneath it.
    expect(preview.querySelector('h2')?.textContent).toBe('Risks');
    expect(preview.querySelector('li em')?.textContent).toBe('old');
  });

  itDom('renders a script in a note as the text somebody typed', async () => {
    // Notes are written by one person and read by everyone else on the
    // project. react-markdown is used without rehype-raw precisely so this
    // cannot become markup — watched here rather than asserted in a comment.
    await oneRowWithNotes('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');

    fireEvent.mouseEnter(notesCellOf('010'));

    const preview = await screen.findByRole('tooltip');
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.textContent).toContain('alert(1)');
  });

  itDom('shows no popover over a row with no notes', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');

    fireEvent.mouseEnter(notesCellOf('010'));

    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('role columns fold away', () => {
  async function oneRow() {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    return api;
  }

  const headerTexts = () => screen.getAllByRole('columnheader').map((th) => th.textContent.trim());

  itDom('starts folded: one column per role, the final figure kept', async () => {
    await oneRow();

    // The whole point of the fold: two roles cost ten columns and the dates
    // fell off the screen. The figure a plan is read by stays.
    expect(screen.queryByLabelText('Dev optimistic for 010')).toBeNull();
    expect(screen.queryByLabelText('Dev assignee for 010')).toBeNull();
    expect(rowFor('010').querySelector('[data-final="role-dev"]')).not.toBeNull();
    expect(headerTexts()).toContain('Dev ▸');
  });

  itDom('unfolds to the trio and the assignee, and folds back', async () => {
    await oneRow();

    unfoldRole('Dev');

    expect(screen.getByLabelText('Dev optimistic for 010')).toBeDefined();
    expect(screen.getByLabelText('Dev assignee for 010')).toBeDefined();
    // The other role stays folded — each opens on its own.
    expect(screen.queryByLabelText('QA optimistic for 010')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));

    expect(screen.queryByLabelText('Dev optimistic for 010')).toBeNull();
  });

  itDom('keeps a typed estimate draft across a fold and back', async () => {
    // Drafts live in the table's state, not in the inputs, precisely so a
    // fold cannot swallow one.
    const api = await oneRow();
    const sent: unknown[] = [];
    api.setEstimate = (...args: unknown[]) => {
      sent.push(args);
      return Promise.resolve();
    };
    unfoldRole('Dev');
    const cell = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    fireEvent.change(cell, { target: { value: '5' } });
    fireEvent.blur(cell);

    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));
    unfoldRole('Dev');

    expect(screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010').value).toBe('5');
    expect(sent).toEqual([]);
  });

  itDom('a folded role cannot hide a complaint', async () => {
    await oneRow();
    unfoldRole('Dev');
    const cell = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    fireEvent.change(cell, { target: { value: '5' } });
    fireEvent.blur(cell);

    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));

    // One point of a trio saves nothing; folded, that fact must still show on
    // the figure the fold leaves behind.
    const final = rowFor('010').querySelector('[data-final="role-dev"]');
    expect(final?.textContent).toContain('!');
    expect(final?.getAttribute('title')).toContain('not saved');
  });
});

describe('one cell for the whole trio', () => {
  /** The folded role's cell: shows the final figure, takes `o/r/p`. */
  const combinedCell = (number: string, role = 'Dev') =>
    screen.getByLabelText<HTMLInputElement>(`${role} estimate for ${number}`);

  /** Types shorthand into the folded cell and leaves it, the way a person does. */
  const typeCombined = (number: string, value: string) => {
    const cell = combinedCell(number);
    fireEvent.change(cell, { target: { value } });
    fireEvent.blur(cell);
    return cell;
  };

  /** Records every estimate written, and still performs it. */
  const watchWrites = (api: ProjectApi): unknown[][] => {
    const written: unknown[][] = [];
    const perform = api.setEstimate.bind(api);
    api.setEstimate = (id: string, roleId: string, days: Days) => {
      written.push([id, roleId, days]);
      return perform(id, roleId, days);
    };
    return written;
  };

  /** One row, roles left folded — which is where a person starts. */
  async function oneRow() {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    return api;
  }

  itDom('sends one estimate for the trio typed into the folded cell', async () => {
    // The dominant loop of an estimating session: no unfolding, one cell, one
    // request. Three separate writes would each be a broadcast and a refetch
    // for everybody else, and the two in the middle would be trios nobody
    // meant to save.
    const api = await oneRow();
    const written = watchWrites(api);

    typeCombined('010', '2/3/8');

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 2,
        realistic: 3,
        pessimistic: 8,
      });
    });
    expect(written).toEqual([['w1', 'role-dev', { optimistic: 2, realistic: 3, pessimistic: 8 }]]);
  });

  itDom('goes back to showing be-01’s final figure once the trio lands', async () => {
    // The honest shape of this cell: a computed figure at rest, shorthand
    // while it is being typed into. `2/3/10` is PERT 4, which is not any of
    // the three numbers typed.
    await oneRow();

    typeCombined('010', '2/3/10');

    await waitFor(() => {
      expect(combinedCell('010').value).toBe('4');
    });
  });

  itDom('takes one number as the estimator saying all three are the same', async () => {
    const api = await oneRow();
    const written = watchWrites(api);

    typeCombined('010', '5');

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 5,
        realistic: 5,
        pessimistic: 5,
      });
    });
    expect(written).toHaveLength(1);
  });

  itDom('takes the spaces and the decimals a person types', async () => {
    const api = await oneRow();

    typeCombined('010', ' 0.5 / 1 / 2 ');

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 0.5,
        realistic: 1,
        pessimistic: 2,
      });
    });
  });

  itDom('sends nothing for a trio that runs backwards, and says why', async () => {
    // Out of order is a complaint, not a sort. `8/3/2` is either a typo or a
    // person thinking in the other direction, and guessing which is how the
    // old table came to save numbers nobody typed.
    const api = await oneRow();
    const written = watchWrites(api);

    const cell = typeCombined('010', '8/3/2');

    expect(written).toEqual([]);
    expect(api.rows[0]?.estimates['role-dev']).toBeUndefined();
    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(cell.title).toContain('optimistic');
    // What was typed stays typed. Clearing it would take the correction away
    // from the only person who can make it.
    expect(cell.value).toBe('8/3/2');
  });

  itDom('sends nothing for two numbers where three were needed', async () => {
    // `2/3` is a half-typed trio, exactly like two filled boxes and one empty
    // one, and it saves nothing for the same reason: be-01 stores a trio or
    // nothing.
    const api = await oneRow();
    const written = watchWrites(api);

    const cell = typeCombined('010', '2/3');

    expect(written).toEqual([]);
    expect(api.rows[0]?.estimates['role-dev']).toBeUndefined();
    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(cell.value).toBe('2/3');
  });

  itDom('keeps a refused entry through somebody else’s refetch', async () => {
    // Drafts live in the table's state rather than in the input, so the refetch
    // every edit triggers cannot swallow a correction half made.
    const api = await oneRow();
    typeCombined('010', '1/2/3/4');

    click('Add work item');
    await screen.findByLabelText('Name of 020');

    const cell = combinedCell('010');
    expect(cell.value).toBe('1/2/3/4');
    expect(cell).toHaveAttribute('aria-invalid', 'true');
    expect(api.rows[0]?.estimates['role-dev']).toBeUndefined();
  });

  itDom('clears the stored trio when the cell is emptied', async () => {
    const api = await oneRow();
    typeCombined('010', '2/3/10');
    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toBeDefined();
    });
    const cleared: [string, string][] = [];
    const perform = api.clearEstimate.bind(api);
    api.clearEstimate = (id: string, roleId: string) => {
      cleared.push([id, roleId]);
      return perform(id, roleId);
    };

    typeCombined('010', '');

    await waitFor(() => {
      expect(cleared).toEqual([['w1', 'role-dev']]);
    });
    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toBeUndefined();
    });
    expect(combinedCell('010').value).toBe('');
    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'false');
  });

  itDom('asks for nothing when a cell with no estimate is emptied', async () => {
    // Tabbing through an unestimated plan must not post a deletion per role
    // per row. A space is what a person leaves behind after select-all.
    const api = await oneRow();
    const cleared: unknown[] = [];
    api.clearEstimate = (...args: unknown[]) => {
      cleared.push(args);
      return Promise.resolve();
    };
    const written = watchWrites(api);

    typeCombined('010', ' ');

    expect(cleared).toEqual([]);
    expect(written).toEqual([]);
  });

  itDom('gives way to the three boxes when the role is unfolded', async () => {
    // Two editors for one trio side by side is two places to disagree. The
    // combined cell is the folded role's; unfolded, the boxes are.
    await oneRow();
    expect(combinedCell('010')).toBeDefined();

    unfoldRole('Dev');

    expect(screen.queryByLabelText('Dev estimate for 010')).toBeNull();
    expect(screen.getByLabelText('Dev optimistic for 010')).toBeDefined();
  });

  itDom('leaves a parent’s rolled-up figure to be read, not typed into', async () => {
    const api = await oneRow();
    pressEnter('010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });
    pressTab('020');
    await screen.findByLabelText('Name of 010.1');

    typeCombined('010.1', '2/3/10');
    await waitFor(() => {
      expect(api.rows.find((r) => r.id === 'w2')?.estimates['role-dev']).toBeDefined();
    });

    // The parent sums what is below it; there is nothing there to type. Its
    // figure is still shown — read-only text where the leaf has a box.
    expect(screen.queryByLabelText('Dev estimate for 010')).toBeNull();
    expect(rowFor('010').querySelector('[data-final="role-dev"]')).not.toBeNull();
    await waitFor(() => {
      expect(combinedCell('010.1').value).toBe('4');
    });
  });

  itDom('is a cell of the keyboard grid, so a column can be typed down', async () => {
    // The whole point of the shorthand is typing estimates for many rows fast,
    // and that is Down, type, Down, type.
    const api = await oneRow();
    click('Add work item');
    await screen.findByLabelText('Name of 020');

    const first = combinedCell('010');
    first.focus();
    first.setSelectionRange(0, 0);
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(combinedCell('020'));
    fireEvent.change(combinedCell('020'), { target: { value: '1/1/1' } });
    fireEvent.blur(combinedCell('020'));
    await waitFor(() => {
      expect(api.rows[1]?.estimates['role-dev']).toEqual({
        optimistic: 1,
        realistic: 1,
        pessimistic: 1,
      });
    });
  });

  itDom('lets a folded entry replace what the boxes were holding', async () => {
    // One row and role has one pending draft, whichever way it was typed. The
    // alternative is two half-typed estimates of one trio and a rule about
    // which of them is real — and this is the case where it shows, because a
    // refused entry is the one that stays.
    const api = await oneRow();
    const written = watchWrites(api);
    unfoldRole('Dev');
    const box = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    fireEvent.change(box, { target: { value: '7' } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));

    typeCombined('010', '8/3/2');

    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'true');
    // The `7` was a draft of this same trio, and the trio has since been typed
    // again — differently, and last. It is not still waiting in a box.
    unfoldRole('Dev');
    const after = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    expect(after.value).toBe('');
    expect(after).toHaveAttribute('aria-invalid', 'false');
    expect(written).toEqual([]);
  });

  itDom('lets a box replace what the folded cell was holding', async () => {
    // The same rule the other way round: the boxes were typed last, so the
    // refused shorthand is gone and the complaint on the folded figure is the
    // boxes' own.
    const api = await oneRow();
    const written = watchWrites(api);
    typeCombined('010', '8/3/2');

    unfoldRole('Dev');
    const box = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    fireEvent.change(box, { target: { value: '1' } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));

    expect(combinedCell('010').value).toBe('');
    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'true');
    expect(combinedCell('010').title).toContain('not saved');
    expect(written).toEqual([]);
  });

  itDom('lets a box win back over a refused folded entry', async () => {
    const api = await oneRow();
    typeCombined('010', '8/3/2');
    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'true');

    unfoldRole('Dev');
    for (const [point, value] of [
      ['optimistic', '1'],
      ['realistic', '2'],
      ['pessimistic', '3'],
    ] as const) {
      const box = screen.getByLabelText<HTMLInputElement>(`Dev ${point} for 010`);
      fireEvent.change(box, { target: { value } });
      fireEvent.blur(box);
    }

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 1,
        realistic: 2,
        pessimistic: 3,
      });
    });
    // Folded again, the cell shows the figure be-01 computed — not the `8/3/2`
    // that was refused before the boxes said something else.
    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));
    expect(combinedCell('010').value).toBe('2');
    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'false');
  });

  itDom('marks the folded cell when the boxes hold a trio that saves nothing', async () => {
    // The `!` marker `role-columns-fold` put on the figure now has an input
    // under it, and the complaint has to reach both.
    await oneRow();
    unfoldRole('Dev');
    const box = screen.getByLabelText<HTMLInputElement>('Dev optimistic for 010');
    fireEvent.change(box, { target: { value: '5' } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Fold Dev estimates' }));

    expect(combinedCell('010')).toHaveAttribute('aria-invalid', 'true');
    expect(combinedCell('010').title).toContain('not saved');
    expect(rowFor('010').querySelector('[data-final="role-dev"]')?.textContent).toContain('!');
  });
});

describe('estimates are never edited for you', () => {
  /** Types `value` into one estimate box and leaves it, the way a person does. */
  const typeEstimate = (number: string, point: string, value: string) => {
    const cell = screen.getByLabelText<HTMLInputElement>(`Dev ${point} for ${number}`);
    fireEvent.change(cell, { target: { value } });
    fireEvent.blur(cell);
    return cell;
  };

  const estimateCell = (number: string, point: string) =>
    screen.getByLabelText<HTMLInputElement>(`Dev ${point} for ${number}`);

  async function oneRow() {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    unfoldRole('Dev');
    return api;
  }

  itDom('sends nothing, and keeps what was typed, until the trio is complete', async () => {
    const api = await oneRow();
    const sent: unknown[] = [];
    api.setEstimate = (...args: unknown[]) => {
      sent.push(args);
      return Promise.resolve();
    };

    typeEstimate('010', 'optimistic', '5');

    // The old table turned this into 5/5/5 and sent it — three numbers from
    // one keystroke, two of which nobody typed.
    expect(sent).toEqual([]);
    expect(estimateCell('010', 'optimistic').value).toBe('5');
    expect(estimateCell('010', 'realistic').value).toBe('');
  });

  itDom('marks the boxes that are still empty rather than filling them', async () => {
    await oneRow();

    typeEstimate('010', 'optimistic', '5');

    expect(estimateCell('010', 'realistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'pessimistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'realistic').title).toContain('not saved');
    // The box holding a real number is not the mistake.
    expect(estimateCell('010', 'optimistic')).toHaveAttribute('aria-invalid', 'false');
  });

  itDom('marks both members of a pair that breaks the order, and sends nothing', async () => {
    const api = await oneRow();
    const sent: unknown[] = [];
    api.setEstimate = (...args: unknown[]) => {
      sent.push(args);
      return Promise.resolve();
    };

    typeEstimate('010', 'optimistic', '5');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');

    expect(sent).toEqual([]);
    expect(estimateCell('010', 'optimistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'realistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'pessimistic')).toHaveAttribute('aria-invalid', 'false');
    // And the numbers are exactly the ones typed — nothing was reordered.
    expect(estimateCell('010', 'optimistic').value).toBe('5');
    expect(estimateCell('010', 'realistic').value).toBe('3');
  });

  itDom('sends the trio, unaltered, once it reads sensibly', async () => {
    const api = await oneRow();

    typeEstimate('010', 'optimistic', '2');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 2,
        realistic: 3,
        pessimistic: 10,
      });
    });
    expect(estimateCell('010', 'optimistic')).toHaveAttribute('aria-invalid', 'false');
  });

  itDom('fixing the broken box sends the trio it was holding back', async () => {
    const api = await oneRow();
    typeEstimate('010', 'optimistic', '5');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');

    typeEstimate('010', 'realistic', '7');

    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toEqual({
        optimistic: 5,
        realistic: 7,
        pessimistic: 10,
      });
    });
  });

  /** Records every clear the table asks for, and still performs it. */
  const watchClears = (api: ProjectApi): [string, string][] => {
    const cleared: [string, string][] = [];
    const perform = api.clearEstimate.bind(api);
    api.clearEstimate = (id: string, roleId: string) => {
      cleared.push([id, roleId]);
      return perform(id, roleId);
    };
    return cleared;
  };

  /** Types a stored `2 / 3 / 10` for Dev on `010` and waits for be-01 to hold it. */
  async function estimated() {
    const api = await oneRow();
    typeEstimate('010', 'optimistic', '2');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');
    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toBeDefined();
    });
    return api;
  }

  itDom('clears the stored trio when all three boxes are emptied', async () => {
    // Until now a trio could be overwritten but never taken back off. Emptying
    // the three boxes is the only gesture that says "this row does not need
    // this role", and it used to save nothing at all.
    const api = await estimated();
    const cleared = watchClears(api);

    typeEstimate('010', 'optimistic', '');
    typeEstimate('010', 'realistic', '');
    typeEstimate('010', 'pessimistic', '');

    await waitFor(() => {
      expect(cleared).toEqual([['w1', 'role-dev']]);
    });
    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']).toBeUndefined();
    });
    // The drafts went with it, so the boxes read from the tree again rather
    // than from three empty strings the table is still holding.
    expect(estimateCell('010', 'optimistic').value).toBe('');
    expect(estimateCell('010', 'optimistic')).toHaveAttribute('aria-invalid', 'false');
  });

  itDom('does not clear when only two of the three boxes are emptied', async () => {
    // The half-emptied trio stays exactly what it was before: a complaint. A
    // clear here would be the tool deciding that two blanks mean "delete it",
    // which is the same class of assumption as repairing a trio.
    const api = await estimated();
    const cleared = watchClears(api);

    typeEstimate('010', 'optimistic', '');
    typeEstimate('010', 'realistic', '');

    expect(cleared).toEqual([]);
    expect(api.rows[0]?.estimates['role-dev']).toEqual({
      optimistic: 2,
      realistic: 3,
      pessimistic: 10,
    });
    expect(estimateCell('010', 'optimistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'realistic')).toHaveAttribute('aria-invalid', 'true');
    expect(estimateCell('010', 'realistic').title).toContain('not saved');
    expect(estimateCell('010', 'pessimistic').value).toBe('10');
  });

  itDom('asks for nothing when three empty boxes were already empty', async () => {
    // A row nobody estimated is the ordinary state. Tabbing through its boxes
    // must not post a deletion for every role on every row it passes.
    const api = await oneRow();
    const cleared = watchClears(api);

    typeEstimate('010', 'optimistic', '');
    typeEstimate('010', 'pessimistic', '');

    expect(cleared).toEqual([]);
  });

  itDom('shows the final figure be-01 computed, per role and in total', async () => {
    const api = await oneRow();

    typeEstimate('010', 'optimistic', '2');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');

    await waitFor(() => {
      expect(rowFor('010').querySelector('[data-final="role-dev"]')?.textContent).toBe('4');
    });
    expect(rowFor('010').querySelector('[data-final-total]')?.textContent).toBe('4');
    expect(api.rows[0]?.estimates['role-dev']?.realistic).toBe(3);
  });

  itDom('follows the project’s chosen method', async () => {
    await oneRow();
    typeEstimate('010', 'optimistic', '2');
    typeEstimate('010', 'realistic', '3');
    typeEstimate('010', 'pessimistic', '10');
    await waitFor(() => {
      expect(rowFor('010').querySelector('[data-final="role-dev"]')?.textContent).toBe('4');
    });

    fireEvent.change(screen.getByLabelText('Final estimate'), {
      target: { value: 'pessimistic' },
    });

    await waitFor(() => {
      expect(rowFor('010').querySelector('[data-final="role-dev"]')?.textContent).toBe('10');
    });
  });
});

/** The `<tr>` whose number cell reads `number`. */
const rowFor = (number: string): HTMLElement => {
  const found = screen
    .getAllByRole('row')
    .find((tr) => tr.querySelector('[data-number]')?.textContent === number);
  if (found === undefined) throw new Error(`no row numbered ${number}`);
  return found;
};

/** Pins a row's geometry so a drop can be aimed at a zone jsdom cannot lay out. */
const withHeight = (element: HTMLElement, top: number, height: number): HTMLElement => {
  element.getBoundingClientRect = () =>
    ({ top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
  return element;
};

/**
 * jsdom has no `DragEvent`, so `fireEvent.dragOver(el, {clientY})` degrades to a
 * plain `Event` and the coordinate is silently dropped — which made the first
 * version of these tests pass on a zone nobody aimed at. A `MouseEvent` named
 * `dragover` carries it, and React dispatches on the type either way.
 */
const dragEvent = (type: string, clientY: number) =>
  new MouseEvent(type, { bubbles: true, cancelable: true, clientY });

const dragOnto = (from: string, to: string, clientY: number) => {
  fireEvent.dragStart(screen.getByLabelText(`Reorder ${from}`));
  const target = rowFor(to);
  fireEvent(target, dragEvent('dragover', clientY));
  fireEvent(target, dragEvent('drop', clientY));
};

/** Three named root rows: `010 Strip`, `020 Sand`, `030 Paint`. */
async function threeRoots() {
  // Dev's columns take part in the keyboard grid below, so they are open.

  const api = fakeApi();
  render(<WbsTable projectId="p1" api={api} />);
  // Named, not left blank. Blank names made an ordering assertion compare three
  // empty strings against three empty strings, which passes for any order.
  for (const [number, name] of [
    ['010', 'Strip'],
    ['020', 'Sand'],
    ['030', 'Paint'],
  ]) {
    click('Add work item');
    await screen.findByLabelText(`Name of ${number}`);
    typeName(number, name);
    fireEvent.blur(screen.getByLabelText(`Name of ${number}`));
    await waitFor(() => {
      expect(screen.getByLabelText(`Name of ${number}`)).toHaveProperty('value', name);
    });
  }
  unfoldRole('Dev');
  return api;
}

const namesOnScreen = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((tr) => {
      const input = tr.querySelector('[data-name-input]');
      // Thrown rather than defaulted: a row without a name cell means the
      // markup changed, and an empty string here would quietly pass an
      // ordering assertion that is no longer looking at anything.
      if (!isCell(input)) throw new Error('a row has no name cell');
      return input.value;
    });

describe('dragging a row', () => {
  itDom('makes the dragged row a child of the row it is dropped into', async () => {
    await threeRoots();
    expect(numbersOnScreen()).toEqual(['010', '020', '030']);

    // The middle half of the row is "into". jsdom lays nothing out, so the
    // geometry is pinned; the arithmetic itself is `zoneFor`'s own test.
    withHeight(rowFor('010'), 0, 40);
    dragOnto('030', '010', 20);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
  });

  itDom('puts the row above the target when dropped on its top quarter', async () => {
    const api = await threeRoots();
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);

    withHeight(rowFor('010'), 0, 40);
    dragOnto('030', '010', 2);

    await waitFor(() => {
      expect(namesOnScreen()).toEqual(['Paint', 'Strip', 'Sand']);
    });
    // Moved, not copied: the same three rows, still at the root.
    expect(api.rows).toHaveLength(3);
    expect(numbersOnScreen()).toEqual(['010', '020', '030']);
  });

  itDom('refuses to drag a frozen row and says why', async () => {
    // This test used to fire a `drop` with no `dragstart` before it, so `dropOn`
    // returned on its null check and the frozen rule was never reached. Deleting
    // that rule left it passing. Both reviewers found it; it drags for real now.
    const api = await threeRoots();
    click('Freeze numbering');
    await waitFor(() => {
      expect(screen.getAllByLabelText('Number is frozen')).toHaveLength(3);
    });
    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };

    // The handle stays, and says why it will not help.
    const handle = screen.getByLabelText('Reorder 030');
    expect(handle.getAttribute('title')).toContain('unfreeze');
    expect(handle.getAttribute('aria-disabled')).toBe('true');

    withHeight(rowFor('010'), 0, 40);
    dragOnto('030', '010', 20);

    expect(moved).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('frozen');
  });

  itDom('refuses a drop inside the dragged row’s own subtree, with the reason', async () => {
    const api = await threeRoots();
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };

    withHeight(rowFor('010.1'), 0, 40);
    dragOnto('010', '010.1', 20);

    expect(moved).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('inside itself');
  });

  itDom('sends nothing when a row is dropped where it already is', async () => {
    const api = await threeRoots();
    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };

    // The bottom quarter of the row directly above it.
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 38);

    expect(moved).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('what a drag shows while it is happening', () => {
  itDom('marks the row and the zone the drop would land in', async () => {
    // The marker is not decoration: the drop uses the zone the last dragover
    // worked out, so what is drawn and what happens are the same decision.
    await threeRoots();
    withHeight(rowFor('010'), 0, 40);

    fireEvent.dragStart(screen.getByLabelText('Reorder 030'));
    fireEvent(rowFor('010'), dragEvent('dragover', 2));
    expect(rowFor('010').getAttribute('data-drop')).toBe('above');

    fireEvent(rowFor('010'), dragEvent('dragover', 20));
    expect(rowFor('010').getAttribute('data-drop')).toBe('into');

    fireEvent.dragLeave(rowFor('010'));
    expect(rowFor('010').getAttribute('data-drop')).toBeNull();
  });

  itDom('opens a collapsed branch it is dropped into', async () => {
    // A row dropped into a closed branch is a row nobody can see, which reads
    // as a move that did nothing.
    await threeRoots();
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });

    click('Collapse 010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });

    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2']);
    });
  });
});

describe('someone else editing while you are typing', () => {
  itDom('does not take the focus or the half-typed value', async () => {
    // Two reviewers found this and neither was looking for it. `onKeyDown`
    // reaches `flat` through `indent`/`outdent`, and `flat` is rebuilt by every
    // refresh — so `columns` was a new array on every socket event, `flexRender`
    // gave every cell a new component type, and React unmounted and remounted
    // the lot. The comment above the dependency list had been warning about
    // exactly this while the list itself caused it.
    const api = fakeApi();
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);

    click('Add work item');
    const input = await screen.findByLabelText('Name of 010');
    input.focus();
    fireEvent.change(input, { target: { value: 'Strip the old wir' } });
    expect(document.activeElement).toBe(input);

    // Somebody else's edit lands mid-word.
    await act(async () => {
      notify();
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 010'));
    expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'Strip the old wir');
  });

  itDom('survives their edit landing in the very field being typed in', async () => {
    // The test above only ever delivered an edit that left this row's name
    // alone, so it passed while `key={`${id}-${name}`}` was still on the input:
    // an unchanged name is an unchanged key. Changing the name is the case that
    // remounted the node and dropped the focus to the body, and it is the one
    // that happens whenever two people work on one row.
    // Proof: `key` restored on the name input in `wbs-table.tsx` and only this
    // test failed — `document.activeElement` was `<body>` and the value was the
    // peer's, not the half-typed one.
    const api = fakeApi();
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);

    click('Add work item');
    const input = await screen.findByLabelText('Name of 010');
    input.focus();
    fireEvent.change(input, { target: { value: 'Strip the old wir' } });

    // Their edit, to this row's name — the value this cell renders from.
    api.rows[0].name = 'Rewire the shed';
    await act(async () => {
      notify();
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Name of 010')).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input).toHaveProperty('value', 'Strip the old wir');
  });

  itDom('shows their edit in a cell nobody is typing in', async () => {
    // The other half of the rule, and the reason it is a separate test: a cell
    // that simply never accepted a new value would pass both tests above.
    // Proof: the `input.value = latest.current` assignment in `cell-input.tsx`
    // deleted, and only this test failed — the cell still read 'Strip'.
    const api = fakeApi();
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);

    click('Add work item');
    const input = await screen.findByLabelText('Name of 010');
    fireEvent.change(input, { target: { value: 'Strip' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(input).toHaveProperty('value', 'Strip');
    });

    api.rows[0].name = 'Rewire the shed';
    await act(async () => {
      notify();
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Name of 010')).toBe(input);
    expect(input).toHaveProperty('value', 'Rewire the shed');
  });

  itDom('sends nothing when a cell is left without being typed in', async () => {
    // Every blur used to be a PATCH of whatever the box held, so clicking
    // through a row wrote every cell it passed. Each of those writes is a
    // broadcast and a refetch for everyone else, and one of them is a revert: a
    // cell whose peer edit was held back while its owner was typing, then typed
    // back to what it said before, blurs holding the older of the two values.
    // Proof: `input.value !== shown.current` in `cell-input.tsx`'s `onBlur`
    // replaced with `true`, and only this test failed — one patch of a name
    // nobody typed.
    const api = fakeApi();
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);

    click('Add work item');
    const input = await screen.findByLabelText('Name of 010');
    fireEvent.change(input, { target: { value: 'Strip' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(api.rows[0].name).toBe('Strip');
    });

    const patched: unknown[] = [];
    api.patch = (...args: unknown[]) => {
      patched.push(args);
      return Promise.resolve();
    };

    // Their edit lands, then this client focuses the cell and leaves it again
    // without typing.
    api.rows[0].name = 'Rewire the shed';
    await act(async () => {
      notify();
      await Promise.resolve();
    });
    input.focus();
    fireEvent.blur(input);

    expect(patched).toEqual([]);
    expect(input).toHaveProperty('value', 'Rewire the shed');
  });
});

describe('a drag interrupted by someone else', () => {
  itDom('is cancelled rather than left holding a row nobody picked up', async () => {
    // The browser does not reliably fire `dragend` on a source node replaced
    // mid-gesture, so `dragging` could stay set forever — after which moving the
    // pointer over the table drew drop markers and a click moved a row nobody
    // had picked up. And planning against the newest tree turns "below 010" into
    // a different move than the one that was on screen at pickup.
    const api = await threeRoots();
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    // Re-render with a subscription so a peer edit can be delivered.
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    await waitFor(() => {
      expect(screen.getAllByLabelText(/^Reorder 0/)).toHaveLength(6);
    });

    const moved: unknown[] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };

    fireEvent.dragStart(screen.getAllByLabelText('Reorder 030')[1]);
    await act(async () => {
      notify();
      await Promise.resolve();
    });

    // The drop that follows belongs to a gesture that no longer exists.
    const target = withHeight(screen.getAllByRole('row').at(-1)!, 0, 40);
    fireEvent(target, dragEvent('dragover', 20));
    fireEvent(target, dragEvent('drop', 20));

    expect(moved).toEqual([]);
    // Said in a toast, and an `info` one: nobody's request was refused and
    // nothing was lost, so this is context that may take itself off again —
    // not a failure waiting to be dismissed.
    expect(toastTexts().at(-1)).toContain('changed while you were dragging');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('moving between cells with the arrow keys', () => {
  /** Focuses a cell and puts the caret where a test needs it. */
  const focusCell = (label: string, caret: 'start' | 'end' | 'middle'): HTMLInputElement => {
    const input = screen.getByLabelText(label);
    // Either element: the Name and Notes cells are textareas so their text
    // wraps, and both carry the selection fields the keyboard code reads.
    if (!isCell(input)) throw new Error(`${label} is not an editable cell`);
    input.focus();
    const at =
      caret === 'start'
        ? 0
        : caret === 'end'
          ? input.value.length
          : Math.floor(input.value.length / 2);
    input.setSelectionRange(at, at);
    return input;
  };

  /** Returns whether the browser would still act on the key. */
  const press = (input: HTMLInputElement, key: string): boolean =>
    fireEvent.keyDown(input, { key });

  itDom('moves down a column of estimates', async () => {
    const api = await threeRoots();
    expect(api.rows).toHaveLength(3);

    const first = focusCell('Dev optimistic for 010', 'end');
    press(first, 'ArrowDown');

    expect(document.activeElement).toBe(screen.getByLabelText('Dev optimistic for 020'));
  });

  itDom('stays put at the bottom of a column', async () => {
    await threeRoots();

    const last = focusCell('Dev optimistic for 030', 'end');
    press(last, 'ArrowDown');

    expect(document.activeElement).toBe(last);
  });

  itDom('moves along a row once the caret has run out', async () => {
    await threeRoots();

    const name = focusCell('Name of 010', 'end');
    press(name, 'ArrowRight');

    // The cell beside the name, which is every field the row has and not only
    // the ones that are typed into: the pickers and the date joined the grid
    // when Tab was made to reach them.
    expect(document.activeElement).toBe(screen.getByLabelText('Add a dependency to 010'));
  });

  itDom('leaves the caret alone in the middle of a word', async () => {
    // The rule that has to be right: hijacking this would make the table
    // unusable for the thing it is mainly used for. jsdom does not move a caret
    // for an arrow key, so "the browser still gets it" is asserted through
    // `defaultPrevented` rather than through where the caret ended up.
    await threeRoots();

    const name = focusCell('Name of 010', 'middle');
    const stillTheBrowsers = press(name, 'ArrowRight');

    expect(document.activeElement).toBe(name);
    expect(stillTheBrowsers).toBe(true);
  });

  itDom('takes the key only when it is moving the focus', async () => {
    await threeRoots();

    const first = focusCell('Dev optimistic for 010', 'end');
    expect(press(first, 'ArrowDown')).toBe(false);

    const last = focusCell('Dev optimistic for 030', 'end');
    expect(press(last, 'ArrowDown')).toBe(true);
  });

  itDom('does not stop on the derived number', async () => {
    await threeRoots();

    const name = focusCell('Name of 010', 'start');
    press(name, 'ArrowLeft');

    expect(document.activeElement).toBe(name);
  });

  itDom('skips the children of a collapsed branch', async () => {
    const api = await threeRoots();
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });

    click('Collapse 010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020']);
    });

    // `010.1` is off screen; Down has to land on the next row a person can see.
    const name = focusCell('Name of 010', 'end');
    press(name, 'ArrowDown');

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 020'));
    expect(api.rows).toHaveLength(3);
  });
});

describe('arrow keys — cross-review findings', () => {
  const focus = (label: string, at: 'start' | 'end') => {
    const input = screen.getByLabelText(label);
    // Either element: the Name and Notes cells are textareas so their text
    // wraps, and both carry the selection fields the keyboard code reads.
    if (!isCell(input)) throw new Error(`${label} is not an editable cell`);
    input.focus();
    const pos = at === 'start' ? 0 : input.value.length;
    input.setSelectionRange(pos, pos);
    return input;
  };

  const arrow = (key: string, init: Record<string, unknown> = {}) => {
    const active = document.activeElement;
    if (!isCell(active)) throw new Error('nothing focused');
    fireEvent.keyDown(active, { key, ...init });
    return document.activeElement;
  };

  itDom('arrives with a collapsed caret, not a selection', async () => {
    // agy, high. Arriving cells were selected, and a full selection reads as
    // `hasSelection` — the rule that keeps Shift+Arrow out of the grid — so the
    // next press in the same direction did nothing and crossing a row of
    // populated cells took twice the keys.
    //
    // jsdom does not move a caret for an arrow key, so what is asserted is the
    // caret this code puts there, on the edge the travel came from. Whether the
    // browser then walks it across the value is the browser's own behaviour.
    await threeRoots();
    const typed: readonly (readonly [string, string])[] = [
      ['Dev optimistic for 010', '3'],
      ['Dev realistic for 010', '5'],
    ];
    for (const [label, days] of typed) {
      const box = screen.getByLabelText(label);
      fireEvent.change(box, { target: { value: days } });
      fireEvent.blur(box);
    }
    await waitFor(() => {
      expect(screen.getByLabelText('Dev realistic for 010')).toHaveProperty('value', '5');
    });

    // Between two populated boxes, which is where a caret dropped on the wrong
    // edge is felt: crossing a row of them is what took twice the keys.
    focus('Dev optimistic for 010', 'end');
    const arrived = arrow('ArrowRight');

    expect(arrived).toBe(screen.getByLabelText('Dev realistic for 010'));
    if (!isCell(arrived)) throw new Error('not an editable cell');
    expect(arrived.value).toBe('5');
    expect([arrived.selectionStart, arrived.selectionEnd]).toEqual([0, 0]);

    // And coming back the other way lands on the far edge, for the same reason.
    const back = arrow('ArrowLeft');
    if (!isCell(back)) throw new Error('not an editable cell');
    expect(back).toBe(screen.getByLabelText('Dev optimistic for 010'));
    expect([back.selectionStart, back.selectionEnd]).toEqual([
      back.value.length,
      back.value.length,
    ]);
  });

  itDom('leaves an IME composition to the input', async () => {
    // codex, high. Up and Down pick a candidate while composing; taking them
    // moves the focus out of a half-written word and commits it.
    await threeRoots();
    focus('Name of 010', 'end');

    expect(arrow('ArrowDown', { isComposing: true })).toBe(screen.getByLabelText('Name of 010'));
  });

  itDom('leaves a modified arrow to the browser', async () => {
    // Ctrl and Meta only. Alt is the grid's own now — it moves the row rather
    // than the focus, which is `moving rows with alt and the arrows` below.
    await threeRoots();

    for (const modifier of ['ctrlKey', 'metaKey']) {
      focus('Name of 010', 'end');
      expect(arrow('ArrowDown', { [modifier]: true })).toBe(screen.getByLabelText('Name of 010'));
    }
  });

  itDom('never stops on a parent’s rolled-up figures', async () => {
    // Both reviewers. A parent's estimates are sums and read-only; landing there
    // is the same dead keypress the derived number column was excluded for.
    const api = await threeRoots();
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
    expect(api.rows.find((r) => r.number === '010')?.rolledUp).toBe(true);

    // Up the column from the child, where the parent's box is the row directly
    // above: it is a sum, so there is nothing above this one to type into and
    // the focus stays where it is.
    //
    // Proof: `:not([readonly])` stripped from `editableGrid`'s selector, this
    // failed with the focus on `Dev optimistic for 010` — the parent's own
    // rolled-up box. Watched, 2026-08-07. The row-wise half of this claim is
    // `Shift+Tab steps over a parent’s read-only estimate boxes`: an arrow
    // cannot reach the trio from the right, because the assignee picker
    // between them is a cell Tab leaves and the arrows do not.
    focus('Dev optimistic for 010.1', 'start');
    expect(arrow('ArrowUp')).toBe(screen.getByLabelText('Dev optimistic for 010.1'));

    // And down the column from the child, past the row below it.
    focus('Dev optimistic for 010.1', 'end');
    expect(arrow('ArrowDown')).toBe(screen.getByLabelText('Dev optimistic for 020'));
  });

  itDom('navigates from every editable cell, not just the ones the first tests used', async () => {
    // codex, medium. The original tests moved from the name and from Dev
    // optimistic only, so removing the handler from notes — or from realistic
    // and pessimistic — left them green.
    await threeRoots();
    const columns = [
      'Name of 010',
      'Dev optimistic for 010',
      'Dev realistic for 010',
      'Dev pessimistic for 010',
      'Notes for 010',
    ];

    for (const label of columns) {
      focus(label, 'end');
      expect(arrow('ArrowDown')).toBe(screen.getByLabelText(label.replace('010', '020')));
    }
  });
});

describe('Tab moves between the fields, from every cell', () => {
  /** Focuses a cell and puts the caret where a test needs it. */
  const focusCaret = (
    label: string,
    at: 'start' | 'middle' | 'end',
  ): HTMLInputElement | HTMLTextAreaElement => {
    const input = screen.getByLabelText(label);
    // Either element: the Name and Notes cells are textareas so their text
    // wraps, and both carry the selection fields the keyboard code reads.
    if (!isCell(input)) throw new Error(`${label} is not an editable cell`);
    input.focus();
    const pos =
      at === 'start' ? 0 : at === 'end' ? input.value.length : Math.floor(input.value.length / 2);
    input.setSelectionRange(pos, pos);
    return input;
  };

  /** Presses Tab where the focus is, and says whether the browser still gets the key. */
  const tab = (shiftKey = false): boolean => {
    const active = document.activeElement;
    if (!isCell(active)) throw new Error('nothing focused');
    return fireEvent.keyDown(active, { key: 'Tab', shiftKey });
  };

  /** Each label paired with the one after it, so a walk reads as its own steps. */
  const stepsThrough = (labels: readonly string[]): (readonly [string, string])[] => {
    const steps: (readonly [string, string])[] = [];
    let previous: string | undefined;
    for (const label of labels) {
      if (previous !== undefined) steps.push([previous, label] as const);
      previous = label;
    }
    return steps;
  };

  itDom('Tab moves from an estimate cell to the next editable cell', async () => {
    await threeRoots();

    focusCaret('Dev optimistic for 010', 'end');
    expect(tab()).toBe(false);

    expect(document.activeElement).toBe(screen.getByLabelText('Dev realistic for 010'));
  });

  itDom('Tab in the middle of a name navigates; at caret 0 it still indents', async () => {
    await threeRoots();

    // Mid-text, Tab is what it is in any table: the next field, and the tree
    // is left alone.
    focusCaret('Name of 020', 'middle');
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Add a dependency to 020'));
    expect(numbersOnScreen()).toEqual(['010', '020', '030']);

    // At the very start it is still the outliner's indent, which is the one
    // special case this change keeps.
    focusCaret('Name of 020', 'start');
    tab();

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
  });

  itDom(
    'Tab from the depends input closes the picker, discards the typed search, and moves once',
    async () => {
      const api = await threeRoots();
      const added: unknown[] = [];
      const realAdd = api.addDependency.bind(api);
      api.addDependency = (id: string, predecessorId: string) => {
        added.push([id, predecessorId]);
        return realAdd(id, predecessorId);
      };

      const box = screen.getByLabelText<HTMLInputElement>('Add a dependency to 030');
      box.focus();
      fireEvent.change(box, { target: { value: 'Strip' } });
      expect(screen.getByRole('listbox', { name: 'Work items 030 can depend on' })).toBeDefined();

      expect(fireEvent.keyDown(box, { key: 'Tab' })).toBe(false);

      // One cell along, not two: the handler moves the focus and takes the key,
      // so the browser adds no move of its own.
      expect(document.activeElement).toBe(screen.getByLabelText('Service or team for 030'));
      expect(screen.queryByRole('listbox')).toBeNull();
      // Typed text is a search, not a value. Leaving discards it, which is what
      // leaving this cell has always done.
      expect(added).toEqual([]);
      expect(screen.getByLabelText('Add a dependency to 030')).toHaveProperty('value', '');
    },
  );

  itDom('Shift+Tab from the depends input lands in the name, not on a chip button', async () => {
    await threeRoots();

    const box = screen.getByLabelText<HTMLInputElement>('Add a dependency to 030');
    box.focus();
    fireEvent.change(box, { target: { value: '010' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop 030 waiting for 010' })).toBeDefined();
    });

    // The chip sits before the input inside this one cell, so the browser's own
    // Shift+Tab would land on its ✕ — a dependency one keystroke from being
    // removed by somebody who only meant to go back a field.
    const again = screen.getByLabelText<HTMLInputElement>('Add a dependency to 030');
    again.focus();
    expect(fireEvent.keyDown(again, { key: 'Tab', shiftKey: true })).toBe(false);

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 030'));
  });

  itDom('walks every field of a row in turn, and on into the next row', async () => {
    // The reason this walks all of them rather than sampling: a handler left
    // off one cell is invisible to a test that starts in another, which is how
    // Tab came to work in the name and nowhere else.
    await threeRoots();

    for (const [from, to] of stepsThrough([
      'Name of 010',
      'Add a dependency to 010',
      'Service or team for 010',
      'Dev optimistic for 010',
      'Dev realistic for 010',
      'Dev pessimistic for 010',
      'Dev assignee for 010',
      'QA estimate for 010',
      'Notes for 010',
      'Name of 020',
    ])) {
      focusCaret(from, 'end');
      tab();
      expect(document.activeElement).toBe(screen.getByLabelText(to));
    }
  });

  itDom('steps over the date cell until the plan is on a calendar', async () => {
    // Without a project start date the earliest-start field is disabled: a Tab
    // that stopped there would take the key and land nothing, which is a dead
    // keystroke in the middle of every row.
    await threeRoots();
    expect(screen.getByLabelText<HTMLInputElement>('Earliest start for 010').disabled).toBe(true);

    focusCaret('QA estimate for 010', 'end');
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Notes for 010'));

    fireEvent.change(screen.getByLabelText('Project start date'), {
      target: { value: '2026-08-06' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Earliest start for 010').disabled).toBe(
        false,
      );
    });

    focusCaret('QA estimate for 010', 'end');
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Earliest start for 010'));

    // And out again. A date input is focused rather than selected: it has no
    // text caret to ask for.
    expect(fireEvent.keyDown(screen.getByLabelText('Earliest start for 010'), { key: 'Tab' })).toBe(
      false,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Notes for 010'));
  });

  itDom('the arrows land in a date cell without asking it for a caret it has none of', async () => {
    // `setSelectionRange` throws `InvalidStateError` on a date input, and the
    // arrows now have one to land on: the notes cell sits next to it.
    await threeRoots();
    fireEvent.change(screen.getByLabelText('Project start date'), {
      target: { value: '2026-08-06' },
    });
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>('Earliest start for 010').disabled).toBe(
        false,
      );
    });

    // Watched rather than left to the runner: React re-throws what a handler
    // threw as an uncaught error, which the run reports away from the test that
    // caused it. Collected here, the assertion is this test's own.
    const thrown: unknown[] = [];
    const collect = (event: ErrorEvent) => {
      thrown.push(event.error);
    };
    window.addEventListener('error', collect);
    focusCaret('Notes for 010', 'start');
    fireEvent.keyDown(screen.getByLabelText('Notes for 010'), { key: 'ArrowLeft' });
    window.removeEventListener('error', collect);

    expect(thrown).toEqual([]);
    expect(document.activeElement).toBe(screen.getByLabelText('Earliest start for 010'));
  });

  itDom('Shift+Tab steps over a parent’s read-only estimate boxes', async () => {
    // A parent's trio is a sum of what is below it: the boxes are on screen to
    // be read and take no typing, so the field before the assignee is the team
    // and the three boxes between them are not stopped in. This is the row-wise
    // half of `never stops on a parent’s rolled-up figures` — an arrow cannot
    // make this trip, because the assignee picker in the way is a cell Tab
    // leaves and the arrows do not.
    //
    // Proof: `:not([readonly])` stripped from `editableGrid`'s selector, this
    // failed with the focus on `Dev pessimistic for 010`. Watched, 2026-08-07.
    const api = await threeRoots();
    withHeight(rowFor('010'), 0, 40);
    dragOnto('020', '010', 20);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
    expect(api.rows.find((r) => r.number === '010')?.rolledUp).toBe(true);
    expect(screen.getByLabelText('Dev optimistic for 010')).toHaveProperty('readOnly', true);

    const assignee = screen.getByLabelText('Dev assignee for 010');
    assignee.focus();
    expect(fireEvent.keyDown(assignee, { key: 'Tab', shiftKey: true })).toBe(false);

    expect(document.activeElement).toBe(screen.getByLabelText('Service or team for 010'));
  });

  itDom('at the edges of the grid the key is left to the browser', async () => {
    // No focus trap. Past the last cell of a row the next thing the browser
    // finds is that row's own Duplicate and Delete — the actions are at the end
    // of a row and never in the middle of one, which is what this makes
    // consistent.
    await threeRoots();

    const last = focusCaret('Notes for 030', 'end');
    expect(tab()).toBe(true);
    expect(document.activeElement).toBe(last);

    const first = focusCaret('Name of 010', 'end');
    expect(tab(true)).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});

describe('moving rows with alt and the arrows', () => {
  /**
   * Focuses a cell and puts the caret where the test needs it.
   *
   * `middle` is the position that matters here: it is where Tab navigates and
   * Backspace deletes a character, so a structural key that works there is the
   * whole point of this block.
   */
  const focusAt = (label: string, caret: 'start' | 'middle' | 'end'): HTMLElement => {
    const input = screen.getByLabelText(label);
    if (!isCell(input)) throw new Error(`${label} is not an editable cell`);
    input.focus();
    const at =
      caret === 'start'
        ? 0
        : caret === 'end'
          ? input.value.length
          : Math.floor(input.value.length / 2);
    input.setSelectionRange(at, at);
    return input;
  };

  /** Presses one Alt+arrow, and reports whether the browser would still act on it. */
  const altArrow = (label: string, key: string, caret: 'start' | 'middle' | 'end' = 'middle') =>
    fireEvent.keyDown(focusAt(label, caret), { key, altKey: true });

  /** Records every move asked for, and makes none of them happen. */
  const watchMoves = (api: ProjectApi): unknown[][] => {
    const moved: unknown[][] = [];
    api.move = (...args: unknown[]) => {
      moved.push(args);
      return Promise.resolve();
    };
    return moved;
  };

  itDom('swaps the row with the sibling below it', async () => {
    const api = await threeRoots();

    // Taken from the browser: on macOS an un-prevented Alt+arrow types a
    // character into the field as well as moving the caret.
    expect(altArrow('Name of 010', 'ArrowDown')).toBe(false);

    await waitFor(() => {
      expect(namesOnScreen()).toEqual(['Sand', 'Strip', 'Paint']);
    });
    // Moved, not copied, and still all at the root.
    expect(api.rows).toHaveLength(3);
    expect(numbersOnScreen()).toEqual(['010', '020', '030']);
  });

  itDom('swaps the row with the sibling above it', async () => {
    await threeRoots();

    expect(altArrow('Name of 030', 'ArrowUp')).toBe(false);

    await waitFor(() => {
      expect(namesOnScreen()).toEqual(['Strip', 'Paint', 'Sand']);
    });
  });

  itDom('at the first sibling it moves nothing, and still takes the key', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    // No wrap to the other end: running out of siblings is not a request to
    // reparent, nor to jump to the bottom of the group.
    expect(altArrow('Name of 010', 'ArrowUp')).toBe(false);

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
    // Nothing to complain about either: a row at the top is not a mistake.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  itDom('at the last sibling it moves nothing', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    expect(altArrow('Name of 030', 'ArrowDown')).toBe(false);

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  itDom('indents from the middle of the text, where tab would not', async () => {
    // The whole point of the change: Tab restructures only at position zero of
    // the Name cell, so today this caret position means "next cell".
    await threeRoots();

    expect(altArrow('Name of 020', 'ArrowRight')).toBe(false);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  itDom('outdents from an estimate box', async () => {
    await threeRoots();
    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });

    expect(altArrow('Dev optimistic for 010.1', 'ArrowLeft', 'end')).toBe(false);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '020', '030']);
    });
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  /**
   * Waits for the table to stop working.
   *
   * `indent` and `outdent` route a dead key through the busy-and-refetch shell
   * anyway, so a test that asserted the instant after the keystroke would be
   * asserting into the middle of a refresh — and the next keystroke would be
   * dropped by the busy rule rather than judged on its own merits.
   */
  const settle = async () => {
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add work item' })).toHaveProperty(
        'disabled',
        false,
      );
    });
  };

  itDom('a root row has nothing to outdent into', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    expect(altArrow('Name of 010', 'ArrowLeft')).toBe(false);
    await settle();

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  itDom('a first sibling has nothing to indent under', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    expect(altArrow('Name of 010', 'ArrowRight')).toBe(false);
    await settle();

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  /**
   * Drops the focus the way a browser does when React moves the row.
   *
   * jsdom keeps the focus on a node that is detached and reinserted; a browser
   * does not, which is the whole reason the table puts the focus back after a
   * move. Without this line the assertions below pass on a focus that was never
   * lost — a check that cannot fail — and with it they observe the refocus
   * itself. Proof: the refocus removed, both tests pass without this line and
   * fail with it; watched, 2026-08-06.
   */
  const dropTheFocusAsABrowserWould = () => {
    const focused = document.activeElement;
    if (!isCell(focused)) throw new Error('nothing focused to drop');
    focused.blur();
  };

  itDom('lands in the same column after an indent, not back in the name', async () => {
    // The mechanism this proves twice over: `indent` on its own lands the focus
    // in the Name cell, which is right for Enter and Backspace and wrong for a
    // key pressed in an estimate box.
    await threeRoots();

    altArrow('Dev optimistic for 020', 'ArrowRight', 'end');
    dropTheFocusAsABrowserWould();

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '020']);
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Dev optimistic for 010.1'));
    });
  });

  itDom('lands in the same column after a sibling swap', async () => {
    await threeRoots();

    altArrow('Dev pessimistic for 010', 'ArrowDown', 'end');
    dropTheFocusAsABrowserWould();

    await waitFor(() => {
      expect(namesOnScreen()).toEqual(['Sand', 'Strip', 'Paint']);
    });
    // The moved row is `020` now, and the focus is in the box it started in.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Dev pessimistic for 020'));
    });
  });

  itDom('refuses to move a frozen row and says why', async () => {
    const api = await threeRoots();
    click('Freeze numbering');
    await waitFor(() => {
      expect(screen.getAllByLabelText('Number is frozen')).toHaveLength(3);
    });
    const moved = watchMoves(api);

    expect(altArrow('Name of 010', 'ArrowDown')).toBe(false);

    expect(moved).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('frozen');
  });

  itDom('drops a second alt+down while the first is in flight', async () => {
    const api = await threeRoots();
    const asked: unknown[][] = [];
    const finish: (() => void)[] = [];
    api.move = (...args: unknown[]) => {
      asked.push(args);
      return new Promise<void>((resolve) => finish.push(resolve));
    };

    altArrow('Name of 010', 'ArrowDown');
    expect(asked).toHaveLength(1);

    // A held key repeats. The second press arrives against a tree that has not
    // come back yet, so it is dropped rather than queued.
    altArrow('Name of 010', 'ArrowDown');
    expect(asked).toHaveLength(1);

    await act(async () => {
      finish[0]?.();
      await Promise.resolve();
    });
    // And once the first has landed, the key works again.
    altArrow('Name of 010', 'ArrowDown');
    expect(asked).toHaveLength(2);
  });

  itDom('a plain arrow is still navigation', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    const name = focusAt('Name of 010', 'end');
    fireEvent.keyDown(name, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(screen.getByLabelText('Name of 020'));
    expect(moved).toEqual([]);
  });

  itDom('leaves a composing alt arrow, and one with a second modifier, alone', async () => {
    const api = await threeRoots();
    const moved = watchMoves(api);

    for (const extra of [{ isComposing: true }, { ctrlKey: true }, { metaKey: true }]) {
      const name = focusAt('Name of 010', 'middle');
      expect(fireEvent.keyDown(name, { key: 'ArrowDown', altKey: true, ...extra })).toBe(true);
    }

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });

  itDom('leaves the dependency picker’s own alt arrows alone', async () => {
    // The handler lives on the grid cells, not on the document: the picker's
    // input is not one of them and keeps its Up and Down for its own list.
    const api = await threeRoots();
    const moved = watchMoves(api);

    const picker = screen.getByLabelText('Add a dependency to 020');
    fireEvent.focus(picker);
    fireEvent.keyDown(picker, { key: 'ArrowDown', altKey: true });

    expect(moved).toEqual([]);
    expect(namesOnScreen()).toEqual(['Strip', 'Sand', 'Paint']);
  });
});

describe('dependencies in the table', () => {
  const dependOn = (rowNumber: string, predecessorNumber: string) => {
    const input = screen.getByLabelText(`Add a dependency to ${rowNumber}`);
    fireEvent.change(input, { target: { value: predecessorNumber } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  itDom('adds a dependency by the number that is on screen', async () => {
    // Ids are not something anyone can look at. Numbers are what the table
    // shows, so numbers are what it takes.
    const api = await threeRoots();

    dependOn('020', '010');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 010')).toBeDefined();
    });
    expect(api.rows).toHaveLength(3);
  });

  itDom('says so when the number typed is not a work item', async () => {
    const api = await threeRoots();
    const added: unknown[] = [];
    api.addDependency = (...args: unknown[]) => {
      added.push(args);
      return Promise.resolve();
    };

    dependOn('020', '999');

    expect(added).toEqual([]);
    expect(screen.getByRole('alert').textContent).toContain('No work item numbered 999');
  });

  itDom('removes a dependency from the chip that shows it', async () => {
    await threeRoots();
    dependOn('020', '010');
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 010')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Stop 020 waiting for 010'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Stop 020 waiting for 010')).toBeNull();
    });
  });

  itDom('moves the dependent row’s start to when its predecessor finishes', async () => {
    const api = await threeRoots();
    // All three, typed. The old table nudged the neighbours of whichever box
    // you filled; it no longer edits an estimate nobody typed, so a trio is
    // saved only once it reads sensibly on its own.
    for (const [point, value] of [
      ['optimistic', '0'],
      ['realistic', '4'],
      ['pessimistic', '4'],
    ] as const) {
      const cell = screen.getByLabelText(`Dev ${point} for 010`);
      fireEvent.change(cell, { target: { value } });
      fireEvent.blur(cell);
    }
    await waitFor(() => {
      expect(api.rows[0]?.estimates['role-dev']?.realistic).toBe(4);
    });

    dependOn('020', '010');

    await waitFor(() => {
      const row = screen
        .getAllByRole('row')
        .find((tr) => tr.querySelector('[data-number]')?.textContent === '020');
      // `0 / 4 / 4` expects `(0 + 16 + 4) / 6` = 3.33… days. Displayed to one
      // decimal, because a column of `3.3333333333333335` is unreadable — and
      // rounded only here, never in the schedule.
      expect(row?.querySelector('[data-start]')?.textContent).toBe('3.3');
    });
  });

  itDom('marks a row with no estimate rather than showing a bare zero', async () => {
    // A zero that means "instant" and a zero that means "nobody has looked" are
    // the same number and opposite facts.
    await threeRoots();

    const row = screen
      .getAllByRole('row')
      .find((tr) => tr.querySelector('[data-number]')?.textContent === '010');

    expect(row?.querySelector('[data-finish]')?.textContent).toContain('?');
  });
});

describe('picking dependencies from a list', () => {
  const depInput = (rowNumber: string) => screen.getByLabelText(`Add a dependency to ${rowNumber}`);
  /**
   * The Depends on list's entries, scoped to that listbox.
   *
   * Not a bare `getAllByRole('option')`: the toolbar's estimate-method
   * `<select>` contributes four options of its own, and a query across the
   * whole page would read the picker's list as starting with `PERT`.
   */
  const optionTexts = () => {
    const list = screen.queryAllByRole('listbox').find((box) => box.id.startsWith('dep-options-'));
    return list === undefined
      ? []
      : [...list.querySelectorAll('[role="option"]')].map((option) => option.textContent);
  };

  itDom('offers every other row, number and name together, while the cell is focused', async () => {
    await threeRoots();
    fireEvent.focus(depInput('020'));
    expect(optionTexts()).toEqual(['010 Strip', '030 Paint']);
  });

  itDom('narrows the list by name as letters are typed', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'pai' } });
    expect(optionTexts()).toEqual(['030 Paint']);
  });

  itDom('adds the clicked entry and keeps the list open for the next pick', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: '010 Strip' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 010')).toBeDefined();
    });
    // Still open, cleared, and no longer offering what was just taken.
    expect(optionTexts()).toEqual(['030 Paint']);
    expect(input).toHaveProperty('value', '');
  });

  itDom('Enter adds the entry the typing narrowed to', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'pa' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 030')).toBeDefined();
    });
  });

  itDom('arrows move the highlight and Enter takes it', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 030')).toBeDefined();
    });
  });

  itDom('Enter with nothing typed and nothing highlighted adds nothing', async () => {
    const api = await threeRoots();
    const added: unknown[] = [];
    api.addDependency = (...args: unknown[]) => {
      added.push(args);
      return Promise.resolve();
    };
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(added).toEqual([]);
  });

  itDom('Escape closes the list', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    expect(optionTexts()).toHaveLength(2);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(optionTexts()).toEqual([]);
  });

  itDom('leaving the cell closes the list', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    expect(optionTexts()).toHaveLength(2);
    fireEvent.blur(input);
    expect(optionTexts()).toEqual([]);
  });

  itDom('pressing the mouse on an option does not steal the focus', async () => {
    // In a real browser an unprevented mousedown blurs the input, the blur
    // closes the list, and the click lands on nothing. jsdom fires no blur on
    // its own, so the observable here is the prevention itself.
    await threeRoots();
    fireEvent.focus(depInput('020'));
    const option = screen.getByRole('option', { name: '010 Strip' });
    const press = createEvent.mouseDown(option);
    fireEvent(option, press);
    expect(press.defaultPrevented).toBe(true);
  });

  itDom('pressing the mouse on the list itself does not steal the focus either', async () => {
    // The list scrolls past ~10 entries, and a scrollbar drag is a mousedown
    // on the ul, not on any option. Unprevented, it blurred the input and the
    // list unmounted under the pointer — cross review #6.
    await threeRoots();
    fireEvent.focus(depInput('020'));
    const list = screen.getByRole('listbox');
    const press = createEvent.mouseDown(list);
    fireEvent(list, press);
    expect(press.defaultPrevented).toBe(true);
  });

  itDom('the highlight follows its row when a peer edit reshuffles the list', async () => {
    const api = fakeApi();
    const strip = await api.create('p1', { parentId: null, afterId: null, name: 'Strip' });
    const sand = await api.create('p1', { parentId: null, afterId: strip.id, name: 'Sand' });
    const paint = await api.create('p1', { parentId: null, afterId: sand.id, name: 'Paint' });
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    const input = await screen.findByLabelText('Add a dependency to 020');

    // Highlight Paint by hand: Down to Strip, Down again to Paint.
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(`dep-option-${paint.id}`);

    // A peer inserts a row between Strip and Sand. By index the highlight
    // would now sit on the newcomer; it must stay on Paint.
    await api.create('p1', { parentId: null, afterId: strip.id, name: 'Wedge' });
    notify();
    await waitFor(() => {
      expect(optionTexts()).toHaveLength(3);
    });
    expect(input.getAttribute('aria-activedescendant')).toBe(`dep-option-${paint.id}`);

    fireEvent.keyDown(input, { key: 'Enter' });
    // After the insert the rows renumbered: Sand is 030 and Paint 040. The
    // chip is the read the user gets, and it names the row the highlight was
    // on — not the one that took its index. (`api.rows` keeps a static
    // dependsOn; edges only materialize through tree(), so the chip is also
    // the honest assertion.)
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 040')).toBeDefined();
    });
  });

  itDom('a typed list of numbers still lands as several dependencies', async () => {
    await threeRoots();
    const input = depInput('020');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '010, 030' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByLabelText('Stop 020 waiting for 010')).toBeDefined();
      expect(screen.getByLabelText('Stop 020 waiting for 030')).toBeDefined();
    });
  });
});

describe('the picker marks what be-01 would refuse', () => {
  /**
   * ```
   * 010    Strip
   *   010.1  Sand
   * 020    Paint
   * ```
   * Built through the api before the render rather than through the table's own
   * keyboard: the shape is the fixture here, not the thing under test.
   */
  const nested = async (
    edges: readonly (readonly ['strip' | 'sand' | 'paint', 'strip' | 'sand' | 'paint'])[] = [],
  ) => {
    const api = fakeApi();
    const strip = await api.create('p1', { parentId: null, afterId: null, name: 'Strip' });
    const sand = await api.create('p1', { parentId: strip.id, afterId: null, name: 'Sand' });
    const paint = await api.create('p1', { parentId: null, afterId: strip.id, name: 'Paint' });
    const idOf = { strip: strip.id, sand: sand.id, paint: paint.id };
    for (const [predecessor, successor] of edges) {
      await api.addDependency(idOf[successor], idOf[predecessor]);
    }
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    await screen.findByLabelText('Add a dependency to 010.1');
    return {
      api,
      ...idOf,
      notify: () => {
        notify();
      },
    };
  };

  const optionTexts = () => {
    const list = screen.queryAllByRole('listbox').find((box) => box.id.startsWith('dep-options-'));
    return list === undefined
      ? []
      : [...list.querySelectorAll('[role="option"]')].map((option) => option.textContent);
  };

  const openPicker = (rowNumber: string) => {
    const input = screen.getByLabelText<HTMLInputElement>(`Add a dependency to ${rowNumber}`);
    fireEvent.focus(input);
    return input;
  };

  /** Every call to `addDependency`, so "nothing was picked" is an observation. */
  const watchAdds = (api: ProjectApi) => {
    const added: [string, string][] = [];
    const real = api.addDependency.bind(api);
    api.addDependency = (id: string, predecessorId: string) => {
      added.push([id, predecessorId]);
      return real(id, predecessorId);
    };
    return added;
  };

  itDom('greys the row this one sits inside, and says so', async () => {
    await nested();
    openPicker('010.1');
    expect(optionTexts()).toEqual(['010 Strip — contains this row', '020 Paint']);
    const refused = screen.getByRole('option', { name: '010 Strip — contains this row' });
    expect(refused.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: '020 Paint' }).getAttribute('aria-disabled')).toBe(
      'false',
    );
  });

  itDom('greys the row that sits inside this one', async () => {
    await nested();
    openPicker('010');
    expect(optionTexts()).toEqual(['010.1 Sand — inside this row', '020 Paint']);
  });

  itDom('greys the row that would loop, through the tree', async () => {
    // `020 Paint` waits for `010.1 Sand`. Sand waiting for Paint is the loop —
    // and so is `010 Strip` waiting for Paint, because Strip's only leaf is
    // Sand and that is the graph be-01 orders.
    await nested([['sand', 'paint']]);

    openPicker('010.1');
    expect(optionTexts()).toEqual(['010 Strip — contains this row', '020 Paint — would loop']);

    fireEvent.blur(screen.getByLabelText('Add a dependency to 010.1'));
    openPicker('010');
    expect(optionTexts()).toEqual(['010.1 Sand — inside this row', '020 Paint — would loop']);
  });

  itDom('clicking a greyed row adds nothing', async () => {
    const { api } = await nested();
    const added = watchAdds(api);
    openPicker('010.1');

    fireEvent.click(screen.getByRole('option', { name: '010 Strip — contains this row' }));

    expect(added).toEqual([]);
    expect(screen.queryByLabelText('Stop 010.1 waiting for 010')).toBeNull();
  });

  itDom('the arrows step over a greyed row', async () => {
    const { paint } = await nested();
    const input = openPicker('010.1');

    // One press. Down from nothing enters at the top of the list, and the top
    // of this list is refused, so the first thing it may land on is `020`.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(`dep-option-${paint}`);

    // And back up again: still nothing above `020` to reach.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(`dep-option-${paint}`);
  });

  itDom('drops a highlight that a peer’s edit has just made a loop', async () => {
    // The graph moves under an open list. Nothing here is cached, so the mark
    // is re-derived from the tree that arrived — and the entry the highlight
    // was sitting on stops being pickable the moment it stops being writable.
    const { api, sand, paint, notify } = await nested();
    const input = openPicker('010.1');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(`dep-option-${paint}`);

    await api.addDependency(paint, sand);
    notify();
    await waitFor(() => {
      expect(optionTexts()).toContain('020 Paint — would loop');
    });
    // Watched from here, so the peer's own edit above is not mistaken for one
    // this cell made.
    const added = watchAdds(api);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(added).toEqual([]);
    expect(screen.queryByLabelText('Stop 010.1 waiting for 020')).toBeNull();
  });

  itDom('Enter takes nothing when the typing narrowed to a greyed row alone', async () => {
    const { api } = await nested();
    const added = watchAdds(api);
    const input = openPicker('010.1');

    fireEvent.change(input, { target: { value: 'strip' } });
    expect(optionTexts()).toEqual(['010 Strip — contains this row']);
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(added).toEqual([]);
    expect(screen.queryByLabelText('Stop 010.1 waiting for 010')).toBeNull();
  });
});

describe('dependencies in the table — cross-review findings', () => {
  /**
   * A tree read with a schedule this component did not compute.
   *
   * The `fakeApi` above works out its own miniature schedule, which makes the
   * date tests a proof about the fake. Both reviewers said so. This returns
   * fixed, distinctive numbers instead: what is asserted is that the table
   * renders what be-01 sent, which is the only part of this the table owns.
   */
  const apiReturning = (
    scheduleError: 'cycle' | null,
    schedule: Partial<WorkItemView['schedule']> = {},
  ): ProjectApi => ({
    listProjects: () =>
      Promise.resolve([{ id: 'p1', name: 'P', restricted: false, lastOpenedAt: null }]),
    createProject: (name: string) =>
      Promise.resolve({ id: 'p1', name, restricted: false, lastOpenedAt: null }),
    openProject: () => Promise.resolve(),
    setEstimateMethod: () => Promise.resolve(),
    setStartDate: () => Promise.resolve(),
    listTeams: () => Promise.resolve([]),
    addTeam: () => Promise.reject(new Error('not_in_these_tests')),
    listPeople: () => Promise.resolve([]),
    addPerson: () => Promise.reject(new Error('not_in_these_tests')),
    assign: () => Promise.resolve(),
    renameProject: () => Promise.resolve(),
    duplicate: () => Promise.reject(new Error('not_in_these_tests')),
    roles: () => Promise.resolve([DEV]),
    tree: () =>
      Promise.resolve({
        seq: 0,
        scheduleError,
        estimateMethod: 'pert' as const,
        workItems: [
          {
            id: 'w1',
            parentId: null,
            revision: 0,
            number: '010',
            name: 'Strip',
            notes: '',
            frozenNumber: null,
            rolledUp: false,
            estimates: {},
            dependsOn: [],
            finalDays: {},
            finalTotal: 0,
            startNoEarlierThan: null,
            serviceTeamId: null,
            assignees: {},
            doesEveryPhase: null,
            dates: null,
            schedule: {
              duration: 7,
              estimated: true,
              earliestStart: 11,
              earliestFinish: 18,
              latestStart: 13,
              latestFinish: 20,
              float: 2,
              critical: false,
              ...schedule,
            },
          },
        ],
        undoable: false,
        redoable: false,
      }),
    create: () => Promise.resolve({ id: 'w2' }),
    patch: () => Promise.resolve(),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setEstimate: () => Promise.resolve(),
    clearEstimate: () => Promise.resolve(),
    freeze: () => Promise.resolve(),
    unfreezeProject: () => Promise.resolve(),
    unfreeze: () => Promise.resolve(),
    addDependency: () => Promise.resolve(),
    removeDependency: () => Promise.resolve(),
    undo: () => Promise.reject(new Error('not_in_these_tests')),
    redo: () => Promise.reject(new Error('not_in_these_tests')),
  });

  const cells = async () => {
    const row = await waitFor(() => {
      const found = screen
        .getAllByRole('row')
        .find((tr) => tr.querySelector('[data-number]')?.textContent === '010');
      if (found === undefined) throw new Error('no row yet');
      return found;
    });
    return {
      start: row.querySelector('[data-start]')?.textContent,
      finish: row.querySelector('[data-finish]')?.textContent,
      float: row.querySelector('[data-float]')?.textContent,
    };
  };

  itDom('shows the schedule be-01 sent, not one it worked out itself', async () => {
    render(<WbsTable projectId="p1" api={apiReturning(null)} />);

    expect(await cells()).toEqual({ start: '11', finish: '18', float: '2' });
  });

  itDom('names a critical row rather than printing its zero', async () => {
    render(<WbsTable projectId="p1" api={apiReturning(null, { float: 0, critical: true })} />);

    expect((await cells()).float).toBe('— critical');
  });

  itDom('shows dashes rather than zeroes when there is no schedule', async () => {
    // agy, medium. A cycle sends every row the same zeroed schedule, and
    // printing those reads as "everything happens on day zero" — a confident
    // wrong answer, next to a banner saying no dates could be worked out.
    render(<WbsTable projectId="p1" api={apiReturning('cycle')} />);

    expect(await cells()).toEqual({ start: '—', finish: '—', float: '—' });
    expect(screen.getByRole('alert').textContent).toContain('run in a circle');
  });
});

describe('the order of the columns', () => {
  itDom('opens with the number, the name, and then what the row waits for', async () => {
    // "Depends on" sat between Number and Name until 2026-08-06, because
    // dependencies belong beside the identity of a row and the numbers in the
    // cell refer to the Number column. They still do, and they still are — the
    // identity of a row is now Number *and* Name, with what it waits for
    // immediately after both.
    //
    // What moved it is the pinned frame below. `position: sticky; left` holds
    // a cell at a fixed offset from the left edge, which only lines up while
    // the pinned columns are contiguous from that edge — so pinning Name, the
    // thing a plan is read by while scrolling out to the dates, meant Name had
    // to come third rather than fourth. Deliberate reversal, written down in
    // `openspec/changes/sticky-table-frame/proposal.md`.
    await threeRoots();

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent.trim());

    expect(headers.slice(0, 4)).toEqual(['', 'Number', 'Name', 'Depends on']);
    // And the schedule stays on the right, where it reads as an outcome of
    // everything to its left rather than as something to fill in.
    // The schedule stays on the right, where it reads as an outcome of
    // everything to its left. "Not before" is the one input among them, and it
    // sits immediately before the dates it constrains.
    // `(day)` while the plan has no start date: a bare `2.5` under "Starts"
    // reads as a date that failed to load.
    expect(headers.slice(-6)).toEqual([
      'Not before',
      'Starts (day)',
      'Ends (day)',
      'Slack (days)',
      'Notes',
      '',
    ]);
  });
});

describe('the frame the table scrolls inside', () => {
  /**
   * jsdom lays nothing out, so nothing here can watch a column actually stay
   * put. What it can watch is every rule that makes it stay put arriving on
   * the element it has to be on — which is where all three of these went
   * wrong while this was being written. Whether the result reads well at 1280
   * pixels is Dany's screen's to say; `verify.md` says so out loud.
   */
  itDom('scrolls the table rather than the page', async () => {
    await threeRoots();

    const frame = screen.getByRole('table').parentElement;

    expect(frame?.dataset['tableFrame']).toBeDefined();
    // Both axes: `overflow-x: auto` forces the other one to compute to `auto`
    // regardless, and the bound on the height is what makes this box the
    // scrollport the heading below sticks to.
    expect(frame?.style.overflow).toBe('auto');
    expect(frame?.style.maxHeight).not.toBe('');
  });

  itDom('keeps the column headings against the top of the frame', async () => {
    await threeRoots();

    const headers = screen.getAllByRole('columnheader');

    expect(headers.length).toBeGreaterThan(6);
    for (const header of headers) {
      expect(header.style.position).toBe('sticky');
      expect(header.style.top).toBe('0px');
      // Transparent, the heading would have rows sliding through it.
      expect(header.style.background).not.toBe('');
    }
  });

  itDom('pins the handle, the number and the name, and nothing past them', async () => {
    await threeRoots();

    const cells = [...rowFor('020').querySelectorAll('td')];

    // Each offset is the sum of the widths in front of it — 28, then 28+168.
    expect(cells.slice(0, 3).map((td) => [td.style.position, td.style.left])).toEqual([
      ['sticky', '0px'],
      ['sticky', '28px'],
      ['sticky', '196px'],
    ]);
    // Opaque, or the row scrolling behind a pinned cell shows through it.
    for (const pinned of cells.slice(0, 3)) expect(pinned.style.background).not.toBe('');
    // "Depends on" is the fourth column now, and it scrolls away like the rest.
    expect(cells[3]?.style.position).toBe('');
  });

  itDom('pins the same three columns in the heading, over everything else', async () => {
    await threeRoots();

    const headers = screen.getAllByRole('columnheader');

    // Sticky on both axes at once: scrolled right *and* down, the Number
    // heading is the one cell that has to stay in its corner.
    expect(headers[1]?.style.left).toBe('28px');
    expect(headers[1]?.style.top).toBe('0px');
    // And it crosses both of the others, so it paints over both.
    const [pinnedBodyCell] = [...rowFor('020').querySelectorAll('td')].slice(1);
    expect(Number(headers[1]?.style.zIndex)).toBeGreaterThan(Number(headers[6]?.style.zIndex));
    expect(Number(headers[1]?.style.zIndex)).toBeGreaterThan(Number(pinnedBodyCell.style.zIndex));
  });
});

describe('the widths the table is laid out by', () => {
  /**
   * jsdom lays nothing out, so none of this can watch a column stop short of
   * its neighbour. What it can watch is the one thing that made the overlap
   * possible — more than one opinion about how wide a column is — being gone
   * from the markup: one declared width per column, the table adding up to the
   * same total, and no control inside a cell asking for a width of its own.
   */
  itDom('declares every rendered column once, in the order they are rendered', async () => {
    await threeRoots();

    const cols = [...document.querySelectorAll<HTMLElement>('colgroup col')];
    const headerCells = screen.getAllByRole('columnheader');

    expect(cols.length).toBe(headerCells.length);
    // In order, not merely in the same number: the pinned offsets are the
    // running total of the first columns' widths, so a colgroup that declared
    // the same widths in another order would lay Name out somewhere other than
    // the 196px it is pinned at. These are the numbers the pin test asserts.
    // Proof: the colgroup rendered from a reversed id list, this failed on
    // `['110px','260px','90px']` against `['28px','168px','360px']`. Watched,
    // 2026-08-07.
    expect(cols.slice(0, 3).map((col) => col.style.width)).toEqual(['28px', '168px', '360px']);
    for (const col of cols) expect(col.style.width).not.toBe('');
  });

  itDom('is as wide as its columns add up to, and divides that width by them', async () => {
    await threeRoots();

    const table = screen.getByRole('table');
    const declared = [...document.querySelectorAll<HTMLElement>('colgroup col')].reduce(
      (total, col) => total + Number.parseFloat(col.style.width),
      0,
    );

    // `fixed`, or the browser sizes the columns from their content and the
    // declared widths become decoration — which is the auto layout half of the
    // overlap.
    expect(table.style.tableLayout).toBe('fixed');
    expect(table.style.width).toBe(`${String(declared)}px`);
  });

  itDom('gives every cell the chrome its declared width is measured with', async () => {
    await threeRoots();

    const cells = [
      ...screen.getAllByRole('columnheader'),
      ...rowFor('020').querySelectorAll<HTMLElement>('td'),
    ];

    expect(cells.length).toBeGreaterThan(12);
    for (const cell of cells) {
      // Or the padding is width the offsets never counted.
      expect(cell.style.boxSizing).toBe('border-box');
      // The backstop: whatever a cell ends up holding, it stops at the cell.
      expect(cell.style.overflow).toBe('hidden');
    }
  });

  itDom('lets no control in a cell assert a width of its own', async () => {
    await threeRoots();

    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'tbody input:not([type=checkbox]), tbody textarea',
      ),
    ];

    // The name, the dependency box, the service/team picker, the folded
    // estimate, the three points, the assignee picker, the date.
    expect(controls.length).toBeGreaterThan(6);
    for (const control of controls) {
      // A control that asks for `22em` is a second opinion about how wide its
      // column is, and the one the browser takes when it is the wider of the
      // two.
      expect(['100%', 'auto', '']).toContain(control.style.width);
      // `size` is the same claim in an attribute: an input sized for 14
      // characters is as wide as 14 characters of the page's font.
      expect(control.getAttribute('size')).toBeNull();
    }
  });

  itDom('still lets the things that must leave a cell leave it', async () => {
    // The cells clip, and two things in this table are meant to escape their
    // cell: the dependency list and the notes preview. Both are
    // `position: absolute` inside a `position: relative` wrapper, and an
    // absolutely positioned box is clipped only by a *positioned* ancestor's
    // overflow — so the invariant that keeps them visible is that those
    // wrappers are positioned and do not clip. Asserted here because the cell's
    // `overflow: hidden` is otherwise one wrapper style away from hiding them.
    // Proof: `overflow: hidden` added to the dependency cell's wrapper span,
    // this failed on `expected 'hidden' not to be 'hidden'`. Watched,
    // 2026-08-07.
    await threeRoots();
    fireEvent.focus(screen.getByLabelText('Add a dependency to 020'));

    const openList = screen.getByRole('listbox');
    const notesBox = screen.getByLabelText('Notes for 020');
    const wrappers = [openList.parentElement, notesBox.parentElement];

    for (const wrapper of wrappers) {
      expect(wrapper?.style.position).toBe('relative');
      expect(wrapper?.style.overflow).not.toBe('hidden');
      // The wrapper, not the cell: a `<td>` as the positioned ancestor would
      // clip both of them with the very rule the cells now carry.
      expect(wrapper?.tagName).toBe('SPAN');
    }
    expect(openList.closest('td')?.style.overflow).toBe('hidden');
  });
});

describe('adding several dependencies at once', () => {
  const typeDeps = (rowNumber: string, value: string) => {
    const input = screen.getByLabelText(`Add a dependency to ${rowNumber}`);
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  itDom('adds every number in one comma-separated list', async () => {
    // A row that waits for three things is ordinary. Typing it three times was
    // not. Asked for on 2026-08-06.
    const api = await threeRoots();
    const added: [string, string][] = [];
    const real = api.addDependency.bind(api);
    api.addDependency = (id: string, predecessorId: string) => {
      added.push([id, predecessorId]);
      return real(id, predecessorId);
    };

    typeDeps('030', '010, 020');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 010')).toBeDefined();
    });
    expect(screen.getByLabelText('Stop 030 waiting for 020')).toBeDefined();
    expect(added).toHaveLength(2);
  });

  itDom('takes spaces as readily as commas', async () => {
    await threeRoots();

    typeDeps('030', '010 020');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 010')).toBeDefined();
    });
    expect(screen.getByLabelText('Stop 030 waiting for 020')).toBeDefined();
  });

  itDom('keeps the good numbers when one in the list is a typo', async () => {
    // Discarding a correct entry because of the one beside it is how a field
    // stops being used.
    await threeRoots();

    typeDeps('030', '010, 999');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 010')).toBeDefined();
    });
    expect(screen.getByRole('alert').textContent).toContain('No work item numbered 999');
  });

  itDom('names every dependency the server refused, and keeps the rest', async () => {
    const api = await threeRoots();
    const real = api.addDependency.bind(api);
    api.addDependency = (id: string, predecessorId: string) => {
      const number = api.rows.find((r) => r.id === predecessorId)?.number;
      if (number === '020') return Promise.reject(new Error('cycle'));
      return real(id, predecessorId);
    };

    typeDeps('030', '010, 020');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 010')).toBeDefined();
    });
    expect(screen.getByRole('alert').textContent).toContain('020 (cycle)');
    expect(screen.queryByLabelText('Stop 030 waiting for 020')).toBeNull();
  });

  itDom('still takes a single number, which is most of the typing', async () => {
    await threeRoots();

    typeDeps('030', '010');

    await waitFor(() => {
      expect(screen.getByLabelText('Stop 030 waiting for 010')).toBeDefined();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('what the plan is still missing', () => {
  /** The readiness badge, or null when the plan is complete and it is gone. */
  const badge = () => screen.queryByRole('button', { name: /unestimated/ });

  /** The badge, thrown for rather than defaulted: a null here means test setup. */
  const theBadge = (): HTMLElement => {
    const found = badge();
    if (found === null) throw new Error('no readiness badge on screen');
    return found;
  };

  /** Rows with nothing typed into them yet, roles left folded — where a person starts. */
  async function rows(count: number) {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    for (const number of ['010', '020', '030'].slice(0, count)) {
      click('Add work item');
      await screen.findByLabelText(`Name of ${number}`);
    }
    return api;
  }

  /** Estimates one row and role through the folded cell, and waits for it to land. */
  const estimate = async (number: string, role: 'Dev' | 'QA') => {
    const cell = screen.getByLabelText<HTMLInputElement>(`${role} estimate for ${number}`);
    fireEvent.change(cell, { target: { value: '5' } });
    fireEvent.blur(cell);
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(`${role} estimate for ${number}`).value).toBe(
        '5',
      );
    });
  };

  itDom('counts the leaves that are short, not the roles they are short of', async () => {
    // Two work items to go and fix, three role-sized holes between them. The
    // badge is a number of rows a reader can walk; adding the per-role counts
    // would print a bigger number than there are rows to visit.
    await rows(3);
    await estimate('010', 'Dev');
    await estimate('010', 'QA');
    await estimate('020', 'Dev');

    expect(theBadge().textContent).toBe('2 unestimated');
    expect(theBadge().getAttribute('title')).toBe('1 missing Dev, 2 missing QA');
    // A native button, so Enter and Space activate it without this table
    // binding a key. jsdom does not perform that activation, so it is the
    // element itself that is asserted here.
    expect(theBadge().tagName).toBe('BUTTON');
  });

  itDom('says nothing at all about a plan that is complete', async () => {
    // A complete plan needs no badge. A permanent green tick is a thing to
    // stop seeing, and this one has to be noticed the day it appears.
    await rows(1);
    expect(badge()).not.toBeNull();

    await estimate('010', 'Dev');
    await estimate('010', 'QA');

    expect(badge()).toBeNull();
  });

  itDom('says nothing about a project with no work items in it', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add work item' })).toBeDefined();
    });

    expect(badge()).toBeNull();
  });

  itDom('lands the focus in the cell of the first role that leaf is missing', async () => {
    // Per role, not per row: 010 has a Dev estimate and no QA one, so the cell
    // to be standing in is QA's. Sending the focus to Dev would be the tool
    // pointing at the one number that is already there.
    await rows(2);
    await estimate('010', 'Dev');

    fireEvent.click(theBadge());

    expect(document.activeElement).toBe(screen.getByLabelText('QA estimate for 010'));
  });

  itDom('moves on to the next leaf on the next click, and wraps at the end', async () => {
    await rows(2);

    fireEvent.click(theBadge());
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 010'));

    fireEvent.click(theBadge());
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 020'));

    // Wraps rather than stopping: the badge is a walk through what is left,
    // and a button that stops working at the end reads as broken.
    fireEvent.click(theBadge());
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 010'));
  });

  itDom('starts again from the top when the leaf it was on has been estimated', async () => {
    await rows(3);
    fireEvent.click(theBadge());
    fireEvent.click(theBadge());
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 020'));

    await estimate('020', 'Dev');
    await estimate('020', 'QA');

    // The row the cycle was standing on is no longer in the list. Rather than
    // guess where it used to be, the walk starts over.
    fireEvent.click(theBadge());
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 010'));
  });

  itDom('opens a collapsed branch rather than focusing a cell nobody can see', async () => {
    const api = await rows(2);
    pressTab('020');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1']);
    });
    click('Collapse 010');
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010']);
    });
    // The parent is a roll-up of the child, so the child is the only gap.
    expect(theBadge().textContent).toBe('1 unestimated');
    expect(api.rows).toHaveLength(2);

    fireEvent.click(theBadge());

    expect(numbersOnScreen()).toEqual(['010', '010.1']);
    expect(document.activeElement).toBe(screen.getByLabelText('Dev estimate for 010.1'));
  });

  itDom('lands in the first box while the role is unfolded, where the trio is typed', async () => {
    // Unfolded, the folded cell is the read-only figure again and the three
    // boxes are the editor — so that is where the walk has to put the caret.
    await rows(1);
    unfoldRole('Dev');

    fireEvent.click(theBadge());

    expect(document.activeElement).toBe(screen.getByLabelText('Dev optimistic for 010'));
  });
});

describe('finding a work item in the tree', () => {
  /**
   * A plan with a match three levels down and a branch with nothing in it.
   *
   * ```
   * 010     Strip the walls
   *  010.1   Sockets
   *   010.1.1 Back boxes
   *  010.2   Skirting
   * 020     Paint
   *  020.1   Undercoat
   * ```
   */
  async function decorating(): Promise<ProjectApi & { rows: WorkItemView[] }> {
    const api = fakeApi();
    const strip = await api.create('p1', {
      parentId: null,
      afterId: null,
      name: 'Strip the walls',
    });
    const sockets = await api.create('p1', {
      parentId: strip.id,
      afterId: null,
      name: 'Sockets',
    });
    await api.create('p1', { parentId: sockets.id, afterId: null, name: 'Back boxes' });
    await api.create('p1', { parentId: strip.id, afterId: sockets.id, name: 'Skirting' });
    const paint = await api.create('p1', { parentId: null, afterId: strip.id, name: 'Paint' });
    await api.create('p1', { parentId: paint.id, afterId: null, name: 'Undercoat' });
    return api;
  }

  const EVERY_ROW = ['010', '010.1', '010.1.1', '010.2', '020', '020.1'];

  /** Renders the plan above and waits for it to be on screen. */
  async function shownPlan(): Promise<ProjectApi & { rows: WorkItemView[] }> {
    const api = await decorating();
    render(<WbsTable projectId="p1" api={api} />);
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(EVERY_ROW);
    });
    return api;
  }

  const findBox = () => screen.getByLabelText<HTMLInputElement>('Find');

  const find = (typed: string) => {
    fireEvent.change(findBox(), { target: { value: typed } });
  };

  itDom('keeps the rows that place a match, and drops everything else', async () => {
    await shownPlan();

    find('back boxes');

    // `010` and `010.1` are context: without them the hit reads as a root of a
    // plan it is three levels inside.
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1']);
  });

  itDom('reveals a match inside a branch the reader had closed', async () => {
    await shownPlan();
    click('Collapse 010.1');
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020', '020.1']);

    find('back boxes');

    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1']);
  });

  itDom('marks the row that matched, so the rows around it read as context', async () => {
    await shownPlan();

    find('back boxes');

    const hit = screen.getByLabelText('Name of 010.1.1');
    expect(hit.dataset['match']).toBe('true');
    expect(hit.style.background).not.toBe('');
    const ancestor = screen.getByLabelText('Name of 010.1');
    expect(ancestor.dataset['match']).toBeUndefined();
    expect(ancestor.style.background).toBe('');
  });

  itDom('shows the whole subtree under a matched parent', async () => {
    await shownPlan();

    find('strip');

    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1', '010.2']);
    // Only the row whose own name matched is a hit; the three under it are
    // there because their parent is.
    expect(screen.getByLabelText('Name of 010').dataset['match']).toBe('true');
    expect(screen.getByLabelText('Name of 010.1').dataset['match']).toBeUndefined();
  });

  itDom('shows an empty table and says so when nothing matches', async () => {
    await shownPlan();

    find('plumbing');

    expect(numbersOnScreen()).toEqual([]);
    expect(screen.getByText(/No matches for/).textContent).toContain('plumbing');
  });

  itDom('counts what is on screen against the whole plan', async () => {
    await shownPlan();

    find('back boxes');

    expect(screen.getByText('3 of 6 rows')).toBeDefined();
  });

  itDom('clearing the search puts the reader’s own collapse back', async () => {
    await shownPlan();
    click('Collapse 010.1');
    click('Collapse 020');
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020']);

    find('back boxes');
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.1.1']);

    // Escape, which is how a search is left.
    fireEvent.keyDown(findBox(), { key: 'Escape' });

    expect(findBox().value).toBe('');
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020']);
  });

  itDom('the expansion controls stand down while a search is on', async () => {
    await shownPlan();

    find('back boxes');

    // A triangle here would either lie about what the search opened or close a
    // branch holding the hit.
    expect(screen.queryByRole('button', { name: 'Collapse 010' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeDisabled();
  });

  itDom('the Find box is not a cell of the keyboard grid', async () => {
    await shownPlan();

    const box = findBox();
    expect(box.getAttribute('data-cell')).toBeNull();
    expect(box.closest('table')).toBeNull();
  });

  itDom('the arrows walk the rows a search left on screen', async () => {
    await shownPlan();
    find('skirting');
    expect(numbersOnScreen()).toEqual(['010', '010.2']);

    const name = screen.getByLabelText<HTMLTextAreaElement>('Name of 010');
    name.focus();
    name.setSelectionRange(name.value.length, name.value.length);
    fireEvent.keyDown(name, { key: 'ArrowDown' });

    // Not `010.1`: it is not on screen, so it is not in the grid the keys read
    // out of the committed DOM.
    expect(document.activeElement).toBe(screen.getByLabelText('Name of 010.2'));
  });

  itDom('re-derives from the rows that came back, so a renamed row can leave', async () => {
    const api = await shownPlan();
    find('skirting');
    expect(numbersOnScreen()).toEqual(['010', '010.2']);

    const name = screen.getByLabelText('Name of 010.2');
    fireEvent.change(name, { target: { value: 'Trim' } });
    fireEvent.blur(name);

    // A row edited out of the match set disappears from the narrowed view.
    // Deliberate: the alternative is a table showing a row that no longer
    // answers the question on screen above it.
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual([]);
    });
    expect(api.rows.map((row) => row.name)).toContain('Trim');
    expect(screen.getByText('0 of 6 rows')).toBeDefined();
  });

  itDom('collapses every branch and opens them all again', async () => {
    await shownPlan();

    click('Collapse all');
    expect(numbersOnScreen()).toEqual(['010', '020']);

    click('Expand all');
    expect(numbersOnScreen()).toEqual(EVERY_ROW);
  });

  itDom('remembers a collapsed branch across a remount', async () => {
    const api = await shownPlan();
    click('Collapse 010.1');
    expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020', '020.1']);

    cleanup();
    render(<WbsTable projectId="p1" api={api} />);

    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(['010', '010.1', '010.2', '020', '020.1']);
    });
  });

  itDom('remembers each project separately', async () => {
    const api = await shownPlan();
    click('Collapse all');
    expect(numbersOnScreen()).toEqual(['010', '020']);

    cleanup();
    render(<WbsTable projectId="p2" api={api} />);

    // A different project has its own memory, and no memory means everything
    // open — not the shape the last project was left in.
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual(EVERY_ROW);
    });
  });

  itDom('drops a remembered expansion that is not one, rather than obeying it', async () => {
    // localStorage is user-editable, so what comes back is a claim. A table
    // that cannot be opened until somebody clears storage by hand is a worse
    // answer than forgetting which triangles were pointing down.
    localStorage.setItem('wbs.expanded.p1', 'not json at all');

    await shownPlan();

    expect(localStorage.getItem('wbs.expanded.p1')).toBe('true');
  });
});

describe('failures you can see', () => {
  /** Types a dependency list into a row's cell and sends it. */
  const typeDeps = (rowNumber: string, value: string) => {
    const input = screen.getByLabelText(`Add a dependency to ${rowNumber}`);
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: 'Enter' });
  };

  /** A table subscribed to a socket, with the handle that fires a change event. */
  async function subscribedTable() {
    const api = fakeApi();
    // Throws rather than doing nothing: a table that never subscribed must
    // fail loudly here instead of quietly asserting a tree nothing refreshed.
    let notify: () => void = () => {
      throw new Error('the table never subscribed');
    };
    const subscribe = (_projectId: string, handlers: SubscriptionHandlers) => {
      notify = handlers.onChange;
      return { seen: () => undefined, unsubscribe: () => undefined };
    };
    render(<WbsTable projectId="p1" api={api} subscribe={subscribe} />);
    await api.create('p1', { parentId: null, afterId: null, name: 'Strip' });
    await waitFor(() => {
      expect(numbersOnScreen()).toEqual([]);
    });
    return {
      api,
      notify: () => {
        notify();
      },
    };
  }

  itDom('says a refused rename in a toast, and puts nothing above the table', async () => {
    const api = await threeRoots();
    api.patch = () => Promise.reject(new Error('rename failed: forbidden'));

    typeName('010', 'Renamed');
    fireEvent.blur(screen.getByLabelText('Name of 010'));

    await waitFor(() => {
      expect(toastTexts()).toEqual(['rename failed: forbidden']);
    });
    // The single alert on screen is the toast itself. The top-of-page error
    // line is gone: two alerts here would be the old one still rendering.
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.closest('[data-toasts]')).not.toBeNull();
  });

  itDom('keeps a failure on screen when the next action succeeds', async () => {
    // `run` used to clear the error line before every request, so the reason a
    // rename was refused disappeared the moment anything else worked. A toast
    // owns its own lifecycle: only its ✕ takes it off.
    const api = await threeRoots();
    const realPatch = api.patch.bind(api);
    api.patch = () => Promise.reject(new Error('rename failed: forbidden'));

    typeName('010', 'Renamed');
    fireEvent.blur(screen.getByLabelText('Name of 010'));
    await waitFor(() => {
      expect(toastTexts()).toEqual(['rename failed: forbidden']);
    });

    api.patch = realPatch;
    typeName('020', 'Sanded');
    fireEvent.blur(screen.getByLabelText('Name of 020'));
    await waitFor(() => {
      expect(screen.getByLabelText('Name of 020')).toHaveProperty('value', 'Sanded');
    });

    expect(toastTexts()).toEqual(['rename failed: forbidden']);
  });

  itDom('takes a failure off when its ✕ is pressed', async () => {
    const api = await threeRoots();
    api.patch = () => Promise.reject(new Error('rename failed: forbidden'));

    typeName('010', 'Renamed');
    fireEvent.blur(screen.getByLabelText('Name of 010'));
    await waitFor(() => {
      expect(toastTexts()).toHaveLength(1);
    });

    click('Dismiss: rename failed: forbidden');

    expect(toastTexts()).toEqual([]);
  });

  itDom('raises the stale-tree banner when a socket refetch fails', async () => {
    const { api, notify } = await subscribedTable();
    const realTree = api.tree.bind(api);
    api.tree = () => Promise.reject(new Error('offline'));

    act(() => {
      notify();
    });

    await waitFor(() => {
      expect(staleBanner()).not.toBeNull();
    });
    expect(staleBanner()?.textContent).toContain('may be out of date');
    // The rows that were on screen are still on screen: a failed refetch does
    // not throw the plan away, it says the plan may have moved on without it.
    expect(numbersOnScreen()).toEqual([]);
    // Nobody asked for this refetch, so nothing was refused: no toast.
    expect(toastTexts()).toEqual([]);

    api.tree = realTree;
    click('Retry');

    await waitFor(() => {
      expect(staleBanner()).toBeNull();
    });
    expect(numbersOnScreen()).toEqual(['010']);
  });

  itDom('clears the banner on a later successful refetch from any path', async () => {
    // The retry button is one way back; somebody else's edit arriving and
    // refetching cleanly is another, and it is the common one.
    const { api, notify } = await subscribedTable();
    const realTree = api.tree.bind(api);
    api.tree = () => Promise.reject(new Error('offline'));

    act(() => {
      notify();
    });
    await waitFor(() => {
      expect(staleBanner()).not.toBeNull();
    });

    api.tree = realTree;
    act(() => {
      notify();
    });

    await waitFor(() => {
      expect(staleBanner()).toBeNull();
    });
    expect(numbersOnScreen()).toEqual(['010']);
  });

  itDom('raises the banner when the refetch after an edit fails', async () => {
    const api = await threeRoots();
    api.tree = () => Promise.reject(new Error('offline'));

    typeName('010', 'Renamed');
    fireEvent.blur(screen.getByLabelText('Name of 010'));

    await waitFor(() => {
      expect(staleBanner()).not.toBeNull();
    });
    // The edit itself was taken. Only the reread failed, so there is nothing
    // to refuse and nothing to toast.
    expect(toastTexts()).toEqual([]);
  });

  itDom('reports every refused dependency in one toast, not one each', async () => {
    // The reviewers killed a toast per change for being noise. Three lines
    // saying three halves of one answer is the same failure.
    const api = await threeRoots();
    const real = api.addDependency.bind(api);
    api.addDependency = (id: string, predecessorId: string) => {
      const number = api.rows.find((r) => r.id === predecessorId)?.number;
      if (number === '010' || number === '020') return Promise.reject(new Error('cycle'));
      return real(id, predecessorId);
    };

    typeDeps('030', '010, 020, 999');

    await waitFor(() => {
      expect(toastTexts()).toHaveLength(1);
    });
    const said = toastTexts()[0] ?? '';
    expect(said).toContain('999');
    expect(said).toContain('010 (cycle)');
    expect(said).toContain('020 (cycle)');
  });

  itDom('shows both the refusal and the banner when the refetch failed too', async () => {
    // Two different facts: the request was refused, and what is on screen may
    // no longer be what be-01 holds. Reporting one of them would be a lie by
    // omission whichever one was dropped.
    const api = await threeRoots();
    api.addDependency = () => Promise.reject(new Error('cycle'));
    api.tree = () => Promise.reject(new Error('offline'));

    // A list, not one number: a single number is taken by the picker's
    // highlight and goes through `run`, which does not reread after a refusal.
    // The combined path is the one that refuses and rereads in one gesture.
    typeDeps('030', '010, 020');

    await waitFor(() => {
      expect(staleBanner()).not.toBeNull();
    });
    expect(toastTexts()).toEqual([expect.stringContaining('010 (cycle), 020 (cycle)')]);
  });
});

describe('sharing the plan', () => {
  /**
   * Puts a clipboard on `navigator` for one test.
   *
   * jsdom ships none, which is the same shape as an http page in a real
   * browser — so the absent case below needs no stub at all, and the two
   * present cases need this one.
   */
  const stubClipboard = (writeText: (text: string) => Promise<void>): void => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  };

  /**
   * What `URL.createObjectURL` was handed, and what an anchor was told to
   * download.
   *
   * jsdom implements neither the object URL nor a download, so both are
   * replaced for the length of a test and put back after. The blob is kept
   * rather than only counted: the file's first bytes are the assertion.
   */
  const captureDownloads = (): { blobs: Blob[]; names: string[]; revoked: string[] } => {
    const blobs: Blob[] = [];
    const names: string[] = [];
    const revoked: string[] = [];
    // jsdom defines neither, so this is an assignment rather than a spy.
    const urls = URL as unknown as {
      createObjectURL: (blob: Blob) => string;
      revokeObjectURL: (url: string) => void;
    };
    urls.createObjectURL = (blob: Blob) => {
      blobs.push(blob);
      return `blob:plan-${String(blobs.length)}`;
    };
    urls.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };
    HTMLAnchorElement.prototype.click = function capture(this: HTMLAnchorElement) {
      names.push(this.download);
    };
    return { blobs, names, revoked };
  };

  /**
   * The bytes of a blob, through `FileReader`.
   *
   * jsdom's `Blob` has no `text()`, and the bytes are what is wanted anyway:
   * `readAsText` strips a leading byte-order mark per spec, so a text read
   * could not tell a file that carries one from a file that does not.
   */
  const readBlobBytes = (blob: Blob): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const read = reader.result;
        if (read instanceof ArrayBuffer) resolve(new Uint8Array(read));
        else reject(new Error('the downloaded blob read back as something else'));
      };
      reader.onerror = () => {
        reject(new Error('the downloaded blob could not be read'));
      };
      reader.readAsArrayBuffer(blob);
    });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
    Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
  });

  /** One named, estimated row, so an export has something to disagree about. */
  const onePlannedRow = async (): Promise<ReturnType<typeof fakeApi>> => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
    click('Add work item');
    await screen.findByLabelText('Name of 010');
    typeName('010', 'Strip, sand & paint');
    fireEvent.blur(screen.getByLabelText('Name of 010'));
    await waitFor(() => {
      expect(screen.getByLabelText('Name of 010')).toHaveProperty('value', 'Strip, sand & paint');
    });
    return api;
  };

  itDom('offers both ways of taking the plan out of the tool', async () => {
    const api = fakeApi();
    render(<WbsTable projectId="p1" api={api} projectName="Rewire the shed" />);
    expect(await screen.findByRole('button', { name: 'Copy as Markdown' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  itDom('copies the whole plan, header first, and says it did', async () => {
    const copied: string[] = [];
    stubClipboard((text) => {
      copied.push(text);
      return Promise.resolve();
    });
    await onePlannedRow();

    click('Copy as Markdown');

    await waitFor(() => {
      expect(toastTexts()).toEqual(['Copied as Markdown.']);
    });
    const [markdown] = copied;
    expect(markdown).toContain('**Project:** Rewire the shed');
    expect(markdown).toContain('**Final figures:** PERT');
    expect(markdown).toContain('| Strip, sand & paint |');
    // An info toast, so no alert role: nothing was refused.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  itDom('says so when the clipboard refuses the write', async () => {
    stubClipboard(() => Promise.reject(new Error('NotAllowedError')));
    await onePlannedRow();

    click('Copy as Markdown');

    await waitFor(() => {
      expect(toastTexts()).toEqual([expect.stringContaining('refused the clipboard')]);
    });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  itDom('says so when the page has no clipboard at all', async () => {
    // No stub: jsdom has none, which is what an http page has.
    await onePlannedRow();

    click('Copy as Markdown');

    await waitFor(() => {
      expect(toastTexts()).toEqual([expect.stringContaining('no clipboard')]);
    });
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  itDom('downloads a CSV named after the project and the day, and lets the URL go', async () => {
    const downloads = captureDownloads();
    await onePlannedRow();

    click('Download CSV');

    expect(downloads.names).toHaveLength(1);
    expect(downloads.names[0]).toMatch(/^rewire-the-shed-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads.revoked).toEqual(['blob:plan-1']);
    // `.at`, not `[0]`: the index signature would hand back a `Blob` whatever
    // is in the array, and the guard below would then be checking nothing.
    const file = downloads.blobs.at(0);
    if (file === undefined) throw new Error('nothing was handed to createObjectURL');
    expect(file.type).toBe('text/csv;charset=utf-8');
    const bytes = await readBlobBytes(file);
    // The byte-order mark first, or Excel on Windows reads the em dashes and
    // every non-ASCII name as the system codepage.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('Project,Rewire the shed');
    // The name holds a comma, so it is quoted rather than splitting the row.
    expect(text).toContain('"Strip, sand & paint"');
    expect(text).toContain('\r\n');
  });
});

describe('the keyboard cheat sheet', () => {
  /** The sheet, or null while it is closed. */
  const sheet = (): HTMLElement | null =>
    screen.queryByRole('dialog', { name: 'Keyboard shortcuts' });

  /** The sheet, or a thrown error rather than a null the assertions walk into. */
  const openSheet = (): HTMLElement => {
    const open = sheet();
    if (open === null) throw new Error('the cheat sheet is not open');
    return open;
  };

  /** The area outside the dialog, which closes it when it is clicked. */
  const backdrop = (): Element => {
    const found = document.querySelector('[data-cheat-sheet-backdrop]');
    if (found === null) throw new Error('the cheat sheet has no backdrop');
    return found;
  };

  itDom('opens the sheet when ? is pressed outside a cell', async () => {
    await threeRoots();
    expect(sheet()).toBeNull();

    // At the table itself: a keystroke landing on the page rather than in a
    // box somebody is typing into.
    fireEvent.keyDown(screen.getByRole('table'), { key: '?' });

    expect(openSheet().getAttribute('aria-modal')).toBe('true');
    // One of the registry's groups, so this is asserting the sheet rendered
    // the bindings rather than an empty box. What is in each group is
    // `keyboard-cheat-sheet.test.tsx`'s business.
    expect(screen.getByRole('heading', { name: 'Moving rows' })).toBeDefined();
  });

  itDom('a question mark typed into a name stays a question mark', async () => {
    await threeRoots();

    const stillTheBrowsers = fireEvent.keyDown(screen.getByLabelText('Name of 010'), { key: '?' });

    // Nothing opened, and the keystroke was left to the field that wanted it.
    expect(sheet()).toBeNull();
    expect(stillTheBrowsers).toBe(true);
  });

  itDom('closes on Escape and gives the focus back to what had it', async () => {
    await threeRoots();
    const opener = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    // jsdom does not focus a clicked button; a browser does, and where the
    // focus goes back to is what this test is about.
    opener.focus();
    click('Keyboard shortcuts');
    expect(openSheet().contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(openSheet(), { key: 'Escape' });

    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  itDom('gives the focus back to the cell that had it', async () => {
    await threeRoots();
    const name = screen.getByLabelText('Name of 010');
    name.focus();

    // The keystroke lands on the page while the cell holds the focus, which is
    // the only way `?` opens anything from a row: inside the cell it is a
    // question mark.
    fireEvent.keyDown(screen.getByRole('table'), { key: '?' });
    expect(openSheet().contains(document.activeElement)).toBe(true);
    fireEvent.click(backdrop());

    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(name);
  });

  itDom('opens from the toolbar for anyone who was never told about ?', async () => {
    await threeRoots();

    click('Keyboard shortcuts');

    expect(openSheet()).toBeDefined();
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' }).title).toBe(
      'Keyboard shortcuts (?)',
    );
  });
});

describe('undo and redo', () => {
  /** The chord as a browser delivers it, with `Z` uppercased by Shift. */
  const pressUndo = (target: Element, shiftKey = false) =>
    fireEvent.keyDown(target, { key: shiftKey ? 'Z' : 'z', ctrlKey: true, shiftKey });

  itDom('undoes the last change and says what it undid', async () => {
    const api = await threeRoots();
    api.answerStackWith({ ok: true, done: 'rename “Strip”', detail: null });

    pressUndo(screen.getByRole('table'));

    await waitFor(() => {
      expect(api.stackCalls).toEqual(['undo']);
    });
    await waitFor(() => {
      expect(toastTexts()).toContain('Undid: rename “Strip”');
    });
  });

  itDom('leaves ctrl-z alone inside a name cell, where the browser owns it', async () => {
    const api = await threeRoots();

    // The return value is `false` when something called `preventDefault`. A
    // half-typed word is the browser's to undo, and taking the chord here
    // would reverse a change that has landed instead of the letters on screen.
    const stillTheBrowsers = pressUndo(screen.getByLabelText('Name of 010'));

    expect(stillTheBrowsers).toBe(true);
    expect(api.stackCalls).toEqual([]);
    expect(toastTexts()).toEqual([]);
  });

  itDom('redoes what was undone', async () => {
    const api = await threeRoots();
    api.answerStackWith({ ok: true, done: 'rename “Strip”', detail: null });

    pressUndo(screen.getByRole('table'), true);

    await waitFor(() => {
      expect(api.stackCalls).toEqual(['redo']);
    });
    await waitFor(() => {
      expect(toastTexts()).toContain('Redid: rename “Strip”');
    });
  });

  itDom('names the change that stood in the way when an undo is refused', async () => {
    const api = await threeRoots();
    api.answerStackWith({
      ok: false,
      reason: 'stale_undo',
      detail: '“Sand it twice” has changed since',
    });

    pressUndo(screen.getByRole('table'));

    await waitFor(() => {
      expect(toastTexts()).toContain('That could not be undone: “Sand it twice” has changed since');
    });
  });

  itDom('says whose stack is empty rather than leaving the key silent', async () => {
    const api = await threeRoots();
    api.answerStackWith({ ok: false, reason: 'nothing_to_undo', detail: null });

    pressUndo(screen.getByRole('table'));

    await waitFor(() => {
      expect(toastTexts()).toContain(
        'There are none of your own changes left to undo on this plan.',
      );
    });
  });

  itDom('says a partial restore out loud rather than reporting a clean undo', async () => {
    const api = await threeRoots();
    api.answerStackWith({
      ok: true,
      done: 'delete “Strip”',
      detail: 'put back without 1 dependency the plan no longer allows (not_found)',
    });

    pressUndo(screen.getByRole('table'));

    await waitFor(() => {
      expect(toastTexts()).toContain(
        'Undid: delete “Strip” — put back without 1 dependency the plan no longer allows (not_found)',
      );
    });
  });

  itDom('greys the buttons out until be-01 says there is something in that half', async () => {
    const api = await threeRoots();

    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', true);

    // be-01 is the only thing that knows: the stack is per account, and
    // somebody else's edit can empty this reader's redo branch.
    api.stack.undoable = true;
    // Any refetch carries the answer; a socket event is the one nobody asked
    // for, which is exactly the case the buttons must still follow.
    click('Add work item');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false);
    });
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', true);
  });

  itDom('undoes from the toolbar for anyone who never learns the chord', async () => {
    const api = await threeRoots();
    api.stack.undoable = true;
    click('Add work item');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false);
    });

    click('Undo');

    await waitFor(() => {
      expect(api.stackCalls).toEqual(['undo']);
    });
  });
});

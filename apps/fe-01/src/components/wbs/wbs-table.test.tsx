import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Days, ProjectApi, RoleView, WorkItemView } from '@/lib/wbs-api';

import { keepOrdered, type SubscriptionHandlers, WbsTable } from './wbs-table';

// fe-01 tests require jsdom; only Vitest provides it. Skip under plain `bun test`.
const hasDom = typeof document !== 'undefined';
const itDom = hasDom ? it : it.skip;

const DEV: RoleView = { id: 'role-dev', name: 'Dev' };

/**
 * A ProjectApi over an in-memory tree, numbering rows the way be-01 does.
 *
 * It has to renumber on every change rather than assign once: the whole point
 * of the component's "refetch, never patch" rule is that a create or move moves
 * numbers it never touched, and a fake that kept numbers stable would let a
 * broken component pass.
 */
function fakeApi(): ProjectApi & { rows: WorkItemView[] } {
  const rows: WorkItemView[] = [];
  const edges: { predecessorId: string; successorId: string }[] = [];
  let next = 0;
  let seq = -1;

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
    listProjects: () => Promise.resolve([{ id: 'p1', name: 'Rewire the shed', restricted: false }]),
    createProject: (name: string) => Promise.resolve({ id: 'p1', name, restricted: false }),
    tree: () =>
      // The sequence advances with every mutation, the way be-01's does, so a
      // test that asserts what the stream was told is asserting something real.
      Promise.resolve({
        workItems: rows.map((r) => ({
          ...r,
          dependsOn: edges.filter((e) => e.successorId === r.id).map((e) => e.predecessorId),
          schedule: scheduleOf(r),
        })),
        seq,
        scheduleError: null,
      }),
    roles: () => Promise.resolve([DEV]),
    create(_projectId, input) {
      next += 1;
      const id = `w${String(next)}`;
      const at =
        input.afterId === null ? rows.length : rows.findIndex((r) => r.id === input.afterId) + 1;
      rows.splice(at, 0, {
        id,
        parentId: input.parentId,
        number: '',
        name: input.name ?? '',
        notes: '',
        frozenNumber: null,
        rolledUp: false,
        estimates: {},
        dependsOn: [],
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
  };
}

const numbersOnScreen = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('[data-number]')?.textContent ?? '');

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

const pressTab = (number: string, shiftKey = false) => {
  fireEvent.keyDown(screen.getByLabelText(`Name of ${number}`), { key: 'Tab', shiftKey });
};

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

describe('keepOrdered', () => {
  const days = (optimistic: number, realistic: number, pessimistic: number) => ({
    optimistic,
    realistic,
    pessimistic,
  });

  it('drags the other two up when optimistic is typed into an empty estimate', () => {
    // be-01 rejects 5/0/0, so without this a row could never be given its first
    // estimate through the UI — the request 400s and the edit is discarded.
    expect(keepOrdered(days(0, 0, 0), 'optimistic', 5)).toEqual(days(5, 5, 5));
  });

  it('keeps the typed value and moves only what it must', () => {
    expect(keepOrdered(days(1, 2, 3), 'realistic', 9)).toEqual(days(1, 9, 9));
    expect(keepOrdered(days(1, 2, 3), 'pessimistic', 0)).toEqual(days(0, 0, 0));
    expect(keepOrdered(days(1, 2, 3), 'optimistic', 2)).toEqual(days(2, 2, 3));
  });

  it('leaves an already ordered triple alone', () => {
    expect(keepOrdered(days(1, 2, 3), 'realistic', 2)).toEqual(days(1, 2, 3));
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
  return api;
}

const namesOnScreen = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((tr) => {
      const input = tr.querySelector('input[data-name-input]');
      // Thrown rather than defaulted: a row without a name input means the
      // markup changed, and an empty string here would quietly pass an
      // ordering assertion that is no longer looking at anything.
      if (!(input instanceof HTMLInputElement)) throw new Error('a row has no name input');
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
    expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain(
      'changed while you were dragging',
    );
  });
});

describe('moving between cells with the arrow keys', () => {
  /** Focuses a cell and puts the caret where a test needs it. */
  const focusCell = (label: string, caret: 'start' | 'end' | 'middle'): HTMLInputElement => {
    const input = screen.getByLabelText(label);
    if (!(input instanceof HTMLInputElement)) throw new Error(`${label} is not an input`);
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

    expect(document.activeElement).toBe(screen.getByLabelText('Dev optimistic for 010'));
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
    if (!(input instanceof HTMLInputElement)) throw new Error(`${label} is not an input`);
    input.focus();
    const pos = at === 'start' ? 0 : input.value.length;
    input.setSelectionRange(pos, pos);
    return input;
  };

  const arrow = (key: string, init: Record<string, unknown> = {}) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) throw new Error('nothing focused');
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
    const optimistic = screen.getByLabelText('Dev optimistic for 010');
    fireEvent.change(optimistic, { target: { value: '3' } });
    fireEvent.blur(optimistic);
    await waitFor(() => {
      expect(screen.getByLabelText('Dev optimistic for 010')).toHaveProperty('value', '3');
    });

    focus('Name of 010', 'end');
    const arrived = arrow('ArrowRight');

    expect(arrived).toBe(screen.getByLabelText('Dev optimistic for 010'));
    if (!(arrived instanceof HTMLInputElement)) throw new Error('not an input');
    expect(arrived.value).toBe('3');
    expect([arrived.selectionStart, arrived.selectionEnd]).toEqual([0, 0]);

    // And coming back the other way lands on the far edge, for the same reason.
    const back = arrow('ArrowLeft');
    if (!(back instanceof HTMLInputElement)) throw new Error('not an input');
    expect(back).toBe(screen.getByLabelText('Name of 010'));
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
    await threeRoots();

    for (const modifier of ['altKey', 'ctrlKey', 'metaKey']) {
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

    // Along the parent's own row: name to notes, straight past the sums.
    focus('Name of 010', 'end');
    expect(arrow('ArrowRight')).toBe(screen.getByLabelText('Notes for 010'));

    // And down the column from the child, past the parent below it.
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
    const cell = screen.getByLabelText('Dev realistic for 010');
    fireEvent.change(cell, { target: { value: '4' } });
    fireEvent.blur(cell);
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
    listProjects: () => Promise.resolve([{ id: 'p1', name: 'P', restricted: false }]),
    createProject: (name: string) => Promise.resolve({ id: 'p1', name, restricted: false }),
    roles: () => Promise.resolve([DEV]),
    tree: () =>
      Promise.resolve({
        seq: 0,
        scheduleError,
        workItems: [
          {
            id: 'w1',
            parentId: null,
            number: '010',
            name: 'Strip',
            notes: '',
            frozenNumber: null,
            rolledUp: false,
            estimates: {},
            dependsOn: [],
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
      }),
    create: () => Promise.resolve({ id: 'w2' }),
    patch: () => Promise.resolve(),
    move: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    setEstimate: () => Promise.resolve(),
    freeze: () => Promise.resolve(),
    unfreezeProject: () => Promise.resolve(),
    unfreeze: () => Promise.resolve(),
    addDependency: () => Promise.resolve(),
    removeDependency: () => Promise.resolve(),
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

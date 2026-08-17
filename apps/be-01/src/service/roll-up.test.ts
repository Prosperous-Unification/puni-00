import { describe, expect, it } from 'bun:test';

import type { StoredActual, StoredEstimate, WorkItem } from '../repository';
import { rollUp, rollUpActuals } from './roll-up';

const item = (id: string, parentId: string | null): WorkItem => ({
  id,
  projectId: 'p',
  parentId,
  position: 10,
  name: id,
  notes: '',
  frozenNumber: null,
  priority: null,
  startNoEarlierThan: null,
  serviceTeamId: null,
  maxParallel: 1,
  revision: 0,
});

const held = (
  workItemId: string,
  roleId: string,
  optimistic: number,
  realistic: number,
  pessimistic: number,
): StoredEstimate => ({ workItemId, roleId, optimistic, realistic, pessimistic });

describe('rollUp', () => {
  it('gives a leaf its own estimate', () => {
    const totals = rollUp([item('a', null)], [held('a', 'dev', 1, 2, 3)]);

    expect(totals.get('a')?.get('dev')).toEqual({ optimistic: 1, realistic: 2, pessimistic: 3 });
  });

  it('sums two children into their parent', () => {
    const rows = [item('parent', null), item('one', 'parent'), item('two', 'parent')];
    const estimates = [held('one', 'dev', 1, 2, 3), held('two', 'dev', 2, 3, 4)];

    const totals = rollUp(rows, estimates);

    expect(totals.get('parent')?.get('dev')).toEqual({
      optimistic: 3,
      realistic: 5,
      pessimistic: 7,
    });
  });

  it('sums through more than one level', () => {
    const rows = [item('root', null), item('mid', 'root'), item('leaf', 'mid')];

    const totals = rollUp(rows, [held('leaf', 'dev', 1, 1, 1)]);

    expect(totals.get('root')?.get('dev')).toEqual({
      optimistic: 1,
      realistic: 1,
      pessimistic: 1,
    });
  });

  it('reports a role no descendant estimated as absent, not zero', () => {
    // Zero and absent look the same in a table and mean opposite things: "no QA
    // needed" against "nobody has estimated the QA".
    const rows = [item('parent', null), item('one', 'parent')];

    const totals = rollUp(rows, [held('one', 'dev', 1, 2, 3)]);

    expect(totals.get('parent')?.has('qa')).toBe(false);
    expect(totals.get('parent')?.get('qa')).toBeUndefined();
  });

  it('keeps roles apart when only one child has each', () => {
    const rows = [item('parent', null), item('one', 'parent'), item('two', 'parent')];
    const estimates = [held('one', 'dev', 1, 2, 3), held('two', 'qa', 4, 5, 6)];

    const totals = rollUp(rows, estimates);

    expect(totals.get('parent')?.get('dev')).toEqual({
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
    expect(totals.get('parent')?.get('qa')).toEqual({
      optimistic: 4,
      realistic: 5,
      pessimistic: 6,
    });
  });

  it('ignores an estimate stored against a work item that has children', () => {
    // The service refuses to write one, so this is defence against a row that
    // predates the rule. Counting it would double the parent's total.
    const rows = [item('parent', null), item('one', 'parent')];
    const estimates = [held('parent', 'dev', 99, 99, 99), held('one', 'dev', 1, 2, 3)];

    const totals = rollUp(rows, estimates);

    expect(totals.get('parent')?.get('dev')).toEqual({
      optimistic: 1,
      realistic: 2,
      pessimistic: 3,
    });
  });
});

const recorded = (workItemId: string, roleId: string, days: number): StoredActual => ({
  workItemId,
  roleId,
  days,
  recordedAt: 1000,
});

describe('rollUpActuals', () => {
  it('gives a leaf its own recorded days', () => {
    const totals = rollUpActuals([item('a', null)], [recorded('a', 'dev', 8)]);

    expect(totals.get('a')?.get('dev')).toBe(8);
  });

  it('sums two children into their parent, per role', () => {
    const rows = [item('parent', null), item('one', 'parent'), item('two', 'parent')];

    const totals = rollUpActuals(rows, [
      recorded('one', 'dev', 2),
      recorded('two', 'dev', 3),
      recorded('two', 'qa', 1),
    ]);

    expect(totals.get('parent')?.get('dev')).toBe(5);
    expect(totals.get('parent')?.get('qa')).toBe(1);
  });

  it('sums through more than one level', () => {
    const rows = [item('root', null), item('mid', 'root'), item('leaf', 'mid')];

    const totals = rollUpActuals(rows, [recorded('leaf', 'dev', 4)]);

    expect(totals.get('root')?.get('dev')).toBe(4);
  });

  it('leaves a role nobody recorded absent rather than zero', () => {
    // The rule the table rests on, at the fold. `has` and not the value,
    // because `0` and `undefined` are both falsy and only one of them is the
    // answer this asserts.
    const rows = [item('parent', null), item('one', 'parent')];

    const totals = rollUpActuals(rows, [recorded('one', 'dev', 2)]);

    expect(totals.get('parent')?.has('qa')).toBe(false);
    expect(totals.get('parent')?.get('dev')).toBe(2);
  });

  it('keeps a recorded zero, which is not the same as nobody having said', () => {
    const rows = [item('parent', null), item('one', 'parent')];

    const totals = rollUpActuals(rows, [recorded('one', 'dev', 0)]);

    expect(totals.get('parent')?.has('dev')).toBe(true);
    expect(totals.get('parent')?.get('dev')).toBe(0);
  });

  it('gives a parent an empty map when nothing under it was recorded', () => {
    const rows = [item('parent', null), item('one', 'parent')];

    const totals = rollUpActuals(rows, []);

    expect(totals.get('parent')?.size).toBe(0);
    expect(totals.get('one')?.size).toBe(0);
  });

  it('ignores a row stored on a work item that has children, as the estimates do', () => {
    // A parent reports what is below it. A row left on a row that has since
    // gained a child is invisible here — which is why the write path moves it
    // down instead of leaving it, and why that move has its own test.
    const rows = [item('parent', null), item('one', 'parent')];

    const totals = rollUpActuals(rows, [recorded('parent', 'dev', 99), recorded('one', 'dev', 2)]);

    expect(totals.get('parent')?.get('dev')).toBe(2);
  });
});

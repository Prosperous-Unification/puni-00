import { describe, expect, it } from 'bun:test';

import type { StoredEstimate, WorkItem } from '../repository';
import { rollUp } from './roll-up';

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

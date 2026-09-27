import { NO_ALLOWANCE, type TypedDependency } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { StoredDependency } from '../ports/dependency-store';
import type { WorkItem } from '../ports/work-item-store';
import { workItemRow } from '../testing/work-item-fixture';
import { type DependencyGraphState, findDependencyGraphCycle } from './dependency-graph';

const item = (id: string, parentId: string | null = null): WorkItem =>
  workItemRow({ id, projectId: 'p1', parentId, name: id });

const legacy = (predecessorId: string, successorId: string): StoredDependency => ({
  id: `${predecessorId}->${successorId}`,
  projectId: 'p1',
  predecessorId,
  successorId,
});

const nodeFs = (id: string, from: [string, string], to: [string, string]): TypedDependency => ({
  id,
  predecessor: { scope: 'node', workItemId: from[0], stepId: from[1] },
  successor: { scope: 'node', workItemId: to[0], stepId: to[1] },
  type: 'FS',
});

/** A and B, each with Dev then QA; every node estimated unless a case clears one. */
const base: DependencyGraphState = {
  rows: [item('A'), item('B')],
  steps: [
    { id: 'dev', allowancePercent: NO_ALLOWANCE },
    { id: 'qa', allowancePercent: NO_ALLOWANCE },
  ],
  estimates: [
    { workItemId: 'A', stepId: 'dev' },
    { workItemId: 'A', stepId: 'qa' },
    { workItemId: 'B', stepId: 'dev' },
    { workItemId: 'B', stepId: 'qa' },
  ],
  legacy: [],
  typed: [],
  reach: 'anchor-slice',
};

describe('findDependencyGraphCycle', () => {
  it('accepts A.dev → B.dev beside B.qa → A.qa, which only looks cyclic by work item', () => {
    expect(
      findDependencyGraphCycle({
        ...base,
        typed: [nodeFs('r1', ['A', 'dev'], ['B', 'dev']), nodeFs('r2', ['B', 'qa'], ['A', 'qa'])],
      }),
    ).toBeNull();
  });

  it('refuses a legacy link that closes a cycle against a typed one', () => {
    expect(
      findDependencyGraphCycle({
        ...base,
        reach: 'whole-item',
        typed: [nodeFs('r1', ['A', 'qa'], ['B', 'qa'])],
        legacy: [legacy('B', 'A')],
      }),
    ).toEqual({ kind: 'cycle', relationshipIds: ['r1'] });
  });

  it('refuses the state an estimate clearing leaves when it moves the legacy anchor', () => {
    const state: DependencyGraphState = {
      ...base,
      typed: [nodeFs('r1', ['A', 'qa'], ['B', 'qa'])],
      legacy: [legacy('B', 'A')],
    };
    expect(findDependencyGraphCycle(state)).toBeNull();
    expect(
      findDependencyGraphCycle({
        ...state,
        estimates: state.estimates.filter(
          (each) => !(each.workItemId === 'B' && each.stepId === 'dev'),
        ),
      }),
    ).toEqual({ kind: 'cycle', relationshipIds: ['r1'] });
  });

  it('refuses the state a reach change to whole-item leaves', () => {
    const state: DependencyGraphState = {
      ...base,
      typed: [nodeFs('r1', ['A', 'qa'], ['B', 'qa'])],
      legacy: [legacy('B', 'A')],
    };
    expect(findDependencyGraphCycle({ ...state, reach: 'whole-item' })).toEqual({
      kind: 'cycle',
      relationshipIds: ['r1'],
    });
  });

  it('ignores an estimate stored on a parent, which schedules nothing', () => {
    const state: DependencyGraphState = {
      ...base,
      rows: [item('A'), item('B'), item('B1', 'B')],
      estimates: [{ workItemId: 'B', stepId: 'dev' }],
    };
    expect(findDependencyGraphCycle(state)).toBeNull();
  });

  it('resolves a stepless project to work-item boundaries', () => {
    expect(
      findDependencyGraphCycle({
        ...base,
        steps: [],
        estimates: [],
        typed: [
          {
            id: 'r1',
            predecessor: { scope: 'whole', workItemId: 'A' },
            successor: { scope: 'whole', workItemId: 'B' },
            type: 'FS',
          },
        ],
        legacy: [legacy('B', 'A')],
      }),
    ).toEqual({ kind: 'cycle', relationshipIds: ['r1'] });
  });
});

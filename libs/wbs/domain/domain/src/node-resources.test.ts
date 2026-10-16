import { describe, expect, it } from 'bun:test';

import { nodeResourcesOf, resolveStepResources } from './node-resources';

const rows = [
  { id: 'parent', parentId: null, teamIds: ['wide', 'unsized', 'narrow'], maxParallel: 4 },
  { id: 'leaf', parentId: 'parent', teamIds: [], maxParallel: 3 },
];
const sizes = new Map([
  ['wide', 4],
  ['narrow', 2],
]);

describe('node resources', () => {
  it('reads inherited whole team sets, nullable unsized capacity and the narrowest width', () => {
    const projected = nodeResourcesOf(rows, ['dev', 'qa'], new Map(), sizes);
    expect(projected.has('parent')).toBe(false);
    expect(projected.get('leaf')).toEqual({
      dev: {
        nodeId: 'sn1.leaf.dev',
        assignment: { kind: 'unassigned' },
        teams: {
          kind: 'stated',
          fromWorkItemId: 'parent',
          entries: [
            { teamId: 'wide', capacity: 4 },
            { teamId: 'unsized', capacity: null },
            { teamId: 'narrow', capacity: 2 },
          ],
        },
        maxParallel: 3,
        width: 2,
      },
      qa: {
        nodeId: 'sn1.leaf.qa',
        assignment: { kind: 'unassigned' },
        teams: {
          kind: 'stated',
          fromWorkItemId: 'parent',
          entries: [
            { teamId: 'wide', capacity: 4 },
            { teamId: 'unsized', capacity: null },
            { teamId: 'narrow', capacity: 2 },
          ],
        },
        maxParallel: 3,
        width: 2,
      },
    });
  });

  it('distinguishes explicit and sole assumed assignment, with named width one', () => {
    const projected = nodeResourcesOf(
      rows,
      ['dev', 'qa'],
      new Map([['leaf', { dev: 'ada' }]]),
      sizes,
    );
    expect(projected.get('leaf')?.['dev'].assignment).toEqual({
      kind: 'explicit',
      personId: 'ada',
    });
    expect(projected.get('leaf')?.['qa'].assignment).toEqual({
      kind: 'assumed',
      personId: 'ada',
      fromStepId: 'dev',
    });
    expect(projected.get('leaf')?.['qa'].width).toBe(1);
    expect(projected.get('leaf')?.['dev'].width).toBe(1);
  });

  it('two assignments to the same person disable assumption', () => {
    expect(resolveStepResources(4, 'third', { dev: 'ada', qa: 'ada' }, [], sizes)).toEqual({
      assignment: { kind: 'unassigned' },
      personId: null,
      width: 4,
      poolIds: [],
    });
  });

  it('own teams replace ancestors and unsized teams do not create pools', () => {
    const projected = nodeResourcesOf(
      [rows[0], { ...rows[1], teamIds: ['unsized'], maxParallel: 4 }],
      ['dev'],
      new Map(),
      sizes,
    );
    expect(projected.get('leaf')?.['dev'].teams).toEqual({
      kind: 'stated',
      fromWorkItemId: 'leaf',
      entries: [{ teamId: 'unsized', capacity: null }],
    });
    expect(projected.get('leaf')?.['dev'].width).toBe(4);
    expect(resolveStepResources(4, 'dev', {}, ['unsized'], sizes).poolIds).toEqual([]);
  });

  it('own sized teams override narrower inherited capacity', () => {
    const projected = nodeResourcesOf(
      [rows[0], { ...rows[1], teamIds: ['wide'] }],
      ['dev'],
      new Map(),
      sizes,
    );
    expect(projected.get('leaf')?.['dev']).toMatchObject({
      teams: { kind: 'stated', fromWorkItemId: 'leaf', entries: [{ teamId: 'wide', capacity: 4 }] },
      maxParallel: 3,
      width: 3,
    });
  });

  it('does not widen stored parallelism to a larger team capacity', () => {
    expect(resolveStepResources(2, 'dev', {}, ['wide'], sizes).width).toBe(2);
  });

  it('reads unstated teams and stepless leaves without inventing nodes', () => {
    const leaf = [{ id: 'leaf', parentId: null, teamIds: [], maxParallel: 3 }];
    expect(nodeResourcesOf(leaf, [], new Map(), sizes).get('leaf')).toEqual({});
    expect(nodeResourcesOf(leaf, ['dev'], new Map(), sizes).get('leaf')?.['dev']).toEqual({
      nodeId: 'sn1.leaf.dev',
      assignment: { kind: 'unassigned' },
      teams: { kind: 'unstated' },
      maxParallel: 3,
      width: 3,
    });
  });
});

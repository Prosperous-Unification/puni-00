import { expect, test } from 'bun:test';

import type { StoredTypedDependency } from '../../ports/typed-dependency-store';
import { remapCopiedDependency, selectCopiedDependencies } from './copy-typed-dependencies';

const selection = {
  sourceProjectId: 'source',
  destinationProjectId: 'copy',
  workItemIds: new Map([
    ['first', 'first-copy'],
    ['second', 'second-copy'],
  ]),
  stepIds: new Map([
    ['dev', 'dev-copy'],
    ['qa', 'qa-copy'],
  ]),
};
const link = (predecessor: string, successor: string): StoredTypedDependency => ({
  id: `${predecessor}-${successor}`,
  projectId: 'source',
  predecessor: { scope: 'whole', projectId: 'source', workItemId: predecessor },
  successor: { scope: 'whole', projectId: 'source', workItemId: successor },
  type: 'FS',
});

test('selects successor-owned prerequisites and leaves outgoing and unrelated links behind', () => {
  const internal = link('first', 'second');
  const incoming = link('outside', 'first');
  const outgoing = link('first', 'outside');
  const unrelated = link('outside', 'other');
  const foreign = {
    ...link('first', 'second'),
    projectId: 'remote',
    successor: { scope: 'whole' as const, projectId: 'remote', workItemId: 'second' },
  };
  expect(
    selectCopiedDependencies([internal, incoming, outgoing, unrelated, foreign], selection),
  ).toEqual([internal, incoming]);
});

for (const scope of ['whole', 'node', 'descendant-step'] as const)
  for (const type of ['FS', 'SS', 'FF'] as const)
    test(`remaps exact internal ${scope} endpoints with ${type} and fresh identity`, () => {
      const endpoint = (workItemId: string, stepId: string) =>
        scope === 'whole'
          ? { scope, projectId: 'source', workItemId }
          : { scope, projectId: 'source', workItemId, stepId };
      const source = {
        ...link('first', 'second'),
        type,
        predecessor: endpoint('first', 'dev'),
        successor: endpoint('second', 'qa'),
      };
      const copied = remapCopiedDependency(source, selection, 'new-id');
      expect(copied).toEqual({
        id: 'new-id',
        projectId: 'copy',
        type,
        predecessor: { ...endpoint('first-copy', 'dev-copy'), projectId: 'copy' },
        successor: { ...endpoint('second-copy', 'qa-copy'), projectId: 'copy' },
      });
      expect(source.id).toBe('first-second');
    });

test('retains detached local outside and remote endpoints including scoped step identity', () => {
  for (const projectId of ['source', 'remote']) {
    const source = {
      ...link('outside', 'first'),
      predecessor: {
        scope: 'node' as const,
        projectId,
        workItemId: projectId === 'remote' ? 'first' : 'outside',
        stepId: projectId === 'remote' ? 'dev' : 'remote-dev',
      },
    };
    const copied = remapCopiedDependency(source, selection, 'new');
    expect(copied.predecessor).toEqual(source.predecessor);
    expect(copied.predecessor).not.toBe(source.predecessor);
  }
});

test('preserves two ordered nodes on the same work item', () => {
  const source = {
    ...link('first', 'first'),
    predecessor: {
      scope: 'node' as const,
      projectId: 'source',
      workItemId: 'first',
      stepId: 'dev',
    },
    successor: { scope: 'node' as const, projectId: 'source', workItemId: 'first', stepId: 'qa' },
  };
  expect(remapCopiedDependency(source, selection, 'new')).toMatchObject({
    predecessor: { workItemId: 'first-copy', stepId: 'dev-copy' },
    successor: { workItemId: 'first-copy', stepId: 'qa-copy' },
  });
});

test('throws for trusted ownership and missing required successor or step map entries', () => {
  expect(() =>
    selectCopiedDependencies([{ ...link('first', 'second'), projectId: 'wrong' }], selection),
  ).toThrow('owner');
  expect(() => remapCopiedDependency(link('first', 'outside'), selection, 'new')).toThrow(
    'successor',
  );
  const source = {
    ...link('first', 'second'),
    predecessor: {
      scope: 'node' as const,
      projectId: 'source',
      workItemId: 'first',
      stepId: 'absent',
    },
  };
  expect(() => remapCopiedDependency(source, selection, 'new')).toThrow('step');
});

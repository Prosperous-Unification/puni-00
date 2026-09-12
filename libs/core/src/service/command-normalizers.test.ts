import { expect, test } from 'bun:test';

import { commandNormalizers } from './command-normalizers';

test('preserves priority absence null and number', () => {
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem' })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
  });
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem', priority: null })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    priority: null,
  });
  expect(commandNormalizers.createWorkItem({ kind: 'createWorkItem', priority: 47 })).toEqual({
    kind: 'createWorkItem',
    parentId: null,
    afterId: null,
    priority: 47,
  });
});

test('defaults missing assignee to null', () => {
  expect(commandNormalizers.setAssignee({ kind: 'setAssignee', stepId: 'build' })).toEqual({
    kind: 'setAssignee',
    stepId: 'build',
    personId: null,
  });
});

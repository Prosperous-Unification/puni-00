import { expect, test } from 'bun:test';

import { partitionRuntimeProjects } from './ci-runtime-partitions';

test('partitions all three heavy projects and every new residual project exactly once', () => {
  const selected = ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01', 'core', 'new-runtime'];
  const partitions = partitionRuntimeProjects(selected);
  expect(partitions).toEqual({
    backend: ['wbs-be-01'],
    remote: ['tool-remote-scripts'],
    frontend: ['wbs-fe-01'],
    workspace: ['core', 'new-runtime'],
  });
  expect(Object.values(partitions).flat().sort()).toEqual([...selected].sort());
  for (const project of selected)
    expect(
      Object.values(partitions)
        .flat()
        .filter((name) => name === project),
    ).toHaveLength(1);
});

test('empty residual and individual selections retain explicit ownership', () => {
  for (const project of ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01']) {
    const partitions = partitionRuntimeProjects([project]);
    expect(partitions.workspace).toEqual([]);
    expect(Object.values(partitions).flat()).toEqual([project]);
  }
  expect(partitionRuntimeProjects([])).toEqual({
    backend: [],
    remote: [],
    frontend: [],
    workspace: [],
  });
});

test('duplicate direct ownership refuses', () => {
  expect(() => partitionRuntimeProjects(['wbs-be-01', 'wbs-be-01'])).toThrow(/distinct/);
});

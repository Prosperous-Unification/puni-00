import { expect, test } from 'bun:test';

import { HEAVY_TEST_PROJECTS, partitionRuntimeProjects } from './ci-runtime-partitions';

test('partitions every dedicated project and every new residual project exactly once', () => {
  const selected = [
    'wbs-be-01',
    'tool-remote-scripts',
    'wbs-fe-01',
    'tool-fleet',
    'tool-devsync',
    'wbs-store-sqlite',
    'wbs-core',
    'core',
    'new-runtime',
  ];
  const partitions = partitionRuntimeProjects(selected);
  expect(partitions).toEqual({
    backend: ['wbs-be-01'],
    remote: ['tool-remote-scripts'],
    frontend: ['wbs-fe-01'],
    heavy: ['tool-fleet', 'tool-devsync', 'wbs-store-sqlite', 'wbs-core'],
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
  for (const project of ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01', ...HEAVY_TEST_PROJECTS]) {
    const partitions = partitionRuntimeProjects([project]);
    expect(partitions.workspace).toEqual([]);
    expect(Object.values(partitions).flat()).toEqual([project]);
  }
  expect(partitionRuntimeProjects([])).toEqual({
    backend: [],
    remote: [],
    frontend: [],
    heavy: [],
    workspace: [],
  });
});

// A-CI-WORKSPACE-MEMORY-2: the three longest `bun test` suites and wbs-core's 6–7.6 GiB suite
// leave the workspace shard.
test('the heavy shard owns exactly the four memory- and time-heavy bun test projects', () => {
  expect([...HEAVY_TEST_PROJECTS].sort()).toEqual([
    'tool-devsync',
    'tool-fleet',
    'wbs-core',
    'wbs-store-sqlite',
  ]);
});

test('duplicate direct ownership refuses', () => {
  expect(() => partitionRuntimeProjects(['wbs-be-01', 'wbs-be-01'])).toThrow(/distinct/);
  expect(() => partitionRuntimeProjects(['tool-fleet', 'tool-fleet'])).toThrow(/distinct/);
});

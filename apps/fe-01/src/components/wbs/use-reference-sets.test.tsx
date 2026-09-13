import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createLocalWrite, type RunPlanWrite } from '@/lib/local-write';
import type { RefreshResource } from '@/lib/plan-refresh';
import { fakeProjectApi as fakeApi } from '@/testing/fake-project-api';

import { useReferenceSets } from './use-reference-sets';
import type { TreeRow } from './wbs-rows';

type ReferenceWrites = ReturnType<typeof useReferenceSets>;

const cases: readonly {
  family: string;
  create: (writes: ReferenceWrites, row: TreeRow, name: string) => unknown;
  names: (api: ReturnType<typeof fakeApi>) => Promise<readonly { name: string }[]>;
}[] = [
  {
    family: 'team',
    create: (writes, row, name) => writes.createTeamFor(row.id, name, []),
    names: (api) => api.listTeams(),
  },
  {
    family: 'service',
    create: (writes, row, name) => writes.createServiceFor(row.id, name, []),
    names: (api) => api.listServices(),
  },
  {
    family: 'tag',
    create: (writes, row, name) => writes.createTagFor(row.id, name, []),
    names: (api) => api.listTags(),
  },
  {
    family: 'work-item type',
    create: (writes, row, name) => writes.createTypeFor(row.id, name, []),
    names: (api) => api.listWorkItemTypes(),
  },
  {
    family: 'person',
    create: (writes, row, name) => {
      writes.createPersonFor(row, 'step-dev', name);
    },
    names: (api) => api.listPeople(),
  },
];

describe('new reference-set completed prefixes', () => {
  it.each(cases)('keeps $family in the directory when attachment refuses', async (testCase) => {
    // Proof: changing all five create requests to tree-only failed all five
    // rows with `['tree']`, expected `['tree', 'directory']`. Watched,
    // 2026-09-13.
    const api = fakeApi();
    const made = await api.createWorkItem('p1', {
      parentId: null,
      afterId: null,
      name: 'Reference owner',
    });
    const row = { ...made, teamIds: [], subRows: [] } as unknown as TreeRow;
    api.patchWorkItem = () => Promise.reject(new Error('attachment refused'));
    api.assignPerson = () => Promise.reject(new Error('assignment refused'));
    const completed: (readonly RefreshResource[])[] = [];
    const run: RunPlanWrite = async (action) => {
      const write = createLocalWrite();
      try {
        await action(write);
        return 'landed';
      } catch {
        completed.push(write.completedResources());
        return 'refused';
      }
    };
    const { result } = renderHook(() => useReferenceSets({ run, api, projectId: 'p1' }));
    const name = `New ${testCase.family}`;

    await testCase.create(result.current, row, name);
    await waitFor(() => {
      expect(completed).toEqual([['tree', 'directory']]);
    });
    expect((await testCase.names(api)).map((entry) => entry.name)).toContain(name);
    expect(api.rows[0]?.teamIds ?? []).toEqual([]);
    expect(api.rows[0]?.serviceIds ?? []).toEqual([]);
    expect(api.rows[0]?.tagIds ?? []).toEqual([]);
    expect(api.rows[0]?.typeIds ?? []).toEqual([]);
  });
});

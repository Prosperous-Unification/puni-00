import { expect, it, vi } from 'vitest';

import type { DependencyLookup } from '@/modules/dependency-lookup/contract';

import { resolveDependencyDraft } from './dependency-draft';

const project = { projectId: 'remote', abbreviation: 'PUNI', name: 'Puni' };
function lookup(): DependencyLookup {
  return {
    discoverProjects: vi
      .fn()
      .mockResolvedValue({ kind: 'success', body: { projects: [project], nextCursor: null } }),
    searchEndpoints: vi.fn().mockResolvedValue({
      kind: 'success',
      body: { project, addressRevision: 'r1', candidates: [], nextCursor: null },
    }),
    resolveReference: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        projectId: 'remote',
        endpoint: { scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
        reference: 'PUNI.080.s1-dev',
        addressRevision: 'r1',
      },
    }),
  };
}
it('resolves mixed local, step and qualified tokens with stable endpoint dedupe and source spans', async () => {
  const service = lookup();
  const typed = '010, 010.s1-dev  PUNI.080.s1-dev, puni.080.s1-dev 999';
  const draft = await resolveDependencyDraft({
    typed,
    projectId: 'local',
    rows: [{ id: 'a', number: '010' }],
    nodes: [{ workItemId: 'a', stepId: 'dev', reference: '010.s1-dev' }],
    lookup: service,
  });
  expect(draft.found.map((token) => token.endpoint)).toEqual([
    { projectId: 'local', scope: 'whole', workItemId: 'a' },
    { projectId: 'local', scope: 'node', workItemId: 'a', stepId: 'dev' },
    { projectId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
  ]);
  expect(draft.found.map((token) => typed.slice(token.start, token.end))).toEqual([
    '010',
    '010.s1-dev',
    'PUNI.080.s1-dev',
  ]);
  expect(draft.problems).toEqual(['999 (not found)']);
  expect(service.discoverProjects).toHaveBeenCalledWith('PUNI', null);
});
it('a truncated page cannot establish unique abbreviation ownership', async () => {
  const service = lookup();
  vi.mocked(service.discoverProjects).mockResolvedValue({
    kind: 'success',
    body: { projects: [project], nextCursor: 'more' },
  });
  const draft = await resolveDependencyDraft({
    typed: 'PUNI.080',
    projectId: 'local',
    rows: [],
    nodes: [],
    lookup: service,
  });
  expect(draft.found).toEqual([]);
  expect(draft.problems).toEqual(['PUNI.080 (choose a project)']);
  expect(service.resolveReference).not.toHaveBeenCalled();
});

it('an explicitly selected project stays bound while its first revision is still loading', async () => {
  const service = lookup();
  await resolveDependencyDraft({
    typed: 'PUNI.080.s1-dev',
    projectId: 'local',
    rows: [],
    nodes: [],
    lookup: service,
    observation: { project, revision: null },
  });
  expect(service.discoverProjects).not.toHaveBeenCalled();
  expect(service.searchEndpoints).toHaveBeenCalledWith('remote', '080.s1-dev', null);
  expect(service.resolveReference).toHaveBeenCalledWith('remote', 'PUNI.080.s1-dev', 'r1');
});

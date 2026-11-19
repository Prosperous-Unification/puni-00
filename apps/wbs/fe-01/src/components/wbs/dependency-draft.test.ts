import { expect, it, vi } from 'vitest';

import type { DependencyLookup } from '@/modules/dependency-lookup/contract';

import { resolveDependencyDraft } from './dependency-draft';

const workPackage = { workPackageId: 'remote', abbreviation: 'PUNI', name: 'Puni' };
function lookup(): DependencyLookup {
  return {
    discoverWorkPackages: vi
      .fn()
      .mockResolvedValue({
        kind: 'success',
        body: { workPackages: [workPackage], nextCursor: null },
      }),
    searchEndpoints: vi.fn().mockResolvedValue({
      kind: 'success',
      body: { workPackage, addressRevision: 'r1', candidates: [], nextCursor: null },
    }),
    resolveReference: vi.fn().mockResolvedValue({
      kind: 'success',
      body: {
        workPackageId: 'remote',
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
    workPackageId: 'local',
    rows: [{ id: 'a', number: '010' }],
    nodes: [{ workItemId: 'a', stepId: 'dev', reference: '010.s1-dev' }],
    lookup: service,
  });
  expect(draft.found.map((token) => token.endpoint)).toEqual([
    { workPackageId: 'local', scope: 'whole', workItemId: 'a' },
    { workPackageId: 'local', scope: 'node', workItemId: 'a', stepId: 'dev' },
    { workPackageId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-dev' },
  ]);
  expect(draft.found.map((token) => typed.slice(token.start, token.end))).toEqual([
    '010',
    '010.s1-dev',
    'PUNI.080.s1-dev',
  ]);
  expect(draft.problems).toEqual(['999 (not found)']);
  expect(service.discoverWorkPackages).toHaveBeenCalledWith('PUNI', null);
});
it('a truncated page cannot establish unique abbreviation ownership', async () => {
  const service = lookup();
  vi.mocked(service.discoverWorkPackages).mockResolvedValue({
    kind: 'success',
    body: { workPackages: [workPackage], nextCursor: 'more' },
  });
  const draft = await resolveDependencyDraft({
    typed: 'PUNI.080',
    workPackageId: 'local',
    rows: [],
    nodes: [],
    lookup: service,
  });
  expect(draft.found).toEqual([]);
  expect(draft.problems).toEqual(['PUNI.080 (choose a work package)']);
  expect(service.resolveReference).not.toHaveBeenCalled();
});

it('an explicitly selected work package stays bound while its first revision is still loading', async () => {
  const service = lookup();
  await resolveDependencyDraft({
    typed: 'PUNI.080.s1-dev',
    workPackageId: 'local',
    rows: [],
    nodes: [],
    lookup: service,
    observations: [
      {
        start: 0,
        end: 'PUNI.080.s1-dev'.length,
        token: 'PUNI.080.s1-dev',
        observation: { workPackage, revision: null },
      },
    ],
  });
  expect(service.discoverWorkPackages).not.toHaveBeenCalled();
  expect(service.searchEndpoints).toHaveBeenCalledWith('remote', '080.s1-dev', null);
  expect(service.resolveReference).toHaveBeenCalledWith('remote', 'PUNI.080.s1-dev', 'r1');
});

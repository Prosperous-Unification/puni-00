import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openDependencyLookup } from '@/modules/dependency-lookup/dependency-lookup.feature';

import { httpProjectAddressApi, httpProjectApi } from './wbs-api';

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'http://wbs.test' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('sends explicit stable remote node pairs only to the successor command route', async () => {
  const fetcher = vi
    .fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValue(
      Response.json({ results: [{ index: 0, id: 'dependency' }], undoable: true, redoable: false }),
    );
  vi.stubGlobal('fetch', fetcher);
  await httpProjectApi('token').addTypedDependency(
    'local',
    { projectId: 'remote', scope: 'node', workItemId: 'remote-row', stepId: 'remote-step' },
    { scope: 'whole', workItemId: 'successor' },
    'SS',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  const call = fetcher.mock.calls[0];
  if (typeof call[1]?.body !== 'string') throw new Error('Command body absent');
  expect(call[0]).toBe('/api/projects/local/commands');
  expect(JSON.parse(call[1].body)).toEqual({
    commands: [
      {
        kind: 'addTypedDependency',
        predecessor: {
          projectId: 'remote',
          scope: 'node',
          workItemId: 'remote-row',
          stepId: 'remote-step',
        },
        successor: { scope: 'whole', workItemId: 'successor' },
        type: 'SS',
      },
    ],
  });
});

it.each([undefined, { id: 'wrong-step', code: 'DEV', name: 'Dev', position: 0, ordinal: 1 }])(
  'real address lookup refuses absent or mismatching remote step evidence (%j)',
  async (step) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          project: { projectId: 'remote', abbreviation: 'PUNI', name: 'Remote' },
          addressRevision: 'r1',
          candidates: [
            {
              projectId: 'remote',
              workItemId: 'row',
              number: '080',
              name: 'Build',
              endpoint: { scope: 'node', workItemId: 'row', stepId: 'dev' },
              reference: 'PUNI.080.s1-dev',
              ...(step === undefined ? {} : { step }),
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    const opened = openDependencyLookup({
      projectId: 'local',
      isCurrent: () => true,
      routes: httpProjectAddressApi('token'),
    });
    await expect(opened.lookup.searchEndpoints('remote', '080', null)).rejects.toThrow(
      'Missing or mismatching dependency step evidence',
    );
    opened.close();
  },
);

it('null remote step code retains a valid step identity without inventing a code', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json({
        project: { projectId: 'remote', abbreviation: 'PUNI', name: 'Remote' },
        addressRevision: 'r1',
        candidates: [
          {
            projectId: 'remote',
            workItemId: 'row',
            number: '080',
            name: 'Build',
            endpoint: { scope: 'node', workItemId: 'row', stepId: 'dev' },
            reference: null,
            step: { id: 'dev', code: null, name: 'Dev', position: 0, ordinal: 1 },
          },
        ],
        nextCursor: null,
      }),
    ),
  );
  const opened = openDependencyLookup({
    projectId: 'local',
    isCurrent: () => true,
    routes: httpProjectAddressApi('token'),
  });
  const reply = await opened.lookup.searchEndpoints('remote', '080', null);
  expect(reply).toMatchObject({
    kind: 'success',
    body: { candidates: [{ endpoint: { stepId: 'dev' }, step: { code: null } }] },
  });
  opened.close();
});

it('preserves the production dormant external-authoring refusal through the real command client', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: 'external_dependencies_inactive', at: 0, kind: 'addTypedDependency' },
          { status: 409 },
        ),
      ),
  );
  await expect(
    httpProjectApi('token').addTypedDependency(
      'local',
      { projectId: 'remote', scope: 'whole', workItemId: 'remote-row' },
      { scope: 'whole', workItemId: 'local-row' },
      'FS',
    ),
  ).rejects.toMatchObject({
    problem: { kind: 'refusal', refusal: { error: 'external_dependencies_inactive' } },
  });
});

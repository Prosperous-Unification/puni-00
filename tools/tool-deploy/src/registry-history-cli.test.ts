import { expect, it } from 'bun:test';

import { executeHistoryCommand } from './registry-history-cli';
const enrollment = {
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: 'k8s:cluster/wbs/wbs-solver',
  owner: 'owner',
  registryUrl: 'https://registry.test',
  sshHost: 'registry',
  requiredRepositories: ['wbs-be-01'],
  publicationReceiptPath: '/receipt.json',
};
it('initialization refuses absent trusted configuration, foreign sources and missing actual release-evidence readers', async () => {
  const request = {
    protocol: 'registry-history/1',
    command: 'initialize',
    target: enrollment.target,
  };
  await expectRejection(
    executeHistoryCommand(request, {
      read: () => Promise.reject(new Error('unreadable')),
      select: () => Promise.resolve(enrollment),
    }),
    'unreadable',
  );
  for (const source of [
    {
      clusterUid: 'foreign',
      namespaces: [],
      releaseRecord: { namespace: 'wbs-solver', name: 'wbs-release' },
    },
    {
      clusterUid: 'cluster',
      namespaces: [
        { name: 'wbs', uid: 'wbs' },
        { name: 'wbs-solver', uid: 'solver' },
      ],
    },
  ]) {
    await expectRejection(
      executeHistoryCommand(request, {
        read: () =>
          Promise.resolve({
            schemaVersion: 1,
            environments: [
              {
                kind: 'kubernetes',
                target: enrollment.target,
                firstStartPath: '/unallocated/first.json',
                releasePath: '/unallocated/release.json',
                source,
              },
            ],
          }),
        select: () => Promise.resolve(enrollment),
      }),
      'source identity',
    );
  }
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}

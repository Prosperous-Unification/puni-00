import { expect, it } from 'bun:test';

import { advanceRegistryHistory } from './registry-history';

const prior = {
  schemaVersion: 1 as const,
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: 'k8s:cluster/wbs/wbs-solver',
  source: '/state/release.json',
  genesis: { at: '2026-10-25T12:00:00.000Z', sourceRevision: 'initialized-cluster-observation' },
  authorityRevision: 1,
  releases: [],
  promotion: null,
};
const bundle = {
  operationId: 'bundle-1',
  references: [{ repository: 'wbs/be', digest: `sha256:${'a'.repeat(64)}` }],
  receipt: { state: 'promoted' as const, at: '2026-10-25T12:01:00.000Z' },
};
const receipt = {
  registryId: 'proof',
  product: 'wbs',
  environment: 'prod',
  target: 'k8s:cluster/wbs/wbs-solver',
  authorityRevision: 5,
  releases: [bundle],
  promotion: { operationId: 'deploy-1', candidate: 'bundle-1', at: '2026-10-25T12:01:00.000Z' },
};
it('advances complete owner history once and makes lost-ack retry idempotent', () => {
  const history = advanceRegistryHistory(prior, receipt);
  expect(history).toEqual({ ...prior, ...receipt });
  expect(advanceRegistryHistory(history, receipt)).toEqual(history);
});
it('refuses foreign receipts, lost prior history and altered original promotion evidence', () => {
  const history = { ...prior, ...receipt };
  const next = {
    ...receipt,
    authorityRevision: 6,
    promotion: { operationId: 'deploy-2', candidate: 'bundle-2', at: '2026-10-25T12:02:00.000Z' },
    releases: [
      {
        ...bundle,
        operationId: 'bundle-2',
        receipt: { state: 'promoted' as const, at: '2026-10-25T12:02:00.000Z' },
      },
      bundle,
    ],
  };
  for (const changed of [
    { ...receipt, registryId: 'foreign' },
    { ...next, releases: next.releases.slice(0, 1) },
    {
      ...next,
      releases: [
        next.releases[0],
        { ...bundle, receipt: { state: 'promoted' as const, at: '2026-10-25T12:02:00.000Z' } },
      ],
    },
  ])
    expect(() => advanceRegistryHistory(history, changed)).toThrow();
});

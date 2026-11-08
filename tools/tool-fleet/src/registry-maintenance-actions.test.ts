import { expect, test } from 'bun:test';

import { registryEndpointsWithdrawn } from './registry-maintenance-actions';
import { registryPodsDeclareStorage } from './registry-pod-writers';

test('complete empty pod/endpoint observations are distinct from unavailable or malformed evidence', () => {
  expect(registryPodsDeclareStorage([], ['registry-bounded'], ['/fixed/contents'])).toBe(false);
  expect(registryEndpointsWithdrawn([])).toBe(true);
  expect(() =>
    registryPodsDeclareStorage([{}], ['registry-bounded'], ['/fixed/contents']),
  ).toThrow();
  expect(() => registryEndpointsWithdrawn([{ endpoints: null }])).toThrow();
});
test('pending pod or stale endpoint prevents writer absence before it can become ready', () => {
  expect(
    registryPodsDeclareStorage(
      [
        {
          metadata: { namespace: 'puni-registry' },
          spec: {
            volumes: [
              { name: 'storage', persistentVolumeClaim: { claimName: 'registry-bounded' } },
            ],
          },
        },
      ],
      ['registry-bounded'],
      ['/fixed/contents'],
    ),
  ).toBe(true);
  expect(
    registryEndpointsWithdrawn([
      { endpoints: [{ addresses: ['10.0.0.1'], conditions: { ready: false } }] },
    ]),
  ).toBe(false);
});
test('host-path ancestor can expose registry storage even without a registry PVC', () => {
  expect(
    registryPodsDeclareStorage(
      [
        {
          metadata: { namespace: 'other' },
          spec: { volumes: [{ name: 'host', hostPath: { path: '/fixed' } }] },
        },
      ],
      ['registry-bounded'],
      ['/fixed/contents'],
    ),
  ).toBe(true);
});

test('collection evidence predicate refuses absent or altered durable retirement lineage', async () => {
  const { requireRegistryCollectionEvidence } = await import('./registry-maintenance-state');
  const { createHash } = await import('node:crypto');
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const digest = 'sha256:' + 'a'.repeat(64);
  const deletions = [{ repository: 'owned', digest, tags: ['old'] }];
  const plan = JSON.stringify({
    policy: { retireOperations: ['old'] },
    retireRevisions: [{ repository: 'owned', digest }],
    retireUploads: [],
    retireBlobs: [digest],
    neverUploaded: [],
  });
  const receipt = {
    operationId: 'maintenance',
    operations: ['old'],
    planSha256: hash(plan),
    retireBlobs: [digest],
    neverUploaded: [],
    uploadsSha256: hash('[]'),
    snapshotId: 'b'.repeat(64),
    at: '2026-10-25T00:00:00.000Z',
    deletions,
  };
  const journal = {
    maintenance: { kind: 'retirement', phase: 'deleting', operationId: 'maintenance' },
    maintenanceEvidence: {
      operationId: 'maintenance',
      backup: { snapshotId: receipt.snapshotId },
      plan,
      uploadsVerified: hash('[]'),
      deletions: deletions.map((entry) => ({ ...entry, state: 'verified' })),
    },
    retirements: [receipt],
  };
  requireRegistryCollectionEvidence(journal as never);
  for (const fault of [
    'absent',
    'evidence',
    'snapshot',
    'plan',
    'uploads',
    'deletions',
    'operation',
    'blobs',
  ] as const) {
    const changed = structuredClone(journal);
    if (fault === 'absent') changed.retirements = [];
    if (fault === 'evidence') Object.assign(changed, { maintenanceEvidence: null });
    if (fault === 'snapshot') changed.retirements[0].snapshotId = 'c'.repeat(64);
    if (fault === 'plan') changed.retirements[0].planSha256 = 'c'.repeat(64);
    if (fault === 'uploads') changed.maintenanceEvidence.uploadsVerified = 'c'.repeat(64);
    if (fault === 'deletions') changed.maintenanceEvidence.deletions[0].state = 'pending';
    if (fault === 'operation') changed.retirements[0].operationId = 'foreign';
    if (fault === 'blobs') changed.retirements[0].retireBlobs = [];
    if (fault === 'evidence')
      expect(() => {
        requireRegistryCollectionEvidence(changed as never);
      }).toThrow('GC requires verified backup and exact reconciled deletion evidence');
    else
      expect(() => {
        requireRegistryCollectionEvidence(changed as never);
      }).toThrow();
  }
});

for (const [hostPath, expected] of [
  ['/', true],
  ['/fixed/contents', true],
  ['/fixed/contents/child', true],
  ['/fixed/content', false],
  ['/fixed/contents-other', false],
  [null, false],
] as const) {
  test(
    'host-path writer scope retains exact ancestor and descendant boundaries: ' + String(hostPath),
    () => {
      expect(
        registryPodsDeclareStorage(
          [
            {
              metadata: { namespace: 'other' },
              spec: {
                volumes: [
                  { name: 'owned', ...(hostPath === null ? {} : { hostPath: { path: hostPath } }) },
                ],
              },
            },
          ],
          ['registry-bounded'],
          ['/fixed/contents'],
        ),
      ).toBe(expected);
    },
  );
}

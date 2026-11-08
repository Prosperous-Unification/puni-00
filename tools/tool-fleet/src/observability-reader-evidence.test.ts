import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import type { DiscoveryCommand } from './discover';
import { createObservabilityComposition } from './observability-composition';
import { validateRetainedReaderPrerequisite } from './observability-reader-observation';
const root = join(import.meta.dir, '../../..');
const now = '2026-10-26T12:00:00.000Z';
async function fixture() {
  const assembly = await createObservabilityComposition(root, {
    placement: 'production',
    instances: [
      { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
      { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
    ],
  });
  const configuration = stringify(
    parseDocument(assembly.retainedReader.desiredManifest).getIn(
      ['spec', 'values', 'alternateConfig'],
      true,
    ),
  );
  const sha = createHash('sha256').update(configuration).digest('hex');
  const request = {
    schemaVersion: 1,
    controllerContext: 'authorized-controller',
    context: 'authorized-context',
    targetMarker: 'platform-production',
    identityUID: 'target-uid',
    ownerUID: 'owner-uid',
    sourceUID: 'source-uid',
    sourceRevision: 'main@sha1:1234567890123456789012345678901234567890',
    configurationUID: 'config-uid',
    configurationSHA256: sha,
    workloadUID: 'workload-uid',
    templateChecksum: 'a'.repeat(64),
    maxAgeMs: 30000,
    timeoutMs: 10000,
  };
  const projections: Record<string, unknown> = {
    identity: {
      name: 'puni-cluster-platform-production',
      namespace: 'kube-system',
      uid: 'target-uid',
      marker: 'platform-production',
      immutable: true,
    },
    source: {
      kind: 'GitRepository',
      namespace: 'flux-system',
      name: 'puni-platform',
      uid: 'source-uid',
      revision: request.sourceRevision,
      ready: true,
      generation: 1,
      observedGeneration: 1,
    },
    owner: [
      {
        kind: 'HelmRelease',
        name: 'otel-collector',
        namespace: 'observability',
        uid: 'owner-uid',
        owner: 'observability',
        ownerNamespace: 'flux-system',
        ownerUID: '',
        path: '',
        chart: './infra/platform/charts/opentelemetry-collector-0.173.1.tgz',
        controllerEnabled: false,
        dependencies: [],
        ready: true,
        generation: 1,
        observedGeneration: 1,
        revision: '0.173.1',
        sourceKind: 'GitRepository',
        sourceName: 'puni-platform',
        sourceNamespace: 'flux-system',
        releaseName: 'otel-collector',
        releaseNamespace: 'observability',
      },
    ],
    configuration: {
      name: 'otel-collector-agent',
      namespace: 'observability',
      uid: 'config-uid',
      owner: 'otel-collector',
      ownerNamespace: 'observability',
      configuration,
    },
    workload: {
      name: 'otel-collector-agent',
      namespace: 'observability',
      uid: 'workload-uid',
      owner: 'otel-collector',
      ownerNamespace: 'observability',
      generation: 2,
      observedGeneration: 2,
      desired: 1,
      ready: 1,
      updated: 1,
      checksum: request.templateChecksum,
      configuration: 'otel-collector-agent',
    },
  };
  return { request, projections };
}
function runner(projections: Record<string, unknown>, observedAt = now) {
  return (command: DiscoveryCommand) => {
    const key = command.source.split(':').at(-1);
    if (!key || !Object.hasOwn(projections, key)) throw new Error('missing evidence');
    return Promise.resolve({
      exitCode: 0,
      stdout: JSON.stringify(projections[key]),
      stderr: '',
      observedAt,
    });
  };
}
test('read-only retained-reader prerequisite binds fresh observed target, owner, source and installed configuration but leaves runtime false', async () => {
  const { request, projections } = await fixture();
  expect(
    await validateRetainedReaderPrerequisite(request, {
      run: runner(projections),
      now: () => new Date(now),
    }),
  ).toMatchObject({
    observedSourcePrerequisite: true,
    effectiveReaderVerified: false,
    activationReady: false,
  });
});
test.each([
  'stale',
  'target',
  'source',
  'owner',
  'configuration',
  'workload',
  'missing',
  'unknown',
] as const)('retained-reader prerequisite refuses independent %s evidence', async (fault) => {
  const { request, projections } = await fixture();
  if (fault === 'target') (projections['identity'] as Record<string, unknown>)['uid'] = 'foreign';
  if (fault === 'source') (projections['source'] as Record<string, unknown>)['revision'] = 'stale';
  if (fault === 'owner') (projections['owner'] as Record<string, unknown>[])[0]['uid'] = 'foreign';
  if (fault === 'configuration')
    (projections['configuration'] as Record<string, unknown>)['uid'] = 'foreign';
  if (fault === 'workload')
    (projections['workload'] as Record<string, unknown>)['checksum'] = 'foreign';
  if (fault === 'missing') delete projections['configuration'];
  const input = fault === 'unknown' ? { ...request, credential: 'PRIVATE-MARKER' } : request;
  expect(
    validateRetainedReaderPrerequisite(input, {
      run: runner(projections, fault === 'stale' ? '2026-10-26T11:00:00.000Z' : now),
      now: () => new Date(now),
    }),
  ).rejects.toThrow(/Retained reader/);
});

test.each(['denied', 'malformed', 'private projection', 'future', 'rollout', 'context'])(
  'retained-reader observation refuses %s and never emits private contents',
  async (fault) => {
    const { request, projections } = await fixture();
    if (fault === 'private projection')
      (projections['owner'] as Record<string, unknown>[])[0]['credential'] = 'PRIVATE-MARKER';
    if (fault === 'rollout') (projections['workload'] as Record<string, unknown>)['updated'] = 0;
    const input = fault === 'context' ? { ...request, controllerContext: '' } : request;
    const run =
      fault === 'denied'
        ? () =>
            Promise.resolve({
              exitCode: 1,
              stdout: 'PRIVATE-MARKER',
              stderr: 'PRIVATE-MARKER',
              observedAt: now,
            })
        : fault === 'malformed'
          ? () =>
              Promise.resolve({
                exitCode: 0,
                stdout: '{PRIVATE-MARKER',
                stderr: '',
                observedAt: now,
              })
          : runner(projections, fault === 'future' ? '2026-10-27T12:00:00.000Z' : now);
    try {
      await validateRetainedReaderPrerequisite(input, { run, now: () => new Date(now) });
      throw new Error('test expected refusal');
    } catch (failure) {
      expect(String(failure)).toContain('Retained reader');
      expect(String(failure)).not.toContain('PRIVATE-MARKER');
      expect((failure as Error).cause).toBeUndefined();
    }
  },
);

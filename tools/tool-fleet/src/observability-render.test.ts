import { join } from 'node:path';

import { expect, test } from 'bun:test';
import { parseDocument } from 'yaml';

import {
  createObservabilityComposition,
  selectObservabilityComposition,
} from './observability-composition';
import { renderObservabilityReleases } from './observability-render';
const root = join(import.meta.dir, '../../..');
const request = {
  placement: 'local',
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
};
test('full pinned renderer preserves nine owner identities and namespace-distinct app releases', async () => {
  const assembly = await createObservabilityComposition(root, request);
  const releases = selectObservabilityComposition(assembly, ['dev', 'prod', 'platform']).releases;
  const rendered = await renderObservabilityReleases(root, '/tmp/puni-parity-tools', releases);
  expect(Object.keys(rendered).length).toBe(9);
  expect(rendered['observability-dev/elasticsearch']).toContain('kind: Elasticsearch');
  expect(rendered['observability/elasticsearch']).toContain('kind: Elasticsearch');
});
test('full pinned renderer refuses duplicate owners before overwrite', async () => {
  const assembly = await createObservabilityComposition(root, request);
  const release = assembly.instances[0].releases[0];
  expect(
    renderObservabilityReleases(root, '/tmp/puni-parity-tools', [release, release]),
  ).rejects.toThrow(/owner/);
});
test.each(['releaseName', 'targetNamespace'])(
  'full pinned renderer refuses unsupported explicit %s instead of misrendering identity',
  async (field) => {
    const assembly = await createObservabilityComposition(root, request);
    const release = structuredClone(assembly.instances[0].releases[0]);
    const manifest = parseDocument(release.manifest);
    manifest.setIn(['spec', field], 'foreign');
    release.manifest = manifest.toString();
    expect(renderObservabilityReleases(root, '/tmp/puni-parity-tools', [release])).rejects.toThrow(
      /identity/,
    );
  },
);

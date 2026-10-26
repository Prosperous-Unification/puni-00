import { join } from 'node:path';

import { expect, test } from 'bun:test';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import { createObservabilitySource } from './observability-source';
const root = join(import.meta.dir, '../../..');
export const network = {
  api: ['10.1.0.4/32'],
  observer: ['172.31.100.10/32'],
  grafana: ['172.31.100.11/32'],
  s3: ['172.31.100.12/32'],
  alertDelivery: ['172.31.100.13/32'],
  publicProbes: ['172.31.100.14/32'],
};
export const request = (placement: 'local' | 'production') => ({
  placement,
  instances: [
    { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
    { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
  ],
  network,
});
test('complete source adds default deny, scoped discovery and separate ingest roles without changing immutable assembly flags', async () => {
  const source = await createObservabilitySource(root, request('production'));
  expect(source.assembly.securityConformant).toBe(false);
  expect(source.requiredBindingsVerified).toBe(false);
  for (const instance of source.instances) {
    const security = parseAllDocuments(instance.security);
    expect(
      security.some(
        (doc) =>
          doc.get('kind') === 'NetworkPolicy' && doc.getIn(['metadata', 'name']) === 'default-deny',
      ),
    ).toBe(true);
    expect(security.some((doc) => doc.get('kind') === 'Role')).toBe(true);
    const monitoring = source.releases.find(
      (release) => release.owner === `${instance.namespace}/kube-prometheus-stack`,
    );
    expect(
      parseDocument(monitoring?.manifest ?? '').getIn([
        'spec',
        'values',
        'prometheus',
        'prometheusSpec',
        'ruleNamespaceSelector',
        'matchLabels',
        'kubernetes.io/metadata.name',
      ]),
    ).toBe(instance.namespace);
    expect(instance.authority.ingest.indices[0].names).toContain(
      `metrics-*.otel-${instance.environment}`,
    );
    expect(instance.authority.ingest.indices[0].privileges).toEqual([
      'auto_configure',
      'create_doc',
    ]);
    expect(instance.native).toContain('signal-elastic-ingest');
  }
  expect(source.handoffs.every((handoff) => Object.is(handoff.applied, false))).toBe(true);
});
test.each(['missing', 'broad', 'unknown', 'duplicate'])(
  'full source refuses %s network binding input',
  (fault) => {
    const input = request('production');
    const networkInput =
      fault === 'missing'
        ? { ...network, observer: [] }
        : fault === 'duplicate'
          ? { ...network, s3: [network.s3[0], network.s3[0]] }
          : fault === 'broad'
            ? { ...network, s3: ['0.0.0.0/0'] }
            : { ...network, secret: 'PRIVATE' };
    expect(createObservabilitySource(root, { ...input, network: networkInput })).rejects.toThrow(
      /source/,
    );
  },
);

test('full source keeps platform ingest, application ingest and setup admin separate and removes broad native metrics admission', async () => {
  const source = await createObservabilitySource(root, request('production'));
  const reader = source.releases.find(
    (release) => release.owner === 'observability/otel-collector',
  );
  expect(
    parseDocument(reader?.manifest ?? '').getIn([
      'spec',
      'values',
      'alternateConfig',
      'exporters',
      'elasticsearch',
      'user',
    ]),
  ).toBe('platform-ingest');
  expect(source.retainedListeners.every((listener) => listener.trustDomain === 'platform')).toBe(
    true,
  );
  for (const instance of source.instances) {
    const policy = parseAllDocuments(instance.native).find(
      (document) => document.get('kind') === 'NetworkPolicy',
    );
    expect(parseDocument(stringify(policy?.getIn(['spec', 'ingress']))).toJSON()).toEqual([]);
    expect(
      instance.requiredSecrets.find((secret) => secret.name === 'elasticsearch-es-elastic-user')
        ?.authority,
    ).toBe('setup-admin');
  }
});

test('retained reader enrolled flow includes HTTP OTLP 4318', async () => {
  const source = await createObservabilitySource(root, request('production'));
  const policy = parseAllDocuments(source.instances[1].security).find(
    (document) => document.getIn(['metadata', 'name']) === 'allow-reader',
  );
  const expected = {
    from: [{ ipBlock: { cidr: '10.1.0.4/32' } }],
    ports: [4317, 4318, 14317, 13133].map((port) => ({ protocol: 'TCP', port })),
  };
  expect(parseDocument(stringify(policy?.getIn(['spec', 'ingress']))).toJSON()).toContainEqual(
    expected,
  );
});
test('same-owner snapshot patch has an existing parent and preserves metadata', async () => {
  const source = await createObservabilitySource(root, request('production'));
  const handoff = source.handoffs.find((handoff) => handoff.path.endsWith('/snapshots.yaml'));
  const resource = handoff?.resources.find((resource) => resource.identity.includes(':CronJob:'));
  if (!resource) throw new Error('fixture CronJob absent');
  const document = parseDocument(resource.manifest);
  for (const patch of resource.patches as { op: string; path: string; value: unknown }[]) {
    const path = patch.path.slice(1).split('/');
    expect(document.hasIn(path.slice(0, -1))).toBe(true);
    document.setIn(path, document.createNode(patch.value));
  }
  expect(
    document.getIn([
      'spec',
      'jobTemplate',
      'spec',
      'template',
      'metadata',
      'labels',
      'puni.dev/observability-flow',
    ]),
  ).toBe('snapshot-check');
  expect(document.getIn(['metadata', 'name'])).toBe('elastic-snapshot-check');
  expect(handoff?.applied).toBe(false);
});

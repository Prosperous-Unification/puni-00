import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { parseAllDocuments, stringify } from 'yaml';

import { createObservabilitySource, type ObservabilitySource } from './observability-source';
import {
  assertObservabilitySourceParity,
  reviewObservabilitySourceDifferences,
} from './observability-source-parity';
import { renderObservabilitySource } from './observability-source-render';
import { provisionObservabilityTools } from './observability-tools.fixture';

const tools = await provisionObservabilityTools();
const root = join(import.meta.dir, '../../..');
let local: ObservabilitySource,
  production: ObservabilitySource,
  left: Record<string, string>,
  right: Record<string, string>;
beforeAll(async () => {
  const network = {
    api: ['10.1.0.4/32'],
    observer: ['172.31.100.10/32'],
    grafana: ['172.31.100.11/32'],
    s3: ['172.31.100.12/32'],
    alertDelivery: ['172.31.100.13/32'],
    publicProbes: ['172.31.100.14/32'],
  };
  const request = (placement: 'local' | 'production') => ({
    placement,
    instances: [
      { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
      { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
    ],
    network,
  });
  local = await createObservabilitySource(root, request('local'));
  production = await createObservabilitySource(root, request('production'));
  left = await renderObservabilitySource(root, tools, local);
  right = await renderObservabilitySource(root, tools, production);
});
test('full actual pinned source parity expands configuration payloads and checks every sibling', () => {
  const differences = reviewObservabilitySourceDifferences(local, production);
  expect(
    assertObservabilitySourceParity(local, left, production, right, differences),
  ).toMatchObject({ wholeRenderParity: true, runtimeRehearsal: false });
});
test.each(['unknown', 'unused', 'subtree', 'stale', 'duplicate'] as const)(
  'full parity refuses %s independently supplied exception',
  (fault) => {
    const differences = reviewObservabilitySourceDifferences(local, production);
    const extra = {
      path:
        fault === 'subtree'
          ? '/rendered'
          : fault === 'unused'
            ? '/rendered/observability~1eck-operator/StatefulSet:observability:elastic-operator/kind'
            : '/untrusted',
      local: 1,
      production: 2,
      reason: 'matching metadata grants no authority',
      verification: 'forged',
    };
    if (fault === 'stale') differences[0] = { ...differences[0], local: 'foreign' };
    else if (fault === 'duplicate') differences.push(differences[0]);
    else differences.push(extra);
    expect(() =>
      assertObservabilitySourceParity(local, left, production, right, differences),
    ).toThrow(
      fault === 'stale'
        ? /unauthorized/
        : fault === 'duplicate'
          ? /duplicate/
          : fault === 'unused'
            ? /unused/
            : /unknown or subtree/,
    );
  },
);
test('full parity rejects changed S3 sibling even with a matching exception record', () => {
  const changed = { ...right };
  const owner = 'observability-dev/elasticsearch';
  const documents = parseAllDocuments(changed[owner]);
  documents[0].setIn(['spec', 'nodeSets', 0, 'config', 's3.client.default.protocol'], 'http');
  changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
  const differences = reviewObservabilitySourceDifferences(local, production);
  differences.push({
    path: '/rendered/observability-dev~1elasticsearch/Elasticsearch:observability-dev:elasticsearch/spec/nodeSets/0/config/s3.client.default.protocol',
    local: 'https',
    production: 'http',
    reason: 'same fake metadata',
    verification: 'forged',
  });
  expect(() =>
    assertObservabilitySourceParity(local, left, production, changed, differences),
  ).toThrow();
});

test('explicit disposable production-role policy changes only eight reviewed local capacity scalars', async () => {
  const request = structuredClone(local.assembly.request);
  request.instances[1].policy = 'disposable-rehearsal';
  const disposable = await createObservabilitySource(root, { ...request, network: local.network });
  const { renderObservabilityReleases } = await import('./observability-render');
  const changed = await renderObservabilityReleases(
    root,
    tools,
    disposable.releases.filter((release) => release.owner === 'observability/elasticsearch'),
  );
  expect(
    assertObservabilitySourceParity(
      disposable,
      { ...left, ...changed },
      production,
      right,
      reviewObservabilitySourceDifferences(disposable, production),
    ),
  ).toMatchObject({ reviewedDifferences: 31, wholeRenderParity: true, runtimeRehearsal: false });
});

test('full parity refuses changed unreviewed metadata sibling', () => {
  const changed = { ...right };
  const owner = 'observability-dev/elasticsearch';
  const documents = parseAllDocuments(changed[owner]);
  documents[0].setIn(['metadata', 'labels', 'unreviewed'], 'changed');
  changed[owner] = documents.map((document) => stringify(document.toJSON())).join('---\n');
  expect(() =>
    assertObservabilitySourceParity(
      local,
      left,
      production,
      changed,
      reviewObservabilitySourceDifferences(local, production),
    ),
  ).toThrow(/unreviewed/);
});
test('full parity refuses reversed placement pair', () => {
  expect(() => assertObservabilitySourceParity(production, right, local, left, [])).toThrow(
    /placement pair/,
  );
});

test('full parity refuses common ES container privilege weakening in both placements', () => {
  const captures = [
    { source: local, rendered: { ...left } },
    { source: production, rendered: { ...right } },
  ];
  for (const capture of captures) {
    const owner = 'observability-dev/elasticsearch';
    const documents = parseAllDocuments(capture.rendered[owner]);
    documents[0].setIn(
      [
        'spec',
        'nodeSets',
        0,
        'podTemplate',
        'spec',
        'containers',
        0,
        'securityContext',
        'allowPrivilegeEscalation',
      ],
      true,
    );
    capture.rendered[owner] = documents
      .map((document) => stringify(document.toJSON()))
      .join('---\n');
  }
  expect(() =>
    assertObservabilitySourceParity(
      local,
      captures[0].rendered,
      production,
      captures[1].rendered,
      reviewObservabilitySourceDifferences(local, production),
    ),
  ).toThrow(/container security/);
});

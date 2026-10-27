import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { beforeAll, expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { createObservabilitySource, type ObservabilitySource } from './observability-source';
import {
  indexObservabilitySource,
  type ObservabilitySourceIndex,
  renderObservabilitySource,
} from './observability-source-render';
import * as selected from './observability-source-resources';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
let source: ObservabilitySource;
let indexed: ObservabilitySourceIndex;
let rendered: Record<string, string>;
let lockBytes: string;
beforeAll(async () => {
  source = await createObservabilitySource(root, {
    placement: 'local',
    instances: [
      { environment: 'dev', namespace: 'observability-dev', policy: 'development' },
      { environment: 'prod', namespace: 'observability', policy: 'retained-production' },
    ],
    network: {
      api: ['10.1.0.4/32'],
      observer: ['172.31.100.10/32'],
      grafana: ['172.31.100.11/32'],
      s3: ['172.31.100.12/32'],
      alertDelivery: ['172.31.100.13/32'],
      publicProbes: ['172.31.100.14/32'],
    },
  });
  const fixturePath = process.env['PUNI_GENERATED_TRAITS_FIXTURE'];
  rendered =
    fixturePath === undefined
      ? await renderObservabilitySource(root, await provisionObservabilityTools(), source)
      : type('Record<string,string>').assert(JSON.parse(await readFile(fixturePath, 'utf8')));
  indexed = indexObservabilitySource(rendered);
  lockBytes = await readFile(join(root, 'infra/versions/toolchain.json'), 'utf8');
  const exportPath = process.env['PUNI_GENERATED_TRAITS_EXPORT'];
  if (exportPath !== undefined) await writeFile(exportPath, JSON.stringify(fixture().frames));
});

test('shared selected reader returns eight named role inputs without changing assertion API', () => {
  expect(selected.readObservabilitySelectedResources).toBeFunction();
  expect(
    Object.values(indexObservabilitySource(fixture().frames)).flatMap((resources) =>
      Object.keys(resources),
    ),
  ).toHaveLength(12);
  const inputs = selected.readObservabilitySelectedResources(source, indexed);
  expect(inputs.roles).toHaveLength(8);
  expect(inputs.roles[0].initContainers.map((container) => container.name)).toEqual([
    'elastic-internal-init-filesystem',
    'elastic-internal-init-keystore',
    'elastic-internal-suspend',
    'prepare-s3-trust',
  ]);
  selected.assertObservabilitySelectedResources(source, indexed);
});

function fixture() {
  const selectedOwners = Object.fromEntries(
    Object.entries(indexed)
      .filter(
        ([owner]) =>
          !owner.endsWith('/native') &&
          !owner.endsWith('/security') &&
          !owner.endsWith('/otel-collector'),
      )
      .map(([owner, manifests]) => [
        owner,
        Object.values(manifests).filter(
          (manifest) =>
            ['Elasticsearch', 'Kibana', 'Prometheus', 'Alertmanager'].includes(
              String(manifest['kind']),
            ) ||
            (['observability/eck-operator', 'observability/prometheus-controller'].includes(
              owner,
            ) &&
              ['Deployment', 'StatefulSet', 'Job'].includes(String(manifest['kind']))),
        ),
      ]),
  );
  const frames = Object.fromEntries(
    Object.entries(selectedOwners).map(([owner, manifests]) => [
      owner,
      manifests.map((manifest) => stringify(manifest)).join('---\n'),
    ]),
  );
  return {
    source: structuredClone(source),
    frames,
    lock: { bytes: lockBytes, sha256: hash(lockBytes) },
  };
}
function inventory(frames: Record<string, string>) {
  const owners = indexObservabilitySource(frames);
  return Object.entries(frames).map(([owner, bytes]) => ({
    owner,
    sha256: hash(bytes),
    resources: Object.keys(owners[owner]).sort(),
  }));
}
function edit(
  frames: Record<string, string>,
  owner: string,
  kind: string,
  change: (document: ReturnType<typeof parseDocument>) => void,
) {
  const manifests = indexObservabilitySource({ [owner]: frames[owner] })[owner];
  frames[owner] = Object.values(manifests)
    .map((manifest) => {
      const document = parseDocument(stringify(manifest));
      if (manifest['kind'] === kind) change(document);
      return document.toString();
    })
    .join('---\n');
}

test('selected adapter derives edited source quantities and claims as partial traits for both namespaces', async () => {
  expect(existsSync(join(import.meta.dir, 'observability-generated-capacity.ts'))).toBe(true);
  const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
  const packet = fixture();
  edit(packet.frames, 'observability-dev/kube-prometheus-stack', 'Prometheus', (document) => {
    for (const path of [
      ['spec', 'resources'],
      ['spec', 'containers', 0, 'resources'],
    ]) {
      document.setIn([...path, 'limits', 'memory'], '1200Mi');
      document.setIn([...path, 'requests', 'cpu'], '333m');
    }
    document.setIn(
      ['spec', 'storage', 'volumeClaimTemplate', 'spec', 'resources', 'requests', 'storage'],
      '11Gi',
    );
  });
  const traits = deriveSelectedCapacityTraits(
    packet.source,
    packet.frames,
    inventory(packet.frames),
    packet.lock,
  );
  expect(traits).toHaveLength(8);
  expect(
    traits.map((trait) => ({
      state: trait.state,
      effectivePodObserved: trait.effectivePodObserved,
    })),
  ).toEqual(Array.from({ length: 8 }, () => ({ state: 'partial', effectivePodObserved: false })));
  expect(
    traits
      .flatMap((trait) => trait.missingFacts)
      .filter((fact) => fact.startsWith('unsupported-source:')),
  ).toEqual([]);
  const prometheus = traits.find(
    (trait) => trait.identity === 'Prometheus:observability-dev:kps-prometheus',
  );
  expect(prometheus).toMatchObject({
    scope: 'source-derived-capacity-traits',
    state: 'partial',
    effectivePodObserved: false,
    replicas: 1,
    perReplica: { memoryMiB: 1264, cpuMilli: 343, ephemeralMiB: 1088 },
    claims: [{ name: 'prometheus-kps-prometheus-db', requestedMiB: 11264 }],
    concurrency: {
      state: 'unassessed',
      missingFact: 'operator-reconciliation-and-terminating-overlap',
    },
    memoryVolume: {
      name: 'config-out',
      upperBoundMiB: 1264,
      literalSizeLimit: 'absent',
      enforcement: 'unobserved',
    },
  });
  expect(prometheus?.initContainers.map((container) => container.name)).toEqual([
    'init-config-reloader',
  ]);
  expect(prometheus?.imageOrigins.find((origin) => origin.name === 'config-reloader')?.origin).toBe(
    'pinned-controller-reloader-flag',
  );
  expect(prometheus?.source.sha256).toBe(
    hash(packet.frames['observability-dev/kube-prometheus-stack']),
  );
  expect(prometheus?.runtime).toMatchObject({
    lockSHA256: hash(lockBytes),
    kubernetesCommit: '5f3efbf9f6b592422439471c5fe1a1ab2887e189',
  });
  expect(prometheus?.missingFacts).toContain('generated-readonly-input-memory-overhead');
  expect(prometheus?.missingFacts).toContain('admitted-pod-ancestor-memory-cgroup-tmpfs-and-swap');
  const elastic = traits.filter((trait) => trait.kind === 'Elasticsearch');
  expect(elastic.map((trait) => trait.perReplica?.memoryMiB)).toEqual([2048, 4096]);
  expect(elastic.map((trait) => trait.claims[0].requestedMiB)).toEqual([10240, 102400]);
  expect(elastic[0].initContainers.map((container) => container.name)).toEqual([
    'elastic-internal-init-filesystem',
    'elastic-internal-init-keystore',
    'elastic-internal-suspend',
    'prepare-s3-trust',
  ]);
  expect(elastic[0].missingFacts).toContain('keystore-secret-resource-realization');
  expect(
    elastic[0].imageOrigins.find((origin) => origin.name === 'prepare-s3-trust')?.pointer,
  ).toBe(
    'Elasticsearch:observability-dev:elasticsearch/spec/nodeSets/0/podTemplate/spec/initContainers/prepare-s3-trust',
  );
  expect(elastic[0].volumes.find((volume) => volume.name === 'downward-api')?.projection).toContain(
    'metadata.labels',
  );
  expect(
    elastic[0].volumes.find((volume) => volume.name === 'downward-api')?.projection,
  ).not.toContain('metadata.annotations');
  expect(
    traits
      .filter((trait) => trait.kind === 'Kibana')
      .every(
        (trait) =>
          trait.claims.length === 0 &&
          trait.volumes.filter((volume) => volume.kind === 'emptyDir').length === 5,
      ),
  ).toBe(true);
  expect(
    traits
      .filter((trait) => trait.kind === 'Alertmanager')
      .map((trait) => trait.claims[0].requestedMiB),
  ).toEqual([1024, 1024]);
  expect(new Set(traits.map((trait) => trait.source.pointer)).size).toBe(8);
});

function appendNode(
  document: ReturnType<typeof parseDocument>,
  change?: (node: ReturnType<typeof parseDocument>) => void,
) {
  const node = parseDocument(stringify(document.getIn(['spec', 'nodeSets', 0])));
  node.set('name', 'extra');
  change?.(node);
  const added: unknown = node.toJSON();
  document.addIn(['spec', 'nodeSets'], added);
}
const additions: [
  string,
  string,
  string,
  (document: ReturnType<typeof parseDocument>) => void,
  string,
][] = [
  [
    'ES count',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['spec', 'nodeSets', 0, 'count'], 2);
    },
    '/spec/nodeSets',
  ],
  [
    'ES node name',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['spec', 'nodeSets', 0, 'name'], 'other');
    },
    '/spec/nodeSets',
  ],
  [
    'node resource override',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['spec', 'nodeSets', 0, 'resources'], { limits: { memory: '4Gi' } });
    },
    '/spec/nodeSets/0/resources',
  ],
  [
    'container resource claim',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'containers', 0, 'resourceClaims'],
        [{ name: 'extra' }],
      );
    },
    '/containers/kibana/resourceClaims',
  ],
  [
    'host PID',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'hostPID'], true);
    },
    '/podTemplate/spec/hostPID',
  ],
  [
    'host network',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'hostNetwork'], true);
    },
    '/spec/hostNetwork',
  ],
  [
    'node affinity',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'affinity', 'nodeAffinity'], {});
    },
    '/spec/affinity',
  ],
  [
    'scratch medium',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'volumes', 0, 'emptyDir', 'medium'], 'Memory');
    },
    '/volumes/kibana-data/medium',
  ],
  [
    'ES secureSettings',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['spec', 'secureSettings'], []);
    },
    '/spec/secureSettings',
  ],

  [
    'extra nodeSet',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      appendNode(document);
    },
    '/spec/nodeSets',
  ],
  [
    'zero replica shape',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'count'], 0);
    },
    '/spec/count',
  ],
  [
    'arbitrary mount',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.addIn(
        ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'containers', 0, 'volumeMounts'],
        { name: 's3-trust', mountPath: '/extra' },
      );
    },
    '/containers/elasticsearch/volumeMounts',
  ],
  [
    'multiple replicas',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'replicas'], 2);
    },
    '/spec/replicas',
  ],
  [
    'multiple shards',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'shards'], 2);
    },
    '/spec/shards',
  ],
  [
    'Thanos sidecar',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'thanos'], { image: 'foreign' });
    },
    '/spec/thanos',
  ],
  [
    'arbitrary Pod template',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'podTemplate'], { spec: { overhead: { memory: '1Gi' } } });
    },
    '/spec/podTemplate',
  ],
  [
    'secureSettings branch',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'secureSettings'], [{ secretName: 'extra' }]);
    },
    '/spec/secureSettings',
  ],
  [
    'Pod resource policy',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'resources'], { limits: { memory: '2Gi' } });
    },
    '/podTemplate/spec/resources',
  ],
  [
    'node placement',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'nodeSelector'], { foreign: 'true' });
    },
    '/podTemplate/spec/nodeSelector',
  ],
  [
    'restartable init',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'initContainers', 0, 'restartPolicy'],
        'Always',
      );
    },
    '/initContainers/elastic-internal-init/restartPolicy',
  ],
  [
    'container resizing',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'containers', 0, 'resizePolicy'],
        [{ resourceName: 'memory', restartPolicy: 'NotRequired' }],
      );
    },
    '/containers/kibana/resizePolicy',
  ],
  [
    'extra claim reference',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.addIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes'], {
        name: 'foreign-store',
        persistentVolumeClaim: { claimName: 'foreign' },
      });
    },
    '/volumes/foreign-store',
  ],
  [
    'CSI extra volume',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.addIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes'], {
        name: 'external',
        csi: { driver: 'example.test' },
      });
    },
    '/volumes/external',
  ],
  [
    'template metadata',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'metadata', 'annotations'], {
        'example.test/inject': 'sidecar',
      });
    },
    '/spec/podTemplate/metadata',
  ],
  [
    'readonly extra volume',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.addIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes'], {
        name: 'extra',
        secret: { secretName: 'extra' },
      });
    },
    '/volumes/extra',
  ],
  [
    'changed downward branch',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(
        ['metadata', 'annotations', 'eck.k8s.elastic.co/downward-node-labels'],
        'zone',
      );
    },
    '/metadata/annotations/eck.k8s.elastic.co/downward-node-labels',
  ],
];
test.each(additions)(
  'valid unsupported %s stays an exact noncharging fact',
  async (_name, owner, kind, change, path) => {
    const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
    const packet = fixture();
    edit(packet.frames, owner, kind, change);
    const traits = deriveSelectedCapacityTraits(
      packet.source,
      packet.frames,
      inventory(packet.frames),
      packet.lock,
    );
    const trait = traits.find(
      (trait) => trait.kind === kind && trait.namespace === 'observability-dev',
    );
    expect(trait?.missingFacts.some((fact) => fact.endsWith(path))).toBe(true);
    expect(trait?.perReplica).toBeNull();
  },
);
const malformed: [
  string,
  string,
  string,
  (document: ReturnType<typeof parseDocument>) => void,
  RegExp,
][] = [
  [
    'malformed annotations',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['metadata', 'annotations'], 'invalid');
    },
    /source-malformed/,
  ],
  [
    'empty claim class',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'storage', 'volumeClaimTemplate', 'spec', 'storageClassName'], '');
    },
    /storageClassName/,
  ],
  [
    'claim access mode',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(
        ['spec', 'storage', 'volumeClaimTemplate', 'spec', 'accessModes'],
        ['ReadWriteMany'],
      );
    },
    /claim-shape/,
  ],
  [
    'fractional count',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'count'], 1.5);
    },
    /integer/,
  ],

  [
    'missing map',
    'observability-dev/kibana',
    'Kibana',
    (document) =>
      document.deleteIn(['spec', 'podTemplate', 'spec', 'initContainers', 0, 'resources']),
    /selected resource/,
  ],
  [
    'foreign role',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'containers', 0, 'name'], 'foreign');
    },
    /selected resource/,
  ],
  [
    'duplicate role',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.addIn(
        ['spec', 'podTemplate', 'spec', 'containers'],
        document.getIn(['spec', 'podTemplate', 'spec', 'containers', 0]),
      );
    },
    /selected resource/,
  ],
  [
    'request exceeds limit',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'containers', 0, 'resources', 'requests', 'memory'],
        '2Gi',
      );
    },
    /memory-unknown/,
  ],
  [
    'invalid quantity',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'containers', 0, 'resources', 'requests', 'cpu'],
        '1Mi',
      );
    },
    /cpu-unknown/,
  ],
  [
    'malformed CSI union',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.addIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes'], {
        name: 'external',
        csi: { driver: 'example.test' },
        secret: { secretName: 'foreign' },
      });
    },
    /workload-volume-unsupported/,
  ],
  [
    'contradictory volume',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes', 0, 'secret'], {
        secretName: 'extra',
      });
    },
    /workload-volume-unsupported/,
  ],
  [
    'claim foreign namespace',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(
        ['spec', 'nodeSets', 0, 'volumeClaimTemplates', 0, 'metadata', 'namespace'],
        'observability',
      );
    },
    /claim-binding/,
  ],
  [
    'claim name',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      document.setIn(
        ['spec', 'nodeSets', 0, 'volumeClaimTemplates', 0, 'metadata', 'name'],
        'foreign',
      );
    },
    /claim-binding/,
  ],
  [
    'claim bound volume',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'storage', 'volumeClaimTemplate', 'spec', 'volumeName'], 'foreign');
    },
    /claim-binding/,
  ],
  [
    'zero claim',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(
        ['spec', 'storage', 'volumeClaimTemplate', 'spec', 'resources', 'requests', 'storage'],
        '0Mi',
      );
    },
    /claim-shape/,
  ],
  [
    'contradictory primary map',
    'observability-dev/kube-prometheus-stack',
    'Prometheus',
    (document) => {
      document.setIn(['spec', 'resources', 'limits', 'memory'], '2Gi');
    },
    /primary-resource-map/,
  ],
  [
    'missing provider flag',
    'observability/prometheus-controller',
    'Deployment',
    (document) => {
      const path = ['spec', 'template', 'spec', 'containers', 0, 'args'];
      const flags = type('string[]').assert(
        parseDocument(stringify(document.getIn(path))).toJSON(),
      );
      document.setIn(
        path,
        flags.filter((flag) => !flag.startsWith('--prometheus-config-reloader=')),
      );
    },
    /reloader-image/,
  ],
  [
    'unsupported service version',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'version'], '9.4.0');
    },
    /service-version/,
  ],
  [
    'malformed extra nodeSet',
    'observability-dev/elasticsearch',
    'Elasticsearch',
    (document) => {
      appendNode(document, (node) => {
        node.setIn(
          ['podTemplate', 'spec', 'containers', 0, 'resources', 'limits', 'memory'],
          'invalid',
        );
      });
    },
    /memory-unknown/,
  ],
  [
    'malformed init policy',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'podTemplate', 'spec', 'initContainers', 0, 'restartPolicy'], {});
    },
    /source-malformed/,
  ],
  [
    'service image drift',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(['spec', 'image'], 'foreign@sha256:' + 'b'.repeat(64));
    },
    /service-image/,
  ],
  [
    'container image drift',
    'observability-dev/kibana',
    'Kibana',
    (document) => {
      document.setIn(
        ['spec', 'podTemplate', 'spec', 'containers', 0, 'image'],
        'foreign@sha256:' + 'b'.repeat(64),
      );
    },
    /container-image/,
  ],
];
test.each(malformed)(
  'malformed or contradictory %s refuses safely',
  async (_name, owner, kind, change, reason) => {
    const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
    const packet = fixture();
    edit(packet.frames, owner, kind, change);
    expect(() =>
      deriveSelectedCapacityTraits(
        packet.source,
        packet.frames,
        inventory(packet.frames),
        packet.lock,
      ),
    ).toThrow(reason);
  },
);
test.each([
  'runtime hash',
  'runtime build',
  'runtime image',
  'provider chart',
  'provider lock image',
  'provider lock chart',
  'missing image role',
  'duplicate image role',
  'source hash',
  'resource identity',
  'source namespace',
  'source owner',
  'source release chart',
])('adapter refuses %s drift', async (fault) => {
  const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
  const packet = fixture();
  const closure = inventory(packet.frames);
  if (fault === 'runtime hash') packet.lock.sha256 = '0'.repeat(64);
  if (
    [
      'runtime build',
      'runtime image',
      'provider lock image',
      'provider lock chart',
      'missing image role',
      'duplicate image role',
    ].includes(fault)
  ) {
    const lock = parseDocument(packet.lock.bytes);
    if (fault === 'runtime build') lock.setIn(['binaries', 'k3s', 'version'], 'v1.36.5+k3s1');
    if (fault === 'runtime image')
      lock.setIn(['runtimeImages', 'k3dNode', 'digest'], 'sha256:' + '0'.repeat(64));
    if (fault === 'provider lock chart') lock.setIn(['charts', 'eckOperator', 'version'], '3.6.0');
    if (fault === 'provider lock image')
      lock.setIn(['charts', 'eckOperator', 'images', 0, 'digest'], 'sha256:' + '0'.repeat(64));
    const path = ['charts', 'kubePrometheusStack', 'images'];
    const images = type({ role: 'string', name: 'string', digest: 'string' })
      .array()
      .assert(parseDocument(stringify(lock.getIn(path))).toJSON());
    if (fault === 'missing image role')
      lock.setIn(
        path,
        images.filter((image) => image.role !== 'configReloader'),
      );
    if (fault === 'duplicate image role') {
      const image = images.find((image) => image.role === 'configReloader');
      if (image === undefined) throw new Error('missing fixture image');
      lock.addIn(path, image);
    }
    packet.lock.bytes = JSON.stringify(lock.toJSON());
    packet.lock.sha256 = hash(packet.lock.bytes);
  }
  if (fault === 'provider chart') {
    const release = packet.source.releases.find(
      (release) => release.owner === 'observability-dev/kibana',
    );
    if (!release) throw new Error('missing fixture release');
    const document = parseDocument(release.manifest);
    document.setIn(['spec', 'chart', 'spec', 'version'], '0.21.0');
    release.manifest = document.toString();
  }
  if (fault === 'source hash') packet.frames['observability-dev/kibana'] += '\n';
  if (fault === 'resource identity') closure[0].resources = [];
  if (fault === 'source namespace')
    edit(packet.frames, 'observability-dev/kibana', 'Kibana', (document) => {
      document.setIn(['metadata', 'namespace'], 'observability');
    });
  if (fault === 'source owner')
    packet.source.releases = packet.source.releases.filter(
      (release) => release.owner !== 'observability-dev/kibana',
    );
  if (fault === 'source release chart') {
    const release = packet.source.releases.find(
      (release) => release.owner === 'observability-dev/kibana',
    );
    if (!release) throw new Error('missing fixture release');
    release.chart = 'elasticsearch';
  }
  expect(() =>
    deriveSelectedCapacityTraits(packet.source, packet.frames, closure, packet.lock),
  ).toThrow();
});

test('combined ledger retains exact unrelated blockers and native charges without nominal generated replicas', async () => {
  const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
  const { deriveColdStartCosts, combineObservabilityColdStartCosts } =
    await import('./observability-cold-start');
  const packet = fixture();
  const traits = deriveSelectedCapacityTraits(
    packet.source,
    packet.frames,
    inventory(packet.frames),
    packet.lock,
  );
  const bytes =
    stringify({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { namespace: 'local', name: 'native' },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        template: {
          spec: {
            terminationGracePeriodSeconds: 30,
            containers: [
              {
                name: 'app',
                image: 'example@sha256:' + 'a'.repeat(64),
                resources: {
                  requests: { cpu: '5m', memory: '10Mi', 'ephemeral-storage': '8Mi' },
                  limits: { cpu: '10m', memory: '20Mi', 'ephemeral-storage': '8Mi' },
                },
              },
            ],
          },
        },
      },
    }) +
    '---\n' +
    stringify({
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { namespace: 'local', name: 'schedule' },
    }) +
    '---\n' +
    stringify({
      apiVersion: 'elasticsearch.k8s.elastic.co/v1',
      kind: 'Elasticsearch',
      metadata: { namespace: 'foreign', name: 'elasticsearch' },
    }) +
    '---\n' +
    stringify(
      indexed['observability-dev/elasticsearch']['Elasticsearch:observability-dev:elasticsearch'],
    );
  const frames = [{ owner: 'observability-dev/elasticsearch', bytes }];
  const topologyBytes = stringify({
    apiVersion: 'k3d.io/v1alpha5',
    kind: 'Simple',
    servers: 1,
    agents: 0,
  });
  const native = deriveColdStartCosts(
    frames,
    inventory({ 'observability-dev/elasticsearch': bytes }),
    { bytes: topologyBytes, sha256: hash(topologyBytes) },
  );
  const combined = combineObservabilityColdStartCosts(native, traits);
  expect(combined.entries).toStrictEqual(native.entries);
  expect(combined.knownContributions).toEqual({ memoryMiB: 20, cpuMilli: 5, diskMiB: 8 });
  expect(combined.creationAuthority).toBe(false);
  expect(combined.state).toBe('incomplete');
  expect(combined.blockers).toContainEqual({
    owner: 'CronJob:local:schedule',
    missingFact: 'unsupported-runnable-kind:CronJob',
  });
  expect(combined.blockers).toContainEqual({
    owner: 'Elasticsearch:foreign:elasticsearch',
    missingFact: 'unsupported-runnable-kind:Elasticsearch',
  });
  expect(combined.blockers).toContainEqual({
    owner: 'Elasticsearch:observability-dev:elasticsearch',
    missingFact: 'operator-reconciliation-and-terminating-overlap',
  });
  expect(combined.blockers).toContainEqual({
    owner: 'Elasticsearch:observability-dev:elasticsearch',
    missingFact: 'generated-readonly-input-memory-overhead',
  });
  expect(combined.blockers).not.toContainEqual({
    owner: 'Elasticsearch:observability-dev:elasticsearch',
    missingFact: 'unsupported-runnable-kind:Elasticsearch',
  });
  const changedLock = {
    ...packet.lock,
    bytes: packet.lock.bytes + '\n',
    sha256: hash(packet.lock.bytes + '\n'),
  };
  const changed = combineObservabilityColdStartCosts(
    native,
    deriveSelectedCapacityTraits(
      packet.source,
      packet.frames,
      inventory(packet.frames),
      changedLock,
    ),
  );
  expect(combined.closureSHA256).not.toBe(changed.closureSHA256);
  const changedProvider = structuredClone(traits);
  changedProvider[0].provider.chart.sha256 = '0'.repeat(64);
  expect(combined.closureSHA256).not.toBe(
    combineObservabilityColdStartCosts(native, changedProvider).closureSHA256,
  );
  const changedDerivation = structuredClone(traits);
  changedDerivation[0].derivation = 'changed';
  expect(combined.closureSHA256).not.toBe(
    combineObservabilityColdStartCosts(native, changedDerivation).closureSHA256,
  );
});

test('shared validated index stays immutable across repeated production trait consumption', async () => {
  const { deriveSelectedCapacityInputs } = await import('./observability-generated-capacity');
  const { readColdStartSource } = await import('./observability-source-inventory');
  const packet = fixture();
  const validated = readColdStartSource(
    Object.entries(packet.frames).map(([owner, bytes]) => ({ owner, bytes })),
    inventory(packet.frames),
  );
  const before = JSON.stringify(validated);
  const first = deriveSelectedCapacityInputs(packet.source, validated, packet.lock);
  expect(JSON.stringify(validated)).toBe(before);
  expect(deriveSelectedCapacityInputs(packet.source, validated, packet.lock)).toStrictEqual(first);
});
test.each(['missing ES claim name', 'null authored mounts'])(
  'source structure %s refuses before accounting rewrites',
  async (fault) => {
    const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
    const packet = fixture();
    edit(packet.frames, 'observability-dev/elasticsearch', 'Elasticsearch', (document) => {
      if (fault === 'missing ES claim name')
        document.deleteIn(['spec', 'nodeSets', 0, 'volumeClaimTemplates', 0, 'metadata', 'name']);
      if (fault === 'null authored mounts')
        document.setIn(
          ['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'containers', 0, 'volumeMounts'],
          null,
        );
    });
    expect(() =>
      deriveSelectedCapacityTraits(
        packet.source,
        packet.frames,
        inventory(packet.frames),
        packet.lock,
      ),
    ).toThrow();
  },
);

test.each(['CSI', 'malformed claim', 'zero claim', 'malformed volume', 'CSI malformed resource'])(
  'additional nodeSet %s keeps unsupported and malformed outcomes distinct',
  async (fault) => {
    const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
    const packet = fixture();
    edit(packet.frames, 'observability-dev/elasticsearch', 'Elasticsearch', (document) => {
      appendNode(document, (node) => {
        if (fault === 'CSI' || fault === 'CSI malformed resource')
          node.addIn(['podTemplate', 'spec', 'volumes'], {
            name: 'external',
            csi: { driver: 'example.test' },
          });
        if (fault === 'malformed volume')
          node.addIn(['podTemplate', 'spec', 'volumes'], {
            name: 'external',
            csi: { driver: 'example.test' },
            secret: { secretName: 'foreign' },
          });
        if (fault === 'CSI malformed resource')
          node.setIn(
            ['podTemplate', 'spec', 'containers', 0, 'resources', 'requests', 'memory'],
            '99Gi',
          );
        if (fault === 'zero claim')
          node.setIn(
            ['volumeClaimTemplates', 0, 'spec', 'resources', 'requests', 'storage'],
            '0Mi',
          );
        if (fault === 'malformed claim')
          node.setIn(
            ['volumeClaimTemplates', 0, 'spec', 'resources', 'requests', 'storage'],
            'invalid',
          );
      });
    });
    const derive = () =>
      deriveSelectedCapacityTraits(
        packet.source,
        packet.frames,
        inventory(packet.frames),
        packet.lock,
      );
    if (fault === 'malformed volume') expect(derive).toThrow(/workload-volume-unsupported/);
    else if (fault === 'CSI malformed resource' || fault === 'malformed claim')
      expect(derive).toThrow(/memory-unknown/);
    else if (fault === 'zero claim') expect(derive).toThrow(/claim-shape/);
    else {
      const traits = derive();
      expect(traits[0].missingFacts.some((fact) => fact.endsWith('/spec/nodeSets'))).toBe(true);
      expect(traits[0].perReplica).toBeNull();
    }
  },
);

test.each(['equals', 'separate'])(
  'conflicting duplicate reloader image flags %s cannot certify a pin overridden later',
  async (syntax) => {
    const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
    const packet = fixture();
    edit(packet.frames, 'observability/prometheus-controller', 'Deployment', (document) => {
      const path = ['spec', 'template', 'spec', 'containers', 0, 'args'];
      if (syntax === 'equals')
        document.addIn(path, '--prometheus-config-reloader=foreign@sha256:' + 'b'.repeat(64));
      else {
        document.addIn(path, '--prometheus-config-reloader');
        document.addIn(path, 'foreign@sha256:' + 'b'.repeat(64));
      }
    });
    expect(() =>
      deriveSelectedCapacityTraits(
        packet.source,
        packet.frames,
        inventory(packet.frames),
        packet.lock,
      ),
    ).toThrow(/reloader-image/);
  },
);

test('selected assertion delegates malformed role refusal to the shared reader', () => {
  const packet = fixture();
  edit(packet.frames, 'observability-dev/kibana', 'Kibana', (document) => {
    document.deleteIn(['spec', 'podTemplate', 'spec', 'initContainers', 0, 'resources']);
  });
  expect(() => {
    selected.assertObservabilitySelectedResources(
      packet.source,
      indexObservabilitySource(packet.frames),
    );
  }).toThrow(/selected resource/);
});

test('selected first nodeSet cannot hide an additional claim template', async () => {
  const { deriveSelectedCapacityTraits } = await import('./observability-generated-capacity');
  const packet = fixture();
  edit(packet.frames, 'observability-dev/elasticsearch', 'Elasticsearch', (document) => {
    const claim = parseDocument(
      stringify(document.getIn(['spec', 'nodeSets', 0, 'volumeClaimTemplates', 0])),
    );
    claim.setIn(['metadata', 'name'], 'extra');
    const added: unknown = claim.toJSON();
    document.addIn(['spec', 'nodeSets', 0, 'volumeClaimTemplates'], added);
  });
  expect(() =>
    deriveSelectedCapacityTraits(
      packet.source,
      packet.frames,
      inventory(packet.frames),
      packet.lock,
    ),
  ).toThrow(/claim-count/);
});

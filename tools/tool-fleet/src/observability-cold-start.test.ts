import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';
import { parseDocument, stringify } from 'yaml';

import { assessCapacity } from './observability-capacity';
import { deriveColdStartCosts } from './observability-cold-start';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const container = (name: string, memory: string, cpu: string) => ({
  name,
  image: 'example@sha256:' + 'a'.repeat(64),
  resources: {
    requests: { memory, cpu, 'ephemeral-storage': '8Mi' },
    limits: { memory, cpu: '100', 'ephemeral-storage': '8Mi' },
  },
});
function fixture() {
  const manifests = ['dev', 'prod'].flatMap((namespace) => [
    {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: { namespace, name: 'store' },
      spec: {
        replicas: 2,
        updateStrategy: { type: 'OnDelete' },
        volumeClaimTemplates: [
          {
            metadata: { name: 'records' },
            spec: {
              storageClassName: 'puni-retain',
              resources: { requests: { storage: '64Mi' } },
            },
          },
        ],
        template: {
          spec: {
            terminationGracePeriodSeconds: 30,
            containers: [
              {
                ...container('app', '100Mi', '100m'),
                volumeMounts: [{ name: 'records', mountPath: '/records' }],
              },
            ],
            initContainers: [
              container('first', '200Mi', '50m'),
              container('second', '150Mi', '200m'),
            ],
          },
        },
      },
    },
  ]);
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { namespace: 'dev', name: 'hook', annotations: { 'helm.sh/hook': 'pre-install' } },
    spec: {
      completions: 2,
      parallelism: 2,
      backoffLimit: 0,
      completionMode: 'NonIndexed',
      podReplacementPolicy: 'Failed',
      activeDeadlineSeconds: 60,
      template: {
        spec: {
          restartPolicy: 'Never',
          terminationGracePeriodSeconds: 5,
          containers: [container('hook', '10Mi', '10m')],
        },
      },
    },
  };
  const daemon = {
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: { namespace: 'dev', name: 'agent' },
    spec: {
      updateStrategy: { type: 'OnDelete' },
      template: {
        spec: {
          terminationGracePeriodSeconds: 5,
          nodeSelector: { 'puni.dev/capability-observability': 'true' },
          containers: [container('agent', '20Mi', '30m')],
        },
      },
    },
  };
  const bytes = [...manifests, job, daemon].map((manifest) => stringify(manifest)).join('---\n');
  const topologyBytes = stringify({
    apiVersion: 'k3d.io/v1alpha5',
    kind: 'Simple',
    servers: 1,
    agents: 0,
    options: {
      k3s: {
        nodeLabels: [
          { label: 'puni.dev/capability-observability=true', nodeFilters: ['server:*'] },
        ],
      },
    },
  });
  return {
    frames: [{ owner: 'observability/native', bytes }],
    inventory: [
      {
        owner: 'observability/native',
        sha256: hash(bytes),
        resources: [
          'StatefulSet:dev:store',
          'StatefulSet:prod:store',
          'Job:dev:hook',
          'DaemonSet:dev:agent',
        ],
      },
    ],
    topology: { bytes: topologyBytes, sha256: hash(topologyBytes) },
  };
}
function change(edit: (manifest: ReturnType<typeof parseDocument>, index: number) => void) {
  const packet = fixture();
  const bytes = packet.frames[0].bytes
    .split('---\n')
    .map((source, index) => {
      const manifest = parseDocument(source);
      edit(manifest, index);
      return manifest.toString();
    })
    .join('---\n');
  packet.frames[0].bytes = bytes;
  packet.inventory[0].sha256 = hash(bytes);
  return packet;
}

test('native bytes expand namespace-local claims, sequential init, bounded hook and one-server DaemonSet', () => {
  const packet = fixture();
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.state).toBe('complete');
  expect(ledger.scope).toBe('single-cold-create-native-owners');
  expect(ledger.creationAuthority).toBe(false);
  expect(ledger.entries).toHaveLength(11);
  expect(ledger.knownContributions).toEqual({ memoryMiB: 840, cpuMilli: 850, diskMiB: 312 });
  expect(
    ledger.entries
      .filter((entry) => entry.kind === 'claim')
      .map((entry) => entry.identity)
      .sort(),
  ).toEqual([
    'PersistentVolumeClaim:dev:records-store-0',
    'PersistentVolumeClaim:dev:records-store-1',
    'PersistentVolumeClaim:prod:records-store-0',
    'PersistentVolumeClaim:prod:records-store-1',
  ]);
  const fit = assessCapacity({ memoryMiB: 840, cpuMilli: 850, diskMiB: 312 }, ledger.entries);
  expect(fit.state).toBe('fits');
  expect(fit.required).toEqual({ memoryMiB: 840, cpuMilli: 850, diskMiB: 312 });
  expect(
    assessCapacity({ memoryMiB: 839, cpuMilli: 850, diskMiB: 312 }, ledger.entries).deficits,
  ).toEqual([{ dimension: 'memoryMiB', required: 840, available: 839, missing: 1 }]);
  expect(ledger.entries.every((entry) => entry.source.sha256 === packet.inventory[0].sha256)).toBe(
    true,
  );
});

test('missing source owner refuses independently of the surviving frame hash', () => {
  const packet = fixture();
  expect(() => deriveColdStartCosts([], packet.inventory, packet.topology)).toThrow(
    'source-owner-closure',
  );
});
test('duplicate source owner refuses', () => {
  const packet = fixture();
  expect(() =>
    deriveColdStartCosts([...packet.frames, ...packet.frames], packet.inventory, packet.topology),
  ).toThrow('source-owner-closure');
});
test('changed source bytes refuse their bound hash', () => {
  const packet = fixture();
  packet.frames[0].bytes += '\n';
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'source-hash',
  );
});
test('omitted resource refuses the unfiltered expected inventory', () => {
  const packet = fixture();
  packet.inventory[0].resources.push('CronJob:dev:nightly');
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'source-resource-closure',
  );
});
for (const [field, value] of [
  ['namespace', 'other'],
  ['name', 'wrong'],
] as const)
  test(`changed resource ${field} refuses inventory binding`, () => {
    const packet = change((manifest, index) => {
      if (index === 0) manifest.setIn(['metadata', field], value);
    });
    expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
      'source-resource-closure',
    );
  });
test('unexpected runnable kind remains an identified incomplete contribution', () => {
  const packet = change((manifest, index) => {
    if (index === 2) manifest.set('kind', 'CronJob');
  });
  packet.inventory[0].resources[2] = 'CronJob:dev:hook';
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.state).toBe('incomplete');
  expect(ledger.blockers).toContainEqual({
    owner: 'CronJob:dev:hook',
    missingFact: 'unsupported-runnable-kind:CronJob',
  });
});
for (const [name, path, value, missingFact] of [
  ['replicas absent', ['spec', 'replicas'], undefined, 'replica-count'],
  ['zero replicas', ['spec', 'replicas'], 0, 'replica-count'],
  [
    'rolling replacement',
    ['spec', 'updateStrategy', 'type'],
    'RollingUpdate',
    'surge-and-terminating-overlap',
  ],
  ['hook retries', ['spec', 'backoffLimit'], 2, 'job-retry-and-terminating-overlap'],
  ['hook absent count', ['spec', 'parallelism'], undefined, 'job-retry-and-terminating-overlap'],
  ['hook zero count', ['spec', 'parallelism'], 0, 'job-retry-and-terminating-overlap'],
  [
    'hook repeated phase',
    ['metadata', 'annotations', 'helm.sh/hook'],
    'pre-install,post-install',
    'hook-invocation-overlap',
  ],
] as const)
  test(`native ${name} is incomplete rather than nominal demand`, () => {
    const packet = change((manifest, index) => {
      if (index !== (name.startsWith('hook') ? 2 : 0)) return;
      if (value === undefined) manifest.deleteIn([...path]);
      else manifest.setIn([...path], value);
    });
    expect(
      deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers.some(
        (blocker) => blocker.missingFact === missingFact,
      ),
    ).toBe(true);
  });
for (const [name, path, value] of [
  ['bad memory', ['resources', 'limits', 'memory'], '2wat'],
  ['zero memory', ['resources', 'limits', 'memory'], '0Mi'],
] as const)
  test(`native ${name} cannot disappear from costs`, () => {
    const packet = change((manifest, index) => {
      if (index !== 0) return;
      const target = ['spec', 'template', 'spec', 'containers', 0, ...path];
      manifest.setIn(target, value);
    });
    expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow();
  });
test('wrong namespace claim never binds another instance storage', () => {
  const packet = change((manifest, index) => {
    if (index === 0) {
      manifest.deleteIn(['spec', 'volumeClaimTemplates']);
      manifest.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'foreign' } }],
      );
    }
  });
  expect(
    deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers,
  ).toContainEqual({ owner: 'StatefulSet:dev:store', missingFact: 'claim-source:dev/foreign' });
});
test('changed topology hash refuses and multiple servers remain incomplete', () => {
  const packet = fixture();
  expect(() =>
    deriveColdStartCosts(packet.frames, packet.inventory, {
      ...packet.topology,
      bytes: packet.topology.bytes + '\n',
    }),
  ).toThrow('topology-hash');
  const topology = parseDocument(packet.topology.bytes);
  topology.set('servers', 2);
  packet.topology = { bytes: topology.toString(), sha256: hash(topology.toString()) };
  expect(
    deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers,
  ).toContainEqual({ owner: 'topology', missingFact: 'eligible-one-server-topology' });
});

test('missing native resource map refuses malformed trusted state', () => {
  const packet = change((manifest, index) => {
    if (index === 0)
      manifest.deleteIn([
        'spec',
        'template',
        'spec',
        'containers',
        0,
        'resources',
        'limits',
        'memory',
      ]);
  });
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'Cold start controller-malformed source=observability/native owner=StatefulSet:dev:store path=/',
  );
});

for (const [name, edit, diagnostic] of [
  [
    'empty inventory',
    (packet: ReturnType<typeof fixture>) => {
      packet.frames = [];
      packet.inventory = [];
    },
    'source-owner-closure',
  ],
  [
    'duplicate inventory owner',
    (packet: ReturnType<typeof fixture>) => {
      packet.inventory.push(packet.inventory[0]);
    },
    'source-owner-closure',
  ],
] as const)
  test(`native ${name} refuses`, () => {
    const packet = fixture();
    edit(packet);
    expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
      diagnostic,
    );
  });
for (const [name, edit, diagnostic] of [
  [
    'wrong claim kind',
    (manifest: ReturnType<typeof parseDocument>) => {
      manifest.set('kind', 'Deployment');
      manifest.setIn(['spec', 'strategy'], { type: 'Recreate' });
      manifest.deleteIn(['spec', 'updateStrategy']);
    },
    'claim-template-kind',
  ],
  [
    'duplicate claim template',
    (manifest: ReturnType<typeof parseDocument>) => {
      const template: unknown = manifest.getIn(['spec', 'volumeClaimTemplates', 0]);
      manifest.setIn(['spec', 'volumeClaimTemplates'], [template, template]);
    },
    'claim-template-duplicate',
  ],
  [
    'claim template volume collision',
    (manifest: ReturnType<typeof parseDocument>) => {
      manifest.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'records' } }],
      );
    },
    'claim-template-volume-collision',
  ],
  [
    'zero claim request',
    (manifest: ReturnType<typeof parseDocument>) => {
      manifest.setIn(
        ['spec', 'volumeClaimTemplates', 0, 'spec', 'resources', 'requests', 'storage'],
        '0Mi',
      );
    },
    'claim-size-unbounded',
  ],
] as const)
  test(`native ${name} refuses ambiguous storage`, () => {
    const packet = change((manifest, index) => {
      if (index === 0) edit(manifest);
    });
    if (name === 'wrong claim kind') packet.inventory[0].resources[0] = 'Deployment:dev:store';
    expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
      diagnostic,
    );
  });
for (const [name, path, value, missingFact] of [
  [
    'missing termination',
    ['spec', 'template', 'spec', 'terminationGracePeriodSeconds'],
    undefined,
    'termination-grace-bound',
  ],
  [
    'foreign selector',
    ['spec', 'template', 'spec', 'nodeSelector'],
    { other: 'true' },
    'eligible-one-server-placement',
  ],
  ['stateful starting ordinal', ['spec', 'ordinals'], { start: 10 }, 'stateful-ordinal-contract'],
] as const)
  test(`native ${name} remains incomplete`, () => {
    const packet = change((manifest, index) => {
      if (index !== 0) return;
      if (value === undefined) manifest.deleteIn([...path]);
      else manifest.setIn([...path], value);
    });
    expect(
      deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers,
    ).toContainEqual({ owner: 'StatefulSet:dev:store', missingFact });
  });
test('explicit production-only claim cannot satisfy a same-name dev reference', () => {
  const packet = change((manifest, index) => {
    if (index === 0) {
      manifest.deleteIn(['spec', 'volumeClaimTemplates']);
      manifest.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'records', persistentVolumeClaim: { claimName: 'records' } }],
      );
    }
  });
  packet.frames[0].bytes +=
    '---\n' +
    stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { namespace: 'prod', name: 'records' },
      spec: { storageClassName: 'puni-retain', resources: { requests: { storage: '32Mi' } } },
    });
  packet.inventory[0].sha256 = hash(packet.frames[0].bytes);
  packet.inventory[0].resources.push('PersistentVolumeClaim:prod:records');
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'claim-source:dev/records',
  });
  expect(
    ledger.entries.find((entry) => entry.identity === 'PersistentVolumeClaim:prod:records')
      ?.diskMiB,
  ).toBe(32);
});

test('Recreate Deployment uses the same native normalizer without StatefulSet claim invention', () => {
  const packet = change((manifest, index) => {
    if (index !== 0) return;
    manifest.set('kind', 'Deployment');
    manifest.setIn(['spec', 'strategy'], { type: 'Recreate' });
    manifest.deleteIn(['spec', 'updateStrategy']);
    manifest.deleteIn(['spec', 'volumeClaimTemplates']);
    manifest.deleteIn(['spec', 'template', 'spec', 'containers', 0, 'volumeMounts']);
  });
  packet.inventory[0].resources[0] = 'Deployment:dev:store';
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.state).toBe('complete');
  expect(ledger.entries.filter((entry) => entry.owner === 'Deployment:dev:store')).toHaveLength(2);
  expect(
    assessCapacity({ memoryMiB: 840, cpuMilli: 850, diskMiB: 184 }, ledger.entries).required,
  ).toEqual({ memoryMiB: 840, cpuMilli: 850, diskMiB: 184 });
});
for (const [name, append, diagnostic] of [
  ['topology malformed YAML', '\nservers: [', 'topology-malformed'],
  ['duplicate topology label', '', 'topology-label-duplicate'],
  ['unsupported topology label scope', '', 'topology-label-unsupported'],
] as const)
  test(`${name} refuses trusted ambiguity`, () => {
    const packet = fixture();
    const topology = parseDocument(packet.topology.bytes);
    if (name === 'duplicate topology label')
      topology.setIn(['options', 'k3s', 'nodeLabels', 1], {
        label: 'puni.dev/capability-observability=true',
        nodeFilters: ['server:*'],
      });
    if (name === 'unsupported topology label scope')
      topology.setIn(['options', 'k3s', 'nodeLabels', 0, 'nodeFilters'], ['agent:*']);
    const bytes = topology.toString() + append;
    expect(() =>
      deriveColdStartCosts(packet.frames, packet.inventory, { bytes, sha256: hash(bytes) }),
    ).toThrow(diagnostic);
  });
test('expanded StatefulSet claim identity collision refuses rather than retaining a different size', () => {
  const packet = fixture();
  packet.frames[0].bytes +=
    '---\n' +
    stringify({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: { namespace: 'dev', name: 'records-store-0' },
      spec: { storageClassName: 'puni-retain', resources: { requests: { storage: '1Mi' } } },
    });
  packet.inventory[0].sha256 = hash(packet.frames[0].bytes);
  packet.inventory[0].resources.push('PersistentVolumeClaim:dev:records-store-0');
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'claim-identity-collision',
  );
});

test('native PVC cannot borrow another API', () => {
  const packet = fixture();
  packet.frames[0].bytes +=
    '---\n' +
    stringify({
      apiVersion: 'apps/v1',
      kind: 'PersistentVolumeClaim',
      metadata: { namespace: 'prod', name: 'records' },
      spec: { storageClassName: 'puni-retain', resources: { requests: { storage: '32Mi' } } },
    });
  packet.inventory[0].sha256 = hash(packet.frames[0].bytes);
  packet.inventory[0].resources.push('PersistentVolumeClaim:prod:records');
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow();
});

test('DaemonSet rolling overlap remains incomplete rather than one nominal pod', () => {
  const packet = change((manifest, index) => {
    if (index === 3) manifest.setIn(['spec', 'updateStrategy', 'type'], 'RollingUpdate');
  });
  expect(
    deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers,
  ).toContainEqual({ owner: 'DaemonSet:dev:agent', missingFact: 'surge-and-terminating-overlap' });
});

for (const [name, path, value] of [
  ['string replicas', ['spec', 'replicas'], '2'],
  ['nonarray containers', ['spec', 'template', 'spec', 'containers'], 'PRIVATE-MARKER-containers'],
  [
    'malformed resources',
    ['spec', 'template', 'spec', 'containers', 0, 'resources'],
    { limits: 'PRIVATE-MARKER-bounds' },
  ],
] as const)
  test(`fix1 malformed controller ${name} throws safe source context`, () => {
    const packet = change((manifest, index) => {
      if (index === 0) manifest.setIn([...path], value);
    });
    let failure: unknown;
    try {
      deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected malformed controller refusal');
    expect(failure.message).toBe(
      'Cold start controller-malformed source=observability/native owner=StatefulSet:dev:store path=/',
    );
    expect(failure.message).not.toContain('PRIVATE-MARKER');
    expect(failure.cause).toBeUndefined();
  });
for (const [name, volumes] of [
  [
    'multiple supported sources',
    [
      {
        name: 'contradiction',
        emptyDir: { sizeLimit: '1Mi' },
        configMap: { name: 'PRIVATE-MARKER-map' },
      },
    ],
  ],
  [
    'unsupported with supported source',
    [
      {
        name: 'contradiction',
        hostPath: { path: '/PRIVATE-MARKER-host' },
        emptyDir: { sizeLimit: '1Mi' },
      },
    ],
  ],
  ['missing source', [{ name: 'PRIVATE-MARKER-empty' }]],
  [
    'duplicate names',
    [
      { name: 'duplicate', emptyDir: { sizeLimit: '1Mi' } },
      { name: 'duplicate', emptyDir: { sizeLimit: '2Mi' } },
    ],
  ],
  [
    'contradictory projection',
    [
      {
        name: 'contradiction',
        projected: {
          sources: [
            {
              secret: { name: 'PRIVATE-MARKER-secret' },
              configMap: { name: 'PRIVATE-MARKER-map' },
            },
          ],
        },
      },
    ],
  ],
  [
    'missing downward selector',
    [
      {
        name: 'contradiction',
        projected: { sources: [{ downwardAPI: { items: [{ path: 'value' }] } }] },
      },
    ],
  ],
  [
    'contradictory downward selector',
    [
      {
        name: 'contradiction',
        projected: {
          sources: [
            {
              downwardAPI: {
                items: [
                  {
                    path: 'value',
                    fieldRef: { fieldPath: 'metadata.name' },
                    resourceFieldRef: { resource: 'limits.memory' },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
  ],
] as const)
  test(`fix1 malformed volume ${name} throws safe source context`, () => {
    const packet = change((manifest, index) => {
      if (index === 0) manifest.setIn(['spec', 'template', 'spec', 'volumes'], volumes);
    });
    let failure: unknown;
    try {
      deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Expected contradictory volume refusal');
    expect(failure.message).toBe(
      'Cold start workload-contradiction source=observability/native owner=StatefulSet:dev:store path=/spec/template/spec',
    );
    expect(failure.message).not.toContain('PRIVATE-MARKER');
    expect(failure.cause).toBeUndefined();
  });
test('fix1 wellformed unsupported hostPath remains an incomplete fact', () => {
  const packet = change((manifest, index) => {
    if (index === 0)
      manifest.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [{ name: 'host', hostPath: { path: '/PRIVATE-MARKER-host' } }],
      );
  });
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.state).toBe('incomplete');
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'workload-volume-unsupported',
  });
  expect(JSON.stringify(ledger.blockers)).not.toContain('PRIVATE-MARKER');
});
test('fix1 unsafe source context never appears in a malformed-input diagnostic', () => {
  const packet = change((manifest, index) => {
    if (index === 0) manifest.setIn(['spec', 'replicas'], 'PRIVATE-MARKER-replicas');
  });
  packet.frames[0].owner = 'PRIVATE-MARKER-source';
  packet.inventory[0].owner = 'PRIVATE-MARKER-source';
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'Cold start workload-context-malformed',
  );
});

test('fix1 wellformed unsupported mount propagation remains incomplete', () => {
  const packet = change((manifest, index) => {
    if (index === 0)
      manifest.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
        'HostToContainer',
      );
  });
  const ledger = deriveColdStartCosts(packet.frames, packet.inventory, packet.topology);
  expect(ledger.blockers).toContainEqual({
    owner: 'StatefulSet:dev:store',
    missingFact: 'workload-shape-unsupported',
  });
});
test('fix1 malformed mount propagation throws safe source context', () => {
  const packet = change((manifest, index) => {
    if (index === 0)
      manifest.setIn(
        ['spec', 'template', 'spec', 'containers', 0, 'volumeMounts', 0, 'mountPropagation'],
        'PRIVATE-MARKER-propagation',
      );
  });
  expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
    'Cold start controller-malformed source=observability/native owner=StatefulSet:dev:store path=/',
  );
});

test('fix1 wellformed unsupported projected resource field remains incomplete', () => {
  const packet = change((manifest, index) => {
    if (index === 0)
      manifest.setIn(
        ['spec', 'template', 'spec', 'volumes'],
        [
          {
            name: 'projection',
            projected: {
              sources: [
                {
                  downwardAPI: {
                    items: [{ path: 'memory', resourceFieldRef: { resource: 'limits.memory' } }],
                  },
                },
              ],
            },
          },
        ],
      );
  });
  expect(
    deriveColdStartCosts(packet.frames, packet.inventory, packet.topology).blockers,
  ).toContainEqual({ owner: 'StatefulSet:dev:store', missingFact: 'workload-volume-unsupported' });
});

for (const [name, volumes, rolling] of [
  [
    'unsupported volume before contradiction',
    [
      { name: 'host', hostPath: { path: '/unmodeled' } },
      {
        name: 'broken',
        emptyDir: { sizeLimit: '1Mi' },
        persistentVolumeClaim: { claimName: 'records' },
      },
    ],
    false,
  ],
  [
    'unsupported projection before contradiction',
    [
      {
        name: 'projection',
        projected: {
          sources: [
            {
              downwardAPI: {
                items: [{ path: 'memory', resourceFieldRef: { resource: 'limits.memory' } }],
              },
            },
            { secret: { name: 'reference' }, configMap: { name: 'reference' } },
          ],
        },
      },
    ],
    false,
  ],
  [
    'unsupported rolling before contradiction',
    [{ name: 'broken', emptyDir: { sizeLimit: '1Mi' }, configMap: { name: 'reference' } }],
    true,
  ],
] as const)
  test(`fix1 ordering ${name} still throws malformed state`, () => {
    const packet = change((manifest, index) => {
      if (index !== 0) return;
      manifest.setIn(['spec', 'template', 'spec', 'volumes'], volumes);
      if (rolling) manifest.setIn(['spec', 'updateStrategy', 'type'], 'RollingUpdate');
    });
    expect(() => deriveColdStartCosts(packet.frames, packet.inventory, packet.topology)).toThrow(
      'Cold start workload-contradiction source=observability/native owner=StatefulSet:dev:store path=/spec/template/spec',
    );
  });

import { expect, test } from 'bun:test';

import { readCPUMilli, readMemoryMiB } from './observability-capacity';
import {
  NativeWorkloadSpec,
  normalizeWorkload,
  ObservedWorkloadSpec,
  type SourceVolumePolicy,
  SourceWorkloadSpec,
} from './observability-workload';

function refuse(reason: string): never {
  throw new Error(`unsupported:${reason}`);
}
const readers = {
  memory: (quantity: string) => readMemoryMiB(quantity, refuse),
  cpu: (quantity: string) => readCPUMilli(quantity, refuse),
  refuse,
  refuseMalformed: (reason: string): never => {
    throw new Error(`malformed:${reason}`);
  },
};
const policy = { standaloneDownwardAPI: ['metadata'], podMemoryVolume: 'config-out' };
const numericPolicy = { ...policy, upperBoundMiB: 1 };
function container(name: string, memory: string, cpu: string) {
  return {
    name,
    image: 'example.invalid/source:1',
    resources: {
      requests: { memory, cpu, 'ephemeral-storage': '2Mi' },
      limits: { memory, cpu: '4', 'ephemeral-storage': '4Mi' },
    },
    volumeMounts: [{ name: 'metadata', mountPath: '/metadata', readOnly: true }],
  };
}
function source() {
  return {
    containers: [container('app', '100Mi', '10m'), container('sidecar', '20Mi', '20m')],
    initContainers: [container('init', '200Mi', '40m')],
    overhead: { memory: '10Mi', cpu: '5m' },
    volumes: [
      {
        name: 'metadata',
        downwardAPI: {
          defaultMode: 0,
          items: [
            { path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } },
            {
              path: 'annotations',
              mode: 256,
              fieldRef: { fieldPath: 'metadata.annotations', apiVersion: 'v1' },
            },
          ],
        },
      },
      { name: 'config-out', emptyDir: { medium: 'Memory' } },
      { name: 'disk', emptyDir: { sizeLimit: '16Mi' } },
    ],
  };
}
function normalize(value: unknown, selection: SourceVolumePolicy = policy) {
  return normalizeWorkload(SourceWorkloadSpec.assert(value), readers, selection);
}

test('source policy retains standalone metadata selectors and effective modes', () => {
  const model = normalize(source());
  const metadata = model.volumes.find((volume) => volume.name === 'metadata');
  expect(metadata?.kind).toBe('downwardAPI');
  expect(metadata?.readOnly).toBe(true);
  expect(JSON.parse(metadata?.projection ?? '')).toEqual({
    defaultMode: 0,
    items: [
      { path: 'labels', fieldPath: 'metadata.labels', mode: 0 },
      { path: 'annotations', fieldPath: 'metadata.annotations', mode: 256 },
    ],
  });
});
test('source policy derives P once from complete init limits and overhead', () => {
  const authored = source();
  const model = normalize(authored);
  expect(model.memoryMiB).toBe(210);
  expect(model.cpuMilli).toBe(45);
  expect(model.ephemeralMiB).toBe(16);
  expect(model.volumes.find((volume) => volume.name === 'config-out')?.sizeMiB).toBe(210);
  expect(model.sourceMemoryVolume).toEqual({
    name: 'config-out',
    basis: 'pod-memory-limit',
    upperBoundMiB: 210,
    literalSizeLimit: 'absent',
    enforcement: 'unobserved',
  });
  expect(authored.volumes[1]).toEqual({ name: 'config-out', emptyDir: { medium: 'Memory' } });
});
test('source policy sums application limits when they exceed sequential init', () => {
  const authored = source();
  authored.containers[0].resources.limits.memory = '300Mi';
  expect(normalize(authored).memoryMiB).toBe(330);
});
test('source policy uses existing process ephemeral maximum over disk', () => {
  const authored = source();
  authored.initContainers[0].resources.limits['ephemeral-storage'] = '32Mi';
  expect(normalize(authored).ephemeralMiB).toBe(32);
});
test('default calls reject identical standalone and unbounded Memory bytes', () => {
  const authored = source();
  expect(() => normalizeWorkload(NativeWorkloadSpec.assert(authored), readers)).toThrow(
    'unsupported:workload-volume-unsupported',
  );
  authored.volumes.shift();
  expect(() => normalizeWorkload(NativeWorkloadSpec.assert(authored), readers)).toThrow(
    'unsupported:candidate-emptydir-unbounded',
  );
});
test('default model has no source evidence keys and keeps exact output', () => {
  const authored = { containers: [{ ...container('app', '100Mi', '10m'), volumeMounts: [] }] };
  expect(normalizeWorkload(NativeWorkloadSpec.assert(authored), readers)).toStrictEqual({
    serviceAccountName: 'default',
    automountServiceAccountToken: true,
    containers: [
      {
        name: 'app',
        image: 'example.invalid/source:1',
        memoryRequestMiB: 100,
        memoryLimitMiB: 100,
        cpuRequestMilli: 10,
        cpuLimitMilli: 4000,
        ephemeralMiB: 4,
        readOnlyRoot: false,
        mounts: [],
      },
    ],
    initContainers: [],
    volumes: [],
    overheadMemoryMiB: 0,
    overheadCPUMilli: 0,
    memoryMiB: 100,
    cpuMilli: 10,
    ephemeralMiB: 4,
  });
});
test('closed observed schema still rejects standalone metadata source', () => {
  expect(ObservedWorkloadSpec.allows(source())).toBe(false);
});

for (const [name, downwardAPI] of [
  ['missing selector', { items: [{ path: 'labels' }] }],
  [
    'both selectors',
    {
      items: [
        {
          path: 'labels',
          fieldRef: { fieldPath: 'metadata.labels' },
          resourceFieldRef: { resource: 'limits.memory' },
        },
      ],
    },
  ],
  [
    'invalid default mode',
    { defaultMode: -1, items: [{ path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  [
    'invalid item mode',
    { items: [{ path: 'labels', mode: 512, fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  [
    'noninteger mode',
    { defaultMode: 1.5, items: [{ path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  ['unsafe path', { items: [{ path: '../labels', fieldRef: { fieldPath: 'metadata.labels' } }] }],
  [
    'null path byte',
    { items: [{ path: 'labels\0suffix', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  ['absolute path', { items: [{ path: '/labels', fieldRef: { fieldPath: 'metadata.labels' } }] }],
  [
    'empty path segment',
    { items: [{ path: 'a//labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  [
    'dot path segment',
    { items: [{ path: './labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  [
    'reserved path segment',
    { items: [{ path: '..labels', fieldRef: { fieldPath: 'metadata.labels' } }] },
  ],
  [
    'duplicate path',
    {
      items: [
        { path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } },
        { path: 'labels', fieldRef: { fieldPath: 'metadata.annotations' } },
      ],
    },
  ],
  ['unknown source field', { items: [], ignored: 'cannot vanish' }],
  ['malformed items', { items: 'invalid' }],
] as const) {
  test(`source metadata ${name} is malformed before unrelated unsupported`, () => {
    const authored = source();
    const changed = {
      ...authored,
      unsupported: true,
      volumes: [
        { name: 'host', hostPath: { path: '/unsupported' } },
        { name: 'metadata', downwardAPI },
        ...authored.volumes.slice(1),
      ],
    };
    expect(() => normalize(changed)).toThrow('malformed:workload-volume-unsupported');
  });
}
for (const [name, volumes] of [
  [
    'mixed source',
    [{ name: 'metadata', downwardAPI: { items: [] }, emptyDir: { sizeLimit: '1Mi' } }],
  ],
  [
    'duplicate name',
    [
      { name: 'metadata', downwardAPI: { items: [] } },
      { name: 'metadata', downwardAPI: { items: [] } },
    ],
  ],
] as const) {
  test(`source metadata ${name} is malformed before unsupported`, () => {
    expect(() => normalize({ ...source(), unsupported: true, volumes })).toThrow(
      'malformed:workload-volume-unsupported',
    );
  });
}
for (const [name, downwardAPI] of [
  [
    'resource selector',
    { items: [{ path: 'memory', resourceFieldRef: { resource: 'limits.memory' } }] },
  ],
  ['unselected field', { items: [{ path: 'name', fieldRef: { fieldPath: 'metadata.name' } }] }],
  [
    'unselected API',
    { items: [{ path: 'labels', fieldRef: { fieldPath: 'metadata.labels', apiVersion: 'v2' } }] },
  ],
] as const) {
  test(`source metadata ${name} remains modeled unsupported`, () => {
    expect(() =>
      normalize({
        ...source(),
        volumes: [{ name: 'metadata', downwardAPI }, ...source().volumes.slice(1)],
      }),
    ).toThrow('unsupported:workload-volume-unsupported');
  });
}
for (const readOnly of [false, undefined]) {
  test(`source metadata mount readOnly ${String(readOnly)} refuses`, () => {
    const authored = source();
    expect(() =>
      normalize({
        ...authored,
        containers: [
          {
            ...authored.containers[0],
            volumeMounts: [
              {
                name: 'metadata',
                mountPath: '/metadata',
                ...(readOnly === undefined ? {} : { readOnly }),
              },
            ],
          },
        ],
      }),
    ).toThrow('unsupported:workload-volume-unsupported');
  });
}
for (const [name, selection] of [
  ['missing metadata name', { ...policy, standaloneDownwardAPI: ['absent'] }],
  ['wrong metadata kind', { ...policy, standaloneDownwardAPI: ['disk'] }],
  ['missing Memory name', { ...policy, podMemoryVolume: 'absent' }],
  ['wrong Memory medium', { ...policy, podMemoryVolume: 'disk' }],
  [
    'duplicate metadata authorization',
    { ...policy, standaloneDownwardAPI: ['metadata', 'metadata'] },
  ],
  ['wildcard metadata authorization', { ...policy, standaloneDownwardAPI: ['*'] }],
  ['numeric cap override', numericPolicy],
] as const) {
  test(`source policy ${name} refuses`, () => {
    expect(() => normalize(source(), selection)).toThrow(
      name.includes('authorization') || name === 'numeric cap override'
        ? 'malformed:source-volume-policy-malformed'
        : 'unsupported:source-volume-policy-unsupported',
    );
  });
}
for (const [name, volumes] of [
  ['second bounded Memory', [{ name: 'extra', emptyDir: { medium: 'Memory', sizeLimit: '1Mi' } }]],
  ['second unbounded Memory', [{ name: 'extra', emptyDir: { medium: 'Memory' } }]],
  ['disk omission', [{ name: 'extra', emptyDir: {} }]],
] as const) {
  test(`source policy ${name} refuses`, () => {
    expect(() => normalize({ ...source(), volumes: [...source().volumes, ...volumes] })).toThrow();
  });
}
for (const limit of ['0', '', 'invalid', '1Mi']) {
  test(`source policy requires absent literal Memory limit ${JSON.stringify(limit)}`, () => {
    const authored = source();
    expect(() =>
      normalize({
        ...authored,
        volumes: [
          authored.volumes[0],
          { name: 'config-out', emptyDir: { medium: 'Memory', sizeLimit: limit } },
        ],
      }),
    ).toThrow();
  });
}
for (const [name, patch] of [
  ['restartable init', { restartPolicy: 'Always' }],
  ['resizing init', { resizePolicy: [] }],
  [
    'zero init limit',
    { resources: { requests: { memory: '0', cpu: '1m' }, limits: { memory: '0', cpu: '1m' } } },
  ],
  [
    'missing init limit',
    { resources: { requests: { memory: '1Mi', cpu: '1m' }, limits: { cpu: '1m' } } },
  ],
] as const) {
  test(`source policy ${name} refuses`, () => {
    const authored = source();
    expect(() =>
      normalize({ ...authored, initContainers: [{ ...authored.initContainers[0], ...patch }] }),
    ).toThrow();
  });
}
test('source policy Pod resources refuse', () => {
  expect(() => normalize({ ...source(), resources: {} })).toThrow(
    'unsupported:workload-shape-unsupported',
  );
});
test('source metadata policy alone adds no Memory evidence', () => {
  const authored = source();
  expect(
    normalize(
      { ...authored, volumes: [authored.volumes[0]] },
      { standaloneDownwardAPI: ['metadata'] },
    ),
  ).not.toHaveProperty('sourceMemoryVolume');
});
test('source Memory policy alone adds no metadata authorization', () => {
  expect(() => normalize(source(), { podMemoryVolume: 'config-out' })).toThrow(
    'unsupported:workload-volume-unsupported',
  );
});
test('legacy ordering keeps first quantity refusal without malformed callback', () => {
  const authored = {
    ...source(),
    volumes: [
      { name: 'first', emptyDir: { sizeLimit: 'invalid' } },
      { name: 'metadata', downwardAPI: { items: [{ path: '../bad' }] } },
    ],
  };
  expect(() =>
    normalizeWorkload(NativeWorkloadSpec.assert(authored), {
      ...readers,
      refuseMalformed: undefined,
    }),
  ).toThrow('unsupported:memory-unknown');
});

test('source metadata default mode and explicit zero remain distinct', () => {
  const authored = source();
  const model = normalize({
    ...authored,
    volumes: [
      {
        name: 'metadata',
        downwardAPI: {
          items: [
            { path: 'labels', fieldRef: { fieldPath: 'metadata.labels' } },
            { path: 'annotations', mode: 0, fieldRef: { fieldPath: 'metadata.annotations' } },
          ],
        },
      },
      ...authored.volumes.slice(1),
    ],
  });
  expect(
    JSON.parse(model.volumes.find((volume) => volume.name === 'metadata')?.projection ?? ''),
  ).toEqual({
    defaultMode: 420,
    items: [
      { path: 'labels', fieldPath: 'metadata.labels', mode: 420 },
      { path: 'annotations', fieldPath: 'metadata.annotations', mode: 0 },
    ],
  });
});
for (const medium of ['', 'Disk', undefined]) {
  test(`source policy named volume medium ${String(medium)} refuses`, () => {
    const authored = source();
    expect(() =>
      normalize({
        ...authored,
        volumes: [
          authored.volumes[0],
          { name: 'config-out', emptyDir: medium === undefined ? {} : { medium } },
        ],
      }),
    ).toThrow('unsupported:source-volume-policy-unsupported');
  });
}
test('source policy extra bounded Memory cannot disappear into derived P', () => {
  const authored = source();
  expect(() =>
    normalize({
      ...authored,
      volumes: [
        ...authored.volumes,
        { name: 'extra', emptyDir: { medium: 'Memory', sizeLimit: '1Mi' } },
      ],
    }),
  ).toThrow('unsupported:source-volume-policy-unsupported');
});
test('source policy duplicate named Memory volume is malformed', () => {
  const authored = source();
  expect(() =>
    normalize({
      ...authored,
      volumes: [...authored.volumes, { name: 'config-out', emptyDir: { medium: 'Memory' } }],
    }),
  ).toThrow('malformed:workload-volume-unsupported');
});
test('source policy unselected standalone name refuses', () => {
  expect(() =>
    normalize(source(), { standaloneDownwardAPI: [], podMemoryVolume: 'config-out' }),
  ).toThrow('unsupported:workload-volume-unsupported');
});
test('source policy works with legacy refusal callback and validates malformed source', () => {
  expect(
    normalizeWorkload(
      SourceWorkloadSpec.assert(source()),
      { ...readers, refuseMalformed: undefined },
      policy,
    ).memoryMiB,
  ).toBe(210);
  const authored = source();
  expect(() =>
    normalizeWorkload(
      SourceWorkloadSpec.assert({
        ...authored,
        volumes: [
          {
            name: 'metadata',
            downwardAPI: {
              items: [{ path: '../labels', fieldRef: { fieldPath: 'metadata.labels' } }],
            },
          },
          ...authored.volumes.slice(1),
        ],
      }),
      { ...readers, refuseMalformed: undefined },
      policy,
    ),
  ).toThrow('unsupported:workload-volume-unsupported');
});

function hostSource() {
  return {
    containers: [
      {
        ...container('reader', '100Mi', '10m'),
        volumeMounts: [{ name: 'host', mountPath: '/input', readOnly: true }],
      },
    ],
    volumes: [{ name: 'host', hostPath: { path: '/proc' } }],
  };
}
const hostPolicy = {
  readOnlyHostPaths: [
    {
      name: 'host',
      path: '/proc',
      mounts: [
        {
          role: 'containers' as const,
          container: 'reader',
          mountPath: '/input',
          readOnly: true as const,
        },
      ],
    },
  ],
};
function normalizeHost(authored: unknown, selection: unknown = hostPolicy) {
  return normalizeWorkload(
    SourceWorkloadSpec.assert(authored),
    readers,
    selection as SourceVolumePolicy,
  );
}
for (const [label, body] of [
  ['null', null],
  ['array', []],
  ['missing path', {}],
  ['relative path', { path: 'proc' }],
  ['empty path', { path: '' }],
  ['NUL path', { path: '/p\0roc' }],
  ['unknown body key', { path: '/proc', extra: 1 }],
  ['unknown type', { path: '/proc', type: 'Other' }],
  ['type null', { path: '/proc', type: null }],
] as const)
  test(`Task60 closed host body ${label} precedes unrelated unsupported`, () => {
    const authored = hostSource();
    const supplied = {
      ...authored,
      unsupported: true,
      volumes: [
        { name: 'unknown', csi: {} },
        { name: 'host', hostPath: body },
      ],
    };
    expect(() => normalizeHost(supplied)).toThrow('malformed:workload-volume-unsupported');
  });
test('Task60 exact reader policy preserves host paths and full resource cost', () => {
  const model = normalizeHost(hostSource());
  expect(model.memoryMiB).toBe(100);
  expect(model.cpuMilli).toBe(10);
  expect(model.ephemeralMiB).toBe(4);
  expect(model.sourceHostPaths).toEqual([
    { ...hostPolicy.readOnlyHostPaths[0], consumerIntent: 'read-only', enforcement: 'unobserved' },
  ]);
  expect(model.volumes[0]).toMatchObject({ kind: 'hostPath', sourcePath: '/proc', readOnly: true });
});
for (const [label, edit] of [
  [
    'writable',
    (s: ReturnType<typeof hostSource>) => (s.containers[0].volumeMounts[0].readOnly = false),
  ],
  [
    'omitted mode',
    (s: ReturnType<typeof hostSource>) =>
      Reflect.deleteProperty(s.containers[0].volumeMounts[0], 'readOnly'),
  ],
  [
    'changed target',
    (s: ReturnType<typeof hostSource>) => (s.containers[0].volumeMounts[0].mountPath = '/other'),
  ],
  ['changed path', (s: ReturnType<typeof hostSource>) => (s.volumes[0].hostPath.path = '/sys')],
  [
    'extra reference',
    (s: ReturnType<typeof hostSource>) =>
      s.containers[0].volumeMounts.push({ name: 'host', mountPath: '/second', readOnly: true }),
  ],
  [
    'missing reference',
    (s: ReturnType<typeof hostSource>) => s.containers[0].volumeMounts.splice(0),
  ],
] as const)
  test(`Task60 policy refuses ${label}`, () => {
    const authored = hostSource();
    edit(authored);
    expect(() => normalizeHost(authored)).toThrow('unsupported:workload-volume-unsupported');
  });
test('Task60 source host paths remain strict without internal policy and in observed decoder', () => {
  expect(() => normalizeWorkload(SourceWorkloadSpec.assert(hostSource()), readers)).toThrow(
    'unsupported:workload-volume-unsupported',
  );
  expect(ObservedWorkloadSpec.allows(hostSource())).toBe(false);
});
test('Task60 host duplicate references are malformed before unsupported', () => {
  const authored = hostSource();
  authored.containers[0].volumeMounts.push({ ...authored.containers[0].volumeMounts[0] });
  expect(() => normalizeHost({ ...authored, unsupported: true })).toThrow(
    'malformed:workload-mount-unknown',
  );
});
for (const type of [
  undefined,
  '',
  'Directory',
  'File',
  'DirectoryOrCreate',
  'FileOrCreate',
  'Socket',
  'CharDevice',
  'BlockDevice',
] as const)
  for (const propagation of [undefined, 'None', 'HostToContainer'] as const)
    test(`Task60 declared type ${String(type)} propagation ${String(propagation)} remain distinct snapshots`, () => {
      const authored = hostSource();
      const host = {
        name: 'host',
        path: '/proc',
        ...(type === undefined ? {} : { type }),
        mounts: [
          {
            role: 'containers' as const,
            container: 'reader',
            mountPath: '/input',
            readOnly: true as const,
            ...(propagation === undefined ? {} : { mountPropagation: propagation }),
          },
        ],
      };
      const supplied = {
        ...authored,
        volumes: [
          { name: 'host', hostPath: { path: '/proc', ...(type === undefined ? {} : { type }) } },
        ],
        containers: [
          {
            ...authored.containers[0],
            volumeMounts: [
              {
                ...authored.containers[0].volumeMounts[0],
                ...(propagation === undefined ? {} : { mountPropagation: propagation }),
              },
            ],
          },
        ],
      };
      const selected = { readOnlyHostPaths: [host] };
      const model = normalizeHost(supplied, selected);
      const expected = structuredClone({
        ...host,
        consumerIntent: 'read-only' as const,
        enforcement: 'unobserved' as const,
      });
      host.mounts[0].mountPath = '/changed';
      supplied.containers[0].volumeMounts[0].mountPath = '/mutated';
      expect(model.sourceHostPaths).toEqual([expected]);
      expect(Object.hasOwn(model.volumes[0], 'type')).toBe(type !== undefined);
      expect('type' in model.volumes[0] ? model.volumes[0].type : undefined).toBe(type);
      expect(Object.hasOwn(model.containers[0].mounts[0], 'mountPropagation')).toBe(
        propagation !== undefined,
      );
      expect(model.containers[0].mounts[0].mountPropagation).toBe(propagation);
    });
test('Task60 exact init tuple is supported by pure policy with full init and overhead costs', () => {
  const authored = hostSource();
  const init = {
    ...container('init', '200Mi', '30m'),
    volumeMounts: [{ name: 'host', mountPath: '/init', readOnly: true }],
  };
  const selected = {
    readOnlyHostPaths: [
      {
        ...hostPolicy.readOnlyHostPaths[0],
        mounts: [
          ...hostPolicy.readOnlyHostPaths[0].mounts,
          {
            role: 'initContainers' as const,
            container: 'init',
            mountPath: '/init',
            readOnly: true as const,
          },
        ],
      },
    ],
  };
  const model = normalizeHost(
    { ...authored, initContainers: [init], overhead: { memory: '10Mi', cpu: '5m' } },
    selected,
  );
  expect(model.memoryMiB).toBe(210);
  expect(model.cpuMilli).toBe(35);
  expect(model.sourceHostPaths?.[0].mounts).toHaveLength(2);
});
for (const [label, mount] of [
  ['relative target', { name: 'host', mountPath: 'relative', readOnly: true }],
  ['NUL target', { name: 'host', mountPath: '/a\0b', readOnly: true }],
] as const)
  test(`Task60 malformed host ${label} precedes unsupported`, () => {
    const authored = hostSource();
    expect(() =>
      normalizeHost({
        ...authored,
        unsupported: true,
        containers: [{ ...authored.containers[0], volumeMounts: [mount] }],
      }),
    ).toThrow('malformed:workload-mount-unknown');
  });
for (const [label, volume] of [
  ['mixed sources', { name: 'host', hostPath: { path: '/proc' }, emptyDir: { sizeLimit: '1Mi' } }],
  ['duplicate names', { name: 'host', hostPath: { path: '/proc' } }],
] as const)
  test(`Task60 host ${label} is malformed before unsupported`, () => {
    const authored = hostSource();
    expect(() =>
      normalizeHost({
        ...authored,
        unsupported: true,
        volumes: label === 'duplicate names' ? [volume, volume] : [volume],
      }),
    ).toThrow('malformed:workload-volume-unsupported');
  });
for (const [label, selected] of [
  ['empty references', { readOnlyHostPaths: [{ ...hostPolicy.readOnlyHostPaths[0], mounts: [] }] }],
  [
    'unknown row field',
    { readOnlyHostPaths: [{ ...hostPolicy.readOnlyHostPaths[0], quotaMiB: 1 }] },
  ],
  [
    'unknown mount field',
    {
      readOnlyHostPaths: [
        {
          ...hostPolicy.readOnlyHostPaths[0],
          mounts: [{ ...hostPolicy.readOnlyHostPaths[0].mounts[0], subPath: 'x' }],
        },
      ],
    },
  ],
  [
    'writable policy',
    {
      readOnlyHostPaths: [
        {
          ...hostPolicy.readOnlyHostPaths[0],
          mounts: [{ ...hostPolicy.readOnlyHostPaths[0].mounts[0], readOnly: false }],
        },
      ],
    },
  ],
  [
    'Bidirectional policy',
    {
      readOnlyHostPaths: [
        {
          ...hostPolicy.readOnlyHostPaths[0],
          mounts: [
            { ...hostPolicy.readOnlyHostPaths[0].mounts[0], mountPropagation: 'Bidirectional' },
          ],
        },
      ],
    },
  ],
] as const)
  test(`Task60 closed policy rejects ${label}`, () => {
    expect(() => normalizeHost(hostSource(), selected)).toThrow(
      'malformed:source-volume-policy-malformed',
    );
  });
test('Task60 accepted consumer cannot cover separate writable checkpoint', () => {
  const authored = hostSource();
  expect(() =>
    normalizeHost({
      ...authored,
      volumes: [
        ...authored.volumes,
        {
          name: 'checkpoint',
          hostPath: { path: '/var/lib/puni-otelcol', type: 'DirectoryOrCreate' },
        },
      ],
      containers: [
        {
          ...authored.containers[0],
          volumeMounts: [
            ...authored.containers[0].volumeMounts,
            { name: 'checkpoint', mountPath: '/var/lib/otelcol', readOnly: false },
          ],
        },
      ],
    }),
  ).toThrow('unsupported:workload-volume-unsupported');
});
test('Task60 duplicate host target across volume names is malformed before unsupported', () => {
  const authored = hostSource();
  const supplied = {
    ...authored,
    unsupported: true,
    volumes: [...authored.volumes, { name: 'second', hostPath: { path: '/sys' } }],
    containers: [
      {
        ...authored.containers[0],
        volumeMounts: [
          ...authored.containers[0].volumeMounts,
          { name: 'second', mountPath: '/input', readOnly: true },
        ],
      },
    ],
  };
  expect(() => normalizeHost(supplied)).toThrow('malformed:workload-mount-unknown');
});

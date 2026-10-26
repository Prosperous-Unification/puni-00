import { rejects } from 'node:assert/strict';

import { expect, it } from 'bun:test';

import { parseCreationEvent, parseCreatorLine } from './k3d-creation';

const id = 'a'.repeat(64);
const name = 'k3d-puni-c123456789abc-platform-tools';
it('extracts only the pinned creator response and never private configuration', () => {
  expect(
    parseCreatorLine(
      `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container ${name} (ID: ${id})"`,
      [name],
    ),
  ).toEqual({ name, id });
  expect(
    parseCreatorLine('DEBU[0000] ClusterConfig: PRIVATE_TOKEN_SENTINEL', [name]),
  ).toBeUndefined();
  expect(
    parseCreatorLine(`DEBU[0000] ClusterConfig: Created container ${name} (ID: ${id})`, [name]),
  ).toBeUndefined();
});
it('refuses malformed or unexpected creator responses without echoing the line', () => {
  for (const line of [
    `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container ${name} (ID: forged)"`,
    `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container foreign (ID: ${id})"`,
  ])
    expect(() => parseCreatorLine(line, [name])).toThrow('creator response');
});
it('retains decimal nanoseconds and strips arbitrary actor attributes', () => {
  expect(
    parseCreationEvent(
      JSON.stringify({
        kind: 'volume',
        action: 'mount',
        id: 'cache',
        time: '1793059200123456789',
        name: '',
        container: id,
        destination: '/images',
        driver: 'local',
        image: '',
      }),
    ),
  ).toEqual({
    kind: 'volume',
    action: 'mount',
    id: 'cache',
    time: '1793059200123456789',
    name: '',
    container: id,
    destination: '/images',
    driver: 'local',
    image: '',
  });
});
it('refuses malformed event shapes and unsafe timestamps without echoing private input', () => {
  for (const line of [
    'PRIVATE_TOKEN_SENTINEL',
    JSON.stringify({
      kind: 'volume',
      action: 'mount',
      id: 'cache',
      time: Number('1793059200123456789'),
    }),
  ])
    expect(() => parseCreationEvent(line)).toThrow('event');
});

import { closeCreation } from './k3d-creation';

function closure() {
  const networkId = 'b'.repeat(64);
  const registryId = 'c'.repeat(64);
  const volume = 'd'.repeat(64);
  const plan = {
    endpoint: 'unix:///var/run/docker.sock',
    daemonId: 'daemon-1',
    profile: 'app',
    network: 'puni-c123456789abc',
    expected: [
      {
        name: 'registry',
        image: 'registry@sha256:' + 'f'.repeat(64),
        role: 'registry',
        temporary: false,
      },
    ],
    binds: [],
  };
  const creators = [{ name: 'registry', id: registryId }];
  const mounts = [
    {
      kind: 'volume',
      name: volume,
      driver: 'local',
      source: `/var/lib/docker/volumes/${volume}/_data`,
      destination: '/var/lib/registry',
      rw: true,
    },
  ];
  const snapshots = [
    {
      id: registryId,
      name: 'registry',
      image: 'sha256:' + 'e'.repeat(64),
      configuredImage: plan.expected[0].image,
      networkIds: [networkId],
      mounts,
    },
  ];
  const event = (kind: string, action: string, id: string, container = '', destination = '') => ({
    kind,
    action,
    id,
    time: '1793059200123456789',
    name: '',
    container,
    destination,
    driver: kind === 'volume' ? 'local' : '',
    image: '',
  });
  const events = [
    event('network', 'create', networkId),
    event('container', 'create', registryId),
    event('volume', 'create', volume),
    event('volume', 'mount', volume, registryId, '/var/lib/registry'),
  ];
  const volumes = [
    {
      name: volume,
      driver: 'local',
      mountpoint: mounts[0].source,
      createdAt: '2026-10-27T00:00:00Z',
      consumers: [registryId],
    },
  ];
  return {
    plan,
    creators,
    snapshots,
    events,
    volumes,
    network: { id: networkId, name: plan.network, peers: [registryId] },
  };
}
it('closes creator IDs and every volume lineage independently of labels', () => {
  expect(closeCreation(closure())).toMatchObject({
    containers: [{ id: 'c'.repeat(64) }],
    volumes: [{ name: 'd'.repeat(64) }],
  });
});
for (const fault of [
  'missing-id',
  'duplicate-id',
  'forged-id',
  'foreign-attachment',
  'missing-volume-create',
  'missing-mount',
  'foreign-volume-consumer',
  'changed-image',
  'wrong-network',
  'lost-tools',
] as const)
  it(`refuses ${fault} in the consuming creation closure`, () => {
    const input = closure();
    if (fault === 'missing-id') input.creators = [];
    if (fault === 'duplicate-id') input.creators.push(input.creators[0]);
    if (fault === 'forged-id') input.creators[0].id = 'f'.repeat(64);
    if (fault === 'foreign-attachment') input.network.peers.push('f'.repeat(64));
    if (fault === 'missing-volume-create')
      input.events = input.events.filter(
        (event) => event.kind !== 'volume' || event.action !== 'create',
      );
    if (fault === 'missing-mount')
      input.events = input.events.filter((event) => event.action !== 'mount');
    if (fault === 'foreign-volume-consumer') input.volumes[0].consumers.push('f'.repeat(64));
    if (fault === 'changed-image') input.snapshots[0].configuredImage = 'foreign';
    if (fault === 'wrong-network') input.snapshots[0].networkIds = ['f'.repeat(64)];
    if (fault === 'lost-tools')
      input.plan.expected.push({
        name: 'tools',
        image: 'tools:5.9.0',
        role: 'tools',
        temporary: true,
      });
    expect(() => closeCreation(input)).toThrow();
  });
it('extracts the actual LOG_COLORS=false format of the locked binary', () => {
  expect(
    parseCreatorLine(
      `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container ${name} (ID: ${id})"`,
      [name],
    ),
  ).toEqual({ name, id });
});

import { captureCreator, startCreationWitness } from './k3d-creation';

it('streams creator IDs durably before failure without exposing raw private diagnostics', async () => {
  const observed: string[] = [];
  const line = `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container ${name} (ID: ${id})"`;
  await rejects(
    captureCreator(
      [
        process.execPath,
        '-e',
        `console.log(${JSON.stringify(line)}); console.error('PRIVATE_TOKEN_SENTINEL'); process.exit(7)`,
      ],
      process.env,
      [name],
      async (creator) => {
        observed.push(creator.id);
        await Promise.resolve();
      },
    ),
    new RegExp('k3d creator failed'),
  );
  expect(observed).toEqual([id]);
});
it('refuses duplicate creator responses and persistence failure without advancing creation', async () => {
  const line = `time="2026-10-27T00:40:17+02:00" level=debug msg="Created container ${name} (ID: ${id})"`;
  await rejects(
    captureCreator(
      [
        process.execPath,
        '-e',
        `console.log(${JSON.stringify(line)}); console.log(${JSON.stringify(line)})`,
      ],
      process.env,
      [name],
      () => Promise.resolve(),
    ),
    new RegExp('Duplicate'),
  );
  await rejects(
    captureCreator(
      [process.execPath, '-e', `console.log(${JSON.stringify(line)})`],
      process.env,
      [name],
      () => Promise.reject(new Error('injected fsync failure')),
    ),
    new RegExp('injected fsync failure'),
  );
});
for (const fault of ['wrong', 'absent', 'malformed', 'disconnected', 'overflow', 'late'] as const)
  it(`refuses ${fault} event stream before exact network handshake`, async () => {
    const event = {
      kind: 'network',
      action: 'create',
      id: 'f'.repeat(64),
      time: '1793059200123456789',
      name: '',
      container: '',
      destination: '',
      driver: '',
      image: '',
    };
    const script =
      fault === 'wrong'
        ? `console.log(${JSON.stringify(JSON.stringify(event))}); setInterval(()=>{},1000)`
        : fault === 'absent'
          ? 'setInterval(()=>{},1000)'
          : fault === 'malformed'
            ? "console.log('PRIVATE_TOKEN_SENTINEL'); setInterval(()=>{},1000)"
            : fault === 'overflow'
              ? "console.log('x'.repeat(300000)); setInterval(()=>{},1000)"
              : 'process.exit(0)';
    const witness = startCreationWitness([process.execPath, '-e', script], process.env, () =>
      Promise.resolve(),
    );
    try {
      await rejects(witness.requireNetwork(id, 100));
    } finally {
      await witness.stop();
    }
  });
it('requires the actual returned network create event and preserves safe event fields', async () => {
  const event = {
    kind: 'network',
    action: 'create',
    id,
    time: '1793059200123456789',
    name: '',
    container: '',
    destination: '',
    driver: '',
    image: '',
  };
  const saved: unknown[] = [];
  const witness = startCreationWitness(
    [
      process.execPath,
      '-e',
      `console.log(${JSON.stringify(JSON.stringify(event))}); setInterval(()=>{},1000)`,
    ],
    process.env,
    async (event) => {
      saved.push(event);
      await Promise.resolve();
    },
  );
  try {
    await witness.requireNetwork(id, 1000);
    expect(saved).toEqual([event]);
  } finally {
    await witness.stop();
  }
});
it('accounts for serial tools already destroyed before inspection using creator and complete lifecycle evidence', () => {
  const input = closure();
  input.plan.expected.push({ name: 'tools', image: 'tools:5.9.0', role: 'tools', temporary: true });
  for (const id of ['1'.repeat(64), '2'.repeat(64)]) {
    input.creators.push({ name: 'tools', id });
    input.events.push(
      ...[
        {
          kind: 'container',
          action: 'create',
          id,
          time: '1793059200123456789',
          name: 'tools',
          container: '',
          destination: '',
          driver: '',
          image: 'tools:5.9.0',
        },
        {
          kind: 'volume',
          action: 'mount',
          id: 'd'.repeat(64),
          time: '1793059200123456790',
          name: '',
          container: id,
          destination: '/k3d/images',
          driver: 'local',
          image: '',
        },
        {
          kind: 'container',
          action: 'destroy',
          id,
          time: '1793059200123456791',
          name: 'tools',
          container: '',
          destination: '',
          driver: '',
          image: 'tools:5.9.0',
        },
      ],
    );
  }
  expect(closeCreation(input)).toMatchObject({ containers: [{ name: 'registry' }] });
});
it('waits for in-flight evidence persistence when stopping the witness', async () => {
  const progress = { entered: false };
  let persisted = false;
  const event = {
    kind: 'network',
    action: 'create',
    id,
    time: '1793059200123456789',
    name: '',
    container: '',
    destination: '',
    driver: '',
    image: '',
  };
  const witness = startCreationWitness(
    [process.execPath, '-e', `console.log(${JSON.stringify(JSON.stringify(event))})`],
    process.env,
    async () => {
      progress.entered = true;
      await Bun.sleep(80);
      persisted = true;
    },
  );
  while (!progress.entered) await Bun.sleep(5);
  await Bun.sleep(15);
  await witness.stop();
  expect(persisted).toBe(true);
});

it('aborts the active creator when its witness disconnects before more IDs are returned', async () => {
  const abort = new AbortController();
  const observed: string[] = [];
  const line = `time="2026-10-27T00:00:00Z" level=debug msg="Created container ${name} (ID: ${id})"`;
  const capture = captureCreator(
    [
      process.execPath,
      '-e',
      `setTimeout(()=>console.log(${JSON.stringify(line)}),200); setInterval(()=>{},1000)`,
    ],
    process.env,
    [name],
    (creator) => {
      observed.push(creator.id);
      return Promise.resolve();
    },
    [],
    abort.signal,
  );
  setTimeout(() => {
    abort.abort();
  }, 30);
  await rejects(capture, /witness/);
  expect(observed).toEqual([]);
}, 1000);
it('bounds discarded private debug output before accepting later valid creator evidence', async () => {
  const line = `time="2026-10-27T00:00:00Z" level=debug msg="Created container ${name} (ID: ${id})"`;
  await rejects(
    captureCreator(
      [
        process.execPath,
        '-e',
        `console.log(('x'.repeat(200000)+'\\n').repeat(90)); console.log(${JSON.stringify(line)})`,
      ],
      process.env,
      [name],
      () => Promise.resolve(),
    ),
    /overflow/,
  );
});
it('refuses a disconnected stream even when it previously delivered the exact network handshake', async () => {
  const event = {
    kind: 'network',
    action: 'create',
    id,
    time: '1793059200123456789',
    name: '',
    container: '',
    destination: '',
    driver: '',
    image: '',
  };
  const witness = startCreationWitness(
    [process.execPath, '-e', `console.log(${JSON.stringify(JSON.stringify(event))})`],
    process.env,
    () => Promise.resolve(),
  );
  await Bun.sleep(30);
  try {
    await rejects(witness.requireNetwork(id), /disconnected/);
  } finally {
    await witness.stop();
  }
});

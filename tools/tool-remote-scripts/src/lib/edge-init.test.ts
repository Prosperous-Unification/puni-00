import { describe, expect, test } from 'bun:test';

import { syntheticContainer as container } from '../../test/edge-init-fixture';
import {
  admitInvariantProfile,
  candidateInvariant,
  compareCandidate,
  constructCandidate,
  CREATED_PROFILE,
  encodeOrderedEnv,
  type InvariantContext,
  type NativeContainer,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';

function profileContext(observed: NativeContainer): InvariantContext {
  return {
    profile: CREATED_PROFILE,
    owner: {
      role: 'replacement',
      id: observed.id,
      originalId: 'a'.repeat(64),
      phase:
        observed.state['Status'] === 'created'
          ? 'never-started'
          : observed.state['Status'] === 'running'
            ? 'running'
            : 'stopped',
    },
    networks: [{ name: 'edge', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
  };
}
const projectProfile = (observed: NativeContainer) =>
  projectInvariant(observed, profileContext(observed));
const compareProfile = (original: NativeContainer, observed: NativeContainer) => {
  compareCandidate(original, observed, profileContext(observed));
};

const image = `sha256:${'b'.repeat(64)}`;

function candidate() {
  const observed = container();
  observed.Id = 'd'.repeat(64);
  observed.Name = '/wbs-init-synthetic-registry';
  observed.Config.Image = image;
  observed.HostConfig.Init = true;
  return observed;
}

describe('Init-only native preservation', () => {
  test('admits native API 1.52 Config without OnBuild and preserves its absence', () => {
    const original = container(),
      observed = candidate();
    Reflect.deleteProperty(original.Config, 'OnBuild');
    Reflect.deleteProperty(observed.Config, 'OnBuild');
    const parsed = parseNativeContainer(original);
    expect(Object.hasOwn(parsed.config, 'OnBuild')).toBe(false);
    expect(Object.hasOwn(constructCandidate(parsed).Config, 'OnBuild')).toBe(false);
    expect(() => {
      compareCandidate(parsed, parseNativeContainer(observed));
    }).not.toThrow();
    Object.assign(observed.Config, { OnBuild: null });
    expect(() => {
      compareCandidate(parsed, parseNativeContainer(observed));
    }).toThrow();
  });
  for (const onBuild of [null, [], ['RUN /bin/true']]) {
    test(`preserves a present native OnBuild value ${JSON.stringify(onBuild)}`, () => {
      const original = container(),
        observed = candidate();
      Object.assign(original.Config, { OnBuild: onBuild });
      Object.assign(observed.Config, { OnBuild: onBuild });
      const parsed = parseNativeContainer(original);
      expect(constructCandidate(parsed).Config['OnBuild']).toEqual(onBuild);
      expect(() => {
        compareCandidate(parsed, parseNativeContainer(observed));
      }).not.toThrow();
      Reflect.deleteProperty(observed.Config, 'OnBuild');
      expect(() => {
        compareCandidate(parsed, parseNativeContainer(observed));
      }).toThrow();
    });
  }
  for (const onBuild of [true, 1, 'RUN /bin/true', [1], { unexpected: true }]) {
    test(`rejects malformed native OnBuild ${JSON.stringify(onBuild)}`, () => {
      const observed = container();
      Object.assign(observed.Config, { OnBuild: onBuild });
      expect(() => parseNativeContainer(observed)).toThrow();
    });
  }
  test('shares the complete invariant projection without rewriting an observed candidate', () => {
    const raw = container();
    const original = parseNativeContainer(raw);
    const expected = {
      image,
      config: raw.Config,
      host: raw.HostConfig,
      mounts: raw.Mounts,
      endpoints: {
        ['c'.repeat(64)]: {
          Aliases: ['registry'],
          IPAMConfig: null,
          Links: null,
          DriverOpts: null,
          GwPriority: 0,
        },
      },
    };
    expect(projectInvariant(original)).toEqual(expected);
    expect(candidateInvariant(original)).toEqual({
      ...expected,
      config: { ...raw.Config, Image: image },
      host: { ...raw.HostConfig, Init: true },
    });
    const observed = candidate();
    observed.HostConfig.Init = false;
    observed.Config.Image = 'wrong:spelling';
    expect(projectInvariant(parseNativeContainer(observed))).toEqual({
      ...expected,
      config: { ...raw.Config, Image: 'wrong:spelling' },
      host: { ...raw.HostConfig, Init: false },
    });
  });
  test('constructs from observed values, retaining hostname, null entrypoint and ordered nondefault Env', () => {
    const request = constructCandidate(parseNativeContainer(container()));
    expect(request.Config).toEqual({ ...container().Config, Image: image });
    expect(request.HostConfig).toEqual({ ...container().HostConfig, Init: true });
    expect(request.NetworkingConfig).toEqual({
      EndpointsConfig: {
        ['c'.repeat(64)]: {
          Aliases: ['registry'],
          IPAMConfig: null,
          Links: null,
          DriverOpts: null,
          GwPriority: 0,
        },
      },
    });
  });

  test('accepts only inspected mount ordering as unordered', () => {
    const original = container();
    const replacement = candidate();
    const bind = {
      ...original.Mounts[0],
      Type: 'bind',
      Name: 'config',
      Source: '/synthetic/config',
      Destination: '/etc/registry',
    };
    original.Mounts.push(bind);
    replacement.Mounts.unshift(bind);
    expect(() => {
      compareCandidate(parseNativeContainer(original), parseNativeContainer(replacement));
    }).not.toThrow();
  });

  const changes: [string, (observed: ReturnType<typeof container>) => void][] = [
    ['Env order', (observed) => observed.Config.Env.reverse()],
    ['Env value', (observed) => (observed.Config.Env[0] = 'REGISTRY_STORAGE_DELETE_ENABLED=false')],
    ['image', (observed) => (observed.Image = `sha256:${'e'.repeat(64)}`)],
    ['hostname', (observed) => (observed.Config.Hostname = 'changed')],
    [
      'security',
      (observed) => Object.assign(observed.HostConfig, { SecurityOpt: ['no-new-privileges'] }),
    ],
    [
      'missing HostConfig field',
      (observed) => Reflect.deleteProperty(observed.HostConfig, 'Memory'),
    ],
    [
      'port binding',
      (observed) => (observed.HostConfig.PortBindings['5000/tcp'][0].HostIp = '0.0.0.0'),
    ],
    ['mount option', (observed) => (observed.Mounts[0].Mode = 'ro')],
    ['mount source', (observed) => (observed.Mounts[0].Source = '/other')],
    ['alias', (observed) => (observed.NetworkSettings.Networks.edge.Aliases = ['other'])],
    [
      'network missing',
      (observed) => Reflect.deleteProperty(observed.NetworkSettings.Networks, 'edge'),
    ],
  ];
  for (const [description, change] of changes) {
    test(`refuses ${description} drift`, () => {
      const observed = candidate();
      change(observed);
      expect(() => {
        compareCandidate(parseNativeContainer(container()), parseNativeContainer(observed));
      }).toThrow();
    });
  }

  test('rejects duplicate mount destinations', () => {
    const observed = container();
    observed.Mounts.push({ ...observed.Mounts[0] });
    expect(() => parseNativeContainer(observed)).toThrow();
  });

  test.each(['Config', 'HostConfig', 'State'])('rejects unsupported %s fields', (field) => {
    const observed = container();
    Object.assign(observed[field as 'Config'], { UnexpectedNativeField: true });
    expect(() => parseNativeContainer(observed)).toThrow();
  });

  test('rejects unsupported nested network fields', () => {
    const observed = container();
    Object.assign(observed.NetworkSettings.Networks.edge, { UnexpectedNativeField: true });
    expect(() => parseNativeContainer(observed)).toThrow();
  });

  test.each(['constructor', 'toString', 'valueOf', '__proto__'])(
    'rejects inherited rule names such as %s',
    (key) => {
      const observed = container();
      Object.defineProperty(observed.Config, key, {
        value: 'PRIVATE_CONFIG_SENTINEL',
        enumerable: true,
      });
      expect(() => parseNativeContainer(observed)).toThrow();
    },
  );

  for (const env of [['A=x', 'A=y'], ['INVALID-KEY=x'], [12], null, undefined]) {
    test(`rejects malformed or duplicate Env ${JSON.stringify(env)}`, () => {
      expect(() => encodeOrderedEnv(env)).toThrow();
    });
  }

  test.each([
    [['A=\u0000\u001f\u007f'], '["A=\\u0000\\u001f\\u007f"]'],
    [['A=é中😀'], '["A=\\u00e9\\u4e2d\\ud83d\\ude00"]'],
    [['A=\\"\ud800', 'EMPTY='], '["A=\\\\\\"\\ud800","EMPTY="]'],
  ])('matches frozen Python ensure-ASCII encoding %j', (env, encoded) => {
    expect(encodeOrderedEnv(env)).toBe(encoded);
  });
});

function inertOom(value: unknown = false) {
  const observed = candidate();
  Object.assign(observed.HostConfig, { OomKillDisable: value });
  Object.assign(observed.State, {
    Status: 'created',
    Running: false,
    Pid: 0,
    StartedAt: '0001-01-01T00:00:00Z',
  });
  return observed;
}
function oomSource(value: unknown = null) {
  const original = container();
  Object.assign(original.HostConfig, { OomKillDisable: value });
  return parseNativeContainer(original);
}

describe('measured inert OOM representation', () => {
  test('retains the null request and independently expected invariant through created false and running null', () => {
    const original = oomSource(),
      raw = inertOom();
    const expected = candidateInvariant(original);
    expect(expected.host['OomKillDisable']).toBe(null);
    expect(constructCandidate(original).HostConfig['OomKillDisable']).toBe(null);
    const observed = parseNativeContainer(raw);
    expect(() => {
      compareCandidate(original, observed);
    }).toThrow();
    expect(projectProfile(observed)).toEqual(expected);
    expect(() => {
      compareProfile(original, observed);
    }).not.toThrow();
    expect(raw.HostConfig).toMatchObject({ OomKillDisable: false });
    expect(observed.host['OomKillDisable']).toBe(false);
    const running = candidate();
    Object.assign(running.HostConfig, { OomKillDisable: null });
    expect(projectProfile(parseNativeContainer(running))).toEqual(expected);
    expect(candidateInvariant(original, CREATED_PROFILE)).toEqual(expected);
    expect(() => {
      compareProfile(original, parseNativeContainer(running));
    }).not.toThrow();
  });
  for (const [name, change] of [
    [
      'true',
      (raw: ReturnType<typeof candidate>) =>
        Object.assign(raw.HostConfig, { OomKillDisable: true }),
    ],
    [
      'absent',
      (raw: ReturnType<typeof candidate>) =>
        Reflect.deleteProperty(raw.HostConfig, 'OomKillDisable'),
    ],
    [
      'running',
      (raw: ReturnType<typeof candidate>) =>
        Object.assign(raw.State, { Status: 'running', Running: true, Pid: 123 }),
    ],
    [
      'stopped',
      (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Status: 'exited' }),
    ],
    [
      'running-flag',
      (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Running: true }),
    ],
    ['paused', (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Paused: true })],
    [
      'restarting',
      (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Restarting: true }),
    ],
    ['dead', (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Dead: true })],
    ['PID', (raw: ReturnType<typeof candidate>) => Object.assign(raw.State, { Pid: 123 })],
    [
      'started',
      (raw: ReturnType<typeof candidate>) =>
        Object.assign(raw.State, { StartedAt: '2026-01-01T00:00:00Z' }),
    ],
    [
      'finished',
      (raw: ReturnType<typeof candidate>) =>
        Object.assign(raw.State, { FinishedAt: '2026-01-01T00:00:00Z' }),
    ],
    ['restarts', (raw: ReturnType<typeof candidate>) => raw.RestartCount++],
    ['sandbox', (raw: ReturnType<typeof candidate>) => (raw.NetworkSettings.SandboxID = 'active')],
    [
      'sandbox-key',
      (raw: ReturnType<typeof candidate>) => (raw.NetworkSettings.SandboxKey = '/active'),
    ],
    [
      'port',
      (raw: ReturnType<typeof candidate>) =>
        Object.assign(raw.NetworkSettings.Ports, { '5000/tcp': [] }),
    ],
    [
      'endpoint',
      (raw: ReturnType<typeof candidate>) =>
        (raw.NetworkSettings.Networks.edge.EndpointID = 'active'),
    ],
    [
      'v4',
      (raw: ReturnType<typeof candidate>) =>
        (raw.NetworkSettings.Networks.edge.IPAddress = '172.18.0.2'),
    ],
    [
      'v6',
      (raw: ReturnType<typeof candidate>) =>
        (raw.NetworkSettings.Networks.edge.GlobalIPv6Address = '::1'),
    ],
    ['Init', (raw: ReturnType<typeof candidate>) => (raw.HostConfig.Init = false)],
    ['Image', (raw: ReturnType<typeof candidate>) => (raw.Config.Image = 'wrong:spelling')],
    ['Env', (raw: ReturnType<typeof candidate>) => raw.Config.Env.push('DRIFT=1')],
    [
      'Entrypoint',
      (raw: ReturnType<typeof candidate>) => Object.assign(raw.Config, { Entrypoint: [] }),
    ],
    ['OnBuild', (raw: ReturnType<typeof candidate>) => Object.assign(raw.Config, { OnBuild: [] })],
  ] as const)
    test(`profile refuses ${name} drift`, () => {
      const raw = inertOom();
      change(raw);
      expect(() => {
        compareProfile(oomSource(), parseNativeContainer(raw));
      }).toThrow();
    });
  for (const value of [true, false, undefined])
    test(`profile refuses source ${String(value)}`, () => {
      const raw = container();
      if (value !== undefined) Object.assign(raw.HostConfig, { OomKillDisable: value });
      expect(() => candidateInvariant(parseNativeContainer(raw), CREATED_PROFILE)).toThrow();
    });
  for (const value of ['false', 0, []])
    test(`parser refuses OOM type ${JSON.stringify(value)}`, () => {
      expect(() => parseNativeContainer(inertOom(value))).toThrow();
    });
  test('wrong profile and daemon evidence refuse independently', () => {
    expect(() => projectInvariant(parseNativeContainer(inertOom()), 'unknown' as never)).toThrow();
    expect(() => candidateInvariant(oomSource(), 'unknown' as never)).toThrow();
    const version = { Version: '29.1.3', ApiVersion: '1.52', Os: 'linux' };
    const info = {
      ServerVersion: '29.1.3',
      OSType: 'linux',
      CgroupVersion: '2',
      CgroupDriver: 'systemd',
    };
    expect(admitInvariantProfile(version, info)).toBe(CREATED_PROFILE);
    for (const key of Object.keys(version)) {
      expect(() => admitInvariantProfile({ ...version, [key]: 'wrong' }, info)).toThrow();
      const missing = { ...version };
      Reflect.deleteProperty(missing, key);
      expect(() => admitInvariantProfile(missing, info)).toThrow();
    }
    for (const key of Object.keys(info)) {
      expect(() => admitInvariantProfile(version, { ...info, [key]: 'wrong' })).toThrow();
      const missing = { ...info };
      Reflect.deleteProperty(missing, key);
      expect(() => admitInvariantProfile(version, missing)).toThrow();
    }
  });
});

test('profile preserves one expected hash through inert, running and synthetic stopped-null', () => {
  const source = oomSource();
  const expected = candidateInvariant(source);
  const created = parseNativeContainer(inertOom());
  const raw = candidate();
  Object.assign(raw.HostConfig, { OomKillDisable: null });
  const running = parseNativeContainer(raw);
  Object.assign(raw.State, {
    Status: 'exited',
    Running: false,
    Pid: 0,
    FinishedAt: '2026-01-02T00:00:00Z',
  });
  const stopped = parseNativeContainer(raw);
  for (const observed of [created, running, stopped])
    expect(projectProfile(observed)).toEqual(expected);
  expect(() => projectProfile(parseNativeContainer(inertOom(true)))).toThrow();
  const absent = inertOom();
  Reflect.deleteProperty(absent.HostConfig, 'OomKillDisable');
  expect(() => projectProfile(parseNativeContainer(absent))).toThrow();
  // Strict default still preserves a separately requested false without granting the observed profile.
  const requestedFalse = oomSource(false),
    actualFalse = candidate();
  Object.assign(actualFalse.HostConfig, { OomKillDisable: false });
  expect(() => {
    compareCandidate(requestedFalse, parseNativeContainer(actualFalse));
  }).not.toThrow();
});

test('parses a native never-started empty NetworkID losslessly without granting original construction', () => {
  const raw = inertOom();
  raw.NetworkSettings.Networks.edge.NetworkID = '';
  const parsed = parseNativeContainer(raw);
  expect(parsed.networks['edge']).toMatchObject({ NetworkID: '' });
  expect(() => constructCandidate(parsed)).toThrow();
  expect(() => projectInvariant(parsed)).toThrow();
  raw.State.Running = true;
  raw.State.Status = 'running';
  raw.State.Pid = 123;
  expect(parseNativeContainer(raw).networks['edge']).toMatchObject({ NetworkID: '' });
  expect(() => projectInvariant(parseNativeContainer(raw))).toThrow();
});
for (const value of [null, undefined, 'a'.repeat(12), 'g'.repeat(64), ' ', '/network']) {
  test(`endpoint parser refuses invalid NetworkID ${String(value)}`, () => {
    const raw = inertOom();
    if (value === undefined) Reflect.deleteProperty(raw.NetworkSettings.Networks.edge, 'NetworkID');
    else Object.assign(raw.NetworkSettings.Networks.edge, { NetworkID: value });
    expect(() => parseNativeContainer(raw)).toThrow();
  });
}

test('owned never-started blank endpoints share independent expected full-ID settings without mutating observations', () => {
  const original = oomSource(),
    raw = inertOom();
  raw.NetworkSettings.Networks.edge.NetworkID = '';
  const observed = parseNativeContainer(raw),
    context = profileContext(observed),
    expected = candidateInvariant(original, CREATED_PROFILE);
  expect(projectInvariant(observed, context)).toEqual(expected);
  expect(() => {
    compareCandidate(original, observed, context);
  }).not.toThrow();
  expect(observed.networks['edge']).toMatchObject({ NetworkID: '' });
  expect(constructCandidate(original).NetworkingConfig.EndpointsConfig).toEqual(expected.endpoints);
  const running = candidate();
  Object.assign(running.HostConfig, { OomKillDisable: null });
  expect(projectProfile(parseNativeContainer(running))).toEqual(expected);
  const full = inertOom();
  expect(projectProfile(parseNativeContainer(full))).toEqual(expected);
});
for (const fault of [
  'profile',
  'old-profile',
  'owner',
  'original',
  'role',
  'phase',
  'running-blank',
  'stopped-blank',
  'name',
  'extra-name',
  'missing-name',
  'duplicate-name',
  'duplicate-id',
  'wrong-id',
  'mode',
  'ipam',
  'links',
  'aliases',
  'alias-order',
  'driver',
  'priority',
  'gateway',
  'v6-gateway',
  'mac',
  'v4-prefix',
  'v6-prefix',
  'dns',
] as const) {
  test(`owned endpoint context refuses ${fault}`, () => {
    const raw = inertOom();
    raw.NetworkSettings.Networks.edge.NetworkID = '';
    const original = oomSource();
    let observed = parseNativeContainer(raw);
    const context = structuredClone(profileContext(observed));
    if (fault === 'profile') Object.assign(context, { profile: 'unknown' });
    if (fault === 'old-profile')
      Object.assign(context, { profile: 'engine-29.1.3-api-1.52-cgroup2-created-oom-v1' });
    if (fault === 'owner') Object.assign(context.owner, { id: 'f'.repeat(64) });
    if (fault === 'original') Object.assign(context.owner, { originalId: 'f'.repeat(64) });
    if (fault === 'role') Object.assign(context.owner, { role: 'original' });
    if (fault === 'phase') Object.assign(context.owner, { phase: 'running' });
    if (fault === 'name')
      Object.assign(context, {
        networks: [{ name: 'other', id: 'c'.repeat(64), sha256: '0'.repeat(64) }],
      });
    if (fault === 'extra-name')
      Object.assign(raw.NetworkSettings.Networks, {
        other: structuredClone(raw.NetworkSettings.Networks.edge),
      });
    if (fault === 'missing-name') Reflect.deleteProperty(raw.NetworkSettings.Networks, 'edge');
    if (fault === 'duplicate-name')
      Object.assign(context, { networks: [...context.networks, ...context.networks] });
    if (fault === 'duplicate-id') {
      Object.assign(raw.NetworkSettings.Networks, {
        other: structuredClone(raw.NetworkSettings.Networks.edge),
      });
      Object.assign(context, {
        networks: [...context.networks, { ...context.networks[0], name: 'other' }],
      });
    }
    if (fault === 'wrong-id') raw.NetworkSettings.Networks.edge.NetworkID = 'f'.repeat(64);
    if (fault === 'mode') raw.HostConfig.NetworkMode = 'other';
    if (fault === 'ipam')
      Object.assign(raw.NetworkSettings.Networks.edge, {
        IPAMConfig: { IPv4Address: '172.18.0.2' },
      });
    if (fault === 'links') Object.assign(raw.NetworkSettings.Networks.edge, { Links: ['backend'] });
    if (fault === 'aliases') raw.NetworkSettings.Networks.edge.Aliases.push('other');
    if (fault === 'alias-order') raw.NetworkSettings.Networks.edge.Aliases = ['other', 'registry'];
    if (fault === 'driver')
      Object.assign(raw.NetworkSettings.Networks.edge, { DriverOpts: { option: 'changed' } });
    if (fault === 'priority') raw.NetworkSettings.Networks.edge.GwPriority = 1;
    if (fault === 'gateway') raw.NetworkSettings.Networks.edge.Gateway = '172.18.0.1';
    if (fault === 'v6-gateway') raw.NetworkSettings.Networks.edge.IPv6Gateway = '::1';
    if (fault === 'mac') raw.NetworkSettings.Networks.edge.MacAddress = '00:11:22:33:44:55';
    if (fault === 'v4-prefix') raw.NetworkSettings.Networks.edge.IPPrefixLen = 24;
    if (fault === 'v6-prefix') raw.NetworkSettings.Networks.edge.GlobalIPv6PrefixLen = 64;
    if (fault === 'dns') Object.assign(raw.NetworkSettings.Networks.edge, { DNSNames: [] });
    if (fault === 'running-blank' || fault === 'stopped-blank') {
      Object.assign(raw.State, {
        Status: fault === 'running-blank' ? 'running' : 'exited',
        Running: fault === 'running-blank',
        Pid: fault === 'running-blank' ? 123 : 0,
        StartedAt: '2026-01-01T00:00:00Z',
      });
      Object.assign(raw.HostConfig, { OomKillDisable: null });
      Object.assign(context.owner, { phase: fault === 'running-blank' ? 'running' : 'stopped' });
    }
    observed = parseNativeContainer(raw);
    expect(() => {
      compareCandidate(original, observed, context);
    }).toThrow();
  });
}
test('original construction rejects duplicate endpoint identities before request keys collapse', () => {
  const raw = container();
  Object.assign(raw.NetworkSettings.Networks, {
    other: structuredClone(raw.NetworkSettings.Networks.edge),
  });
  expect(() => constructCandidate(parseNativeContainer(raw))).toThrow();
});

for (const key of [
  'Gateway',
  'IPv6Gateway',
  'MacAddress',
  'IPPrefixLen',
  'GlobalIPv6PrefixLen',
  'DNSNames',
])
  test('never-started context refuses absent ' + key, () => {
    const raw = inertOom();
    raw.NetworkSettings.Networks.edge.NetworkID = '';
    Reflect.deleteProperty(raw.NetworkSettings.Networks.edge, key);
    const observed = parseNativeContainer(raw);
    expect(() => projectInvariant(observed, profileContext(observed))).toThrow();
  });

test('direct context admission requires a closed profile, owner and network roster before projecting settings', () => {
  const raw = inertOom();
  raw.NetworkSettings.Networks.edge.NetworkID = '';
  const observed = parseNativeContainer(raw);
  for (const mutate of [
    (context: InvariantContext) => Reflect.deleteProperty(context, 'profile'),
    (context: InvariantContext) => Object.assign(context, { extra: true }),
    (context: InvariantContext) => Object.assign(context.owner, { extra: true }),
    (context: InvariantContext) =>
      Object.assign(context.owner, { id: observed.id, originalId: observed.id }),
    (context: InvariantContext) => Object.assign(context.networks[0], { extra: true }),
    (context: InvariantContext) => Object.assign(context.networks[0], { sha256: 'wrong' }),
    (context: InvariantContext) => Object.assign(context, { networks: [] }),
  ]) {
    const context = structuredClone(profileContext(observed));
    mutate(context);
    expect(() => projectInvariant(observed, context)).toThrow();
  }
  const mode = inertOom();
  mode.NetworkSettings.Networks.edge.NetworkID = '';
  mode.HostConfig.NetworkMode = 'foreign';
  const changed = parseNativeContainer(mode);
  expect(() => projectInvariant(changed, profileContext(changed))).toThrow();
});

test('context network roster enforces its finite bound and Docker name syntax', () => {
  for (const count of [17, 1]) {
    const raw = inertOom();
    const template = raw.NetworkSettings.Networks.edge;
    const names = Array.from({ length: count }, (_, index) =>
      count === 1 ? '/invalid' : `net${String(index)}`,
    );
    Object.assign(raw.NetworkSettings, {
      Networks: Object.fromEntries(names.map((name) => [name, { ...template, NetworkID: '' }])),
    });
    raw.HostConfig.NetworkMode = names[0];
    const observed = parseNativeContainer(raw),
      context = profileContext(observed);
    Object.assign(context, {
      networks: names.map((name, index) => ({
        name,
        id: (index + 1).toString(16).padStart(64, '0'),
        sha256: '0'.repeat(64),
      })),
    });
    expect(() => projectInvariant(observed, context)).toThrow();
  }
});

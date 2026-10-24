import { describe, expect, test } from 'bun:test';

import { syntheticContainer as container } from '../../test/edge-init-fixture';
import {
  admitInvariantProfile,
  candidateInvariant,
  compareCandidate,
  constructCandidate,
  CREATED_OOM_PROFILE,
  encodeOrderedEnv,
  parseNativeContainer,
  projectInvariant,
} from './edge-init';

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
    expect(projectInvariant(observed, CREATED_OOM_PROFILE)).toEqual(expected);
    expect(() => {
      compareCandidate(original, observed, CREATED_OOM_PROFILE);
    }).not.toThrow();
    expect(raw.HostConfig).toMatchObject({ OomKillDisable: false });
    expect(observed.host['OomKillDisable']).toBe(false);
    const running = candidate();
    Object.assign(running.HostConfig, { OomKillDisable: null });
    expect(projectInvariant(parseNativeContainer(running), CREATED_OOM_PROFILE)).toEqual(expected);
    expect(candidateInvariant(original, CREATED_OOM_PROFILE)).toEqual(expected);
    expect(() => {
      compareCandidate(original, parseNativeContainer(running), CREATED_OOM_PROFILE);
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
        compareCandidate(oomSource(), parseNativeContainer(raw), CREATED_OOM_PROFILE);
      }).toThrow();
    });
  for (const value of [true, false, undefined])
    test(`profile refuses source ${String(value)}`, () => {
      const raw = container();
      if (value !== undefined) Object.assign(raw.HostConfig, { OomKillDisable: value });
      expect(() => candidateInvariant(parseNativeContainer(raw), CREATED_OOM_PROFILE)).toThrow();
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
    expect(admitInvariantProfile(version, info)).toBe(CREATED_OOM_PROFILE);
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
    expect(projectInvariant(observed, CREATED_OOM_PROFILE)).toEqual(expected);
  expect(() =>
    projectInvariant(parseNativeContainer(inertOom(true)), CREATED_OOM_PROFILE),
  ).toThrow();
  const absent = inertOom();
  Reflect.deleteProperty(absent.HostConfig, 'OomKillDisable');
  expect(() => projectInvariant(parseNativeContainer(absent), CREATED_OOM_PROFILE)).toThrow();
  // Strict default still preserves a separately requested false without granting the observed profile.
  const requestedFalse = oomSource(false),
    actualFalse = candidate();
  Object.assign(actualFalse.HostConfig, { OomKillDisable: false });
  expect(() => {
    compareCandidate(requestedFalse, parseNativeContainer(actualFalse));
  }).not.toThrow();
});

import { describe, expect, test } from 'bun:test';

import { syntheticContainer as container } from '../../test/edge-init-fixture';
import {
  compareCandidate,
  constructCandidate,
  encodeOrderedEnv,
  parseNativeContainer,
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

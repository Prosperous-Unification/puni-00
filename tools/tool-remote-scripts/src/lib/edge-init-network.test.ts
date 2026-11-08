import { expect, test } from 'bun:test';

import { fingerprint } from './edge-init';
import { parseNetworkInspect, projectNetworkInspect } from './edge-init-network';

const identity = 'a'.repeat(64);
const network = () => ({
  Id: identity,
  Name: 'edge',
  Scope: 'local',
  Driver: 'bridge',
  ConfigOnly: false,
  IPAM: { Driver: 'default', Config: [{ Subnet: '172.24.0.0/16', Gateway: '172.24.0.1' }] },
  Options: {},
  Labels: {},
  ExtraConfiguration: 'pinned',
  Containers: {},
  Status: { IPAM: { Subnets: { '172.24.0.0/16': { IPsInUse: 3, DynamicIPsAvailable: 65533 } } } },
});

test('network configuration pin survives membership and runtime allocation transitions', () => {
  const empty = network();
  const started = structuredClone(empty);
  started.Containers = { [identity]: {} };
  started.Status.IPAM.Subnets['172.24.0.0/16'].IPsInUse = 4;
  started.Status.IPAM.Subnets['172.24.0.0/16'].DynamicIPsAvailable = 65532;
  const before = JSON.stringify(empty);
  const pinned = projectNetworkInspect(empty);
  expect(fingerprint(projectNetworkInspect(started).configuration)).toBe(
    fingerprint(pinned.configuration),
  );
  expect(Object.keys(projectNetworkInspect(started).members)).toEqual([identity]);
  expect(projectNetworkInspect(started).status).toEqual(started.Status);
  expect(JSON.stringify(empty)).toBe(before);
  for (const change of [
    (entry: ReturnType<typeof network>) => (entry.IPAM.Config[0].Gateway = '172.24.0.2'),
    (entry: ReturnType<typeof network>) => Object.assign(entry.Options, { changed: 'yes' }),
    (entry: ReturnType<typeof network>) => Object.assign(entry.Labels, { changed: 'yes' }),
    (entry: ReturnType<typeof network>) => (entry.ExtraConfiguration = 'changed'),
  ]) {
    const altered = structuredClone(empty);
    change(altered);
    expect(fingerprint(projectNetworkInspect(altered).configuration)).not.toBe(
      fingerprint(pinned.configuration),
    );
  }
});

test('raw network counters require exact canonical safe integer lexemes', () => {
  const valid = JSON.stringify(network());
  for (const token of ['0', '9007199254740991']) {
    const raw = valid.replace('"IPsInUse":3', `"IPsInUse":${token}`);
    expect(parseNetworkInspect(raw, 'object').status.IPAM.Subnets['172.24.0.0/16'].IPsInUse).toBe(
      Number(token),
    );
  }
  for (const token of [
    '9007199254740992',
    '18446744073709551615',
    '-1',
    '-0',
    '1.0',
    '1e0',
    '0.0000000000000000000000000000001',
    '9007199254740991.1',
    '"3"',
    'null',
  ]) {
    const raw = valid.replace('"IPsInUse":3', `"IPsInUse":${token}`);
    expect(() => parseNetworkInspect(raw, 'object')).toThrow();
  }
  expect(parseNetworkInspect(`[${valid}]`, 'single-array').configuration['Id']).toBe(identity);
  expect(() => parseNetworkInspect(`[${valid},${valid}]`, 'single-array')).toThrow();
  expect(() => parseNetworkInspect(valid, 'single-array')).toThrow();
  expect(() => parseNetworkInspect(`[${valid}]`, 'object')).toThrow();
});

test('missing and malformed runtime status never become an empty observation', () => {
  const original = network();
  for (const mutate of [
    (entry: Record<string, unknown>) => Reflect.deleteProperty(entry, 'Status'),
    (entry: Record<string, unknown>) => (entry['Status'] = null),
    (entry: Record<string, unknown>) => (entry['Status'] = { ...network().Status, Extra: true }),
    (entry: Record<string, unknown>) => (entry['Status'] = { IPAM: { Subnets: {} } }),
    (entry: Record<string, unknown>) =>
      (entry['Status'] = {
        IPAM: { Subnets: { '172.25.0.0/16': { IPsInUse: 3, DynamicIPsAvailable: 65533 } } },
      }),
    (entry: Record<string, unknown>) =>
      (entry['Status'] = {
        IPAM: {
          Subnets: { '172.24.0.0/16': { IPsInUse: 3, DynamicIPsAvailable: 65533, Extra: 1 } },
        },
      }),
  ]) {
    const malformed: Record<string, unknown> = structuredClone(original);
    mutate(malformed);
    expect(() => projectNetworkInspect(malformed)).toThrow();
  }
  for (const value of [-1, -0, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '3', null]) {
    const malformed = network();
    malformed.Status.IPAM.Subnets['172.24.0.0/16'].IPsInUse = value as number;
    expect(() => projectNetworkInspect(malformed)).toThrow();
  }
});

test('runtime subnet spellings require numeric nonmapped CIDR and exact configured roster', () => {
  const template = network();
  for (const subnet of [
    'host.invalid/24',
    '172.24.0.0/33',
    '172.024.0.0/16',
    'fe80::1%eth0/64',
    '::ffff:c000:201/128',
    '0:0:0:0:0:ffff:c000:201/128',
  ]) {
    const malformed = structuredClone(template);
    malformed.IPAM.Config[0].Subnet = subnet;
    Object.assign(malformed.Status.IPAM, {
      Subnets: { [subnet]: { IPsInUse: 3, DynamicIPsAvailable: 65533 } },
    });
    expect(() => projectNetworkInspect(malformed)).toThrow();
  }
});

test('network shape refuses unsupported kind, configuration and missing membership', () => {
  for (const mutate of [
    (entry: Record<string, unknown>) => Reflect.deleteProperty(entry, 'Containers'),
    (entry: Record<string, unknown>) => (entry['Containers'] = null),
    (entry: Record<string, unknown>) => (entry['Scope'] = 'swarm'),
    (entry: Record<string, unknown>) => (entry['Driver'] = 'overlay'),
    (entry: Record<string, unknown>) => Reflect.deleteProperty(entry, 'ConfigOnly'),
    (entry: Record<string, unknown>) => (entry['ConfigOnly'] = true),
    (entry: Record<string, unknown>) => (entry['IPAM'] = { Driver: 'other', Config: [] }),
    (entry: Record<string, unknown>) => (entry['IPAM'] = { Driver: 'default', Config: [] }),
  ]) {
    const malformed: Record<string, unknown> = structuredClone(network());
    mutate(malformed);
    expect(() => projectNetworkInspect(malformed)).toThrow();
  }
});

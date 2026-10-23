import { expect, test } from 'bun:test';

import { sourceFixture } from '../fixtures/source-dev';
import { identifyInventory } from './docker-inventory';
import { readFields } from './managed-cohort';

function inventory() {
  return ['source', 'caddy', 'unrelated'].map((name, index) => ({
    ...sourceFixture(),
    Id: String(index + 1).repeat(64),
    Name: `/${name}`,
    Mounts: [
      {
        Type: 'bind',
        Source: `/fixture/${name}/z`,
        Destination: '/z',
        RW: true,
        Mode: 'rw',
        Propagation: 'rprivate',
        Extension: { flag: 'kept' },
      },
      {
        Type: 'volume',
        Source: `/fixture/${name}/a`,
        Destination: '/a',
        RW: false,
        Name: `${name}-volume`,
        Driver: 'local',
      },
    ],
  }));
}
test('complete native identity accepts every container mount permutation without changing raw inputs or entries', () => {
  const containers = inventory();
  const before = structuredClone(containers);
  const baseline = identifyInventory(containers);
  expect(containers).toEqual(before);
  if (!Array.isArray(baseline)) throw new Error('inventory identity absent');
  for (const [index, container] of containers.entries()) {
    const mounts = readFields(baseline[index])['mounts'];
    expect(mounts).not.toBe(container.Mounts);
    expect(mounts).toContain(container.Mounts[0]);
    expect(mounts).toContain(container.Mounts[1]);
    container.Mounts.reverse();
  }
  const permuted = structuredClone(containers);
  expect(identifyInventory(containers)).toEqual(baseline);
  expect(containers).toEqual(permuted);
});
for (const invalid of [undefined, null, {}, 'mounts'])
  test(`complete native identity refuses non-array Mounts ${JSON.stringify(invalid)}`, () => {
    const containers = inventory();
    Reflect.set(containers[0], 'Mounts', invalid);
    expect(() => identifyInventory(containers)).toThrow();
  });
for (const invalid of [null, [], 'mount', 1, {}])
  test(`complete native identity refuses malformed mount entry ${JSON.stringify(invalid)}`, () => {
    const containers = inventory();
    Reflect.set(containers[0], 'Mounts', [invalid]);
    expect(() => identifyInventory(containers)).toThrow();
  });
for (const destination of ['', 'relative', '/a/../b', '/a//b', '/a/', '/a/.', '/a\0b'])
  test(`complete native identity refuses noncanonical destination ${JSON.stringify(destination)}`, () => {
    const containers = inventory();
    Reflect.set(containers[0].Mounts[0], 'Destination', destination);
    expect(() => identifyInventory(containers)).toThrow();
  });
test('complete native identity refuses duplicate destinations even when entries are identical', () => {
  const containers = inventory();
  containers[0].Mounts = [containers[0].Mounts[0], structuredClone(containers[0].Mounts[0])];
  expect(() => identifyInventory(containers)).toThrow();
});
test('complete native identity permits the canonical root destination and empty mounts', () => {
  const containers = inventory();
  containers[0].Mounts[0].Destination = '/';
  containers[1].Mounts = [];
  expect(() => identifyInventory(containers)).not.toThrow();
});
for (const fault of ['field', 'missing', 'additional', 'config', 'host', 'process', 'membership'])
  test(`complete native identity retains unrelated ${fault} changes`, () => {
    const containers = inventory();
    const baseline = identifyInventory(structuredClone(containers));
    const unrelated = containers[2];
    if (fault === 'field') Reflect.set(unrelated.Mounts[0], 'Extension', { flag: 'changed' });
    if (fault === 'missing') unrelated.Mounts.pop();
    if (fault === 'additional')
      unrelated.Mounts.push({ ...unrelated.Mounts[0], Destination: '/extra' });
    if (fault === 'config') unrelated.Config.User = '0:0';
    if (fault === 'host') unrelated.HostConfig.Privileged = true;
    if (fault === 'process') unrelated.State.Pid++;
    if (fault === 'membership') containers.pop();
    expect(identifyInventory(containers)).not.toEqual(baseline);
  });

test('distinct Unicode destinations retain exact strings and a total permutation order', () => {
  const containers = inventory();
  containers[0].Mounts[0].Destination = '/\u00e9';
  containers[0].Mounts[1].Destination = '/e\u0301';
  const baseline = identifyInventory(containers);
  containers[0].Mounts.reverse();
  expect(identifyInventory(containers)).toEqual(baseline);
  expect(containers[0].Mounts.map((mount) => mount.Destination)).toEqual(['/e\u0301', '/\u00e9']);
});

test('complete native identity refuses an inherited destination instead of a complete native entry', () => {
  const containers = inventory();
  const inherited: object = Object.create({ Destination: '/inherited' }) as object;
  Reflect.set(containers[0], 'Mounts', [inherited]);
  expect(() => identifyInventory(containers)).toThrow();
});

test('complete native identity refuses array-like objects as Mounts', () => {
  const containers = inventory();
  Reflect.set(containers[0], 'Mounts', { map: () => [] });
  expect(() => identifyInventory(containers)).toThrow();
});
test('complete native identity refuses an array mount entry with a named Destination', () => {
  const containers = inventory();
  const entry: unknown[] = [];
  Reflect.set(entry, 'Destination', '/array');
  Reflect.set(containers[0], 'Mounts', [entry]);
  expect(() => identifyInventory(containers)).toThrow();
});

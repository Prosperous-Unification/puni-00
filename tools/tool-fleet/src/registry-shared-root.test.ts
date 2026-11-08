import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { createRegistryFixtureClock } from './registry-maintenance-clock.fixture';
import {
  requireRegistrySharedTags,
  selectRegistrySharedRetirement,
} from './registry-maintenance-shared.native';
import { writeRegistrySharedRootFixture } from './registry-shared-root.fixture';

test('two older complete bundles share an exact repository/root while unique tiers and current differ', async () => {
  const first = await writeRegistrySharedRootFixture(
    await scratchAsync('shared-first-'),
    'old-one',
  );
  const second = await writeRegistrySharedRootFixture(
    await scratchAsync('shared-second-'),
    'old-two',
  );
  const current = await writeRegistrySharedRootFixture(
    await scratchAsync('shared-current-'),
    'current',
  );
  expect(first).toHaveLength(2);
  expect(second).toHaveLength(2);
  expect(current).toHaveLength(1);
  expect(first.map((artifact) => artifact.repository)).toEqual([
    'retained/common',
    'retained/unique',
  ]);
  expect(second.map((artifact) => artifact.repository)).toEqual([
    'retained/common',
    'retained/unique',
  ]);
  expect(current[0]?.repository).toBe('retained/current');
  expect(first[0]?.digest).toBe(second[0]?.digest);
  expect(first[0]?.reference).toBe(second[0]?.reference);
  expect(first[1]?.digest).not.toBe(second[1]?.digest);
  expect(first[1]?.reference).not.toBe(second[1]?.reference);
  expect(current[0]?.digest).not.toBe(first[0]?.digest);
  for (const artifact of [...first, ...second, ...current])
    for (const content of artifact.contents) await verifyContent(content);
  const common = first.at(0);
  if (common === undefined) throw new Error('Missing common tier');
  expect(common.contents.filter((content) => content.isManifest)).toHaveLength(3);
  const currentDigests = new Set(current[0]?.contents.map((content) => content.digest));
  expect(common.contents.filter((content) => currentDigests.has(content.digest))).toHaveLength(1);
});

test('separate owner clock instances need fresh root timestamps after an elapsed operation', async () => {
  const offset = 8 * 24 * 60 * 60 * 1000;
  const original = Date.now;
  const stamp = new Date(Date.now() + offset).toISOString();
  const first = createRegistryFixtureClock(stamp);
  await Bun.sleep(15);
  const finished = Date.parse(first());
  const staleRelease = createRegistryFixtureClock(stamp);
  expect(Date.parse(staleRelease())).toBeLessThan(finished);
  await Bun.sleep(5);
  const release = createRegistryFixtureClock(new Date(Date.now() + offset).toISOString());
  expect(Date.parse(release())).toBeGreaterThan(finished);
  await Bun.sleep(5);
  const releaseFinished = Date.parse(release());
  await Bun.sleep(5);
  const second = createRegistryFixtureClock(new Date(Date.now() + offset).toISOString());
  expect(Date.parse(second())).toBeGreaterThan(releaseFinished);
  expect(Date.now).toBe(original);
});

test('fixed shared owner dispatcher selects distinct maintenance operation identities', () => {
  expect(selectRegistrySharedRetirement('shared-retire-first')).toBe('native-shared-retire-first');
  expect(selectRegistrySharedRetirement('shared-retire-second')).toBe(
    'native-shared-retire-second',
  );
  expect(selectRegistrySharedRetirement('shared-retire-third')).toBeUndefined();
});

test('pinned explicit null tags certify only an expected empty repository', () => {
  expect(() => {
    requireRegistrySharedTags(200, { name: 'retained/common', tags: null }, 'retained/common', []);
  }).not.toThrow();
  expect(() => {
    requireRegistrySharedTags(200, { name: 'retained/common', tags: [] }, 'retained/common', []);
  }).not.toThrow();
  expect(() => {
    requireRegistrySharedTags(
      200,
      { name: 'retained/common', tags: ['shared-root'] },
      'retained/common',
      ['shared-root'],
    );
  }).not.toThrow();
  expect(() => {
    requireRegistrySharedTags(200, { name: 'retained/common', tags: null }, 'retained/common', [
      'shared-root',
    ]);
  }).toThrow();
  expect(() => {
    requireRegistrySharedTags(200, { name: 'retained/current', tags: null }, 'retained/common', []);
  }).toThrow();
  for (const parsed of [
    { name: 'retained/common' },
    { name: 'retained/common', tags: 42 },
    { name: 'retained/common', tags: null, extra: true },
    null,
  ])
    expect(() => {
      requireRegistrySharedTags(200, parsed, 'retained/common', []);
    }).toThrow();
  for (const status of [404, 500, 202])
    expect(() => {
      requireRegistrySharedTags(
        status,
        { name: 'retained/common', tags: null },
        'retained/common',
        [],
      );
    }).toThrow();
});

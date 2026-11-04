import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { accountFilesystem, admitScratch, requireFreshCapacity } from './registry-capacity';

const filesystem = {
  bsize: 4096n,
  blocks: 1000000n,
  bfree: 700000n,
  bavail: 600000n,
  files: 10000n,
  ffree: 9000n,
};

it('excludes privileged reserved blocks without counting them as allocated use', () => {
  expect(accountFilesystem(filesystem)).toEqual({
    allocationUnitBytes: 4096,
    usableBytes: 900000 * 4096,
    usedBytes: 300000 * 4096,
    availableBytes: 600000 * 4096,
    reservedBytes: 100000 * 4096,
    totalInodes: 10000,
    usedInodes: 1000,
  });
});

it('refuses unknown inconsistent and unsafe integer filesystem counters', () => {
  for (const invalid of [
    { ...filesystem, bavail: 700001n },
    { ...filesystem, bfree: 1000001n },
    { ...filesystem, ffree: 10001n },
    { ...filesystem, blocks: 2n ** 53n },
    { ...filesystem, bsize: 0n },
    { ...filesystem, files: 0n },
    { ...filesystem, bavail: -1n },
    { ...filesystem, blocks: undefined },
  ])
    expect(() => accountFilesystem(invalid as typeof filesystem)).toThrow();
});

it('unknown or stale measurement refuses', () => {
  const now = 1792886400000;
  const capacity = {
    maximumBytes: 1000000,
    usableBytes: 1000000,
    usedBytes: 1000,
    totalInodes: 10000,
    usedInodes: 10,
    rootFreeBytes: 30 * 1024 ** 3,
  };
  for (const measuredAt of [now - 5001, now + 1, NaN, undefined])
    expect(() => requireFreshCapacity({ measuredAt, capacity }, now)).toThrow();
  expect(() => requireFreshCapacity({ measuredAt: now, capacity: {} }, now)).toThrow();
});

it('bounds scratch bytes and inodes independently before publication', () => {
  expect(() => {
    admitScratch({ bytes: 1024, inodes: 10 }, { bytes: 1024, inodes: 10 });
  }).not.toThrow();
  expect(() => {
    admitScratch({ bytes: 1025, inodes: 1 }, { bytes: 1024, inodes: 10 });
  }).toThrow('scratch');
  expect(() => {
    admitScratch({ bytes: 1, inodes: 11 }, { bytes: 1024, inodes: 10 });
  }).toThrow('scratch');
});

it('revokes expired and malformed writable permits instead of silently renewing them', async () => {
  const { writeFile, chmod, readFile } = await import('node:fs/promises');
  const { createWritePermit } = await import('./registry-capacity');
  const directory = await scratchAsync('registry-permit-');
  await chmod(directory, 0o700);
  await writeFile(`${directory}/journal.json`, 'canonical', { mode: 0o600 });
  const permit = createWritePermit(directory, () =>
    Promise.resolve({
      maximumBytes: 1000000,
      usableBytes: 1000000,
      usedBytes: 1000,
      totalInodes: 10000,
      usedInodes: 10,
      rootFreeBytes: 30 * 1024 ** 3,
    }),
  );
  expect(await permit.isFresh()).toBe(false);
  const refused = await permit.prepare('next', false).then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(refused).toBeInstanceOf(Error);
  expect(String(refused)).toContain('explicit reopen');
  await permit.prepare('next', true);
  expect(await permit.isFresh()).toBe(false);
  await writeFile(`${directory}/journal.json`, 'next');
  expect(await permit.isFresh()).toBe(true);
  await permit.publish('next');
  const saved = await readFile(`${directory}/writable.permit`, 'utf8');
  await writeFile(`${directory}/writable.permit`, saved.replace(/\S+ \S+ /, 'invalid permit '));
  const malformed = await permit.isFresh().then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(malformed).toBeInstanceOf(Error);
  await permit.revoke();
  expect(await permit.isFresh()).toBe(false);
});

it('requires both scratch envelope dimensions at the admission boundary', () => {
  expect(() => {
    admitScratch({ bytes: 1 } as { bytes: number; inodes: number }, { bytes: 1024, inodes: 10 });
  }).toThrow();
});

it('requires the current revocation nonce instance and boot acknowledgement', async () => {
  const { chmod, readFile, writeFile } = await import('node:fs/promises');
  const { createWritePermit } = await import('./registry-capacity');
  const directory = await scratchAsync('registry-acknowledgement-');
  const registry = await scratchAsync('registry-observation-');
  await chmod(directory, 0o700);
  const instance = `${crypto.randomUUID()} ${crypto.randomUUID()}`;
  await writeFile(`${registry}/.authority-instance`, `${instance}\n`, { mode: 0o600 });
  const permit = createWritePermit(
    directory,
    () => Promise.reject(new Error('Must not measure for revocation')),
    registry,
  );
  await permit.revoke();
  const request = await readFile(`${directory}/readonly.request`, 'utf8');
  await writeFile(`${registry}/.authority-readonly`, `${crypto.randomUUID()} ${instance}\n`, {
    mode: 0o600,
  });
  let acknowledged = false;
  if (permit.confirmReadonly === undefined) throw new Error('Missing confirmation adapter');
  const confirming = permit.confirmReadonly().then(() => {
    acknowledged = true;
  });
  await Bun.sleep(50);
  expect(acknowledged).toBe(false);
  await writeFile(`${registry}/.authority-readonly`, request);
  await confirming;
  expect(acknowledged).toBe(true);
  await import('node:fs/promises').then(({ unlink }) => unlink(`${registry}/.authority-instance`));
  const failed = await permit.revoke().then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(failed).toBeInstanceOf(Error);
  const stale = await permit.confirmReadonly().then(
    () => null,
    (cause: unknown) => cause,
  );
  expect(stale).toBeInstanceOf(Error);
});

it('stale supervisor ACK exhausts the real lease, polling and startup grace before refusing', async () => {
  const { createWritePermit } = await import('./registry-capacity');
  const { readFile, writeFile } = await import('node:fs/promises');
  const directory = await scratchAsync('registry-ack-elapsed-journal-');
  const registry = await scratchAsync('registry-ack-elapsed-store-');
  const boot = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  const instance = crypto.randomUUID() + ' ' + boot;
  await writeFile(registry + '/.authority-instance', instance + '\n', { mode: 0o600, flag: 'wx' });
  const permit = createWritePermit(
    directory,
    () => Promise.reject(new Error('Revocation must not request a capacity reading')),
    registry,
  );
  await permit.revoke();
  const stale = crypto.randomUUID() + ' ' + instance + '\n';
  await writeFile(registry + '/.authority-readonly', stale, { mode: 0o600, flag: 'wx' });
  if (permit.confirmReadonly === undefined) throw new Error('Missing ordinary-supervisor verifier');
  const started = performance.now();
  const failure = await permit.confirmReadonly().then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain('supervisor acknowledgement missing');
  const elapsed = performance.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(34000);
  expect(elapsed).toBeLessThan(45000);
  expect(await readFile(registry + '/.authority-readonly', 'utf8')).toBe(stale);
}, 45000);

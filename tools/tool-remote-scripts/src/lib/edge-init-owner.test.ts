import { createHash } from 'node:crypto';
import { closeSync, fstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { FixtureOwnership } from '../fixtures/edge-init-owner';

test('fixture owner projects only declared synthetic paths and held descriptors', async () => {
  const root = await mkdtemp('/tmp/edge-init-owner-');
  const path = root + '/home/puni1/wbs/credentials.json';
  const bytes = '{"credential":"fixture"}';
  try {
    await mkdir(root + '/home/puni1/wbs', { recursive: true });
    await Bun.write(path, bytes);
    const ownership = new FixtureOwnership(root);
    const descriptor = openSync(path, 'r');
    const unknown = openSync('/dev/null', 'r');
    try {
      const originalToken = ownership.track(descriptor, path);
      const named = statSync(path);
      const held = fstatSync(descriptor, { bigint: true });
      // This simulates a hosted raw UID1001 without changing the OS identity.
      Object.defineProperty(named, 'uid', { value: 1001 });
      Object.defineProperty(held, 'uid', { value: 1001n });
      const modeledName = ownership.path(path, named);
      const modeledFd = ownership.fd(descriptor, held);
      expect(modeledName.uid).toBe(1000);
      expect(modeledFd.uid).toBe(1000n);
      expect(modeledName.isFile()).toBe(true);
      expect(modeledFd.isFile()).toBe(true);
      expect(modeledName.dev).toBe(Number(modeledFd.dev));
      expect(modeledName.ino).toBe(Number(modeledFd.ino));
      expect(modeledFd.size).toBe(BigInt(Buffer.byteLength(bytes)));
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
        createHash('sha256').update(bytes).digest('hex'),
      );
      expect(ownership.owner('/proc/self/fd/' + String(descriptor) + '/leaf')).toBe(1000);
      expect(ownership.owner('/proc/self/fd/' + String(unknown) + '/leaf')).toBeUndefined();
      expect(ownership.path('/dev/null', statSync('/dev/null')).uid).toBe(
        statSync('/dev/null').uid,
      );
      expect(ownership.fd(unknown, fstatSync(unknown)).uid).toBe(fstatSync(unknown).uid);
      const replacementToken = ownership.track(descriptor, root + '/etc/machine-id');
      ownership.forget(descriptor, originalToken);
      expect(ownership.owner('/proc/self/fd/' + String(descriptor))).toBe(0);
      ownership.forget(descriptor, replacementToken);
    } finally {
      ownership.forget(descriptor);
      closeSync(descriptor);
      closeSync(unknown);
    }
    expect(ownership.owner('/proc/self/fd/' + String(descriptor))).toBeUndefined();
    expect(ownership.owner('/proc/self/fd/' + String(descriptor) + '/leaf')).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

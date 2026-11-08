import { chmod, open } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { assertRegistryMaintenanceLock } from './registry-maintenance-process';

test('helper refuses an independently opened canonical descriptor without an existing flock', async () => {
  const directory = await scratchAsync('registry-maintenance-descriptor-');
  await chmod(directory, 0o700);
  const descriptor = await open(join(directory, 'authority.lock'), 'wx', 0o600);
  try {
    await requireRefusal(
      assertRegistryMaintenanceLock(directory, descriptor.fd, process.getuid?.()),
      'inherited authority lock',
    );
  } finally {
    await descriptor.close();
  }
});

async function requireRefusal(pending: Promise<unknown>, expected: string): Promise<void> {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    expect(cause.message).toContain(expected);
    return;
  }
  throw new Error('Expected production path to refuse');
}

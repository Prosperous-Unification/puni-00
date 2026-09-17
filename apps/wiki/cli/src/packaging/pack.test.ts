import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { packPackage } from './pack';

async function refusalMessage(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected package pack refusal');
}

test('refuses a package-manager failure', async () => {
  const destination = await mkdtemp(join(tmpdir(), 'twilight-bureaucrat-pack-failure-'));
  try {
    expect(
      await refusalMessage(
        packPackage('/package', destination, () => ({
          exitCode: 23,
          stderr: new TextEncoder().encode('injected pack failure'),
        })),
      ),
    ).toContain('Cannot pack Twilight Bureaucrat: injected pack failure');
  } finally {
    await rm(destination, { force: true, recursive: true });
  }
});

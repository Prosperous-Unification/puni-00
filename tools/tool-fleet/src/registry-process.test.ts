import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { runRegistryProcess } from './registry-process';

it('kills native command descendants before timeout or cancellation returns', async () => {
  const directory = await scratchAsync('registry-process-');
  for (const cancellation of [false, true]) {
    const marker = join(directory, cancellation ? 'cancelled' : 'expired');
    const controller = new AbortController();
    const timer = cancellation
      ? setTimeout(() => {
          controller.abort();
        }, 100)
      : undefined;
    try {
      await expectRejection(
        runRegistryProcess(
          ['/bin/bash', '-c', `(sleep 0.3; echo survived > '${marker}') & wait`],
          directory,
          cancellation ? 1000 : 100,
          { ownProcessGroup: true, signal: controller.signal },
        ),
      );
      await Bun.sleep(350);
      expect(existsSync(marker)).toBe(false);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}

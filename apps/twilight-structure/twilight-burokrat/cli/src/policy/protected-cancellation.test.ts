import * as filesystem from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it, spyOn } from 'bun:test';

import { createLintInterrupts, type LintInterrupt } from '../lint-interrupts';
import { reserveProtectedDirectory } from './preparation-directory';

it('honors broker cancellation observed after actual native authority resolution before mkdir', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni late reservation cancellation '));
  const authority = join(root, 'authority'),
    destination = join(root, 'output');
  mkdirSync(authority);
  const interrupts = createLintInterrupts(),
    owned: string[] = [];
  let first: LintInterrupt | undefined;
  const unsubscribe = interrupts.subscribe((signal) => {
    first ??= signal;
  });
  const native = filesystem.realpathSync.native;
  const inject = ((...args: Parameters<typeof native>): unknown => {
    const canonical: unknown = Reflect.apply(native, undefined, args);
    if (args[0] === authority) process.emit('SIGTERM');
    return canonical;
  }) as typeof native;
  const changed = spyOn(filesystem.realpathSync, 'native').mockImplementation(inject);
  try {
    expect(
      await reserveProtectedDirectory(destination, {
        callerDirectory: root,
        protectedPaths: [authority],
        otherDirectories: [],
        readCancellation: () =>
          first === undefined ? undefined : { status: first === 'SIGINT' ? 130 : 143 },
        recordOwnership: (directory) => {
          owned.push(directory);
        },
      }),
    ).toEqual({ kind: 'cancelled', status: 143 });
    expect(owned).toEqual([]);
    expect(existsSync(destination)).toBe(false);
  } finally {
    changed.mockRestore();
    unsubscribe();
    interrupts.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

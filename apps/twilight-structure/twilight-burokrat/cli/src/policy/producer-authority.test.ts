import { existsSync, rmSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, expect, it, spyOn } from 'bun:test';

import { createToolkitProducerFixture } from '../testing/toolkit-producer-fixture';
import { buildBunToolkit, ToolkitBuildFailure } from './build-bun-toolkit';
import * as toolkitReader from './toolkit';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

for (const authority of ['installation', 'closure'] as const) {
  it(
    'independently protects producer native ' + authority + ' authority before output ownership',
    async () => {
      const fixture = await createToolkitProducerFixture(roots, authority === 'closure'),
        work = join(fixture[authority], 'output');
      const cause: unknown = await buildBunToolkit(
        fixture.source,
        { ...fixture.request, work },
        fixture.context,
      ).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(cause).toBeInstanceOf(ToolkitBuildFailure);
      if (!(cause instanceof ToolkitBuildFailure))
        throw new Error('missing producer authority refusal');
      expect(cause.ownedDirectories).toEqual([]);
      expect(String(cause.cause)).toContain('beneath protected source authority');
      expect(existsSync(work)).toBe(false);
    },
  );
}

it('stops producer before fallible final verification after last delivered-file cancellation', async () => {
  const fixture = await createToolkitProducerFixture(roots),
    listeners = new Set<(signal: 'SIGINT' | 'SIGTERM') => void>();
  let recorded = false;
  const chmod = filesystem.chmod;
  const mode = spyOn(filesystem, 'chmod').mockImplementation(async (path, permissions) => {
    await chmod(path, permissions);
    if (path === join(fixture.request.destination, 'SHA256SUMS')) {
      recorded = true;
      for (const listener of listeners) listener('SIGTERM');
    }
  });
  const verify = spyOn(toolkitReader, 'readBunToolkit').mockImplementation(() => {
    throw new Error('final verification must not start after cancellation');
  });
  try {
    expect(
      await buildBunToolkit(fixture.source, fixture.request, {
        ...fixture.context,
        subscribeInterrupts(listener) {
          listeners.add(listener);
          if (recorded) listener('SIGTERM');
          return () => {
            listeners.delete(listener);
          };
        },
      }),
    ).toEqual({
      kind: 'cancelled',
      status: 143,
      ownedDirectories: [fixture.request.work, fixture.request.destination],
    });
    expect(existsSync(join(fixture.request.destination, 'SHA256SUMS'))).toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  } finally {
    verify.mockRestore();
    mode.mockRestore();
  }
});

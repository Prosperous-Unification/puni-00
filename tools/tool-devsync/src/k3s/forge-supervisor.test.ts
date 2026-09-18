import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import {
  fingerprintSupervisor,
  INSTALL_REQUIRED,
  installDependencies,
  supervisorActionOf,
} from './forge-supervisor';

describe('supervisorActionOf', () => {
  const restart = { 'bun.lock': 'a' };

  it('restarts the tiers for a restart path and does nothing otherwise', () => {
    expect(supervisorActionOf({ restart, supervisor: 's' }, { restart, supervisor: 's' })).toBe(
      'none',
    );
    expect(
      supervisorActionOf(
        { restart, supervisor: 's' },
        { restart: { 'bun.lock': 'b' }, supervisor: 's' },
      ),
    ).toBe('restart-tiers');
  });

  it('exits when its own sources change', () => {
    expect(
      supervisorActionOf(
        { restart, supervisor: 's' },
        { restart: { 'bun.lock': 'b' }, supervisor: 't' },
      ),
    ).toBe('exit');
  });

  it('fingerprints non-test supervisor sources only', async () => {
    const root = await scratchAsync('forge-supervisor-');
    const source = join(root, 'tools/tool-devsync/src/k3s');
    await mkdir(source, { recursive: true });
    await writeFile(join(source, 'forge-supervisor.ts'), 'one');
    const first = await fingerprintSupervisor(root);
    await writeFile(join(source, 'forge-supervisor.test.ts'), 'test');
    expect(await fingerprintSupervisor(root)).toBe(first);
    await writeFile(join(root, 'tools/tool-devsync/src/sync.ts'), 'sync');
    expect(await fingerprintSupervisor(root)).not.toBe(first);
  });
});

describe('installDependencies', () => {
  it('reports INSTALL REQUIRED and refuses to start the tiers when install fails', () => {
    const reports: string[] = [];
    expect(
      installDependencies(
        () => 1,
        (message) => reports.push(message),
      ),
    ).toBe(false);
    expect(reports).toEqual([`${INSTALL_REQUIRED} bun install --frozen-lockfile exited 1`]);
    expect(
      installDependencies(
        () => 0,
        (message) => reports.push(message),
      ),
    ).toBe(true);
    expect(reports).toHaveLength(1);
  });
});

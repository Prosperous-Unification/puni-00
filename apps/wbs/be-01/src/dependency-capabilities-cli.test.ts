import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseDependencyRuntimeCapability } from '@wbs/contracts';
import { expect, it } from 'bun:test';

import { BACKEND_DEPENDENCY_CAPABILITY } from './runtime/dependency-capability';

const CLI = new URL('./dependency-capabilities-cli.ts', import.meta.url).pathname;
it('advertises frozen V1 support without database configuration or migrations', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-capability-'));
  try {
    const execution = Bun.spawnSync([process.execPath, CLI], {
      cwd: directory,
      env: {
        PATH: process.env['PATH'],
        CROSS_PROJECT_DEPENDENCIES: 'enabled',
        DEPENDENCY_ACTIVATION: 'ENABLED',
      },
    });
    expect(execution.exitCode).toBe(0);
    expect(execution.stderr.toString()).toBe('');
    expect(parseDependencyRuntimeCapability(JSON.parse(execution.stdout.toString()))).toEqual({
      protocol: 'wbs-dependency-runtime',
      version: 1,
      role: 'backend',
      semantics: ['cross-project-dependencies-v1'],
    });
    expect(JSON.parse(execution.stdout.toString())).toEqual(BACKEND_DEPENDENCY_CAPABILITY);
    expect(Object.isFrozen(BACKEND_DEPENDENCY_CAPABILITY)).toBe(true);
    expect(Object.isFrozen(BACKEND_DEPENDENCY_CAPABILITY.semantics)).toBe(true);
    expect(readdirSync(directory)).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it('refuses capability arguments', () => {
  const execution = Bun.spawnSync([process.execPath, CLI, 'inspect']);
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stdout.toString()).toBe('');
});

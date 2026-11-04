import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseDependencyRuntimeCapability } from '@wbs/contracts';
import { expect, it } from 'bun:test';

import { GATEWAY_DEPENDENCY_CAPABILITY } from './runtime/dependency-support';

const CLI = new URL('./dependency-capabilities-cli.ts', import.meta.url).pathname;

it.each([undefined, '/unavailable/store.sqlite'])(
  'observes frozen gateway V1 transport support independently of configuration and startup (DB_PATH=%s)',
  (databasePath) => {
    const directory = mkdtempSync(join(tmpdir(), 'gateway-capability-'));
    try {
      const preload = join(directory, 'poison.ts');
      writeFileSync(
        preload,
        `import { plugin } from 'bun';
plugin({ name: 'forbid-startup', setup(build) {
  build.onLoad({ filter: /[/](?:config|main)[.]ts$/ }, () => {
    throw new Error('capability imported configuration or startup');
  });
} });`,
      );
      const execution = Bun.spawnSync([process.execPath, '--preload', preload, CLI], {
        cwd: directory,
        env: {
          PATH: process.env['PATH'],
          DB_PATH: databasePath,
          CROSS_PROJECT_DEPENDENCIES: 'enabled',
          DEPENDENCY_ACTIVATION: 'ENABLED',
        },
        timeout: 5000,
      });
      expect(execution.exitCode).toBe(0);
      expect(execution.stderr.toString()).toBe('');
      expect(execution.stdout.toString()).toBe(
        '{"protocol":"wbs-dependency-runtime","version":1,"role":"gateway","semantics":["cross-project-dependencies-v1"]}\n',
      );
      expect(parseDependencyRuntimeCapability(JSON.parse(execution.stdout.toString()))).toEqual({
        protocol: 'wbs-dependency-runtime',
        version: 1,
        role: 'gateway',
        semantics: ['cross-project-dependencies-v1'],
      });
      expect(JSON.parse(execution.stdout.toString())).toEqual(GATEWAY_DEPENDENCY_CAPABILITY);
      expect(Object.isFrozen(GATEWAY_DEPENDENCY_CAPABILITY)).toBe(true);
      expect(Object.isFrozen(GATEWAY_DEPENDENCY_CAPABILITY.semantics)).toBe(true);
      expect(readdirSync(directory)).toEqual(['poison.ts']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

it('refuses capability arguments before emitting an observation', () => {
  const execution = Bun.spawnSync([process.execPath, CLI, 'inspect'], {
    env: { PATH: process.env['PATH'] },
    timeout: 5000,
  });
  expect(execution.exitCode).toBe(1);
  expect(execution.stdout.toString()).toBe('');
  expect(execution.stderr.toString()).toContain(
    'error: dependency capability CLI accepts no arguments',
  );
});

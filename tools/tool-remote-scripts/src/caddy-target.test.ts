import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

// Proof: removing test:caddy from the required test dependency failed this
// test. The dependency runs even when Nx can reuse the ordinary unit verdict.
it('requires real Caddy boundaries in the CI and host test target', () => {
  const project = JSON.parse(readFileSync(join(import.meta.dir, '../project.json'), 'utf8')) as {
    targets: Record<
      string,
      { dependsOn?: string[]; cache?: boolean; options: { command: string; cwd?: string } }
    >;
  };
  expect(project.targets['test'].dependsOn).toContain('test:caddy');
  expect(project.targets['test:caddy'].cache).toBeFalse();
  expect(project.targets['test:caddy'].options.command).toBe(
    'bun run tools/tool-remote-scripts/caddy/run.ts',
  );
  expect(project.targets['test'].options.command).toBe('bun run test/run-tests.ts canonical');
  expect(project.targets['test'].options.cwd).toBe('tools/tool-remote-scripts');
  const runner = readFileSync(join(import.meta.dir, '../test/run-tests.ts'), 'utf8');
  const discovery = /const DISCOVERY = \[([\s\S]*?)\];/.exec(runner)?.[1];
  if (discovery === undefined) throw new Error('canonical test discovery absent');
  // The canonical runner owns these seven suites; the target no longer spells them out.
  expect([...discovery.matchAll(/'([^']+)'/g)].map((match) => match[1])).toEqual([
    'src',
    'test/edge-init.test.ts',
    'test/solver-drain-transport.test.ts',
    'test/solver-drain-fixture.test.ts',
    'test/source-exclusion-transport.test.ts',
    'test/source-exclusion-topology.test.ts',
    'test/source-exclusion-native.test.ts',
    'test/fixture-failure.test.ts',
  ]);
  const canonical = /if \(command !== 'canonical'\)([\s\S]*)/.exec(runner)?.[1];
  if (canonical === undefined) throw new Error('canonical test branch absent');
  const argv = /const argv = \[([\s\S]*?)\];/.exec(canonical)?.[1];
  if (argv === undefined) throw new Error('canonical test argv absent');
  expect(argv).toMatch(/^\s*process\.execPath,\s*'test',\s*\.\.\.DISCOVERY,/);
  expect(argv).not.toContain('test/solver-drain.ts');
  expect(argv).not.toContain('test/source-exclusion.ts');
  expect(project.targets['test:source-exclusion'].cache).toBeFalse();
  expect(project.targets['test:source-exclusion'].options.command).toBe(
    'bun run tools/tool-remote-scripts/test/source-exclusion.ts',
  );
});

it('refuses a native Caddy override in CI before starting the suite', () => {
  const execution = Bun.spawnSync([process.execPath, join(import.meta.dir, '../caddy/run.ts')], {
    env: { ...process.env, CI: '1', MCP_CADDY_BINARY: process.execPath },
  });
  expect(execution.exitCode).toBe(1);
  expect(execution.stderr.toString()).toContain('CI must exercise the pinned Caddy container');
});

it('refuses an absent native development binary before starting the suite', () => {
  const execution = Bun.spawnSync([process.execPath, join(import.meta.dir, '../caddy/run.ts')], {
    env: { ...process.env, CI: '', MCP_CADDY_BINARY: '/missing-caddy' },
  });
  expect(execution.exitCode).toBe(1);
  expect(execution.stderr.toString()).toContain('required Caddy binary is absent: /missing-caddy');
});

// Proof: removing the image-preparation status check failed this production-runner test.
it('refuses failed required image preparation before starting the suite', () => {
  const executables = scratchSync('failed-caddy-pull-');
  const docker = join(executables, 'docker');
  writeFileSync(docker, '#!/bin/sh\nexit 17\n');
  chmodSync(docker, 0o755);
  const env = { ...process.env, CI: '1', PATH: executables, MCP_CADDY_BINARY: undefined };
  const execution = Bun.spawnSync([process.execPath, join(import.meta.dir, '../caddy/run.ts')], {
    env,
  });
  expect(execution.exitCode).toBe(1);
  expect(execution.stderr.toString()).toContain('required Caddy image preparation failed (17)');
});

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
      { dependsOn?: string[]; cache?: boolean; options: { command: string } }
    >;
  };
  expect(project.targets['test'].dependsOn).toContain('test:caddy');
  expect(project.targets['test:caddy'].cache).toBeFalse();
  expect(project.targets['test:caddy'].options.command).toBe(
    'bun run tools/tool-remote-scripts/caddy/run.ts',
  );
  expect(project.targets['test'].options.command).toContain('bun test src ');
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

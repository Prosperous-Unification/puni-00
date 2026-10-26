import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const root = join(import.meta.dir, '../../..');
const cli = join(import.meta.dir, 'observability-projection-cli.ts');

test.each(['absent', 'unreadable', 'malformed', 'missing profile'] as const)(
  'chart-role CLI refuses %s required input',
  async (fault) => {
    const directory = await scratchAsync('projection-request-');
    const path = join(directory, 'requests.json');
    if (fault !== 'absent') await writeFile(path, fault === 'malformed' ? '{' : '{}');
    if (fault === 'unreadable') await chmod(path, 0);
    const child = Bun.spawnSync([process.execPath, cli, root, directory, path]);
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    const failure = child.stderr.toString();
    if (fault === 'absent') expect(failure).toContain('input-absent');
    if (fault === 'unreadable') expect(failure).toContain('input-unreadable');
    if (fault === 'malformed') expect(failure).toContain('input-malformed');
    if (fault === 'missing profile') expect(failure).toContain('validation-refused');
  },
);

test('chart-role CLI refuses extra or missing argument authority', () => {
  for (const args of [[], ['.', '/tools', '/request', '/unexpected']]) {
    const child = Bun.spawnSync([process.execPath, cli, ...args]);
    expect(child.exitCode).toBe(1);
    expect(child.stderr.toString()).toContain('invalid-arguments');
    expect(child.stdout.toString()).toBe('');
  }
});

test.each(['schema value', 'subprocess failure'] as const)(
  'chart-role CLI never exposes private markers from %s',
  async (fault) => {
    const directory = await scratchAsync('projection-private-');
    const marker = 'synthetic-private-marker-4a';
    const instances = [
      { environment: 'dev', namespace: 'observability-dev' },
      { environment: 'prod', namespace: 'observability' },
    ];
    const input = {
      local: { placement: 'local', instances: structuredClone(instances) },
      production: { placement: 'production', instances: structuredClone(instances) },
    };
    if (fault === 'schema value') input.local.instances[0].environment = marker;
    await writeFile(join(directory, 'requests.json'), JSON.stringify(input));
    await writeFile(join(directory, 'helm'), `#!/bin/sh\nprintf '${marker}' >&2\nexit 42\n`);
    await chmod(join(directory, 'helm'), 0o700);
    const child = Bun.spawnSync([
      process.execPath,
      cli,
      root,
      directory,
      join(directory, 'requests.json'),
    ]);
    expect(child.exitCode).toBe(1);
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).not.toContain(marker);
  },
);

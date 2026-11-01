import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { cliEnvironment } from './cli.fixture';

test('CLI fixture overrides inherited forced color and retains exact safe refusal output', () => {
  const child = Bun.spawnSync(
    [process.execPath, join(import.meta.dir, 'observability-source-cli.ts')],
    {
      env: cliEnvironment({ ...process.env, FORCE_COLOR: '1', NO_COLOR: '0' }),
    },
  );
  expect(child.exitCode).toBe(1);
  expect(child.stdout.toString()).toBe('');
  expect(child.stderr.toString()).toBe('observability source: invalid-arguments\n');
});

test('CLI fixture preserves arbitrary payload bytes and unrelated environment fields', () => {
  const payload = '\u001b[31mPRIVATE-MARKER\u001b[0m';
  const child = Bun.spawnSync(
    [process.execPath, '-e', 'process.stderr.write(process.env.PRIVATE_PAYLOAD)'],
    {
      env: cliEnvironment({ ...process.env, FORCE_COLOR: '1', PRIVATE_PAYLOAD: payload }),
    },
  );
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe('');
  expect(child.stderr.toString()).toBe(payload);
});

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

const root = join(import.meta.dir, '../../..');

test('the production plan command writes JSON and a human summary', async () => {
  const directory = await scratchAsync('tool-fleet-plan-cli-');
  const observation = join(directory, 'observation.json');
  const output = join(directory, 'operation.json');
  await writeFile(
    observation,
    `${JSON.stringify({
      schemaVersion: 1,
      observedAt: '2026-09-17T09:00:00.000Z',
      digest: 'a'.repeat(64),
      complete: true,
    })}\n`,
  );
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'tools/tool-fleet/src/entrypoint.ts',
      'plan',
      '--fleet',
      'infra/fleet/examples/local.yaml',
      '--observation',
      observation,
      '--operation',
      'retire',
      '--node',
      'workers-agent-a',
      '--output',
      output,
    ],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stdout.toString()).toContain('retire workers-agent-a');
  const plan = JSON.parse(await readFile(output, 'utf8')) as Record<string, unknown>;
  expect(plan['planSha256']).toMatch(/^[0-9a-f]{64}$/);
  expect(plan['desiredRevision']).toBe('local-v1');
});

test('the production plan command refuses an implicit target', () => {
  const invocation = Bun.spawnSync(
    [
      process.execPath,
      'tools/tool-fleet/src/entrypoint.ts',
      'plan',
      '--fleet',
      'infra/fleet/examples/local.yaml',
      '--operation',
      'retire',
    ],
    { cwd: root, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(invocation.exitCode).not.toBe(0);
  expect(invocation.stderr.toString()).toContain('Missing required --node');
});

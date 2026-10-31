import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

interface BucketJob {
  kind: string;
  spec: { template: { spec: { containers: { command: string[] }[] } } };
}

/** Execute the shipped shell with a broken mc boundary; all other mc operations succeed. */
async function initializeBuckets(fault: 'none' | 'version' | 'lifecycle') {
  const root = await scratchAsync('object-store-buckets-');
  await mkdir(join(root, 'bin'));
  await writeFile(join(root, 'ca.crt'), 'fixture');
  await writeFile(
    join(root, 'bin/mc'),
    `#!/bin/sh
set -eu
if [ "$1 $2" = 'version enable' ] && [ "$FAULT" = version ]; then
  echo 'injected mc version failure' >&2
  exit 42
fi
if [ "$1 $2" = 'ilm export' ]; then
  if [ "$FAULT" = lifecycle ]; then echo '{"Rules":[]}'; else echo '{"NoncurrentVersionExpiration":{"NoncurrentDays":30}}'; fi
fi
`,
    { mode: 0o755 },
  );
  const manifest = await readFile(
    join(import.meta.dir, '../../../infra/platform/backup/local/object-store.yaml'),
    'utf8',
  );
  const job = parseAllDocuments(manifest)
    .map((document) => document.toJS() as BucketJob)
    .find((resource) => resource.kind === 'Job');
  const command = job?.spec.template.spec.containers[0]?.command;
  if (command === undefined) throw new Error('Shipped bucket Job command absent');
  const searchPath = process.env['PATH'];
  if (searchPath === undefined) throw new Error('Test PATH absent');
  return Bun.spawnSync(
    command.map((argument) =>
      argument
        .replaceAll('/tmp/lifecycle.json', join(root, 'lifecycle.json'))
        .replaceAll('/object-store-ca/ca.crt', join(root, 'ca.crt')),
    ),
    {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${join(root, 'bin')}:${searchPath}`,
        MINIO_ROOT_USER: 'lab-only',
        MINIO_ROOT_PASSWORD: 'lab-only',
        FAULT: fault,
        MC_CONFIG_DIR: join(root, 'mc'),
      },
    },
  );
}

describe('shipped bucket initializer dependency faults', () => {
  it('fails the Job when mc refuses versioning', async () => {
    const initialization = await initializeBuckets('version');
    expect(initialization.exitCode).toBe(42);
    expect(initialization.stderr.toString()).toContain('injected mc version failure');
  });
  it('fails the Job when lifecycle readback lacks the retained-version rule', async () => {
    const initialization = await initializeBuckets('lifecycle');
    expect(initialization.exitCode).toBe(1);
    expect(initialization.stderr.toString()).toContain('lifecycle rule missing');
  });
  it('completes when mc accepts the bucket contract', async () => {
    expect((await initializeBuckets('none')).exitCode).toBe(0);
  });
});

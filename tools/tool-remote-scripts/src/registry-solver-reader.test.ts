import { createHash } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runRegistryReader } from '@tools/registry-publication';
import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { readSolverConsumers } from './registry-solver-reader';

it('reads every configured solver and idle caller from the actual owned source file', async () => {
  const directory = await scratchAsync('registry-solver-');
  const path = join(directory, 'supervisor.json');
  const config = {
    socketPath: '/run/user/1000/wbs-solver/supervisor.sock',
    maxSearchWorkers: 2,
    maxMemoryLimitMb: 512,
    pidsLimit: 128,
    maxManagedContainers: 16,
    devSourceSha: 'd'.repeat(40),
    images: [
      {
        callerName: 'be-01-blue',
        callerImage: `registry.test/wbs/be@sha256:${'a'.repeat(64)}`,
        solverImage: `registry.test/wbs/solver@sha256:${'b'.repeat(64)}`,
      },
    ],
  };
  await writeFile(path, JSON.stringify(config));
  const input = { configPath: path, registryUrl: 'https://registry.test' };
  const inventory = await readSolverConsumers(input);
  expect(inventory.references.map((reference) => reference.repository)).toEqual([
    'wbs/be',
    'wbs/solver',
  ]);
  expect(inventory.sourceRevision).toMatch(/^sha256:[0-9a-f]{64}$/);
  const artifact = join(directory, 'reader.js');
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'registry-solver-reader.ts')],
    target: 'bun',
    outdir: directory,
    naming: 'reader.js',
  });
  expect(built.success).toBe(true);
  const report = await runRegistryReader(
    {
      schemaVersion: 1,
      protocol: 'registry-consumer/2',
      registryId: 'proof',
      id: 'solver',
      kind: 'solver',
      role: 'consumer',
      source: join(directory, 'reader.json'),
      artifact: {
        path: artifact,
        sha256: createHash('sha256')
          .update(await readFile(artifact))
          .digest('hex'),
      },
      input,
    },
    12,
  );
  expect(report.references).toEqual(inventory.references);
  expect(report.sourceRevision).toBe(inventory.sourceRevision);
  expect(report.revision).toBe(12);
  await writeFile(path, JSON.stringify({ ...config, images: undefined }));
  expect(
    await readSolverConsumers(input).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
  await unlink(path);
  expect(
    await readSolverConsumers(input).then(
      () => false,
      () => true,
    ),
  ).toBe(true);
});

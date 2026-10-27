import { createHash } from 'node:crypto';
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { runChecked } from './check-cli';
import { readToolchain } from './contracts';
import { provisionObservabilityTools } from './observability-tools.fixture';

const root = join(import.meta.dir, '../../..');
const tools = await provisionObservabilityTools();
const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));

async function seedCache(): Promise<string> {
  const cache = await scratchAsync('observability-cache-');
  for (const name of ['kubectl', 'helm'] as const) {
    const pin = lock.binaries[name];
    const directory = `${name}-${pin.version}`;
    const archive = join(directory, basename(new URL(pin.url).pathname));
    await mkdir(join(cache, directory));
    await copyFile(join(tools, 'cache', archive), join(cache, archive));
  }
  return cache;
}

test('locked fixture reuses one installation without extracting shared Helm state', async () => {
  const cache = await seedCache();
  const shared = join(cache, `helm-${lock.binaries.helm.version}`, 'extracted');
  await mkdir(shared);
  await writeFile(join(shared, 'must-preserve'), 'another process owns this');
  const env = { PUNI_TOOL_CACHE: cache };
  const first = provisionObservabilityTools(env);
  expect(provisionObservabilityTools(env)).toBe(first);
  const directory = await first;
  const before = await stat(join(directory, 'helm'));
  expect(await provisionObservabilityTools(env)).toBe(directory);
  expect((await stat(join(directory, 'helm'))).ino).toBe(before.ino);
  expect(await readFile(join(shared, 'must-preserve'), 'utf8')).toBe('another process owns this');
  expect(
    await runChecked([join(directory, 'kubectl'), 'version', '--client'], { timeoutMs: 60000 }),
  ).toMatchObject({ exitCode: 0 });
});

test('locked fixture repairs changed cached bytes before executing kubectl', async () => {
  const cache = await seedCache();
  const pin = lock.binaries.kubectl;
  await writeFile(
    join(cache, `kubectl-${pin.version}`, 'kubectl'),
    '#!/bin/sh\nprintf "Client Version: v1.36.4\\n"\n',
  );
  const directory = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache });
  expect(
    createHash('sha256')
      .update(await readFile(join(directory, 'kubectl')))
      .digest('hex'),
  ).toBe(pin.sha256);
  expect(
    (await runChecked([join(directory, 'kubectl'), 'version', '--client'], { timeoutMs: 60000 }))
      .stdout,
  ).toContain('Client Version: v1.36.4');
}, 660000);

test('locked fixture refuses unreadable archive seeds instead of ignoring required state', async () => {
  const cache = await seedCache();
  const archive = join(cache, `kubectl-${lock.binaries.kubectl.version}`, 'kubectl');
  await chmod(archive, 0);
  try {
    const failure = await provisionObservabilityTools({ PUNI_TOOL_CACHE: cache }).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(failure).toMatchObject({ code: 'EACCES' });
  } finally {
    await chmod(archive, 0o600);
  }
});

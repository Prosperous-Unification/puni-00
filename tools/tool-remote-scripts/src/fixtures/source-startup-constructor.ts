import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { mock } from 'bun:test';

/** Isolated test process only: map the fixed dev layout to an owned disposable fixture. */
async function refuseInstalledArtifact(): Promise<void> {
  const root = process.argv.at(2);
  const preparedRoot = process.argv.at(3);
  const sha = process.argv.at(4);
  const pins = process.argv.at(5);
  if (
    root === undefined ||
    preparedRoot === undefined ||
    sha === undefined ||
    pins === undefined ||
    !/^\/tmp\/source-self-[A-Za-z0-9]+$/.test(root) ||
    (await realpath(root)) !== root ||
    (await lstat(root)).mode % 0o1000 !== 0o700 ||
    (await readFile(join(root, 'fixture-owned'), 'utf8')) !== 'source-startup-test-only-v1\n' ||
    (await realpath(preparedRoot)) !== `${root}/src`
  )
    throw new Error('source constructor fixture identity invalid');
  await mock.module('../lib/env', () => ({ envLayout: () => ({ root }) }));
  const { createSourceStartupManifest } = await import('../lib/source-startup-manifest');
  const configuration: unknown = JSON.parse(pins);
  // The constructor validates the closed config boundary; this fixture passes hash-only test inputs.
  await createSourceStartupManifest(
    preparedRoot,
    sha,
    configuration as Parameters<typeof createSourceStartupManifest>[2],
  );
}
try {
  await refuseInstalledArtifact();
  throw new Error('installed source artifact admitted');
} catch (failure) {
  if (!(failure instanceof Error) || failure.message !== 'source startup inputs invalid or changed')
    throw failure;
  console.log('source constructor refuses installed artifact');
}

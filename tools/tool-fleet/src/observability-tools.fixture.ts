import { copyFile, mkdir, mkdtemp, rename, rm, symlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';

import { runChecked } from './check-cli';
import { assertToolVersion, installLockedTool, toolCacheDirectory } from './check-provision';
import { readToolchain } from './contracts';

const root = resolve(import.meta.dir, '../../..');
const installations = new Map<string, Promise<string>>();

async function installTools(cache: string): Promise<string> {
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const directory = await scratchAsync('observability-tools-');
  const privateCache = join(directory, 'cache');
  for (const name of ['kubectl', 'helm'] as const) {
    const pin = lock.binaries[name];
    const artifactDirectory = `${name}-${pin.version}`;
    await mkdir(join(privateCache, artifactDirectory), { recursive: true, mode: 0o700 });
    const archive = join(artifactDirectory, basename(new URL(pin.url).pathname));
    try {
      await copyFile(join(cache, archive), join(privateCache, archive));
    } catch (failure) {
      // Proof: ignoring copy failures let a mode-000 archive seed trigger a successful install;
      // observability-tools.test.ts `refuses unreadable archive seeds` failed its EACCES expectation.
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT'))
        throw failure;
    }
    const executable = await installLockedTool(
      { name, ...pin, member: name === 'helm' ? 'linux-amd64/helm' : null },
      privateCache,
      runChecked,
    );
    await assertToolVersion(
      name,
      executable,
      name === 'helm' ? ['version', '--short'] : ['version', '--client'],
      name === 'helm' ? pin.version : `Client Version: ${pin.version}`,
      runChecked,
    );
    await symlink(executable, join(directory, name));
    // Proof: omitting publication failed observability-tools.test.ts fresh-cache digest,
    // concurrent replacement and required-output EACCES/EISDIR controls.
    if (name === 'helm') {
      const shared = join(cache, artifactDirectory);
      await mkdir(shared, { recursive: true, mode: 0o700 });
      const publication = await mkdtemp(join(shared, '.prepared-'));
      try {
        await copyFile(join(privateCache, archive), join(publication, 'archive'));
        await rename(join(publication, 'archive'), join(cache, archive));
      } finally {
        await rm(publication, { recursive: true, force: true });
      }
    }
  }
  return directory;
}

/**
 * Real locked kubectl and Helm, once per process/cache. Only absent optional archive seeds
 * are ignored; installer digest/version checks still run. The verified private Helm archive is
 * required output in the selected canonical cache, published by a unique same-filesystem rename;
 * seed and publication I/O failures propagate. Extraction and executables belong
 * to process scratch so another process cannot remove them by reinstalling into a shared cache.
 * PUNI_PARITY_TOOLS is deliberately not an override: invalid production paths stay explicit
 * inputs to the production validators in their negative tests.
 */
export function provisionObservabilityTools(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string> {
  const cache = resolve(toolCacheDirectory(env));
  const prior = installations.get(cache);
  if (prior !== undefined) return prior;
  const installation = installTools(cache);
  installations.set(cache, installation);
  return installation;
}

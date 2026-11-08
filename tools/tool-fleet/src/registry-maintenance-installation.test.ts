import { createHash } from 'node:crypto';
import { readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { createRegistryInstallation } from './registry-installation.fixture';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import { requireRejection } from './registry-rejection.fixture';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const executable = await realpath('/usr/bin/true');
test('fixed host artifact verifies actual root-owned pinned executable bytes', async () => {
  await verifyRegistryHostArtifact({
    path: executable,
    sha256: hash(await readFile(executable)),
  });
});
test('fixed host artifact refuses changed executable bytes', async () => {
  let failure: unknown;
  try {
    await verifyRegistryHostArtifact({ path: executable, sha256: 'a'.repeat(64) });
  } catch (cause) {
    failure = cause;
  }
  expect(
    failure instanceof Error && failure.message === 'Fixed registry host artifact differs from pin',
  ).toBe(true);
});
test('fixed host artifact refuses invoking-user ownership despite matching executable hash', async () => {
  const directory = await scratchAsync('registry-host-artifact-');
  const path = join(directory, 'artifact');
  await writeFile(path, 'owned fixture', { mode: 0o600 });
  let failure: unknown;
  try {
    await verifyRegistryHostArtifact({ path, sha256: hash('owned fixture') });
  } catch (cause) {
    failure = cause;
  }
  expect(
    failure instanceof Error && failure.message === 'Untrusted fixed registry host artifact',
  ).toBe(true);
});

test('ordinary maintenance installation does not require invented recovery resources', async () => {
  const { parseRegistryMaintenanceInstallation, requireRegistryRecoveryInstallation } =
    await import('./registry-maintenance-installation');
  const installed = parseRegistryMaintenanceInstallation(createRegistryInstallation());
  expect(installed.recovery).toEqual({ state: 'unenrolled' });
  expect(() => requireRegistryRecoveryInstallation(installed)).toThrow(
    'recovery-target-unenrolled',
  );
});
for (const fault of ['owner', 'source', 'path', 'executable'] as const) {
  test(`installed fixed resource contract refuses ${fault} drift`, async () => {
    const { parseRegistryMaintenanceInstallation } =
      await import('./registry-maintenance-installation');
    const changed = createRegistryInstallation();
    if (fault === 'owner') changed.owners[1].name = 'unknown-parent';
    if (fault === 'source') changed.sources[1].resource.name = 'unknown-source';
    if (fault === 'path') changed.ordinary.path = '/arbitrary';
    if (fault === 'executable') changed.kubernetes.path = '/arbitrary-command';
    expect(() => parseRegistryMaintenanceInstallation(changed)).toThrow();
  });
}

test('client artifact preflight requires exact executable mode on the verified descriptor', async () => {
  const artifact = { path: executable, sha256: hash(await readFile(executable)) };
  await verifyRegistryHostArtifact(artifact, false, 0o755);
  const refused = await requireRejection(verifyRegistryHostArtifact(artifact, false, 0o644));
  expect(refused.throwCause).toThrow('Untrusted fixed registry host artifact');
});

test('fixed host artifact refuses a parent-directory alias to the same root-owned bytes', async () => {
  const directory = await scratchAsync('registry-host-parent-alias-');
  const parent = join(directory, 'alias');
  await symlink(dirname(executable), parent, 'dir');
  const artifact = {
    path: join(parent, basename(executable)),
    sha256: hash(await readFile(executable)),
  };
  const refused = await requireRejection(verifyRegistryHostArtifact(artifact));
  expect(refused.throwCause).toThrow('Host artifact path is not canonical');
});

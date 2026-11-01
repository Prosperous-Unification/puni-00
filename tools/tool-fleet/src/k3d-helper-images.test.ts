import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, it } from 'bun:test';

import * as contracts from './contracts';
import { readToolchain } from './contracts';
import { nameLabHelpers } from './k3d-creation';
import { selectedHelpers } from './k3d-helper-images.fixture.test';
const lockPath = join(import.meta.dir, '../../../infra/versions/toolchain.json');
it('Task37 derives both cluster helpers from selected child references', () => {
  expect(nameLabHelpers('example', selectedHelpers).map(({ image }) => image)).toEqual([
    'ghcr.io/k3d-io/k3d-proxy@sha256:9181bb55f3c04c86510af3526dda86baa9abc389ef988a3c4bb4879b32d8c21c',
    'ghcr.io/k3d-io/k3d-tools@sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd',
  ]);
});
it('Task37 current toolchain includes reviewed selected config identities', async () => {
  expect((await readToolchain(lockPath)).k3dHelpers).toEqual(selectedHelpers);
});
for (const fault of [
  'missing',
  'provider',
  'version',
  'binary-version',
  'arch',
  'repository',
  'digest',
  'config',
  'extra',
]) {
  it(`Task37 current reader rejects helper ${fault}`, async () => {
    const lock = type({ binaries: { k3d: { version: 'string' } } }).assert(
      JSON.parse(await readFile(lockPath, 'utf8')),
    );
    const helpers = structuredClone(selectedHelpers);
    Reflect.set(lock, 'k3dHelpers', helpers);
    if (fault === 'missing') Reflect.deleteProperty(lock, 'k3dHelpers');
    if (fault === 'provider') Reflect.set(helpers, 'provider', 'other');
    if (fault === 'version') Reflect.set(helpers, 'version', 'v5.9.1');
    if (fault === 'binary-version') lock.binaries.k3d.version = 'v5.9.1';
    if (fault === 'arch') Reflect.set(helpers.tools, 'arch', 'arm64');
    if (fault === 'repository') Reflect.set(helpers.tools, 'name', 'foreign/tools');
    if (fault === 'digest') Reflect.set(helpers.tools, 'manifestDigest', 'latest');
    if (fault === 'config') Reflect.deleteProperty(helpers.tools, 'configDigest');
    if (fault === 'extra') Reflect.set(helpers, 'extra', 'private');
    const directory = await scratchAsync('helper-selection-');
    const path = join(directory, 'lock.json');
    await writeFile(path, JSON.stringify(lock));
    await rejects(readToolchain(path));
  });
}

it('Task37 retained historical toolchain requires exact independent content hash', async () => {
  const lock = type({ binaries: { k3d: { version: 'string' } } }).assert(
    JSON.parse(await readFile(lockPath, 'utf8')),
  );
  Reflect.deleteProperty(lock, 'k3dHelpers');
  const bytes = JSON.stringify(lock);
  const directory = await scratchAsync('historical-lock-');
  const path = join(directory, 'toolchain.json');
  await writeFile(path, bytes);
  const hash = createHash('sha256').update(bytes).digest('hex');
  expect(await contracts.readRetainedToolchain(path, hash)).not.toHaveProperty('k3dHelpers');
  await rejects(contracts.readRetainedToolchain(path, '0'.repeat(64)));
  await rejects(readToolchain(path));
  Reflect.set(lock, 'k3dHelpers', { ...selectedHelpers, provider: 'foreign' });
  const malformed = JSON.stringify(lock);
  await writeFile(path, malformed);
  await rejects(
    contracts.readRetainedToolchain(path, createHash('sha256').update(malformed).digest('hex')),
  );
});

it('Task37 retained current toolchain still validates complete chart image roles', async () => {
  const lock = type({ charts: { certManager: { images: 'unknown[]' } } }).assert(
    JSON.parse(await readFile(lockPath, 'utf8')),
  );
  lock.charts.certManager.images.shift();
  const bytes = JSON.stringify(lock);
  const directory = await scratchAsync('retained-current-lock-');
  const path = join(directory, 'toolchain.json');
  await writeFile(path, bytes);
  await rejects(
    contracts.readRetainedToolchain(path, createHash('sha256').update(bytes).digest('hex')),
  );
});

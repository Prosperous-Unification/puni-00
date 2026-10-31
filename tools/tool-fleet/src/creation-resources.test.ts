import { rejects } from 'node:assert/strict';
import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { createCreationAttempt, transitionCreationAttempt } from './creation-journal';
import {
  appendResource,
  readResources,
  reserveResources,
  sealResources,
} from './creation-resources';

const identity = {
  labId: 'c123456789abc',
  attemptId: '11111111-1111-4111-8111-111111111111',
  daemonId: 'daemon-1',
};
async function fixture() {
  const directory = await scratchAsync('resource-evidence-');
  await chmod(directory, 0o700);
  await createCreationAttempt(directory, identity);
  return { directory, path: join(directory, `${identity.attemptId}.resources`) };
}
it('exclusively retains partial evidence before sealing and binds the ready consumer to exact bytes', async () => {
  const { directory, path } = await fixture();
  await reserveResources(directory, identity);
  await appendResource(path, 'creator-0001', {
    name: 'server',
    id: 'a'.repeat(64),
  });
  expect(JSON.parse(await readFile(join(path, 'creator-0001.json'), 'utf8'))).toMatchObject({});
  await rejects(readResources(directory, identity, '0'.repeat(64)));
  await rejects(reserveResources(directory, identity));
  await rejects(appendResource(path, 'creator-0001', { name: 'server', id: 'b'.repeat(64) }));
  const digest = await sealResources(path);
  await transitionCreationAttempt(directory, identity, 'ready');
  expect(await readResources(directory, identity, digest)).toHaveLength(1);
  await writeFile(
    join(path, 'creator-0001.json'),
    JSON.stringify({ name: 'server', id: 'b'.repeat(64) }),
  );
  await rejects(readResources(directory, identity, digest));
});
for (const fault of ['absent', 'unreadable', 'public', 'extra', 'seal-replaced'] as const)
  it(`refuses ${fault} retained evidence at consuming boundary`, async () => {
    const { directory, path } = await fixture();
    await reserveResources(directory, identity);
    await appendResource(path, 'creator-0001', {
      name: 'server',
      id: 'a'.repeat(64),
    });
    const digest = await sealResources(path);
    await transitionCreationAttempt(directory, identity, 'ready');
    if (fault === 'absent') await rm(join(path, 'creator-0001.json'));
    if (fault === 'public') await chmod(join(path, 'creator-0001.json'), 0o644);
    if (fault === 'unreadable') await chmod(join(path, 'creator-0001.json'), 0);
    if (fault === 'extra') await writeFile(join(path, 'unrecorded.json'), '{}', { mode: 0o600 });
    if (fault === 'seal-replaced')
      await writeFile(
        join(path, 'complete.json'),
        `${await readFile(join(path, 'complete.json'), 'utf8')}\n`,
      );
    await rejects(readResources(directory, identity, digest));
  });

it('refuses private or unrecognized fields before persisting creator evidence', async () => {
  const { directory, path } = await fixture();
  await reserveResources(directory, identity);
  await rejects(
    appendResource(path, 'creator-0001', {
      name: 'server',
      id: 'a'.repeat(64),
      privateToken: 'PRIVATE_TOKEN_SENTINEL',
    }),
  );
});

it('refuses a sealed inventory until its creating journal becomes ready', async () => {
  const { directory, path } = await fixture();
  await reserveResources(directory, identity);
  await appendResource(path, 'creator-0001', { name: 'server', id: 'a'.repeat(64) });
  const digest = await sealResources(path);
  await rejects(readResources(directory, identity, digest), /partial/);
});

it('Task21 rejects malformed or private archive input evidence before persistence', async () => {
  const { directory, path } = await fixture();
  await reserveResources(directory, identity);
  await rejects(
    appendResource(path, 'inputs', {
      schemaVersion: 1,
      configs: [],
      tools: { k3d: 'a'.repeat(64), kubectl: 'a'.repeat(64) },
      images: [],
      objectStore: {
        sourceRevision: 'b'.repeat(40),
        toolchainSha256: 'a'.repeat(64),
        buildLockSha256: 'a'.repeat(64),
        archive: { path: '/owned/image.oci', privateToken: 'PRIVATE_TOKEN_SENTINEL' },
      },
    }),
    /Malformed/,
  );
  await rejects(readFile(join(path, 'inputs.json')), /ENOENT/);
});

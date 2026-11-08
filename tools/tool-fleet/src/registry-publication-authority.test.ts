import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import { requireRejection } from './registry-rejection.fixture';
const GiB = 1024 ** 3;
const blob = {
  repository: 'owned/image',
  digest: 'sha256:' + '1'.repeat(64),
  size: 5,
  mediaType: 'application/vnd.oci.image.config.v1+json',
  isManifest: false,
  dependencies: [],
};
const manifest = {
  repository: 'owned/image',
  digest: 'sha256:' + '2'.repeat(64),
  size: 100,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  isManifest: true,
  dependencies: [blob.digest],
};
const uploadId = '00000000-0000-4000-8000-000000000001';
async function fixture(schema = 4) {
  const directory = await scratchAsync('registry-publication-evidence-');
  const journal = join(directory, 'journal');
  await mkdir(journal, { mode: 0o700 });
  let verified = 0;
  const ports: RegistryJournalPorts = {
    measureJournal: () =>
      invokeRegistryCallback(() => ({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 100000,
        usedInodes: 1,
      })),
    measureRegistry: () =>
      invokeRegistryCallback(() => ({
        maximumBytes: 50 * GiB,
        usableBytes: 50 * GiB,
        usedBytes: GiB,
        totalInodes: 100000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      })),
    verifyImages: () =>
      invokeRegistryCallback(() => {
        verified++;
      }),
  };
  await executeRegistryCommand(
    journal,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'owned',
        storageId: 'owned',
        registryPath: join(directory, 'registry'),
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
        owners: ['publisher'],
      },
    },
    ports,
  );
  if (schema === 4) {
    const state = (await executeRegistryCommand(journal, { command: 'upgrade-maintenance' }, ports))
      .state;
    // Fixture boundary: emulate the separately proved verified baseline/reopen so these tests isolate publication authority, not mount/controller readiness.
    state.fenced = false;
    state.fenceReason = null;
    state.maintenanceVerified = true;
    await writeFile(join(journal, 'journal.json'), JSON.stringify(state), { mode: 0o600 });
  }
  const invoke = (input: unknown) => executeRegistryCommand(journal, input, ports);
  const reserve = async (declaration = true) =>
    invoke({
      command: 'reserve-publication',
      operationId: 'publication',
      owner: 'publisher',
      expectedRevision: (await invoke({ command: 'read' })).state.revision,
      product: 'owned',
      roots: [manifest.digest],
      references: [{ repository: manifest.repository, digest: manifest.digest }],
      envelope: { bytes: 1024 ** 2, inodes: 100 },
      ...(declaration ? { contents: [blob, manifest] } : {}),
    });
  const write = async (token: string, digest: string, phase: string, upload: string | null) =>
    invoke({
      command: 'record-publication-write',
      operationId: 'publication',
      owner: 'publisher',
      token,
      expectedRevision: (await invoke({ command: 'read' })).state.revision,
      write: { repository: 'owned/image', digest, phase, uploadId: upload },
    });
  return { invoke, reserve, write, verified: () => verified };
}
test('schema4 refuses reservation without declaration before creating publication ownership', async () => {
  const proof = await fixture();
  expect((await requireRejection(proof.reserve(false))).throwCause).toThrow('content declaration');
  expect((await proof.invoke({ command: 'read' })).state.publication).toBeNull();
});
test('schema4 persists exact upload UUID before body and permits stored acknowledgement only after intent', async () => {
  const proof = await fixture();
  const admission = await proof.reserve();
  const token = admission.token;
  if (token === undefined) throw new Error('Missing capability');
  expect(
    (await requireRejection(proof.write(token, blob.digest, 'stored', uploadId))).throwCause,
  ).toThrow('write intent');
  const started = await proof.write(token, blob.digest, 'writing', uploadId);
  if (started.state.schemaVersion !== 4) throw new Error('Missing schema4');
  expect(started.state.publicationEvidence[0]?.writes[0]?.uploadId).toBe(uploadId);
  expect(
    (
      await requireRejection(
        proof.write(token, blob.digest, 'stored', '00000000-0000-4000-8000-000000000002'),
      )
    ).throwCause,
  ).toThrow('upload ownership');
  await proof.write(token, blob.digest, 'stored', uploadId);
});
test('schema4 completed publication requires every declared write and server image verification', async () => {
  const proof = await fixture();
  const admission = await proof.reserve();
  const token = admission.token;
  if (token === undefined) throw new Error('Missing capability');
  const complete = async () =>
    proof.invoke({
      command: 'finish-publication',
      operationId: 'publication',
      owner: 'publisher',
      token,
      expectedRevision: (await proof.invoke({ command: 'read' })).state.revision,
      outcome: 'completed',
      reconciled: true,
    });
  expect((await requireRejection(complete())).throwCause).toThrow('stored content');
  for (const content of [blob, manifest]) {
    await proof.write(token, content.digest, 'writing', content.isManifest ? null : uploadId);
    await proof.write(token, content.digest, 'stored', content.isManifest ? null : uploadId);
  }
  expect((await complete()).state.bundles[0]?.receipt.state).toBe('completed');
  expect(proof.verified()).toBe(1);
});
test('schema3 keeps ordinary publication compatibility but cannot invent new write evidence', async () => {
  const proof = await fixture(3);
  const admission = await proof.reserve(false);
  if (admission.token === undefined) throw new Error('Missing capability');
  expect(
    (await requireRejection(proof.write(admission.token, blob.digest, 'writing', uploadId)))
      .throwCause,
  ).toThrow('schema4');
});

for (const [fault, digest, upload] of [
  ['blob-as-manifest', blob.digest, null],
  ['manifest-as-blob', manifest.digest, uploadId],
  ['undeclared', 'sha256:' + '3'.repeat(64), uploadId],
] as const) {
  test(
    'actual journal refuses mismatched write ownership before persisting intent: ' + fault,
    async () => {
      const proof = await fixture();
      const admitted = await proof.reserve();
      if (admitted.token === undefined) throw new Error('Missing publication capability');
      const refused = await requireRejection(
        proof.write(admitted.token, digest, 'writing', upload),
      );
      expect(refused.throwCause).toThrow('Upload ownership differs from declaration');
      const after = (await proof.invoke({ command: 'read' })).state;
      if (after.schemaVersion !== 4) throw new Error('Missing schema4 evidence');
      expect(after.publicationEvidence[0]?.writes).toEqual([]);
      expect(after.revision).toBe(admitted.state.revision);
    },
  );
}

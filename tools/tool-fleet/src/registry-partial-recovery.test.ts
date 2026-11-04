import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import { writeRegistryDeletionFixture } from './registry-deletion.fixture';
import { collectRegistryInventory } from './registry-inventory';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  projectRegistryRecovery,
  type RegistryJournalPorts,
  runRegistryMaintenance,
} from './registry-journal';
import {
  maintainRegistry,
  type RegistryMaintenanceAuthority,
  type RegistryMaintenanceRuntime,
  stageRegistryRecovery,
} from './registry-maintenance';
import { createRegistryRecoveryVerifier } from './registry-maintenance-recovery';
import type { RegistryBackupReceipt } from './registry-maintenance-state';
import { discardRegistryUploads } from './registry-upload-census';

const GiB = 1024 ** 3;
const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function captureRefusal(pending: Promise<unknown>): Promise<Error> {
  try {
    await pending;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    return cause;
  }
  throw new Error('Expected the owned operation to refuse');
}

/** Actual authority/file/HTTP paths; backup copying, mount identities/capacity, consumer reader and runtime fencing are modeled. */
async function createFixture() {
  const directory = await scratchAsync('registry-partial-recovery-');
  const journalPath = join(directory, 'journal');
  const registryPath = join(directory, 'registry');
  const target = join(directory, 'recovered');
  const staged = join(directory, 'staged');
  const snapshot = join(directory, 'snapshot');
  for (const path of [journalPath, registryPath, target, staged, snapshot])
    await mkdir(path, { mode: 0o700 });
  const calls: string[] = [];
  let at = new Date(Date.now() - 8 * 86400000).toISOString();
  let currentClock = false;
  const ports: RegistryJournalPorts = {
    now: () => (currentClock ? new Date().toISOString() : at),
    measureJournal: () =>
      Promise.resolve({
        usableBytes: GiB,
        allocationUnitBytes: 4096,
        usedBytes: 1000,
        totalInodes: 10000,
        usedInodes: 10,
      }),
    measureRegistry: () =>
      Promise.resolve({
        maximumBytes: 50 * GiB,
        usableBytes: 50 * GiB,
        usedBytes: GiB,
        totalInodes: 10000,
        usedInodes: 10,
        rootFreeBytes: 30 * GiB,
      }),
    verifyImages: () => Promise.resolve(),
    verifyConsumers: () => Promise.resolve(),
    collectConsumers: (sources, revision) =>
      Promise.resolve(
        sources.map((source) => ({
          id: source.id,
          source: source.source,
          role: source.role,
          revision,
          sourceRevision: 'observed',
          references: [],
        })),
      ),
  };
  await executeRegistryCommand(
    journalPath,
    {
      command: 'initialize',
      enrollment: {
        registryId: 'partial',
        storageId: 'original',
        owners: ['owner'],
        registryPath,
        rootPath: '/',
        maximumBytes: 50 * GiB,
        journalMaximumBytes: GiB,
      },
    },
    ports,
  );
  const readState = async () =>
    (await executeRegistryCommand(journalPath, { command: 'read' }, ports)).state;
  await executeRegistryCommand(
    journalPath,
    {
      command: 'enroll-consumers',
      expectedRevision: (await readState()).revision,
      operationId: 'readers',
      owner: 'owner',
      sources: [
        {
          id: 'host',
          owner: 'owner',
          environment: null,
          kind: 'docker-host',
          source: '/owned/host.json',
          configurationSha256: 'a'.repeat(64),
          role: 'consumer',
        },
      ],
    },
    ports,
  );
  const artifacts = await writeRegistryDeletionFixture(directory);
  const contents = new Map<string, Uint8Array<ArrayBuffer>>();
  const put = async (relative: string, bytes: string | Uint8Array) => {
    const path = join(registryPath, 'docker/registry/v2', relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  };
  for (const [index, artifact] of artifacts.entries()) {
    for (const content of artifact.contents) {
      const bytes = new Uint8Array(await (await verifyContent(content)).arrayBuffer());
      contents.set(content.digest, bytes);
      const hex = content.digest.slice(7);
      await put(`blobs/sha256/${hex.slice(0, 2)}/${hex}/data`, bytes);
      await put(
        `repositories/${artifact.repository}/${content.isManifest ? '_manifests/revisions' : '_layers'}/sha256/${hex}/link`,
        content.digest,
      );
    }
    await put(
      `repositories/${artifact.repository}/_manifests/tags/${artifact.reference}/current/link`,
      artifact.digest,
    );
    await put(
      `repositories/${artifact.repository}/_manifests/tags/${artifact.reference}/index/sha256/${artifact.digest.slice(7)}/link`,
      artifact.digest,
    );
    const reserved = await executeRegistryCommand(
      journalPath,
      {
        command: 'reserve-publication',
        expectedRevision: (await readState()).revision,
        operationId: `publication-${String(index)}`,
        owner: 'owner',
        product: 'fixture',
        roots: [artifact.digest],
        references: [{ repository: artifact.repository, digest: artifact.digest }],
        envelope: { bytes: 1048576, inodes: 100 },
      },
      ports,
    );
    if (reserved.token === undefined) throw new Error('Missing actual publication token');
    await executeRegistryCommand(
      journalPath,
      {
        command: 'finish-publication',
        expectedRevision: reserved.state.revision,
        operationId: `publication-${String(index)}`,
        owner: 'owner',
        token: reserved.token,
        outcome: 'completed',
        reconciled: true,
      },
      ports,
    );
    at = new Date(Date.parse(at) + 1).toISOString();
  }
  const [expired, protectedIndex] = artifacts;
  await executeRegistryCommand(
    journalPath,
    {
      command: 'acquire-protection',
      expectedRevision: (await readState()).revision,
      operationId: 'protected-index',
      owner: 'owner',
      reason: 'explicit-test-protection',
      roots: [protectedIndex.digest],
      references: [{ repository: protectedIndex.repository, digest: protectedIndex.digest }],
    },
    ports,
  );
  await executeRegistryCommand(journalPath, { command: 'upgrade-maintenance' }, ports);
  currentClock = true;
  const revisionRelative = `docker/registry/v2/repositories/${expired.repository}/_manifests/revisions/sha256/${expired.digest.slice(7)}/link`;
  const tagRelative = `docker/registry/v2/repositories/${expired.repository}/_manifests/tags/${expired.reference}/current/link`;
  let requests = 0;
  let deletes = 0;
  let serving = registryPath;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      requests++;
      const path = new URL(request.url).pathname;
      if (path === '/v2/_catalog')
        return Response.json({ repositories: artifacts.map((a) => a.repository).sort() });
      const artifact = artifacts.find((a) => path.startsWith(`/v2/${a.repository}/`));
      if (artifact === undefined) throw new Error('Unexpected modeled repository');
      if (path === `/v2/${artifact.repository}/tags/list`)
        return Response.json({ name: artifact.repository, tags: [artifact.reference] });
      if (request.method === 'DELETE') {
        if (
          artifact !== expired ||
          path !== `/v2/${expired.repository}/manifests/${expired.digest}` ||
          serving !== registryPath
        )
          throw new Error('Unexpected deletion target');
        deletes++;
        await unlink(join(registryPath, revisionRelative));
        return new Response('', { status: 500 });
      }
      const reference = path.split('/').at(-1);
      const digest = reference === artifact.reference ? artifact.digest : reference;
      const bytes = digest === undefined ? undefined : contents.get(digest);
      const declaration = artifact.contents.find((c) => c.digest === digest);
      if (digest === undefined || bytes === undefined || declaration === undefined)
        throw new Error('Unexpected modeled content');
      return new Response(bytes, {
        headers: { 'content-type': declaration.mediaType, 'docker-content-digest': digest },
      });
    },
  });
  const identity = (storageId = 'original') => ({
    registryId: 'partial',
    storageId,
    node: 'fixture',
    pvcUid: 'owned',
    mountIdentity: 'owned',
    distributionDigest: 'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
    binarySha256: '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37',
  });
  const runtime: RegistryMaintenanceRuntime = {
    inspect: () => Promise.resolve('prior-state'),
    fence: () => {
      calls.push('fence');
      return Promise.resolve('modeled-stopped-runtime');
    },
    assertStopped: () => {
      calls.push('stopped');
      return Promise.resolve();
    },
    identify: (authority) => Promise.resolve(identity(authority.read().enrollment.storageId)),
    open: (authority) => {
      serving = authority.read().enrollment.registryPath;
      calls.push('open');
      return Promise.resolve({
        endpoint: { url: server.url.toString() },
        close: () => {
          calls.push('close');
          return Promise.resolve();
        },
      });
    },
    discardUploads: (authority) =>
      discardRegistryUploads(authority.read(), new AbortController().signal),
    collect: () => {
      calls.push('gc');
      return Promise.resolve();
    },
    verifyImages: settleRegistryClientFixture,
    restoreService: () => {
      calls.push('restore-service');
      return Promise.resolve();
    },
  };
  let snapshotReceipt: RegistryBackupReceipt | undefined;
  const backup = {
    prepare: () => Promise.resolve(),
    snapshot: async (source: { journalRevision: number; censusSha256: string }) => {
      await cp(registryPath, join(snapshot, 'registry'), { recursive: true });
      await cp(journalPath, join(snapshot, 'journal'), { recursive: true });
      const bytes = await readFile(join(snapshot, 'journal/journal.json'));
      snapshotReceipt = {
        snapshotId: 'a'.repeat(64),
        verifiedAt: new Date().toISOString(),
        registryId: 'partial',
        storageId: 'original',
        registryPath,
        journalPath,
        journalRevision: source.journalRevision,
        journalSha256: hashBytes(bytes),
        censusSha256: source.censusSha256,
        bytes: bytes.length,
      };
      return snapshotReceipt;
    },
    verify: async (receipt: RegistryBackupReceipt) => {
      if (
        snapshotReceipt === undefined ||
        JSON.stringify(receipt) !== JSON.stringify(snapshotReceipt) ||
        hashBytes(await readFile(join(snapshot, 'journal/journal.json'))) !== receipt.journalSha256
      )
        throw new Error('Modeled backup differs from actual captured journal');
      calls.push('verify');
    },
    restore: async (receipt: RegistryBackupReceipt) => {
      await backup.verify(receipt);
      await cp(join(snapshot, 'registry'), target, { recursive: true });
      await cp(join(snapshot, 'journal'), staged, { recursive: true });
      calls.push('restore-copy');
    },
  };
  return {
    directory,
    journalPath,
    registryPath,
    target,
    staged,
    snapshot,
    ports,
    readState,
    runtime,
    backup,
    calls,
    identity,
    server,
    expired,
    protectedIndex,
    revisionRelative,
    tagRelative,
    requestCount: () => requests,
    deleteCount: () => deletes,
    serveRecovered: () => {
      serving = target;
    },
  };
}

// Existing production guard removal must allow forbidden API contact on the dangling-tag state;
// generic HTTP404 or a later ownership refusal is not evidence of pre-API protection.
test('partial manifest unlink refuses complete census before API and preserves failed authority', async () => {
  const fixture = await createFixture();
  try {
    expect(
      (
        await captureRefusal(
          maintainRegistry({
            directory: fixture.journalPath,
            operationId: 'retirement',
            owner: 'owner',
            kind: 'retirement',
            ports: fixture.ports,
            runtime: fixture.runtime,
            backup: fixture.backup,
          }),
        )
      ).message,
    ).toContain('Managed registry request failed with HTTP 500');
    const failed = await fixture.readState();
    expect(fixture.deleteCount()).toBe(1);
    expect(failed.maintenance?.phase).toBe('failed');
    expect(failed.fenced).toBe(true);
    expect(await readFile(join(fixture.registryPath, fixture.tagRelative), 'utf8')).toBe(
      fixture.expired.digest,
    );
    expect(
      await captureRefusal(lstat(join(fixture.registryPath, fixture.revisionRelative))),
    ).toMatchObject({ code: 'ENOENT' });
    const before = fixture.requestCount();
    let refusal: unknown;
    try {
      await collectRegistryInventory({
        journal: failed,
        identity: fixture.identity(),
        endpoint: { url: fixture.server.url.toString() },
        consumers: fixture.ports,
      });
    } catch (cause) {
      refusal = cause;
    }
    expect(fixture.requestCount() - before).toBe(0);
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).toBe('Current tag omits required manifest revision');
    expect(fixture.calls).not.toContain('gc');
    expect(fixture.calls).not.toContain('restore-service');
    expect((await fixture.readState()).revision).toBe(failed.revision);
  } finally {
    await fixture.server.stop(true);
  }
});

for (const priorClient of [false, true])
  test(
    'held production recovery verifies matching staged journal and keeps original store fenced; prior client=' +
      String(priorClient),
    async () => {
      const fixture = await createFixture();
      try {
        expect(
          (
            await captureRefusal(
              maintainRegistry({
                directory: fixture.journalPath,
                operationId: 'retirement',
                owner: 'owner',
                kind: priorClient ? 'backup' : 'retirement',
                ports: fixture.ports,
                runtime: priorClient
                  ? {
                      ...fixture.runtime,
                      restoreService: () =>
                        Promise.reject(new Error('post-client service failure')),
                    }
                  : fixture.runtime,
                backup: fixture.backup,
              }),
            )
          ).message,
        ).toContain(
          priorClient
            ? 'post-client service failure'
            : 'Managed registry request failed with HTTP 500',
        );
        const failed = await fixture.readState();
        if (priorClient) {
          if (failed.schemaVersion !== 4) throw new Error('Missing failed schema4');
          expect(failed.maintenanceEvidence?.client?.scope).toBe('current');
          expect(failed.maintenanceEvidence?.client?.storageId).toBe('original');
        }
        const lock = await lstat(join(fixture.journalPath, 'authority.lock'));
        const oldDevice = (await lstat(fixture.registryPath)).dev;
        let held = 0;
        const requireHeld = async (authority: RegistryMaintenanceAuthority) => {
          const canonical = await lstat(join(fixture.journalPath, 'authority.lock'));
          expect(canonical.ino).toBe(lock.ino);
          expect(authority.authorityDescriptor).toBeGreaterThanOrEqual(0);
          expect((await captureRefusal(fixture.readState())).message).toContain('busy');
          held++;
        };
        const recovery = createRegistryRecoveryVerifier({
          backup: fixture.backup,
          consumers: fixture.ports,
          measure: (path) =>
            Promise.resolve({
              device: oldDevice + (path === fixture.target ? 1 : path === fixture.staged ? 2 : 3),
              identity:
                path === fixture.target
                  ? 'recovered'
                  : path === fixture.staged
                    ? 'staged'
                    : 'canonical',
              maximumBytes: path === fixture.target ? 50 * GiB : GiB,
              allocationUnitBytes: 4096,
              usableBytes: GiB,
              usedBytes: 1000,
              availableBytes: GiB - 1000,
              reservedBytes: 0,
              totalInodes: 10000,
              usedInodes: 10,
            }),
          runtime: {
            verifyImages: (authority, inventory) =>
              settleRegistryClientFixture(authority, inventory, 'recovery'),
            assertStopped: requireHeld,
            audit: async (authority) => {
              await requireHeld(authority);
              const state = authority.read();
              const receipt = state.maintenanceEvidence?.backup;
              if (receipt === undefined || receipt === null)
                throw new Error('Missing captured backup');
              return {
                target: {
                  state: 'prepared',
                  operationId: 'retirement',
                  snapshotId: receipt.snapshotId,
                  previousStorageId: 'original',
                  previousRegistryPath: fixture.registryPath,
                  storageId: 'recovered',
                  registryPath: fixture.target,
                  maximumBytes: 50 * GiB,
                  canonicalJournalPath: fixture.journalPath,
                  stagedJournalPath: fixture.staged,
                  stagedJournalStorageId: 'staged',
                  stagedJournalMaximumBytes: GiB,
                  node: 'fixture',
                  pvcUid: 'owned',
                  mountIdentity: 'owned',
                  distributionDigest: fixture.identity().distributionDigest,
                  binarySha256: fixture.identity().binarySha256,
                  preparedAt: new Date().toISOString(),
                },
                registryIdentityReceipt: 'modeled-registry',
                stagedJournalIdentityReceipt: 'modeled-staged',
                canonicalJournalIdentityReceipt: 'modeled-canonical',
              };
            },
            open: async (authority) => {
              await requireHeld(authority);
              fixture.serveRecovered();
              return {
                endpoint: { url: fixture.server.url.toString() },
                close: () => Promise.resolve(),
              };
            },
          },
        });
        await stageRegistryRecovery({
          directory: fixture.journalPath,
          operationId: 'retirement',
          owner: 'owner',
          kind: priorClient ? 'backup' : 'retirement',
          ports: { ...fixture.ports, ...recovery },
          runtime: fixture.runtime,
          backup: fixture.backup,
        });
        const recovered = await fixture.readState();
        expect(held).toBeGreaterThan(3);
        expect(recovered.enrollment.registryPath).toBe(fixture.target);
        expect(recovered.enrollment.storageId).toBe('recovered');
        expect(recovered.maintenance?.phase).toBe('restored');
        expect(recovered.fenced).toBe(true);
        expect(recovered.protections).toEqual(failed.protections);
        expect(recovered.bundles).toEqual(failed.bundles);
        expect((await lstat(join(fixture.journalPath, 'authority.lock'))).ino).toBe(lock.ino);
        const staged = await readFile(join(fixture.staged, 'journal.json'));
        if (recovered.schemaVersion !== 4) throw new Error('Missing current recovery schema');
        const verifiedBackup = recovered.maintenanceEvidence?.backup;
        if (verifiedBackup === undefined || verifiedBackup === null)
          throw new Error('Missing verified recovery backup');
        expect(hashBytes(staged)).toBe(verifiedBackup.journalSha256);
        const decoded: unknown = JSON.parse(staged.toString());
        expect(parseRegistryCommandResponse({ state: decoded }).state.revision).toBeLessThan(
          recovered.revision,
        );
        expect(await readFile(join(fixture.target, fixture.revisionRelative), 'utf8')).toBe(
          fixture.expired.digest,
        );
        expect(await readFile(join(fixture.registryPath, fixture.tagRelative), 'utf8')).toBe(
          fixture.expired.digest,
        );
        if (priorClient)
          expect(await readFile(join(fixture.registryPath, fixture.revisionRelative), 'utf8')).toBe(
            fixture.expired.digest,
          );
        else {
          expect(
            await captureRefusal(lstat(join(fixture.registryPath, fixture.revisionRelative))),
          ).toMatchObject({ code: 'ENOENT' });
        }
        expect(recovered.maintenanceEvidence?.client?.scope).toBe('recovery');
        expect(recovered.maintenanceEvidence?.client?.storageId).toBe('recovered');
        expect(fixture.calls).not.toContain('restore-service');
      } finally {
        await fixture.server.stop(true);
      }
    },
  );

// This models a trusted current authority view newer than the captured snapshot; the real
// canonical journal is never rewritten to manufacture concurrent protection mutations.
for (const closure of ['backed', 'missing'] as const) {
  test(`current newer ${closure} protection survives projection before restored census`, async () => {
    const fixture = await createFixture();
    try {
      const original = await fixture.readState();
      const ending = await captureRefusal(
        runRegistryMaintenance(
          fixture.journalPath,
          { operationId: 'projection', owner: 'owner', kind: 'backup', recover: false },
          fixture.ports,
          async (authority) => {
            const source = authority.read();
            const receipt = await fixture.backup.snapshot({
              journalRevision: source.revision,
              censusSha256: 'c'.repeat(64),
            });
            const evidence = authority.read().maintenanceEvidence;
            if (evidence === null) throw new Error('Missing owned projection evidence');
            await authority.record({ ...evidence, backup: receipt });
            const current = authority.read();
            current.revision += 1;
            const digest =
              closure === 'backed' ? fixture.protectedIndex.digest : `sha256:${'f'.repeat(64)}`;
            const protection = {
              operationId: 'modeled-newer-protection',
              owner: 'owner',
              token: '00000000-0000-4000-8000-000000000003',
              reason: 'modeled-current-obligation',
              roots: [digest],
              references: [{ repository: fixture.protectedIndex.repository, digest }],
            };
            current.protections.push(protection);
            await cp(join(fixture.snapshot, 'registry'), fixture.target, { recursive: true });
            const projected = projectRegistryRecovery(current, {
              storageId: 'recovered',
              registryPath: fixture.target,
              maximumBytes: 50 * GiB,
            });
            expect(projected.protections).toEqual(current.protections);
            expect(projected.protections.at(-1)).toEqual(protection);
            expect(projected.revision).toBe(current.revision);
            expect((await captureRefusal(fixture.readState())).message).toContain('busy');
            fixture.serveRecovered();
            const census = collectRegistryInventory({
              journal: projected,
              identity: fixture.identity('recovered'),
              endpoint: { url: fixture.server.url.toString() },
              consumers: fixture.ports,
            });
            if (closure === 'missing') {
              expect((await captureRefusal(census)).message).toBe(
                `Unknown required repository revision: ${fixture.protectedIndex.repository}@${digest}`,
              );
            } else {
              const inventory = await census;
              expect(inventory.revisions).toContainEqual({
                repository: fixture.protectedIndex.repository,
                digest,
              });
            }
            const captured: unknown = JSON.parse(
              await readFile(join(fixture.snapshot, 'journal/journal.json'), 'utf8'),
            );
            const offline = parseRegistryCommandResponse({ state: captured }).state;
            expect(offline.protections).toEqual(original.protections);
            expect(offline.revision).toBeLessThan(current.revision);
            throw new Error('Modeled current projection checked under held authority');
          },
        ),
      );
      expect(ending.message).toBe('Modeled current projection checked under held authority');
      const canonical = await fixture.readState();
      expect(canonical.protections).toEqual(original.protections);
      expect(canonical.enrollment.registryPath).toBe(fixture.registryPath);
      expect(canonical.fenced).toBe(true);
    } finally {
      await fixture.server.stop(true);
    }
  });
}

import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type } from 'arktype';

import { modelRegistryBackupEffects } from './registry-backup-reservation.fixture';
import { createRegistryBackupStore } from './registry-backup-store';
import { measureVerifiedFilesystem } from './registry-capacity';
import { settleRegistryClientFixture } from './registry-client-completion.fixture';
import { collectRegistryInventory } from './registry-inventory';
import type { RegistryJournal } from './registry-journal';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-journal';
import {
  completeRegistryRecovery,
  maintainRegistry,
  type RegistryMaintenanceRuntime,
  stageRegistryRecovery,
} from './registry-maintenance';
import { createRegistryRecoveryVerifier } from './registry-maintenance-recovery';
import { publishPartialRegistryFixture } from './registry-partial-publication.native';
import { discardRegistryUploads, readRegistryUpload } from './registry-upload-census';

const expectedBinary = '8be11cd37a7d43b87e2a2ad11eb5d14dc64d15a040a37485e7e1cbb4c6c9dd37';
const distributionDigest =
  'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278';
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const imageType = 'application/vnd.oci.image.manifest.v1+json';
const indexType = 'application/vnd.oci.image.index.v1+json';

/** Owned local fixture only. Requires the amd64 binary extracted from the exact pinned image; no Docker socket, production storage or credentials. */
async function proveLifecycle(
  binary: string,
  restic: string,
  unsafe: boolean,
  fixtureRoot?: string,
  partial = false,
  unlinkFault = false,
  repeat = false,
): Promise<void> {
  if (partial && fixtureRoot !== undefined)
    throw new Error('Partial fixture must run before the separate ENOSPC drill');
  if (hash(await readFile(binary)) !== expectedBinary)
    throw new Error('Native fixture binary differs from pinned image extraction');
  const available = await statfs('/');
  if (available.bavail * available.bsize < 21 * 1024 ** 3)
    throw new Error('Native fixture root reserve before allocation');
  if (fixtureRoot !== undefined) {
    if (!/^\/var\/tmp\/puni-task8-proof-[a-z0-9]+$/.test(fixtureRoot))
      throw new Error('Invalid owned volume fixture path');
    const status = await lstat(fixtureRoot);
    if (status.uid !== 0 || (status.mode & 0o777) !== 0o700 || !status.isDirectory())
      throw new Error('Untrusted owned volume fixture');
  }
  const directory =
    fixtureRoot === undefined
      ? await mkdtemp('/tmp/task8-lifecycle-')
      : join(fixtureRoot, 'runtime');
  const storage =
    fixtureRoot === undefined ? join(directory, 'storage') : join(fixtureRoot, 'registry/contents');
  if (fixtureRoot === undefined) await mkdir(storage);
  else await mkdir(directory, { mode: 0o700 });
  const originalMount =
    fixtureRoot === undefined
      ? undefined
      : await measureVerifiedFilesystem(storage, join(fixtureRoot, 'registry.receipt'));
  const originalStorageId = originalMount?.identity ?? 'owned';
  const maximumBytes = originalMount?.maximumBytes ?? 256 * 1024 ** 2;
  const journalMaximumBytes = fixtureRoot === undefined ? 1024 ** 2 : 32 * 1024 ** 2;
  const base = join(storage, 'docker/registry/v2');
  const listener = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response('reserved'),
  });
  const port = listener.port;
  await listener.stop(true);
  if (port === undefined) throw new Error('Missing owned fixture port');
  const endpoint = { url: `http://127.0.0.1:${String(port)}` };
  const configuration = join(directory, 'registry.yml');
  await writeFile(
    configuration,
    `version: 0.1\nlog:\n  level: error\nstorage:\n  filesystem:\n    rootdirectory: ${storage}\n  delete:\n    enabled: true\n  maintenance:\n    uploadpurging:\n      enabled: false\nhttp:\n  addr: 127.0.0.1:${String(port)}\n  secret: owned-task8-fixture\n`,
  );
  const log = await open(join(directory, 'registry.log'), 'wx');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let checks = 0;
  let failedUploadDirectory: string | undefined;
  let failAfterSecondReceipt = false;
  let activeOperation = 'native-retire';
  const requireProof = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
    checks++;
  };
  const checkBounds = async () => {
    const measure = Bun.spawnSync(['/usr/bin/du', '-s', '-B1', directory]);
    if (measure.exitCode !== 0)
      throw new Error(`Fixture measurement failed: ${measure.stderr.toString()}`);
    const bytes = Number(measure.stdout.toString().split(/\s/)[0]);
    const reserve = await statfs('/');
    if (
      !Number.isSafeInteger(bytes) ||
      bytes > 256 * 1024 ** 2 ||
      reserve.bavail * reserve.bsize < 20 * 1024 ** 3
    )
      throw new Error('Native fixture capacity bound');
    return { bytes, rootFreeBytes: reserve.bavail * reserve.bsize };
  };
  const stop = async () => {
    if (child === undefined) throw new Error('Missing owned registry process');
    child.kill('SIGTERM');
    const current = child;
    const timeout = setTimeout(() => {
      current.kill('SIGKILL');
    }, 5000);
    const code = await current.exited;
    clearTimeout(timeout);
    child = undefined;
    if (code !== 0 && code !== 143)
      throw new Error(`Owned registry shutdown failed: ${String(code)}`);
  };
  const start = async (mode: 'readonly' | 'deletion' = 'deletion') => {
    child = Bun.spawn([binary, 'serve', configuration], {
      env: {
        PATH: '/usr/bin:/bin',
        REGISTRY_STORAGE_DELETE_ENABLED: String(mode === 'deletion'),
        REGISTRY_STORAGE_MAINTENANCE_READONLY: JSON.stringify({ enabled: mode === 'readonly' }),
        REGISTRY_STORAGE_MAINTENANCE_UPLOADPURGING: '{"enabled":false}',
      },
      stdout: log.fd,
      stderr: log.fd,
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null)
        throw new Error(`Registry startup failed: ${String(child.exitCode)}`);
      const response = await fetch(`${endpoint.url}/v2/`).catch((cause: unknown) => {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ECONNREFUSED') return null;
        throw cause;
      });
      if (response?.ok === true) return;
      await Bun.sleep(20);
    }
    throw new Error('Owned registry startup did not converge');
  };
  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(new URL(path, endpoint.url), init);
    if (!response.ok)
      throw new Error(
        `Fixture request ${path}: ${String(response.status)} ${await response.text()}`,
      );
    return response;
  };
  const blob = async (repository: string, bytes: string, mediaType: string) => {
    const digest = `sha256:${hash(bytes)}`;
    const upload = await request(`/v2/${repository}/blobs/uploads/`, { method: 'POST' });
    const location = upload.headers.get('location');
    if (location === null) throw new Error('Missing fixture upload location');
    const url = new URL(location);
    url.searchParams.set('digest', digest);
    await request(url.href, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': 'application/octet-stream' },
    });
    return { digest, size: Buffer.byteLength(bytes), mediaType };
  };
  const manifest = async (
    repository: string,
    reference: string | undefined,
    value: { mediaType: string; [key: string]: unknown },
  ) => {
    const bytes = JSON.stringify(value);
    const digest = `sha256:${hash(bytes)}`;
    await request(`/v2/${repository}/manifests/${reference ?? digest}`, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': value.mediaType },
    });
    return { digest, size: Buffer.byteLength(bytes), mediaType: value.mediaType };
  };
  try {
    await start();
    const config = await blob('proof/image', '{}', 'application/vnd.oci.image.config.v1+json');
    const layer = await blob(
      'proof/image',
      'shared fixture layer',
      'application/vnd.oci.image.layer.v1.tar',
    );
    const obsoleteLayer = await blob(
      'proof/image',
      'obsolete fixture layer',
      'application/vnd.oci.image.layer.v1.tar',
    );
    const old = await manifest('proof/image', 'current', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [obsoleteLayer],
    });
    const childManifest = await manifest('proof/image', undefined, {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
    });
    const indexValue = { schemaVersion: 2, mediaType: indexType, manifests: [childManifest] };
    const index = await manifest('proof/image', 'current', indexValue);
    await blob('other/image', '{}', config.mediaType);
    await blob('other/image', 'shared fixture layer', layer.mediaType);
    const other = await manifest('other/image', 'current', {
      schemaVersion: 2,
      mediaType: imageType,
      config,
      layers: [layer],
    });
    const journal: RegistryJournal = {
      schemaVersion: 3,
      revision: 1,
      updatedAt: '2026-10-01T00:00:00.000Z',
      fenced: false,
      fenceReason: null,
      maintenanceVerified: false,
      measurement: null,
      enrollment: {
        registryId: 'native',
        storageId: originalStorageId,
        registryPath: storage,
        rootPath: '/',
        maximumBytes,
        journalMaximumBytes,
        owners: ['owner'],
      },
      protections: [
        {
          operationId: 'pin',
          owner: 'owner',
          token: '00000000-0000-4000-8000-000000000001',
          reason: 'fixture',
          roots: [index.digest],
          references: [{ repository: 'proof/image', digest: index.digest }],
        },
      ],
      bundles: [
        {
          operationId: 'old',
          owner: 'owner',
          product: 'fixture',
          roots: [old.digest, other.digest, index.digest],
          references: [
            { repository: 'proof/image', digest: old.digest },
            { repository: 'other/image', digest: other.digest },
            { repository: 'proof/image', digest: index.digest },
          ],
          receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
        },
      ],
      reservations: [],
      publication: null,
      maintenance: null,
      closedOperations: [],
      environments: [],
      deployments: [],
      consumers: [
        {
          id: 'fixture',
          owner: 'owner',
          environment: null,
          kind: 'docker-host',
          source: '/owned/fixture.json',
          configurationSha256: 'a'.repeat(64),
          role: 'consumer',
        },
      ],
    };
    const journalPath =
      fixtureRoot === undefined
        ? join(directory, 'journal')
        : join(fixtureRoot, 'journal/contents');
    if (fixtureRoot === undefined) await mkdir(journalPath, { mode: 0o700 });
    await writeFile(join(journalPath, 'journal.json'), JSON.stringify(journal), { mode: 0o600 });
    const ports: RegistryJournalPorts = {
      measureJournal: () =>
        Promise.resolve({
          usableBytes: 1024 ** 2,
          allocationUnitBytes: 4096,
          usedBytes: 10000,
          totalInodes: 10000,
          usedInodes: 10,
        }),
      measureRegistry: () =>
        Promise.resolve({
          maximumBytes,
          usableBytes: 256 * 1024 ** 2,
          usedBytes: 1024 ** 2,
          totalInodes: 10000,
          usedInodes: 100,
          rootFreeBytes: 30 * 1024 ** 3,
        }),
      verifyConsumers: () => Promise.resolve(),
      collectConsumers: (sources, revision) =>
        Promise.resolve(
          sources.map((source) => ({
            id: source.id,
            source: source.source,
            role: source.role,
            revision,
            sourceRevision: 'synthetic',
            references: [],
          })),
        ),
    };
    if (fixtureRoot !== undefined) {
      ports.measureJournal = async () => {
        const measured = await measureVerifiedFilesystem(
          journalPath,
          join(fixtureRoot, 'journal.receipt'),
        );
        return {
          usableBytes: measured.usableBytes,
          allocationUnitBytes: measured.allocationUnitBytes,
          usedBytes: measured.usedBytes,
          totalInodes: measured.totalInodes,
          usedInodes: measured.usedInodes,
        };
      };
      ports.measureRegistry = async (enrollment) => {
        const receipt =
          enrollment.registryPath === storage ? 'registry.receipt' : 'recovery.receipt';
        const measured = await measureVerifiedFilesystem(
          enrollment.registryPath,
          join(fixtureRoot, receipt),
        );
        const root = await statfs('/');
        return {
          maximumBytes: measured.maximumBytes,
          usableBytes: measured.usableBytes,
          usedBytes: measured.usedBytes,
          totalInodes: measured.totalInodes,
          usedInodes: measured.usedInodes,
          rootFreeBytes: root.bavail * root.bsize,
        };
      };
      const filler = await open(join(dirname(storage), 'owned-fill'), 'wx');
      try {
        for (let written = 0; written < maximumBytes; written += 4096)
          await filler.write(Buffer.alloc(4096, 19));
        throw new Error('Owned registry did not reach native ENOSPC');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
      } finally {
        await filler.close();
      }
      let full = false;
      const acknowledgement = join(storage, 'owned-readonly-ack');
      try {
        await writeFile(acknowledgement, Buffer.alloc(4096, 1));
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOSPC')) throw cause;
        full = true;
      }
      await unlink(acknowledgement);
      requireProof(full, 'Full native registry unexpectedly wrote derived acknowledgement');
      ports.permit = {
        isFresh: () => Promise.resolve(false),
        prepare: () => Promise.resolve(),
        publish: () => Promise.resolve(),
        revoke: () => Promise.resolve(),
        confirmReadonly: () =>
          Promise.reject(new Error('Native ENOSPC acknowledgement must not be required')),
      };
    }
    await executeRegistryCommand(journalPath, { command: 'upgrade-maintenance' }, ports);
    await stop();
    const environment = {
      RESTIC_REPOSITORY: join(directory, 'backup'),
      RESTIC_PASSWORD: 'owned-disposable-fixture',
    };
    if (
      hash(await readFile(restic)) !==
      '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639'
    )
      throw new Error('Native restic binary differs from pin');
    const initialized = Bun.spawn([restic, 'init'], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdout: log.fd,
      stderr: log.fd,
    });
    if ((await initialized.exited) !== 0) throw new Error('Owned restic initialization failed');
    const store = createRegistryBackupStore({
      effects: modelRegistryBackupEffects(),
      sourceLimits: {
        registry: {
          maximumLogicalBytes: 1125899906842624,
          maximumEntries: 1000000,
          maximumDepth: 128,
          maximumMetadataBytes: 268435456,
          maximumFanout: 1000000,
        },
        journal: {
          maximumLogicalBytes: 1125899906842624,
          maximumEntries: 1000000,
          maximumDepth: 128,
          maximumMetadataBytes: 268435456,
          maximumFanout: 1000000,
        },
      },
      signal: new AbortController().signal,
      binary: restic,
      binarySha256: '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
      environment,
      admit: () => Promise.resolve(),
    });
    const identity = {
      registryId: 'native',
      storageId: originalStorageId,
      node: 'owned-local',
      pvcUid: 'fixture-no-pvc',
      mountIdentity: storage,
      distributionDigest,
      binarySha256: expectedBinary,
    };
    const service = { restored: false };
    const runtime: RegistryMaintenanceRuntime = {
      inspect: () =>
        Promise.resolve(JSON.stringify({ native: true, prior: 'stopped', fixture: directory })),
      fence: () =>
        Promise.resolve(
          JSON.stringify({ native: true, prior: 'stopped', barrier: 'fixture-observation' }),
        ),
      assertStopped: () =>
        child === undefined
          ? Promise.resolve()
          : Promise.reject(new Error('Owned fixture registry still alive')),
      identify: (authority) =>
        Promise.resolve({
          ...identity,
          storageId: authority.read().enrollment.storageId,
          mountIdentity: authority.read().enrollment.registryPath,
        }),
      open: async (authority, mode) => {
        const original = await readFile(configuration, 'utf8');
        await writeFile(
          configuration,
          original.replace(
            `rootdirectory: ${storage}`,
            `rootdirectory: ${authority.read().enrollment.registryPath}`,
          ),
        );
        await start(mode);
        return {
          endpoint,
          close: async () => {
            await stop();
            await writeFile(configuration, original);
          },
        };
      },
      discardUploads: async (session) => {
        const state = session.read();
        if (unlinkFault) {
          if (process.getuid?.() === 0 || partialProof === undefined)
            throw new Error('Partial unlink proof needs owned unprivileged fixture');
          failedUploadDirectory = join(
            base,
            'repositories/partial/third/_uploads',
            partialProof.uploadId,
            'hashstates/sha256',
          );
          await chmod(failedUploadDirectory, 0o500);
        }
        return discardRegistryUploads(
          state,
          new AbortController().signal,
          Date.parse((ports.now ?? (() => new Date().toISOString()))()),
        );
      },
      collect: async () => {
        if (failAfterSecondReceipt)
          throw new Error('Owned second retirement failure after durable receipt');
        const collector = Bun.spawn(
          [binary, 'garbage-collect', ...(unsafe ? ['--delete-untagged'] : []), configuration],
          { stdout: log.fd, stderr: log.fd },
        );
        if ((await collector.exited) !== 0)
          throw new Error('Pinned native garbage collection failed');
      },
      verifyImages: settleRegistryClientFixture,
      restoreService: () => {
        service.restored = true;
        return Promise.resolve();
      },
    };
    let partialProof: Awaited<ReturnType<typeof publishPartialRegistryFixture>> | undefined;
    if (partial) {
      await maintainRegistry({
        directory: journalPath,
        operationId: 'native-baseline',
        owner: 'owner',
        kind: 'backup',
        ports,
        runtime,
        backup: store,
      });
      const baseline = (await executeRegistryCommand(journalPath, { command: 'read' }, ports))
        .state;
      await executeRegistryCommand(
        journalPath,
        {
          command: 'reopen',
          expectedRevision: baseline.revision,
          operationId: 'native-reopen',
          owner: 'owner',
        },
        ports,
      );
      service.restored = false;
      await start();
      partialProof = await publishPartialRegistryFixture({
        owner: 'owner',
        directory,
        journalPath,
        endpoint,
        identity,
        ports,
      });
      const clock = partialProof.now;
      ports.now = () => clock;
      checks += partialProof.checks;
      await stop();
    }
    let failure: unknown;
    try {
      await maintainRegistry({
        directory: journalPath,
        operationId: activeOperation,
        owner: 'owner',
        kind: 'retirement',
        ports,
        runtime,
        backup: store,
      });
    } catch (cause) {
      failure = cause;
    }
    if (repeat && failure === undefined) {
      const first = (await executeRegistryCommand(journalPath, { command: 'read' }, ports)).state;
      requireProof(
        first.schemaVersion === 4 &&
          first.retirements.length === 1 &&
          first.retirements.at(0)?.operations.includes('old') === true,
        'First partial retirement did not retain exact provenance',
      );
      await executeRegistryCommand(
        journalPath,
        {
          command: 'release-protection',
          operationId: 'pin',
          owner: 'owner',
          token: '00000000-0000-4000-8000-000000000001',
          expectedRevision: first.revision,
          reconciled: true,
        },
        ports,
      );
      activeOperation = 'native-retire-again';
      service.restored = false;
      failAfterSecondReceipt = true;
      try {
        await maintainRegistry({
          directory: journalPath,
          operationId: activeOperation,
          owner: 'owner',
          kind: 'retirement',
          ports,
          runtime,
          backup: store,
        });
      } catch (cause) {
        failure = cause;
      }
    }
    const completed = (await executeRegistryCommand(journalPath, { command: 'read' }, ports)).state;
    requireProof(completed.fenced, 'Native lifecycle did not retain durable fence');
    if (unsafe || unlinkFault || repeat) {
      requireProof(
        failure instanceof Error &&
          (unlinkFault
            ? /EACCES|permission denied/.test(failure.message)
            : repeat
              ? failure.message.includes('second retirement failure after durable receipt')
              : /Missing|Unknown|required|revision|manifest/i.test(failure.message)),
        'Unsafe GC did not fail retained census',
      );
      requireProof(
        !service.restored && completed.maintenance?.phase === 'failed',
        'Unsafe GC restored service',
      );
      if (unlinkFault) {
        if (failedUploadDirectory === undefined || partialProof === undefined)
          throw new Error('Missing exact fault directory');
        requireProof(
          !(await Bun.file(join(dirname(dirname(failedUploadDirectory)), 'data')).exists()) &&
            (await Bun.file(join(failedUploadDirectory, '0')).exists()),
          'Unlink fault did not occur after first actual file removal',
        );
        requireProof(
          completed.schemaVersion === 4 && completed.retirements.length === 0,
          'Partial unlink invented completed retirement',
        );
        await chmod(failedUploadDirectory, 0o755);
        failedUploadDirectory = undefined;
      }
      const registryTarget =
        fixtureRoot === undefined
          ? join(directory, 'restored-registry')
          : join(fixtureRoot, 'recovery/contents');
      const journalTarget =
        fixtureRoot === undefined
          ? join(directory, 'staged-journal')
          : join(fixtureRoot, 'staged/contents');
      if (fixtureRoot === undefined) {
        await mkdir(registryTarget);
        await mkdir(journalTarget);
      }
      const recoveredMount =
        fixtureRoot === undefined
          ? undefined
          : await measureVerifiedFilesystem(registryTarget, join(fixtureRoot, 'recovery.receipt'));
      const stagedMount =
        fixtureRoot === undefined
          ? undefined
          : await measureVerifiedFilesystem(journalTarget, join(fixtureRoot, 'staged.receipt'));
      const recoveredStorageId = recoveredMount?.identity ?? 'new-owned';
      const stagedStorageId = stagedMount?.identity ?? 'staged-owned';
      const recovery = createRegistryRecoveryVerifier({
        backup: store,
        consumers: ports,
        measure:
          fixtureRoot !== undefined
            ? undefined
            : (path) =>
                Promise.resolve({
                  device: path === registryTarget ? 1 : path === journalTarget ? 2 : 3,
                  identity:
                    path === registryTarget
                      ? 'new-owned'
                      : path === journalTarget
                        ? 'staged-owned'
                        : 'canonical-owned',
                  maximumBytes: path === registryTarget ? 256 * 1024 ** 2 : 1024 ** 2,
                  allocationUnitBytes: 4096,
                  usableBytes: 1024 ** 2,
                  usedBytes: 10000,
                  availableBytes: 1024 ** 2 - 10000,
                  reservedBytes: 0,
                  totalInodes: 10000,
                  usedInodes: 10,
                }),
        runtime: {
          verifyImages: (authority, inventory) =>
            settleRegistryClientFixture(authority, inventory, 'recovery'),
          assertStopped: (authority) => runtime.assertStopped(authority),
          audit: (authority) => {
            const current = authority.read();
            const backup = current.maintenanceEvidence?.backup;
            if (backup === null || backup === undefined)
              throw new Error('Missing native recovery backup');
            return Promise.resolve({
              registryIdentityReceipt:
                fixtureRoot === undefined
                  ? 'native-substitute'
                  : join(fixtureRoot, 'recovery.receipt'),
              stagedJournalIdentityReceipt:
                fixtureRoot === undefined
                  ? 'native-substitute'
                  : join(fixtureRoot, 'staged.receipt'),
              canonicalJournalIdentityReceipt:
                fixtureRoot === undefined
                  ? 'native-substitute'
                  : join(fixtureRoot, 'journal.receipt'),
              target: {
                state: 'prepared',
                operationId: activeOperation,
                snapshotId: backup.snapshotId,
                previousStorageId: originalStorageId,
                previousRegistryPath: storage,
                storageId: recoveredStorageId,
                registryPath: registryTarget,
                maximumBytes,
                canonicalJournalPath: journalPath,
                stagedJournalPath: journalTarget,
                stagedJournalStorageId: stagedStorageId,
                stagedJournalMaximumBytes: journalMaximumBytes,
                node: 'owned-local',
                pvcUid: 'fixture-recovery-no-pvc',
                mountIdentity: registryTarget,
                distributionDigest,
                binarySha256: expectedBinary,
                preparedAt: new Date().toISOString(),
              },
            });
          },
          open: async () => {
            const original = await readFile(configuration, 'utf8');
            await writeFile(
              configuration,
              original.replace(`rootdirectory: ${storage}`, `rootdirectory: ${registryTarget}`),
            );
            await start('readonly');
            return {
              endpoint,
              close: async () => {
                await stop();
                await writeFile(configuration, original);
              },
            };
          },
        },
      });
      await stageRegistryRecovery({
        directory: journalPath,
        operationId: activeOperation,
        owner: 'owner',
        kind: 'retirement',
        ports: { ...ports, ...recovery },
        runtime,
        backup: store,
      });
      const recovered = (await executeRegistryCommand(journalPath, { command: 'read' }, ports))
        .state;
      requireProof(
        recovered.enrollment.registryPath === registryTarget &&
          recovered.enrollment.storageId === recoveredStorageId,
        'Verified recovery did not rebind exact new store',
      );
      requireProof(
        recovered.schemaVersion === 4 &&
          recovered.retirements.length === (repeat ? 1 : 0) &&
          (!repeat || recovered.retirements[0]?.operationId === 'native-retire'),
        'Restore did not clear only this snapshot retirement lineage',
      );
      requireProof(
        JSON.stringify(recovered.protections) === JSON.stringify(completed.protections) &&
          JSON.stringify(recovered.bundles) === JSON.stringify(completed.bundles),
        'Recovery lost current protection or historical bundle',
      );
      requireProof(
        (await Bun.file(join(journalTarget, 'journal.json')).exists()) &&
          (await Bun.file(
            join(
              repeat ? registryTarget : storage,
              'docker/registry/v2/repositories/proof/image/_manifests/revisions/sha256',
              index.digest.slice(7),
              'link',
            ),
          ).exists()),
        'Recovery lost staged journal or original store',
      );
      requireProof(
        !service.restored && recovered.fenced && recovered.maintenance?.phase === 'restored',
        'Recovery handoff unexpectedly served',
      );
      if (partialProof !== undefined && !repeat) {
        const restoredUpload = await readRegistryUpload(
          recovered,
          'partial/third',
          partialProof.uploadId,
        );
        const plan = type({ retireUploads: type({ files: 'unknown' }).array() }).assert(
          JSON.parse(
            completed.schemaVersion === 4
              ? (completed.maintenanceEvidence?.plan ?? 'null')
              : 'null',
          ),
        );
        requireProof(
          JSON.stringify(restoredUpload.files) === JSON.stringify(plan.retireUploads[0]?.files),
          'Backup restore lost exact staged files after destructive failure',
        );
        requireProof(
          await Bun.file(
            join(
              registryTarget,
              'docker/registry/v2/blobs/sha256',
              partialProof.orphan.slice(7, 9),
              partialProof.orphan.slice(7),
              'data',
            ),
          ).exists(),
          'Backup restore lost owned orphan content',
        );
      }
      if (repeat && partialProof !== undefined) {
        requireProof(
          !(await Bun.file(
            join(
              registryTarget,
              'docker/registry/v2/repositories/partial/third/_uploads',
              partialProof.uploadId,
              'data',
            ),
          ).exists()) &&
            !(await Bun.file(
              join(
                registryTarget,
                'docker/registry/v2/blobs/sha256',
                partialProof.orphan.slice(7, 9),
                partialProof.orphan.slice(7),
                'data',
              ),
            ).exists()),
          'Later restore resurrected earlier retired staging/orphan',
        );
        requireProof(
          completed.schemaVersion === 4 &&
            completed.retirements.length === 2 &&
            completed.retirements.at(1)?.operations.includes('old') === true,
          'Remaining old bundle content did not receive a second exact receipt',
        );
      }
      let refused: unknown;
      try {
        await completeRegistryRecovery({
          directory: journalPath,
          operationId: activeOperation,
          owner: 'owner',
          kind: 'retirement',
          ports,
          runtime,
          backup: store,
          assertDesired: () =>
            Promise.reject(new Error('Desired storage still references old PVC')),
        });
      } catch (cause) {
        refused = cause;
      }
      requireProof(
        refused instanceof Error && refused.message.includes('old PVC') && !service.restored,
        'Mismatched desired storage activated recovery',
      );
      await completeRegistryRecovery({
        directory: journalPath,
        operationId: activeOperation,
        owner: 'owner',
        kind: 'retirement',
        ports,
        runtime,
        backup: store,
        assertDesired: () => Promise.resolve(),
      });
      const activated = (await executeRegistryCommand(journalPath, { command: 'read' }, ports))
        .state;
      requireProof(
        activated.maintenance === null && activated.fenced && service.restored,
        'Verified fixture continuation did not complete fenced',
      );
    } else {
      if (failure !== undefined) throw new Error('Native lifecycle failed', { cause: failure });
      requireProof(
        service.restored && completed.maintenance === null,
        'Verified native lifecycle did not complete',
      );
      requireProof(
        completed.schemaVersion === 4 && completed.retirements.length === 1,
        'Missing exact retirement receipt',
      );
      requireProof(
        completed.bundles.length === (partial ? 2 : 1) &&
          JSON.stringify(completed.bundles[0]) === JSON.stringify(journal.bundles[0]) &&
          (!partial || completed.bundles[1]?.operationId === partialProof?.operationId),
        'Retirement erased historical bundle',
      );
      requireProof(
        await Bun.file(
          join(
            base,
            'repositories/proof/image/_manifests/revisions/sha256',
            childManifest.digest.slice(7),
            'link',
          ),
        ).exists(),
        'Untagged retained child was removed',
      );
      requireProof(
        !(await Bun.file(
          join(
            base,
            'blobs/sha256',
            obsoleteLayer.digest.slice(7, 9),
            obsoleteLayer.digest.slice(7),
            'data',
          ),
        ).exists()),
        'Obsolete native blob not collected',
      );
      await start('readonly');
      const fresh = await collectRegistryInventory({
        journal: completed,
        identity,
        endpoint,
        consumers: ports,
      });
      requireProof(
        fresh.revisions.length === 2,
        'Repeated post-retirement census changed exact retained revisions',
      );
      const catalog = await request('/v2/_catalog');
      requireProof(
        JSON.stringify(await catalog.json()) ===
          JSON.stringify({
            repositories: partial
              ? ['other/image', 'partial/one', 'partial/third', 'partial/two', 'proof/image']
              : ['other/image', 'proof/image'],
          }),
        'Unexpected native catalog after last other/image deletion',
      );
      const tags = await request('/v2/other/image/tags/list');
      requireProof(
        JSON.stringify(await tags.json()) === JSON.stringify({ name: 'other/image', tags: null }),
        'Unexpected native empty-repository tags response',
      );
      await stop();
    }
    console.log(
      JSON.stringify({
        checks,
        unsafe,
        partial,
        unlinkFault,
        repeat,
        ...(await checkBounds()),
        directory,
        scope:
          fixtureRoot === undefined
            ? 'native Distribution/restic/authority lifecycle; source/capacity/runtime ports are fixture substitutions'
            : 'native Distribution/restic/authority/ext4/ENOSPC/recovery; source/runtime/desired observations are fixture substitutions',
      }),
    );
  } finally {
    if (child !== undefined) await stop();
    if (failedUploadDirectory !== undefined) await chmod(failedUploadDirectory, 0o755);
    await log.close();
    await checkBounds();
    await rm(directory, { recursive: true });
    console.log(`Native lifecycle cleanup: ${directory}`);
  }
}
const binary = process.argv.at(2);
const restic = process.argv.at(3);
const mode = process.argv.at(4);
if (
  binary === undefined ||
  restic === undefined ||
  !['normal', 'unsafe', 'partial', 'partial-unsafe', 'partial-unlink', 'partial-repeat'].includes(
    mode ?? '',
  )
)
  throw new Error('Usage: native <pinned-registry> <pinned-restic> normal|unsafe');
await proveLifecycle(
  binary,
  restic,
  mode === 'unsafe' || mode === 'partial-unsafe',
  process.argv.at(5),
  mode === 'partial' ||
    mode === 'partial-unsafe' ||
    mode === 'partial-unlink' ||
    mode === 'partial-repeat',
  mode === 'partial-unlink',
  mode === 'partial-repeat',
);

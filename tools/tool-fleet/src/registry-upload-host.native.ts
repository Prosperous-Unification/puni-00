import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { measureVerifiedFilesystem } from './registry-capacity';
import { RegistryDeletionPublication } from './registry-deletion.fixture';
import { completeRegistryFixture } from './registry-fixture-completion.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { prepareRegistryIndexReaders } from './registry-index-authority.fixture';
import { parseRegistryCommandResponse } from './registry-journal';
import { startRegistryFixtureGuard } from './registry-maintenance-guard.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import { prepareRegistryPressureEpoch } from './registry-pressure-epoch.fixture';
import { startRegistryPressureBridge } from './registry-pressure-socket.fixture';
import { startRegistryPressureWriter } from './registry-pressure-writer.fixture';
import { readRegistryBytes } from './registry-stream';
import { requireRegistryUploadFailureMessage } from './registry-upload-error.fixture';
import {
  createRegistryUploadPressure,
  registryPressureUploadConfig,
} from './registry-upload-pressure.fixture';
import { fillRegistryFixtureVolume } from './registry-volume-pressure.fixture';

/**
 * Additional owned upload/restart scenario in the exact prove-volume-full PID1 route.
 * Actual managed publication records its UUID before the proxy fills the bounded registry
 * filesystem and forwards its first config body to actual Distribution. The independent
 * journal must retain failed ownership and its fence. A fresh ordinary startup guard must
 * refuse writes and serve the protected closure while the filler remains. Kubernetes/readers/
 * bootstrap provider are modeled by the existing fixture; no ACK is fabricated or required
 * to succeed under ENOSPC. Unresolved publication is never cleared to start maintenance.
 */
export async function proveRegistryUploadPressureHost(
  run: (mode: string) => Promise<{ code: number; stdout: string; stderr: string }>,
): Promise<void> {
  let stage = 'setup';
  let bridge: Awaited<ReturnType<typeof startRegistryPressureBridge>> | undefined;
  let guard: Awaited<ReturnType<typeof startRegistryFixtureGuard>> | undefined;
  let writer: Awaited<ReturnType<typeof startRegistryPressureWriter>> | undefined;
  let server: ReturnType<typeof Bun.serve> | undefined;
  const pending = new Set<Promise<Response>>();
  let proxyFailure: { cause: unknown } | undefined;
  try {
    const proof = await completeRegistryFixture(async () => {
      const { installed } = await prepareRegistryHostFixture();
      await prepareRegistryIndexReaders(installed);
      await writeFile('/root/task8-fixture/admission', 'fixture', { mode: 0o600 });
      bridge = await startRegistryPressureBridge(installed, () =>
        Promise.reject(new Error('Upload bootstrap must not probe ACK')),
      );
      const invoke = async (mode: string, expected: string) => {
        const completed = await run(mode);
        if (completed.code !== 0 || completed.stdout.trim() !== expected)
          throw new Error('Upload pressure bootstrap owner failed');
      };
      stage = 'bootstrap';
      await invoke('initialize', 'initialized');
      await invoke('backup', 'verified-native-backup');
      await writeFile(
        '/etc/puni/ordinary-writer.json',
        JSON.stringify({
          version: 0.1,
          log: { level: 'error' },
          storage: {
            filesystem: { rootdirectory: installed.ordinary.path },
            delete: { enabled: false },
            maintenance: { uploadpurging: { enabled: false } },
          },
          http: { addr: '127.0.0.1:5052', secret: 'owned-upload-seed' },
        }),
        { mode: 0o644, flag: 'wx' },
      );
      stage = 'protected-seed';
      guard = await startRegistryFixtureGuard(installed, {
        signal: new AbortController().signal,
        initialMode: 'readonly',
        interceptPermissionReads: false,
      });
      await invoke('index-reopen', 'population-writable-permitted');
      await guard.waitMode('writable');
      const seeded = await run('deletion-publish-protected');
      if (seeded.code !== 0) throw new Error('Upload pressure seed publication failed');
      const publication = RegistryDeletionPublication.assert(JSON.parse(seeded.stdout));
      if (
        publication.kind !== 'protected' ||
        publication.repository !== 'retained/index' ||
        publication.manifests.length !== 3 ||
        publication.blobs.length !== 4 ||
        !publication.manifests.includes(publication.root)
      )
        throw new Error('Upload pressure seed is not the protected index closure');
      await writeFile('/etc/puni/registry-deletion-protected.json', JSON.stringify(publication), {
        mode: 0o644,
        flag: 'wx',
      });
      await invoke('deletion-protect', 'index-explicitly-protected');
      await guard.close();
      guard = undefined;
      const readCanonical = async () => {
        const bytes = await readFile(join(installed.journalPath, 'journal.json'), 'utf8');
        const encoded: unknown = JSON.parse(bytes);
        return { bytes, state: parseRegistryCommandResponse({ state: encoded }).state };
      };
      const before = (await readCanonical()).state;
      if (
        before.schemaVersion !== 4 ||
        before.fenced ||
        before.publication !== null ||
        before.maintenance !== null ||
        !before.protections.some((protection) => protection.roots.includes(publication.root))
      )
        throw new Error('Upload pressure seed lacks settled protected ownership');
      stage = 'writer';
      const currentWriter = await startRegistryPressureWriter(installed);
      writer = currentWriter;
      await prepareRegistryPressureEpoch(installed, currentWriter);
      const config = Buffer.from(registryPressureUploadConfig);
      const configDigest = 'sha256:' + createHash('sha256').update(config).digest('hex');
      let selected: { operationId: string; uploadId: string } | undefined;
      let filler: Awaited<ReturnType<typeof fillRegistryFixtureVolume>> | undefined;
      const proxy = createRegistryUploadPressure(
        { digest: configDigest, size: config.length },
        async () => {
          const state = (await readCanonical()).state;
          if (
            state.schemaVersion !== 4 ||
            state.fenced ||
            state.publication?.phase !== 'uploading' ||
            state.reservations.length !== 1 ||
            state.reservations[0]?.operationId !== state.publication.operationId
          )
            throw new Error('Upload filler lacks current admitted publication');
          const evidence = state.publicationEvidence.find(
            (record) => record.operationId === state.publication?.operationId,
          );
          const writes = evidence?.writes.filter(
            (write) =>
              write.repository === 'pressure/full' &&
              write.digest === configDigest &&
              write.phase === 'writing',
          );
          const write = writes?.at(0);
          if (
            writes?.length !== 1 ||
            write?.uploadId === null ||
            write?.uploadId === undefined ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              write.uploadId,
            )
          )
            throw new Error('Upload filler precedes durable UUID ownership');
          await currentWriter.assertLive();
          selected = { operationId: state.publication.operationId, uploadId: write.uploadId };
          filler = await fillRegistryFixtureVolume(installed);
        },
        async (incoming) => {
          const url = new URL(incoming.url);
          const target = new URL(url.pathname + url.search, 'http://127.0.0.1:5051');
          const response = await fetch(target, {
            method: incoming.method,
            headers: incoming.headers,
            signal: incoming.signal,
            ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: incoming.body }),
          });
          const headers = new Headers(response.headers);
          const location = headers.get('location');
          if (location !== null) {
            const continuation = new URL(location, target);
            headers.set(
              'location',
              new URL(continuation.pathname + continuation.search, incoming.url).href,
            );
          }
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        },
      );
      server = Bun.serve({
        hostname: '127.0.0.1',
        port: 5052,
        fetch(incoming) {
          const response = proxy.fetch(incoming);
          pending.add(response);
          void response.then(
            () => pending.delete(response),
            (cause: unknown) => {
              pending.delete(response);
              proxyFailure ??= { cause };
            },
          );
          return response;
        },
        error: () => new Response('owned upload proxy refused', { status: 503 }),
      });
      stage = 'managed-upload';
      const published = await run('pressure-upload');
      if (published.code !== 1 || published.stdout.trim() !== '')
        throw new Error('Managed upload did not retain a failed command outcome');
      console.log(JSON.stringify({ uploadPressureResponse: proxy.observeResponse() }));
      const upload = proxy.verify();
      if (selected === undefined || filler === undefined)
        throw new Error('Managed upload lacks selected ownership or retained filler');
      const selection = selected;
      const failedRead = await readCanonical();
      const failed = failedRead.state;
      if (
        failed.schemaVersion !== 4 ||
        !failed.fenced ||
        failed.fenceReason !== 'publication-failed' ||
        failed.revision <= before.revision ||
        failed.publication?.operationId !== selection.operationId ||
        failed.publication.phase !== 'failed' ||
        failed.publication.failure === undefined ||
        failed.maintenance !== null ||
        failed.reservations.length !== 1 ||
        failed.reservations[0]?.operationId !== selection.operationId
      )
        throw new Error('Upload failure lost durable journal ownership or fence');
      const storageFailure = requireRegistryUploadFailureMessage(
        failed.publication.failure,
        selection.uploadId,
      );
      const bundle = failed.bundles.find(
        (candidate) => candidate.operationId === selection.operationId,
      );
      const evidence = failed.publicationEvidence.find(
        (record) => record.operationId === selection.operationId,
      );
      if (
        bundle?.receipt.state !== 'unfinished' ||
        !evidence?.writes.some(
          (write) =>
            write.digest === configDigest &&
            write.uploadId === selection.uploadId &&
            write.phase === 'writing',
        ) ||
        JSON.stringify(failed.protections) !== JSON.stringify(before.protections) ||
        before.bundles.some(
          (kept) =>
            JSON.stringify(
              failed.bundles.find((current) => current.operationId === kept.operationId),
            ) !== JSON.stringify(kept),
        )
      )
        throw new Error('Upload failure changed current protection or publisher evidence');
      await server.stop(true);
      server = undefined;
      if (pending.size !== 0 || proxyFailure !== undefined)
        throw new Error('Upload proxy has unfinished or failed requests');
      const stopped = await currentWriter.close();
      writer = undefined;
      stage = 'ordinary-restart';
      guard = await startRegistryFixtureGuard(installed, {
        signal: new AbortController().signal,
        initialMode: 'readonly',
        interceptPermissionReads: false,
      });
      const refused = await fetch('http://127.0.0.1:5052/v2/pressure/full/blobs/uploads/', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      await readRegistryBytes(refused.body, 4096, 'Restart upload refusal');
      if (refused.status !== 405) throw new Error('Restarted ordinary guard accepted a write');
      const references = [
        ...publication.manifests.map((digest) => ({ digest, kind: 'manifests' })),
        ...publication.blobs.map((digest) => ({ digest, kind: 'blobs' })),
      ];
      for (const reference of references) {
        const response = await fetch(
          'http://127.0.0.1:5052/v2/retained/index/' + reference.kind + '/' + reference.digest,
          {
            headers: {
              accept:
                'application/vnd.oci.image.index.v1+json,application/vnd.oci.image.manifest.v1+json',
              'cache-control': 'no-cache',
            },
            signal: AbortSignal.timeout(5000),
          },
        );
        const bytes = await readRegistryBytes(
          response.body,
          1024 * 1024,
          'Restart protected content',
        );
        if (
          response.status !== 200 ||
          'sha256:' + createHash('sha256').update(bytes).digest('hex') !== reference.digest
        )
          throw new Error('Restarted guard lost protected content');
      }
      const observed = await readCanonical();
      if (observed.bytes !== failedRead.bytes)
        throw new Error('Ordinary restart changed the durable failure journal');
      const named = await lstat('/var/lib/puni-registry/registry/task8-full-volume.fill');
      if (
        !named.isFile() ||
        named.dev !== filler.device ||
        named.ino !== filler.inode ||
        named.size !== filler.bytes
      )
        throw new Error('Upload pressure filler changed before restart verification');
      const capacity = await measureVerifiedFilesystem(
        installed.ordinary.path,
        installed.ordinary.identityReceipt,
      );
      if (
        capacity.identity !== installed.ordinary.storageId ||
        capacity.maximumBytes !== installed.ordinary.maximumBytes ||
        capacity.availableBytes > capacity.maximumBytes / 10
      )
        throw new Error('Upload restart no longer retains capacity pressure');
      return {
        proof: 'owned-managed-upload-enospc',
        upload,
        filler,
        stopped,
        failedPublication: {
          operationId: selection.operationId,
          uploadId: selection.uploadId,
          reservationRetained: true,
          unfinishedBundle: true,
        },
        storageFailure,
        independentJournalFailureDurable: true,
        actualOrdinaryRestartReadonly: true,
        restartedWriteStatus: refused.status,
        protectedReads: references.length,
        journalUnchangedAfterRestart: true,
        availableBytesAfterRestart: capacity.availableBytes,
        servingActivationPending: true,
      };
    }, [
      async () => {
        if (server !== undefined) await server.stop(true);
        const completions = await Promise.allSettled([...pending]);
        const failures = completions.flatMap((completion): unknown[] => {
          if (completion.status !== 'rejected') return [];
          const cause: unknown = completion.reason;
          return [cause];
        });
        if (proxyFailure !== undefined) failures.unshift(proxyFailure.cause);
        if (failures.length > 0) throw new AggregateError(failures, 'Upload proxy cleanup failed');
      },
      async () => {
        if (writer !== undefined) await writer.close();
      },
      async () => {
        if (guard !== undefined) await guard.close();
      },
      async () => {
        if (bridge !== undefined) await bridge.close();
      },
    ]);
    console.log(JSON.stringify(proof));
  } catch (cause) {
    // Proof (actual whole controller): the aggregate bootstrap case observed wrapper frame703instead of primary901before this one-level selection; the thrown failure stays identical.
    const observationCause = cause instanceof AggregateError ? cause.cause : cause;
    try {
      console.log(
        JSON.stringify({
          uploadPressureFailure: {
            stage,
            observation: describeRegistryGuardObservationFailure(observationCause),
          },
        }),
      );
    } catch (reporting) {
      throw new AggregateError([cause, reporting], 'Upload pressure and reporting failed', {
        cause: reporting,
      });
    }
    throw cause;
  }
}

import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type RegistryEndpoint, uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import {
  collectRegistryInventory,
  planRegistryRetirement,
  type RegistryInventoryIdentity,
} from './registry-inventory';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-managed-journal';
import {
  recordRegistryPartialFailure,
  type RegistryPartialObservation,
} from './registry-population-diagnostics.fixture';
import { publishArtifacts } from './registry-publication';

/** Native payload helper: actual shared producer, journal and Distribution. A loopback proxy converts the third tier's final blob PUT into a partial PATCH then returns 503; no successful release is fabricated. Retention time is an explicitly advanced fixture server clock, not elapsed seven days. */
export async function publishPartialRegistryFixture(input: {
  directory: string;
  owner: string;
  journalPath: string;
  endpoint: RegistryEndpoint;
  identity: RegistryInventoryIdentity;
  ports: RegistryJournalPorts;
}): Promise<{
  now: string;
  operationId: string;
  uploadId: string;
  orphan: string;
  staging: string;
  checks: number;
}> {
  const hash = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const artifacts: RegistryArtifact[] = [];
  for (const tier of ['one', 'two', 'third']) {
    const contents: RegistryArtifact['contents'][number][] = [];
    for (const [name, text, mediaType] of [
      [
        'config',
        tier === 'third' ? '{"partial":true}' : '{}',
        'application/vnd.oci.image.config.v1+json',
      ],
      [
        'layer',
        tier === 'third' ? 'incomplete-third-tier-layer' : 'shared fixture layer',
        'application/vnd.oci.image.layer.v1.tar',
      ],
    ]) {
      const bytes = Buffer.from(text);
      const path = join(input.directory, `${tier}-${name}`);
      await writeFile(path, bytes);
      contents.push({
        digest: hash(bytes),
        size: bytes.length,
        mediaType,
        dependencies: [],
        isManifest: false,
        path,
        offset: 0,
      });
    }
    // Boundary: unchecked array-index typing does not replace the required config/layer presence checks.
    const [config, layer] = contents as readonly (
      RegistryArtifact['contents'][number] | undefined
    )[];
    if (config === undefined || layer === undefined) throw new Error('Missing native content');
    const bytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: { digest: config.digest, size: config.size, mediaType: config.mediaType },
        layers: [{ digest: layer.digest, size: layer.size, mediaType: layer.mediaType }],
        annotations: { tier },
      }),
    );
    const path = join(input.directory, `${tier}-manifest`);
    await writeFile(path, bytes);
    contents.push({
      digest: hash(bytes),
      size: bytes.length,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      dependencies: [config.digest, layer.digest],
      isManifest: true,
      path,
      offset: 0,
    });
    artifacts.push({
      repository: `partial/${tier}`,
      reference: 'candidate',
      digest: hash(bytes),
      contents,
    });
  }
  const third = artifacts.at(2);
  const thirdLayer = third?.contents[1];
  const thirdConfig = third?.contents[0];
  if (third === undefined || thirdLayer === undefined || thirdConfig === undefined)
    throw new Error('Missing third tier');
  const observed: RegistryPartialObservation = {
    thirdLayerPut: false,
    patchAccepted: false,
    injected503: false,
    evidence: 'unobserved',
    stagingPhase: 'unobserved',
    uploadId: 'unobserved',
    storedManifests: 'unobserved',
  };
  const upstream = new URL(input.endpoint.url);
  const proxy = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const target = new URL(url.pathname + url.search, upstream);
      if (request.method === 'PUT' && url.searchParams.get('digest') === thirdLayer.digest) {
        observed.thirdLayerPut = true;
        const bytes = new Uint8Array(await request.arrayBuffer());
        target.searchParams.delete('digest');
        const staged = await fetch(target, {
          method: 'PATCH',
          headers: { 'content-type': 'application/octet-stream' },
          body: bytes.subarray(0, 7),
        });
        observed.patchAccepted = staged.status === 202;
        if (staged.status !== 202) throw new Error('Native staged PATCH failed');
        await staged.arrayBuffer();
        observed.injected503 = true;
        return new Response('owned injected third-tier failure', { status: 503 });
      }
      const response = await fetch(target, {
        method: request.method,
        headers: request.headers,
        ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: await request.arrayBuffer() }),
      });
      const headers = new Headers(response.headers);
      const location = headers.get('location');
      if (location !== null) {
        const continuation = new URL(location);
        const replacement = new URL(continuation.pathname + continuation.search, request.url);
        headers.set('location', replacement.href);
      }
      return new Response(response.body, { status: response.status, headers });
    },
  });
  const invoke = (request: unknown) =>
    executeRegistryCommand(input.journalPath, request, input.ports);
  try {
    let failure: unknown;
    try {
      await publishArtifacts(
        {
          registryId: input.identity.registryId,
          owner: input.owner,
          product: 'native-partial',
          requiredRepositories: artifacts.map((artifact) => artifact.repository),
        },
        artifacts,
        invoke,
        async (artifact, ownership) => {
          await uploadArtifact(
            { url: proxy.url.toString().replace(/\/$/, '') },
            artifact,
            ownership,
          );
        },
      );
    } catch (cause) {
      failure = cause;
    }
    if (!(failure instanceof Error) || !failure.message.includes('503'))
      throw new Error('Native three-tier publication did not fail at injected body', {
        cause: failure,
      });
    // The actual startup guard can restart Distribution read-only before acknowledging the failed publication. Wait only for HTTP readiness; never synthesize its acknowledgement.
    const readyDeadline = Date.now() + 10000;
    for (;;) {
      try {
        const response = await fetch(input.endpoint.url + '/v2/', {
          signal: AbortSignal.timeout(500),
        });
        await response.arrayBuffer();
        if (response.status !== 200)
          throw new Error('Unexpected partial fixture registry readiness');
        break;
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          !(
            ('code' in cause && cause.code === 'ECONNREFUSED') ||
            ['TimeoutError', 'AbortError'].includes(cause.name)
          ) ||
          Date.now() >= readyDeadline
        )
          throw cause;
        await Bun.sleep(20);
      }
    }
    const failed = (await invoke({ command: 'read' })).state;
    if (
      failed.schemaVersion !== 4 ||
      failed.publication?.phase !== 'failed' ||
      failed.reservations.length !== 1
    )
      throw new Error('Partial failure lost durable publisher ownership');
    const evidence = failed.publicationEvidence.find(
      (evidence) => evidence.operationId === failed.publication?.operationId,
    );
    const staging = evidence?.writes.find((write) => write.digest === thirdLayer.digest);
    observed.evidence = evidence === undefined ? 'absent' : 'present';
    observed.stagingPhase = staging === undefined ? 'absent' : staging.phase;
    observed.uploadId =
      staging?.uploadId === null || staging?.uploadId === undefined
        ? 'absent'
        : /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              staging.uploadId,
            )
          ? 'valid'
          : 'invalid';
    const count = evidence?.writes.filter(
      (write) => write.uploadId === null && write.phase === 'stored',
    ).length;
    observed.storedManifests =
      count === undefined
        ? 'unobserved'
        : count === 0 || count === 1 || count === 2 || count === 3
          ? count
          : 'overbound';
    if (
      evidence === undefined ||
      staging?.uploadId === null ||
      staging?.uploadId === undefined ||
      staging.phase !== 'writing' ||
      evidence.writes.filter((write) => write.uploadId === null && write.phase === 'stored')
        .length !== 2
    )
      throw new Error(
        'Partial fixture did not retain two completed tiers and exact staged third UUID',
      );
    const census = async () =>
      collectRegistryInventory({
        journal: (await invoke({ command: 'read' })).state,
        identity: input.identity,
        endpoint: input.endpoint,
        consumers: input.ports,
      });
    let unresolved: unknown;
    try {
      await census();
    } catch (cause) {
      unresolved = cause;
    }
    if (
      !(unresolved instanceof Error) ||
      !unresolved.message.includes('Unknown required repository revision')
    )
      throw new Error('Unresolved partial publication did not reach expected census refusal', {
        cause: unresolved,
      });
    await invoke({
      command: 'finish-publication',
      expectedRevision: failed.revision,
      operationId: failed.publication.operationId,
      owner: failed.publication.owner,
      token: failed.publication.token,
      outcome: 'abandoned',
      reconciled: true,
    });
    const inventory = await census();
    const capacity = await input.ports.measureRegistry(inventory.journal.enrollment);
    const observedAt = (input.ports.now ?? (() => new Date().toISOString()))();
    let young: unknown;
    try {
      planRegistryRetirement(inventory, {
        now: observedAt,
        mode: 'nightly',
        capacity,
      });
    } catch (cause) {
      young = cause;
    }
    if (!(young instanceof Error) || !young.message.includes('Unreleased'))
      throw new Error('Young partial publication authorized GC');
    const now = new Date(Date.parse(observedAt) + 8 * 24 * 60 * 60 * 1000).toISOString();
    const plan = planRegistryRetirement(inventory, { now, mode: 'nightly', capacity });
    if (
      !plan.retireBlobs.includes(thirdConfig.digest) ||
      plan.retireBlobs.includes(artifacts[0].contents[1].digest) ||
      plan.retireUploads.length !== 1 ||
      plan.neverUploaded.length !== 1
    )
      throw new Error('Eligible partial plan lost exact orphan/staging/shared retention');
    return {
      now,
      operationId: evidence.operationId,
      uploadId: staging.uploadId,
      orphan: thirdConfig.digest,
      staging: thirdLayer.digest,
      checks: 5,
    };
  } catch (cause) {
    recordRegistryPartialFailure(cause, observed);
    throw cause;
  } finally {
    await proxy.stop(true);
  }
}

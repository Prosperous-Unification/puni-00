import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type RegistryEndpoint, uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-journal';
import { publishArtifacts } from './registry-publication';
import { readRegistryBytes } from './registry-stream';
import { requireRegistryUploadEnospc } from './registry-upload-error.fixture';

interface UploadResponseObservation {
  status: number;
  bytes: number;
  hasEnospcText: boolean;
  hasErrno28Pattern: boolean;
}

/**
 * Intercept one exact owned managed blob body after its durable upload acknowledgement.
 * The caller's bounded allocator runs before that body reaches the actual Distribution
 * server. Other requests pass through the same forward port. A success witness requires
 * the real HTTP500 body to report ENOSPC; no response status or error is injected here.
 * The caller owns the loopback listener and independently verifies retained allocation,
 * journal durability, writer cleanup and restart fencing. Modeled ports are not physical
 * exhaustion evidence. Any request failure or second body invalidates the witness.
 */
export function createRegistryUploadPressure(
  content: Pick<RegistryArtifact['contents'][number], 'digest' | 'size'>,
  fill: () => Promise<void>,
  forward: (request: Request) => Promise<Response>,
) {
  let phase: 'idle' | 'reading' | 'allocating' | 'forwarding' | 'observed' = 'idle';
  let failure: { cause: unknown } | undefined;
  let responseObservation: UploadResponseObservation | undefined;
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        // Proof (actual handler, modeled upstream): omitted retained-fetch refusal forwards twice after the first exact upstream failure.
        if (failure !== undefined) throw failure.cause;
        const url = new URL(request.url);
        // Proof (actual Request routing): method/path omissions intercept the ordinary POST or foreign-repository PUT instead of forwarding it untouched.
        if (
          request.method !== 'PUT' ||
          !url.pathname.startsWith('/v2/pressure/full/blobs/uploads/')
        )
          return await forward(request);
        // Proof (actual concurrent requests): one-shot omission allocates twice; late reading-state consumption accepts a second body while the first stream is held.
        if (phase !== 'idle') throw new Error('Upload pressure body already selected');
        phase = 'reading';
        // Proof (actual handler): independent UUID/count/digest omissions allocate for malformed, duplicate or foreign upload continuations.
        const uploads = url.searchParams.getAll('digest');
        if (
          !/^\/v2\/pressure\/full\/blobs\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
            url.pathname,
          ) ||
          uploads.length !== 1 ||
          uploads[0] !== content.digest
        )
          throw new Error('Upload pressure body differs from selected content');
        // Proof (actual unfinished stream): increasing the bound needs the independent rescue instead of cancelling after the first overflowing chunk.
        const bytes = await readRegistryBytes(request.body, content.size, 'Pressure upload body');
        // Proof (actual body): size omission admits matching digest with a short body; digest omission admits changed bytes of the exact size.
        if (
          bytes.length !== content.size ||
          'sha256:' + createHash('sha256').update(bytes).digest('hex') !== content.digest
        )
          throw new Error('Upload pressure body differs from declared bytes');
        phase = 'allocating';
        // Proof (actual handler, modeled allocator): omission loses allocation; missing await forwards before the held allocation settles.
        await fill();
        phase = 'forwarding';
        // Proof (actual Request body): forwarding empty bytes fails the exact received-body assertion after allocation.
        const response = await forward(new Request(request, { body: Buffer.from(bytes) }));
        // Proof (actual unfinished response): increasing the response bound from4096to4097needs the independent rescue instead of cancellation at the declared bound.
        const diagnostic = await readRegistryBytes(response.body, 4096, 'Pressure upload failure');
        // Proof (actual handler, modeled upstream): seven source mutations fail named observation tests for omission/status/bytes/indicators/errno boundary and raw-body escape; these diagnostic facts never bypass typed failure validation.
        const responseText = new TextDecoder().decode(diagnostic);
        responseObservation = {
          status: response.status,
          bytes: diagnostic.byteLength,
          hasEnospcText: responseText.includes('no space left on device'),
          hasErrno28Pattern: /"Err"\s*:\s*28\s*[,}]/.test(responseText),
        };

        // Proof (actual HTTP handler): status removal admits201with valid filesystem detail; missing structured decoder admits an unrelated500failure.
        if (response.status !== 500)
          throw new Error('Actual registry response did not confirm upload ENOSPC');
        requireRegistryUploadEnospc(
          new TextDecoder().decode(diagnostic),
          url.pathname.slice('/v2/pressure/full/blobs/uploads/'.length),
        );
        // Proof (actual handler): omission leaves an incomplete witness after the expected forwarded failure.
        phase = 'observed';
        return new Response(Buffer.from(diagnostic), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (cause) {
        // Proof (actual rejection): omission loses the original allocator failure at verification.
        failure ??= { cause };
        throw cause;
      }
    },

    /** Fixed diagnostic facts only; an errno text pattern does not validate an error schema or authorize an exhaustion witness. No raw body or headers escape. */
    observeResponse() {
      return responseObservation === undefined
        ? { state: 'unobserved' as const }
        : { state: 'observed' as const, ...responseObservation };
    },
    verify() {
      // Proof (actual handler): omission accepts an earlier witness after a second body has invalidated it.
      if (failure !== undefined) throw failure.cause;
      // Proof (actual handler): omission certifies a plain POST without any selected body or allocation.
      if (phase !== 'observed') throw new Error('Upload pressure has no completed witness');
      return {
        status: 500 as const,
        bytes: content.size,
        allocationBeforeBody: true as const,
        enospc: true as const,
      };
    },
  };
}

/** Fixed config bytes identify the one first blob selected by the owned upload-exhaustion proxy. */
export const registryPressureUploadConfig = '{"task8":"full"}';

/** Write a complete small OCI closure in already-owned scratch; exclusive files prevent replacing prior content. The actual managed producer and uploader still verify/admit it before sending any blob body. */
export async function writeRegistryPressureUpload(directory: string): Promise<RegistryArtifact> {
  const describeContent = (
    name: string,
    bytes: Buffer,
    mediaType: string,
    isManifest: boolean,
    dependencies: string[],
  ) => ({
    descriptor: {
      digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
      size: bytes.length,
      mediaType,
      dependencies,
      isManifest,
      path: join(directory, 'pressure-' + name),
      offset: 0,
    },
    bytes,
  });
  const config = describeContent(
    'config',
    Buffer.from(registryPressureUploadConfig),
    'application/vnd.oci.image.config.v1+json',
    false,
    [],
  );
  const layer = describeContent(
    'layer',
    Buffer.from('owned upload pressure layer'),
    'application/vnd.oci.image.layer.v1.tar',
    false,
    [],
  );
  const manifest = describeContent(
    'manifest',
    Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {
          digest: config.descriptor.digest,
          size: config.descriptor.size,
          mediaType: config.descriptor.mediaType,
        },
        layers: [
          {
            digest: layer.descriptor.digest,
            size: layer.descriptor.size,
            mediaType: layer.descriptor.mediaType,
          },
        ],
      }),
    ),
    'application/vnd.oci.image.manifest.v1+json',
    true,
    [config.descriptor.digest, layer.descriptor.digest],
  );
  for (const content of [config, layer, manifest])
    // Proof (actual filesystem): replacing exclusive creation with overwrite fulfills the occupied-scratch operation and fails its required rejection; existing bytes are preserved only by wx.
    await writeFile(content.descriptor.path, content.bytes, { flag: 'wx', mode: 0o600 });
  return {
    repository: 'pressure/full',
    reference: 'candidate',
    digest: manifest.descriptor.digest,
    contents: [config.descriptor, layer.descriptor, manifest.descriptor],
  };
}

/** Publish the fixed pressure candidate through the actual producer, journal and uploader. Failed upload ownership remains in the journal; this helper does not clear, reconcile or treat any failed command as success. Scratch and endpoint lifetime belong to its caller. */
export async function publishRegistryPressureUpload(input: {
  directory: string;
  journalPath: string;
  registryId: string;
  endpoint: RegistryEndpoint;
  ports: RegistryJournalPorts;
}) {
  const artifact = await writeRegistryPressureUpload(input.directory);
  return await publishArtifacts(
    {
      registryId: input.registryId,
      owner: 'operator',
      product: 'native-upload-pressure',
      requiredRepositories: ['pressure/full'],
    },
    [artifact],
    (request) => executeRegistryCommand(input.journalPath, request, input.ports),
    async (current, ownership) => {
      await uploadArtifact(input.endpoint, current, ownership);
    },
  );
}

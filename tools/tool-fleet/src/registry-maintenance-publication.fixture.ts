import { createHash } from 'node:crypto';
import { lstat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { type RegistryEndpoint, uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { measureVerifiedFilesystem } from './registry-capacity';
import { executeRegistryCommand, type RegistryJournalPorts } from './registry-journal';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { publishPartialRegistryFixture } from './registry-partial-publication.native';
import {
  describeRegistryPopulationFailure,
  type RegistryPopulationStage,
} from './registry-population-diagnostics.fixture';
import { withRegistryPopulationScratch } from './registry-population-scratch.fixture';
import { publishArtifacts } from './registry-publication';
import { readRegistryBytes } from './registry-stream';

/** Owned native fixture seed through the actual managed producer/uploader/authority; shared layer matches the partial-three-tier fixture. */
export async function publishRetainedRegistryFixture(input: {
  directory: string;
  journalPath: string;
  registryId: string;
  owner: string;
  endpoint: RegistryEndpoint;
  ports: RegistryJournalPorts;
}) {
  const digest = (bytes: Uint8Array) =>
    'sha256:' + createHash('sha256').update(bytes).digest('hex');
  const contents: RegistryArtifact['contents'][number][] = [];
  for (const [name, text, mediaType] of [
    ['config', '{}', 'application/vnd.oci.image.config.v1+json'],
    ['layer', 'shared fixture layer', 'application/vnd.oci.image.layer.v1.tar'],
  ]) {
    const bytes = Buffer.from(text);
    const path = join(input.directory, 'retained-' + name);
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    contents.push({
      digest: digest(bytes),
      size: bytes.length,
      mediaType,
      dependencies: [],
      isManifest: false,
      path,
      offset: 0,
    });
  }
  // Boundary: unchecked array-index typing does not replace the required config/layer presence checks.
  const [config, layer] = contents as readonly (RegistryArtifact['contents'][number] | undefined)[];
  if (config === undefined || layer === undefined)
    throw new Error('Missing owned retained fixture content');
  const bytes = Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { digest: config.digest, size: config.size, mediaType: config.mediaType },
      layers: [{ digest: layer.digest, size: layer.size, mediaType: layer.mediaType }],
      annotations: { tier: 'retained' },
    }),
  );
  const path = join(input.directory, 'retained-manifest');
  await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
  contents.push({
    digest: digest(bytes),
    size: bytes.length,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    dependencies: [config.digest, layer.digest],
    isManifest: true,
    path,
    offset: 0,
  });
  const artifact: RegistryArtifact = {
    repository: 'retained/main',
    reference: 'current',
    digest: digest(bytes),
    contents,
  };
  const invoke = (request: unknown) =>
    executeRegistryCommand(input.journalPath, request, input.ports);
  const receipt = await publishArtifacts(
    {
      registryId: input.registryId,
      owner: input.owner,
      product: 'native-retained',
      requiredRepositories: [artifact.repository],
    },
    [artifact],
    invoke,
    async (current, ownership) => {
      await uploadArtifact(input.endpoint, current, ownership);
    },
  );
  const state = (await invoke({ command: 'read' })).state;
  await invoke({
    command: 'acquire-protection',
    expectedRevision: state.revision,
    operationId: 'native-retained-current',
    owner: input.owner,
    roots: [artifact.digest],
    references: [{ repository: artifact.repository, digest: artifact.digest }],
    reason: 'native-current-image',
  });
  return {
    reference: { repository: artifact.repository, digest: artifact.digest },
    sharedLayer: layer.digest,
    publicationId: receipt.operationId,
  };
}

/** Public fixture receipt contains no capability token; it binds later native assertions to exact content. */
export const RegistryPopulatedFixture = type({
  reference: { repository: "'retained/main'", digest: /^sha256:[a-f0-9]{64}$/, '+': 'reject' },
  sharedLayer: /^sha256:[a-f0-9]{64}$/,
  publicationId: 'string > 0',
  ordinaryDelete: "'disabled-refused'",
  partialOperationId: 'string > 0',
  partialUploadId: 'string > 0',
  partialOrphan: /^sha256:[a-f0-9]{64}$/,
  eligibleAt: 'string.date.iso',
  checks: 'number.safe > 0',
  '+': 'reject',
});

/** Actual owned publication and physical identity; cluster/consumer enrollment and historical server clock remain explicit fixture observations. */
export async function populateRegistryHostFixture(
  installed: RegistryMaintenanceInstallation,
  ports: RegistryJournalPorts,
) {
  let stage: RegistryPopulationStage = 'reopen';
  return await withRegistryPopulationScratch(
    async (directory) => {
      const endpoint = { url: 'http://127.0.0.1:5052' };
      stage = 'retained';
      const retained = await publishRetainedRegistryFixture({
        directory,
        journalPath: installed.journalPath,
        registryId: installed.registryId,
        owner: 'operator',
        endpoint,
        ports,
      });
      // Host fixture only: prove the delete-disabled handler while the actual guard is writable, before partial failure switches it read-only.
      stage = 'ordinary-delete';
      const retainedUrl = `${endpoint.url}/v2/${retained.reference.repository}/manifests/${retained.reference.digest}`;
      const deletion = await fetch(retainedUrl, { method: 'DELETE' });
      const refusal = type({
        errors: type({ code: "'UNSUPPORTED'" }).array().atLeastLength(1).atMostLength(1),
      }).assert(
        JSON.parse(
          new TextDecoder().decode(
            await readRegistryBytes(deletion.body, 4096, 'Owned writable DELETE'),
          ),
        ),
      );
      if (deletion.status !== 405 || refusal.errors.length !== 1)
        throw new Error('Ordinary writable endpoint accepted manifest deletion');
      const present = await fetch(retainedUrl, {
        method: 'HEAD',
        headers: {
          accept: 'application/vnd.oci.image.manifest.v1+json',
          'cache-control': 'no-cache',
        },
      });
      await present.arrayBuffer();
      if (
        present.status !== 200 ||
        present.headers.get('docker-content-digest') !== retained.reference.digest
      )
        throw new Error('Writable DELETE refusal lost retained manifest');
      const measured = await measureVerifiedFilesystem(
        installed.ordinary.path,
        installed.ordinary.identityReceipt,
      );
      const metadata = await lstat(installed.ordinary.path);
      if (measured.identity !== installed.ordinary.storageId || metadata.uid !== 59001)
        throw new Error('Owned publication fixture mount differs');
      stage = 'partial';
      const partial = await publishPartialRegistryFixture({
        directory,
        owner: 'operator',
        journalPath: installed.journalPath,
        endpoint,
        ports,
        identity: {
          registryId: installed.registryId,
          storageId: measured.identity,
          node: installed.node.uid,
          pvcUid: installed.ordinary.pvc.uid,
          mountIdentity: `${String(metadata.dev)}:${measured.identity}`,
          distributionDigest:
            'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
          binarySha256: installed.distribution.sha256,
        },
      });
      return RegistryPopulatedFixture.assert({
        ...retained,
        ordinaryDelete: 'disabled-refused',
        partialOperationId: partial.operationId,
        partialUploadId: partial.uploadId,
        partialOrphan: partial.orphan,
        eligibleAt: partial.now,
        checks: partial.checks + 2,
      });
    },
    (cause) => {
      console.error(
        'task8-population-diagnostic:' +
          JSON.stringify(describeRegistryPopulationFailure(stage, cause)),
      );
    },
  );
}

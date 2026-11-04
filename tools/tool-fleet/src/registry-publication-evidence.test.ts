import { expect, test } from 'bun:test';

import {
  validateRegistryDeclaration,
  validateRegistryPublicationEvidence,
} from './registry-publication-evidence';

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
const references = [{ repository: manifest.repository, digest: manifest.digest }];
test('publication declaration includes only the exact complete manifest-root closure', () => {
  expect(() => validateRegistryDeclaration([blob, manifest], references)).not.toThrow();
});
for (const fault of [
  'extra',
  'missing',
  'duplicate',
  'cycle',
  'path',
  'blob-root',
  'archive-path',
] as const) {
  test(`pre-write declaration refuses ${fault} ownership claims`, () => {
    const declared = structuredClone([blob, manifest]);
    if (fault === 'extra') declared.push({ ...blob, digest: 'sha256:' + '3'.repeat(64) });
    if (fault === 'missing') declared.shift();
    if (fault === 'duplicate') declared.push(blob);
    if (fault === 'cycle') declared[1].dependencies = [manifest.digest];
    if (fault === 'path') declared[0].repository = '../outside';
    if (fault === 'blob-root') declared[1].isManifest = false;
    if (fault === 'archive-path') Object.assign(declared[0], { path: '/archive', offset: 0 });
    expect(() => validateRegistryDeclaration(declared, references)).toThrow();
  });
}

const stamp = '2026-10-30T18:20:00.000Z';
const uploadId = '00000000-0000-4000-8000-000000000001';
test('persisted publication evidence keeps declared blob UUID and manifest intent distinct', () => {
  expect(() => {
    validateRegistryPublicationEvidence(
      {
        operationId: 'owned',
        declaredAt: stamp,
        contents: [blob, manifest],
        writes: [
          {
            repository: blob.repository,
            digest: blob.digest,
            uploadId,
            phase: 'writing',
            at: stamp,
          },
          {
            repository: manifest.repository,
            digest: manifest.digest,
            uploadId: null,
            phase: 'writing',
            at: stamp,
          },
        ],
      },
      references,
      { state: 'unfinished', at: stamp },
      stamp,
    );
  }).not.toThrow();
});
for (const [fault, digest, upload] of [
  ['blob-as-manifest', blob.digest, null],
  ['manifest-as-blob', manifest.digest, uploadId],
  ['undeclared', 'sha256:' + '3'.repeat(64), uploadId],
] as const) {
  test('persisted publication evidence refuses ownership mismatch: ' + fault, () => {
    expect(() => {
      validateRegistryPublicationEvidence(
        {
          operationId: 'owned',
          declaredAt: stamp,
          contents: [blob, manifest],
          writes: [
            { repository: blob.repository, digest, uploadId: upload, phase: 'writing', at: stamp },
          ],
        },
        references,
        { state: 'unfinished', at: stamp },
        stamp,
      );
    }).toThrow('Publication write lacks exact declared ownership');
  });
}

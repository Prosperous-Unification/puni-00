import { readFileSync } from 'node:fs';

import {
  planDocument,
  planDocumentV13,
  planDocumentV14,
  requestSchema,
  validateSchema,
} from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { navigatorExports } from './navigator-exports.fixture';

// Constructed current inputs exercise pure serialization; no source observation is modeled here.
test('current15/16 constructed exporter inputs satisfy the strict current document descriptor', async () => {
  const documents = navigatorExports();
  expect(documents.map((document) => document.document.version)).toEqual([15, 16]);
  for (const document of documents) {
    expect((await validateSchema(requestSchema(planDocument), document)).issues).toBeUndefined();
    expect(document.project.id).toBe(document.workPackage.projectId);
    expect(document.workPackage).not.toHaveProperty('ownerId');
    expect(document.workPackage).not.toHaveProperty('createdBy');
  }
});

// Existing repository13/14 fixture bytes retain their own history; no released-binary provenance is asserted.
for (const fixture of [
  { version: 13, sha256: '65ca04b79f53010bde0caaf8c2d7441d866d9d31994979516677862e4873bfc9' },
  { version: 14, sha256: 'ac1241291ebcfd64eeaba526174f221a0da85eaabf333216f15e077b0ecc3d72' },
]) {
  test(
    'existing Navigator v' +
      String(fixture.version) +
      ' bytes remain frozen under their historical descriptor',
    async () => {
      const bytes = readFileSync(
        new URL(
          '../../../../../../apps/twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v' +
            String(fixture.version) +
            '.json',
          import.meta.url,
        ),
        'utf8',
      );
      expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
      const document: unknown = JSON.parse(bytes);
      const descriptor =
        fixture.version === 13 ? requestSchema(planDocumentV13) : requestSchema(planDocumentV14);
      expect((await validateSchema<unknown>(descriptor, document)).issues).toBeUndefined();
    },
  );
}

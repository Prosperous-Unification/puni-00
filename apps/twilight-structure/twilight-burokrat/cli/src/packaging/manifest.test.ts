import { expect, test } from 'bun:test';

import { packageManifestBytes, packageVersion } from './manifest';

test('the outer manifest binds package, source, and toolkit identities', () => {
  const sourceRevision = '1'.repeat(40);
  const toolkitIdentity = '2'.repeat(64);

  expect(new TextDecoder().decode(packageManifestBytes(sourceRevision, toolkitIdentity))).toBe(
    `${JSON.stringify({
      packageVersion,
      schemaVersion: 1,
      sourceRevision,
      toolkitIdentity,
    })}\n`,
  );
});

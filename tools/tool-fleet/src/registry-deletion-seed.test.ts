import { mkdtemp, rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { writeRegistryDeletionFixture } from './registry-deletion.fixture';

test('deletion seed has one expired tagged manifest and a complete protected index', async () => {
  const directory = await mkdtemp('/tmp/task8-deletion-seed-');
  try {
    const [expired, protectedIndex] = await writeRegistryDeletionFixture(directory);
    expect(expired.repository).toBe('retained/expired');
    expect(expired.reference).toBe('expired');
    expect(expired.contents.filter((content) => content.isManifest)).toHaveLength(1);
    expect(expired.contents).toHaveLength(4);
    expect(protectedIndex.repository).toBe('retained/index');
    expect(protectedIndex.contents.filter((content) => content.isManifest)).toHaveLength(3);
    expect(protectedIndex.contents).toHaveLength(7);
    for (const artifact of [expired, protectedIndex]) {
      const identities = new Set(artifact.contents.map((content) => content.digest));
      expect(identities.has(artifact.digest)).toBe(true);
      for (const content of artifact.contents) {
        await verifyContent(content);
        for (const dependency of content.dependencies)
          expect(identities.has(dependency)).toBe(true);
      }
    }
    const root = protectedIndex.contents.find(
      (content) => content.digest === protectedIndex.digest,
    );
    expect(root?.dependencies).toHaveLength(2);
    expect(expired.digest).not.toBe(protectedIndex.digest);
  } finally {
    await rm(directory, { recursive: true });
  }
});

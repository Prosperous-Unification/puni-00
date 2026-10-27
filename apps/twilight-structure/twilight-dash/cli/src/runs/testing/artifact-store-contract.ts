import { rejects } from 'node:assert/strict';

import { describe, expect, test } from 'bun:test';

import type { ArtifactStore } from '../artifact-store';
import { artifactDigest } from '../record-codecs';

export function artifactStoreContract(
  name: string,
  create: () => Promise<{ artifacts: ArtifactStore; close(): Promise<void> }>,
) {
  describe(name, () => {
    test('retains immutable bytes and refuses metadata collisions', async () => {
      const stores = await create();
      try {
        expect(stores.artifacts).toBeDefined();
        const bytes = new TextEncoder().encode('hello');
        const retained = await stores.artifacts.retainArtifact(bytes, 'text/plain');
        expect(retained.kind).toBe('retained');
        if (retained.kind !== 'retained') throw new Error('expected retained artifact');
        expect(retained.reference).toEqual({
          version: 1,
          digest: artifactDigest(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
          ),
          byteLength: 5,
          mediaType: 'text/plain',
          retention: 'retain',
        });
        bytes.fill(0);
        const read = await stores.artifacts.readArtifact(retained.reference);
        expect(new TextDecoder().decode(read)).toBe('hello');
        read.fill(0);
        expect(
          new TextDecoder().decode(await stores.artifacts.readArtifact(retained.reference)),
        ).toBe('hello');
        expect(
          await stores.artifacts.retainArtifact(new TextEncoder().encode('hello'), 'text/plain'),
        ).toEqual(retained);
        expect(
          await stores.artifacts.retainArtifact(
            new TextEncoder().encode('hello'),
            'application/json',
          ),
        ).toEqual({ kind: 'refused', reason: 'metadata_conflict' });
        await rejects(
          stores.artifacts.readArtifact({
            ...retained.reference,
            digest: artifactDigest('0'.repeat(64)),
          }),
          /artifact does not exist/,
        );
        for (const reference of [
          { ...retained.reference, byteLength: 6 },
          { ...retained.reference, mediaType: 'application/json' },
        ])
          await rejects(stores.artifacts.readArtifact(reference), /artifact metadata differs/);
        await rejects(stores.artifacts.retainArtifact(new Uint8Array(), ''));
        for (const content of [undefined, null, 3, 'hello', [1]])
          await rejects(
            stores.artifacts.retainArtifact(content as unknown as Uint8Array, 'text/plain'),
            /artifact content must be bytes/,
          );
        const closing = stores.close();
        await rejects(stores.artifacts.readArtifact(retained.reference));
        await rejects(stores.artifacts.retainArtifact(bytes, 'text/plain'));
        await closing;
      } finally {
        await stores.close();
      }
    });
  });
}

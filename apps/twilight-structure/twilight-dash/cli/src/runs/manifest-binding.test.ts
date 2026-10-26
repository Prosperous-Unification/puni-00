import { rejects } from 'node:assert/strict';

import { expect, test } from 'bun:test';

import type { ArtifactStore } from './artifact-store';
import { readManifestBinding } from './manifest-binding';
import { manifestDigest, organizationId } from './record-codecs';
import type { Manifest } from './records';
import { createManifest, FixtureClock } from './testing/fixtures';
import {
  createBindingFixture,
  manifestBindingContract,
  originalPrompt,
} from './testing/manifest-binding-contract';
import { createMemoryStores } from './testing/memory-stores';

function createStores() {
  return createMemoryStores({
    organizationId: organizationId('organization'),
    capacity: 1,
    leaseMilliseconds: 100,
    clock: new FixtureClock(),
  });
}
manifestBindingContract(
  'memory manifest binding',
  async () => await Promise.resolve(createStores()),
);
function reply(manifest: Manifest) {
  return {
    async readManifest() {
      return await Promise.resolve(manifest);
    },
  };
}

for (const [name, change, diagnostic] of [
  [
    'bindingVersion mismatch',
    (manifest: Manifest) => createManifest({ ...manifest, bindingVersion: 2 }),
    /binding version/,
  ],
  [
    'invalid step set',
    (manifest: Manifest) =>
      createManifest({
        ...manifest,
        canonicalBinding: manifest.canonicalBinding.replace('["plan"]', '[]'),
      }),
    /invalid_project_steps/,
  ],
  [
    'dangling class',
    (manifest: Manifest) =>
      createManifest({
        ...manifest,
        canonicalBinding: manifest.canonicalBinding.replace('"class":"plan"', '"class":"absent"'),
      }),
    /unknown_class/,
  ],
  [
    'inexact coverage',
    (manifest: Manifest) =>
      createManifest({
        ...manifest,
        canonicalBinding: manifest.canonicalBinding.replace('["plan"]', '["other","plan"]'),
      }),
    /missing_step/,
  ],
  [
    'invalid acceptance shape',
    (manifest: Manifest) =>
      createManifest({ ...manifest, canonicalBinding: '{"binding":"fixture"}' }),
    /invalid_binding/,
  ],
  [
    'invalid nested binding',
    (manifest: Manifest) =>
      createManifest({
        ...manifest,
        canonicalBinding: manifest.canonicalBinding.replace('"command":"build"', '"command":""'),
      }),
    /invalid_binding/,
  ],
] as const) {
  test(`refuses ${name} before artifact IO`, async () => {
    const stores = createStores();
    try {
      const manifest = change(createBindingFixture().manifest);
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        async readArtifact() {
          return await Promise.reject(new Error('unexpected artifact IO'));
        },
      };
      await rejects(readManifestBinding(reply(manifest), artifacts, manifest.digest), diagnostic);
    } finally {
      stores.close();
    }
  });
  test(`refuses ${name} with retained bytes`, async () => {
    const stores = createStores();
    try {
      const manifest = change(createBindingFixture().manifest);
      await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
      await rejects(
        readManifestBinding(reply(manifest), stores.artifacts, manifest.digest),
        diagnostic,
      );
    } finally {
      stores.close();
    }
  });
}

test('refuses a valid returned manifest for a different requested digest', async () => {
  const stores = createStores();
  try {
    const { manifest } = createBindingFixture(true);
    await rejects(
      readManifestBinding(reply(manifest), stores.artifacts, manifestDigest('f'.repeat(64))),
      /manifest digest/,
    );
  } finally {
    stores.close();
  }
});

test('decodes and verifies a corrupt returned manifest before artifact IO', async () => {
  const stores = createStores();
  try {
    const { manifest } = createBindingFixture(true);
    await rejects(
      readManifestBinding(
        reply({ ...manifest, executorVersions: { executor: 'changed' } }),
        stores.artifacts,
        manifest.digest,
      ),
    );
  } finally {
    stores.close();
  }
});

test('propagates manifest absence and unreadable artifact cause without recovery', async () => {
  const stores = createStores();
  try {
    const { manifest } = createBindingFixture();
    await rejects(
      readManifestBinding(stores.runs, stores.artifacts, manifest.digest),
      /manifest does not exist/,
    );
    const cause = new Error('disk denied');
    const failure = new Error('artifact unreadable', { cause });
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact() {
        return await Promise.reject(failure);
      },
    };
    await rejects(
      readManifestBinding(reply(manifest), artifacts, manifest.digest),
      (caught: unknown) => caught instanceof Error && caught === failure && caught.cause === cause,
    );
  } finally {
    stores.close();
  }
});

test('full acceptance comparison refuses valid-shaped changed descriptor content', async () => {
  const stores = createStores();
  try {
    const { manifest } = createBindingFixture();
    const changed = createManifest({
      ...manifest,
      canonicalBinding: manifest.canonicalBinding.replaceAll(
        manifest.prompts[0].digest,
        'a'.repeat(64),
      ),
      prompts: manifest.prompts.map((reference) => ({
        ...reference,
        digest: 'a'.repeat(64) as typeof reference.digest,
      })),
    });
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact() {
        return await Promise.resolve(originalPrompt.slice());
      },
    };
    await rejects(
      readManifestBinding(reply(changed), artifacts, changed.digest),
      /retained binding acceptance does not match manifest/,
    );
  } finally {
    stores.close();
  }
});

test('snapshots mutable manifest before a held real artifact read and deeply freezes own return', async () => {
  const stores = createStores();
  const started = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  try {
    const { manifest: base } = createBindingFixture();
    const manifest = createManifest({ ...base, toolPolicies: base.prompts });
    const supplied = structuredClone(manifest);
    const expected = structuredClone(manifest);
    await stores.artifacts.retainArtifact(originalPrompt, 'text/plain');
    const artifacts: ArtifactStore = {
      ...stores.artifacts,
      async readArtifact(reference) {
        started.resolve(undefined);
        await release.promise;
        return await stores.artifacts.readArtifact(reference);
      },
    };
    const pending = readManifestBinding(reply(supplied), artifacts, supplied.digest);
    await started.promise;
    expect(Reflect.set(supplied.prompts[0], 'byteLength', 999)).toBe(true);
    expect(Reflect.set(supplied.executorVersions, 'executor', 'changed')).toBe(true);
    expect(Reflect.set(supplied.toolPolicies[0], 'mediaType', 'changed')).toBe(true);
    expect(
      Reflect.set(
        supplied,
        'canonicalBinding',
        createBindingFixture(true).manifest.canonicalBinding,
      ),
    ).toBe(true);
    expect(Reflect.set(supplied.credentialReferences, '0', 'changed')).toBe(true);
    release.resolve(undefined);
    const recovered = await pending;
    expect(recovered.manifest).toEqual(expected);
    expect(recovered.binding.prompts[0].text).toBe('p\n');
    for (const frozen of [
      recovered,
      recovered.manifest,
      recovered.manifest.prompts,
      recovered.manifest.prompts[0],
      recovered.manifest.toolPolicies,
      recovered.manifest.toolPolicies[0],
      recovered.manifest.executorVersions,
      recovered.manifest.credentialReferences,
      recovered.binding,
      recovered.binding.snapshot.binding.classes['plan'],
      recovered.binding.snapshot.binding.classes['unused'],
      ...(() => {
        const settings = recovered.binding.snapshot.binding.classes['unused'];
        if (settings.executor !== 'api-model') throw new Error('expected API settings');
        return [settings.tools, settings.limits];
      })(),
      recovered.binding.prompts,
      recovered.binding.prompts[0],
    ])
      expect(Reflect.set(frozen, 'changed', true)).toBe(false);
  } finally {
    release.resolve(undefined);
    stores.close();
  }
});

for (const representation of ['Uint8Array', 'Buffer'] as const)
  test(`copies prior prompt buffer before a later policy artifact await (${representation})`, async () => {
    const stores = createStores();
    const started = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    try {
      const { manifest } = createBindingFixture();
      const changed = createManifest({ ...manifest, toolPolicies: manifest.prompts });
      const buffer =
        representation === 'Buffer' ? Buffer.from(originalPrompt) : originalPrompt.slice();
      await stores.artifacts.retainArtifact(buffer, 'text/plain');
      let reads = 0;
      const artifacts: ArtifactStore = {
        ...stores.artifacts,
        async readArtifact(reference) {
          reads += 1;
          if (reads === 1) {
            await stores.artifacts.readArtifact(reference);
            return buffer;
          }
          started.resolve(undefined);
          await release.promise;
          return await stores.artifacts.readArtifact(reference);
        },
      };
      const pending = readManifestBinding(reply(changed), artifacts, changed.digest);
      await started.promise;
      buffer.fill(0);
      release.resolve(undefined);
      expect((await pending).binding.prompts[0].bytesBase64).toBe('77u/cAo=');
    } finally {
      release.resolve(undefined);
      stores.close();
    }
  });

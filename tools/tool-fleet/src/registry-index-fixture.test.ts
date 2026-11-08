import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { verifyContent } from './registry-artifact';
import { writeRegistryIndexFixture } from './registry-index.fixture';
import {
  parseRegistryFixtureConfiguration,
  parseRegistryFixtureIndex,
  parseRegistryFixtureManifest,
} from './registry-index-json.fixture';

// Fixture byte contract only: actual content hashing and system tar decode; no Docker engine or registry effect.
test('two-platform index supplies real tar layers and matching platform/config closures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task8-index-'));
  try {
    const artifact = await writeRegistryIndexFixture(directory, 1);
    expect(artifact.repository).toBe('retained/index');
    expect(artifact.reference).toBe('release-1');
    expect(artifact.contents).toHaveLength(7);
    for (const content of artifact.contents) await verifyContent(content);
    const root = artifact.contents.find((content) => content.digest === artifact.digest);
    if (root === undefined) throw new Error('Missing index');
    const index = parseRegistryFixtureIndex(await Bun.file(root.path).json());
    expect(index.mediaType).toBe('application/vnd.oci.image.index.v1+json');
    expect(index.manifests.map((child) => child.platform)).toEqual([
      { architecture: 'amd64', os: 'linux' },
      { architecture: 'arm64', os: 'linux' },
    ]);
    expect(root.dependencies).toEqual(index.manifests.map((child) => child.digest));
    for (const child of index.manifests) {
      const manifestContent = artifact.contents.find((content) => content.digest === child.digest);
      if (manifestContent === undefined) throw new Error('Missing child');
      const manifest = parseRegistryFixtureManifest(await Bun.file(manifestContent.path).json());
      const configContent = artifact.contents.find(
        (content) => content.digest === manifest.config.digest,
      );
      if (configContent === undefined) throw new Error('Missing config');
      const config = parseRegistryFixtureConfiguration(await Bun.file(configContent.path).json());
      expect(config.architecture).toBe(child.platform.architecture);
      expect(config.os).toBe('linux');
      expect(config.rootfs).toEqual({
        type: 'layers',
        diff_ids: manifest.layers.map((layer) => layer.digest),
      });
      expect(config.history).toHaveLength(2);
      expect(manifestContent.dependencies).toEqual([
        manifest.config.digest,
        ...config.rootfs.diff_ids,
      ]);
      for (const [position, descriptor] of manifest.layers.entries()) {
        const layer = artifact.contents.find((content) => content.digest === descriptor.digest);
        if (layer === undefined) throw new Error('Missing layer');
        const extraction = Bun.spawnSync([
          '/usr/bin/tar',
          '-xOf',
          layer.path,
          position === 0 ? 'shared.txt' : 'release.txt',
        ]);
        expect(extraction.exitCode).toBe(0);
        expect(extraction.stderr.toString()).toBe('');
        expect(extraction.stdout.toString()).toBe(
          position === 0 ? 'retained shared layer\n' : 'release 1\n',
        );
      }
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('releases share only the base layer and retain unique platform closures', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'task8-index-'));
  try {
    const first = await writeRegistryIndexFixture(directory, 1);
    const second = await writeRegistryIndexFixture(directory, 2);
    const shared = first.contents.filter((content) =>
      second.contents.some((candidate) => candidate.digest === content.digest),
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]?.mediaType).toBe('application/vnd.oci.image.layer.v1.tar');
    expect(first.digest).not.toBe(second.digest);
  } finally {
    await rm(directory, { recursive: true });
  }
});

const platform = { architecture: 'amd64', os: 'linux' };
const descriptor = {
  digest: 'sha256:' + 'a'.repeat(64),
  size: 1,
  mediaType: 'application/octet-stream',
};
const fixtureIndex = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [{ ...descriptor, platform }],
};
const fixtureManifest = {
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.manifest.v1+json',
  config: descriptor,
  layers: [descriptor],
};
const fixtureConfiguration = {
  config: { Labels: { 'task8.release': '1' } },
  architecture: 'amd64',
  os: 'linux',
  rootfs: { type: 'layers', diff_ids: [descriptor.digest] },
  history: [{}],
};

for (const document of [
  {
    kind: 'index',
    read: parseRegistryFixtureIndex,
    valid: fixtureIndex,
    faults: [
      ['absent', undefined],
      ['null', null],
      ['missing-fields', {}],
      ['media-type', { ...fixtureIndex, mediaType: 42 }],
      ['manifest-list', { ...fixtureIndex, manifests: {} }],
      ['manifest-entry', { ...fixtureIndex, manifests: [null] }],
      ['digest', { ...fixtureIndex, manifests: [{ digest: 42, platform }] }],
      ['platform', { ...fixtureIndex, manifests: [{ ...descriptor, platform: null }] }],
      [
        'architecture',
        {
          ...fixtureIndex,
          manifests: [{ ...descriptor, platform: { ...platform, architecture: 42 } }],
        },
      ],
      [
        'os',
        { ...fixtureIndex, manifests: [{ ...descriptor, platform: { ...platform, os: false } }] },
      ],
    ],
  },
  {
    kind: 'manifest',
    read: parseRegistryFixtureManifest,
    valid: fixtureManifest,
    faults: [
      ['absent', undefined],
      ['null', null],
      ['missing-fields', {}],
      ['config', { ...fixtureManifest, config: null }],
      ['config-digest', { ...fixtureManifest, config: { digest: 42 } }],
      ['layer-list', { ...fixtureManifest, layers: {} }],
      ['layer-entry', { ...fixtureManifest, layers: [null] }],
      ['layer-digest', { ...fixtureManifest, layers: [{ digest: false }] }],
    ],
  },
  {
    kind: 'configuration',
    read: parseRegistryFixtureConfiguration,
    valid: fixtureConfiguration,
    faults: [
      ['absent', undefined],
      ['null', null],
      ['missing-fields', {}],
      ['architecture', { ...fixtureConfiguration, architecture: 42 }],
      ['os', { ...fixtureConfiguration, os: false }],
      ['rootfs', { ...fixtureConfiguration, rootfs: null }],
      ['rootfs-type', { ...fixtureConfiguration, rootfs: { type: 42, diff_ids: [] } }],
      ['diff-id-list', { ...fixtureConfiguration, rootfs: { type: 'layers', diff_ids: {} } }],
      ['diff-id', { ...fixtureConfiguration, rootfs: { type: 'layers', diff_ids: [42] } }],
      ['history', { ...fixtureConfiguration, history: {} }],
    ],
  },
] as const) {
  test('fixture JSON retains the exact valid ' + document.kind + ' fields', () => {
    expect(document.read(document.valid)).toEqual(document.valid);
  });
  for (const [fault, input] of document.faults) {
    test('fixture JSON refuses ' + document.kind + ': ' + fault, () => {
      expect(() => document.read(input)).toThrow();
    });
  }
}

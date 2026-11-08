import { copyFile, rm } from 'node:fs/promises';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { type DockerPublicationPorts, publishDockerBundle } from './registry-docker-publication';
import type { ManagedRegistry } from './registry-enrollment';
const root = 'sha256:8108345a688fe4443aabd7b95f6edc64497523dd78da3ef3aeed69ea605b0f3e';
const observed = {
  Id: root,
  Descriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: root, size: 401 },
  RootFS: {
    Type: 'layers',
    Layers: ['sha256:9290e74028e00871597e6d07ee9489e1aaad7da84fa15b6d4d825c4260b23ff3'],
  },
  Os: 'linux',
  Architecture: 'amd64',
};
observed.RootFS.Layers = [
  'sha256:9290e74028e00871597e6d07ee9489e1aaad7da84ca15b6d4d825c4260b23ff3',
];
it('exports every immutable Docker image after scratch admission and publishes only the completely measured bundle', async () => {
  const directory = await scratchAsync('docker-publication-');
  const enrollment = {
    requiredRepositories: ['site', 'app', 'api'],
    builder: { path: directory },
  } as ManagedRegistry;
  const events: string[] = [];
  const ports: DockerPublicationPorts = {
    admit: () => {
      events.push('admit');
      return Promise.resolve('scratch');
    },
    check: () => {
      events.push('check');
      return Promise.resolve();
    },
    run: async (args) => {
      if (args.includes('save')) {
        events.push('export');
        await copyFile(
          new URL('./fixtures/docker-29.1.3-containerd.oci.tar', import.meta.url).pathname,
          args[args.indexOf('--output') + 1],
        );
        return '';
      }
      events.push('inspect');
      return JSON.stringify(observed);
    },
    publish: (artifacts) => {
      events.push('publish');
      expect(artifacts).toHaveLength(3);
      expect(artifacts.every((artifact) => artifact.digest === root)).toBe(true);
      return Promise.resolve({ completed: true });
    },
  };
  const images = ['site', 'app', 'api'].map((repository) => ({
    repository,
    tag: 'release',
    imageId: root,
  }));
  try {
    expect(await publishDockerBundle(enrollment, images, ports)).toEqual({ completed: true });
    expect(events[0]).toBe('admit');
    expect(events.at(-1)).toBe('publish');
    expect(events.filter((event) => event === 'export')).toHaveLength(3);
    events.length = 0;
    await expectRejection(publishDockerBundle(enrollment, images.slice(0, 1), ports), 'complete');
    expect(events).toEqual([]);
    await expectRejection(
      publishDockerBundle(enrollment, images, {
        ...ports,
        admit: () => Promise.reject(new Error('scratch missing')),
      }),
      'scratch missing',
    );
    expect(events).toEqual([]);
    await expectRejection(
      publishDockerBundle(enrollment, images, {
        ...ports,
        run: (args) =>
          args.includes('save')
            ? ports.run(args)
            : Promise.resolve(JSON.stringify({ ...observed, Id: `sha256:${'f'.repeat(64)}` })),
      }),
      'identity',
    );
    expect(events).not.toContain('publish');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function expectRejection(
  promise: Promise<unknown>,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await promise.then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}

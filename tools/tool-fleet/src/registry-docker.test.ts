import { expect, it } from 'bun:test';

import { inspectOciArchive } from './registry-artifact';
import { verifyDockerExport } from './registry-docker';

const root = 'sha256:8108345a688fe4443aabd7b95f6edc64497523dd78da3ef3aeed69ea605b0f3e';
const observed = {
  Id: root,
  Descriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: root, size: 401 },
  RootFS: {
    Type: 'layers',
    Layers: ['sha256:9290e74028e00871597e6d07ee9489e1aaad7da84ca15b6d4d825c4260b23ff3'],
  },
  Os: 'linux',
  Architecture: 'amd64',
};
it('binds the characterized Docker containerd manifest ID without treating it as a config digest', async () => {
  const artifact = await inspectOciArchive(
    new URL('./fixtures/docker-29.1.3-containerd.oci.tar', import.meta.url).pathname,
    'proof/website',
    'fixture',
  );
  expect(artifact.digest).toBe(root);
  await verifyDockerExport(artifact, observed);
  for (const image of [
    { ...observed, Id: 'sha256:' + 'a'.repeat(64) },
    { ...observed, Descriptor: { ...observed.Descriptor, digest: 'sha256:' + 'a'.repeat(64) } },
    {
      ...observed,
      Descriptor: { ...observed.Descriptor, mediaType: 'application/vnd.oci.image.index.v1+json' },
    },
    { ...observed, RootFS: { Type: 'layers', Layers: ['sha256:' + 'a'.repeat(64)] } },
    { ...observed, Architecture: 'arm64' },
  ])
    expect(
      await verifyDockerExport(artifact, image).then(
        () => false,
        () => true,
      ),
    ).toBe(true);
});

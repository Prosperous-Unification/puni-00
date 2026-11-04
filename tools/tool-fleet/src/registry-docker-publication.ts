import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { type RegistryEndpoint, uploadArtifact } from './platform-registry';
import type { RegistryArtifact } from './registry-artifact';
import { inspectOciArchive } from './registry-artifact';
import { verifyDockerExport } from './registry-docker';
import type { ManagedRegistry } from './registry-enrollment';
import {
  admitExportScratch,
  checkExportScratch,
  connectRegistryAuthority,
} from './registry-enrollment';
import { runRegistryProcess, withRegistryExecutable } from './registry-process';
import { publishArtifacts } from './registry-publication';
export interface DockerPublicationImage {
  repository: string;
  tag: string;
  imageId: string;
}
export interface DockerPublicationPorts {
  admit: () => Promise<unknown>;
  check: (admission: unknown) => Promise<void>;
  run: (args: string[]) => Promise<string>;
  publish: (artifacts: RegistryArtifact[]) => Promise<unknown>;
}
/** Export the complete immutable product bundle inside admitted scratch before reserving/uploading anything. */
export async function publishDockerBundle(
  enrollment: ManagedRegistry,
  images: readonly DockerPublicationImage[],
  ports: DockerPublicationPorts,
): Promise<unknown> {
  const parsed = type({
    repository: /^[a-z0-9]+(?:[._/-][a-z0-9]+)*$/,
    tag: /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/,
    imageId: /^sha256:[0-9a-f]{64}$/,
    '+': 'reject',
  }).array()(images);
  if (
    parsed instanceof type.errors ||
    images.length !== enrollment.requiredRepositories.length ||
    new Set(images.map((image) => image.repository)).size !== images.length ||
    enrollment.requiredRepositories.some(
      (repository) => !images.some((image) => image.repository === repository),
    )
  )
    throw new Error('Docker publication requires the complete configured product');
  const admission = await ports.admit();
  const directory = await mkdtemp(join(enrollment.builder.path, 'docker-publication-'));
  const inspect = (id: string) =>
    ports.run([
      'image',
      'inspect',
      '--format',
      '{"Id":{{json .Id}},"Descriptor":{{json .Descriptor}},"RootFS":{{json .RootFS}},"Os":{{json .Os}},"Architecture":{{json .Architecture}}}',
      id,
    ]);
  try {
    const artifacts: RegistryArtifact[] = [];
    for (const [index, image] of images.entries()) {
      const before = JSON.parse(await inspect(image.imageId)) as unknown;
      const identity = type({ Id: /^sha256:[0-9a-f]{64}$/ })(before);
      if (identity instanceof type.errors || identity.Id !== image.imageId)
        throw new Error('Docker immutable image identity differs');
      const path = join(directory, `image-${String(index)}.tar`);
      await ports.run(['image', 'save', '--output', path, image.imageId]);
      await ports.check(admission);
      const after = JSON.parse(await inspect(image.imageId)) as unknown;
      if (JSON.stringify(after) !== JSON.stringify(before))
        throw new Error('Docker immutable image identity changed during export');
      const artifact = await inspectOciArchive(path, image.repository, image.tag);
      await verifyDockerExport(artifact, before);
      artifacts.push(artifact);
    }
    await ports.check(admission);
    return await ports.publish(artifacts);
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Native private-producer path uses the same public scratch/admission/uploader as Dagger and copy. Internal capacity/authority ports permit the synthetic credential rehearsal; installed CLI callers use the defaults. */
export async function publishNativeDockerBundle(
  enrollment: ManagedRegistry,
  images: readonly DockerPublicationImage[],
  ports = {
    admit: admitExportScratch,
    check: checkExportScratch,
    authority: connectRegistryAuthority,
  },
): Promise<unknown> {
  if (enrollment.docker === undefined)
    throw new Error('Managed Docker publication has no pinned executable');
  const username = process.env['REGISTRY_USER'];
  const password = process.env['REGISTRY_PASS'];
  if (username === undefined || username === '' || password === undefined || password === '')
    throw new Error('Managed Docker publication requires explicit registry credentials');
  const endpoint: RegistryEndpoint = {
    url: enrollment.registryUrl,
    username,
    password,
    ...(enrollment.caPath === undefined ? {} : { ca: await readFile(enrollment.caPath, 'utf8') }),
  };
  return withRegistryExecutable(enrollment.docker, (executable, cwd) =>
    publishDockerBundle(enrollment, images, {
      admit: () => ports.admit(enrollment),
      check: async (admission) => {
        // Boundary: ports.admit has the admitExportScratch signature; publishDockerBundle passes its opaque admission back unchanged.
        await ports.check(enrollment, admission as Awaited<ReturnType<typeof admitExportScratch>>);
      },
      run: (args) => runRegistryProcess([executable, ...args], cwd, 180000),
      publish: (artifacts) =>
        publishArtifacts(
          enrollment,
          artifacts,
          ports.authority(enrollment),
          async (artifact, ownership) => {
            await uploadArtifact(endpoint, artifact, ownership);
          },
        ),
    }),
  );
}

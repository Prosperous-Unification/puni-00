import { rejects } from 'node:assert/strict';

import { type } from 'arktype';
import { expect, it } from 'bun:test';

import { helperEnvironment } from './k3d-helper-images';
import { selectedHelpers } from './k3d-helper-images.fixture.test';
import { bindDockerEnvironment, requireCapturedDaemon } from './k3d-resource-runtime';

function capabilitiesReply(arguments_: readonly string[]): string | undefined {
  if (arguments_[0] === 'version')
    return JSON.stringify({ engineVersion: '29.7.2', serverApi: '1.55', minimumApi: '1.40' });
  if (arguments_[0] === 'info' && arguments_.at(-1) !== '{{.ID}}')
    return JSON.stringify({
      daemonId: 'daemon-1',
      os: 'linux',
      arch: 'x86_64',
      driver: 'overlayfs',
      driverStatus: [['driver-type', 'io.containerd.snapshotter.v1']],
    });
  return undefined;
}

it('pins Docker and k3d to a captured Unix endpoint instead of mutable context', () => {
  const bound = bindDockerEnvironment('unix:///var/run/docker.sock', {
    DOCKER_CONTEXT: 'foreign',
    DOCKER_HOST: 'tcp://other:2375',
    DOCKER_TLS_VERIFY: '1',
    DOCKER_CERT_PATH: '/foreign',
    PATH: '/bin',
  });
  expect(bound['DOCKER_HOST']).toBe('unix:///var/run/docker.sock');
  expect(bound['DOCKER_CONTEXT']).toBeUndefined();
  expect(bound['DOCKER_TLS_VERIFY']).toBeUndefined();
  expect(bound['DOCKER_CERT_PATH']).toBeUndefined();
  expect(() => bindDockerEnvironment('ssh://foreign', {})).toThrow();
});
it('refuses changed daemon identity before the next mutation', async () => {
  await rejects(
    requireCapturedDaemon('expected', () => Promise.resolve('foreign\n')),
    new RegExp('daemon'),
  );
  await requireCapturedDaemon('expected', () => Promise.resolve('expected\n'));
});

import { chmod } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';

import { createCreationAttempt } from './creation-journal';
import { imagePlan, imageSource } from './k3d-image-identity.fixture.test';
import { createResourceWitness } from './k3d-resource-runtime';

it('retains a network receipt but refuses later lifecycle when the actual handshake is absent', async () => {
  const directory = await scratchAsync('witness-integration-');
  await chmod(directory, 0o700);
  const identity = {
    labId: 'c123456789abcdef',
    attemptId: '11111111-1111-4111-8111-111111111111',
    daemonId: 'daemon-1',
  };
  await createCreationAttempt(directory, identity);
  const plan = {
    schemaVersion: 2 as const,
    helpers: selectedHelpers,
    endpoint: 'unix:///run/docker.sock',
    daemonId: 'daemon-1',
    profile: 'app' as const,
    network: 'network',
    expected: [
      {
        name: 'registry',
        image: 'registry:2',
        configId: 'sha256:' + 'e'.repeat(64),
        role: 'registry' as const,
        temporary: false,
      },
    ],
    binds: [],
  };
  const witness = await createResourceWitness(
    directory,
    directory,
    identity,
    imagePlan(plan),
    () => Promise.reject(new Error('Unexpected Docker call')),
    [process.execPath, '-e', 'setInterval(()=>{},1000)'],
    await imageSource(),
  );
  try {
    await rejects(witness.acceptNetwork('a'.repeat(64), 40), new RegExp('handshake'));
  } finally {
    await witness.stop();
  }
  expect(
    await Bun.file(join(directory, `${identity.attemptId}.resources/network.json`)).json(),
  ).toMatchObject({ id: 'a'.repeat(64) });
});

import { stopRecordedContainer } from './k3d-resource-runtime';
it('records an explicit forced stop only after its bounded graceful stop fails to exit', async () => {
  let running = true;
  const docker = (arguments_: readonly string[]) => {
    if (arguments_[0] === 'container')
      return Promise.resolve(JSON.stringify({ running, exitCode: running ? 0 : 137 }));
    if (arguments_[0] === 'kill' && arguments_[2] === 'SIGKILL') running = false;
    return Promise.resolve('');
  };
  expect(await stopRecordedContainer('a'.repeat(64), docker, 20)).toEqual({
    forced: true,
    exitCode: 137,
  });
  expect(running).toBe(false);
});

for (const fault of [
  'missing',
  'name',
  'image',
  'effective-id',
  'network',
  'extra-network',
  'none',
]) {
  it(`Task21 import lookup ${fault === 'none' ? 'returns the exact captured node ID' : `refuses ${fault} creator evidence`}`, async () => {
    const directory = await scratchAsync('object-store-node-');
    const identity = {
      labId: 'c123456789abcdef',
      attemptId: '11111111-1111-4111-8111-111111111111',
      daemonId: 'daemon-1',
    };
    await createCreationAttempt(directory, identity);
    const plan = {
      schemaVersion: 2 as const,
      helpers: selectedHelpers,
      endpoint: 'unix:///run/docker.sock',
      daemonId: 'daemon-1',
      profile: 'platform' as const,
      network: 'network',
      binds: [],
      expected: [
        {
          name: 'server',
          image: 'locked:node',
          configId: 'sha256:' + 'e'.repeat(64),
          role: 'server' as const,
          temporary: false,
        },
      ],
    };
    const forward = imagePlan(plan);
    const docker = (arguments_: readonly string[]) =>
      Promise.resolve(
        capabilitiesReply(arguments_) ??
          (arguments_[0] === 'info'
            ? 'daemon-1'
            : JSON.stringify({
                id: 'b'.repeat(64),
                name: fault === 'name' ? '/foreign' : '/server',
                image: `sha256:${(fault === 'effective-id' ? '9' : 'e').repeat(64)}`,
                configuredImage: fault === 'image' ? 'foreign:node' : forward.expected[0].image,
                manifest: {
                  mediaType: 'application/vnd.oci.image.manifest.v1+json',
                  digest: 'sha256:' + 'e'.repeat(64),
                  size: 610,
                  platform: { os: 'linux', architecture: 'amd64' },
                },
                networks: {
                  lab: { NetworkID: fault === 'network' ? '9'.repeat(64) : 'a'.repeat(64) },
                  ...(fault === 'extra-network' ? { extra: { NetworkID: 'a'.repeat(64) } } : {}),
                },
                mounts: [],
              })),
      );
    const event = {
      kind: 'network',
      action: 'create',
      id: 'a'.repeat(64),
      time: '1',
      name: 'network',
      container: '',
      destination: '',
      driver: '',
      image: '',
    };
    const witness = await createResourceWitness(
      directory,
      directory,
      identity,
      forward,
      docker,
      [
        process.execPath,
        '-e',
        `console.log(${JSON.stringify(JSON.stringify(event))});setInterval(()=>{},1000)`,
      ],
      await imageSource(),
    );
    try {
      await witness.acceptNetwork('a'.repeat(64), 1000);
      if (fault !== 'missing')
        await witness.capture(
          [
            process.execPath,
            '-e',
            `console.log('time="2026-10-27T00:00:00Z" level=debug msg="Created container server (ID: ${'b'.repeat(64)})"')`,
          ],
          ['server'],
          helperEnvironment(selectedHelpers),
        );
      if (fault === 'none') expect(await witness.requireNode('server')).toBe('b'.repeat(64));
      else
        await rejects(
          witness.requireNode('server'),
          fault === 'missing'
            ? /in-progress creator/
            : fault === 'image' || fault === 'effective-id'
              ? /Docker runtime/
              : /creator observation/,
        );
    } finally {
      await witness.stop();
    }
  });
}

it('Task37 actual forward witness refuses historical plan before retaining any resource record', async () => {
  const directory = await scratchAsync('historical-forward-');
  const identity = {
    labId: 'c123456789abcdef',
    attemptId: '11111111-1111-4111-8111-111111111111',
    daemonId: 'daemon-1',
  };
  await createCreationAttempt(directory, identity);
  const captured = type({ files: 'Record<string,string>' }).assert(
    await Bun.file(join(import.meta.dir, 'fixtures/k3d-creation-v1.json')).json(),
  );
  const plan: unknown = JSON.parse(
    Object.entries(captured.files).find(([name]) => name.endsWith('/plan.json'))![1],
  );
  await rejects(
    createResourceWitness(
      directory,
      directory,
      identity,
      plan,
      () => Promise.reject(new Error('Must not inspect')),
      [process.execPath, '-e', 'setInterval(()=>{},1000)'],
    ).then(async (witness) => {
      await witness.stop();
    }),
  );
  expect(await Bun.file(join(directory, 'creation-binding.json')).exists()).toBe(false);
});

for (const fault of [
  'none',
  'config',
  'reference',
  'name',
  'identity',
  'daemon',
  'inspection',
  'occupied',
  'environment',
]) {
  it(`Task37 callback ${fault === 'none' ? 'retains an exact transient before closure' : `refuses ${fault} before capture resolves`}`, async () => {
    const directory = await scratchAsync('transient-callback-');
    const identity = {
      labId: 'c123456789abcdef',
      attemptId: '11111111-1111-4111-8111-111111111111',
      daemonId: 'daemon-1',
    };
    await createCreationAttempt(directory, identity);
    const id = 'd'.repeat(64);
    const image =
      'ghcr.io/k3d-io/k3d-tools@sha256:f18c1e21aba123fe6ff315c514a0feffc005f587aa3db773e89489c2118842dd';
    const plan = {
      schemaVersion: 2 as const,
      helpers: selectedHelpers,
      endpoint: 'unix:///run/docker.sock',
      daemonId: 'daemon-1',
      profile: 'app' as const,
      network: 'network',
      binds: [],
      expected: [
        {
          name: 'tools',
          image,
          configId: selectedHelpers.tools.configDigest,
          role: 'tools' as const,
          temporary: true,
        },
      ],
    };
    const forward = imagePlan(plan);
    let daemonCalls = 0;
    const docker = (arguments_: readonly string[]): Promise<string> => {
      const capabilities = capabilitiesReply(arguments_);
      if (capabilities !== undefined) return Promise.resolve(capabilities);
      if (arguments_[0] === 'info')
        return Promise.resolve(fault === 'daemon' && ++daemonCalls > 1 ? 'foreign' : 'daemon-1');
      if (fault === 'inspection') return Promise.reject(new Error('Container disappeared'));
      return Promise.resolve(
        JSON.stringify({
          id: fault === 'identity' ? '9'.repeat(64) : id,
          name: fault === 'name' ? '/foreign' : '/tools',
          image:
            fault === 'config' ? 'sha256:' + '9'.repeat(64) : selectedHelpers.tools.manifestDigest,
          manifest: {
            mediaType: 'application/vnd.oci.image.manifest.v1+json',
            digest: selectedHelpers.tools.manifestDigest,
            size: 610,
            platform: { os: 'linux', architecture: 'amd64' },
          },
          configuredImage: fault === 'reference' ? 'foreign:tools' : image,
          networks: { lab: { NetworkID: 'a'.repeat(64) } },
          mounts: [],
        }),
      );
    };
    const event = {
      kind: 'network',
      action: 'create',
      id: 'a'.repeat(64),
      time: '1',
      name: 'network',
      container: '',
      destination: '',
      driver: '',
      image: '',
    };
    const witness = await createResourceWitness(
      directory,
      directory,
      identity,
      forward,
      docker,
      [
        process.execPath,
        '-e',
        `console.log(${JSON.stringify(JSON.stringify(event))});setInterval(()=>{},1000)`,
      ],
      await imageSource(),
    );
    try {
      await witness.acceptNetwork('a'.repeat(64));
      const path = join(witness.path, `observation-${id}.json`);
      if (fault === 'occupied') await Bun.write(path, 'occupied');
      const capture = witness.capture(
        [
          process.execPath,
          '-e',
          `console.log('time="2026-10-27T00:00:00Z" level=debug msg="Created container tools (ID: ${id})"')`,
        ],
        ['tools'],
        {
          ...helperEnvironment(selectedHelpers),
          ...(fault === 'environment' ? { K3D_IMAGE_TOOLS: 'foreign:tools' } : {}),
        },
      );
      if (fault === 'none') {
        await capture;
        expect(await Bun.file(path).json()).toMatchObject({
          id,
          configuredImage: image,
          image: selectedHelpers.tools.manifestDigest,
          schemaVersion: 3,
        });
      } else await rejects(capture);
      expect(await Bun.file(join(witness.path, 'creator-0000.json')).exists()).toBe(
        fault !== 'environment',
      );
    } finally {
      await witness.stop();
    }
  });
}

it('Task44 actual forward witness refuses synthetic version2 before retaining records', async () => {
  const directory = await scratchAsync('version2-forward-');
  const identity = {
    labId: 'c123456789abcdef',
    attemptId: '11111111-1111-4111-8111-111111111111',
    daemonId: 'daemon-1',
  };
  await createCreationAttempt(directory, identity);
  const plan = {
    schemaVersion: 2,
    helpers: selectedHelpers,
    endpoint: 'unix:///run/docker.sock',
    daemonId: 'daemon-1',
    profile: 'app',
    network: 'network',
    expected: [
      {
        name: 'registry',
        image: 'registry:2',
        configId: 'sha256:' + 'e'.repeat(64),
        role: 'registry',
        temporary: false,
      },
    ],
    binds: [],
  };
  await rejects(
    createResourceWitness(
      directory,
      directory,
      identity,
      plan,
      () => Promise.reject(new Error('Must not inspect')),
      [process.execPath, '-e', 'setInterval(()=>{},1000)'],
      await imageSource(),
    ).then(async (witness) => {
      await witness.stop();
    }),
  );
  expect(await Bun.file(join(directory, 'creation-binding.json')).exists()).toBe(false);
});

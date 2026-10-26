import { rejects } from 'node:assert/strict';

import { expect, it } from 'bun:test';

import { bindDockerEnvironment, requireCapturedDaemon } from './k3d-resource-runtime';

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
    endpoint: 'unix:///run/docker.sock',
    daemonId: 'daemon-1',
    profile: 'app' as const,
    network: 'network',
    expected: [
      { name: 'registry', image: 'registry:2', role: 'registry' as const, temporary: false },
    ],
    binds: [],
  };
  const witness = await createResourceWitness(
    directory,
    directory,
    identity,
    plan,
    () => Promise.reject(new Error('Unexpected Docker call')),
    [process.execPath, '-e', 'setInterval(()=>{},1000)'],
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

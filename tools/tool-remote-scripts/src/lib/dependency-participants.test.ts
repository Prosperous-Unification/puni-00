import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { inspectDependencyParticipants } from './dependency-participants';
import { topologyFixture } from './dependency-topology.fixture';
import { envLayout } from './env';
import { withLock } from './lock';

async function refuses(pending: Promise<unknown>, message: string): Promise<void> {
  let refused = false;
  try {
    await pending;
  } catch (cause) {
    refused = true;
    expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

function fixture() {
  const stateDir = scratchSync('dependency-participants-');
  const layout = { ...envLayout('prod'), stateDir };
  return { layout, ...topologyFixture() };
}

test('returns only a blocked observation after refreshing retained proofs and every topology', async () => {
  const host = fixture();
  let reads = 0;
  const observed = await inspectDependencyParticipants(host.layout, host.runner, () => {
    reads += 1;
    return Promise.resolve({ retained: 'current' });
  });
  expect(reads).toBe(2);
  expect(observed.activation).toBe('blocked');
  expect(observed.format).toBe('dependency-participant-observation');
  expect(observed.unresolved).toContain('retained-clients');
  expect(observed.unresolved).toContain('mcp-processes');
  expect(JSON.stringify(observed)).not.toContain('participantProofSha256');
  expect(JSON.stringify(observed)).not.toContain('never-print-this');
});

for (const changed of [
  'retained proof',
  'restart policy',
  'Caddy alternate upstream',
  'process identity',
]) {
  test(`refuses a changed ${changed} before returning the observation`, async () => {
    const host = fixture();
    let reads = 0;
    await refuses(
      inspectDependencyParticipants(host.layout, host.runner, () => {
        reads += 1;
        if (reads === 2) {
          if (changed === 'restart policy') host.container.HostConfig.RestartPolicy.Name = 'no';
          if (changed === 'Caddy alternate upstream')
            host.config.apps.http.servers.public.routes[1].handle[0].upstreams[0].dial =
              'wbs-caddy-1:8888';
          if (changed === 'process identity')
            host.container.State.StartedAt = '2026-10-23T00:01:00Z';
        }
        return Promise.resolve({ retained: changed === 'retained proof' ? reads : 1 });
      }),
      'changed',
    );
  });
}

test('refuses missing retained proof before any topology work', async () => {
  const host = fixture();
  await refuses(
    inspectDependencyParticipants(host.layout, host.runner, () =>
      Promise.reject(new Error('retained proof absent')),
    ),
    'retained proof absent',
  );
});

test('refuses a held real selected-environment deploy lock', async () => {
  const host = fixture();
  await withLock(`${host.layout.stateDir}/deploy.lock`, async () => {
    await refuses(
      inspectDependencyParticipants(host.layout, host.runner, () =>
        Promise.resolve({ retained: true }),
      ),
      'deploy lock held',
    );
  });
});

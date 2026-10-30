import { expect, test } from 'bun:test';

import { inspectDependencyTopology } from './dependency-topology';
import { topologyFixture as fixture } from './dependency-topology.fixture';

const id = 'a'.repeat(64);
const networkId = 'b'.repeat(64);

async function refuses(pending: Promise<unknown>, message?: string): Promise<void> {
  let refused = false;
  try {
    await pending;
  } catch (cause) {
    refused = true;
    if (message !== undefined) expect(String(cause)).toContain(message);
  }
  expect(refused).toBe(true);
}

test('observes all Docker identities and every Caddy upstream without disclosing configuration secrets', async () => {
  const host = fixture();
  const observed = await inspectDependencyTopology(host.runner);
  expect(observed.containers.map((container) => container.id)).toEqual([id]);
  expect(observed.networks.map((network) => network.id)).toEqual([networkId]);
  expect(observed.caddy.upstreams).toEqual([
    'wbs-caddy-1:3100',
    'wbs-caddy-1:3300',
    'wbs-caddy-1:9999',
  ]);
  expect(observed.containers[0]?.processes).toEqual([{ pid: 123, command: 'caddy' }]);
  expect(JSON.stringify(observed)).not.toContain('never-print-this');
});

for (const [name, mutate] of [
  [
    'missing container',
    (host: ReturnType<typeof fixture>, args: string[]) => {
      if (args[0] === 'inspect') host.container.Id = 'd'.repeat(64);
    },
  ],
  [
    'missing network identity',
    (host: ReturnType<typeof fixture>, args: string[]) => {
      if (args[0] === 'network') host.network.Id = '';
    },
  ],
  [
    'unreadable inventory',
    (_host: ReturnType<typeof fixture>, args: string[]) => {
      if (args[0] === 'ps') throw new Error('inventory unreadable');
    },
  ],
  [
    'missing edge',
    (host: ReturnType<typeof fixture>, args: string[]) => {
      if (args[0] === 'inspect') host.container.Name = '/other';
    },
  ],
  [
    'invalid process table',
    (_host: ReturnType<typeof fixture>, args: string[]) => {
      if (args[0] === 'top') throw new Error('process table unreadable');
    },
  ],
] as const) {
  test(`refuses ${name} through the production inventory path`, async () => {
    const host = fixture();
    host.inject((args) => {
      mutate(host, args);
    });
    await refuses(inspectDependencyTopology(host.runner));
  });
}

test('refuses reverse proxies whose dynamic targets cannot be enumerated', async () => {
  const host = fixture();
  host.config.apps.http.servers.public.routes[0].handle[0].upstreams[0].dial =
    '{http.request.host}:3100';
  await refuses(inspectDependencyTopology(host.runner), 'upstream');
});

test('refuses source-run dev rather than claiming its bundled MCP is excluded', async () => {
  const host = fixture();
  host.containers.push({ ...host.container, Id: 'd'.repeat(64), Name: '/wbs-dev-src' });
  await refuses(inspectDependencyTopology(host.runner), 'source-run');
});

test('refuses unresolved alternate upstream despite a valid primary route', async () => {
  const host = fixture();
  host.config.apps.http.servers.public.routes[1].handle[0].upstreams[0].dial = 'unknown:9999';
  await refuses(inspectDependencyTopology(host.runner), 'upstream participant');
});

test('refuses unknown network members instead of dropping them from the census', async () => {
  const host = fixture();
  host.network.Containers['d'.repeat(64)] = {};
  await refuses(inspectDependencyTopology(host.runner), 'network participant');
});

test('refuses a process census that omits the inspected init PID', async () => {
  const host = fixture();
  host.container.State.Pid = 456;
  await refuses(inspectDependencyTopology(host.runner), 'process identity');
});

test('refuses unknown Caddy handlers rather than assuming their ingress effects', async () => {
  const host = fixture();
  host.config.apps.http.servers.public.routes[1].handle[0].handler = 'forward_proxy';
  await refuses(inspectDependencyTopology(host.runner), 'Caddy handler');
});

test('refuses dynamic upstream selection even alongside valid static upstreams', async () => {
  const host = fixture();
  Object.assign(host.config.apps.http.servers.public.routes[1].handle[0], {
    dynamic_upstreams: { source: 'srv' },
  });
  await refuses(inspectDependencyTopology(host.runner), 'dynamic upstream');
});

test('refuses an unrecognized Caddy app that could add another ingress surface', async () => {
  const host = fixture();
  Object.assign(host.config.apps, { layer4: {} });
  await refuses(inspectDependencyTopology(host.runner), 'Caddy application');
});

for (const override of ['ExtraHosts', 'Dns', 'DnsOptions', 'DnsSearch'] as const) {
  test(`refuses edge ${override} overrides that invalidate observed Docker resolution`, async () => {
    const host = fixture();
    host.container.HostConfig[override] = ['override'];
    await refuses(inspectDependencyTopology(host.runner), 'DNS or hosts override');
  });
}

test('refuses proxy transport modules that can forward outside the observed targets', async () => {
  const host = fixture();
  Object.assign(host.config.apps.http.servers.public.routes[1].handle[0], {
    transport: { protocol: 'unrecognized-forwarder' },
  });
  await refuses(inspectDependencyTopology(host.runner), 'proxy transport');
});

test('refuses a target alias advertised only on a network the edge cannot access', async () => {
  const host = fixture();
  const targetId = 'd'.repeat(64);
  const privateId = 'e'.repeat(64);
  const target = structuredClone(host.container);
  target.Id = targetId;
  target.Name = '/target';
  Object.assign(target.NetworkSettings.Networks, {
    private: { NetworkID: privateId, Aliases: ['private-only'] },
  });
  host.containers.push(target);
  host.networks.push({ Id: privateId, Name: 'private', Containers: { [targetId]: {} } });
  host.config.apps.http.servers.public.routes[1].handle[0].upstreams[0].dial = 'private-only:9999';
  await refuses(inspectDependencyTopology(host.runner), 'upstream participant');
});

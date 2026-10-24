import type { RunDocker } from './docker-deadline';

const id = 'a'.repeat(64);
const networkId = 'b'.repeat(64);

export function topologyFixture() {
  const container = {
    Id: id,
    Name: '/wbs-caddy-1',
    Image: `sha256:${'c'.repeat(64)}`,
    Config: { Env: ['SECRET=never-print-this'], Labels: null },
    State: { Running: true, Pid: 123, StartedAt: '2026-10-23T00:00:00Z' },
    HostConfig: {
      RestartPolicy: { Name: 'always', MaximumRetryCount: 0 },
      ExtraHosts: [] as string[],
      Dns: [] as string[],
      DnsOptions: [] as string[],
      DnsSearch: [] as string[],
    },
    NetworkSettings: { Networks: { 'wbs-net': { NetworkID: networkId } } },
  };
  const containers = [container];
  const network = { Id: networkId, Name: 'wbs-net', Containers: { [id]: {} } };
  const networks = [network];
  const config = {
    apps: {
      http: {
        servers: {
          public: {
            routes: [
              {
                match: [{ host: ['wbs.bulletpoints.club'] }],
                handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'wbs-caddy-1:3100' }] }],
              },
              {
                handle: [
                  {
                    handler: 'reverse_proxy',
                    upstreams: [{ dial: 'wbs-caddy-1:9999' }, { dial: 'wbs-caddy-1:3300' }],
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
  let fault: (args: string[]) => void = () => undefined;
  const runner: RunDocker = async (args) => {
    await Promise.resolve();
    fault(args);
    if (args[0] === 'ps') return containers.map((entry) => entry.Id).join('\n');
    if (args[0] === 'inspect') return JSON.stringify(containers);
    if (args[0] === 'network' && args[1] === 'ls')
      return networks.map((entry) => entry.Id).join('\n');
    if (args[0] === 'network' && args[1] === 'inspect') return JSON.stringify(networks);
    if (args[0] === 'top') return 'PID COMMAND\n123 caddy\n';
    if (args[0] === 'exec' && args[1] === id && args.at(-1) === 'http://127.0.0.1:2019/config/')
      return JSON.stringify(config);
    throw new Error(`forbidden or unexpected Docker operation ${args.join(' ')}`);
  };
  return {
    container,
    containers,
    network,
    networks,
    config,
    runner,
    inject: (next: typeof fault) => {
      fault = next;
    },
  };
}

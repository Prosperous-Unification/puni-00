import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  type HostRender,
  judgeBastion,
  judgeHostRenders,
  judgeSeparatedFirewall,
  judgeServerConfig,
} from './node-access';

const fixtures = join(import.meta.dir, 'fixtures/node-access');
const read = (name: string) => readFile(join(fixtures, name), 'utf8');

const serverVariables = {
  ansible_host: '10.10.1.11',
  puni_node_ip: '10.10.1.11',
  puni_private_interface: 'enp8s0',
  puni_bastion_address: '10.10.1.12',
  puni_tailnet_interface: 'tailscale0',
  puni_node_capabilities: ['control-plane', 'platform-services'],
  puni_public_ports: [],
  puni_ci_private_addresses: [],
  puni_otel_gateway_node_ports: [30417, 30419],
  puni_console_account: 'puni-console',
};

async function server(
  edit: {
    firewall?: (text: string) => string;
    config?: (text: string) => string;
    console?: (text: string) => string;
  } = {},
): Promise<HostRender> {
  const keep = (text: string) => text;
  return {
    inventory: 'inventory/production-hosts.yml',
    host: 'm1plat1',
    groups: ['k3s_bootstrap_servers'],
    variables: serverVariables,
    files: {
      'firewall.nft': (edit.firewall ?? keep)(await read('m1plat1.nft')),
      'k3s-server.yaml': (edit.config ?? keep)(await read('m1plat1-server.yaml.txt')),
      'sshd-console.conf': (edit.console ?? keep)(await read('m1plat1-sshd-console.conf')),
    },
  };
}

async function bastion(
  edit: { sshd?: (text: string) => string; nft?: (text: string) => string } = {},
  probers: readonly string[] = [],
): Promise<HostRender> {
  const keep = (text: string) => text;
  return {
    inventory: 'inventory/production-hosts.yml',
    host: 'm2bast1',
    groups: ['bastion'],
    variables: { puni_bastion_probers: probers, puni_console_account: 'puni-console' },
    files: {
      'bastion-sshd.conf': (edit.sshd ?? keep)(await read('m2bast1-sshd.conf')),
      'bastion.nft': (edit.nft ?? keep)(await read('m2bast1.nft')),
    },
  };
}

const nodes = { nodeAddresses: ['10.10.1.11'] };
const replace = (from: string, to: string) => (text: string) => {
  if (!text.includes(from)) throw new Error(`fixture lacks ${from}`);
  return text.replace(from, to);
};

describe('the k3s server configuration', () => {
  it('accepts the committed platform-services and existing servers', async () => {
    expect(judgeServerConfig(await server())).toEqual([]);
    expect(
      judgeServerConfig({
        inventory: 'inventory/production-existing-hosts.yml',
        host: 'h4claw',
        groups: ['k3s_bootstrap_servers'],
        variables: { puni_node_capabilities: ['control-plane', 'product', 'ingress'] },
        files: { 'k3s-server.yaml': await read('h4claw-server.yaml.txt') },
      }),
    ).toEqual([]);
  });

  it('refuses a platform-services server without the platform taint', async () => {
    expect(
      judgeServerConfig(
        await server({ config: replace('  - CriticalAddonsOnly=true:NoSchedule\n', '') }),
      ),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 is a platform-services server without the platform taint',
    ]);
  });

  it('refuses a server configuration without etcd metrics', async () => {
    expect(
      judgeServerConfig(await server({ config: replace('etcd-expose-metrics: true\n', '') })),
    ).toEqual(['inventory/production-hosts.yml m1plat1 does not expose etcd metrics']);
  });

  it('refuses the plain `=` admission form, which drops NodeRestriction', async () => {
    expect(
      judgeServerConfig(
        await server({
          config: replace(
            'enable-admission-plugins+=PodNodeSelector',
            'enable-admission-plugins=PodNodeSelector',
          ),
        }),
      ),
    ).toContain(
      "inventory/production-hosts.yml m1plat1 replaces the API server's admission plugins, dropping NodeRestriction",
    );
  });

  it('refuses kube-apiserver-arg on a server without platform-services', async () => {
    const render = await server();
    expect(
      judgeServerConfig({
        ...render,
        variables: { puni_node_capabilities: ['control-plane', 'product', 'ingress'] },
      }),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 writes kube-apiserver-arg without platform-services',
      'inventory/production-hosts.yml m1plat1 carries the platform taint without platform-services',
    ]);
  });
});

describe('the firewall of a separated host', () => {
  it('accepts the committed m1plat1 rendering', async () => {
    expect(judgeSeparatedFirewall(await server(), nodes)).toEqual([]);
  });

  it('refuses public SSH kept as "retain SSH recovery"', async () => {
    const render = await server({
      firewall: replace(
        '    tcp dport 22 drop\n',
        '    tcp dport 22 accept comment "retain SSH recovery"\n',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes).join('\n')).toMatch(
      /admits SSH other than from the bastion/,
    );
  });

  it('refuses SSH on the private interface from the whole private range', async () => {
    const render = await server({
      firewall: replace(
        'ip saddr 10.10.1.12 ip daddr 10.10.1.11 tcp dport 22 accept comment',
        'ip saddr 10.10.1.0/24 ip daddr 10.10.1.11 tcp dport 22 accept comment',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes).join('\n')).toMatch(
      /admits SSH other than from the bastion/,
    );
  });

  it('refuses SSH on the tailnet interface', async () => {
    const render = await server({
      firewall: replace(
        '    tcp dport 22 drop\n',
        '    iifname "tailscale0" tcp dport 22 accept\n    tcp dport 22 drop\n',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes).join('\n')).toMatch(
      /admits SSH other than from the bastion/,
    );
  });

  it('refuses cluster ports from a private address that is not a node', async () => {
    const render = await server({
      firewall: replace(
        'iifname "enp8s0" ip saddr @enrolled_ipv4 udp dport 8472 accept',
        'iifname "enp8s0" ip saddr 10.10.1.0/24 udp dport 8472 accept',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes).join('\n')).toMatch(/admits udp dport 8472 from/);
    const withBastion = await server({
      firewall: replace('elements = { 10.10.1.11 }', 'elements = { 10.10.1.11, 10.10.1.12 }'),
    });
    expect(judgeSeparatedFirewall(withBastion, nodes).join('\n')).toMatch(
      /enrolled set is 10\.10\.1\.11,10\.10\.1\.12, not the node addresses 10\.10\.1\.11/,
    );
  });

  it('refuses a bastion that reaches more than sshd', async () => {
    const render = await server({
      firewall: replace(
        '    iifname "enp8s0" ip saddr 10.10.1.12 ct state new drop comment "the bastion reaches sshd alone"\n',
        '',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes)).toEqual([
      "inventory/production-hosts.yml m1plat1 lets the bastion reach more than this host's sshd",
    ]);
  });

  it('refuses a drop that is not limited to new connections', async () => {
    const render = await server({
      firewall: replace(
        '"flannel.1" } ct state new drop comment "public interface"',
        '"flannel.1" } drop comment "public interface"',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes).join('\n')).toMatch(
      /prerouting drops more than new connections/,
    );
  });

  it('refuses public web ports on a host without ingress', async () => {
    const render = await server({
      firewall: replace(
        '    iifname != { "lo", "enp8s0", "tailscale0", "cni0", "flannel.1" } udp dport 41641',
        '    iifname != { "lo", "enp8s0", "tailscale0", "cni0", "flannel.1" } tcp dport { 80, 443 } accept\n    iifname != { "lo", "enp8s0", "tailscale0", "cni0", "flannel.1" } udp dport 41641',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes)).toEqual([
      'inventory/production-hosts.yml m1plat1 accepts public TCP 443, 80, not none',
    ]);
  });

  it('requires 80 and 443 on an ingress host', async () => {
    const render = await server();
    expect(
      judgeSeparatedFirewall(
        {
          ...render,
          variables: {
            ...serverVariables,
            puni_node_capabilities: ['product', 'ingress'],
            puni_public_ports: [80, 443],
          },
        },
        nodes,
      ),
    ).toEqual(['inventory/production-hosts.yml m1plat1 accepts public TCP none, not 443, 80']);
  });

  it('refuses a separated host whose sshd admits the console account', async () => {
    const render = await server({ console: replace('DenyUsers puni-console\n', '') });
    expect(judgeSeparatedFirewall(render, nodes)).toEqual([
      'inventory/production-hosts.yml m1plat1 sshd does not refuse the console account',
    ]);
    const bastionRender = await bastion({ sshd: replace('DenyUsers puni-console\n', '') });
    expect(judgeBastion(bastionRender, ['10.10.1.11'])).toEqual([
      'inventory/production-hosts.yml m2bast1 sshd does not refuse the console account',
    ]);
  });

  it('refuses a public side without the prerouting drop', async () => {
    const render = await server({
      firewall: replace(
        '    iifname != { "lo", "enp8s0", "tailscale0", "cni0", "flannel.1" } ct state new drop comment "public interface"\n',
        '',
      ),
    });
    expect(judgeSeparatedFirewall(render, nodes)).toEqual([
      'inventory/production-hosts.yml m1plat1 prerouting does not end with the public drop',
    ]);
  });
});

describe('the bastion', () => {
  const forwarded = ['10.10.1.11'];

  it('accepts the committed m2bast1 rendering', async () => {
    expect(judgeBastion(await bastion(), forwarded)).toEqual([]);
  });

  it('refuses a PermitOpen entry for a port other than 22', async () => {
    const render = await bastion({
      sshd: replace('PermitOpen 10.10.1.11:22', 'PermitOpen 10.10.1.11:22 10.10.1.11:2222'),
    });
    expect(judgeBastion(render, forwarded)).toContain(
      "inventory/production-hosts.yml m2bast1 jump may open 10.10.1.11:2222, which is not a server's port 22",
    );
  });

  it('refuses a PermitOpen that misses a server of the inventory', async () => {
    expect(judgeBastion(await bastion(), ['10.10.1.11', '10.10.1.13'])).toEqual([
      'inventory/production-hosts.yml m2bast1 jump may open 10.10.1.11:22, not 10.10.1.11:22 10.10.1.13:22',
    ]);
  });

  it('refuses jump forwarding other than local', async () => {
    const render = await bastion({
      sshd: replace('AllowTcpForwarding local', 'AllowTcpForwarding yes'),
    });
    expect(judgeBastion(render, forwarded)).toEqual([
      'inventory/production-hosts.yml m2bast1 jump sets AllowTcpForwarding yes, not AllowTcpForwarding local',
    ]);
  });

  it('refuses passwords left on for some user', async () => {
    const render = await bastion({ sshd: replace('PasswordAuthentication no\n', '') });
    expect(judgeBastion(render, forwarded)).toEqual([
      'inventory/production-hosts.yml m2bast1 sshd does not set PasswordAuthentication no for every user',
    ]);
  });

  it('refuses a public port set other than exactly 22, an empty set included', async () => {
    const extra = await bastion({
      nft: replace('  }\n\n  chain output', '    tcp dport 80 accept\n  }\n\n  chain output'),
    });
    expect(judgeBastion(extra, forwarded).join('\n')).toMatch(
      /serves public ports 22, 80, not exactly 22/,
    );
    const none = await bastion({
      nft: (text) =>
        text
          .split('\n')
          .filter((line) => !line.includes('tcp dport 22 ct state new add'))
          .join('\n'),
    });
    expect(judgeBastion(none, forwarded).join('\n')).toMatch(
      /serves public ports none, not exactly 22/,
    );
  });

  it('refuses public SSH without a per-source limit', async () => {
    const render = await bastion({
      nft: replace(
        'meta nfproto ipv6 tcp dport 22 ct state new add @ssh_sources_ipv6 { ip6 saddr limit rate 10/minute burst 5 packets } accept',
        'meta nfproto ipv6 tcp dport 22 ct state new accept',
      ),
    });
    expect(judgeBastion(render, forwarded)).toEqual([
      'inventory/production-hosts.yml m2bast1 bastion does not limit new public SSH per ip6 source',
    ]);
  });

  it("refuses private SSH from an address other than the prober's", async () => {
    const render = await bastion({
      nft: replace(
        '    ip saddr @private_ipv4 drop',
        '    ip saddr @private_ipv4 tcp dport 22 ct state new accept\n    ip saddr @private_ipv4 drop',
      ),
    });
    expect(judgeBastion(render, forwarded).join('\n')).toMatch(
      /bastion admits private traffic beyond the probers/,
    );
  });
});

describe('every host render', () => {
  it('refuses an empty report and an existing host without its committed firewall', async () => {
    expect(judgeHostRenders([], {})).toEqual(['no static inventory host was rendered']);
    expect(
      judgeHostRenders(
        [
          {
            inventory: 'inventory/production-existing-hosts.yml',
            host: 'h3mon',
            groups: ['k3s_agents'],
            variables: {},
            files: { 'firewall.nft': await read('m1plat1.nft') },
          },
        ],
        {},
      ),
    ).toEqual([
      'inventory/production-existing-hosts.yml h3mon has no committed firewall to compare',
    ]);
  });
});

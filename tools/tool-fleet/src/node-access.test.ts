import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'bun:test';

import {
  type HostRender,
  judgeBastion,
  judgeHostRenders,
  judgeSeparatedFirewall,
  judgeServerConfig,
  readHostRenderGoldens,
} from './node-access';

let goldens: Partial<Record<string, string>> = {};
beforeAll(async () => {
  goldens = await readHostRenderGoldens(join(import.meta.dir, 'fixtures/host-renders'));
});
const golden = (key: string): string => {
  const found = goldens[key];
  if (found === undefined) throw new Error(`no golden ${key}`);
  return found;
};

const serverVariables = {
  ansible_host: '10.10.1.11',
  puni_node_ip: '10.10.1.11',
  puni_private_interface: 'enp8s0',
  puni_public_interfaces: ['enp3s0'],
  puni_bastion_address: '10.10.1.12',
  puni_tailnet_interface: 'tailscale0',
  puni_cluster_cidr: '10.42.0.0/16',
  puni_service_cidr: '10.43.0.0/16',
  puni_node_capabilities: ['control-plane', 'platform-services'],
  puni_public_ports: [],
  puni_ci_private_addresses: [],
  puni_otel_gateway_node_ports: [30417, 30419],
  puni_console_account: 'puni-console',
};
const bastionVariables = {
  puni_bastion_probers: [],
  puni_bastion_private_interface: 'enp8s0',
  puni_private_network: '10.10.1.0/24',
  puni_operator_name: 'puni-fleet',
  puni_console_account: 'puni-console',
};

type Edit = (text: string) => string;
const keep: Edit = (text) => text;
const replace =
  (from: string, to: string): Edit =>
  (text) => {
    if (!text.includes(from)) throw new Error(`golden lacks ${from}`);
    return text.replace(from, to);
  };

function server(edit: { firewall?: Edit; config?: Edit; sshd?: Edit } = {}): HostRender {
  return {
    inventory: 'inventory/production-hosts.yml',
    host: 'm1plat1',
    groups: ['k3s_bootstrap_servers'],
    variables: serverVariables,
    files: {
      'firewall.nft': (edit.firewall ?? keep)(golden('production-hosts/m1plat1/firewall.nft')),
      'k3s-server.yaml': (edit.config ?? keep)(golden('production-hosts/m1plat1/k3s-server.yaml')),
      'sshd-console.conf': (edit.sshd ?? keep)(
        golden('production-hosts/m1plat1/sshd-console.conf'),
      ),
    },
  };
}

function bastion(edit: { sshd?: Edit; nft?: Edit } = {}): HostRender {
  return {
    inventory: 'inventory/production-hosts.yml',
    host: 'm2bast1',
    groups: ['bastion'],
    variables: bastionVariables,
    files: {
      'bastion-sshd.conf': (edit.sshd ?? keep)(
        golden('production-hosts/m2bast1/bastion-sshd.conf'),
      ),
      'bastion.nft': (edit.nft ?? keep)(golden('production-hosts/m2bast1/bastion.nft')),
    },
  };
}

const nodes = { nodeAddresses: ['10.10.1.11'] };
const firewallProblems = (edit: Edit) =>
  judgeSeparatedFirewall(server({ firewall: edit }), nodes).join('\n');
const bastionProblems = (edit: { sshd?: Edit; nft?: Edit }, forwarded = ['10.10.1.11']) =>
  judgeBastion(bastion(edit), forwarded).join('\n');

describe('the k3s server configuration', () => {
  it('accepts the committed platform-services and existing servers', () => {
    expect(judgeServerConfig(server())).toEqual([]);
    expect(
      judgeServerConfig({
        inventory: 'inventory/production-existing-hosts.yml',
        host: 'h4claw',
        groups: ['k3s_bootstrap_servers'],
        variables: { puni_node_capabilities: ['control-plane', 'product', 'ingress'] },
        files: { 'k3s-server.yaml': golden('production-existing-hosts/h4claw/k3s-server.yaml') },
      }),
    ).toEqual([]);
  });

  it('refuses a platform-services server without the taint or etcd metrics', () => {
    expect(
      judgeServerConfig(
        server({ config: replace('  - CriticalAddonsOnly=true:NoSchedule\n', '') }),
      ),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 lacks platform taint as a platform-services server',
    ]);
    expect(
      judgeServerConfig(server({ config: replace('etcd-expose-metrics: true\n', '') })),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 lacks etcd-expose-metrics as a platform-services server',
    ]);
  });

  it('refuses the plain `=` admission form, which drops NodeRestriction', () => {
    expect(
      judgeServerConfig(
        server({
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

  it('refuses the three settings on a server without platform-services', () => {
    expect(
      judgeServerConfig({
        ...server(),
        variables: { puni_node_capabilities: ['control-plane', 'product', 'ingress'] },
      }),
    ).toHaveLength(3);
  });
});

describe('the firewall of a separated host', () => {
  it('accepts the committed m1plat1 rendering', () => {
    expect(judgeSeparatedFirewall(server(), nodes)).toEqual([]);
  });

  it('refuses public SSH kept as "retain SSH recovery"', () => {
    // Proof: replacing the input chain's comparison by `return []` made this pass wrongly
    // (2026-11-22).
    expect(
      firewallProblems(
        replace(
          '    tcp dport 22 drop\n',
          '    tcp dport 22 accept comment "retain SSH recovery"\n',
        ),
      ),
    ).toMatch(/input chain differs at line 4/);
  });

  it('refuses SSH from the whole private range and on the tailnet', () => {
    expect(
      firewallProblems(
        replace(
          'ip saddr 10.10.1.12 ip daddr 10.10.1.11 tcp dport 22 accept comment',
          'ip saddr 10.10.1.0/24 ip daddr 10.10.1.11 tcp dport 22 accept comment',
        ),
      ),
    ).toMatch(/input chain differs at line 3/);
    expect(
      firewallProblems(
        replace(
          '    tcp dport 22 drop\n',
          '    iifname "tailscale0" tcp dport 22 accept\n    tcp dport 22 drop\n',
        ),
      ),
    ).toMatch(/input chain differs at line 4/);
  });

  it('refuses cluster ports or etcd metrics from a private address that is not a node', () => {
    expect(
      firewallProblems(
        replace(
          'iifname "enp8s0" ip saddr @enrolled_ipv4 udp dport 8472 accept',
          'iifname "enp8s0" ip saddr 10.10.1.0/24 udp dport 8472 accept',
        ),
      ),
    ).toMatch(/input chain differs at line 12/);
    expect(firewallProblems(replace('    tcp dport 2381 reject with tcp reset\n', ''))).toMatch(
      /input chain differs at line 8/,
    );
    expect(
      firewallProblems(
        replace('elements = { 10.10.1.11 }', 'elements = { 10.10.1.11, 10.10.1.12 }'),
      ),
    ).toMatch(/set enrolled_ipv4 holds 10\.10\.1\.11, 10\.10\.1\.12, not 10\.10\.1\.11/);
  });

  it('refuses a bastion that reaches more than sshd', () => {
    expect(
      firewallProblems(
        replace(
          '    iifname "enp8s0" ip saddr 10.10.1.12 ct state new drop comment "the bastion reaches sshd alone"\n',
          '',
        ),
      ),
    ).toMatch(/prerouting chain differs at line 7/);
  });

  it('refuses new IPv6 on the private interface', () => {
    expect(
      firewallProblems(
        replace(
          '    iifname "enp8s0" meta nfproto ipv6 ct state new drop comment "the private network is IPv4"\n',
          '',
        ),
      ),
    ).toMatch(/prerouting chain differs at line 4/);
  });

  it('refuses a drop that is not limited to new connections', () => {
    expect(
      firewallProblems(
        replace(
          '{ "enp3s0" } ct state new drop comment "public interface"',
          '{ "enp3s0" } drop comment "public interface"',
        ),
      ),
    ).toMatch(/prerouting chain differs/);
  });

  it('refuses public web ports on a host without ingress, and requires them with ingress', () => {
    expect(
      firewallProblems(
        replace(
          '    iifname { "enp3s0" } udp dport 41641',
          '    iifname { "enp3s0" } tcp dport { 80, 443 } accept\n    iifname { "enp3s0" } udp dport 41641',
        ),
      ),
    ).toMatch(/prerouting chain differs/);
    expect(
      judgeSeparatedFirewall(
        {
          ...server(),
          variables: {
            ...serverVariables,
            puni_node_capabilities: ['product', 'ingress'],
            puni_public_ports: [80, 443],
          },
        },
        nodes,
      ).join('\n'),
    ).toMatch(/prerouting chain differs/);
  });

  it('refuses a public side without the prerouting drop, or one wider than declared', () => {
    expect(
      firewallProblems(
        replace('    iifname { "enp3s0" } ct state new drop comment "public interface"\n', ''),
      ),
    ).toMatch(/prerouting chain differs/);
    expect(
      judgeSeparatedFirewall(
        {
          ...server(),
          variables: { ...serverVariables, puni_public_interfaces: ['enp3s0', 'eth1'] },
        },
        nodes,
      ).join('\n'),
    ).toMatch(/prerouting chain differs/);
  });

  it('refuses a separated host whose sshd admits passwords or the console account', () => {
    expect(
      judgeSeparatedFirewall(server({ sshd: replace('DenyUsers puni-console\n', '') }), nodes),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 sshd drop-in differs at line 3: expected "DenyUsers puni-console", found "(end)"',
    ]);
    expect(
      judgeSeparatedFirewall(server({ sshd: replace('PasswordAuthentication no\n', '') }), nodes),
    ).toHaveLength(1);
  });
});

describe('the bastion', () => {
  it('accepts the committed m2bast1 rendering', () => {
    expect(judgeBastion(bastion(), ['10.10.1.11'])).toEqual([]);
  });

  it('refuses a PermitOpen entry for a port other than 22', () => {
    expect(
      bastionProblems({
        sshd: replace('PermitOpen 10.10.1.11:22', 'PermitOpen 10.10.1.11:22 10.10.1.11:2222'),
      }),
    ).toContain("jump may open 10.10.1.11:2222, which is not a server's port 22");
  });

  it('refuses a PermitOpen that misses a server of the inventory', () => {
    expect(bastionProblems({}, ['10.10.1.11', '10.10.1.13'])).toMatch(
      /sshd drop-in differs at line 15/,
    );
  });

  it('refuses jump forwarding other than local, root logins and extra users', () => {
    for (const edit of [
      replace('AllowTcpForwarding local', 'AllowTcpForwarding yes'),
      replace('PermitRootLogin no', 'PermitRootLogin prohibit-password'),
      replace('AllowUsers puni-fleet jump', 'AllowUsers puni-fleet jump root'),
      replace('PubkeyAuthentication yes\n', ''),
      replace('PasswordAuthentication no\n', ''),
    ]) {
      expect(bastionProblems({ sshd: edit })).toMatch(/sshd drop-in differs/);
    }
  });

  it('refuses a public port set other than exactly 22, an empty set included', () => {
    expect(
      bastionProblems({
        nft: replace('  }\n\n  chain output', '    tcp dport 80 accept\n  }\n\n  chain output'),
      }),
    ).toMatch(/input chain differs at line 10/);
    expect(
      bastionProblems({
        nft: (text) =>
          text
            .split('\n')
            .filter((line) => !line.includes('tcp dport 22 ct state new add'))
            .join('\n'),
      }),
    ).toMatch(/input chain differs at line 8/);
  });

  it('refuses public SSH without a per-source limit', () => {
    expect(
      bastionProblems({
        nft: replace(
          'meta nfproto ipv6 tcp dport 22 ct state new add @ssh_sources_ipv6 { ip6 saddr limit rate 10/minute burst 5 packets } accept',
          'meta nfproto ipv6 tcp dport 22 ct state new accept',
        ),
      }),
    ).toMatch(/input chain differs at line 9/);
  });

  it("refuses private SSH from an address other than the prober's, and private IPv6", () => {
    expect(
      bastionProblems({
        nft: replace(
          '    ip saddr @private_ipv4 drop',
          '    ip saddr @private_ipv4 tcp dport 22 ct state new accept\n    ip saddr @private_ipv4 drop',
        ),
      }),
    ).toMatch(/input chain differs at line 7/);
    expect(
      bastionProblems({
        nft: replace(
          '    iifname "enp8s0" meta nfproto ipv6 drop comment "the private network is IPv4"\n',
          '',
        ),
      }),
    ).toMatch(/input chain differs at line 3/);
  });
});

describe('every host render', () => {
  it('accepts the committed renders and refuses any byte that differs', () => {
    const platformGoldens = Object.fromEntries(
      Object.entries(goldens).filter(([key]) => key.startsWith('production-hosts/')),
    );
    expect(judgeHostRenders([server(), bastion()], platformGoldens)).toEqual([]);
    expect(
      judgeHostRenders([server({ firewall: (text) => `${text}\n` }), bastion()], platformGoldens),
    ).toEqual([
      'inventory/production-hosts.yml m1plat1 firewall.nft differs from its committed golden',
    ]);
  });

  it('refuses an empty report and a host whose rendered files differ from the committed set', () => {
    expect(judgeHostRenders([], {})).toEqual(['no static inventory host was rendered']);
    expect(
      judgeHostRenders(
        [
          {
            inventory: 'inventory/production-existing-hosts.yml',
            host: 'h3mon',
            groups: ['k3s_agents'],
            variables: {},
            files: { 'firewall.nft': golden('production-existing-hosts/h3mon/firewall.nft') },
          },
        ],
        {},
      ),
    ).toEqual([
      'inventory/production-existing-hosts.yml h3mon renders firewall.nft, but nothing is committed',
    ]);
  });
});

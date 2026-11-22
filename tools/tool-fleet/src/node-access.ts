import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Judges the files the node and bastion roles render for each host of a static inventory
 * (`infra/ansible/tests/render-hosts.yml`): the k3s server configuration, the fleet firewall, the
 * servers' sshd drop-in and the bastion's sshd drop-in and firewall (openspec/changes/
 * separate-node-roles, slices 1.2, 1.8 and 1.9). `tool-fleet:check` runs them on the controller's
 * renders and `infra/ansible/tests/node-roles.test.ts` on renders of the committed templates.
 *
 * Two layers: every rendered file must equal its committed golden byte for byte
 * ({@link judgeHostRenders}), and on top of that each critical chain and option set must be
 * exactly the one the inventory's facts call for, in order, so a golden re-recorded around a
 * wide-open rule still fails. Each judge returns problems; an empty list is a pass. A file the host
 * should have and lacks is a problem, never a skip.
 */

/** One host's renders and the inventory facts the judges compare them with. */
export interface HostRender {
  readonly inventory: string;
  readonly host: string;
  readonly groups: readonly string[];
  readonly variables: Readonly<Record<string, unknown>>;
  /** File name under the host's render directory to its text; a file not rendered is absent. */
  readonly files: Readonly<Partial<Record<string, string>>>;
}

const serverGroups = ['k3s_bootstrap_servers', 'k3s_join_servers'];
const k3sGroups = [...serverGroups, 'k3s_agents'];
const neighbourDiscovery =
  'icmpv6 type { nd-neighbor-solicit, nd-neighbor-advert, nd-router-solicit, nd-router-advert } accept';

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function capabilitiesOf(render: HostRender): string[] {
  return stringList(render.variables['puni_node_capabilities']);
}

/** The lines of one `chain <name> { ... }` block, trimmed, with comments and blanks dropped. */
function chainRules(rendered: string, name: string): string[] | null {
  const lines = rendered.split('\n').map((line) => line.trim());
  const start = lines.indexOf(`chain ${name} {`);
  if (start < 0) return null;
  const rules: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line === '}') return rules;
    if (line !== '' && !line.startsWith('#')) rules.push(line.replace(/ comment "[^"]*"$/, ''));
  }
  return null;
}

/** The elements of `set <name>`, or null when the set or its elements line is absent. */
function setElements(rendered: string, name: string): string[] | null {
  const lines = rendered.split('\n').map((line) => line.trim());
  const start = lines.indexOf(`set ${name} {`);
  if (start < 0) return null;
  for (const line of lines.slice(start + 1)) {
    if (line === '}') return null;
    const match = /^elements = \{ (.*) \}$/.exec(line);
    if (match !== null) return match[1].split(', ');
  }
  return null;
}

/** The chains a ruleset declares, in order. */
function chainNames(rendered: string): string[] {
  return [...rendered.matchAll(/^\s*chain (\S+) \{$/gm)].map((match) => match[1]);
}

/** Compares two ordered lists; the problem names the first line that differs. */
function compareLines(
  where: string,
  label: string,
  actual: readonly string[] | null,
  expected: readonly string[],
): string[] {
  if (actual === null) return [`${where} has no ${label}`];
  for (let index = 0; index < Math.max(actual.length, expected.length); index += 1) {
    if (actual[index] !== expected[index]) {
      return [
        `${where} ${label} differs at line ${String(index + 1)}: expected ${JSON.stringify(expected[index] ?? '(end)')}, found ${JSON.stringify(actual[index] ?? '(end)')}`,
      ];
    }
  }
  return [];
}

function compareSet(
  where: string,
  rendered: string,
  name: string,
  expected: readonly string[],
): string[] {
  const elements = setElements(rendered, name);
  return JSON.stringify(elements) === JSON.stringify(expected)
    ? []
    : [
        `${where} set ${name} holds ${elements === null ? 'nothing' : elements.join(', ')}, not ${expected.join(', ')}`,
      ];
}

function sshdLines(rendered: string | undefined): string[] | null {
  if (rendered === undefined) return null;
  return rendered
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * `etcd-expose-metrics`, the `CriticalAddonsOnly` taint (R25) and the `+=` PodNodeSelector entry
 * that keeps k3s's own `NodeRestriction` are written by a `platform-services` server alone; any
 * other server writes none of the three, so the existing servers keep their configuration.
 */
export function judgeServerConfig(render: HostRender): string[] {
  const where = `${render.inventory} ${render.host}`;
  const config = render.files['k3s-server.yaml'];
  if (config === undefined) return [`${where} has no rendered k3s server configuration`];
  const lines = config.split('\n');
  const platform = capabilitiesOf(render).includes('platform-services');
  const problems: string[] = [];
  const present = {
    'etcd-expose-metrics': lines.includes('etcd-expose-metrics: true'),
    'platform taint': lines.includes('  - CriticalAddonsOnly=true:NoSchedule'),
    'kube-apiserver-arg': lines.includes('kube-apiserver-arg:'),
  };
  // Proof: removing the template's taint line, and writing etcd-expose-metrics for every server,
  // each made node-roles.test.ts `renders the platform taint and admission plugin on m1plat1
  // alone` fail; node-access.test.ts refuses a render without the taint or the etcd line
  // (2026-11-22).
  for (const [name, found] of Object.entries(present)) {
    if (found !== platform) {
      problems.push(
        `${where} ${platform ? 'lacks' : 'writes'} ${name} ${platform ? 'as a' : 'without'} platform-services server`,
      );
    }
  }
  const argument = lines.indexOf('kube-apiserver-arg:');
  if (platform && lines[argument + 1] !== '  - enable-admission-plugins+=PodNodeSelector') {
    problems.push(`${where} does not append PodNodeSelector to the API server's plugins`);
  }
  // Proof: writing `=` in the template made node-roles.test.ts `renders the platform taint and
  // admission plugin on m1plat1 alone` fail (2026-11-22).
  if (lines.some((line) => line.includes('enable-admission-plugins='))) {
    problems.push(`${where} replaces the API server's admission plugins, dropping NodeRestriction`);
  }
  return problems;
}

/** Facts of the inventory a separated firewall is compared with. */
export interface FirewallFacts {
  /** The private addresses of the inventory's k3s hosts. */
  readonly nodeAddresses: readonly string[];
}

/**
 * The exact input and prerouting chains, and sets, of a host of a separated inventory (one that
 * sets `puni_public_ports`): SSH from the bastion on the private interface alone; the API on the
 * tailnet; etcd's metrics, the cluster's ports and VXLAN from the enrolled nodes and the pod
 * network alone; and a stateful prerouting chain at -150 that drops new IPv6 on the private
 * interface, limits the bastion to this host's `sshd`, keeps private addresses that are not nodes
 * off the cluster and service CIDRs and the NodePorts (the CI server to the otel-gateway's on this
 * host excepted), and drops every new connection on the declared public interfaces but the host's
 * public ports (80 and 443 with `ingress`, none without) and Tailscale's UDP port (decision 12).
 * The servers' sshd drop-in (keys only, the console account denied) is compared too.
 */
export function judgeSeparatedFirewall(render: HostRender, facts: FirewallFacts): string[] {
  const where = `${render.inventory} ${render.host}`;
  const rendered = render.files['firewall.nft'];
  if (rendered === undefined) return [`${where} has no rendered firewall`];
  const variables = render.variables;
  const privateInterface = text(variables['puni_private_interface']);
  const tailnet = text(variables['puni_tailnet_interface']);
  const bastion = text(variables['puni_bastion_address']);
  const node = text(variables['puni_node_ip']);
  const ingress = capabilitiesOf(render).includes('ingress');
  const declaredPorts = stringList(variables['puni_public_ports']);
  const ci = stringList(variables['puni_ci_private_addresses']);
  const otel = stringList(variables['puni_otel_gateway_node_ports']);
  const publicSide = `iifname { ${stringList(variables['puni_public_interfaces'])
    .map((name) => `"${name}"`)
    .join(', ')} }`;
  const priv = `iifname "${privateInterface}"`;
  const problems: string[] = [];

  if (JSON.stringify([...declaredPorts].sort()) !== JSON.stringify(ingress ? ['443', '80'] : [])) {
    problems.push(
      `${where} declares public ports ${declaredPorts.join(', ') || 'none'}; ${ingress ? 'an ingress host serves 80 and 443' : 'a host without ingress serves none'}`,
    );
  }
  if (facts.nodeAddresses.includes(bastion)) {
    problems.push(`${where} enrolls the bastion ${bastion}, which has public SSH`);
  }
  problems.push(
    ...compareLines(where, 'chain list', chainNames(rendered), ['input', 'prerouting']),
    ...compareSet(where, rendered, 'enrolled_ipv4', facts.nodeAddresses),
    ...compareSet(where, rendered, 'cluster_ipv4', [text(variables['puni_cluster_cidr'])]),
    ...compareSet(where, rendered, 'service_ipv4', [text(variables['puni_service_cidr'])]),
    ...(ci.length > 0 ? compareSet(where, rendered, 'ci_ipv4', ci) : []),
  );
  // Proof: skipping this comparison made six node-access.test.ts cases fail, among them `refuses
  // public SSH kept as "retain SSH recovery"`; each of those template faults, and SSH or 8472
  // from the private range or a tailnet SSH accept, also failed node-roles.test.ts `renders
  // every host byte-equal to its committed golden` (2026-11-22).
  problems.push(
    ...compareLines(where, 'input chain', chainRules(rendered, 'input'), [
      'type filter hook input priority -5; policy accept;',
      'iifname "lo" accept',
      `${priv} ip saddr ${bastion} ip daddr ${node} tcp dport 22 accept`,
      'tcp dport 22 drop',
      `iifname "${tailnet}" tcp dport 6443 accept`,
      'iifname { "cni0", "flannel.1" } ip saddr @cluster_ipv4 tcp dport 2381 accept',
      `${priv} ip saddr @enrolled_ipv4 tcp dport 2381 accept`,
      'tcp dport 2381 reject with tcp reset',
      'iifname { "cni0", "flannel.1" } ip saddr @cluster_ipv4 tcp dport { 6443, 10250 } accept',
      `${priv} ip saddr @enrolled_ipv4 tcp dport { 6443, 2379, 2380, 10250 } accept`,
      'tcp dport { 6443, 2379, 2380, 10250 } reject with tcp reset',
      `${priv} ip saddr @enrolled_ipv4 udp dport 8472 accept`,
      'udp dport 8472 drop',
    ]),
  );
  // Proof: in the template, dropping the bastion rule, `ct state new` from the public drop, the
  // public drop or the IPv6 drop, or rendering 80 and 443 for every host, each failed
  // node-roles.test.ts `renders every host byte-equal to its committed golden`; dropping
  // `ip daddr` from the CI accept failed its `renders a separated firewall the judge accepts`
  // case, which this list alone judges. node-access.test.ts refuses each of the first five
  // here alone (2026-11-22).
  problems.push(
    ...compareLines(where, 'prerouting chain', chainRules(rendered, 'prerouting'), [
      'type filter hook prerouting priority -150; policy accept;',
      'ct state established,related accept',
      neighbourDiscovery,
      `${priv} meta nfproto ipv6 ct state new drop`,
      'ct state invalid drop',
      `${priv} ip saddr ${bastion} ip daddr ${node} tcp dport 22 accept`,
      `${priv} ip saddr ${bastion} ct state new drop`,
      ...(ci.length > 0
        ? [`${priv} ip saddr @ci_ipv4 ip daddr ${node} tcp dport { ${otel.join(', ')} } accept`]
        : []),
      `${priv} ip saddr != @enrolled_ipv4 ip daddr @cluster_ipv4 ct state new drop`,
      `${priv} ip saddr != @enrolled_ipv4 ip daddr @service_ipv4 ct state new drop`,
      `${priv} ip saddr != @enrolled_ipv4 tcp dport 30000-32767 ct state new drop`,
      `${priv} ip saddr != @enrolled_ipv4 udp dport 30000-32767 ct state new drop`,
      ...(ingress ? [`${publicSide} tcp dport { 80, 443 } accept`] : []),
      `${publicSide} udp dport 41641 accept`,
      `${publicSide} ct state new drop`,
    ]),
  );
  // Proof: dropping the DenyUsers line from sshd-console.conf.j2 failed node-roles.test.ts
  // `renders every host byte-equal to its committed golden`; node-access.test.ts refuses a
  // drop-in without it, or without `PasswordAuthentication no`, here alone (2026-11-22).
  problems.push(
    ...compareLines(where, 'sshd drop-in', sshdLines(render.files['sshd-console.conf']), [
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      `DenyUsers ${text(variables['puni_console_account'])}`,
    ]),
  );
  return problems;
}

/**
 * The bastion's `sshd` drop-in and firewall (R55, slice 1.9), compared exactly. Every user: keys
 * only, no root, `MaxAuthTries 6`, `AllowUsers` the operator and `jump`, the console account
 * denied. `jump`: no TTY, agent, X11, stream-local or tunnel forwarding, `AllowTcpForwarding
 * local`, and `PermitOpen` to exactly the forwarded hosts' port 22. The firewall drops by default
 * and drops IPv6 on the private interface, admits private TCP 22 from the probers alone, and
 * public TCP 22 alone, each family through a per-source meter.
 */
export function judgeBastion(render: HostRender, forwardedAddresses: readonly string[]): string[] {
  const where = `${render.inventory} ${render.host}`;
  const sshd = sshdLines(render.files['bastion-sshd.conf']);
  const firewall = render.files['bastion.nft'];
  if (sshd === null || firewall === undefined) {
    return [`${where} lacks its rendered sshd drop-in or firewall`];
  }
  const variables = render.variables;
  const probers = stringList(variables['puni_bastion_probers']);
  const problems: string[] = [];
  // Proof: accepting any port here made node-access.test.ts `refuses a PermitOpen entry for a
  // port other than 22` fail (2026-11-22).
  for (const entry of sshd
    .filter((line) => line.startsWith('PermitOpen '))
    .flatMap((line) => line.split(' ').slice(1))) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}:22$/.test(entry)) {
      problems.push(`${where} jump may open ${entry}, which is not a server's port 22`);
    }
  }
  // Proof: rendering PermitOpen from a literal list made node-roles.test.ts `forwards to every
  // server the inventory adds` fail, which this list alone judges; dropping AllowUsers or
  // PermitRootLogin from the template failed its golden case; node-access.test.ts refuses each
  // of those and a widened jump option here alone (2026-11-22).
  problems.push(
    ...compareLines(where, 'sshd drop-in', sshd, [
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'PermitRootLogin no',
      'PubkeyAuthentication yes',
      'MaxAuthTries 6',
      `AllowUsers ${text(variables['puni_operator_name'])} jump`,
      `DenyUsers ${text(variables['puni_console_account'])}`,
      'Match User jump',
      'PermitTTY no',
      'AllowAgentForwarding no',
      'X11Forwarding no',
      'AllowStreamLocalForwarding no',
      'PermitTunnel no',
      'AllowTcpForwarding local',
      `PermitOpen ${forwardedAddresses.map((address) => `${address}:22`).join(' ')}`,
    ]),
    ...compareLines(where, 'firewall chain list', chainNames(firewall), ['input', 'output']),
    ...compareSet(where, firewall, 'private_ipv4', [text(variables['puni_private_network'])]),
    ...(probers.length > 0 ? compareSet(where, firewall, 'probers_ipv4', probers) : []),
  );
  // Proof: in bastion.nft.j2, dropping the IPv4 meter or the private IPv6 drop failed
  // node-roles.test.ts's golden case, and admitting the private range failed `forwards to every
  // server the inventory adds`, which this list alone judges; node-access.test.ts refuses those
  // and a public port 80 here alone (2026-11-22).
  problems.push(
    ...compareLines(where, 'input chain', chainRules(firewall, 'input'), [
      'type filter hook input priority 0; policy drop;',
      'iifname "lo" accept',
      `iifname "${text(variables['puni_bastion_private_interface'])}" meta nfproto ipv6 drop`,
      'ct state established,related accept',
      neighbourDiscovery,
      'ct state invalid drop',
      ...(probers.length > 0 ? ['ip saddr @probers_ipv4 tcp dport 22 ct state new accept'] : []),
      'ip saddr @private_ipv4 drop',
      'meta nfproto ipv4 tcp dport 22 ct state new add @ssh_sources_ipv4 { ip saddr limit rate 10/minute burst 5 packets } accept',
      'meta nfproto ipv6 tcp dport 22 ct state new add @ssh_sources_ipv6 { ip6 saddr limit rate 10/minute burst 5 packets } accept',
    ]),
    ...compareLines(where, 'output chain', chainRules(firewall, 'output'), [
      'type filter hook output priority 0; policy accept;',
    ]),
  );
  return problems;
}

/**
 * Judges every host render of the static inventories. Each rendered file must equal its
 * committed golden in `goldens` (keyed `<inventory file name without .yml>/<host>/<file>`), and
 * the host's rendered files must be exactly the ones committed for it. On top of that each server
 * gets {@link judgeServerConfig}, a separated host {@link judgeSeparatedFirewall}, and the
 * bastion {@link judgeBastion}.
 */
export function judgeHostRenders(
  renders: readonly HostRender[],
  goldens: Readonly<Partial<Record<string, string>>>,
): string[] {
  if (renders.length === 0) return ['no static inventory host was rendered'];
  const problems: string[] = [];
  const byInventory = new Map<string, HostRender[]>();
  for (const render of renders) {
    byInventory.set(render.inventory, [...(byInventory.get(render.inventory) ?? []), render]);
  }
  for (const [inventory, hosts] of byInventory) {
    const label = inventory.replace(/^.*\//, '').replace(/\.yml$/, '');
    const nodes = hosts.filter(({ groups }) => groups.some((group) => k3sGroups.includes(group)));
    const nodeAddresses = nodes.map(({ variables }) => text(variables['puni_node_ip']));
    const forwarded = hosts
      .filter(({ groups }) =>
        groups.some((group) => k3sGroups.includes(group) || group === 'bastion_forward_hosts'),
      )
      .map(({ variables }) => text(variables['ansible_host']));
    for (const render of hosts) {
      const prefix = `${label}/${render.host}/`;
      const committed = Object.keys(goldens)
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
        .sort();
      const rendered = Object.keys(render.files).sort();
      // Proof: changing the firewall template's default branch made node-roles.test.ts `renders
      // every host byte-equal to its committed golden` fail for h4claw and h3mon (2026-11-22).
      if (JSON.stringify(committed) !== JSON.stringify(rendered)) {
        problems.push(
          `${inventory} ${render.host} renders ${rendered.join(', ') || 'nothing'}, but ${committed.join(', ') || 'nothing'} is committed`,
        );
      }
      for (const name of rendered) {
        const golden = goldens[`${prefix}${name}`];
        if (golden !== undefined && golden !== render.files[name]) {
          problems.push(`${inventory} ${render.host} ${name} differs from its committed golden`);
        }
      }
      if (render.groups.some((group) => serverGroups.includes(group))) {
        problems.push(...judgeServerConfig(render));
      }
      if (
        render.groups.some((group) => k3sGroups.includes(group)) &&
        render.variables['puni_public_ports'] !== undefined
      ) {
        problems.push(...judgeSeparatedFirewall(render, { nodeAddresses }));
      }
      if (render.groups.includes('bastion')) problems.push(...judgeBastion(render, forwarded));
    }
  }
  return problems;
}

/** Reads the committed goldens under `directory`, keyed `<inventory>/<host>/<file>`. */
export async function readHostRenderGoldens(
  directory: string,
): Promise<Partial<Record<string, string>>> {
  const goldens: Record<string, string> = {};
  for (const inventory of await readdir(directory)) {
    for (const host of await readdir(join(directory, inventory))) {
      for (const name of await readdir(join(directory, inventory, host))) {
        goldens[`${inventory}/${host}/${name.replace(/\.golden$/, '')}`] = await readFile(
          join(directory, inventory, host, name),
          'utf8',
        );
      }
    }
  }
  return goldens;
}

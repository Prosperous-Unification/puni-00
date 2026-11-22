/**
 * Judges the files the node and bastion roles render for each host of a static inventory
 * (`infra/ansible/tests/render-hosts.yml`): the k3s server configuration, the fleet firewall and
 * the bastion's `sshd` drop-in and firewall (openspec/changes/separate-node-roles, slices 1.2,
 * 1.8 and 1.9). `tool-fleet:check` runs them on the controller's renders and
 * `infra/ansible/tests/node-roles.test.ts` on renders of the committed templates.
 *
 * Each judge returns problems; an empty list is a pass. A file the host should have and lacks is
 * a problem, never a skip.
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

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : null;
}

function capabilitiesOf(render: HostRender): string[] {
  return stringList(render.variables['puni_node_capabilities']) ?? [];
}

/** The rule lines of one `chain <name> { ... }` block, trimmed, comments and blanks dropped. */
function chainRules(text: string, name: string): string[] | null {
  const lines = text.split('\n').map((line) => line.trim());
  const start = lines.indexOf(`chain ${name} {`);
  if (start < 0) return null;
  const rules: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line === '}') return rules;
    if (line !== '' && !line.startsWith('#')) rules.push(line);
  }
  return null;
}

/** The elements of `set <name>`, or null when the set or its elements line is absent. */
function setElements(text: string, name: string): string[] | null {
  const lines = text.split('\n').map((line) => line.trim());
  const start = lines.indexOf(`set ${name} {`);
  if (start < 0) return null;
  for (const line of lines.slice(start + 1)) {
    if (line === '}') return null;
    const match = /^elements = \{ (.*) \}$/.exec(line);
    if (match !== null) return match[1].split(', ');
  }
  return null;
}

function withoutComment(rule: string): string {
  return rule.replace(/ comment "[^"]*"$/, '');
}

/** The ports of a `tcp dport { a, b }` or `tcp dport a` match, or null when the rule has none. */
function tcpPorts(rule: string): string[] | null {
  const braced = /tcp dport \{ ([^}]*) \}/.exec(rule);
  if (braced !== null) return braced[1].split(', ').sort();
  const single = /tcp dport (\S+)/.exec(rule);
  return single === null ? null : [single[1]];
}

/**
 * Every server writes `etcd-expose-metrics: true`. A `platform-services` server registers with
 * `CriticalAddonsOnly=true:NoSchedule` (R25) and appends `PodNodeSelector` with `+=`, which
 * keeps the `NodeRestriction` k3s sets itself; any other server writes neither.
 */
export function judgeServerConfig(render: HostRender): string[] {
  const where = `${render.inventory} ${render.host}`;
  const config = render.files['k3s-server.yaml'];
  if (config === undefined) return [`${where} has no rendered k3s server configuration`];
  const lines = config.split('\n');
  const problems: string[] = [];
  // Proof: dropping the template line made node-roles.test.ts `renders the platform taint and
  // admission plugin on m1plat1` and `keeps the existing servers without an API server argument`
  // fail (2026-11-22).
  if (!lines.includes('etcd-expose-metrics: true')) {
    problems.push(`${where} does not expose etcd metrics`);
  }
  const taint = lines.includes('  - CriticalAddonsOnly=true:NoSchedule');
  const argIndex = lines.indexOf('kube-apiserver-arg:');
  const plainAdmission = lines.some((line) => line.includes('enable-admission-plugins='));
  if (capabilitiesOf(render).includes('platform-services')) {
    // Proof: removing the template branch made node-roles.test.ts `renders the platform taint
    // and admission plugin on m1plat1` fail (2026-11-22).
    if (!taint) problems.push(`${where} is a platform-services server without the platform taint`);
    if (argIndex < 0 || lines[argIndex + 1] !== '  - enable-admission-plugins+=PodNodeSelector') {
      problems.push(`${where} does not append PodNodeSelector to the API server's plugins`);
    }
    // Proof: writing `=` in the template made node-roles.test.ts `renders the platform taint and
    // admission plugin on m1plat1` fail (2026-11-22).
    if (plainAdmission) {
      problems.push(
        `${where} replaces the API server's admission plugins, dropping NodeRestriction`,
      );
    }
  } else {
    // Proof: writing the entry for every server made node-roles.test.ts `keeps the existing
    // servers without an API server argument` fail (2026-11-22).
    if (argIndex >= 0)
      problems.push(`${where} writes kube-apiserver-arg without platform-services`);
    if (taint) problems.push(`${where} carries the platform taint without platform-services`);
  }
  return problems;
}

/** Facts of the inventory a separated firewall is compared with. */
export interface FirewallFacts {
  /** The private addresses of the inventory's k3s hosts. */
  readonly nodeAddresses: readonly string[];
}

/**
 * The firewall of a host of a separated inventory (one that sets `puni_public_ports`): SSH from
 * the bastion on the private interface alone and on no other interface; the cluster's ports from
 * the enrolled node addresses alone, which are exactly the nodes and never the bastion; and a
 * stateful prerouting chain at -150 that limits the bastion to the host's `sshd`, keeps private
 * addresses that are not nodes off the cluster CIDR, the service CIDR and the NodePorts, and drops
 * every new connection on the public side but the host's public ports (80 and 443 with `ingress`,
 * none without) and Tailscale's UDP port (design decision 12).
 */
export function judgeSeparatedFirewall(render: HostRender, facts: FirewallFacts): string[] {
  const where = `${render.inventory} ${render.host}`;
  const text = render.files['firewall.nft'];
  if (text === undefined) return [`${where} has no rendered firewall`];
  const variables = render.variables;
  const privateInterface = String(variables['puni_private_interface']);
  const bastion = String(variables['puni_bastion_address']);
  const node = String(variables['puni_node_ip']);
  const problems: string[] = [];
  const input = chainRules(text, 'input');
  const prerouting = chainRules(text, 'prerouting');
  if (input === null) return [`${where} firewall has no input chain`];

  const bastionSsh = `iifname "${privateInterface}" ip saddr ${bastion} ip daddr ${node} tcp dport 22 accept`;
  // Every input rule that names port 22 is read, on every interface: checking the private
  // interface's rules alone would let the tailnet admit SSH.
  // Proof: keeping the "retain SSH recovery" rule or admitting the private range in the template
  // made node-roles.test.ts `renders a separated firewall the judge accepts ...` fail; reading
  // `iifname "<private>"` rules alone made node-access.test.ts `refuses SSH on the tailnet
  // interface` fail (2026-11-22).
  const sshRules = input.map(withoutComment).filter((rule) => tcpPorts(rule)?.includes('22'));
  if (JSON.stringify(sshRules) !== JSON.stringify([bastionSsh, 'tcp dport 22 drop'])) {
    problems.push(
      `${where} admits SSH other than from the bastion on the private interface: ${sshRules.join(' | ')}`,
    );
  }

  const enrolled = setElements(text, 'enrolled_ipv4');
  const expectedEnrolled = [...facts.nodeAddresses].sort();
  if (
    enrolled === null ||
    JSON.stringify([...enrolled].sort()) !== JSON.stringify(expectedEnrolled)
  ) {
    problems.push(
      `${where} enrolled set is ${String(enrolled)}, not the node addresses ${expectedEnrolled.join(', ')}`,
    );
  }
  // Proof: widening the source of the 8472 rule to the private range in the template made
  // node-roles.test.ts `renders a separated firewall the judge accepts ...` fail (2026-11-22).
  for (const ports of ['tcp dport { 6443, 2379, 2380, 10250 } accept', 'udp dport 8472 accept']) {
    const rule = `iifname "${privateInterface}" ip saddr @enrolled_ipv4 ${ports}`;
    const sources = input.filter((each) => each.endsWith(ports) && !each.includes('@cluster_ipv4'));
    if (JSON.stringify(sources) !== JSON.stringify([rule])) {
      problems.push(`${where} admits ${ports.replace(' accept', '')} from ${sources.join(' | ')}`);
    }
  }

  if (prerouting === null) return [...problems, `${where} firewall has no prerouting chain`];
  const header = 'type filter hook prerouting priority -150; policy accept;';
  if (prerouting[0] !== header) problems.push(`${where} prerouting chain is not "${header}"`);
  if (prerouting[1] !== 'ct state established,related accept') {
    problems.push(`${where} prerouting does not accept established traffic first`);
  }
  const rules = prerouting.slice(1).map(withoutComment);
  if (!rules.includes('ct state invalid drop')) {
    problems.push(`${where} prerouting does not drop invalid traffic`);
  }
  // Proof: dropping `ct state new` from the template's public drop made node-roles.test.ts
  // `renders a separated firewall the judge accepts ...` fail (2026-11-22).
  for (const rule of rules.filter((each) => each.endsWith(' drop'))) {
    if (rule !== 'ct state invalid drop' && !rule.endsWith(' ct state new drop')) {
      problems.push(`${where} prerouting drops more than new connections: ${rule}`);
    }
  }
  // Proof: dropping the template's bastion rule made node-roles.test.ts `renders a separated
  // firewall the judge accepts ...` fail (2026-11-22).
  const bastionAccept = rules.indexOf(bastionSsh);
  if (
    bastionAccept < 0 ||
    rules[bastionAccept + 1] !==
      `iifname "${privateInterface}" ip saddr ${bastion} ct state new drop`
  ) {
    problems.push(`${where} lets the bastion reach more than this host's sshd`);
  }
  for (const target of [
    'ip daddr @cluster_ipv4',
    'ip daddr @service_ipv4',
    'tcp dport 30000-32767',
    'udp dport 30000-32767',
  ]) {
    const rule = `iifname "${privateInterface}" ip saddr != @enrolled_ipv4 ${target} ct state new drop`;
    if (!rules.includes(rule)) {
      problems.push(
        `${where} prerouting lets a private address that is not a node reach ${target}`,
      );
    }
  }

  const publicSide = /^iifname != \{ "lo", "([^"]+)", "([^"]+)", "cni0", "flannel\.1" \} /;
  const publicRules = rules.filter((rule) => publicSide.test(rule));
  const internal = publicRules.map((rule) => publicSide.exec(rule)?.slice(1, 3).join(' '));
  if (
    internal.some(
      (names) => names !== `${privateInterface} ${String(variables['puni_tailnet_interface'])}`,
    )
  ) {
    problems.push(
      `${where} public side excludes interfaces other than the private and tailnet ones`,
    );
  }
  const ingress = capabilitiesOf(render).includes('ingress');
  const expectedPorts = ingress ? ['443', '80'] : [];
  const declared = (
    Array.isArray(variables['puni_public_ports']) ? variables['puni_public_ports'] : []
  )
    .map(String)
    .sort();
  if (JSON.stringify(declared) !== JSON.stringify(expectedPorts)) {
    problems.push(
      `${where} declares public ports ${declared.join(', ') || 'none'}; ${ingress ? 'an ingress host serves 80 and 443' : 'a host without ingress serves none'}`,
    );
  }
  // Proof: rendering `tcp dport { 80, 443 }` for every host in the template made
  // node-roles.test.ts `renders a separated firewall the judge accepts ...` fail (2026-11-22).
  const publicTcp = publicRules
    .filter((rule) => rule.endsWith(' accept'))
    .flatMap((rule) => tcpPorts(rule) ?? [])
    .sort();
  if (JSON.stringify(publicTcp) !== JSON.stringify(expectedPorts)) {
    problems.push(
      `${where} accepts public TCP ${publicTcp.join(', ') || 'none'}, not ${expectedPorts.join(', ') || 'none'}`,
    );
  }
  // Proof: removing the template's public drop from prerouting (leaving the input hook alone)
  // made node-roles.test.ts `renders a separated firewall the judge accepts ...` fail (2026-11-22).
  const last = rules.at(-1) ?? '';
  if (!publicSide.test(last) || !last.endsWith(' ct state new drop')) {
    problems.push(`${where} prerouting does not end with the public drop`);
  }
  const consoleAccount = variables['puni_console_account'];
  // Proof: dropping the DenyUsers line from sshd-console.conf.j2 made node-roles.test.ts `renders
  // every host of both static inventories as the judges require` fail (2026-11-22).
  if (
    typeof consoleAccount !== 'string' ||
    !(render.files['sshd-console.conf'] ?? '').split('\n').includes(`DenyUsers ${consoleAccount}`)
  ) {
    problems.push(`${where} sshd does not refuse the console account`);
  }
  const nodePortAccepts = rules.filter(
    (rule) => rule.endsWith(' accept') && rule.includes('@ci_ipv4'),
  );
  const ci = stringList(variables['puni_ci_private_addresses']) ?? [];
  const otelPorts = (
    Array.isArray(variables['puni_otel_gateway_node_ports'])
      ? variables['puni_otel_gateway_node_ports']
      : []
  )
    .map(String)
    .sort();
  if (ci.length === 0 ? nodePortAccepts.length > 0 : nodePortAccepts.length !== 1) {
    problems.push(
      `${where} admits the CI server to ${String(nodePortAccepts.length)} NodePort rules`,
    );
  }
  for (const rule of nodePortAccepts) {
    if (JSON.stringify(tcpPorts(rule)) !== JSON.stringify(otelPorts)) {
      problems.push(`${where} admits the CI server beyond the otel-gateway NodePorts: ${rule}`);
    }
  }
  return problems;
}

/**
 * The bastion's `sshd` drop-in and firewall (R55, slice 1.9). `jump` gets no TTY, agent, X11,
 * stream-local or tunnel forwarding, `AllowTcpForwarding local`, and `PermitOpen` to exactly the
 * forwarded hosts' port 22; passwords are refused for every user. The firewall admits public TCP
 * 22 alone, each family through a per-source meter, private TCP 22 from the probers alone, and
 * drops everything else inbound.
 */
export function judgeBastion(render: HostRender, forwardedAddresses: readonly string[]): string[] {
  const where = `${render.inventory} ${render.host}`;
  const sshd = render.files['bastion-sshd.conf'];
  const firewall = render.files['bastion.nft'];
  const problems: string[] = [];
  if (sshd === undefined) problems.push(`${where} has no rendered sshd drop-in`);
  if (firewall === undefined) problems.push(`${where} has no rendered bastion firewall`);
  if (sshd === undefined || firewall === undefined) return problems;

  const lines = sshd.split('\n').map((line) => line.trim());
  const match = lines.indexOf('Match User jump');
  const global = match < 0 ? lines : lines.slice(0, match);
  const consoleAccount = render.variables['puni_console_account'];
  // Proof: dropping the DenyUsers line from the bastion's sshd.conf.j2 made node-roles.test.ts
  // `forwards to every server the inventory adds` fail (2026-11-22).
  if (typeof consoleAccount !== 'string' || !global.includes(`DenyUsers ${consoleAccount}`)) {
    problems.push(`${where} sshd does not refuse the console account`);
  }
  for (const option of ['PasswordAuthentication no', 'KbdInteractiveAuthentication no']) {
    if (!global.includes(option))
      problems.push(`${where} sshd does not set ${option} for every user`);
  }
  if (match < 0) return [...problems, `${where} sshd has no Match User jump block`];
  const jump = lines.slice(match + 1).filter((line) => line !== '' && !line.startsWith('#'));
  // Proof: dropping the PermitTunnel and AllowTcpForwarding comparisons (checking PermitOpen
  // alone) made node-access.test.ts `refuses jump forwarding other than local` fail (2026-11-22).
  for (const option of [
    'PermitTTY no',
    'AllowAgentForwarding no',
    'X11Forwarding no',
    'AllowStreamLocalForwarding no',
    'PermitTunnel no',
    'AllowTcpForwarding local',
  ]) {
    const key = option.split(' ')[0];
    const set = jump.filter((line) => line.split(' ')[0] === key);
    if (JSON.stringify(set) !== JSON.stringify([option])) {
      problems.push(`${where} jump sets ${set.join(' | ') || `no ${key}`}, not ${option}`);
    }
  }
  const permitOpen = jump.filter((line) => line.startsWith('PermitOpen '));
  const entries = permitOpen.flatMap((line) => line.split(' ').slice(1)).sort();
  // Proof: accepting any port here made node-access.test.ts `refuses a PermitOpen entry for a
  // port other than 22` fail (2026-11-22).
  for (const entry of entries) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}:22$/.test(entry)) {
      problems.push(`${where} jump may open ${entry}, which is not a server's port 22`);
    }
  }
  const expected = forwardedAddresses.map((address) => `${address}:22`).sort();
  // Proof: rendering PermitOpen from a literal list made node-roles.test.ts `forwards to every
  // server the inventory adds` fail (2026-11-22).
  if (permitOpen.length !== 1 || JSON.stringify(entries) !== JSON.stringify(expected)) {
    problems.push(`${where} jump may open ${entries.join(' ')}, not ${expected.join(' ')}`);
  }

  const input = chainRules(firewall, 'input');
  if (input === null) return [...problems, `${where} bastion firewall has no input chain`];
  if (input[0] !== 'type filter hook input priority 0; policy drop;') {
    problems.push(`${where} bastion input chain does not drop by default`);
  }
  const rules = input.slice(1).map(withoutComment);
  const probers = stringList(render.variables['puni_bastion_probers']) ?? [];
  const privateAccepts = rules.filter(
    (rule) => rule.startsWith('ip saddr ') && rule.endsWith(' accept'),
  );
  // Proof: admitting the private range in bastion.nft.j2 made node-roles.test.ts `forwards to
  // every server the inventory adds` fail (2026-11-22).
  const expectedPrivate =
    probers.length === 0 ? [] : ['ip saddr @probers_ipv4 tcp dport 22 ct state new accept'];
  const proberSet = setElements(firewall, 'probers_ipv4');
  if (
    JSON.stringify(privateAccepts) !== JSON.stringify(expectedPrivate) ||
    (probers.length > 0 && JSON.stringify(proberSet) !== JSON.stringify(probers))
  ) {
    problems.push(
      `${where} bastion admits private traffic beyond the probers: ${privateAccepts.join(' | ')}`,
    );
  }
  const privateDrop = rules.indexOf('ip saddr @private_ipv4 drop');
  if (privateDrop < 0)
    problems.push(`${where} bastion does not drop the rest of the private network`);
  const publicAccepts = rules.filter(
    (rule, index) => index > privateDrop && rule.endsWith(' accept'),
  );
  const publicPorts = [...new Set(publicAccepts.flatMap((rule) => tcpPorts(rule) ?? ['(any)']))];
  // Proof: checking that 22 is present rather than alone made node-access.test.ts `refuses a
  // public port set other than exactly 22` fail on its {22, 80} case (2026-11-22).
  if (JSON.stringify(publicPorts) !== JSON.stringify(['22'])) {
    problems.push(
      `${where} bastion serves public ports ${publicPorts.join(', ') || 'none'}, not exactly 22`,
    );
  }
  // Proof: dropping the IPv4 meter from bastion.nft.j2 made node-roles.test.ts `renders every host
  // of both static inventories as the judges require` fail (2026-11-22).
  for (const family of ['ip saddr', 'ip6 saddr']) {
    const metered = publicAccepts.filter((rule) =>
      new RegExp(
        `ct state new add @\\S+ \\{ ${family} limit rate \\d+/minute burst \\d+ packets \\} accept$`,
      ).test(rule),
    );
    if (metered.length !== 1) {
      problems.push(
        `${where} bastion does not limit new public SSH per ${family.split(' ')[0]} source`,
      );
    }
  }
  if (publicAccepts.length !== 2) {
    problems.push(
      `${where} bastion has ${String(publicAccepts.length)} public accepts, not one per family`,
    );
  }
  return problems;
}

/**
 * Judges every host render of the static inventories. A host of a separated inventory gets
 * {@link judgeSeparatedFirewall}; any other k3s host's firewall must equal its committed copy in
 * `existingFirewalls` (keyed `<inventory>/<host>`), so the existing inventories render exactly
 * what they rendered before slice 1.8.
 */
export function judgeHostRenders(
  renders: readonly HostRender[],
  existingFirewalls: Readonly<Partial<Record<string, string>>>,
): string[] {
  if (renders.length === 0) return ['no static inventory host was rendered'];
  const problems: string[] = [];
  const byInventory = new Map<string, HostRender[]>();
  for (const render of renders) {
    byInventory.set(render.inventory, [...(byInventory.get(render.inventory) ?? []), render]);
  }
  for (const [inventory, hosts] of byInventory) {
    const nodes = hosts.filter(({ groups }) => groups.some((group) => k3sGroups.includes(group)));
    const nodeAddresses = nodes.map(({ variables }) => String(variables['puni_node_ip']));
    const forwarded = hosts
      .filter(({ groups }) =>
        groups.some((group) => k3sGroups.includes(group) || group === 'bastion_forward_hosts'),
      )
      .map(({ variables }) => String(variables['ansible_host']));
    for (const render of hosts) {
      if (render.groups.some((group) => serverGroups.includes(group))) {
        problems.push(...judgeServerConfig(render));
      }
      if (render.groups.some((group) => k3sGroups.includes(group))) {
        if (render.variables['puni_public_ports'] === undefined) {
          const committed = existingFirewalls[`${inventory}/${render.host}`];
          // Proof: changing the template's default branch made node-roles.test.ts `renders the
          // existing inventory's firewalls byte-equal` fail (2026-11-22).
          if (committed === undefined) {
            problems.push(`${inventory} ${render.host} has no committed firewall to compare`);
          } else if (render.files['firewall.nft'] !== committed) {
            problems.push(
              `${inventory} ${render.host} firewall differs from its committed rendering`,
            );
          }
        } else {
          problems.push(...judgeSeparatedFirewall(render, { nodeAddresses }));
        }
      }
      if (render.groups.includes('bastion')) problems.push(...judgeBastion(render, forwarded));
    }
  }
  return problems;
}

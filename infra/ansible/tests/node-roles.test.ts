import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'bun:test';
import { parse, stringify } from 'yaml';

import { scratchAsync } from '../../../tools/test/scratch';
import {
  type HostRender,
  judgeBastion,
  judgeHostRenders,
  judgeSeparatedFirewall,
  judgeServerConfig,
  readHostRenderGoldens,
} from '../../../tools/tool-fleet/src/node-access';

// The roles of openspec/changes/separate-node-roles, slices 1.2, 1.3, 1.8 and 1.9: their renders,
// and each guard's task file run as the role runs it, against supplied facts and stand-in
// binaries. No host is contacted. Tools run as `PUNI_TEST_RUN` (a JSON argv prefix) plus the
// tool's name: empty locally, with the locked ansible-core on PATH; in CI the controller image
// (tests/controller-run.sh). `PUNI_TEST_NFT_CHECK` is the argv that parses a ruleset there.
const ansibleRoot = join(import.meta.dir, '..');
const repository = join(ansibleRoot, '../..');
const runPrefix = JSON.parse(process.env['PUNI_TEST_RUN'] ?? '[]') as string[];
const nftCheck = JSON.parse(
  process.env['PUNI_TEST_NFT_CHECK'] ?? '["unshare", "-rn", "nft", "-c", "-f"]',
) as string[];

interface Run {
  code: number;
  output: string;
  stdout: string;
}

async function tool(argv: string[], environment: Record<string, string> = {}): Promise<Run> {
  const child = Bun.spawn([...runPrefix, ...argv], {
    cwd: ansibleRoot,
    env: { ...process.env, ANSIBLE_CONFIG: join(ansibleRoot, 'ansible.cfg'), ...environment },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr, stdout };
}

let identity = { uid: '', gid: '' };
beforeAll(async () => {
  const lock = (await Bun.file(join(repository, 'infra/versions/toolchain.json')).json()) as {
    controller: { ansibleCore: string };
  };
  const version = await tool(['ansible-playbook', '--version']);
  expect(version.code).toBe(0);
  expect(version.output).toContain(`[core ${lock.controller.ansibleCore}]`);
  identity = {
    uid: (await tool(['id', '-u'])).stdout.trim(),
    gid: (await tool(['id', '-g'])).stdout.trim(),
  };
});

/** Writes a stand-in executable and returns its path. */
async function standIn(name: string, script: string): Promise<string> {
  const path = join(await scratchAsync('node-roles-bin-'), name);
  await writeFile(path, `#!/bin/sh\n${script}\n`);
  await chmod(path, 0o755);
  return path;
}

/** Runs one task file through tests/role-tasks.yml with `variables` as extra vars. */
async function taskFile(
  variables: Record<string, unknown>,
  options: {
    inventory?: string;
    limit?: string;
    environment?: Record<string, string>;
    skipTags?: string;
  } = {},
): Promise<Run> {
  const file = join(await scratchAsync('node-roles-vars-'), 'vars.json');
  await writeFile(file, JSON.stringify(variables));
  return tool(
    [
      'ansible-playbook',
      '-i',
      options.inventory ?? 'localhost,',
      ...(options.limit === undefined ? [] : ['--limit', options.limit]),
      ...(options.skipTags === undefined ? [] : ['--skip-tags', options.skipTags]),
      'tests/role-tasks.yml',
      '-e',
      `@${file}`,
    ],
    options.environment,
  );
}

/** Renders every host of `inventory` through tests/render-hosts.yml, as check-ansible.py does. */
async function renderInventory(inventory: string, label: string): Promise<HostRender[]> {
  const root = await scratchAsync('node-roles-');
  const rendered = await tool([
    'ansible-playbook',
    '-i',
    inventory,
    'tests/render-hosts.yml',
    '-e',
    `puni_render_root=${root}`,
  ]);
  if (rendered.code !== 0) throw new Error(`render of ${label} failed:\n${rendered.output}`);
  const listed = await tool(['ansible-inventory', '-i', inventory, '--list']);
  if (listed.code !== 0) throw new Error(`inventory ${label} does not list:\n${listed.output}`);
  const { _meta: meta, ...groupEntries } = JSON.parse(listed.stdout) as {
    _meta: { hostvars: Record<string, Record<string, unknown>> };
  } & Record<string, { hosts?: string[] }>;
  const renders: HostRender[] = [];
  for (const [host, variables] of Object.entries(meta.hostvars)) {
    const groups = Object.entries(groupEntries)
      .filter(([, entry]) => (entry.hosts ?? []).includes(host))
      .map(([group]) => group);
    const files: Record<string, string> = {};
    for (const name of await readdir(join(root, host)).catch(() => [])) {
      files[name] = await readFile(join(root, host, name), 'utf8');
    }
    renders.push({ inventory: label, host, groups, variables, files });
  }
  return renders;
}

async function requireValidRuleset(text: string): Promise<void> {
  const path = join(await scratchAsync('node-roles-nft-'), 'ruleset.nft');
  await writeFile(path, text);
  const checked = await tool([...nftCheck, path]);
  expect(checked.output).toBe('');
  expect(checked.code).toBe(0);
}

const find = (renders: readonly HostRender[], host: string): HostRender => {
  const render = renders.find((each) => each.host === host);
  if (render === undefined) throw new Error(`${host} was not rendered`);
  return render;
};

/** production-hosts.yml grown by an ingress agent, a CI server address and a prober. */
async function grownInventory(): Promise<string> {
  const inventory = parse(
    await readFile(join(ansibleRoot, 'inventory/production-hosts.yml'), 'utf8'),
  ) as {
    all: {
      vars: Record<string, unknown>;
      children: Record<string, { hosts: Record<string, Record<string, unknown>> }>;
    };
  };
  inventory.all.vars['puni_enrolled_private_addresses'] = ['10.10.1.11', '10.10.1.13'];
  inventory.all.vars['puni_ci_private_addresses'] = ['10.10.1.20'];
  inventory.all.children['k3s_agents'].hosts = {
    h6apps: {
      ansible_host: '10.10.1.13',
      puni_machine_id: '6'.repeat(32),
      puni_node_name: 'h6apps',
      puni_node_ip: '10.10.1.13',
      puni_private_interface: 'enp8s0',
      puni_public_interfaces: ['enp3s0'],
      puni_node_capabilities: ['product', 'ingress'],
      puni_public_ports: [80, 443],
      puni_tailscale_tag: 'tag:apps',
    },
  };
  inventory.all.children['bastion'].hosts['m2bast1']['puni_bastion_probers'] = ['10.10.1.13'];
  const path = join(await scratchAsync('node-roles-inventory-'), 'production-hosts.yml');
  await writeFile(path, stringify(inventory));
  return path;
}

describe('the node and bastion roles, rendered by the locked Ansible', () => {
  let platform: HostRender[] = [];
  let existing: HostRender[] = [];
  let grown: HostRender[] = [];
  beforeAll(async () => {
    platform = await renderInventory(
      'inventory/production-hosts.yml',
      'inventory/production-hosts.yml',
    );
    existing = await renderInventory(
      'inventory/production-existing-hosts.yml',
      'inventory/production-existing-hosts.yml',
    );
    grown = await renderInventory(await grownInventory(), 'grown production-hosts.yml');
  }, 300_000);

  it('renders every host byte-equal to its committed golden, as the judges require', async () => {
    // Proof: changing the firewall template's default branch made this fail for h4claw and
    // h3mon; every template fault in verify.md's table failed here too (2026-11-22).
    const goldens = await readHostRenderGoldens(
      join(repository, 'tools/tool-fleet/src/fixtures/host-renders'),
    );
    expect(judgeHostRenders([...platform, ...existing], goldens)).toEqual([]);
    for (const render of [...platform, ...existing, ...grown]) {
      for (const name of ['firewall.nft', 'bastion.nft']) {
        const text = render.files[name];
        if (text !== undefined) await requireValidRuleset(text);
      }
    }
  });

  it('renders the platform taint and admission plugin on m1plat1 alone', () => {
    expect(judgeServerConfig(find(platform, 'm1plat1'))).toEqual([]);
    expect(judgeServerConfig(find(existing, 'h4claw'))).toEqual([]);
  });

  it('renders a separated firewall the judge accepts on a server and an ingress agent', () => {
    const nodeAddresses = ['10.10.1.11', '10.10.1.13'];
    expect(judgeSeparatedFirewall(find(grown, 'm1plat1'), { nodeAddresses })).toEqual([]);
    expect(judgeSeparatedFirewall(find(grown, 'h6apps'), { nodeAddresses })).toEqual([]);
  });

  it('forwards to every server the inventory adds', () => {
    expect(judgeBastion(find(grown, 'm2bast1'), ['10.10.1.11', '10.10.1.13'])).toEqual([]);
  });

  it('shapes the bastion firewall unit as systemd verifies it', async () => {
    const unit = join(await scratchAsync('node-roles-unit-'), 'puni-bastion-firewall.service');
    await writeFile(
      unit,
      await readFile(
        join(ansibleRoot, 'roles/bastion/templates/puni-bastion-firewall.service.j2'),
        'utf8',
      ),
    );
    const verified = await tool(['systemd-analyze', 'verify', '--man=no', unit]);
    expect(verified.output).toBe('');
    expect(verified.code).toBe(0);
    const text = await readFile(unit, 'utf8');
    for (const line of [
      'DefaultDependencies=no',
      'Before=network-pre.target ssh.service shutdown.target',
      'Conflicts=shutdown.target',
      'WantedBy=sysinit.target',
    ]) {
      expect(text.split('\n')).toContain(line);
    }
  });
});

const separatedFacts = {
  puni_test_role: 'network',
  puni_test_tasks: 'inputs.yml',
  puni_cluster_id: 'platform-production',
  puni_node_ip: '10.10.1.11',
  puni_private_interface: 'enp8s0',
  ansible_interfaces: ['lo', 'enp8s0', 'enp3s0', 'tailscale0', 'cni0', 'flannel.1', 'vethab12'],
  ansible_enp8s0: { mtu: 1442, ipv4: { address: '10.10.1.11' } },
  puni_private_mtu: 1442,
  puni_cluster_cidr: '10.42.0.0/16',
  puni_service_cidr: '10.43.0.0/16',
  puni_enrolled_private_addresses: ['10.10.1.11'],
  puni_node_capabilities: ['control-plane', 'platform-services'],
  puni_public_ports: [],
  puni_public_interfaces: ['enp3s0'],
  puni_bastion_address: '10.10.1.12',
  puni_tailnet_interface: 'tailscale0',
  puni_ci_private_addresses: [],
  puni_otel_gateway_node_ports: [30417, 30419],
};

describe("the network role's guards", () => {
  it('accepts a classified separated host, Docker bridges included', async () => {
    const accepted = await taskFile({
      ...separatedFacts,
      ansible_interfaces: [...separatedFacts.ansible_interfaces, 'docker0', 'br-1a2b'],
    });
    expect(accepted.output).toContain('ok=');
    expect(accepted.code).toBe(0);
  });

  it('refuses an interface that reports less than the private MTU', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ansible_enp8s0: { mtu: 1400, ipv4: { address: '10.10.1.11' } },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 reports MTU 1400, below the private MTU 1442');
  });

  it('refuses an interface no class names', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ansible_interfaces: [...separatedFacts.ansible_interfaces, 'eth9'],
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("no interface may be unclassified: ['eth9']");
  });

  it("refuses a private interface without the node's address", async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ansible_enp8s0: { mtu: 1442, ipv4: { address: '10.10.1.99' } },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 does not carry 10.10.1.11');
  });

  it('refuses public web ports on a host without ingress', async () => {
    const refused = await taskFile({ ...separatedFacts, puni_public_ports: [80, 443] });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('public ports that follow `ingress`');
  });

  it('refuses a play that does not come through the bastion', async () => {
    const variables = {
      ...separatedFacts,
      puni_test_tasks: 'ssh-source.yml',
    };
    const refused = await taskFile(variables, {
      environment: { SSH_CONNECTION: '203.0.113.9 50000 10.10.1.11 22' },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('The play connects from 203.0.113.9, not the bastion');
    const accepted = await taskFile(variables, {
      environment: { SSH_CONNECTION: '10.10.1.12 50000 10.10.1.11 22' },
    });
    expect(accepted.code).toBe(0);
  });
});

describe('the shared task files', () => {
  async function twoKeys(): Promise<string[]> {
    const directory = await scratchAsync('node-roles-keys-');
    const keys: string[] = [];
    for (const name of ['one', 'two']) {
      const made = await tool([
        'ssh-keygen',
        '-q',
        '-t',
        'ed25519',
        '-N',
        '',
        '-C',
        name,
        '-f',
        join(directory, name),
      ]);
      expect(made.code).toBe(0);
      keys.push((await tool(['cat', join(directory, `${name}.pub`)])).stdout.trim());
    }
    return keys;
  }

  it('installs two keys on two lines', async () => {
    const keys = await twoKeys();
    const file = join(await scratchAsync('node-roles-home-'), 'authorized_keys');
    const installed = await taskFile({
      puni_test_tasks: 'authorized-keys.yml',
      puni_keys: keys,
      puni_keys_owner: identity.uid,
      puni_keys_group: identity.gid,
      puni_keys_file: file,
      role_path: join(ansibleRoot, 'roles/base'),
    });
    expect(installed.output).toContain('failed=0');
    // Read through the tool prefix: in CI the roles' files belong to the container's root.
    expect((await tool(['cat', file])).stdout.split('\n')).toEqual([...keys, '']);
  });

  it('refuses keys given as one string', async () => {
    const [key] = await twoKeys();
    const refused = await taskFile({
      puni_test_tasks: 'authorized-keys.yml',
      puni_keys: key,
      puni_keys_owner: identity.uid,
      puni_keys_group: identity.gid,
      puni_keys_file: join(await scratchAsync('node-roles-home-'), 'authorized_keys'),
      role_path: join(ansibleRoot, 'roles/base'),
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('needs a list of one-line keys');
  });

  it('fails when a fresh connection is refused, and opens it outside the multiplexed one', async () => {
    const log = join(await scratchAsync('node-roles-ssh-'), 'argv');
    const recording = await standIn('ssh', `printf '%s\\n' "$@" > ${log}`);
    const variables = {
      puni_test_tasks: 'fresh-connection.yml',
      puni_fresh_command: ['true'],
      ansible_host: '10.10.1.11',
      ansible_user: 'puni-fleet',
      ansible_ssh_private_key_file: '/ops/admin-key',
    };
    expect((await taskFile({ ...variables, puni_ssh_client: recording })).code).toBe(0);
    const argv = (await readFile(log, 'utf8')).split('\n');
    for (const option of ['ControlMaster=no', 'ControlPath=none', 'BatchMode=yes']) {
      expect(argv).toContain(option);
    }
    expect(argv.slice(-4)).toEqual(['sudo', '-n', 'true', '']);
    const refused = await taskFile({
      ...variables,
      puni_ssh_client: await standIn('ssh', 'exit 255'),
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('Open a fresh connection and run the confirming command');
  });
});

const bastionInputs = { inventory: 'inventory/production-hosts.yml', limit: 'm2bast1' };

describe("the bastion's guards", () => {
  it("refuses the bastion's inventory inputs", async () => {
    const base = { puni_test_role: 'bastion', puni_test_tasks: 'inputs.yml' };
    expect((await taskFile(base, bastionInputs)).code).toBe(0);
    const prober = await taskFile({ ...base, puni_bastion_probers: ['h7obs'] }, bastionInputs);
    expect(prober.code).not.toBe(0);
    expect(prober.output).toContain('its probers');
    // The bastion's own address is known here, so only the self-forward check can refuse it.
    const self = await taskFile(
      { ...base, puni_bastion_forwarded_hosts: ['m1plat1', 'm2bast1'] },
      { ...bastionInputs, inventory: await inventoryWith({}, { ansible_host: '10.10.1.12' }) },
    );
    expect(self.code).not.toBe(0);
    expect(self.output).toContain('the bastion forwards to no host of its own group');
  });

  it('refuses a forward that is not an address at port 22', async () => {
    const refused = await taskFile(
      {
        puni_test_role: 'bastion',
        puni_test_tasks: 'inputs.yml',
        puni_bastion_forwarded_hosts: ['m1plat1'],
      },
      {
        ...bastionInputs,
        inventory: await inventoryWith({ ansible_host: '10.10.1.11:2222' }),
      },
    );
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('PermitOpen must name private addresses at port 22 only');
  });

  it("refuses the bastion's key inputs", async () => {
    const valid = {
      puni_test_role: 'bastion',
      puni_test_tasks: 'keys-inputs.yml',
      ansible_distribution: 'Ubuntu',
      ansible_distribution_version: '26.04',
      puni_bastion_jump_authorized_keys: ['ssh-ed25519 AAAAjump jump'],
      puni_bastion_admin_authorized_keys: ['ssh-ed25519 AAAAadmin admin'],
      puni_operator_authorized_keys: ['ssh-ed25519 AAAAserver server'],
      puni_console_password_hash: '$6$salt$hash',
    };
    expect((await taskFile(valid)).code).toBe(0);
    for (const fault of [
      { puni_bastion_admin_authorized_keys: ['ssh-ed25519 AAAAjump jump'] },
      { puni_bastion_jump_authorized_keys: ['ssh-ed25519 AAAAserver server'] },
      { puni_bastion_jump_authorized_keys: 'ssh-ed25519 AAAAjump jump' },
      { puni_console_password_hash: 'plain' },
    ]) {
      const refused = await taskFile({ ...valid, ...fault });
      expect(refused.code).not.toBe(0);
      expect(refused.output).toContain('The jump key, the bastion');
    }
  });

  it('refuses a bastion whose private interface does not carry its address', async () => {
    const variables = {
      puni_test_role: 'bastion',
      puni_test_tasks: 'private-interface.yml',
      puni_bastion_private_interface: 'enp8s0',
      puni_bastion_private_address: '10.10.1.12',
      ansible_interfaces: ['lo', 'enp3s0', 'enp8s0'],
      ansible_enp8s0: { ipv4: { address: '10.10.1.12' } },
    };
    expect((await taskFile(variables)).code).toBe(0);
    const refused = await taskFile({
      ...variables,
      ansible_enp8s0: { ipv4: { address: '10.10.1.40' } },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 does not carry 10.10.1.12');
  });

  it('stops on a ruleset nft refuses', async () => {
    const directory = await scratchAsync('node-roles-ruleset-');
    const good = join(directory, 'good.nft');
    const broken = join(directory, 'broken.nft');
    await writeFile(
      good,
      'table inet t {\n  chain c {\n    type filter hook input priority 0; policy accept;\n  }\n}\n',
    );
    await writeFile(broken, 'table inet t {\n  chain c {\n    type filter hook input\n');
    const variables = {
      puni_test_role: 'bastion',
      puni_test_tasks: 'firewall-validate.yml',
      puni_nft_check: nftCheck,
    };
    expect((await taskFile({ ...variables, puni_bastion_nft_file: good })).code).toBe(0);
    const refused = await taskFile({ ...variables, puni_bastion_nft_file: broken });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('Validate the bastion firewall');
  });
});

/** production-hosts.yml with m1plat1's and m2bast1's variables changed. */
async function inventoryWith(
  server: Record<string, unknown>,
  bastion: Record<string, unknown> = {},
): Promise<string> {
  const inventory = parse(
    await readFile(join(ansibleRoot, 'inventory/production-hosts.yml'), 'utf8'),
  ) as { all: { children: Record<string, { hosts: Record<string, Record<string, unknown>> }> } };
  Object.assign(inventory.all.children['k3s_bootstrap_servers'].hosts['m1plat1'], server);
  Object.assign(inventory.all.children['bastion'].hosts['m2bast1'], bastion);
  const path = join(await scratchAsync('node-roles-inventory-'), 'production-hosts.yml');
  await writeFile(path, stringify(inventory));
  return path;
}

/**
 * A stand-in sshd: `-T` prints `options`; `-t -f <file>`, the drop-in's own validation, exits 0;
 * `-t` on the whole configuration exits 0 or 1 by `validates`; anything else exits 0.
 */
async function sshdStandIn(options: readonly string[], validates = true): Promise<string> {
  return standIn(
    'sshd',
    [
      'case " $* " in *" -f "*) exit 0 ;; esac',
      'for argument in "$@"; do',
      `  if [ "$argument" = "-t" ]; then exit ${validates ? '0' : '1'}; fi`,
      '  if [ "$argument" = "-T" ]; then',
      ...options.map((line) => `    echo '${line}'`),
      '    exit 0',
      '  fi',
      'done',
    ].join('\n'),
  );
}

const bastionOptions = [
  'pubkeyauthentication yes',
  'passwordauthentication no',
  'kbdinteractiveauthentication no',
  'permitrootlogin no',
  'maxauthtries 6',
  'permittty no',
  'allowagentforwarding no',
  'x11forwarding no',
  'allowstreamlocalforwarding no',
  'permittunnel no',
  'allowtcpforwarding local',
  'permitopen 10.10.1.11:22',
  'allowusers puni-fleet',
  'allowusers jump',
  'denyusers puni-console',
];

describe("the bastion's sshd change", () => {
  async function sshdRun(sshd: string, ssh: string) {
    const directory = await scratchAsync('node-roles-sshd-');
    const configuration = join(directory, 'sshd_config.d');
    const backup = join(directory, 'root');
    await mkdir(configuration);
    await mkdir(backup);
    await writeFile(join(configuration, '10-puni-jump.conf'), 'AllowUsers root jump\n');
    const run = await taskFile(
      {
        puni_test_role: 'bastion',
        puni_test_tasks: 'sshd.yml',
        puni_bastion_sshd: sshd,
        puni_ssh_client: ssh,
        puni_bastion_sshd_dir: configuration,
        puni_bastion_backup_dir: backup,
        puni_root_owner: identity.uid,
        puni_root_group: identity.gid,
        puni_sshd_reload: ['true'],
        ansible_user: 'puni-fleet',
        ansible_ssh_private_key_file: '/ops/bastion-admin-key',
      },
      // The bastion's public `ansible_host` is a host variable from $OPS; an extra variable would
      // replace every host's, the servers' that PermitOpen names among them.
      { ...bastionInputs, inventory: await inventoryWith({}, { ansible_host: '203.0.113.12' }) },
    );
    const present = async (name: string) =>
      stat(join(configuration, name)).then(
        () => true,
        () => false,
      );
    return {
      run,
      drop: await present('00-puni-bastion.conf'),
      hand: await present('10-puni-jump.conf'),
    };
  }

  it('installs the drop-in and removes the hand-made one when a fresh login succeeds', async () => {
    const { run, drop, hand } = await sshdRun(
      await sshdStandIn(bastionOptions),
      await standIn('ssh', 'exit 0'),
    );
    expect(run.output).toContain('failed=0');
    expect([drop, hand]).toEqual([true, false]);
  });

  it('puts the hand-made drop-in back when a fresh login fails', async () => {
    // Proof: with the rescue's restore removed, this left neither drop-in in place (2026-11-22).
    const { run, drop, hand } = await sshdRun(
      await sshdStandIn(bastionOptions),
      await standIn('ssh', 'exit 255'),
    );
    expect(run.output).toContain('sshd was put back as it was');
    expect(run.output).toMatch(/fatal: .*\n?.*Open a fresh connection|non-zero return code/);
    expect(run.output).toContain('Read back what sshd applies to jump');
    expect([drop, hand]).toEqual([false, true]);
  });

  it('stops on an sshd configuration that does not validate, and puts sshd back', async () => {
    const { run, drop, hand } = await sshdRun(
      await sshdStandIn(bastionOptions, false),
      await standIn('ssh', 'exit 0'),
    );
    expect(run.output).toContain('sshd was put back as it was');
    expect(run.output).toContain('Validate the whole sshd configuration');
    expect(run.output).not.toContain('Read back what sshd applies to jump');
    expect([drop, hand]).toEqual([false, true]);
  });

  it('fails the read-back when an earlier drop-in sets another PermitOpen or adds root', async () => {
    for (const options of [
      bastionOptions.map((line) =>
        line.startsWith('permitopen') ? 'permitopen 10.10.1.99:22' : line,
      ),
      [...bastionOptions, 'allowusers root'],
    ]) {
      const { run, hand } = await sshdRun(
        await sshdStandIn(options),
        await standIn('ssh', 'exit 0'),
      );
      expect(run.output).toContain('sshd applies other values to jump than the drop-in sets');
      expect(hand).toBe(true);
    }
  });
});

describe("the base role's guards", () => {
  const consoleVariables = {
    puni_test_role: 'base',
    puni_test_tasks: 'console.yml',
    puni_console_account: 'puni-console',
    puni_operator_name: 'puni-fleet',
    puni_console_password_hash: '$6$salt$hash',
    puni_bastion_address: '10.10.1.12',
    puni_root_owner: '',
    puni_root_group: '',
    puni_sshd_reload: ['true'],
  };
  async function consoleRun(sshd: string, overrides: Record<string, unknown> = {}) {
    const configuration = await scratchAsync('node-roles-console-');
    return taskFile(
      {
        ...consoleVariables,
        puni_root_owner: identity.uid,
        puni_root_group: identity.gid,
        puni_sshd: sshd,
        puni_sshd_config_dir: configuration,
        ...overrides,
      },
      { skipTags: 'puni_console_account_create' },
    );
  }

  it('creates the console account only after sshd refuses it', async () => {
    const accepted = await consoleRun(
      await sshdStandIn([
        'passwordauthentication no',
        'kbdinteractiveauthentication no',
        'denyusers puni-console',
      ]),
    );
    expect(accepted.code).toBe(0);
    const order = ['Refuse passwords for every user', 'Require sshd to refuse the console account'];
    expect(accepted.output.indexOf(order[0])).toBeLessThan(accepted.output.indexOf(order[1]));
    const refused = await consoleRun(
      await sshdStandIn(['passwordauthentication no', 'kbdinteractiveauthentication no']),
    );
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('the account is not created');
  });

  it("refuses the console account's inputs", async () => {
    const sshd = await sshdStandIn(['denyusers puni-console']);
    for (const fault of [
      { puni_console_account: 'puni-fleet' },
      { puni_console_password_hash: 'plain' },
    ]) {
      const refused = await consoleRun(sshd, fault);
      expect(refused.code).not.toBe(0);
      expect(refused.output).toContain(
        'A console account other than the operator and its SHA-512 password hash are required',
      );
    }
  });

  const tailscale = (status: Record<string, unknown>, version = '1.104.7') =>
    standIn(
      'tailscale',
      [
        `if [ "$1" = "version" ]; then printf '%s\\n' '${version}' 'tailscale commit: x'; exit 0; fi`,
        `printf '%s' '${JSON.stringify(status)}'`,
      ].join('\n'),
    );
  const running = { BackendState: 'Running', Self: { Tags: ['tag:platform'] } };

  it('refuses a tailnet tag of no trust class', async () => {
    const refused = await taskFile({
      puni_test_role: 'base',
      puni_test_tasks: 'tailscale-inputs.yml',
      puni_tailscale_tag: 'tag:everything',
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('puni_tailscale_tag must be one of');
  });

  it('refuses an installed Tailscale other than the lock', async () => {
    const variables = { puni_test_role: 'base', puni_test_tasks: 'tailscale-version.yml' };
    expect((await taskFile({ ...variables, puni_tailscale: await tailscale(running) })).code).toBe(
      0,
    );
    const refused = await taskFile({
      ...variables,
      puni_tailscale: await tailscale(running, '1.104.6'),
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('is not the locked 1.104.7');
  });

  it('refuses a device with another tag or an expiring key', async () => {
    const variables = {
      puni_test_role: 'base',
      puni_test_tasks: 'tailscale-state.yml',
      puni_tailscale_tag: 'tag:platform',
    };
    expect((await taskFile({ ...variables, puni_tailscale: await tailscale(running) })).code).toBe(
      0,
    );
    for (const status of [
      { ...running, Self: { Tags: ['tag:platform', 'tag:ci'] } },
      { ...running, Self: { Tags: ['tag:platform'], KeyExpiry: '2027-05-01T00:00:00Z' } },
    ]) {
      const refused = await taskFile({ ...variables, puni_tailscale: await tailscale(status) });
      expect(refused.code).not.toBe(0);
      expect(refused.output).toContain('or its key expires');
    }
  });
});

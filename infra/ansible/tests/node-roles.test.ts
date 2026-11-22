import { chmod, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
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

/** Generates an ed25519 key pair in scratch; the public half is read back as one line. */
async function keyPair(name: string): Promise<{ privateKey: string; publicKey: string }> {
  const privateKey = join(await scratchAsync('node-roles-key-'), name);
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
    privateKey,
  ]);
  expect(made.code).toBe(0);
  return { privateKey, publicKey: (await tool(['cat', `${privateKey}.pub`])).stdout.trim() };
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
  let operatorKey = { puni_operator_private_key_file: '', puni_operator_authorized_keys: [''] };
  beforeAll(async () => {
    const key = await keyPair('operator');
    operatorKey = {
      puni_operator_private_key_file: key.privateKey,
      puni_operator_authorized_keys: [key.publicKey],
    };
  });

  it('refuses an operator key the base role does not install', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      puni_operator_authorized_keys: [(await keyPair('other')).publicKey],
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('is not one of the authorized keys this run installs');
  });

  it('accepts a classified separated host, Docker bridges included', async () => {
    const accepted = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      ansible_interfaces: [...separatedFacts.ansible_interfaces, 'docker0', 'br-1a2b'],
    });
    expect(accepted.output).toContain('ok=');
    expect(accepted.code).toBe(0);
  });

  it('refuses an interface that reports less than the private MTU', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      ansible_enp8s0: { mtu: 1400, ipv4: { address: '10.10.1.11' } },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 reports MTU 1400, below the private MTU 1442');
  });

  it('refuses an interface no class names', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      ansible_interfaces: [...separatedFacts.ansible_interfaces, 'eth9'],
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain("no interface may be unclassified: ['eth9']");
  });

  it("refuses a private interface without the node's address", async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      ansible_enp8s0: { mtu: 1442, ipv4: { address: '10.10.1.99' } },
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 does not carry 10.10.1.11');
  });

  it('refuses public web ports on a host without ingress', async () => {
    const refused = await taskFile({
      ...separatedFacts,
      ...operatorKey,
      puni_public_ports: [80, 443],
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('public ports that follow `ingress`');
  });

  it('refuses a play that does not come through the bastion', async () => {
    const variables = {
      ...separatedFacts,
      ...operatorKey,
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
  it('installs two keys on two lines', async () => {
    const keys = [(await keyPair('one')).publicKey, (await keyPair('two')).publicKey];
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
    const refused = await taskFile({
      puni_test_tasks: 'authorized-keys.yml',
      puni_keys: (await keyPair('one')).publicKey,
      puni_keys_owner: identity.uid,
      puni_keys_group: identity.gid,
      puni_keys_file: join(await scratchAsync('node-roles-home-'), 'authorized_keys'),
      role_path: join(ansibleRoot, 'roles/base'),
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('needs a list of one-line keys');
  });

  it('refuses a fresh-login key the run does not install', async () => {
    const operator = await keyPair('operator');
    const other = await keyPair('other');
    const variables = {
      puni_test_tasks: 'fresh-key.yml',
      puni_fresh_key_file: operator.privateKey,
    };
    const accepted = await taskFile({
      ...variables,
      puni_fresh_authorized_keys: [other.publicKey, operator.publicKey],
    });
    expect(accepted.code).toBe(0);
    const refused = await taskFile({ ...variables, puni_fresh_authorized_keys: [other.publicKey] });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('is not one of the authorized keys this run installs');
  });

  const freshVariables = {
    puni_test_tasks: 'fresh-connection.yml',
    puni_fresh_command: ['true'],
    puni_fresh_user: 'puni-fleet',
    puni_fresh_key_file: '/ops/operator-key',
    ansible_host: '10.10.1.11',
    ansible_user: 'root',
  };

  it('fails when a fresh connection is refused, and opens it outside the multiplexed one', async () => {
    const log = join(await scratchAsync('node-roles-ssh-'), 'argv');
    const recording = await standIn('ssh', `printf '%s\\n' "$@" > ${log}`);
    expect((await taskFile({ ...freshVariables, puni_ssh_client: recording })).code).toBe(0);
    const argv = (await tool(['cat', log])).stdout.split('\n');
    for (const option of ['ControlMaster=no', 'ControlPath=none', 'BatchMode=yes']) {
      expect(argv).toContain(option);
    }
    expect(argv.slice(-4)).toEqual(['sudo', '-n', 'true', '']);
    const refused = await taskFile({
      ...freshVariables,
      puni_ssh_client: await standIn('ssh', 'exit 255'),
    });
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('Open a fresh connection and run the confirming command');
  });

  it('logs in as the operator although the play connects as root', async () => {
    // A stand-in sshd-side refusal of root: the first bastion run connects as root, which the new
    // drop-in refuses, so a login as `ansible_user` could never confirm (review of 606ec3972).
    const refusesRoot = await standIn(
      'ssh',
      ['for argument in "$@"; do', '  case "$argument" in root@*) exit 255 ;; esac', 'done'].join(
        '\n',
      ),
    );
    const accepted = await taskFile({ ...freshVariables, puni_ssh_client: refusesRoot });
    expect(accepted.output).toContain('failed=0');
  });

  it('passes a quoted ProxyCommand through as one argument', async () => {
    const log = join(await scratchAsync('node-roles-ssh-'), 'argv');
    const recording = await standIn('ssh', `printf '%s\\n' "$@" > ${log}`);
    const run = await taskFile({
      ...freshVariables,
      puni_ssh_client: recording,
      ansible_ssh_common_args: `-o 'ProxyCommand=ssh -W %h:%p -i /ops/jump-key jump@203.0.113.12'`,
    });
    expect(run.code).toBe(0);
    expect((await tool(['cat', log])).stdout.split('\n')).toContain(
      'ProxyCommand=ssh -W %h:%p -i /ops/jump-key jump@203.0.113.12',
    );
  });
});

/** A stand-in that records each call's arguments as one line in `log`, then exits `code`. */
async function recordingStandIn(name: string, log: string, code = 0): Promise<string> {
  return standIn(name, `printf '%s\\n' "$*" >> ${log}\nexit ${String(code)}`);
}

describe('the confirmed firewall', () => {
  async function firewallRun(
    state: string,
    options: { loaded: boolean; login: number },
  ): Promise<{ run: Run; armed: number; marker: string | null; file: string }> {
    const log = join(state, 'calls');
    const nft = await standIn(
      'nft',
      `printf '%s\\n' "nft $*" >> ${log}\n[ "$1" = list ] && exit ${options.loaded ? '0' : '1'}\nexit 0`,
    );
    const file = join(state, 'puni-bastion.nft');
    const run = await taskFile(
      {
        puni_test_tasks: 'confirmed-firewall.yml',
        puni_fw_template: join(ansibleRoot, 'roles/bastion/templates/bastion.nft.j2'),
        puni_fw_file: file,
        puni_fw_table: 'inet puni_bastion',
        puni_fw_unit: 'puni-bastion-firewall',
        puni_fw_state_dir: join(state, 'state'),
        puni_fw_unit_changed: false,
        puni_nft: [nft],
        puni_nft_check: nftCheck,
        puni_systemd_run: [await recordingStandIn('systemd-run', log)],
        puni_systemctl: [await recordingStandIn('systemctl', log)],
        puni_ssh_client: await standIn('ssh', `exit ${String(options.login)}`),
        puni_root_owner: identity.uid,
        puni_root_group: identity.gid,
        puni_fresh_user: 'puni-fleet',
        puni_fresh_key_file: '/ops/bastion-admin-key',
      },
      { ...bastionInputs, inventory: await inventoryWith({}, { ansible_host: '203.0.113.12' }) },
    );
    const calls = (await tool(['cat', log])).stdout;
    const marker = await tool(['cat', join(state, 'state/confirmed.sha256')]);
    return {
      run,
      armed: calls.split('\n').filter((line) => line.includes('--on-active=5min')).length,
      marker: marker.code === 0 ? marker.stdout.trim() : null,
      file,
    };
  }

  it('arms again on the run after a failed confirmation, and not once confirmed', async () => {
    const state = await scratchAsync('node-roles-firewall-');
    const failed = await firewallRun(state, { loaded: false, login: 255 });
    expect(failed.run.code).not.toBe(0);
    expect([failed.armed, failed.marker]).toEqual([1, null]);
    // The file is unchanged now; the marker's absence alone makes the run arm and load again.
    const again = await firewallRun(state, { loaded: true, login: 0 });
    expect(again.run.output).toContain('failed=0');
    expect(again.armed).toBe(2);
    const sha = (await tool(['sha256sum', again.file])).stdout.split(' ')[0];
    expect(again.marker).toBe(sha);
    const settled = await firewallRun(state, { loaded: true, login: 0 });
    expect(settled.run.output).toContain('failed=0');
    expect(settled.armed).toBe(2);
    // A table missing although the marker matches is loaded and confirmed again.
    const unloaded = await firewallRun(state, { loaded: false, login: 0 });
    expect(unloaded.armed).toBe(3);
  });

  it('writes a revert that puts back the confirmed file, or removes an unconfirmed one', async () => {
    const state = await scratchAsync('node-roles-firewall-');
    await firewallRun(state, { loaded: false, login: 255 });
    const first = (await tool(['cat', join(state, 'state/revert.sh')])).stdout;
    expect(first).toContain(`rm -f ${join(state, 'puni-bastion.nft')}`);
    await firewallRun(state, { loaded: true, login: 0 });
    expect((await tool(['cat', join(state, 'state/confirmed.nft')])).code).toBe(0);
  });

  it('stops on a ruleset nft refuses', async () => {
    const state = await scratchAsync('node-roles-firewall-');
    await writeFile(
      join(state, 'broken.j2'),
      'table inet t {\n  chain c {\n    type filter hook\n',
    );
    const run = await taskFile(
      {
        puni_test_tasks: 'confirmed-firewall.yml',
        puni_fw_template: join(state, 'broken.j2'),
        puni_fw_file: join(state, 'broken.nft'),
        puni_fw_table: 'inet puni_bastion',
        puni_fw_unit: 'puni-bastion-firewall',
        puni_fw_state_dir: join(state, 'state'),
        puni_fw_unit_changed: false,
        puni_nft: ['false'],
        puni_nft_check: nftCheck,
        puni_systemd_run: ['false'],
        puni_systemctl: ['false'],
        puni_root_owner: identity.uid,
        puni_root_group: identity.gid,
      },
      { inventory: 'localhost,' },
    );
    expect(run.code).not.toBe(0);
    expect(run.output).toContain('Validate the ruleset before changing active rules');
    expect(run.output).not.toContain('Arm the timer that reverts');
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
      { puni_test_role: 'bastion', puni_test_tasks: 'inputs.yml' },
      { ...bastionInputs, inventory: await inventoryWith({ ansible_host: '10.10.1.11:2222' }) },
    );
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('PermitOpen must name private addresses at port 22 only');
  });

  it("refuses the bastion's key inputs", async () => {
    const admin = await keyPair('admin');
    const valid = {
      puni_test_role: 'bastion',
      puni_test_tasks: 'keys-inputs.yml',
      ansible_distribution: 'Ubuntu',
      ansible_distribution_version: '26.04',
      puni_bastion_jump_authorized_keys: ['ssh-ed25519 AAAAjump jump'],
      puni_bastion_admin_authorized_keys: [admin.publicKey],
      puni_bastion_admin_private_key_file: admin.privateKey,
      puni_operator_authorized_keys: ['ssh-ed25519 AAAAserver server'],
      puni_console_password_hash: '$6$salt$hash',
    };
    expect((await taskFile(valid)).code).toBe(0);
    for (const fault of [
      { puni_bastion_jump_authorized_keys: [admin.publicKey] },
      { puni_bastion_jump_authorized_keys: ['ssh-ed25519 AAAAserver server'] },
      { puni_bastion_jump_authorized_keys: 'ssh-ed25519 AAAAjump jump' },
      { puni_console_password_hash: 'plain' },
    ]) {
      const refused = await taskFile({ ...valid, ...fault });
      expect(refused.code).not.toBe(0);
      expect(refused.output).toContain('The jump key, the bastion');
    }
    const otherKey = await taskFile({
      ...valid,
      puni_bastion_admin_private_key_file: (await keyPair('other')).privateKey,
    });
    expect(otherKey.code).not.toBe(0);
    expect(otherKey.output).toContain('is not one of the authorized keys this run installs');
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
});

/** production-hosts.yml with m1plat1's and m2bast1's variables changed, and more servers. */
async function inventoryWith(
  server: Record<string, unknown>,
  bastion: Record<string, unknown> = {},
  agents: Record<string, Record<string, unknown>> = {},
): Promise<string> {
  const inventory = parse(
    await readFile(join(ansibleRoot, 'inventory/production-hosts.yml'), 'utf8'),
  ) as { all: { children: Record<string, { hosts: Record<string, Record<string, unknown>> }> } };
  Object.assign(inventory.all.children['k3s_bootstrap_servers'].hosts['m1plat1'], server);
  Object.assign(inventory.all.children['bastion'].hosts['m2bast1'], bastion);
  Object.assign(inventory.all.children['k3s_agents'].hosts, agents);
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

const bastionOptions = (permitOpen = 'permitopen 10.10.1.11:22') => [
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
  permitOpen,
  'allowusers puni-fleet',
  'allowusers jump',
  'denyusers puni-console',
];

describe("the bastion's sshd change", () => {
  interface Host {
    configuration: string;
    backup: string;
    reloads: string;
  }
  async function bastionHost(): Promise<Host> {
    const directory = await scratchAsync('node-roles-sshd-');
    const host = {
      configuration: join(directory, 'sshd_config.d'),
      backup: join(directory, 'root'),
      reloads: join(directory, 'reloads'),
    };
    await mkdir(host.configuration);
    await mkdir(host.backup);
    await writeFile(join(host.configuration, '10-puni-jump.conf'), 'AllowUsers root jump\n');
    return host;
  }
  async function sshdRun(
    host: Host,
    sshd: string,
    ssh: string,
    agents: Record<string, Record<string, unknown>> = {},
  ) {
    const run = await taskFile(
      {
        puni_test_role: 'bastion',
        puni_test_tasks: 'sshd.yml',
        puni_bastion_sshd: sshd,
        puni_ssh_client: ssh,
        puni_bastion_sshd_dir: host.configuration,
        puni_bastion_backup_dir: host.backup,
        puni_root_owner: identity.uid,
        puni_root_group: identity.gid,
        puni_sshd_reload: [await recordingStandIn('reload', host.reloads)],
        // The first run connects as root; the fresh login must not.
        ansible_user: 'root',
        puni_bastion_admin_private_key_file: '/ops/bastion-admin-key',
      },
      // The bastion's public `ansible_host` is a host variable from $OPS; an extra variable would
      // replace every host's, the servers' that PermitOpen names among them.
      {
        ...bastionInputs,
        inventory: await inventoryWith({}, { ansible_host: '203.0.113.12' }, agents),
      },
    );
    const read = async (name: string) => {
      const found = await tool(['cat', join(host.configuration, name)]);
      return found.code === 0 ? found.stdout : null;
    };
    const reloads = await tool(['cat', host.reloads]);
    return {
      run,
      drop: await read('00-puni-bastion.conf'),
      hand: await read('10-puni-jump.conf'),
      // One line per reload, empty because the reload takes no arguments.
      reloads: reloads.code === 0 ? reloads.stdout.split('\n').length - 1 : 0,
    };
  }
  const refusesRoot = () =>
    standIn(
      'ssh',
      ['for argument in "$@"; do', '  case "$argument" in root@*) exit 255 ;; esac', 'done'].join(
        '\n',
      ),
    );

  it('installs the drop-in and removes the hand-made one when a fresh login succeeds', async () => {
    const result = await sshdRun(
      await bastionHost(),
      await sshdStandIn(bastionOptions()),
      await refusesRoot(),
    );
    expect(result.run.output).toContain('failed=0');
    expect([result.drop !== null, result.hand]).toEqual([true, null]);
  });

  it('puts the hand-made drop-in back when a fresh login fails', async () => {
    const result = await sshdRun(
      await bastionHost(),
      await sshdStandIn(bastionOptions()),
      await standIn('ssh', 'exit 255'),
    );
    expect(result.run.output).toContain('sshd was put back as it was');
    expect(result.run.output).toContain('Read back what sshd applies to jump');
    expect([result.drop, result.hand]).toEqual([null, 'AllowUsers root jump\n']);
  });

  it('stops on an sshd configuration that does not validate, and puts sshd back', async () => {
    const result = await sshdRun(
      await bastionHost(),
      await sshdStandIn(bastionOptions(), false),
      await refusesRoot(),
    );
    expect(result.run.output).toContain('sshd was put back as it was');
    expect(result.run.output).toContain('Validate the whole sshd configuration');
    expect(result.run.output).not.toContain('Read back what sshd applies to jump');
    expect([result.drop, result.hand]).toEqual([null, 'AllowUsers root jump\n']);
  });

  it("restores the previous run's drop-in when a changing run's fresh login fails", async () => {
    const host = await bastionHost();
    const first = await sshdRun(host, await sshdStandIn(bastionOptions()), await refusesRoot());
    expect(first.run.output).toContain('failed=0');
    // A second server changes the drop-in's PermitOpen; this run's fresh login then fails.
    const second = await sshdRun(
      host,
      await sshdStandIn(bastionOptions('permitopen 10.10.1.11:22 10.10.1.13:22')),
      await standIn('ssh', 'exit 255'),
      { h6apps: { ansible_host: '10.10.1.13' } },
    );
    expect(second.run.output).toContain('sshd was put back as it was');
    expect(second.drop).toBe(first.drop);
    expect(second.hand).toBeNull();
  });

  it('leaves an unchanged sshd alone when the fresh login fails', async () => {
    const host = await bastionHost();
    const first = await sshdRun(host, await sshdStandIn(bastionOptions()), await refusesRoot());
    expect(first.reloads).toBe(1);
    const second = await sshdRun(
      host,
      await sshdStandIn(bastionOptions()),
      await standIn('ssh', 'exit 255'),
    );
    expect(second.run.code).not.toBe(0);
    expect(second.run.output).toContain('This run changed nothing in sshd');
    expect([second.drop, second.hand, second.reloads]).toEqual([first.drop, null, 1]);
  });

  it('fails the read-back when an earlier drop-in sets another PermitOpen or adds root', async () => {
    for (const options of [
      bastionOptions('permitopen 10.10.1.99:22'),
      [...bastionOptions(), 'allowusers root'],
    ]) {
      const result = await sshdRun(
        await bastionHost(),
        await sshdStandIn(options),
        await refusesRoot(),
      );
      expect(result.run.output).toContain(
        'sshd applies other values to jump than the drop-in sets',
      );
      expect(result.hand).toBe('AllowUsers root jump\n');
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

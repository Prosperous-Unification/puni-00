import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
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
} from '../../../tools/tool-fleet/src/node-access';

// The roles of openspec/changes/separate-node-roles, slices 1.2, 1.3, 1.8 and 1.9, rendered and
// asserted by the locked Ansible on this machine; no host is contacted. `tool-fleet:check` judges
// the same renders inside the controller image. Needs ansible-playbook and ansible-inventory at
// the locked ansible-core (`PUNI_TEST_ANSIBLE_PLAYBOOK`, `PUNI_TEST_ANSIBLE_INVENTORY`) and
// `unshare` with `nft` for the syntax check of each rendered ruleset.
const ansibleRoot = join(import.meta.dir, '..');
const repository = join(ansibleRoot, '../..');
const playbookCommand = process.env['PUNI_TEST_ANSIBLE_PLAYBOOK'] ?? 'ansible-playbook';
const inventoryCommand = process.env['PUNI_TEST_ANSIBLE_INVENTORY'] ?? 'ansible-inventory';

async function run(argv: string[]): Promise<{ code: number; output: string; stdout: string }> {
  const child = Bun.spawn(argv, {
    cwd: ansibleRoot,
    env: { ...process.env, ANSIBLE_CONFIG: join(ansibleRoot, 'ansible.cfg') },
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

beforeAll(async () => {
  const lock = (await Bun.file(join(repository, 'infra/versions/toolchain.json')).json()) as {
    controller: { ansibleCore: string };
  };
  const version = await run([playbookCommand, '--version']);
  expect(version.code).toBe(0);
  expect(version.output).toContain(`[core ${lock.controller.ansibleCore}]`);
});

/** Renders every host of `inventory` through tests/render-hosts.yml, as check-ansible.py does. */
async function renderInventory(inventory: string, label: string): Promise<HostRender[]> {
  const root = await scratchAsync('node-roles-');
  const rendered = await run([
    playbookCommand,
    '-i',
    inventory,
    'tests/render-hosts.yml',
    '-e',
    `puni_render_root=${root}`,
  ]);
  if (rendered.code !== 0) throw new Error(`render of ${label} failed:\n${rendered.output}`);
  const listed = await run([inventoryCommand, '-i', inventory, '--list']);
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

async function existingFirewalls(): Promise<Record<string, string>> {
  const directory = join(repository, 'tools/tool-fleet/src/fixtures/firewall-existing-hosts');
  const committed: Record<string, string> = {};
  for (const name of await readdir(directory)) {
    committed[`inventory/production-existing-hosts.yml/${name.replace(/\.nft$/, '')}`] =
      await readFile(join(directory, name), 'utf8');
  }
  return committed;
}

/** `nft -c` in a private network namespace: the ruleset parses without touching this host. */
async function requireValidRuleset(text: string): Promise<void> {
  const directory = await scratchAsync('node-roles-nft-');
  const path = join(directory, 'ruleset.nft');
  await writeFile(path, text);
  const checked = await run(['unshare', '-rn', 'nft', '-c', '-f', path]);
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

  it('renders every host of both static inventories as the judges require', async () => {
    expect(judgeHostRenders([...platform, ...existing], await existingFirewalls())).toEqual([]);
    for (const render of [...platform, ...existing, ...grown]) {
      for (const name of ['firewall.nft', 'bastion.nft']) {
        const text = render.files[name];
        if (text !== undefined) await requireValidRuleset(text);
      }
    }
  });

  it('renders the platform taint and admission plugin on m1plat1', () => {
    // Proof: removing the template's platform-services branch, dropping the etcd line and
    // writing `=` each made this fail (2026-11-22).
    const config = find(platform, 'm1plat1').files['k3s-server.yaml'];
    expect(config).toContain('  - CriticalAddonsOnly=true:NoSchedule\n');
    expect(judgeServerConfig(find(platform, 'm1plat1'))).toEqual([]);
  });

  it('keeps the existing servers without an API server argument', () => {
    // Proof: writing the kube-apiserver-arg entry for every server made this fail (2026-11-22).
    expect(judgeServerConfig(find(existing, 'h4claw'))).toEqual([]);
  });

  it("renders the existing inventory's firewalls byte-equal", async () => {
    // Proof: changing the template's default branch (the "retain SSH recovery" rule) made this
    // fail for h4claw and h3mon (2026-11-22).
    const committed = await existingFirewalls();
    for (const host of ['h4claw', 'h3mon']) {
      expect(find(existing, host).files['firewall.nft']).toBe(
        committed[`inventory/production-existing-hosts.yml/${host}`],
      );
    }
  });

  it('renders a separated firewall the judge accepts on a server and an ingress agent', () => {
    // Proof: in the template, keeping "retain SSH recovery", admitting the private range to SSH
    // or to the cluster ports, dropping the bastion rule, dropping `ct state new` from a drop
    // and rendering 80 and 443 for every host each made this fail (2026-11-22).
    const nodeAddresses = ['10.10.1.11', '10.10.1.13'];
    expect(judgeSeparatedFirewall(find(grown, 'm1plat1'), { nodeAddresses })).toEqual([]);
    expect(judgeSeparatedFirewall(find(grown, 'h6apps'), { nodeAddresses })).toEqual([]);
    expect(
      judgeSeparatedFirewall(find(platform, 'm1plat1'), { nodeAddresses: ['10.10.1.11'] }),
    ).toEqual([]);
  });

  it('forwards to every server the inventory adds', () => {
    // Proof: rendering PermitOpen from a literal list made this fail; dropping the meter or
    // admitting the private range in bastion.nft.j2 made it fail too (2026-11-22).
    expect(find(grown, 'm2bast1').files['bastion-sshd.conf']).toContain(
      'PermitOpen 10.10.1.11:22 10.10.1.13:22',
    );
    expect(judgeBastion(find(grown, 'm2bast1'), ['10.10.1.11', '10.10.1.13'])).toEqual([]);
  });
});

describe("the network role's MTU guard", () => {
  async function assertInputs(reported: number) {
    const facts = join(await scratchAsync('node-roles-mtu-'), 'facts.json');
    await writeFile(
      facts,
      JSON.stringify({
        puni_cluster_id: 'platform-production',
        puni_node_ip: '10.10.1.11',
        puni_private_interface: 'enp8s0',
        ansible_interfaces: ['lo', 'enp8s0'],
        ansible_enp8s0: { mtu: reported },
        puni_private_mtu: 1442,
        puni_cluster_cidr: '10.42.0.0/16',
        puni_enrolled_private_addresses: ['10.10.1.11'],
      }),
    );
    return run([
      playbookCommand,
      '-i',
      'localhost,',
      'tests/network-inputs.yml',
      '-e',
      `@${facts}`,
    ]);
  }

  it('refuses an interface that reports less than the private MTU', async () => {
    const refused = await assertInputs(1400);
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('enp8s0 reports MTU 1400, below the private MTU 1442');
    expect((await assertInputs(1442)).code).toBe(0);
  });
});

describe("the bastion's read-back", () => {
  async function readBack(permitOpen: string) {
    const directory = await scratchAsync('node-roles-sshd-');
    const sshd = join(directory, 'sshd');
    // Stands in for `sshd -T -C user=jump,...` as an earlier drop-in would leave it.
    await writeFile(
      sshd,
      [
        '#!/bin/sh',
        'cat <<EOF',
        'passwordauthentication no',
        'kbdinteractiveauthentication no',
        'permitrootlogin no',
        'permittty no',
        'allowagentforwarding no',
        'x11forwarding no',
        'allowstreamlocalforwarding no',
        'permittunnel no',
        'allowtcpforwarding local',
        `permitopen ${permitOpen}`,
        'EOF',
        '',
      ].join('\n'),
    );
    await chmod(sshd, 0o755);
    return run([
      playbookCommand,
      '-i',
      'localhost,',
      'tests/bastion-readback.yml',
      '-e',
      JSON.stringify({ puni_bastion_sshd: sshd, puni_bastion_permit_open: ['10.10.1.11:22'] }),
    ]);
  }

  it('fails the read-back when an earlier drop-in sets another PermitOpen', async () => {
    const refused = await readBack('10.10.1.99:22');
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('sshd applies other values to jump than the drop-in sets');
    expect((await readBack('10.10.1.11:22')).code).toBe(0);
  });
});

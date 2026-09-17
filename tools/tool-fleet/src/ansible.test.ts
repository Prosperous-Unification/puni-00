import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  decodeMachineId,
  decodeMachineList,
  decodeSecureK3sToken,
  decodeSshHostKey,
  type LabMachine,
  parseLabRequest,
  planLabOperation,
  readOrCreateClusterToken,
  renderCloudInit,
  requireAnsibleLayout,
  requireMultipassVersion,
  requireSshPrivateKey,
  requireSshPublicKey,
  requireStableRecap,
  runLabCommand,
} from './lab';

describe('the disposable Ubuntu VM lab', () => {
  it('refuses before launch when the bootstrap playbook is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fleet-ansible-layout-'));
    await mkdir(join(root, 'infra/ansible/playbooks'), { recursive: true });
    await writeFile(join(root, 'infra/ansible/ansible.cfg'), '[defaults]\n');
    await writeFile(join(root, 'infra/ansible/playbooks/join.yml'), '---\n');
    await writeFile(join(root, 'infra/ansible/playbooks/validate-enrollment.yml'), '---\n');

    expect(requireAnsibleLayout(root)).rejects.toThrow(/bootstrap\.yml.*required/i);
  });

  it('derives every machine name from a bounded lab identity', () => {
    const request = parseLabRequest([
      'up',
      '--lab-id',
      'review-42',
      '--profile',
      'workers',
      '--ssh-public-key',
      '/keys/lab.pub',
      '--ssh-private-key',
      '/keys/lab',
    ]);
    const operation = planLabOperation(request, []);

    expect(operation.prefix).toBe('puni-fleet-review-42-workers-');
    expect(operation.commands).toHaveLength(3);
    expect(operation.commands[0]?.arguments).toContain('puni-fleet-review-42-workers-server-1');
    expect(operation.commands[1]?.arguments).toContain('puni-fleet-review-42-workers-agent-1');
    expect(operation.commands[2]?.arguments).toContain('puni-fleet-review-42-workers-agent-2');
    expect(() =>
      parseLabRequest(['status', '--lab-id', '../prod', '--profile', 'platform']),
    ).toThrow(/lab id/i);
    expect(() =>
      parseLabRequest(['down', '--lab-id', 'prod', '--profile', 'platform', 'arbitrary-host']),
    ).toThrow(/position/i);
    const restart = planLabOperation(request, [
      {
        name: 'puni-fleet-review-42-workers-server-1',
        state: 'Stopped',
        ipv4: [],
      },
    ]);
    expect(restart.commands[0]?.arguments).toEqual([
      'start',
      'puni-fleet-review-42-workers-server-1',
    ]);
  });

  it('rejects malformed lifecycle requests at one production boundary', () => {
    for (const arguments_ of [
      [],
      ['create', '--lab-id', 'review', '--profile', 'platform'],
      ['status', '--lab-id'],
      ['status', '--unknown', 'value', '--lab-id', 'review', '--profile', 'platform'],
      ['status', '--lab-id', 'review', '--lab-id', 'again', '--profile', 'platform'],
      ['status', '--lab-id', 'review', '--profile', 'other'],
      ['up', '--lab-id', 'review', '--profile', 'platform'],
      ['status', '--lab-id', 'review', '--profile', 'platform', '--ssh-private-key', '/key'],
    ]) {
      expect(() => parseLabRequest(arguments_)).toThrow(/fleet lab/i);
    }
  });

  it('rejects malformed provider inventory and SSH host-key evidence', () => {
    expect(decodeMachineList('{"list":[]}')).toEqual([]);
    expect(() => decodeMachineList('{')).toThrow(/malformed JSON/i);
    expect(() => decodeMachineList('{}')).toThrow(/missing.*machine list/i);
    expect(() => decodeMachineList('{"list":[7]}')).toThrow(/machine 0.*malformed/i);
    expect(() => decodeMachineList('{"list":[{"name":"lab"}]}')).toThrow(/machine 0.*incomplete/i);
    expect(() =>
      decodeMachineList('{"list":[{"name":"lab","state":"Running","ipv4":["999.0.0.1"]}]}'),
    ).toThrow(/machine 0.*incomplete/i);
    expect(decodeSshHostKey('ssh-ed25519 AAAATEST host\n', 'lab')).toEqual({
      kind: 'ssh-ed25519',
      encoded: 'AAAATEST',
    });
    expect(() => decodeSshHostKey('', 'lab')).toThrow(/host key/i);
    expect(() => decodeSshHostKey('ssh-rsa AAAATEST', 'lab')).toThrow(/host key/i);
    expect(() => decodeSshHostKey('ssh-ed25519 ***', 'lab')).toThrow(/host key/i);
    expect(decodeMachineId('0123456789abcdef0123456789abcdef\n', 'lab')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
    expect(() => decodeMachineId('different-host', 'lab')).toThrow(/machine identity/i);
  });

  it('rejects key material that could escape cloud-init or fail after launch', () => {
    expect(() => {
      requireSshPublicKey('ssh-ed25519 AAAATEST review');
      requireSshPrivateKey(
        new TextEncoder().encode(['-----BEGIN OPENSSH', ' PRIVATE KEY-----\nAAAA\n'].join('')),
      );
    }).not.toThrow();
    expect(() => {
      requireSshPublicKey('ssh-ed25519 AAAATEST\nusers: [root]');
    }).toThrow(/public key.*malformed/i);
    expect(() => {
      requireSshPublicKey('ssh-ed25519 AAAATEST label: injected');
    }).toThrow(/public key.*malformed/i);
    expect(() => {
      requireSshPrivateKey(new TextEncoder().encode('not a private key'));
    }).toThrow(/private key.*malformed/i);
    expect(renderCloudInit('key: __PUNI_SSH_PUBLIC_KEY__\n', 'ssh-ed25519 AAAATEST')).toContain(
      'key: ssh-ed25519 AAAATEST',
    );
    expect(() => renderCloudInit('users: []\n', 'ssh-ed25519 AAAATEST')).toThrow(/exactly one/i);
    expect(() =>
      renderCloudInit(
        'first: __PUNI_SSH_PUBLIC_KEY__\nsecond: __PUNI_SSH_PUBLIC_KEY__\n',
        'ssh-ed25519 AAAATEST',
      ),
    ).toThrow(/exactly one/i);
  });

  it('requires the pinned provider version and a bounded subprocess', () => {
    expect(() => {
      requireMultipassVersion('multipass 1.16.4\nmultipassd 1.16.4\n');
    }).not.toThrow();
    expect(() => {
      requireMultipassVersion('multipass 1.17.0\n');
    }).toThrow(/1\.16\.4 is required/i);
    expect(() => {
      requireMultipassVersion('multipass 1.16.40\n');
    }).toThrow(/1\.16\.4 is required/i);
    expect(runLabCommand(process.execPath, ['-e', 'await Bun.sleep(100)'], 1)).rejects.toThrow(
      /timed out after 1ms/i,
    );
  });

  it('kills the subprocess group before a timed-out mutation can continue', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-lab-timeout-'));
    const sentinel = join(directory, 'survived');
    expect(
      runLabCommand(
        '/bin/sh',
        ['-c', '(sleep 0.08; printf survived > "$1") & sleep 1', 'fleet-timeout', sentinel],
        20,
      ),
    ).rejects.toThrow(/timed out after 20ms/i);
    await Bun.sleep(150);
    expect(Bun.file(sentinel).size).toBe(0);
  });

  it('deletes only exact-prefix machines and refuses ambiguous provider names', () => {
    const request = parseLabRequest(['down', '--lab-id', 'review-42', '--profile', 'platform']);
    const machines: readonly LabMachine[] = [
      { name: 'puni-fleet-review-42-platform-server-1', state: 'Running', ipv4: ['10.0.0.2'] },
      { name: 'puni-fleet-review-42-platform-agent-1', state: 'Stopped', ipv4: ['10.0.0.3'] },
      { name: 'puni-fleet-review-420-platform-server-1', state: 'Running', ipv4: ['10.0.0.4'] },
      { name: 'production-server', state: 'Running', ipv4: ['10.0.0.5'] },
    ];

    expect(planLabOperation(request, machines).commands).toEqual([
      {
        executable: 'multipass',
        arguments: [
          'delete',
          '--purge',
          'puni-fleet-review-42-platform-agent-1',
          'puni-fleet-review-42-platform-server-1',
        ],
      },
    ]);
    expect(() =>
      planLabOperation(request, [
        { name: 'puni-fleet-review-42-platform-unknown', state: 'Running', ipv4: [] },
      ]),
    ).toThrow(/unexpected owned machine/i);
  });

  it('requires complete second-pass recaps with only modeled probe changes', () => {
    expect(() => {
      requireStableRecap(
        'PLAY RECAP\nserver : ok=20 changed=0 unreachable=0 failed=0',
        ['server'],
        0,
      );
    }).not.toThrow();
    expect(() => {
      requireStableRecap(
        'PLAY RECAP\nserver : ok=20 changed=1 unreachable=0 failed=0',
        ['server'],
        0,
      );
    }).toThrow(/unexpectedly/i);
    expect(() => {
      requireStableRecap(
        'PLAY RECAP\nserver : ok=19 changed=0 unreachable=0 failed=1',
        ['server'],
        0,
      );
    }).toThrow(/failed host/i);
    expect(() => {
      requireStableRecap('no recap', ['server'], 0);
    }).toThrow(/missing PLAY RECAP/i);
    expect(() => {
      requireStableRecap('PLAY RECAP\n', ['server'], 0);
    }).toThrow(/every expected host/i);
    expect(() => {
      requireStableRecap(
        'PLAY RECAP\nserver : ok=20 changed=1 unreachable=0 failed=0',
        ['server'],
        1,
      );
    }).not.toThrow();
  });

  it('never invents a replacement token for existing machines', async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), 'fleet-lab-token-'));
    expect(readOrCreateClusterToken(stateDirectory, false)).rejects.toThrow(/missing.*existing/i);
    const token = await readOrCreateClusterToken(stateDirectory, true);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await readOrCreateClusterToken(stateDirectory, false)).toBe(token);
    await writeFile(join(stateDirectory, 'cluster-token'), 'malformed\n');
    expect(readOrCreateClusterToken(stateDirectory, false)).rejects.toThrow(/malformed/i);
  });

  it('accepts only CA-bound k3s enrollment tokens for the intended principal', () => {
    const caHash = 'a'.repeat(64);
    const credential = 'b'.repeat(64);
    const agentToken = `K10${caHash}::node:${credential}`;
    const serverToken = `K10${caHash}::server:${credential}`;

    expect(decodeSecureK3sToken(`${agentToken}\n`, 'node')).toBe(agentToken);
    expect(decodeSecureK3sToken(serverToken, 'server')).toBe(serverToken);
    expect(() => decodeSecureK3sToken(credential, 'node')).toThrow(/CA-bound.*node/i);
    expect(() => decodeSecureK3sToken(agentToken, 'server')).toThrow(/CA-bound.*server/i);
    expect(() => decodeSecureK3sToken(`K10${'g'.repeat(64)}::node:${credential}`, 'node')).toThrow(
      /CA-bound.*node/i,
    );
  });

  it('retrieves generated tokens from the created server before joining', async () => {
    const repositoryRoot = join(import.meta.dir, '../../..');
    const root = await mkdtemp(join(tmpdir(), 'fleet-lab-generated-token-'));
    const executableDirectory = join(root, 'bin');
    const providerState = join(root, 'provider-state');
    const providerLog = join(root, 'provider-log');
    const publicKeyPath = join(root, 'id.pub');
    const privateKeyPath = join(root, 'id');
    await mkdir(join(root, 'infra/ansible/playbooks'), { recursive: true });
    await mkdir(join(root, 'infra/local'), { recursive: true });
    await mkdir(join(root, 'infra/versions'), { recursive: true });
    await mkdir(executableDirectory);
    await writeFile(join(root, 'infra/ansible/ansible.cfg'), '[defaults]\n');
    for (const playbook of ['bootstrap.yml', 'join.yml', 'validate-enrollment.yml']) {
      await writeFile(join(root, 'infra/ansible/playbooks', playbook), '---\n');
    }
    await writeFile(
      join(root, 'infra/local/cloud-init.yaml'),
      '#cloud-config\nssh_authorized_keys:\n  - __PUNI_SSH_PUBLIC_KEY__\n',
    );
    await writeFile(
      join(root, 'infra/versions/toolchain.json'),
      await readFile(join(repositoryRoot, 'infra/versions/toolchain.json')),
    );
    await writeFile(publicKeyPath, 'ssh-ed25519 AAAATEST fleet-lab\n');
    await writeFile(privateKeyPath, ['-----BEGIN OPENSSH', ' PRIVATE KEY-----\nAAAA\n'].join(''));
    const multipass = join(executableDirectory, 'multipass');
    await writeFile(
      multipass,
      `#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const arguments_ = process.argv.slice(2);
appendFileSync(process.env.FLEET_FAKE_LOG, JSON.stringify(arguments_) + '\\n');
if (arguments_[0] === 'version') process.stdout.write('multipass 1.16.4\\nmultipassd 1.16.4\\n');
else if (arguments_[0] === 'launch') appendFileSync(process.env.FLEET_FAKE_STATE, arguments_[arguments_.indexOf('--name') + 1] + '\\n');
else if (arguments_[0] === 'list') {
  const names = existsSync(process.env.FLEET_FAKE_STATE) ? readFileSync(process.env.FLEET_FAKE_STATE, 'utf8').trim().split('\\n').filter(Boolean) : [];
  process.stdout.write(JSON.stringify({ list: names.map((name, position) => ({ name, state: 'Running', ipv4: [\`10.55.0.\${String(position + 11)}\`] })) }));
} else if (arguments_[0] === 'exec') {
  const machine = arguments_[1];
  const command = arguments_.slice(3).join(' ');
  if (command.includes('/etc/ssh/ssh_host_ed25519_key.pub')) process.stdout.write('ssh-ed25519 AAAATEST\\n');
  else if (command.includes('ip -j route get')) process.stdout.write('[{"dev":"ens4"}]\\n');
  else if (command.includes('/etc/machine-id')) process.stdout.write(machine.includes('server') ? 'a'.repeat(32) + '\\n' : 'b'.repeat(32) + '\\n');
  else if (command.includes('/server/node-token')) process.stdout.write('K10' + 'c'.repeat(64) + '::server:' + 'd'.repeat(64) + '\\n');
  else if (command.includes('/server/agent-token')) process.stdout.write('K10' + 'c'.repeat(64) + '::node:' + 'e'.repeat(64) + '\\n');
  else process.exit(41);
} else process.exit(42);
`,
    );
    const docker = join(executableDirectory, 'docker');
    await writeFile(
      docker,
      `#!/usr/bin/env bun
const command = process.argv.slice(2).join(' ');
const host = command.includes('join.yml') ? 'puni-fleet-review-platform-agent-1' : 'puni-fleet-review-platform-server-1';
const changed = command.includes('validate-enrollment.yml') ? 1 : 0;
process.stdout.write(\`PLAY RECAP\\n\${host} : ok=20 changed=\${String(changed)} unreachable=0 failed=0\\n\`);
`,
    );
    await chmod(multipass, 0o700);
    await chmod(docker, 0o700);
    const runnerPath = join(root, 'run-lab.ts');
    await writeFile(
      runnerPath,
      `import { runVmLab } from ${JSON.stringify(join(repositoryRoot, 'tools/tool-fleet/src/lab.ts'))};
await runVmLab(${JSON.stringify([
        'up',
        '--lab-id',
        'review',
        '--profile',
        'platform',
        '--ssh-public-key',
        publicKeyPath,
        '--ssh-private-key',
        privateKeyPath,
      ])}, ${JSON.stringify(root)});
`,
    );
    const invocation = Bun.spawnSync({
      cmd: [process.execPath, runnerPath],
      env: {
        ...process.env,
        PATH: `${executableDirectory}:${process.env['PATH'] ?? ''}`,
        FLEET_FAKE_STATE: providerState,
        FLEET_FAKE_LOG: providerLog,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(invocation.stderr.toString()).toBe('');
    expect(invocation.exitCode).toBe(0);
    const invocations = await readFile(providerLog, 'utf8');
    expect(invocations).toContain('puni-fleet-review-platform-server-1');
    expect(invocations).not.toContain('platform--server-1');
    expect(invocations).toContain('/var/lib/rancher/k3s/server/node-token');
    expect(invocations).toContain('/var/lib/rancher/k3s/server/agent-token');
  });

  it('wires ownership refusal through the production lab command', () => {
    for (const arguments_ of [
      ['status', '--lab-id', '../prod', '--profile', 'platform'],
      ['down', '--lab-id', 'review-42', '--profile', 'platform', 'production-server'],
    ]) {
      const invocation = Bun.spawnSync([
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'lab',
        ...arguments_,
      ]);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toMatch(/lab id|position/i);
    }
  });

  it('propagates a provider failure through the production lab command', async () => {
    const executableDirectory = await mkdtemp(join(tmpdir(), 'fleet-fake-provider-'));
    const multipassPath = join(executableDirectory, 'multipass');
    await writeFile(multipassPath, '#!/bin/sh\nexit 42\n');
    await chmod(multipassPath, 0o700);
    const invocation = Bun.spawnSync({
      cmd: [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'lab',
        'status',
        '--lab-id',
        'review-42',
        '--profile',
        'platform',
      ],
      env: { ...process.env, PATH: `${executableDirectory}:${process.env['PATH'] ?? ''}` },
    });

    expect(invocation.exitCode).toBe(1);
    expect(invocation.stderr.toString()).toMatch(/multipass version failed with exit 42/i);
  });
});

describe('the Ansible host and k3s contract', () => {
  it('renders an actual newline and a valid sudoers boundary', async () => {
    const root = join(import.meta.dir, '../../..');
    const template = await readFile(
      join(root, 'infra/ansible/roles/base/templates/operator-sudoers.j2'),
      'utf8',
    );
    const rendered = template.replace('{{ puni_operator_name }}', 'puni');
    const directory = await mkdtemp(join(tmpdir(), 'fleet-sudoers-'));
    const sudoersPath = join(directory, 'puni');
    await writeFile(sudoersPath, rendered);

    expect(rendered).toBe('puni ALL=(root) NOPASSWD: ALL\n');
    const validation = Bun.spawnSync(['/usr/sbin/visudo', '-cf', sudoersPath]);
    expect(validation.exitCode).toBe(0);
  });

  it('keeps required inputs explicit and bootstraps and joins separately', async () => {
    const root = join(import.meta.dir, '../../..');
    await requireAnsibleLayout(root);
    const bootstrap = await readFile(join(root, 'infra/ansible/playbooks/bootstrap.yml'), 'utf8');
    const joinPlaybook = await readFile(join(root, 'infra/ansible/playbooks/join.yml'), 'utf8');
    const base = await readFile(join(root, 'infra/ansible/roles/base/tasks/main.yml'), 'utf8');
    const network = await readFile(
      join(root, 'infra/ansible/roles/network/tasks/main.yml'),
      'utf8',
    );
    const firewall = await readFile(
      join(root, 'infra/ansible/roles/network/templates/k3s.nft.j2'),
      'utf8',
    );
    const firewallService = await readFile(
      join(root, 'infra/ansible/roles/network/templates/puni-k3s-firewall.service.j2'),
      'utf8',
    );
    const serverService = await readFile(
      join(root, 'infra/ansible/roles/k3s_server/templates/k3s.service.j2'),
      'utf8',
    );
    const agentService = await readFile(
      join(root, 'infra/ansible/roles/k3s_agent/templates/k3s-agent.service.j2'),
      'utf8',
    );
    const server = await readFile(
      join(root, 'infra/ansible/roles/k3s_server/tasks/main.yml'),
      'utf8',
    );
    const agent = await readFile(
      join(root, 'infra/ansible/roles/k3s_agent/tasks/main.yml'),
      'utf8',
    );
    const labSource = await readFile(join(root, 'tools/tool-fleet/src/lab.ts'), 'utf8');

    expect(bootstrap).toContain('k3s_bootstrap_servers');
    expect(bootstrap).toContain('puni_k3s_cluster_init: true');
    expect(joinPlaybook).toContain('k3s_join_servers');
    expect(joinPlaybook).toContain('puni_k3s_cluster_init: false');
    expect(joinPlaybook).toContain('k3s_agents');
    expect(base).toContain('puni_operator_authorized_keys is defined');
    expect(base).toContain('content: |');
    expect(base).toContain('puni_swap_enabled is defined');
    expect(base).toContain("ansible_distribution_version == '24.04'");
    expect(base).toContain('path: /etc/systemd/journald.conf.d');
    expect(network).toContain('nft -c -f');
    expect(network).toContain('puni-k3s-firewall');
    expect(network).toContain('notify: Restart fleet firewall');
    expect(network).toContain('-M do');
    expect(firewall).toContain('destroy table inet puni_k3s');
    expect(firewall).toContain('ip saddr @cluster_ipv4 tcp dport 6443 accept');
    expect(firewall).toContain('tcp dport { 6443, 2379, 2380, 10250 } reject');
    expect(firewall).toContain('udp dport 8472 drop');
    expect(firewallService).toContain('WantedBy=multi-user.target');
    expect(serverService).toContain('Requires=puni-k3s-firewall.service');
    expect(agentService).toContain('Requires=puni-k3s-firewall.service');
    expect(server).toContain("checksum: 'sha256:{{ puni_k3s_sha256 }}'");
    expect(server).toContain("puni_k3s_server_credential is match('^[0-9a-f]{64}$')");
    expect(server).toContain("puni_k3s_server_token is match('^K10[0-9a-f]{64}::server:");
    expect(server).toContain('no_log: true');
    expect(agent).toContain("checksum: 'sha256:{{ puni_k3s_sha256 }}'");
    expect(agent).toContain("puni_k3s_agent_token is match('^K10[0-9a-f]{64}::node:");
    expect(agent).toContain('notify: Restart k3s agent');
    expect(agent).toContain('no_log: true');
    expect(labSource).toContain('`${operation.prefix}server-1`');
    expect(labSource).toContain('observeK3sEnrollmentTokens(serverName)');
    expect(labSource).toContain("'--kill-after=0.1s'");
  });

  it('ships no role defaults for required security or identity state', async () => {
    const root = join(import.meta.dir, '../../..');
    for (const role of ['base', 'network', 'storage', 'k3s_server', 'k3s_agent']) {
      const defaults = Bun.file(join(root, `infra/ansible/roles/${role}/defaults/main.yml`));
      expect(await defaults.exists()).toBe(false);
    }
  });

  it('keeps token files private and enrollment taints until validation', async () => {
    const root = join(import.meta.dir, '../../..');
    const serverConfig = await readFile(
      join(root, 'infra/ansible/roles/k3s_server/templates/config.yaml.j2'),
      'utf8',
    );
    const agentConfig = await readFile(
      join(root, 'infra/ansible/roles/k3s_agent/templates/config.yaml.j2'),
      'utf8',
    );
    const validation = await readFile(
      join(root, 'infra/ansible/playbooks/validate-enrollment.yml'),
      'utf8',
    );

    expect(serverConfig).toContain('token-file: /etc/rancher/k3s/server-token');
    expect(agentConfig).toContain('token-file: /etc/rancher/k3s/agent-token');
    expect(serverConfig).toContain('puni.io/enrollment=pending:NoSchedule');
    expect(agentConfig).toContain('puni.io/enrollment=pending:NoSchedule');
    expect(validation).toContain('kubectl wait --for=condition=Ready');
    expect(validation).toContain('deployment/coredns');
    expect(validation).toContain('kubectl patch deployment coredns');
    expect(validation).toContain('--patch-file=/dev/stdin');
    expect(validation).toContain('exec busybox inetd -f /inetd.conf');
    expect(validation).toContain('"key":"puni.io/enrollment"');
    expect(validation.match(/key: puni\.io\/worker-control-plane/g)).toHaveLength(2);
    expect(validation).toContain('../tasks/require-enrollment-identity.yml');
    expect(validation).toContain('hostvars[puni_node_identity.item].puni_machine_id');
    expect(validation).toContain(
      'dns-network-{{ ansible_loop.index }}-{{ puni_validation_run_id }}',
    );
    expect(validation).toContain('puni.io/enrollment:NoSchedule-');
    expect(serverConfig).toContain('puni.dev/capability-{{ capability }}=true');
    expect(agentConfig).toContain('puni.dev/capability-{{ capability }}=true');
  });
});

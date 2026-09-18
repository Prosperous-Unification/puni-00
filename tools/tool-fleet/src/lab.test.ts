import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { parseLabRequest, planLabOperation, renderLabKubeconfig } from './lab';
import {
  ownedQemuPid,
  planQemuMachine,
  readQemuLock,
  requireBaseImage,
  requireQemuInstallation,
} from './lab-qemu';

const repositoryRoot = join(import.meta.dir, '../../..');
const versionLine = 'QEMU emulator version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)';

async function writeExecutable(path: string, source: string): Promise<void> {
  await writeFile(path, source);
  await chmod(path, 0o700);
}

interface QemuFixture {
  readonly root: string;
  readonly prefix: string;
  readonly bin: string;
  readonly log: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

/** A lab root with a fake rootless QEMU prefix, fake SSH, and fake locked controller. */
async function createQemuFixture(imageBytes = 'cloud-image'): Promise<QemuFixture> {
  const root = await mkdtemp(join(tmpdir(), 'fleet-qemu-lab-'));
  const prefix = join(root, 'qemu-root');
  const bin = join(root, 'bin');
  const log = join(root, 'process-log');
  await mkdir(join(prefix, 'usr/bin'), { recursive: true });
  await mkdir(bin);
  await mkdir(join(root, 'infra/ansible/playbooks'), { recursive: true });
  await mkdir(join(root, 'infra/local'), { recursive: true });
  await mkdir(join(root, 'infra/versions'), { recursive: true });
  await mkdir(join(root, 'tools/tool-fleet/src'), { recursive: true });
  await mkdir(join(root, '.puni/fleet-labs/images'), { recursive: true });
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
  await writeFile(
    join(root, 'tools/tool-fleet/src/lab-hub.ts'),
    await readFile(join(repositoryRoot, 'tools/tool-fleet/src/lab-hub.ts')),
  );
  const lock = JSON.parse(
    await readFile(join(repositoryRoot, 'infra/local/qemu-lab.lock.json'), 'utf8'),
  ) as { image: { sha256: string; file: string; url: string } };
  lock.image.sha256 = createHash('sha256').update('cloud-image').digest('hex');
  await writeFile(join(root, 'infra/local/qemu-lab.lock.json'), JSON.stringify(lock));
  await writeFile(join(root, '.puni/fleet-labs/images', lock.image.file), imageBytes);
  const logger = `import { appendFileSync } from 'node:fs';
appendFileSync(${JSON.stringify(log)}, JSON.stringify([process.argv[1].split('/').pop(), ...process.argv.slice(2)]) + '\\n');`;
  await writeExecutable(
    join(prefix, 'usr/bin/qemu-system-x86_64'),
    `#!/usr/bin/env bun
${logger}
const args = process.argv.slice(2);
if (args[0] === '--version') { process.stdout.write(${JSON.stringify(`${versionLine}\n`)}); process.exit(0); }
if (!process.env.LD_LIBRARY_PATH?.endsWith('usr/lib/x86_64-linux-gnu')) process.exit(43);
const child = Bun.spawn(['sh', '-c', 'while :; do sleep 1; done', 'fake-qemu', ...args], { detached: true, stdio: ['ignore', 'ignore', 'ignore'] });
child.unref();
await Bun.write(args[args.indexOf('-pidfile') + 1], String(child.pid) + '\\n');
`,
  );
  await writeExecutable(
    join(prefix, 'usr/bin/qemu-img'),
    `#!/usr/bin/env bun
${logger}
const args = process.argv.slice(2);
if (args[0] === '--version') process.stdout.write('qemu-img version 8.2.2 (Debian 1:8.2.2+ds-0ubuntu1.18)\\n');
else await Bun.write(args[args.length - 2], 'disk');
`,
  );
  await writeExecutable(
    join(prefix, 'usr/bin/genisoimage'),
    `#!/usr/bin/env bun
${logger}
const args = process.argv.slice(2);
if (args[0] === '--version') process.stdout.write('genisoimage 1.1.11 (Linux)\\n');
else await Bun.write(args[args.indexOf('-output') + 1], 'iso');
`,
  );
  await writeExecutable(
    join(bin, 'ssh-keygen'),
    `#!/usr/bin/env bun
${logger}
const args = process.argv.slice(2);
const path = args[args.indexOf('-f') + 1];
await Bun.write(path, '-----BEGIN OPENSSH ' + 'PRIVATE KEY-----\\nAAAA\\n');
await Bun.write(path + '.pub', 'ssh-ed25519 AAAAHOSTKEY ' + args[args.indexOf('-C') + 1] + '\\n');
`,
  );
  await writeExecutable(
    join(bin, 'ssh'),
    `#!/usr/bin/env bun
${logger}
const args = process.argv.slice(2);
const alias = args.find((argument) => argument.startsWith('HostKeyAlias='))?.slice('HostKeyAlias='.length) ?? '';
const last = alias.split('.').pop();
const command = args.slice(args.indexOf('--') + 1).join(' ');
if (command === 'sudo true' || command === 'sudo cloud-init status --wait') process.exit(0);
else if (command.startsWith('ip -j route get')) process.stdout.write('[{"dev":"ens4"}]\\n');
else if (command === 'cat /etc/machine-id') process.stdout.write(last.repeat(16) + '\\n');
else if (command.includes('/server/node-token')) process.stdout.write('K10' + 'c'.repeat(64) + '::server:' + 'd'.repeat(64) + '\\n');
else if (command.includes('/server/agent-token')) process.stdout.write('K10' + 'c'.repeat(64) + '::node:' + 'e'.repeat(64) + '\\n');
else if (command.includes('/etc/rancher/k3s/k3s.yaml')) process.stdout.write('clusters:\\n- cluster:\\n    certificate-authority-data: Q0E=\\n    server: https://127.0.0.1:6443\\n  name: default\\ncontexts:\\n- context: {cluster: default, user: default}\\n  name: default\\nusers:\\n- name: default\\n  user: {client-key-data: S0VZ}\\n');
else process.exit(41);
`,
  );
  await writeExecutable(
    join(bin, 'docker'),
    `#!/usr/bin/env bun
${logger}
const command = process.argv.slice(2).join(' ');
const args = process.argv.slice(2);
const groups = JSON.parse(require('node:fs').readFileSync(args[args.indexOf('--inventory') + 1], 'utf8')).all.children;
const hosts = Object.keys(command.includes('join.yml') ? groups.k3s_agents.hosts : groups.k3s_bootstrap_servers.hosts);
const changed = command.includes('validate-enrollment.yml') ? 3 : 0;
process.stdout.write('PLAY RECAP\\n' + hosts.map((host) => host + ' : ok=20 changed=' + changed + ' unreachable=0 failed=0').join('\\n') + '\\n');
`,
  );
  const publicKey = join(root, 'id.pub');
  const privateKey = join(root, 'id');
  await writeFile(publicKey, 'ssh-ed25519 AAAATEST fleet-lab\n');
  await writeFile(privateKey, ['-----BEGIN OPENSSH', ' PRIVATE KEY-----\nAAAA\n'].join(''));
  return { root, prefix, bin, log, publicKey, privateKey };
}

function runLab(
  fixture: QemuFixture,
  arguments_: readonly string[],
): { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string } {
  const runner = join(fixture.root, `run-lab-${String(Math.random()).slice(2)}.ts`);
  const source = `import { runVmLab } from ${JSON.stringify(join(repositoryRoot, 'tools/tool-fleet/src/lab.ts'))};
await runVmLab(${JSON.stringify(arguments_)}, ${JSON.stringify(fixture.root)});
`;
  Bun.spawnSync(['sh', '-c', `cat > ${JSON.stringify(runner)}`], { stdin: Buffer.from(source) });
  const invocation = Bun.spawnSync({
    cmd: [process.execPath, runner],
    env: { ...process.env, PATH: `${fixture.bin}:${process.env['PATH'] ?? ''}` },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString(),
    stderr: invocation.stderr.toString(),
  };
}

function upArguments(fixture: QemuFixture, labId = 'review'): readonly string[] {
  return [
    'up',
    '--provider',
    'qemu',
    '--qemu-prefix',
    fixture.prefix,
    '--lab-id',
    labId,
    '--profile',
    'workers',
    '--ssh-public-key',
    fixture.publicKey,
    '--ssh-private-key',
    fixture.privateKey,
  ];
}

describe('the rootless QEMU lab provider', () => {
  it('refuses an absent, malformed, or checksum-free lock', async () => {
    const fixture = await createQemuFixture();
    const path = join(fixture.root, 'infra/local/qemu-lab.lock.json');
    const lock = JSON.parse(await readFile(path, 'utf8')) as { image: Record<string, unknown> };
    delete lock.image['sha256'];
    await writeFile(path, JSON.stringify(lock));
    expect(readQemuLock(fixture.root)).rejects.toThrow(/lock is invalid.*sha256/);
    await writeFile(path, '{');
    expect(readQemuLock(fixture.root)).rejects.toThrow(/malformed JSON/);
    expect(readQemuLock(join(fixture.root, 'absent'))).rejects.toThrow(/lock is required/);
  });

  it('refuses a kubeconfig that does not address the local admin endpoint', () => {
    const source = (server: string): string =>
      `clusters:\n- cluster:\n    certificate-authority-data: Q0E=\n    server: ${server}\n  name: default\ncontexts:\n- context: {cluster: default, user: default}\n  name: default\nusers:\n- name: default\n  user: {client-key-data: S0VZ}\n`;
    expect(renderLabKubeconfig(source('https://127.0.0.1:6443'), 'workers', 45109)).toContain(
      'server: https://127.0.0.1:45109',
    );
    expect(() => renderLabKubeconfig(source('https://10.0.0.9:6443'), 'workers', 45109)).toThrow(
      /single local admin shape/,
    );
  });

  it('decodes qemu requests only with their exact required inputs', () => {
    const request = parseLabRequest([
      'up',
      '--provider',
      'qemu',
      '--qemu-prefix',
      '/opt/qemu',
      '--lab-id',
      'review',
      '--profile',
      'workers',
      '--ssh-public-key',
      '/k.pub',
      '--ssh-private-key',
      '/k',
    ]);
    const operation = planLabOperation(request, []);
    expect(operation.prefix).toBe('puni-vm-review-workers-');
    expect(operation.commands).toEqual([
      { executable: 'qemu', arguments: ['launch', 'puni-vm-review-workers-server-1'] },
      { executable: 'qemu', arguments: ['launch', 'puni-vm-review-workers-agent-1'] },
      { executable: 'qemu', arguments: ['launch', 'puni-vm-review-workers-agent-2'] },
    ]);
    for (const arguments_ of [
      [
        'up',
        '--provider',
        'qemu',
        '--lab-id',
        'r',
        '--profile',
        'workers',
        '--ssh-public-key',
        '/k.pub',
        '--ssh-private-key',
        '/k',
      ],
      [
        'status',
        '--provider',
        'qemu',
        '--qemu-prefix',
        '/opt/qemu',
        '--lab-id',
        'r',
        '--profile',
        'workers',
      ],
      ['status', '--provider', 'libvirt', '--lab-id', 'r', '--profile', 'workers'],
      ['fence', '--provider', 'qemu', '--lab-id', 'r', '--profile', 'workers'],
      [
        'fence',
        '--provider',
        'qemu',
        '--lab-id',
        'r',
        '--profile',
        'workers',
        '--member',
        'prod-db',
      ],
      ['fence', '--lab-id', 'r', '--profile', 'workers', '--member', 'agent-1'],
      [
        'down',
        '--provider',
        'qemu',
        '--lab-id',
        'r',
        '--profile',
        'workers',
        '--member',
        'agent-1',
      ],
    ]) {
      expect(() => parseLabRequest(arguments_)).toThrow(/fleet lab/i);
    }
  });

  it('derives distinct network identities only for lab roles', () => {
    const server = planQemuMachine('/state', 'puni-vm-a-workers-', 'puni-vm-a-workers-server-1');
    const agent = planQemuMachine('/state', 'puni-vm-a-workers-', 'puni-vm-a-workers-agent-2');
    expect(server.privateAddress).toBe('10.55.0.11');
    expect(agent.privateAddress).toBe('10.55.0.13');
    expect(server.sshHost).not.toBe(agent.sshHost);
    expect(server.dgramPort).not.toBe(agent.dgramPort);
    expect(server.hubPort).toBe(agent.hubPort);
    expect(() => planQemuMachine('/state', 'puni-vm-a-workers-', 'puni-vm-a-workers-db-1')).toThrow(
      /no derived lab role/,
    );
    expect(() => planQemuMachine('/state', 'puni-vm-a-workers-', 'production-1')).toThrow(
      /outside lab prefix/,
    );
  });

  it('refuses a cached cloud image whose bytes differ from the lock', async () => {
    const fixture = await createQemuFixture('substituted-image');
    const lock = await readQemuLock(fixture.root);
    expect(requireBaseImage(fixture.root, lock)).rejects.toThrow(/lock requires/);
    const invocation = runLab(fixture, upArguments(fixture));
    expect(invocation.exitCode).not.toBe(0);
    expect(invocation.stderr).toMatch(/lock requires/);
    const log = await readFile(fixture.log, 'utf8');
    expect(log).not.toContain('"-name"');
  });

  it('downloads an absent image and refuses bytes that miss the checksum', async () => {
    const fixture = await createQemuFixture();
    const lock = await readQemuLock(fixture.root);
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) =>
        new Response(new URL(request.url).pathname === '/good' ? 'cloud-image' : 'tampered'),
    });
    try {
      const absentRoot = await mkdtemp(join(tmpdir(), 'fleet-qemu-image-'));
      const good = {
        ...lock,
        image: { ...lock.image, url: `http://127.0.0.1:${String(server.port)}/good` },
      };
      expect(await requireBaseImage(absentRoot, good)).toBe(
        join(absentRoot, '.puni/fleet-labs/images', lock.image.file),
      );
      const tamperedRoot = await mkdtemp(join(tmpdir(), 'fleet-qemu-image-'));
      const tampered = {
        ...lock,
        image: { ...lock.image, url: `http://127.0.0.1:${String(server.port)}/bad` },
      };
      expect(requireBaseImage(tamperedRoot, tampered)).rejects.toThrow(/Downloaded QEMU lab image/);
      await Bun.sleep(50);
      expect(await readdir(join(tamperedRoot, '.puni/fleet-labs/images'))).toEqual([]);
    } finally {
      await server.stop(true);
    }
  });

  it('refuses a QEMU build other than the locked one', async () => {
    const fixture = await createQemuFixture();
    const lock = await readQemuLock(fixture.root);
    const run = (
      executable: string,
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
      Promise.resolve({
        exitCode: 0,
        stdout: executable.endsWith('qemu-system-x86_64')
          ? 'QEMU emulator version 9.0.0\n'
          : `${lock.qemu.imageToolVersionLine}\n`,
        stderr: '',
      });
    expect(requireQemuInstallation(lock, fixture.prefix, run)).rejects.toThrow(
      /qemu-system-x86_64 .* is required: QEMU emulator version 9\.0\.0/,
    );
  });

  it('creates, converges, fences, and deletes only exact owned machines', async () => {
    const fixture = await createQemuFixture();
    const labId = `e2e-${String(process.pid)}`;
    const prefix = `puni-vm-${labId}-workers-`;
    const up = runLab(fixture, upArguments(fixture, labId));
    const downArguments = ['down', '--provider', 'qemu', '--lab-id', labId, '--profile', 'workers'];
    try {
      expect(up.stderr).toBe('');
      expect(up.exitCode).toBe(0);
      const state = join(fixture.root, `.puni/fleet-labs/${labId}-workers`);
      const inventory = JSON.parse(await readFile(join(state, 'inventory.json'), 'utf8')) as {
        all: { children: { k3s_agents: { hosts: Record<string, Record<string, unknown>> } } };
      };
      const agent = inventory.all.children.k3s_agents.hosts[`${prefix}agent-1`];
      expect(agent['ansible_host']).toBe('10.55.0.12');
      expect(agent['ansible_ssh_extra_args']).toMatch(
        /^-o HostName=127\.\d+\.\d+\.12 -o Port=2222 -o HostKeyAlias=10\.55\.0\.12 -o IdentitiesOnly=yes$/,
      );
      expect(await readFile(join(state, 'known_hosts'), 'utf8')).toContain(
        '10.55.0.11 ssh-ed25519 AAAAHOSTKEY',
      );
      expect(await readFile(join(state, 'kubeconfig'), 'utf8')).toMatch(
        /server: https:\/\/127\.0\.0\.1:\d+\n/,
      );
      const agentPlan = planQemuMachine(state, prefix, `${prefix}agent-2`);
      expect(await ownedQemuPid(agentPlan)).toBeNumber();

      const fence = runLab(fixture, [
        'fence',
        '--provider',
        'qemu',
        '--lab-id',
        labId,
        '--profile',
        'workers',
        '--member',
        'agent-2',
      ]);
      expect(fence.stderr).toBe('');
      expect(fence.exitCode).toBe(0);
      expect(await ownedQemuPid(agentPlan)).toBeUndefined();
      expect(
        JSON.parse(await readFile(join(state, `fence-${prefix}agent-2.json`), 'utf8')),
      ).toMatchObject({ machine: `${prefix}agent-2`, state: 'powered-off' });
      const refence = runLab(fixture, [
        'fence',
        '--provider',
        'qemu',
        '--lab-id',
        labId,
        '--profile',
        'workers',
        '--member',
        'agent-2',
      ]);
      expect(refence.exitCode).not.toBe(0);
      expect(refence.stderr).toMatch(/not a running owned machine/);

      const bystander = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      const serverPlan = planQemuMachine(state, prefix, `${prefix}server-1`);
      const serverPid = await ownedQemuPid(serverPlan);
      await writeFile(join(agentPlan.directory, 'qemu.pid'), `${String(bystander.pid)}\n`);
      expect(await ownedQemuPid(agentPlan)).toBeUndefined();
      const down = runLab(fixture, downArguments);
      expect(down.stderr).toBe('');
      expect(down.exitCode).toBe(0);
      expect(bystander.killed).toBe(false);
      expect(await readFile(`/proc/${String(bystander.pid)}/cmdline`, 'utf8')).toContain(
        'setInterval',
      );
      bystander.kill();
      expect(serverPid).toBeNumber();
      expect(Bun.file(`/proc/${String(serverPid)}/cmdline`).size).toBe(0);
      expect(await readdir(join(state, 'qemu'))).toEqual([]);
    } finally {
      runLab(fixture, downArguments);
    }
  }, 60_000);
});

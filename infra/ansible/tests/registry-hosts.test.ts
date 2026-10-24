import { chmod, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { beforeAll, expect, it } from 'bun:test';
import { parse, stringify } from 'yaml';

import { scratchAsync } from '../../../tools/test/scratch';

const repository = join(import.meta.dir, '../../..');
const controller = process.env['REGISTRY_TEST_ANSIBLE'] ?? 'ansible-playbook';

type Options = Record<string, unknown>;
interface Task {
  name?: string;
  loop?: unknown[];
  changed_when?: boolean;
  'ansible.builtin.assert'?: { that: string[] };
  'ansible.builtin.stat'?: Options;
  'ansible.builtin.command'?: Options;
  'ansible.builtin.systemd_service'?: Options;
  [module: string]: unknown;
}

beforeAll(async () => {
  const lock = (await Bun.file(join(repository, 'infra/versions/toolchain.json')).json()) as {
    controller: { ansibleCore: string };
  };
  const version = await run(controller, ['--version']);
  expect(version.code).toBe(0);
  expect(version.output).toContain('[core ' + lock.controller.ansibleCore + ']');
});

async function run(executable: string, arguments_: string[], environment = process.env) {
  const child = Bun.spawn([executable, ...arguments_], {
    env: environment,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr };
}

/** Runs real role tasks; only remaps host paths/ownership and substitutes the unavailable system manager. */
async function fixture(
  role: 'registry_endpoint' | 'registry_client',
  overrides: Record<string, unknown> = {},
  removed?: string,
  fault?: string,
) {
  const root = await scratchAsync('registry-host-');
  await cp(join(repository, 'infra/ansible/roles', role), join(root, 'roles', role), {
    recursive: true,
  });
  const targets = ['/etc/systemd/system', '/etc/rancher/k3s'];
  for (const target of targets) await mkdir(root + target, { recursive: true });
  await writeFile(root + '/etc/hosts', '127.0.0.1 localhost\n');
  const certificate = join(root, 'ca.pem');
  const generated = await run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(root, 'ca.key'),
    '-out',
    certificate,
    '-days',
    '1',
    '-subj',
    '/CN=Registry fixture',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
  ]);
  expect(generated.code).toBe(0);
  const variables = {
    puni_registry_address: '10.1.0.4',
    puni_registry_port: 5000,
    puni_registry_upstream: '10.43.239.53',
    puni_registry_hostname: 'registry.puni.internal',
    puni_registry_mode: 'trust',
    puni_registry_owner: 'root',
    puni_registry_ca: await readFile(certificate, 'utf8'),
    puni_registry_username: 'fixture-user',
    puni_registry_password: 'fixture-secret',
    puni_registry_service: 'k3s',
    ...overrides,
  };
  const serviceLog = join(root, 'services');
  const unitPaths = (await run('systemd-analyze', ['unit-paths'])).output
    .trim()
    .split('\n')
    .map((path) => root + path)
    .join(':');
  async function rewrite(path: string) {
    const tasks = parse(await readFile(path, 'utf8')) as Task[];
    const rewritten: Task[] = [];
    for (const task of tasks) {
      if (task.name === removed) continue;
      if (task.name === 'Read systemd unit search paths')
        task['environment'] = { SYSTEMD_UNIT_PATH: unitPaths };
      if (task.name === 'Refuse competing registry units or overrides') {
        const command = task['ansible.builtin.command'];
        if (command && Array.isArray(command['argv']))
          command['argv'] = command['argv'].map((argument: unknown) =>
            argument === '/etc/systemd/system' ? root + argument : argument,
          );
      }
      if (fault === 'proxy' && task.name === 'Inspect proxy executable')
        task['ansible.builtin.stat']!['path'] = join(root, 'missing-proxy');
      if (task.loop instanceof Array)
        task.loop = task.loop.map((entry: unknown) =>
          typeof entry === 'string' && entry.startsWith('/') && entry.includes('/puni-registry.')
            ? root + entry
            : entry,
        );
      if (task['ansible.builtin.assert']?.that instanceof Array)
        task['ansible.builtin.assert'].that = task['ansible.builtin.assert'].that.map(
          (condition: string) =>
            condition.replace(/\.uid == 0$/, '.uid == ' + String(process.getuid?.())),
        );
      if (task.name === 'Wait for registry agent readiness')
        task['ansible.builtin.command'] = { argv: ['/bin/echo', 'active'] };
      if (task.name === 'Wait for registry server readiness')
        task['ansible.builtin.command'] = { argv: ['/bin/echo', 'ok'] };
      if (task['ansible.builtin.systemd_service']) {
        task['ansible.builtin.command'] = {
          argv: [
            '/bin/sh',
            '-c',
            task.name === 'Enable private registry socket' ? ':' : 'printf "%s\\n" "$1" >> "$2"',
            'service-fixture',
            JSON.stringify(task['ansible.builtin.systemd_service']),
            serviceLog,
          ],
        };
        if (task.name === 'Enable private registry socket') task.changed_when = false;
        delete task['ansible.builtin.systemd_service'];
      }
      for (const module of [
        'ansible.builtin.file',
        'ansible.builtin.copy',
        'ansible.builtin.template',
        'ansible.builtin.stat',
        'ansible.builtin.slurp',
        'ansible.builtin.blockinfile',
      ]) {
        const options = task[module] as Options | undefined;
        if (!options) continue;
        for (const key of ['path', 'dest', 'src'])
          if (typeof options[key] === 'string' && options[key].startsWith('/etc/'))
            options[key] = root + options[key];
        if (options['owner']) options['owner'] = String(process.getuid?.());
        if (options['group']) options['group'] = String(process.getgid?.());
      }
      rewritten.push(task);
    }
    await writeFile(path, stringify(rewritten));
  }
  for (const file of ['tasks/main.yml', 'tasks/preflight.yml', 'handlers/main.yml']) {
    if (await Bun.file(join(root, 'roles', role, file)).exists())
      await rewrite(join(root, 'roles', role, file));
  }
  const playbook = join(root, 'play.yml');
  await writeFile(
    playbook,
    stringify([{ hosts: 'localhost', gather_facts: false, vars: variables, roles: [role] }]),
  );
  const environment = {
    ...process.env,
    ANSIBLE_LOCAL_TEMP: join(root, 'local'),
    ANSIBLE_REMOTE_TEMP: join(root, 'remote'),
    ANSIBLE_NOCOLOR: '1',
    ANSIBLE_PYTHON_INTERPRETER: '/usr/bin/python3',
  };
  if (fault === 'override') await mkdir(root + '/etc/systemd/system/puni-registry.socket.d');
  const overridePath =
    fault === 'vendor-override'
      ? '/usr/lib/systemd/system/puni-registry.socket.d'
      : fault === 'prefix-override'
        ? '/etc/systemd/system/puni-.socket.d'
        : undefined;
  if (overridePath) {
    await mkdir(root + overridePath, { recursive: true });
    await writeFile(root + overridePath + '/public.conf', '[Socket]\nListenStream=0.0.0.0:5000\n');
  }
  return {
    root,
    serviceLog,
    apply: () => run(controller, ['-i', 'localhost,', '-c', 'local', playbook], environment),
  };
}

it('renders a private TCP socket, validates units, and converges without another restart', async () => {
  const host = await fixture('registry_endpoint');
  const first = await host.apply();
  expect(first.output).toContain('failed=0');
  expect(first.code).toBe(0);
  const socket = await readFile(host.root + '/etc/systemd/system/puni-registry.socket', 'utf8');
  const service = await readFile(host.root + '/etc/systemd/system/puni-registry.service', 'utf8');
  expect(socket).toContain('ListenStream=10.1.0.4:5000');
  expect(service).toContain('10.43.239.53:5000');
  expect(service).toContain('NoNewPrivileges=yes');
  const verified = await run('systemd-analyze', [
    'verify',
    host.root + '/etc/systemd/system/puni-registry.socket',
    host.root + '/etc/systemd/system/puni-registry.service',
  ]);
  expect(verified.output).toBe('');
  expect(verified.code).toBe(0);
  const before = await readFile(host.serviceLog, 'utf8');
  const second = await host.apply();
  expect(second.code).toBe(0);
  expect(second.output).toMatch(/changed=0/);
  expect(await readFile(host.serviceLog, 'utf8')).toBe(before);
}, 120000);

it('installs trust alone without a service restart and protects k3s exact-key credentials', async () => {
  const trust = await fixture('registry_client');
  expect((await trust.apply()).code).toBe(0);
  expect(await readFile(trust.root + '/etc/hosts', 'utf8')).toContain(
    '10.1.0.4 registry.puni.internal',
  );
  expect((await stat(trust.root + '/etc/puni/registry/ca.crt')).mode & 0o777).toBe(0o600);
  expect(await Bun.file(trust.serviceLog).exists()).toBe(false);
  expect(await Bun.file(trust.root + '/etc/rancher/k3s/registries.yaml').exists()).toBe(false);
  const host = await fixture('registry_client', {
    puni_registry_mode: 'k3s',
    puni_registry_service: 'k3s-agent',
  });
  const first = await host.apply();
  expect(first.code).toBe(0);
  expect(first.output).not.toContain('fixture-secret');
  const configPath = host.root + '/etc/rancher/k3s/registries.yaml';
  const config = parse(await readFile(configPath, 'utf8')) as { configs: unknown };
  expect(config.configs).toEqual({
    'registry.puni.internal:5000': {
      auth: { username: 'fixture-user', password: 'fixture-secret' },
      tls: { ca_file: '/etc/puni/registry/ca.crt' },
    },
  });
  expect((await stat(configPath)).mode & 0o777).toBe(0o600);
  const before = await readFile(host.serviceLog, 'utf8');
  expect((await host.apply()).output).toMatch(/changed=0/);
  expect(await readFile(host.serviceLog, 'utf8')).toBe(before);
}, 120000);

it('refuses invalid inputs and conflicting state before persistent writes', async () => {
  const cases: [Parameters<typeof fixture>[0], Record<string, unknown>, string?, string?][] = [
    ['registry_endpoint', { puni_registry_address: '8.8.8.8' }],
    ['registry_endpoint', { puni_registry_address: '10.1.0.999' }],
    ['registry_endpoint', { puni_registry_port: '5000x' }],
    ['registry_endpoint', {}, 'unit'],
    ['registry_endpoint', {}, 'unreadable-unit'],
    ['registry_endpoint', {}, undefined, 'proxy'],
    ['registry_endpoint', {}, undefined, 'override'],
    ['registry_client', { puni_registry_ca: 'not a certificate' }],
    ['registry_client', { puni_registry_hostname: 'bad\nname' }],
    ['registry_client', { puni_registry_owner: 'missing-registry-owner' }],
    ['registry_client', { puni_registry_mode: 'k3s', puni_registry_password: '' }],
    ['registry_client', { puni_registry_mode: 'k3s', puni_registry_service: 'docker' }],
    ['registry_client', { puni_registry_mode: 'k3s' }, 'config'],
    ['registry_client', { puni_registry_mode: 'k3s' }, 'unreadable-config'],
  ];
  for (const [role, variables, conflict, fault] of cases) {
    const host = await fixture(role, variables, undefined, fault);
    const conflictPath = conflict?.includes('unit')
      ? '/etc/systemd/system/puni-registry.socket'
      : '/etc/rancher/k3s/registries.yaml';
    if (conflict) await writeFile(host.root + conflictPath, 'operator owned\n');
    if (conflict?.startsWith('unreadable')) await chmod(host.root + conflictPath, 0);
    const applied = await host.apply();
    if (conflict?.startsWith('unreadable')) await chmod(host.root + conflictPath, 0o644);
    expect(applied.code).not.toBe(0);
    expect(await readFile(host.root + '/etc/hosts', 'utf8')).toBe('127.0.0.1 localhost\n');
    expect(await Bun.file(host.root + '/etc/puni/registry/ca.crt').exists()).toBe(false);
    expect(await Bun.file(host.serviceLog).exists()).toBe(false);
    if (conflict) expect(await readFile(host.root + conflictPath, 'utf8')).toBe('operator owned\n');
  }
}, 180000);

it('R5 proves address, CA and ownership negatives break when their production guards are removed', async () => {
  for (const [role, variables, guard, conflict, fault] of [
    [
      'registry_endpoint',
      { puni_registry_address: '8.8.8.8' },
      'Validate private endpoint inputs',
      false,
      undefined,
    ],
    [
      'registry_client',
      { puni_registry_ca: 'not a certificate' },
      'Validate supplied CA',
      false,
      undefined,
    ],
    [
      'registry_client',
      { puni_registry_mode: 'k3s' },
      'Refuse unmanaged registry configuration',
      true,
      undefined,
    ],
    ['registry_endpoint', {}, 'Refuse unmanaged registry units', true, undefined],
    ['registry_endpoint', {}, 'Require installed proxy executable', false, 'proxy'],
    ['registry_endpoint', {}, 'Refuse competing registry units or overrides', false, 'override'],
    [
      'registry_client',
      { puni_registry_hostname: 'bad\nname' },
      'Validate registry client inputs',
      false,
      undefined,
    ],
    [
      'registry_client',
      { puni_registry_mode: 'k3s', puni_registry_password: '' },
      'Require k3s credentials',
      false,
      undefined,
    ],
  ] as const) {
    const host = await fixture(role, variables, guard, fault);
    const path =
      role === 'registry_endpoint'
        ? '/etc/systemd/system/puni-registry.socket'
        : '/etc/rancher/k3s/registries.yaml';
    if (conflict) await writeFile(host.root + path, 'operator owned\n');
    const applied = await host.apply();
    expect(applied.code).toBe(0);
    if (conflict) expect(await readFile(host.root + path, 'utf8')).not.toBe('operator owned\n');
    else
      expect(
        await Bun.file(
          host.root + (role === 'registry_endpoint' ? path : '/etc/puni/registry/ca.crt'),
        ).exists(),
      ).toBe(true);
  }
}, 120000);

it('rejects effective vendor and prefix socket drop-ins before unit writes', async () => {
  for (const fault of ['vendor-override', 'prefix-override']) {
    const host = await fixture('registry_endpoint', {}, undefined, fault);
    expect((await host.apply()).code).not.toBe(0);
    expect(await Bun.file(host.root + '/etc/systemd/system/puni-registry.socket').exists()).toBe(
      false,
    );
    const unguarded = await fixture(
      'registry_endpoint',
      {},
      'Refuse competing registry units or overrides',
      fault,
    );
    expect((await unguarded.apply()).code).toBe(0);
    expect(
      await Bun.file(unguarded.root + '/etc/systemd/system/puni-registry.socket').exists(),
    ).toBe(true);
  }
}, 60000);

it('bounds the production server readiness request against a stalled API response', async () => {
  const tasks = parse(
    await readFile(
      join(repository, 'infra/ansible/roles/registry_client/handlers/main.yml'),
      'utf8',
    ),
  ) as Task[];
  const probe = tasks.find((task) => task.name === 'Wait for registry server readiness');
  const arguments_ = (probe?.['ansible.builtin.command']?.['argv'] as string[]).slice();
  const requestedKubectl = process.env['REGISTRY_TEST_KUBECTL'] ?? 'kubectl';
  const resolvedKubectl = Bun.which(requestedKubectl);
  if (!resolvedKubectl) throw new Error('Pinned kubectl is required for registry readiness tests');
  const kubectl = resolvedKubectl;
  const lock = (await Bun.file(join(repository, 'infra/versions/toolchain.json')).json()) as {
    binaries: { kubectl: { sha256: string } };
  };
  const checksum = new Bun.CryptoHasher('sha256')
    .update(await Bun.file(kubectl).arrayBuffer())
    .digest('hex');
  expect(checksum).toBe(lock.binaries.kubectl.sha256);
  const root = await scratchAsync('registry-readiness-');
  const server = createServer((_request, response) => {
    response.writeHead(200);
    response.flushHeaders();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Fixture listener has no address');
    const kubeconfig = join(root, 'kubeconfig');
    await writeFile(
      kubeconfig,
      stringify({
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [
          { name: 'fixture', cluster: { server: 'http://127.0.0.1:' + String(address.port) } },
        ],
        contexts: [{ name: 'fixture', context: { cluster: 'fixture', user: 'fixture' } }],
        'current-context': 'fixture',
        users: [{ name: 'fixture', user: {} }],
      }),
    );
    const k3s = join(root, 'k3s');
    await writeFile(k3s, '#!/bin/sh\nshift\nexec "$REGISTRY_TEST_KUBECTL" "$@"\n');
    await chmod(k3s, 0o700);
    const position = arguments_.indexOf('k3s');
    arguments_[position] = k3s;
    async function executeProbe(command: string[]) {
      const started = performance.now();
      const child = Bun.spawn(command, {
        env: { ...process.env, REGISTRY_TEST_KUBECTL: kubectl, KUBECONFIG: kubeconfig },
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
      });
      let expired = false;
      const deadline = setTimeout(() => {
        expired = true;
        process.kill(-child.pid, 'SIGKILL');
      }, 18000);
      const [code, output] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      clearTimeout(deadline);
      return { code, output, expired, elapsed: performance.now() - started };
    }
    const stalledRequest = await executeProbe(arguments_);
    expect(stalledRequest.code).not.toBe(0);
    expect(stalledRequest.output).toMatch(/timeout|deadline exceeded/i);
    expect(stalledRequest.expired).toBe(false);
    expect(stalledRequest.elapsed).toBeLessThan(10000);
    const unlimitedRequest = await executeProbe(
      arguments_.filter((argument) => argument !== '--request-timeout=5s'),
    );
    expect(() => {
      expect(unlimitedRequest.elapsed).toBeLessThan(10000);
    }).toThrow();
    expect(unlimitedRequest.expired).toBe(false);
    await writeFile(k3s, '#!/bin/sh\nexec sleep 60\n');
    const stalledProcess = await executeProbe(arguments_);
    expect(stalledProcess.code).not.toBe(0);
    expect(stalledProcess.expired).toBe(false);
    expect(stalledProcess.elapsed).toBeLessThan(17000);
    const unlimitedProcess = await executeProbe(arguments_.slice(arguments_.indexOf(k3s)));
    expect(() => {
      expect(unlimitedProcess.expired).toBe(false);
    }).toThrow();
  } finally {
    server.closeAllConnections();
    server.close();
  }
}, 90000);

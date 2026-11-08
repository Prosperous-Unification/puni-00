import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import fixture from '../../fixtures/runtime.json';
import { preflightRuntime, renderObserverUnits, validateRuntimeSnapshot } from './runtime';

it('Task75 CLI selects an immutable observer revision', () => {
  const cli = new URL('./runtime-cli.ts', import.meta.url).pathname;
  const selected = Bun.spawnSync([
    process.execPath,
    cli,
    'units',
    '0123456789abcdef0123456789abcdef01234567',
  ]);
  expect(selected.exitCode).toBe(0);
  const units = JSON.parse(selected.stdout.toString()) as Record<string, string>;
  expect(units['puni-dev-observability.service']).toContain('/012345678/observer ');
  expect(units['puni-dev-observability.service']).toContain(
    '--version 0123456789abcdef0123456789abcdef01234567 --checkpoint ',
  );
});

it('Task75 omission preserves the original exact unit bytes', () => {
  const units = renderObserverUnits();
  expect(createHash('sha256').update(units['puni-dev-observability.service']).digest('hex')).toBe(
    '567f1478386132995920772ab592c266919c680654cd1369606539f59658bf88',
  );
  expect(
    createHash('sha256').update(units['puni-dev-observability-tunnel.service']).digest('hex'),
  ).toBe('00ac97feccce756f6057bb26fb12240b7f2c4b412cfc8b33cac1a39a2b0e8fe4');
});

it('Task75 renderer changes only the selected executable and version', () => {
  const original = renderObserverUnits();
  const selected = renderObserverUnits('0123456789abcdef0123456789abcdef01234567');
  expect(selected).toEqual({
    ...original,
    'puni-dev-observability.service': original['puni-dev-observability.service']
      .replace('/ab4f7cf6e/observer ', '/012345678/observer ')
      .replace(
        '--version ab4f7cf6e3023f2f2851bbf85dfb920c7de0859d ',
        '--version 0123456789abcdef0123456789abcdef01234567 ',
      ),
  });
});

for (const [name, revision] of [
  ['empty', ''],
  ['abbreviated', '012345678'],
  ['short', '0123456789abcdef0123456789abcdef0123456'],
  ['long', '0123456789abcdef0123456789abcdef012345678'],
  ['uppercase', '0123456789ABCDEF0123456789ABCDEF01234567'],
  ['nonhex', 'g123456789abcdef0123456789abcdef01234567'],
  ['path', '../0123456789abcdef0123456789abcdef01234567'],
  ['leading space', ' 0123456789abcdef0123456789abcdef01234567'],
  ['trailing space', '0123456789abcdef0123456789abcdef01234567 '],
  ['tab', '0123456789abcdef0123456789abcdef01234567\t'],
  ['trailing newline', '0123456789abcdef0123456789abcdef01234567\n'],
  ['carriage return', '0123456789abcdef0123456789abcdef01234567\r'],
  ['embedded newline', '0123456789abcdef\n123456789abcdef01234567'],
  ['control', '0123456789abcdef0123456789abcdef01234567\u0001'],
] as const) {
  it(`Task75 rejects ${name} revision at renderer and CLI boundaries`, () => {
    expect(() => renderObserverUnits(revision)).toThrow(/source revision/);
    const cli = new URL('./runtime-cli.ts', import.meta.url).pathname;
    const execution = Bun.spawnSync([process.execPath, cli, 'units', revision]);
    expect(execution.exitCode).not.toBe(0);
    expect(execution.stdout.toString()).toBe('');
    expect(execution.stderr.toString()).toContain('source revision');
  });
}

it('Task75 CLI rejects extra arguments after a selected revision', () => {
  const cli = new URL('./runtime-cli.ts', import.meta.url).pathname;
  const execution = Bun.spawnSync([
    process.execPath,
    cli,
    'units',
    '0123456789abcdef0123456789abcdef01234567',
    'extra',
  ]);
  expect(execution.exitCode).not.toBe(0);
  expect(execution.stdout.toString()).toBe('');
  expect(execution.stderr.toString()).toContain('Unexpected runtime arguments');
});

it('renders a bounded persistent SSH observer without recreating trusted checkpoints', () => {
  const units = renderObserverUnits();
  const observer = units['puni-dev-observability.service'];
  expect(observer).toContain('/ab4f7cf6e/observer --otlp http://127.0.0.1:14318');
  expect(observer).toContain(
    '--checkpoint /home/claw/.local/state/puni-dev-observability/probe.json',
  );
  expect(observer).not.toMatch(/--initialize|--local|--once/);
  for (const unit of Object.values(units)) {
    expect(unit).toMatch(/MemoryMax=\d+M/);
    expect(unit).toMatch(/CPUQuota=\d+%/);
    expect(unit).toMatch(/TasksMax=\d+/);
    expect(unit).toContain('StartLimitBurst=3');
    expect(unit).toContain('RestartSec=10s');
    expect(unit).toContain('TimeoutStopSec=25s');
    expect(unit).toContain('KillMode=control-group');
  }
  expect(observer).toContain('Wants=puni-dev-observability-tunnel.service');
  expect(observer).not.toContain('Requires=');
  const tunnel = units['puni-dev-observability-tunnel.service'];
  for (const port of [14318, 19200, 19090])
    expect(tunnel).toContain(`-L 127.0.0.1:${String(port)}:127.0.0.1:${String(port)}`);
  expect(tunnel).toContain('ExitOnForwardFailure=yes');
  expect(tunnel).toContain('StrictHostKeyChecking=yes');
  expect(tunnel).toContain('ConnectTimeout=5');
  expect(Object.keys(units)).not.toContain('h3mon-tunnel.service');
});

const observedNow = Math.max(fixture.h1.observedAt, fixture.h3.observedAt) + 1;
it('adopts the existing owned release and excludes only verified occupied dev ports', () => {
  const verified = validateRuntimeSnapshot(fixture.h3, fixture.h1, observedNow);
  expect(verified.capacity.occupiedPorts).not.toContain(19090);
  expect(verified.queryNetwork.occupiedAliases).not.toContain('puni-dev-prometheus');
  expect(verified.preservedContainers).toHaveLength(7);
  expect(verified.volumes).toHaveLength(6);
});
for (const [name, change] of [
  [
    'bad network driver',
    (h3: typeof fixture.h3) => {
      h3.network.Driver = 'host';
    },
  ],
  [
    'internal network',
    (h3: typeof fixture.h3) => {
      h3.network.Internal = true;
    },
  ],
  [
    'unbounded container',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.service === 'prometheus')!.memory = 0;
    },
  ],
  [
    'foreign network membership',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.service === 'collector')!.networks.push('foreign');
    },
  ],
  [
    'wrong host',
    (h3: typeof fixture.h3) => {
      h3.hostname = 'production';
    },
  ],
  [
    'stale snapshot',
    (h3: typeof fixture.h3) => {
      h3.observedAt -= 60001;
    },
  ],
  [
    'future snapshot',
    (h3: typeof fixture.h3) => {
      h3.observedAt = observedNow + 1;
    },
  ],
  [
    'altered config',
    (h3: typeof fixture.h3) => {
      h3.checks[0].actual = '0'.repeat(64);
    },
  ],
  [
    'empty hash inventory',
    (h3: typeof fixture.h3) => {
      h3.checks = [];
    },
  ],
  [
    'foreign volume',
    (h3: typeof fixture.h3) => {
      h3.volumes[0].project = 'other';
    },
  ],
  [
    'missing volume',
    (h3: typeof fixture.h3) => {
      h3.volumes.pop();
    },
  ],
  [
    'restarted old service',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.project === 'h3mon-observability')!.restartCount++;
    },
  ],
  [
    'public publish',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.service === 'prometheus')!.ports[0].ip = '0.0.0.0';
    },
  ],
  [
    'missing publish',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.service === 'prometheus')!.ports = [];
    },
  ],
  [
    'foreign alias',
    (h3: typeof fixture.h3) => {
      h3.containers
        .find((c) => c.project === 'h3mon-observability')!
        .aliases.push('puni-dev-prometheus');
    },
  ],
  [
    'foreign listener',
    (h3: typeof fixture.h3) => {
      h3.containers
        .find((c) => c.project === 'h3mon-observability')!
        .ports.push({ target: 1, ip: '127.0.0.1', port: 19090 });
    },
  ],
  [
    'altered image',
    (h3: typeof fixture.h3) => {
      h3.containers.find((c) => c.service === 'prometheus')!.image = 'foreign:latest';
    },
  ],
  [
    'missing baseline',
    (h3: typeof fixture.h3) => {
      h3.baseline.containers = [];
    },
  ],
] as const) {
  it(`refuses ${name} before update`, () => {
    const h3 = structuredClone(fixture.h3);
    change(h3);
    expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow();
  });
}
for (const [name, change] of [
  [
    'wrong observer identity',
    (h1: typeof fixture.h1) => {
      h1.user = 'root';
    },
  ],
  [
    'altered observer',
    (h1: typeof fixture.h1) => {
      h1.binaryHash = '0'.repeat(64);
    },
  ],
  [
    'altered existing tunnel',
    (h1: typeof fixture.h1) => {
      h1.existingTunnelHash = '0'.repeat(64);
    },
  ],
  [
    'restarted existing tunnel',
    (h1: typeof fixture.h1) => {
      h1.existingTunnel = 'MainPID=1\nActiveState=active';
    },
  ],
  [
    'local source checkpoint',
    (h1: typeof fixture.h1) => {
      h1.probe.source.kind = 'local-http-rehearsal';
    },
  ],
  [
    'insufficient observer disk',
    (h1: typeof fixture.h1) => {
      h1.storage =
        'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 2000000 1999999 1 99% /';
    },
  ],
  [
    'no linger',
    (h1: typeof fixture.h1) => {
      h1.linger = 'no';
    },
  ],
  [
    'foreign tunnel port',
    (h1: typeof fixture.h1) => {
      h1.listeners += '\nLISTEN 0 128 127.0.0.1:14318 0.0.0.0:* users:(("ssh",pid=123,fd=5))';
    },
  ],
] as const) {
  it(`refuses ${name} before unit adoption`, () => {
    const h1 = structuredClone(fixture.h1);
    change(h1);
    expect(() => validateRuntimeSnapshot(fixture.h3, h1, observedNow)).toThrow();
  });
}

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function commandFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'puni-runtime-'));
  directories.push(directory);
  const snapshot = structuredClone(fixture);
  snapshot.h1.observedAt = Date.now();
  snapshot.h3.observedAt = Date.now();
  for (const name of Object.keys(snapshot.h3.manifests[1].files)) {
    const contents =
      name === 'rollback.json'
        ? JSON.stringify({
            environment: 'dev',
            host: 'h3mon',
            project: 'puni-dev-observability',
            preserveVolumes: true,
          })
        : 'fixture input';
    writeFileSync(join(directory, name), contents);
    const hash = createHash('sha256').update(contents).digest('hex');
    snapshot.h3.manifests[1].files[name as keyof (typeof snapshot.h3.manifests)[1]['files']] = hash;
    const check = snapshot.h3.checks.find(
      (check) => check.path === `/home/monitor/puni-dev-observability/releases/c811f34bf/${name}`,
    )!;
    check.expected = hash;
    check.actual = hash;
  }
  const source = [
    {
      Id: 'a'.repeat(64),
      Name: '/wbs-dev-src',
      State: { Running: true },
      Mounts: [{ Type: 'bind', Source: '/home/puni1/wbs-dev/src', Destination: '/src' }],
      NetworkSettings: { Networks: { 'wbs-dev-net': {} } },
      Config: { WorkingDir: '/src', Cmd: ['bun', 'run', 'dev'] },
    },
  ];
  const settings = join(directory, 'settings.json'),
    commands = join(directory, 'commands.jsonl');
  writeFileSync(settings, JSON.stringify({ snapshot, source, failed: '' }));
  const ssh = join(directory, 'ssh');
  writeFileSync(
    ssh,
    `#!${process.execPath}
const settings=JSON.parse(await Bun.file(${JSON.stringify(settings)}).text());
require('node:fs').appendFileSync(${JSON.stringify(commands)},JSON.stringify(process.argv.slice(2))+'\\n');

const selected=process.argv.includes('inspect')?'source':process.argv.includes('h3mon')?'h3':'h1';console.log(JSON.stringify(selected==='source'?settings.source:settings.snapshot[selected]));if(settings.failed===selected)process.exit(7);
`,
  );
  chmodSync(ssh, 0o700);
  return { directory, ssh, settings, commands };
}
it('runs bounded read-only SSH preflight and validates the local candidate before returning', async () => {
  const boundary = commandFixture();
  const verified = await preflightRuntime(boundary.directory, boundary.ssh);
  expect(verified.phase).toBe('runtime-preflight-validated');
  expect(verified.containerId).toBe('a'.repeat(64));
  const commands = readFileSync(boundary.commands, 'utf8');
  expect(commands).toContain('StrictHostKeyChecking=yes');
  expect(commands).toContain('wbs-dev-src');
  expect(commands).not.toMatch(/compose|restart|chown/);
});
for (const fault of [
  'snapshot SSH failure',
  'source SSH failure',
  'missing local file',
  'altered local file',
  'unreadable local file',
  'malformed source',
] as const) {
  it(`refuses ${fault} through the actual command boundary`, async () => {
    const boundary = commandFixture();
    if (fault === 'missing local file') rmSync(join(boundary.directory, 'collector.yaml'));
    if (fault === 'altered local file')
      writeFileSync(join(boundary.directory, 'collector.yaml'), 'changed');
    if (fault === 'unreadable local file') chmodSync(join(boundary.directory, 'collector.yaml'), 0);
    if (
      fault === 'snapshot SSH failure' ||
      fault === 'source SSH failure' ||
      fault === 'malformed source'
    ) {
      const settings = JSON.parse(readFileSync(boundary.settings, 'utf8')) as {
        failed: string;
        source: { Name: string }[];
      };
      if (fault === 'snapshot SSH failure') settings.failed = 'h3';
      else if (fault === 'source SSH failure') settings.failed = 'source';
      else settings.source[0].Name = '/production';
      writeFileSync(boundary.settings, JSON.stringify(settings));
    }
    const failure = await preflightRuntime(boundary.directory, boundary.ssh).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
  });
}

it('refuses duplicate hash records instead of treating their count as coverage', () => {
  const h3 = structuredClone(fixture.h3);
  h3.checks[0] = h3.checks[1];
  expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow(/inventory/);
});
it('rejects malformed remote snapshot schema before reading missing fields', () => {
  expect(() => validateRuntimeSnapshot({}, fixture.h1, observedNow)).toThrow(
    /hostname must be a string/,
  );
});
for (const fault of ['absent', 'unreadable', 'malformed', 'oversized'] as const) {
  it(`remote trusted file loader refuses ${fault} via real Python filesystem reads`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'puni-runtime-read-'));
    directories.push(directory);
    const path = join(directory, 'trusted.json');
    if (fault !== 'absent')
      writeFileSync(
        path,
        fault === 'malformed'
          ? 'broken'
          : fault === 'oversized'
            ? JSON.stringify('a'.repeat(1048577))
            : '{}',
      );
    if (fault === 'unreadable') chmodSync(path, 0);
    const script = readFileSync(new URL('./runtime-snapshot.py', import.meta.url), 'utf8').split(
      "if sys.argv[1:] == ['h3']:",
    )[0];
    const child = Bun.spawnSync([
      'python3',
      '-c',
      script + '\nload(pathlib.Path(sys.argv[1]))',
      path,
    ]);
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toMatch(
      fault === 'absent'
        ? /FileNotFoundError/
        : fault === 'unreadable'
          ? /PermissionError/
          : fault === 'oversized'
            ? /oversized/
            : /JSONDecodeError/,
    );
  });
}

for (const [name, h1] of [
  ['insufficient observer memory', { ...fixture.h1, memory: 0 }],
  [
    'future checkpoint',
    { ...fixture.h1, probe: { ...fixture.h1.probe, observedAt: observedNow + 1 } },
  ],
  [
    'colliding unit',
    { ...fixture.h1, units: { ...fixture.h1.units, 'puni-dev-observability.service': 'foreign' } },
  ],
  ['missing unit inventory', { ...fixture.h1, units: {} }],
] as const) {
  it(`refuses ${name}`, () => {
    expect(() => validateRuntimeSnapshot(fixture.h3, h1, observedNow)).toThrow();
  });
}

it('refuses a missing owned dev service even when remaining resources are valid', () => {
  const h3 = structuredClone(fixture.h3);
  h3.containers = h3.containers.filter((container) => container.service !== 'gateway');
  expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow(/six owned/);
});

for (const name of ['../foreign.json', '/etc/passwd']) {
  it(`refuses manifest path ${name} through the production Python boundary`, () => {
    const script = readFileSync(new URL('./runtime-snapshot.py', import.meta.url), 'utf8').split(
      "if sys.argv[1:] == ['h3']:",
    )[0];
    const child = Bun.spawnSync([
      'python3',
      '-c',
      script + '\nresolve_release_file(pathlib.Path("/owned"),sys.argv[1])',
      name,
    ]);
    expect(child.exitCode).not.toBe(0);
    expect(child.stderr.toString()).toContain('manifest path must be a basename');
  });
}
it('CLI rejects unknown operations and renders only the two named units', () => {
  const cli = new URL('./runtime-cli.ts', import.meta.url).pathname;
  const invalid = Bun.spawnSync([process.execPath, cli, 'apply']);
  expect(invalid.exitCode).not.toBe(0);
  expect(invalid.stderr.toString()).toContain('Required: runtime-cli.ts');
  const extra = Bun.spawnSync([process.execPath, cli, 'preflight', 'unused', 'extra']);
  expect(extra.exitCode).not.toBe(0);
  expect(extra.stderr.toString()).toContain('Unexpected runtime arguments');
  const units = Bun.spawnSync([process.execPath, cli, 'units']);
  expect(units.exitCode).toBe(0);
  expect(Object.keys(JSON.parse(units.stdout.toString()) as Record<string, string>).sort()).toEqual(
    ['puni-dev-observability-tunnel.service', 'puni-dev-observability.service'],
  );
});

it('refuses changed Docker loopback semantics until reviewed', () => {
  const h3 = structuredClone(fixture.h3);
  h3.dockerVersion = '27.0.0';
  expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow();
});
it('refuses a production manifest at the remote schema boundary', () => {
  const h3 = structuredClone(fixture.h3);
  h3.manifests[1].environment = 'production';
  expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow();
});
it('preflight expiry belongs to the oldest authenticated snapshot', () => {
  const verified = validateRuntimeSnapshot(fixture.h3, fixture.h1, observedNow);
  expect(verified.expiresAt).toBe(Math.min(fixture.h3.observedAt, fixture.h1.observedAt) + 60000);
});

for (const address of ['10.1.0.2:19090', '0.0.0.0:19090', '[::]:19090']) {
  it(`refuses foreign host listener ${address} alongside the owned loopback mapping`, () => {
    const h3 = structuredClone(fixture.h3);
    h3.listeners += `\nLISTEN 0 128 ${address} 0.0.0.0:*`;
    expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow(
      /foreign dev host listener/,
    );
  });
}
it('requires the Grafana query alias on the owned Prometheus member', () => {
  const h3 = structuredClone(fixture.h3);
  const prometheus = h3.containers.find(
    (container) =>
      container.project === 'puni-dev-observability' && container.service === 'prometheus',
  )!;
  prometheus.aliases = prometheus.aliases.filter((alias) => alias !== 'puni-dev-prometheus');
  expect(() => validateRuntimeSnapshot(h3, fixture.h1, observedNow)).toThrow(
    /query network ownership/,
  );
});

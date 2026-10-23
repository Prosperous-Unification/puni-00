import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { migrationNativePreflight } from './dependency-migration-artifact';
import { migrationScannerProgram } from './dependency-migration-artifact-scanner';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function invoke(fault: string, guarded = true, program = migrationScannerProgram()) {
  const root = mkdtempSync(join(tmpdir(), 'migration-image-'));
  roots.push(root);
  const prepared = join(root, 'drizzle');
  mkdirSync(prepared, { mode: 0o700 });
  const home = join(root, 'home');
  mkdirSync(home, { mode: 0o700 });
  const scratch = join(root, 'scratch');
  mkdirSync(scratch, { mode: 0o700 });
  for (const name of [
    '20261022211000_add_external_dependencies',
    '20261022212000_add_cross_project_dependency_activation',
  ]) {
    mkdirSync(join(prepared, name), { mode: 0o755 });
    for (const nameSQL of ['migration.sql', 'down.sql'])
      writeFileSync(join(prepared, name, nameSQL), 'SELECT 1;\n', { mode: 0o644 });
  }
  if (fault === 'bad-sql')
    writeFileSync(
      join(prepared, '20261022211000_add_external_dependencies', 'migration.sql'),
      Buffer.from([0xff]),
    );
  if (fault === 'extra-file')
    writeFileSync(join(prepared, '20261022211000_add_external_dependencies', 'ignored'), 'x', {
      mode: 0o644,
    });
  if (fault === 'snapshot')
    writeFileSync(
      join(prepared, '20261022211000_add_external_dependencies', 'snapshot.json'),
      '{}',
      { mode: 0o644 },
    );
  const passwd = join(root, 'passwd');
  writeFileSync(passwd, 'fixture:x:1000:1000::/home/fixture:/bin/sh\n', { mode: 0o644 });
  const application = join(root, 'application');
  mkdirSync(application, { mode: 0o755 });
  mkdirSync(join(application, 'drizzle'), { mode: 0o755 });
  writeFileSync(
    join(application, 'main.ts'),
    "import {Database} from 'bun:sqlite';new Database('/tmp/prohibited.sqlite').close();throw new Error('APP_IMPORT_SENTINEL');",
    {
      mode: 0o644,
    },
  );
  writeFileSync(join(application, 'bunfig.toml'), "preload=['./main.ts']\n", { mode: 0o644 });
  writeFileSync(join(application, '.env'), 'DB_PATH=/prohibited.sqlite\n', { mode: 0o644 });
  const binds: string[] = [];
  const poison = join(root, 'poison');
  writeFileSync(poison, 'PRIVATE_CONFIG_SENTINEL', { mode: 0o644 });
  if (fault === 'unreadable') chmodSync(home, 0);
  if (fault === 'global')
    writeFileSync(join(home, '.bunfig.toml'), 'PRIVATE_CONFIG_SENTINEL', { mode: 0o644 });
  if (fault === 'dangling') symlinkSync('/absent', join(home, '.bunfig.toml'));
  if (fault === 'root') binds.push('--ro-bind', poison, '/bunfig.toml');
  if (fault === 'dot-root') binds.push('--ro-bind', poison, '/.bunfig.toml');
  if (fault === 'missing-tool') {
    const absent = join(root, 'absent');
    writeFileSync(absent, '', { mode: 0o644 });
    binds.push('--ro-bind', absent, '/bin/busybox');
  }
  if (fault === 'ambiguous')
    writeFileSync(
      passwd,
      'fixture:x:1000:1000::/home/fixture:/bin/sh\nsecond:x:1000:1000::/home/fixture:/bin/sh\n',
    );
  const runtime = join(root, 'setuid-bun');
  if (fault === 'setuid-bun') {
    writeFileSync(runtime, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    chmodSync(runtime, 0o4755);
  }
  const child = Bun.spawn(
    [
      'bwrap',
      '--unshare-all',
      '--tmpfs',
      '/',
      '--dev',
      '/dev',
      '--bind',
      scratch,
      '/tmp',
      '--ro-bind',
      '/usr',
      '/usr',
      '--symlink',
      'usr/bin',
      '/bin',
      '--symlink',
      'usr/lib',
      '/lib',
      '--symlink',
      'usr/lib64',
      '/lib64',
      '--ro-bind',
      '/etc',
      '/etc',
      '--tmpfs',
      '/usr/local/bin',
      '--proc',
      '/proc',
      '--dir',
      '/app/apps/wbs/be-01',
      '--ro-bind',
      application,
      '/app/apps/wbs/be-01',
      '--ro-bind',
      prepared,
      '/app/apps/wbs/be-01/drizzle',
      '--ro-bind',
      home,
      '/home/fixture',
      '--ro-bind',
      passwd,
      '/etc/passwd',
      '--ro-bind',
      fault === 'setuid-bun' ? runtime : process.execPath,
      '/usr/local/bin/bun',
      ...binds,
      '--chdir',
      fault === 'cwd' ? '/app' : '/',
      '/usr/bin/env',
      '-i',
      'PATH=/usr/local/bin:/usr/bin:/bin',
      'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
      '/bin/busybox',
      'sh',
      '-c',
      guarded
        ? migrationNativePreflight()
        : 'exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 /usr/local/bin/bun --no-env-file -e "$1"',
      'migration-artifact',
      program,
    ],
    {
      env: {
        ...process.env,
        HOME: '/poison',
        XDG_CONFIG_HOME: '/poison',
        BUN_OPTIONS: '--preload=/poison',
        NODE_OPTIONS: '--require=/poison',
        DB_PATH: '/poison.sqlite',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      signal: AbortSignal.timeout(4000),
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (fault === 'unreadable') chmodSync(home, 0o700);
  return { stdout, stderr, code, files: readdirSync(scratch) };
}
test('actual pinned Bun scanner runs DB-free with scrubbed inherited options and fixed root cwd', async () => {
  const observed = await invoke('none');
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(JSON.parse(observed.stdout)).toEqual(expectedRows);
  expect(observed.files).toEqual([]);
  expect(observed.stdout).not.toContain('PRIVATE');
});
for (const fault of ['global', 'dangling', 'root', 'dot-root'])
  test(`native preflight refuses ${fault} config before scanner startup`, async () => {
    const observed = await invoke(fault);
    expect(observed.code).toBe(75);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe('');
  });
for (const fault of ['missing-tool', 'ambiguous', 'cwd'])
  test(`native preflight refuses ${fault}`, async () => {
    const observed = await invoke(fault);
    expect(observed.code).not.toBe(0);
    expect(observed.stdout).toBe('');
  });

test('native preflight distinguishes inaccessible home metadata from absent config', async () => {
  const observed = await invoke('unreadable');
  expect(observed.code).toBe(73);
  expect(observed.stdout).toBe('');
  expect(observed.stderr).toBe('');
});

test('observe pinned Bun root/no-HOME config lookup without application startup', async () => {
  for (const fault of ['global', 'root', 'dot-root']) {
    const observed = await invoke(fault, false);
    expect(observed.code).toBe(fault === 'root' ? 1 : 0);
    if (fault !== 'root') {
      expect(observed.stderr).toBe('');
      expect(JSON.parse(observed.stdout)).toEqual(expectedRows);
      expect(observed.files).toEqual([]);
    }
  }
});

test('bundled production scanner remains self-contained in a DB-free subprocess', async () => {
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'dependency-migration-artifact-scanner.ts')],
    target: 'bun',
  });
  expect(built.success).toBe(true);
  const artifact = built.outputs[0];
  if (built.outputs.length !== 1) throw new Error('scanner bundle output count differs');
  const contents = await artifact.text();
  const module: unknown = await import(
    'data:text/javascript;base64,' + Buffer.from(contents).toString('base64')
  );
  if (
    typeof module !== 'object' ||
    module === null ||
    !('migrationScannerProgram' in module) ||
    typeof module.migrationScannerProgram !== 'function'
  )
    throw new Error('scanner bundle export missing');
  const generate = module.migrationScannerProgram as () => unknown;
  const program = generate();
  if (typeof program !== 'string') throw new Error('scanner bundle program differs');
  const observed = await invoke('none', true, program);
  expect(observed.code).toBe(0);
  expect(observed.stderr).toBe('');
  expect(JSON.parse(observed.stdout)).toEqual(expectedRows);
  expect(observed.files).toEqual([]);
});

test('native preflight refuses an executable that could change effective scanner identity', async () => {
  const observed = await invoke('setuid-bun');
  expect(observed.code).toBe(76);
  expect(observed.stdout).toBe('');
  expect(observed.stderr).toBe('');
});

const sqlHash = createHash('sha256').update('SELECT 1;\n').digest('hex');
const expectedRows = [
  '20261022211000_add_external_dependencies',
  '20261022212000_add_cross_project_dependency_activation',
].map((name) => ({
  name,
  migration: { size: 10, sha256: sqlHash },
  down: { size: 10, sha256: sqlHash },
  snapshot: null,
}));
for (const fault of ['bad-sql', 'extra-file'])
  test(`actual scanner grammar refuses ${fault}`, async () => {
    const observed = await invoke(fault);
    expect(observed.code).toBe(1);
    expect(observed.stdout).toBe('');
    expect(observed.stderr).toBe('');
    expect(observed.files).toEqual([]);
  });
test('actual image scanner reports exact optional snapshot bytes', async () => {
  const observed = await invoke('snapshot');
  expect(observed.code).toBe(0);
  expect(JSON.parse(observed.stdout)).toEqual(
    expectedRows.map((row, index) => ({
      ...row,
      snapshot:
        index === 0 ? { size: 2, sha256: createHash('sha256').update('{}').digest('hex') } : null,
    })),
  );
  expect(observed.files).toEqual([]);
});

test('native helper passes exactly the scrubbed environment and fixed cwd to Bun', async () => {
  const observed = await invoke(
    'none',
    true,
    'process.stdout.write(JSON.stringify({keys:Object.keys(process.env).sort(),cwd:process.cwd()}))',
  );
  expect(observed.code).toBe(0);
  expect(JSON.parse(observed.stdout)).toEqual({
    keys: ['BUN_RUNTIME_TRANSPILER_CACHE_PATH', 'PATH'],
    cwd: '/',
  });
  expect(observed.stderr).toBe('');
  expect(observed.files).toEqual([]);
});

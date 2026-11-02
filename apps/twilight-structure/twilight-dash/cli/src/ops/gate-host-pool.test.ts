import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { fakeCredential } from '../compute/testing/credential';
import { fixtureGit, gateTree, insideLinuxNamespace } from '../resources/host-pool.test.fixture';
import { loadResourceConfiguration, ResourceRuntime } from '../resources/runtime';
import { renderAuditUnits } from './audit-units';

const REPOSITORY = resolve(import.meta.dir, '../../../../../..');
const ROLE = join(REPOSITORY, 'infra/ansible/roles/gate_host');
const ENTRYPOINT = resolve(import.meta.dir, '../entrypoint.ts');

type RoleValue = string | number | boolean | null | RoleValue[] | { [key: string]: RoleValue };
type RoleVariables = Record<string, RoleValue>;
interface RoleTask {
  name: string;
  'ansible.builtin.command'?: { argv: string[] };
}

/**
 * The subset of Jinja the gate host role's templates and probe argv use: `{{ name }}`,
 * `{{ name.key }}`, and the `to_json` and `int` filters, looked up through the role defaults the
 * way Ansible resolves them lazily. Anything else (`{%`, `{#`, another filter) throws, so a
 * template change this renderer cannot follow fails here instead of passing unread.
 */
function renderRole(template: string, variables: RoleVariables, depth = 0): string {
  if (depth > 16) throw new Error('role variables refer to each other in a cycle');
  if (/\{[%#]/.test(template)) throw new Error(`unsupported Jinja statement in ${template}`);
  return template.replace(/\{\{(.*?)\}\}/g, (_, expression: string) => {
    const [path, ...filters] = expression.split('|').map((part) => part.trim());
    if (!/^[a-z_][a-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[[0-9]+\])*$/.test(path))
      throw new Error(`unsupported Jinja expression {{${expression}}}`);
    const [name, ...keys] = path.split(/\.|(?=\[)/);
    if (!(name in variables)) throw new Error(`undefined role variable ${path}`);
    let value = resolveRole(variables[name] ?? null, variables, depth + 1);
    for (const key of keys) {
      const index = /^\[([0-9]+)\]$/.exec(key)?.[1];
      if (index !== undefined && Array.isArray(value) && Number(index) < value.length) {
        value = value[Number(index)] ?? null;
        continue;
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value) || !(key in value))
        throw new Error(`undefined role variable ${path}`);
      value = value[key] ?? null;
    }
    if (filters.length === 0) {
      if (typeof value === 'object') throw new Error(`${path} is not a scalar`);
      return String(value);
    }
    if (filters.length !== 1) throw new Error(`unsupported filter chain in {{${expression}}}`);
    if (filters[0] === 'to_json') return JSON.stringify(value);
    if (filters[0] === 'int') {
      const number = Number(value);
      if (!Number.isInteger(number))
        throw new Error(`${path} is not an integer: ${JSON.stringify(value)}`);
      return String(number);
    }
    throw new Error(`unsupported filter ${filters[0]}`);
  });
}

function resolveRole(value: RoleValue, variables: RoleVariables, depth: number): RoleValue {
  if (typeof value === 'string') return renderRole(value, variables, depth);
  if (Array.isArray(value)) return value.map((entry) => resolveRole(entry, variables, depth));
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveRole(entry, variables, depth)]),
    );
  return value;
}

function roleDefaults(): RoleVariables {
  return Bun.YAML.parse(readFileSync(join(ROLE, 'defaults/main.yml'), 'utf8')) as RoleVariables;
}

function roleTask(file: string, name: string): string[] {
  const tasks = Bun.YAML.parse(readFileSync(join(ROLE, 'tasks', file), 'utf8')) as RoleTask[];
  const argv = tasks.find((task) => task.name === name)?.['ansible.builtin.command']?.argv;
  if (argv === undefined) throw new Error(`no command task ${name} in ${file}`);
  return argv;
}

function renderTemplate(name: string, variables: RoleVariables): string {
  return renderRole(readFileSync(join(ROLE, 'templates', `${name}.j2`), 'utf8'), variables);
}

/** Directives of a rendered unit, by `Section.Key`; repeated keys keep every value. */
function unitDirectives(unit: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  let section = '';
  for (const line of unit.split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const header = /^\[(\w+)\]$/.exec(line);
    if (header?.[1]) {
      section = header[1];
      continue;
    }
    const equals = line.indexOf('=');
    if (equals < 1) throw new Error(`malformed unit line ${line}`);
    const key = `${section}.${line.slice(0, equals)}`;
    directives.set(key, [...(directives.get(key) ?? []), line.slice(equals + 1)]);
  }
  return directives;
}

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) {
    Bun.spawnSync(['chmod', '-R', 'u+rwX', home]);
    rmSync(home, { recursive: true, force: true });
  }
});

/** A gate account home under the system temp directory and the role variables naming it. */
function enrolledHost(): { home: string; variables: RoleVariables } {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'gate-host-pool-')));
  homes.push(home);
  const variables: RoleVariables = {
    ...roleDefaults(),
    inventory_hostname: 'h4claw',
    puni_gate_home: home,
    puni_gate_checkout: join(home, 'puni-00-gate-tbf'),
    // The defaults read these from the controller's checkout through lookups.
    puni_gate_bun_version: '1.4.4',
    puni_gate_node_version: '24.18.1',
    puni_gate_pool_cpu_cores: '4',
    puni_gate_pool_memory_gib: 8,
    puni_gate_host_pool: {
      authorityId: 'h4claw-authority',
      epoch: 'initial-enrollment',
      providerId: 'h4claw',
      mcpResource: 'https://wbs.example.invalid/mcp',
      credential: fakeCredential(),
      diskBudgetUnits: 16,
    },
  };
  return { home, variables };
}

function writeConfig(variables: RoleVariables): string {
  const path = renderRole('{{ puni_gate_pool_config }}', variables);
  mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
  writeFileSync(path, renderTemplate('host-pool.json', variables), { mode: 0o600 });
  return path;
}

function run(argv: string[], env: Record<string, string> = {}) {
  const execution = Bun.spawnSync(argv, {
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
  return {
    exitCode: execution.exitCode,
    stdout: execution.stdout.toString(),
    stderr: execution.stderr.toString(),
  };
}

/** A directory holding one executable named `name` with `body`, first on the returned PATH. */
function fakeOnPath(home: string, name: string, body: string): string {
  const bin = join(home, `fake-${name}`);
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}`;
}

describe('the gate host role prepares the host pool (dash-host-jobs 6.3, 6.7)', () => {
  test('its pool paths are the ones the launcher shim hard-codes', () => {
    // Proof: renaming the root default to `.../dash/pool` failed this test (verify.md Slice 6c,
    // 6c-F11).
    const variables = roleDefaults();
    const library = join(REPOSITORY, 'bin/heavy-lock-lib.sh');
    const shim = run([
      'bash',
      '-c',
      'source "$1" && resolve_host_pool_root && resolve_host_pool_config_path && resolve_host_pool_ledger_path',
      'shim',
      library,
    ]);
    expect(shim.exitCode).toBe(0);
    expect(shim.stdout.trim().split('\n')).toEqual([
      renderRole('{{ puni_gate_pool_root }}', variables),
      renderRole('{{ puni_gate_pool_config }}', variables),
      renderRole('{{ puni_gate_pool_ledger }}', variables),
    ]);
  });

  test("the configuration template loads through Dash's configuration loader", () => {
    const { home, variables } = enrolledHost();
    mkdirSync(join(home, '.local/share/dash/host-pool'), { recursive: true, mode: 0o700 });
    chmodSync(join(home, '.local/share/dash'), 0o700);
    // Proof: deleting the `enrollmentId` line from host-pool.json.j2 failed this load
    // (verify.md Slice 6c, 6c-F1).
    const configuration = loadResourceConfiguration(writeConfig(variables));
    expect(configuration.root).toBe(join(home, '.local/share/dash/host-pool'));
    expect(configuration.cpuCores).toBe(4);
    expect(configuration.memoryGib).toBe(8);
    expect(configuration.headroom).toEqual({ cpuCores: 1, memoryGib: 2 });
    expect(configuration.exclusiveUnits).toEqual({
      gate_tree: [join(home, 'puni-00-gate-tbf'), join(home, 'puni-00-gate-tbf2')],
      dagger_engine: [join(home, '.local/share/dash/units/dagger_engine')],
    });
    expect(configuration.enrollmentId).toBe('h4claw-host-pool');
    expect(configuration.launcherCheckouts).toEqual([join(home, 'puni-00-gate-launcher')]);
    expect(configuration.concurrencyEligible).toEqual([]);
    expect(configuration.diskBudgetUnits).toBe(16);
  });

  // Proof: dropping the probe's mode check, its key-set check or its root check failed this test
  // (verify.md Slice 6c, 6c-F13, 6c-F9 and 6c-F8).
  test('the validate shape probe accepts the template and refuses each broken configuration', () => {
    const { home, variables } = enrolledHost();
    const config = writeConfig(variables);
    const user = run(['id', '-un']).stdout.trim();
    const argv = roleTask(
      'validate.yml',
      'Require the host pool configuration of an enrolled host',
    ).map((word) => renderRole(word, { ...variables, puni_gate_user: user }));
    expect(run(argv).exitCode).toBe(0);
    const original = JSON.parse(readFileSync(config, 'utf8')) as Record<string, unknown>;
    const broken: [string, Record<string, unknown>][] = [
      [
        'no enrollmentId',
        Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'enrollmentId')),
      ],
      ['an extra mode key', { ...original, mode: 'observe' }],
      ['another root', { ...original, root: join(home, 'elsewhere') }],
      [
        'one gate tree',
        {
          ...original,
          exclusiveUnits: {
            gate_tree: [join(home, 'puni-00-gate-tbf')],
            dagger_engine: [join(home, '.local/share/dash/units/dagger_engine')],
          },
        },
      ],
      ['a string budget', { ...original, cpuCores: '4' }],
      ['no launcher checkout', { ...original, launcherCheckouts: [] }],
    ];
    for (const [fault, shape] of broken) {
      writeFileSync(config, JSON.stringify(shape), { mode: 0o600 });
      expect({ fault, exitCode: run(argv).exitCode }).toEqual({ fault, exitCode: 1 });
    }
    writeFileSync(config, JSON.stringify(original), { mode: 0o600 });
    chmodSync(config, 0o640);
    expect(run(argv).exitCode).not.toBe(0);
    writeFileSync(config, 'not json', { mode: 0o600 });
    chmodSync(config, 0o600);
    expect(run(argv).exitCode).not.toBe(0);
  });

  // Proof: with `memoryGib` dropped from the probe's pinned list, the budget case printed `[]`
  // (verify.md Slice 6c, 6c-F15).
  test('the pinned-field probe names a changed budget, never a value', () => {
    const { variables } = enrolledHost();
    const live = writeConfig(variables);
    const argv = roleTask(
      'host-pool.yml',
      'Compare the pinned fields with the live configuration',
    ).map((word) => renderRole(word, variables));
    const probe = (candidate: RoleVariables) => {
      const execution = Bun.spawnSync(argv, {
        stdin: Buffer.from(renderTemplate('host-pool.json', candidate)),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      return { exitCode: execution.exitCode, stdout: execution.stdout.toString().trim() };
    };
    expect(probe(variables)).toEqual({ exitCode: 0, stdout: '[]' });
    expect(probe({ ...variables, puni_gate_pool_memory_gib: 9 })).toEqual({
      exitCode: 0,
      stdout: '["memoryGib"]',
    });
    expect(
      probe({ ...variables, puni_gate_pool_headroom: { cpuCores: 1, memoryGib: 3 } }).stdout,
    ).toBe('["headroom"]');
    expect(probe({ ...variables, inventory_hostname: 'h4claw-renamed' }).stdout).toBe(
      '["enrollmentId"]',
    );
    // What the ledger does not pin may change without stopping the role.
    const credential = fakeCredential();
    const unpinned = probe({
      ...variables,
      puni_gate_pool_launcher_checkouts: ['/home/puni1/wbs-dev/src'],
      puni_gate_pool_concurrency_eligible: ['release-build'],
      puni_gate_host_pool: {
        ...(variables['puni_gate_host_pool'] as Record<string, RoleValue>),
        credential,
      },
    });
    expect(unpinned).toEqual({ exitCode: 0, stdout: '[]' });
    rmSync(live);
    expect(probe(variables).exitCode).not.toBe(0);
  });

  test('every unit names documentation that exists in the checkout', () => {
    const { home, variables } = enrolledHost();
    // Proof: the renderer's earlier `<checkout>/docs/resources.md` failed this (verify.md
    // Slice 6c, 6c-F16).
    for (const unit of ['dash-job-audit.service', 'dash-resources-watch.service']) {
      const documentation = unitDirectives(renderTemplate(unit, variables)).get(
        'Unit.Documentation',
      );
      const path = documentation?.[0]?.replace(`file://${home}/puni-00-gate-launcher`, REPOSITORY);
      expect({ unit, exists: path !== undefined && existsSync(path) }).toEqual({
        unit,
        exists: true,
      });
    }
  });

  test('the audit units are the ones `ops job render-audit-units` renders', () => {
    const { variables } = enrolledHost();
    const paths = {
      bun: renderRole('{{ puni_gate_bun_path }}', variables),
      dash: renderRole('{{ puni_gate_dash_entrypoint }}', variables),
      config: renderRole('{{ puni_gate_pool_config }}', variables),
      checkout: renderRole('{{ puni_gate_launcher_checkout }}', variables),
    };
    // Proof: changing the template's `OnCalendar=weekly` to `daily` failed this test
    // (verify.md Slice 6c, 6c-F10).
    expect(renderTemplate('dash-job-audit.service', variables)).toBe(
      renderAuditUnits(paths).service,
    );
    expect(renderTemplate('dash-job-audit.timer', variables)).toBe(renderAuditUnits(paths).timer);
  });

  test('the watch unit restarts on failure, spares the guard holder and parses', () => {
    const { home, variables } = enrolledHost();
    const unit = unitDirectives(renderTemplate('dash-resources-watch.service', variables));
    // Proof: deleting `KillMode=process` or `Restart=on-failure` from the template failed this
    // test (verify.md Slice 6c, 6c-F2 and 6c-F3).
    expect(unit.get('Service.KillMode')).toEqual(['process']);
    expect(unit.get('Service.Restart')).toEqual(['on-failure']);
    expect(unit.get('Service.RestartSec')).toEqual(['30']);
    expect(unit.get('Install.WantedBy')).toEqual(['default.target']);
    expect(unit.get('Unit.ConditionPathExists')).toEqual([
      join(home, '.local/share/dash/host-pool/.dash/resources.sqlite'),
    ]);
    expect(unit.get('Service.WorkingDirectory')).toEqual([join(home, 'puni-00-gate-launcher')]);
    expect(unit.get('Service.Environment')).toEqual([
      `PATH=${home}/.bun-1.4.4/bin:${home}/.node-24.18.1/bin:/usr/local/bin:/usr/bin:/bin`,
      'TMPDIR=/var/tmp',
    ]);
    const exec = unit.get('Service.ExecStart')?.[0]?.split(' ') ?? [];
    expect(exec.slice(0, 2)).toEqual([
      `${home}/.bun-1.4.4/bin/bun`,
      `${home}/puni-00-gate-launcher/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts`,
    ]);
    // The unit's own words after the entrypoint get past Dash's parser to the configuration
    // read, which is missing here.
    const missing = join(home, 'missing.json');
    const words = exec.slice(2).map((word) => (word.endsWith('host-pool.json') ? missing : word));
    expect(words).toEqual(['resources', 'watch', '--config', missing]);
    const watch = run([process.execPath, ENTRYPOINT, ...words]);
    expect(watch.exitCode).toBe(1);
    expect(watch.stderr).toContain(`ENOENT: no such file or directory, open '${missing}'`);
  });

  test('the disk probe refuses to clone without room and names the figures', () => {
    const { home, variables } = enrolledHost();
    const argv = roleTask(
      'main.yml',
      'Measure free space for the gate checkouts still to clone',
    ).map((word) => renderRole(word, variables));
    const freeBytes = (bytes: string) =>
      fakeOnPath(home, 'df', `printf '     Avail\\n%s\\n' '${bytes}'`);
    // Three checkouts missing: 3 × 5 GiB + 10 GiB = 26843545600 bytes needed.
    // Proof: replacing `((avail >= need)) || exit 75` with `true` failed this test (verify.md
    // Slice 6c, 6c-F4).
    const low = run(argv, { PATH: freeBytes('7516192768') });
    expect(low.exitCode).toBe(75);
    expect(low.stdout).toContain('clones=3 avail=7516192768 need=26843545600');
    expect(run(argv, { PATH: freeBytes('26843545600') }).exitCode).toBe(0);
    const garbled = run(argv, { PATH: freeBytes('lots') });
    expect(garbled.exitCode).toBe(70);
    expect(garbled.stderr).toContain(`df printed lots for ${home}`);
    for (const checkout of ['puni-00-gate-tbf', 'puni-00-gate-tbf2', 'puni-00-gate-launcher'])
      mkdirSync(join(home, checkout));
    const present = run(argv, { PATH: freeBytes('0') });
    expect(present.exitCode).toBe(0);
    expect(present.stdout).toBe('clones=0\n');
  });

  test('the token unit is created once, read back by validate, and never repaired over', () => {
    const { home, variables } = enrolledHost();
    mkdirSync(join(home, '.local/share/dash/units'), { recursive: true, mode: 0o700 });
    const create = roleTask('host-pool.yml', 'Create the Dagger engine token unit').map((word) =>
      renderRole(word, variables),
    );
    const read = roleTask('validate.yml', 'Read the token unit').map((word) =>
      renderRole(word, variables),
    );
    const git = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    const unit = join(home, '.local/share/dash/units/dagger_engine');
    expect(run(create, git)).toEqual({ exitCode: 0, stdout: 'created\n', stderr: '' });
    expect(run(create, git).stdout).toBe('present\n');
    expect(run(read, git).exitCode).toBe(0);
    writeFileSync(join(unit, 'stray'), '');
    expect(run(read, git).exitCode).not.toBe(0);
    const refused = run(create, git);
    expect(refused.exitCode).toBe(70);
    expect(refused.stderr).toContain(`token unit ${unit} exists but is not a clean Git tree`);
    // A tree with no commit has no resting commit to settle back to.
    // Proof: dropping the `rev-parse -q --verify HEAD` condition from the validate probe, or the
    // token command's commit, failed this test (verify.md Slice 6c, 6c-F6 and 6c-F7).
    rmSync(unit, { recursive: true });
    expect(run(['git', 'init', '-q', unit], git).exitCode).toBe(0);
    expect(run(read, git).exitCode).not.toBe(0);
    expect(run(create, git).exitCode).toBe(70);
  });

  test('the linger probe refuses an account without linger', () => {
    const { home, variables } = enrolledHost();
    const argv = roleTask('validate.yml', 'Require linger for the gate account').map((word) =>
      renderRole(word, variables),
    );
    const linger = (body: string) => ({ PATH: fakeOnPath(home, 'loginctl', body) });
    // Proof: dropping `&& [[ $linger == yes ]]` failed this test (verify.md Slice 6c, 6c-F5).
    expect(
      run(argv, linger(`[ "$*" = 'show-user puni1 --property=Linger --value' ] && echo yes`)),
    ).toEqual({ exitCode: 0, stdout: 'Linger=yes\n', stderr: '' });
    expect(run(argv, linger('echo no')).exitCode).not.toBe(0);
    expect(run(argv, linger('exit 1')).exitCode).not.toBe(0);
  });

  // Proof: dropping the `installed=` line from the probe failed this test (verify.md Slice 6c, 6c-F12).
  test('the checkout probe reads a clone without its frozen install as not installed', () => {
    const { home, variables } = enrolledHost();
    const argv = roleTask('validate.yml', "Read the gate checkouts' state");
    const checkout = join(home, 'clone');
    const git = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    expect(run(['git', 'init', '-q', checkout], git).exitCode).toBe(0);
    run(['git', '-C', checkout, 'remote', 'add', 'origin', 'https://example.invalid/puni-00.git']);
    const words = argv.map((word) =>
      word === '{{ item }}' ? checkout : renderRole(word, variables),
    );
    expect(run(words, git).stdout.trim().split('\n')).toEqual([
      'https://example.invalid/puni-00.git',
      'false',
      'promisor=',
      'dirty=0',
      'installed=no',
    ]);
    mkdirSync(join(checkout, 'node_modules'));
    writeFileSync(join(checkout, '.gitignore'), 'node_modules\n');
    expect(run(words, git).stdout.trim().split('\n').slice(3)).toEqual([
      'dirty=1',
      'installed=yes',
    ]);
  });
});

// `ops pool init` against what the role leaves: two clean gate trees and the token unit made by
// the role's own command, inside a private namespace so no unrelated process holds a unit.
if (insideLinuxNamespace(import.meta.path)) {
  test('a pool the role prepared initializes, token unit included', () => {
    const { home, variables } = enrolledHost();
    for (const directory of ['.local/share/dash/host-pool', '.local/share/dash/units'])
      mkdirSync(join(home, directory), { recursive: true, mode: 0o700 });
    chmodSync(join(home, '.local/share/dash'), 0o700);
    gateTree(join(home, 'puni-00-gate-tbf'));
    gateTree(join(home, 'puni-00-gate-tbf2'));
    const create = roleTask('host-pool.yml', 'Create the Dagger engine token unit').map((word) =>
      renderRole(word, variables),
    );
    expect(run(create, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }).stdout).toBe(
      'created\n',
    );
    const unit = join(home, '.local/share/dash/units/dagger_engine');
    expect(fixtureGit(unit, 'log', '--format=%s')).toBe(
      'dagger_engine token unit (dash-host-jobs S6-A7)',
    );
    const runtime = ResourceRuntime.initialize(
      loadResourceConfiguration(writeConfig(variables)),
      { read: () => Date.parse('2026-11-02T00:00:00Z') },
      { cpuCores: () => 64, memoryGib: () => 256 },
    );
    expect(existsSync(join(home, '.local/share/dash/host-pool/.dash/resources.sqlite'))).toBe(true);
    runtime.close();
  });
}

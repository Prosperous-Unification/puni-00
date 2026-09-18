import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { type } from 'arktype';
import { parse, parseAllDocuments } from 'yaml';

import { judgeBackupJob, type K8sObject } from './check-backup';
import { readToolchain } from './contracts';
import { validatePlatform } from './platform';
import { platformReleases } from './platform-releases';

/**
 * The artifact families `tool-fleet:check` validates. Each one is a separate verdict so a report
 * names every broken family at once, and `check-faults.ts` can prove each fails on its own.
 */
export const CHECK_FAMILIES = [
  'schema',
  'yaml',
  'ansible-syntax',
  'ansible-inventory',
  'kustomize',
  'wbs-backup',
  'helm',
  'shellcheck',
  'workflows',
  'executables',
] as const;
export type CheckFamily = (typeof CHECK_FAMILIES)[number];

export interface CheckFailure {
  readonly family: CheckFamily;
  readonly message: string;
}

/** Thrown with every failed family; the message lists each on its own line. */
export class FleetCheckError extends Error {
  constructor(readonly failures: readonly CheckFailure[]) {
    super(
      `tool-fleet:check failed ${String(failures.length)} check(s):\n` +
        failures.map((failure) => `  [${failure.family}] ${failure.message}`).join('\n'),
    );
    this.name = 'FleetCheckError';
  }
}

export interface CommandOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one bounded subprocess; must throw rather than hang past `timeoutMs`. */
export type CheckRunner = (
  argv: readonly string[],
  options: { readonly cwd?: string; readonly timeoutMs: number },
) => Promise<CommandOutcome>;

/** Locked, version-verified validation tools (see `check-provision.ts`). */
export interface CheckTools {
  readonly kubectl: string;
  readonly helm: string;
  readonly shellcheck: string;
  readonly actionlint: string;
  /** `name@sha256:…` of the fleet controller image that carries Ansible and its collections. */
  readonly controllerImage: string;
}

const CheckToolLock = type({
  version: 'string>0',
  url: 'string.url',
  sha256: /^[0-9a-f]{64}$/,
  member: 'string>0',
  '+': 'reject',
});

const CheckToolsFile = type({
  schemaVersion: '1',
  shellcheck: CheckToolLock,
  actionlint: CheckToolLock,
  uncheckedExecutables: 'string[]',
  '+': 'reject',
});
export type CheckToolsFile = typeof CheckToolsFile.infer;

/** Reads `check-tools.json`; malformed or absent state throws. */
export async function readCheckTools(path: string): Promise<CheckToolsFile> {
  const parsed = CheckToolsFile(JSON.parse(await readFile(path, 'utf8')));
  if (parsed instanceof type.errors) throw new Error(`${path} is invalid: ${parsed.summary}`);
  return parsed;
}

/**
 * Workflows this check lints with actionlint. `ci.yml` and `trusted-wiki.yml` are not listed:
 * actionlint 1.7.12 reports pre-existing SC2174 findings in both, and their owners gate them
 * with their own workflow suites.
 */
export const LINTED_WORKFLOWS = [
  '.github/workflows/infra-check.yml',
  '.github/workflows/deploy-k3s.yml',
] as const;

/** Directories whose YAML the check parses strictly (duplicate keys and syntax errors fail). */
const YAML_ROOTS = ['infra', 'deploy/k8s', '.github/workflows'] as const;

/** Scripts outside `infra/` and `deploy/` that this check shellchecks. */
const EXTRA_SHELL_SCRIPTS = ['bin/publish-release.sh'] as const;

async function trackedFiles(root: string, run: CheckRunner): Promise<string[]> {
  const listed = await run(['git', '-C', root, 'ls-files', '-s', '-z'], { timeoutMs: 60_000 });
  if (listed.exitCode !== 0) {
    throw new Error(`git ls-files failed in ${root}: ${listed.stderr.trim()}`);
  }
  return listed.stdout.split('\0').filter((line) => line !== '');
}

/** `git ls-files -s` entries as `{ mode, path }`. */
export function parseIndexEntries(lines: readonly string[]): { mode: string; path: string }[] {
  return lines.map((line) => {
    const match = /^(\d{6}) [0-9a-f]+ \d+\t(.+)$/.exec(line);
    if (match === null) throw new Error(`unexpected git ls-files line: ${line}`);
    return { mode: match[1], path: match[2] };
  });
}

/** Shell scripts this check owns: every tracked `.sh` under infra/ or deploy/, plus extras. */
export function fleetShellScripts(paths: readonly string[]): string[] {
  const owned = paths.filter(
    (path) => (path.startsWith('infra/') || path.startsWith('deploy/')) && path.endsWith('.sh'),
  );
  return [...owned, ...EXTRA_SHELL_SCRIPTS].sort();
}

/** Parses every document strictly; the first error names the file and line. */
export function assertStrictYaml(path: string, source: string): void {
  for (const document of parseAllDocuments(source, { uniqueKeys: true, strict: true })) {
    // Proof: check.test.ts `refuses duplicate keys and malformed YAML` passed a duplicated
    // `kind` with this branch disabled; check-faults.ts then saw only kustomize complain.
    if (document.errors.length > 0) {
      throw new Error(`${path}: ${document.errors[0].message}`);
    }
  }
}

interface ProjectTargets {
  readonly project: string;
  readonly commands: readonly string[];
}

function commandsOf(target: unknown): string[] {
  if (typeof target !== 'object' || target === null) return [];
  const options = (target as { options?: unknown }).options;
  if (typeof options !== 'object' || options === null) return [];
  const { command, commands } = options as { command?: unknown; commands?: unknown };
  const out: string[] = [];
  if (typeof command === 'string') out.push(command);
  if (Array.isArray(commands)) {
    for (const entry of commands) {
      if (typeof entry === 'string') out.push(entry);
      else if (typeof entry === 'object' && entry !== null) {
        const nested = (entry as { command?: unknown }).command;
        if (typeof nested === 'string') out.push(nested);
      }
    }
  }
  return out;
}

/**
 * Which executables are left unchecked. An executable is checked when some Nx target command
 * runs `shellcheck` naming it, or when this check's own shellcheck family covers it. The
 * committed baseline must equal the unchecked set exactly: a new unchecked executable fails,
 * and so does a baseline entry that became checked or was deleted, so the list only shrinks.
 */
export function judgeExecutables(
  executables: readonly string[],
  targets: readonly ProjectTargets[],
  fleetChecked: readonly string[],
  baseline: readonly string[],
): string[] {
  const shellchecked = new Set(fleetChecked);
  for (const { commands } of targets) {
    for (const command of commands) {
      if (!command.includes('shellcheck')) continue;
      for (const path of executables) if (command.includes(path)) shellchecked.add(path);
    }
  }
  const unchecked = executables.filter((path) => !shellchecked.has(path));
  const problems: string[] = [];
  for (const path of unchecked) {
    // Proof: check.test.ts `refuses a new executable no target shellchecks` passed an unowned
    // executable with this branch disabled.
    if (!baseline.includes(path)) {
      problems.push(`${path} is executable but no Nx target shellchecks it`);
    }
  }
  for (const path of baseline) {
    if (!unchecked.includes(path)) {
      problems.push(
        `${path} is in check-tools.json uncheckedExecutables but is checked or gone; remove it`,
      );
    }
  }
  return problems;
}

function plain(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && '__ansible_unsafe' in value) {
    return value.__ansible_unsafe;
  }
  return value;
}

/** The report `check-ansible.py` prints. */
export interface AnsibleReport {
  readonly syntax: readonly { playbook: string; exitCode: number; stderr: string }[];
  readonly inventories: readonly {
    file: string;
    cluster: string;
    exitCode: number;
    stderr: string;
    listed: unknown;
    selectors: readonly string[];
  }[];
}

/** Every playbook must pass `--syntax-check`, and at least one must exist. */
export function judgeAnsibleSyntax(report: AnsibleReport): string[] {
  if (report.syntax.length === 0) return ['no playbooks were syntax-checked'];
  return report.syntax
    .filter((entry) => entry.exitCode !== 0)
    .map((entry) => `${entry.playbook} fails --syntax-check: ${entry.stderr.trim()}`);
}

/** The hcloud plugin's own reason, without the yaml/ini fallback noise ansible appends. */
function pluginCause(stderr: string): string {
  const cause = /Failed to parse inventory with 'auto' plugin: (.+)/.exec(stderr)?.[1];
  return cause ?? stderr.trim().slice(-400);
}

/** The node each fixture server must become, as `check-ansible.py` defines them. */
const EXPECTED_HOSTS = {
  bootstrap: { group: 'k3s_bootstrap_servers', ip: '10.0.0.11', id: '11', logical: 'server-1' },
  joiner: { group: 'k3s_join_servers', ip: '10.0.0.12', id: '12', logical: 'server-2' },
  agent: { group: 'k3s_agents', ip: '10.0.0.13', id: '13', logical: 'agent-1' },
} as const;

/**
 * The real hcloud inventory plugin, run against the fixture API, must list exactly the three
 * servers of its own cluster in their k3s groups, reachable at their private address, with the
 * `puni_*` facts discovery and apply read.
 */
export function judgeInventories(report: AnsibleReport): string[] {
  if (report.inventories.length === 0) return ['no hcloud inventories were validated'];
  const problems: string[] = [];
  for (const entry of report.inventories) {
    const where = entry.file;
    if (entry.exitCode !== 0 || entry.listed === null) {
      problems.push(
        `${where} does not parse against the fixture API: ${pluginCause(entry.stderr)}`,
      );
      continue;
    }
    const expectedSelector = `puni-fleet=puni,puni-cluster=${entry.cluster}`;
    if (!entry.selectors.includes(expectedSelector)) {
      problems.push(
        `${where} queried label selectors [${entry.selectors.join(' | ')}], not ${expectedSelector}`,
      );
    }
    const listed = entry.listed as {
      _meta?: { hostvars?: Record<string, Record<string, unknown>> };
      [group: string]: unknown;
    };
    const hostvars = listed._meta?.hostvars ?? {};
    const hosts = Object.keys(hostvars).sort();
    // Proof: check.test.ts `refuses an inventory that lists a foreign-cluster host` passed a
    // foreign host with this comparison disabled; check-faults.ts widens the real selector.
    if (JSON.stringify(hosts) !== JSON.stringify(Object.keys(EXPECTED_HOSTS).sort())) {
      problems.push(`${where} lists hosts [${hosts.join(', ')}], not bootstrap, joiner, agent`);
      continue;
    }
    for (const [host, expected] of Object.entries(EXPECTED_HOSTS)) {
      const group = listed[expected.group] as { hosts?: unknown } | undefined;
      const members = Array.isArray(group?.hosts) ? (group.hosts as unknown[]) : [];
      if (!members.includes(host)) {
        problems.push(`${where}: ${host} is not in ${expected.group}`);
      }
      const vars = hostvars[host];
      const facts: Record<string, string> = {
        ansible_host: expected.ip,
        puni_private_ipv4: expected.ip,
        puni_instance_id: expected.id,
        puni_logical_node: expected.logical,
        puni_cluster: entry.cluster,
        puni_operation_id: 'op-check',
        puni_provider_state: 'running',
      };
      for (const [fact, value] of Object.entries(facts)) {
        const actual = plain(vars[fact]);
        if (actual !== value) {
          problems.push(`${where}: ${host}.${fact} is ${JSON.stringify(actual)}, not ${value}`);
        }
      }
    }
  }
  return problems;
}

/** Directories holding a `kustomization.yaml` under infra/ or deploy/k8s/. */
export function kustomizationDirectories(paths: readonly string[]): string[] {
  return paths
    .filter(
      (path) =>
        (path.startsWith('infra/') || path.startsWith('deploy/k8s/')) &&
        path.endsWith('/kustomization.yaml'),
    )
    .map((path) => path.slice(0, -'/kustomization.yaml'.length))
    .sort();
}

const K8S_VERSION_FROM_KUBECTL = /^v(\d+\.\d+\.\d+)$/;

async function runFamily(
  family: CheckFamily,
  failures: CheckFailure[],
  body: () => Promise<string[]>,
): Promise<void> {
  try {
    for (const message of await body()) failures.push({ family, message });
  } catch (cause) {
    failures.push({ family, message: cause instanceof Error ? cause.message : String(cause) });
  }
}

/**
 * Runs every family against the tree at `root`. Families are independent, so all run and every
 * failure is reported; the call throws {@link FleetCheckError} when any failed.
 */
export async function runFleetChecks(
  root: string,
  tools: CheckTools,
  run: CheckRunner,
  log: (line: string) => void,
): Promise<void> {
  const failures: CheckFailure[] = [];
  const index = parseIndexEntries(await trackedFiles(root, run));
  const paths = index.map((entry) => entry.path);
  const toolLocks = await readCheckTools(join(root, 'tools/tool-fleet/src/check-tools.json'));
  const toolchain = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const kubernetesVersion = K8S_VERSION_FROM_KUBECTL.exec(toolchain.binaries.kubectl.version)?.[1];
  if (kubernetesVersion === undefined) {
    throw new Error(`kubectl lock ${toolchain.binaries.kubectl.version} is not vX.Y.Z`);
  }

  await runFamily('schema', failures, async () => {
    const platform = await validatePlatform(root);
    log(`schema: toolchain and ${String(platform.releases.length)} platform releases valid`);
    return [];
  });

  await runFamily('yaml', failures, async () => {
    const problems: string[] = [];
    const files = paths.filter(
      (path) =>
        YAML_ROOTS.some((prefix) => path.startsWith(`${prefix}/`)) &&
        (path.endsWith('.yaml') || path.endsWith('.yml')),
    );
    for (const path of files) {
      try {
        assertStrictYaml(path, await readFile(join(root, path), 'utf8'));
      } catch (cause) {
        problems.push(cause instanceof Error ? cause.message : String(cause));
      }
    }
    log(`yaml: ${String(files.length)} files parsed strictly`);
    return problems;
  });

  const ansible = await run(
    [
      'docker',
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--tmpfs',
      '/runner/.ansible',
      '--volume',
      `${join(root, 'infra/ansible')}:/work/ansible:ro`,
      '--volume',
      `${join(root, 'tools/tool-fleet/src/check-ansible.py')}:/work/check-ansible.py:ro`,
      '--entrypoint',
      'python3',
      tools.controllerImage,
      '/work/check-ansible.py',
      '/work/ansible',
    ],
    { timeoutMs: 900_000 },
  );
  let report: AnsibleReport | null = null;
  if (ansible.exitCode === 0) {
    try {
      report = JSON.parse(ansible.stdout) as AnsibleReport;
    } catch (cause) {
      failures.push({
        family: 'ansible-syntax',
        message: `controller printed no JSON report: ${String(cause)}`,
      });
    }
  } else {
    const message = `controller run exited ${String(ansible.exitCode)}: ${ansible.stderr.trim()}`;
    failures.push({ family: 'ansible-syntax', message });
    failures.push({ family: 'ansible-inventory', message });
  }
  if (report !== null) {
    const syntax = judgeAnsibleSyntax(report);
    for (const message of syntax) failures.push({ family: 'ansible-syntax', message });
    for (const message of judgeInventories(report)) {
      failures.push({ family: 'ansible-inventory', message });
    }
    log(
      `ansible: ${String(report.syntax.length)} playbooks syntax-checked, ` +
        `${String(report.inventories.length)} inventories listed against the fixture API`,
    );
  }

  await runFamily('kustomize', failures, async () => {
    const problems: string[] = [];
    const directories = kustomizationDirectories(paths);
    if (directories.length === 0) return ['no kustomizations found'];
    for (const directory of directories) {
      const rendered = await run([tools.kubectl, 'kustomize', join(root, directory)], {
        timeoutMs: 120_000,
      });
      if (rendered.exitCode !== 0) {
        problems.push(`${directory} does not render: ${rendered.stderr.trim()}`);
        continue;
      }
      try {
        parseAllDocuments(rendered.stdout, { uniqueKeys: true });
      } catch (cause) {
        problems.push(`${directory} renders unparseable YAML: ${String(cause)}`);
      }
    }
    log(`kustomize: ${String(directories.length)} kustomizations rendered`);
    return problems;
  });

  await runFamily('wbs-backup', failures, async () => {
    const runner = await readFile(join(root, 'tools/tool-fleet/src/backup-sqlite.ts'), 'utf8');
    const overlays = [
      ...new Set(
        paths
          .filter((path) => /^deploy\/k8s\/wbs\/overlays\/[^/]+\/kustomization\.yaml$/.test(path))
          .map((path) => path.split('/')[4]),
      ),
    ].sort();
    const problems: string[] = [];
    let judged = 0;
    for (const overlay of overlays) {
      const rendered = await run(
        [tools.kubectl, 'kustomize', join(root, 'deploy/k8s/wbs/overlays', overlay)],
        { timeoutMs: 120_000 },
      );
      if (rendered.exitCode !== 0) {
        problems.push(`overlay ${overlay} does not render: ${rendered.stderr.trim()}`);
        continue;
      }
      const objects = parseAllDocuments(rendered.stdout).map(
        // Boundary: kubectl rendered these; judgeBackupJob reads each field defensively.
        (document) => document.toJS() as K8sObject,
      );
      const hasBackend = objects.some(
        (each) => each.kind === 'Deployment' && each.metadata?.name === 'wbs-backend',
      );
      const hasBackup = objects.some(
        (each) => each.kind === 'CronJob' && each.metadata?.name === 'sqlite-backup',
      );
      // The source-run dev overlay does not build on the release base: it has neither.
      if (!hasBackend && !hasBackup) continue;
      judged++;
      problems.push(...judgeBackupJob(objects, runner).map((each) => `${overlay}: ${each}`));
    }
    if (judged === 0) problems.push('no WBS overlay renders the backend and its backup');
    log(`wbs-backup: ${String(judged)} overlays render a backup matching their backend`);
    return problems;
  });

  await runFamily('helm', failures, async () => {
    const problems: string[] = [];
    for (const release of platformReleases) {
      const document = parse(
        await readFile(join(root, 'infra/platform', release.path), 'utf8'),
      ) as { metadata: { namespace: string }; spec: { values?: unknown } };
      const scratch = await mkdtemp(join(tmpdir(), 'fleet-check-helm-'));
      const valuesPath = join(scratch, 'values.json');
      await writeFile(valuesPath, JSON.stringify(document.spec.values ?? {}));
      try {
        const rendered = await run(
          [
            tools.helm,
            'template',
            release.name,
            join(root, 'infra/platform', release.chart),
            '--namespace',
            document.metadata.namespace,
            '--values',
            valuesPath,
            '--kube-version',
            kubernetesVersion,
          ],
          { timeoutMs: 120_000 },
        );
        if (rendered.exitCode !== 0) {
          problems.push(`${release.path} does not render: ${rendered.stderr.trim()}`);
        } else if (!/^kind: /m.test(rendered.stdout)) {
          problems.push(`${release.path} rendered no Kubernetes objects`);
        }
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    }
    log(`helm: ${String(platformReleases.length)} HelmReleases rendered`);
    return problems;
  });

  const shellScripts = fleetShellScripts(paths);
  await runFamily('shellcheck', failures, async () => {
    const checked = await run([tools.shellcheck, '-s', 'bash', ...shellScripts], {
      cwd: root,
      timeoutMs: 120_000,
    });
    log(`shellcheck ${toolLocks.shellcheck.version}: ${String(shellScripts.length)} scripts`);
    return checked.exitCode === 0 ? [] : [checked.stdout.trim() || checked.stderr.trim()];
  });

  await runFamily('workflows', failures, async () => {
    const present = LINTED_WORKFLOWS.filter((path) => paths.includes(path));
    const missing = LINTED_WORKFLOWS.filter((path) => !paths.includes(path));
    const problems = missing.map((path) => `${path} is not tracked`);
    if (present.length === 0) return problems;
    const linted = await run(
      [
        tools.actionlint,
        '-no-color',
        '-config-file',
        join(root, 'tools/tool-fleet/src/check-actionlint.yaml'),
        ...present,
      ],
      {
        cwd: root,
        timeoutMs: 120_000,
      },
    );
    log(`actionlint ${toolLocks.actionlint.version}: ${present.join(', ')}`);
    if (linted.exitCode !== 0) problems.push(linted.stdout.trim() || linted.stderr.trim());
    return problems;
  });

  await runFamily('executables', failures, async () => {
    const executables = index.filter((entry) => entry.mode === '100755').map((entry) => entry.path);
    const targets: ProjectTargets[] = [];
    for (const path of paths.filter((each) => each.endsWith('/project.json'))) {
      const project = JSON.parse(await readFile(join(root, path), 'utf8')) as {
        name?: string;
        targets?: Record<string, unknown>;
      };
      targets.push({
        project: project.name ?? relative(root, path),
        commands: Object.values(project.targets ?? {}).flatMap(commandsOf),
      });
    }
    log(`executables: ${String(executables.length)} tracked`);
    return judgeExecutables(executables, targets, shellScripts, toolLocks.uncheckedExecutables);
  });

  if (failures.length > 0) throw new FleetCheckError(failures);
}

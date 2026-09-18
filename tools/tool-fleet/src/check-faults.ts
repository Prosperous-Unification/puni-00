/**
 * Proves `tool-fleet:check` is breakable per artifact family. For each family it copies the
 * checked tree to a scratch git repository, injects one fault, and runs the real check command
 * (`check-cli.ts --root <copy>`, what the Nx target runs) expecting a non-zero exit that names
 * that family. A clean copy must pass first, or every "failure" below would prove nothing.
 *
 * `tool-fleet:check:faults`. Needs Docker with the locked controller image, and network access
 * the first time the locked tools are downloaded.
 */
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { CheckFamily } from './check';
import { runChecked } from './check-cli';

const ROOT = resolve(import.meta.dir, '../../..');
const CLI = join(ROOT, 'tools/tool-fleet/src/check-cli.ts');

/** Paths the check reads: infra, deploy, workflows, every project.json and every executable. */
async function copyCheckedTree(destination: string): Promise<void> {
  const listed = await runChecked(['git', '-C', ROOT, 'ls-files', '-s', '-z'], {
    timeoutMs: 60_000,
  });
  if (listed.exitCode !== 0) throw new Error(listed.stderr);
  for (const line of listed.stdout.split('\0').filter((each) => each !== '')) {
    const [meta, path] = line.split('\t');
    const executable = meta.startsWith('100755');
    const wanted =
      executable ||
      path.endsWith('/project.json') ||
      ['infra/', 'deploy/', '.github/workflows/', 'tools/tool-fleet/src/'].some((prefix) =>
        path.startsWith(prefix),
      );
    if (!wanted) continue;
    await mkdir(dirname(join(destination, path)), { recursive: true });
    await cp(join(ROOT, path), join(destination, path));
    if (executable) await chmod(join(destination, path), 0o755);
  }
}

async function commitIndex(tree: string): Promise<void> {
  for (const argv of [
    ['git', '-C', tree, 'init', '--quiet'],
    ['git', '-C', tree, 'add', '--all'],
  ]) {
    const result = await runChecked(argv, { timeoutMs: 60_000 });
    if (result.exitCode !== 0) throw new Error(`${argv.join(' ')}: ${result.stderr}`);
  }
}

async function edit(tree: string, path: string, change: (text: string) => string): Promise<void> {
  const file = join(tree, path);
  const before = await readFile(file, 'utf8');
  const after = change(before);
  if (after === before) throw new Error(`fault left ${path} unchanged`);
  await writeFile(file, after);
}

interface Fault {
  readonly family: CheckFamily;
  readonly description: string;
  inject(tree: string): Promise<void>;
}

const FAULTS: readonly Fault[] = [
  {
    family: 'schema',
    description: 'Traefik HelmRelease chart version differs from the toolchain lock',
    inject: (tree) =>
      edit(tree, 'infra/platform/networking/traefik.yaml', (text) =>
        text.replace(/(\n\s+version: )(\S+)/, '$10.0.1'),
      ),
  },
  {
    family: 'yaml',
    description: 'duplicate key in deploy/k8s/wbs/base/backend.yaml',
    inject: (tree) =>
      edit(tree, 'deploy/k8s/wbs/base/backend.yaml', (text) =>
        text.replace(/^(kind: \S+)$/m, '$1\n$1'),
      ),
  },
  {
    family: 'ansible-syntax',
    description: 'retire.yml gains a play calling an unknown module',
    inject: (tree) =>
      edit(
        tree,
        'infra/ansible/playbooks/retire.yml',
        (text) => `${text}\n- hosts: all\n  tasks:\n    - puni_no_such_module: {}\n`,
      ),
  },
  {
    family: 'ansible-inventory',
    description: 'platform inventory label_selector widened to the whole fleet',
    inject: (tree) =>
      edit(tree, 'infra/ansible/inventory/platform.hcloud.yml', (text) =>
        text.replace(
          'label_selector: puni-fleet=puni,puni-cluster=platform',
          'label_selector: puni-fleet=puni',
        ),
      ),
  },
  {
    family: 'ansible-inventory',
    description: 'workers inventory loses network:, so private_ipv4 hosts get no address',
    inject: (tree) =>
      edit(tree, 'infra/ansible/inventory/workers.hcloud.yml', (text) =>
        text.replace('network: puni-workers\n', ''),
      ),
  },
  {
    family: 'kustomize',
    description: 'staging overlay names a resource that does not exist',
    inject: (tree) =>
      edit(tree, 'deploy/k8s/wbs/overlays/staging/kustomization.yaml', (text) =>
        text.replace('  - ../../base\n', '  - ../../base\n  - ../../missing\n'),
      ),
  },
  {
    family: 'wbs-backup',
    description: 'the backup CronJob reads another database path than the backend',
    inject: (tree) =>
      edit(tree, 'deploy/k8s/wbs/base/backup.yaml', (text) =>
        text.replace('value: /data/wbs.sqlite }', 'value: /data/wbs.db }'),
      ),
  },
  {
    family: 'helm',
    description: 'vendored Traefik chart gains a template that fails (lock re-pinned to it)',
    inject: async (tree) => {
      const lockPath = join(tree, 'infra/versions/toolchain.json');
      const lock = JSON.parse(await readFile(lockPath, 'utf8')) as {
        charts: Record<string, { version: string; sha256: string; url: string }>;
      };
      const [name, entry] = Object.entries(lock.charts).find(([key]) => key === 'traefik') ?? [];
      if (name === undefined || entry === undefined) throw new Error('no traefik chart lock');
      const archive = join(tree, `infra/platform/charts/traefik-${entry.version}.tgz`);
      const work = await mkdtemp(join(tmpdir(), 'fleet-fault-chart-'));
      try {
        for (const argv of [
          ['tar', '-xzf', archive, '-C', work],
          [
            'sh',
            '-c',
            `printf '{{ fail "injected chart fault" }}\\n' > ${work}/traefik/templates/zz-fault.yaml`,
          ],
          ['tar', '-czf', archive, '-C', work, 'traefik'],
        ]) {
          const result = await runChecked(argv, { timeoutMs: 60_000 });
          if (result.exitCode !== 0) throw new Error(`${argv.join(' ')}: ${result.stderr}`);
        }
      } finally {
        await rm(work, { recursive: true, force: true });
      }
      const sum = new Bun.CryptoHasher('sha256').update(await readFile(archive)).digest('hex');
      entry.sha256 = sum;
      await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    },
  },
  {
    family: 'shellcheck',
    description: 'admit.sh gains an unquoted expansion of an unset variable',
    inject: (tree) =>
      edit(tree, 'infra/ci/bureaucrat/admit.sh', (text) => `${text}\necho $puni_unquoted_fault\n`),
  },
  {
    family: 'workflows',
    description: 'infra-check.yml references the output of a job that does not exist',
    inject: (tree) =>
      edit(tree, '.github/workflows/infra-check.yml', (text) =>
        text.replace(
          '    runs-on: ubuntu-latest\n    timeout-minutes: 60\n',
          "    runs-on: ubuntu-latest\n    timeout-minutes: 60\n    if: needs.no-such-job.result == 'success'\n",
        ),
      ),
  },
  {
    family: 'executables',
    description: 'a new executable infra/ci/unowned.bash that no Nx target shellchecks',
    inject: async (tree) => {
      await writeFile(join(tree, 'infra/ci/unowned.bash'), '#!/usr/bin/env bash\necho unowned\n');
      await chmod(join(tree, 'infra/ci/unowned.bash'), 0o755);
    },
  },
];

async function checkTree(tree: string): Promise<{ exitCode: number; output: string }> {
  const result = await runChecked(['bun', CLI, '--root', tree], { timeoutMs: 1_200_000 });
  return { exitCode: result.exitCode, output: result.stdout + result.stderr };
}

async function prepared(fault: Fault | null): Promise<{ tree: string }> {
  const tree = await mkdtemp(join(tmpdir(), 'fleet-check-fault-'));
  await copyCheckedTree(tree);
  if (fault !== null) await fault.inject(tree);
  await commitIndex(tree);
  return { tree };
}

async function main(): Promise<void> {
  const failures: string[] = [];
  const baseline = await prepared(null);
  try {
    const clean = await checkTree(baseline.tree);
    console.log(`[check:faults] clean copy: exit ${String(clean.exitCode)}`);
    if (clean.exitCode !== 0) {
      console.log(clean.output);
      throw new Error('the clean copy fails the check, so no fault below would prove anything');
    }
  } finally {
    await rm(baseline.tree, { recursive: true, force: true });
  }
  for (const fault of FAULTS) {
    const { tree } = await prepared(fault);
    try {
      const faulted = await checkTree(tree);
      const named = faulted.output.includes(`[${fault.family}]`);
      const verdict = faulted.exitCode !== 0 && named ? 'FAILED as required' : 'NOT DETECTED';
      const others = [...faulted.output.matchAll(/^ {2}\[([a-z-]+)\]/gm)].map((m) => m[1]);
      console.log(
        `[check:faults] ${fault.family}: ${fault.description} -> exit ${String(faulted.exitCode)}, ` +
          `${verdict}; failing families [${[...new Set(others)].join(', ')}]`,
      );
      if (verdict !== 'FAILED as required') {
        failures.push(fault.family);
        console.log(faulted.output);
      }
    } finally {
      await rm(tree, { recursive: true, force: true });
    }
  }
  if (failures.length > 0) throw new Error(`faults not detected: ${failures.join(', ')}`);
  console.log(`[check:faults] all ${String(FAULTS.length)} families failed on their fault`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exit(1);
  }
}

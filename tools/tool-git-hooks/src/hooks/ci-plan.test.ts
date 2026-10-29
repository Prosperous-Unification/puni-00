import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, test } from 'bun:test';

const workspaceRoot = resolve(import.meta.dir, '../../../..');
const planCli = join(import.meta.dir, 'ci-plan.ts');
const runtimeCli = join(import.meta.dir, 'ci-run-runtime.ts');

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function git(root: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', root, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function history(path: string, content?: string) {
  const root = scratchSync('ci-plan-');
  write(root, '.gitignore', 'node_modules/\n.nx/\n');
  write(root, 'package.json', JSON.stringify({ name: 'ci-plan-fixture', private: true }));
  write(
    root,
    'nx.json',
    JSON.stringify({ plugins: [], namedInputs: { default: ['{projectRoot}/**/*'] } }),
  );
  for (const project of [
    'core',
    'twilight-burokrat',
    'twilight-dash',
    'website-contracts',
    'wbs-be-01',
    'tool-remote-scripts',
    'wbs-fe-01',
  ]) {
    const targets = Object.fromEntries(
      ['test', 'typecheck', 'build', 'lint', 'lint:source'].map((target) => [
        target,
        { executor: 'nx:run-commands', options: { command: 'echo checked' } },
      ]),
    );
    if (project === 'twilight-burokrat')
      Object.assign(targets['lint'], { inputs: ['{workspaceRoot}/**/*'] });
    const directory =
      project === 'website-contracts' ? 'libs/website/domain/contracts' : `modules/${project}`;
    write(root, `${directory}/project.json`, JSON.stringify({ name: project, targets }));
    const source =
      project === 'website-contracts' ? `${directory}/src/source.ts` : `${directory}/source.ts`;
    write(root, source, 'export const example = 1;\n');
    if (project === 'website-contracts') {
      write(
        root,
        `${directory}/src/source.test.ts`,
        "import { test, expect } from 'bun:test'; import { example } from './source'; test('source', () => expect(example).toBe(2));\n",
      );
      write(
        root,
        `${directory}/src/other.test.ts`,
        "import { test, expect } from 'bun:test'; test('independent', () => expect(1).toBe(1));\n",
      );
    }
  }
  write(root, 'docs/findings/report.md', '# Findings\n');
  symlinkSync(join(workspaceRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'CI plan test');
  git(root, 'config', 'user.email', 'ci-plan@example.test');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  write(
    root,
    path,
    content ?? (path.endsWith('.md') ? '# Updated findings\n' : 'export const example = 2;\n'),
  );
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'candidate');
  return { root, base, head: git(root, 'rev-parse', 'HEAD') };
}

function invokePlan(candidate: ReturnType<typeof history>) {
  return Bun.spawnSync(
    [process.execPath, planCli, candidate.base, candidate.head, candidate.root],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    },
  );
}

function invokeRuntime(
  candidate: ReturnType<typeof history>,
  part: string,
  fault = '0',
  mode = 'affected',
  projects = [
    'core',
    'twilight-burokrat',
    'twilight-dash',
    'website-contracts',
    'wbs-be-01',
    'tool-remote-scripts',
    'wbs-fe-01',
    'new-runtime',
  ],
) {
  const harness = scratchSync('ci-nx-execution-');
  const calls = join(harness, 'calls');
  writeFileSync(
    join(harness, 'bunx'),
    '#!/bin/sh\nprintf "%s\n" "$*" >> "$NX_CALLS"\nif [ "$*" = "nx show projects --json" ]; then printf "%s\n" "$NX_PROJECTS"; exit "$NX_FAULT"; fi\nexit "$NX_FAULT"\n',
    { mode: 0o755 },
  );
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('Test requires PATH');
  const invocation = Bun.spawnSync(
    [process.execPath, runtimeCli, part, candidate.base, candidate.head, candidate.root, mode],
    {
      env: {
        ...process.env,
        PATH: `${harness}:${path}`,
        NX_CALLS: calls,
        NX_FAULT: fault,
        NX_PROJECTS: JSON.stringify(projects),
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 20000,
    },
  );
  return { invocation, calls };
}

describe('production CI plan and execution', () => {
  test('plans only documentation checks for reviewed prose', () => {
    const candidate = history('docs/findings/report.md');
    const invocation = invokePlan(candidate);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(JSON.parse(invocation.stdout.toString()) as unknown).toMatchObject({
      schemaVersion: 1,
      base: candidate.base,
      head: candidate.head,
      mode: 'docs',
      twilight: 'skip',
      projects: [],
      workspaceProjects: [],
      twilightProjects: [],
    });
  }, 20000);

  test('separates unrelated validator lint from runtime projects', () => {
    const invocation = invokePlan(history('modules/core/source.ts'));
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(JSON.parse(invocation.stdout.toString()) as unknown).toMatchObject({
      mode: 'affected',
      projects: ['core'],
      workspaceProjects: ['core'],
      twilightProjects: [],
      twilight: 'skip',
    });
  }, 20000);

  test('keeps a required OpenSpec packet in code validation without unrelated runtime suites', () => {
    const candidate = history('openspec/changes/feature/.openspec.yaml', 'schema: sdd-lean\n');
    const invocation = invokePlan(candidate);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(JSON.parse(invocation.stdout.toString()) as unknown).toMatchObject({
      mode: 'affected',
      projects: [],
      workspaceProjects: [],
      twilightProjects: [],
      twilight: 'skip',
    });
    const execution = invokeRuntime(candidate, 'workspace');
    expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
    const commands = readFileSync(execution.calls, 'utf8').trim().split('\n');
    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain('affected -t lint');
    expect(commands[1]).toContain('run twilight-burokrat:lint:source');
    expect(execution.invocation.stdout.toString()).toContain(
      'Validated plan has no runtime projects',
    );
  }, 20000);

  test('selects source modules when their required OpenSpec packet is added in the same change', () => {
    const candidate = history('modules/core/source.ts');
    write(candidate.root, 'openspec/changes/feature/.openspec.yaml', 'schema: sdd-lean\n');
    write(
      candidate.root,
      'openspec/changes/feature/proposal.md',
      '## Why\n\nKeep the changed core module scoped.\n',
    );
    git(candidate.root, 'add', 'openspec');
    git(candidate.root, 'commit', '--quiet', '-m', 'required change packet');
    candidate.head = git(candidate.root, 'rev-parse', 'HEAD');
    const invocation = invokePlan(candidate);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(JSON.parse(invocation.stdout.toString()) as unknown).toMatchObject({
      mode: 'affected',
      projects: ['core'],
      workspaceProjects: ['core'],
      twilightProjects: [],
      twilight: 'skip',
    });
  }, 20000);

  test('partitions a selected Twilight project exactly once', () => {
    const invocation = invokePlan(history('modules/twilight-burokrat/source.ts'));
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(JSON.parse(invocation.stdout.toString()) as unknown).toMatchObject({
      mode: 'affected',
      projects: ['twilight-burokrat'],
      workspaceProjects: [],
      twilightProjects: ['twilight-burokrat'],
      twilight: 'run',
    });
  }, 20000);

  test.each([
    ['wbs-be-01', 'backend'],
    ['tool-remote-scripts', 'remote'],
    ['wbs-fe-01', 'frontend'],
  ])(
    'plans %s only in its dedicated %s partition',
    (project, partition) => {
      const candidate = history(`modules/${project}/source.ts`);
      const planned = invokePlan(candidate);
      expect(planned.exitCode, planned.stderr.toString()).toBe(0);
      const plan = JSON.parse(planned.stdout.toString()) as {
        partitions: Record<string, string[]>;
      };
      expect(plan.partitions[partition]).toEqual([project]);
      expect(Object.values(plan.partitions).flat()).toEqual([project]);
      const execution = invokeRuntime(candidate, partition);
      expect(execution.invocation.exitCode, execution.invocation.stderr.toString()).toBe(0);
      expect(readFileSync(execution.calls, 'utf8')).toContain(`-p ${project}`);
    },
    20000,
  );

  test('executes selected runtime targets and retains independent workspace lint', () => {
    const { invocation, calls } = invokeRuntime(history('modules/core/source.ts'), 'workspace');
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    const commands = readFileSync(calls, 'utf8').trim().split('\n');
    expect(commands).toHaveLength(3);
    expect(commands[0]).toContain('run-many -t test typecheck build -p core');
    expect(commands[1]).toContain('affected -t lint');
    expect(commands[1]).toContain('--exclude=twilight-burokrat ');
    expect(commands[1]).not.toContain('--exclude=twilight-burokrat,twilight-dash');
    expect(commands[2]).toContain('run twilight-burokrat:lint:source');
    expect(invocation.stdout.toString()).toContain('elapsedMs');
  }, 20000);

  test('executes only the selected Twilight module while workspace owns independent lint', () => {
    const { invocation, calls } = invokeRuntime(
      history('modules/twilight-burokrat/source.ts'),
      'twilight',
    );
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    const commands = readFileSync(calls, 'utf8').trim().split('\n');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('run-many -t test typecheck build -p twilight-burokrat');
    expect(commands.join('\n')).not.toContain('twilight-dash');
  }, 20000);

  test('executes a reviewed file selection through Nx and retains build, types and independent lint', () => {
    const candidate = history('libs/website/domain/contracts/src/source.ts');
    const planned = invokePlan(candidate);
    expect(planned.exitCode, planned.stderr.toString()).toBe(0);
    expect(JSON.parse(planned.stdout.toString()) as unknown).toMatchObject({
      tests: [
        {
          mode: 'files',
          project: 'website-contracts',
          files: ['libs/website/domain/contracts/src/source.test.ts'],
        },
      ],
    });
    const { invocation, calls } = invokeRuntime(candidate, 'workspace');
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    const commands = readFileSync(calls, 'utf8').trim().split('\n');
    expect(commands).toHaveLength(4);
    expect(commands[0]).toContain('run-many -t typecheck build -p website-contracts');
    expect(commands[1]).toContain(
      `run website-contracts:test:selected --base=${candidate.base} --head=${candidate.head}`,
    );
    expect(commands[2]).toContain('affected -t lint');
    expect(commands[3]).toContain('run twilight-burokrat:lint:source');
  }, 20000);

  test('propagates a failed selected Nx command and stops further execution', () => {
    const { invocation, calls } = invokeRuntime(
      history('modules/core/source.ts'),
      'workspace',
      '23',
    );
    expect(invocation.exitCode).toBe(23);
    expect(readFileSync(calls, 'utf8').trim().split('\n')).toHaveLength(1);
    expect(invocation.stdout.toString()).toContain('elapsedMs');
  }, 20000);

  test.each(['workspace', 'twilight'])(
    'refuses runtime execution for a docs plan: %s',
    (part) => {
      expect(invokeRuntime(history('docs/findings/report.md'), part).invocation.exitCode).not.toBe(
        0,
      );
    },
    20000,
  );

  test('refuses an unexplained Twilight invocation and invalid partition', () => {
    const candidate = history('modules/core/source.ts');
    expect(invokeRuntime(candidate, 'twilight').invocation.exitCode).not.toBe(0);
    expect(invokeRuntime(candidate, 'anything').invocation.exitCode).not.toBe(0);
    expect(invokeRuntime(candidate, 'workspace', '0', 'unknown').invocation.exitCode).not.toBe(0);
  }, 20000);

  test('full partitions cover every non-Twilight project with canonical targets', () => {
    const candidate = history('modules/core/source.ts');
    const commands = ['backend', 'remote', 'frontend', 'workspace'].map((part) => {
      const { invocation, calls } = invokeRuntime(candidate, part, '0', 'full');
      expect(invocation.exitCode, `${part}: ${invocation.stderr.toString()}`).toBe(0);
      expect(invocation.stdout.toString()).toContain('elapsedMs');
      return readFileSync(calls, 'utf8').trim().split('\n');
    });
    expect(commands[0][1]).toContain(
      'run-many -t test lint typecheck build -p wbs-be-01 --parallel=2',
    );
    expect(commands[1][1]).toContain(
      'run-many -t test lint typecheck build -p tool-remote-scripts --parallel=2',
    );
    expect(commands[2][1]).toContain(
      'run-many -t test lint typecheck build -p wbs-fe-01 --parallel=2',
    );
    expect(commands[3][1]).toContain(
      'run-many -t test lint typecheck build -p core,website-contracts,new-runtime --parallel=2',
    );
  }, 20000);

  test('fixed remote leaves retain one logical owner and explicit static/dependency execution', () => {
    const candidate = history('modules/tool-remote-scripts/source.ts');
    for (const mode of ['affected', 'full']) {
      for (const part of ['remote-rest', 'remote-model', 'remote-model-continuation']) {
        const { invocation, calls } = invokeRuntime(candidate, part, '0', mode);
        expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
        const commands = readFileSync(calls, 'utf8');
        expect(
          commands
            .trim()
            .split('\n')
            .filter((line) => line.includes(':test:ci:')),
        ).toHaveLength(1);
        expect(commands).toContain(
          `run tool-remote-scripts:test:ci:${part === 'remote-rest' ? 'rest' : part === 'remote-model' ? 'model' : 'model-continuation'} --head=${candidate.head} --skip-nx-cache --parallel=2`,
        );
        expect(commands).not.toContain('-t test ');
        if (part === 'remote-rest')
          expect(commands).toContain(
            `run-many -t ${mode === 'full' ? 'lint ' : ''}typecheck build -p tool-remote-scripts --parallel=2`,
          );
        else expect(commands).not.toContain('run-many');
      }
    }
  }, 20000);

  test('each fixed remote leaf rejects wrong head, unknown mode and an excluded plan', () => {
    const candidate = history('modules/tool-remote-scripts/source.ts');
    for (const part of ['remote-rest', 'remote-model', 'remote-model-continuation']) {
      expect(
        invokeRuntime({ ...candidate, head: candidate.base }, part, '0', 'full').invocation
          .exitCode,
      ).not.toBe(0);
      expect(invokeRuntime(candidate, part, '0', 'unknown').invocation.exitCode).not.toBe(0);
      expect(invokeRuntime(history('modules/core/source.ts'), part).invocation.exitCode).not.toBe(
        0,
      );
    }
  }, 20000);

  test('full residual stays explicit when all configured projects are dedicated or Twilight', () => {
    const candidate = history('modules/core/source.ts');
    const selected = ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01', 'twilight-burokrat'];
    const { invocation, calls } = invokeRuntime(candidate, 'workspace', '0', 'full', selected);
    expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
    expect(readFileSync(calls, 'utf8').trim()).toBe('nx show projects --json');
    expect(invocation.stdout.toString()).toContain('Full inventory has no residual projects');
  }, 20000);

  test('full runner refuses stale head, missing owner and failed Nx inventory', () => {
    const candidate = history('modules/core/source.ts');
    const stale = invokeRuntime({ ...candidate, head: candidate.base }, 'backend', '0', 'full');
    expect(stale.invocation.exitCode).not.toBe(0);
    expect(existsSync(stale.calls)).toBe(false);
    const missing = invokeRuntime(candidate, 'backend', '0', 'full', ['core']);
    expect(missing.invocation.exitCode).not.toBe(0);
    expect(readFileSync(missing.calls, 'utf8')).not.toContain('run-many');
    const fault = invokeRuntime(candidate, 'backend', '23', 'full');
    expect(fault.invocation.exitCode).not.toBe(0);
    expect(readFileSync(fault.calls, 'utf8')).not.toContain('run-many');
    for (const names of [
      ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01', '--skip-nx-cache'],
      ['wbs-be-01', 'tool-remote-scripts', 'wbs-fe-01', 'wbs-be-01'],
    ]) {
      const malformed = invokeRuntime(candidate, 'backend', '0', 'full', names);
      expect(malformed.invocation.exitCode).not.toBe(0);
      expect(readFileSync(malformed.calls, 'utf8')).not.toContain('run-many');
    }
  }, 20000);
});

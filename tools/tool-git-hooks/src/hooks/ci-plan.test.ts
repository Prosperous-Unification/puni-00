import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

function history(path: string) {
  const root = scratchSync('ci-plan-');
  write(root, '.gitignore', 'node_modules/\n.nx/\n');
  write(root, 'package.json', JSON.stringify({ name: 'ci-plan-fixture', private: true }));
  write(
    root,
    'nx.json',
    JSON.stringify({ plugins: [], namedInputs: { default: ['{projectRoot}/**/*'] } }),
  );
  for (const project of ['core', 'twilight-burokrat', 'twilight-dash', 'website-contracts']) {
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
  write(root, path, path.endsWith('.md') ? '# Updated findings\n' : 'export const example = 2;\n');
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

function invokeRuntime(candidate: ReturnType<typeof history>, part: string, fault = '0') {
  const harness = scratchSync('ci-nx-execution-');
  const calls = join(harness, 'calls');
  writeFileSync(
    join(harness, 'bunx'),
    '#!/bin/sh\nprintf "%s\n" "$*" >> "$NX_CALLS"\nexit "$NX_FAULT"\n',
    { mode: 0o755 },
  );
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('Test requires PATH');
  const invocation = Bun.spawnSync(
    [process.execPath, runtimeCli, part, candidate.base, candidate.head, candidate.root],
    {
      env: { ...process.env, PATH: `${harness}:${path}`, NX_CALLS: calls, NX_FAULT: fault },
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
  }, 20000);
});

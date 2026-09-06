import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

const cli = process.env['OPENSPEC_CLI'];
if (!cli) throw new Error('OPENSPEC_CLI must name the installed pinned 1.12.0 openspec.js');
const openspec = cli;

const fixtures: string[] = [];
afterEach(() => {
  fixtures.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

interface ArtifactState {
  id: string;
  status: string;
  requires: string[];
  missingDeps?: string[];
}
interface Status {
  artifacts: ArtifactState[];
  applyRequires: string[];
  nextSteps: string[];
}
interface Instructions {
  instruction: string;
  dependencies: { id: string; done: boolean }[];
}

/**
 * A disposable repository carrying this repository's real twilight-v1 schema and
 * a change with intent and specs only. The CLI decides readiness from the schema
 * on disk, so the fixture must copy it rather than describe it.
 */
function newFixture(): {
  change: string;
  run: (...args: string[]) => unknown;
} {
  const directory = mkdtempSync(join(tmpdir(), 'workflow-cli-'));
  fixtures.push(directory);
  cpSync(
    resolve(import.meta.dir, '../../../openspec/schemas/twilight-v1'),
    join(directory, 'openspec/schemas/twilight-v1'),
    { recursive: true },
  );
  const change = join(directory, 'openspec/changes/architecture');
  mkdirSync(join(change, 'specs/example'), { recursive: true });
  writeFileSync(join(directory, 'openspec/config.yaml'), 'schema: twilight-v1\n');
  writeFileSync(join(change, '.openspec.yaml'), 'schema: twilight-v1\n');
  writeFileSync(join(change, 'proposal.md'), 'Architecture change\n');
  writeFileSync(join(change, 'specs/example/spec.md'), 'Contract\n');
  function run(...args: string[]): unknown {
    const command = Bun.spawnSync([process.execPath, openspec, ...args], {
      cwd: directory,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(command.exitCode).toBe(0);
    return JSON.parse(command.stdout.toString()) as unknown;
  }
  return { change, run };
}

function artifact(status: Status, id: string): ArtifactState {
  const found = status.artifacts.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing CLI artifact ${id}`);
  return found;
}

test('the integration target runs the pinned CLI', () => {
  const version = Bun.spawnSync([process.execPath, openspec, '--version']);
  expect(version.stdout.toString().trim()).toBe('1.12.0');
});

test('the pinned CLI blocks planning while design.md is absent', () => {
  const { run } = newFixture();
  const status = run('status', '--change', 'architecture', '--json') as Status;
  // The reported state first: the traversal below only echoes the schema, and a
  // graph assertion cannot see the CLI answering "ready" to a caller.
  expect(artifact(status, 'tasks').status).toBe('blocked');
  expect(artifact(status, 'tasks').missingDeps).toEqual(['design']);
  expect(artifact(status, 'design').status).toBe('ready');
  expect(status.nextSteps.join('\n')).toContain('instructions design');
  const visited: string[] = [];
  function visit(id: string): void {
    if (visited.includes(id)) return;
    artifact(status, id).requires.forEach(visit);
    visited.push(id);
  }
  status.applyRequires.forEach(visit);
  expect(visited).toEqual(['intent', 'specs', 'design', 'tasks']);
  const tasks = run('instructions', 'tasks', '--change', 'architecture', '--json') as Instructions;
  expect(tasks.dependencies.map((entry) => `${entry.id}:${String(entry.done)}`)).toContain(
    'design:false',
  );
  const design = run(
    'instructions',
    'design',
    '--change',
    'architecture',
    '--json',
  ) as Instructions;
  expect(design.instruction).toContain('REQUIRED for every twilight-v1 change');
  expect(design.instruction).toContain('## Applicability');
});

test('an applicability-only design.md unblocks planning, and apply needs no verify.md', () => {
  const { change, run } = newFixture();
  writeFileSync(
    join(change, 'design.md'),
    '# Technical design\n\n## Applicability\n\nMechanically obvious: one renamed constant.\n',
  );
  const planning = run('status', '--change', 'architecture', '--json') as Status;
  expect(artifact(planning, 'design').status).toBe('done');
  expect(artifact(planning, 'tasks').status).toBe('ready');
  writeFileSync(join(change, 'tasks.md'), '# Implementation tasks\n\n- [ ] 1.1 Rename it.\n');
  // verify.md is deliberately absent: it is a handoff/archive obligation, not an
  // apply prerequisite. Assert the CLI's answer before the graph that produced it.
  const apply = run('instructions', 'apply', '--change', 'architecture', '--json') as {
    state: string;
  };
  expect(apply.state).toBe('ready');
  const planned = run('status', '--change', 'architecture', '--json') as Status;
  expect(artifact(planned, 'verify').status).toBe('ready');
  expect(planned.applyRequires).toEqual(['intent', 'specs', 'tasks']);
});

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

const cli = process.env['OPENSPEC_CLI'];
if (!cli) throw new Error('OPENSPEC_CLI must name the installed pinned 1.12.0 openspec.js');
const fixtures: string[] = [];
afterEach(() => {
  fixtures.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

test('pinned CLI exposes conditional design to fast-forward while apply accepts its recorded omission', () => {
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
    const command = Bun.spawnSync([process.execPath, cli!, ...args], {
      cwd: directory,
      env: { ...process.env, OPENSPEC_TELEMETRY: '0' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(command.exitCode).toBe(0);
    return JSON.parse(command.stdout.toString()) as unknown;
  }
  const version = Bun.spawnSync([process.execPath, cli, '--version']);
  expect(version.stdout.toString().trim()).toBe('1.12.0');
  const status = run('status', '--change', 'architecture', '--json') as {
    artifacts: { id: string; requires: string[] }[];
    applyRequires: string[];
  };
  const visited: string[] = [];
  function visit(id: string) {
    if (visited.includes(id)) return;
    const artifact = status.artifacts.find((entry: { id: string }) => entry.id === id);
    if (!artifact) throw new Error(`Missing CLI artifact ${id}`);
    artifact.requires.forEach(visit);
    visited.push(id);
  }
  status.applyRequires.forEach(visit);
  expect(visited).toEqual(['intent', 'specs', 'design', 'tasks']);
  const design = run('instructions', 'design', '--change', 'architecture', '--json') as {
    instruction: string;
  };
  expect(design.instruction).toContain('OPTIONAL only for mechanically obvious changes');
  writeFileSync(
    join(change, 'tasks.md'),
    'Design omitted: mechanically obvious.\n- [ ] Implement\n',
  );
  const apply = run('instructions', 'apply', '--change', 'architecture', '--json') as {
    state: string;
  };
  expect(apply.state).toBe('ready');
});

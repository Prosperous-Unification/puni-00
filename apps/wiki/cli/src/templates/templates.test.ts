import { Buffer } from 'node:buffer';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

const cliPath = join(import.meta.dir, '..', 'cli.ts');

function runCli(argv: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

function stdoutOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stdout === undefined) throw new Error('stdout pipe was unavailable');
  return Buffer.from(invocation.stdout).toString('utf8');
}

function stderrOf(invocation: ReturnType<typeof Bun.spawnSync>): string {
  if (invocation.stderr === undefined) throw new Error('stderr pipe was unavailable');
  return Buffer.from(invocation.stderr).toString('utf8');
}

interface TemplateListing {
  schemaVersion: number;
  templates: { id: string; version: string; subject: string; generates: string }[];
}

interface ShownTemplate {
  id: string;
  subject: string;
  files: { path: string; required: boolean; content: string }[];
  requirements: { id: string; statement: string; rules: string[]; constraint: { kind: string } }[];
}

describe('template registry CLI', () => {
  test('lists every registered template in identifier order', () => {
    const invocation = runCli(['template', 'list']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const listing = JSON.parse(stdoutOf(invocation)) as TemplateListing;
    expect(listing.schemaVersion).toBe(1);
    expect(listing.templates.map((template) => template.id)).toEqual([
      'feature-service',
      'repository',
      'resource-service',
    ]);
    expect(listing.templates.map((template) => template.subject)).toEqual(['file', 'file', 'file']);
  }, 30_000);

  test('shows one template with its skeleton files and its constrained requirements', () => {
    const invocation = runCli(['template', 'show', 'repository']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    const shown = JSON.parse(stdoutOf(invocation)) as ShownTemplate;
    expect(shown.files.map((file) => file.path)).toEqual([
      'contract.ts',
      '<name>.repository.ts',
      '<name>.repository.test.ts',
    ]);
    expect(shown.files[1].content).toContain('// @port ./contract#<Name>Port');
    expect(shown.requirements.map((requirement) => requirement.id)).toEqual([
      'repository.suffix',
      'repository.one-kind',
      'repository.port',
      'repository.conformance-test',
      'repository.no-service-import',
    ]);
    expect(shown.requirements.map((requirement) => requirement.constraint.kind)).toEqual([
      'name-suffix',
      'one-kind-per-file',
      'declares-one',
      'sibling-test',
      'imports-no-kind',
    ]);
  }, 30_000);

  test('refuses an unregistered template identifier and names every registered template', () => {
    const invocation = runCli(['template', 'show', 'NO-SUCH-TEMPLATE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown template: NO-SUCH-TEMPLATE (registered: feature-service, repository, resource-service)',
    );
  }, 30_000);

  test('refuses an unknown template action', () => {
    const invocation = runCli(['template', 'summon']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain('usage: twilight-bureaucrat template <list|show');
  }, 30_000);
});

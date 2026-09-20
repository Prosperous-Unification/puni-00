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

describe('explain production CLI', () => {
  test('prints the registry record for a known rule', () => {
    const invocation = runCli(['explain', 'MOD-INDEX']);
    expect(invocation.exitCode, stderrOf(invocation)).toBe(0);
    expect(JSON.parse(stdoutOf(invocation)) as unknown).toEqual({
      id: 'MOD-INDEX',
      family: 'modules',
      statement:
        'Each module index declares exactly the candidate files nearest to it, and every Markdown reference and anchor it states resolves inside the candidate.',
      source:
        'openspec/changes/twilight-bureaucrat-rule-model/specs/bureaucrat-rules/spec.md#requirement-module-index-declarations',
      inputs: ['candidate.entries'],
    });
  });

  test('refuses an unregistered rule identifier and names every registered rule', () => {
    const invocation = runCli(['explain', 'NO-SUCH-RULE']);
    expect(invocation.exitCode).toBe(1);
    expect(stderrOf(invocation)).toContain(
      'unknown rule: NO-SUCH-RULE (registered: INV-CLASSIFY, MOD-DIRECT-ENTRIES, MOD-INDEX, REL-EXTRACT)',
    );
  });
});

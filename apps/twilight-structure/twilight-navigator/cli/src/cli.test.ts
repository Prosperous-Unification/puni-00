import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Usage } from '@optique/core';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { navigatorHandlers } from './cli';
import { navigatorParser, readNavigatorInvocation } from './cli-parser';
import { runTwin, runTwinInProcess, scratchDirectory } from './testing/run-twin';

let scratch: { path: string; remove: () => void };

beforeEach(() => {
  scratch = scratchDirectory();
});

afterEach(() => {
  scratch.remove();
});

/**
 * Every flag of `plan-reference`, each naming a file that does not exist: a refusal that read
 * any input would say `is missing`, so a usage refusal proves nothing was read.
 */
function planReferenceFlags(): string[] {
  return [
    '--export',
    join(scratch.path, 'absent-export.json'),
    '--repository',
    'repository',
    '--change',
    'change',
    '--planning-commit',
    '1'.repeat(40),
    '--source-base',
    '2'.repeat(40),
    '--requirements',
    join(scratch.path, 'absent-requirements.md'),
    '--output',
    scratch.path,
  ];
}

async function expectUsageRefusal(argv: readonly string[], diagnostic: RegExp): Promise<void> {
  const run = await runTwinInProcess(argv);
  expect(run.stderr).toMatch(/^error: [^\n]*\n$/u);
  expect(run.stderr).toMatch(diagnostic);
  expect(run.stdout).toBe('');
  expect(run.stderr).not.toMatch(/is missing/);
  expect(run.exitCode).toBe(2);
  expect(readdirSync(scratch.path)).toEqual([]);
}

describe('twin dispatch', () => {
  test('a complete plan-reference request reaches the reader', async () => {
    const run = await runTwinInProcess(['plan-reference', ...planReferenceFlags()]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/plan export is missing/);
  });

  test('refuses an unsupported command before any read, exit 2 through the entrypoint', async () => {
    const run = runTwin(['apply', ...planReferenceFlags()]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('error: Unsupported twin command: apply\n');
    for (const command of ['plan-lock', 'PLAN-REFERENCE']) {
      await expectUsageRefusal(
        [command, ...planReferenceFlags()],
        new RegExp(`^error: Unsupported twin command: ${command}\n$`),
      );
    }
    expect(readdirSync(scratch.path)).toEqual([]);
  });

  test('a complete receipt-to-commands request reaches the reader', async () => {
    const run = await runTwinInProcess([
      'receipt-to-commands',
      '--receipt',
      join(scratch.path, 'absent-receipt.json'),
      '--plan-reference',
      join(scratch.path, 'absent-reference.json'),
      '--tasks',
      join(scratch.path, 'absent-tasks.json'),
      '--output',
      join(scratch.path, 'batch.json'),
    ]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toMatch(/progress receipt is missing/);
  });

  test("refuses another command's flag before any read", async () => {
    await expectUsageRefusal(
      ['receipt-to-commands', ...planReferenceFlags()],
      /Unsupported twin flag: --export/,
    );
  });

  test('refuses no command at all', async () => {
    await expectUsageRefusal([], /^error: Unsupported twin command: \n$/);
  });

  test('refuses an unknown flag before any read', async () => {
    await expectUsageRefusal(
      ['plan-reference', ...planReferenceFlags(), '--force', 'yes'],
      /Unsupported twin flag: --force/,
    );
    await expectUsageRefusal(
      ['plan-reference', '--network', 'on', ...planReferenceFlags()],
      /Unsupported twin flag: --network/,
    );
  });

  test('refuses a duplicate flag before any read', async () => {
    await expectUsageRefusal(
      ['plan-reference', ...planReferenceFlags(), '--change', 'other'],
      /Duplicate twin flag: --change/,
    );
  });

  test('refuses a valueless flag before any read', async () => {
    const flags = planReferenceFlags();
    await expectUsageRefusal(
      ['plan-reference', ...flags.slice(0, 2), '--repository', ...flags.slice(4)],
      // `--repository` takes `--change` as its value, so `change` is the first unplaceable word.
      /Unexpected twin argument: change/,
    );
    await expectUsageRefusal(
      ['plan-reference', ...flags.slice(0, -1), ''],
      /twin flag has no value: --output/,
    );
    await expectUsageRefusal(
      ['plan-reference', ...flags.slice(0, -1), '--force'],
      /twin flag has no value: --output/,
    );
  });

  test('refuses a missing flag before any read', async () => {
    const flags = planReferenceFlags();
    for (let position = 0; position < flags.length; position += 2) {
      const missing = flags[position];
      await expectUsageRefusal(
        ['plan-reference', ...flags.slice(0, position), ...flags.slice(position + 2)],
        new RegExp(`Missing required twin flag: ${missing}`),
      );
    }
  });

  test('Missing Navigator flag: the entrypoint refuses with the command usage, exit 2', () => {
    const run = runTwin(['plan-reference', ...planReferenceFlags().slice(2)]);
    expect(run.exitCode).toBe(2);
    expect(run.stdout).toBe('');
    expect(run.stderr).toMatch(
      /^error: usage: twin plan-reference --export PATH .*\(Missing required twin flag: --export\)\n$/u,
    );
    expect(readdirSync(scratch.path)).toEqual([]);
  });

  test('a stray argument refuses with the command usage', async () => {
    await expectUsageRefusal(
      ['plan-reference', ...planReferenceFlags(), 'extra'],
      /^error: usage: twin plan-reference .*\(Unexpected twin argument: extra\)\n$/u,
    );
  });
});

function printedBy(args: readonly string[]): string {
  let stdout = '';
  const invocation = readNavigatorInvocation(args, (text) => {
    stdout += text;
  });
  expect(invocation).toEqual({ kind: 'printed' });
  return stdout;
}

/**
 * The first word after `twin` in each usage entry of a help page. The usage block ends at the
 * first blank line; entries are matched across line breaks, so wrapping cannot hide one.
 */
function helpCommands(help: string): string[] {
  const [usageBlock] = help.split('\n\n');
  const named = new Set([...usageBlock.matchAll(/twin\s+(\S+)/gu)].map((match) => match[1]));
  for (const generated of ['help', 'completion', '--help']) named.delete(generated);
  return [...named].sort();
}

/** The command word of each top-level branch the root parser declares. */
function parserCommands(usage: Usage = navigatorParser.usage): string[] {
  return usage.flatMap((term) =>
    term.type === 'exclusive'
      ? term.terms.flatMap((branch) =>
          branch.flatMap((part) => (part.type === 'command' ? [part.name] : [])),
        )
      : [],
  );
}

const dispatched = Object.keys(navigatorHandlers).sort();

describe('twin help and completion', () => {
  test('help names every dispatched command and no other', () => {
    // Proof: removing `receiptToCommands` from the parser's command list (not from
    // `navigatorHandlers`) failed this assertion with `- "receipt-to-commands"` (2026-11-02).
    expect(helpCommands(printedBy(['--help']))).toEqual(dispatched);
    expect(parserCommands().sort()).toEqual(dispatched);
    expect(dispatched).toEqual(['admit-progress', 'plan-reference', 'receipt-to-commands']);
  });

  test('help <command> prints that command with every flag on stdout', () => {
    const help = printedBy(['help', 'plan-reference']);
    expect(help).toContain('Usage: twin plan-reference');
    for (let position = 0; position < planReferenceFlags().length; position += 2) {
      expect(help).toContain(planReferenceFlags()[position]);
    }
    expect(printedBy(['help', 'admit-progress'])).toContain('--accepted-reference PATH');
  });

  test('help parity holds under any terminal width', () => {
    const inProcess = printedBy(['--help']);
    for (const columns of ['30', '400']) {
      const execution = Bun.spawnSync({
        cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), '--help'],
        env: { ...process.env, COLUMNS: columns },
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(execution.exitCode, columns).toBe(0);
      expect(execution.stdout.toString('utf8'), columns).toBe(inProcess);
    }
  });

  test('help and bash, zsh and fish completion print on stdout', () => {
    const expected: Record<string, RegExp> = {
      '--help': /^Usage: twin /u,
      'help receipt-to-commands': /Usage: twin receipt-to-commands /u,
      'completion bash': /complete .*twin/u,
      'completion zsh': /^#compdef twin\n/u,
      'completion fish': /complete -c twin/u,
    };
    for (const [line, stdout] of Object.entries(expected)) {
      expect(printedBy(line.split(' ')), line).toMatch(stdout);
    }
    const candidates = printedBy(['completion', 'zsh', '']);
    for (const name of dispatched) expect(candidates).toContain(name);
    expect(printedBy(['completion', 'bash', 'plan-reference', '--re'])).toBe(
      '--repository\n--requirements',
    );
  });

  test('the entrypoint prints a completion script on stdout, exit 0', () => {
    const run = runTwin(['completion', 'zsh']);
    expect(run.exitCode).toBe(0);
    expect(run.stderr).toBe('');
    expect(run.stdout).toStartWith('#compdef twin\n');
  });

  test('completion without a shell, and --version, refuse in one line', async () => {
    await expectUsageRefusal(
      ['completion'],
      /^error: usage: twin completion \(Missing shell name for completion\.\)\n$/u,
    );
    await expectUsageRefusal(['--version'], /^error: Unsupported twin command: --version\n$/u);
  });
});

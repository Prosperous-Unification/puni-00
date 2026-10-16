import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { USAGE } from './cli';
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
  expect(run.stderr).toMatch(diagnostic);
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
    expect(run.stderr).toStartWith('Unsupported twin command: apply\n');
    for (const command of ['plan-lock', 'PLAN-REFERENCE']) {
      await expectUsageRefusal(
        [command, ...planReferenceFlags()],
        new RegExp(`^Unsupported twin command: ${command}\n`),
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
    await expectUsageRefusal([], /Unsupported twin command: \n/);
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
      /twin flag has no value: --repository/,
    );
    await expectUsageRefusal(
      ['plan-reference', ...flags.slice(0, -1), ''],
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

  test('--help lists exactly the supported commands', async () => {
    const run = await runTwinInProcess(['--help']);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toBe(`${USAGE}\n`);
    // Proof: omitting admit-progress from COMMAND_FLAGS failed this help test (2026-10-16).
    expect(USAGE.split('\n').map((line) => line.split(' ')[1])).toEqual([
      'admit-progress',
      'plan-reference',
      'receipt-to-commands',
    ]);
    await expectUsageRefusal(['--help', 'plan-reference'], /takes no arguments/);
  });
});

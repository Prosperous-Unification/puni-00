import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { runDash } from './cli';

const enrollmentFlags = [
  '--fleet',
  'fleet.yaml',
  '--observation',
  'observation.json',
  '--output',
  'plan.json',
  '--node',
  'node-1',
  '--cluster',
  'lab-1',
  '--inventory-sha256',
  'a'.repeat(64),
  '--ansible-variables-sha256',
  'b'.repeat(64),
  '--known-hosts-sha256',
  'c'.repeat(64),
] as const;

function observePlanner() {
  const calls: string[][] = [];
  return {
    calls,
    run: (argv: readonly string[]) =>
      Promise.resolve().then(() => {
        calls.push([...argv]);
      }),
  };
}

async function expectRefusal(
  argv: readonly string[],
  planner: ReturnType<typeof observePlanner>,
  pattern: RegExp,
) {
  let refusal: unknown;
  try {
    await runDash(argv, planner.run);
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('Dash did not return an Error');
  expect(refusal.message).toMatch(pattern);
  expect(planner.calls).toEqual([]);
}

describe('Dash enrollment planning dispatcher', () => {
  test('the installed entrypoint refuses an apply command', () => {
    const execution = Bun.spawnSync({
      cmd: [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'apply', ...enrollmentFlags],
    });
    expect(execution.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(execution.stderr)).toContain('Unsupported Dash command: apply');
  });

  test('delegates only the reviewed enrollment operation and named arguments', async () => {
    const planner = observePlanner();
    await runDash(
      ['plan-enrollment', ...enrollmentFlags.slice(8), ...enrollmentFlags.slice(0, 8)],
      planner.run,
    );
    expect(planner.calls).toEqual([['--operation', 'enroll', ...enrollmentFlags]]);
  });

  test.each(['apply', 'discover', 'build', 'deploy', 'plan', ''])(
    'refuses unsupported command %s before planning',
    async (command) => {
      const planner = observePlanner();
      await expectRefusal([command, ...enrollmentFlags], planner, /command/i);
    },
  );

  test.each(['--operation', '--executable', '--adapter', '--arbitrary'])(
    'refuses unsupported flag %s before planning',
    async (flag) => {
      const planner = observePlanner();
      await expectRefusal(['plan-enrollment', ...enrollmentFlags, flag, 'apply'], planner, /flag/i);
    },
  );

  test.each([
    '--fleet',
    '--observation',
    '--output',
    '--node',
    '--cluster',
    '--inventory-sha256',
    '--ansible-variables-sha256',
    '--known-hosts-sha256',
  ])('refuses missing %s before planning', async (flag) => {
    const planner = observePlanner();
    const position = enrollmentFlags.indexOf(flag);
    const argv = enrollmentFlags.filter((_, index) => index !== position && index !== position + 1);
    await expectRefusal(['plan-enrollment', ...argv], planner, new RegExp(flag));
  });

  test('refuses duplicate flags before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags, '--node', 'node-2'],
      planner,
      /duplicate.*--node/i,
    );
  });

  test('refuses a valueless or empty flag before planning', async () => {
    const planner = observePlanner();
    await expectRefusal(['plan-enrollment', ...enrollmentFlags.slice(0, -1)], planner, /value/i);
    await expectRefusal(
      ['plan-enrollment', ...enrollmentFlags.slice(0, -1), ''],
      planner,
      /--known-hosts-sha256/,
    );
  });
});

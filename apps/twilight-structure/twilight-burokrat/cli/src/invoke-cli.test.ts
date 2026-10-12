import { expect, test } from 'bun:test';

import { invokeCli } from './invoke-cli';

test('invokeCli captures a refusal as the process entry reports it and restores the process', async () => {
  const write: unknown = Reflect.get(process.stdout, 'write');
  const refused = await invokeCli(['not-a-command']);
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout).toBe('');
  expect(refused.stderr).toContain('unknown command: not-a-command');
  // Proof: restoring `process.exitCode` to the `undefined` Bun reported before the call left it at
  // 1, so this assertion failed and the whole test run would have exited 1 (2026-10-12).
  expect(process.exitCode).toBe(0);
  // Proof: restoring a bound copy of `write` instead of the original made this identity
  // assertion fail with `Received: false` (2026-10-12).
  expect(Reflect.get(process.stdout, 'write') === write).toBe(true);
});

test('invokeCli captures stdout and exit 0 of an accepted command', async () => {
  const listed = await invokeCli(['template', 'list']);
  expect(listed.exitCode, listed.stderr).toBe(0);
  expect(JSON.parse(listed.stdout)).toMatchObject({ schemaVersion: 1 });
});

test('invokeCli sets and unsets process.env keys for one call only', async () => {
  process.env['INVOKE_CLI_PROBE_KEPT'] = 'before';
  try {
    await invokeCli(['template', 'list'], {
      INVOKE_CLI_PROBE_ADDED: 'during',
      INVOKE_CLI_PROBE_KEPT: undefined,
    });
    expect(process.env['INVOKE_CLI_PROBE_ADDED']).toBeUndefined();
    expect(process.env['INVOKE_CLI_PROBE_KEPT']).toBe('before');
  } finally {
    Reflect.deleteProperty(process.env, 'INVOKE_CLI_PROBE_KEPT');
  }
});

test('invokeCli refuses an overlapping call instead of mixing their output', async () => {
  const first = invokeCli(['template', 'list']);
  // Proof: removing the `running` guard let this second call start and resolve, so the rejection
  // assertion failed and both calls shared one captured stdout (2026-10-12).
  let refusal: unknown;
  try {
    await invokeCli(['template', 'list']);
  } catch (cause) {
    refusal = cause;
  }
  expect(refusal).toBeInstanceOf(Error);
  expect(String(refusal)).toContain('invokeCli calls overlap');
  expect((await first).exitCode).toBe(0);
});

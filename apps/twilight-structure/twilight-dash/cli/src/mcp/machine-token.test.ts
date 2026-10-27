import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import {
  assertionFileReader,
  gitHubActionsReader,
  refusalOf,
  retryAfterSecondsOf,
} from './machine-token';

const scratch = mkdtempSync(join(tmpdir(), 'dash-machine-token-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** The message `pending` rejects with; fails the test when it resolves. */
async function rejection(pending: Promise<unknown>): Promise<string> {
  const outcome = await pending.then(
    () => new Error('resolved, but a refusal was expected'),
    (cause: unknown) => cause,
  );
  if (!(outcome instanceof Error) || outcome.message === 'resolved, but a refusal was expected')
    throw new Error(`expected a refusal, got ${String(outcome)}`);
  return outcome.message;
}

describe('assertionFileReader', () => {
  test('refuses an unreadable assertion file apart from an empty or oversize one', async () => {
    const unreadable = join(scratch, 'unreadable');
    writeFileSync(unreadable, 'eyJ.a.b');
    chmodSync(unreadable, 0o000);
    const missing = join(scratch, 'missing');
    const empty = join(scratch, 'empty');
    writeFileSync(empty, ' \n');
    // 40,000 three-byte characters: 120,000 bytes, under 64 Ki characters.
    const oversize = join(scratch, 'oversize');
    writeFileSync(oversize, '€'.repeat(40_000));
    const exact = join(scratch, 'exact');
    writeFileSync(exact, 'a'.repeat(64 * 1024));
    const cannotRead = '--assertion-file: the workload token file cannot be read';
    const noToken = '--assertion-file: the file holds no workload token (empty or over 64 KiB)';
    expect(await rejection(assertionFileReader(missing)())).toBe(cannotRead);
    if (process.getuid?.() !== 0) {
      expect(await rejection(assertionFileReader(unreadable)())).toBe(cannotRead);
    }
    expect(await rejection(assertionFileReader(empty)())).toBe(noToken);
    expect(await rejection(assertionFileReader(oversize)())).toBe(noToken);
    expect(await assertionFileReader(exact)()).toHaveLength(64 * 1024);
  });
});

describe('gitHubActionsReader', () => {
  test('refuses a GitHub Actions answer other than 200, naming its status', async () => {
    const read = gitHubActionsReader(
      'wbs',
      {
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/token',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'runner-request-token',
      },
      () => Promise.resolve(Response.json({ value: 'not.for.you' }, { status: 403 })),
    );
    const message = await rejection(read());
    expect(message).toBe('GitHub Actions refused the workload token: HTTP 403');
    expect(message).not.toContain('runner-request-token');
  });
});

describe('refusalOf', () => {
  test("names a proxy's non-JSON 502 and a JSON answer without error by status only", async () => {
    const proxy = new Response('<html>Bad Gateway</html>', { status: 502 });
    expect(await rejection(refusalOf(proxy))).toBe(
      'the MCP token endpoint answered HTTP 502, not JSON',
    );
    const shapeless = Response.json({ message: 'upstream down' }, { status: 502 });
    expect(await rejection(refusalOf(shapeless))).toBe(
      'the MCP token endpoint answered HTTP 502 without an OAuth error',
    );
  });

  test('reads an OAuth error, its description bounded', async () => {
    const refusal = await refusalOf(
      Response.json(
        { error: 'invalid_grant', error_description: 'x'.repeat(500) },
        { status: 400 },
      ),
    );
    expect(refusal.message).toBe(
      `the MCP token endpoint refused: HTTP 400 invalid_grant (${'x'.repeat(200)})`,
    );
  });
});

describe('retryAfterSecondsOf', () => {
  test('reads only the delay form of Retry-After', () => {
    const answer = (value: string | null) =>
      new Response(null, {
        status: 429,
        headers: value === null ? {} : { 'retry-after': value },
      });
    expect(retryAfterSecondsOf(answer('30'))).toBe(30);
    expect(retryAfterSecondsOf(answer('0'))).toBe(0);
    expect(retryAfterSecondsOf(answer('Wed, 21 Oct 2026 07:28:00 GMT'))).toBeNull();
    expect(retryAfterSecondsOf(answer('-5'))).toBeNull();
    expect(retryAfterSecondsOf(answer('1.5'))).toBeNull();
    expect(retryAfterSecondsOf(answer(null))).toBeNull();
  });
});

import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

import { consumeTestingReset } from './testing-reset';

const windows: JSDOM[] = [];
afterEach(() => {
  for (const browser of windows.splice(0)) browser.window.close();
});

function browser(url: string) {
  const page = new JSDOM('<div id="root"></div>', { url });
  windows.push(page);
  return page.window;
}

const token = 'c'.repeat(64);

test('normal startup keeps its URL and makes no reset request', () => {
  const page = browser('https://dev.app.puni.dev/#request');
  let calls = 0;
  expect(
    consumeTestingReset(page, () => {
      calls += 1;
      return Promise.resolve();
    }),
  ).toBeNull();
  expect(calls).toBe(0);
  expect(page.location.hash).toBe('#request');
});

test('reset consumes the fragment synchronously before its network request', async () => {
  const page = browser(`https://dev.app.puni.dev/?keep=1#test-reset=${token}`);
  const received: string[] = [];
  const reset = consumeTestingReset(page, (secret) => {
    expect(page.location.href).toBe('https://dev.app.puni.dev/?keep=1');
    received.push(secret);
    return Promise.resolve();
  });
  expect(page.location.hash).toBe('');
  await reset;
  expect(received).toEqual([token]);
});

test('malformed reset fragments are scrubbed and refused without a request', async () => {
  const page = browser('https://dev.app.puni.dev/#test-reset=short');
  let calls = 0;
  const reset = consumeTestingReset(page, () => {
    calls += 1;
    return Promise.resolve();
  });
  expect(page.location.hash).toBe('');
  const failure = await rejectedReset(reset);
  expect(failure.message).toContain('testing reset');
  expect(calls).toBe(0);
});

test('production fragments are scrubbed without sending the operator token', async () => {
  const page = browser(`https://app.puni.dev/#test-reset=${token}`);
  let calls = 0;
  const reset = consumeTestingReset(page, () => {
    calls += 1;
    return Promise.resolve();
  });
  expect((await rejectedReset(reset)).message).toContain('preview');
  expect(page.location.hash).toBe('');
  expect(calls).toBe(0);
});

test('reset network errors expose no secret or transport details', async () => {
  const page = browser(`https://dev.app.puni.dev/#test-reset=${token}`);
  const reset = consumeTestingReset(page, () =>
    Promise.reject(new Error(`transport secret ${token}`)),
  );
  const failure = await rejectedReset(reset);
  expect(failure.message).toContain('testing reset');
  expect(failure.message).not.toContain(token);
  expect(page.location.hash).toBe('');
});

async function rejectedReset(reset: Promise<void> | null): Promise<Error> {
  if (reset === null) throw new Error('Expected a reset request');
  const failure: unknown = await reset.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('Expected a rejected reset');
  return failure;
}

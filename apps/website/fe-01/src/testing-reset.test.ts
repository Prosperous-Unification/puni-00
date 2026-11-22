import { afterEach, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';

import * as testingReset from './testing-reset';

const { consumeTestingReset } = testingReset;

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

for (const origin of ['https://dev.app.puni.dev', 'https://dev.request.puni.dev']) {
  test(`reset consumes the ${origin} fragment before its network request`, async () => {
    const page = browser(`${origin}/?keep=1#test-reset=${token}`);
    const received: string[] = [];
    const reset = consumeTestingReset(page, (secret) => {
      expect(page.location.href).toBe(`${origin}/?keep=1`);
      received.push(secret);
      return Promise.resolve();
    });
    expect(page.location.hash).toBe('');
    await reset;
    expect(received).toEqual([token]);
  });
}

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

for (const origin of [
  'https://app.puni.dev',
  'https://request.puni.dev',
  'https://dev.request.puni.dev.evil.example',
]) {
  test(`${origin} fragments are scrubbed without sending the operator token`, async () => {
    const page = browser(`${origin}/#test-reset=${token}`);
    let calls = 0;
    const reset = consumeTestingReset(page, () => {
      calls += 1;
      return Promise.resolve();
    });
    expect((await rejectedReset(reset)).message).toContain('preview');
    expect(page.location.hash).toBe('');
    expect(calls).toBe(0);
  });
}

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

test('same-document reset navigation scrubs before dispatch and remounts after each successful reset', async () => {
  const page = browser('https://dev.request.puni.dev/');
  const secrets: string[] = [];
  let remounts = 0;
  const failures: unknown[] = [];
  const unbind = testingReset.bindTestingReset(
    page,
    (secret) => {
      expect(page.location.hash).toBe('');
      secrets.push(secret);
      return Promise.resolve();
    },
    () => {
      remounts += 1;
    },
    (failure) => {
      failures.push(failure);
    },
  );
  try {
    for (const count of [1, 2]) {
      const changed = new Promise<void>((resolve) => {
        page.addEventListener(
          'hashchange',
          () => {
            resolve();
          },
          { once: true },
        );
      });
      page.location.hash = `test-reset=${token}`;
      await changed;
      await Promise.resolve();
      expect(secrets).toEqual(Array.from({ length: count }, () => token));
      expect(remounts).toBe(count);
      expect(page.location.hash).toBe('');
    }
    expect(failures).toEqual([]);
  } finally {
    unbind();
  }
});

test('ordinary hash navigation and an unbound observer never request a reset or remount', async () => {
  const page = browser('https://dev.request.puni.dev/');
  const errors: string[] = [];
  page.addEventListener('error', (event) => {
    errors.push(event.message);
  });
  let requests = 0;
  let remounts = 0;
  const unbind = testingReset.bindTestingReset(
    page,
    () => {
      requests += 1;
      return Promise.resolve();
    },
    () => {
      remounts += 1;
    },
    (failure) => {
      throw failure;
    },
  );
  try {
    const changed = new Promise<void>((resolve) => {
      page.addEventListener(
        'hashchange',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    page.location.hash = 'request';
    await changed;
    expect(requests).toBe(0);
    expect(remounts).toBe(0);
    expect(page.location.hash).toBe('#request');
    expect(errors).toEqual([]);
    unbind();
    const stopped = new Promise<void>((resolve) => {
      page.addEventListener(
        'hashchange',
        () => {
          resolve();
        },
        { once: true },
      );
    });
    page.location.hash = `test-reset=${token}`;
    await stopped;
    expect(requests).toBe(0);
    expect(remounts).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    unbind();
  }
});

test('a same-document reset failure is sanitized without a successful remount', async () => {
  const page = browser('https://dev.request.puni.dev/');
  let remounts = 0;
  let receiveFailure: (failure: unknown) => void = () => {
    throw new Error('Missing failure receiver');
  };
  const failed = new Promise<unknown>((resolve) => {
    receiveFailure = resolve;
  });
  const unbind = testingReset.bindTestingReset(
    page,
    () => Promise.reject(new Error(`transport ${token}`)),
    () => {
      remounts += 1;
    },
    receiveFailure,
  );
  try {
    page.location.hash = `test-reset=${token}`;
    const failure = await failed;
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) throw new Error('Reset failure must be an Error');
    expect(failure.message).toContain('testing reset');
    expect(failure.message).not.toContain(token);
    expect(page.location.hash).toBe('');
    expect(remounts).toBe(0);
  } finally {
    unbind();
  }
});

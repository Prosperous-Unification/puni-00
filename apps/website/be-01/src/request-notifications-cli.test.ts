import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WebsiteStore } from '@website/store-sqlite';
import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(count = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'puni-notification-command-'));
  directories.push(directory);
  const path = join(directory, 'website.sqlite');
  const store = new WebsiteStore(path);
  for (let offset = 0; offset < count; offset++) {
    store.createDraft(
      `draft-${String(offset)}`,
      'Confidential visitor description',
      `claim-${String(offset)}`,
      100,
      1000,
      `source-${String(offset)}`,
    );
    expect(
      store.submit(
        `claim-${String(offset)}`,
        `key-${String(offset)}`,
        'hash',
        `private-${String(offset)}@example.test`,
        'Confidential brief',
        `private-receipt-${String(offset)}`,
        150,
        `source-${String(offset)}`,
      ).kind,
    ).toBe('created');
  }
  store.close();
  return { directory, path };
}

const environment = {
  REQUEST_WEBHOOK_URL: 'https://notifications.example.test/private-target',
  APP_ORIGIN: 'https://request.puni.dev',
};

test('delivery accepts only after receiver success and sends identifiers and inbox URL without prospect content', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture();
  const database = new Database(path);
  const submission = database.query<{ id: string }, []>('SELECT id FROM proposal_submission').get();
  if (!submission) throw new Error('Expected submission');
  try {
    const observed: string[] = [];
    expect(
      await runRequestNotifications(
        path,
        environment,
        (url, init) => {
          expect(url).toBe('https://notifications.example.test/private-target');
          expect(init.method).toBe('POST');
          expect(init.redirect).toBe('error');
          expect(init.signal).toBeInstanceOf(AbortSignal);
          expect(database.query('SELECT delivered_at FROM request_notification').get()).toEqual({
            delivered_at: null,
          });
          if (typeof init.body !== 'string') throw new Error('Expected text payload');
          observed.push(init.body);
          return new Response('{}', { status: 200 });
        },
        () => 200,
      ),
    ).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
    expect(observed).toEqual([
      `New PUNI proposal request: ${submission.id}\nReview: https://request.puni.dev/operator`,
    ]);
    expect(observed.join('')).not.toMatch(/Confidential|private-|@example|claim|receipt/);
    expect(database.query('SELECT attempts, delivered_at FROM request_notification').get()).toEqual(
      { attempts: 1, delivered_at: 200 },
    );
    expect(
      await runRequestNotifications(
        path,
        environment,
        () => {
          throw new Error('Already delivered');
        },
        () => 300,
      ),
    ).toEqual({ accepted: 0, failed: 0, cancelled: 0 });
  } finally {
    database.close();
  }
});

test.each(['http', 'network'] as const)(
  'receiver %s failure survives reopen and retries only when due',
  async (failure) => {
    const { runRequestNotifications } = await import('./request-notifications-cli');
    const { path } = fixture();
    expect(
      await runRequestNotifications(
        path,
        environment,
        () => {
          if (failure === 'network') throw new TypeError('secret transport diagnostics');
          return new Response('secret provider diagnostics', { status: 503 });
        },
        () => 200,
      ),
    ).toEqual({ accepted: 0, failed: 1, cancelled: 0 });
    expect(
      await runRequestNotifications(
        path,
        environment,
        () => {
          throw new Error('Must respect retry delay');
        },
        () => 60_199,
      ),
    ).toEqual({ accepted: 0, failed: 0, cancelled: 0 });
    expect(
      await runRequestNotifications(
        path,
        environment,
        () => new Response('{}'),
        () => 60_200,
      ),
    ).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
  },
);

test('a silent receiver reaches the actual deadline and leaves a retryable obligation', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture();
  const started = Date.now();
  expect(
    await runRequestNotifications(
      path,
      environment,
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (!signal) throw new Error('No deadline');
          signal.addEventListener(
            'abort',
            () => {
              const reason: unknown = signal.reason;
              reject(reason instanceof Error ? reason : new Error('Unexpected cancellation'));
            },
            { once: true },
          );
        }),
      () => 200,
    ),
  ).toEqual({ accepted: 0, failed: 1, cancelled: 0 });
  expect(Date.now() - started).toBeGreaterThanOrEqual(9_900);
  expect(Date.now() - started).toBeLessThan(15_000);
}, 16_000);

test('each invocation is bounded to twenty sends and leaves the rest due', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture(21);
  expect(
    await runRequestNotifications(
      path,
      environment,
      () => new Response('{}'),
      () => 200,
    ),
  ).toEqual({ accepted: 20, failed: 0, cancelled: 0 });
  expect(
    await runRequestNotifications(
      path,
      environment,
      () => new Response('{}'),
      () => 201,
    ),
  ).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
});

test('invalid configuration refuses before database creation or delivery without exposing the webhook', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { directory } = fixture(0);
  const missing = join(directory, 'must-not-exist.sqlite');
  for (const settings of [
    {},
    { ...environment, REQUEST_WEBHOOK_URL: '' },
    { ...environment, REQUEST_WEBHOOK_URL: 'http://secret.example.test/private-target' },
    { ...environment, REQUEST_WEBHOOK_URL: 'not-an-https-url' },
    { ...environment, REQUEST_WEBHOOK_URL: 'https://user:secret@example.test/private-target' },
    { ...environment, REQUEST_WEBHOOK_URL: 'https://example.test/private-target#secret' },
    { ...environment, APP_ORIGIN: undefined },
    { ...environment, APP_ORIGIN: 'https://request.puni.dev.evil.test' },
    { ...environment, APP_ORIGIN: 'https://request.puni.dev/path' },
  ]) {
    expect(
      runRequestNotifications(missing, settings, () => {
        throw new Error('Must not send');
      }),
    ).rejects.toThrow(/REQUEST_WEBHOOK_URL|APP_ORIGIN/);
    expect(existsSync(missing)).toBe(false);
  }
});

test('missing database and malformed current schema refuse without any delivery', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { directory, path } = fixture();
  expect(runRequestNotifications(join(directory, 'missing.sqlite'), environment)).rejects.toThrow();
  const database = new Database(path);
  database.run('DROP TRIGGER request_notification_insert');
  database.close();
  expect(
    runRequestNotifications(path, environment, () => {
      throw new Error('Must verify schema first');
    }),
  ).rejects.toThrow('current website schema');
});

test('command rejects missing arguments without exposing configuration', async () => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'request-notifications-cli.ts')],
    { env: { ...process.env, ...environment }, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(await child.exited).toBe(1);
  const stderr = await new Response(child.stderr).text();
  expect(stderr).toContain('Usage: request-notifications DATABASE');
  expect(stderr).not.toContain('private-target');
});

test('development notifications link to the development inbox', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture();
  expect(
    await runRequestNotifications(
      path,
      { ...environment, APP_ORIGIN: 'https://dev.request.puni.dev' },
      (_url, init) => {
        expect(init.body).toContain('Review: https://dev.request.puni.dev/operator');
        return new Response('{}');
      },
      () => 200,
    ),
  ).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
});

test('overlapping workers do not deliver the same live lease', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture();
  let finish: ((response: Response) => void) | undefined;
  const first = runRequestNotifications(
    path,
    environment,
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    () => 200,
  );
  expect(
    await runRequestNotifications(
      path,
      environment,
      () => {
        throw new Error('Cannot duplicate live lease');
      },
      () => 201,
    ),
  ).toEqual({ accepted: 0, failed: 0, cancelled: 0 });
  if (!finish) throw new Error('First delivery did not start');
  finish(new Response('{}'));
  expect(await first).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
});

test('erasure during a send returns cancellation and cannot recreate the queue row', async () => {
  const { runRequestNotifications } = await import('./request-notifications-cli');
  const { path } = fixture();
  expect(
    await runRequestNotifications(
      path,
      environment,
      () => {
        const database = new Database(path);
        database.run("UPDATE proposal_submission SET email = '', brief = ''");
        database.close();
        return new Response('{}');
      },
      () => 200,
    ),
  ).toEqual({ accepted: 0, failed: 0, cancelled: 1 });
});

test.each(['accepted', 'failed', 'defect'] as const)(
  'actual command %s exit and diagnostics reflect durable state without secret errors',
  async (outcome) => {
    const { directory, path } = fixture();
    const preload = join(directory, 'transport.mjs');
    writeFileSync(
      preload,
      outcome === 'defect'
        ? "globalThis.fetch = () => { throw new Error('https://notifications.example.test/private-target'); };"
        : `globalThis.fetch = () => new Response('{}', { status: ${outcome === 'accepted' ? '200' : '503'} });`,
    );
    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        preload,
        join(import.meta.dir, 'request-notifications-cli.ts'),
        path,
      ],
      { env: { ...process.env, ...environment }, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(await child.exited).toBe(outcome === 'accepted' ? 0 : 1);
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(stdout + stderr).not.toContain('private-target');
    const database = new Database(path);
    try {
      const persisted = database
        .query<
          {
            attempts: number;
            delivered_at: number | null;
            lease_token: string | null;
            available_at: number;
          },
          []
        >('SELECT attempts, delivered_at, lease_token, available_at FROM request_notification')
        .get();
      expect(persisted?.attempts).toBe(1);
      if (outcome === 'accepted') {
        expect(persisted?.delivered_at).toBeNumber();
        expect(JSON.parse(stdout)).toEqual({
          event: 'request_notifications',
          accepted: 1,
          failed: 0,
          cancelled: 0,
        });
      } else {
        expect(persisted?.delivered_at).toBeNull();
        if (outcome === 'failed') {
          expect(persisted?.lease_token).toBeNull();
          expect(JSON.parse(stdout)).toEqual({
            event: 'request_notifications',
            accepted: 0,
            failed: 1,
            cancelled: 0,
          });
        } else {
          expect(persisted?.lease_token).toBeString();
          expect(stderr).toContain('Request notification command failed');
        }
      }
    } finally {
      database.close();
    }
  },
);

test.each([201, 503, 302])(
  'actual HTTPS receiver status %i controls durable acknowledgement without following redirects',
  async (status) => {
    const { directory, path } = fixture();
    const keyPath = join(directory, 'receiver.key');
    const certificatePath = join(directory, 'receiver.crt');
    const certificate = Bun.spawnSync(
      [
        'openssl',
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certificatePath,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(certificate.exitCode).toBe(0);
    const received: string[] = [];
    let redirects = 0;
    const receiver = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      tls: { key: Bun.file(keyPath), cert: Bun.file(certificatePath) },
      fetch: async (request) => {
        if (new URL(request.url).pathname === '/must-not-follow') redirects++;
        expect(request.method).toBe('POST');
        expect(request.headers.get('title')).toBe('PUNI: new proposal request');
        received.push(await request.text());
        return new Response('{}', {
          status,
          headers: { Location: new URL('/must-not-follow', request.url).href },
        });
      },
    });
    try {
      const child = Bun.spawn(
        [
          process.execPath,
          process.env['PUNI_NOTIFICATION_PACKAGE_CLI'] ??
            join(import.meta.dir, 'request-notifications-cli.ts'),
          path,
        ],
        {
          env: {
            ...process.env,
            APP_ORIGIN: 'https://request.puni.dev',
            REQUEST_WEBHOOK_URL: `https://127.0.0.1:${String(receiver.port)}/topic-secret`,
            NODE_EXTRA_CA_CERTS: certificatePath,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      expect(await child.exited).toBe(status === 201 ? 0 : 1);
      const stdout = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      expect(stdout + stderr).not.toContain('topic-secret');
      expect(JSON.parse(stdout)).toEqual({
        event: 'request_notifications',
        accepted: status === 201 ? 1 : 0,
        failed: status === 201 ? 0 : 1,
        cancelled: 0,
      });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatch(
        /^New PUNI proposal request: [0-9a-f-]{36}\nReview: https:\/\/request\.puni\.dev\/operator$/,
      );
      expect(redirects).toBe(0);
      const database = new Database(path);
      try {
        const persisted = database
          .query<{ delivered_at: number | null }, []>(
            'SELECT delivered_at FROM request_notification',
          )
          .get();
        if (status === 201) expect(persisted?.delivered_at).toBeNumber();
        else expect(persisted?.delivered_at).toBeNull();
      } finally {
        database.close();
      }
    } finally {
      await receiver.stop(true);
    }
  },
);

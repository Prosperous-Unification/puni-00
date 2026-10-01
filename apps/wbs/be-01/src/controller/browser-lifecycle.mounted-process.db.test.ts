import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SqliteBrowserAuthLifecycle } from '@wbs/store-sqlite';
import { afterEach, expect, test } from 'bun:test';
import { decodeJwt, SignJWT } from 'jose';

import { openConnection, openDatabase } from '../repository/db';
import { OPEN } from '../repository/gate';
import { runMigrations } from '../repository/migrate';

const migrations = new URL('../../drizzle', import.meta.url).pathname;
const workerFile = new URL('../testing/browser-lifecycle-mounted.worker.ts', import.meta.url)
  .pathname;
const origin = 'https://dev.wbs.test';
const key = new TextEncoder().encode('mounted-browser-lifecycle-oidc-signing-key');

interface Reply {
  readonly id?: number;
  readonly kind?: string;
  readonly status?: number;
  readonly body?: string | null;
  readonly setCookie?: string | null;
  readonly providerCalls?: number;
  readonly providerRevokes?: number;
  readonly error?: string;
  readonly phase?: 'provider' | 'install';
}

class MountedWorker {
  private nextId = 1;
  private readonly queued = new Map<number, (reply: Reply) => void>();
  private readonly events: Reply[] = [];
  private eventWake: (() => void) | undefined;
  private readonly output: Promise<void>;
  private readonly errors: Promise<string>;
  private ready: (reply: Reply) => void = () => undefined;
  private readonly readyFrame = new Promise<Reply>((resolve) => {
    this.ready = resolve;
  });
  private stderr = '';
  readonly child: Bun.Subprocess<'pipe', 'pipe', 'pipe'>;

  private closed = false;

  constructor(path: string, mode?: 'early-exit' | 'hold-ready' | 'ignore-term' | 'output-error') {
    this.child = Bun.spawn(
      [process.execPath, workerFile, path, ...(mode === undefined ? [] : [mode])],
      {
        cwd: new URL('../../', import.meta.url).pathname,
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    this.output = this.readFrames().then(() => {
      if (mode === 'output-error') throw new Error('injected stdout drain failure');
    });
    this.errors = new Response(this.child.stderr).text().then((stderr) => {
      this.stderr = stderr;
      return stderr;
    });
  }

  private async readFrames(): Promise<void> {
    let buffered = '';
    const decoder = new TextDecoder();
    for await (const chunk of this.child.stdout) {
      buffered += decoder.decode(chunk, { stream: true });
      for (;;) {
        const separator = buffered.indexOf('\n');
        if (separator < 0) break;
        const line = buffered.slice(0, separator);
        buffered = buffered.slice(separator + 1);
        if (line.length === 0) continue;
        const reply = JSON.parse(line) as Reply;
        if (reply.kind === 'ready') this.ready(reply);
        else if (reply.id !== undefined) this.queued.get(reply.id)?.(reply);
        else {
          this.events.push(reply);
          this.eventWake?.();
        }
      }
    }
    buffered += decoder.decode();
    if (buffered.length > 0) throw new Error(`worker emitted an incomplete frame: ${buffered}`);
  }

  private async bounded<T>(pending: Promise<T>, label: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        // Proof: disabling this exit race made the injected startup exit wait
        // for the 10 s deadline instead of reporting code 27 and stderr (0/1).
        this.child.exited.then(async (code) => {
          throw new Error(`${label}: worker exited ${String(code)}; ${await this.errors}`);
        }),
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error(`${label}: worker deadline; ${this.stderr}`));
          }, 10_000);
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }

  async start(): Promise<void> {
    await this.bounded(this.readyFrame, 'ready');
  }

  async send(frame: Record<string, unknown>): Promise<Reply> {
    const id = this.nextId++;
    const pending = new Promise<Reply>((resolve) => this.queued.set(id, resolve));
    await this.child.stdin.write(`${JSON.stringify({ id, ...frame })}\n`);
    await this.child.stdin.flush();
    const reply = await this.bounded(pending, `reply ${String(id)}`);
    this.queued.delete(id);
    if (reply.error !== undefined) throw new Error(`worker request: ${reply.error}`);
    return reply;
  }

  async probeFraming(invalidSecond = false): Promise<void> {
    const firstId = this.nextId++;
    const secondId = this.nextId++;
    const first = new Promise<Reply>((resolve) => this.queued.set(firstId, resolve));
    const second = new Promise<Reply>((resolve) => this.queued.set(secondId, resolve));
    const firstLine = `${JSON.stringify({ id: firstId, kind: 'configure-refresh', accessToken: 'a', nextRefreshToken: 'r' })}\n`;
    const secondLine = `${JSON.stringify({ id: secondId, kind: 'configure-refresh', accessToken: 'b', ...(invalidSecond ? {} : { nextRefreshToken: 's' }) })}\n`;
    await this.child.stdin.write(firstLine.slice(0, 8));
    await this.child.stdin.flush();
    await this.child.stdin.write(firstLine.slice(8) + secondLine);
    await this.child.stdin.flush();
    const replies = await this.bounded(Promise.all([first, second]), 'split and coalesced frames');
    this.queued.delete(firstId);
    this.queued.delete(secondId);
    if (
      replies[0].id !== firstId ||
      replies[1].id !== secondId ||
      replies[0].error !== undefined ||
      replies[1].error !== undefined
    )
      throw new Error('worker did not preserve both framed replies');
  }

  async waitEvent(phase: 'provider' | 'install'): Promise<void> {
    for (;;) {
      const next = this.events.shift();
      if (next !== undefined) {
        if (next.kind !== 'barrier' || next.phase !== phase)
          throw new Error(`worker emitted unexpected event ${JSON.stringify(next)}`);
        return;
      }
      await this.bounded(
        new Promise<void>((resolve) => {
          this.eventWake = resolve;
        }),
        `barrier ${phase}`,
      );
      this.eventWake = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    const joined = Promise.allSettled([this.child.exited, this.output, this.errors]);
    const within = async (duration: number): Promise<boolean> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          joined.then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => {
              resolve(false);
            }, duration);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    };
    this.child.kill('SIGTERM');
    if (!(await within(1_000))) {
      this.child.kill('SIGKILL');
      if (!(await within(5_000))) throw new Error('mounted worker did not reap after SIGKILL');
    }
    const drained = await joined;
    this.closed = true;
    for (const settled of drained) if (settled.status === 'rejected') throw settled.reason;
  }
}

let dir: string | undefined;
const workers: MountedWorker[] = [];
async function cleanupWorkers(
  active: readonly MountedWorker[],
  directory: string | undefined,
  stop: (worker: MountedWorker, index: number) => Promise<void> = (worker) => worker.close(),
  beforeRemove: () => void = () => undefined,
): Promise<void> {
  // Proof: Promise.all rejected on the first injected drain failure and the
  // former finally block removed SQLite while a sibling still awaited reap.
  const outcomes = await Promise.allSettled(active.map(stop));
  const reaped = await Promise.allSettled(active.map((worker) => worker.close()));
  const incomplete = reaped.filter((settled) => settled.status === 'rejected');
  if (incomplete.length > 0)
    throw new AggregateError(
      incomplete.map((settled): unknown => {
        const reason: unknown = settled.reason;
        return reason;
      }),
      'worker cleanup could not finish',
    );
  beforeRemove();
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  const failed = outcomes.filter((settled) => settled.status === 'rejected');
  if (failed.length > 0)
    throw new AggregateError(
      failed.map((settled): unknown => {
        const reason: unknown = settled.reason;
        return reason;
      }),
      'worker cleanup reported a fault',
    );
}

afterEach(async () => {
  const directory = dir;
  dir = undefined;
  await cleanupWorkers(workers.splice(0), directory);
});

async function openWorker(
  path: string,
  mode?: 'early-exit' | 'hold-ready' | 'ignore-term' | 'output-error',
): Promise<MountedWorker> {
  const worker = new MountedWorker(path, mode);
  workers.push(worker);
  await worker.start();
  return worker;
}

async function signed(subject: string, expires = '5m'): Promise<string> {
  return new SignJWT({
    email: `${subject}@puni.test`,
    email_verified: true,
    wbs_groups: ['dev:wbs:read', 'dev:wbs:write'],
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('https://idp.test')
    .setAudience('api://wbs')
    .setSubject(subject)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(key);
}

function seedAccounts(sqlite: ReturnType<typeof openDatabase>): void {
  sqlite.run(
    "INSERT INTO users (id, username, password_hash, idp_issuer, idp_sub, created_at) VALUES ('ada', 'ada', NULL, 'https://idp.test', 'ada', 1), ('bob', 'bob', NULL, 'https://idp.test', 'bob', 1)",
  );
  sqlite.run(
    "INSERT INTO external_identity (id, user_id, issuer, subject, created_at) VALUES ('ea', 'ada', 'https://idp.test', 'ada', 1), ('eb', 'bob', 'https://idp.test', 'bob', 1)",
  );
  sqlite.run("INSERT INTO organization (id, name, created_at) VALUES ('org-a', 'org-a', 1)");
  sqlite.run(
    "INSERT INTO organization_membership (organization_id, user_id, role, created_at) VALUES ('org-a', 'ada', 'member', 1), ('org-a', 'bob', 'member', 1)",
  );
  sqlite.run(
    "UPDATE organization_activation SET state = 'activated', activated_at = 5 WHERE singleton = 1",
  );
}

function oidcCredential(token: string, userId = 'ada') {
  const expiresAt = (decodeJwt(token).exp ?? 0) * 1000;
  if (expiresAt === 0) throw new Error('signed test credential lacks expiry');
  return {
    kind: 'oidc' as const,
    userId,
    digest: createHash('sha256').update(token).digest('hex'),
    expiresAt,
  };
}

async function withLifecycle<T>(
  path: string,
  work: (lifecycle: SqliteBrowserAuthLifecycle) => Promise<T>,
): Promise<T> {
  const connection = openConnection(path);
  try {
    return await work(new SqliteBrowserAuthLifecycle(connection.db, OPEN));
  } finally {
    connection.close();
  }
}

test('mounted worker protocol buffers split and coalesced frames and fails promptly on child exit', async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-protocol-'));
  const path = join(dir, 'shared.db');
  runMigrations(path, migrations);
  const early = new MountedWorker(path, 'early-exit');
  workers.push(early);
  await early.start().then(
    () => {
      throw new Error('early worker unexpectedly became ready');
    },
    (cause: unknown) => {
      expect(cause).toBeInstanceOf(Error);
      expect(String(cause)).toContain('worker exited 27; injected worker startup exit');
    },
  );
  const delayed = new MountedWorker(path, 'hold-ready');
  workers.push(delayed);
  let ready = false;
  const pending = delayed.start().then(() => {
    ready = true;
  });
  await delayed.send({
    kind: 'configure-refresh',
    accessToken: 'control',
    nextRefreshToken: 'control',
  });
  // Proof: early ready emission before the child-progress acknowledgment made
  // this false expectation fail; one parent microtask did not prove startup.
  expect(ready).toBe(false);
  await delayed.send({ kind: 'release-ready' });
  await pending;
  expect(ready).toBe(true);
  await delayed.probeFraming();
  await delayed.probeFraming(true).then(
    () => {
      throw new Error('error reply was treated as a successful frame');
    },
    (cause: unknown) => {
      expect(String(cause)).toContain('worker did not preserve both framed replies');
    },
  );
});

test('cleanup joins every worker before removing SQLite when one output drain fails', async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-cleanup-'));
  const path = join(dir, 'shared.db');
  runMigrations(path, migrations);
  const faulty = await openWorker(path, 'output-error');
  const stubborn = await openWorker(path, 'ignore-term');
  let releaseSibling: (() => void) | undefined;
  const siblingHold = new Promise<void>((resolve) => {
    releaseSibling = resolve;
  });
  let firstFinished: (() => void) | undefined;
  const firstClose = new Promise<void>((resolve) => {
    firstFinished = resolve;
  });
  let siblingClosed = false;
  const cleanup = cleanupWorkers(
    [faulty, stubborn],
    dir,
    (worker, index) =>
      index === 0
        ? worker.close().finally(() => {
            firstFinished?.();
          })
        : siblingHold.then(async () => {
            await worker.close();
            siblingClosed = true;
          }),
    () => {
      expect(siblingClosed).toBe(true);
      expect(existsSync(path)).toBe(true);
    },
  );
  await firstClose;
  // Proof: the prior Promise.all/finally cleanup removed SQLite as soon as
  // faulty's drain rejected, while stubborn still awaited its release.
  expect(existsSync(path)).toBe(true);
  releaseSibling?.();
  await cleanup.then(
    () => {
      throw new Error('injected output failure was lost');
    },
    (cause: unknown) => {
      expect(String(cause)).toContain('worker cleanup reported a fault');
    },
  );
  expect(existsSync(path)).toBe(false);
  expect(await faulty.child.exited).toBeDefined();
  expect(await stubborn.child.exited).toBe(137);
});

function request(path: string, token: string, marker?: string, correlation?: string) {
  const cookie = `__Host-wbs_access=${token}${marker === undefined ? '' : `; ${marker}`}${correlation === undefined ? '' : `; __Host-wbs_session=${correlation}`}`;
  const post =
    path === '/api/auth/logout' ||
    path === '/api/auth/refresh' ||
    path === '/api/organization/active';
  return {
    kind: 'request',
    method: post ? 'POST' : 'GET',
    path,
    headers: {
      cookie,
      ...(post ? { origin } : {}),
      ...(path === '/api/organization/active' ? { 'content-type': 'application/json' } : {}),
    },
    ...(path === '/api/organization/active' ? { body: { organizationId: 'org-a' } } : {}),
  };
}

test('logout in another mounted process denies an old intact selected OIDC pair while independent sessions remain live', async () => {
  dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-lifecycle-'));
  const path = join(dir, 'shared.db');
  runMigrations(path, migrations);
  const sqlite = openDatabase(path);
  const access = await signed('ada');
  const independent = await signed('ada');
  const other = await signed('bob');
  const credential = oidcCredential(access);
  try {
    seedAccounts(sqlite);
    await withLifecycle(path, (lifecycle) => lifecycle.open('correlation-a', credential));
    const first = await openWorker(path);
    const second = await openWorker(path);
    await first.send({
      kind: 'seed',
      correlation: 'correlation-a',
      refreshToken: 'refresh-a',
      userId: 'ada',
      generation: 1,
      credential,
    });
    const selected = await first.send(request('/api/organization/active', access));
    expect(selected.status).toBe(200);
    const marker = selected.setCookie?.split(';')[0];
    if (marker === undefined) throw new Error('selection did not issue a marker');
    expect((await second.send(request('/api/projects', access, marker))).status).toBe(200);
    const independentSelected = await second.send(request('/api/organization/active', independent));
    const independentMarker = independentSelected.setCookie?.split(';')[0];
    if (independentMarker === undefined) throw new Error('independent session did not select');
    const otherSelected = await second.send(request('/api/organization/active', other));
    const otherMarker = otherSelected.setCookie?.split(';')[0];
    if (otherMarker === undefined) throw new Error('other user did not select');
    expect(
      (await second.send(request('/api/auth/logout', access, undefined, 'correlation-a'))).status,
    ).toBe(204);
    // Proof: bypassing the shared revocation lookup in mounted organization
    // access makes this old full pair answer 200 in a different process.
    const refused = await first.send(request('/api/projects', access, marker));
    expect(refused).toMatchObject({ status: 403, body: '{"error":"no_active_organization"}' });
    const warmedRefusal = await second.send(request('/api/projects', access, marker));
    expect(warmedRefusal).toMatchObject({
      status: 403,
      body: '{"error":"no_active_organization"}',
    });
    const fresh = await openWorker(path);
    expect((await fresh.send(request('/api/projects', access, marker))).status).toBe(403);
    expect((await first.send(request('/api/organization/memberships', access))).status).toBe(401);
    const reselection = await fresh.send(request('/api/organization/active', access));
    expect(reselection.status).toBe(401);
    expect(reselection.setCookie).toBeNull();
    expect(
      (await first.send(request('/api/projects', independent, independentMarker))).status,
    ).toBe(200);
    expect((await fresh.send(request('/api/projects', other, otherMarker))).status).toBe(200);
  } finally {
    sqlite.close();
  }
});

for (const expires of ['5m', '-1s']) {
  test(`a fresh process refuses refresh without local secret but accepts exact ${expires === '5m' ? 'current' : 'expired historical'} logout idempotently`, async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-restart-'));
    const path = join(dir, 'shared.db');
    runMigrations(path, migrations);
    const sqlite = openDatabase(path);
    try {
      seedAccounts(sqlite);
      const access = await signed('ada', expires);
      const successorAccess = await signed('ada');
      const other = await signed('ada');
      const credential = oidcCredential(access);
      await withLifecycle(path, (lifecycle) => lifecycle.open('lost-process', credential));
      const owner = await openWorker(path);
      await owner.send({
        kind: 'seed',
        correlation: 'lost-process',
        refreshToken: 'owned-refresh-secret',
        userId: 'ada',
        generation: 1,
        credential,
      });
      await owner.send({
        kind: 'configure-refresh',
        accessToken: successorAccess,
        nextRefreshToken: 'next-owned-secret',
      });
      const issued = await owner.send(
        request('/api/auth/refresh', access, undefined, 'lost-process'),
      );
      expect(issued).toMatchObject({ status: 204, providerCalls: 1 });
      expect(issued.setCookie).toContain(`__Host-wbs_access=${successorAccess}`);
      expect(
        (await withLifecycle(path, (lifecycle) => lifecycle.generation('lost-process'))).generation,
      ).toBe(2);
      await owner.close();
      expect(await owner.child.exited).toBeDefined();
      const worker = await openWorker(path);
      const refresh = await worker.send(
        request('/api/auth/refresh', successorAccess, undefined, 'lost-process'),
      );
      // Proof: a restarted process must not infer a provider secret from the
      // durable lifecycle. Removing the process-local read makes this reach
      // provider IO instead of returning 401 with zero provider calls.
      expect(refresh).toMatchObject({ status: 401, providerCalls: 0 });
      const independentSelected = await worker.send(request('/api/organization/active', other));
      const independentMarker = independentSelected.setCookie?.split(';')[0];
      if (independentMarker === undefined) throw new Error('independent session did not select');
      const wrong = await worker.send(
        request('/api/auth/logout', other, undefined, 'lost-process'),
      );
      expect(wrong.status).toBe(401);
      expect(
        (await worker.send(request('/api/auth/logout', access, undefined, 'foreign-correlation')))
          .status,
      ).toBe(401);
      const delegated = await new SignJWT({ wbs_groups: ['dev:wbs:read'] })
        .setProtectedHeader({ alg: 'HS256', typ: 'wbs-delegation+jwt' })
        .setIssuer('https://idp.test')
        .setAudience('api://wbs')
        .setSubject('ada')
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);
      expect(
        (await worker.send(request('/api/auth/logout', delegated, undefined, 'lost-process')))
          .status,
      ).toBe(401);
      expect(
        (await withLifecycle(path, (lifecycle) => lifecycle.generation('lost-process'))).generation,
      ).toBe(2);
      const closed = await worker.send(
        request('/api/auth/logout', access, undefined, 'lost-process'),
      );
      expect(closed).toMatchObject({ status: 204, providerCalls: 0 });
      expect(closed.setCookie).toContain('__Host-wbs_access=;');
      const historyBeforeRetry = sqlite
        .query('SELECT * FROM browser_auth_association ORDER BY session_digest, generation')
        .all();
      const revocationsBeforeRetry = sqlite
        .query('SELECT * FROM browser_credential_revocations ORDER BY credential_digest')
        .all();
      await worker.close();
      const fresh = await openWorker(path);
      const retry = await fresh.send(
        request('/api/auth/logout', access, undefined, 'lost-process'),
      );
      expect(retry).toMatchObject({ status: 204, providerCalls: 0 });
      expect(
        sqlite
          .query('SELECT * FROM browser_auth_association ORDER BY session_digest, generation')
          .all(),
      ).toEqual(historyBeforeRetry);
      expect(
        sqlite
          .query('SELECT * FROM browser_credential_revocations ORDER BY credential_digest')
          .all(),
      ).toEqual(revocationsBeforeRetry);
      expect((await fresh.send(request('/api/projects', other, independentMarker))).status).toBe(
        200,
      );
    } finally {
      sqlite.close();
    }
  });
}

for (const fault of ['missing', 'unreadable'] as const) {
  test(`a fresh mounted process fails closed when shared browser revocation authority is ${fault}`, async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-authority-'));
    const path = join(dir, 'shared.db');
    runMigrations(path, migrations);
    const sqlite = openDatabase(path);
    try {
      seedAccounts(sqlite);
      const access = await signed('ada');
      const credential = oidcCredential(access);
      await withLifecycle(path, (lifecycle) => lifecycle.open('authority-correlation', credential));
      const worker = await openWorker(path);
      const selected = await worker.send(request('/api/organization/active', access));
      expect(selected.status).toBe(200);
      const marker = selected.setCookie?.split(';')[0];
      if (marker === undefined) throw new Error('selection did not issue a marker');
      expect((await worker.send(request('/api/projects', access, marker))).status).toBe(200);
      if (fault === 'missing') sqlite.run('DROP TABLE browser_credential_revocations');
      else await worker.send({ kind: 'shadow-revocations' });
      const fresh = fault === 'missing' ? await openWorker(path) : worker;
      // Proof: swallowing the required authority read made membership and
      // selected-resource requests acknowledge a pair with unknown revocation
      // state; both missing and unreadable existing-table faults are distinct.
      expect((await fresh.send(request('/api/organization/memberships', access))).status).toBe(500);
      expect((await fresh.send(request('/api/projects', access, marker))).status).toBe(500);
      const logout = await fresh.send(
        request('/api/auth/logout', access, undefined, 'authority-correlation'),
      );
      expect(logout).toMatchObject({ status: 500, setCookie: null, providerRevokes: 0 });
      expect(
        sqlite.query("SELECT state FROM browser_auth_lifecycle WHERE user_id = 'ada'").get(),
      ).toEqual({ state: 'active' });
      const exists = sqlite
        .query("SELECT name FROM sqlite_master WHERE name = 'browser_credential_revocations'")
        .get();
      expect(exists === null || exists === undefined).toBe(fault === 'missing');
      if (fault === 'unreadable') {
        const unaffected = await openWorker(path);
        expect((await unaffected.send(request('/api/projects', access, marker))).status).toBe(200);
      }
    } finally {
      sqlite.close();
    }
  });
}

for (const nextSecret of ['same', 'rotated'] as const) {
  for (const winner of ['logout', 'refresh'] as const) {
    test(`${winner} wins a two-process OIDC refresh race with ${nextSecret} provider secret`, async () => {
      dir = mkdtempSync(join(tmpdir(), 'wbs-mounted-race-'));
      const path = join(dir, 'shared.db');
      runMigrations(path, migrations);
      const sqlite = openDatabase(path);
      try {
        seedAccounts(sqlite);
        const oldAccess = await signed('ada');
        const nextAccess = await signed('ada');
        const first = oidcCredential(oldAccess);
        await withLifecycle(path, (lifecycle) => lifecycle.open('race-correlation', first));
        const refresher = await openWorker(path);
        const closer = await openWorker(path);
        await refresher.send({
          kind: 'seed',
          correlation: 'race-correlation',
          refreshToken: 'refresh-a',
          userId: 'ada',
          generation: 1,
          credential: first,
        });
        const selected = await refresher.send(request('/api/organization/active', oldAccess));
        const oldMarker = selected.setCookie?.split(';')[0];
        if (oldMarker === undefined) throw new Error('old session did not select');
        await refresher.send({
          kind: 'configure-refresh',
          accessToken: nextAccess,
          nextRefreshToken: nextSecret === 'same' ? 'refresh-a' : 'refresh-b',
          hold: winner === 'logout' ? 'provider' : 'install',
        });
        const pending = refresher.send(
          request('/api/auth/refresh', oldAccess, undefined, 'race-correlation'),
        );
        await refresher.waitEvent(winner === 'logout' ? 'provider' : 'install');
        let nextMarker: string | undefined;
        if (winner === 'refresh') {
          const selectedNext = await closer.send(request('/api/organization/active', nextAccess));
          expect(selectedNext.status).toBe(200);
          nextMarker = selectedNext.setCookie?.split(';')[0];
          if (nextMarker === undefined) throw new Error('committed successor did not select');
          expect((await closer.send(request('/api/projects', nextAccess, nextMarker))).status).toBe(
            200,
          );
        }
        const logout = await closer.send(
          request('/api/auth/logout', oldAccess, undefined, 'race-correlation'),
        );
        expect(logout.status).toBe(204);
        await refresher.send({ kind: 'release-refresh' });
        const completed = await pending;
        if (winner === 'logout') {
          // Proof: letting a paused provider completion publish after shared
          // closure made the cross-process loser return 204/new cookie.
          expect(completed.status).toBe(401);
          expect(completed.setCookie).not.toContain(`__Host-wbs_access=${nextAccess}`);
          expect(
            sqlite.query('SELECT COUNT(*) AS total FROM browser_auth_association').get(),
          ).toEqual({ total: 1 });
        } else {
          if (completed.status === undefined) throw new Error('refresh returned no status');
          expect([204, 401]).toContain(completed.status);
          expect(
            sqlite.query('SELECT COUNT(*) AS total FROM browser_auth_association').get(),
          ).toEqual({ total: 2 });
          if (nextMarker === undefined) throw new Error('successor marker missing');
          // Proof: skipping close's current-successor B1 insert made this
          // complete selected pair answer 200 in A (0/1, 2026-10-01).
          // Another process cannot clear A's memory, so shared authority
          // must deny the pair across A, B and a fresh reader.
          expect(
            (await refresher.send(request('/api/projects', nextAccess, nextMarker))).status,
          ).toBe(403);
          expect((await closer.send(request('/api/projects', nextAccess, nextMarker))).status).toBe(
            403,
          );
          const fresh = await openWorker(path);
          expect((await fresh.send(request('/api/projects', nextAccess, nextMarker))).status).toBe(
            403,
          );
        }
        expect((await refresher.send(request('/api/projects', oldAccess, oldMarker))).status).toBe(
          403,
        );
        const after = await refresher.send(
          request('/api/auth/refresh', nextAccess, undefined, 'race-correlation'),
        );
        expect(after.status).toBe(401);
        expect(after.providerCalls).toBe(1);
      } finally {
        sqlite.close();
      }
    });
  }
}

import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import { TEST_JWT_KEY } from './auth-fixture';
import { BOOTED_INTERNAL_SECRET } from './booted-browser-process';
import { TEST_MACHINE_GRANT_ENV } from './machine-grant-fixture';

const ROOT = resolve(import.meta.dir, '../../../../..');
const APP_ORIGIN = 'http://localhost:4700';

/** Requires the configured entrypoint to register a real account and grant current Project authority. */
it('boots ordinary current authority, restarts its owned store and creates a project through native cookies', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-ordinary-server-test-'));
  const dbPath = join(directory, 'ordinary.db');
  let stdout: number | undefined;
  let stderr: number | undefined;
  let probe: ReturnType<typeof Bun.serve> | undefined;
  const settlement = {
    probeStopStarted: false,
    isProbeStopped: false,
    stopRequested: false,
    isStopped: false,
  };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let originalExit: Promise<number> | undefined;
  const failures: unknown[] = [];
  async function stopChild(): Promise<number> {
    if (child === undefined || originalExit === undefined)
      throw new Error('The test has no acquired backend child');
    if (settlement.stopRequested)
      throw new Error(`Backend settlement is uncertain; retained ${directory}`);
    settlement.stopRequested = true;
    child.kill('SIGTERM');
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const exitCode = await Promise.race([
        originalExit,
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => {
            reject(new Error(`Backend stop exceeded 2000ms; retained ${directory}`));
          }, 2000);
        }),
      ]);
      settlement.isStopped = true;
      return exitCode;
    } finally {
      if (deadline !== undefined) clearTimeout(deadline);
    }
  }
  try {
    stdout = openSync(join(directory, 'stdout'), 'wx', 0o600);
    stderr = openSync(join(directory, 'stderr'), 'wx', 0o600);
    const configured = Bun.spawnSync(
      [process.execPath, join(ROOT, 'apps/wbs/fe-01/ordinary-servers-cli.ts'), ROOT, '500', dbPath],
      { cwd: ROOT, stdin: 'ignore', stdout, stderr, timeout: 5000 },
    );
    expect(configured.signalCode).toBeUndefined();
    expect(configured.exitCode, readFileSync(join(directory, 'stderr'), 'utf8')).toBe(0);
    const descriptors: unknown = JSON.parse(readFileSync(join(directory, 'stdout'), 'utf8'));
    if (!Array.isArray(descriptors)) throw new Error('Ordinary descriptors must be an array');
    const backend: unknown = descriptors.at(0);
    if (
      typeof backend !== 'object' ||
      backend === null ||
      !('command' in backend) ||
      typeof backend.command !== 'string' ||
      !/^bun [\w/.-]+\.ts$/.test(backend.command)
    ) {
      throw new Error('The ordinary backend must have one explicit Bun entrypoint');
    }
    if (
      !('cwd' in backend) ||
      typeof backend.cwd !== 'string' ||
      !('url' in backend) ||
      typeof backend.url !== 'string' ||
      !('env' in backend) ||
      typeof backend.env !== 'object' ||
      backend.env === null ||
      Array.isArray(backend.env)
    )
      throw new Error('The ordinary backend must have its cwd, readiness URL and environment');
    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(backend.env)) {
      if (typeof value !== 'string') throw new Error('Ordinary environment values must be strings');
      environment[name] = value;
    }
    probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = probe.port;
    settlement.probeStopStarted = true;
    await probe.stop(true);
    settlement.isProbeStopped = true;
    if (port === undefined) throw new Error('The test listener did not acquire a port');
    child = Bun.spawn([process.execPath, '--no-env-file', backend.command.slice(4)], {
      cwd: backend.cwd,
      env: {
        PATH: process.env['PATH'],
        TZ: 'UTC',
        NODE_ENV: 'development',
        AUTH_MODE: 'local',
        BROWSER_SESSION_AUTHORITY: 'enabled',
        ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
        ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
        ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
        JWT_SIGNING_KEY_CURRENT: TEST_JWT_KEY,
        INTERNAL_AUTH_SECRET: BOOTED_INTERNAL_SECRET,
        LOG_LEVEL: 'error',
        ...TEST_MACHINE_GRANT_ENV,
        ...environment,
        PORT: String(port),
      },
      stdout,
      stderr,
    });
    originalExit = child.exited;
    const origin = `http://localhost:${String(port)}`;
    const readiness = new URL(backend.url).pathname;
    const deadline = Date.now() + 6000;
    let isReady = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(
          `The ordinary backend exited ${String(child.exitCode)} before readiness; inspect ${directory}`,
        );
      let response: Response | undefined;
      try {
        response = await fetch(`${origin}${readiness}`, { signal: AbortSignal.timeout(250) });
      } catch (cause) {
        // A newly spawned loopback listener may not accept connections yet; the deadline bounds recovery.
        if (!(cause instanceof Error)) throw cause;
      }
      if (response?.ok) {
        isReady = true;
        break;
      }
      if (response !== undefined && response.status !== 503)
        throw new Error(`Ordinary readiness answered ${String(response.status)}`);
      await Bun.sleep(25);
    }
    expect(isReady).toBe(true);
    const ready = await fetch(`${origin}${readiness}`);
    const readyBody = (await ready.json()) as { runId: string; accountId: string };
    expect(readyBody).toMatchObject({
      version: 1,
      databasePath: dbPath,
      stateDirectory: `${dbPath}.ordinary`,
      origin,
      appOrigin: APP_ORIGIN,
      gwUrl: 'http://localhost:3700',
      organizationId: 'ordinary-organization',
    });
    expect(readyBody.runId.length).toBeGreaterThan(0);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: 'POST',
      headers: { origin: APP_ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'local-dev', password: 'ordinary-browser-password' }),
    });
    expect(login.status).toBe(200);
    const session = (await login.json()) as {
      token: string;
      user: { id: string; username: string };
    };
    expect(session.user.username).toBe('local-dev');
    expect(session.user.id).not.toBe('local-dev');
    expect(session.user.id).toBe(readyBody.accountId);
    expect(session.token.length).toBeGreaterThan(0);
    const selected = await fetch(`${origin}/api/organization/active`, {
      method: 'POST',
      headers: {
        origin: APP_ORIGIN,
        cookie: `__Host-wbs_access=${session.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'ordinary-organization' }),
    });
    expect(selected.status).toBe(200);
    const selection = selected.headers.get('set-cookie');
    expect(selection).not.toBeNull();
    if (selection === null) throw new Error('Selection did not issue its real bound cookie');
    const organizationCookie = selection.split(';').at(0);
    if (organizationCookie === undefined) throw new Error('Selection cookie is empty');
    const cookies = `__Host-wbs_access=${session.token}; ${organizationCookie}`;
    const created = await fetch(`${origin}/api/projects`, {
      method: 'POST',
      headers: {
        origin: APP_ORIGIN,
        cookie: cookies,
        'X-WBS-Expected-Organization': 'ordinary-organization',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Ordinary parent' }),
    });
    expect(created.status).toBe(201);
    const project = (await created.json()) as {
      project: { id: string; organizationId: string; name: string };
    };
    expect(project.project).toMatchObject({
      organizationId: 'ordinary-organization',
      name: 'Ordinary parent',
    });
    expect(project.project.id.length).toBeGreaterThan(0);
    const readback = await fetch(`${origin}/api/projects/${project.project.id}`, {
      headers: { cookie: cookies, 'X-WBS-Expected-Organization': 'ordinary-organization' },
    });
    expect(readback.status).toBe(200);
    expect(await readback.json()).toMatchObject({ project: project.project });
    const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie: cookies } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      user: { id: session.user.id },
      features: { organizations: true },
    });
    const exitCode = await stopChild();
    expect(exitCode).toBe(0);
    expect(readdirSync(directory).sort()).toEqual(['stderr', 'stdout']);
  } catch (cause) {
    failures.push(cause);
  } finally {
    const precedingFailures = failures.length;
    if (probe !== undefined && !settlement.probeStopStarted) {
      try {
        settlement.probeStopStarted = true;
        await probe.stop(true);
        settlement.isProbeStopped = true;
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (child !== undefined && !settlement.isStopped && !settlement.stopRequested) {
      try {
        await stopChild();
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (stdout !== undefined) {
      try {
        closeSync(stdout);
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (stderr !== undefined) {
      try {
        closeSync(stderr);
      } catch (cause) {
        failures.push(cause);
      }
    }
    // A failed child retains its logs; a descriptor refusal before spawn still releases every known acquisition.
    if (
      (settlement.isStopped || child === undefined) &&
      (settlement.isProbeStopped || probe === undefined) &&
      failures.length === precedingFailures &&
      (precedingFailures === 0 || child === undefined)
    ) {
      try {
        rmSync(directory, { recursive: true });
      } catch (cause) {
        failures.push(cause);
      }
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Ordinary fixture test and cleanup failed', {
      cause: failures[0],
    });
});

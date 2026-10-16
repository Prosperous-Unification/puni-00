import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

const PROBE = join(import.meta.dir, '../../../bin/dev-be-probe.sh');
const servers: Bun.Server<undefined>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.stop(true)));
});

function authServer(body: unknown, status = 200): Bun.Server<undefined> {
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      if (new URL(request.url).pathname === '/api/auth/me') {
        return Response.json(body, { status });
      }
      return new Response('not found', { status: 404 });
    },
  });
  servers.push(server);
  return server;
}

async function runProbe(origin: string): Promise<{ exitCode: number; output: string }> {
  const child = Bun.spawn(['bash', PROBE, origin], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, output: stdout + stderr };
}

describe('dev be deployment probe', () => {
  it.each([
    { onboarding: false, organizations: false },
    { onboarding: true, organizations: false },
    { onboarding: true, organizations: true },
  ])('accepts anonymous auth with deployment features %j', async (features) => {
    const server = authServer({ user: null, features });

    const probe = await runProbe(`http://127.0.0.1:${String(server.port)}`);

    expect(probe.exitCode).toBe(0);
    expect(probe.output).toContain('be (auth routes mounted)');
  });

  it.each([
    { user: null },
    { user: { id: 'signed-in' }, features: { onboarding: false, organizations: false } },
    { user: null, features: null },
    { user: null, features: { onboarding: 'false', organizations: false } },
    { user: null, features: { onboarding: false } },
    { user: null, features: { onboarding: false, organizations: true } },
  ])('rejects a malformed or authenticated auth response %j', async (body) => {
    const server = authServer(body);

    const probe = await runProbe(`http://127.0.0.1:${String(server.port)}`);

    expect(probe.exitCode).not.toBe(0);
    expect(probe.output).toContain('FAIL');
  });

  it.each([201, 401, 500])('rejects HTTP %i even with a valid anonymous body', async (status) => {
    const server = authServer(
      {
        user: null,
        features: { onboarding: false, organizations: false },
      },
      status,
    );

    const probe = await runProbe(`http://127.0.0.1:${String(server.port)}`);

    expect(probe.exitCode).not.toBe(0);
    expect(probe.output).toContain('FAIL');
  });

  it('rejects a response that does not match the auth controller contract', async () => {
    const server = authServer({ error: 'missing_token' }, 401);

    const probe = await runProbe(`http://127.0.0.1:${String(server.port)}`);

    expect(probe.exitCode).not.toBe(0);
    expect(probe.output).toContain('FAIL');
  });
});

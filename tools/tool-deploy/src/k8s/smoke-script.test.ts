import { Script } from 'node:vm';

import { describe, expect, it } from 'bun:test';

import { smokeJob } from './execute';

class RequestedExit extends Error {
  constructor(readonly code: number) {
    super(`smoke requested exit ${String(code)}`);
  }
}

type ScriptOutcome = { kind: 'completed' } | { kind: 'exit-request'; code: number };

/** Evaluates the actual Job JavaScript in process; sleep/exit are modeled, HTTP is real loopback. */
async function evaluateSmoke(expected: 200 | 401, currentStatus: number, oldStatus = 404) {
  const paths: string[] = [];
  const pauses: number[] = [];
  const logs: string[] = [];
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      paths.push(path);
      if (path === '/health' || path === '/health/readiness') return new Response('ready');
      if (path === '/') return new Response('<div id="root"></div>');
      if (path === '/api/work-packages') return new Response('[]', { status: currentStatus });
      if (path === '/api/projects') return new Response('obsolete route', { status: oldStatus });
      return new Response('unknown route', { status: 404 });
    },
  });
  try {
    // The builder's manifest is the test boundary; execute its command and its declared env.
    const manifest = smokeJob(
      { namespaces: { app: 'wbs', backend: 'wbs-solver' }, anonymousWorkPackagesStatus: expected },
      'smoke-current-contract',
      'gateway@sha256:fixture',
    ) as {
      spec: {
        template: {
          spec: { containers: { command: string[]; env: { name: string; value: string }[] }[] };
        };
      };
    };
    const container = manifest.spec.template.spec.containers[0];
    expect(container.command.slice(0, 2)).toEqual(['bun', '-e']);
    const script = container.command[2];
    const environment = Object.fromEntries(
      container.env.map(({ name, value }) => [
        name,
        ['BACKEND_URL', 'GATEWAY_URL', 'FRONTEND_URL', 'MCP_URL'].includes(name)
          ? server.url.origin
          : value,
      ]),
    );
    let outcome: ScriptOutcome = { kind: 'completed' };
    try {
      // The known generated JavaScript is wrapped in an async function; this is its Promise boundary.
      const evaluation = new Script(`(async () => {${script}\n})();`).runInNewContext({
        process: {
          env: environment,
          exit(code: number): never {
            throw new RequestedExit(code);
          },
        },
        Bun: {
          sleep(milliseconds: number) {
            pauses.push(milliseconds);
            return Promise.resolve();
          },
        },
        fetch,
        console: { log: (line: string) => logs.push(line) },
        AbortSignal,
      }) as Promise<void>;
      await evaluation;
    } catch (fault) {
      if (!(fault instanceof RequestedExit)) throw fault;
      outcome = { kind: 'exit-request', code: fault.code };
    }
    return { outcome, paths, pauses, logs };
  } finally {
    await server.stop(true);
  }
}

describe('smokeJob generated script against the current HTTP contract', () => {
  for (const expected of [200, 401] as const) {
    it(`accepts the current work-package collection's ${String(expected)} anonymous status`, async () => {
      const observed = await evaluateSmoke(expected, expected);
      expect(observed.outcome, observed.logs.join('\n')).toEqual({ kind: 'completed' });
      expect(observed.paths).toEqual([
        '/health',
        '/api/work-packages',
        '/health',
        '/',
        '/health/readiness',
      ]);
      expect(observed.pauses).toEqual([]);
      expect(observed.logs).toHaveLength(5);
      expect(observed.logs.every((line) => line.startsWith('ok   '))).toBe(true);
    });
  }

  it('refuses a missing current collection even when the obsolete route answers 200', async () => {
    const observed = await evaluateSmoke(200, 404, 200);
    expect(observed.outcome).toEqual({ kind: 'exit-request', code: 1 });
    expect(observed.paths.filter((path) => path === '/api/work-packages')).toHaveLength(15);
    expect(observed.paths).not.toContain('/api/projects');
    expect(observed.pauses).toEqual(Array<number>(15).fill(2000));
    expect(observed.logs).toContain('FAIL backend auth 404');
  });

  it('refuses local-mode 200 when the Job requires OIDC 401', async () => {
    const observed = await evaluateSmoke(401, 200);
    expect(observed.outcome).toEqual({ kind: 'exit-request', code: 1 });
    expect(observed.paths.filter((path) => path === '/api/work-packages')).toHaveLength(15);
    expect(observed.pauses).toEqual(Array<number>(15).fill(2000));
    expect(observed.logs).toContain('FAIL backend auth 200');
  });
});

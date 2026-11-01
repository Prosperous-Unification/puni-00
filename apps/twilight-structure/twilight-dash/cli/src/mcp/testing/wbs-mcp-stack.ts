import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dir, '../../../../../../..');
const BACKEND = 'apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts';
const MCP_MAIN = 'apps/wbs/mcp-01/src/main.ts';

/**
 * WBS's real machine token path for Dash's tests, as two processes over loopback HTTP:
 * be-01's composed machine grant route (`apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts`,
 * the fixture mcp-01's own booted tests use) and mcp-01's **production entrypoint**
 * (`apps/wbs/mcp-01/src/main.ts`) in standalone mode, with its real M10 limits and
 * `MCP_TRUSTED_PROXY_HOPS=0`. Dash imports neither app; it only starts them.
 *
 * be-01's fixture routes stand in for the admin (see that file): `activate`, `api-key`,
 * `workload`, `assertion`, `rotate-grant-key`, `revoke`.
 */
export interface WbsMcpStack {
  /** `http://127.0.0.1:<port>/mcp`, mcp-01's `MCP_PUBLIC_URL`. */
  readonly resource: string;
  /** be-01's loopback origin, for a test that calls `/api` itself, as no fleet may. */
  readonly backend: string;
  fixture<T>(path: string, body?: unknown): Promise<T>;
  stop(): Promise<void>;
}

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const port = probe.port;
  void probe.stop(true);
  if (port === undefined) throw new Error('no free port');
  return port;
}

async function firstLine(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let printed = '';
  while (!printed.includes('\n')) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`be-01 exited before serving: ${printed}`);
    printed += new TextDecoder().decode(chunk.value);
  }
  // Later log lines are drained so the pipe never fills.
  void (async () => {
    for (;;) if ((await reader.read()).done) return;
  })();
  return printed.split('\n')[0] ?? '';
}

/**
 * Starts be-01's fixture, then mcp-01, and waits until mcp-01 serves its metadata. If startup
 * throws, every process it spawned is stopped and the store directory removed before rethrowing.
 */
export async function startWbsMcpStack(): Promise<WbsMcpStack> {
  const spawned: Bun.Subprocess[] = [];
  let storeDir: string | undefined;
  const stopAll = async (): Promise<void> => {
    for (const child of spawned) child.kill('SIGTERM');
    await Promise.all(spawned.map((child) => child.exited));
    if (storeDir !== undefined) rmSync(storeDir, { recursive: true, force: true });
  };
  try {
    const port = freePort();
    const resource = `http://127.0.0.1:${String(port)}/mcp`;
    // Generated per run, never a deployment's: be-01 and mcp-01 share it.
    const secret = randomBytes(32).toString('base64url');
    const backend = Bun.spawn([process.execPath, BACKEND], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        MCP_TEST_BE_SECRET: secret,
        MCP_TEST_AUTHORIZATION_SERVER: `${resource}/oauth`,
      },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'inherit',
    });
    spawned.push(backend);
    const backendPort = (JSON.parse(await firstLine(backend.stdout)) as { port: number }).port;
    const backendUrl = `http://127.0.0.1:${String(backendPort)}`;
    storeDir = mkdtempSync(join(tmpdir(), 'dash-mcp-stack-'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const mcp = Bun.spawn([process.execPath, MCP_MAIN], {
      cwd: REPO_ROOT,
      env: {
        PATH: process.env['PATH'],
        HOME: process.env['HOME'],
        PORT: String(port),
        MCP_AUTH_MODE: 'standalone',
        MCP_PUBLIC_URL: resource,
        MCP_TRUSTED_PROXY_HOPS: '0',
        WBS_API_URL: backendUrl,
        MCP_BE_INTERNAL_SECRET: secret,
        MCP_STORE_PATH: join(storeDir, 'mcp-session.sqlite'),
        MCP_STORE_KEY_CURRENT: randomBytes(32).toString('base64'),
        MCP_SIGNING_KEY_CURRENT: privateKey
          .export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
      },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    });
    spawned.push(mcp);
    const metadata = `http://127.0.0.1:${String(port)}/.well-known/oauth-protected-resource/mcp`;
    for (let attempt = 0; ; attempt += 1) {
      if (mcp.exitCode !== null) {
        throw new Error(`mcp-01 exited before serving: ${await new Response(mcp.stderr).text()}`);
      }
      try {
        if ((await fetch(metadata)).status === 200) break;
      } catch {
        // Not listening yet; the attempt bound below ends the wait.
      }
      if (attempt >= 200) throw new Error('mcp-01 did not serve its metadata within 10 s');
      await Bun.sleep(50);
    }
    return {
      resource,
      backend: backendUrl,
      async fixture<T>(path: string, body: unknown = {}): Promise<T> {
        const response = await fetch(`${backendUrl}/__fixture/${path}`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (response.status !== 200) throw new Error(`${path}: ${await response.text()}`);
        return (await response.json()) as T;
      },
      stop: stopAll,
    };
  } catch (cause) {
    await stopAll();
    throw cause;
  }
}

#!/usr/bin/env bun
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

/**
 * Live acceptance for one running dev environment: HTTP and browser routing through the lab's
 * loopback ingress, local auth, the MCP resource, the independent database, HMR without a reload,
 * a watcher reload without a restart, and an in-place restart after a restart path changes.
 *
 * It edits three files of the served worktree and restores each byte-for-byte. Run it only on a
 * worktree with no uncommitted edits to those files:
 * `bun tools/tool-devsync/src/k3s/dev-environment-check.ts --origin http://<slug>.localhost:<port>
 *   --worktree <path> --kubeconfig <file> --context <context> --pod dev-<slug>`.
 */
interface CheckRequest {
  readonly origin: string;
  readonly worktree: string;
  readonly kubeconfig: string;
  readonly context: string;
  readonly pod: string;
}

const STYLES = 'apps/wbs/fe-01/src/styles.css';
const BACKEND_SOURCE = 'apps/wbs/be-01/src/main.ts';
/** A config file read once at startup, and the lockfile (a trailing newline keeps it frozen). */
const RESTART_PROBES: readonly (readonly [string, string])[] = [
  ['apps/wbs/fe-01/vite.config.ts', '\n// f9 restart probe\n'],
  ['bun.lock', '\n'],
];

function parseRequest(arguments_: readonly string[]): CheckRequest {
  const flags = new Map<string, string>();
  for (let position = 0; position < arguments_.length; position += 2) {
    const flag = arguments_.at(position);
    const value = arguments_.at(position + 1);
    if (flag === undefined || value === undefined || !flag.startsWith('--')) {
      throw new Error(`Unexpected check argument at ${String(position)}`);
    }
    flags.set(flag.slice(2), value);
  }
  const required = (name: string): string => {
    const value = flags.get(name);
    if (value === undefined) throw new Error(`dev-environment check requires --${name}`);
    return value;
  };
  const origin = new URL(required('origin'));
  if (!origin.hostname.endsWith('.localhost')) {
    throw new Error(`the check only targets loopback lab URLs: ${origin.href}`);
  }
  return {
    origin: origin.origin,
    worktree: resolve(required('worktree')),
    kubeconfig: required('kubeconfig'),
    context: required('context'),
    pod: required('pod'),
  };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
  console.log(`ok: ${message}`);
}

async function kubectl(request: CheckRequest, arguments_: readonly string[]): Promise<string> {
  const child = Bun.spawn(
    [
      process.env['KUBECTL'] ?? 'kubectl',
      '--kubeconfig',
      request.kubeconfig,
      '--context',
      request.context,
      '--namespace=puni-forge',
      ...arguments_,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`kubectl ${arguments_.join(' ')}: ${stderr.trim()}`);
  return stdout;
}

async function restartCount(request: CheckRequest): Promise<number> {
  return Number(
    await kubectl(request, [
      'get',
      'pod',
      request.pod,
      '-o',
      'jsonpath={.status.containerStatuses[0].restartCount}',
    ]),
  );
}

async function waitFor(
  what: string,
  probe: () => Promise<boolean>,
  timeoutMs = 180_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await Bun.sleep(1000);
  }
  throw new Error(`CHECK FAILED: timed out after ${String(timeoutMs)}ms waiting for ${what}`);
}

async function withEdit<T>(path: string, suffix: string, action: () => Promise<T>): Promise<T> {
  const original = await readFile(path);
  await appendFile(path, suffix);
  try {
    return await action();
  } finally {
    await writeFile(path, original);
  }
}

async function checkHttp(request: CheckRequest): Promise<void> {
  const page = await fetch(`${request.origin}/`);
  check(page.status === 200 && (await page.text()).includes('id="root"'), 'web serves index.html');
  const name = `f9-check-${String(Date.now())}`;
  const created = await fetch(`${request.origin}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: request.origin },
    body: JSON.stringify({ name }),
  });
  const project = (await created.json()) as { project?: { ownerId?: string } };
  check(
    created.status === 200 && project.project?.ownerId === 'local-dev',
    'API through the edge proxy writes as the local-auth identity',
  );
  const database = await kubectl(request, [
    'exec',
    request.pod,
    '--',
    'bun',
    '-e',
    `const { Database } = require('bun:sqlite'); console.log(new Database('/data/wbs.db', { readonly: true }).query("select count(*) as n from project where name = '${name}'").get().n)`,
  ]);
  check(database.trim() === '1', 'the row lives in the environment database /data/wbs.db');
  const mcp = await fetch(`${request.origin}/mcp`, { method: 'POST' });
  check(
    mcp.status === 401 &&
      (mcp.headers.get('www-authenticate') ?? '').includes(
        `${request.origin}/.well-known/oauth-protected-resource`,
      ),
    'MCP answers 401 with resource metadata on the environment origin',
  );
  const metadata = (await (
    await fetch(`${request.origin}/.well-known/oauth-protected-resource`)
  ).json()) as { resource?: string };
  check(metadata.resource === `${request.origin}/mcp`, 'MCP resource URL is the environment URL');
  const socket = new WebSocket(`${request.origin.replace('http', 'ws')}/ws`);
  const opened = await new Promise<boolean>((resolveOpen) => {
    socket.addEventListener('open', () => {
      resolveOpen(true);
    });
    socket.addEventListener('error', () => {
      resolveOpen(false);
    });
    setTimeout(() => {
      resolveOpen(false);
    }, 10_000);
  });
  socket.close();
  check(opened, 'gateway WebSocket /ws upgrades through ingress and Vite');
}

async function checkBrowser(request: CheckRequest): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const sockets: string[] = [];
    const hotUpdates: string[] = [];
    let navigations = 0;
    page.on('websocket', (socket) => sockets.push(socket.url()));
    page.on('console', (message) => {
      if (message.text().includes('hot updated')) hotUpdates.push(message.text());
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });
    await page.goto(`${request.origin}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#root *', { timeout: 60_000 });
    check(
      sockets.some((url) => url.startsWith(request.origin.replace('http', 'ws'))),
      `browser opened Vite's HMR socket on the environment origin (${sockets.join(', ')})`,
    );
    const gateway = await page.evaluate(
      (url) =>
        new Promise<boolean>((resolveOpen) => {
          const socket = new WebSocket(url);
          socket.onopen = () => {
            socket.close();
            resolveOpen(true);
          };
          socket.onerror = () => {
            resolveOpen(false);
          };
        }),
      `${request.origin.replace('http', 'ws')}/ws`,
    );
    check(gateway, 'browser opens the gateway WebSocket through the same origin');
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>)['f9Marker'] = 'kept';
    });
    const before = navigations;
    const probe = `f9-hmr-${String(Date.now())}`;
    await withEdit(join(request.worktree, STYLES), `\n.${probe} { color: rgb(1, 2, 3); }\n`, () =>
      waitFor('the HMR stylesheet update', () =>
        page.evaluate(
          (selector) =>
            [...document.querySelectorAll('style')].some((style) =>
              style.textContent.includes(selector),
            ),
          probe,
        ),
      ),
    );
    check(hotUpdates.length > 0, `Vite reported a hot update (${hotUpdates.join(' | ')})`);
    check(
      navigations === before &&
        (await page.evaluate(() => (window as unknown as Record<string, unknown>)['f9Marker'])) ===
          'kept',
      'the edit applied without a document reload',
    );
  } finally {
    await browser.close();
  }
}

async function checkWatcherAndRestart(request: CheckRequest): Promise<void> {
  const restarts = await restartCount(request);
  const since = new Date().toISOString();
  await withEdit(join(request.worktree, BACKEND_SOURCE), '\n// f9 watcher probe\n', async () => {
    await waitFor('be-01 to reload under bun --watch', async () =>
      (await kubectl(request, ['logs', request.pod, `--since-time=${since}`])).includes(
        'be-01 listening',
      ),
    );
  });
  const watched = await kubectl(request, ['logs', request.pod, `--since-time=${since}`]);
  check(!watched.includes('[forge] restart required'), 'a source edit restarted nothing');

  for (const [path, suffix] of RESTART_PROBES) {
    const restartSince = new Date().toISOString();
    await withEdit(join(request.worktree, path), suffix, async () => {
      await waitFor(`the supervisor to restart the tiers after ${path}`, async () =>
        (await kubectl(request, ['logs', request.pod, `--since-time=${restartSince}`])).includes(
          '[forge] tiers restarted',
        ),
      );
    });
    const restarted = await kubectl(request, ['logs', request.pod, `--since-time=${restartSince}`]);
    check(
      restarted.includes(`[forge] restart required, changed: ${path}`) &&
        restarted.includes('bun install'),
      `a ${path} change ran bun install and restarted the tiers in place`,
    );
    // Restoring the file is a second restart; wait for it before probing the tiers again.
    await waitFor(`the restoring restart after ${path}`, async () => {
      const lines = await kubectl(request, ['logs', request.pod, `--since-time=${restartSince}`]);
      return lines.split('[forge] tiers restarted').length - 1 >= 2;
    });
    await waitFor('web to serve again', async () => (await fetch(`${request.origin}/`)).ok);
  }
  check((await restartCount(request)) === restarts, 'the container itself did not restart');
}

if (import.meta.main) {
  const request = parseRequest(process.argv.slice(2));
  await checkHttp(request);
  await checkBrowser(request);
  await checkWatcherAndRestart(request);
  console.log('dev environment check passed');
}

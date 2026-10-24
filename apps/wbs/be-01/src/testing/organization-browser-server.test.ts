import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

import { expect, it } from 'bun:test';

const SERVER = resolve(import.meta.dir, 'organization-browser-server.ts');
const REPO_ROOT = resolve(import.meta.dir, '../../../../..');

/**
 * A non-loopback IPv4 address of this host, to show the fixture is not on it.
 *
 * @throws when the host has none, rather than skipping the check.
 */
function externalAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    const found = addresses?.find((each) => each.family === 'IPv4' && !each.internal);
    if (found !== undefined) return found.address;
  }
  throw new Error('no non-loopback IPv4 address to probe the listener from');
}

/** The banner's listener origin, read from stdout as the process prints it. */
async function bannerOrigin(stdout: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let seen = '';
  for await (const chunk of stdout) {
    seen += decoder.decode(chunk);
    const banner = /organization fixture: [^\n]*; (http:\/\/\S+)/.exec(seen);
    if (banner?.[1] !== undefined) return banner[1];
  }
  throw new Error(`the fixture exited without its banner: ${seen.slice(-2000)}`);
}

/**
 * The Playwright organization fixture signs sessions with the repository's
 * public test JWT key and fixture password, so anyone who can reach it can
 * forge one (issue #717).
 */
it('serves the organization fixture on loopback only', async () => {
  const child = Bun.spawn([process.execPath, SERVER, '--port', '0'], {
    cwd: REPO_ROOT,
    env: { PATH: process.env['PATH'] ?? '' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    const origin = await bannerOrigin(child.stdout);
    expect(new URL(origin).hostname).toBe('127.0.0.1');
    expect((await fetch(`${origin}/health`)).status).toBe(200);
    // Proof: with `hostname: HOSTNAME` removed from the fixture's `Bun.serve`,
    // this fetch answered on the host's LAN address and the case failed;
    // watched 2026-10-25.
    const external = `http://${externalAddress()}:${new URL(origin).port}/health`;
    let reachedExternally = true;
    try {
      await fetch(external);
    } catch {
      reachedExternally = false;
    }
    expect(reachedExternally).toBe(false);
  } finally {
    child.kill('SIGTERM');
  }
  expect(await child.exited).toBe(0);
}, 30_000);

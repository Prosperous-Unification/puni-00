import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { serveGitHttp } from './git-http';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function git(cwd: string, ...args: string[]): { code: number; out: string; err: string } {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: child.exitCode,
    out: child.stdout.toString().trim(),
    err: child.stderr.toString(),
  };
}

/** Network git runs asynchronously: the server answering it lives in this same process. */
async function gitAsync(cwd: string, ...args: string[]): Promise<{ code: number; err: string }> {
  const child = Bun.spawn({
    cmd: ['git', '-C', cwd, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [err, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { code, err };
}

describe('the lab Git smart-HTTP server', () => {
  it('serves a bare repository to a clone and refuses pushes', async () => {
    const root = scratchSync('wbs-git-http-');
    cleanups.push(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const seed = join(root, 'seed');
    git(root, 'init', '--quiet', '--bare', '-b', 'main', join(root, 'deploy.git'));
    git(root, 'init', '--quiet', '-b', 'main', seed);
    writeFileSync(join(seed, 'release.yaml'), 'kind: X\n');
    git(seed, 'add', 'release.yaml');
    git(seed, 'commit', '--quiet', '-m', 'c1');
    git(seed, 'push', '--quiet', join(root, 'deploy.git'), 'main');
    const server = serveGitHttp(root, '127.0.0.1');
    cleanups.push(() => server.stop());
    const url = `http://127.0.0.1:${String(server.port)}/deploy.git`;
    const cloned = await gitAsync(root, 'clone', '--quiet', url, join(root, 'clone'));
    expect(cloned.code, cloned.err).toBe(0);
    expect(git(join(root, 'clone'), 'rev-parse', 'HEAD').out).toBe(
      git(seed, 'rev-parse', 'HEAD').out,
    );
    writeFileSync(join(root, 'clone', 'other.yaml'), 'kind: Y\n');
    git(join(root, 'clone'), 'add', 'other.yaml');
    git(join(root, 'clone'), 'commit', '--quiet', '-m', 'c2');
    expect((await gitAsync(join(root, 'clone'), 'push', 'origin', 'main')).code).not.toBe(0);
  });
});

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { afterEach, describe, expect, it } from 'bun:test';

import { main } from './descriptor-cli';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): string {
  const child = Bun.spawnSync({
    cmd: ['git', '-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}

/** A repository whose main has `onMain` and whose side branch has `offMain`, plus inputs. */
function workspace() {
  const root = scratchSync('wbs-descriptor-cli-');
  roots.push(root);
  git(root, 'init', '--quiet', '-b', 'main');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', 'main');
  const onMain = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--quiet', '-b', 'side');
  git(root, 'commit', '--quiet', '--allow-empty', '-m', 'side');
  const offMain = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '--quiet', 'main');
  const files = (sha: string) => {
    const entry = (name: string, hex: string) => ({
      sha,
      digest: `sha256:${hex.repeat(64)}`,
      ref: `registry.example/${name}:${sha}`,
      image: `registry.example/${name}@sha256:${hex.repeat(64)}`,
    });
    const candidate = join(root, `candidate-${sha}.json`);
    writeFileSync(
      candidate,
      JSON.stringify({
        schemaVersion: 1,
        sourceSha: sha,
        release: {
          be: entry('wbs-be-01', '1'),
          gw: entry('wbs-gw-01', '2'),
          fe: entry('wbs-fe-01', '3'),
          mcp: entry('wbs-mcp-01', '4'),
        },
        gateRunId: 7,
      }),
    );
    const admission = join(root, `admission-${sha}.json`);
    writeFileSync(
      admission,
      JSON.stringify({
        schemaVersion: 1,
        sourceSha: sha,
        package: {
          name: 'twilight-burokrat',
          version: '0.1.0',
          integrity: `sha512-${'c'.repeat(86)}==`,
          toolkitIdentity: 'd'.repeat(64),
        },
        activation: { version: 'e'.repeat(40), manifestIdentity: 'f'.repeat(64) },
      }),
    );
    const run = join(root, `run-${sha}.json`);
    writeFileSync(
      run,
      JSON.stringify({
        id: 7,
        head_sha: sha,
        path: '.github/workflows/ci.yml',
        event: 'push',
        head_branch: 'main',
        status: 'completed',
        conclusion: 'success',
        jobs: [
          { name: 'gate', conclusion: 'success' },
          { name: 'pixels', conclusion: 'success' },
        ],
      }),
    );
    return [
      'seal',
      '--candidate',
      candidate,
      '--admission',
      admission,
      '--gate-run',
      run,
      '--out',
      join(root, `descriptor-${sha}.json`),
      '--repository',
      root,
      '--main-ref',
      'main',
    ];
  };
  return { onMain, offMain, files };
}

const outcome = (promise: Promise<string>) =>
  promise.then(
    (sha) => `sealed ${sha}`,
    (e: unknown) => String(e),
  );

describe('descriptor-cli seal', () => {
  it('seals a main commit whose images carry its label', async () => {
    const box = workspace();
    expect(await outcome(main(box.files(box.onMain), () => Promise.resolve(box.onMain)))).toMatch(
      /^sealed [0-9a-f]{64}$/,
    );
  });

  it('refuses a commit main never took', async () => {
    const box = workspace();
    expect(
      await outcome(main(box.files(box.offMain), () => Promise.resolve(box.offMain))),
    ).toContain("is not on main's history");
  });

  it('refuses images the registry labels with another commit', async () => {
    const box = workspace();
    expect(
      await outcome(main(box.files(box.onMain), () => Promise.resolve('9'.repeat(40)))),
    ).toContain(`images are not built from ${box.onMain}`);
  });
});

import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

it('publish wrapper propagates environment and tier selection through the heavy lock', async () => {
  const directory = await scratchAsync('publication-wrapper-');
  try {
    await mkdir(join(directory, 'bin'));
    await copyFile(
      new URL('../../../bin/publish-release.sh', import.meta.url),
      join(directory, 'bin/publish-release.sh'),
    );
    await copyFile(
      new URL('../../../bin/publish-release-payload.sh', import.meta.url),
      join(directory, 'bin/publish-release-payload.sh'),
    );
    await writeFile(
      join(directory, 'bin/heavy-lock-lib.sh'),
      'run_heavy_job() { test "$HEAVY_LOCK_JOB_TYPE" = release-build; test "$1" = --; shift; printf "LOCKED\\n"; "$@"; }\n',
    );
    await writeFile(
      join(directory, 'bin/bun'),
      '#!/bin/sh\nset -eu\nprintf "%s\\n" "$WBS_SHA" "$REGISTRY_PUBLICATION_ENROLLMENT" "$*"\n',
      { mode: 0o755 },
    );
    for (const argv of [
      ['git', 'init', '-q'],
      [
        'git',
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'fixture',
      ],
    ]) {
      const command = Bun.spawnSync(argv, { cwd: directory });
      if (command.exitCode !== 0) throw new Error(command.stderr.toString());
    }
    const sha = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: directory })
      .stdout.toString()
      .trim();
    const child = Bun.spawnSync(
      ['bash', join(directory, 'bin/publish-release.sh'), 'be,gw,fe,mcp'],
      {
        env: {
          ...process.env,
          PATH: `${join(directory, 'bin')}:${process.env['PATH'] ?? ''}`,
          REGISTRY_PUBLICATION_ENROLLMENT: '/etc/puni/registry/publication.json',
        },
      },
    );
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toBe(
      `LOCKED\n${sha}\n/etc/puni/registry/publication.json\nrun tools/tool-dagger/src/main.ts be,gw,fe,mcp\n`,
    );
  } finally {
    await rm(directory, { recursive: true });
  }
});

it('every existing tier publish entrypoint reports a plan without a publication receipt', () => {
  for (const tier of ['be', 'gw', 'fe']) {
    const entrypoint = new URL(`./${tier}-01.ts`, import.meta.url).pathname;
    const child = Bun.spawnSync([process.execPath, entrypoint, '--publish'], {
      env: { ...process.env, REGISTRY_PUBLICATION_ENROLLMENT: '/absent-plan-only-enrollment' },
    });
    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toContain('only computes a bundle plan');
    expect(child.stdout.toString()).toContain('tool-dagger:publish-all');
  }
});

it('publishes the legacy release record without lifecycle installation', async () => {
  const child = Bun.spawn(
    [process.execPath, new URL('./legacy-publication.fixture.ts', import.meta.url).pathname],
    {
      cwd: new URL('../../../', import.meta.url).pathname,
      env: {
        ...process.env,
        REGISTRY: 'registry.test',
        REGISTRY_PASS: 'fixture',
        REGISTRY_PUBLICATION_ENROLLMENT: '/absent-legacy-publication',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const [code, output, diagnostic] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, diagnostic }).toEqual({ code: 0, diagnostic: '' });
  expect(JSON.parse(output)).toEqual({
    be: {
      sha: 'legacy',
      digest: `sha256:${'a'.repeat(64)}`,
      ref: 'registry.test/wbs-be-01:legacy',
      image: `registry.test/wbs-be-01@sha256:${'a'.repeat(64)}`,
    },
  });
});

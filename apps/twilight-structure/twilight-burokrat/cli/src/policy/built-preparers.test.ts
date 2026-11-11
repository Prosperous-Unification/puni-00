import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { afterAll, expect, it } from 'bun:test';

import { readLintRuntime } from '../lint-runtime';
import { createRelocationFixture, createToolkitFixture } from '../testing/preparation-fixtures';
import { verifyActivation } from './activation';
import { buildBunToolkit } from './build-bun-toolkit';
import { captureCommittedSource } from './committed-source';
import { disposeRelocationFixtures } from './relocation-fixtures';

const roots: string[] = [];
afterAll(() => {
  disposeRelocationFixtures();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const workspace = resolve(import.meta.dir, '../../../../../..');
function git(repository: string, args: string[], binary = false) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 30000,
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return binary ? child.stdout.toString() : child.stdout.toString().trim();
}

it('executes both newly produced real preparation assets through normal and relocation archive completion', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni actual five-role provider '));
  roots.push(root);
  const repository = join(root, 'provider'),
    runtime = join(root, 'runtime');
  mkdirSync(runtime);
  git(root, ['clone', '--quiet', '--no-hardlinks', workspace, repository]);
  // Capture this test invocation's current reviewed provider bytes in an isolated fixture commit.
  // The public producer still requires an already captured source; no clean-release claim follows.
  const paths = new Set(
    [
      ...git(workspace, ['diff', '--name-only', '-z', 'HEAD'], true).split('\0'),
      ...git(workspace, ['ls-files', '--others', '--exclude-standard', '-z'], true).split('\0'),
    ].filter(Boolean),
  );
  for (const path of paths) {
    const origin = join(workspace, path),
      target = join(repository, path);
    if (existsSync(origin)) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(origin, target, { dereference: false });
    } else rmSync(target, { force: true });
  }
  git(repository, ['config', 'user.name', 'PUNI provider integration']);
  git(repository, ['config', 'user.email', 'provider@example.test']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--allow-empty', '-m', 'capture current five-role provider']);
  const firstRevision = git(repository, ['rev-parse', 'HEAD']);
  expect(git(repository, ['status', '--porcelain'])).toBe('');
  // Exercise the same setup on a clean fixture input, as a published checkout supplies.
  git(repository, ['commit', '--allow-empty', '-m', 'capture clean five-role provider']);
  expect(git(repository, ['rev-parse', 'HEAD'])).not.toBe(firstRevision);
  const revision = git(repository, ['rev-parse', 'HEAD']),
    runtimeAuthority = readLintRuntime('/usr/bin:/bin', runtime);
  const captured = await captureCommittedSource(revision, {
    repository,
    runtime: runtimeAuthority,
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured')
    throw new Error('unexpected full provider capture cancellation');
  const built = await buildBunToolkit(
    captured.source,
    { tag: 'puni-v0.3.0', work: join(root, 'work'), destination: join(root, 'toolkit') },
    {
      callerDirectory: root,
      sourceDirectory: repository,
      installationDirectory: workspace,
      runtime: runtimeAuthority,
      subscribeInterrupts: () => () => undefined,
    },
  );
  if (built.kind !== 'built') throw new Error('unexpected actual provider build cancellation');
  expect(built.toolkit.sourceRevision).toBe(revision);
  expect(
    readFileSync(join(built.toolkit.directory, 'licenses/typescript-preparation/NOTICE'), 'utf8'),
  ).toContain('language-service plugin loading disabled');
  for (const command of ['prepare-activation', 'prepare-relocation-activation'] as const) {
    // The actual producer-built preparer owns this orchestration. Certification uses the
    // established controlled certificate peer and actual launcher/snapshotter, not a semantic claim.
    const fixture =
      command === 'prepare-activation'
        ? await createToolkitFixture(roots)
        : await createRelocationFixture(roots);
    const bytes = Buffer.from(
      JSON.stringify({
        version: 1,
        callerDirectory: fixture.context.callerDirectory,
        toolkitDirectory: fixture.context.toolkitDirectory,
        expectedToolkitIdentity: fixture.context.expectedToolkitIdentity,
        request: fixture.request,
      }),
    );
    const child = Bun.spawnSync(
      [
        ...createLaunch(process.execPath, join(built.toolkit.directory, command + '.mjs')),
        '--puni-preparation-v1',
      ],
      {
        cwd: runtime,
        env: { PATH: '/usr/bin:/bin' },
        stdin: bytes,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30000,
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toContain(fixture.revision);
    expect(child.stderr.length).toBe(0);
    expect(
      verifyActivation(join(fixture.request.destination, 'activation-' + fixture.revision)).manifest
        .schemaVersion,
    ).toBe(4);
    expect(
      existsSync(
        join(fixture.request.work, 'puni-activation-' + fixture.revision.slice(0, 8) + '.tar'),
      ),
    ).toBe(true);
  }
}, 120000);

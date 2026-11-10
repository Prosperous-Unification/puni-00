import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { readLintRuntime } from '../lint-runtime';
import { captureCommittedSource } from '../policy/committed-source';

/** Capture a private fixture commit containing the invoking checkout's reviewed current bytes. */
export async function createCapturedWorkspace(roots: string[]) {
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const root = mkdtempSync(join(tmpdir(), 'puni current captured workspace '));
  roots.push(root);
  const repository = join(root, 'provider'),
    runtime = join(root, 'runtime');
  mkdirSync(runtime);
  function git(directory: string, args: string[], raw = false) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', directory, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 30000,
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return raw ? child.stdout.toString() : child.stdout.toString().trim();
  }
  git(root, ['clone', '--quiet', '--no-hardlinks', workspace, repository]);
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
  git(repository, ['config', 'user.name', 'PUNI actual captured provider']);
  git(repository, ['config', 'user.email', 'provider@example.test']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '--allow-empty', '-m', 'capture reviewed current provider']);
  const revision = git(repository, ['rev-parse', 'HEAD']),
    authority = readLintRuntime('/usr/bin:/bin', runtime);
  const captured = await captureCommittedSource(revision, {
    repository,
    runtime: authority,
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured')
    throw new Error('fixture provider capture unexpectedly cancelled');
  return {
    root,
    repository,
    revision,
    source: captured.source,
    workspace,
    context: {
      callerDirectory: root,
      sourceDirectory: repository,
      installationDirectory: workspace,
      runtime: authority,
      subscribeInterrupts: () => () => undefined,
    },
    request: { work: join(root, 'work'), destination: join(root, 'package') },
  };
}

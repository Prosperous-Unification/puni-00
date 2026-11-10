import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { readLintRuntime } from '../lint-runtime';
import { captureCommittedSource } from '../policy/committed-source';
import { buildModuleNames, copyTrustedModules } from '../policy/trusted-modules';

/** Tiny captured roles with real operator authority; optional private native closure for path proofs. */
export async function createToolkitProducerFixture(roots: string[], privateClosure = false) {
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const root = mkdtempSync(join(tmpdir(), 'puni producer authority boundary '));
  roots.push(root);
  const repository = join(root, 'source'),
    installation = join(root, 'installation'),
    runtime = join(root, 'runtime');
  for (const path of [repository, installation, runtime]) mkdirSync(path);
  for (const path of ['package.json', 'bun.lock', '.bun-version']) {
    const bytes = readFileSync(join(workspace, path));
    writeFileSync(join(repository, path), bytes);
    writeFileSync(join(installation, path), bytes);
  }
  const closure = privateClosure ? join(root, 'native-closure') : join(workspace, 'node_modules');
  if (privateClosure)
    copyTrustedModules(
      closure,
      join(workspace, 'node_modules'),
      buildModuleNames(join(workspace, 'node_modules')),
    );
  symlinkSync(closure, join(installation, 'node_modules'));
  for (const path of [
    'cli.ts',
    'lint-cli.ts',
    'policy/snapshot-validator.ts',
    'policy/prepare-activation-entry.ts',
    'policy/prepare-relocation-entry.ts',
  ]) {
    const target = join(repository, 'apps/twilight-structure/twilight-burokrat/cli/src', path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'console.log("captured-role");');
  }
  function git(args: string[]) {
    const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    return child.stdout.toString().trim();
  }
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'PUNI producer authority']);
  git(['config', 'user.email', 'authority@example.test']);
  git(['add', '--all']);
  git(['commit', '-m', 'captured provider boundary']);
  const authority = readLintRuntime('/usr/bin:/bin', runtime);
  const captured = await captureCommittedSource(git(['rev-parse', 'HEAD']), {
    repository,
    runtime: authority,
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured')
    throw new Error('unexpected producer fixture capture cancellation');
  return {
    root,
    repository,
    installation,
    closure,
    source: captured.source,
    request: { tag: 'puni-v0.3.0', work: join(root, 'work'), destination: join(root, 'toolkit') },
    context: {
      callerDirectory: root,
      sourceDirectory: repository,
      installationDirectory: installation,
      runtime: authority,
      subscribeInterrupts: () => () => undefined,
    },
  };
}

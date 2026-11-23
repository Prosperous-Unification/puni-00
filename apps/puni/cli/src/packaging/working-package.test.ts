import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

import * as producer from './build';

const workspace = resolve(import.meta.dir, '../../../../..');
function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Actual edited source is not rewritten into a test commit by the package operation. */
it('assembles explicit working-source assets without changing the source HEAD or index', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni working package first ')),
    repository = join(root, 'edited source'),
    runtime = join(root, 'trusted runtime');
  let known = true,
    productionStarted = false,
    passed = false;
  const environment = {
    PATH: '/usr/bin:/bin',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  };
  function git(directory: string, arguments_: string[], raw = false): string {
    let child: Bun.ReadableSyncSubprocess;
    try {
      child = Bun.spawnSync(['/usr/bin/git', '-C', directory, ...arguments_], {
        env: environment,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 30000,
      });
    } catch (cause) {
      known = false;
      throw cause;
    }
    if (
      child.signalCode !== undefined ||
      typeof child.exitCode !== 'number' ||
      child.exitedDueToTimeout ||
      child.exitedDueToMaxBuffer
    ) {
      known = false;
      throw new Error('working fixture Git custody is unconfirmed; retained ' + root);
    }
    if (child.exitCode !== 0)
      throw new Error('working fixture Git failed: ' + child.stderr.toString());
    return raw ? child.stdout.toString('utf8') : child.stdout.toString('utf8').trim();
  }
  let primary: { cause: unknown } | undefined;
  try {
    mkdirSync(runtime);
    git(root, ['clone', '--quiet', '--no-hardlinks', workspace, repository]);
    const changed = new Set(
      [
        ...git(workspace, ['diff', '--name-only', '-z', 'HEAD'], true).split('\0'),
        ...git(workspace, ['ls-files', '--others', '--exclude-standard', '-z'], true).split('\0'),
      ].filter(Boolean),
    );
    for (const path of changed) {
      const origin = join(workspace, path),
        target = join(repository, path);
      if (existsSync(origin)) {
        mkdirSync(dirname(target), { recursive: true });
        cpSync(origin, target, { dereference: false });
      } else rmSync(target, { force: true });
    }
    git(repository, ['config', 'user.name', 'PUNI working-source owner']);
    git(repository, ['config', 'user.email', 'working-source@example.invalid']);
    git(repository, ['add', '--all']);
    git(repository, [
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--allow-empty',
      '-qm',
      'establish actual source base',
    ]);
    const base = git(repository, ['rev-parse', 'HEAD']),
      index = readFileSync(join(repository, '.git/index'));
    const readme = join(repository, 'apps/puni/cli/README.md'),
      original = readFileSync(readme);
    const edited = Buffer.concat([
      original,
      Buffer.from('\nActual uncommitted working-source package owner.\n'),
    ]);
    writeFileSync(readme, edited);
    chmodSync(readme, 0o755);
    const added = 'apps/puni/cli/src/working-source-owner.txt';
    writeFileSync(join(repository, added), 'actual nonignored untracked captured file\n');
    const status = git(repository, ['status', '--porcelain', '--untracked-files=all']);
    expect(status).toContain('apps/puni/cli/README.md');
    expect(status).toContain(added);
    expect(git(repository, ['rev-parse', 'HEAD'])).toBe(base);
    expect(readFileSync(join(repository, '.git/index'))).toEqual(index);
    const context = {
      callerDirectory: root,
      runtime: { directory: runtime, environment },
      subscribeInterrupts: () => () => undefined,
    };
    known = false;
    const captured = await producer.captureWorkingSource({ repository, ...context });
    known = true;
    expect(captured.kind).toBe('captured');
    if (captured.kind !== 'captured')
      throw new Error('actual working capture cancelled unexpectedly');
    const selection = captured.source.readSelection();
    const identity: unknown = expect.stringMatching(/^[0-9a-f]{64}$/u);
    expect(structuredClone(selection)).toMatchObject({
      kind: 'working',
      base,
      identity,
    });
    expect(captured.source.readFile('apps/puni/cli/README.md')).toEqual(Uint8Array.from(edited));
    expect(captured.source.readFile(added)).toEqual(
      Uint8Array.from(Buffer.from('actual nonignored untracked captured file\n')),
    );
    const assemble: unknown = Reflect.get(producer, 'buildWorkingPackage');
    expect(typeof assemble).toBe('function');
    if (typeof assemble !== 'function') throw new Error('required buildWorkingPackage is absent');
    productionStarted = true;
    const destination = join(root, 'working package');
    const built: unknown = await Reflect.apply(assemble, undefined, [
      { repository, installationDirectory: workspace, work: join(root, 'build work'), destination },
      context,
    ]);
    expect(built).toMatchObject({
      kind: 'built',
      toolkit: { schemaVersion: 3, sourceRevision: base, sourceSelection: selection },
    });
    const profile: unknown = JSON.parse(
      readFileSync(join(destination, 'dist/package-manifest.json'), 'utf8'),
    );
    const assets: unknown = JSON.parse(
      readFileSync(join(destination, 'dist/test-level-assets.json'), 'utf8'),
    );
    const source: unknown = JSON.parse(
      readFileSync(join(destination, 'dist/test-level-source.json'), 'utf8'),
    );
    expect(profile).toMatchObject({
      packageVersion: '0.4.0',
      sourceRevision: base,
      sourceSelection: selection,
    });
    expect(assets).toMatchObject({ sourceRevision: base, sourceSelection: selection });
    const files: unknown = expect.arrayContaining([
      { path: 'apps/puni/cli/README.md', mode: '100755', sha256: hashBytes(edited) },
      {
        path: added,
        mode: '100644',
        sha256: hashBytes(Buffer.from('actual nonignored untracked captured file\n')),
      },
    ]);
    expect(source).toMatchObject({
      sourceSelection: selection,
      files,
    });
    expect(readFileSync(join(destination, 'README.md'))).toEqual(edited);
    expect(git(repository, ['rev-parse', 'HEAD'])).toBe(base);
    expect(readFileSync(join(repository, '.git/index'))).toEqual(index);
    expect(git(repository, ['status', '--porcelain', '--untracked-files=all'])).toBe(status);
    expect(readFileSync(readme)).toEqual(edited);
    expect(statSync(readme).mode & 0o777).toBe(0o755);
    passed = true;
  } catch (cause) {
    primary = { cause };
  }
  if (known && (!productionStarted || passed)) {
    try {
      rmSync(root, { recursive: true });
    } catch (cleanup) {
      if (primary !== undefined)
        throw new AggregateError(
          [primary.cause, cleanup],
          'working-source owner and fixture release failed',
          { cause: cleanup },
        );
      throw cleanup;
    }
  } else
    throw new Error('working-source owner retains acquired namespace ' + root, {
      cause: primary?.cause,
    });
  if (primary !== undefined) throw primary.cause;
}, 120000);

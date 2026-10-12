import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { type CliInvocation, invokeCli } from './invoke-cli';

const repositories: string[] = [];
const cliPath = join(import.meta.dir, 'cli.ts');

interface GitEntry {
  path: string;
  mode: '100644' | '100755' | '120000' | '160000';
  blob: string;
}

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = invocation.stderr.toString('utf8');
  expect(invocation.exitCode, stderr).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function createRepository(): string {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-candidate-'));
  repositories.push(repository);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'candidate@example.test']);
  runGit(repository, ['config', 'user.name', 'Candidate Fixture']);
  return repository;
}

function write(repository: string, path: string, source: string): void {
  const absolutePath = join(repository, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, source, 'utf8');
}

function commitAll(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

function hash(repository: string, path: string): string {
  return runGit(repository, ['hash-object', path]);
}

/**
 * Runs `read-candidate` in this process through the CLI entry, or as its own Bun process when an
 * `env` must reach the Git the reader spawns.
 */
async function runCandidateCli(
  repository: string,
  kind: 'committed' | 'staged' | 'working',
  base: string,
  env?: Record<string, string>,
): Promise<CliInvocation> {
  const argv = ['read-candidate', kind, repository, base];
  if (env === undefined) return invokeCli(argv);
  const invocation = Bun.spawnSync([process.execPath, 'run', cliPath, ...argv], {
    cwd: import.meta.dir,
    env: { ...process.env, ...env },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  return {
    exitCode: invocation.exitCode,
    stdout: invocation.stdout.toString('utf8'),
    stderr: invocation.stderr.toString('utf8'),
  };
}

function expectCandidate(
  invocation: CliInvocation,
  selection: object,
  entries: GitEntry[],
  untracked: string[] = [],
): void {
  const stdout = invocation.stdout;
  const output = `${stdout}${invocation.stderr}`;
  expect(invocation.exitCode, output).toBe(0);
  // Proof: this full-object oracle failed on the actual selected candidate when the reader
  // separately dropped `link`, omitted `added.txt`, substituted `deleted.txt` at equal count,
  // and read the base tree instead of the staged index tree.
  expect(
    JSON.parse(stdout) as unknown,
    `complete tuple/selection mismatch on actual selected candidate:\n${stdout}`,
  ).toEqual({ selection, entries, untracked });
}

afterEach(() => {
  for (const repository of repositories.splice(0)) {
    rmSync(repository, { force: true, recursive: true });
  }
});

describe('read-candidate production CLI', () => {
  test('reads the selected commit instead of a changed index or working tree', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const revision = commitAll(repository, 'initial');
    const tree = runGit(repository, ['rev-parse', `${revision}^{tree}`]);
    const committedBlob = hash(repository, 'tracked.txt');

    write(repository, 'tracked.txt', 'staged\n');
    runGit(repository, ['add', 'tracked.txt']);
    write(repository, 'tracked.txt', 'working\n');

    expectCandidate(
      await runCandidateCli(repository, 'committed', revision),
      { kind: 'committed', revision, tree },
      [{ path: 'tracked.txt', mode: '100644', blob: committedBlob }],
    );
  });

  test('selects the requested worktree whose root ends in whitespace', async () => {
    const neighborhood = mkdtempSync(join(tmpdir(), 'tool-wiki-neighboring-roots-'));
    repositories.push(neighborhood);
    const neighbor = join(neighborhood, 'space');
    const requested = join(neighborhood, 'space ');
    for (const repository of [neighbor, requested]) {
      mkdirSync(repository);
      runGit(repository, ['init', '--initial-branch=main']);
      runGit(repository, ['config', 'user.email', 'candidate@example.test']);
      runGit(repository, ['config', 'user.name', 'Candidate Fixture']);
    }
    write(neighbor, 'neighbor.txt', 'wrong repository\n');
    commitAll(neighbor, 'neighbor');
    write(requested, 'requested.txt', 'requested repository\n');
    const revision = commitAll(requested, 'requested');
    const tree = runGit(requested, ['rev-parse', `${revision}^{tree}`]);

    expectCandidate(
      await runCandidateCli(requested, 'committed', 'HEAD'),
      { kind: 'committed', revision, tree },
      [{ path: 'requested.txt', mode: '100644', blob: hash(requested, 'requested.txt') }],
    );
  });

  test('preserves a leading UTF-8 BOM as part of an exact Git path', async () => {
    const repository = createRepository();
    write(repository, 'name', 'plain\n');
    write(repository, '\uFEFFname', 'bom\n');
    const revision = commitAll(repository, 'BOM path');
    const tree = runGit(repository, ['rev-parse', `${revision}^{tree}`]);

    expectCandidate(
      await runCandidateCli(repository, 'committed', revision),
      { kind: 'committed', revision, tree },
      [
        { path: 'name', mode: '100644', blob: hash(repository, 'name') },
        { path: '\uFEFFname', mode: '100644', blob: hash(repository, '\uFEFFname') },
      ],
    );
  });

  test('reads the immutable staged index tree with additions, deletion, both rename sides, modes and symlink blobs', async () => {
    const repository = createRepository();
    write(repository, 'deleted.txt', 'delete me\n');
    write(repository, 'renamed-from.txt', 'rename me\n');
    write(repository, 'script.sh', '#!/bin/sh\nexit 0\n');
    const base = commitAll(repository, 'initial');

    rmSync(join(repository, 'deleted.txt'));
    runGit(repository, ['mv', 'renamed-from.txt', 'renamed-to.txt']);
    write(repository, 'added.txt', 'candidate addition\n');
    chmodSync(join(repository, 'script.sh'), 0o755);
    symlinkSync('renamed-to.txt', join(repository, 'link'));
    runGit(repository, ['add', '--all']);
    const indexTree = runGit(repository, ['write-tree']);
    const expectedEntries: GitEntry[] = [
      { path: 'added.txt', mode: '100644', blob: hash(repository, 'added.txt') },
      {
        path: 'link',
        mode: '120000',
        blob: runGit(repository, ['rev-parse', ':link']),
      },
      { path: 'renamed-to.txt', mode: '100644', blob: hash(repository, 'renamed-to.txt') },
      { path: 'script.sh', mode: '100755', blob: hash(repository, 'script.sh') },
    ];

    write(repository, 'added.txt', 'unstaged replacement\n');
    write(repository, 'untracked.txt', 'reported only by working mode\n');

    expectCandidate(
      await runCandidateCli(repository, 'staged', base),
      { kind: 'staged', base, indexTree },
      expectedEntries,
    );
  });

  test('freezes tracked working bytes and reports new untracked paths separately', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    write(repository, 'removed.txt', 'removed\n');
    const base = commitAll(repository, 'initial');

    write(repository, 'tracked.txt', 'working bytes\n');
    rmSync(join(repository, 'removed.txt'));
    write(repository, 'new/untracked.txt', 'untracked bytes\n');

    const invocation = await runCandidateCli(repository, 'working', base);
    const stdout = invocation.stdout;
    const output = `${stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(0);
    const candidate = JSON.parse(stdout) as unknown;
    expect(candidate).toMatchObject({
      selection: {
        kind: 'working',
        base,
        trackedSnapshot: 'da04baf983ae5deca6bc925a2e328548c08fd0b9267599a432b3e36e9e3ed09f',
        untrackedSnapshot: '84a8646c0954c75e3df6609bf584f692e8976a5c56c4c1b3012d3b47bf95361c',
      },
      entries: [{ path: 'tracked.txt', mode: '100644', blob: hash(repository, 'tracked.txt') }],
      untracked: ['new/untracked.txt'],
    });
  });

  test('normalizes an interior repository path before snapshotting the whole working tree', async () => {
    const repository = createRepository();
    write(repository, 'root.txt', 'root committed\n');
    write(repository, 'nested/tracked.txt', 'nested committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'root.txt', 'root working\n');
    write(repository, 'nested/tracked.txt', 'nested working\n');
    write(repository, 'root-new.txt', 'root untracked\n');
    write(repository, 'nested/nested-new.txt', 'nested untracked\n');

    const invocation = await runCandidateCli(join(repository, 'nested'), 'working', base);
    const stdout = invocation.stdout;
    const output = `${stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(0);
    expect(JSON.parse(stdout) as unknown).toMatchObject({
      selection: { kind: 'working', base },
      entries: [
        {
          path: 'nested/tracked.txt',
          mode: '100644',
          blob: hash(repository, 'nested/tracked.txt'),
        },
        { path: 'root.txt', mode: '100644', blob: hash(repository, 'root.txt') },
      ],
      untracked: ['nested/nested-new.txt', 'root-new.txt'],
    });
  });

  test('refuses an index change while staged or working candidates are being read', async () => {
    for (const kind of ['staged', 'working'] as const) {
      const repository = createRepository();
      write(repository, 'tracked.txt', 'committed\n');
      const base = commitAll(repository, 'initial');
      write(repository, 'tracked.txt', 'staged\n');
      runGit(repository, ['add', 'tracked.txt']);

      const wrapperDirectory = join(repository, 'git-wrapper');
      const wrapperPath = join(wrapperDirectory, 'git');
      const markerPath = join(repository, 'first-write-tree');
      mkdirSync(wrapperDirectory);
      const realGit = Bun.which('git');
      expect(realGit).not.toBeNull();
      if (realGit === null) throw new Error('required git executable disappeared during test');
      writeFileSync(
        wrapperPath,
        `#!/bin/sh\nif [ "$3" = "write-tree" ] && [ -n "$GIT_INDEX_FILE" ] && [ ! -e "$WIKI_INDEX_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_INDEX_RACE_MARKER"\n  printf 'raced\\n' > "$2/raced.txt"\n  (unset GIT_INDEX_FILE; "$WIKI_REAL_GIT" -C "$2" add raced.txt)\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
        { mode: 0o755 },
      );

      const invocation = await runCandidateCli(repository, kind, base, {
        PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        WIKI_INDEX_RACE_MARKER: markerPath,
        WIKI_REAL_GIT: realGit,
      });
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(`Git index changed while selecting ${kind} candidate`);
    }
  });

  test('refuses an index removed after capture instead of selecting Git empty tree', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, '.git', 'index-removed');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "write-tree" ] && [ ! -e "$WIKI_INDEX_REMOVAL_MARKER" ]; then\n  rm "$2/.git/index"\n  : > "$WIKI_INDEX_REMOVAL_MARKER"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'staged', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_INDEX_REMOVAL_MARKER: markerPath,
      WIKI_REAL_GIT: realGit,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('absent required Git index during staged selection');
  });

  test('refuses tracked working bytes that change across snapshot passes', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'tracked.txt', 'first working bytes\n');

    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, 'working-write-tree');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "add" ] && [ "$4" = "--update" ] && [ ! -e "$WIKI_WORKING_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_WORKING_RACE_MARKER"\n  printf 'second working bytes\\n' > "$2/tracked.txt"\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
      WIKI_WORKING_RACE_MARKER: markerPath,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('working tree changed while selecting diagnostic candidate');
  });

  test('refuses untracked membership that changes across snapshot passes', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    write(repository, 'first-untracked.txt', 'first\n');

    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    const markerPath = join(repository, '.git', 'untracked-read');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-files" ] && [ "$4" = "--others" ] && [ ! -e "$WIKI_UNTRACKED_RACE_MARKER" ]; then\n  "$WIKI_REAL_GIT" "$@"\n  code=$?\n  : > "$WIKI_UNTRACKED_RACE_MARKER"\n  printf 'late\\n' > "$2/late-untracked.txt"\n  exit "$code"\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
      WIKI_UNTRACKED_RACE_MARKER: markerPath,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('working tree changed while selecting diagnostic candidate');
  });

  test('refuses an empty path record in malformed untracked output', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const base = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-files" ] && [ "$4" = "--others" ]; then\n  printf '%b' '\\000'\n  exit 0\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const invocation = await runCandidateCli(repository, 'working', base, {
      PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
      WIKI_REAL_GIT: realGit,
    });
    const output = `${invocation.stdout}${invocation.stderr}`;
    expect(invocation.exitCode, output).toBe(1);
    expect(output).toContain('malformed untracked path output: empty path record');
  });

  test('distinguishes absent, unreadable and malformed required index state without returning an empty inventory', async () => {
    const cases = ['absent', 'unreadable', 'malformed'] as const;

    for (const state of cases) {
      const repository = createRepository();
      write(repository, 'tracked.txt', 'committed\n');
      const base = commitAll(repository, 'initial');
      const indexPath = join(repository, '.git', 'index');
      const backupPath = join(repository, '.git', 'index.backup');
      copyFileSync(indexPath, backupPath);
      if (state === 'absent') rmSync(indexPath);
      if (state === 'unreadable') chmodSync(indexPath, 0o000);
      if (state === 'malformed') writeFileSync(indexPath, 'not a Git index', 'utf8');

      const invocation = await runCandidateCli(repository, 'staged', base);
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(`${state} required Git index`);

      if (state === 'unreadable') chmodSync(indexPath, 0o600);
      copyFileSync(backupPath, indexPath);
    }
  });

  test('refuses an absent revision distinctly from a non-repository path', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    commitAll(repository, 'initial');

    const absentRevision = await runCandidateCli(repository, 'committed', '0'.repeat(40));
    const absentOutput = `${absentRevision.stdout}${absentRevision.stderr}`;
    expect(absentRevision.exitCode, absentOutput).toBe(1);
    expect(absentOutput).toContain('absent committed revision');

    const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-not-repository-'));
    repositories.push(directory);
    const notRepository = await runCandidateCli(directory, 'committed', 'HEAD');
    const repositoryOutput = `${notRepository.stdout}${notRepository.stderr}`;
    expect(notRepository.exitCode, repositoryOutput).toBe(1);
    expect(repositoryOutput).toContain('not a readable Git repository');
  });

  test('refuses malformed or failed ls-tree output instead of substituting zero entries', async () => {
    const repository = createRepository();
    write(repository, 'tracked.txt', 'committed\n');
    const revision = commitAll(repository, 'initial');
    const wrapperDirectory = join(repository, 'git-wrapper');
    const wrapperPath = join(wrapperDirectory, 'git');
    mkdirSync(wrapperDirectory);
    const realGit = Bun.which('git');
    expect(realGit).not.toBeNull();
    if (realGit === null) throw new Error('required git executable disappeared during test');
    writeFileSync(
      wrapperPath,
      `#!/bin/sh\nif [ "$3" = "ls-tree" ]; then\n  case "$WIKI_TREE_FAULT" in\n    failed) printf 'injected ls-tree failure\\n' >&2; exit 17 ;;\n    unterminated) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\ttracked.txt'; exit 0 ;;\n    no-separator) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\000'; exit 0 ;;\n    bad-header) printf '%b' '100600 blob 1111111111111111111111111111111111111111\\ttracked.txt\\000'; exit 0 ;;\n    bad-kind) printf '%b' '100644 commit 1111111111111111111111111111111111111111\\ttracked.txt\\000'; exit 0 ;;\n    unsorted) printf '%b' '100644 blob 1111111111111111111111111111111111111111\\tz.txt\\000100644 blob 2222222222222222222222222222222222222222\\ta.txt\\000'; exit 0 ;;\n  esac\nfi\nexec "$WIKI_REAL_GIT" "$@"\n`,
      { mode: 0o755 },
    );

    const cases = [
      ['failed', 'cannot read immutable Git tree'],
      ['unterminated', 'missing NUL terminator'],
      ['no-separator', 'entry has no path separator'],
      ['bad-header', 'malformed git ls-tree output'],
      ['bad-kind', 'malformed git ls-tree object kind'],
    ] as const;
    for (const [fault, expected] of cases) {
      const invocation = await runCandidateCli(repository, 'committed', revision, {
        PATH: `${wrapperDirectory}${delimiter}${process.env['PATH'] ?? ''}`,
        WIKI_REAL_GIT: realGit,
        WIKI_TREE_FAULT: fault,
      });
      const output = `${invocation.stdout}${invocation.stderr}`;
      expect(invocation.exitCode, output).toBe(1);
      expect(output).toContain(expected);
    }
    // Proof: PR run 34694906449 timed this production path out at 5022.71ms under
    // Bun's 5-second default, after its child was still running (`Received: null`).
  }, 20_000);
});

test('submit-admission is an unknown command', () => {
  const repository = createRepository();
  write(repository, 'source.ts', 'export const source = 1;\n');
  const base = commitAll(repository, 'base');
  write(repository, 'packet.json', '{}\n');
  // Proof: restoring the route in cli.ts (importing Dash's moved store) made the cli.ts entry
  // print `admission packet base must be an object` instead of `unknown command`; restoring only
  // the bin.ts `validatorCommands` entry made the bin.ts entry dispatch to the validator and
  // exit `null` instead of 1 (2026-10-11).
  for (const entry of [cliPath, join(import.meta.dir, 'bin.ts')]) {
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        entry,
        'submit-admission',
        repository,
        join(repository, 'packet.json'),
        'staged',
        base,
      ],
      { stderr: 'pipe', stdout: 'pipe' },
    );
    expect(invocation.exitCode, entry).toBe(1);
    expect(invocation.stderr.toString('utf8'), entry).toContain(
      'unknown command: submit-admission',
    );
    expect(invocation.stdout.toString('utf8'), entry).toBe('');
  }
  expect(existsSync(join(repository, '.git', 'module-wiki'))).toBe(false);
});

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readSelectedBlob } from './read-blob';
import { type CandidateSnapshot, readCandidate } from './read-candidate';

const scratch: string[] = [];
const originalPath = process.env['PATH'];

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(invocation.exitCode, invocation.stderr.toString('utf8')).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

function createCandidate(): { repository: string; candidate: CandidateSnapshot } {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-blob-reader-'));
  scratch.push(repository);
  runGit(repository, ['init', '--quiet', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'reader@example.test']);
  runGit(repository, ['config', 'user.name', 'Reader Fixture']);
  mkdirSync(join(repository, 'docs'));
  writeFileSync(join(repository, 'alpha.txt'), 'alpha\n');
  writeFileSync(join(repository, 'docs', 'beta.md'), 'beta\n');
  writeFileSync(join(repository, 'docs', 'same.md'), 'beta\n');
  symlinkSync('alpha.txt', join(repository, 'link'));
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--quiet', '--message', 'fixture']);
  const revision = runGit(repository, ['rev-parse', 'HEAD']);
  return { repository, candidate: readCandidate(repository, { kind: 'committed', revision }) };
}

function blobOf(candidate: CandidateSnapshot, path: string): string {
  const entry = candidate.entries.find((selected) => selected.path === path);
  if (entry === undefined) throw new Error(`fixture entry absent: ${path}`);
  return entry.blob;
}

/**
 * Puts a `git` on PATH that logs each argument vector and, for `cat-file`, pipes the real batch
 * output through `filter` (a shell command reading stdin), so a test can corrupt the framing.
 */
function installGit(filter = 'cat', exitCode = 0): string {
  const directory = mkdtempSync(join(tmpdir(), 'tool-wiki-blob-reader-git-'));
  scratch.push(directory);
  const realGit = Bun.which('git');
  if (realGit === null) throw new Error('required git executable is absent');
  const log = join(directory, 'calls');
  writeFileSync(log, '');
  writeFileSync(
    join(directory, 'git'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> '${log}'`,
      `if [ "$3" = "cat-file" ]; then '${realGit}' "$@" | ${filter}; exit ${String(exitCode)}; fi`,
      `exec '${realGit}' "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(join(directory, 'git'), 0o755);
  process.env['PATH'] = `${directory}:${originalPath ?? ''}`;
  return log;
}

function catFileCalls(log: string): string[] {
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line.includes('cat-file'));
}

afterEach(() => {
  process.env['PATH'] = originalPath;
  for (const path of scratch.splice(0)) rmSync(path, { force: true, recursive: true });
});

test('reads every selected blob of one candidate in a single cat-file batch', () => {
  const { repository, candidate } = createCandidate();
  const log = installGit();

  const read = (path: string): string =>
    new TextDecoder().decode(
      readSelectedBlob(repository, candidate.entries, blobOf(candidate, path), path),
    );

  expect(read('alpha.txt')).toBe('alpha\n');
  expect(read('docs/beta.md')).toBe('beta\n');
  expect(read('docs/same.md')).toBe('beta\n');
  expect(read('link')).toBe('alpha.txt');
  expect(catFileCalls(log)).toEqual([`-C ${repository} cat-file --batch`]);
});

test('hands each caller its own copy of the selected bytes', () => {
  const { repository, candidate } = createCandidate();
  const blob = blobOf(candidate, 'alpha.txt');
  const first = readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt');
  first.fill(0);

  expect(
    new TextDecoder().decode(readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt')),
  ).toBe('alpha\n');
});

test('refuses a blob that is not part of the selected candidate', () => {
  const { repository, candidate } = createCandidate();

  expect(() =>
    readSelectedBlob(repository, candidate.entries, '0'.repeat(40), 'ghost.txt'),
  ).toThrow(`selected blob ${'0'.repeat(40)} for ghost.txt is not part of the selected candidate`);
});

test('refuses a missing object for its own path and still serves the others', () => {
  const { repository, candidate } = createCandidate();
  const blob = blobOf(candidate, 'alpha.txt');
  rmSync(join(repository, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));

  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt')).toThrow(
    `cannot read selected blob ${blob} for alpha.txt: missing from the repository`,
  );
  expect(
    new TextDecoder().decode(
      readSelectedBlob(
        repository,
        candidate.entries,
        blobOf(candidate, 'docs/beta.md'),
        'docs/beta.md',
      ),
    ),
  ).toBe('beta\n');
});

test('refuses batch bytes whose digest differs from the selected object identity', () => {
  const { repository, candidate } = createCandidate();
  // Same length, other bytes: only the digest binding can notice.
  installGit(`sed 's/^alpha$/ALPHA/'`);
  const blob = blobOf(candidate, 'alpha.txt');

  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'docs/beta.md')).toThrow(
    `batch read digest differs from the index for selected blob ${blob} at alpha.txt`,
  );
});

test('refuses a batch header that names another object type', () => {
  const { repository, candidate } = createCandidate();
  const blob = blobOf(candidate, 'docs/beta.md');
  installGit(`sed 's/^${blob} blob /${blob} tree /'`);

  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'docs/beta.md')).toThrow(
    `selected blob ${blob} for docs/beta.md is a tree, not a blob`,
  );
});

test('refuses a batch that ends inside a header or before the announced size', () => {
  const { repository, candidate } = createCandidate();
  // alpha.txt answers first: a 48-byte header, 6 bytes and a newline.
  for (const cut of [50, 60]) {
    installGit(`head -c ${String(cut)}`);
    const entries = [...candidate.entries];

    expect(() => readSelectedBlob(repository, entries, blobOf(candidate, 'link'), 'link')).toThrow(
      'git cat-file --batch output ended early',
    );
  }
});

test('refuses a batch answer that names another object', () => {
  const { repository, candidate } = createCandidate();
  const blob = blobOf(candidate, 'alpha.txt');
  installGit(`sed 's/^${blob} /${'0'.repeat(40)} /'`);

  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt')).toThrow(
    `git cat-file --batch answered ${blob} for alpha.txt with: ${'0'.repeat(40)} blob 6`,
  );
});

test('refuses a reader that exits early and does not start a second one', () => {
  const { repository, candidate } = createCandidate();
  const log = installGit('cat > /dev/null; echo "injected reader exit" >&2', 9);
  const blob = blobOf(candidate, 'alpha.txt');

  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt')).toThrow(
    'git cat-file --batch failed: injected reader exit',
  );
  expect(() => readSelectedBlob(repository, candidate.entries, blob, 'alpha.txt')).toThrow(
    'git cat-file --batch failed: injected reader exit',
  );
  expect(catFileCalls(log)).toHaveLength(1);
});

test('refuses output the batch did not ask for', () => {
  const { repository, candidate } = createCandidate();
  installGit(`sh -c 'cat; printf extra'`);

  expect(() =>
    readSelectedBlob(repository, candidate.entries, blobOf(candidate, 'link'), 'link'),
  ).toThrow('git cat-file --batch output has trailing bytes');
});

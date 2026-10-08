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
import { dirname, join, relative } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { ClassificationPolicy } from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { readOwnedReviewCandidate } from './review-selection-preparation';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const call = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (call.exitCode !== 0) throw new Error(call.stderr.toString());
  return call.stdout.toString().trim();
}

function candidateFixture(largeSource = false) {
  const repository = mkdtempSync(join(tmpdir(), 'review-candidate-'));
  roots.push(repository);
  git(repository, 'init', '--quiet');
  git(repository, 'config', 'user.email', 'test@example.invalid');
  git(repository, 'config', 'user.name', 'Test');
  writeFileSync(
    join(repository, 'README.md'),
    largeSource ? `# raw\n${'a'.repeat(150)}\n` : '# raw\n',
  );
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'base');
  const baseSha = git(repository, 'rev-parse', 'HEAD');
  writeFileSync(
    join(repository, 'source.ts'),
    largeSource ? `// ${'b'.repeat(150)}\n` : 'export const x = 1;\n',
  );
  git(repository, 'add', '--all');
  git(repository, 'commit', '--quiet', '-m', 'head');
  const headSha = git(repository, 'rev-parse', 'HEAD');
  const policyBytes = readFileSync(
    join(import.meta.dir, '..', 'contracts', 'fixtures', 'classification-policy.v1.json'),
  );
  const classificationPolicy = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(policyBytes.toString()),
  );
  const gitExecutablePath = '/usr/bin/git';
  return {
    repositoryId: 123,
    objectStorePath: join(repository, '.git'),
    gitExecutablePath,
    gitExecutableIdentity: hashBytes(readFileSync(gitExecutablePath)),
    headSha,
    baseSha,
    classificationPolicy,
    maximumPreparationMs: 10_000,
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 1024,
  };
}

function withPinnedGitScript(input: ReturnType<typeof candidateFixture>, body: string) {
  const gitExecutablePath = join(dirname(input.objectStorePath), 'pinned-git-test');
  writeFileSync(gitExecutablePath, `#!/bin/sh\n${body}\n`);
  chmodSync(gitExecutablePath, 0o700);
  return {
    ...input,
    gitExecutablePath,
    gitExecutableIdentity: hashBytes(readFileSync(gitExecutablePath)),
  };
}

function octalPrint(bytes: Uint8Array): string {
  return `printf '${[...bytes].map((byte) => `\\${byte.toString(8).padStart(3, '0')}`).join('')}'`;
}

function withTreeResponse(
  input: ReturnType<typeof candidateFixture>,
  records: { path: string; blob: string }[],
  failTree = false,
) {
  const bytes = Buffer.from(
    records.map(({ path, blob }) => `100644 blob ${blob}\t${path}\0`).join(''),
  );
  return withPinnedGitScript(
    input,
    `case " $* " in *" ls-tree "*) ${failTree ? 'exit 7' : octalPrint(bytes)} ;; *) exec /usr/bin/git "$@" ;; esac`,
  );
}

test('owned object store retains exact committed raw blobs and canonical candidate manifest', () => {
  const prepared = readOwnedReviewCandidate(candidateFixture());
  expect(prepared.manifest.entries.map(({ path }) => path)).toEqual(['README.md', 'source.ts']);
  const documentation = prepared.manifest.entries[0];
  expect(prepared.rawBlobs.get(documentation.rawIdentity)).toEqual(Buffer.from('# raw\n'));
  const source = prepared.manifest.entries[1];
  expect(source.rawIdentity).toBe(hashBytes('export const x = 1;\n'));
  expect(prepared.rawBlobs.get(source.rawIdentity)).toEqual(Buffer.from('export const x = 1;\n'));
  expect(prepared.manifestBytes).toBe(serializeCanonical(prepared.manifest));
  expect(prepared.snapshotIdentity).toBe(hashBytes(prepared.manifestBytes));
});

test('owned candidate reads committed objects despite mutable checkout drift', () => {
  const input = candidateFixture();
  writeFileSync(join(dirname(input.objectStorePath), 'source.ts'), 'uncommitted drift\n');
  const prepared = readOwnedReviewCandidate(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'source.ts');
  expect(source).toBeDefined();
  if (source === undefined) throw new Error('committed source is absent');
  expect(prepared.rawBlobs.get(source.rawIdentity)).toEqual(Buffer.from('export const x = 1;\n'));
});

test('owned candidate refuses a changed Git runtime, missing object store and wrong commit', () => {
  const input = candidateFixture();
  expect(() =>
    readOwnedReviewCandidate({ ...input, gitExecutableIdentity: 'a'.repeat(64) }),
  ).toThrow('runtime differs');
  expect(() =>
    readOwnedReviewCandidate({ ...input, objectStorePath: join(input.objectStorePath, 'missing') }),
  ).toThrow();
  expect(() => readOwnedReviewCandidate({ ...input, headSha: 'a'.repeat(40) })).toThrow();
});

test('owned candidate refuses a relative executable even when it resolves to pinned Git', () => {
  const input = candidateFixture();
  const gitExecutablePath = relative(process.cwd(), input.gitExecutablePath);
  expect(() => readOwnedReviewCandidate({ ...input, gitExecutablePath })).toThrow(
    'Git runtime pin is malformed',
  );
});

test('owned candidate refuses an executable symlink to correctly pinned Git', () => {
  const input = candidateFixture();
  const binDirectory = join(dirname(input.objectStorePath), 'runtime-bin');
  mkdirSync(binDirectory);
  const gitExecutablePath = join(binDirectory, 'git');
  symlinkSync(input.gitExecutablePath, gitExecutablePath);
  expect(() => readOwnedReviewCandidate({ ...input, gitExecutablePath })).toThrow(
    'Git runtime differs from installed pin',
  );
});

test('owned candidate refuses a relative object store that resolves to the real repository', () => {
  const input = candidateFixture();
  const objectStorePath = relative(process.cwd(), input.objectStorePath);
  expect(() => readOwnedReviewCandidate({ ...input, objectStorePath })).toThrow(
    'object store must be an owned directory',
  );
});

test('owned candidate refuses revision aliases and invalid installed limits', () => {
  const input = candidateFixture();
  expect(() => readOwnedReviewCandidate({ ...input, headSha: 'HEAD' })).toThrow(
    'commit identity is malformed',
  );
  expect(() => readOwnedReviewCandidate({ ...input, baseSha: 'HEAD' })).toThrow(
    'commit identity is malformed',
  );
  expect(() => readOwnedReviewCandidate({ ...input, repositoryId: 0 })).toThrow('repository ID');
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateEntries: 0 })).toThrow(
    'entry ceiling must be positive',
  );
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateBytes: 0 })).toThrow(
    'byte ceiling must be positive',
  );
  expect(() => readOwnedReviewCandidate({ ...input, maximumPreparationMs: 0 })).toThrow(
    'deadline must be positive',
  );
});

test('owned candidate refuses nonfinite installed preparation and inventory bounds', () => {
  const input = candidateFixture();
  expect(() => readOwnedReviewCandidate({ ...input, maximumPreparationMs: Number.NaN })).toThrow(
    'deadline must be positive',
  );
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateEntries: Number.NaN })).toThrow(
    'entry ceiling must be positive',
  );
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateBytes: Number.NaN })).toThrow(
    'byte ceiling must be positive',
  );
});

test('owned candidate refuses a nonfinite entry ceiling before publishing its full inventory', () => {
  const input = candidateFixture();
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateEntries: Number.NaN })).toThrow(
    'entry ceiling must be positive',
  );
});

test('owned candidate refuses entry and raw-byte ceilings without sampling', () => {
  const input = candidateFixture();
  expect(() => readOwnedReviewCandidate({ ...input, maximumCandidateEntries: 1 })).toThrow(
    'entry ceiling',
  );
  const large = candidateFixture(true);
  expect(() => readOwnedReviewCandidate({ ...large, maximumCandidateBytes: 256 })).toThrow(
    'byte ceiling',
  );
});

test('owned candidate refuses a deadline overrun after manifest construction', () => {
  const input = candidateFixture();
  const spawn = Bun.spawnSync.bind(Bun);
  let commands = 0;
  let lastCommandCompleted = false;
  const processCall = spyOn(Bun, 'spawnSync').mockImplementation((command, options) => {
    const response = spawn(command, options);
    commands += 1;
    if (commands === 6) lastCommandCompleted = true;
    return response;
  });
  const clock = spyOn(performance, 'now').mockImplementation(() =>
    lastCommandCompleted ? 10_001 : 0,
  );
  try {
    expect(() => readOwnedReviewCandidate(input)).toThrow('deadline exceeded');
    expect(commands).toBe(6);
  } finally {
    clock.mockRestore();
    processCall.mockRestore();
  }
});

test('owned candidate refuses before spawning when its preparation deadline is exhausted', () => {
  const input = candidateFixture();
  let reads = 0;
  const clock = spyOn(performance, 'now').mockImplementation(() => {
    reads += 1;
    return reads === 2 ? 10_000 : 0;
  });
  try {
    expect(() => readOwnedReviewCandidate(input)).toThrow('deadline exceeded');
  } finally {
    clock.mockRestore();
  }
});

test('owned candidate refuses a declared Gitlink even when its object can be read as a blob', () => {
  const input = candidateFixture();
  const repository = dirname(input.objectStorePath);
  const blob = git(repository, 'rev-parse', `${input.headSha}:README.md`);
  git(repository, 'update-index', '--add', '--cacheinfo', `160000,${blob},vendor`);
  git(repository, 'commit', '--quiet', '-m', 'gitlink');
  const headSha = git(repository, 'rev-parse', 'HEAD');
  const classificationPolicy = parseOrThrow(ClassificationPolicy, {
    ...input.classificationPolicy,
    gitlinkBoundaries: [
      {
        path: 'vendor',
        object: blob,
        boundaryId: 'vendor.test',
        repository: 'example.invalid/vendor',
      },
    ],
  });
  expect(() => readOwnedReviewCandidate({ ...input, headSha, classificationPolicy })).toThrow(
    'Gitlink is unresolved',
  );
});

test('owned candidate Git process ignores inherited object-directory configuration', () => {
  const input = candidateFixture();
  const foreignObjects = join(dirname(input.objectStorePath), 'foreign-objects');
  mkdirSync(foreignObjects);
  const previous = process.env['GIT_OBJECT_DIRECTORY'];
  process.env['GIT_OBJECT_DIRECTORY'] = foreignObjects;
  try {
    expect(readOwnedReviewCandidate(input).manifest.entries).toHaveLength(2);
  } finally {
    if (previous === undefined) delete process.env['GIT_OBJECT_DIRECTORY'];
    else process.env['GIT_OBJECT_DIRECTORY'] = previous;
  }
});

test('owned candidate refuses a symlink substituted for the object-store directory', () => {
  const input = candidateFixture();
  const alias = join(dirname(input.objectStorePath), 'object-store-alias');
  symlinkSync(input.objectStorePath, alias);
  expect(() => readOwnedReviewCandidate({ ...input, objectStorePath: alias })).toThrow(
    'owned directory',
  );
});

test('owned candidate refuses malformed, duplicate and reordered paths from a pinned Git response', () => {
  const input = candidateFixture();
  const repository = dirname(input.objectStorePath);
  const readme = git(repository, 'rev-parse', `${input.headSha}:README.md`);
  const source = git(repository, 'rev-parse', `${input.headSha}:source.ts`);
  expect(() =>
    readOwnedReviewCandidate(withTreeResponse(input, [{ path: '../README.md', blob: readme }])),
  ).toThrow();
  expect(() =>
    readOwnedReviewCandidate(
      withTreeResponse(input, [
        { path: 'README.md', blob: readme },
        { path: 'README.md', blob: readme },
      ]),
    ),
  ).toThrow('duplicate or not byte sorted');
  expect(() =>
    readOwnedReviewCandidate(
      withTreeResponse(input, [
        { path: 'source.ts', blob: source },
        { path: 'README.md', blob: readme },
      ]),
    ),
  ).toThrow('duplicate or not byte sorted');
});

test('owned candidate refuses a failed pinned Git tree read instead of an empty inventory', () => {
  const input = candidateFixture();
  expect(() => readOwnedReviewCandidate(withTreeResponse(input, [], true))).toThrow(
    'Git object read failed',
  );
});

test('owned candidate refuses an oversized pinned Git tree response', () => {
  const input = candidateFixture();
  const repository = dirname(input.objectStorePath);
  const blob = git(repository, 'rev-parse', `${input.headSha}:README.md`);
  const oversized = withTreeResponse(input, [
    { path: `${'a'.repeat(180)}.md`, blob },
    { path: `${'b'.repeat(180)}.md`, blob },
  ]);
  expect(() => readOwnedReviewCandidate({ ...oversized, maximumCandidateBytes: 256 })).toThrow(
    'Git object read failed',
  );
});

test('owned candidate rejects malformed object identities from a pinned Git process', () => {
  const input = candidateFixture();
  const repository = dirname(input.objectStorePath);
  const blob = git(repository, 'rev-parse', `${input.headSha}:README.md`);
  const tree = Buffer.from(`100644 blob ${blob}\tREADME.md\0`);
  const scripted = withPinnedGitScript(
    input,
    `case " $* " in *" rev-parse "*) printf 'bad\\n' ;; *" ls-tree "*) ${octalPrint(tree)} ;; *) exec /usr/bin/git "$@" ;; esac`,
  );
  expect(() => readOwnedReviewCandidate(scripted)).toThrow('Git object identity is malformed');
});

import * as filesystem from 'node:fs';
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { ClassificationPolicy } from '../contracts/records';
import { hashBytes, serializeCanonical } from '../evidence/content-manifest';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { installLocalReviewSource } from './review-selection-objects';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(repository: string, ...args: string[]): string {
  const invocation = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'review-owned-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'owned');
  mkdirSync(sourceRepository, { mode: 0o700 });
  mkdirSync(storeBase, { mode: 0o700 });
  chmodSync(storeBase, 0o700);
  git(sourceRepository, 'init', '--quiet');
  git(sourceRepository, 'config', 'user.email', 'test@example.invalid');
  git(sourceRepository, 'config', 'user.name', 'Test');
  writeFileSync(join(sourceRepository, 'README.md'), '# exact base\n');
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '--quiet', '-m', 'base');
  const baseSha = git(sourceRepository, 'rev-parse', 'HEAD');
  writeFileSync(join(sourceRepository, 'src.ts'), 'export const exact = 1;\n');
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '--quiet', '-m', 'head');
  const headSha = git(sourceRepository, 'rev-parse', 'HEAD');
  const pin = 'a'.repeat(64);
  const binding = validateGitHubRepositoryBinding({
    repositoryId: 123,
    owner: 'example',
    name: 'review',
    targetRef: 'refs/heads/main',
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    readDeadlineMs: 10_000,
  });
  const { request } = createActivationRequest({
    repositoryId: binding.repositoryId,
    subject: { kind: 'pull-request', number: 7 },
    targetRef: binding.targetRef,
    headSha,
    baseSha,
    policyIdentity: binding.policyIdentity,
    mappingIdentity: binding.mappingIdentity,
    toolkitIdentity: binding.toolkitIdentity,
    authorityIdentity: 'b'.repeat(64),
    auditGeneration: 1,
  });
  const classificationBytes = readFileSync(
    join(import.meta.dir, '..', 'contracts', 'fixtures', 'classification-policy.v1.json'),
  );
  const classificationPolicy = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(classificationBytes.toString()),
  );
  return {
    request,
    binding,
    sourceRepository,
    storeBase,
    classificationPolicy,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    maximumPreparationMs: 10_000,
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 1024,
  };
}

function read(input: ReturnType<typeof fixture>, snapshotIdentity: string) {
  const { request: _request, ...configuration } = input;
  return installLocalReviewSource(configuration).read(snapshotIdentity);
}

function prepare(input: ReturnType<typeof fixture>) {
  const { request, ...configuration } = input;
  return installLocalReviewSource(configuration).prepare(request);
}

test('installed local source snapshots repository and store roots before request preparation', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  const foreign = join(dirname(input.sourceRepository), 'foreign-source');
  mkdirSync(foreign, { mode: 0o700 });
  configuration.sourceRepository = foreign;
  configuration.storeBase = foreign;
  const prepared = installed.prepare(request);
  expect(prepared.readyDirectory.startsWith(input.storeBase)).toBe(true);
  expect(installed.read(prepared.snapshotIdentity).manifest.headSha).toBe(request.headSha);
  expect(readdirSync(foreign)).toEqual([]);
});

test('installed local source owns its nested repository binding after installation', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  expect(Object.isFrozen(input.binding)).toBe(false);
  input.binding.repositoryId = 456;
  const { requestIdentity: _identity, ...fields } = request;
  const foreign = createActivationRequest({ ...fields, repositoryId: 456 }).request;
  expect(() => installed.prepare(foreign)).toThrow('differs from installed repository binding');
  expect(readdirSync(input.storeBase)).toEqual([]);
  expect(installed.prepare(request).manifest.repositoryId).toBe(123);
});

test('installed local source owns its nested classification policy after installation', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  const sourceRule = input.classificationPolicy.contentRules.find(
    ({ contentClass }) => contentClass === 'source',
  );
  if (sourceRule === undefined) throw new Error('fixture source rule absent');
  expect(Object.isFrozen(sourceRule)).toBe(false);
  sourceRule.contentClass = 'test';
  const prepared = installed.prepare(request);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  expect(source?.classification).toEqual({ kind: 'content', contentClass: 'source' });
});

test('installation refuses missing source before any acquisition', () => {
  const input = fixture();
  expect(() =>
    installLocalReviewSource({ ...input, sourceRepository: join(input.storeBase, 'missing') }),
  ).toThrow();
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('installation refuses unreadable controller store before any acquisition', () => {
  const input = fixture();
  chmodSync(input.storeBase, 0o000);
  expect(() => installLocalReviewSource(input)).toThrow('private controller directory');
  chmodSync(input.storeBase, 0o700);
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('installation refuses a foreign-owner controller store metadata response', () => {
  const input = fixture();
  const original = filesystem.lstatSync;
  const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
    const entry = original(path);
    if (path === input.storeBase) entry.uid += 1;
    return entry;
  }) as typeof filesystem.lstatSync);
  try {
    expect(() => installLocalReviewSource(input)).toThrow('private controller directory');
    expect(readdirSync(input.storeBase)).toEqual([]);
  } finally {
    stat.mockRestore();
  }
});

test('preparation refuses a store made public after installation', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  chmodSync(input.storeBase, 0o755);
  expect(() => installed.prepare(request)).toThrow('private controller directory');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('preparation refuses a source replaced with a symlink after installation', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  const moved = join(dirname(input.sourceRepository), 'moved-source');
  renameSync(input.sourceRepository, moved);
  symlinkSync(moved, input.sourceRepository);
  expect(() => installed.prepare(request)).toThrow('configured Git repository');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('trusted local source is acquired into a private bare store and exact raw bytes survive restart', () => {
  const input = fixture();
  const prepared = prepare(input);
  const retained = read(input, prepared.snapshotIdentity);
  expect(retained.manifest.repositoryId).toBe(input.request.repositoryId);
  expect(retained.manifest.headSha).toBe(input.request.headSha);
  expect(retained.manifest.baseSha).toBe(input.request.baseSha);
  expect(retained.manifest.entries.map(({ path }) => path)).toEqual(['README.md', 'src.ts']);
  const source = retained.manifest.entries[1];
  expect(retained.rawBlobs.get(source.rawIdentity)).toEqual(
    Buffer.from('export const exact = 1;\n'),
  );
  expect(lstatSync(prepared.readyDirectory).mode & 0o777).toBe(0o700);
  writeFileSync(join(input.sourceRepository, 'src.ts'), 'uncommitted drift\n');
  expect(read(input, prepared.snapshotIdentity).rawBlobs.get(source.rawIdentity)).toEqual(
    Buffer.from('export const exact = 1;\n'),
  );
});

test('identical local acquisition replays the same immutable retained snapshot', () => {
  const input = fixture();
  const first = prepare(input);
  const second = prepare(input);
  expect(second.snapshotIdentity).toBe(first.snapshotIdentity);
  expect(second.readyDirectory).toBe(first.readyDirectory);
  expect(readdirSync(input.storeBase)).toEqual([`ready-${first.snapshotIdentity}`]);
});

test('ready replay retries parent-directory durability after a failed first sync', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const installed = installLocalReviewSource(configuration);
  const original = filesystem.fsyncSync;
  let baseCalls = 0;
  const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor: number) => {
    if (readlinkSync(`/proc/self/fd/${String(descriptor)}`) === input.storeBase) {
      baseCalls += 1;
      throw new Error('injected store-base durability failure');
    }
    original(descriptor);
  });
  try {
    expect(() => installed.prepare(request)).toThrow('store-base durability failure');
    expect(() => installed.prepare(request)).toThrow('store-base durability failure');
    expect(baseCalls).toBe(2);
  } finally {
    sync.mockRestore();
  }
  const prepared = installed.prepare(request);
  expect(installed.read(prepared.snapshotIdentity).manifestBytes).toBe(
    readFileSync(join(prepared.readyDirectory, 'manifest.json'), 'utf8'),
  );
  expect(readdirSync(input.storeBase)).toEqual([`ready-${prepared.snapshotIdentity}`]);
});

test.each([
  ['repositoryId', 456],
  ['targetRef', 'refs/heads/other'],
  ['policyIdentity', 'c'.repeat(64)],
  ['mappingIdentity', 'c'.repeat(64)],
  ['toolkitIdentity', 'c'.repeat(64)],
] as const)(
  'local acquisition refuses foreign installed %s before object creation',
  (field, foreign) => {
    const input = fixture();
    const binding = validateGitHubRepositoryBinding({ ...input.binding, [field]: foreign });
    expect(() => prepare({ ...input, binding })).toThrow(
      'differs from installed repository binding',
    );
    expect(readFileSync(join(input.sourceRepository, 'src.ts'), 'utf8')).toBe(
      'export const exact = 1;\n',
    );
  },
);

test('retained raw bytes refuse mutation and replay cannot repair conflicting content', () => {
  const input = fixture();
  const prepared = prepare(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source absent');
  const path = join(prepared.readyDirectory, 'sha256', source.rawIdentity);
  writeFileSync(path, 'export const exact = 2;\n');
  expect(() => read(input, prepared.snapshotIdentity)).toThrow('digest differs');
  expect(() => prepare(input)).toThrow('digest differs');
  expect(readFileSync(path, 'utf8')).toBe('export const exact = 2;\n');
});

test('retained raw bytes refuse missing and symlinked digest paths', () => {
  const input = fixture();
  const prepared = prepare(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source absent');
  const path = join(prepared.readyDirectory, 'sha256', source.rawIdentity);
  const foreign = join(input.sourceRepository, 'foreign');
  writeFileSync(foreign, 'export const exact = 1;\n');
  chmodSync(foreign, 0o600);
  unlinkSync(path);
  expect(() => read(input, prepared.snapshotIdentity)).toThrow();
  symlinkSync(foreign, path);
  expect(() => read(input, prepared.snapshotIdentity)).toThrow();
});

test.each(['maximumPreparationMs', 'maximumCandidateEntries', 'maximumCandidateBytes'] as const)(
  'acquisition refuses malformed installed %s before creating pending state',
  (field) => {
    const input = fixture();
    expect(() => prepare({ ...input, [field]: Number.NaN })).toThrow('must be positive');
    expect(readdirSync(input.storeBase)).toEqual([]);
  },
);

test('acquisition refuses a configured source symlink and keeps store empty', () => {
  const input = fixture();
  const alias = join(dirname(input.sourceRepository), 'alias');
  symlinkSync(input.sourceRepository, alias);
  expect(() => prepare({ ...input, sourceRepository: alias })).toThrow('configured Git repository');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('installation refuses a symlinked source Git metadata directory', () => {
  const input = fixture();
  const gitDirectory = join(input.sourceRepository, '.git');
  const moved = join(input.sourceRepository, '.git-owned');
  renameSync(gitDirectory, moved);
  symlinkSync(moved, gitDirectory);
  expect(() => installLocalReviewSource(input)).toThrow('configured Git repository');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses a relative path to correctly pinned Git', () => {
  const input = fixture();
  expect(() =>
    prepare({ ...input, gitExecutablePath: relative(process.cwd(), '/usr/bin/git') }),
  ).toThrow('runtime differs');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses a symlink to correctly pinned Git', () => {
  const input = fixture();
  const alias = join(dirname(input.sourceRepository), 'git-alias');
  symlinkSync('/usr/bin/git', alias);
  expect(() => prepare({ ...input, gitExecutablePath: alias })).toThrow('runtime differs');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses a changed pinned Git digest', () => {
  const input = fixture();
  const marker = join(dirname(input.sourceRepository), 'unpinned-git-ran');
  const executable = join(dirname(input.sourceRepository), 'unpinned-git');
  writeFileSync(executable, `#!/bin/sh\ntouch '${marker}'\nexec /usr/bin/git "$@"\n`, {
    mode: 0o700,
  });
  expect(() =>
    prepare({ ...input, gitExecutablePath: executable, gitExecutableIdentity: 'f'.repeat(64) }),
  ).toThrow('runtime differs');
  expect(existsSync(marker)).toBe(false);
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition disables lazy fetch in the pinned Git process', () => {
  const input = fixture();
  const executable = join(dirname(input.sourceRepository), 'pinned-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nif [ "$GIT_NO_LAZY_FETCH" != "1" ]; then exit 42; fi\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  const prepared = prepare({
    ...input,
    gitExecutablePath: executable,
    gitExecutableIdentity: hashBytes(readFileSync(executable)),
  });
  expect(prepared.manifest.entries).toHaveLength(2);
});

test('acquisition refuses nonzero pinned fetch even after objects were copied', () => {
  const input = fixture();
  const executable = join(dirname(input.sourceRepository), 'failing-fetch-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = fetch ]; then /usr/bin/git "$@"; exit 73; fi; done\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  expect(() =>
    prepare({
      ...input,
      gitExecutablePath: executable,
      gitExecutableIdentity: hashBytes(readFileSync(executable)),
    }),
  ).toThrow('Git operation failed');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses oversized pinned Git diagnostics before publication', () => {
  const input = fixture();
  const executable = join(dirname(input.sourceRepository), 'noisy-fetch-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = fetch ]; then /usr/bin/git "$@"; printf "%2048s" x >&2; exit 0; fi; done\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  expect(() =>
    prepare({
      ...input,
      gitExecutablePath: executable,
      gitExecutableIdentity: hashBytes(readFileSync(executable)),
    }),
  ).toThrow('exceeded bound');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses oversized pinned Git output before publication', () => {
  const input = fixture();
  const executable = join(dirname(input.sourceRepository), 'noisy-output-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = fetch ]; then /usr/bin/git "$@"; printf "%2048s" x; exit 0; fi; done\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  expect(() =>
    prepare({
      ...input,
      gitExecutablePath: executable,
      gitExecutableIdentity: hashBytes(readFileSync(executable)),
    }),
  ).toThrow('exceeded bound');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('local repository config cannot run an upload-pack hook during acquisition', () => {
  const input = fixture();
  const marker = join(dirname(input.sourceRepository), 'untrusted-hook-ran');
  const hook = join(dirname(input.sourceRepository), 'untrusted-hook');
  writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\nexit 75\n`, { mode: 0o700 });
  git(input.sourceRepository, 'config', 'uploadpack.packObjectsHook', hook);
  const prepared = prepare(input);
  expect(prepared.manifest.entries).toHaveLength(2);
  expect(existsSync(marker)).toBe(false);
});

test('a pre-existing retention lock refuses finalization and leaves its owner intact', () => {
  const input = fixture();
  const lock = join(input.storeBase, '.retain-lock');
  writeFileSync(lock, 'other-owner', { mode: 0o600 });
  expect(() => prepare(input)).toThrow();
  expect(readFileSync(lock, 'utf8')).toBe('other-owner');
  expect(readdirSync(input.storeBase)).toEqual(['.retain-lock']);
});

test('a symlink at the retention lock never replaces its target', () => {
  const input = fixture();
  const foreign = join(dirname(input.sourceRepository), 'foreign-lock');
  writeFileSync(foreign, 'foreign');
  symlinkSync(foreign, join(input.storeBase, '.retain-lock'));
  expect(() => prepare(input)).toThrow();
  expect(readFileSync(foreign, 'utf8')).toBe('foreign');
  expect(readdirSync(input.storeBase)).toEqual(['.retain-lock']);
});

test('lock release refuses a substituted lock inode without deleting the foreign owner', () => {
  const input = fixture();
  const lock = join(input.storeBase, '.retain-lock');
  const original = filesystem.renameSync;
  const rename = spyOn(filesystem, 'renameSync').mockImplementation(((
    source: string,
    destination: string,
  ) => {
    original(source, destination);
    if (destination.startsWith(join(input.storeBase, 'ready-'))) {
      unlinkSync(lock);
      writeFileSync(lock, 'foreign-owner', { mode: 0o600 });
    }
  }) as typeof filesystem.renameSync);
  try {
    expect(() => prepare(input)).toThrow('retention lock ownership changed');
    expect(readFileSync(lock, 'utf8')).toBe('foreign-owner');
  } finally {
    rename.mockRestore();
  }
});

test('lock cleanup failure preserves an earlier retained-content failure', () => {
  const input = fixture();
  const prepared = prepare(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source absent');
  writeFileSync(join(prepared.readyDirectory, 'sha256', source.rawIdentity), 'changed');
  const lock = join(input.storeBase, '.retain-lock');
  const original = filesystem.unlinkSync;
  const unlink = spyOn(filesystem, 'unlinkSync').mockImplementation(((path: string) => {
    if (path === lock) throw new Error('injected lock cleanup failure');
    original(path);
  }) as typeof filesystem.unlinkSync);
  try {
    let refusal: unknown;
    try {
      prepare(input);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError)) throw new Error('expected aggregate refusal');
    expect(refusal.errors.map(String).join(' | ')).toContain('digest differs');
    expect(refusal.errors.map(String).join(' | ')).toContain('injected lock cleanup failure');
  } finally {
    unlink.mockRestore();
  }
});

test('pending cleanup failure preserves an earlier Git acquisition failure', () => {
  const input = fixture();
  const request = createActivationRequest({
    repositoryId: input.request.repositoryId,
    subject: input.request.subject,
    targetRef: input.request.targetRef,
    headSha: 'f'.repeat(40),
    baseSha: input.request.baseSha,
    policyIdentity: input.request.policyIdentity,
    mappingIdentity: input.request.mappingIdentity,
    toolkitIdentity: input.request.toolkitIdentity,
    authorityIdentity: input.request.authorityIdentity,
    auditGeneration: input.request.auditGeneration,
  }).request;
  const original = filesystem.rmSync;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation(((
    path: string,
    options: unknown,
  ) => {
    if (path.startsWith(join(input.storeBase, '.pending-')) && !path.endsWith('/git'))
      throw new Error('injected pending cleanup failure');
    original(path, options);
  }) as typeof filesystem.rmSync);
  try {
    let refusal: unknown;
    try {
      prepare({ ...input, request });
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError)) throw new Error('expected aggregate refusal');
    expect(refusal.errors.map(String).join(' | ')).toContain('Git operation failed');
    expect(refusal.errors.map(String).join(' | ')).toContain('injected pending cleanup failure');
  } finally {
    remove.mockRestore();
  }
});

test('acquisition refuses when final pending cleanup consumes the whole deadline', () => {
  const input = fixture();
  const original = filesystem.rmSync;
  let expired = false;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation(((
    path: string,
    options: unknown,
  ) => {
    original(path, options);
    if (path.startsWith(join(input.storeBase, '.pending-')) && !path.endsWith('/git'))
      expired = true;
  }) as typeof filesystem.rmSync);
  const clock = spyOn(performance, 'now').mockImplementation(() => (expired ? 10_001 : 0));
  try {
    expect(() => prepare(input)).toThrow('deadline exceeded');
  } finally {
    clock.mockRestore();
    remove.mockRestore();
  }
});

test('deadline consumed in cleanup preserves the prior Git failure', () => {
  const input = fixture();
  const request = createActivationRequest({
    repositoryId: input.request.repositoryId,
    subject: input.request.subject,
    targetRef: input.request.targetRef,
    headSha: 'f'.repeat(40),
    baseSha: input.request.baseSha,
    policyIdentity: input.request.policyIdentity,
    mappingIdentity: input.request.mappingIdentity,
    toolkitIdentity: input.request.toolkitIdentity,
    authorityIdentity: input.request.authorityIdentity,
    auditGeneration: input.request.auditGeneration,
  }).request;
  const original = filesystem.rmSync;
  let expired = false;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation(((
    path: string,
    options: unknown,
  ) => {
    original(path, options);
    if (path.startsWith(join(input.storeBase, '.pending-')) && !path.endsWith('/git'))
      expired = true;
  }) as typeof filesystem.rmSync);
  const clock = spyOn(performance, 'now').mockImplementation(() => (expired ? 10_001 : 0));
  try {
    let refusal: unknown;
    try {
      prepare({ ...input, request });
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toBeInstanceOf(AggregateError);
    if (!(refusal instanceof AggregateError)) throw new Error('expected aggregate refusal');
    expect(refusal.errors.map(String).join(' | ')).toContain('Git operation failed');
    expect(refusal.errors.map(String).join(' | ')).toContain('deadline exceeded');
  } finally {
    clock.mockRestore();
    remove.mockRestore();
  }
});

test('ambient Git object overrides cannot redirect acquired objects', () => {
  const input = fixture();
  const emptyObjects = join(dirname(input.sourceRepository), 'empty-objects');
  mkdirSync(emptyObjects, { mode: 0o700 });
  const prior = process.env.GIT_OBJECT_DIRECTORY;
  process.env.GIT_OBJECT_DIRECTORY = emptyObjects;
  try {
    const prepared = prepare(input);
    expect(prepared.manifest.entries).toHaveLength(2);
  } finally {
    if (prior === undefined) delete process.env.GIT_OBJECT_DIRECTORY;
    else process.env.GIT_OBJECT_DIRECTORY = prior;
  }
});

test('retained raw bytes refuse group-readable mode', () => {
  const input = fixture();
  const prepared = prepare(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source absent');
  chmodSync(join(prepared.readyDirectory, 'sha256', source.rawIdentity), 0o640);
  expect(() => read(input, prepared.snapshotIdentity)).toThrow('metadata differs');
});

test('retained raw bytes refuse an added hard link', () => {
  const input = fixture();
  const prepared = prepare(input);
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source absent');
  linkSync(
    join(prepared.readyDirectory, 'sha256', source.rawIdentity),
    join(input.storeBase, 'foreign-link'),
  );
  expect(() => read(input, prepared.snapshotIdentity)).toThrow('metadata differs');
});

test('retained raw bytes refuse foreign-owner inode metadata', () => {
  const input = fixture();
  const prepared = prepare(input);
  const original = filesystem.fstatSync;
  let reads = 0;
  const stat = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
    const entry = original(descriptor);
    reads += 1;
    if (reads === 2) entry.uid += 1;
    return entry;
  }) as typeof filesystem.fstatSync);
  try {
    expect(() => read(input, prepared.snapshotIdentity)).toThrow('metadata differs');
  } finally {
    stat.mockRestore();
  }
});

test('retained snapshot refuses a ready directory reported as a non-directory', () => {
  const input = fixture();
  const prepared = prepare(input);
  const original = filesystem.lstatSync;
  const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
    const entry = original(path);
    if (path === prepared.readyDirectory) entry.isDirectory = () => false;
    return entry;
  }) as typeof filesystem.lstatSync);
  try {
    expect(() => read(input, prepared.snapshotIdentity)).toThrow('private controller directory');
  } finally {
    stat.mockRestore();
  }
});

test('retained raw path refuses FIFO without waiting for a writer', () => {
  const input = fixture();
  writeFileSync(join(input.sourceRepository, 'empty.ts'), '');
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'empty');
  const request = createActivationRequest({
    repositoryId: input.request.repositoryId,
    subject: input.request.subject,
    targetRef: input.request.targetRef,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
    baseSha: input.request.baseSha,
    policyIdentity: input.request.policyIdentity,
    mappingIdentity: input.request.mappingIdentity,
    toolkitIdentity: input.request.toolkitIdentity,
    authorityIdentity: input.request.authorityIdentity,
    auditGeneration: input.request.auditGeneration,
  }).request;
  const prepared = prepare({ ...input, request });
  const source = prepared.manifest.entries.find(({ path }) => path === 'empty.ts');
  if (source === undefined) throw new Error('fixture source absent');
  const path = join(prepared.readyDirectory, 'sha256', source.rawIdentity);
  unlinkSync(path);
  const invocation = Bun.spawnSync(['/usr/bin/mkfifo', path]);
  expect(invocation.exitCode).toBe(0);
  chmodSync(path, 0o600);
  expect(() => read(input, prepared.snapshotIdentity)).toThrow('metadata differs');
});

test('oversized canonical manifest refuses before durable publication', () => {
  const input = fixture();
  const many = join(input.sourceRepository, 'many');
  mkdirSync(many);
  for (let index = 0; index < 600; index += 1)
    writeFileSync(join(many, `${index.toString().padStart(4, '0')}.ts`), 'x');
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'many');
  const headSha = git(input.sourceRepository, 'rev-parse', 'HEAD');
  const request = createActivationRequest({
    repositoryId: input.request.repositoryId,
    subject: input.request.subject,
    targetRef: input.request.targetRef,
    headSha,
    baseSha: input.request.baseSha,
    policyIdentity: input.request.policyIdentity,
    mappingIdentity: input.request.mappingIdentity,
    toolkitIdentity: input.request.toolkitIdentity,
    authorityIdentity: input.request.authorityIdentity,
    auditGeneration: input.request.auditGeneration,
  }).request;
  let refusal: unknown;
  try {
    installLocalReviewSource({
      ...input,
      maximumCandidateEntries: 1000,
      maximumCandidateBytes: 1_000_000,
    }).prepare(request);
  } catch (cause) {
    refusal = cause;
  }
  expect(readdirSync(input.storeBase)).toEqual([]);
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('expected oversized-manifest refusal');
  expect(refusal.message).toContain('manifest exceeds');
});

test('zero-byte filesystem write refuses instead of looping during retention', () => {
  const input = fixture();
  const write = spyOn(filesystem, 'writeSync').mockImplementation(() => 0);
  try {
    expect(() => prepare(input)).toThrow('short write');
    expect(readdirSync(input.storeBase)).toEqual([]);
  } finally {
    write.mockRestore();
  }
});

test('raw-blob fsync failure refuses before publishing ready state', () => {
  const input = fixture();
  const original = filesystem.fsyncSync;
  const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor: number) => {
    if (readlinkSync(`/proc/self/fd/${String(descriptor)}`).includes('/sha256/'))
      throw new Error('injected raw fsync failure');
    original(descriptor);
  });
  try {
    expect(() => prepare(input)).toThrow('injected raw fsync failure');
    expect(readdirSync(input.storeBase)).toEqual([]);
  } finally {
    sync.mockRestore();
  }
});

test.each(['raw-write', 'raw-read', 'blob-directory'] as const)(
  '%s primary and close failures retain both causes',
  (operation) => {
    const input = fixture();
    const prepared = operation === 'raw-read' ? prepare(input) : undefined;
    const originalSync = filesystem.fsyncSync;
    const originalRead = filesystem.readSync;
    const originalClose = filesystem.closeSync;
    const selected = (descriptor: number): boolean => {
      const path = readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      return operation === 'blob-directory' ? path.endsWith('/sha256') : path.includes('/sha256/');
    };
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor: number) => {
      if (operation !== 'raw-read' && selected(descriptor)) throw new Error('primary sync failure');
      originalSync(descriptor);
    });
    const reading = spyOn(filesystem, 'readSync').mockImplementation(((
      descriptor: number,
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
    ) => {
      if (operation === 'raw-read' && selected(descriptor)) throw new Error('primary read failure');
      return originalRead(descriptor, buffer, offset, length, position);
    }) as typeof filesystem.readSync);
    const close = spyOn(filesystem, 'closeSync').mockImplementation((descriptor: number) => {
      const matches = selected(descriptor);
      originalClose(descriptor);
      if (matches) throw new Error('secondary close failure');
    });
    try {
      let refusal: unknown;
      try {
        if (prepared === undefined) prepare(input);
        else read(input, prepared.snapshotIdentity);
      } catch (cause) {
        refusal = cause;
      }
      expect(refusal).toBeInstanceOf(AggregateError);
      if (!(refusal instanceof AggregateError)) throw new Error('expected aggregate refusal');
      expect(refusal.errors.map(String).join(' | ')).toContain(
        operation === 'raw-read' ? 'primary read failure' : 'primary sync failure',
      );
      expect(refusal.errors.map(String).join(' | ')).toContain('secondary close failure');
    } finally {
      close.mockRestore();
      reading.mockRestore();
      sync.mockRestore();
    }
  },
);

test.each(['blob-directory', 'pending-directory', 'store-base'] as const)(
  '%s fsync failure refuses durable acquisition',
  (stage) => {
    const input = fixture();
    const original = filesystem.fsyncSync;
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor: number) => {
      const path = readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      const matches =
        stage === 'blob-directory'
          ? path.endsWith('/sha256')
          : stage === 'pending-directory'
            ? path.startsWith(join(input.storeBase, '.pending-')) &&
              !path.slice(join(input.storeBase, '.pending-').length).includes('/')
            : path === input.storeBase;
      if (matches) throw new Error(`injected ${stage} fsync failure`);
      original(descriptor);
    });
    try {
      expect(() => prepare(input)).toThrow(`injected ${stage} fsync failure`);
      if (stage !== 'store-base') expect(readdirSync(input.storeBase)).toEqual([]);
    } finally {
      sync.mockRestore();
    }
  },
);

test('atomic rename failure leaves no ready or pending directory', () => {
  const input = fixture();
  const original = filesystem.renameSync;
  const rename = spyOn(filesystem, 'renameSync').mockImplementation(((
    source: string,
    destination: string,
  ) => {
    if (destination.startsWith(join(input.storeBase, 'ready-')))
      throw new Error('injected atomic rename failure');
    original(source, destination);
  }) as typeof filesystem.renameSync);
  try {
    expect(() => prepare(input)).toThrow('injected atomic rename failure');
    expect(readdirSync(input.storeBase)).toEqual([]);
  } finally {
    rename.mockRestore();
  }
});

test('retained manifest refuses noncanonical bytes even under their matching digest', () => {
  const input = fixture();
  const prepared = prepare(input);
  const original = readFileSync(join(prepared.readyDirectory, 'manifest.json'), 'utf8');
  const noncanonical = JSON.stringify(JSON.parse(original), null, 2);
  const identity = hashBytes(Buffer.from(noncanonical));
  const altered = join(input.storeBase, `ready-${identity}`);
  cpSync(prepared.readyDirectory, altered, { recursive: true });
  writeFileSync(join(altered, 'manifest.json'), noncanonical);
  expect(() => read(input, identity)).toThrow('not canonical');
});

test('retained manifest refuses canonical but undeclared classification', () => {
  const input = fixture();
  const prepared = prepare(input);
  const alteredManifest = structuredClone(prepared.manifest);
  alteredManifest.entries[1].classification = {
    kind: 'content',
    contentClass: 'foreign',
  } as (typeof alteredManifest.entries)[number]['classification'];
  const bytes = serializeCanonical(alteredManifest);
  const identity = hashBytes(Buffer.from(bytes));
  const altered = join(input.storeBase, `ready-${identity}`);
  cpSync(prepared.readyDirectory, altered, { recursive: true });
  writeFileSync(join(altered, 'manifest.json'), bytes);
  expect(() => read(input, identity)).toThrow();
});

test('retained manifest refuses a different canonical repository binding at the old digest', () => {
  const input = fixture();
  const prepared = prepare(input);
  writeFileSync(
    join(prepared.readyDirectory, 'manifest.json'),
    serializeCanonical({ ...prepared.manifest, repositoryId: 999 }),
  );
  expect(() => read(input, prepared.snapshotIdentity)).toThrow('digest differs');
});

test.each(['duplicate', 'reordered'] as const)(
  'retained manifest refuses canonical %s paths',
  (fault) => {
    const input = fixture();
    const prepared = prepare(input);
    const alteredManifest = structuredClone(prepared.manifest);
    if (fault === 'duplicate') alteredManifest.entries.splice(1, 0, alteredManifest.entries[0]);
    else alteredManifest.entries.reverse();
    const bytes = serializeCanonical(alteredManifest);
    const identity = hashBytes(Buffer.from(bytes));
    const altered = join(input.storeBase, `ready-${identity}`);
    cpSync(prepared.readyDirectory, altered, { recursive: true });
    writeFileSync(join(altered, 'manifest.json'), bytes);
    expect(() => read(input, identity)).toThrow('duplicate or out of order');
  },
);

test('retained reread refuses aggregate bytes exceeding the installed bound', () => {
  const input = fixture();
  const prepared = prepare(input);
  const { request: _request, ...configuration } = input;
  const installed = installLocalReviewSource({ ...configuration, maximumCandidateBytes: 30 });
  expect(() => installed.read(prepared.snapshotIdentity)).toThrow('byte ceiling exceeded');
});

import * as crypto from 'node:crypto';
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
import * as judge from '@twilight-burokrat/judge';
import {
  ClassificationPolicy,
  hashBytes,
  RelationshipRequest,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import {
  deriveHistoricalSelections,
  hashGitObject,
  type RetainedHistoryManifest,
} from './review-selection-history';
import { installLocalReviewSource } from './review-selection-objects';
import * as reviewPreparation from './review-selection-preparation';

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

function fixture(gitObjectFormat: 'sha1' | 'sha256' = 'sha1') {
  const root = mkdtempSync(join(tmpdir(), 'review-owned-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'owned');
  mkdirSync(sourceRepository, { mode: 0o700 });
  mkdirSync(storeBase, { mode: 0o700 });
  chmodSync(storeBase, 0o700);
  git(sourceRepository, 'init', '--quiet', `--object-format=${gitObjectFormat}`);
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
    join(
      import.meta.dir,
      '../../../../twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
    ),
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
    gitObjectFormat,
    maximumPreparationMs: 10_000,
    monotonic: monotonicClock(),
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 1024,
    maximumParserReads: 100,
    maximumParserReadBytes: 10_000,
  };
}

function pinGitWithoutMaintenance(input: ReturnType<typeof fixture>) {
  const executable = join(dirname(input.sourceRepository), 'maintenance-free-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nfetch=0; disabled=0\nfor arg in "$@"; do case "$arg" in fetch) fetch=1;; --no-auto-maintenance) disabled=1;; esac; done\nif [ "$fetch" = 1 ] && [ "$disabled" != 1 ]; then exit 42; fi\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  return {
    gitExecutablePath: executable,
    gitExecutableIdentity: hashBytes(readFileSync(executable)),
  };
}

test('acquisition disables automatic maintenance in the pinned Git fetch', () => {
  const input = fixture();
  expect(prepare({ ...input, ...pinGitWithoutMaintenance(input) }).manifest.entries).toHaveLength(
    2,
  );
});

test.each(['sha1', 'sha256'] as const)(
  'owned %s object store prepares, reopens, and reads real Git objects',
  (format) => {
    const input = fixture(format);
    const { request, ...configuration } = input;
    const owner = installLocalReviewSource(configuration);
    const prepared = owner.prepare(request);
    const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
    if (source === undefined) throw new Error('fixture source absent');
    expect(prepared.manifest.headSha).toHaveLength(format === 'sha1' ? 40 : 64);
    rmSync(input.sourceRepository, { recursive: true });
    const candidate = owner.open(request, prepared.snapshotIdentity);
    expect(candidate.read(source.path, source.gitObjectId, source.rawIdentity)).toEqual(
      Buffer.from('export const exact = 1;\n'),
    );
  },
);

test('retained declaration selects a third exact historical commit without reading its current path', () => {
  const input = fixture();
  const historical = git(input.sourceRepository, 'rev-parse', 'HEAD');
  const oldBlob = git(input.sourceRepository, 'rev-parse', `${historical}:src.ts`);
  writeFileSync(join(input.sourceRepository, 'src.ts'), 'export const exact = 2;\n');
  writeFileSync(
    join(input.sourceRepository, 'history.json'),
    JSON.stringify({
      schemaVersion: 1,
      declarationId: 'history',
      selectorVersion: 1,
      coverage: 'selected-facts-only',
      facts: [
        {
          factId: 'old-source',
          family: 'generated',
          kind: 'generated-blob',
          at: { kind: 'historical', revision: historical },
          path: 'src.ts',
          expectedBlob: oldBlob,
        },
      ],
      edges: [],
    }),
  );
  symlinkSync('history.json', join(input.sourceRepository, 'history-link.json'));
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'head with declaration');
  const { requestIdentity: _identity, schemaVersion: _version, ...requestFields } = input.request;
  const request = createActivationRequest({
    ...requestFields,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
  }).request;
  const { request: _request, ...configuration } = input;
  const relationshipRequest = parseOrThrow(RelationshipRequest, {
    schemaVersion: 1,
    declarationPaths: ['history-link.json'],
    typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src.ts'] },
  });
  const owner = installLocalReviewSource({
    ...configuration,
    ...pinGitWithoutMaintenance(input),
    maximumCandidateBytes: 8192,
    history: {
      request: relationshipRequest,
      policyIdentity: 'c'.repeat(64),
      maximumDeclarationPaths: 1,
      maximumDeclarationBytes: 4096,
      maximumDeclarationFacts: 1,
      maximumHistoricalSelections: 1,
      maximumHistoricalRevisions: 1,
      maximumHistoricalTreeDepth: 8,
      maximumHistoricalProofEdges: 8,
      maximumRetainedObjects: 100,
      maximumObjectBytes: 8192,
      maximumRetainedBytes: 16384,
      maximumHistoricalManifestBytes: 8192,
      assertOwner: () => undefined,
    },
  });
  const prepared = owner.prepare(request);
  rmSync(input.sourceRepository, { recursive: true });
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  expect(candidate.readHistorical(historical, 'src.ts')).toEqual(
    Buffer.from('export const exact = 1;\n'),
  );
  const bytes = candidate.readHistorical(historical, 'src.ts');
  bytes.fill(0);
  expect(candidate.readHistorical(historical, 'src.ts')).toEqual(
    Buffer.from('export const exact = 1;\n'),
  );
  expect(Object.isFrozen(candidate.history)).toBe(true);
  const historyIdentity = prepared.manifest.entries.find(
    ({ path }) => path === 'history.json',
  )?.rawIdentity;
  if (historyIdentity === undefined) throw new Error('fixture history declaration is absent');
  expect(
    deriveHistoricalSelections(candidate, relationshipRequest, {
      maximumDeclarationPaths: 1,
      maximumDeclarationBytes: 4096,
      maximumDeclarationFacts: 1,
      maximumHistoricalSelections: 1,
    }),
  ).toEqual([
    {
      revision: historical,
      path: 'src.ts',
      uses: [
        {
          declarationPath: 'history-link.json',
          declarationIdentity: historyIdentity,
          factId: 'old-source',
        },
      ],
    },
  ]);
});

test('installed owner opens an exact retained candidate after the source checkout is removed', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  rmSync(input.sourceRepository, { recursive: true });
  const open = Reflect.get(owner, 'open');
  expect(typeof open).toBe('function');
  const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw new Error('injected forbidden Git invocation after retention');
  });
  let candidate: ReturnType<typeof owner.open>;
  try {
    candidate = open(request, prepared.snapshotIdentity);
  } finally {
    spawn.mockRestore();
  }
  const source = prepared.manifest.entries.find(({ path }) => path === 'src.ts');
  if (source === undefined) throw new Error('fixture source tuple absent');
  const expected = Buffer.from('export const exact = 1;\n');
  expect(candidate.snapshot.selection).toEqual({
    kind: 'committed',
    revision: request.headSha,
    tree: prepared.manifest.tree,
  });
  expect(candidate.read(source.path, source.gitObjectId, source.rawIdentity)).toEqual(expected);
  const readBlob = Reflect.get(candidate, 'readBlob');
  expect(typeof readBlob).toBe('function');
  expect(readBlob(source.gitObjectId, source.path)).toEqual(expected);
  expect(Object.isFrozen(candidate.snapshot.entries[1])).toBe(true);
  const borrowed = candidate.read(source.path, source.gitObjectId, source.rawIdentity);
  borrowed[0] = 0;
  expect(candidate.read(source.path, source.gitObjectId, source.rawIdentity)).toEqual(expected);
});

test('retained owner refuses a missing raw-map dependency before constructing a candidate', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const identity = prepared.manifest.entries.at(1)?.rawIdentity;
  if (identity === undefined) throw new Error('fixture raw identity absent');
  const original = Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value as (
    this: Map<unknown, unknown>,
    key: unknown,
  ) => unknown;
  const lookup = spyOn(Map.prototype, 'get').mockImplementation(function (
    this: Map<unknown, unknown>,
    key,
  ) {
    if (key === identity) return undefined;
    return original.call(this, key);
  });
  try {
    expect(() => owner.open(request, prepared.snapshotIdentity)).toThrow('raw blob absent');
  } finally {
    lookup.mockRestore();
  }
});

test('retained owner refuses a missing classification tuple dependency', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const original = Object.getOwnPropertyDescriptor(Map.prototype, 'get')?.value as (
    this: Map<unknown, unknown>,
    key: unknown,
  ) => unknown;
  const lookup = spyOn(Map.prototype, 'get').mockImplementation(function (
    this: Map<unknown, unknown>,
    key,
  ) {
    if (key === 'src.ts') return undefined;
    return original.call(this, key);
  });
  try {
    expect(() => owner.open(request, prepared.snapshotIdentity)).toThrow(
      'classification tuple differs',
    );
  } finally {
    lookup.mockRestore();
  }
});

function republishManifest(
  input: ReturnType<typeof fixture>,
  prepared: ReturnType<ReturnType<typeof installLocalReviewSource>['prepare']>,
  manifest: typeof prepared.manifest,
): string {
  const bytes = serializeCanonical(manifest);
  const identity = hashBytes(Buffer.from(bytes));
  const ready = join(input.storeBase, `ready-${identity}`);
  cpSync(prepared.readyDirectory, ready, { recursive: true });
  writeFileSync(join(ready, 'manifest.json'), bytes);
  return identity;
}

test('retained owner refuses a canonical tuple naming the wrong Git blob object', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const altered = structuredClone(prepared.manifest);
  altered.entries[1].gitObjectId = 'f'.repeat(40);
  const identity = republishManifest(input, prepared, altered);
  expect(() => owner.open(request, identity)).toThrow('object identity differs');
});

test('retained owner refuses a canonical reclassification while raw bytes stay exact', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const altered = structuredClone(prepared.manifest);
  altered.entries[1].classification = { kind: 'content', contentClass: 'test' };
  const identity = republishManifest(input, prepared, altered);
  expect(() => owner.open(request, identity)).toThrow('classification differs');
});

test('retained owner refuses a different request head and installed policy pin', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const { requestIdentity: _identity, ...fields } = request;
  const moved = createActivationRequest({ ...fields, headSha: request.baseSha }).request;
  expect(() => owner.open(moved, prepared.snapshotIdentity)).toThrow('manifest differs');
  const foreign = createActivationRequest({
    ...fields,
    policyIdentity: 'c'.repeat(64),
  }).request;
  expect(() => owner.open(foreign, prepared.snapshotIdentity)).toThrow('installed binding');
});

test.each([
  'repositoryId',
  'targetRef',
  'policyIdentity',
  'mappingIdentity',
  'toolkitIdentity',
] as const)('retained owner rejects foreign installed %s before opening', (field) => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const { requestIdentity: _identity, ...fields } = request;
  const foreign = createActivationRequest({
    ...fields,
    [field]:
      field === 'repositoryId'
        ? 456
        : field === 'targetRef'
          ? 'refs/heads/foreign'
          : 'c'.repeat(64),
  }).request;
  const identity =
    field === 'repositoryId'
      ? republishManifest(input, prepared, { ...prepared.manifest, repositoryId: 456 })
      : prepared.snapshotIdentity;
  expect(() => owner.open(foreign, identity)).toThrow('installed binding');
});

test.each(['repositoryId', 'headSha', 'baseSha'] as const)(
  'retained owner rejects a canonical manifest with foreign %s',
  (field) => {
    const input = fixture();
    const { request, ...configuration } = input;
    const owner = installLocalReviewSource(configuration);
    const prepared = owner.prepare(request);
    const altered = structuredClone(prepared.manifest);
    if (field === 'repositoryId') altered.repositoryId = 456;
    else altered[field] = 'f'.repeat(40);
    const identity = republishManifest(input, prepared, altered);
    expect(() => owner.open(request, identity)).toThrow('manifest differs');
  },
);

test('retained owner refuses an installed Git format different from its pinned commit and tree', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const altered = { ...prepared.manifest, entries: [] };
  const identity = republishManifest(input, prepared, altered);
  const sha256Owner = installLocalReviewSource({ ...configuration, gitObjectFormat: 'sha256' });
  expect(() => sha256Owner.open(request, identity)).toThrow('Git format differs');
});

test.each(['tree', 'headSha', 'baseSha'] as const)(
  'retained owner independently refuses a wrong-format %s',
  (field) => {
    const input = fixture();
    const { request, ...configuration } = input;
    const originalOwner = installLocalReviewSource(configuration);
    const prepared = originalOwner.prepare(request);
    const altered = {
      ...prepared.manifest,
      headSha: 'a'.repeat(64),
      baseSha: 'b'.repeat(64),
      tree: 'c'.repeat(64),
      entries: [],
    };
    altered[field] = 'f'.repeat(40);
    const identity = republishManifest(input, prepared, altered);
    const { requestIdentity: _identity, ...fields } = request;
    const matchingRequest = createActivationRequest({
      ...fields,
      headSha: altered.headSha,
      baseSha: altered.baseSha,
    }).request;
    const owner = installLocalReviewSource({ ...configuration, gitObjectFormat: 'sha256' });
    expect(() => owner.open(matchingRequest, identity)).toThrow('Git format differs');
  },
);

test('retained owner rejects unsupported installed Git object format before acquisition', () => {
  const input = fixture();
  const malformed = {
    ...input,
    gitObjectFormat: 'sha512',
  } as unknown as Parameters<typeof installLocalReviewSource>[0];
  expect(() => installLocalReviewSource(malformed)).toThrow('unsupported');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('acquisition refuses a reader returning a wrong Git object format before ready publication', () => {
  const input = fixture('sha256');
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const originalReader = reviewPreparation.readOwnedReviewCandidate;
  const reader = spyOn(reviewPreparation, 'readOwnedReviewCandidate').mockImplementation(
    (selection) => {
      const candidate = originalReader(selection);
      const manifest = { ...candidate.manifest, tree: 'a'.repeat(40) };
      const manifestBytes = serializeCanonical(manifest);
      return {
        ...candidate,
        manifest,
        manifestBytes,
        snapshotIdentity: hashBytes(Buffer.from(manifestBytes)),
      };
    },
  );
  try {
    expect(() => owner.prepare(request)).toThrow('Git format differs');
  } finally {
    reader.mockRestore();
  }
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test.each(['maximumParserReads', 'maximumParserReadBytes'] as const)(
  'retained owner refuses invalid installed %s before acquisition',
  (field) => {
    const input = fixture();
    const malformed = { ...input, [field]: Number.NaN };
    expect(() => installLocalReviewSource(malformed)).toThrow('must be positive');
    expect(readdirSync(input.storeBase)).toEqual([]);
  },
);

test('retained owner refuses each substituted path, Git object, and raw identity on read', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity);
  const entry = prepared.manifest.entries.at(1);
  if (entry === undefined) throw new Error('fixture tuple absent');
  expect(() => candidate.read('other.ts', entry.gitObjectId, entry.rawIdentity)).toThrow(
    'tuple differs',
  );
  expect(() => candidate.read(entry.path, 'f'.repeat(40), entry.rawIdentity)).toThrow(
    'tuple differs',
  );
  expect(() => candidate.read(entry.path, entry.gitObjectId, 'f'.repeat(64))).toThrow(
    'tuple differs',
  );
  expect(() => candidate.readBlob('f'.repeat(40), entry.path)).toThrow('tuple differs');
  expect(() => candidate.readBlob(entry.gitObjectId, 'absent.ts')).toThrow('path absent');
});

test('retained raw tuple mismatch refuses before the digest dependency is touched', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity);
  const entry = prepared.manifest.entries.at(1);
  if (entry === undefined) throw new Error('fixture tuple absent');
  const digest = spyOn(judge, 'hashBytes').mockImplementation(() => {
    throw new Error('injected digest dependency reached');
  });
  try {
    expect(() => candidate.read(entry.path, entry.gitObjectId, 'f'.repeat(64))).toThrow(
      'tuple differs',
    );
    expect(digest).not.toHaveBeenCalled();
  } finally {
    digest.mockRestore();
  }
});

test('retained read port enforces its installed count and aggregate byte ceilings', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource({ ...configuration, maximumParserReads: 1 });
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity);
  const entry = prepared.manifest.entries.at(1);
  if (entry === undefined) throw new Error('fixture tuple absent');
  candidate.readBlob(entry.gitObjectId, entry.path);
  expect(() => candidate.readBlob(entry.gitObjectId, entry.path)).toThrow('read count exceeded');

  const limited = installLocalReviewSource({
    ...configuration,
    maximumParserReadBytes: Buffer.byteLength('export const exact = 1;\n') - 1,
  }).open(request, prepared.snapshotIdentity);
  expect(() => limited.readBlob(entry.gitObjectId, entry.path)).toThrow(
    'read byte ceiling exceeded',
  );

  const aggregate = installLocalReviewSource({
    ...configuration,
    maximumParserReadBytes: 30,
  }).open(request, prepared.snapshotIdentity);
  const first = prepared.manifest.entries.at(0);
  if (first === undefined) throw new Error('fixture first tuple absent');
  aggregate.readBlob(first.gitObjectId, first.path);
  expect(() => aggregate.readBlob(entry.gitObjectId, entry.path)).toThrow(
    'read byte ceiling exceeded',
  );
});

test('retained read rehash refuses an altered owned byte copy before returning it', () => {
  const input = fixture();
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource(configuration);
  const prepared = owner.prepare(request);
  const original = Uint8Array.from.bind(Uint8Array);
  let corrupted = false;
  const clone = spyOn(Uint8Array, 'from').mockImplementation(((bytes: Iterable<number>) => {
    const copied = original(bytes);
    if (!corrupted && copied.length === Buffer.byteLength('export const exact = 1;\n')) {
      copied[0] = 'X'.charCodeAt(0);
      corrupted = true;
    }
    return copied;
  }) as typeof Uint8Array.from);
  let candidate: ReturnType<typeof owner.open>;
  try {
    candidate = owner.open(request, prepared.snapshotIdentity);
  } finally {
    clone.mockRestore();
  }
  const entry = prepared.manifest.entries.at(1);
  if (entry === undefined) throw new Error('fixture tuple absent');
  expect(corrupted).toBe(true);
  expect(() => candidate.read(entry.path, entry.gitObjectId, entry.rawIdentity)).toThrow(
    'read identity differs',
  );
});

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

function failingAcquisition() {
  const input = fixture();
  const executable = join(dirname(input.sourceRepository), 'refused-fetch-git');
  writeFileSync(
    executable,
    '#!/bin/sh\nfor arg in "$@"; do if [ "$arg" = fetch ]; then exit 73; fi; done\nexec /usr/bin/git "$@"\n',
    { mode: 0o700 },
  );
  return {
    ...input,
    gitExecutablePath: executable,
    gitExecutableIdentity: hashBytes(readFileSync(executable)),
  };
}

test('pending cleanup retries a successful removal that leaves a nested entry', () => {
  const input = failingAcquisition();
  const original = filesystem.rmSync;
  let removals = 0;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    if (String(path).startsWith(join(input.storeBase, '.pending-'))) {
      removals += 1;
      if (removals === 1) {
        unlinkSync(join(String(path), 'git', 'HEAD'));
        return;
      }
    }
    original(path, options);
  });
  try {
    expect(() => prepare(input)).toThrow('Git operation failed');
    expect(readdirSync(input.storeBase)).toEqual([]);
    expect(removals).toBe(2);
  } finally {
    remove.mockRestore();
  }
});

test('pending cleanup refuses a persistently incomplete successful removal', () => {
  const input = failingAcquisition();
  const original = filesystem.rmSync;
  let removals = 0;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    if (String(path).startsWith(join(input.storeBase, '.pending-'))) {
      removals += 1;
      return;
    }
    original(path, options);
  });
  try {
    expect(() => prepare(input)).toThrow('review acquisition and cleanup failed');
    expect(removals).toBe(3);
  } finally {
    remove.mockRestore();
  }
});

test('pending cleanup preserves a directory substituted after incomplete removal', () => {
  const input = failingAcquisition();
  const original = filesystem.rmSync;
  const displaced = join(dirname(input.storeBase), 'displaced-pending');
  let replacement: string | undefined;
  const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
    if (String(path).startsWith(join(input.storeBase, '.pending-'))) {
      if (replacement !== undefined) {
        original(path, options);
        return;
      }
      replacement = String(path);
      renameSync(replacement, displaced);
      mkdirSync(replacement, { mode: 0o700 });
      writeFileSync(join(replacement, 'foreign'), 'preserve');
      return;
    }
    original(path, options);
  });
  try {
    expect(() => prepare(input)).toThrow('review acquisition and cleanup failed');
    if (replacement === undefined) throw new Error('replacement fixture absent');
    expect(readFileSync(join(replacement, 'foreign'), 'utf8')).toBe('preserve');
  } finally {
    remove.mockRestore();
  }
});

test.each(['dev', 'uid', 'mode', 'directory', 'unreadable'] as const)(
  'pending cleanup refuses changed %s metadata after incomplete removal',
  (field) => {
    const input = failingAcquisition();
    const originalRemove = filesystem.rmSync;
    const originalStat = filesystem.lstatSync;
    let incomplete = false;
    let removals = 0;
    const remove = spyOn(filesystem, 'rmSync').mockImplementation((path, options) => {
      if (String(path).startsWith(join(input.storeBase, '.pending-'))) {
        incomplete = true;
        removals += 1;
        return;
      }
      originalRemove(path, options);
    });
    const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
      const entry = originalStat(path);
      if (incomplete && path.startsWith(join(input.storeBase, '.pending-'))) {
        if (field === 'unreadable') throw new Error('injected unreadable pending identity');
        if (field === 'directory') return Object.assign(entry, { isDirectory: () => false });
        return Object.assign(entry, { [field]: entry[field] + 1 });
      }
      return entry;
    }) as typeof filesystem.lstatSync);
    try {
      expect(() => prepare(input)).toThrow('review acquisition and cleanup failed');
      expect(removals).toBe(1);
    } finally {
      stat.mockRestore();
      remove.mockRestore();
    }
  },
);

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
    options?: filesystem.RmOptions,
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
  const original = filesystem.lstatSync;
  let expired = false;
  const stat = spyOn(filesystem, 'lstatSync').mockImplementation(((path: string) => {
    try {
      return original(path);
    } catch (cause) {
      if (
        path.startsWith(join(input.storeBase, '.pending-')) &&
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'ENOENT'
      )
        expired = true;
      throw cause;
    }
  }) as typeof filesystem.lstatSync);
  const clock = spyOn(performance, 'now').mockImplementation(() => (expired ? 10_001 : 0));
  try {
    expect(() => prepare(input)).toThrow('deadline exceeded');
  } finally {
    clock.mockRestore();
    stat.mockRestore();
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
    options?: filesystem.RmOptions,
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
  const prior = process.env['GIT_OBJECT_DIRECTORY'];
  process.env['GIT_OBJECT_DIRECTORY'] = emptyObjects;
  try {
    const prepared = prepare(input);
    expect(prepared.manifest.entries).toHaveLength(2);
  } finally {
    if (prior === undefined) delete process.env['GIT_OBJECT_DIRECTORY'];
    else process.env['GIT_OBJECT_DIRECTORY'] = prior;
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
  } as unknown as (typeof alteredManifest.entries)[number]['classification'];
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

function historyFixture(
  format: 'sha1' | 'sha256' = 'sha1',
  selectorPath = 'nested/source.ts',
  revision?: string,
) {
  const input = fixture(format);
  mkdirSync(join(input.sourceRepository, 'nested'));
  writeFileSync(join(input.sourceRepository, 'nested/source.ts'), 'third historical bytes\n');
  writeFileSync(join(input.sourceRepository, 'README.md'), '# historical third\n');
  symlinkSync('../outside-host', join(input.sourceRepository, 'raw-link.txt'));
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'third commit');
  const historical = revision ?? git(input.sourceRepository, 'rev-parse', 'HEAD');
  writeFileSync(join(input.sourceRepository, 'nested/source.ts'), 'current head bytes\n');
  writeFileSync(join(input.sourceRepository, 'README.md'), '# current head\n');
  unlinkSync(join(input.sourceRepository, 'raw-link.txt'));
  writeFileSync(join(input.sourceRepository, 'raw-link.txt'), 'current ordinary file');
  writeFileSync(
    join(input.sourceRepository, 'declared.json'),
    JSON.stringify({
      schemaVersion: 1,
      declarationId: 'historical',
      selectorVersion: 1,
      coverage: 'selected-facts-only',
      facts: [
        {
          factId: 'old',
          family: 'generated',
          kind: 'generated-blob',
          at: { kind: 'historical', revision: historical },
          path: selectorPath,
          expectedBlob: '1'.repeat(format === 'sha1' ? 40 : 64),
        },
      ],
      edges: [],
    }),
  );
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'declaration');
  const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = input.request;
  const request = createActivationRequest({
    ...fields,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
  }).request;
  const { request: _request, ...configuration } = input;
  const history = {
    request: parseOrThrow(RelationshipRequest, {
      schemaVersion: 1,
      declarationPaths: ['declared.json'],
      typescript: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src.ts'] },
    }),
    policyIdentity: 'c'.repeat(64),
    maximumDeclarationPaths: 2,
    maximumDeclarationBytes: 4096,
    maximumDeclarationFacts: 2,
    maximumHistoricalSelections: 2,
    maximumHistoricalRevisions: 2,
    maximumHistoricalTreeDepth: 8,
    maximumHistoricalProofEdges: 8,
    maximumRetainedObjects: 100,
    maximumObjectBytes: 8192,
    maximumRetainedBytes: 32768,
    maximumHistoricalManifestBytes: 8192,
    assertOwner: () => undefined,
  };
  return {
    ...input,
    request,
    historical,
    configuration: { ...configuration, maximumCandidateBytes: 8192, history },
  };
}

function rewriteHistory(
  prepared: ReturnType<ReturnType<typeof installLocalReviewSource>['prepare']>,
  change: (manifest: RetainedHistoryManifest) => void,
): string {
  const path = join(prepared.readyDirectory, 'history.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as RetainedHistoryManifest;
  change(manifest);
  const bytes = serializeCanonical(manifest);
  writeFileSync(path, bytes);
  return hashBytes(bytes);
}

test.each(['sha1', 'sha256'] as const)(
  'historical %s proofs survive all source objects removal and replay exact owned bytes',
  (format) => {
    const input = historyFixture(format);
    const owner = installLocalReviewSource(input.configuration);
    const prepared = owner.prepare(input.request);
    expect(owner.prepare(input.request).historyIdentity).toBe(prepared.historyIdentity);
    expect(readdirSync(prepared.readyDirectory)).not.toContain('git');
    rmSync(input.sourceRepository, { recursive: true });
    const retained = owner.open(input.request, prepared.snapshotIdentity, prepared.historyIdentity);
    expect(retained.readHistorical(input.historical, 'nested/source.ts')).toEqual(
      Buffer.from('third historical bytes\n'),
    );
    expect(retained.history?.proofs[0]?.trees).toHaveLength(2);
    expect(() => retained.readHistorical(input.request.headSha, 'nested/source.ts')).toThrow(
      'selector is not retained',
    );
    expect(() => owner.open(input.request, prepared.snapshotIdentity)).toThrow('identity absent');
  },
);

test('historical symlink read returns exact raw target without host resolution', () => {
  const input = historyFixture('sha1', 'raw-link.txt');
  // Current classification requires an in-candidate target. History keeps raw semantics.

  const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = input.request;
  const request = createActivationRequest({
    ...fields,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
  }).request;
  const owner = installLocalReviewSource(input.configuration);
  const prepared = owner.prepare(request);
  rmSync(input.sourceRepository, { recursive: true });
  expect(
    owner
      .open(request, prepared.snapshotIdentity, prepared.historyIdentity)
      .readHistorical(input.historical, 'raw-link.txt'),
  ).toEqual(Buffer.from('../outside-host'));
});

test.each([
  ['missing commit', 'nested/source.ts', '0'.repeat(40), 'historical commit unavailable'],
  ['absent path', 'missing.ts', undefined, 'historical path absent'],
] as const)(
  'historical acquisition distinguishes %s without publishing references',
  (_label, path, revision, message) => {
    const input = historyFixture('sha1', path, revision);
    const owner = installLocalReviewSource(input.configuration);
    expect(() => owner.prepare(input.request)).toThrow(message);
    expect(readdirSync(input.storeBase)).toEqual([]);
  },
);

test.each([
  [
    'request',
    (manifest: RetainedHistoryManifest) => {
      manifest.requestIdentity = 'd'.repeat(64);
    },
    'binding differs',
  ],
  [
    'snapshot',
    (manifest: RetainedHistoryManifest) => {
      manifest.snapshotIdentity = 'd'.repeat(64);
    },
    'binding differs',
  ],
  [
    'policy',
    (manifest: RetainedHistoryManifest) => {
      manifest.retainedContentPolicyIdentity = 'd'.repeat(64);
    },
    'binding differs',
  ],
  [
    'selectors',
    (manifest: RetainedHistoryManifest) => {
      manifest.selections = [];
      manifest.proofs = [];
      manifest.historicalSelectionsIdentity = hashBytes(serializeCanonical([]));
    },
    'completeness differs',
  ],
  [
    'provenance',
    (manifest: RetainedHistoryManifest) => {
      manifest.selections[0].uses = [];
      manifest.historicalSelectionsIdentity = hashBytes(serializeCanonical(manifest.selections));
    },
    'completeness differs',
  ],
  [
    'selector digest',
    (manifest: RetainedHistoryManifest) => {
      manifest.historicalSelectionsIdentity = 'd'.repeat(64);
    },
    'completeness differs',
  ],
  [
    'missing proof',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs = [];
    },
    'completeness differs',
  ],
  [
    'extra proof',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs.push(manifest.proofs[0]);
    },
    'completeness differs',
  ],
  [
    'proof revision',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].revision = 'd'.repeat(40);
      manifest.proofs[0].commit.gitObjectId = 'd'.repeat(40);
    },
    'proof selector differs',
  ],
  [
    'proof path',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].path = 'src.ts';
    },
    'proof selector differs',
  ],
  [
    'commit',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].commit.gitObjectId = 'd'.repeat(40);
    },
    'proof selector differs',
  ],
  [
    'tree count',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].trees.pop();
    },
    'tree count differs',
  ],
  [
    'foreign root tree',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].trees[0] = manifest.proofs[0].trees[1];
    },
    'parent tree differs',
  ],
  [
    'wrong parent tree',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].trees[1] = manifest.proofs[0].trees[0];
    },
    'parent tree differs',
  ],
  [
    'terminal mode',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].terminal.mode = '120000';
    },
    'terminal edge differs',
  ],
  [
    'terminal object',
    (manifest: RetainedHistoryManifest) => {
      manifest.proofs[0].terminal.gitObjectId = 'd'.repeat(40);
    },
    'terminal edge differs',
  ],
] as const)('historical reopen refuses independently changed %s', (_label, change, message) => {
  const input = historyFixture();
  const owner = installLocalReviewSource(input.configuration);
  const prepared = owner.prepare(input.request);
  const identity = rewriteHistory(prepared, change);
  rmSync(input.sourceRepository, { recursive: true });
  expect(() => owner.open(input.request, prepared.snapshotIdentity, identity)).toThrow(message);
});

for (const limit of [
  'maximumHistoricalTreeDepth',
  'maximumHistoricalProofEdges',
  'maximumRetainedObjects',
  'maximumObjectBytes',
  'maximumRetainedBytes',
  'maximumHistoricalManifestBytes',
] as const) {
  test(`historical preparation enforces ${limit} before selecting references`, () => {
    const input = historyFixture();
    const owner = installLocalReviewSource({
      ...input.configuration,
      history: { ...input.configuration.history, [limit]: 1 },
    });
    expect(() => owner.prepare(input.request)).toThrow(/ceiling|bounds/);
    expect(readdirSync(input.storeBase)).toEqual([]);
  });
}

test('historical held owner change fences ready publication', () => {
  const input = historyFixture();
  let calls = 0;
  const owner = installLocalReviewSource({
    ...input.configuration,
    history: {
      ...input.configuration.history,
      assertOwner: () => {
        calls += 1;
        if (calls >= 4) throw new Error('held owner changed');
      },
    },
  });
  expect(() => owner.prepare(input.request)).toThrow('held owner changed');
  expect(readdirSync(input.storeBase)).toEqual([]);
});

function extendDeclarations(input: ReturnType<typeof historyFixture>) {
  const path = join(input.sourceRepository, 'declared.json');
  const declaration = JSON.parse(readFileSync(path, 'utf8')) as {
    facts: { factId: string; path: string; at: { kind: string; revision: string } }[];
  };
  declaration.facts.push({
    ...declaration.facts[0],
    factId: 'base',
    path: 'README.md',
    at: { kind: 'historical', revision: input.request.baseSha },
  });
  writeFileSync(path, JSON.stringify(declaration));
  cpSync(path, join(input.sourceRepository, 'second.json'));
  git(input.sourceRepository, 'add', '--all');
  git(input.sourceRepository, 'commit', '--quiet', '-m', 'two declarations');
  const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = input.request;
  return createActivationRequest({
    ...fields,
    headSha: git(input.sourceRepository, 'rev-parse', 'HEAD'),
  }).request;
}

test.each([
  'maximumDeclarationPaths',
  'maximumDeclarationBytes',
  'maximumDeclarationFacts',
  'maximumHistoricalSelections',
  'maximumHistoricalRevisions',
] as const)('historical preparation independently enforces %s', (limit) => {
  const input = historyFixture();
  const request = extendDeclarations(input);
  const history = {
    ...input.configuration.history,
    maximumDeclarationFacts: 10,
    [limit]: 1,
    request: {
      ...input.configuration.history.request,
      declarationPaths: ['declared.json', 'second.json'],
    },
  };
  const owner = installLocalReviewSource({ ...input.configuration, history });
  expect(() => owner.prepare(request)).toThrow(/ceiling|bounds/);
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('historical complete census retains every duplicate use with sorted unique provenance', () => {
  const input = historyFixture();
  const request = extendDeclarations(input);
  const history = {
    ...input.configuration.history,
    maximumDeclarationFacts: 10,
    request: {
      ...input.configuration.history.request,
      declarationPaths: ['second.json', 'declared.json'],
    },
  };
  const owner = installLocalReviewSource({ ...input.configuration, history });
  const prepared = owner.prepare(request);
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  expect(candidate.history?.selections).toHaveLength(2);
  for (const selection of candidate.history?.selections ?? []) {
    expect(selection.uses.map(({ declarationPath }) => declarationPath)).toEqual([
      'declared.json',
      'second.json',
    ]);
  }
});

test.each(['commit', 'tree', 'blob'] as const)(
  'historical reopen independently verifies %s Git body identity',
  (kind) => {
    const input = historyFixture();
    const owner = installLocalReviewSource(input.configuration);
    const prepared = owner.prepare(input.request);
    const identity = rewriteHistory(prepared, (manifest) => {
      const proof = manifest.proofs[0];
      const reference =
        kind === 'commit' ? proof.commit : kind === 'tree' ? proof.trees[0] : proof.terminal;
      const bytes = Buffer.concat([
        readFileSync(join(prepared.readyDirectory, 'sha256', reference.rawIdentity)),
        Buffer.from('\n'),
      ]);
      reference.rawIdentity = hashBytes(bytes);
      writeFileSync(join(prepared.readyDirectory, 'sha256', reference.rawIdentity), bytes, {
        mode: 0o600,
      });
    });
    expect(() => owner.open(input.request, prepared.snapshotIdentity, identity)).toThrow(
      `${kind} object identity differs`,
    );
  },
);

test.each(['absent', 'unreadable'] as const)(
  'historical reopen refuses %s retained proof body',
  (kind) => {
    const input = historyFixture();
    const owner = installLocalReviewSource(input.configuration);
    const prepared = owner.prepare(input.request);
    const manifest = JSON.parse(
      readFileSync(join(prepared.readyDirectory, 'history.json'), 'utf8'),
    ) as RetainedHistoryManifest;
    const path = join(prepared.readyDirectory, 'sha256', manifest.proofs[0].commit.rawIdentity);
    if (kind === 'absent') unlinkSync(path);
    else chmodSync(path, 0);
    expect(() =>
      owner.open(input.request, prepared.snapshotIdentity, prepared.historyIdentity),
    ).toThrow();
  },
);

test('historical capture refuses partial object retention and selects no ready references', () => {
  const input = historyFixture();
  const owner = installLocalReviewSource(input.configuration);
  const original = filesystem.writeSync;
  const write = spyOn(filesystem, 'writeSync').mockImplementation(
    (descriptor: number, ...args: unknown[]) => {
      const path = readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      if (path.includes('/sha256/')) throw new Error('injected historical storage failure');
      const written: unknown = Reflect.apply(original, filesystem, [descriptor, ...args]);
      if (typeof written !== 'number') throw new Error('write fixture returned a non-number');
      return written;
    },
  );
  try {
    expect(() => owner.prepare(input.request)).toThrow('injected historical storage failure');
  } finally {
    write.mockRestore();
  }
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('historical head base and third commit keep three distinct bytes at the same path', () => {
  const input = historyFixture('sha1', 'README.md');
  const request = extendDeclarations(input);
  const owner = installLocalReviewSource(input.configuration);
  const prepared = owner.prepare(request);
  rmSync(input.sourceRepository, { recursive: true });
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  const current = candidate.snapshot.entries.find(({ path }) => path === 'README.md');
  if (current === undefined) throw new Error('current README missing');
  expect(candidate.readBlob(current.blob, current.path)).toEqual(Buffer.from('# current head\n'));
  expect(candidate.readHistorical(input.historical, 'README.md')).toEqual(
    Buffer.from('# historical third\n'),
  );
  expect(candidate.readHistorical(request.baseSha, 'README.md')).toEqual(
    Buffer.from('# exact base\n'),
  );
});

test('historical empty history is complete only for an installed empty declaration census', () => {
  const input = fixture();
  const template = historyFixture().configuration.history;
  const { request, ...configuration } = input;
  const owner = installLocalReviewSource({
    ...configuration,
    history: { ...template, request: { ...template.request, declarationPaths: [] } },
  });
  const prepared = owner.prepare(request);
  rmSync(input.sourceRepository, { recursive: true });
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  expect(candidate.history?.selections).toEqual([]);
  expect(candidate.history?.proofs).toEqual([]);
});

test('historical installed declaration paths remain owned after caller mutation', () => {
  const input = historyFixture();
  const owner = installLocalReviewSource(input.configuration);
  input.configuration.history.request.declarationPaths?.splice(0);
  const prepared = owner.prepare(input.request);
  expect(
    owner.open(input.request, prepared.snapshotIdentity, prepared.historyIdentity).history
      ?.selections,
  ).toHaveLength(1);
});

test('historical parser read count and bytes share the current read budget', () => {
  const input = historyFixture();
  const owner = installLocalReviewSource({ ...input.configuration, maximumParserReads: 1 });
  const prepared = owner.prepare(input.request);
  const candidate = owner.open(input.request, prepared.snapshotIdentity, prepared.historyIdentity);
  candidate.readHistorical(input.historical, 'nested/source.ts');
  expect(() => candidate.readHistorical(input.historical, 'nested/source.ts')).toThrow(
    'read count exceeded',
  );
  const byteOwner = installLocalReviewSource({ ...input.configuration, maximumParserReadBytes: 1 });
  const limited = byteOwner.open(
    input.request,
    prepared.snapshotIdentity,
    prepared.historyIdentity,
  );
  expect(() => limited.readHistorical(input.historical, 'nested/source.ts')).toThrow(
    'read byte ceiling exceeded',
  );
});

test('historical capture deadline covers object reads and leaves no references on expiry', () => {
  const input = historyFixture();
  let now = 0;
  const owner = installLocalReviewSource({ ...input.configuration, monotonic: { now: () => now } });
  const original = Bun.spawnSync;
  const invoke = spyOn(Bun, 'spawnSync').mockImplementation(((
    command: string[],
    options: object,
  ) => {
    const invocation = original(command, options);
    if (command.includes('cat-file') && command.includes('commit')) now = 10_001;
    return invocation;
  }) as typeof Bun.spawnSync);
  try {
    expect(() => owner.prepare(input.request)).toThrow();
  } finally {
    invoke.mockRestore();
  }
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test.each([
  [
    'invalid tree name',
    'tree',
    (bytes: Buffer) => Buffer.from(bytes.toString('binary').replace('README.md', '..'), 'binary'),
    'tree entry malformed',
  ],
  [
    'duplicate tree name',
    'tree',
    (bytes: Buffer) => Buffer.concat([bytes, bytes]),
    'tree entry malformed',
  ],

  [
    'commit header',
    'commit',
    (bytes: Buffer) => Buffer.from(bytes.toString().replace(/^tree /, 'oops ')),
    'commit tree header malformed',
  ],
  [
    'truncated tree',
    'tree',
    (bytes: Buffer) => bytes.subarray(0, bytes.length - 1),
    'tree body malformed',
  ],
  [
    'invalid tree mode',
    'tree',
    (bytes: Buffer) => Buffer.from(bytes.toString('binary').replace(/^100644/, '999999'), 'binary'),
    'tree entry malformed',
  ],
  [
    'missing child edge',
    'tree',
    (bytes: Buffer) => Buffer.from(bytes.toString('binary').replace('nested', 'absent'), 'binary'),
    'path absent',
  ],
  [
    'wrong parent mode',
    'tree',
    (bytes: Buffer) =>
      Buffer.from(bytes.toString('binary').replace('40000 nested', '100644 nested'), 'binary'),
    'parent mode differs',
  ],
] as const)(
  'historical proof decoder refuses %s with broken Git hash dependency',
  (_label, kind, change, message) => {
    const input = historyFixture();
    const owner = installLocalReviewSource(input.configuration);
    const prepared = owner.prepare(input.request);
    let alteredGitId = '';
    let originalGitId = '';
    const identity = rewriteHistory(prepared, (manifest) => {
      const reference = kind === 'commit' ? manifest.proofs[0].commit : manifest.proofs[0].trees[0];
      const bytes = change(
        readFileSync(join(prepared.readyDirectory, 'sha256', reference.rawIdentity)),
      );
      originalGitId = reference.gitObjectId;
      alteredGitId = hashGitObject(kind, bytes, 'sha1');
      reference.rawIdentity = hashBytes(bytes);
      writeFileSync(join(prepared.readyDirectory, 'sha256', reference.rawIdentity), bytes, {
        mode: 0o600,
      });
    });
    const create = crypto.createHash;
    const hash = spyOn(crypto, 'createHash').mockImplementation((algorithm, options) => {
      const digest = create(algorithm, options);
      const originalDigest = digest.digest.bind(digest);
      spyOn(digest, 'digest').mockImplementation(((encoding: 'hex') => {
        const actual = digest.copy().digest('hex');
        if (algorithm === 'sha1' && actual === alteredGitId) return originalGitId;
        return originalDigest(encoding);
      }) as typeof digest.digest);
      return digest;
    });
    try {
      expect(() => owner.open(input.request, prepared.snapshotIdentity, identity)).toThrow(message);
    } finally {
      hash.mockRestore();
    }
  },
);

test('historical capture refuses directory terminals before selecting complete history', () => {
  const input = historyFixture('sha1', 'nested');
  expect(() => installLocalReviewSource(input.configuration).prepare(input.request)).toThrow(
    'terminal is not a supported blob',
  );
  expect(readdirSync(input.storeBase)).toEqual([]);
});

test('historical installation refuses repeated declaration paths at its schema boundary', () => {
  const input = historyFixture();
  expect(() =>
    installLocalReviewSource({
      ...input.configuration,
      history: {
        ...input.configuration.history,
        request: {
          ...input.configuration.history.request,
          declarationPaths: ['declared.json', 'declared.json'],
        },
      },
    }),
  ).toThrow('unique relationship declaration paths');
});

test('historical final held owner check consumes preparation deadline before returning references', () => {
  const input = historyFixture();
  let calls = 0;
  let now = 0;
  const owner = installLocalReviewSource({
    ...input.configuration,
    monotonic: { now: () => now },
    history: {
      ...input.configuration.history,
      assertOwner: () => {
        calls += 1;
        if (calls === 6) now = 10_001;
      },
    },
  });
  expect(() => owner.prepare(input.request)).toThrow('deadline exceeded');
});

test.each([
  'maximumDeclarationPaths',
  'maximumDeclarationBytes',
  'maximumDeclarationFacts',
  'maximumHistoricalSelections',
  'maximumHistoricalRevisions',
  'maximumHistoricalTreeDepth',
  'maximumHistoricalProofEdges',
  'maximumRetainedObjects',
  'maximumObjectBytes',
  'maximumRetainedBytes',
  'maximumHistoricalManifestBytes',
] as const)('historical installation refuses missing or unrepresentable %s', (limit) => {
  const input = historyFixture();
  for (const invalid of [undefined, NaN, Infinity, 0, 2_147_483_648]) {
    const history = {
      ...input.configuration.history,
      [limit]: invalid,
    };
    expect(() => installLocalReviewSource({ ...input.configuration, history })).toThrow(
      'must be positive and bounded',
    );
  }
});

test('historical reopen refuses noncanonical manifest even under matching whole digest', () => {
  const input = historyFixture();
  const owner = installLocalReviewSource(input.configuration);
  const prepared = owner.prepare(input.request);
  const path = join(prepared.readyDirectory, 'history.json');
  const bytes = readFileSync(path, 'utf8') + '\n';
  writeFileSync(path, bytes);
  expect(() => owner.open(input.request, prepared.snapshotIdentity, hashBytes(bytes))).toThrow(
    'manifest is not canonical',
  );
});

test.each(['bytes', 'objects'] as const)(
  'historical aggregate %s includes both retained manifests',
  (bound) => {
    const input = historyFixture();
    const prepared = installLocalReviewSource(input.configuration).prepare(input.request);
    const identities = readdirSync(join(prepared.readyDirectory, 'sha256'));
    const rawBytes = identities.reduce(
      (sum, identity) =>
        sum + readFileSync(join(prepared.readyDirectory, 'sha256', identity)).length,
      0,
    );
    const owner = installLocalReviewSource({
      ...input.configuration,
      history: {
        ...input.configuration.history,
        ...(bound === 'bytes'
          ? { maximumRetainedBytes: rawBytes + 1 }
          : { maximumRetainedObjects: identities.length + 1 }),
      },
    });
    expect(() => owner.prepare(input.request)).toThrow('retained storage ceiling exceeded');
    expect(() =>
      owner.open(input.request, prepared.snapshotIdentity, prepared.historyIdentity),
    ).toThrow('retained storage ceiling exceeded');
  },
);

test.each(['sha1', 'sha256'] as const)(
  'historical %s tree filenames preserve BOM and refuse absent unprefixed selectors',
  (format) => {
    const input = historyFixture(format);
    const repository = input.sourceRepository;
    const historicalPath = 'nested/\uFEFFsource.ts';
    renameSync(join(repository, 'nested/source.ts'), join(repository, historicalPath));
    writeFileSync(join(repository, historicalPath), 'exact BOM filename body\n');
    git(repository, 'add', '--all');
    git(repository, 'commit', '--quiet', '-m', 'BOM historical filename');
    const revision = git(repository, 'rev-parse', 'HEAD');
    const absent = Bun.spawnSync([
      '/usr/bin/git',
      '-C',
      repository,
      'show',
      `${revision}:nested/source.ts`,
    ]);
    expect(absent.exitCode).toBe(128);
    expect(git(repository, 'show', `${revision}:${historicalPath}`)).toBe(
      'exact BOM filename body',
    );
    renameSync(join(repository, historicalPath), join(repository, 'nested/source.ts'));
    const declarationPath = join(repository, 'declared.json');
    const declaration = JSON.parse(readFileSync(declarationPath, 'utf8')) as {
      facts: { at: { revision: string }; path: string }[];
    };
    declaration.facts[0].at.revision = revision;
    writeFileSync(declarationPath, JSON.stringify(declaration));
    git(repository, 'add', '--all');
    git(repository, 'commit', '--quiet', '-m', 'head selecting absent plain filename');
    const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = input.request;
    const request = createActivationRequest({
      ...fields,
      headSha: git(repository, 'rev-parse', 'HEAD'),
    }).request;
    const owner = installLocalReviewSource(input.configuration);
    expect(() => owner.prepare(request)).toThrow('historical path absent: source.ts');
    expect(readdirSync(input.storeBase)).toEqual([]);

    declaration.facts[0].path = historicalPath;
    writeFileSync(declarationPath, JSON.stringify(declaration));
    git(repository, 'add', '--all');
    git(repository, 'commit', '--quiet', '-m', 'head selecting exact BOM filename');
    const exactRequest = createActivationRequest({
      ...fields,
      headSha: git(repository, 'rev-parse', 'HEAD'),
    }).request;
    const prepared = owner.prepare(exactRequest);
    rmSync(repository, { recursive: true });
    const candidate = owner.open(exactRequest, prepared.snapshotIdentity, prepared.historyIdentity);
    expect(candidate.readHistorical(revision, historicalPath)).toEqual(
      Buffer.from('exact BOM filename body\n'),
    );
    expect(() => candidate.readHistorical(revision, 'nested/source.ts')).toThrow(
      'selector is not retained',
    );
  },
);

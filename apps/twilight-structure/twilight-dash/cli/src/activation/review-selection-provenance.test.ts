import * as filesystem from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import {
  ClassificationPolicy,
  hashBytes,
  RelationshipRequest,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import * as activationRequest from './request';
import { createActivationRequest } from './request';
import { installLocalReviewSource, readRetainedReviewProvenance } from './review-selection-objects';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(format: 'sha1' | 'sha256' = 'sha1', complete = true) {
  const root = mkdtempSync(join(tmpdir(), 'review-provenance-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'store');
  mkdirSync(sourceRepository, { mode: 0o700 });
  mkdirSync(storeBase, { mode: 0o700 });
  function git(...args: string[]) {
    const invocation = Bun.spawnSync(['/usr/bin/git', '-C', sourceRepository, ...args]);
    if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
    return invocation.stdout.toString().trim();
  }
  git('init', '--quiet', `--object-format=${format}`);
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  writeFileSync(join(sourceRepository, 'src.ts'), 'export const retained = 1;\n');
  git('add', '--all');
  git('commit', '--quiet', '-m', 'candidate');
  const headSha = git('rev-parse', 'HEAD');
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
  const request = createActivationRequest({
    repositoryId: 123,
    subject: { kind: 'pull-request', number: 7 },
    targetRef: binding.targetRef,
    headSha,
    baseSha: headSha,
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    authorityIdentity: 'b'.repeat(64),
    auditGeneration: 1,
  }).request;
  const classificationPolicy = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(
      readFileSync(
        join(
          import.meta.dir,
          '../../../../twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
        ),
        'utf8',
      ),
    ),
  );
  let checkOwner = () => undefined;
  const history = {
    request: parseOrThrow(RelationshipRequest, {
      schemaVersion: 1,
      declarationPaths: [],
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
    assertOwner: () => {
      checkOwner();
    },
  };
  const owner = installLocalReviewSource({
    binding,
    sourceRepository,
    storeBase,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    gitObjectFormat: format,
    classificationPolicy,
    maximumPreparationMs: 10_000,
    monotonic: monotonicClock(),
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 8192,
    maximumParserReads: 1,
    maximumParserReadBytes: 1000,
    ...(complete ? { history } : {}),
  });
  const prepared = owner.prepare(request);
  return {
    root,
    request,
    owner,
    prepared,
    setOwnerCheck: (check: () => undefined) => {
      checkOwner = check;
    },
  };
}

const ownershipError = 'owned retained review candidate required';

test.each(['sha1', 'sha256'] as const)(
  'review binding caches frozen exact %s scalars without ambient reads or parser budget',
  (format) => {
    const { root, owner, request, prepared } = fixture(format);
    const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
    expect(candidate.history?.proofs).toEqual([]);
    if (prepared.historyIdentity === undefined) throw new Error('fixture history pin absent');
    const expected = {
      requestIdentity: request.requestIdentity,
      snapshotIdentity: prepared.snapshotIdentity,
      historyManifestIdentity: prepared.historyIdentity,
    };
    const binding = readRetainedReviewProvenance(candidate);
    expect(binding).toEqual(expected);
    expect(Object.keys(binding)).toEqual(Object.keys(expected));
    expect(Object.isFrozen(binding)).toBe(true);
    request.requestIdentity = 'd'.repeat(64);
    expect(Object.isFrozen(request)).toBe(false);
    rmSync(root, { recursive: true });
    const readTrap = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
      throw new Error('ambient read trap');
    });
    const spawnTrap = spyOn(Bun, 'spawnSync').mockImplementation(() => {
      throw new Error('ambient Git trap');
    });
    try {
      expect(() => readFileSync('/removed')).toThrow('ambient read trap');
      expect(() => Bun.spawnSync(['/usr/bin/git'])).toThrow('ambient Git trap');
      for (let index = 0; index < 5; index += 1)
        expect(readRetainedReviewProvenance(candidate)).toBe(binding);
      expect(binding).toEqual(expected);
      const entry = candidate.snapshot.entries.find(({ path }) => path === 'src.ts');
      if (entry === undefined) throw new Error('fixture entry absent');
      expect(new TextDecoder().decode(candidate.readBlob(entry.blob, entry.path))).toBe(
        'export const retained = 1;\n',
      );
    } finally {
      readTrap.mockRestore();
      spawnTrap.mockRestore();
    }
  },
);

test('review binding refuses primitive, copied, inherited and poisoned owners without property reads', () => {
  const { owner, request, prepared } = fixture();
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  let reads = 0;
  const poison = Object.defineProperty({}, 'snapshot', {
    get() {
      reads += 1;
      throw new Error('getter reached');
    },
  });
  const proxy = new Proxy(candidate, {
    get() {
      reads += 1;
      throw new Error('proxy reached');
    },
    getPrototypeOf() {
      reads += 1;
      throw new Error('prototype reached');
    },
  });
  for (const foreign of [
    undefined,
    null,
    1,
    'owner',
    true,
    Symbol('owner'),
    1n,
    () => candidate,
    {},
    { ...candidate },
    JSON.parse(JSON.stringify(candidate)),
    Object.create(candidate),
    poison,
    proxy,
  ])
    expect(() => readRetainedReviewProvenance(foreign)).toThrow(ownershipError);
  expect(reads).toBe(0);
});

test('legacy review binding keeps null despite an irrelevant supplied history pin', () => {
  const { owner, request, prepared } = fixture('sha1', false);
  const candidate = owner.open(request, prepared.snapshotIdentity, 'e'.repeat(64));
  expect(readRetainedReviewProvenance(candidate).historyManifestIdentity).toBeNull();
});

test('request binding is detached before an owner callback mutates the caller request', () => {
  const { owner, request, prepared, setOwnerCheck } = fixture();
  const original = request.requestIdentity;
  let calls = 0;
  setOwnerCheck(() => {
    calls += 1;
    if (calls === 2) request.requestIdentity = 'd'.repeat(64);
  });
  const candidate = owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity);
  expect(calls).toBe(2);
  expect(request.requestIdentity).not.toBe(original);
  expect(readRetainedReviewProvenance(candidate).requestIdentity).toBe(original);
});

test.each(['wrong-raw', 'repinned-canonical', 'repinned-noncanonical', 'malformed'] as const)(
  'failed %s history publishes no review binding',
  (fault) => {
    const { owner, request, prepared } = fixture();
    const path = join(prepared.readyDirectory, 'history.json');
    const bytes = readFileSync(path, 'utf8');
    chmodSync(path, 0o600);
    const altered =
      fault === 'malformed'
        ? '{'
        : fault === 'repinned-canonical'
          ? serializeCanonical({ ...JSON.parse(bytes), requestIdentity: 'f'.repeat(64) })
          : `${bytes} `;
    writeFileSync(path, altered);
    const pin = fault === 'wrong-raw' ? prepared.historyIdentity : hashBytes(altered);
    const registered: object[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- The spy forwards its dynamic WeakMap receiver with call below.
    const original = WeakMap.prototype.set;
    const registration = spyOn(WeakMap.prototype, 'set').mockImplementation(function (
      this: WeakMap<WeakKey, unknown>,
      key,
      value,
    ) {
      if (
        typeof key === 'object' &&
        typeof value === 'object' &&
        value !== null &&
        'historyManifestIdentity' in value
      )
        registered.push(key);
      return original.call(this, key, value);
    });
    try {
      expect(() => owner.open(request, prepared.snapshotIdentity, pin)).toThrow();
      expect(registered).toEqual([]);
    } finally {
      registration.mockRestore();
    }
  },
);

test('final held-owner failure publishes no binding even for an internally captured candidate', () => {
  const { owner, request, prepared, setOwnerCheck } = fixture();
  const captured: object[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The spy forwards its dynamic WeakMap receiver with call below.
  const original = WeakMap.prototype.set;
  const registration = spyOn(WeakMap.prototype, 'set').mockImplementation(function (
    this: WeakMap<WeakKey, unknown>,
    key,
    value,
  ) {
    if (typeof key === 'object' && 'snapshot' in key && 'readHistorical' in key) captured.push(key);
    return original.call(this, key, value);
  });
  let calls = 0;
  setOwnerCheck(() => {
    calls += 1;
    if (calls === 2) throw new Error('final owner fence');
  });
  try {
    expect(() => owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity)).toThrow(
      'final owner fence',
    );
    for (const candidate of captured)
      expect(() => readRetainedReviewProvenance(candidate)).toThrow(ownershipError);
    expect(calls).toBe(2);
  } finally {
    registration.mockRestore();
  }
});

test('phase-one retained views never acquire public review bindings', () => {
  const captured: object[] = [];
  const original = Object.freeze;
  const freezing = spyOn(Object, 'freeze').mockImplementation(<T>(value: T) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      'readHistorical' in value &&
      'snapshot' in value
    )
      captured.push(value);
    return original(value);
  });
  try {
    fixture();
    expect(captured.length).toBeGreaterThan(0);
    for (const candidate of captured)
      expect(() => readRetainedReviewProvenance(candidate)).toThrow(ownershipError);
  } finally {
    freezing.mockRestore();
  }
});

test('closed request refusal precedes copying an undeclared getter or buffer', () => {
  const { owner, request, prepared } = fixture();
  let reads = 0;
  const poisoned = Object.defineProperty({ ...request }, 'undeclared', {
    enumerable: true,
    get() {
      reads += 1;
      return new Uint8Array(16);
    },
  });
  expect(() => owner.open(poisoned, prepared.snapshotIdentity, prepared.historyIdentity)).toThrow();
  expect(reads).toBe(0);
});

test('one legacy snapshot opens distinct candidate request bindings', () => {
  const { owner, request, prepared } = fixture('sha1', false);
  const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = request;
  const later = createActivationRequest({ ...fields, auditGeneration: 2 }).request;
  const first = owner.open(request, prepared.snapshotIdentity);
  const second = owner.open(later, prepared.snapshotIdentity);
  expect(first).not.toBe(second);
  expect(readRetainedReviewProvenance(first).requestIdentity).toBe(request.requestIdentity);
  expect(readRetainedReviewProvenance(second).requestIdentity).toBe(later.requestIdentity);
  expect(readRetainedReviewProvenance(first)).not.toBe(readRetainedReviewProvenance(second));
});

test('owned request snapshot is revalidated after caller mutation during capture', () => {
  const { owner, request, prepared } = fixture('sha1', false);
  const original = activationRequest.assertActivationRequest;
  let calls = 0;
  const validation = spyOn(activationRequest, 'assertActivationRequest').mockImplementation(
    (input) => {
      const validated = original(input);
      calls += 1;
      if (calls === 1) request.requestIdentity = 'd'.repeat(64);
      return validated;
    },
  );
  try {
    expect(() => owner.open(request, prepared.snapshotIdentity, prepared.historyIdentity)).toThrow(
      'activation request identity differs',
    );
    expect(calls).toBe(1);
  } finally {
    validation.mockRestore();
  }
});

test.each(['protected-revision', 'merge-group'] as const)(
  'declared %s subject remains coherent in the owned request snapshot',
  (kind) => {
    const { owner, request, prepared } = fixture('sha1', false);
    const { requestIdentity: _identity, schemaVersion: _schema, ...fields } = request;
    const selected = createActivationRequest({
      ...fields,
      subject:
        kind === 'protected-revision'
          ? { kind, ref: request.targetRef }
          : {
              kind,
              groupRef: 'refs/heads/merge-group',
              members: [
                {
                  repositoryId: request.repositoryId,
                  pullRequestNumber: 7,
                  headSha: request.headSha,
                },
              ],
            },
    }).request;
    const candidate = owner.open(selected, prepared.snapshotIdentity);
    expect(readRetainedReviewProvenance(candidate).requestIdentity).toBe(selected.requestIdentity);
  },
);

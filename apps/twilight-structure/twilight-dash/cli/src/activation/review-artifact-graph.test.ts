import * as filesystem from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import {
  ClassificationPolicy,
  hashBytes,
  identifyArtifactDecoder,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { monotonicClock } from '../clock';
import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { buildRetainedArtifactGraph, verifyRetainedArtifactGraph } from './review-artifact-graph';
import { installLocalReviewSource } from './review-selection-objects';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, ...args: string[]) {
  const invocation = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}
function fixture(format: 'sha1' | 'sha256') {
  const root = mkdtempSync(join(tmpdir(), 'retained-graph-'));
  roots.push(root);
  const sourceRepository = join(root, 'source');
  const storeBase = join(root, 'owned');
  mkdirSync(sourceRepository);
  mkdirSync(storeBase);
  chmodSync(storeBase, 0o700);
  git(sourceRepository, 'init', '--quiet', `--object-format=${format}`);
  git(sourceRepository, 'config', 'user.email', 'test@example.invalid');
  git(sourceRepository, 'config', 'user.name', 'Graph Fixture');
  mkdirSync(join(sourceRepository, 'docs/review-evidence'), { recursive: true });
  writeFileSync(
    join(sourceRepository, 'docs/review-evidence/response.json'),
    JSON.stringify({
      schemaVersion: 1,
      recordKind: 'opaque-transcript',
      invocationId: 'invocation.1',
      mediaType: 'text/plain',
      payload: 'opaque response',
    }),
  );
  writeFileSync(
    join(sourceRepository, 'docs/review-evidence/other.json'),
    JSON.stringify({
      schemaVersion: 1,
      recordKind: 'opaque-transcript',
      invocationId: 'invocation.2',
      mediaType: 'text/plain',
      payload: 'other response',
    }),
  );
  const invocation = JSON.parse(
    readFileSync(
      join(
        import.meta.dir,
        '../../../../twilight-burokrat/cli/src/contracts/fixtures/invocation-receipt.v1.json',
      ),
      'utf8',
    ),
  ) as { executor: unknown; rawUsage: unknown; priceIdentity: unknown };
  writeFileSync(
    join(sourceRepository, 'docs/review-evidence/receipt.json'),
    JSON.stringify({
      schemaVersion: 1,
      receiptKind: 'review',
      receiptId: 'receipt.1',
      invocationId: 'invocation.1',
      executor: invocation.executor,
      suppliedContextIds: [],
      observedReadIds: [],
      rawResponseArtifact: hashBytes('opaque response'),
      rawUsage: invocation.rawUsage,
      priceIdentity: invocation.priceIdentity,
      trust: { scope: 'local-cooperative', journalId: 'journal.1' },
    }),
  );
  git(sourceRepository, 'add', '--all');
  git(sourceRepository, 'commit', '--quiet', '-m', 'evidence');
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
    baseSha: headSha,
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    authorityIdentity: 'b'.repeat(64),
    auditGeneration: 1,
  });
  const burokrat = join(import.meta.dir, '../../../../twilight-burokrat/cli/src');
  const classificationPolicy = parseOrThrow(
    ClassificationPolicy,
    JSON.parse(
      readFileSync(join(burokrat, 'contracts/fixtures/classification-policy.v1.json'), 'utf8'),
    ),
  );
  const owner = installLocalReviewSource({
    binding,
    sourceRepository,
    storeBase,
    classificationPolicy,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    gitObjectFormat: format,
    maximumPreparationMs: 10_000,
    monotonic: monotonicClock(),
    maximumCandidateEntries: 10,
    maximumCandidateBytes: 10_000,
    maximumParserReads: 100,
    maximumParserReadBytes: 100_000,
  });
  const prepared = owner.prepare(request);
  const decoderFiles = {
    'contracts/records.ts': readFileSync(join(burokrat, 'contracts/records.ts')),
    'contracts/decode-record.ts': readFileSync(join(burokrat, 'contracts/decode-record.ts')),
  };
  const input = {
    candidate: owner.open(request, prepared.snapshotIdentity),
    snapshotIdentity: prepared.snapshotIdentity,
    classificationPolicy,
    decoderFiles,
    ruleBytes: new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        kind: 'review-artifact-graph-rule',
        algorithm: 'record-dependencies.v1',
        decoderIdentity: identifyArtifactDecoder(decoderFiles),
        additionalEdges: [],
      }),
    ),
    limits: {
      maximumVerificationBytes: 200_000,
      maximumRuleBytes: 100_000,
      maximumRules: 100,
      maximumSelectors: 200,
      maximumSelectorBytes: 1024,
      maximumEntries: 10,
      maximumReads: 100,
      maximumReadBytes: 100_000,
      maximumArtifacts: 10,
      maximumEdges: 10,
      maximumWork: 100,
      maximumOutputBytes: 10_000,
    },
  };
  return { input, root, sourceRepository, classificationPolicy };
}

test.each(['sha1', 'sha256'] as const)(
  'retained %s graph replays after checkout/store removal without ambient IO',
  (format) => {
    const { input, root, sourceRepository } = fixture(format);
    const expected = buildRetainedArtifactGraph(input);
    const response = expected.graph.artifacts.find(({ path }) => path.endsWith('/response.json'))!;
    expect(
      expected.graph.artifacts.find(({ path }) => path.endsWith('/receipt.json'))?.references,
    ).toEqual([response.artifactId]);
    rmSync(sourceRepository, { recursive: true });
    rmSync(join(root, 'owned'), { recursive: true });
    const read = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
      throw new Error('forbidden filesystem read');
    });
    const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
      throw new Error('forbidden Git process');
    });
    try {
      expect(buildRetainedArtifactGraph(input)).toEqual(expected);
      expect(
        verifyRetainedArtifactGraph(input, new TextEncoder().encode(serializeCanonical(expected))),
      ).toEqual(expected);
      expect(read).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
    } finally {
      read.mockRestore();
      spawn.mockRestore();
    }
  },
);

test.each(['maximumReads', 'maximumReadBytes', 'maximumEntries'] as const)(
  'classification and record reads share %s',
  (name) => {
    const { input } = fixture('sha1');
    expect(() =>
      buildRetainedArtifactGraph({ ...input, limits: { ...input.limits, [name]: 1 } }),
    ).toThrow(
      `retained artifact graph ${name === 'maximumEntries' ? 'entry' : name === 'maximumReadBytes' ? 'read byte' : 'read'} ceiling exceeded`,
    );
  },
);

test('snapshot provenance cannot be relabeled by graph caller', () => {
  const { input } = fixture('sha1');
  expect(() => buildRetainedArtifactGraph({ ...input, snapshotIdentity: 'f'.repeat(64) })).toThrow(
    'snapshot identity differs',
  );
});

test('classification provenance refuses a different valid installed policy', () => {
  const { input } = fixture('sha1');
  const policy = structuredClone(input.classificationPolicy);
  policy.policyId = 'classification.foreign.v1';
  expect(parseOrThrow(ClassificationPolicy, policy)).toEqual(policy);
  expect(() => buildRetainedArtifactGraph({ ...input, classificationPolicy: policy })).toThrow(
    'classification identity differs',
  );
});

test('copied capability cannot omit retained evidence census', () => {
  const { input } = fixture('sha1');
  const copied = { ...input.candidate, snapshot: { ...input.candidate.snapshot, entries: [] } };
  expect(() => buildRetainedArtifactGraph({ ...input, candidate: copied })).toThrow(
    'owned retained graph source',
  );
});

test('install-time classification policy is owned independently of caller mutation', () => {
  const { input, classificationPolicy } = fixture('sha1');
  const expected = buildRetainedArtifactGraph(input);
  const original = structuredClone(classificationPolicy);
  classificationPolicy.policyId = 'classification.mutated.v1';
  expect(() => buildRetainedArtifactGraph(input)).toThrow('classification identity differs');
  expect(buildRetainedArtifactGraph({ ...input, classificationPolicy: original })).toEqual(
    expected,
  );
  expect(expected.graph.artifacts).toHaveLength(3);
});

test('every installed graph limit rejects invalid grammar before retained reads', () => {
  const { input } = fixture('sha1');
  for (const name of Object.keys(input.limits))
    for (const ceiling of [NaN, 0, Infinity]) {
      expect(() =>
        buildRetainedArtifactGraph({ ...input, limits: { ...input.limits, [name]: ceiling } }),
      ).toThrow(`retained artifact graph ${name} must be a positive safe integer`);
    }
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseOrThrow } from '@shared/validation';
import {
  ClassificationPolicy,
  type ExhaustiveFreezeDocuments,
  extractRelationships,
  freezeExhaustivePlan,
  hashBytes,
  hashCanonical,
  readCandidate,
  RelationshipRequest,
  serializeCanonical,
} from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { validateGitHubRepositoryBinding } from './github-source';
import { createActivationRequest } from './request';
import { installLocalReviewSource } from './review-selection-objects';

const roots: string[] = [];

test('common freeze core uses only explicit retained input ports after Git metadata is gone', async () => {
  const coverage = await import('@twilight-burokrat/judge');
  const freezeFromSource = Reflect.get(coverage, 'freezeExhaustivePlanFromSource');
  const verifyFromSource = Reflect.get(coverage, 'verifyExhaustivePlanFromSource');
  expect(typeof freezeFromSource).toBe('function');
  expect(typeof verifyFromSource).toBe('function');
  const fixture = repositoryFixture();
  const snapshot = readCandidate(fixture.repository, {
    kind: 'committed',
    revision: fixture.revision,
  });
  const request = parseOrThrow(RelationshipRequest, fixture.documents.relationshipRequest.input);
  const relationships = extractRelationships(fixture.repository, snapshot, request);
  const expected = freezeExhaustivePlan(
    fixture.repository,
    fixture.revision,
    fixture.documents,
    'seed.retained',
  );
  const storeBase = mkdtempSync(join(tmpdir(), 'review-exhaustive-retained-'));
  roots.push(storeBase);
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
  const { request: activationRequest } = createActivationRequest({
    repositoryId: binding.repositoryId,
    subject: { kind: 'pull-request', number: 7 },
    targetRef: binding.targetRef,
    headSha: fixture.revision,
    baseSha: fixture.revision,
    policyIdentity: pin,
    mappingIdentity: pin,
    toolkitIdentity: pin,
    authorityIdentity: 'b'.repeat(64),
    auditGeneration: 1,
  });
  const owner = installLocalReviewSource({
    binding,
    sourceRepository: fixture.repository,
    storeBase,
    gitExecutablePath: '/usr/bin/git',
    gitExecutableIdentity: hashBytes(readFileSync('/usr/bin/git')),
    gitObjectFormat: 'sha1',
    classificationPolicy: parseOrThrow(
      ClassificationPolicy,
      fixture.documents.classificationPolicy.input,
    ),
    maximumPreparationMs: 10_000,
    maximumCandidateEntries: 100,
    maximumCandidateBytes: 100_000,
    maximumParserReads: 100,
    maximumParserReadBytes: 100_000,
  });
  const prepared = owner.prepare(activationRequest);
  const retained = owner.open(activationRequest, prepared.snapshotIdentity);
  expect(retained.snapshot).toEqual(snapshot);
  rmSync(fixture.repository, { recursive: true });
  const source = {
    snapshot: retained.snapshot,
    readBlob: (blob: string, path: string) => retained.readBlob(blob, path),
    extractRelationships: (selected: RelationshipRequest) => {
      expect(selected).toEqual(request);
      return relationships;
    },
  };
  const spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw new Error('injected forbidden Git invocation during retained freeze');
  });
  try {
    expect(freezeFromSource(source, fixture.documents, 'seed.retained')).toEqual(expected);
    expect(
      verifyFromSource(
        source,
        expected.identity,
        expected.plan,
        fixture.documents,
        'seed.retained',
      ),
    ).toEqual(expected);
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    spawn.mockRestore();
  }
});

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = `${invocation.stdout.toString()}${invocation.stderr.toString()}`;
  if (invocation.exitCode !== 0) throw new Error(`git ${argv.join(' ')} failed: ${output}`);
  return invocation.stdout.toString('utf8').trim();
}

function write(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, 'utf8');
}

function document(input: unknown) {
  return { input, bytes: Buffer.from(serializeCanonical(input), 'utf8') };
}

interface RepositoryFixture {
  repository: string;
  revision: string;
  documents: ExhaustiveFreezeDocuments;
  paths: string[];
}

function repositoryFixture(): RepositoryFixture {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-exhaustive-'));
  const inputs = mkdtempSync(join(tmpdir(), 'tool-wiki-exhaustive-inputs-'));
  roots.push(repository, inputs);
  runGit(repository, ['init', '--quiet']);
  runGit(repository, ['config', 'user.email', 'test@example.com']);
  runGit(repository, ['config', 'user.name', 'Tool Wiki Test']);
  write(join(repository, 'README.md'), '# Fixture\n');
  write(
    join(repository, 'package.json'),
    `${JSON.stringify({ name: 'fixture-root', private: true })}\n`,
  );
  write(join(repository, 'nx.json'), '{}\n');
  write(
    join(repository, 'tsconfig.json'),
    `${JSON.stringify({ compilerOptions: { module: 'ESNext', target: 'ESNext' }, include: ['apps/**/*.ts'] })}\n`,
  );
  write(
    join(repository, 'apps/alpha/project.json'),
    `${JSON.stringify({ name: 'alpha', root: 'apps/alpha', sourceRoot: 'apps/alpha/src', projectType: 'application', tags: [], targets: {} })}\n`,
  );
  write(join(repository, 'apps/alpha/src/index.ts'), 'export const alpha = true;\n');
  write(join(repository, 'apps/alpha/docs/guide.md'), '# Alpha guide\n');
  write(
    join(repository, 'apps/alpha/nested/project.json'),
    `${JSON.stringify({ name: 'nested', root: 'apps/alpha/nested', sourceRoot: 'apps/alpha/nested/src', projectType: 'library', tags: [], targets: {} })}\n`,
  );
  write(join(repository, 'apps/alpha/nested/src/index.ts'), 'export const nested = true;\n');
  const transcript = {
    schemaVersion: 1,
    recordKind: 'opaque-transcript',
    invocationId: 'invocation.fixture',
    mediaType: 'text/plain',
    payload: 'retained fixture',
  };
  const transcriptBytes = serializeCanonical(transcript);
  write(join(repository, 'docs/review-evidence/receipt.json'), transcriptBytes);
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--quiet', '--message', 'fixture']);
  const revision = runGit(repository, ['rev-parse', 'HEAD']);
  const snapshot = readCandidate(repository, { kind: 'committed', revision });
  if (snapshot.selection.kind !== 'committed') throw new Error('fixture commit was not selected');
  const classificationBytes = readFileSync(
    join(
      import.meta.dir,
      '../../../../twilight-burokrat/cli/src/contracts/fixtures/classification-policy.v1.json',
    ),
  );
  const classificationInput = JSON.parse(classificationBytes.toString('utf8')) as unknown;
  const classification = parseOrThrow(ClassificationPolicy, classificationInput);
  const inventoryProtocol = document({ schemaVersion: 1, protocolId: 'inventory.exhaustive.v1' });
  const relationshipRequest = {
    schemaVersion: 1 as const,
    typescript: {
      configPaths: ['tsconfig.json'],
      publicEntrypoints: ['apps/alpha/src/index.ts'],
    },
  };
  const relationships = extractRelationships(repository, snapshot, relationshipRequest);
  const inventory = document({
    schemaVersion: 1,
    inventoryId: 'inventory.exhaustive.fixture',
    protocol: {
      protocolId: 'inventory.exhaustive.v1',
      blob: hashBytes(inventoryProtocol.bytes),
    },
    selection: snapshot.selection,
    entries: snapshot.entries,
    untracked: snapshot.untracked,
    classificationPolicy: {
      policyId: classification.policyId,
      blob: hashBytes(classificationBytes),
    },
  });
  const contentManifestRequest = document({
    schemaVersion: 1,
    protocol: {
      protocolId: 'inventory.exhaustive.v1',
      blob: hashBytes(inventoryProtocol.bytes),
    },
    classificationPolicy: {
      policyId: classification.policyId,
      blob: hashBytes(classificationBytes),
    },
    ...relationships.manifestInputs,
  });
  const contentPaths = snapshot.entries
    .filter(({ path }) => path !== 'docs/review-evidence/receipt.json')
    .map(({ path }) => path);
  const group = (groupId: string) => ({
    groups: [
      {
        groupId,
        memberships: contentPaths.map((path) => ({ kind: 'path' as const, path })),
      },
    ],
  });
  const granularityPolicy = document({
    schemaVersion: 1,
    policyId: 'granularity.exhaustive.v1',
    mappingVersion: 'pre-namespace-v1',
    mappings: {
      knowledge: group('knowledge.all'),
      review: group('review.all'),
      ownership: group('ownership.all'),
      task: group('task.all'),
      integration: group('integration.all'),
    },
  });
  const moduleMapping = document({
    schemaVersion: 1,
    mappingId: 'modules.exhaustive.v1',
    mappingVersion: 'pre-namespace-v1',
    sourceRevision: revision,
    modules: [
      {
        moduleId: 'module.alpha',
        name: 'Alpha',
        memberships: contentPaths.map((path) => ({ kind: 'path' as const, path })),
        predecessorModuleIds: [],
        indexPath: 'README.md',
        externalConsumers: { kind: 'none' },
      },
    ],
  });
  const evidenceEntry = snapshot.entries.find(
    ({ path }) => path === 'docs/review-evidence/receipt.json',
  );
  if (evidenceEntry === undefined) throw new Error('fixture evidence tuple is absent');
  const artifactId = hashBytes(transcriptBytes);
  const artifactGraph = document({
    schemaVersion: 1,
    validationId: 'validation.exhaustive.fixture',
    roots: [artifactId],
    artifacts: [
      {
        artifactId,
        path: evidenceEntry.path,
        blob: evidenceEntry.blob,
        recordKind: 'opaque-transcript',
        references: [],
      },
    ],
  });
  const documents: ExhaustiveFreezeDocuments = {
    inventory,
    inventoryProtocol,
    classificationPolicy: { input: classificationInput, bytes: classificationBytes },
    contentManifestRequest,
    exhaustivePolicy: document({
      schemaVersion: 1,
      policyId: 'exhaustive.fixture.v1',
      explicitDocumentationPaths: ['README.md'],
      nonNxProjects: [],
      defaultRiskStratum: 'risk.standard',
      reviewGeneration: 1,
      auditStrata: [
        { stratumId: 'risk.standard', sampleRateBps: 500, disagreementTriggerBps: 1000 },
      ],
      shardRule: { ruleId: 'shard.sha256-prefix.v1', hashPrefixLength: 2 },
    }),
    reviewProtocol: document({
      protocolId: 'review.cold-informed.v1',
      protocolBlob: hashCanonical({ version: 1, sequence: ['cold', 'expand', 'informed'] }),
    }),
    moduleMapping,
    granularityPolicy,
    modelContext: document({
      schemaVersion: 1,
      configurationId: 'model-context.fixture.v1',
      executor: {
        provider: 'fixture-provider',
        model: 'fixture-model',
        version: 'fixture-version',
        effort: 'high',
        toolchain: 'fixture-harness',
      },
      promptBlob: 'b'.repeat(64),
      toolsBlob: 'c'.repeat(64),
      harnessId: 'harness.fixture.v1',
      coldContextRule: 'isolated-subject-only',
      informedContextRule: 'declared-expansion',
      budgets: { contextTokens: 4096, inputTokens: 2048, outputTokens: 1024 },
      overflow: 'refuse',
      resourceCondition: 'fixture-single-process',
      cacheCondition: 'cold',
    }),
    relationshipRequest: document(relationshipRequest),
    artifactGraph,
  };
  const paths = exhaustiveDocumentNames.map((name) => {
    const path = join(inputs, `${name}.json`);
    writeFileSync(path, documents[name].bytes);
    return path;
  });
  return { repository, revision, documents, paths };
}

const exhaustiveDocumentNames: (keyof ExhaustiveFreezeDocuments)[] = [
  'inventory',
  'inventoryProtocol',
  'classificationPolicy',
  'contentManifestRequest',
  'exhaustivePolicy',
  'reviewProtocol',
  'moduleMapping',
  'granularityPolicy',
  'modelContext',
  'relationshipRequest',
  'artifactGraph',
];

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect } from 'bun:test';

import { hashCanonical } from '../evidence/content-manifest';
import { type CliInvocation, invokeCli } from '../invoke-cli';
import { resolveValidatorArtifactPaths } from '../policy/trust';

export const cliPath = join(import.meta.dir, '..', 'cli.ts');
export const trustPath = join(import.meta.dir, '../policy/trust.ts');
export const trustedNodeModules = realpathSync(
  dirname(dirname(Bun.resolveSync('typescript/package.json', import.meta.dir))),
);
export const scratchPaths: string[] = [];

export type Mode = 'observe' | 'ratchet' | 'enforce';

export interface CandidateFixture {
  repository: string;
  baselineRevision: string;
  revision: string;
  trustDirectory: string;
  bindingPath: string;
  authorityPath: string;
  evidencePath: string;
  policyPath: string;
}

export interface LintReportFixture {
  accepted: boolean;
  certified: boolean;
  candidateSelection: { kind: string };
  untrackedPaths: string[];
  debtObligationIds: string[];
  unmetObligationIds: string[];
  deterministicChecks: { kind: string }[];
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function runGit(repository: string, argv: string[]): string {
  const invocation = Bun.spawnSync(['git', '-C', repository, ...argv], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const stderr = invocation.stderr.toString('utf8');
  expect(invocation.exitCode, stderr).toBe(0);
  return invocation.stdout.toString('utf8').trim();
}

export function write(path: string, source: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, 'utf8');
}

export function commit(repository: string, message: string): string {
  runGit(repository, ['add', '--all']);
  runGit(repository, ['commit', '--message', message]);
  return runGit(repository, ['rev-parse', 'HEAD']);
}

export function indexSource(
  paths: string[],
  relationshipSelectors: string[] = [],
  applicableChecks: string[] = [],
): string {
  const metadata = {
    schemaVersion: 1,
    moduleId: 'module.fixture',
    memberships: paths.map((path) => ({ kind: 'path', path })),
    relationshipSelectors,
    applicableChecks,
    inapplicableSections: [
      ...(relationshipSelectors.length === 0
        ? [{ section: 'relationships', reason: 'The trust fixture has no declared relationships.' }]
        : []),
      { section: 'invariants', reason: 'The trust fixture has no cross-file runtime invariant.' },
      ...(applicableChecks.length === 0
        ? [{ section: 'checks', reason: 'The trusted lint command is the fixture boundary check.' }]
        : []),
    ],
    externalConsumers: {
      kind: 'none-known',
      knowledgeLimit: 'Only consumers visible in the selected fixture were considered.',
    },
  };
  return `# Fixture\n\n<!-- module-index ${JSON.stringify(metadata)} -->\n`;
}

export function classificationPolicy(): object {
  const empty = (contentClass: string, include: object[]) => ({
    contentClass,
    include,
    exclude: [],
  });
  return {
    schemaVersion: 1,
    policyId: 'classification.fixture.v1',
    selectorVersion: 1,
    contentClasses: [
      'source',
      'test',
      'config',
      'script',
      'migration',
      'fixture',
      'generated',
      'vendored',
      'placeholder',
      'document',
      'openspec',
    ],
    contentRules: [
      empty('source', [{ kind: 'suffix', value: '.ts' }]),
      empty('test', [{ kind: 'suffix', value: '.test.ts' }]),
      empty('config', [{ kind: 'suffix', value: '.json' }]),
      empty('script', [{ kind: 'suffix', value: '.sh' }]),
      empty('migration', [{ kind: 'segment', value: 'migrations' }]),
      empty('fixture', [{ kind: 'segment', value: 'fixtures' }]),
      empty('generated', [{ kind: 'segment', value: 'generated' }]),
      empty('vendored', [{ kind: 'segment', value: 'vendor' }]),
      empty('placeholder', [{ kind: 'name', value: '.keep' }]),
      empty('document', [{ kind: 'suffix', value: '.md' }]),
      empty('openspec', [{ kind: 'prefix', value: 'openspec' }]),
    ],
    evidenceRoots: [
      { path: 'docs/review-evidence', allowedRecordKinds: ['review-receipt'] },
      { path: 'docs/experiment-evidence', allowedRecordKinds: ['experiment-manifest'] },
    ],
    binaryDeclarations: [],
    gitlinkBoundaries: [],
    symlinks: 'inventory-only',
    gitlinks: 'declared-external-boundary',
  };
}

export function exactTuple(repository: string, revision: string, path: string): object {
  const record = runGit(repository, ['ls-tree', revision, '--', path]);
  const match = /^(\d+) blob ([0-9a-f]+)\t(.+)$/.exec(record);
  if (match === null) throw new Error(`missing fixture tuple: ${path}`);
  return { path: match[3], mode: match[1], blob: match[2] };
}

export interface ExactTupleFixture {
  path: string;
  mode: '100644' | '100755' | '120000' | '160000';
  blob: string;
}

export function entriesAt(repository: string, revision: string): ExactTupleFixture[] {
  const source = runGit(repository, ['ls-tree', '-r', revision]);
  return source.length === 0
    ? []
    : source.split('\n').map((record) => {
        const match = /^(100644|100755|120000|160000) (?:blob|commit) ([0-9a-f]+)\t(.+)$/.exec(
          record,
        );
        if (match === null) throw new Error(`malformed fixture tuple: ${record}`);
        const mode = match[1];
        if (mode !== '100644' && mode !== '100755' && mode !== '120000' && mode !== '160000') {
          throw new Error(`unsupported fixture mode: ${mode}`);
        }
        return { path: match[3], mode, blob: match[2] };
      });
}

export function candidateIdentityAt(repository: string, revision: string): string {
  const tree = runGit(repository, ['rev-parse', `${revision}^{tree}`]);
  return hashCanonical({
    selection: { kind: 'committed', revision, tree },
    entries: entriesAt(repository, revision),
    untracked: [],
  });
}

export function contentInputs(entries: ExactTupleFixture[]): object[] {
  return entries.map((entry, index) => ({
    kind: 'content',
    inputId: `content.${String(index)}`,
    ...entry,
  }));
}

export function checkReceipt(checkId: string, identity: string): object {
  return {
    schemaVersion: 1,
    receiptKind: 'check',
    receiptId: `receipt.${checkId}`,
    command: ['bun', 'run', checkId],
    cwdIdentity: 'fixture.repository',
    startedAt: '2026-09-11T10:00:00.000Z',
    endedAt: '2026-09-11T10:00:01.000Z',
    elapsedMs: 1000,
    status: 'passed',
    exitCode: 0,
    candidateManifest: identity,
    toolIdentity: 'a'.repeat(64),
    resourceLane: 'fixture',
    stdoutArtifact: 'b'.repeat(64),
    stderrArtifact: 'c'.repeat(64),
    skips: [],
  };
}

export interface AuditReviewFixtureOptions {
  instanceId?: string;
  reviewRound?: number;
  informedImpact?: 'yes' | 'partial' | 'no';
}

export function auditReview(
  obligationId: string,
  fixture: CandidateFixture,
  identity: string,
  options: AuditReviewFixtureOptions = {},
): object {
  const instanceId = options.instanceId ?? obligationId;
  const invocationId = `invocation.${instanceId}`;
  const subject = {
    subjectId: `subject.${obligationId}`,
    kind: 'project',
    locator: { kind: 'path', path: 'src' },
    contentIdentity: identity,
  };
  const protocolBlob = 'd'.repeat(64);
  const executor = {
    provider: 'fixture-provider',
    model: 'fixture-model',
    version: 'fixture-version',
    effort: 'fixture-effort',
    toolchain: 'fixture-toolchain',
  };
  const priceIdentity = {
    priceId: 'price.fixture',
    provider: 'fixture-provider',
    model: 'fixture-model',
    currency: 'USD',
    source: 'fixture-price-list',
  };
  const startedAt = '2026-09-11T10:00:00.000Z';
  const endedAt = '2026-09-11T10:00:01.000Z';
  const coldResponse = `cold ${instanceId}\n`;
  const informedResponse = `informed ${instanceId}\n`;
  const cold = {
    sequence: 1,
    judgments: { purpose: 'yes', relationships: 'yes', impact: 'partial' },
    observedReadIds: [identity],
  };
  const phase = (name: 'cold' | 'informed', response: string, charge: number) => ({
    status: 'verified',
    receipt: {
      schemaVersion: 1,
      receiptKind: 'invocation',
      receiptId: `receipt.${instanceId}.${name}`,
      invocationId,
      startedAt,
      endedAt,
      status: 'completed',
      executor,
      rawUsage: [{ category: `${name}_tokens`, quantity: charge, unit: 'tokens' }],
      priceIdentity,
      chargedAmountMicros: charge,
      inputArtifact: 'e'.repeat(64),
      outputArtifact: sha256(response),
    },
    elapsedReceipts: [
      {
        schemaVersion: 1,
        receiptKind: 'elapsed',
        receiptId: `elapsed.${instanceId}.${name}`,
        trialId: 'trial.fixture',
        outcomeId: 'outcome.fixture',
        attemptId: `attempt.${instanceId}.${name}`,
        phase: 'review',
        startedAt,
        endedAt,
        elapsedMs: 1000,
        status: 'completed',
      },
    ],
  });
  const coldReceipt = phase('cold', coldResponse, 11);
  const informedReceipt = phase('informed', informedResponse, 14);
  return {
    reviewId: `audit.${instanceId}`,
    obligationId,
    sourceBase: fixture.revision,
    candidateIdentity: identity,
    generation: 1,
    reviewRound: options.reviewRound ?? 1,
    recordedAt: '2026-09-11T10:01:00.000Z',
    evidence: {
      schemaVersion: 1,
      receipt: {
        schemaVersion: 1,
        receiptKind: 'review',
        receiptId: `receipt.${instanceId}`,
        invocationId,
        executor,
        suppliedContextIds: [protocolBlob, identity],
        observedReadIds: [identity, identity],
        rawResponseArtifact: sha256(informedResponse),
        rawUsage: [coldReceipt.receipt.rawUsage[0], informedReceipt.receipt.rawUsage[0]],
        priceIdentity,
        trust: { scope: 'external-verifier', journalId: 'journal.fixture' },
      },
      protocolEvidence: {
        schemaVersion: 1,
        protocol: { protocolId: 'review.cold-informed.v1', protocolBlob },
        subject,
        cold,
        expansion: {
          sequence: 2,
          coldJudgmentArtifact: hashCanonical(cold),
          suppliedContextIds: [],
        },
        informed: {
          sequence: 3,
          judgments: {
            purpose: 'yes',
            relationships: 'yes',
            impact: options.informedImpact ?? 'yes',
          },
          observedReadIds: [identity],
        },
      },
      phaseReceipts: { cold: coldReceipt, informed: informedReceipt },
      phaseTools: {
        cold: [{ toolId: 'read-file', version: '1' }],
        informed: [{ toolId: 'run-check', version: '1' }],
      },
      actualTools: [
        { toolId: 'read-file', version: '1' },
        { toolId: 'run-check', version: '1' },
      ],
      rawResponse: {
        artifact: sha256(informedResponse),
        retention: { kind: 'journal-inline' },
      },
    },
    findings: [],
  };
}

export function auditEnvelope(
  fixture: CandidateFixture,
  reviewIds: string[],
  identity: string,
): object {
  return {
    schemaVersion: 1,
    auditId: 'audit.fixture',
    sourceBase: fixture.revision,
    candidateIdentity: identity,
    generation: 1,
    seed: 'seed.fixture',
    coverage: 'exhaustive',
    strata: [{ stratumId: 'risk.fixture', sampleRateBps: 10000, disagreementTriggerBps: 10000 }],
    obligations: reviewIds.map((reviewId) => ({
      obligationId: reviewId,
      riskStratum: 'risk.fixture',
      subject: {
        subjectId: `subject.${reviewId}`,
        kind: 'project',
        locator: { kind: 'path', path: 'src' },
        contentIdentity: identity,
      },
    })),
    mode: 'enforce',
    claimedCoverage: 'exhaustive',
    reviews: reviewIds.map((reviewId) => auditReview(reviewId, fixture, identity)),
    corrections: [],
    closures: [],
    adjudications: [],
  };
}

export function writeEvidence(
  fixture: CandidateFixture,
  reportMode: Mode,
  metObligationIds: string[],
): void {
  write(
    fixture.evidencePath,
    `${JSON.stringify({
      schemaVersion: 1,
      reportMode,
      obligations: metObligationIds.map((obligationId) => {
        const name = obligationId.slice('obligation.'.length);
        return {
          obligationId,
          checkIds: [`check.${name}`],
          reviewIds: [`review.${name}`],
        };
      }),
    })}\n`,
  );
}

export function writeAuthority(fixture: CandidateFixture): void {
  const reviewedEntries = entriesAt(fixture.repository, fixture.baselineRevision);
  const currentEntries = entriesAt(fixture.repository, fixture.revision);
  const identity = candidateIdentityAt(fixture.repository, fixture.revision);
  const obligationNames = ['policy', 'validator', 'exemptions', 'application'];
  const checks = obligationNames.map((name) => `check.${name}`);
  const reviews = obligationNames.map((name) => `review.${name}`);
  write(
    fixture.authorityPath,
    `${JSON.stringify({
      schemaVersion: 1,
      authorityId: 'authority.fixture.v1',
      obligationRequest: {
        reviewed: {
          sourceBase: fixture.baselineRevision,
          candidateIdentity: candidateIdentityAt(fixture.repository, fixture.baselineRevision),
          inputs: {
            content: contentInputs(reviewedEntries),
            structural: [],
            semantic: [],
            topology: [],
          },
        },
        current: {
          sourceBase: fixture.revision,
          candidateIdentity: identity,
          inputs: {
            content: contentInputs(currentEntries),
            structural: [],
            semantic: [],
            topology: [],
          },
        },
        judgments: [],
        policy: { policyId: 'policy.trusted.v1', behaviorRules: [] },
        impactClassifications: [],
        writerLabels: [],
        checks: checks.map((checkId) => ({
          observationId: `observation.${checkId}`,
          checkId,
          candidateIdentity: identity,
          status: 'passed',
        })),
        reviews: reviews.map((judgmentId) => ({
          observationId: `observation.${judgmentId}`,
          judgmentId,
          candidateIdentity: identity,
          status: 'current',
        })),
      },
      checkReceipts: checks.map((checkId) => ({
        observationId: `observation.${checkId}`,
        receipt: checkReceipt(checkId, identity),
      })),
      audit: auditEnvelope(fixture, reviews, identity),
    })}\n`,
  );
}

export function writeTrust(fixture: CandidateFixture, mode: Mode): void {
  const baselineEntries = ['policy.json', 'validator.ts', 'exemptions.json', 'src/app.ts'].map(
    (path) => exactTuple(fixture.repository, fixture.revision, path),
  );
  const policy = {
    schemaVersion: 1,
    policyId: 'policy.trusted.v1',
    minimumMode: mode,
    classificationPolicy: classificationPolicy(),
    adoptedBoundaryIds: [
      'boundary.application',
      'boundary.exemptions',
      'boundary.policy',
      'boundary.validator',
    ],
    activationBoundaryIds: ['boundary.exemptions', 'boundary.policy', 'boundary.validator'],
    boundaries: [
      {
        boundaryId: 'boundary.policy',
        selector: { kind: 'path', value: 'policy.json' },
        baselineEntries: [baselineEntries[0]],
        obligationIds: ['obligation.policy'],
      },
      {
        boundaryId: 'boundary.validator',
        selector: { kind: 'path', value: 'validator.ts' },
        baselineEntries: [baselineEntries[1]],
        obligationIds: ['obligation.validator'],
      },
      {
        boundaryId: 'boundary.exemptions',
        selector: { kind: 'path', value: 'exemptions.json' },
        baselineEntries: [baselineEntries[2]],
        obligationIds: ['obligation.exemptions'],
      },
      {
        boundaryId: 'boundary.application',
        selector: { kind: 'prefix', value: 'src' },
        baselineEntries: [baselineEntries[3]],
        obligationIds: ['obligation.application'],
      },
    ],
    obligations: [
      {
        obligationId: 'obligation.policy',
        boundaryId: 'boundary.policy',
        checkIds: ['check.policy'],
        reviewIds: ['review.policy'],
      },
      {
        obligationId: 'obligation.validator',
        boundaryId: 'boundary.validator',
        checkIds: ['check.validator'],
        reviewIds: ['review.validator'],
      },
      {
        obligationId: 'obligation.exemptions',
        boundaryId: 'boundary.exemptions',
        checkIds: ['check.exemptions'],
        reviewIds: ['review.exemptions'],
      },
      {
        obligationId: 'obligation.application',
        boundaryId: 'boundary.application',
        checkIds: ['check.application'],
        reviewIds: ['review.application'],
      },
    ],
    exemptions: [],
  };
  write(fixture.policyPath, `${JSON.stringify(policy)}\n`);
  const validatorArtifacts = resolveValidatorArtifactPaths([
    cliPath,
    ...(existsSync(trustPath) ? [trustPath] : []),
  ]).map((path) => ({ path, sha256: sha256(readFileSync(path)) }));
  const binding = {
    schemaVersion: 1,
    bindingId: `binding.${mode}.v1`,
    trustScope: mode === 'enforce' ? 'ci' : 'local-operator',
    policy: { path: fixture.policyPath, sha256: sha256(readFileSync(fixture.policyPath)) },
    authority: {
      authorityId: 'authority.fixture.v1',
      journalId: 'journal.fixture',
      trustScope: 'external-verifier',
      artifact: {
        path: fixture.authorityPath,
        sha256: sha256(readFileSync(fixture.authorityPath)),
      },
    },
    validator: { validatorId: 'validator.tool-wiki.v1', artifacts: validatorArtifacts },
  };
  write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);
}

export function createFixture(mode: Mode, reportMode: Mode = mode): CandidateFixture {
  const repository = mkdtempSync(join(tmpdir(), 'tool-wiki-trust-candidate-'));
  const trustDirectory = mkdtempSync(join(tmpdir(), 'tool-wiki-external-trust-'));
  scratchPaths.push(repository, trustDirectory);
  runGit(repository, ['init', '--initial-branch=main']);
  runGit(repository, ['config', 'user.email', 'trust@example.test']);
  runGit(repository, ['config', 'user.name', 'Trust Fixture']);
  const paths = ['exemptions.json', 'policy.json', 'src/app.ts', 'validator.ts'];
  write(join(repository, 'README.md'), indexSource(paths));
  write(join(repository, 'policy.json'), '{"boundaries":["policy","validator","exemptions"]}\n');
  write(join(repository, 'validator.ts'), 'export const accepts = true;\n');
  write(join(repository, 'exemptions.json'), '{"exemptions":[]}\n');
  write(join(repository, 'src/app.ts'), 'export const value = 1;\n');
  const revision = commit(repository, 'baseline');
  const fixture: CandidateFixture = {
    repository,
    baselineRevision: revision,
    revision,
    trustDirectory,
    bindingPath: join(trustDirectory, 'binding.json'),
    authorityPath: join(trustDirectory, 'authority.json'),
    evidencePath: join(trustDirectory, 'evidence.json'),
    policyPath: join(trustDirectory, 'policy.json'),
  };
  writeEvidence(fixture, reportMode, [
    'obligation.policy',
    'obligation.validator',
    'obligation.exemptions',
  ]);
  writeAuthority(fixture);
  writeTrust(fixture, mode);
  return fixture;
}

export function runLocal(fixture: CandidateFixture, mode: Mode): Promise<CliInvocation> {
  return invokeCli(
    [
      'lint-local',
      mode,
      'committed',
      fixture.repository,
      fixture.revision,
      fixture.bindingPath,
      fixture.evidencePath,
    ],
    { TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules },
  );
}

export function runCi(
  fixture: CandidateFixture,
  bindingPath: string | null = fixture.bindingPath,
  extraArguments: string[] = [],
  kind: 'committed' | 'staged' | 'working' = 'committed',
): Promise<CliInvocation> {
  return invokeCli(
    [
      'lint-ci',
      ...extraArguments,
      kind,
      fixture.repository,
      fixture.revision,
      fixture.evidencePath,
    ],
    {
      TOOL_WIKI_TRUSTED_NODE_MODULES: trustedNodeModules,
      TOOL_WIKI_CI_TRUSTED_BINDING: bindingPath ?? undefined,
    },
  );
}

export function satisfyApplication(fixture: CandidateFixture): void {
  const evidence = JSON.parse(readFileSync(fixture.evidencePath, 'utf8')) as {
    reportMode: Mode;
  };
  writeEvidence(fixture, evidence.reportMode, [
    'obligation.policy',
    'obligation.validator',
    'obligation.exemptions',
    'obligation.application',
  ]);
  writeAuthority(fixture);
  rebindAuthority(fixture);
}

export function artifactIdentity(artifacts: { path: string; sha256: string }[]): string {
  return hashCanonical(
    artifacts
      .map(({ path, sha256: digest }) => ({ path: realpathSync(path), sha256: digest }))
      .sort((left, right) =>
        Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')),
      ),
  );
}

export function rebindAuthority(fixture: CandidateFixture): void {
  const binding = JSON.parse(readFileSync(fixture.bindingPath, 'utf8')) as {
    authority: { artifact: { sha256: string } };
  };
  binding.authority.artifact.sha256 = sha256(readFileSync(fixture.authorityPath));
  write(fixture.bindingPath, `${JSON.stringify(binding)}\n`);
}

export function writeActivation(
  fixture: CandidateFixture,
  changePolicy: (policy: Record<string, unknown>) => void,
  declaredChanges: object,
  nextValidatorArtifacts?: { path: string; sha256: string }[],
): string {
  const previousBindingBytes = readFileSync(fixture.bindingPath);
  const previousBinding = JSON.parse(previousBindingBytes.toString('utf8')) as {
    bindingId: string;
    trustScope: 'ci' | 'local-operator';
    policy: { path: string; sha256: string };
    authority: {
      authorityId: string;
      journalId: string;
      trustScope: 'trusted-harness' | 'external-verifier';
      artifact: { path: string; sha256: string };
    };
    validator: { validatorId: string; artifacts: { path: string; sha256: string }[] };
  };
  const nextPolicyPath = join(fixture.trustDirectory, 'policy-next.json');
  const policy = JSON.parse(readFileSync(fixture.policyPath, 'utf8')) as Record<string, unknown>;
  changePolicy(policy);
  write(nextPolicyPath, `${JSON.stringify(policy)}\n`);
  const nextBindingPath = join(fixture.trustDirectory, 'binding-next.json');
  write(
    nextBindingPath,
    `${JSON.stringify({
      schemaVersion: 1,
      bindingId: 'binding.next.v1',
      trustScope: previousBinding.trustScope,
      policy: { path: nextPolicyPath, sha256: sha256(readFileSync(nextPolicyPath)) },
      authority: previousBinding.authority,
      validator: {
        validatorId: previousBinding.validator.validatorId,
        artifacts: nextValidatorArtifacts ?? previousBinding.validator.artifacts,
      },
      predecessor: {
        bindingId: previousBinding.bindingId,
        bindingIdentity: sha256(previousBindingBytes),
        policyId: 'policy.trusted.v1',
        policyIdentity: previousBinding.policy.sha256,
        authorityId: previousBinding.authority.authorityId,
        authorityIdentity: previousBinding.authority.artifact.sha256,
        authorityJournalId: previousBinding.authority.journalId,
        authorityTrustScope: previousBinding.authority.trustScope,
        validatorId: previousBinding.validator.validatorId,
        validatorIdentity: artifactIdentity(previousBinding.validator.artifacts),
      },
      activation: { authorityChanged: false, ...declaredChanges },
    })}\n`,
  );
  return nextBindingPath;
}

export function runActivation(
  fixture: CandidateFixture,
  nextBindingPath: string,
): Promise<CliInvocation> {
  return invokeCli([
    'validate-policy-activation',
    fixture.repository,
    fixture.bindingPath,
    nextBindingPath,
  ]);
}

/** A finished launcher process as the same record {@link invokeCli} returns. */
export function fromProcess(invocation: ReturnType<typeof Bun.spawnSync>): CliInvocation {
  // Every spawn here pipes both streams; an absent one is a harness fault, not silence.
  if (invocation.stdout === undefined || invocation.stderr === undefined)
    throw new Error('the launcher invocation captured no stdout or stderr');
  return {
    exitCode: invocation.exitCode,
    stdout: Buffer.from(invocation.stdout).toString('utf8'),
    stderr: Buffer.from(invocation.stderr).toString('utf8'),
  };
}

export function outputOf(invocation: CliInvocation): string {
  return `${invocation.stdout}${invocation.stderr}`;
}

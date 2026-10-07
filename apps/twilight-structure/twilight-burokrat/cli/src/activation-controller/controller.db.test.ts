import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import {
  type ActivationController,
  type ObservedCandidate,
  openActivationController,
  type RequestLease,
  type ReviewExpectation,
  type StoredRequest,
  type VerifiedColdTerminal,
  type VerifiedCompleteReview,
  type VerifiedReview,
} from './controller';
import { type ActivationRequest } from './request';

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'activation-controller-'));
  scratch.push(directory);
  const bootstrapPath = join(directory, 'bootstrap.json');
  const bytes = serializeCanonical({
    schemaVersion: 1,
    authorityGeneration: 3,
    reviewer: {
      kind: 'external-audit-provider',
      providerId: 'review.provider',
      executorId: 'review.executor',
      protocolIdentity: 'a'.repeat(64),
      promptIdentity: 'b'.repeat(64),
    },
    journal: {
      kind: 'authenticated-external-journal',
      verifierId: 'journal.verifier',
      issuerId: 'journal.issuer',
      endpoint: 'https://journal.example.invalid/v1',
    },
    publisher: {
      kind: 'immutable-external-store',
      issuerId: 'publisher.issuer',
      endpoint: 'https://store.example.invalid/activations',
    },
    admission: {
      requiredWorkflow: '.github/workflows/trusted-wiki.yml',
      protectedBranch: 'main',
    },
  });
  writeFileSync(bootstrapPath, bytes);
  const candidate: ObservedCandidate = {
    repositoryId: 8241,
    subject: { kind: 'pull-request', number: 282 },
    targetRef: 'refs/heads/main',
    headSha: '1'.repeat(40),
    baseSha: '2'.repeat(40),
    policyIdentity: '3'.repeat(64),
    mappingIdentity: '4'.repeat(64),
    toolkitIdentity: '5'.repeat(64),
  };
  return {
    bootstrapPath,
    databasePath: join(directory, 'controller.sqlite'),
    pin: {
      identity: hashBytes(bytes),
      journalIssuerId: 'journal.issuer',
      publisherIssuerId: 'publisher.issuer',
    },
    candidate,
    selectObligations: (request: ActivationRequest) => ({
      requestIdentity: request.requestIdentity,
      policyIdentity: request.policyIdentity,
      obligations: [
        {
          identity: 'a'.repeat(64),
          kind: 'check' as const,
          executorId: 'worker.check',
          protocolIdentity: 'b'.repeat(64),
          commandIdentity: 'c'.repeat(64),
        },
        {
          identity: 'd'.repeat(64),
          kind: 'audit' as const,
          reviewId: 'review.primary',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold' as const,
        },
        {
          identity: 'f'.repeat(64),
          kind: 'audit' as const,
          reviewId: 'review.primary',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'informed' as const,
        },
      ],
    }),
  };
}

function dispatchFixture() {
  const source = fixture();
  return {
    ...source,
    selectObligations: (request: ActivationRequest) => {
      const plan = source.selectObligations(request);
      return {
        ...plan,
        obligations: plan.obligations.map((obligation) =>
          obligation.kind === 'audit'
            ? { ...obligation, protocolIdentity: 'a'.repeat(64) }
            : obligation,
        ),
      };
    },
  };
}

function fakeReview(expected: ReviewExpectation, bytes: string): VerifiedCompleteReview {
  const invocationId = expected.invocationId;
  const contentIdentity = '9'.repeat(64);
  const startedAt = '2026-09-11T07:00:00.000Z';
  const endedAt = '2026-09-11T07:00:01.000Z';
  const executor = {
    provider: 'openai',
    model: 'gpt-5',
    version: '2026-09-10',
    effort: 'high',
    toolchain: 'codex',
  };
  const priceIdentity = {
    priceId: 'price.review.v1',
    provider: 'openai',
    model: 'gpt-5',
    currency: 'USD',
    source: 'provider-receipt' as const,
  };
  const protocol = {
    protocolId: 'review.cold-informed.v1',
    protocolBlob: expected.protocolIdentity,
  };
  const subject = {
    subjectId: 'subject.activation',
    kind: 'project' as const,
    locator: { kind: 'path' as const, path: 'apps/twilight-structure/twilight-burokrat/cli' },
    contentIdentity,
  };
  const coldJudgment = {
    sequence: 1 as const,
    judgments: {
      purpose: 'yes' as const,
      relationships: 'yes' as const,
      impact: 'partial' as const,
    },
    observedReadIds: [contentIdentity],
  };
  const informedJudgment = {
    sequence: 3 as const,
    judgments: { purpose: 'yes' as const, relationships: 'yes' as const, impact: 'yes' as const },
    observedReadIds: [contentIdentity],
  };
  const coldResponse = `cold ${invocationId}\n`;
  const informedResponse = `informed ${invocationId}\n`;
  const retention = { kind: 'journal-inline' as const };
  const telemetry = (phase: 'cold' | 'informed', response: string) => ({
    status: 'verified' as const,
    receipt: {
      schemaVersion: 1 as const,
      receiptKind: 'invocation' as const,
      receiptId: `receipt.${invocationId}.${phase}`,
      invocationId,
      startedAt,
      endedAt,
      status: 'completed' as const,
      executor,
      rawUsage: [{ category: `${phase}_tokens`, quantity: 11, unit: 'tokens' }],
      priceIdentity,
      chargedAmountMicros: 11,
      inputArtifact: contentIdentity,
      outputArtifact: hashBytes(response),
    },
    elapsedReceipts: [
      {
        schemaVersion: 1 as const,
        receiptKind: 'elapsed' as const,
        receiptId: `elapsed.${invocationId}.${phase}`,
        trialId: 'trial.activation',
        outcomeId: 'outcome.activation',
        attemptId: `attempt.${invocationId}.${phase}`,
        phase: 'review' as const,
        startedAt,
        endedAt,
        elapsedMs: 1000,
        status: 'completed' as const,
      },
    ],
  });
  const coldTelemetry = telemetry('cold', coldResponse);
  const informedTelemetry = telemetry('informed', informedResponse);
  const coldTools = [{ toolId: 'read-file', version: '1' }];
  const informedTools = [{ toolId: 'run-check', version: '1' }];
  const cold = {
    schemaVersion: 1 as const,
    messageKind: 'cold-completion' as const,
    invocationId,
    protocol,
    subject,
    cold: coldJudgment,
    actualTools: coldTools,
    rawResponse: { mediaType: 'text/plain' as const, payload: coldResponse, retention },
    telemetry: coldTelemetry,
  };
  const informed = {
    schemaVersion: 1 as const,
    messageKind: 'informed-completion' as const,
    invocationId,
    protocol,
    subject,
    coldArtifact: hashCanonical(coldJudgment),
    informed: informedJudgment,
    actualTools: informedTools,
    rawResponse: { mediaType: 'text/plain' as const, payload: informedResponse, retention },
    telemetry: informedTelemetry,
  };
  const verification = {
    binding: {
      ...expected,
      exactSubmissionDigest: hashBytes(bytes),
      journalId: 'journal.activation',
    },
    evidence: {
      schemaVersion: 1,
      receipt: {
        schemaVersion: 1,
        receiptKind: 'review',
        receiptId: `review-receipt.${invocationId}`,
        invocationId,
        executor,
        suppliedContextIds: [protocol.protocolBlob, contentIdentity],
        observedReadIds: [contentIdentity, contentIdentity],
        rawResponseArtifact: hashBytes(informedResponse),
        rawUsage: [...coldTelemetry.receipt.rawUsage, ...informedTelemetry.receipt.rawUsage],
        priceIdentity,
        trust: { scope: 'external-verifier', journalId: 'journal.activation' },
      },
      protocolEvidence: {
        schemaVersion: 1,
        protocol,
        subject,
        cold: coldJudgment,
        expansion: {
          sequence: 2,
          coldJudgmentArtifact: hashCanonical(coldJudgment),
          suppliedContextIds: [],
        },
        informed: informedJudgment,
      },
      phaseReceipts: { cold: coldTelemetry, informed: informedTelemetry },
      phaseTools: { cold: coldTools, informed: informedTools },
      actualTools: [...coldTools, ...informedTools],
      rawResponse: { artifact: hashBytes(informedResponse), retention },
    },
    cold,
    informed,
    findings: [],
    status: 'passed',
  };
  return {
    ...verification,
    binding: {
      ...verification.binding,
      sourceEvidenceDigest: hashCanonical({
        evidence: verification.evidence,
        cold: verification.cold,
        informed: verification.informed,
        findings: verification.findings,
        status: verification.status,
      }),
    },
  } as VerifiedCompleteReview;
}

function bindSource(verification: VerifiedCompleteReview): VerifiedCompleteReview {
  return {
    ...verification,
    binding: {
      ...verification.binding,
      sourceEvidenceDigest: hashCanonical({
        evidence: verification.evidence,
        cold: verification.cold,
        informed: verification.informed,
        findings: verification.findings,
        status: verification.status,
      }),
    },
  };
}

function fakeColdTerminal(
  expected: ReviewExpectation,
  bytes: string,
  status: 'failed' | 'skipped',
): VerifiedColdTerminal {
  const complete = fakeReview(expected, bytes);
  const terminal = {
    binding: complete.binding,
    cold: complete.cold,
    terminal: { status, reason: 'review ended before informed phase' },
  };
  return {
    ...terminal,
    binding: {
      ...terminal.binding,
      sourceEvidenceDigest: hashCanonical({ cold: terminal.cold, terminal: terminal.terminal }),
    },
  };
}

function bindColdTerminal(verification: VerifiedColdTerminal): VerifiedColdTerminal {
  return {
    ...verification,
    binding: {
      ...verification.binding,
      sourceEvidenceDigest: hashCanonical({
        cold: verification.cold,
        terminal: verification.terminal,
      }),
    },
  };
}

async function evidenceHarness(options?: {
  readonly clock?: () => number;
  readonly authenticate?: (bytes: string, receipt: unknown) => Promise<unknown>;
  readonly skipCold?: boolean;
  readonly secondPair?: boolean;
  readonly withoutReviewVerifier?: boolean;
  readonly verifyReview?: (expected: ReviewExpectation, bytes: string) => Promise<VerifiedReview>;
}) {
  const source = fixture();
  const authenticated = new Map<string, unknown>();
  let initializing = true;
  const controller = openActivationController({
    ...source,
    selectObligations: options?.secondPair
      ? (request) => ({
          ...source.selectObligations(request),
          obligations: [
            ...source.selectObligations(request).obligations,
            {
              identity: '1'.repeat(64),
              kind: 'audit' as const,
              reviewId: 'review.second',
              executorId: 'review.executor',
              protocolIdentity: 'e'.repeat(64),
              phase: 'cold' as const,
            },
            {
              identity: '2'.repeat(64),
              kind: 'audit' as const,
              reviewId: 'review.second',
              executorId: 'review.executor',
              protocolIdentity: 'e'.repeat(64),
              phase: 'informed' as const,
            },
          ],
        })
      : source.selectObligations,
    clock: options?.clock ?? (() => 1000),
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: source.candidate }),
    authenticateCheck: (bytes: string) => {
      const receipt = authenticated.get(bytes);
      if (receipt === undefined) throw new Error('fake verifier has no authenticated receipt');
      return initializing || options?.authenticate === undefined
        ? Promise.resolve(receipt)
        : options.authenticate(bytes, receipt);
    },
    verifyReview: options?.withoutReviewVerifier
      ? undefined
      : async ({ exactSubmissionBytes, expected }) => {
          if (options?.verifyReview !== undefined) {
            return options.verifyReview(expected, exactSubmissionBytes);
          }
          const receipt = authenticated.get(exactSubmissionBytes);
          if (receipt === undefined) throw new Error('fake review verifier has no receipt');
          const authenticatedReceipt =
            initializing || options?.authenticate === undefined
              ? receipt
              : await options.authenticate(exactSubmissionBytes, receipt);
          const verified = fakeReview(expected, exactSubmissionBytes);
          if (typeof authenticatedReceipt !== 'object' || authenticatedReceipt === null) {
            throw new Error('fake review verifier receipt malformed');
          }
          const claims = authenticatedReceipt as Record<string, unknown>;
          const modified = {
            ...verified,
            binding: {
              ...verified.binding,
              requestIdentity:
                typeof claims['requestIdentity'] === 'string'
                  ? claims['requestIdentity']
                  : expected.requestIdentity,
              obligationIdentity:
                typeof claims['obligationIdentity'] === 'string'
                  ? claims['obligationIdentity']
                  : expected.obligationIdentity,
              reviewId:
                typeof claims['reviewId'] === 'string' ? claims['reviewId'] : expected.reviewId,
              invocationId:
                typeof claims['invocationId'] === 'string'
                  ? claims['invocationId']
                  : expected.invocationId,
              executorId:
                typeof claims['executorId'] === 'string'
                  ? claims['executorId']
                  : expected.executorId,
              protocolIdentity:
                typeof claims['protocolIdentity'] === 'string'
                  ? claims['protocolIdentity']
                  : expected.protocolIdentity,
              phase:
                claims['phase'] === 'cold' || claims['phase'] === 'informed'
                  ? claims['phase']
                  : expected.phase,
              journalIssuerId:
                typeof claims['issuerId'] === 'string'
                  ? claims['issuerId']
                  : expected.journalIssuerId,
            },
            status:
              claims['status'] === 'passed' ||
              claims['status'] === 'failed' ||
              claims['status'] === 'skipped'
                ? claims['status']
                : verified.status,
          };
          return {
            ...modified,
            binding: {
              ...modified.binding,
              sourceEvidenceDigest: hashCanonical({
                evidence: modified.evidence,
                cold: modified.cold,
                informed: modified.informed,
                findings: modified.findings,
                status: modified.status,
              }),
            },
          };
        },
  });
  const request = controller.observe(source.candidate);
  const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
  controller.beginEvaluation(lease);
  function receipt(
    kind: 'check' | 'cold' | 'audit',
    status: 'passed' | 'failed' | 'skipped' = 'passed',
    reviewId = 'review.primary',
  ) {
    const bytes = serializeCanonical({ request: request.requestIdentity, kind, status, reviewId });
    const audit = kind !== 'check';
    const phase = kind === 'cold' ? 'cold' : 'informed';
    const second = reviewId === 'review.second';
    const common = {
      receiptIdentity: hashBytes(bytes),
      issuerId: source.pin.journalIssuerId,
      requestIdentity: request.requestIdentity,
      obligationIdentity:
        kind === 'check'
          ? 'a'.repeat(64)
          : kind === 'cold'
            ? (second ? '1' : 'd').repeat(64)
            : (second ? '2' : 'f').repeat(64),
      kind: audit ? 'audit' : 'check',
      attempt: 0,
      executorId: audit ? 'review.executor' : 'worker.check',
      protocolIdentity: audit ? 'e'.repeat(64) : 'b'.repeat(64),
      status,
    };
    authenticated.set(
      bytes,
      !audit
        ? { ...common, commandIdentity: 'c'.repeat(64) }
        : {
            ...common,
            phase,
            reviewId,
            invocationId: second ? 'invocation.second' : 'invocation.primary',
          },
    );
    return bytes;
  }
  const cold = receipt('cold');
  if (!options?.skipCold) {
    controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary');
    if (options?.secondPair) {
      controller.registerReviewAttempt(lease, 'review.second', 0, 'invocation.second');
    }
    await controller.recordReceipt(lease, 'd'.repeat(64), cold);
  }
  initializing = false;
  return { source, controller, request, lease, authenticated, receipt, cold };
}

function evidenceRows(databasePath: string) {
  const database = new Database(databasePath);
  try {
    return {
      requests: database.query('SELECT * FROM activation_request ORDER BY request_identity').all(),
      obligations: database
        .query('SELECT * FROM activation_obligation ORDER BY request_identity, obligation_identity')
        .all(),
      attempts: database
        .query(
          'SELECT * FROM activation_attempt ORDER BY request_identity, obligation_identity, attempt',
        )
        .all(),
      reviewAttempts: database
        .query(
          'SELECT * FROM activation_review_attempt ORDER BY request_identity, review_id, attempt',
        )
        .all(),
    };
  } finally {
    database.close();
  }
}

async function rejectedWith(operation: Promise<unknown>, message: string): Promise<void> {
  const [settled] = await Promise.allSettled([operation]);
  expect(settled.status).toBe('rejected');
  if (settled.status === 'rejected') expect(String(settled.reason)).toContain(message);
}

function submitReceipt(
  controller: ActivationController,
  lease: RequestLease,
  bytes: string,
): Promise<StoredRequest> {
  let kind: string | undefined;
  let phase: string | undefined;
  let reviewId: string | undefined;
  try {
    const payload: unknown = JSON.parse(bytes);
    if (typeof payload === 'object' && payload !== null) {
      if ('kind' in payload && typeof payload.kind === 'string') kind = payload.kind;
      if ('phase' in payload && typeof payload.phase === 'string') phase = payload.phase;
      if ('reviewId' in payload && typeof payload.reviewId === 'string')
        reviewId = payload.reviewId;
    }
  } catch {
    // Only a test locator: the production decoder still owns malformed-byte refusal.
  }
  const second = reviewId === 'review.second';
  const obligationIdentity =
    kind === 'cold' || (kind === 'audit' && phase === 'cold')
      ? (second ? '1' : 'd').repeat(64)
      : kind === 'audit'
        ? (second ? '2' : 'f').repeat(64)
        : 'a'.repeat(64);
  return controller.recordReceipt(lease, obligationIdentity, bytes);
}

test.each(['failed', 'skipped'] as const)(
  'authenticated cold-only %s remains terminal without informed evidence',
  async (status) => {
    const source = await evidenceHarness({
      skipCold: true,
      verifyReview: (expected, bytes) => Promise.resolve(fakeColdTerminal(expected, bytes, status)),
    });
    source.controller.registerReviewAttempt(
      source.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const cold = source.receipt('cold', status);
    const after = await source.controller.recordReceipt(source.lease, 'd'.repeat(64), cold);
    const rows = evidenceRows(source.source.databasePath);
    expect(after.stage).toBe('failed');
    expect(rows.attempts).toHaveLength(1);
    expect(
      rows.obligations.find(
        (row) => (row as { obligation_identity: string }).obligation_identity === 'f'.repeat(64),
      ),
    ).toMatchObject({ state: 'pending' });
    expect((rows.attempts[0] as { authentication_bytes: string }).authentication_bytes).toContain(
      'review ended before informed phase',
    );
    source.controller.close();
  },
);

test('cold terminal evidence replays across restart and conflicting bytes cannot replace it', async () => {
  const evidence = await evidenceHarness({
    skipCold: true,
    verifyReview: (expected, bytes) => Promise.resolve(fakeColdTerminal(expected, bytes, 'failed')),
  });
  evidence.controller.registerReviewAttempt(
    evidence.lease,
    'review.primary',
    0,
    'invocation.primary',
  );
  const firstBytes = evidence.receipt('cold', 'failed');
  const first = await evidence.controller.recordReceipt(evidence.lease, 'd'.repeat(64), firstBytes);
  const committed = evidenceRows(evidence.source.databasePath);
  evidence.controller.close();

  const reopened = openActivationController({
    ...evidence.source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: evidence.source.candidate }),
    verifyReview: ({ expected, exactSubmissionBytes }) =>
      Promise.resolve(fakeColdTerminal(expected, exactSubmissionBytes, 'failed')),
  });
  try {
    expect(await reopened.recordReceipt(evidence.lease, 'd'.repeat(64), firstBytes)).toEqual(first);
    expect(evidenceRows(evidence.source.databasePath)).toEqual(committed);
    const conflictingBytes = serializeCanonical({ firstBytes, conflict: true });
    await rejectedWith(
      reopened.recordReceipt(evidence.lease, 'd'.repeat(64), conflictingBytes),
      'attempt conflicts with immutable evidence',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(committed);
  } finally {
    reopened.close();
  }
});

test.each([
  [
    'passed relabel',
    (review: VerifiedColdTerminal) =>
      bindColdTerminal({
        ...review,
        terminal: { ...review.terminal, status: 'passed' as 'failed' },
      }),
    'Validation failed',
  ],
  [
    'foreign issuer',
    (review: VerifiedColdTerminal) => ({
      ...review,
      binding: { ...review.binding, journalIssuerId: 'journal.foreign' },
    }),
    'differs from frozen invocation',
  ],
  [
    'missing cold raw response',
    (review: VerifiedColdTerminal) => {
      if (review.cold.telemetry.status !== 'verified')
        throw new Error('fixture cold telemetry not verified');
      return bindColdTerminal({
        ...review,
        cold: {
          ...review.cold,
          rawResponse: { ...review.cold.rawResponse, payload: '' },
          telemetry: {
            ...review.cold.telemetry,
            receipt: { ...review.cold.telemetry.receipt, outputArtifact: hashBytes('') },
          },
        },
      });
    },
    'cold terminal review evidence incomplete',
  ],
  [
    'unbound source digest',
    (review: VerifiedColdTerminal) => ({
      ...review,
      binding: { ...review.binding, sourceEvidenceDigest: '0'.repeat(64) },
    }),
    'source digest differs',
  ],
  [
    'foreign cold invocation',
    (review: VerifiedColdTerminal) =>
      bindColdTerminal({
        ...review,
        cold: { ...review.cold, invocationId: 'invocation.foreign' },
      }),
    'cold terminal review evidence incomplete',
  ],
  [
    'foreign cold protocol',
    (review: VerifiedColdTerminal) =>
      bindColdTerminal({
        ...review,
        cold: {
          ...review.cold,
          protocol: { ...review.cold.protocol, protocolBlob: '0'.repeat(64) },
        },
      }),
    'cold terminal review evidence incomplete',
  ],
  [
    'unverified cold telemetry',
    (review: VerifiedColdTerminal) =>
      bindColdTerminal({
        ...review,
        cold: {
          ...review.cold,
          telemetry: {
            status: 'unverified' as const,
            reason: 'provider receipt unavailable',
            missingRequirements: ['invocation receipt'],
            observed: {},
          },
        },
      }),
    'cold terminal review evidence incomplete',
  ],
  [
    'foreign telemetry invocation',
    (review: VerifiedColdTerminal) => {
      if (review.cold.telemetry.status !== 'verified')
        throw new Error('fixture cold telemetry not verified');
      return bindColdTerminal({
        ...review,
        cold: {
          ...review.cold,
          telemetry: {
            ...review.cold.telemetry,
            receipt: { ...review.cold.telemetry.receipt, invocationId: 'invocation.foreign' },
          },
        },
      });
    },
    'cold terminal review evidence incomplete',
  ],
  [
    'missing cold observed reads',
    (review: VerifiedColdTerminal) =>
      bindColdTerminal({
        ...review,
        cold: { ...review.cold, cold: { ...review.cold.cold, observedReadIds: [] } },
      }),
    'cold terminal review evidence incomplete',
  ],
] as const)(
  'cold-only terminal refuses %s without inserting evidence',
  async (_, corrupt, message) => {
    const evidence = await evidenceHarness({
      skipCold: true,
      verifyReview: (expected, bytes) =>
        Promise.resolve(corrupt(fakeColdTerminal(expected, bytes, 'failed'))),
    });
    try {
      evidence.controller.registerReviewAttempt(
        evidence.lease,
        'review.primary',
        0,
        'invocation.primary',
      );
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        evidence.controller.recordReceipt(
          evidence.lease,
          'd'.repeat(64),
          evidence.receipt('cold', 'failed'),
        ),
        message,
      );
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      evidence.controller.close();
    }
  },
);

test('cold terminal evidence cannot complete an informed obligation', async () => {
  const evidence = await evidenceHarness({
    verifyReview: (expected, bytes) =>
      Promise.resolve(
        expected.phase === 'cold'
          ? fakeReview(expected, bytes)
          : fakeColdTerminal(expected, bytes, 'failed'),
      ),
  });
  try {
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(
        evidence.lease,
        'f'.repeat(64),
        evidence.receipt('audit', 'failed'),
      ),
      'cold terminal review phase differs',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('cold terminal completion rechecks registration after held authentication', async () => {
  let release: ((verification: VerifiedReview) => void) | undefined;
  let authenticated: (() => void) | undefined;
  let observed: ReviewExpectation | undefined;
  const started = new Promise<void>((resolve) => {
    authenticated = resolve;
  });
  const held = new Promise<VerifiedReview>((resolve) => {
    release = resolve;
  });
  const evidence = await evidenceHarness({
    skipCold: true,
    verifyReview: (expected) => {
      observed = expected;
      authenticated?.();
      return held;
    },
  });
  const database = new Database(evidence.source.databasePath);
  try {
    evidence.controller.registerReviewAttempt(
      evidence.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const bytes = evidence.receipt('cold', 'failed');
    const completion = evidence.controller.recordReceipt(evidence.lease, 'd'.repeat(64), bytes);
    await started;
    database
      .query(
        'UPDATE activation_review_attempt SET invocation_id = ? WHERE request_identity = ? AND review_id = ?',
      )
      .run('invocation.replaced', evidence.request.requestIdentity, 'review.primary');
    const before = evidenceRows(evidence.source.databasePath);
    if (observed === undefined || release === undefined)
      throw new Error('held verifier never started');
    release(fakeColdTerminal(observed, bytes, 'failed'));
    await rejectedWith(completion, 'invocation differs from registration');
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('cold terminal completion refuses authority lost while verification is held', async () => {
  let release: ((verification: VerifiedReview) => void) | undefined;
  let authenticated: (() => void) | undefined;
  let observed: ReviewExpectation | undefined;
  const started = new Promise<void>((resolve) => {
    authenticated = resolve;
  });
  const held = new Promise<VerifiedReview>((resolve) => {
    release = resolve;
  });
  const evidence = await evidenceHarness({
    skipCold: true,
    verifyReview: (expected) => {
      observed = expected;
      authenticated?.();
      return held;
    },
  });
  try {
    evidence.controller.registerReviewAttempt(
      evidence.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const bytes = evidence.receipt('cold', 'failed');
    const completion = evidence.controller.recordReceipt(evidence.lease, 'd'.repeat(64), bytes);
    await started;
    const before = evidenceRows(evidence.source.databasePath);
    rmSync(evidence.source.bootstrapPath);
    if (observed === undefined || release === undefined)
      throw new Error('held verifier never started');
    release(fakeColdTerminal(observed, bytes, 'failed'));
    await rejectedWith(completion, 'bootstrap');
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('cold terminal audit has no generic-authenticator fallback when trusted verifier is absent', async () => {
  let genericCalls = 0;
  const evidence = await evidenceHarness({
    skipCold: true,
    withoutReviewVerifier: true,
    authenticate: (_bytes, receipt) => {
      genericCalls += 1;
      return Promise.resolve(receipt);
    },
  });
  try {
    evidence.controller.registerReviewAttempt(
      evidence.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(
        evidence.lease,
        'd'.repeat(64),
        evidence.receipt('cold', 'failed'),
      ),
      'trusted review verifier absent',
    );
    expect(genericCalls).toBe(0);
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('cold terminal stage-write failure rolls back its attempt and selected obligation', async () => {
  const evidence = await evidenceHarness({
    skipCold: true,
    verifyReview: (expected, bytes) => Promise.resolve(fakeColdTerminal(expected, bytes, 'failed')),
  });
  const database = new Database(evidence.source.databasePath);
  try {
    evidence.controller.registerReviewAttempt(
      evidence.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const before = evidenceRows(evidence.source.databasePath);
    database.run(`CREATE TRIGGER fail_cold_terminal BEFORE UPDATE OF stage ON activation_request
      WHEN NEW.stage = 'failed' BEGIN SELECT RAISE(ABORT, 'injected terminal write'); END`);
    const bytes = evidence.receipt('cold', 'failed');
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, 'd'.repeat(64), bytes),
      'injected terminal write',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    database.run('DROP TRIGGER fail_cold_terminal');
    expect(
      (await evidence.controller.recordReceipt(evidence.lease, 'd'.repeat(64), bytes)).stage,
    ).toBe('failed');
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('duplicate and lost events converge on one durable request per subject', async () => {
  const subject = fixture();
  let ready: readonly ObservedCandidate[] = [];
  const controller = openActivationController({
    ...subject,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve(ready),
    currentCandidate: (_repositoryId, candidateSubject) =>
      Promise.resolve({
        kind: 'ready',
        candidate:
          candidateSubject.kind === 'pull-request' && candidateSubject.number === 283
            ? { ...subject.candidate, subject: candidateSubject }
            : subject.candidate,
      }),
  });
  try {
    const observed = controller.observe(subject.candidate);
    expect(controller.observe(subject.candidate).requestIdentity).toBe(observed.requestIdentity);
    ready = [
      subject.candidate,
      { ...subject.candidate, subject: { kind: 'pull-request', number: 283 } },
    ];
    const reconciled = await controller.reconcileReady();
    expect(reconciled[0]?.requestIdentity).toBe(observed.requestIdentity);
    expect(reconciled[1]?.requestIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(controller.listRequests()).toHaveLength(2);
    expect(controller.readRequest(observed.requestIdentity)?.stage).toBe('observed');
  } finally {
    controller.close();
  }
});

test('expired worker is fenced and a changed head supersedes only its logical subject', () => {
  const subject = fixture();
  let now = 1000;
  const options = {
    ...subject,
    clock: () => now,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: subject.candidate }),
  };
  const first = openActivationController(options);
  const second = openActivationController(options);
  try {
    const request = first.observe(subject.candidate);
    const stale = first.claim(request.requestIdentity, 'worker.first', 10);
    now = 1011;
    const successor = second.claim(request.requestIdentity, 'worker.second', 10);
    expect(successor.leaseEpoch).toBe(stale.leaseEpoch + 1);
    expect(() => first.beginEvaluation(stale)).toThrow('activation request lease changed');
    expect(second.beginEvaluation(successor).stage).toBe('evaluating');
    const changed = first.observe({ ...subject.candidate, headSha: '6'.repeat(40) });
    expect(first.readRequest(request.requestIdentity)?.stage).toBe('superseded');
    expect(first.readRequest(changed.requestIdentity)?.stage).toBe('observed');
    expect(() => second.beginEvaluation(successor)).toThrow('activation request superseded');
  } finally {
    first.close();
    second.close();
  }
});

test('stage, version, lease epoch, owner and expiry independently fence worker advancement', () => {
  const subject = fixture();
  let now = 1000;
  const controller = openActivationController({
    ...subject,
    clock: () => now,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: subject.candidate }),
  });
  try {
    const request = controller.observe(subject.candidate);
    const stale = controller.claim(request.requestIdentity, 'worker.first', 10);
    expect(() => controller.beginEvaluation({ ...stale, requestIdentity: 'f'.repeat(64) })).toThrow(
      'activation request absent',
    );
    expect(() => controller.beginEvaluation({ ...stale, version: stale.version + 1 })).toThrow(
      'activation request lease changed',
    );
    expect(() => controller.beginEvaluation({ ...stale, workerId: 'worker.other' })).toThrow(
      'activation request lease changed',
    );
    now = 1010;
    expect(() => controller.beginEvaluation(stale)).toThrow('activation request lease changed');
    const successor = controller.claim(request.requestIdentity, 'worker.second', 10);
    expect(() => controller.beginEvaluation({ ...stale, version: successor.version })).toThrow(
      'activation request lease changed',
    );
    expect(() =>
      controller.beginEvaluation({
        ...stale,
        leaseEpoch: successor.leaseEpoch,
        workerId: successor.workerId,
      }),
    ).toThrow('activation request lease changed');
    expect(controller.beginEvaluation(successor).stage).toBe('evaluating');
  } finally {
    controller.close();
  }
});

test('claim refuses a superseded request without altering its persisted row', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const first = controller.observe(source.candidate);
    controller.observe({ ...source.candidate, headSha: '6'.repeat(40) });
    const before = controller.listRequests();
    expect(() => controller.claim(first.requestIdentity, 'worker.old', 10)).toThrow(
      'activation request superseded',
    );
    expect(controller.listRequests()).toEqual(before);
  } finally {
    controller.close();
  }
});

test('claim refuses an evaluating request after its prior lease expires', () => {
  const source = fixture();
  let now = 1000;
  const controller = openActivationController({
    ...source,
    clock: () => now,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 10);
    controller.beginEvaluation(lease);
    now = 1010;
    const before = controller.listRequests();
    expect(() => controller.claim(request.requestIdentity, 'worker.second', 10)).toThrow(
      'activation request stage changed',
    );
    expect(controller.listRequests()).toEqual(before);
  } finally {
    controller.close();
  }
});

test('expired evaluating lease is recovered by a new epoch without resetting frozen obligations', () => {
  const source = fixture();
  let now = 1000;
  const first = boundaryController(source, () => now);
  const second = boundaryController(source, () => now);
  try {
    const request = first.observe(source.candidate);
    const old = first.claim(request.requestIdentity, 'worker.first', 10);
    first.beginEvaluation(old);
    const frozen = evidenceRows(source.databasePath);
    now = 1010;
    const recovered = second.recoverEvaluationLease(request.requestIdentity, 'worker.second', 20);
    expect(recovered.leaseEpoch).toBe(old.leaseEpoch + 1);
    expect(second.readRequest(request.requestIdentity)?.stage).toBe('evaluating');
    expect(evidenceRows(source.databasePath).obligations).toEqual(frozen.obligations);
    expect(() => first.registerReviewAttempt(old, 'review.primary', 0, 'invocation.old')).toThrow(
      'activation request lease changed',
    );
  } finally {
    first.close();
    second.close();
  }
});

test('same evaluating worker renews with a new fence while another worker cannot take its live lease', () => {
  const source = fixture();
  let now = 1000;
  const first = boundaryController(source, () => now);
  const second = boundaryController(source, () => now);
  try {
    const request = first.observe(source.candidate);
    const old = first.claim(request.requestIdentity, 'worker.first', 10);
    first.beginEvaluation(old);
    now = 1005;
    const renewed = first.recoverEvaluationLease(request.requestIdentity, 'worker.first', 20);
    expect(renewed.leaseEpoch).toBe(old.leaseEpoch + 1);
    const before = evidenceRows(source.databasePath);
    expect(() =>
      second.recoverEvaluationLease(request.requestIdentity, 'worker.second', 20),
    ).toThrow('activation request lease held');
    expect(evidenceRows(source.databasePath)).toEqual(before);
    expect(() => first.registerReviewAttempt(old, 'review.primary', 0, 'invocation.old')).toThrow(
      'activation request lease changed',
    );
    first.registerReviewAttempt(renewed, 'review.primary', 0, 'invocation.current');
  } finally {
    first.close();
    second.close();
  }
});

test('evaluating lease recovery refuses old generation, wrong stage, missing expiry and changed authority', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow('activation request is not evaluating');
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database
      .query('UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?')
      .run(request.requestIdentity);
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow('activation request lease expiry absent');
    database
      .query('UPDATE activation_request SET lease_expires_at = 1000 WHERE request_identity = ?')
      .run(request.requestIdentity);
    database
      .query('UPDATE activation_subject SET high_water_generation = high_water_generation + 1')
      .run();
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow('activation request generation changed');
    database
      .query('UPDATE activation_subject SET high_water_generation = high_water_generation - 1')
      .run();
    const changedBootstrap = readFileSync(source.bootstrapPath, 'utf8').replace(
      'review.provider',
      'review.other',
    );
    writeFileSync(source.bootstrapPath, changedBootstrap);
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow();
    const changedAuthority = boundaryController(
      {
        ...source,
        pin: {
          ...source.pin,
          identity: hashBytes(changedBootstrap),
        },
      },
      () => 1000,
    );
    try {
      expect(() =>
        changedAuthority.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
      ).toThrow('activation request authority changed');
    } finally {
      changedAuthority.close();
    }
    expect(
      database
        .query('SELECT lease_epoch FROM activation_request WHERE request_identity = ?')
        .get(request.requestIdentity),
    ).toEqual({ lease_epoch: lease.leaseEpoch });
  } finally {
    database.close();
    controller.close();
  }
});

test('evaluating lease recovery refuses a superseded row even if its stage is stale evaluating', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    controller.observe({ ...source.candidate, headSha: '6'.repeat(40) });
    database
      .query("UPDATE activation_request SET stage = 'evaluating' WHERE request_identity = ?")
      .run(request.requestIdentity);
    const before = database.query('SELECT * FROM activation_request ORDER BY rowid').all();
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow('activation request superseded');
    expect(database.query('SELECT * FROM activation_request ORDER BY rowid').all()).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('evaluating lease recovery refuses unpaired history without changing its lease', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database
      .query('UPDATE activation_request SET pairing_version = 0 WHERE request_identity = ?')
      .run(request.requestIdentity);
    const before = database.query('SELECT * FROM activation_request').all();
    expect(() =>
      controller.recoverEvaluationLease(request.requestIdentity, 'worker.new', 20),
    ).toThrow('legacy review pairing absent');
    expect(database.query('SELECT * FROM activation_request').all()).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('installed evaluating owner atomically registers a review invocation and immutable dispatch reservation', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const reservation = controller.reserveReviewDispatch(lease, {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    });
    expect(reservation.requestIdentity).toBe(request.requestIdentity);
    expect(reservation.target).toEqual({
      kind: 'reviewer',
      providerId: 'review.provider',
      executorId: 'review.executor',
    });
    expect(reservation.payloadDigest).toBe(hashBytes(reservation.payloadBytes));
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(1);
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(1);
  } finally {
    database.close();
    controller.close();
  }
});

test('dispatch refuses a frozen review protocol that differs from pinned reviewer authority', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const before = {
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    };
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        reviewId: 'review.primary',
        attempt: 0,
        invocationId: 'invocation.primary',
        deadlineAt: 1200,
        maxDispatchAttempts: 3,
      }),
    ).toThrow('review dispatch protocol differs from pinned reviewer');
    expect({
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    }).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('dispatch refuses a frozen review executor that differs from pinned reviewer authority', () => {
  const source = dispatchFixture();
  const validPlan = source.selectObligations;
  const altered = {
    ...source,
    selectObligations: (request: ActivationRequest) => {
      const plan = validPlan(request);
      return {
        ...plan,
        obligations: plan.obligations.map((obligation) =>
          obligation.kind === 'audit' && obligation.phase === 'cold'
            ? { ...obligation, executorId: 'foreign.executor' }
            : obligation,
        ),
      };
    },
  };
  const controller = boundaryController(altered, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const before = {
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    };
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        reviewId: 'review.primary',
        attempt: 0,
        invocationId: 'invocation.primary',
        deadlineAt: 1200,
        maxDispatchAttempts: 3,
      }),
    ).toThrow('review dispatch frozen pair differs from authority');
    expect({
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    }).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('dispatch refuses a changed persisted obligation outside the frozen plan', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database
      .query("UPDATE activation_obligation SET obligation_identity = ? WHERE phase = 'cold'")
      .run('7'.repeat(64));
    const before = {
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    };
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        reviewId: 'review.primary',
        attempt: 0,
        invocationId: 'invocation.primary',
        deadlineAt: 1200,
        maxDispatchAttempts: 3,
      }),
    ).toThrow('review dispatch differs from frozen evaluation plan');
    expect({
      request: database.query('SELECT * FROM activation_request').all(),
      obligations: database.query('SELECT * FROM activation_obligation ORDER BY rowid').all(),
      registration: database.query('SELECT * FROM activation_review_attempt').all(),
      dispatch: database.query('SELECT * FROM activation_review_dispatch').all(),
    }).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('review dispatch reservation replays exactly and rejects changed immutable bytes or caller target', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const input = {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    };
    const first = controller.reserveReviewDispatch(lease, input);
    expect(controller.reserveReviewDispatch(lease, input)).toEqual(first);
    expect(() => controller.reserveReviewDispatch(lease, { ...input, deadlineAt: 1300 })).toThrow(
      'review dispatch reservation conflicts',
    );
    expect(() =>
      controller.reserveReviewDispatch(lease, { ...input, maxDispatchAttempts: 4 }),
    ).toThrow('review dispatch reservation conflicts');
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        ...input,
        target: {
          kind: 'reviewer',
          providerId: 'caller',
          executorId: 'caller',
        },
      } as typeof input),
    ).toThrow();
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(1);
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(1);
  } finally {
    database.close();
    controller.close();
  }
});

test('review dispatch refuses altered persisted target and payload bytes on exact replay', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const input = {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    };
    controller.reserveReviewDispatch(lease, input);
    const original = database
      .query('SELECT target_bytes, payload_bytes FROM activation_review_dispatch')
      .get() as {
      target_bytes: string;
      payload_bytes: string;
    };
    database.query('UPDATE activation_review_dispatch SET target_bytes = ?').run(
      serializeCanonical({
        kind: 'reviewer',
        providerId: 'foreign',
        executorId: 'review.executor',
      }),
    );
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow('reservation conflicts');
    database
      .query('UPDATE activation_review_dispatch SET target_bytes = ?, payload_bytes = ?')
      .run(original.target_bytes, serializeCanonical({ forged: true }));
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow('reservation conflicts');
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(1);
  } finally {
    database.close();
    controller.close();
  }
});

test('review dispatch refuses elapsed deadline, changed persisted plan and authority row', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const input = {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    };
    expect(() => controller.reserveReviewDispatch(lease, { ...input, deadlineAt: 1000 })).toThrow(
      'review dispatch deadline elapsed',
    );
    database
      .query("UPDATE activation_obligation SET executor_id = 'foreign' WHERE phase = 'cold'")
      .run();
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow(
      'review dispatch differs from frozen evaluation plan',
    );
    database
      .query(
        "UPDATE activation_obligation SET executor_id = 'review.executor' WHERE phase = 'cold'",
      )
      .run();
    database
      .query('UPDATE activation_request SET bootstrap_identity = ? WHERE request_identity = ?')
      .run('9'.repeat(64), request.requestIdentity);
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow(
      'review dispatch authority changed',
    );
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(0);
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(0);
  } finally {
    database.close();
    controller.close();
  }
});

test('review dispatch refuses a stale durable subject generation before registration', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database
      .query('UPDATE activation_subject SET high_water_generation = high_water_generation + 1')
      .run();
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        reviewId: 'review.primary',
        attempt: 0,
        invocationId: 'invocation.primary',
        deadlineAt: 1200,
        maxDispatchAttempts: 3,
      }),
    ).toThrow('review dispatch generation changed');
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(0);
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(0);
  } finally {
    database.close();
    controller.close();
  }
});

test('review dispatch refuses missing frozen plan and absent subject generation without partial registration', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const input = {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    };
    const plan = database
      .query('SELECT evaluation_plan_identity FROM activation_request')
      .get() as {
      evaluation_plan_identity: string;
    };
    database.query('UPDATE activation_request SET evaluation_plan_identity = NULL').run();
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow(
      'review dispatch evaluation plan absent',
    );
    database
      .query('UPDATE activation_request SET evaluation_plan_identity = ?')
      .run(plan.evaluation_plan_identity);
    database.query('DELETE FROM activation_subject').run();
    expect(() => controller.reserveReviewDispatch(lease, input)).toThrow(
      'review dispatch generation changed',
    );
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(0);
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(0);
  } finally {
    database.close();
    controller.close();
  }
});

test('dispatch insertion failure rolls back its invocation registration', () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database.run(`CREATE TRIGGER refuse_dispatch BEFORE INSERT ON activation_review_dispatch
      BEGIN SELECT RAISE(FAIL, 'injected dispatch insertion failure'); END`);
    expect(() =>
      controller.reserveReviewDispatch(lease, {
        reviewId: 'review.primary',
        attempt: 0,
        invocationId: 'invocation.primary',
        deadlineAt: 1200,
        maxDispatchAttempts: 3,
      }),
    ).toThrow('injected dispatch insertion failure');
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(0);
    expect(database.query('SELECT * FROM activation_review_dispatch').all()).toHaveLength(0);
  } finally {
    database.close();
    controller.close();
  }
});

test('dispatch target survives reopen and changed pinned bootstrap cannot rebind it', () => {
  const source = dispatchFixture();
  const first = boundaryController(source, () => 1000);
  const request = first.observe(source.candidate);
  const lease = first.claim(request.requestIdentity, 'worker.first', 100);
  first.beginEvaluation(lease);
  const input = {
    reviewId: 'review.primary',
    attempt: 0,
    invocationId: 'invocation.primary',
    deadlineAt: 1200,
    maxDispatchAttempts: 3,
  };
  const reservation = first.reserveReviewDispatch(lease, input);
  first.close();
  const second = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    expect(second.reserveReviewDispatch(lease, input)).toEqual(reservation);
    const originalBootstrap = readFileSync(source.bootstrapPath, 'utf8');
    writeFileSync(
      source.bootstrapPath,
      originalBootstrap.replace('review.provider', 'review.other'),
    );
    expect(() => second.reserveReviewDispatch(lease, input)).toThrow();
    const changedAuthority = boundaryController(
      {
        ...source,
        pin: {
          ...source.pin,
          identity: hashBytes(readFileSync(source.bootstrapPath, 'utf8')),
        },
      },
      () => 1000,
    );
    try {
      expect(() => changedAuthority.reserveReviewDispatch(lease, input)).toThrow(
        'activation request authority changed',
      );
    } finally {
      changedAuthority.close();
    }
    expect(database.query('SELECT target_bytes FROM activation_review_dispatch').get()).toEqual({
      target_bytes: serializeCanonical({
        kind: 'reviewer',
        providerId: 'review.provider',
        executorId: 'review.executor',
      }),
    });
    expect(database.query('SELECT * FROM activation_review_attempt').all()).toHaveLength(1);
  } finally {
    database.close();
    second.close();
  }
});

test('version-4 dispatch migration is additive and rolls back a late index conflict', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const request = controller.observe(source.candidate);
  controller.close();
  const database = new Database(source.databasePath);
  try {
    database.run('DROP TABLE activation_review_dispatch_fact');
    database.run('DROP TABLE activation_review_dispatch_progress');
    database.run('DROP TABLE activation_review_dispatch');
    database.run('PRAGMA user_version = 4');
    database.run(
      'CREATE INDEX activation_dispatch_request ON activation_request(request_identity)',
    );
    const before = database
      .query("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'index') ORDER BY name")
      .all();
    expect(() => boundaryController(source, () => 1000)).toThrow(
      'index activation_dispatch_request already exists',
    );
    expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 4 });
    expect(
      database
        .query("SELECT name, sql FROM sqlite_schema WHERE type IN ('table', 'index') ORDER BY name")
        .all(),
    ).toEqual(before);
    database.run('DROP INDEX activation_dispatch_request');
  } finally {
    database.close();
  }
  const upgraded = boundaryController(source, () => 1000);
  const migrated = new Database(source.databasePath);
  try {
    expect(migrated.query('PRAGMA user_version').get()).toEqual({ user_version: 6 });
    expect(upgraded.readRequest(request.requestIdentity)?.request.requestIdentity).toBe(
      request.requestIdentity,
    );
  } finally {
    migrated.close();
    upgraded.close();
  }
});

test('installed fake dispatch queries its reserved effect before one send and acknowledges exact bytes', async () => {
  const source = dispatchFixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const reservation = controller.reserveReviewDispatch(lease, {
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
      deadlineAt: 1200,
      maxDispatchAttempts: 3,
    });
    const calls: string[] = [];
    const observed = {
      effectKey: reservation.effectKey,
      requestIdentity: request.requestIdentity,
      target: reservation.target,
      payloadDigest: reservation.payloadDigest,
      invocationId: 'invocation.primary',
      remoteDispatchId: 'remote.primary',
      evidenceBytes: serializeCanonical({ accepted: reservation.effectKey }),
    };
    const progress = await controller.recoverReviewDispatch(lease, reservation.effectKey, {
      query: () => {
        calls.push('query');
        return Promise.resolve({ kind: 'absent' as const });
      },
      send: () => {
        calls.push('send');
        return Promise.resolve({ kind: 'accepted' as const, observed });
      },
    });
    expect(calls).toEqual(['query', 'send']);
    expect(progress.state).toBe('acknowledged');
    expect(database.query('SELECT * FROM activation_review_dispatch_fact').all()).toHaveLength(1);
    expect(
      database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'acknowledged', dispatch_attempts: 1 });
    expect(controller.readRequest(request.requestIdentity)?.stage).toBe('evaluating');
  } finally {
    database.close();
    controller.close();
  }
});

test('claim refuses another worker during an active lease', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const request = controller.observe(source.candidate);
    controller.claim(request.requestIdentity, 'worker.first', 10);
    const before = controller.listRequests();
    expect(() => controller.claim(request.requestIdentity, 'worker.second', 10)).toThrow(
      'activation request lease held',
    );
    expect(controller.listRequests()).toEqual(before);
  } finally {
    controller.close();
  }
});

test('evaluation refuses superseded current request before any obligation write', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const first = controller.observe(source.candidate);
    const lease = controller.claim(first.requestIdentity, 'worker.first', 10);
    controller.observe({ ...source.candidate, headSha: '6'.repeat(40) });
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation(lease)).toThrow('activation request superseded');
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(first.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation refuses its already evaluating stage with a current lease version', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 10);
    const evaluated = controller.beginEvaluation(lease);
    const before = controller.listRequests();
    const obligations = controller.listObligations(request.requestIdentity);
    expect(() => controller.beginEvaluation({ ...lease, version: evaluated.version })).toThrow(
      'activation request stage changed',
    );
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual(obligations);
  } finally {
    controller.close();
  }
});

function boundaryController(source: ReturnType<typeof fixture>, clock: () => number) {
  return openActivationController({
    ...source,
    clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
}

function reservedDispatchFixture(
  options: { readonly deadlineAt?: number; readonly maxDispatchAttempts?: number } = {},
) {
  let now = 1000;
  const source = dispatchFixture();
  const controller = boundaryController(source, () => now);
  const database = new Database(source.databasePath);
  const request = controller.observe(source.candidate);
  const lease = controller.claim(request.requestIdentity, 'worker.first', 10);
  controller.beginEvaluation(lease);
  const reservation = controller.reserveReviewDispatch(lease, {
    reviewId: 'review.primary',
    attempt: 0,
    invocationId: 'invocation.primary',
    deadlineAt: options.deadlineAt ?? 1200,
    maxDispatchAttempts: options.maxDispatchAttempts ?? 3,
  });
  const observed = {
    effectKey: reservation.effectKey,
    requestIdentity: request.requestIdentity,
    target: reservation.target,
    payloadDigest: reservation.payloadDigest,
    invocationId: 'invocation.primary',
    remoteDispatchId: 'remote.primary',
    evidenceBytes: serializeCanonical({ accepted: reservation.effectKey }),
  };
  return {
    source,
    controller,
    database,
    request,
    lease,
    reservation,
    observed,
    setNow(value: number) {
      now = value;
    },
    close() {
      database.close();
      controller.close();
    },
  };
}

function historicalRegistry(source: ReturnType<typeof dispatchFixture>) {
  const path = `${source.bootstrapPath}.history`;
  const bytes = serializeCanonical({
    schemaVersion: 1,
    authorities: [{ bootstrapPath: source.bootstrapPath, pin: source.pin }],
  });
  writeFileSync(path, bytes);
  return { path, digest: hashBytes(bytes) };
}

async function initiatedOrphanFixture(stage: 'failed' | 'superseded') {
  const fixture = reservedDispatchFixture();
  const sent = await fixture.controller.recoverReviewDispatch(
    fixture.lease,
    fixture.reservation.effectKey,
    {
      query: () => Promise.resolve({ kind: 'absent' as const }),
      send: () => Promise.resolve({ kind: 'uncertain' as const }),
    },
  );
  expect(sent.dispatchAttempts).toBe(1);
  const replacement =
    stage === 'superseded'
      ? fixture.controller.observe({ ...fixture.source.candidate, headSha: '9'.repeat(40) })
      : undefined;
  if (stage === 'failed') {
    fixture.database
      .query("UPDATE activation_request SET stage = 'failed' WHERE request_identity = ?")
      .run(fixture.request.requestIdentity);
  }
  fixture.controller.close();
  const registry = historicalRegistry(fixture.source);
  const reopened = openActivationController({
    ...fixture.source,
    historicalAuthorityRegistry: registry,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
  });
  return { ...fixture, replacement, registry, reopened };
}

function dispatchState(database: Database) {
  return {
    requests: database.query('SELECT * FROM activation_request ORDER BY request_identity').all(),
    obligations: database
      .query('SELECT * FROM activation_obligation ORDER BY obligation_identity')
      .all(),
    registrations: database
      .query('SELECT * FROM activation_review_attempt ORDER BY invocation_id')
      .all(),
    reservations: database
      .query('SELECT * FROM activation_review_dispatch ORDER BY effect_key')
      .all(),
    progress: database
      .query('SELECT * FROM activation_review_dispatch_progress ORDER BY effect_key')
      .all(),
    facts: database
      .query('SELECT * FROM activation_review_dispatch_fact ORDER BY effect_key')
      .all(),
  };
}

test('dispatch query distinguishes authenticated absence from unreadable and malformed observations', async () => {
  const unavailable = reservedDispatchFixture();
  try {
    let sends = 0;
    const progress = await unavailable.controller.recoverReviewDispatch(
      unavailable.lease,
      unavailable.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'unavailable' as const }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(progress.state).toBe('uncertain');
    expect(progress.dispatchAttempts).toBe(0);
    expect(sends).toBe(0);
    expect(
      unavailable.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toEqual([]);
  } finally {
    unavailable.close();
  }

  const malformed = reservedDispatchFixture();
  try {
    let sends = 0;
    await rejectedWith(
      malformed.controller.recoverReviewDispatch(malformed.lease, malformed.reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'unknown' } as never),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      }),
      'Validation failed',
    );
    expect(sends).toBe(0);
    expect(malformed.database.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual(
      [],
    );
    expect(
      malformed.database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'dispatching', dispatch_attempts: 0 });
  } finally {
    malformed.close();
  }
});

test('reopened recovery reconciles an accepted send without a blind resend', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const calls: string[] = [];
    const first = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => {
          calls.push('query.absent');
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          calls.push('send.accepted.but.response.lost');
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(first.state).toBe('uncertain');
    expect(first.dispatchAttempts).toBe(1);
    fixture.controller.close();
    const reopened = boundaryController(fixture.source, () => 1000);
    try {
      const reconciled = await reopened.recoverReviewDispatch(
        fixture.lease,
        fixture.reservation.effectKey,
        {
          query: () => {
            calls.push('query.accepted');
            return Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed });
          },
          send: () => {
            calls.push('unexpected.send');
            return Promise.resolve({ kind: 'uncertain' as const });
          },
        },
      );
      expect(calls).toEqual(['query.absent', 'send.accepted.but.response.lost', 'query.accepted']);
      expect(reconciled.state).toBe('acknowledged');
      expect(reconciled.dispatchAttempts).toBe(1);
      expect(
        fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
      ).toHaveLength(1);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.close();
  }
});

test('reopened orphan query retains a superseded effect without reviving its request', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    try {
      const replacement = fixture.replacement;
      if (replacement === undefined) throw new Error('superseded fixture replacement absent');
      const before = fixture.reopened.readRequest(replacement.requestIdentity);
      const beforeGraph = dispatchState(fixture.database);
      const calls: string[] = [];
      const port = {
        query: () => {
          calls.push('query');
          return Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed });
        },
        send: () => {
          calls.push('send');
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      };
      const retained = await fixture.reopened.reconcileOrphanReviewDispatch(
        fixture.reservation.effectKey,
        port,
      );
      expect(calls).toEqual(['query']);
      expect(retained.kind).toBe('retained');
      expect(fixture.reopened.readRequest(fixture.request.requestIdentity)?.stage).toBe(
        'superseded',
      );
      expect(fixture.reopened.readRequest(replacement.requestIdentity)).toEqual(before);
      const afterGraph = dispatchState(fixture.database);
      expect(afterGraph.requests).toEqual(beforeGraph.requests);
      expect(afterGraph.obligations).toEqual(beforeGraph.obligations);
      expect(afterGraph.registrations).toEqual(beforeGraph.registrations);
      expect(afterGraph.reservations).toEqual(beforeGraph.reservations);
      expect(afterGraph.progress).toEqual(beforeGraph.progress);
      expect(
        fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
      ).toHaveLength(1);
      expect(
        fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
      ).toEqual({ state: 'uncertain' });
    } finally {
      fixture.reopened.close();
    }
  } finally {
    fixture.close();
  }
});

test('reopened failed request retains only an authenticated remote fact', async () => {
  const fixture = await initiatedOrphanFixture('failed');
  try {
    const before = dispatchState(fixture.database);
    const retained = await fixture.reopened.reconcileOrphanReviewDispatch(
      fixture.reservation.effectKey,
      { query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }) },
    );
    expect(retained.kind).toBe('retained');
    const after = dispatchState(fixture.database);
    expect(after.requests).toEqual(before.requests);
    expect(after.obligations).toEqual(before.obligations);
    expect(after.registrations).toEqual(before.registrations);
    expect(after.reservations).toEqual(before.reservations);
    expect(after.progress).toEqual(before.progress);
    expect(after.facts).toHaveLength(1);
    expect(fixture.reopened.readRequest(fixture.request.requestIdentity)?.stage).toBe('failed');
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test.each(['absent', 'unavailable'] as const)(
  'orphan remote %s leaves all durable rows unchanged',
  async (kind) => {
    const fixture = await initiatedOrphanFixture('superseded');
    try {
      const before = dispatchState(fixture.database);
      const observed = await fixture.reopened.reconcileOrphanReviewDispatch(
        fixture.reservation.effectKey,
        { query: () => Promise.resolve({ kind }) },
      );
      expect(observed.kind).toBe(kind);
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      fixture.reopened.close();
      fixture.close();
    }
  },
);

test('orphan query refuses a reserved effect that was never sent', async () => {
  const fixture = reservedDispatchFixture();
  const registry = historicalRegistry(fixture.source);
  fixture.controller.observe({ ...fixture.source.candidate, headSha: '9'.repeat(40) });
  const reopened = openActivationController({
    ...fixture.source,
    historicalAuthorityRegistry: registry,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
  });
  try {
    let queries = 0;
    const before = dispatchState(fixture.database);
    await rejectedWith(
      reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
      }),
      'review dispatch was never initiated',
    );
    expect(queries).toBe(0);
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    reopened.close();
    fixture.close();
  }
});

test.each(['unconfigured', 'absent', 'unreadable', 'malformed', 'unpinned', 'unlisted'] as const)(
  'orphan query refuses %s independently pinned historical authority before provider work',
  async (damage) => {
    const fixture = await initiatedOrphanFixture('superseded');
    let controller = fixture.reopened;
    try {
      if (damage === 'unconfigured') {
        controller = boundaryController(fixture.source, () => 1000);
      } else if (damage === 'absent') {
        rmSync(fixture.registry.path);
      } else if (damage === 'unreadable') {
        controller = openActivationController({
          ...fixture.source,
          historicalAuthorityRegistry: {
            path: fixture.source.databasePath.replace('controller.sqlite', ''),
            digest: fixture.registry.digest,
          },
          clock: () => 1000,
          readyCandidates: () => Promise.resolve([]),
          currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
        });
      } else if (damage === 'malformed') {
        writeFileSync(fixture.registry.path, '{');
      } else if (damage === 'unpinned') {
        writeFileSync(
          fixture.registry.path,
          serializeCanonical({
            schemaVersion: 1,
            authorities: [
              { bootstrapPath: fixture.source.bootstrapPath, pin: fixture.source.pin },
              {
                bootstrapPath: fixture.source.bootstrapPath,
                pin: { ...fixture.source.pin, identity: 'f'.repeat(64) },
              },
            ],
          }),
        );
      } else {
        const bytes = serializeCanonical({ schemaVersion: 1, authorities: [] });
        writeFileSync(fixture.registry.path, bytes);
        controller = openActivationController({
          ...fixture.source,
          historicalAuthorityRegistry: { path: fixture.registry.path, digest: hashBytes(bytes) },
          clock: () => 1000,
          readyCandidates: () => Promise.resolve([]),
          currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
        });
      }
      let queries = 0;
      const before = dispatchState(fixture.database);
      await rejectedWith(
        controller.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
        }),
        damage === 'unconfigured'
          ? 'historical authority absent'
          : damage === 'absent'
            ? 'registry absent'
            : damage === 'unreadable'
              ? 'registry unreadable'
              : damage === 'malformed' || damage === 'unpinned'
                ? 'registry malformed'
                : 'historical authority unavailable',
      );
      expect(queries).toBe(0);
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      controller.close();
      if (controller !== fixture.reopened) fixture.reopened.close();
      fixture.close();
    }
  },
);

test('orphan query never substitutes a changed current bootstrap for its historical pin', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    const original = readFileSync(fixture.source.bootstrapPath, 'utf8');
    writeFileSync(
      fixture.source.bootstrapPath,
      original.replace('review.provider', 'review.changed'),
    );
    const before = dispatchState(fixture.database);
    let queries = 0;
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
      }),
      'bootstrap configuration differs from independent pin',
    );
    expect(queries).toBe(0);
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test('orphan query uses retained original authority after current bootstrap rotates', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  const nextPath = `${fixture.source.bootstrapPath}.next`;
  const nextBytes = readFileSync(fixture.source.bootstrapPath, 'utf8').replace(
    'review.provider',
    'review.next',
  );
  writeFileSync(nextPath, nextBytes);
  const current = openActivationController({
    ...fixture.source,
    bootstrapPath: nextPath,
    pin: { ...fixture.source.pin, identity: hashBytes(nextBytes) },
    historicalAuthorityRegistry: fixture.registry,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
  });
  try {
    const retained = await current.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: (reservation) => {
        expect(reservation.target.providerId).toBe('review.provider');
        return Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed });
      },
    });
    expect(retained.kind).toBe('retained');
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
  } finally {
    current.close();
    fixture.reopened.close();
    fixture.close();
  }
});

test('orphan query refuses nonterminal request even after a prior send attempt', async () => {
  const fixture = reservedDispatchFixture();
  try {
    await fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
      query: () => Promise.resolve({ kind: 'absent' as const }),
      send: () => Promise.resolve({ kind: 'uncertain' as const }),
    });
    const registry = historicalRegistry(fixture.source);
    const reopened = openActivationController({
      ...fixture.source,
      historicalAuthorityRegistry: registry,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
    });
    try {
      let queries = 0;
      const before = dispatchState(fixture.database);
      await rejectedWith(
        reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
        }),
        'review dispatch request is not terminal',
      );
      expect(queries).toBe(0);
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      reopened.close();
    }
  } finally {
    fixture.close();
  }
});

test('orphan query rejects malformed provider output without changing rows', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    const before = dispatchState(fixture.database);
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'unknown' } as never),
      }),
      'Validation failed',
    );
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test.each(['effect', 'request', 'target', 'payload', 'invocation'] as const)(
  'orphan query rejects foreign %s remote fact without writes',
  async (changed) => {
    const fixture = await initiatedOrphanFixture('superseded');
    try {
      const observed =
        changed === 'effect'
          ? { ...fixture.observed, effectKey: 'f'.repeat(64) }
          : changed === 'request'
            ? { ...fixture.observed, requestIdentity: 'f'.repeat(64) }
            : changed === 'target'
              ? {
                  ...fixture.observed,
                  target: { ...fixture.observed.target, providerId: 'foreign' },
                }
              : changed === 'payload'
                ? { ...fixture.observed, payloadDigest: 'f'.repeat(64) }
                : { ...fixture.observed, invocationId: 'foreign' };
      const before = dispatchState(fixture.database);
      await rejectedWith(
        fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
          query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
        }),
        'review dispatch remote fact differs from reservation',
      );
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      fixture.reopened.close();
      fixture.close();
    }
  },
);

test('orphan accepted fact replays and concurrent queries converge without acknowledgement', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    let firstReady:
      ((value: { kind: 'accepted'; observed: typeof fixture.observed }) => void) | undefined;
    let secondReady:
      ((value: { kind: 'accepted'; observed: typeof fixture.observed }) => void) | undefined;
    const firstReply = new Promise<{ kind: 'accepted'; observed: typeof fixture.observed }>(
      (resolve) => {
        firstReady = resolve;
      },
    );
    const secondReply = new Promise<{ kind: 'accepted'; observed: typeof fixture.observed }>(
      (resolve) => {
        secondReady = resolve;
      },
    );
    const first = fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => firstReply,
    });
    const second = fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => secondReply,
    });
    firstReady?.({ kind: 'accepted', observed: fixture.observed });
    secondReady?.({ kind: 'accepted', observed: fixture.observed });
    const settled = await Promise.all([first, second]);
    expect(settled.map((entry) => entry.kind)).toEqual(['retained', 'retained']);
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
    const after = dispatchState(fixture.database);
    expect(
      (
        await fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
          query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
        })
      ).kind,
    ).toBe('retained');
    expect(dispatchState(fixture.database)).toEqual(after);
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () =>
          Promise.resolve({
            kind: 'accepted' as const,
            observed: { ...fixture.observed, remoteDispatchId: 'remote.conflicting' },
          }),
      }),
      'review dispatch remote fact conflicts',
    );
    expect(dispatchState(fixture.database)).toEqual(after);
    expect(after.progress).toMatchObject([{ state: 'uncertain', dispatch_attempts: 1 }]);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test('orphan fact insert failure rolls back without changing terminal request or progress', async () => {
  const fixture = await initiatedOrphanFixture('failed');
  try {
    fixture.database
      .run(`CREATE TRIGGER reject_orphan_fact BEFORE INSERT ON activation_review_dispatch_fact
      BEGIN SELECT RAISE(ABORT, 'modeled orphan fact failure'); END`);
    const before = dispatchState(fixture.database);
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
      }),
      'modeled orphan fact failure',
    );
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test('held orphan query rechecks historical authority before retaining the remote fact', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    let release:
      ((answer: { kind: 'accepted'; observed: typeof fixture.observed }) => void) | undefined;
    let queried: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      queried = resolve;
    });
    const answer = new Promise<{ kind: 'accepted'; observed: typeof fixture.observed }>(
      (resolve) => {
        release = resolve;
      },
    );
    const pending = fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => {
        queried?.();
        return answer;
      },
    });
    await started;
    writeFileSync(fixture.registry.path, serializeCanonical({ schemaVersion: 1, authorities: [] }));
    const before = dispatchState(fixture.database);
    release?.({ kind: 'accepted', observed: fixture.observed });
    await rejectedWith(pending, 'review dispatch historical authority registry malformed');
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test('orphan query refuses a disappearing retained fact without reporting success', async () => {
  const fixture = await initiatedOrphanFixture('failed');
  try {
    fixture.database
      .run(`CREATE TRIGGER lose_orphan_fact AFTER INSERT ON activation_review_dispatch_fact
      BEGIN DELETE FROM activation_review_dispatch_fact WHERE effect_key = NEW.effect_key; END`);
    const before = dispatchState(fixture.database);
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
      }),
      'review dispatch remote fact absent',
    );
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test.each([
  ['authority', 'review dispatch original authority changed'],
  ['plan', 'review dispatch original plan changed'],
  ['registration', 'review dispatch original invocation changed'],
  ['cold attempt', 'review dispatch original pair changed'],
  ['informed attempt', 'review dispatch original pair changed'],
  ['target', 'review dispatch original reservation changed'],
  ['payload', 'review dispatch original reservation changed'],
] as const)(
  'orphan query refuses changed original %s before provider work',
  async (damage, message) => {
    const fixture = await initiatedOrphanFixture('superseded');
    try {
      if (damage === 'authority') {
        fixture.database
          .query('UPDATE activation_request SET bootstrap_identity = ? WHERE request_identity = ?')
          .run('f'.repeat(64), fixture.request.requestIdentity);
      } else if (damage === 'plan') {
        fixture.database
          .query(
            'UPDATE activation_obligation SET command_identity = ? WHERE obligation_identity = ?',
          )
          .run('f'.repeat(64), 'a'.repeat(64));
      } else if (damage === 'registration') {
        fixture.database
          .query('UPDATE activation_review_attempt SET invocation_id = ?')
          .run('invocation.changed');
      } else if (damage === 'cold attempt' || damage === 'informed attempt') {
        fixture.database
          .query(
            'UPDATE activation_obligation SET attempt = attempt + 1 WHERE obligation_identity = ?',
          )
          .run(damage === 'cold attempt' ? 'd'.repeat(64) : 'f'.repeat(64));
      } else if (damage === 'target') {
        fixture.database.query('UPDATE activation_review_dispatch SET target_bytes = ?').run(
          serializeCanonical({
            kind: 'reviewer',
            providerId: 'review.other',
            executorId: 'review.executor',
          }),
        );
      } else {
        const changed = serializeCanonical({
          ...JSON.parse(fixture.reservation.payloadBytes),
          request: { ...fixture.request, headSha: '8'.repeat(40) },
        });
        fixture.database
          .query('UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?')
          .run(changed, hashBytes(changed));
      }
      let queries = 0;
      const before = dispatchState(fixture.database);
      await rejectedWith(
        fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
        }),
        message,
      );
      expect(queries).toBe(0);
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      fixture.reopened.close();
      fixture.close();
    }
  },
);

test.each(['effect', 'request', 'target', 'payload', 'invocation'] as const)(
  'foreign remote fact %s cannot acknowledge the reserved dispatch',
  async (changed) => {
    const fixture = reservedDispatchFixture();
    try {
      const observed =
        changed === 'effect'
          ? { ...fixture.observed, effectKey: 'f'.repeat(64) }
          : changed === 'request'
            ? { ...fixture.observed, requestIdentity: 'f'.repeat(64) }
            : changed === 'target'
              ? {
                  ...fixture.observed,
                  target: { ...fixture.observed.target, providerId: 'foreign' },
                }
              : changed === 'payload'
                ? { ...fixture.observed, payloadDigest: 'f'.repeat(64) }
                : { ...fixture.observed, invocationId: 'foreign' };
      await rejectedWith(
        fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
          query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
          send: () => {
            throw new Error('query acceptance must not send');
          },
        }),
        'review dispatch remote fact differs from reservation',
      );
      expect(fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual(
        [],
      );
      expect(
        fixture.database
          .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
          .get(),
      ).toEqual({ state: 'dispatching', dispatch_attempts: 0 });
    } finally {
      fixture.close();
    }
  },
);

test('dispatch exhaustion bars new sends but still reconciles an earlier remote acceptance', async () => {
  const fixture = reservedDispatchFixture({ maxDispatchAttempts: 1 });
  try {
    let sends = 0;
    const port = {
      query: () => Promise.resolve({ kind: 'absent' as const }),
      send: () => {
        sends += 1;
        return Promise.resolve({ kind: 'uncertain' as const });
      },
    };
    const first = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      port,
    );
    expect(first.state).toBe('uncertain');
    expect(first.dispatchAttempts).toBe(1);
    const exhausted = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      port,
    );
    expect(exhausted.state).toBe('exhausted');
    expect(sends).toBe(1);
    const reconciled = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
        send: () => {
          throw new Error('accepted remote fact must not send');
        },
      },
    );
    expect(reconciled.state).toBe('acknowledged');
    expect(reconciled.dispatchAttempts).toBe(1);
  } finally {
    fixture.close();
  }
});

test('dispatch deadline bars new sends but permits an already accepted remote fact', async () => {
  const fixture = reservedDispatchFixture({ deadlineAt: 1001 });
  try {
    fixture.setNow(1001);
    let sends = 0;
    const exhausted = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'absent' as const }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(exhausted.state).toBe('exhausted');
    expect(exhausted.dispatchAttempts).toBe(0);
    expect(sends).toBe(0);
    const reconciled = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
        send: () => {
          throw new Error('accepted remote fact must not send');
        },
      },
    );
    expect(reconciled.state).toBe('acknowledged');
  } finally {
    fixture.close();
  }
});

test('held dispatch query cannot send after another worker takes the evaluating lease', async () => {
  const fixture = reservedDispatchFixture();
  try {
    let releaseQuery: ((value: { kind: 'absent' }) => void) | undefined;
    const query = new Promise<{ kind: 'absent' }>((resolve) => {
      releaseQuery = resolve;
    });
    let sends = 0;
    const pending = fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => query,
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(
      fixture.database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'dispatching', dispatch_attempts: 0 });
    fixture.setNow(1010);
    const successor = fixture.controller.recoverEvaluationLease(
      fixture.request.requestIdentity,
      'worker.second',
      10,
    );
    expect(successor.leaseEpoch).toBeGreaterThan(fixture.lease.leaseEpoch);
    releaseQuery?.({ kind: 'absent' });
    await rejectedWith(pending, 'review dispatch lease changed');
    expect(sends).toBe(0);
    expect(fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual(
      [],
    );
  } finally {
    fixture.close();
  }
});

test('fake provider fences takeover after local pre-send intent and retains no old-owner acknowledgement', async () => {
  const fixture = reservedDispatchFixture();
  try {
    let releaseSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    let accepted = 0;
    const pending = fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'absent' as const }),
        send: async (reservation, fence) => {
          await sendGate;
          const owner = fixture.database
            .query(
              'SELECT lease_owner, lease_epoch FROM activation_request WHERE request_identity = ?',
            )
            .get(fixture.request.requestIdentity) as { lease_owner: string; lease_epoch: number };
          if (owner.lease_owner !== fence.workerId || owner.lease_epoch !== fence.leaseEpoch)
            return { kind: 'uncertain' as const };
          expect(reservation.payloadDigest).toBe(fixture.reservation.payloadDigest);
          accepted += 1;
          return { kind: 'accepted' as const, observed: fixture.observed };
        },
      },
    );
    await Promise.resolve();
    expect(
      fixture.database
        .query('SELECT dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ dispatch_attempts: 1 });
    fixture.setNow(1010);
    fixture.controller.recoverEvaluationLease(fixture.request.requestIdentity, 'worker.second', 10);
    releaseSend?.();
    const progress = await pending;
    expect(accepted).toBe(0);
    expect(fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual(
      [],
    );
    expect(progress.state).toBe('uncertain');
  } finally {
    fixture.close();
  }
});

test('acknowledged dispatch replay refuses corrupted retained remote fact', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const port = {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
      send: () => {
        throw new Error('remote fact was already accepted');
      },
    };
    const first = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      port,
    );
    expect(first.state).toBe('acknowledged');
    fixture.database
      .query(
        `UPDATE activation_review_dispatch_fact SET observation_bytes = ?
      WHERE effect_key = ?`,
      )
      .run(
        serializeCanonical({ ...fixture.observed, evidenceBytes: 'tampered' }),
        fixture.reservation.effectKey,
      );
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, port),
      'review dispatch remote fact digest changed',
    );
    expect(
      fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
    ).toEqual({ state: 'acknowledged' });
  } finally {
    fixture.close();
  }
});

test('acknowledged dispatch replay refuses a missing retained remote fact', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const port = {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
      send: () => {
        throw new Error('remote fact was already accepted');
      },
    };
    const first = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      port,
    );
    expect(first.state).toBe('acknowledged');
    fixture.database
      .query('DELETE FROM activation_review_dispatch_fact WHERE effect_key = ?')
      .run(fixture.reservation.effectKey);
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, port),
      'review dispatch remote fact absent',
    );
  } finally {
    fixture.close();
  }
});

test('version-5 reserved effect migrates as unsent and late version-6 failure rolls back schema', () => {
  const fixture = reservedDispatchFixture();
  const effectKey = fixture.reservation.effectKey;
  const source = fixture.source;
  fixture.close();
  const database = new Database(source.databasePath);
  try {
    database.run('DROP TABLE activation_review_dispatch_progress');
    database.run('PRAGMA user_version = 5');
    const before = {
      version: database.query('PRAGMA user_version').get(),
      schema: database
        .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .all(),
      reservation: database.query('SELECT * FROM activation_review_dispatch').all(),
    };
    expect(() => boundaryController(source, () => 1000)).toThrow(
      'activation_review_dispatch_fact already exists',
    );
    expect({
      version: database.query('PRAGMA user_version').get(),
      schema: database
        .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .all(),
      reservation: database.query('SELECT * FROM activation_review_dispatch').all(),
    }).toEqual(before);
    database.run('DROP TABLE activation_review_dispatch_fact');
  } finally {
    database.close();
  }
  const upgraded = boundaryController(source, () => 1000);
  const migrated = new Database(source.databasePath);
  try {
    expect(migrated.query('PRAGMA user_version').get()).toEqual({ user_version: 6 });
    expect(
      migrated
        .query(
          'SELECT effect_key, state, dispatch_attempts FROM activation_review_dispatch_progress',
        )
        .get(),
    ).toEqual({ effect_key: effectKey, state: 'reserved', dispatch_attempts: 0 });
    expect(migrated.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual([]);
  } finally {
    migrated.close();
    upgraded.close();
  }
});

test.each(['missing', 'malformed'] as const)(
  'recovery refuses %s durable progress before querying the provider',
  async (damage) => {
    const fixture = reservedDispatchFixture();
    try {
      if (damage === 'missing') {
        fixture.database
          .query('DELETE FROM activation_review_dispatch_progress WHERE effect_key = ?')
          .run(fixture.reservation.effectKey);
      } else {
        fixture.database
          .query('UPDATE activation_review_dispatch_progress SET owner_id = ? WHERE effect_key = ?')
          .run('', fixture.reservation.effectKey);
      }
      let queries = 0;
      let refusal: unknown;
      try {
        await fixture.controller.recoverReviewDispatch(
          fixture.lease,
          fixture.reservation.effectKey,
          {
            query: () => {
              queries += 1;
              return Promise.resolve({ kind: 'absent' as const });
            },
            send: () => {
              throw new Error('invalid progress must not send');
            },
          },
        );
      } catch (error) {
        refusal = error;
      }
      expect(queries).toBe(0);
      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toContain(
        damage === 'missing' ? 'review dispatch progress absent' : 'owner_id must be non-empty',
      );
      expect(fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all()).toEqual(
        [],
      );
    } finally {
      fixture.close();
    }
  },
);

test('stale worker retains an already accepted fact but only successor acknowledges it', async () => {
  const fixture = reservedDispatchFixture();
  try {
    let releaseQuery:
      ((value: { kind: 'accepted'; observed: typeof fixture.observed }) => void) | undefined;
    const query = new Promise<{ kind: 'accepted'; observed: typeof fixture.observed }>(
      (resolve) => {
        releaseQuery = resolve;
      },
    );
    const stale = fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => query,
        send: () => {
          throw new Error('accepted fact must not send');
        },
      },
    );
    fixture.setNow(1010);
    const successor = fixture.controller.recoverEvaluationLease(
      fixture.request.requestIdentity,
      'worker.second',
      10,
    );
    releaseQuery?.({ kind: 'accepted', observed: fixture.observed });
    const staleProgress = await stale;
    expect(staleProgress.state).toBe('dispatching');
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
    const current = await fixture.controller.recoverReviewDispatch(
      successor,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
        send: () => {
          throw new Error('already accepted fact must not send');
        },
      },
    );
    expect(current.state).toBe('acknowledged');
    expect(current.dispatchAttempts).toBe(0);
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
  } finally {
    fixture.close();
  }
});

test('fact retention survives an acknowledgement write failure without granting progress', async () => {
  const fixture = reservedDispatchFixture();
  try {
    fixture.database.run(`CREATE TRIGGER fail_dispatch_ack BEFORE UPDATE OF state
      ON activation_review_dispatch_progress WHEN NEW.state = 'acknowledged'
      BEGIN SELECT RAISE(ABORT, 'modeled dispatch acknowledgement failure'); END`);
    const port = {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
      send: () => {
        throw new Error('accepted fact must not send');
      },
    };
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, port),
      'modeled dispatch acknowledgement failure',
    );
    expect(
      fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
    ).toEqual({ state: 'dispatching' });
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
    fixture.database.run('DROP TRIGGER fail_dispatch_ack');
    const reconciled = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      port,
    );
    expect(reconciled.state).toBe('acknowledged');
    expect(
      fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
    ).toHaveLength(1);
  } finally {
    fixture.close();
  }
});

test('two same-owner recovery queries cannot each authorize a send', async () => {
  const fixture = reservedDispatchFixture();
  try {
    let releaseFirst: ((value: { kind: 'absent' }) => void) | undefined;
    const held = new Promise<{ kind: 'absent' }>((resolve) => {
      releaseFirst = resolve;
    });
    let sends = 0;
    const first = fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => held,
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    const second = await fixture.controller.recoverReviewDispatch(
      fixture.lease,
      fixture.reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'absent' as const }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(second.dispatchAttempts).toBe(1);
    releaseFirst?.({ kind: 'absent' });
    await rejectedWith(first, 'review dispatch ownership changed before send');
    expect(sends).toBe(1);
    expect(
      fixture.database
        .query('SELECT dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ dispatch_attempts: 1 });
  } finally {
    fixture.close();
  }
});

test('query transport failure remains uncertain and never authorizes a blind send', async () => {
  const fixture = reservedDispatchFixture();
  try {
    let sends = 0;
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
        query: () => Promise.reject(new Error('modeled provider query unavailable')),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      }),
      'modeled provider query unavailable',
    );
    expect(sends).toBe(0);
    expect(
      fixture.database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'dispatching', dispatch_attempts: 0 });
  } finally {
    fixture.close();
  }
});

test('dispatch recovery refuses an advanced durable subject generation before provider work', async () => {
  const fixture = reservedDispatchFixture();
  try {
    fixture.database.run(
      'UPDATE activation_subject SET high_water_generation = high_water_generation + 1',
    );
    let queries = 0;
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          throw new Error('stale generation must not send');
        },
      }),
      'review dispatch generation changed',
    );
    expect(queries).toBe(0);
    expect(
      fixture.database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'reserved', dispatch_attempts: 0 });
  } finally {
    fixture.close();
  }
});

test('dispatch recovery refuses changed frozen plan or registered invocation before provider work', async () => {
  for (const changed of ['plan', 'invocation'] as const) {
    const fixture = reservedDispatchFixture();
    try {
      if (changed === 'plan') {
        fixture.database
          .query(
            `UPDATE activation_obligation SET protocol_identity = ?
          WHERE request_identity = ? AND kind = 'audit' AND phase = 'cold'`,
          )
          .run('f'.repeat(64), fixture.request.requestIdentity);
      } else {
        fixture.database
          .query(
            `UPDATE activation_review_attempt SET invocation_id = ?
          WHERE request_identity = ?`,
          )
          .run('invocation.changed', fixture.request.requestIdentity);
      }
      let queries = 0;
      await rejectedWith(
        fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
          send: () => {
            throw new Error('changed dispatch bindings must not send');
          },
        }),
        changed === 'plan'
          ? 'review dispatch differs from frozen evaluation plan'
          : 'review dispatch invocation registration changed',
      );
      expect(queries).toBe(0);
      expect(
        fixture.database
          .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
          .get(),
      ).toEqual({ state: 'reserved', dispatch_attempts: 0 });
    } finally {
      fixture.close();
    }
  }
});

test.each(['cold', 'informed'] as const)(
  'dispatch recovery refuses changed %s phase attempt before provider work',
  async (phase) => {
    const fixture = reservedDispatchFixture();
    try {
      fixture.database
        .query(
          `UPDATE activation_obligation SET attempt = attempt + 1
        WHERE request_identity = ? AND kind = 'audit' AND phase = ?`,
        )
        .run(fixture.request.requestIdentity, phase);
      const before = dispatchState(fixture.database);
      let queries = 0;
      await rejectedWith(
        fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
          send: () => {
            throw new Error('changed phase attempt must not send');
          },
        }),
        'review dispatch frozen pair differs from authority',
      );
      expect(queries).toBe(0);
      expect(dispatchState(fixture.database)).toEqual(before);
    } finally {
      fixture.close();
    }
  },
);

test('dispatch recovery refuses coherently changed canonical payload before provider work', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const payload = JSON.parse(fixture.reservation.payloadBytes) as {
      request: { headSha: string };
    };
    const altered = serializeCanonical({
      ...payload,
      request: { ...payload.request, headSha: '8'.repeat(40) },
    });
    fixture.database
      .query(
        `UPDATE activation_review_dispatch
      SET payload_bytes = ?, payload_digest = ? WHERE effect_key = ?`,
      )
      .run(altered, hashBytes(altered), fixture.reservation.effectKey);
    let queries = 0;
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          throw new Error('changed canonical payload must not send');
        },
      }),
      'review dispatch canonical reservation changed',
    );
    expect(queries).toBe(0);
    expect(
      fixture.database
        .query('SELECT state, dispatch_attempts FROM activation_review_dispatch_progress')
        .get(),
    ).toEqual({ state: 'reserved', dispatch_attempts: 0 });
  } finally {
    fixture.close();
  }
});

test('dispatch recovery refuses a coherently renamed effect key before provider work', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const changedKey = '8'.repeat(64);
    fixture.database.run('PRAGMA foreign_keys = OFF');
    fixture.database
      .query('UPDATE activation_review_dispatch SET effect_key = ? WHERE effect_key = ?')
      .run(changedKey, fixture.reservation.effectKey);
    fixture.database
      .query('UPDATE activation_review_dispatch_progress SET effect_key = ? WHERE effect_key = ?')
      .run(changedKey, fixture.reservation.effectKey);
    fixture.database.run('PRAGMA foreign_keys = ON');
    let queries = 0;
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, changedKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          throw new Error('renamed effect must not send');
        },
      }),
      'review dispatch canonical reservation changed',
    );
    expect(queries).toBe(0);
    expect(
      fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
    ).toEqual({ state: 'reserved' });
  } finally {
    fixture.close();
  }
});

test.each([
  'request',
  'current',
  'stage',
  'lease',
  'authority',
  'target',
  'payload-digest',
] as const)('recovery %s preflight refuses before provider work', async (condition) => {
  const fixture = reservedDispatchFixture();
  try {
    if (condition === 'request') {
      fixture.database.run('PRAGMA foreign_keys = OFF');
      fixture.database
        .query('UPDATE activation_review_dispatch SET request_identity = ? WHERE effect_key = ?')
        .run('f'.repeat(64), fixture.reservation.effectKey);
      fixture.database.run('PRAGMA foreign_keys = ON');
    } else if (condition === 'current') {
      fixture.database
        .query('UPDATE activation_request SET current = 0 WHERE request_identity = ?')
        .run(fixture.request.requestIdentity);
    } else if (condition === 'stage') {
      fixture.database
        .query("UPDATE activation_request SET stage = 'failed' WHERE request_identity = ?")
        .run(fixture.request.requestIdentity);
    } else if (condition === 'lease') {
      fixture.database
        .query(
          'UPDATE activation_request SET lease_epoch = lease_epoch + 1 WHERE request_identity = ?',
        )
        .run(fixture.request.requestIdentity);
    } else if (condition === 'authority') {
      fixture.database
        .query('UPDATE activation_request SET bootstrap_identity = ? WHERE request_identity = ?')
        .run('f'.repeat(64), fixture.request.requestIdentity);
    } else if (condition === 'target') {
      fixture.database
        .query('UPDATE activation_review_dispatch SET target_bytes = ? WHERE effect_key = ?')
        .run(
          serializeCanonical({ ...fixture.reservation.target, providerId: 'foreign' }),
          fixture.reservation.effectKey,
        );
    } else {
      fixture.database
        .query('UPDATE activation_review_dispatch SET payload_digest = ? WHERE effect_key = ?')
        .run('f'.repeat(64), fixture.reservation.effectKey);
    }
    const before = dispatchState(fixture.database);
    let queries = 0;
    const message = {
      request: 'review dispatch request changed',
      current: 'review dispatch request no longer current evaluating',
      stage: 'review dispatch request no longer current evaluating',
      lease: 'review dispatch lease changed',
      authority: 'review dispatch authority changed',
      target: 'review dispatch target changed',
      'payload-digest': 'review dispatch payload digest changed',
    }[condition];
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
        query: () => {
          queries += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          throw new Error('invalid recovery preflight must not send');
        },
      }),
      message,
    );
    expect(queries).toBe(0);
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.close();
  }
});

test.each(['version', 'owner', 'current', 'lease', 'authority'] as const)(
  'acknowledgement %s fence retains fact without granting stale progress',
  async (changed) => {
    const fixture = reservedDispatchFixture();
    try {
      let releaseQuery:
        ((value: { kind: 'accepted'; observed: typeof fixture.observed }) => void) | undefined;
      const query = new Promise<{ kind: 'accepted'; observed: typeof fixture.observed }>(
        (resolve) => {
          releaseQuery = resolve;
        },
      );
      const pending = fixture.controller.recoverReviewDispatch(
        fixture.lease,
        fixture.reservation.effectKey,
        {
          query: () => query,
          send: () => {
            throw new Error('accepted fact must not send');
          },
        },
      );
      if (changed === 'version') {
        fixture.database
          .query('UPDATE activation_review_dispatch_progress SET version = version + 1')
          .run();
      } else if (changed === 'owner') {
        fixture.database
          .query('UPDATE activation_review_dispatch_progress SET owner_id = ?')
          .run('worker.other');
      } else if (changed === 'current') {
        fixture.database.query('UPDATE activation_request SET current = 0').run();
      } else if (changed === 'lease') {
        fixture.database.query('UPDATE activation_request SET lease_epoch = lease_epoch + 1').run();
      } else {
        fixture.database
          .query('UPDATE activation_request SET bootstrap_identity = ?')
          .run('f'.repeat(64));
      }
      releaseQuery?.({ kind: 'accepted', observed: fixture.observed });
      if (changed === 'authority') {
        await rejectedWith(pending, 'review dispatch authority changed');
      } else {
        expect((await pending).state).toBe('dispatching');
      }
      expect(
        fixture.database.query('SELECT * FROM activation_review_dispatch_fact').all(),
      ).toHaveLength(1);
      expect(
        fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
      ).toEqual({ state: 'dispatching' });
    } finally {
      fixture.close();
    }
  },
);

test('remote fact replay refuses conflicting accepted bytes before acknowledgement', async () => {
  const fixture = reservedDispatchFixture();
  try {
    const bytes = serializeCanonical(fixture.observed);
    fixture.database
      .query(
        `INSERT INTO activation_review_dispatch_fact
      (effect_key, observation_bytes, observation_digest) VALUES (?, ?, ?)`,
      )
      .run(fixture.reservation.effectKey, bytes, hashBytes(bytes));
    await rejectedWith(
      fixture.controller.recoverReviewDispatch(fixture.lease, fixture.reservation.effectKey, {
        query: () =>
          Promise.resolve({
            kind: 'accepted' as const,
            observed: { ...fixture.observed, remoteDispatchId: 'remote.other' },
          }),
        send: () => {
          throw new Error('remote fact exists');
        },
      }),
      'review dispatch remote fact conflicts',
    );
    expect(
      fixture.database.query('SELECT state FROM activation_review_dispatch_progress').get(),
    ).toEqual({ state: 'dispatching' });
    expect(
      fixture.database.query('SELECT observation_bytes FROM activation_review_dispatch_fact').get(),
    ).toEqual({ observation_bytes: bytes });
  } finally {
    fixture.close();
  }
});

test('evaluation fences an old epoch independently of current owner and version', () => {
  const source = fixture();
  let now = 1000;
  const controller = boundaryController(source, () => now);
  try {
    const request = controller.observe(source.candidate);
    const old = controller.claim(request.requestIdentity, 'worker.first', 10);
    now = 1010;
    const current = controller.claim(request.requestIdentity, 'worker.second', 10);
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation({ ...current, leaseEpoch: old.leaseEpoch })).toThrow(
      'activation request lease changed',
    );
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation fences a wrong owner independently of current epoch and version', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const current = controller.claim(request.requestIdentity, 'worker.first', 10);
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation({ ...current, workerId: 'worker.other' })).toThrow(
      'activation request lease changed',
    );
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation fences a wrong version independently of current epoch and owner', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const current = controller.claim(request.requestIdentity, 'worker.first', 10);
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation({ ...current, version: current.version + 1 })).toThrow(
      'activation request lease changed',
    );
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation fences a lease at its exact expiry', () => {
  const source = fixture();
  let now = 1000;
  const controller = boundaryController(source, () => now);
  try {
    const request = controller.observe(source.candidate);
    const current = controller.claim(request.requestIdentity, 'worker.first', 10);
    now = 1010;
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation(current)).toThrow('activation request lease changed');
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation fences a missing persisted lease expiry', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const current = controller.claim(request.requestIdentity, 'worker.first', 10);
    const database = new Database(source.databasePath);
    try {
      database
        .query('UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?')
        .run(request.requestIdentity);
    } finally {
      database.close();
    }
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation(current)).toThrow('activation request lease changed');
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('evaluation refuses a current lease under a different valid pinned authority', () => {
  const source = fixture();
  const first = boundaryController(source, () => 1000);
  const request = first.observe(source.candidate);
  const lease = first.claim(request.requestIdentity, 'worker.first', 10);
  first.close();
  const alternatePath = join(source.bootstrapPath, '..', 'alternate-bootstrap.json');
  const alternateBytes = readFileSync(source.bootstrapPath, 'utf8').replace(
    'review.provider',
    'review.alternate',
  );
  writeFileSync(alternatePath, alternateBytes);
  const alternate = boundaryController(
    {
      ...source,
      bootstrapPath: alternatePath,
      pin: { ...source.pin, identity: hashBytes(alternateBytes) },
    },
    () => 1000,
  );
  try {
    const before = alternate.listRequests();
    expect(() => alternate.beginEvaluation(lease)).toThrow('activation request authority changed');
    expect(alternate.listRequests()).toEqual(before);
    expect(alternate.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    alternate.close();
  }
});

test('evaluation rereads the pinned bootstrap before freezing obligations', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 10);
    rmSync(source.bootstrapPath);
    const before = controller.listRequests();
    expect(() => controller.beginEvaluation(lease)).toThrow();
    expect(controller.listRequests()).toEqual(before);
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('observed evaluation freezes independent check and audit obligations together', () => {
  const fixtureData = fixture();
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
    selectObligations: (request) => ({
      requestIdentity: request.requestIdentity,
      policyIdentity: request.policyIdentity,
      obligations: [
        {
          identity: 'a'.repeat(64),
          kind: 'check',
          executorId: 'worker.check',
          protocolIdentity: 'b'.repeat(64),
          commandIdentity: 'c'.repeat(64),
        },
        {
          identity: 'd'.repeat(64),
          kind: 'audit',
          reviewId: 'review.primary',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold',
        },
        {
          identity: 'f'.repeat(64),
          kind: 'audit',
          reviewId: 'review.primary',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'informed',
        },
      ],
    }),
  });
  try {
    const request = controller.observe(fixtureData.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    const evaluating = controller.beginEvaluation(lease);
    expect(evaluating.stage).toBe('evaluating');
    expect(controller.listObligations(request.requestIdentity).map(({ kind }) => kind)).toEqual([
      'check',
      'audit',
      'audit',
    ]);
    expect('advance' in controller).toBe(false);
    expect(() => controller.beginEvaluation(lease)).toThrow();
  } finally {
    controller.close();
  }
});

test('selected review pair refuses a missing informed phase before freezing', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
    selectObligations: (request) => ({
      ...source.selectObligations(request),
      obligations: source
        .selectObligations(request)
        .obligations.filter(
          (obligation) => obligation.kind !== 'audit' || obligation.phase !== 'informed',
        ),
    }),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    const before = evidenceRows(source.databasePath);
    expect(() => controller.beginEvaluation(lease)).toThrow('selected review pair incomplete');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('selected review pair refuses a duplicate cold phase before freezing', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
    selectObligations: (request) => ({
      ...source.selectObligations(request),
      obligations: [
        ...source.selectObligations(request).obligations,
        {
          identity: '1'.repeat(64),
          kind: 'audit' as const,
          reviewId: 'review.primary',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold' as const,
        },
      ],
    }),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    const before = evidenceRows(source.databasePath);
    expect(() => controller.beginEvaluation(lease)).toThrow('selected review pair duplicated');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('one selected review attempt registers one immutable invocation before dispatch', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary');
    const registered = controller.registerReviewAttempt(
      lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    expect(registered).toEqual({
      requestIdentity: request.requestIdentity,
      reviewId: 'review.primary',
      attempt: 0,
      invocationId: 'invocation.primary',
    });
    expect(
      controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
    ).toEqual(registered);
    expect(() =>
      controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.other'),
    ).toThrow('review attempt registration conflicts');
    const before = evidenceRows(source.databasePath);
    expect(() =>
      controller.registerReviewAttempt(lease, 'review.primary', 1, 'invocation.new-attempt'),
    ).toThrow('review attempt differs from frozen pair');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('another selected review cannot reuse the first review invocation', () => {
  const source = fixture();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
    selectObligations: (request) => ({
      ...source.selectObligations(request),
      obligations: [
        ...source.selectObligations(request).obligations,
        {
          identity: '1'.repeat(64),
          kind: 'audit' as const,
          reviewId: 'review.second',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold' as const,
        },
        {
          identity: '2'.repeat(64),
          kind: 'audit' as const,
          reviewId: 'review.second',
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'informed' as const,
        },
      ],
    }),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary');
    const before = evidenceRows(source.databasePath);
    expect(() =>
      controller.registerReviewAttempt(lease, 'review.second', 0, 'invocation.primary'),
    ).toThrow('review invocation already registered');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test.each([
  ['superseded', 'activation request superseded'],
  ['stage', 'activation request is not evaluating'],
  ['lease', 'activation request lease changed'],
] as const)(
  'review attempt registration refuses %s request state without new authority',
  (fault, message) => {
    const source = fixture();
    const controller = boundaryController(source, () => 1000);
    const database = new Database(source.databasePath);
    try {
      const request = controller.observe(source.candidate);
      const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
      controller.beginEvaluation(lease);
      if (fault === 'superseded') {
        controller.observe({ ...source.candidate, headSha: '9'.repeat(40) });
        database
          .query('UPDATE activation_request SET stage = ? WHERE request_identity = ?')
          .run('evaluating', request.requestIdentity);
      } else if (fault === 'stage') {
        database
          .query('UPDATE activation_request SET stage = ? WHERE request_identity = ?')
          .run('verified', request.requestIdentity);
      } else {
        database
          .query(
            'UPDATE activation_request SET lease_epoch = lease_epoch + 1 WHERE request_identity = ?',
          )
          .run(request.requestIdentity);
      }
      const before = evidenceRows(source.databasePath);
      expect(() =>
        controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
      ).toThrow(message);
      expect(evidenceRows(source.databasePath)).toEqual(before);
    } finally {
      database.close();
      controller.close();
    }
  },
);

test('review attempt registration refuses a different valid pinned authority', () => {
  const source = fixture();
  const first = boundaryController(source, () => 1000);
  const request = first.observe(source.candidate);
  const lease = first.claim(request.requestIdentity, 'worker.first', 100);
  first.beginEvaluation(lease);
  first.close();
  const alternatePath = join(source.bootstrapPath, '..', 'alternate-review-bootstrap.json');
  const alternateBytes = readFileSync(source.bootstrapPath, 'utf8').replace(
    'review.provider',
    'review.alternate',
  );
  writeFileSync(alternatePath, alternateBytes);
  const second = openActivationController({
    ...source,
    bootstrapPath: alternatePath,
    pin: { ...source.pin, identity: hashBytes(alternateBytes) },
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
  });
  try {
    const before = evidenceRows(source.databasePath);
    expect(() =>
      second.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
    ).toThrow('activation request authority changed');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    second.close();
  }
});

test.each(['owner', 'expiry', 'null-expiry'] as const)(
  'review attempt registration refuses a changed %s without writes',
  (fault) => {
    const source = fixture();
    const controller = boundaryController(source, () => 1000);
    const database = new Database(source.databasePath);
    try {
      const request = controller.observe(source.candidate);
      const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
      controller.beginEvaluation(lease);
      if (fault === 'owner') {
        database
          .query('UPDATE activation_request SET lease_owner = ? WHERE request_identity = ?')
          .run('worker.second', request.requestIdentity);
      } else {
        database
          .query('UPDATE activation_request SET lease_expires_at = ? WHERE request_identity = ?')
          .run(fault === 'expiry' ? 1000 : null, request.requestIdentity);
      }
      const before = evidenceRows(source.databasePath);
      expect(() =>
        controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
      ).toThrow('activation request lease changed');
      expect(evidenceRows(source.databasePath)).toEqual(before);
    } finally {
      database.close();
      controller.close();
    }
  },
);

test('review attempt registration rereads the pinned bootstrap before writing', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const before = evidenceRows(source.databasePath);
    rmSync(source.bootstrapPath);
    expect(() =>
      controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
    ).toThrow('bootstrap configuration absent');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('legacy unpaired review cannot register a new invocation', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    database
      .query('UPDATE activation_request SET pairing_version = 0 WHERE request_identity = ?')
      .run(request.requestIdentity);
    const before = evidenceRows(source.databasePath);
    expect(() =>
      controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary'),
    ).toThrow('legacy review pairing absent');
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    database.close();
    controller.close();
  }
});

test('audit receipt without a registered review invocation leaves evaluation unchanged', async () => {
  const evidence = await evidenceHarness({ skipCold: true });
  try {
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('cold')),
      'review invocation absent',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('generic receipt authentication cannot substitute the trusted review verifier', async () => {
  let genericCalls = 0;
  const evidence = await evidenceHarness({
    skipCold: true,
    withoutReviewVerifier: true,
    authenticate: (_bytes, receipt) => {
      genericCalls += 1;
      return Promise.resolve(receipt);
    },
  });
  try {
    evidence.controller.registerReviewAttempt(
      evidence.lease,
      'review.primary',
      0,
      'invocation.primary',
    );
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'trusted review verifier absent',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    expect(genericCalls).toBe(0);
  } finally {
    evidence.controller.close();
  }
});

test.each(['rejected', 'malformed'] as const)(
  'trusted review %s response never falls back to check authentication',
  async (fault) => {
    let checkCalls = 0;
    let reviewCalls = 0;
    const evidence = await evidenceHarness({
      authenticate: (_bytes, receipt) => {
        checkCalls += 1;
        return Promise.resolve(receipt);
      },
      verifyReview: (expected, bytes) => {
        reviewCalls += 1;
        if (bytes.includes('"kind":"audit"')) {
          if (fault === 'rejected') return Promise.reject(new Error('trusted review unavailable'));
          return Promise.resolve({
            ...fakeReview(expected, bytes),
            evidence: null,
          } as unknown as VerifiedReview);
        }
        return Promise.resolve(fakeReview(expected, bytes));
      },
    });
    try {
      const beforeCalls = reviewCalls;
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
        fault === 'rejected' ? 'trusted review unavailable' : 'Validation failed',
      );
      expect(reviewCalls).toBe(beforeCalls + 1);
      expect(checkCalls).toBe(0);
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      evidence.controller.close();
    }
  },
);

test.each([
  [
    'submission digest',
    (review: VerifiedCompleteReview) => ({
      ...review,
      binding: { ...review.binding, exactSubmissionDigest: '0'.repeat(64) },
    }),
    'submission digest differs',
  ],
  [
    'phase relabel',
    (review: VerifiedCompleteReview) => ({
      ...review,
      binding: { ...review.binding, phase: 'cold' as const },
    }),
    'review verification differs from frozen invocation',
  ],
  [
    'foreign journal',
    (review: VerifiedCompleteReview) => ({
      ...review,
      binding: { ...review.binding, journalIssuerId: 'foreign.journal' },
    }),
    'review verification differs from frozen invocation',
  ],
  [
    'journal identity mismatch',
    (review: VerifiedCompleteReview) =>
      bindSource({
        ...review,
        evidence: {
          ...review.evidence,
          receipt: {
            ...review.evidence.receipt,
            trust: { ...review.evidence.receipt.trust, journalId: 'journal.other' },
          },
        },
      }),
    'review verification source evidence incomplete',
  ],
  [
    'missing retained reads',
    (review: VerifiedCompleteReview) =>
      bindSource({
        ...review,
        evidence: {
          ...review.evidence,
          receipt: { ...review.evidence.receipt, observedReadIds: [] },
        },
      }),
    'source record differs from phase observations',
  ],
  [
    'wrong cold artifact',
    (review: VerifiedCompleteReview) =>
      bindSource({
        ...review,
        informed: { ...review.informed, coldArtifact: '0'.repeat(64) },
      }),
    'review verification source evidence incomplete',
  ],
  [
    'missing raw response',
    (review: VerifiedCompleteReview) => {
      const emptyArtifact = hashBytes('');
      if (review.informed.telemetry.status !== 'verified') {
        throw new Error('fixture informed telemetry not verified');
      }
      const informedTelemetry = {
        ...review.informed.telemetry,
        receipt: { ...review.informed.telemetry.receipt, outputArtifact: emptyArtifact },
      };
      return bindSource({
        ...review,
        informed: {
          ...review.informed,
          rawResponse: { ...review.informed.rawResponse, payload: '' },
          telemetry: informedTelemetry,
        },
        evidence: {
          ...review.evidence,
          receipt: { ...review.evidence.receipt, rawResponseArtifact: emptyArtifact },
          phaseReceipts: { ...review.evidence.phaseReceipts, informed: informedTelemetry },
          rawResponse: { ...review.evidence.rawResponse, artifact: emptyArtifact },
        },
      });
    },
    'review verification source evidence incomplete',
  ],
  [
    'local journal provenance',
    (review: VerifiedCompleteReview) =>
      bindSource({
        ...review,
        evidence: {
          ...review.evidence,
          receipt: {
            ...review.evidence.receipt,
            trust: { ...review.evidence.receipt.trust, scope: 'local-cooperative' as const },
          },
        },
      }),
    'review verification source evidence incomplete',
  ],
  [
    'passed unresolved finding',
    (review: VerifiedCompleteReview) =>
      bindSource({
        ...review,
        findings: [
          { findingId: 'finding.blocking', severity: 'important', summary: 'Unresolved issue' },
        ],
      }),
    'review verification source evidence incomplete',
  ],
] as const)(
  'trusted review rejects %s before evidence insertion',
  async (_fault, corrupt, message) => {
    const evidence = await evidenceHarness({
      verifyReview: (expected, bytes) =>
        Promise.resolve(
          bytes.includes('"kind":"audit"')
            ? corrupt(fakeReview(expected, bytes))
            : fakeReview(expected, bytes),
        ),
    });
    try {
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
        message,
      );
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      evidence.controller.close();
    }
  },
);

test('authenticated audit retains complete source and a failed finding as terminal evidence', async () => {
  const evidence = await evidenceHarness({
    verifyReview: (expected, bytes) => {
      const complete = fakeReview(expected, bytes);
      return Promise.resolve(
        bytes.includes('"kind":"audit"')
          ? bindSource({
              ...complete,
              status: 'failed',
              findings: [
                {
                  findingId: 'finding.blocking',
                  severity: 'important',
                  summary: 'Unresolved issue',
                },
              ],
            })
          : complete,
      );
    },
  });
  try {
    const audit = evidence.receipt('audit', 'failed');
    expect((await submitReceipt(evidence.controller, evidence.lease, audit)).stage).toBe('failed');
    const rows = evidenceRows(evidence.source.databasePath);
    const retained = rows.attempts.find(
      (row) =>
        typeof row === 'object' &&
        row !== null &&
        'obligation_identity' in row &&
        row.obligation_identity === 'f'.repeat(64),
    );
    if (
      retained === undefined ||
      retained === null ||
      typeof retained !== 'object' ||
      !('authentication_bytes' in retained)
    ) {
      throw new Error('failed review source was not retained');
    }
    const source = JSON.parse(String(retained.authentication_bytes)) as {
      review: VerifiedCompleteReview;
    };
    expect(source.review.evidence.receipt.trust.scope).toBe('external-verifier');
    expect(source.review.cold.rawResponse.payload).toContain('cold');
    expect(source.review.informed.rawResponse.payload).toContain('informed');
    expect(source.review.findings).toHaveLength(1);
    expect(source.review.binding.sourceEvidenceDigest).toBe(
      hashCanonical({
        evidence: source.review.evidence,
        cold: source.review.cold,
        informed: source.review.informed,
        findings: source.review.findings,
        status: source.review.status,
      }),
    );
  } finally {
    evidence.controller.close();
  }
});

test('retained review source corruption is refused after controller restart', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const raw: unknown = database
      .query(
        'SELECT authentication_bytes FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ?',
      )
      .get(evidence.request.requestIdentity, 'd'.repeat(64));
    if (raw === null || typeof raw !== 'object' || !('authentication_bytes' in raw)) {
      throw new Error('retained cold source absent');
    }
    const envelope = JSON.parse(String(raw.authentication_bytes)) as {
      receipt: unknown;
      review: VerifiedCompleteReview;
    };
    database
      .query(
        'UPDATE activation_attempt SET authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(
        serializeCanonical({
          ...envelope,
          review: {
            ...envelope.review,
            evidence: {
              ...envelope.review.evidence,
              receipt: {
                ...envelope.review.evidence.receipt,
                receiptId: 'review-receipt.changed-after-commit',
              },
            },
          },
        }),
        evidence.request.requestIdentity,
        'd'.repeat(64),
      );
    evidence.controller.close();
    const reopened = openActivationController({
      ...evidence.source,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () =>
        Promise.resolve({ kind: 'ready' as const, candidate: evidence.source.candidate }),
      authenticateCheck: (bytes) => Promise.resolve(evidence.authenticated.get(bytes)),
    });
    try {
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        submitReceipt(reopened, evidence.lease, evidence.receipt('check')),
        'selected receipt evidence malformed',
      );
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      reopened.close();
    }
  } finally {
    database.close();
  }
});

test('informed review must reuse the exact committed cold judgment for its selected pair', async () => {
  let substitutedArtifact: string | undefined;
  const evidence = await evidenceHarness({
    verifyReview: (expected, bytes) => {
      const complete = fakeReview(expected, bytes);
      if (!bytes.includes('"kind":"audit"')) return Promise.resolve(complete);
      const changedCold = {
        ...complete.cold.cold,
        judgments: { ...complete.cold.cold.judgments, impact: 'no' as const },
      };
      substitutedArtifact = hashCanonical(changedCold);
      return Promise.resolve(
        bindSource({
          ...complete,
          cold: { ...complete.cold, cold: changedCold },
          informed: { ...complete.informed, coldArtifact: substitutedArtifact },
          evidence: {
            ...complete.evidence,
            protocolEvidence: {
              ...complete.evidence.protocolEvidence,
              cold: changedCold,
              expansion: {
                ...complete.evidence.protocolEvidence.expansion,
                coldJudgmentArtifact: substitutedArtifact,
              },
            },
          },
        }),
      );
    },
  });
  try {
    const database = new Database(evidence.source.databasePath);
    let originalArtifact: string;
    try {
      const raw: unknown = database
        .query(
          'SELECT authentication_bytes FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ?',
        )
        .get(evidence.request.requestIdentity, 'd'.repeat(64));
      if (raw === null || typeof raw !== 'object' || !('authentication_bytes' in raw)) {
        throw new Error('committed cold source absent');
      }
      const retained = JSON.parse(String(raw.authentication_bytes)) as {
        review: VerifiedCompleteReview;
      };
      originalArtifact = hashCanonical(retained.review.cold.cold);
    } finally {
      database.close();
    }
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'informed audit differs from committed cold',
    );
    expect(substitutedArtifact).not.toBe(originalArtifact);
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test.each(['registration', 'authority'] as const)(
  'held trusted review refuses post-await %s movement while an independent check can complete',
  async (movement) => {
    let release: ((verification: VerifiedCompleteReview) => void) | undefined;
    const held = new Promise<VerifiedCompleteReview>((resolve) => {
      release = resolve;
    });
    let submitted: { expected: ReviewExpectation; bytes: string } | undefined;
    const evidence = await evidenceHarness({
      verifyReview: (expected, bytes) => {
        if (bytes.includes('"kind":"audit"')) {
          submitted = { expected, bytes };
          return held;
        }
        return Promise.resolve(fakeReview(expected, bytes));
      },
    });
    const database = new Database(evidence.source.databasePath);
    try {
      const pending = submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit'));
      if (submitted === undefined || release === undefined) {
        throw new Error('trusted review verification was not held');
      }
      expect(
        (await submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check'))).stage,
      ).toBe('evaluating');
      if (movement === 'registration') {
        database
          .query(
            'UPDATE activation_review_attempt SET invocation_id = ? WHERE request_identity = ? AND review_id = ?',
          )
          .run('invocation.replaced', evidence.request.requestIdentity, 'review.primary');
      } else {
        const previous = readFileSync(evidence.source.bootstrapPath, 'utf8');
        writeFileSync(
          evidence.source.bootstrapPath,
          previous.replace('"authorityGeneration":3', '"authorityGeneration":4'),
        );
      }
      const before = evidenceRows(evidence.source.databasePath);
      release(fakeReview(submitted.expected, submitted.bytes));
      await rejectedWith(
        pending,
        movement === 'registration'
          ? 'invocation differs from registration'
          : 'bootstrap configuration differs',
      );
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      evidence.controller.close();
    }
  },
);

test.each([
  ['reviewId', 'review.second', 'review verification differs from frozen invocation'],
  ['invocationId', 'invocation.other', 'review verification differs from frozen invocation'],
] as const)(
  'audit receipt with wrong %s leaves registered evaluation unchanged',
  async (field, wrong, message) => {
    const evidence = await evidenceHarness({ secondPair: field === 'reviewId' });
    try {
      const informed = evidence.receipt('audit');
      const prior = evidence.authenticated.get(informed);
      if (prior === undefined || prior === null || typeof prior !== 'object') {
        throw new Error('fake informed receipt absent');
      }
      evidence.authenticated.set(informed, {
        ...prior,
        [field]: wrong,
        ...(field === 'reviewId' ? { invocationId: 'invocation.second' } : {}),
      });
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(submitReceipt(evidence.controller, evidence.lease, informed), message);
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      evidence.controller.close();
    }
  },
);

test('another review cannot borrow a completed cold phase for its informed receipt', async () => {
  const evidence = await evidenceHarness({ secondPair: true });
  try {
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(
        evidence.controller,
        evidence.lease,
        evidence.receipt('audit', 'passed', 'review.second'),
      ),
      'requires completed cold audit',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('informed phase cannot borrow an earlier cold from another review attempt', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const cold = evidence.authenticated.get(evidence.cold);
    if (cold === undefined || cold === null || typeof cold !== 'object') {
      throw new Error('fake retained cold authentication absent');
    }
    database
      .query(
        'UPDATE activation_obligation SET attempt = 1 WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(evidence.request.requestIdentity, 'd'.repeat(64));
    database
      .query(
        'UPDATE activation_attempt SET attempt = 1, authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(
        serializeCanonical({ ...cold, attempt: 1, invocationId: 'invocation.next' }),
        evidence.request.requestIdentity,
        'd'.repeat(64),
      );
    database
      .query(
        'INSERT INTO activation_review_attempt (request_identity, review_id, attempt, invocation_id) VALUES (?, ?, ?, ?)',
      )
      .run(evidence.request.requestIdentity, 'review.primary', 1, 'invocation.next');
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'requires completed cold audit',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('authenticated check and audit receipts join only after all frozen obligations complete', async () => {
  const evidence = await evidenceHarness();
  try {
    const check = evidence.receipt('check');
    const informed = evidence.receipt('audit');
    expect((await submitReceipt(evidence.controller, evidence.lease, check)).stage).toBe(
      'evaluating',
    );
    expect((await submitReceipt(evidence.controller, evidence.lease, informed)).stage).toBe(
      'verified',
    );
    expect(
      evidence.controller.listObligations(evidence.request.requestIdentity).map(({ kind }) => kind),
    ).toEqual(['check', 'audit', 'audit']);
  } finally {
    evidence.controller.close();
  }
});

test('opposite and concurrent receipt completion orders select the same evidence set', async () => {
  const identities: string[] = [];
  for (const order of ['check-first', 'audit-first', 'concurrent'] as const) {
    const evidence = await evidenceHarness();
    try {
      const check = evidence.receipt('check');
      const audit = evidence.receipt('audit');
      if (order === 'concurrent') {
        const settled = await Promise.all([
          submitReceipt(evidence.controller, evidence.lease, check),
          submitReceipt(evidence.controller, evidence.lease, audit),
        ]);
        expect(settled.filter(({ stage }) => stage === 'verified')).toHaveLength(1);
      } else {
        const first = order === 'check-first' ? check : audit;
        const second = order === 'check-first' ? audit : check;
        expect((await submitReceipt(evidence.controller, evidence.lease, first)).stage).toBe(
          'evaluating',
        );
        expect((await submitReceipt(evidence.controller, evidence.lease, second)).stage).toBe(
          'verified',
        );
      }
      const verified = evidence.controller.readRequest(evidence.request.requestIdentity);
      expect(verified?.stage).toBe('verified');
      expect(verified?.evidenceSetIdentity).toMatch(/^[0-9a-f]{64}$/);
      expect(verified?.evidenceSetIdentity).toBe(
        hashCanonical([
          { obligationIdentity: 'a'.repeat(64), receiptIdentity: hashBytes(check) },
          { obligationIdentity: 'd'.repeat(64), receiptIdentity: hashBytes(evidence.cold) },
          { obligationIdentity: 'f'.repeat(64), receiptIdentity: hashBytes(audit) },
        ]),
      );
      if (verified?.evidenceSetIdentity === undefined || verified.evidenceSetIdentity === null) {
        throw new Error('verified request missing evidence set');
      }
      identities.push(verified.evidenceSetIdentity);
    } finally {
      evidence.controller.close();
    }
  }
  expect(new Set(identities).size).toBe(1);
});

test('authenticated receipt replay is idempotent and conflicting bytes cannot replace an attempt', async () => {
  const evidence = await evidenceHarness();
  try {
    const check = evidence.receipt('check');
    const first = await submitReceipt(evidence.controller, evidence.lease, check);
    expect((await submitReceipt(evidence.controller, evidence.lease, check)).version).toBe(
      first.version,
    );
    const conflict = serializeCanonical({ receipt: 'conflicting same attempt' });
    const prior = evidence.authenticated.get(check);
    if (prior === undefined || typeof prior !== 'object') throw new Error('fake receipt absent');
    evidence.authenticated.set(conflict, { ...prior, receiptIdentity: hashBytes(conflict) });
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, conflict),
      'immutable evidence',
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(first);
    const audit = evidence.receipt('audit');
    const verified = await submitReceipt(evidence.controller, evidence.lease, audit);
    expect((await submitReceipt(evidence.controller, evidence.lease, check)).version).toBe(
      verified.version,
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)?.stage).toBe(
      'verified',
    );
  } finally {
    evidence.controller.close();
  }
});

test.each(['failed', 'skipped'] as const)(
  '%s authenticated required evidence cannot be overwritten',
  async (status) => {
    const evidence = await evidenceHarness();
    try {
      const failed = evidence.receipt('check', status);
      const terminal = await submitReceipt(evidence.controller, evidence.lease, failed);
      expect(terminal.stage).toBe('failed');
      const later = evidence.receipt('check', 'passed');
      await rejectedWith(
        submitReceipt(evidence.controller, evidence.lease, later),
        'immutable evidence',
      );
      expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(terminal);
      expect((await submitReceipt(evidence.controller, evidence.lease, failed)).version).toBe(
        terminal.version,
      );
    } finally {
      evidence.controller.close();
    }
  },
);

test.each([
  ['request', 'requestIdentity', 'f'.repeat(64), 'request'],
  ['obligation', 'obligationIdentity', 'f'.repeat(64), 'obligation'],
  ['executor', 'executorId', 'worker.other', 'frozen obligation'],
  ['protocol', 'protocolIdentity', 'f'.repeat(64), 'frozen obligation'],
  ['command', 'commandIdentity', 'f'.repeat(64), 'frozen obligation'],
  ['issuer', 'issuerId', 'journal.other', 'pinned journal'],
  ['digest', 'receiptIdentity', 'f'.repeat(64), 'digest'],
  ['attempt', 'attempt', 1, 'reserved attempt'],
] as const)(
  'authenticated %s binding rejects a foreign receipt without state changes',
  async (_name, field, wrong, message) => {
    const evidence = await evidenceHarness();
    try {
      const check = evidence.receipt('check');
      const prior = evidence.authenticated.get(check);
      if (prior === undefined || prior === null || typeof prior !== 'object')
        throw new Error('fake receipt absent');
      evidence.authenticated.set(check, { ...prior, [field]: wrong });
      const before = evidence.controller.readRequest(evidence.request.requestIdentity);
      await rejectedWith(submitReceipt(evidence.controller, evidence.lease, check), message);
      expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(before);
      expect(
        evidence.controller
          .listObligations(evidence.request.requestIdentity)
          .map(({ kind }) => kind),
      ).toEqual(['check', 'audit', 'audit']);
    } finally {
      evidence.controller.close();
    }
  },
);

test('authenticated kind and audit phase must match the frozen obligation', async () => {
  const evidence = await evidenceHarness();
  try {
    const check = evidence.receipt('check');
    const checkPrior = evidence.authenticated.get(check);
    if (checkPrior === undefined || checkPrior === null || typeof checkPrior !== 'object')
      throw new Error('fake check absent');
    const other = Object.fromEntries(
      Object.entries(checkPrior).filter(([key]) => key !== 'commandIdentity'),
    );
    evidence.authenticated.set(check, {
      ...other,
      kind: 'audit',
      phase: 'cold',
      reviewId: 'review.primary',
      invocationId: 'invocation.primary',
    });
    await rejectedWith(submitReceipt(evidence.controller, evidence.lease, check), 'kind differs');
    const audit = evidence.receipt('audit');
    const auditPrior = evidence.authenticated.get(audit);
    if (auditPrior === undefined || auditPrior === null || typeof auditPrior !== 'object')
      throw new Error('fake audit absent');
    evidence.authenticated.set(audit, { ...auditPrior, phase: 'cold' });
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, audit),
      'review verification differs from frozen invocation',
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)?.stage).toBe(
      'evaluating',
    );
  } finally {
    evidence.controller.close();
  }
});

test('a held verifier cannot commit evidence after its request is superseded', async () => {
  let release: ((receipt: unknown) => void) | undefined;
  const held = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const evidence = await evidenceHarness({ authenticate: () => held });
  try {
    const check = evidence.receipt('check');
    const authentication = evidence.authenticated.get(check);
    const pending = submitReceipt(evidence.controller, evidence.lease, check);
    const successor = evidence.controller.observe({
      ...evidence.source.candidate,
      headSha: '6'.repeat(40),
    });
    if (release === undefined) throw new Error('receipt verifier did not start');
    release(authentication);
    await rejectedWith(pending, 'superseded');
    expect(evidence.controller.readRequest(successor.requestIdentity)?.stage).toBe('observed');
    expect(
      evidence.controller.listObligations(evidence.request.requestIdentity).map(({ kind }) => kind),
    ).toEqual(['check', 'audit', 'audit']);
  } finally {
    evidence.controller.close();
  }
});

test('an unrelated completion cannot invalidate a held authenticated receipt', async () => {
  let release: ((receipt: unknown) => void) | undefined;
  const held = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const evidence = await evidenceHarness({
    authenticate: (bytes, receipt) =>
      bytes.includes('"kind":"check"') ? held : Promise.resolve(receipt),
  });
  const second = openActivationController({
    ...evidence.source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: evidence.source.candidate }),
    authenticateCheck: (bytes: string) => Promise.resolve(evidence.authenticated.get(bytes)),
    verifyReview: ({ exactSubmissionBytes, expected }) =>
      Promise.resolve(fakeReview(expected, exactSubmissionBytes)),
  });
  try {
    const check = evidence.receipt('check');
    const audit = evidence.receipt('audit');
    const authentication = evidence.authenticated.get(check);
    const pending = submitReceipt(evidence.controller, evidence.lease, check);
    expect((await submitReceipt(second, evidence.lease, audit)).stage).toBe('evaluating');
    if (release === undefined) throw new Error('check verification was not held');
    release(authentication);
    expect((await pending).stage).toBe('verified');
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)?.stage).toBe(
      'verified',
    );
  } finally {
    second.close();
    evidence.controller.close();
  }
});

test('held verification is fenced by durable lease epoch and own attempt changes', async () => {
  for (const fault of ['lease', 'attempt'] as const) {
    let now = 1000;
    let release: ((receipt: unknown) => void) | undefined;
    const held = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const evidence = await evidenceHarness({ clock: () => now, authenticate: () => held });
    const database = new Database(evidence.source.databasePath);
    try {
      const check = evidence.receipt('check');
      const authentication = evidence.authenticated.get(check);
      const pending = submitReceipt(evidence.controller, evidence.lease, check);
      if (fault === 'lease') {
        now = 1100;
        // The later recovery owner is not implemented yet; stage only its durable epoch transition.
        database
          .query(
            'UPDATE activation_request SET lease_epoch = lease_epoch + 1, lease_expires_at = 1200, version = version + 1 WHERE request_identity = ?',
          )
          .run(evidence.request.requestIdentity);
      } else {
        database
          .query(
            'UPDATE activation_obligation SET attempt = 1 WHERE request_identity = ? AND obligation_identity = ?',
          )
          .run(evidence.request.requestIdentity, 'a'.repeat(64));
      }
      if (release === undefined) throw new Error('receipt verification was not held');
      release(authentication);
      await rejectedWith(pending, fault === 'lease' ? 'lease changed' : 'reserved attempt');
      expect(
        database
          .query('SELECT obligation_identity FROM activation_attempt ORDER BY obligation_identity')
          .all(),
      ).toEqual([{ obligation_identity: 'd'.repeat(64) }]);
      expect(evidence.controller.readRequest(evidence.request.requestIdentity)?.stage).toBe(
        'evaluating',
      );
    } finally {
      database.close();
      evidence.controller.close();
    }
  }
});

test('receipt recording refuses absent verifier without changing durable evaluation', async () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    const before = evidenceRows(source.databasePath);
    await rejectedWith(
      submitReceipt(controller, lease, serializeCanonical({ receipt: 'check' })),
      'verifier absent',
    );
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('receipt recording refuses absent bytes before invoking authentication', async () => {
  const evidence = await evidenceHarness();
  try {
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, ''),
      'receipt bytes absent',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('expired receipt lease and missing trusted pin refuse before evidence insertion', async () => {
  for (const fault of ['expiry', 'bootstrap'] as const) {
    let now = 1000;
    const evidence = await evidenceHarness({ clock: () => now });
    try {
      const check = evidence.receipt('check');
      if (fault === 'expiry') now = 1100;
      else rmSync(evidence.source.bootstrapPath);
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        submitReceipt(evidence.controller, evidence.lease, check),
        fault === 'expiry' ? 'lease changed' : 'bootstrap configuration absent',
      );
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      evidence.controller.close();
    }
  }
});

test('receipt owner and null-expiry fences refuse without evidence writes', async () => {
  for (const fault of ['owner', 'null-expiry'] as const) {
    const evidence = await evidenceHarness();
    const database = new Database(evidence.source.databasePath);
    try {
      const check = evidence.receipt('check');
      const lease =
        fault === 'owner' ? { ...evidence.lease, workerId: 'worker.other' } : evidence.lease;
      if (fault === 'null-expiry') {
        database
          .query('UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?')
          .run(evidence.request.requestIdentity);
      }
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(submitReceipt(evidence.controller, lease, check), 'lease changed');
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      evidence.controller.close();
    }
  }
});

test('receipt generation guard refuses inconsistent durable subject history', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    database
      .query(
        'UPDATE activation_subject SET high_water_generation = high_water_generation + 1 WHERE repository_id = ?',
      )
      .run(evidence.request.repositoryId);
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, check),
      'generation changed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a missing frozen obligation even when remaining evidence passes', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    database
      .query(
        'DELETE FROM activation_obligation WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(evidence.request.requestIdentity, 'd'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, check),
      'frozen evaluation plan',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a selected obligation whose immutable attempt is missing', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check'));
    database
      .query(
        'DELETE FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'selected receipt evidence',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a selected obligation whose retained authentication bytes conflict', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    await submitReceipt(evidence.controller, evidence.lease, check);
    database
      .query(
        'UPDATE activation_attempt SET authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(
        serializeCanonical({
          receiptIdentity: hashBytes(check),
          issuerId: evidence.source.pin.journalIssuerId,
          requestIdentity: evidence.request.requestIdentity,
          obligationIdentity: 'a'.repeat(64),
          kind: 'check',
          attempt: 0,
          executorId: 'wrong.executor',
          protocolIdentity: 'b'.repeat(64),
          commandIdentity: 'c'.repeat(64),
          status: 'passed',
        }),
        evidence.request.requestIdentity,
        'a'.repeat(64),
      );
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'selected receipt evidence differs',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses malformed retained authentication bytes', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check'));
    database
      .query(
        'UPDATE activation_attempt SET authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(serializeCanonical({ forged: true }), evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'selected receipt evidence malformed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test.each([
  ['reviewId', 'review.foreign'],
  ['invocationId', 'invocation.foreign'],
] as const)('receipt join refuses retained cold evidence with foreign %s', async (field, wrong) => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const raw: unknown = database
      .query(
        'SELECT authentication_bytes FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ?',
      )
      .get(evidence.request.requestIdentity, 'd'.repeat(64));
    if (raw === null || typeof raw !== 'object' || !('authentication_bytes' in raw)) {
      throw new Error('retained cold authentication absent');
    }
    const authentication = JSON.parse(String(raw.authentication_bytes)) as {
      receipt: Record<string, unknown>;
      review: unknown;
    };
    database
      .query(
        'UPDATE activation_attempt SET authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(
        serializeCanonical({
          ...authentication,
          receipt: { ...authentication.receipt, [field]: wrong },
        }),
        evidence.request.requestIdentity,
        'd'.repeat(64),
      );
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'committed cold source differs from selected review',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a selected cold whose review registration disappeared', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    database
      .query('DELETE FROM activation_review_attempt WHERE request_identity = ? AND review_id = ?')
      .run(evidence.request.requestIdentity, 'review.primary');
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check')),
      'selected review invocation absent',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a check row carrying an audit phase', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    database
      .query(
        'UPDATE activation_obligation SET phase = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run('cold', evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check')),
      'stored check obligation malformed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses an audit row carrying a check command', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    database
      .query(
        'UPDATE activation_obligation SET command_identity = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run('c'.repeat(64), evidence.request.requestIdentity, 'd'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'stored audit obligation malformed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt owner refuses a nonpending obligation with no selected attempt', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    database
      .query(
        "UPDATE activation_obligation SET state = 'passed' WHERE request_identity = ? AND obligation_identity = ?",
      )
      .run(evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, check),
      'already completed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test.each([2, 3] as const)(
  'version-%i unpaired review history remains readable but cannot resume evidence',
  async (legacyVersion) => {
    const source = fixture();
    const first = boundaryController(source, () => 1000);
    const request = first.observe(source.candidate);
    const lease = first.claim(request.requestIdentity, 'worker.first', 100);
    first.beginEvaluation(lease);
    first.close();
    const database = new Database(source.databasePath);
    try {
      database.run('DROP TABLE activation_review_dispatch_fact');
      database.run('DROP TABLE activation_review_dispatch_progress');
      database.run('DROP TABLE activation_review_dispatch');
      database.run('DROP TABLE activation_review_attempt');
      if (legacyVersion === 2) {
        database.run('DROP TABLE activation_attempt');
        database.run('ALTER TABLE activation_request DROP COLUMN evidence_set_identity');
      }
      database.run('ALTER TABLE activation_request DROP COLUMN pairing_version');
      database.run('ALTER TABLE activation_obligation DROP COLUMN review_id');
      database.run(legacyVersion === 2 ? 'PRAGMA user_version = 2' : 'PRAGMA user_version = 3');
    } finally {
      database.close();
    }
    const authenticated = new Map<string, unknown>();
    const second = openActivationController({
      ...source,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () =>
        Promise.resolve({ kind: 'ready' as const, candidate: source.candidate }),
      authenticateCheck: (bytes: string) => Promise.resolve(authenticated.get(bytes)),
    });
    try {
      const check = serializeCanonical({ receipt: 'migrated-check' });
      authenticated.set(check, {
        receiptIdentity: hashBytes(check),
        issuerId: source.pin.journalIssuerId,
        requestIdentity: request.requestIdentity,
        obligationIdentity: 'a'.repeat(64),
        kind: 'check',
        attempt: 0,
        executorId: 'worker.check',
        protocolIdentity: 'b'.repeat(64),
        commandIdentity: 'c'.repeat(64),
        status: 'passed',
      });
      const before = evidenceRows(source.databasePath);
      await rejectedWith(submitReceipt(second, lease, check), 'legacy review pairing absent');
      expect(evidenceRows(source.databasePath)).toEqual(before);
      expect(second.readRequest(request.requestIdentity)?.request.requestIdentity).toBe(
        request.requestIdentity,
      );
    } finally {
      second.close();
    }
  },
);

test.each([2, 3] as const)(
  'late version-%i pairing migration failure leaves the entire legacy schema and rows unchanged',
  (legacyVersion) => {
    const source = fixture();
    const first = boundaryController(source, () => 1000);
    const request = first.observe(source.candidate);
    first.close();
    const database = new Database(source.databasePath);
    try {
      database.run('ALTER TABLE activation_request DROP COLUMN pairing_version');
      database.run('ALTER TABLE activation_obligation DROP COLUMN review_id');
      if (legacyVersion === 2) {
        database.run('DROP TABLE activation_attempt');
        database.run('ALTER TABLE activation_request DROP COLUMN evidence_set_identity');
      }
      database.run(legacyVersion === 2 ? 'PRAGMA user_version = 2' : 'PRAGMA user_version = 3');
      const before = {
        version: database.query('PRAGMA user_version').get(),
        schema: database
          .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
          .all(),
        requests: database.query('SELECT * FROM activation_request').all(),
      };
      expect(() => boundaryController(source, () => 1000)).toThrow(
        'activation_review_attempt already exists',
      );
      expect({
        version: database.query('PRAGMA user_version').get(),
        schema: database
          .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
          .all(),
        requests: database.query('SELECT * FROM activation_request').all(),
      }).toEqual(before);
      expect(request.requestIdentity).toBeDefined();
    } finally {
      database.close();
    }
  },
);

test.each(['claim', 'evaluation'] as const)(
  'legacy unpaired request refuses %s before acquiring new authority',
  (operation) => {
    const source = fixture();
    const controller = boundaryController(source, () => 1000);
    const database = new Database(source.databasePath);
    try {
      const request = controller.observe(source.candidate);
      const lease =
        operation === 'evaluation'
          ? controller.claim(request.requestIdentity, 'worker.first', 100)
          : undefined;
      database
        .query('UPDATE activation_request SET pairing_version = 0 WHERE request_identity = ?')
        .run(request.requestIdentity);
      const before = evidenceRows(source.databasePath);
      if (operation === 'claim') {
        expect(() => controller.claim(request.requestIdentity, 'worker.first', 100)).toThrow(
          'legacy review pairing absent',
        );
      } else {
        if (lease === undefined) throw new Error('evaluating fixture lease absent');
        expect(() => controller.beginEvaluation(lease)).toThrow('legacy review pairing absent');
      }
      expect(evidenceRows(source.databasePath)).toEqual(before);
    } finally {
      database.close();
      controller.close();
    }
  },
);

test('authoritative same-tuple observation replans legacy review history to a new generation', () => {
  const source = fixture();
  const controller = boundaryController(source, () => 1000);
  const database = new Database(source.databasePath);
  try {
    const prior = controller.observe(source.candidate);
    database
      .query('UPDATE activation_request SET pairing_version = 0 WHERE request_identity = ?')
      .run(prior.requestIdentity);
    const next = controller.observe(source.candidate);
    expect(next.requestIdentity).not.toBe(prior.requestIdentity);
    expect(next.auditGeneration).toBe(prior.auditGeneration + 1);
    expect(controller.readRequest(prior.requestIdentity)?.current).toBe(false);
    expect(controller.readRequest(next.requestIdentity)?.current).toBe(true);
    expect(
      database
        .query('SELECT pairing_version FROM activation_request WHERE request_identity = ?')
        .get(prior.requestIdentity),
    ).toEqual({ pairing_version: 0 });
  } finally {
    database.close();
    controller.close();
  }
});

test('receipt owner refuses a different valid bootstrap authority on the same durable request', async () => {
  const evidence = await evidenceHarness();
  evidence.controller.close();
  const alternatePath = join(
    evidence.source.bootstrapPath,
    '..',
    'receipt-alternate-bootstrap.json',
  );
  const alternateBytes = readFileSync(evidence.source.bootstrapPath, 'utf8').replace(
    'review.provider',
    'review.alternate',
  );
  writeFileSync(alternatePath, alternateBytes);
  const second = openActivationController({
    ...evidence.source,
    bootstrapPath: alternatePath,
    pin: { ...evidence.source.pin, identity: hashBytes(alternateBytes) },
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: evidence.source.candidate }),
    authenticateCheck: (bytes: string) => Promise.resolve(evidence.authenticated.get(bytes)),
  });
  try {
    const check = evidence.receipt('check');
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(submitReceipt(second, evidence.lease, check), 'authority changed');
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    second.close();
  }
});

test('terminal failed evidence refuses another obligation before evidence insertion', async () => {
  const evidence = await evidenceHarness();
  try {
    await submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check', 'failed'));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'not evaluating',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    evidence.controller.close();
  }
});

test('informed audit evidence waits for the selected cold audit while checks remain independent', async () => {
  const source = fixture();
  const authenticated = new Map<string, unknown>();
  const controller = openActivationController({
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: source.candidate }),
    authenticateCheck: (bytes: string) => Promise.resolve(authenticated.get(bytes)),
    verifyReview: ({ exactSubmissionBytes, expected }) =>
      Promise.resolve(fakeReview(expected, exactSubmissionBytes)),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    controller.registerReviewAttempt(lease, 'review.primary', 0, 'invocation.primary');
    function register(kind: 'check' | 'audit', phase: 'cold' | 'informed' = 'cold') {
      const bytes = serializeCanonical({ kind, phase });
      authenticated.set(
        bytes,
        kind === 'check'
          ? {
              receiptIdentity: hashBytes(bytes),
              issuerId: source.pin.journalIssuerId,
              requestIdentity: request.requestIdentity,
              obligationIdentity: 'a'.repeat(64),
              kind,
              attempt: 0,
              executorId: 'worker.check',
              protocolIdentity: 'b'.repeat(64),
              commandIdentity: 'c'.repeat(64),
              status: 'passed',
            }
          : {
              receiptIdentity: hashBytes(bytes),
              issuerId: source.pin.journalIssuerId,
              requestIdentity: request.requestIdentity,
              obligationIdentity: phase === 'cold' ? 'd'.repeat(64) : 'f'.repeat(64),
              kind,
              attempt: 0,
              executorId: 'review.executor',
              protocolIdentity: 'e'.repeat(64),
              phase,
              reviewId: 'review.primary',
              invocationId: 'invocation.primary',
              status: 'passed',
            },
      );
      return bytes;
    }
    const informed = register('audit', 'informed');
    const before = evidenceRows(source.databasePath);
    await rejectedWith(submitReceipt(controller, lease, informed), 'requires completed cold audit');
    expect(evidenceRows(source.databasePath)).toEqual(before);
    await submitReceipt(controller, lease, register('check'));
    expect((await submitReceipt(controller, lease, register('audit', 'cold'))).stage).toBe(
      'evaluating',
    );
    expect((await submitReceipt(controller, lease, informed)).stage).toBe('verified');
  } finally {
    controller.close();
  }
});

test('second receipt commit failure restores its attempt but retains earlier authenticated evidence', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    await submitReceipt(evidence.controller, evidence.lease, check);
    const before = evidence.controller.readRequest(evidence.request.requestIdentity);
    const beforeRows = evidenceRows(evidence.source.databasePath);
    database.run(`CREATE TRIGGER fail_verified_activation BEFORE UPDATE OF stage ON activation_request
      WHEN NEW.stage = 'verified' BEGIN SELECT RAISE(ABORT, 'injected verified write'); END`);
    const audit = evidence.receipt('audit');
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, audit),
      'injected verified write',
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(before);
    expect(evidenceRows(evidence.source.databasePath)).toEqual(beforeRows);
    const attempts: unknown[] = database
      .query('SELECT * FROM activation_attempt ORDER BY obligation_identity')
      .all();
    expect(attempts).toHaveLength(2);
    database.run('DROP TRIGGER fail_verified_activation');
    expect((await submitReceipt(evidence.controller, evidence.lease, audit)).stage).toBe(
      'verified',
    );
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('ignored verified update refuses and rolls back the second receipt', async () => {
  const evidence = await evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await submitReceipt(evidence.controller, evidence.lease, evidence.receipt('check'));
    const before = evidenceRows(evidence.source.databasePath);
    database.run(`CREATE TRIGGER ignore_verified_activation BEFORE UPDATE OF stage ON activation_request
      WHEN NEW.stage = 'verified' BEGIN SELECT RAISE(IGNORE); END`);
    await rejectedWith(
      submitReceipt(evidence.controller, evidence.lease, evidence.receipt('audit')),
      'activation request version changed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('evaluation refuses another request policy or incomplete obligation set without partial writes', () => {
  const cases = [
    'wrong-request',
    'wrong-policy',
    'missing-check',
    'missing-audit',
    'duplicate-identity',
  ] as const;
  for (const fault of cases) {
    const fixtureData = fixture();
    const controller = openActivationController({
      ...fixtureData,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
      selectObligations: (request) => {
        const plan = fixtureData.selectObligations(request);
        if (fault === 'wrong-request') return { ...plan, requestIdentity: 'f'.repeat(64) };
        if (fault === 'wrong-policy') return { ...plan, policyIdentity: 'f'.repeat(64) };
        if (fault === 'missing-check')
          return { ...plan, obligations: plan.obligations.filter(({ kind }) => kind !== 'check') };
        if (fault === 'missing-audit')
          return { ...plan, obligations: plan.obligations.filter(({ kind }) => kind !== 'audit') };
        return {
          ...plan,
          obligations: plan.obligations.map((obligation) => ({
            ...obligation,
            identity: 'a'.repeat(64),
          })),
        };
      },
    });
    try {
      const request = controller.observe(fixtureData.candidate);
      const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
      expect(() => controller.beginEvaluation(lease)).toThrow(
        fault === 'wrong-request' || fault === 'wrong-policy'
          ? 'evaluation obligations differ from request policy'
          : 'evaluation obligations incomplete or duplicated',
      );
      expect(controller.readRequest(request.requestIdentity)?.stage).toBe('observed');
      expect(controller.listObligations(request.requestIdentity)).toEqual([]);
    } finally {
      controller.close();
    }
  }
});

test('second obligation insertion failure restores stage and the first obligation', () => {
  const fixtureData = fixture();
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
  });
  try {
    const request = controller.observe(fixtureData.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    const database = new Database(fixtureData.databasePath);
    database.run(`CREATE TRIGGER reject_second_obligation BEFORE INSERT ON activation_obligation
      WHEN NEW.obligation_identity = '${'d'.repeat(64)}'
      BEGIN SELECT RAISE(FAIL, 'injected second obligation'); END`);
    database.close();
    expect(() => controller.beginEvaluation(lease)).toThrow('injected second obligation');
    expect(controller.readRequest(request.requestIdentity)?.stage).toBe('observed');
    expect(controller.listObligations(request.requestIdentity)).toEqual([]);
  } finally {
    controller.close();
  }
});

test('controller ingress refuses missing bootstrap before durable request creation', () => {
  const subject = fixture();
  const controller = openActivationController({
    ...subject,
    bootstrapPath: join(tmpdir(), 'activation-controller-absent-config'),
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: subject.candidate }),
  });
  try {
    expect(() => controller.observe(subject.candidate)).toThrow('bootstrap configuration absent');
    expect(controller.listRequests()).toEqual([]);
  } finally {
    controller.close();
  }
});

test('webhook and polling converge while conflicting delivery reuse is refused', async () => {
  const subject = fixture();
  let current = subject.candidate;
  const controller = openActivationController({
    ...subject,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([current]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: current }),
  });
  const delivery = {
    sourceId: 'github.installation.1',
    deliveryId: 'delivery.1',
    payloadDigest: 'a'.repeat(64),
    repositoryId: subject.candidate.repositoryId,
    subject: subject.candidate.subject,
  };
  try {
    const webhook = await controller.observeDelivery(delivery);
    if (webhook === undefined) throw new Error('ready delivery did not create a request');
    const polled = await controller.reconcileReady();
    expect(polled[0]?.requestIdentity).toBe(webhook.requestIdentity);
    expect((await controller.observeDelivery(delivery))?.requestIdentity).toBe(
      webhook.requestIdentity,
    );
    expect(controller.listRequests()).toHaveLength(1);
    let conflictRefused = false;
    try {
      await controller.observeDelivery({ ...delivery, payloadDigest: 'b'.repeat(64) });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toContain('delivery ID reused with different payload');
      }
      conflictRefused = true;
    }
    expect(conflictRefused).toBe(true);
    expect(controller.listRequests()).toHaveLength(1);
    current = { ...current, headSha: '6'.repeat(40) };
    const latest = await controller.observeDelivery({
      ...delivery,
      deliveryId: 'delivery.delayed',
      payloadDigest: 'c'.repeat(64),
    });
    expect(latest?.headSha).toBe(current.headSha);
  } finally {
    controller.close();
  }
});

test('older source response refetches after another owner advances the subject', async () => {
  const fixtureData = fixture();
  const newer = { ...fixtureData.candidate, headSha: '6'.repeat(40) };
  let releaseOld:
    ((candidate: { kind: 'ready'; candidate: ObservedCandidate }) => void) | undefined;
  let reads = 0;
  const oldRead = new Promise<{ kind: 'ready'; candidate: ObservedCandidate }>((resolve) => {
    releaseOld = resolve;
  });
  const options = {
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
  };
  const first = openActivationController({
    ...options,
    currentCandidate: () => {
      reads += 1;
      return reads === 1 ? oldRead : Promise.resolve({ kind: 'ready' as const, candidate: newer });
    },
  });
  const second = openActivationController({
    ...options,
    currentCandidate: () => Promise.resolve({ kind: 'ready' as const, candidate: newer }),
  });
  try {
    first.observe(fixtureData.candidate);
    const pending = first.observeDelivery({
      sourceId: 'github.installation.1',
      deliveryId: 'delivery.delayed',
      payloadDigest: 'a'.repeat(64),
      repositoryId: fixtureData.candidate.repositoryId,
      subject: fixtureData.candidate.subject,
    });
    const advanced = second.observe(newer);
    if (releaseOld === undefined) throw new Error('source read was not started');
    releaseOld({ kind: 'ready', candidate: fixtureData.candidate });
    const accepted = await pending;
    expect(accepted?.requestIdentity).toBe(advanced.requestIdentity);
    expect(reads).toBe(2);
    expect(first.listRequests()).toHaveLength(2);
  } finally {
    first.close();
    second.close();
  }
});

test('unchanged authoritative ready observation fences an older changed-head response', async () => {
  const fixtureData = fixture();
  const older = { ...fixtureData.candidate, headSha: '6'.repeat(40) };
  let releaseOlder: ((answer: { kind: 'ready'; candidate: ObservedCandidate }) => void) | undefined;
  let reads = 0;
  const heldOlder = new Promise<{ kind: 'ready'; candidate: ObservedCandidate }>((resolve) => {
    releaseOlder = resolve;
  });
  const options = {
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
  };
  const first = openActivationController({
    ...options,
    currentCandidate: () => {
      reads += 1;
      return reads === 1
        ? heldOlder
        : Promise.resolve({ kind: 'ready' as const, candidate: fixtureData.candidate });
    },
  });
  const second = openActivationController({
    ...options,
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: fixtureData.candidate }),
  });
  try {
    const current = first.observe(fixtureData.candidate);
    const pending = first.observeDelivery({
      sourceId: 'github.installation.1',
      deliveryId: 'delivery.older-head',
      payloadDigest: 'a'.repeat(64),
      repositoryId: fixtureData.candidate.repositoryId,
      subject: fixtureData.candidate.subject,
    });
    expect(
      (
        await second.observeDelivery({
          sourceId: 'github.installation.1',
          deliveryId: 'delivery.confirm-current',
          payloadDigest: 'b'.repeat(64),
          repositoryId: fixtureData.candidate.repositoryId,
          subject: fixtureData.candidate.subject,
        })
      )?.requestIdentity,
    ).toBe(current.requestIdentity);
    if (releaseOlder === undefined) throw new Error('older source read was not held');
    releaseOlder({ kind: 'ready', candidate: older });
    expect((await pending)?.requestIdentity).toBe(current.requestIdentity);
    expect(reads).toBe(2);
    expect(first.listRequests()).toHaveLength(1);
  } finally {
    first.close();
    second.close();
  }
});

test('repeated authoritative closed observation fences an older ready response', async () => {
  const fixtureData = fixture();
  let releaseReady: ((answer: { kind: 'ready'; candidate: ObservedCandidate }) => void) | undefined;
  let reads = 0;
  const heldReady = new Promise<{ kind: 'ready'; candidate: ObservedCandidate }>((resolve) => {
    releaseReady = resolve;
  });
  const options = {
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
  };
  const first = openActivationController({
    ...options,
    currentCandidate: () => {
      reads += 1;
      return reads === 1 ? heldReady : Promise.resolve({ kind: 'closed' as const });
    },
  });
  const second = openActivationController({
    ...options,
    currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
  });
  const delivery = {
    sourceId: 'github.installation.1',
    deliveryId: 'delivery.closed-replayed',
    payloadDigest: 'a'.repeat(64),
    repositoryId: fixtureData.candidate.repositoryId,
    subject: fixtureData.candidate.subject,
  };
  try {
    expect(await second.observeDelivery(delivery)).toBeUndefined();
    const pending = first.observeDelivery({
      ...delivery,
      deliveryId: 'delivery.older-ready',
      payloadDigest: 'b'.repeat(64),
    });
    expect(await second.observeDelivery(delivery)).toBeUndefined();
    if (releaseReady === undefined) throw new Error('older ready read was not held');
    releaseReady({ kind: 'ready', candidate: fixtureData.candidate });
    expect(await pending).toBeUndefined();
    expect(reads).toBe(2);
    expect(first.listRequests()).toEqual([]);
  } finally {
    first.close();
    second.close();
  }
});

test('timer poll reconciles a stale listed candidate against current source state', async () => {
  const fixtureData = fixture();
  const newer = { ...fixtureData.candidate, headSha: '6'.repeat(40) };
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([fixtureData.candidate]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: newer }),
  });
  try {
    const requests = await controller.reconcileReady();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headSha).toBe(newer.headSha);
    expect(controller.listRequests()).toHaveLength(1);
  } finally {
    controller.close();
  }
});

test('closed tombstone fences an older ready response even without an active request', async () => {
  const fixtureData = fixture();
  let releaseReady:
    ((candidate: { kind: 'ready'; candidate: ObservedCandidate }) => void) | undefined;
  let reads = 0;
  const heldReady = new Promise<{ kind: 'ready'; candidate: ObservedCandidate }>((resolve) => {
    releaseReady = resolve;
  });
  const options = {
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
  };
  const first = openActivationController({
    ...options,
    currentCandidate: () => {
      reads += 1;
      return reads === 1 ? heldReady : Promise.resolve({ kind: 'closed' as const });
    },
  });
  const second = openActivationController({
    ...options,
    currentCandidate: () => Promise.resolve({ kind: 'closed' as const }),
  });
  const delivery = {
    sourceId: 'github.installation.1',
    deliveryId: 'delivery.ready',
    payloadDigest: 'a'.repeat(64),
    repositoryId: fixtureData.candidate.repositoryId,
    subject: fixtureData.candidate.subject,
  };
  try {
    const pending = first.observeDelivery(delivery);
    expect(
      await second.observeDelivery({ ...delivery, deliveryId: 'delivery.closed' }),
    ).toBeUndefined();
    if (releaseReady === undefined) throw new Error('source read was not held');
    releaseReady({ kind: 'ready', candidate: fixtureData.candidate });
    expect(await pending).toBeUndefined();
    expect(reads).toBe(2);
    expect(first.listRequests()).toEqual([]);
  } finally {
    first.close();
    second.close();
  }
});

test('timer reconciles a lost close event for a previously active subject', async () => {
  const fixtureData = fixture();
  let closed = false;
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve(closed ? [] : [fixtureData.candidate]),
    currentCandidate: () =>
      Promise.resolve(
        closed
          ? { kind: 'closed' as const }
          : { kind: 'ready' as const, candidate: fixtureData.candidate },
      ),
  });
  try {
    const active = controller.observe(fixtureData.candidate);
    closed = true;
    expect(await controller.reconcileReady()).toEqual([]);
    expect(controller.readRequest(active.requestIdentity)?.current).toBe(false);
    expect(controller.readRequest(active.requestIdentity)?.stage).toBe('superseded');
  } finally {
    controller.close();
  }
});

test('returning candidate allocates a new audit generation and never revives its first worker', () => {
  const subject = fixture();
  const controller = openActivationController({
    ...subject,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: subject.candidate }),
  });
  try {
    const firstA = controller.observe(subject.candidate);
    const stale = controller.claim(firstA.requestIdentity, 'worker.first', 100);
    const b = controller.observe({ ...subject.candidate, headSha: '6'.repeat(40) });
    const secondA = controller.observe(subject.candidate);
    expect([firstA.auditGeneration, b.auditGeneration, secondA.auditGeneration]).toEqual([3, 4, 5]);
    expect(secondA.requestIdentity).not.toBe(firstA.requestIdentity);
    expect(controller.readRequest(firstA.requestIdentity)?.stage).toBe('superseded');
    expect(() => controller.beginEvaluation(stale)).toThrow('activation request superseded');
  } finally {
    controller.close();
  }
});

test('closing and reopening a subject preserves its audit-generation high water', async () => {
  const fixtureData = fixture();
  let closed = false;
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve(
        closed
          ? { kind: 'closed' as const }
          : { kind: 'ready' as const, candidate: fixtureData.candidate },
      ),
  });
  try {
    const first = controller.observe(fixtureData.candidate);
    const stale = controller.claim(first.requestIdentity, 'worker.first', 100);
    closed = true;
    await controller.observeDelivery({
      sourceId: 'github.installation.1',
      deliveryId: 'delivery.close',
      payloadDigest: 'a'.repeat(64),
      repositoryId: fixtureData.candidate.repositoryId,
      subject: fixtureData.candidate.subject,
    });
    const reopened = controller.observe(fixtureData.candidate);
    expect(reopened.auditGeneration).toBe(first.auditGeneration + 1);
    expect(reopened.requestIdentity).not.toBe(first.requestIdentity);
    expect(() => controller.beginEvaluation(stale)).toThrow('activation request superseded');
  } finally {
    controller.close();
  }
});

test('subject generation survives controller restart after a closed delivery', async () => {
  const fixtureData = fixture();
  let closed = false;
  const options = {
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve(
        closed
          ? { kind: 'closed' as const }
          : { kind: 'ready' as const, candidate: fixtureData.candidate },
      ),
  };
  const firstController = openActivationController(options);
  const original = firstController.observe(fixtureData.candidate);
  closed = true;
  await firstController.observeDelivery({
    sourceId: 'github.installation.1',
    deliveryId: 'delivery.close',
    payloadDigest: 'a'.repeat(64),
    repositoryId: fixtureData.candidate.repositoryId,
    subject: fixtureData.candidate.subject,
  });
  firstController.close();
  closed = false;
  const restarted = openActivationController(options);
  try {
    const next = restarted.observe(fixtureData.candidate);
    expect(next.auditGeneration).toBe(original.auditGeneration + 1);
    expect(next.requestIdentity).not.toBe(original.requestIdentity);
    expect(restarted.readRequest(original.requestIdentity)?.current).toBe(false);
  } finally {
    restarted.close();
  }
});

test('missing trusted subject generation refuses duplicate request reuse', () => {
  const fixtureData = fixture();
  const controller = openActivationController({
    ...fixtureData,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
  });
  try {
    const first = controller.observe(fixtureData.candidate);
    const database = new Database(fixtureData.databasePath);
    database.run('DELETE FROM activation_subject');
    database.close();
    expect(() => controller.observe(fixtureData.candidate)).toThrow(
      'activation subject generation absent',
    );
    expect(controller.readRequest(first.requestIdentity)?.current).toBe(true);
  } finally {
    controller.close();
  }
});

test('old unversioned request storage cannot acquire default subject authority', () => {
  const subject = fixture();
  const database = new Database(subject.databasePath, { create: true });
  database.run('CREATE TABLE activation_request (request_identity TEXT PRIMARY KEY)');
  database.close();
  expect(() =>
    openActivationController({
      ...subject,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: subject.candidate }),
    }),
  ).toThrow('unversioned activation request store cannot be defaulted');
});

test('old controller schema without subject high-water cannot be reopened implicitly', () => {
  const fixtureData = fixture();
  const database = new Database(fixtureData.databasePath, { create: true });
  database.run('PRAGMA user_version = 1');
  database.close();
  expect(() =>
    openActivationController({
      ...fixtureData,
      clock: () => 1000,
      readyCandidates: () => Promise.resolve([]),
      currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
    }),
  ).toThrow('unsupported activation store schema 1');
});

test('delayed delivery cannot choose another subject or revive an old merge-group composition', async () => {
  const subject = fixture();
  const members = [
    { repositoryId: 8241, pullRequestNumber: 282, headSha: '1'.repeat(40) },
    { repositoryId: 8241, pullRequestNumber: 283, headSha: '6'.repeat(40) },
  ];
  const group: ObservedCandidate = {
    ...subject.candidate,
    subject: {
      kind: 'merge-group',
      groupRef: 'refs/heads/gh-readonly-queue/main/group-1',
      members,
    },
  };
  let current: ObservedCandidate = group;
  const controller = openActivationController({
    ...subject,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([current]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: current }),
  });
  const delivery = {
    sourceId: 'github.installation.1',
    deliveryId: 'delivery.group',
    payloadDigest: 'a'.repeat(64),
    repositoryId: 8241,
    subject: group.subject,
  };
  try {
    const first = await controller.observeDelivery(delivery);
    current = {
      ...group,
      subject: {
        kind: 'merge-group',
        groupRef: 'refs/heads/gh-readonly-queue/main/group-1',
        members: [...members].reverse(),
      },
    };
    const currentRequest = await controller.observeDelivery({
      ...delivery,
      deliveryId: 'delivery.changed',
      payloadDigest: 'b'.repeat(64),
    });
    expect(currentRequest?.requestIdentity).not.toBe(first?.requestIdentity);
    expect((await controller.observeDelivery(delivery))?.requestIdentity).toBe(
      currentRequest?.requestIdentity,
    );
    current = { ...subject.candidate, subject: { kind: 'pull-request', number: 283 } };
    let wrongSubjectRefused = false;
    try {
      await controller.observeDelivery({ ...delivery, deliveryId: 'delivery.wrong' });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error)
        expect(error.message).toContain('authoritative candidate differs');
      wrongSubjectRefused = true;
    }
    expect(wrongSubjectRefused).toBe(true);
    expect(controller.readRequest(currentRequest?.requestIdentity ?? '')?.current).toBe(true);
  } finally {
    controller.close();
  }
});

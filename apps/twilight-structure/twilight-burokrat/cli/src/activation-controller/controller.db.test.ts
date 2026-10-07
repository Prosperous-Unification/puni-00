import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { readCheckInvocationManifest, storeCheckInvocationManifest } from './check-manifest';
import {
  type ActivationController,
  type ActivationControllerOptions,
  type CheckDispatchObservation,
  type CheckDispatchPort,
  type CheckDispatchReservation,
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

test('remote check absence contradicting a fact inserted while query waited refuses before send', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    let releaseQuery: ((answer: { kind: 'absent' }) => void) | undefined;
    let sends = 0;
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    const bytes = serializeCanonical(checkObservation(reservation));
    database
      .query(
        'INSERT INTO activation_check_dispatch_fact (effect_key,observation_bytes,observation_digest) VALUES (?,?,?)',
      )
      .run(reservation.effectKey, bytes, hashBytes(bytes));
    const before = checkDispatchRows(selected.source.databasePath);
    releaseQuery?.({ kind: 'absent' });
    await rejectsWith(pending, 'local fact conflicts with remote absence');
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    expect(sends).toBe(0);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('same accepted check fact replays idempotently but conflicting bytes refuse', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const observed = checkObservation(reservation);
    const accepted = {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
      send: () => Promise.resolve({ kind: 'uncertain' as const }),
    };
    expect(
      (
        await selected.controller.recoverCheckDispatch(
          selected.lease,
          reservation.effectKey,
          accepted,
        )
      ).state,
    ).toBe('acknowledged');
    const fact = checkDispatchRows(selected.source.databasePath).facts;
    database.run("UPDATE activation_check_dispatch_progress SET state='uncertain'");
    expect(
      (
        await selected.controller.recoverCheckDispatch(
          selected.lease,
          reservation.effectKey,
          accepted,
        )
      ).state,
    ).toBe('acknowledged');
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual(fact);
    database.run("UPDATE activation_check_dispatch_progress SET state='uncertain'");
    let releaseQuery:
      ((answer: { kind: 'accepted'; observed: CheckDispatchObservation }) => void) | undefined;
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: accepted.send,
      },
    );
    const before = checkDispatchRows(selected.source.databasePath);
    releaseQuery?.({
      kind: 'accepted',
      observed: { ...observed, evidenceBytes: 'conflicting fake evidence' },
    });
    await rejectsWith(pending, 'accepted fact conflicts');
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('failed check fact insert rolls back its transaction without acknowledging or completing the check', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    database.run(`CREATE TRIGGER fail_check_fact BEFORE INSERT ON activation_check_dispatch_fact
      BEGIN SELECT RAISE(ABORT,'injected check fact failure'); END`);
    let releaseQuery:
      ((answer: { kind: 'accepted'; observed: CheckDispatchObservation }) => void) | undefined;
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      },
    );
    const before = checkDispatchRows(selected.source.databasePath);
    releaseQuery?.({ kind: 'accepted', observed: checkObservation(reservation) });
    await rejectsWith(pending, 'injected check fact failure');
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    expect(before.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obligation_identity: 'a'.repeat(64),
          state: 'pending',
          receipt_identity: null,
        }),
      ]) as unknown[],
    );
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('failed check acknowledgement retains the prior accepted fact and retries without another send', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    database.run(`CREATE TRIGGER fail_check_ack BEFORE UPDATE OF state ON activation_check_dispatch_progress
      WHEN NEW.state='acknowledged' BEGIN SELECT RAISE(ABORT,'injected check ack failure'); END`);
    let releaseQuery:
      ((answer: { kind: 'accepted'; observed: CheckDispatchObservation }) => void) | undefined;
    const observed = checkObservation(reservation);
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      },
    );
    const before = checkDispatchRows(selected.source.databasePath);
    releaseQuery?.({ kind: 'accepted', observed });
    await rejectsWith(pending, 'injected check ack failure');
    const retained = checkDispatchRows(selected.source.databasePath);
    expect({ ...retained, facts: before.facts }).toEqual(before);
    expect(retained.facts).toHaveLength(1);
    database.run('DROP TRIGGER fail_check_ack');
    let sends = 0;
    const progress = await selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(progress.state).toBe('acknowledged');
    expect(sends).toBe(0);
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual(retained.facts);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('check recovery refuses coherently rehashed wrong payload before any query or send', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const payload = JSON.parse(reservation.payloadBytes) as { request: { headSha: string } };
    payload.request.headSha = 'f'.repeat(40);
    const bytes = serializeCanonical(payload);
    database
      .query('UPDATE activation_check_dispatch SET payload_bytes=?,payload_digest=?')
      .run(bytes, hashBytes(bytes));
    const before = checkDispatchRows(selected.source.databasePath);
    let calls = 0;
    await rejectsWith(
      selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
        query: () => {
          calls += 1;
          return Promise.resolve({ kind: 'absent' as const });
        },
        send: () => {
          calls += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      }),
      'canonical reservation changed',
    );
    expect(calls).toBe(0);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('check acceptance after persisted authority movement retains fact without acknowledgement', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const observed = checkObservation(reservation);
    let releaseQuery:
      ((answer: { kind: 'accepted'; observed: CheckDispatchObservation }) => void) | undefined;
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      },
    );
    database.query('UPDATE activation_request SET bootstrap_identity = ?').run('f'.repeat(64));
    releaseQuery?.({ kind: 'accepted', observed });
    await rejectsWith(pending, 'selected check authority changed');
    const after = checkDispatchRows(selected.source.databasePath);
    expect(after.facts).toHaveLength(1);
    expect(after.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'dispatching', dispatch_attempts: 0 }),
      ]) as unknown[],
    );
    expect(after.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obligation_identity: 'a'.repeat(64),
          state: 'pending',
          receipt_identity: null,
        }),
      ]) as unknown[],
    );
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('malformed fake check send answer never becomes accepted fact', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    await rejectsWith(
      selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'absent' as const }),
        send: () => Promise.resolve({ kind: 'accepted', observed: { forged: true } } as never),
      }),
      'Validation failed',
    );
    const after = checkDispatchRows(selected.source.databasePath);
    expect(after.facts).toEqual([]);
    expect(after.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'dispatching', dispatch_attempts: 1 }),
      ]) as unknown[],
    );
  } finally {
    selected.controller.close();
  }
});

test('malformed uncertain check-send answer is refused rather than becoming modeled uncertainty', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    await rejectsWith(
      selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'absent' as const }),
        send: () => Promise.resolve({ kind: 'uncertain', forged: true } as never),
      }),
      'Validation failed',
    );
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath).progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'dispatching', dispatch_attempts: 1 }),
      ]) as unknown[],
    );
  } finally {
    selected.controller.close();
  }
});

test('acknowledgement refuses a fact removed after its authenticated insertion', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    database.run(`CREATE TRIGGER remove_check_fact AFTER INSERT ON activation_check_dispatch_fact
      BEGIN DELETE FROM activation_check_dispatch_fact; END`);
    const observed = checkObservation(reservation);
    await rejectsWith(
      selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      }),
      'accepted fact absent',
    );
    const after = checkDispatchRows(selected.source.databasePath);
    expect(after.facts).toEqual([]);
    expect(after.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ state: 'dispatching', dispatch_attempts: 0 }),
      ]) as unknown[],
    );
  } finally {
    database.close();
    selected.controller.close();
  }
});

test.each(['missing', 'corrupt'] as const)(
  'acknowledged check replay refuses %s retained acceptance',
  async (damage) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const database = new Database(selected.source.databasePath);
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        },
      );
      const observed = checkObservation(reservation);
      await selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'accepted' as const, observed }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      });
      if (damage === 'missing') database.run('DELETE FROM activation_check_dispatch_fact');
      else
        database.run(
          "UPDATE activation_check_dispatch_fact SET observation_digest = 'f' || substr(observation_digest,2)",
        );
      const before = checkDispatchRows(selected.source.databasePath);
      let queries = 0;
      await rejectsWith(
        selected.controller.recoverCheckDispatch(selected.lease, reservation.effectKey, {
          query: () => {
            queries += 1;
            return Promise.resolve({ kind: 'absent' as const });
          },
          send: () => Promise.resolve({ kind: 'uncertain' as const }),
        }),
        damage === 'missing' ? 'accepted fact absent' : 'retained fact digest changed',
      );
      expect(queries).toBe(0);
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
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
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('DROP TABLE activation_check_dispatch_progress');
    database.run('DROP TABLE activation_check_dispatch');
    database.run('DROP TABLE activation_check_attempt');
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
    expect(migrated.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
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

test('orphan query retains an old sent attempt after both selected phases advance', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    fixture.database
      .query(
        "UPDATE activation_obligation SET attempt = 1 WHERE kind = 'audit' AND request_identity = ?",
      )
      .run(fixture.request.requestIdentity);
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
    expect(fixture.database.query('SELECT attempt FROM activation_review_dispatch').get()).toEqual({
      attempt: 0,
    });
  } finally {
    fixture.reopened.close();
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

test('orphan query rejects remote absence after an accepted fact was retained', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    await fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
    });
    const before = dispatchState(fixture.database);
    await rejectedWith(
      fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
        query: () => Promise.resolve({ kind: 'absent' as const }),
      }),
      'review dispatch remote absence conflicts with retained fact',
    );
    expect(dispatchState(fixture.database)).toEqual(before);
  } finally {
    fixture.reopened.close();
    fixture.close();
  }
});

test('orphan absent response rechecks a fact retained while query was held', async () => {
  const fixture = await initiatedOrphanFixture('superseded');
  try {
    let release: ((answer: { kind: 'absent' }) => void) | undefined;
    let queried: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      queried = resolve;
    });
    const answer = new Promise<{ kind: 'absent' }>((resolve) => {
      release = resolve;
    });
    const pending = fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => {
        queried?.();
        return answer;
      },
    });
    await started;
    await fixture.reopened.reconcileOrphanReviewDispatch(fixture.reservation.effectKey, {
      query: () => Promise.resolve({ kind: 'accepted' as const, observed: fixture.observed }),
    });
    const before = dispatchState(fixture.database);
    release?.({ kind: 'absent' });
    await rejectedWith(pending, 'review dispatch remote absence conflicts with retained fact');
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
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('DROP TABLE activation_check_dispatch_progress');
    database.run('DROP TABLE activation_check_dispatch');
    database.run('DROP TABLE activation_check_attempt');
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
    expect(migrated.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
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
      database.run('DROP TABLE activation_check_dispatch_fact');
      database.run('DROP TABLE activation_check_dispatch_progress');
      database.run('DROP TABLE activation_check_dispatch');
      database.run('DROP TABLE activation_check_attempt');
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

test('selected check preparation resolves only its frozen command manifest', async () => {
  const fixtureData = fixture();
  const manifestBytes = serializeCanonical({
    schemaVersion: 1,
    kind: 'check-invocation',
    argv: ['bun', 'test', 'src/check.test.ts'],
    cwd: '.',
    env: {},
    skipChannel: 'bun-test',
    skipProbe: null,
    toolchainIdentity: '6'.repeat(64),
    sandboxProfileIdentity: '7'.repeat(64),
    timeoutMilliseconds: 30_000,
    maxOutputBytes: 16_384,
  });
  const manifestIdentity = hashBytes(manifestBytes);
  const observed: string[] = [];
  const controller = openActivationController({
    ...fixtureData,
    selectObligations: (request) => ({
      ...fixtureData.selectObligations(request),
      obligations: fixtureData
        .selectObligations(request)
        .obligations.map((obligation) =>
          obligation.kind === 'check'
            ? { ...obligation, commandIdentity: manifestIdentity }
            : obligation,
        ),
    }),
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: fixtureData.candidate }),
    resolveCheckManifest: (identity) => {
      observed.push(identity);
      return Promise.resolve(manifestBytes);
    },
  });
  try {
    const request = controller.observe(fixtureData.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.check', 100);
    controller.beginEvaluation(lease);
    const prepared = await controller.prepareSelectedCheck(lease, 'a'.repeat(64));
    expect(observed).toEqual([manifestIdentity]);
    expect(prepared).toMatchObject({
      requestIdentity: request.requestIdentity,
      obligationIdentity: 'a'.repeat(64),
      attempt: 0,
      commandIdentity: manifestIdentity,
      manifest: { argv: ['bun', 'test', 'src/check.test.ts'], skipChannel: 'bun-test' },
    });
    expect(controller.listObligations(request.requestIdentity)).toHaveLength(3);
  } finally {
    controller.close();
  }
});

function selectedCheckFixture(
  resolveCheckManifest?: (identity: string) => Promise<unknown>,
  selectedManifest?: Record<string, unknown>,
  frozenIdentity?: string,
  clock: () => number = () => 1000,
  launchResolvers: Partial<
    Pick<
      ActivationControllerOptions,
      | 'resolveCheckRuntime'
      | 'resolveCheckSandboxProfile'
      | 'resolveCandidateSnapshot'
      | 'resolveCandidateTree'
      | 'resolveExecutableTree'
    >
  > = {},
) {
  const source = fixture();
  const manifest = selectedManifest ?? {
    schemaVersion: 1,
    kind: 'check-invocation',
    argv: ['bun', 'test', 'src/check.test.ts'],
    cwd: '.',
    env: {},
    skipChannel: 'bun-test',
    skipProbe: null,
    toolchainIdentity: '6'.repeat(64),
    sandboxProfileIdentity: '7'.repeat(64),
    timeoutMilliseconds: 30_000,
    maxOutputBytes: 16_384,
  };
  const bytes = serializeCanonical(manifest);
  const identity = frozenIdentity ?? hashBytes(bytes);
  const controller = openActivationController({
    ...source,
    selectObligations: (request) => ({
      ...source.selectObligations(request),
      obligations: source
        .selectObligations(request)
        .obligations.map((obligation) =>
          obligation.kind === 'check' ? { ...obligation, commandIdentity: identity } : obligation,
        ),
    }),
    clock,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () => Promise.resolve({ kind: 'ready', candidate: source.candidate }),
    resolveCheckManifest,
    ...launchResolvers,
  });
  const request = controller.observe(source.candidate);
  const lease = controller.claim(request.requestIdentity, 'worker.check', 100);
  controller.beginEvaluation(lease);
  return { source, manifest, bytes, identity, controller, request, lease };
}

function selectedLaunchFixture(
  overrides: Partial<
    Pick<
      ActivationControllerOptions,
      | 'resolveCheckRuntime'
      | 'resolveCheckSandboxProfile'
      | 'resolveCandidateSnapshot'
      | 'resolveCandidateTree'
      | 'resolveExecutableTree'
      | 'stageBase'
      | 'stageDiagnostics'
    >
  > = {},
  cwd = '.',
  profileChanges: Record<string, unknown> = {},
  skipCwd = '.',
  runtimeChanges: Record<string, unknown> = {},
  probeExecutable = 'bun',
  runtimeEncoding: 'canonical' | 'pretty' = 'canonical',
  mainExecutable = 'bun',
) {
  const canonicalRuntimeBytes = serializeCanonical({
    schemaVersion: 1,
    kind: 'check-runtime',
    executableTreeIdentity: '8'.repeat(64),
    executables: ['bun'],
    ...runtimeChanges,
  });
  const runtimeBytes =
    runtimeEncoding === 'pretty'
      ? JSON.stringify(JSON.parse(canonicalRuntimeBytes), null, 2)
      : canonicalRuntimeBytes;
  const profileBytes = serializeCanonical({
    schemaVersion: 2,
    kind: 'check-sandbox-profile',
    namespaces: 'private-all',
    network: 'none',
    capabilities: 'drop-all',
    descriptors: 'stdio-only',
    readOnlyMounts: ['candidate-source', 'toolchain-runtime'],
    writableMounts: ['workspace', 'tmp', 'home'],
    virtualMounts: ['proc', 'dev'],
    environmentAllowlist: ['CI', 'LANG', 'LC_ALL', 'TZ'],
    wallTimeMilliseconds: 40_000,
    cpuTimeMilliseconds: 40_000,
    memoryBytes: 536_870_912,
    processCount: 16,
    maxOutputBytes: 65_536,
    maxManifestBytes: 1_048_576,
    maxEntries: 10_000,
    maxDepth: 64,
    maxPathBytes: 4_096,
    maxFileBytes: 536_870_912,
    maxTotalBytes: 1_073_741_824,
    ...profileChanges,
  });
  const manifest = {
    schemaVersion: 1,
    kind: 'check-invocation',
    argv: [mainExecutable, 'test', 'src/check.test.ts'],
    cwd,
    env: {},
    skipChannel: 'bun-test',
    skipProbe: { argv: [probeExecutable, 'test', 'src/skip.test.ts'], cwd: skipCwd, env: {} },
    toolchainIdentity: hashBytes(runtimeBytes),
    sandboxProfileIdentity: hashBytes(profileBytes),
    timeoutMilliseconds: 30_000,
    maxOutputBytes: 16_384,
  };
  const snapshotRoot = mkdtempSync(join(tmpdir(), 'activation-check-snapshot-'));
  scratch.push(snapshotRoot);
  const selected = selectedCheckFixture(
    () => Promise.resolve(selected.bytes),
    manifest,
    undefined,
    () => 1000,
    {
      resolveCheckRuntime: () => Promise.resolve(runtimeBytes),
      resolveCheckSandboxProfile: () => Promise.resolve(profileBytes),
      resolveCandidateSnapshot: (request) =>
        Promise.resolve({
          schemaVersion: 1,
          kind: 'candidate-snapshot',
          requestIdentity: request.requestIdentity,
          headSha: request.headSha,
          snapshotIdentity: '9'.repeat(64),
          root: snapshotRoot,
        }),
      ...overrides,
    },
  );
  return { ...selected, runtimeBytes, profileBytes, snapshotRoot };
}

test('selected check reservation atomically registers an invocation and frozen effect', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 },
    );
    expect(reservation.effectKey).toBe(
      hashCanonical({
        kind: 'check-dispatch',
        requestIdentity: selected.request.requestIdentity,
        obligationIdentity: 'a'.repeat(64),
        attempt: 0,
      }),
    );
    expect(reservation.target).toEqual({ kind: 'local-check-worker', executorId: 'worker.check' });
    expect(JSON.parse(reservation.payloadBytes)).toMatchObject({
      request: selected.request,
      obligationIdentity: 'a'.repeat(64),
      attempt: 0,
      invocationId: 'check.invocation.1',
      commandIdentity: selected.identity,
      manifestBytes: selected.bytes,
      executorId: 'worker.check',
      protocolIdentity: 'b'.repeat(64),
      toolchainIdentity: '6'.repeat(64),
      sandboxProfileIdentity: '7'.repeat(64),
      authorityIdentity: selected.source.pin.identity,
      deadlineAt: 2000,
      maxDispatchAttempts: 3,
    });
    const database = new Database(selected.source.databasePath);
    try {
      expect(database.query('SELECT * FROM activation_check_attempt').all()).toHaveLength(1);
      expect(database.query('SELECT * FROM activation_check_dispatch').all()).toHaveLength(1);
      expect(database.query('SELECT * FROM activation_check_dispatch_progress').all()).toEqual([
        {
          effect_key: reservation.effectKey,
          state: 'reserved',
          dispatch_attempts: 0,
          owner_epoch: selected.lease.leaseEpoch,
          owner_id: selected.lease.workerId,
          version: 0,
        },
      ]);
    } finally {
      database.close();
    }
  } finally {
    selected.controller.close();
  }
});

test('reserved check effect has a controller-bound recovery entry point', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    expect(reservation.effectKey).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof Reflect.get(selected.controller, 'recoverCheckDispatch')).toBe('function');
  } finally {
    selected.controller.close();
  }
});

test('fake check admission queries before one send and retains acceptance without completing the check', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const observed = {
      effectKey: reservation.effectKey,
      requestIdentity: reservation.requestIdentity,
      obligationIdentity: 'a'.repeat(64),
      attempt: 0,
      invocationId: 'check.invocation.1',
      target: reservation.target,
      payloadDigest: reservation.payloadDigest,
      toolchainIdentity: '6'.repeat(64),
      sandboxProfileIdentity: '7'.repeat(64),
      executionId: 'fake.execution.1',
      evidenceBytes: 'fake acceptance evidence',
    };
    const calls: string[] = [];
    const progress = await selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () => {
          calls.push('query');
          return Promise.resolve({ kind: 'absent' } as const);
        },
        send: (_reserved, fence) => {
          calls.push('send');
          expect(fence).toMatchObject({
            workerId: selected.lease.workerId,
            leaseEpoch: selected.lease.leaseEpoch,
            authorityIdentity: selected.source.pin.identity,
          });
          return Promise.resolve({ kind: 'accepted', observed } as const);
        },
      },
    );
    expect(calls).toEqual(['query', 'send']);
    expect(progress).toMatchObject({ state: 'acknowledged', dispatchAttempts: 1 });
    const rows = checkDispatchRows(selected.source.databasePath);
    expect(rows.facts).toHaveLength(1);
    expect(rows.obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obligation_identity: 'a'.repeat(64),
          state: 'pending',
          receipt_identity: null,
        }),
      ]) as unknown[],
    );
  } finally {
    selected.controller.close();
  }
});

test('fake check receiver independently fences installed executor, toolchain and sandbox profile', async () => {
  for (const installed of [
    {
      executorId: 'wrong.executor',
      toolchainIdentity: '6'.repeat(64),
      sandboxProfileIdentity: '7'.repeat(64),
    },
    {
      executorId: 'worker.check',
      toolchainIdentity: '8'.repeat(64),
      sandboxProfileIdentity: '7'.repeat(64),
    },
    {
      executorId: 'worker.check',
      toolchainIdentity: '6'.repeat(64),
      sandboxProfileIdentity: '9'.repeat(64),
    },
  ]) {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        },
      );
      const receiver = fakeCheckReceiver(
        selected.source.databasePath,
        selected.source.pin.identity,
        installed,
      );
      const progress = await selected.controller.recoverCheckDispatch(
        selected.lease,
        reservation.effectKey,
        receiver.port,
      );
      expect(progress.state).toBe('uncertain');
      expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
      expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
    } finally {
      selected.controller.close();
    }
  }
});

test('fake check acceptance after response loss reconciles by effect key after reopen without another execution', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const reopened = openActivationController({
    ...selected.source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready', candidate: selected.source.candidate }),
    resolveCheckManifest: () => Promise.resolve(selected.bytes),
  });
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const receiver = fakeCheckReceiver(selected.source.databasePath, selected.source.pin.identity);
    const first = await selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: receiver.port.query,
        send: async (effect, fence) => {
          await receiver.port.send(effect, fence);
          return { kind: 'uncertain' as const };
        },
      },
    );
    expect(first.state).toBe('uncertain');
    expect(receiver.counts()).toEqual({ queries: 1, sends: 1 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
    const second = await reopened.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      receiver.port,
    );
    expect(second.state).toBe('acknowledged');
    expect(receiver.counts()).toEqual({ queries: 2, sends: 1 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toHaveLength(1);
  } finally {
    reopened.close();
    selected.controller.close();
  }
});

test('held check query refuses old lease before send after evaluating takeover', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    let releaseQuery: ((answer: { kind: 'absent' }) => void) | undefined;
    let sends = 0;
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () =>
          new Promise((resolve) => {
            releaseQuery = resolve;
          }),
        send: () => {
          sends += 1;
          return Promise.resolve({ kind: 'uncertain' as const });
        },
      },
    );
    expect(
      database
        .query('SELECT state, dispatch_attempts FROM activation_check_dispatch_progress')
        .get(),
    ).toEqual({
      state: 'dispatching',
      dispatch_attempts: 0,
    });
    database.run('UPDATE activation_request SET lease_expires_at = 1000');
    const successor = selected.controller.recoverEvaluationLease(
      selected.request.requestIdentity,
      'worker.second',
      100,
    );
    expect(successor.leaseEpoch).toBeGreaterThan(selected.lease.leaseEpoch);
    releaseQuery?.({ kind: 'absent' });
    await rejectsWith(pending, 'selected check lease changed');
    expect(sends).toBe(0);
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('fake check receiver fences takeover between local send intent and acceptance', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    let releaseSend: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const receiver = fakeCheckReceiver(
      selected.source.databasePath,
      selected.source.pin.identity,
      undefined,
      () => gate,
    );
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      receiver.port,
    );
    await Promise.resolve();
    expect(
      database.query('SELECT dispatch_attempts FROM activation_check_dispatch_progress').get(),
    ).toEqual({ dispatch_attempts: 1 });
    database.run('UPDATE activation_request SET lease_expires_at = 1000');
    selected.controller.recoverEvaluationLease(
      selected.request.requestIdentity,
      'worker.second',
      100,
    );
    releaseSend?.();
    const progress = await pending;
    expect(progress.state).toBe('uncertain');
    expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('fake check receiver refuses new acceptance at exact lease expiry without takeover', async () => {
  let now = 1000;
  const selected = selectedCheckFixture(
    () => Promise.resolve(selected.bytes),
    undefined,
    undefined,
    () => now,
  );
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 },
    );
    let releaseSend: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const receiver = fakeCheckReceiver(
      selected.source.databasePath,
      selected.source.pin.identity,
      undefined,
      () => gate,
      () => now,
    );
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      receiver.port,
    );
    await Promise.resolve();
    expect(checkDispatchRows(selected.source.databasePath).progress).toEqual(
      expect.arrayContaining([expect.objectContaining({ dispatch_attempts: 1 })]) as unknown[],
    );
    now = 1100;
    releaseSend?.();
    await pending;
    expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test('fake check receiver refuses new acceptance when lease expiry becomes missing', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 },
    );
    let releaseSend: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const receiver = fakeCheckReceiver(
      selected.source.databasePath,
      selected.source.pin.identity,
      undefined,
      () => gate,
    );
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      receiver.port,
    );
    await Promise.resolve();
    database
      .query('UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?')
      .run(selected.request.requestIdentity);
    releaseSend?.();
    await pending;
    expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('fake check receiver fences same-owner progress-version movement before acceptance', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    let releaseSend: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const receiver = fakeCheckReceiver(
      selected.source.databasePath,
      selected.source.pin.identity,
      undefined,
      () => gate,
    );
    const first = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      receiver.port,
    );
    await Promise.resolve();
    const second = await selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: () => Promise.resolve({ kind: 'unavailable' as const }),
        send: () => Promise.resolve({ kind: 'uncertain' as const }),
      },
    );
    expect(second.state).toBe('uncertain');
    releaseSend?.();
    expect((await first).state).toBe('uncertain');
    expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test.each(['same-owner epoch', 'authority', 'payload', 'target'] as const)(
  'fake check receiver refuses %s movement at acceptance',
  async (movement) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const database = new Database(selected.source.databasePath);
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        },
      );
      let releaseSend: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      const receiver = fakeCheckReceiver(
        selected.source.databasePath,
        selected.source.pin.identity,
        undefined,
        () => gate,
      );
      const pending = selected.controller.recoverCheckDispatch(
        selected.lease,
        reservation.effectKey,
        receiver.port,
      );
      await Promise.resolve();
      if (movement === 'same-owner epoch') {
        const renewed = selected.controller.recoverEvaluationLease(
          selected.request.requestIdentity,
          selected.lease.workerId,
          100,
        );
        expect(renewed.leaseEpoch).toBeGreaterThan(selected.lease.leaseEpoch);
      } else if (movement === 'authority') {
        database.query('UPDATE activation_request SET bootstrap_identity=?').run('f'.repeat(64));
      } else if (movement === 'payload') {
        const changed = serializeCanonical({
          ...JSON.parse(reservation.payloadBytes),
          forged: true,
        });
        database
          .query('UPDATE activation_check_dispatch SET payload_bytes=?,payload_digest=?')
          .run(changed, hashBytes(changed));
      } else {
        database
          .query('UPDATE activation_check_dispatch SET target_bytes=?')
          .run(serializeCanonical({ kind: 'local-check-worker', executorId: 'other.worker' }));
      }
      releaseSend?.();
      expect((await pending).state).toBe('uncertain');
      expect(receiver.counts()).toEqual({ queries: 1, sends: 0 });
      expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test('authorized check acceptance can be retained after takeover without old-owner acknowledgement', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const database = new Database(selected.source.databasePath);
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const receiver = fakeCheckReceiver(selected.source.databasePath, selected.source.pin.identity);
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const pending = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      {
        query: receiver.port.query,
        send: async (effect, fence) => {
          const accepted = await receiver.port.send(effect, fence);
          await responseGate;
          return accepted;
        },
      },
    );
    await Promise.resolve();
    expect(receiver.counts().sends).toBe(1);
    database.run('UPDATE activation_request SET lease_expires_at = 1000');
    selected.controller.recoverEvaluationLease(
      selected.request.requestIdentity,
      'worker.second',
      100,
    );
    releaseResponse?.();
    const progress = await pending;
    expect(progress.state).toBe('dispatching');
    expect(checkDispatchRows(selected.source.databasePath).facts).toHaveLength(1);
    expect(checkDispatchRows(selected.source.databasePath).obligations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obligation_identity: 'a'.repeat(64),
          state: 'pending',
          receipt_identity: null,
        }),
      ]) as unknown[],
    );
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('overlapping same-owner check queries use progress version to admit one send', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const reservation = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      {
        invocationId: 'check.invocation.1',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      },
    );
    const releases: ((answer: { kind: 'absent' }) => void)[] = [];
    let sends = 0;
    const port = {
      query: () =>
        new Promise<{ kind: 'absent' }>((resolve) => {
          releases.push(resolve);
        }),
      send: () => {
        sends += 1;
        return Promise.resolve({ kind: 'uncertain' as const });
      },
    };
    const first = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      port,
    );
    const second = selected.controller.recoverCheckDispatch(
      selected.lease,
      reservation.effectKey,
      port,
    );
    expect(releases).toHaveLength(2);
    releases[0]({ kind: 'absent' });
    await rejectsWith(first, 'ownership changed before send');
    releases[1]({ kind: 'absent' });
    expect((await second).dispatchAttempts).toBe(1);
    expect(sends).toBe(1);
  } finally {
    selected.controller.close();
  }
});

test('unavailable, malformed and thrown check queries never become permission to send', async () => {
  for (const outcome of ['unavailable', 'malformed', 'throws'] as const) {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        },
      );
      let sends = 0;
      const pending = selected.controller.recoverCheckDispatch(
        selected.lease,
        reservation.effectKey,
        {
          query: () => {
            if (outcome === 'throws') throw new Error('fake query unreadable');
            if (outcome === 'malformed')
              return Promise.resolve({ kind: 'absent', forged: true } as never);
            return Promise.resolve({ kind: 'unavailable' as const });
          },
          send: () => {
            sends += 1;
            return Promise.resolve({ kind: 'uncertain' as const });
          },
        },
      );
      if (outcome === 'unavailable') {
        expect((await pending).state).toBe('uncertain');
      } else {
        await rejectsWith(
          pending,
          outcome === 'throws' ? 'fake query unreadable' : 'Validation failed',
        );
      }
      expect(sends).toBe(0);
      expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
    } finally {
      selected.controller.close();
    }
  }
});

test('check deadline equality and attempt budget prevent new sends but still allow fact queries', async () => {
  for (const boundary of ['deadline', 'budget'] as const) {
    let now = 1000;
    const selected = selectedCheckFixture(
      () => Promise.resolve(selected.bytes),
      undefined,
      undefined,
      () => now,
    );
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 1001,
          maxDispatchAttempts: 1,
        },
      );
      const receiver = fakeCheckReceiver(
        selected.source.databasePath,
        selected.source.pin.identity,
      );
      if (boundary === 'deadline') now = 1001;
      else {
        const first = await selected.controller.recoverCheckDispatch(
          selected.lease,
          reservation.effectKey,
          {
            query: receiver.port.query,
            send: () => Promise.resolve({ kind: 'uncertain' as const }),
          },
        );
        expect(first.dispatchAttempts).toBe(1);
      }
      let sends = 0;
      const exhausted = await selected.controller.recoverCheckDispatch(
        selected.lease,
        reservation.effectKey,
        {
          query: receiver.port.query,
          send: () => {
            sends += 1;
            return Promise.resolve({ kind: 'uncertain' as const });
          },
        },
      );
      expect(exhausted.state).toBe('exhausted');
      expect(sends).toBe(0);
      expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
      expect(receiver.counts().queries).toBe(boundary === 'deadline' ? 1 : 2);
    } finally {
      selected.controller.close();
    }
  }
});

test.each([
  ['effectKey', 'f'.repeat(64)],
  ['requestIdentity', 'f'.repeat(64)],
  ['obligationIdentity', 'f'.repeat(64)],
  ['attempt', 1],
  ['invocationId', 'foreign.invocation'],
  ['target', { kind: 'local-check-worker', executorId: 'wrong.executor' }],
  ['payloadDigest', 'f'.repeat(64)],
  ['toolchainIdentity', 'f'.repeat(64)],
  ['sandboxProfileIdentity', 'f'.repeat(64)],
] as const)(
  'fake check query refuses foreign accepted %s without retaining a fact',
  async (field, changed) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    try {
      const reservation = await selected.controller.reserveCheckDispatch(
        selected.lease,
        'a'.repeat(64),
        {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        },
      );
      const foreign = {
        ...checkObservation(reservation),
        [field]: changed,
      };
      let releaseQuery:
        ((answer: { kind: 'accepted'; observed: CheckDispatchObservation }) => void) | undefined;
      let sends = 0;
      const pending = selected.controller.recoverCheckDispatch(
        selected.lease,
        reservation.effectKey,
        {
          query: () =>
            new Promise((resolve) => {
              releaseQuery = resolve;
            }),
          send: () => {
            sends += 1;
            return Promise.resolve({ kind: 'uncertain' as const });
          },
        },
      );
      const before = checkDispatchRows(selected.source.databasePath);
      releaseQuery?.({ kind: 'accepted', observed: foreign });
      await rejectsWith(pending, 'accepted fact differs from reservation');
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
      expect(sends).toBe(0);
    } finally {
      selected.controller.close();
    }
  },
);

function checkDispatchRows(databasePath: string) {
  const database = new Database(databasePath);
  try {
    return {
      requests: database.query('SELECT * FROM activation_request ORDER BY request_identity').all(),
      obligations: database
        .query('SELECT * FROM activation_obligation ORDER BY obligation_identity')
        .all(),
      attempts: database
        .query('SELECT * FROM activation_check_attempt ORDER BY invocation_id')
        .all(),
      reservations: database
        .query('SELECT * FROM activation_check_dispatch ORDER BY effect_key')
        .all(),
      progress: database
        .query('SELECT * FROM activation_check_dispatch_progress ORDER BY effect_key')
        .all(),
      facts: database
        .query('SELECT * FROM activation_check_dispatch_fact ORDER BY effect_key')
        .all(),
    };
  } finally {
    database.close();
  }
}

function fakeCheckReceiver(
  databasePath: string,
  authorityIdentity: string,
  installed = {
    executorId: 'worker.check',
    toolchainIdentity: '6'.repeat(64),
    sandboxProfileIdentity: '7'.repeat(64),
  },
  beforeAcceptance?: () => Promise<void>,
  clock: () => number = () => 1000,
) {
  const accepted = new Map<string, CheckDispatchObservation>();
  let queries = 0;
  let sends = 0;
  const port: CheckDispatchPort = {
    query: (reservation) => {
      queries += 1;
      const observed = accepted.get(reservation.effectKey);
      return Promise.resolve(
        observed === undefined
          ? { kind: 'absent' as const }
          : { kind: 'accepted' as const, observed },
      );
    },
    send: async (reservation: CheckDispatchReservation, fence) => {
      if (beforeAcceptance !== undefined) await beforeAcceptance();
      const database = new Database(databasePath);
      try {
        const request = database
          .query(
            'SELECT lease_owner, lease_epoch, lease_expires_at, bootstrap_identity, current, stage FROM activation_request WHERE request_identity = ?',
          )
          .get(reservation.requestIdentity) as {
          lease_owner: string;
          lease_epoch: number;
          lease_expires_at: number | null;
          bootstrap_identity: string;
          current: number;
          stage: string;
        };
        const progress = database
          .query(
            'SELECT version, owner_epoch, owner_id FROM activation_check_dispatch_progress WHERE effect_key = ?',
          )
          .get(reservation.effectKey) as { version: number; owner_epoch: number; owner_id: string };
        const stored = database
          .query(
            'SELECT target_bytes, payload_bytes, payload_digest, authority_identity, toolchain_identity, sandbox_profile_identity FROM activation_check_dispatch WHERE effect_key = ?',
          )
          .get(reservation.effectKey) as {
          target_bytes: string;
          payload_bytes: string;
          payload_digest: string;
          authority_identity: string;
          toolchain_identity: string;
          sandbox_profile_identity: string;
        };
        const payload = JSON.parse(reservation.payloadBytes) as {
          obligationIdentity: string;
          attempt: number;
          invocationId: string;
          toolchainIdentity: string;
          sandboxProfileIdentity: string;
          authorityIdentity: string;
        };
        if (
          request.lease_owner !== fence.workerId ||
          request.lease_epoch !== fence.leaseEpoch ||
          // Proof: omitting the expiry predicate accepted a new fake execution at equality.
          !(request.lease_expires_at !== null && clock() < request.lease_expires_at) ||
          request.bootstrap_identity !== authorityIdentity ||
          request.current !== 1 ||
          request.stage !== 'evaluating' ||
          progress.version !== fence.progressVersion ||
          progress.owner_epoch !== fence.leaseEpoch ||
          progress.owner_id !== fence.workerId ||
          fence.authorityIdentity !== authorityIdentity ||
          stored.target_bytes !== serializeCanonical(reservation.target) ||
          stored.payload_bytes !== reservation.payloadBytes ||
          stored.payload_digest !== reservation.payloadDigest ||
          stored.authority_identity !== authorityIdentity ||
          stored.toolchain_identity !== installed.toolchainIdentity ||
          stored.sandbox_profile_identity !== installed.sandboxProfileIdentity ||
          reservation.target.executorId !== installed.executorId ||
          payload.toolchainIdentity !== installed.toolchainIdentity ||
          payload.sandboxProfileIdentity !== installed.sandboxProfileIdentity ||
          payload.authorityIdentity !== authorityIdentity
        )
          return { kind: 'uncertain' as const };
        const prior = accepted.get(reservation.effectKey);
        if (prior !== undefined) {
          if (prior.payloadDigest !== reservation.payloadDigest)
            throw new Error('fake check effect payload conflicts');
          return { kind: 'accepted' as const, observed: prior };
        }
        sends += 1;
        const observed: CheckDispatchObservation = {
          effectKey: reservation.effectKey,
          requestIdentity: reservation.requestIdentity,
          obligationIdentity: payload.obligationIdentity,
          attempt: payload.attempt,
          invocationId: payload.invocationId,
          target: reservation.target,
          payloadDigest: reservation.payloadDigest,
          toolchainIdentity: installed.toolchainIdentity,
          sandboxProfileIdentity: installed.sandboxProfileIdentity,
          executionId: `fake.execution.${String(sends)}`,
          evidenceBytes: `fake accepted effect ${reservation.effectKey}`,
        };
        accepted.set(reservation.effectKey, observed);
        return { kind: 'accepted' as const, observed };
      } finally {
        database.close();
      }
    },
  };
  return { port, accepted, counts: () => ({ queries, sends }) };
}

function checkObservation(reservation: CheckDispatchReservation): CheckDispatchObservation {
  const payload = JSON.parse(reservation.payloadBytes) as {
    obligationIdentity: string;
    attempt: number;
    invocationId: string;
  };
  return {
    effectKey: reservation.effectKey,
    requestIdentity: reservation.requestIdentity,
    obligationIdentity: payload.obligationIdentity,
    attempt: payload.attempt,
    invocationId: payload.invocationId,
    target: reservation.target,
    payloadDigest: reservation.payloadDigest,
    toolchainIdentity: '6'.repeat(64),
    sandboxProfileIdentity: '7'.repeat(64),
    executionId: 'fake.execution.1',
    evidenceBytes: 'fake accepted execution evidence',
  };
}

test('selected check reservation replays exactly after reopen and rejects changed input', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const input = { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 };
  const second = openActivationController({
    ...selected.source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready', candidate: selected.source.candidate }),
    resolveCheckManifest: () => Promise.resolve(selected.bytes),
  });
  try {
    const first = await selected.controller.reserveCheckDispatch(
      selected.lease,
      'a'.repeat(64),
      input,
    );
    const before = checkDispatchRows(selected.source.databasePath);
    expect(await second.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input)).toEqual(first);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    for (const changed of [
      { ...input, invocationId: 'check.invocation.other' },
      { ...input, deadlineAt: 3000 },
      { ...input, maxDispatchAttempts: 4 },
    ]) {
      await rejectsWith(
        second.reserveCheckDispatch(selected.lease, 'a'.repeat(64), changed),
        'conflicts',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    }
  } finally {
    second.close();
    selected.controller.close();
  }
});

test('selected check reservation refuses caller overrides and untrusted manifest bytes', async () => {
  const cases: readonly { name: string; resolve: () => Promise<unknown> }[] = [
    { name: 'absent', resolve: () => Promise.resolve(undefined) },
    { name: 'malformed', resolve: () => Promise.resolve('{broken') },
    {
      name: 'changed command',
      resolve: () =>
        Promise.resolve(
          serializeCanonical({
            schemaVersion: 1,
            kind: 'check-invocation',
            argv: ['other'],
            cwd: '.',
            env: {},
            skipChannel: 'none',
            skipProbe: null,
            toolchainIdentity: '6'.repeat(64),
            sandboxProfileIdentity: '7'.repeat(64),
            timeoutMilliseconds: 30_000,
            maxOutputBytes: 16_384,
          }),
        ),
    },
  ];
  for (const scenario of cases) {
    const selected = selectedCheckFixture(() => scenario.resolve());
    try {
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
          invocationId: 'check.invocation.1',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        }),
        'check invocation manifest',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  }
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    const forgedInput = {
      invocationId: 'check.invocation.1',
      deadlineAt: 2000,
      maxDispatchAttempts: 3,
      target: { kind: 'reviewer', executorId: 'review.executor' },
    };
    await rejectsWith(
      selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), forgedInput),
      'target',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check reservation refuses an elapsed deadline without invocation writes', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
        invocationId: 'check.invocation.expired',
        deadlineAt: 1000,
        maxDispatchAttempts: 3,
      }),
      'deadline elapsed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each(['missing', 'malformed'] as const)(
  'selected check reservation refuses %s durable progress on replay',
  async (state) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const input = { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 };
    const database = new Database(selected.source.databasePath);
    try {
      await selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input);
      if (state === 'missing') {
        database.run('DELETE FROM activation_check_dispatch_progress');
      } else {
        database.run("UPDATE activation_check_dispatch_progress SET owner_id = ''");
      }
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input),
        state === 'missing' ? 'bundle incomplete' : 'owner_id',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test.each([
  ['attempt', ['activation_check_attempt']],
  ['dispatch', ['activation_check_dispatch']],
  ['progress', ['activation_check_dispatch_progress']],
  ['attempt and dispatch', ['activation_check_attempt', 'activation_check_dispatch']],
  ['attempt and progress', ['activation_check_attempt', 'activation_check_dispatch_progress']],
  ['dispatch and progress', ['activation_check_dispatch', 'activation_check_dispatch_progress']],
] as const)(
  'selected check reservation refuses incomplete trusted bundle missing %s',
  async (_missing, tables) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const input = { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 };
    const database = new Database(selected.source.databasePath);
    try {
      await selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input);
      database.run('PRAGMA foreign_keys = OFF');
      for (const table of tables) database.run(`DELETE FROM ${table}`);
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input),
        'bundle incomplete',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test.each([
  ['request_identity', 'f'.repeat(64)],
  ['plan_identity', 'f'.repeat(64)],
  ['obligation_identity', 'f'.repeat(64)],
  ['attempt', 1],
  ['invocation_id', 'foreign.invocation'],
  ['authority_identity', 'f'.repeat(64)],
  [
    'target_bytes',
    serializeCanonical({ kind: 'local-check-worker', executorId: 'review.executor' }),
  ],
  ['payload_bytes', serializeCanonical({ forged: true })],
  ['payload_digest', 'f'.repeat(64)],
  ['manifest_bytes', serializeCanonical({ forged: true })],
  ['toolchain_identity', 'f'.repeat(64)],
  ['sandbox_profile_identity', 'f'.repeat(64)],
  ['protocol_identity', 'f'.repeat(64)],
  ['command_identity', 'f'.repeat(64)],
  ['deadline_at', 3000],
  ['max_dispatch_attempts', 4],
] as const)(
  'selected check reservation refuses changed stored %s on exact replay',
  async (column, changed) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const input = { invocationId: 'check.invocation.1', deadlineAt: 2000, maxDispatchAttempts: 3 };
    const database = new Database(selected.source.databasePath);
    try {
      await selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input);
      database.run('PRAGMA foreign_keys = OFF');
      database.query(`UPDATE activation_check_dispatch SET ${column} = ?`).run(changed);
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), input),
        'reservation conflicts',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test('held check resolution cannot reserve after current authority or selected state changes', async () => {
  const cases = [
    {
      name: 'current',
      statement: 'UPDATE activation_request SET current = 0 WHERE request_identity = ?',
      message: 'current evaluating',
    },
    {
      name: 'stage',
      statement: "UPDATE activation_request SET stage = 'failed' WHERE request_identity = ?",
      message: 'current evaluating',
    },
    {
      name: 'lease epoch',
      statement:
        'UPDATE activation_request SET lease_epoch = lease_epoch + 1 WHERE request_identity = ?',
      message: 'lease changed',
    },
    {
      name: 'lease owner',
      statement:
        "UPDATE activation_request SET lease_owner = 'worker.other' WHERE request_identity = ?",
      message: 'lease changed',
    },
    {
      name: 'lease expiry',
      statement: 'UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?',
      message: 'lease changed',
    },
    {
      name: 'authority',
      statement: `UPDATE activation_request SET bootstrap_identity = '${'f'.repeat(64)}' WHERE request_identity = ?`,
      message: 'authority changed',
    },
    {
      name: 'generation',
      statement:
        'UPDATE activation_subject SET high_water_generation = high_water_generation + 1 WHERE repository_id = 8241',
      message: 'generation changed',
    },
    {
      name: 'plan',
      statement:
        "UPDATE activation_obligation SET executor_id = 'review.other' WHERE request_identity = ? AND phase = 'cold'",
      message: 'frozen plan changed',
    },
    {
      name: 'check state',
      statement:
        "UPDATE activation_obligation SET state = 'passed' WHERE request_identity = ? AND kind = 'check'",
      message: 'obligation unavailable',
    },
    {
      name: 'attempt',
      statement:
        "UPDATE activation_obligation SET attempt = 1 WHERE request_identity = ? AND kind = 'check'",
      message: 'changed during manifest resolution',
    },
  ];
  for (const scenario of cases) {
    let release: ((bytes: string) => void) | undefined;
    let enteredResolve: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    const selected = selectedCheckFixture(() => {
      enteredResolve?.();
      return held;
    });
    try {
      const pending = selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
        invocationId: 'check.invocation.held',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      });
      await entered;
      const database = new Database(selected.source.databasePath);
      try {
        database.query(scenario.statement).run(selected.request.requestIdentity);
      } finally {
        database.close();
      }
      const before = checkDispatchRows(selected.source.databasePath);
      release?.(selected.bytes);
      await rejectsWith(pending, scenario.message);
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  }
});

test('check reservation rechecks the selected attempt after manifest preparation returns', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const original = selected.controller.prepareSelectedCheck.bind(selected.controller);
  let changed: ReturnType<typeof checkDispatchRows> | undefined;
  selected.controller.prepareSelectedCheck = async (lease, identity) => {
    const prepared = await original(lease, identity);
    const database = new Database(selected.source.databasePath);
    try {
      database
        .query(
          "UPDATE activation_obligation SET attempt = 1 WHERE request_identity = ? AND kind = 'check'",
        )
        .run(selected.request.requestIdentity);
    } finally {
      database.close();
    }
    changed = checkDispatchRows(selected.source.databasePath);
    return prepared;
  };
  try {
    await rejectsWith(
      selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
        invocationId: 'check.invocation.stale',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      }),
      'selected check changed before reservation',
    );
    if (changed === undefined) throw new Error('test did not change the selected attempt');
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(changed);
  } finally {
    selected.controller.close();
  }
});

test('check reservation refuses a changed internal manifest before writing an effect', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  const original = selected.controller.prepareSelectedCheck.bind(selected.controller);
  selected.controller.prepareSelectedCheck = async (lease, identity) => {
    const prepared = await original(lease, identity);
    return { ...prepared, manifest: { ...prepared.manifest, argv: ['changed'] } };
  };
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
        invocationId: 'check.invocation.changed',
        deadlineAt: 2000,
        maxDispatchAttempts: 3,
      }),
      'manifest differs from frozen command',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each(['reservation', 'progress-before', 'progress-after'] as const)(
  'check reservation %s insertion failure rolls back invocation and effect',
  async (failure) => {
    const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
    const database = new Database(selected.source.databasePath);
    try {
      const table =
        failure === 'reservation'
          ? 'activation_check_dispatch'
          : 'activation_check_dispatch_progress';
      const timing = failure === 'progress-after' ? 'AFTER' : 'BEFORE';
      database.run(`CREATE TRIGGER fail_check_insert ${timing} INSERT ON ${table}
        BEGIN SELECT RAISE(ABORT, 'injected check insert failure'); END`);
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
          invocationId: 'check.invocation.fail',
          deadlineAt: 2000,
          maxDispatchAttempts: 3,
        }),
        'injected check insert failure',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test('version-6 populated review history gains empty check tables atomically', () => {
  const review = reservedDispatchFixture();
  const source = review.source;
  review.close();
  const database = new Database(source.databasePath);
  try {
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('DROP TABLE activation_check_dispatch_progress');
    database.run('DROP TABLE activation_check_dispatch');
    database.run('DROP TABLE activation_check_attempt');
    database.run('PRAGMA user_version = 6');
    const retained = database.query('SELECT * FROM activation_review_dispatch').all();
    const upgraded = boundaryController(source, () => 1000);
    try {
      expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
      expect(database.query('SELECT * FROM activation_review_dispatch').all()).toEqual(retained);
      expect(database.query('SELECT * FROM activation_check_attempt').all()).toEqual([]);
      expect(database.query('SELECT * FROM activation_check_dispatch').all()).toEqual([]);
      expect(database.query('SELECT * FROM activation_check_dispatch_progress').all()).toEqual([]);
    } finally {
      upgraded.close();
    }
  } finally {
    database.close();
  }
});

test('late version-7 check-table failure restores version-6 schema and prior review rows', () => {
  const review = reservedDispatchFixture();
  const source = review.source;
  review.close();
  const database = new Database(source.databasePath);
  try {
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('DROP TABLE activation_check_dispatch_progress');
    database.run('DROP TABLE activation_check_dispatch');
    database.run('DROP TABLE activation_check_attempt');
    database.run('PRAGMA user_version = 6');
    database.run('CREATE TABLE activation_check_dispatch_progress (marker TEXT)');
    const before = {
      version: database.query('PRAGMA user_version').get(),
      schema: database
        .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .all(),
      reviews: database.query('SELECT * FROM activation_review_dispatch').all(),
    };
    expect(() => boundaryController(source, () => 1000)).toThrow(
      'activation_check_dispatch_progress already exists',
    );
    expect({
      version: database.query('PRAGMA user_version').get(),
      schema: database
        .query("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name")
        .all(),
      reviews: database.query('SELECT * FROM activation_review_dispatch').all(),
    }).toEqual(before);
  } finally {
    database.close();
  }
});

test('version-7 populated check reservation gains an empty fact table without changing old rows', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  await selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
    invocationId: 'check.invocation.1',
    deadlineAt: 2000,
    maxDispatchAttempts: 3,
  });
  selected.controller.close();
  const database = new Database(selected.source.databasePath);
  try {
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('PRAGMA user_version = 7');
    const before = {
      attempts: database.query('SELECT * FROM activation_check_attempt').all(),
      reservations: database.query('SELECT * FROM activation_check_dispatch').all(),
      progress: database.query('SELECT * FROM activation_check_dispatch_progress').all(),
    };
    const reopened = boundaryController(selected.source, () => 1000);
    try {
      expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
      expect(database.query('SELECT * FROM activation_check_dispatch_fact').all()).toEqual([]);
      expect({
        attempts: database.query('SELECT * FROM activation_check_attempt').all(),
        reservations: database.query('SELECT * FROM activation_check_dispatch').all(),
        progress: database.query('SELECT * FROM activation_check_dispatch_progress').all(),
      }).toEqual(before);
    } finally {
      reopened.close();
    }
  } finally {
    database.close();
  }
});

test('late version-8 migration failure restores version-7 schema and rows after fact DDL', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  await selected.controller.reserveCheckDispatch(selected.lease, 'a'.repeat(64), {
    invocationId: 'check.invocation.1',
    deadlineAt: 2000,
    maxDispatchAttempts: 3,
  });
  selected.controller.close();
  const database = new Database(selected.source.databasePath);
  try {
    database.run('DROP TABLE activation_check_dispatch_fact');
    database.run('PRAGMA user_version = 7');
    database.run('DELETE FROM activation_check_dispatch_progress');
    const snapshot = () => ({
      version: database.query('PRAGMA user_version').get(),
      schema: database
        .query("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name")
        .all(),
      attempts: database.query('SELECT * FROM activation_check_attempt').all(),
      reservations: database.query('SELECT * FROM activation_check_dispatch').all(),
      progress: database.query('SELECT * FROM activation_check_dispatch_progress').all(),
    });
    const before = snapshot();
    expect(() => boundaryController(selected.source, () => 1000)).toThrow(
      'version-7 check dispatch bundle incomplete',
    );
    expect(snapshot()).toEqual(before);
  } finally {
    database.close();
  }
});

test('selected check reservation storage is additive on a fresh controller store', () => {
  const selected = selectedCheckFixture();
  try {
    const database = new Database(selected.source.databasePath);
    try {
      expect(database.query('PRAGMA user_version').get()).toEqual({ user_version: 8 });
      const names = database
        .query(
          "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'activation_check_%' ORDER BY name",
        )
        .all();
      expect(names).toEqual([
        { name: 'activation_check_attempt' },
        { name: 'activation_check_dispatch' },
        { name: 'activation_check_dispatch_fact' },
        { name: 'activation_check_dispatch_progress' },
      ]);
    } finally {
      database.close();
    }
  } finally {
    selected.controller.close();
  }
});

async function rejectsWith(operation: Promise<unknown>, phrase: string): Promise<void> {
  let rejection: unknown;
  try {
    await operation;
  } catch (cause) {
    rejection = cause;
  }
  expect(rejection).toBeInstanceOf(Error);
  if (rejection instanceof Error) expect(rejection.message).toContain(phrase);
}

test('selected check launch preparation requires trusted runtime and grants no execution', async () => {
  const selected = selectedCheckFixture(() => Promise.resolve(selected.bytes));
  try {
    const preparation: unknown = Reflect.get(selected.controller, 'prepareCheckLaunch');
    expect(typeof preparation).toBe('function');
    if (typeof preparation !== 'function') return;
    const prepare: unknown = Reflect.apply(preparation, selected.controller, [
      selected.lease,
      'a'.repeat(64),
    ]);
    await rejectsWith(prepare as Promise<unknown>, 'check runtime resolver absent');
    expect(checkDispatchRows(selected.source.databasePath).attempts).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath).facts).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation returns only frozen inert descriptor data', async () => {
  const selected = selectedLaunchFixture();
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    const plan = await selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
    const runtime: unknown = JSON.parse(selected.runtimeBytes) as unknown;
    const sandboxProfile: unknown = JSON.parse(selected.profileBytes) as unknown;
    expect(plan).toMatchObject({
      requestIdentity: selected.request.requestIdentity,
      commandIdentity: selected.identity,
      request: selected.request,
      manifest: selected.manifest,
      runtime,
      sandboxProfile,
      candidateSnapshot: { root: selected.snapshotRoot, headSha: selected.request.headSha },
    });
    expect(Object.keys(plan).some((key) => ['send', 'spawn', 'receipt'].includes(key))).toBe(false);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation rejects altered or missing trusted runtime and profile', async () => {
  for (const [overrides, phrase] of [
    [{ resolveCheckRuntime: () => Promise.resolve(undefined) }, 'check runtime absent'],
    [
      {
        resolveCheckRuntime: () =>
          Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      },
      'check runtime absent',
    ],
    [
      {
        resolveCheckRuntime: () =>
          Promise.reject(Object.assign(new Error('unreadable'), { code: 'EACCES' })),
      },
      'check runtime unreadable',
    ],
    [{ resolveCheckRuntime: () => Promise.resolve('{}') }, 'check runtime malformed'],
    [
      {
        resolveCheckRuntime: () =>
          Promise.resolve(
            serializeCanonical({
              schemaVersion: 1,
              kind: 'check-runtime',
              executableTreeIdentity: 'f'.repeat(64),
              executables: ['bun'],
            }),
          ),
      },
      'check runtime differs from frozen identity',
    ],
    [{ resolveCheckSandboxProfile: undefined }, 'check sandbox profile resolver absent'],
    [
      { resolveCheckSandboxProfile: () => Promise.resolve(undefined) },
      'check sandbox profile absent',
    ],
    [
      {
        resolveCheckSandboxProfile: () =>
          Promise.reject(Object.assign(new Error('unreadable'), { code: 'EACCES' })),
      },
      'check sandbox profile unreadable',
    ],
    [
      { resolveCheckSandboxProfile: () => Promise.resolve('{}') },
      'check sandbox profile malformed',
    ],
    [
      {
        resolveCheckSandboxProfile: () =>
          Promise.resolve(serializeCanonical({ schemaVersion: 1, kind: 'check-sandbox-profile' })),
      },
      'check sandbox profile malformed',
    ],
    [{ resolveCandidateSnapshot: undefined }, 'check candidate snapshot resolver absent'],
    [
      { resolveCandidateSnapshot: () => Promise.resolve(undefined) },
      'check candidate snapshot absent',
    ],
    [
      {
        resolveCandidateSnapshot: () =>
          Promise.reject(Object.assign(new Error('unreadable'), { code: 'EACCES' })),
      },
      'check candidate snapshot unreadable',
    ],
  ] as const) {
    const selected = selectedLaunchFixture(overrides);
    try {
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
        phrase,
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  }
});

test('selected check launch preparation rejects noncanonical trusted runtime bytes', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', {}, 'bun', 'pretty');
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime malformed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses an oversized canonical runtime descriptor', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', {
    executables: Array.from({ length: 220_000 }, () => 'bun'),
  });
  try {
    expect(selected.runtimeBytes.length).toBeGreaterThan(1_048_576);
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime malformed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation counts UTF-8 descriptor bytes', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', {
    executables: ['bun', 'é'.repeat(600_000)],
  });
  try {
    expect(selected.runtimeBytes.length).toBeLessThan(1_048_576);
    expect(Buffer.byteLength(selected.runtimeBytes, 'utf8')).toBeGreaterThan(1_048_576);
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime malformed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation permits a descriptor at the exact UTF-8 byte cap', async () => {
  const baseline = serializeCanonical({
    schemaVersion: 1,
    kind: 'check-runtime',
    executableTreeIdentity: '8'.repeat(64),
    executables: ['bun', ''],
  });
  const paddingBytes = 1_048_576 - Buffer.byteLength(baseline, 'utf8');
  const selected = selectedLaunchFixture({}, '.', {}, '.', {
    executables: ['bun', 'a'.repeat(paddingBytes)],
  });
  try {
    expect(Buffer.byteLength(selected.runtimeBytes, 'utf8')).toBe(1_048_576);
    const prepared = await selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
    expect(prepared.runtime.executables[1]).toHaveLength(paddingBytes);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses a symlinked main cwd', async () => {
  const selected = selectedLaunchFixture({}, 'escape');
  try {
    symlinkSync(tmpdir(), join(selected.snapshotRoot, 'escape'), 'dir');
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate cwd is not a contained directory',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses a symlinked skip-probe cwd', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, 'escape');
  try {
    symlinkSync(tmpdir(), join(selected.snapshotRoot, 'escape'), 'dir');
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate cwd is not a contained directory',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation rejects a snapshot for a different request', async () => {
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: (request) =>
      Promise.resolve({
        schemaVersion: 1,
        kind: 'candidate-snapshot',
        requestIdentity: 'f'.repeat(64),
        headSha: request.headSha,
        snapshotIdentity: '9'.repeat(64),
        root: tmpdir(),
      }),
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate snapshot differs from current request',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each([
  [
    'head',
    (request: ActivationRequest) => ({
      schemaVersion: 1,
      kind: 'candidate-snapshot',
      requestIdentity: request.requestIdentity,
      headSha: 'f'.repeat(40),
      snapshotIdentity: '9'.repeat(64),
      root: tmpdir(),
    }),
    'check candidate snapshot differs from current request',
  ],
  [
    'relative root',
    (request: ActivationRequest) => ({
      schemaVersion: 1,
      kind: 'candidate-snapshot',
      requestIdentity: request.requestIdentity,
      headSha: request.headSha,
      snapshotIdentity: '9'.repeat(64),
      root: 'relative-source',
    }),
    'check candidate snapshot root is not absolute',
  ],
] as const)(
  'selected check launch preparation refuses wrong snapshot %s',
  async (_name, snapshot, phrase) => {
    const selected = selectedLaunchFixture({
      resolveCandidateSnapshot: (request) => Promise.resolve(snapshot(request)),
    });
    try {
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
        phrase,
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  },
);

test('selected check launch preparation refuses a symlinked snapshot root', async () => {
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: (request) =>
      Promise.resolve({
        schemaVersion: 1,
        kind: 'candidate-snapshot',
        requestIdentity: request.requestIdentity,
        headSha: request.headSha,
        snapshotIdentity: '9'.repeat(64),
        root: `${selected.snapshotRoot}-link`,
      }),
  });
  const link = `${selected.snapshotRoot}-link`;
  scratch.push(link);
  symlinkSync(selected.snapshotRoot, link, 'dir');
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate cwd is not a contained directory',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each(['link', 'link/', 'link/.', 'link/nested'] as const)(
  'selected check launch preparation refuses snapshot root through %s',
  async (suffix) => {
    const selected = selectedLaunchFixture({
      resolveCandidateSnapshot: (request) =>
        Promise.resolve({
          schemaVersion: 1,
          kind: 'candidate-snapshot',
          requestIdentity: request.requestIdentity,
          headSha: request.headSha,
          snapshotIdentity: '9'.repeat(64),
          root: `${selected.snapshotRoot}/${suffix}`,
        }),
    });
    const destination = mkdtempSync(join(tmpdir(), 'activation-snapshot-target-'));
    scratch.push(destination);
    mkdirSync(join(destination, 'nested'));
    symlinkSync(destination, join(selected.snapshotRoot, 'link'), 'dir');
    try {
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
        'check candidate cwd is not a contained directory',
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  },
);

test('selected check launch preparation refuses a lexical dot in a normal snapshot root', async () => {
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: (request) =>
      Promise.resolve({
        schemaVersion: 1,
        kind: 'candidate-snapshot',
        requestIdentity: request.requestIdentity,
        headSha: request.headSha,
        snapshotIdentity: '9'.repeat(64),
        root: `${selected.snapshotRoot}/.`,
      }),
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate cwd is not a contained directory',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation permits a normal nested snapshot root', async () => {
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: (request) =>
      Promise.resolve({
        schemaVersion: 1,
        kind: 'candidate-snapshot',
        requestIdentity: request.requestIdentity,
        headSha: request.headSha,
        snapshotIdentity: '9'.repeat(64),
        root: join(selected.snapshotRoot, 'source', 'nested'),
      }),
  });
  try {
    mkdirSync(join(selected.snapshotRoot, 'source'));
    mkdirSync(join(selected.snapshotRoot, 'source', 'nested'));
    const before = checkDispatchRows(selected.source.databasePath);
    const prepared = await selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
    expect(prepared.candidateSnapshot.root).toBe(join(selected.snapshotRoot, 'source', 'nested'));
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

function selectedStageFixture(
  overrides: Partial<
    Pick<
      ActivationControllerOptions,
      | 'resolveCandidateSnapshot'
      | 'resolveCandidateTree'
      | 'resolveExecutableTree'
      | 'stageDiagnostics'
    >
  > = {},
  profileChanges: Record<string, unknown> = {},
  candidateEntries: readonly unknown[] = [
    { path: 'main.txt', type: 'file', mode: 420, size: 4, sha256: hashBytes('main') },
  ],
  sourceRoot?: string,
  runtimeIdentity?: string,
) {
  const executableTreeBytes = serializeCanonical({
    schemaVersion: 1,
    kind: 'executable-tree',
    entries: [{ path: 'bun', type: 'file', mode: 493, size: 7, sha256: hashBytes('runtime') }],
  });
  const runtimeRoot = mkdtempSync(join(tmpdir(), 'activation-runtime-source-'));
  scratch.push(runtimeRoot);
  const stageBase = mkdtempSync(join(tmpdir(), 'activation-stage-base-'));
  scratch.push(stageBase);
  writeFileSync(join(runtimeRoot, 'bun'), 'runtime', { mode: 0o755 });
  const candidateTreeBytes = (request: ActivationRequest) =>
    serializeCanonical({
      schemaVersion: 1,
      kind: 'candidate-snapshot',
      requestIdentity: request.requestIdentity,
      headSha: request.headSha,
      entries: candidateEntries,
    });
  const selected = selectedLaunchFixture(
    {
      resolveCandidateSnapshot: (request) =>
        Promise.resolve({
          schemaVersion: 1,
          kind: 'candidate-snapshot',
          requestIdentity: request.requestIdentity,
          headSha: request.headSha,
          snapshotIdentity: hashBytes(candidateTreeBytes(request)),
          root: sourceRoot ?? selected.snapshotRoot,
        }),
      resolveCandidateTree: (request) =>
        Promise.resolve({
          bytes: candidateTreeBytes(request),
          root: sourceRoot ?? selected.snapshotRoot,
        }),
      resolveExecutableTree: () =>
        Promise.resolve({ bytes: executableTreeBytes, root: runtimeRoot }),
      stageBase,
      ...overrides,
    },
    '.',
    profileChanges,
    '.',
    { executableTreeIdentity: runtimeIdentity ?? hashBytes(executableTreeBytes) },
  );
  writeFileSync(join(sourceRoot ?? selected.snapshotRoot, 'main.txt'), 'main', { mode: 0o644 });
  return {
    ...selected,
    snapshotRoot: sourceRoot ?? selected.snapshotRoot,
    runtimeRoot,
    stageBase,
    candidateTreeBytes,
    executableTreeBytes,
  };
}

function selectedAlteredCandidateFixture(fault: 'noncanonical' | 'digest' | 'request' | 'head') {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'activation-candidate-identity-'));
  scratch.push(sourceRoot);
  const manifest = (request: ActivationRequest) => {
    const bytes = serializeCanonical({
      schemaVersion: 1,
      kind: 'candidate-snapshot',
      requestIdentity: fault === 'request' ? 'f'.repeat(64) : request.requestIdentity,
      headSha: fault === 'head' ? 'f'.repeat(40) : request.headSha,
      entries: [{ path: 'main.txt', type: 'file', mode: 420, size: 4, sha256: hashBytes('main') }],
    });
    return fault === 'noncanonical' ? ` ${bytes}` : bytes;
  };
  return selectedStageFixture(
    {
      resolveCandidateSnapshot: (request) =>
        Promise.resolve({
          schemaVersion: 1,
          kind: 'candidate-snapshot',
          requestIdentity: request.requestIdentity,
          headSha: request.headSha,
          snapshotIdentity:
            fault === 'digest' ? hashBytes('wrong tree') : hashBytes(manifest(request)),
          root: sourceRoot,
        }),
      resolveCandidateTree: (request) =>
        Promise.resolve({ bytes: manifest(request), root: sourceRoot }),
    },
    {},
    undefined,
    sourceRoot,
  );
}

test.each([
  ['noncanonical', 'check candidate tree malformed'],
  ['digest', 'check candidate tree differs from frozen identity'],
  ['request', 'check candidate tree differs from current request'],
  ['head', 'check candidate tree differs from current request'],
] as const)('selected check refuses %s candidate tree binding', async (fault, phrase) => {
  const selected = selectedAlteredCandidateFixture(fault);
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)), phrase);
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check refuses runtime tree bytes under a different frozen identity', async () => {
  const selected = selectedStageFixture(
    {},
    {},
    undefined,
    undefined,
    hashBytes('wrong runtime tree'),
  );
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime tree differs from frozen identity',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check refuses noncanonical runtime tree bytes even under their frozen digest', async () => {
  const canonical = serializeCanonical({
    schemaVersion: 1,
    kind: 'executable-tree',
    entries: [{ path: 'bun', type: 'file', mode: 493, size: 7, sha256: hashBytes('runtime') }],
  });
  const altered = ` ${canonical}`;
  const selected = selectedStageFixture(
    {
      resolveExecutableTree: () => Promise.resolve({ bytes: altered, root: selected.runtimeRoot }),
    },
    {},
    undefined,
    undefined,
    hashBytes(altered),
  );
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime tree malformed',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check stages only bytes from trusted complete-tree manifests', async () => {
  const selected = selectedStageFixture();
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    const staged = await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    try {
      expect(readFileSync(join(staged.stageRoot, 'candidate', 'main.txt'), 'utf8')).toBe('main');
      expect(readFileSync(join(staged.stageRoot, 'runtime', 'bun'), 'utf8')).toBe('runtime');
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
      const openTargets = readdirSync('/proc/self/fd').flatMap((entry) => {
        try {
          return [readlinkSync(`/proc/self/fd/${entry}`)];
        } catch (cause) {
          // /proc can close its own listing descriptor before readlink.
          if (!(cause instanceof Error && cause.message.includes('ENOENT'))) throw cause;
          return [];
        }
      });
      expect(openTargets.some((target) => target.startsWith(selected.snapshotRoot))).toBe(false);
      expect(openTargets.some((target) => target.startsWith(selected.runtimeRoot))).toBe(false);
    } finally {
      staged.dispose();
    }
  } finally {
    selected.controller.close();
  }
});

test('selected check traverses a renamed ancestor through its retained directory descriptor', async () => {
  const outer = mkdtempSync(join(tmpdir(), 'activation-ancestor-'));
  scratch.push(outer);
  const sourceRoot = join(outer, 'source');
  mkdirSync(sourceRoot);
  const selected = selectedStageFixture(
    {
      stageDiagnostics: {
        afterDirectoryOpened: (kind, path) => {
          if (kind !== 'candidate' || path !== outer) return;
          const moved = `${outer}-moved`;
          scratch.push(moved);
          renameSync(outer, moved);
          mkdirSync(outer);
          mkdirSync(join(outer, 'source'));
          writeFileSync(join(outer, 'source', 'main.txt'), 'evil');
        },
      },
    },
    {},
    undefined,
    sourceRoot,
  );
  try {
    const staged = await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    try {
      expect(readFileSync(join(staged.stageRoot, 'candidate', 'main.txt'), 'utf8')).toBe('main');
    } finally {
      staged.dispose();
    }
  } finally {
    selected.controller.close();
  }
});

test.each(['hash', 'mode', 'hardlink', 'extra'] as const)(
  'selected check refuses runtime tree %s mismatch and cleans candidate staging',
  async (fault) => {
    const selected = selectedStageFixture({
      stageDiagnostics: {
        afterTreeCopied: (kind) => {
          if (kind !== 'candidate') return;
          const visible = readdirSync(selected.stageBase);
          expect(visible).toHaveLength(1);
          expect(visible[0]?.startsWith('.pending-')).toBe(true);
        },
      },
    });
    try {
      const executable = join(selected.runtimeRoot, 'bun');
      if (fault === 'hash') writeFileSync(executable, 'changed');
      if (fault === 'mode') chmodSync(executable, 0o644);
      if (fault === 'hardlink') {
        const external = mkdtempSync(join(tmpdir(), 'activation-runtime-hardlink-'));
        scratch.push(external);
        linkSync(executable, join(external, 'sibling'));
      }
      if (fault === 'extra') writeFileSync(join(selected.runtimeRoot, 'unlisted'), 'x');
      const descriptorsBefore = readdirSync('/proc/self/fd').length;
      await rejectsWith(
        selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
        'check runtime tree source differs from manifest',
      );
      expect(readdirSync(selected.stageBase)).toEqual([]);
      const openTargets = readdirSync('/proc/self/fd').flatMap((entry) => {
        try {
          return [readlinkSync(`/proc/self/fd/${entry}`)];
        } catch (cause) {
          // /proc lists a transient directory FD that can close before readlink.
          if (!(cause instanceof Error && cause.message.includes('ENOENT'))) throw cause;
          return [];
        }
      });
      expect(openTargets.some((target) => target.startsWith(selected.snapshotRoot))).toBe(false);
      expect(openTargets.some((target) => target.startsWith(selected.runtimeRoot))).toBe(false);
      expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(descriptorsBefore);
    } finally {
      selected.controller.close();
    }
  },
);

test.each([
  ['attempt', "UPDATE activation_obligation SET attempt = 1 WHERE kind = 'check'"],
  ['lease', 'UPDATE activation_request SET lease_expires_at = 1000'],
  ['authority', `UPDATE activation_request SET bootstrap_identity = '${'f'.repeat(64)}'`],
  ['generation', 'UPDATE activation_subject SET high_water_generation = high_water_generation + 1'],
  ['plan', "UPDATE activation_obligation SET executor_id = 'other.audit' WHERE kind = 'audit'"],
  ['current', 'UPDATE activation_request SET current = 0'],
] as const)(
  'held candidate tree resolution refuses changed %s before staging',
  async (_name, mutation) => {
    let release: ((source: unknown) => void) | undefined;
    let entered: (() => void) | undefined;
    let observedRequest: ActivationRequest | undefined;
    let executableCalls = 0;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const selected = selectedStageFixture({
      resolveCandidateTree: (request) => {
        observedRequest = request;
        entered?.();
        return held;
      },
      resolveExecutableTree: () => {
        executableCalls += 1;
        return Promise.resolve({ bytes: selected.executableTreeBytes, root: selected.runtimeRoot });
      },
    });
    const database = new Database(selected.source.databasePath);
    try {
      const pending = selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
      await started;
      database.run(mutation);
      const before = checkDispatchRows(selected.source.databasePath);
      if (observedRequest === undefined) throw new Error('candidate tree request absent');
      release?.({
        bytes: selected.candidateTreeBytes(observedRequest),
        root: selected.snapshotRoot,
      });
      await rejectsWith(pending, 'selected check');
      expect(executableCalls).toBe(0);
      expect(readdirSync(selected.stageBase)).toEqual([]);
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test('selected check discards a complete staged tree if its current request changes before return', async () => {
  const database: { current: Database | undefined } = { current: undefined };
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterTreeCopied: (kind) => {
        if (kind === 'runtime') database.current?.run('UPDATE activation_request SET current = 0');
      },
    },
  });
  database.current = new Database(selected.source.databasePath);
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'selected check',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).not.toEqual(before);
  } finally {
    database.current.close();
    selected.controller.close();
  }
});

test('selected check refuses a staged file changed after its source tree was copied', async () => {
  let runtimeCopied = 0;
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterTreeCopied: (kind, pendingRoot) => {
        if (kind !== 'runtime') return;
        runtimeCopied += 1;
        writeFileSync(join(pendingRoot, '..', 'candidate', 'main.txt'), 'evil');
      },
    },
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'staged check tree differs from manifest',
    );
    expect(runtimeCopied).toBe(1);
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check refuses a trusted tree manifest whose full digest differs from its snapshot identity', async () => {
  const selected = selectedStageFixture({
    resolveCandidateTree: (request) =>
      Promise.resolve({
        bytes: serializeCanonical({
          schemaVersion: 1,
          kind: 'candidate-snapshot',
          requestIdentity: request.requestIdentity,
          headSha: request.headSha,
          entries: [{ path: 'main.txt', type: 'file', mode: 420, size: 4, sha256: 'f'.repeat(64) }],
        }),
        root: selected.snapshotRoot,
      }),
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree differs from frozen identity',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each(['extra', 'hardlink', 'fifo'] as const)(
  'selected check refuses %s in source and cleans its private stage',
  async (fault) => {
    const selected = selectedStageFixture();
    try {
      if (fault === 'extra') writeFileSync(join(selected.snapshotRoot, 'extra.txt'), 'extra');
      if (fault === 'hardlink') {
        const original = join(selected.snapshotRoot, 'main.txt');
        const external = mkdtempSync(join(tmpdir(), 'activation-hardlink-'));
        scratch.push(external);
        linkSync(original, join(external, 'sibling'));
      }
      if (fault === 'fifo') {
        rmSync(join(selected.snapshotRoot, 'main.txt'));
        const created = spawnSync('mkfifo', [join(selected.snapshotRoot, 'main.txt')]);
        expect(created.status).toBe(0);
      }
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
        'check candidate tree source differs from manifest',
      );
      expect(readdirSync(selected.stageBase)).toEqual([]);
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  },
);

test('selected check stages verified bytes after its opened root is renamed and replaced', async () => {
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterRootOpened: (kind) => {
        if (kind !== 'candidate') return;
        const moved = `${selected.snapshotRoot}-moved`;
        scratch.push(moved);
        renameSync(selected.snapshotRoot, moved);
        mkdirSync(selected.snapshotRoot);
        writeFileSync(join(selected.snapshotRoot, 'main.txt'), 'evil');
      },
    },
  });
  try {
    const staged = await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    try {
      expect(readFileSync(join(staged.stageRoot, 'candidate', 'main.txt'), 'utf8')).toBe('main');
    } finally {
      staged.dispose();
    }
  } finally {
    selected.controller.close();
  }
});

test('selected check refuses a leaf replaced after its root descriptor was selected', async () => {
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterRootOpened: (kind) => {
        if (kind !== 'candidate') return;
        rmSync(join(selected.snapshotRoot, 'main.txt'));
        writeFileSync(join(selected.snapshotRoot, 'main.txt'), 'evil');
      },
    },
  });
  try {
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree source differs from manifest',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test('selected check copies from the opened leaf rather than reopening its replaced pathname', async () => {
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterFileOpened: (kind, path) => {
        if (kind !== 'candidate' || path !== 'main.txt') return;
        const external = mkdtempSync(join(tmpdir(), 'activation-open-leaf-'));
        scratch.push(external);
        renameSync(join(selected.snapshotRoot, 'main.txt'), join(external, 'original'));
        writeFileSync(join(selected.snapshotRoot, 'main.txt'), 'evil');
      },
    },
  });
  try {
    const staged = await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    try {
      expect(readFileSync(join(staged.stageRoot, 'candidate', 'main.txt'), 'utf8')).toBe('main');
    } finally {
      staged.dispose();
    }
  } finally {
    selected.controller.close();
  }
});

test('selected check refuses a closed and reused source descriptor', async () => {
  let reusedDescriptor: number | undefined;
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterFileOpened: (kind, path, control) => {
        if (kind !== 'candidate' || path !== 'main.txt') return;
        const external = mkdtempSync(join(tmpdir(), 'activation-reused-fd-'));
        scratch.push(external);
        const replacement = join(external, 'same-bytes');
        writeFileSync(replacement, 'main', { mode: 0o644 });
        const original = statSync(join(selected.snapshotRoot, 'main.txt'));
        utimesSync(replacement, original.atime, original.mtime);
        const before = readdirSync('/proc/self/fd');
        control.closeOpenedFile();
        expect(() => {
          control.closeOpenedFile();
        }).toThrow('check tree file control expired');
        const closed = before.filter((entry) => !readdirSync('/proc/self/fd').includes(entry));
        reusedDescriptor = openSync(replacement, constants.O_RDONLY);
        expect(closed).toHaveLength(1);
        expect(String(reusedDescriptor)).toBe(closed[0]);
      },
    },
  });
  try {
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree source differs from manifest',
    );
    if (reusedDescriptor === undefined) throw new Error('reused descriptor absent');
    expect(fstatSync(reusedDescriptor).isFile()).toBe(true);
    expect(readdirSync(selected.stageBase)).toEqual([]);
  } finally {
    if (reusedDescriptor !== undefined) closeSync(reusedDescriptor);
    selected.controller.close();
  }
});

test('selected check expires an unused file control when its callback returns', async () => {
  let closeLater: (() => void) | undefined;
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterFileOpened: (kind, path, control) => {
        if (kind === 'candidate' && path === 'main.txt')
          closeLater = () => {
            control.closeOpenedFile();
          };
      },
    },
  });
  try {
    const staged = await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    try {
      if (closeLater === undefined) throw new Error('file control absent');
      expect(closeLater).toThrow('check tree file control expired');
      expect(readFileSync(join(staged.stageRoot, 'candidate', 'main.txt'), 'utf8')).toBe('main');
    } finally {
      staged.dispose();
    }
  } finally {
    selected.controller.close();
  }
});

test('selected check never closes a caller descriptor reopened on the same inode', async () => {
  let reopened: number | undefined;
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterFileOpened: (kind, path, control) => {
        if (kind !== 'candidate' || path !== 'main.txt') return;
        const before = readdirSync('/proc/self/fd');
        control.closeOpenedFile();
        const closed = before.filter((entry) => !readdirSync('/proc/self/fd').includes(entry));
        reopened = openSync(join(selected.snapshotRoot, 'main.txt'), constants.O_RDONLY);
        expect(closed).toHaveLength(1);
        expect(String(reopened)).toBe(closed[0]);
      },
    },
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree source differs from manifest',
    );
    if (reopened === undefined) throw new Error('same-inode reopen absent');
    expect(fstatSync(reopened).isFile()).toBe(true);
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    if (reopened !== undefined) closeSync(reopened);
    selected.controller.close();
  }
});

test('selected check closes remaining owned descriptors after a leaf descriptor was closed', async () => {
  const selected = selectedStageFixture({
    stageDiagnostics: {
      afterFileOpened: (kind, path, control) => {
        if (kind === 'candidate' && path === 'main.txt') control.closeOpenedFile();
      },
    },
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    const descriptorsBefore = readdirSync('/proc/self/fd').length;
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree source differs from manifest',
    );
    expect(readdirSync('/proc/self/fd').length).toBe(descriptorsBefore);
    expect(readdirSync(selected.stageBase)).toEqual([]);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each([
  ['maxManifestBytes', { maxManifestBytes: 40 }],
  ['maxPathBytes', { maxPathBytes: 4 }],
  ['maxFileBytes', { maxFileBytes: 3 }],
  ['maxTotalBytes', { maxTotalBytes: 3 }],
] as const)('selected check refuses exhausted %s staging budget', async (_name, profileChanges) => {
  let fileOpens = 0;
  const selected = selectedStageFixture(
    {
      stageDiagnostics: {
        afterFileOpened: () => {
          fileOpens += 1;
        },
      },
    },
    profileChanges,
  );
  try {
    let failure: unknown;
    try {
      await selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64));
    } catch (cause) {
      failure = cause;
    }
    expect(fileOpens).toBe(0);
    expect(failure).toBeInstanceOf(Error);
    if (failure instanceof Error)
      expect(failure.message).toContain('check candidate tree malformed');
    expect(readdirSync(selected.stageBase)).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test.each([
  [
    'maxEntries',
    { maxEntries: 1 },
    [
      { path: 'main.txt', type: 'file', mode: 420, size: 4, sha256: hashBytes('main') },
      { path: 'other.txt', type: 'file', mode: 420, size: 4, sha256: hashBytes('main') },
    ],
  ],
  [
    'maxDepth',
    { maxDepth: 1 },
    [
      { path: 'sub', type: 'directory', mode: 493 },
      { path: 'sub/leaf', type: 'file', mode: 420, size: 4, sha256: hashBytes('main') },
    ],
  ],
] as const)(
  'selected check refuses exhausted %s inventory budget',
  async (_name, profile, entries) => {
    const selected = selectedStageFixture({}, profile, entries);
    try {
      if (_name === 'maxEntries')
        writeFileSync(join(selected.snapshotRoot, 'other.txt'), 'main', { mode: 0o644 });
      if (_name === 'maxDepth') {
        rmSync(join(selected.snapshotRoot, 'main.txt'));
        mkdirSync(join(selected.snapshotRoot, 'sub'));
        chmodSync(join(selected.snapshotRoot, 'sub'), 0o755);
        writeFileSync(join(selected.snapshotRoot, 'sub', 'leaf'), 'main', { mode: 0o644 });
      }
      await rejectsWith(
        selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
        'check candidate tree malformed',
      );
      expect(readdirSync(selected.stageBase)).toEqual([]);
    } finally {
      selected.controller.close();
    }
  },
);

test.each([
  ['duplicate', ['main.txt', 'main.txt']],
  ['dot', ['main.txt', 'a/./b']],
  ['parent', ['main.txt', 'a/../b']],
  ['backslash', ['main.txt', 'a\\b']],
  ['normalization alias', ['main.txt', 'e\u0301']],
  ['missing parent', ['main.txt', 'sub/leaf']],
] as const)('selected check refuses %s trusted inventory paths', async (_name, paths) => {
  const entries = paths.map((path) => ({
    path,
    type: 'file',
    mode: 420,
    size: 4,
    sha256: hashBytes('main'),
  }));
  const selected = selectedStageFixture({}, {}, entries);
  try {
    await rejectsWith(
      selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check candidate tree malformed',
    );
    expect(readdirSync(selected.stageBase)).toEqual([]);
  } finally {
    selected.controller.close();
  }
});

test.each(['mode', 'size', 'hash', 'missing', 'symlink'] as const)(
  'selected check refuses source %s mismatch before exposing a stage',
  async (fault) => {
    let copiedTrees = 0;
    const selected = selectedStageFixture({
      stageDiagnostics: {
        afterTreeCopied: () => {
          copiedTrees += 1;
        },
      },
    });
    try {
      const source = join(selected.snapshotRoot, 'main.txt');
      if (fault === 'mode') chmodSync(source, 0o755);
      if (fault === 'size') writeFileSync(source, 'longer');
      if (fault === 'hash') writeFileSync(source, 'evil');
      if (fault === 'missing') rmSync(source);
      if (fault === 'symlink') {
        rmSync(source);
        const external = mkdtempSync(join(tmpdir(), 'activation-symlink-target-'));
        scratch.push(external);
        const target = join(external, 'same-bytes');
        writeFileSync(target, 'main', { mode: 0o644 });
        symlinkSync(target, source, 'file');
      }
      await rejectsWith(
        selected.controller.stageCheckLaunch(selected.lease, 'a'.repeat(64)),
        'check candidate tree source differs from manifest',
      );
      expect(copiedTrees).toBe(0);
      expect(readdirSync(selected.stageBase)).toEqual([]);
    } finally {
      selected.controller.close();
    }
  },
);

test('selected check launch preparation refuses a snapshot without a valid content identity', async () => {
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: (request) =>
      Promise.resolve({
        schemaVersion: 1,
        kind: 'candidate-snapshot',
        requestIdentity: request.requestIdentity,
        headSha: request.headSha,
        snapshotIdentity: 'unverified',
        root: selected.snapshotRoot,
      }),
  });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'Validation failed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses runtime without the frozen main or probe executable', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', { executables: ['node'] });
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check launch descriptor cannot run frozen commands',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses runtime without the frozen probe executable', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', {}, 'node');
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check launch descriptor cannot run frozen commands',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses runtime without the frozen main executable', async () => {
  const selected = selectedLaunchFixture({}, '.', {}, '.', {}, 'bun', 'canonical', 'node');
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check launch descriptor cannot run frozen commands',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check launch preparation refuses a host executable path in a trusted runtime', async () => {
  const selected = selectedLaunchFixture(
    {},
    '.',
    {},
    '.',
    { executables: ['/usr/bin/bun', 'bun'] },
    'bun',
    'canonical',
    '/usr/bin/bun',
  );
  try {
    const before = checkDispatchRows(selected.source.databasePath);
    await rejectsWith(
      selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
      'check runtime malformed',
    );
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test.each([
  [
    'host mount',
    { readOnlyMounts: ['candidate-source', 'toolchain-runtime', '/home'] },
    'check sandbox profile malformed',
  ],
  [
    'writable candidate source',
    { writableMounts: ['workspace', 'tmp', 'home', 'candidate-source'] },
    'check sandbox profile malformed',
  ],
  [
    'host device',
    { virtualMounts: ['proc', 'dev', '/dev/kvm'] },
    'check sandbox profile malformed',
  ],
  [
    'inherited environment',
    { environmentAllowlist: ['CI', 'HOME'] },
    'check sandbox profile malformed',
  ],
  ['shared namespace', { namespaces: 'host' }, 'check sandbox profile malformed'],
  ['shared network', { network: 'host' }, 'check sandbox profile malformed'],
  ['retained capabilities', { capabilities: 'keep' }, 'check sandbox profile malformed'],
  ['inherited descriptors', { descriptors: 'all' }, 'check sandbox profile malformed'],
  ['unbounded memory', { memoryBytes: 4_294_967_297 }, 'check sandbox profile malformed'],
  ['unbounded wall time', { wallTimeMilliseconds: 600_001 }, 'check sandbox profile malformed'],
  ['unbounded CPU time', { cpuTimeMilliseconds: 600_001 }, 'check sandbox profile malformed'],
  ['unbounded process count', { processCount: 65 }, 'check sandbox profile malformed'],
  ['unbounded output', { maxOutputBytes: 10_485_761 }, 'check sandbox profile malformed'],
  ['unbounded manifest', { maxManifestBytes: 1_048_577 }, 'check sandbox profile malformed'],
  ['unbounded entries', { maxEntries: 10_001 }, 'check sandbox profile malformed'],
  ['unbounded depth', { maxDepth: 65 }, 'check sandbox profile malformed'],
  ['unbounded path', { maxPathBytes: 4_097 }, 'check sandbox profile malformed'],
  ['unbounded file', { maxFileBytes: 536_870_913 }, 'check sandbox profile malformed'],
  ['unbounded tree', { maxTotalBytes: 1_073_741_825 }, 'check sandbox profile malformed'],
  ['zero manifest', { maxManifestBytes: 0 }, 'check sandbox profile malformed'],
  ['zero entries', { maxEntries: 0 }, 'check sandbox profile malformed'],
  ['zero depth', { maxDepth: 0 }, 'check sandbox profile malformed'],
  ['zero path', { maxPathBytes: 0 }, 'check sandbox profile malformed'],
  ['zero file', { maxFileBytes: 0 }, 'check sandbox profile malformed'],
  ['zero tree', { maxTotalBytes: 0 }, 'check sandbox profile malformed'],
  ['zero CPU budget', { cpuTimeMilliseconds: 0 }, 'check sandbox profile malformed'],
  ['zero memory budget', { memoryBytes: 0 }, 'check sandbox profile malformed'],
  ['zero process budget', { processCount: 0 }, 'check sandbox profile malformed'],
  [
    'short wall budget',
    { wallTimeMilliseconds: 29_999 },
    'check launch descriptor cannot run frozen commands',
  ],
  [
    'short output budget',
    { maxOutputBytes: 16_383 },
    'check launch descriptor cannot run frozen commands',
  ],
] as const)(
  'selected check launch preparation refuses %s profile policy',
  async (_policy, changes, phrase) => {
    const selected = selectedLaunchFixture({}, '.', changes);
    try {
      const before = checkDispatchRows(selected.source.databasePath);
      await rejectsWith(
        selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64)),
        phrase,
      );
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      selected.controller.close();
    }
  },
);

test.each([
  [
    'attempt',
    "UPDATE activation_obligation SET attempt = 1 WHERE kind = 'check'",
    'selected check changed during launch preparation',
  ],
  [
    'lease',
    'UPDATE activation_request SET lease_expires_at = 1000',
    'selected check lease changed',
  ],
  [
    'authority',
    `UPDATE activation_request SET bootstrap_identity = '${'f'.repeat(64)}'`,
    'selected check authority changed',
  ],
  [
    'generation',
    'UPDATE activation_subject SET high_water_generation = high_water_generation + 1',
    'selected check generation changed',
  ],
  [
    'plan',
    "UPDATE activation_obligation SET executor_id = 'other.audit' WHERE kind = 'audit'",
    'selected check frozen plan changed',
  ],
  [
    'current',
    'UPDATE activation_request SET current = 0',
    'selected check request is not current evaluating',
  ],
] as const)(
  'held runtime resolution refuses changed %s without producing a launch plan',
  async (_boundary, mutation, phrase) => {
    let releaseRuntime: ((bytes: string) => void) | undefined;
    let started: (() => void) | undefined;
    let profileCalls = 0;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<string>((resolve) => {
      releaseRuntime = resolve;
    });
    const selected = selectedLaunchFixture({
      resolveCheckRuntime: () => {
        started?.();
        return held;
      },
      resolveCheckSandboxProfile: () => {
        profileCalls += 1;
        return Promise.resolve(selected.profileBytes);
      },
    });
    const database = new Database(selected.source.databasePath);
    try {
      const pending = selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
      await entered;
      database.run(mutation);
      const before = checkDispatchRows(selected.source.databasePath);
      releaseRuntime?.(selected.runtimeBytes);
      await rejectsWith(pending, phrase);
      expect(profileCalls).toBe(0);
      expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      selected.controller.close();
    }
  },
);

test('held profile resolution refuses changed selected attempt before snapshot access', async () => {
  let releaseProfile: ((bytes: string) => void) | undefined;
  let started: (() => void) | undefined;
  let snapshotCalls = 0;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<string>((resolve) => {
    releaseProfile = resolve;
  });
  const selected = selectedLaunchFixture({
    resolveCheckSandboxProfile: () => {
      started?.();
      return held;
    },
    resolveCandidateSnapshot: () => {
      snapshotCalls += 1;
      return Promise.resolve(null);
    },
  });
  const database = new Database(selected.source.databasePath);
  try {
    const pending = selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
    await entered;
    database.run("UPDATE activation_obligation SET attempt = 1 WHERE kind = 'check'");
    const before = checkDispatchRows(selected.source.databasePath);
    releaseProfile?.(selected.profileBytes);
    await rejectsWith(pending, 'selected check changed during launch preparation');
    expect(snapshotCalls).toBe(0);
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('held snapshot resolution refuses an expired lease before returning inert data', async () => {
  let releaseSnapshot: ((snapshot: unknown) => void) | undefined;
  let started: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<unknown>((resolve) => {
    releaseSnapshot = resolve;
  });
  const selected = selectedLaunchFixture({
    resolveCandidateSnapshot: () => {
      started?.();
      return held;
    },
  });
  const database = new Database(selected.source.databasePath);
  try {
    const pending = selected.controller.prepareCheckLaunch(selected.lease, 'a'.repeat(64));
    await entered;
    database.run('UPDATE activation_request SET lease_expires_at = 1000');
    const before = checkDispatchRows(selected.source.databasePath);
    releaseSnapshot?.({
      schemaVersion: 1,
      kind: 'candidate-snapshot',
      requestIdentity: selected.request.requestIdentity,
      headSha: selected.request.headSha,
      snapshotIdentity: '9'.repeat(64),
      root: selected.snapshotRoot,
    });
    await rejectsWith(pending, 'selected check lease changed');
    expect(checkDispatchRows(selected.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    selected.controller.close();
  }
});

test('selected check preparation refuses absent, unreadable and malformed trusted manifests', async () => {
  const cases: {
    name: string;
    resolve?: (identity: string) => Promise<unknown>;
    message: string;
  }[] = [
    { name: 'resolver absent', message: 'check invocation manifest resolver absent' },
    {
      name: 'manifest absent',
      resolve: () => Promise.reject(Object.assign(new Error('absent'), { code: 'ENOENT' })),
      message: 'check invocation manifest absent',
    },
    {
      name: 'manifest unreadable',
      resolve: () => Promise.reject(Object.assign(new Error('unreadable'), { code: 'EACCES' })),
      message: 'check invocation manifest unreadable',
    },
    {
      name: 'manifest malformed',
      resolve: () => Promise.resolve('{broken'),
      message: 'check invocation manifest malformed',
    },
  ];
  for (const scenario of cases) {
    const selected = selectedCheckFixture(scenario.resolve);
    try {
      const before = selected.controller.listRequests();
      await rejectsWith(
        selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
        scenario.message,
      );
      expect(selected.controller.listRequests(), scenario.name).toEqual(before);
    } finally {
      selected.controller.close();
    }
  }
});

test('selected check preparation refuses substituted or noncanonical manifest bytes', async () => {
  let response = '';
  const selected = selectedCheckFixture(() => Promise.resolve(response));
  try {
    const before = selected.controller.listRequests();
    response = serializeCanonical({ ...selected.manifest, argv: ['bun', 'test', 'other.test.ts'] });
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest differs from frozen command',
    );
    response = JSON.stringify(selected.manifest);
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest malformed',
    );
    expect(selected.controller.listRequests()).toEqual(before);
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation rejects noncanonical bytes even when their digest is frozen', async () => {
  const baseline = selectedCheckFixture();
  baseline.controller.close();
  const bytes = JSON.stringify(baseline.manifest);
  const selected = selectedCheckFixture(
    () => Promise.resolve(bytes),
    baseline.manifest,
    hashBytes(bytes),
  );
  try {
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest malformed',
    );
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation rechecks its frozen attempt after a held resolver', async () => {
  let release: ((bytes: string) => void) | undefined;
  const held = new Promise<string>((resolve) => {
    release = resolve;
  });
  let resolving: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    resolving = resolve;
  });
  const selected = selectedCheckFixture(() => {
    resolving?.();
    return held;
  });
  try {
    const pending = selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64));
    await entered;
    const database = new Database(selected.source.databasePath);
    try {
      database
        .query(
          'UPDATE activation_obligation SET attempt = 1 WHERE request_identity = ? AND kind = ?',
        )
        .run(selected.request.requestIdentity, 'check');
    } finally {
      database.close();
    }
    release?.(selected.bytes);
    await rejectsWith(pending, 'selected check changed during manifest resolution');
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation rejects unsafe paths, environment and legacy manifests', async () => {
  const baseline = selectedCheckFixture();
  baseline.controller.close();
  const cases = [
    { ...baseline.manifest, schemaVersion: 0 },
    { ...baseline.manifest, cwd: '../journal' },
    { ...baseline.manifest, cwd: 'workspace\0journal' },
    { ...baseline.manifest, argv: [] },
    { ...baseline.manifest, env: { PUBLISHER_TOKEN: 'sentinel' } },
    { ...baseline.manifest, skipProbe: { argv: ['bun', 'test'], cwd: '/journal', env: {} } },
    { ...baseline.manifest, skipProbe: { argv: ['bun', 'test'], cwd: 'probe\0journal', env: {} } },
    { ...baseline.manifest, timeoutMilliseconds: 0 },
    { ...baseline.manifest, timeoutMilliseconds: 600_001 },
    { ...baseline.manifest, maxOutputBytes: 0 },
    { ...baseline.manifest, maxOutputBytes: 10_485_761 },
  ];
  for (const manifest of cases) {
    const bytes = serializeCanonical(manifest);
    const selected = selectedCheckFixture(() => Promise.resolve(bytes), manifest);
    try {
      await rejectsWith(
        selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
        'check invocation manifest malformed',
      );
    } finally {
      selected.controller.close();
    }
  }
});

test('selected check preparation refuses a NUL skip-probe cwd independently', async () => {
  const baseline = selectedCheckFixture();
  baseline.controller.close();
  const manifest = {
    ...baseline.manifest,
    skipProbe: { argv: ['bun', 'test'], cwd: 'probe\0journal', env: {} },
  };
  const bytes = serializeCanonical(manifest);
  const selected = selectedCheckFixture(() => Promise.resolve(bytes), manifest);
  try {
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest malformed',
    );
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation refuses a stale lease before resolving any manifest', async () => {
  let resolves = 0;
  const selected = selectedCheckFixture(() => {
    resolves += 1;
    return Promise.resolve('not reached');
  });
  try {
    await rejectsWith(
      selected.controller.prepareSelectedCheck(
        { ...selected.lease, leaseEpoch: selected.lease.leaseEpoch + 1 },
        'a'.repeat(64),
      ),
      'selected check lease changed',
    );
    expect(resolves).toBe(0);
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation refuses a superseded request after a held resolver', async () => {
  let release: ((bytes: string) => void) | undefined;
  const held = new Promise<string>((resolve) => {
    release = resolve;
  });
  let resolving: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    resolving = resolve;
  });
  const selected = selectedCheckFixture(() => {
    resolving?.();
    return held;
  });
  try {
    const pending = selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64));
    await entered;
    selected.controller.observe({ ...selected.source.candidate, headSha: '9'.repeat(40) });
    release?.(selected.bytes);
    await rejectsWith(pending, 'selected check request is not current evaluating');
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation reads an immutable content-addressed registry entry', async () => {
  let registry = '';
  const selected = selectedCheckFixture((identity) =>
    Promise.resolve(readCheckInvocationManifest(registry, identity)),
  );
  registry = join(selected.source.databasePath, '..', 'check-registry');
  mkdirSync(registry);
  try {
    expect(storeCheckInvocationManifest(registry, selected.manifest)).toBe(selected.identity);
    const prepared = await selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64));
    expect(prepared.manifest.argv).toEqual(['bun', 'test', 'src/check.test.ts']);
    expect(storeCheckInvocationManifest(registry, selected.manifest)).toBe(selected.identity);
    writeFileSync(join(registry, `${selected.identity}.json`), '{broken');
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest malformed',
    );
    expect(() => storeCheckInvocationManifest(registry, selected.manifest)).toThrow(
      'check invocation manifest conflicts',
    );
  } finally {
    selected.controller.close();
  }
});

test('selected check registry distinguishes absent, unreadable and symlinked entries', async () => {
  let registry = '';
  const selected = selectedCheckFixture((identity) =>
    Promise.resolve(readCheckInvocationManifest(registry, identity)),
  );
  registry = join(selected.source.databasePath, '..', 'check-registry');
  try {
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation registry absent',
    );
    mkdirSync(registry);
    storeCheckInvocationManifest(registry, selected.manifest);
    rmSync(join(registry, `${selected.identity}.json`));
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest absent',
    );
    mkdirSync(join(registry, `${selected.identity}.json`));
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest unreadable',
    );
    rmSync(join(registry, `${selected.identity}.json`), { recursive: true });
    const outside = join(selected.source.databasePath, '..', 'outside-manifest.json');
    writeFileSync(outside, selected.bytes);
    symlinkSync(outside, join(registry, `${selected.identity}.json`));
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest unreadable',
    );
  } finally {
    selected.controller.close();
  }
});

test('selected check registry refuses oversized writer bytes before creating an entry', () => {
  const selected = selectedCheckFixture();
  const registry = join(selected.source.databasePath, '..', 'oversized-check-registry');
  mkdirSync(registry);
  try {
    const oversized = { ...selected.manifest, argv: ['a'.repeat(1_048_577)] };
    const identity = hashBytes(serializeCanonical(oversized));
    expect(() => storeCheckInvocationManifest(registry, oversized)).toThrow(
      'check invocation manifest too large',
    );
    expect(existsSync(join(registry, `${identity}.json`))).toBe(false);
  } finally {
    selected.controller.close();
  }
});

test('selected check registry refuses a FIFO promptly before reading it', async () => {
  let registry = '';
  const selected = selectedCheckFixture((identity) =>
    Promise.resolve(readCheckInvocationManifest(registry, identity)),
  );
  registry = join(selected.source.databasePath, '..', 'fifo-check-registry');
  mkdirSync(registry);
  try {
    const fifo = join(registry, `${selected.identity}.json`);
    const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
    expect(created.status).toBe(0);
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation manifest unreadable',
    );
  } finally {
    selected.controller.close();
  }
});

test('selected check registry refuses a symlinked root and oversized reader entry', async () => {
  let registry = '';
  const selected = selectedCheckFixture((identity) =>
    Promise.resolve(readCheckInvocationManifest(registry, identity)),
  );
  const parent = join(selected.source.databasePath, '..');
  const actual = join(parent, 'real-check-registry');
  registry = join(parent, 'linked-check-registry');
  mkdirSync(actual);
  try {
    storeCheckInvocationManifest(actual, selected.manifest);
    symlinkSync(actual, registry);
    await rejectsWith(
      selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64)),
      'check invocation registry unreadable',
    );
    registry = actual;
    const oversized = { ...selected.manifest, argv: ['a'.repeat(1_048_577)] };
    const bytes = serializeCanonical(oversized);
    const identity = hashBytes(bytes);
    writeFileSync(join(actual, `${identity}.json`), bytes);
    const largeSelected = selectedCheckFixture(
      (frozen) => Promise.resolve(readCheckInvocationManifest(actual, frozen)),
      oversized,
      identity,
    );
    try {
      await rejectsWith(
        largeSelected.controller.prepareSelectedCheck(largeSelected.lease, 'a'.repeat(64)),
        'check invocation manifest unreadable',
      );
    } finally {
      largeSelected.controller.close();
    }
  } finally {
    selected.controller.close();
  }
});

test('selected check preparation rechecks lease, authority, generation, plan and obligation after resolution', async () => {
  const cases = [
    {
      name: 'current',
      statement: 'UPDATE activation_request SET current = 0 WHERE request_identity = ?',
      message: 'selected check request is not current evaluating',
    },
    {
      name: 'stage',
      statement: "UPDATE activation_request SET stage = 'failed' WHERE request_identity = ?",
      message: 'selected check request is not current evaluating',
    },
    {
      name: 'legacy pairing',
      statement: 'UPDATE activation_request SET pairing_version = 0 WHERE request_identity = ?',
      message: 'legacy review pairing absent',
    },
    {
      name: 'lease',
      statement:
        'UPDATE activation_request SET lease_epoch = lease_epoch + 1 WHERE request_identity = ?',
      message: 'selected check lease changed',
    },
    {
      name: 'lease owner',
      statement:
        "UPDATE activation_request SET lease_owner = 'worker.other' WHERE request_identity = ?",
      message: 'selected check lease changed',
    },
    {
      name: 'lease null expiry',
      statement: 'UPDATE activation_request SET lease_expires_at = NULL WHERE request_identity = ?',
      message: 'selected check lease changed',
    },
    {
      name: 'lease expired',
      statement: 'UPDATE activation_request SET lease_expires_at = 1000 WHERE request_identity = ?',
      message: 'selected check lease changed',
    },
    {
      name: 'authority',
      statement:
        "UPDATE activation_request SET bootstrap_identity = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' WHERE request_identity = ?",
      message: 'selected check authority changed',
    },
    {
      name: 'generation',
      statement:
        'UPDATE activation_subject SET high_water_generation = high_water_generation + 1 WHERE repository_id = 8241',
      message: 'selected check generation changed',
    },
    {
      name: 'generation absent',
      statement: 'DELETE FROM activation_subject WHERE repository_id = 8241',
      message: 'selected check generation changed',
    },
    {
      name: 'plan',
      statement:
        "UPDATE activation_obligation SET executor_id = 'review.other' WHERE request_identity = ? AND phase = 'cold'",
      message: 'selected check frozen plan changed',
    },
    {
      name: 'obligation',
      statement:
        "UPDATE activation_obligation SET state = 'passed' WHERE request_identity = ? AND kind = 'check'",
      message: 'selected check obligation unavailable',
    },
  ];
  for (const scenario of cases) {
    let release: ((bytes: string) => void) | undefined;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    let resolving: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      resolving = resolve;
    });
    const selected = selectedCheckFixture(() => {
      resolving?.();
      return held;
    });
    try {
      const pending = selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64));
      await entered;
      const database = new Database(selected.source.databasePath);
      try {
        database.query(scenario.statement).run(selected.request.requestIdentity);
        const expected = database
          .query('SELECT * FROM activation_request WHERE request_identity = ?')
          .get(selected.request.requestIdentity);
        const obligations = database
          .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
          .all(selected.request.requestIdentity);
        release?.(selected.bytes);
        await rejectsWith(pending, scenario.message);
        expect(
          database
            .query('SELECT * FROM activation_request WHERE request_identity = ?')
            .get(selected.request.requestIdentity),
          scenario.name,
        ).toEqual(expected);
        expect(
          database
            .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
            .all(selected.request.requestIdentity),
          scenario.name,
        ).toEqual(obligations);
      } finally {
        database.close();
      }
    } finally {
      selected.controller.close();
    }
  }
});

test('selected check preparation rechecks the pinned bootstrap after a held resolver', async () => {
  const cases = [
    { name: 'absent', replace: false, message: 'bootstrap configuration absent' },
    {
      name: 'changed',
      replace: true,
      message: 'bootstrap configuration differs from independent pin',
    },
  ];
  for (const scenario of cases) {
    let release: ((bytes: string) => void) | undefined;
    const held = new Promise<string>((resolve) => {
      release = resolve;
    });
    let resolving: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      resolving = resolve;
    });
    const selected = selectedCheckFixture(() => {
      resolving?.();
      return held;
    });
    try {
      const pending = selected.controller.prepareSelectedCheck(selected.lease, 'a'.repeat(64));
      await entered;
      const before = selected.controller.listRequests();
      if (scenario.replace) {
        const bootstrap = JSON.parse(readFileSync(selected.source.bootstrapPath, 'utf8')) as Record<
          string,
          unknown
        >;
        writeFileSync(
          selected.source.bootstrapPath,
          serializeCanonical({ ...bootstrap, authorityGeneration: 4 }),
        );
      } else {
        rmSync(selected.source.bootstrapPath);
      }
      release?.(selected.bytes);
      await rejectsWith(pending, scenario.message);
      expect(selected.controller.listRequests(), scenario.name).toEqual(before);
    } finally {
      selected.controller.close();
    }
  }
});

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { type ObservedCandidate, openActivationController } from './controller';
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
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold' as const,
        },
      ],
    }),
  };
}

function evidenceHarness(options?: {
  readonly clock?: () => number;
  readonly authenticate?: (bytes: string, receipt: unknown) => Promise<unknown>;
}) {
  const source = fixture();
  const authenticated = new Map<string, unknown>();
  const controller = openActivationController({
    ...source,
    clock: options?.clock ?? (() => 1000),
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: source.candidate }),
    authenticateReceipt: (bytes: string) => {
      const receipt = authenticated.get(bytes);
      if (receipt === undefined) throw new Error('fake verifier has no authenticated receipt');
      return options?.authenticate === undefined
        ? Promise.resolve(receipt)
        : options.authenticate(bytes, receipt);
    },
  });
  const request = controller.observe(source.candidate);
  const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
  controller.beginEvaluation(lease);
  function receipt(kind: 'check' | 'audit', status: 'passed' | 'failed' | 'skipped' = 'passed') {
    const bytes = serializeCanonical({ request: request.requestIdentity, kind, status });
    const common = {
      receiptIdentity: hashBytes(bytes),
      issuerId: source.pin.journalIssuerId,
      requestIdentity: request.requestIdentity,
      obligationIdentity: kind === 'check' ? 'a'.repeat(64) : 'd'.repeat(64),
      kind,
      attempt: 0,
      executorId: kind === 'check' ? 'worker.check' : 'review.executor',
      protocolIdentity: kind === 'check' ? 'b'.repeat(64) : 'e'.repeat(64),
      status,
    };
    authenticated.set(
      bytes,
      kind === 'check'
        ? { ...common, commandIdentity: 'c'.repeat(64) }
        : { ...common, phase: 'cold' },
    );
    return bytes;
  }
  return { source, controller, request, lease, authenticated, receipt };
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
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'cold',
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
    ]);
    expect('advance' in controller).toBe(false);
    expect(() => controller.beginEvaluation(lease)).toThrow();
  } finally {
    controller.close();
  }
});

test('authenticated check and audit receipts join only after both complete', async () => {
  const source = fixture();
  const checkBytes = serializeCanonical({ receipt: 'check.passed' });
  const auditBytes = serializeCanonical({ receipt: 'audit.passed' });
  let requestIdentity = '';
  const authenticated = new Map([
    [
      checkBytes,
      {
        receiptIdentity: hashBytes(checkBytes),
        issuerId: source.pin.journalIssuerId,
        requestIdentity,
        obligationIdentity: 'a'.repeat(64),
        kind: 'check' as const,
        attempt: 0,
        executorId: 'worker.check',
        protocolIdentity: 'b'.repeat(64),
        commandIdentity: 'c'.repeat(64),
        status: 'passed' as const,
      },
    ],
    [
      auditBytes,
      {
        receiptIdentity: hashBytes(auditBytes),
        issuerId: source.pin.journalIssuerId,
        requestIdentity,
        obligationIdentity: 'd'.repeat(64),
        kind: 'audit' as const,
        attempt: 0,
        executorId: 'review.executor',
        protocolIdentity: 'e'.repeat(64),
        phase: 'cold' as const,
        status: 'passed' as const,
      },
    ],
  ]);
  const options = {
    ...source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: source.candidate }),
    authenticateReceipt: (bytes: string) => {
      const receipt = authenticated.get(bytes);
      if (receipt === undefined) throw new Error('fake verifier has no authenticated receipt');
      return Promise.resolve({ ...receipt, requestIdentity });
    },
  };
  const controller = openActivationController(options);
  try {
    const request = controller.observe(source.candidate);
    requestIdentity = request.requestIdentity;
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
    expect((await controller.recordReceipt(lease, checkBytes)).stage).toBe('evaluating');
    expect((await controller.recordReceipt(lease, auditBytes)).stage).toBe('verified');
    expect(controller.listObligations(request.requestIdentity).map(({ kind }) => kind)).toEqual([
      'check',
      'audit',
    ]);
  } finally {
    controller.close();
  }
});

test('opposite and concurrent receipt completion orders select the same evidence set', async () => {
  const identities: string[] = [];
  for (const order of ['check-first', 'audit-first', 'concurrent'] as const) {
    const evidence = evidenceHarness();
    try {
      const check = evidence.receipt('check');
      const audit = evidence.receipt('audit');
      if (order === 'concurrent') {
        const settled = await Promise.all([
          evidence.controller.recordReceipt(evidence.lease, check),
          evidence.controller.recordReceipt(evidence.lease, audit),
        ]);
        expect(settled.filter(({ stage }) => stage === 'verified')).toHaveLength(1);
      } else {
        const first = order === 'check-first' ? check : audit;
        const second = order === 'check-first' ? audit : check;
        expect((await evidence.controller.recordReceipt(evidence.lease, first)).stage).toBe(
          'evaluating',
        );
        expect((await evidence.controller.recordReceipt(evidence.lease, second)).stage).toBe(
          'verified',
        );
      }
      const verified = evidence.controller.readRequest(evidence.request.requestIdentity);
      expect(verified?.stage).toBe('verified');
      expect(verified?.evidenceSetIdentity).toMatch(/^[0-9a-f]{64}$/);
      expect(verified?.evidenceSetIdentity).toBe(
        hashCanonical([
          { obligationIdentity: 'a'.repeat(64), receiptIdentity: hashBytes(check) },
          { obligationIdentity: 'd'.repeat(64), receiptIdentity: hashBytes(audit) },
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
  const evidence = evidenceHarness();
  try {
    const check = evidence.receipt('check');
    const first = await evidence.controller.recordReceipt(evidence.lease, check);
    expect((await evidence.controller.recordReceipt(evidence.lease, check)).version).toBe(
      first.version,
    );
    const conflict = serializeCanonical({ receipt: 'conflicting same attempt' });
    const prior = evidence.authenticated.get(check);
    if (prior === undefined || typeof prior !== 'object') throw new Error('fake receipt absent');
    evidence.authenticated.set(conflict, { ...prior, receiptIdentity: hashBytes(conflict) });
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, conflict),
      'immutable evidence',
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(first);
    const audit = evidence.receipt('audit');
    const verified = await evidence.controller.recordReceipt(evidence.lease, audit);
    expect((await evidence.controller.recordReceipt(evidence.lease, check)).version).toBe(
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
    const evidence = evidenceHarness();
    try {
      const failed = evidence.receipt('check', status);
      const terminal = await evidence.controller.recordReceipt(evidence.lease, failed);
      expect(terminal.stage).toBe('failed');
      const later = evidence.receipt('check', 'passed');
      await rejectedWith(
        evidence.controller.recordReceipt(evidence.lease, later),
        'immutable evidence',
      );
      expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(terminal);
      expect((await evidence.controller.recordReceipt(evidence.lease, failed)).version).toBe(
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
    const evidence = evidenceHarness();
    try {
      const check = evidence.receipt('check');
      const prior = evidence.authenticated.get(check);
      if (prior === undefined || prior === null || typeof prior !== 'object')
        throw new Error('fake receipt absent');
      evidence.authenticated.set(check, { ...prior, [field]: wrong });
      const before = evidence.controller.readRequest(evidence.request.requestIdentity);
      await rejectedWith(evidence.controller.recordReceipt(evidence.lease, check), message);
      expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(before);
      expect(
        evidence.controller
          .listObligations(evidence.request.requestIdentity)
          .map(({ kind }) => kind),
      ).toEqual(['check', 'audit']);
    } finally {
      evidence.controller.close();
    }
  },
);

test('authenticated kind and audit phase must match the frozen obligation', async () => {
  const evidence = evidenceHarness();
  try {
    const check = evidence.receipt('check');
    const checkPrior = evidence.authenticated.get(check);
    if (checkPrior === undefined || checkPrior === null || typeof checkPrior !== 'object')
      throw new Error('fake check absent');
    const other = Object.fromEntries(
      Object.entries(checkPrior).filter(([key]) => key !== 'commandIdentity'),
    );
    evidence.authenticated.set(check, { ...other, kind: 'audit', phase: 'cold' });
    await rejectedWith(evidence.controller.recordReceipt(evidence.lease, check), 'kind differs');
    const audit = evidence.receipt('audit');
    const auditPrior = evidence.authenticated.get(audit);
    if (auditPrior === undefined || auditPrior === null || typeof auditPrior !== 'object')
      throw new Error('fake audit absent');
    evidence.authenticated.set(audit, { ...auditPrior, phase: 'informed' });
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, audit),
      'frozen obligation',
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
  const evidence = evidenceHarness({ authenticate: () => held });
  try {
    const check = evidence.receipt('check');
    const authentication = evidence.authenticated.get(check);
    const pending = evidence.controller.recordReceipt(evidence.lease, check);
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
    ).toEqual(['check', 'audit']);
  } finally {
    evidence.controller.close();
  }
});

test('an unrelated completion cannot invalidate a held authenticated receipt', async () => {
  let release: ((receipt: unknown) => void) | undefined;
  const held = new Promise<unknown>((resolve) => {
    release = resolve;
  });
  const evidence = evidenceHarness({
    authenticate: (bytes, receipt) =>
      bytes.includes('"kind":"check"') ? held : Promise.resolve(receipt),
  });
  const second = openActivationController({
    ...evidence.source,
    clock: () => 1000,
    readyCandidates: () => Promise.resolve([]),
    currentCandidate: () =>
      Promise.resolve({ kind: 'ready' as const, candidate: evidence.source.candidate }),
    authenticateReceipt: (bytes: string) => Promise.resolve(evidence.authenticated.get(bytes)),
  });
  try {
    const check = evidence.receipt('check');
    const audit = evidence.receipt('audit');
    const authentication = evidence.authenticated.get(check);
    const pending = evidence.controller.recordReceipt(evidence.lease, check);
    expect((await second.recordReceipt(evidence.lease, audit)).stage).toBe('evaluating');
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
    const evidence = evidenceHarness({ clock: () => now, authenticate: () => held });
    const database = new Database(evidence.source.databasePath);
    try {
      const check = evidence.receipt('check');
      const authentication = evidence.authenticated.get(check);
      const pending = evidence.controller.recordReceipt(evidence.lease, check);
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
      expect(database.query('SELECT * FROM activation_attempt').all()).toEqual([]);
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
      controller.recordReceipt(lease, serializeCanonical({ receipt: 'check' })),
      'verifier absent',
    );
    expect(evidenceRows(source.databasePath)).toEqual(before);
  } finally {
    controller.close();
  }
});

test('receipt recording refuses absent bytes before invoking authentication', async () => {
  const evidence = evidenceHarness();
  try {
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, ''),
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
    const evidence = evidenceHarness({ clock: () => now });
    try {
      const check = evidence.receipt('check');
      if (fault === 'expiry') now = 1100;
      else rmSync(evidence.source.bootstrapPath);
      const before = evidenceRows(evidence.source.databasePath);
      await rejectedWith(
        evidence.controller.recordReceipt(evidence.lease, check),
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
    const evidence = evidenceHarness();
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
      await rejectedWith(evidence.controller.recordReceipt(lease, check), 'lease changed');
      expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
    } finally {
      database.close();
      evidence.controller.close();
    }
  }
});

test('receipt generation guard refuses inconsistent durable subject history', async () => {
  const evidence = evidenceHarness();
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
      evidence.controller.recordReceipt(evidence.lease, check),
      'generation changed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a missing frozen obligation even when remaining evidence passes', async () => {
  const evidence = evidenceHarness();
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
      evidence.controller.recordReceipt(evidence.lease, check),
      'frozen evaluation plan',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a selected obligation whose immutable attempt is missing', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await evidence.controller.recordReceipt(evidence.lease, evidence.receipt('check'));
    database
      .query(
        'DELETE FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('audit')),
      'selected receipt evidence',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a selected obligation whose retained authentication bytes conflict', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await evidence.controller.recordReceipt(evidence.lease, evidence.receipt('check'));
    database
      .query(
        'UPDATE activation_attempt SET authentication_bytes = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run(serializeCanonical({ forged: true }), evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('audit')),
      'selected receipt evidence',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses a check row carrying an audit phase', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    database
      .query(
        'UPDATE activation_obligation SET phase = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run('cold', evidence.request.requestIdentity, 'a'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('check')),
      'stored check obligation malformed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt join refuses an audit row carrying a check command', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    database
      .query(
        'UPDATE activation_obligation SET command_identity = ? WHERE request_identity = ? AND obligation_identity = ?',
      )
      .run('c'.repeat(64), evidence.request.requestIdentity, 'd'.repeat(64));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('audit')),
      'stored audit obligation malformed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('receipt owner refuses a nonpending obligation with no selected attempt', async () => {
  const evidence = evidenceHarness();
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
      evidence.controller.recordReceipt(evidence.lease, check),
      'already completed',
    );
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('version-two durable requests migrate to attempt storage without losing evaluation state', async () => {
  const source = fixture();
  const first = boundaryController(source, () => 1000);
  const request = first.observe(source.candidate);
  const lease = first.claim(request.requestIdentity, 'worker.first', 100);
  first.beginEvaluation(lease);
  first.close();
  const database = new Database(source.databasePath);
  try {
    database.run('DROP TABLE activation_attempt');
    database.run('ALTER TABLE activation_request DROP COLUMN evidence_set_identity');
    database.run('PRAGMA user_version = 2');
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
    authenticateReceipt: (bytes: string) => Promise.resolve(authenticated.get(bytes)),
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
    expect((await second.recordReceipt(lease, check)).stage).toBe('evaluating');
    expect(second.readRequest(request.requestIdentity)?.request.requestIdentity).toBe(
      request.requestIdentity,
    );
  } finally {
    second.close();
  }
});

test('receipt owner refuses a different valid bootstrap authority on the same durable request', async () => {
  const evidence = evidenceHarness();
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
    authenticateReceipt: (bytes: string) => Promise.resolve(evidence.authenticated.get(bytes)),
  });
  try {
    const check = evidence.receipt('check');
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(second.recordReceipt(evidence.lease, check), 'authority changed');
    expect(evidenceRows(evidence.source.databasePath)).toEqual(before);
  } finally {
    second.close();
  }
});

test('terminal failed evidence refuses another obligation before evidence insertion', async () => {
  const evidence = evidenceHarness();
  try {
    await evidence.controller.recordReceipt(evidence.lease, evidence.receipt('check', 'failed'));
    const before = evidenceRows(evidence.source.databasePath);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('audit')),
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
    selectObligations: (request) => ({
      ...source.selectObligations(request),
      obligations: [
        ...source.selectObligations(request).obligations,
        {
          identity: 'f'.repeat(64),
          kind: 'audit' as const,
          executorId: 'review.executor',
          protocolIdentity: 'e'.repeat(64),
          phase: 'informed' as const,
        },
      ],
    }),
    authenticateReceipt: (bytes: string) => Promise.resolve(authenticated.get(bytes)),
  });
  try {
    const request = controller.observe(source.candidate);
    const lease = controller.claim(request.requestIdentity, 'worker.first', 100);
    controller.beginEvaluation(lease);
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
              status: 'passed',
            },
      );
      return bytes;
    }
    const informed = register('audit', 'informed');
    const before = evidenceRows(source.databasePath);
    await rejectedWith(controller.recordReceipt(lease, informed), 'requires completed cold audit');
    expect(evidenceRows(source.databasePath)).toEqual(before);
    await controller.recordReceipt(lease, register('check'));
    expect((await controller.recordReceipt(lease, register('audit', 'cold'))).stage).toBe(
      'evaluating',
    );
    expect((await controller.recordReceipt(lease, informed)).stage).toBe('verified');
  } finally {
    controller.close();
  }
});

test('second receipt commit failure restores its attempt but retains earlier authenticated evidence', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    const check = evidence.receipt('check');
    await evidence.controller.recordReceipt(evidence.lease, check);
    const before = evidence.controller.readRequest(evidence.request.requestIdentity);
    const beforeRows = evidenceRows(evidence.source.databasePath);
    database.run(`CREATE TRIGGER fail_verified_activation BEFORE UPDATE OF stage ON activation_request
      WHEN NEW.stage = 'verified' BEGIN SELECT RAISE(ABORT, 'injected verified write'); END`);
    const audit = evidence.receipt('audit');
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, audit),
      'injected verified write',
    );
    expect(evidence.controller.readRequest(evidence.request.requestIdentity)).toEqual(before);
    expect(evidenceRows(evidence.source.databasePath)).toEqual(beforeRows);
    const attempts: unknown[] = database
      .query('SELECT * FROM activation_attempt ORDER BY obligation_identity')
      .all();
    expect(attempts).toHaveLength(1);
    database.run('DROP TRIGGER fail_verified_activation');
    expect((await evidence.controller.recordReceipt(evidence.lease, audit)).stage).toBe('verified');
  } finally {
    database.close();
    evidence.controller.close();
  }
});

test('ignored verified update refuses and rolls back the second receipt', async () => {
  const evidence = evidenceHarness();
  const database = new Database(evidence.source.databasePath);
  try {
    await evidence.controller.recordReceipt(evidence.lease, evidence.receipt('check'));
    const before = evidenceRows(evidence.source.databasePath);
    database.run(`CREATE TRIGGER ignore_verified_activation BEFORE UPDATE OF stage ON activation_request
      WHEN NEW.stage = 'verified' BEGIN SELECT RAISE(IGNORE); END`);
    await rejectedWith(
      evidence.controller.recordReceipt(evidence.lease, evidence.receipt('audit')),
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

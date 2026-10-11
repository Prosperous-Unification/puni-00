import * as filesystem from 'node:fs';
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, spyOn, test } from 'bun:test';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import type { ReviewExpectation } from './controller';
import { createActivationRequest } from './request';
import { decodeReviewJournalManifest, lookupReviewJournalRegistration } from './review-journal';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'review-journal-'));
  const registrationRoot = join(directory, 'registrations');
  mkdirSync(registrationRoot, { mode: 0o700 });
  const databasePath = join(directory, 'controller.sqlite');
  const database = new Database(databasePath);
  database.run(`CREATE TABLE activation_request (
    request_identity TEXT PRIMARY KEY, request_bytes TEXT NOT NULL,
    bootstrap_identity TEXT NOT NULL, evaluation_plan_identity TEXT NOT NULL
  )`);
  database.run(`CREATE TABLE activation_review_attempt (
    request_identity TEXT NOT NULL, review_id TEXT NOT NULL,
    attempt INTEGER NOT NULL, invocation_id TEXT NOT NULL,
    PRIMARY KEY (request_identity, review_id, attempt)
  )`);
  database.run(`CREATE TABLE activation_review_dispatch (
    effect_key TEXT PRIMARY KEY, request_identity TEXT NOT NULL, plan_identity TEXT NOT NULL,
    review_id TEXT NOT NULL, attempt INTEGER NOT NULL, invocation_id TEXT NOT NULL,
    cold_obligation_identity TEXT NOT NULL, informed_obligation_identity TEXT NOT NULL,
    authority_identity TEXT NOT NULL, target_bytes TEXT NOT NULL, payload_bytes TEXT NOT NULL,
    payload_digest TEXT NOT NULL
  )`);
  const { request } = createActivationRequest({
    repositoryId: 8241,
    subject: { kind: 'pull-request', number: 282 },
    targetRef: 'refs/heads/main',
    headSha: '1'.repeat(40),
    baseSha: '2'.repeat(40),
    policyIdentity: '3'.repeat(64),
    mappingIdentity: '4'.repeat(64),
    toolkitIdentity: '5'.repeat(64),
    authorityIdentity: '6'.repeat(64),
    auditGeneration: 1,
  });
  const expectation: ReviewExpectation = {
    requestIdentity: request.requestIdentity,
    reviewId: 'review.primary',
    obligationIdentity: 'd'.repeat(64),
    attempt: 0,
    phase: 'cold',
    invocationId: 'invocation.primary',
    executorId: 'review.executor',
    protocolIdentity: 'e'.repeat(64),
    promptIdentity: 'f'.repeat(64),
    journalIssuerId: 'journal.issuer',
  };
  const effectKey = hashCanonical({
    kind: 'review-dispatch',
    requestIdentity: request.requestIdentity,
    reviewId: expectation.reviewId,
    attempt: expectation.attempt,
  });
  const payloadBytes = serializeCanonical({
    request,
    planIdentity: '7'.repeat(64),
    reviewId: expectation.reviewId,
    attempt: expectation.attempt,
    invocationId: expectation.invocationId,
    coldObligationIdentity: expectation.obligationIdentity,
    informedObligationIdentity: 'f'.repeat(64),
    authorityIdentity: request.authorityIdentity,
    target: { kind: 'reviewer', providerId: 'review.provider', executorId: expectation.executorId },
    protocolIdentity: expectation.protocolIdentity,
    promptIdentity: expectation.promptIdentity,
  });
  database
    .query('INSERT INTO activation_request VALUES (?, ?, ?, ?)')
    .run(
      request.requestIdentity,
      serializeCanonical(request),
      request.authorityIdentity,
      '7'.repeat(64),
    );
  database
    .query('INSERT INTO activation_review_attempt VALUES (?, ?, ?, ?)')
    .run(
      expectation.requestIdentity,
      expectation.reviewId,
      expectation.attempt,
      expectation.invocationId,
    );
  database
    .query('INSERT INTO activation_review_dispatch VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      effectKey,
      expectation.requestIdentity,
      '7'.repeat(64),
      expectation.reviewId,
      expectation.attempt,
      expectation.invocationId,
      expectation.obligationIdentity,
      'f'.repeat(64),
      request.authorityIdentity,
      serializeCanonical({
        kind: 'reviewer',
        providerId: 'review.provider',
        executorId: expectation.executorId,
      }),
      payloadBytes,
      hashBytes(payloadBytes),
    );
  database.close();
  const registrationKey = hashCanonical({
    kind: 'review-journal-registration',
    requestIdentity: expectation.requestIdentity,
    reviewId: expectation.reviewId,
    attempt: expectation.attempt,
    invocationId: expectation.invocationId,
  });
  const registration = {
    schemaVersion: 1 as const,
    kind: 'review-journal-registration' as const,
    registrationKey,
    requestIdentity: expectation.requestIdentity,
    reviewId: expectation.reviewId,
    attempt: expectation.attempt,
    invocationId: expectation.invocationId,
    coldObligationIdentity: expectation.obligationIdentity,
    informedObligationIdentity: 'f'.repeat(64),
    effectKey,
    payloadDigest: hashBytes(payloadBytes),
    descriptorIdentity: '8'.repeat(64),
    journalIssuerId: expectation.journalIssuerId,
    executorId: expectation.executorId,
    protocolIdentity: expectation.protocolIdentity,
    promptIdentity: expectation.promptIdentity,
    journalId: 'journal.primary',
    manifestIdentity: '9'.repeat(64),
  };
  const registrationPath = join(registrationRoot, `${registrationKey}.json`);
  function writeRegistration() {
    writeFileSync(registrationPath, serializeCanonical(registration), { mode: 0o600 });
  }
  return {
    directory,
    registrationRoot,
    databasePath,
    expectation,
    registration,
    registrationPath,
    writeRegistration,
  };
}

function selectedRegistration(source: ReturnType<typeof fixture>, expected = source.expectation) {
  return lookupReviewJournalRegistration({
    databasePath: source.databasePath,
    registrationRoot: source.registrationRoot,
    descriptorIdentity: '8'.repeat(64),
    trustedProviderId: 'review.provider',
    expected,
  });
}

function journalManifest(source: ReturnType<typeof fixture>) {
  return {
    schemaVersion: 1,
    kind: 'review-journal-manifest',
    descriptorIdentity: source.registration.descriptorIdentity,
    journalIssuerId: source.registration.journalIssuerId,
    executorId: source.registration.executorId,
    protocolIdentity: source.registration.protocolIdentity,
    promptIdentity: source.registration.promptIdentity,
    journalId: source.registration.journalId,
    effectKey: source.registration.effectKey,
    payloadDigest: source.registration.payloadDigest,
    requestIdentity: source.registration.requestIdentity,
    reviewId: source.registration.reviewId,
    attempt: source.registration.attempt,
    invocationId: source.registration.invocationId,
    phases: [
      {
        phase: 'cold',
        obligationIdentity: source.registration.coldObligationIdentity,
        submissionDigest: 'a'.repeat(64),
        sourceEvidenceDigest: 'b'.repeat(64),
        status: 'failed',
      },
    ],
    artifacts: [{ kind: 'cold-output', identity: 'c'.repeat(64) }],
  };
}

function decodeManifest(
  source: ReturnType<typeof fixture>,
  manifest: ReturnType<typeof journalManifest>,
) {
  const bytes = serializeCanonical(manifest);
  source.registration.manifestIdentity = hashBytes(bytes);
  return decodeReviewJournalManifest(bytes, source.registration, source.expectation);
}

test('protected registration lookup binds frozen effect and registered cold phase', () => {
  const source = fixture();
  try {
    source.writeRegistration();
    const selected = lookupReviewJournalRegistration({
      databasePath: source.databasePath,
      registrationRoot: source.registrationRoot,
      descriptorIdentity: '8'.repeat(64),
      trustedProviderId: 'review.provider',
      expected: source.expectation,
    });
    expect(selected.registration.manifestIdentity).toBe('9'.repeat(64));
    expect(selected.dispatch.effect_key).toBe(source.registration.effectKey);
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration lookup distinguishes absent registration and foreign phase', () => {
  const source = fixture();
  try {
    expect(() =>
      lookupReviewJournalRegistration({
        databasePath: source.databasePath,
        registrationRoot: source.registrationRoot,
        descriptorIdentity: '8'.repeat(64),
        trustedProviderId: 'review.provider',
        expected: source.expectation,
      }),
    ).toThrow('review journal registration absent');
    source.writeRegistration();
    expect(() =>
      lookupReviewJournalRegistration({
        databasePath: source.databasePath,
        registrationRoot: source.registrationRoot,
        descriptorIdentity: '8'.repeat(64),
        trustedProviderId: 'review.provider',
        expected: { ...source.expectation, phase: 'informed' },
      }),
    ).toThrow('review journal obligation differs from registered phase');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration lookup rejects coherently rehashed foreign protocol payload', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    payload['protocolIdentity'] = '0'.repeat(64);
    const bytes = serializeCanonical(payload);
    database
      .query('UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?')
      .run(bytes, hashBytes(bytes));
    database.close();
    source.registration.payloadDigest = hashBytes(bytes);
    source.writeRegistration();
    expect(() =>
      lookupReviewJournalRegistration({
        databasePath: source.databasePath,
        registrationRoot: source.registrationRoot,
        descriptorIdentity: '8'.repeat(64),
        trustedProviderId: 'review.provider',
        expected: source.expectation,
      }),
    ).toThrow('review journal reserved payload differs from frozen expectation');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration lookup refuses a coherently rehashed foreign provider target', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    const target = payload['target'] as Record<string, unknown>;
    target['providerId'] = 'review.foreign';
    const bytes = serializeCanonical(payload);
    const digest = hashBytes(bytes);
    database
      .query(
        'UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?, target_bytes = ?',
      )
      .run(bytes, digest, serializeCanonical(target));
    database.close();
    source.registration.payloadDigest = digest;
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal reserved payload differs from frozen expectation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'plan',
    (payload: Record<string, unknown>) => {
      payload['planIdentity'] = '0'.repeat(64);
    },
  ],
  [
    'review',
    (payload: Record<string, unknown>) => {
      payload['reviewId'] = 'review.foreign';
    },
  ],
  [
    'attempt',
    (payload: Record<string, unknown>) => {
      payload['attempt'] = 1;
    },
  ],
  [
    'invocation',
    (payload: Record<string, unknown>) => {
      payload['invocationId'] = 'invocation.foreign';
    },
  ],
  [
    'cold obligation',
    (payload: Record<string, unknown>) => {
      payload['coldObligationIdentity'] = '0'.repeat(64);
    },
  ],
  [
    'informed obligation',
    (payload: Record<string, unknown>) => {
      payload['informedObligationIdentity'] = '0'.repeat(64);
    },
  ],
  [
    'authority',
    (payload: Record<string, unknown>) => {
      payload['authorityIdentity'] = '0'.repeat(64);
    },
  ],
  [
    'executor',
    (payload: Record<string, unknown>) => {
      (payload['target'] as Record<string, unknown>)['executorId'] = 'review.foreign';
    },
  ],
  [
    'prompt',
    (payload: Record<string, unknown>) => {
      payload['promptIdentity'] = '0'.repeat(64);
    },
  ],
] as const)(
  'protected registration refuses coherently rehashed foreign payload %s',
  (label, corrupt) => {
    const source = fixture();
    try {
      const database = new Database(source.databasePath);
      const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
        payload_bytes: string;
      };
      const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
      corrupt(payload);
      const bytes = serializeCanonical(payload);
      const digest = hashBytes(bytes);
      database
        .query('UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?')
        .run(bytes, digest);
      if (label === 'executor') {
        database
          .query('UPDATE activation_review_dispatch SET target_bytes = ?')
          .run(serializeCanonical(payload['target']));
      }
      database.close();
      source.registration.payloadDigest = digest;
      source.writeRegistration();
      expect(() => selectedRegistration(source)).toThrow(
        'review journal reserved payload differs from frozen expectation',
      );
    } finally {
      rmSync(source.directory, { recursive: true, force: true });
    }
  },
);

test('protected registration lookup rejects uncounted changed payload bytes', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    const target = payload['target'] as Record<string, unknown>;
    target['providerId'] = 'review.foreign';
    const bytes = serializeCanonical(payload);
    database
      .query('UPDATE activation_review_dispatch SET payload_bytes = ?, target_bytes = ?')
      .run(bytes, serializeCanonical(target));
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal reserved payload digest changed',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a stored target differing from its frozen payload', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    database.query('UPDATE activation_review_dispatch SET target_bytes = ?').run(
      serializeCanonical({
        kind: 'reviewer',
        providerId: 'review.foreign',
        executorId: source.expectation.executorId,
      }),
    );
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal reserved payload differs from frozen expectation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses noncanonical stored payload with a matching digest', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const bytes = JSON.stringify(JSON.parse(row.payload_bytes), null, 2);
    const digest = hashBytes(bytes);
    database
      .query('UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?')
      .run(bytes, digest);
    database.close();
    source.registration.payloadDigest = digest;
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal reserved payload not canonical',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration digest anchors a coherently changed stored plan', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    payload['planIdentity'] = '0'.repeat(64);
    database
      .query('UPDATE activation_request SET evaluation_plan_identity = ?')
      .run('0'.repeat(64));
    database
      .query('UPDATE activation_review_dispatch SET plan_identity = ?, payload_bytes = ?')
      .run('0'.repeat(64), serializeCanonical(payload));
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal reserved payload digest changed',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  ['bootstrap pin', 'bootstrap_identity', '0'.repeat(64)],
  ['plan pin', 'evaluation_plan_identity', '0'.repeat(64)],
] as const)('protected registration refuses a foreign stored %s', (_label, column, identity) => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    database.query(`UPDATE activation_request SET ${column} = ?`).run(identity);
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal frozen request or plan differs from reservation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses noncanonical stored request bytes', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT request_bytes FROM activation_request').get() as {
      request_bytes: string;
    };
    database
      .query('UPDATE activation_request SET request_bytes = ?')
      .run(JSON.stringify(JSON.parse(row.request_bytes), null, 2));
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal frozen request or plan differs from reservation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a different canonical stored request under the selected key', () => {
  const source = fixture();
  try {
    const { request } = createActivationRequest({
      repositoryId: 8241,
      subject: { kind: 'pull-request', number: 282 },
      targetRef: 'refs/heads/main',
      headSha: '9'.repeat(40),
      baseSha: '2'.repeat(40),
      policyIdentity: '3'.repeat(64),
      mappingIdentity: '4'.repeat(64),
      toolkitIdentity: '5'.repeat(64),
      authorityIdentity: '6'.repeat(64),
      auditGeneration: 1,
    });
    const database = new Database(source.databasePath);
    database
      .query('UPDATE activation_request SET request_bytes = ?')
      .run(serializeCanonical(request));
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal frozen request or plan differs from reservation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a coherently rehashed foreign request identity under the selected key', () => {
  const source = fixture();
  try {
    const { request } = createActivationRequest({
      repositoryId: 8241,
      subject: { kind: 'pull-request', number: 282 },
      targetRef: 'refs/heads/main',
      headSha: '9'.repeat(40),
      baseSha: '2'.repeat(40),
      policyIdentity: '3'.repeat(64),
      mappingIdentity: '4'.repeat(64),
      toolkitIdentity: '5'.repeat(64),
      authorityIdentity: '6'.repeat(64),
      auditGeneration: 1,
    });
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    payload['request'] = request;
    const bytes = serializeCanonical(payload);
    const digest = hashBytes(bytes);
    database
      .query('UPDATE activation_review_dispatch SET payload_bytes = ?, payload_digest = ?')
      .run(bytes, digest);
    database
      .query('UPDATE activation_request SET request_bytes = ?')
      .run(serializeCanonical(request));
    database.close();
    source.registration.payloadDigest = digest;
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal request differs from reservation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a coherently repinned authority outside the frozen request', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    const row = database.query('SELECT payload_bytes FROM activation_review_dispatch').get() as {
      payload_bytes: string;
    };
    const payload = JSON.parse(row.payload_bytes) as Record<string, unknown>;
    payload['authorityIdentity'] = '0'.repeat(64);
    const bytes = serializeCanonical(payload);
    const digest = hashBytes(bytes);
    database
      .query(
        'UPDATE activation_review_dispatch SET authority_identity = ?, payload_bytes = ?, payload_digest = ?',
      )
      .run('0'.repeat(64), bytes, digest);
    database.query('UPDATE activation_request SET bootstrap_identity = ?').run('0'.repeat(64));
    database.close();
    source.registration.payloadDigest = digest;
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal request differs from reservation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a dispatch row bound to a foreign request key', () => {
  const source = fixture();
  try {
    const database = new Database(source.databasePath);
    database
      .query('UPDATE activation_review_dispatch SET request_identity = ?')
      .run('0'.repeat(64));
    database.close();
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal dispatch reservation absent',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses changed descriptor and issuer without using caller labels', () => {
  const source = fixture();
  try {
    source.registration.descriptorIdentity = '0'.repeat(64);
    source.writeRegistration();
    expect(() =>
      lookupReviewJournalRegistration({
        databasePath: source.databasePath,
        registrationRoot: source.registrationRoot,
        descriptorIdentity: '8'.repeat(64),
        trustedProviderId: 'review.provider',
        expected: source.expectation,
      }),
    ).toThrow('review journal registration differs from reserved invocation');
    source.registration.descriptorIdentity = '8'.repeat(64);
    source.registration.journalIssuerId = 'journal.foreign';
    source.writeRegistration();
    expect(() =>
      lookupReviewJournalRegistration({
        databasePath: source.databasePath,
        registrationRoot: source.registrationRoot,
        descriptorIdentity: '8'.repeat(64),
        trustedProviderId: 'review.provider',
        expected: source.expectation,
      }),
    ).toThrow('review journal registration differs from reserved invocation');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'registration key',
    (source: ReturnType<typeof fixture>) => {
      source.registration.registrationKey = '0'.repeat(64);
    },
  ],
  [
    'request',
    (source: ReturnType<typeof fixture>) => {
      source.registration.requestIdentity = '0'.repeat(64);
    },
  ],
  [
    'review',
    (source: ReturnType<typeof fixture>) => {
      source.registration.reviewId = 'review.foreign';
    },
  ],
  [
    'attempt',
    (source: ReturnType<typeof fixture>) => {
      source.registration.attempt = 1;
    },
  ],
  [
    'invocation',
    (source: ReturnType<typeof fixture>) => {
      source.registration.invocationId = 'invocation.foreign';
    },
  ],
  [
    'effect',
    (source: ReturnType<typeof fixture>) => {
      source.registration.effectKey = '0'.repeat(64);
    },
  ],
  [
    'payload',
    (source: ReturnType<typeof fixture>) => {
      source.registration.payloadDigest = '0'.repeat(64);
    },
  ],
  [
    'cold obligation',
    (source: ReturnType<typeof fixture>) => {
      source.registration.coldObligationIdentity = '0'.repeat(64);
    },
  ],
  [
    'informed obligation',
    (source: ReturnType<typeof fixture>) => {
      source.registration.informedObligationIdentity = '0'.repeat(64);
    },
  ],
  [
    'executor',
    (source: ReturnType<typeof fixture>) => {
      source.registration.executorId = 'review.foreign';
    },
  ],
  [
    'protocol',
    (source: ReturnType<typeof fixture>) => {
      source.registration.protocolIdentity = '0'.repeat(64);
    },
  ],
  [
    'prompt',
    (source: ReturnType<typeof fixture>) => {
      source.registration.promptIdentity = '0'.repeat(64);
    },
  ],
] as const)('protected registration refuses foreign %s', (_label, corrupt) => {
  const source = fixture();
  try {
    corrupt(source);
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow(
      'review journal registration differs from reserved invocation',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('informed lookup refuses a foreign paired cold obligation', () => {
  const source = fixture();
  try {
    source.registration.coldObligationIdentity = '0'.repeat(64);
    source.writeRegistration();
    expect(() =>
      selectedRegistration(source, {
        ...source.expectation,
        phase: 'informed',
        obligationIdentity: 'f'.repeat(64),
      }),
    ).toThrow('review journal registration differs from reserved invocation');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'missing invocation',
    (database: Database) => database.run('DELETE FROM activation_review_attempt'),
    'review journal invocation registration absent',
  ],
  [
    'missing frozen request',
    (database: Database) => database.run('DELETE FROM activation_request'),
    'review journal frozen request absent',
  ],
  [
    'missing reservation',
    (database: Database) => database.run('DELETE FROM activation_review_dispatch'),
    'review journal dispatch reservation absent',
  ],
  [
    'foreign invocation row',
    (database: Database) =>
      database.run("UPDATE activation_review_attempt SET invocation_id = 'invocation.foreign'"),
    'review journal registration differs from reserved invocation',
  ],
  [
    'malformed invocation row',
    (database: Database) => database.run("UPDATE activation_review_attempt SET invocation_id = ''"),
    'invocation_id',
  ],
  [
    'malformed reservation row',
    (database: Database) =>
      database.run("UPDATE activation_review_dispatch SET payload_digest = ''"),
    'payload_digest',
  ],
  [
    'foreign dispatch invocation',
    (database: Database) =>
      database.run("UPDATE activation_review_dispatch SET invocation_id = 'invocation.foreign'"),
    'review journal registration differs from reserved invocation',
  ],
  [
    'foreign dispatch effect',
    (database: Database) =>
      database.run(`UPDATE activation_review_dispatch SET effect_key = '${'0'.repeat(64)}'`),
    'review journal registration differs from reserved invocation',
  ],
] as const)('protected registration refuses %s', (_label, corrupt, message) => {
  const source = fixture();
  try {
    source.writeRegistration();
    const database = new Database(source.databasePath);
    corrupt(database);
    database.close();
    expect(() => selectedRegistration(source)).toThrow(message);
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  [
    'noncanonical bytes',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      writeFileSync(source.registrationPath, JSON.stringify(source.registration, null, 2));
    },
    'review journal registration malformed',
  ],
  [
    'invalid UTF-8',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      writeFileSync(source.registrationPath, Buffer.from([0xff]));
    },
    'The encoded data was not valid for encoding utf-8',
  ],
  [
    'invalid UTF-8 inside journal ID',
    (source: ReturnType<typeof fixture>) => {
      const bytes = Buffer.from(serializeCanonical(source.registration), 'utf8');
      const offset = bytes.indexOf(Buffer.from(source.registration.journalId, 'utf8'));
      expect(offset).toBeGreaterThanOrEqual(0);
      bytes[offset] = 0xff;
      writeFileSync(source.registrationPath, bytes, { mode: 0o600 });
    },
    'The encoded data was not valid for encoding utf-8',
  ],
  [
    'hard link',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      linkSync(source.registrationPath, join(source.registrationRoot, 'alias.json'));
    },
    'review journal registration file malformed',
  ],
  [
    'group-readable mode',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      chmodSync(source.registrationPath, 0o640);
    },
    'review journal registration file malformed',
  ],
  [
    'symlinked leaf',
    (source: ReturnType<typeof fixture>) => {
      const target = join(source.directory, 'registration-target.json');
      writeFileSync(target, serializeCanonical(source.registration), { mode: 0o600 });
      symlinkSync(target, source.registrationPath);
    },
    'review journal registration unreadable',
  ],
  [
    'replaceable root',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      chmodSync(source.registrationRoot, 0o777);
    },
    'review journal registration ancestor malformed',
  ],
  [
    'noncanonical root',
    (source: ReturnType<typeof fixture>) => {
      source.writeRegistration();
      source.registrationRoot = `${source.registrationRoot}/.`;
    },
    'review journal registration root malformed',
  ],
] as const)('protected registration refuses %s', (_label, corrupt, message) => {
  const source = fixture();
  try {
    corrupt(source);
    expect(() => selectedRegistration(source)).toThrow(message);
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration refuses a schema-valid record one byte above its source cap', () => {
  const source = fixture();
  try {
    const baseLength = Buffer.byteLength(serializeCanonical(source.registration), 'utf8');
    source.registration.journalId += 'x'.repeat(65_537 - baseLength);
    const bytes = serializeCanonical(source.registration);
    expect(Buffer.byteLength(bytes, 'utf8')).toBe(65_537);
    source.writeRegistration();
    expect(() => selectedRegistration(source)).toThrow('review journal registration too large');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('protected registration FIFO refuses promptly without blocking the reader', () => {
  const source = fixture();
  try {
    const created = Bun.spawnSync({ cmd: ['mkfifo', '-m', '600', source.registrationPath] });
    expect(created.exitCode).toBe(0);
    const probePath = join(source.directory, 'fifo-probe.ts');
    writeFileSync(
      probePath,
      `import { lookupReviewJournalRegistration } from ${JSON.stringify(join(import.meta.dir, 'review-journal.ts'))};
try {
  lookupReviewJournalRegistration(${JSON.stringify({
    databasePath: source.databasePath,
    registrationRoot: source.registrationRoot,
    descriptorIdentity: '8'.repeat(64),
    trustedProviderId: 'review.provider',
    expected: source.expectation,
  })});
  console.log('ADMITTED');
  process.exit(2);
} catch (cause) {
  if (!(cause instanceof Error) || !cause.message.includes('registration file malformed')) throw cause;
  console.log('REFUSED');
}`,
    );
    const probe = Bun.spawnSync({ cmd: ['timeout', '2s', 'bun', probePath] });
    expect(probe.exitCode).toBe(0);
    expect(Buffer.from(probe.stdout).toString()).toContain('REFUSED');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  ['foreign ancestor owner', { uid: 42_424 }],
  ['nondirectory ancestor', { isDirectory: () => false }],
] as const)('protected registration refuses %s', (_label, changed) => {
  const source = fixture();
  source.writeRegistration();
  const original = filesystem.lstatSync;
  const inspection = spyOn(filesystem, 'lstatSync').mockImplementation(((
    path: Parameters<typeof filesystem.lstatSync>[0],
  ) => {
    const entry = original(path);
    return String(path) === source.registrationRoot ? Object.assign(entry, changed) : entry;
  }) as typeof filesystem.lstatSync);
  try {
    expect(() => selectedRegistration(source)).toThrow(
      'review journal registration ancestor malformed',
    );
  } finally {
    inspection.mockRestore();
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  ['foreign leaf owner', { uid: 42_424 }],
  ['nonfile leaf', { isFile: () => false }],
] as const)('protected registration refuses %s', (_label, changed) => {
  const source = fixture();
  source.writeRegistration();
  const original = filesystem.fstatSync;
  const inspection = spyOn(filesystem, 'fstatSync').mockImplementation(((descriptor: number) => {
    const entry = original(descriptor);
    return Object.assign(entry, changed);
  }) as typeof filesystem.fstatSync);
  try {
    expect(() => selectedRegistration(source)).toThrow(
      'review journal registration file malformed',
    );
  } finally {
    inspection.mockRestore();
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  ['version', { schemaVersion: 2 }],
  ['kind', { kind: 'foreign-registration' }],
] as const)(
  'protected registration refuses unsupported %s without a legacy default',
  (_label, change) => {
    const source = fixture();
    try {
      writeFileSync(
        source.registrationPath,
        serializeCanonical({ ...source.registration, ...change }),
        {
          mode: 0o600,
        },
      );
      expect(() => selectedRegistration(source)).toThrow('review journal registration malformed');
    } finally {
      rmSync(source.directory, { recursive: true, force: true });
    }
  },
);

test('journal manifest decodes exact canonical bytes and distinct source digest', () => {
  const source = fixture();
  try {
    const manifest = {
      schemaVersion: 1,
      kind: 'review-journal-manifest',
      descriptorIdentity: source.registration.descriptorIdentity,
      journalIssuerId: source.expectation.journalIssuerId,
      executorId: source.expectation.executorId,
      protocolIdentity: source.expectation.protocolIdentity,
      promptIdentity: source.expectation.promptIdentity,
      journalId: source.registration.journalId,
      effectKey: source.registration.effectKey,
      payloadDigest: source.registration.payloadDigest,
      requestIdentity: source.expectation.requestIdentity,
      reviewId: source.expectation.reviewId,
      attempt: source.expectation.attempt,
      invocationId: source.expectation.invocationId,
      phases: [
        {
          phase: 'cold',
          obligationIdentity: source.expectation.obligationIdentity,
          submissionDigest: 'a'.repeat(64),
          sourceEvidenceDigest: 'b'.repeat(64),
          status: 'failed',
        },
      ],
      artifacts: [{ kind: 'cold-output', identity: 'c'.repeat(64) }],
    };
    const bytes = serializeCanonical(manifest);
    source.registration.manifestIdentity = hashBytes(bytes);
    expect(
      decodeReviewJournalManifest(bytes, source.registration, source.expectation).phases,
    ).toHaveLength(1);
    source.registration.manifestIdentity = '0'.repeat(64);
    expect(() =>
      decodeReviewJournalManifest(bytes, source.registration, source.expectation),
    ).toThrow('review journal manifest differs from registration');
    const noncanonical = JSON.stringify(manifest);
    source.registration.manifestIdentity = hashBytes(noncanonical);
    expect(() =>
      decodeReviewJournalManifest(noncanonical, source.registration, source.expectation),
    ).toThrow('review journal manifest not canonical');
    const duplicate = { ...manifest, phases: [manifest.phases[0], manifest.phases[0]] };
    const duplicateBytes = serializeCanonical(duplicate);
    source.registration.manifestIdentity = hashBytes(duplicateBytes);
    expect(() =>
      decodeReviewJournalManifest(duplicateBytes, source.registration, source.expectation),
    ).toThrow('review journal manifest phase set malformed');
    const foreign = {
      ...manifest,
      phases: [{ ...manifest.phases[0], obligationIdentity: '0'.repeat(64) }],
    };
    const foreignBytes = serializeCanonical(foreign);
    source.registration.manifestIdentity = hashBytes(foreignBytes);
    expect(() =>
      decodeReviewJournalManifest(foreignBytes, source.registration, source.expectation),
    ).toThrow('review journal manifest pair differs from registration');
    source.registration.manifestIdentity = hashBytes(bytes);
    expect(() =>
      decodeReviewJournalManifest(bytes, source.registration, {
        ...source.expectation,
        obligationIdentity: '0'.repeat(64),
      }),
    ).toThrow('review journal manifest phase differs from expectation');
    const changedAuthority = { ...manifest, descriptorIdentity: '0'.repeat(64) };
    const changedBytes = serializeCanonical(changedAuthority);
    source.registration.manifestIdentity = hashBytes(changedBytes);
    expect(() =>
      decodeReviewJournalManifest(changedBytes, source.registration, source.expectation),
    ).toThrow('review journal manifest differs from registration');
    for (const changed of [
      { ...manifest, schemaVersion: 2 },
      { ...manifest, kind: 'foreign-manifest' },
    ]) {
      const changedBytes = serializeCanonical(changed);
      source.registration.manifestIdentity = hashBytes(changedBytes);
      expect(() =>
        decodeReviewJournalManifest(changedBytes, source.registration, source.expectation),
      ).toThrow('review journal manifest malformed');
    }
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('journal manifest refuses a schema-valid body above its exact byte cap', () => {
  const source = fixture();
  try {
    const journalId = 'j'.repeat(1_048_576);
    source.registration.journalId = journalId;
    const manifest = {
      schemaVersion: 1,
      kind: 'review-journal-manifest',
      descriptorIdentity: source.registration.descriptorIdentity,
      journalIssuerId: source.expectation.journalIssuerId,
      executorId: source.expectation.executorId,
      protocolIdentity: source.expectation.protocolIdentity,
      promptIdentity: source.expectation.promptIdentity,
      journalId,
      effectKey: source.registration.effectKey,
      payloadDigest: source.registration.payloadDigest,
      requestIdentity: source.expectation.requestIdentity,
      reviewId: source.expectation.reviewId,
      attempt: source.expectation.attempt,
      invocationId: source.expectation.invocationId,
      phases: [
        {
          phase: 'cold',
          obligationIdentity: source.expectation.obligationIdentity,
          submissionDigest: 'a'.repeat(64),
          sourceEvidenceDigest: 'b'.repeat(64),
          status: 'failed',
        },
      ],
      artifacts: [{ kind: 'cold-output', identity: 'c'.repeat(64) }],
    };
    const bytes = serializeCanonical(manifest);
    source.registration.manifestIdentity = hashBytes(bytes);
    expect(Buffer.byteLength(bytes, 'utf8')).toBeGreaterThan(1_048_576);
    expect(() =>
      decodeReviewJournalManifest(bytes, source.registration, source.expectation),
    ).toThrow('review journal manifest too large');
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test('journal manifest joins both registered phase obligations regardless of selected phase', () => {
  const source = fixture();
  try {
    const manifest = {
      schemaVersion: 1,
      kind: 'review-journal-manifest',
      descriptorIdentity: source.registration.descriptorIdentity,
      journalIssuerId: source.registration.journalIssuerId,
      executorId: source.registration.executorId,
      protocolIdentity: source.registration.protocolIdentity,
      promptIdentity: source.registration.promptIdentity,
      journalId: source.registration.journalId,
      effectKey: source.registration.effectKey,
      payloadDigest: source.registration.payloadDigest,
      requestIdentity: source.registration.requestIdentity,
      reviewId: source.registration.reviewId,
      attempt: source.registration.attempt,
      invocationId: source.registration.invocationId,
      phases: [
        {
          phase: 'cold',
          obligationIdentity: source.registration.coldObligationIdentity,
          submissionDigest: 'a'.repeat(64),
          sourceEvidenceDigest: 'b'.repeat(64),
          status: 'passed',
        },
        {
          phase: 'informed',
          obligationIdentity: source.registration.informedObligationIdentity,
          submissionDigest: 'c'.repeat(64),
          sourceEvidenceDigest: 'd'.repeat(64),
          status: 'passed',
        },
      ],
      artifacts: [{ kind: 'review-evidence', identity: 'e'.repeat(64) }],
    };
    const informedExpected = {
      ...source.expectation,
      phase: 'informed' as const,
      obligationIdentity: source.registration.informedObligationIdentity,
    };
    const decode = (expected: ReviewExpectation) => {
      const bytes = serializeCanonical(manifest);
      source.registration.manifestIdentity = hashBytes(bytes);
      return decodeReviewJournalManifest(bytes, source.registration, expected);
    };
    expect(decode(source.expectation).phases).toHaveLength(2);
    expect(decode(informedExpected).phases).toHaveLength(2);
    manifest.phases[0].obligationIdentity = '0'.repeat(64);
    expect(() => decode(informedExpected)).toThrow(
      'review journal manifest pair differs from registration',
    );
    manifest.phases[0].obligationIdentity = source.registration.coldObligationIdentity;
    manifest.phases[1].obligationIdentity = '0'.repeat(64);
    expect(() => decode(source.expectation)).toThrow(
      'review journal manifest pair differs from registration',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

test.each([
  ['issuer', 'journalIssuerId', 'journal.foreign'],
  ['executor', 'executorId', 'review.foreign'],
  ['protocol', 'protocolIdentity', '0'.repeat(64)],
  ['prompt', 'promptIdentity', '0'.repeat(64)],
  ['journal', 'journalId', 'journal.foreign'],
  ['effect', 'effectKey', '0'.repeat(64)],
  ['payload', 'payloadDigest', '0'.repeat(64)],
  ['request', 'requestIdentity', '0'.repeat(64)],
  ['review', 'reviewId', 'review.foreign'],
  ['attempt', 'attempt', 1],
  ['invocation', 'invocationId', 'invocation.foreign'],
] as const)(
  'journal manifest refuses foreign %s despite matching raw digest',
  (_label, field, value) => {
    const source = fixture();
    try {
      const manifest = Object.assign(journalManifest(source), { [field]: value });
      expect(() => decodeManifest(source, manifest)).toThrow(
        'review journal manifest differs from registration',
      );
    } finally {
      rmSync(source.directory, { recursive: true, force: true });
    }
  },
);

test.each([
  [
    'empty artifacts',
    (manifest: ReturnType<typeof journalManifest>) => {
      manifest.artifacts = [];
    },
  ],
  [
    'passed cold without informed',
    (manifest: ReturnType<typeof journalManifest>) => {
      manifest.phases[0].status = 'passed';
    },
  ],
  [
    'failed cold with informed',
    (manifest: ReturnType<typeof journalManifest>) => {
      manifest.phases.push({
        phase: 'informed',
        obligationIdentity: 'f'.repeat(64),
        submissionDigest: 'd'.repeat(64),
        sourceEvidenceDigest: 'e'.repeat(64),
        status: 'passed',
      });
    },
  ],
] as const)('journal manifest refuses %s', (_label, corrupt) => {
  const source = fixture();
  try {
    const manifest = journalManifest(source);
    corrupt(manifest);
    expect(() => decodeManifest(source, manifest)).toThrow(
      'review journal manifest phase set malformed',
    );
  } finally {
    rmSync(source.directory, { recursive: true, force: true });
  }
});

import { parseOrThrow, type } from '@shared/validation';
import { Database } from 'bun:sqlite';

import { hashBytes, hashCanonical, serializeCanonical } from '../evidence/content-manifest';
import { readBootstrapConfiguration, type TrustedBootstrapPin } from './bootstrap';
import { type ObservedActivationCandidate, prepareObservedRequest } from './ingress';
import {
  type ActivationRequest,
  ActivationSubject,
  createActivationRequest,
  decodeActivationRequest,
} from './request';

export type ObservedCandidate = ObservedActivationCandidate;

const RequestStage = type(
  "'observed'|'evaluating'|'verified'|'published'|'admitted'|'merge-requested'|'merged'|'merged-certified'|'host-ready'|'failed'|'superseded'",
);
export type RequestStage = typeof RequestStage.infer;

const EvaluationObligation = type({
  identity: /^[0-9a-f]{64}$/,
  kind: "'check'",
  executorId: 'string>=1',
  protocolIdentity: /^[0-9a-f]{64}$/,
  commandIdentity: /^[0-9a-f]{64}$/,
})
  .onUndeclaredKey('reject')
  .or(
    type({
      identity: /^[0-9a-f]{64}$/,
      kind: "'audit'",
      executorId: 'string>=1',
      protocolIdentity: /^[0-9a-f]{64}$/,
      phase: "'cold'|'informed'",
    }).onUndeclaredKey('reject'),
  );
export type EvaluationObligation = typeof EvaluationObligation.infer;

const EvaluationPlan = type({
  requestIdentity: /^[0-9a-f]{64}$/,
  policyIdentity: /^[0-9a-f]{64}$/,
  obligations: EvaluationObligation.array(),
}).onUndeclaredKey('reject');
export type EvaluationPlan = typeof EvaluationPlan.infer;

const AuthenticatedReceipt = type({
  receiptIdentity: /^[0-9a-f]{64}$/,
  issuerId: 'string>=1',
  requestIdentity: /^[0-9a-f]{64}$/,
  obligationIdentity: /^[0-9a-f]{64}$/,
  kind: "'check'",
  attempt: 'number.integer>=0',
  executorId: 'string>=1',
  protocolIdentity: /^[0-9a-f]{64}$/,
  commandIdentity: /^[0-9a-f]{64}$/,
  status: "'passed'|'failed'|'skipped'",
})
  .onUndeclaredKey('reject')
  .or(
    type({
      receiptIdentity: /^[0-9a-f]{64}$/,
      issuerId: 'string>=1',
      requestIdentity: /^[0-9a-f]{64}$/,
      obligationIdentity: /^[0-9a-f]{64}$/,
      kind: "'audit'",
      attempt: 'number.integer>=0',
      executorId: 'string>=1',
      protocolIdentity: /^[0-9a-f]{64}$/,
      phase: "'cold'|'informed'",
      status: "'passed'|'failed'|'skipped'",
    }).onUndeclaredKey('reject'),
  );
export type AuthenticatedReceipt = typeof AuthenticatedReceipt.infer;

const StoredObligation = type({
  request_identity: /^[0-9a-f]{64}$/,
  obligation_identity: /^[0-9a-f]{64}$/,
  kind: "'check'|'audit'",
  executor_id: 'string>=1',
  protocol_identity: /^[0-9a-f]{64}$/,
  command_identity: type(/^[0-9a-f]{64}$/).or('null'),
  phase: "'cold'|'informed'|null",
  attempt: 'number.integer>=0',
  state: "'pending'|'passed'|'failed'|'skipped'",
  receipt_identity: type(/^[0-9a-f]{64}$/).or('null'),
}).onUndeclaredKey('reject');

const StoredAttempt = type({
  request_identity: /^[0-9a-f]{64}$/,
  obligation_identity: /^[0-9a-f]{64}$/,
  attempt: 'number.integer>=0',
  receipt_identity: /^[0-9a-f]{64}$/,
  receipt_bytes: 'string>=1',
  authentication_bytes: 'string>=1',
  status: "'passed'|'failed'|'skipped'",
}).onUndeclaredKey('reject');

const StoredRow = type({
  request_identity: /^[0-9a-f]{64}$/,
  repository_id: 'number.integer>=1',
  subject_key: 'string>=1',
  request_bytes: 'string>=1',
  bootstrap_identity: /^[0-9a-f]{64}$/,
  stage: RequestStage,
  version: 'number.integer>=0',
  lease_epoch: 'number.integer>=0',
  lease_owner: 'string|null',
  lease_expires_at: 'number.integer|null',
  evaluation_plan_identity: type(/^[0-9a-f]{64}$/).or('null'),
  evidence_set_identity: type(/^[0-9a-f]{64}$/).or('null'),
  current: '0|1',
}).onUndeclaredKey('reject');
type StoredRow = typeof StoredRow.infer;

export interface StoredRequest {
  readonly request: ActivationRequest;
  readonly stage: RequestStage;
  readonly version: number;
  readonly leaseEpoch: number;
  readonly current: boolean;
  readonly evidenceSetIdentity: string | null;
}

export interface RequestLease {
  readonly requestIdentity: string;
  readonly leaseEpoch: number;
  readonly version: number;
  readonly workerId: string;
}

export interface ActivationControllerOptions {
  readonly databasePath: string;
  readonly bootstrapPath: string;
  readonly pin: TrustedBootstrapPin;
  readonly clock: () => number;
  readonly readyCandidates: () => Promise<readonly ObservedCandidate[]>;
  readonly currentCandidate: (
    repositoryId: number,
    subject: ActivationSubject,
  ) => Promise<
    { readonly kind: 'ready'; readonly candidate: ObservedCandidate } | { readonly kind: 'closed' }
  >;
  readonly selectObligations: (request: ActivationRequest) => EvaluationPlan;
  readonly authenticateReceipt?: (receiptBytes: string) => Promise<unknown>;
}

const DeliveryRecord = type({
  sourceId: /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
  deliveryId: /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
  payloadDigest: /^[0-9a-f]{64}$/,
  repositoryId: 'number.integer>=1',
  subject: ActivationSubject,
}).onUndeclaredKey('reject');
export type ObservedDelivery = typeof DeliveryRecord.infer;

function subjectKey(subject: ActivationSubject): string {
  if (subject.kind === 'pull-request') return `pr:${String(subject.number)}`;
  if (subject.kind === 'merge-group') return `group:${subject.groupRef}`;
  return `protected:${subject.ref}`;
}

function readRow(database: Database, identity: string): StoredRow | undefined {
  const row: unknown = database
    .query('SELECT * FROM activation_request WHERE request_identity = ?')
    .get(identity);
  return row === null ? undefined : parseOrThrow(StoredRow, row);
}

function storedRequest(row: StoredRow): StoredRequest {
  const request = decodeActivationRequest(row.request_bytes);
  if (
    request.requestIdentity !== row.request_identity ||
    request.repositoryId !== row.repository_id
  ) {
    throw new Error('durable activation request identity differs from stored columns');
  }
  return {
    request,
    stage: row.stage,
    version: row.version,
    leaseEpoch: row.lease_epoch,
    current: row.current === 1,
    evidenceSetIdentity: row.evidence_set_identity,
  };
}

function nowFrom(clock: () => number): number {
  const now = clock();
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('activation controller clock malformed');
  return now;
}

function isExpiredLease(expiresAt: number | null, now: number): boolean {
  return expiresAt !== null && expiresAt <= now;
}

function transaction<T>(database: Database, body: () => T): T {
  database.run('BEGIN IMMEDIATE');
  try {
    const answer = body();
    database.run('COMMIT');
    return answer;
  } catch (cause) {
    database.run('ROLLBACK');
    throw cause;
  }
}

function initialize(database: Database): void {
  database.run('PRAGMA busy_timeout = 5000');
  const metadata: unknown = database.query('PRAGMA user_version').get();
  const version = parseOrThrow(type({ user_version: 'number.integer>=0' }), metadata).user_version;
  if (version !== 0 && version !== 2 && version !== 3)
    // Proof: accepting old version 1 silently reopened storage without durable subject high-water.
    throw new Error(`unsupported activation store schema ${String(version)}`);
  if (version === 0) {
    const existing: unknown = database
      .query("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'activation_request'")
      .get();
    if (existing !== null)
      throw new Error('unversioned activation request store cannot be defaulted');
    transaction(database, () => {
      database.run(`CREATE TABLE activation_request (
        request_identity TEXT PRIMARY KEY,
        repository_id INTEGER NOT NULL,
        subject_key TEXT NOT NULL,
        request_bytes TEXT NOT NULL,
        bootstrap_identity TEXT NOT NULL,
        stage TEXT NOT NULL,
        version INTEGER NOT NULL,
        lease_epoch INTEGER NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        evaluation_plan_identity TEXT,
        evidence_set_identity TEXT,
        current INTEGER NOT NULL CHECK (current IN (0, 1))
      )`);
      database.run(
        'CREATE UNIQUE INDEX activation_current_subject ON activation_request(repository_id, subject_key) WHERE current = 1',
      );
      database.run(`CREATE TABLE activation_delivery (
        source_id TEXT NOT NULL,
        delivery_id TEXT NOT NULL,
        payload_digest TEXT NOT NULL,
        PRIMARY KEY (source_id, delivery_id)
      )`);
      database.run(`CREATE TABLE activation_subject (
        repository_id INTEGER NOT NULL,
        subject_key TEXT NOT NULL,
        high_water_generation INTEGER NOT NULL CHECK (high_water_generation >= 0),
        observation_version INTEGER NOT NULL CHECK (observation_version >= 1),
        PRIMARY KEY (repository_id, subject_key)
      )`);
      database.run(`CREATE TABLE activation_obligation (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        kind TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        protocol_identity TEXT NOT NULL,
        command_identity TEXT,
        phase TEXT,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        state TEXT NOT NULL,
        receipt_identity TEXT,
        PRIMARY KEY (request_identity, obligation_identity),
        FOREIGN KEY (request_identity) REFERENCES activation_request(request_identity)
      )`);
      database.run(`CREATE TABLE activation_attempt (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        receipt_identity TEXT NOT NULL,
        receipt_bytes TEXT NOT NULL,
        authentication_bytes TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (request_identity, obligation_identity, attempt),
        UNIQUE (receipt_identity),
        FOREIGN KEY (request_identity, obligation_identity)
          REFERENCES activation_obligation(request_identity, obligation_identity)
      )`);
      database.run('PRAGMA user_version = 3');
    });
  }
  if (version === 2) {
    // Proof: omitting this versioned migration made a persisted evaluating request lose its attempt table.
    transaction(database, () => {
      database.run('ALTER TABLE activation_request ADD COLUMN evidence_set_identity TEXT');
      database.run(`CREATE TABLE activation_attempt (
        request_identity TEXT NOT NULL,
        obligation_identity TEXT NOT NULL,
        attempt INTEGER NOT NULL CHECK (attempt >= 0),
        receipt_identity TEXT NOT NULL,
        receipt_bytes TEXT NOT NULL,
        authentication_bytes TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (request_identity, obligation_identity, attempt),
        UNIQUE (receipt_identity),
        FOREIGN KEY (request_identity, obligation_identity)
          REFERENCES activation_obligation(request_identity, obligation_identity)
      )`);
      database.run('PRAGMA user_version = 3');
    });
  }
}

/**
 * Owns local durable request stages. The independently controlled deployment, authenticated
 * provider and publisher remain required before this controller can issue trusted admission.
 */
export class ActivationController {
  readonly #database: Database;

  constructor(private readonly options: ActivationControllerOptions) {
    this.#database = new Database(options.databasePath, { create: true, strict: true });
    initialize(this.#database);
  }

  close(): void {
    this.#database.close();
  }

  #subjectVersion(repositoryId: number, key: string): number {
    const observed: unknown = this.#database
      .query(
        'SELECT observation_version FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(repositoryId, key);
    return observed === null
      ? 0
      : parseOrThrow(type({ observation_version: 'number.integer>=1' }), observed)
          .observation_version;
  }

  observe(candidate: ObservedCandidate): ActivationRequest {
    const frozen = prepareObservedRequest(this.options.bootstrapPath, this.options.pin, candidate);
    nowFrom(this.options.clock);
    return transaction(this.#database, () => this.#observeIn(candidate, frozen.request));
  }

  #observeIn(candidate: ObservedCandidate, frozen: ActivationRequest): ActivationRequest {
    const key = subjectKey(candidate.subject);
    const active: unknown = this.#database
      .query(
        'SELECT * FROM activation_request WHERE repository_id = ? AND subject_key = ? AND current = 1',
      )
      .get(candidate.repositoryId, key);
    const previous = active === null ? undefined : parseOrThrow(StoredRow, active);
    const subjectGeneration: unknown = this.#database
      .query(
        'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
      )
      .get(candidate.repositoryId, key);
    const highWater =
      subjectGeneration === null
        ? 0
        : parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subjectGeneration)
            .high_water_generation;
    if (previous !== undefined) {
      const current = storedRequest(previous).request;
      // Proof: omitting this check let a missing trusted high-water row silently reuse a current request.
      if (highWater < current.auditGeneration)
        throw new Error('activation subject generation absent');
      const { auditGeneration: _generation, requestIdentity: _oldDigest, ...oldIdentity } = current;
      const {
        auditGeneration: _baseGeneration,
        requestIdentity: _newDigest,
        ...newIdentity
      } = frozen;
      if (
        previous.bootstrap_identity === this.options.pin.identity &&
        hashCanonical(oldIdentity) === hashCanonical(newIdentity)
      ) {
        // Proof: omitting this fence let an older held B source read supersede a newer unchanged A observation.
        this.#database
          .query(
            'UPDATE activation_subject SET observation_version = observation_version + 1 WHERE repository_id = ? AND subject_key = ?',
          )
          .run(candidate.repositoryId, key);
        return current;
      }
    }
    const configuration = readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
    // Proof: removing the durable high-water read made close/reopen reuse the first request PK.
    const generation = Math.max(configuration.authorityGeneration, highWater + 1);
    if (previous !== undefined && generation <= storedRequest(previous).request.auditGeneration) {
      throw new Error('activation subject generation regressed');
    }
    const next = createActivationRequest({
      ...candidate,
      authorityIdentity: this.options.pin.identity,
      auditGeneration: generation,
    });
    if (previous !== undefined) {
      this.#database
        .query(
          "UPDATE activation_request SET current = 0, stage = 'superseded', version = version + 1 WHERE request_identity = ? AND current = 1",
        )
        .run(previous.request_identity);
    }
    this.#database
      .query(
        `INSERT INTO activation_request (
          request_identity, repository_id, subject_key, request_bytes, bootstrap_identity,
          stage, version, lease_epoch, lease_owner, lease_expires_at, current
        ) VALUES (?, ?, ?, ?, ?, 'observed', 0, 0, NULL, NULL, 1)`,
      )
      .run(next.identity, candidate.repositoryId, key, next.bytes, this.options.pin.identity);
    // Proof: omitting the high-water write let a restarted controller reuse a closed request PK.
    this.#database
      .query(
        `INSERT INTO activation_subject (repository_id, subject_key, high_water_generation, observation_version)
          VALUES (?, ?, ?, 1) ON CONFLICT(repository_id, subject_key)
          DO UPDATE SET high_water_generation = excluded.high_water_generation,
                        observation_version = activation_subject.observation_version + 1`,
      )
      .run(candidate.repositoryId, key, generation);
    return next.request;
  }

  /** Re-observes source truth; an event payload alone never chooses the candidate request. */
  async observeDelivery(input: ObservedDelivery): Promise<ActivationRequest | undefined> {
    const delivery = parseOrThrow(DeliveryRecord, input);
    return this.#observeAuthoritative(delivery.repositoryId, delivery.subject, delivery);
  }

  async #observeAuthoritative(
    repositoryId: number,
    subject: ActivationSubject,
    delivery?: ObservedDelivery,
  ): Promise<ActivationRequest | undefined> {
    const key = subjectKey(subject);
    for (let observationAttempt = 0; observationAttempt < 3; observationAttempt += 1) {
      const observedVersion = this.#subjectVersion(repositoryId, key);
      const authoritative = await this.options.currentCandidate(repositoryId, subject);
      if (
        authoritative.kind === 'ready' &&
        (authoritative.candidate.repositoryId !== repositoryId ||
          subjectKey(authoritative.candidate.subject) !== key)
      ) {
        // Proof: omitting this source-subject join let a delayed group delivery select another PR.
        throw new Error('authoritative candidate differs from delivery subject');
      }
      const frozen =
        authoritative.kind === 'ready'
          ? prepareObservedRequest(
              this.options.bootstrapPath,
              this.options.pin,
              authoritative.candidate,
            )
          : undefined;
      const accepted = transaction(this.#database, () => {
        // Proof: removing the subject-version comparison let a delayed A response supersede newer B.
        if (this.#subjectVersion(repositoryId, key) !== observedVersion) {
          return { kind: 'stale' as const };
        }
        const recorded: unknown =
          delivery === undefined
            ? null
            : this.#database
                .query(
                  'SELECT payload_digest FROM activation_delivery WHERE source_id = ? AND delivery_id = ?',
                )
                .get(delivery.sourceId, delivery.deliveryId);
        if (delivery !== undefined && recorded !== null) {
          const prior = parseOrThrow(type({ payload_digest: /^[0-9a-f]{64}$/ }), recorded);
          if (prior.payload_digest !== delivery.payloadDigest) {
            // Proof: omission accepted the same authenticated delivery ID with changed bytes.
            throw new Error('delivery ID reused with different payload');
          }
        }
        let request: ActivationRequest | undefined;
        if (authoritative.kind === 'ready' && frozen !== undefined) {
          request = this.#observeIn(authoritative.candidate, frozen.request);
        } else {
          this.#database
            .query(
              "UPDATE activation_request SET current = 0, stage = 'superseded', version = version + 1 WHERE repository_id = ? AND subject_key = ? AND current = 1",
            )
            .run(repositoryId, key);
          // Proof: without a first-close tombstone, held ready at version 0 committed after close.
          // Proof: skipping a repeated closed observation let an older held ready response reopen the subject.
          this.#database
            .query(
              `INSERT INTO activation_subject (repository_id, subject_key, high_water_generation, observation_version)
                VALUES (?, ?, 0, 1) ON CONFLICT(repository_id, subject_key)
                DO UPDATE SET observation_version = activation_subject.observation_version + 1`,
            )
            .run(repositoryId, key);
        }
        if (delivery !== undefined && recorded === null) {
          this.#database
            .query(
              'INSERT INTO activation_delivery (source_id, delivery_id, payload_digest) VALUES (?, ?, ?)',
            )
            .run(delivery.sourceId, delivery.deliveryId, delivery.payloadDigest);
        }
        return { kind: 'accepted' as const, request };
      });
      if (accepted.kind === 'accepted') {
        return accepted.request;
      }
    }
    throw new Error('authoritative subject observation did not converge');
  }

  async reconcileReady(): Promise<readonly ActivationRequest[]> {
    const candidates = await this.options.readyCandidates();
    const subjects = new Map<
      string,
      { readonly repositoryId: number; readonly subject: ActivationSubject }
    >();
    for (const candidate of candidates) {
      const repositoryId = parseOrThrow(type('number.integer>=1'), candidate.repositoryId);
      const subject = parseOrThrow(ActivationSubject, candidate.subject);
      subjects.set(`${String(repositoryId)}:${subjectKey(subject)}`, { repositoryId, subject });
    }
    // Proof: polling only ready candidates left a durable active request current after a lost close event.
    const activeRows: unknown[] = this.#database
      .query('SELECT * FROM activation_request WHERE current = 1')
      .all();
    for (const activeRow of activeRows) {
      const active = storedRequest(parseOrThrow(StoredRow, activeRow)).request;
      subjects.set(`${String(active.repositoryId)}:${subjectKey(active.subject)}`, {
        repositoryId: active.repositoryId,
        subject: active.subject,
      });
    }
    const requests: ActivationRequest[] = [];
    for (const { repositoryId, subject } of subjects.values()) {
      // Proof: using the timer-listed candidate directly persisted stale A after source advanced to B.
      const request = await this.#observeAuthoritative(repositoryId, subject);
      if (request !== undefined) requests.push(request);
    }
    return requests;
  }

  readRequest(identity: string): StoredRequest | undefined {
    const row = readRow(this.#database, identity);
    return row === undefined ? undefined : storedRequest(row);
  }

  listRequests(): readonly StoredRequest[] {
    const rows: unknown[] = this.#database
      .query('SELECT * FROM activation_request ORDER BY rowid')
      .all();
    return rows.map((row) => storedRequest(parseOrThrow(StoredRow, row)));
  }

  listObligations(
    identity: string,
  ): readonly { readonly identity: string; readonly kind: 'check' | 'audit' }[] {
    const rows: unknown[] = this.#database
      .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
      .all(identity);
    return rows.map((row) => {
      const obligation = parseOrThrow(StoredObligation, row);
      return { identity: obligation.obligation_identity, kind: obligation.kind };
    });
  }

  claim(identity: string, workerId: string, leaseMilliseconds: number): RequestLease {
    if (!workerId || !Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds < 1) {
      throw new Error('activation worker lease malformed');
    }
    const now = nowFrom(this.options.clock);
    return transaction(this.#database, () => {
      const row = readRow(this.#database, identity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: omitting current changed the superseded-claim refusal to a stage refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      // Proof: omitting stage granted a new lease to an already evaluating request.
      if (row.stage !== 'observed') throw new Error('activation request stage changed');
      // Proof: omitting the active-lease check let a second worker replace an unexpired owner.
      if (row.lease_owner !== null && row.lease_expires_at !== null && row.lease_expires_at > now) {
        throw new Error('activation request lease held');
      }
      const leaseEpoch = row.lease_epoch + 1;
      const version = row.version + 1;
      this.#database
        .query(
          'UPDATE activation_request SET lease_owner = ?, lease_expires_at = ?, lease_epoch = ?, version = ? WHERE request_identity = ?',
        )
        .run(workerId, now + leaseMilliseconds, leaseEpoch, version, identity);
      return { requestIdentity: identity, leaseEpoch, version, workerId };
    });
  }

  /** Freezes trusted check and audit obligations; later transitions require their own evidence APIs. */
  beginEvaluation(lease: RequestLease): StoredRequest {
    const now = nowFrom(this.options.clock);
    // Proof: splitting the transaction after the check INSERT left that row when the audit INSERT failed.
    return transaction(this.#database, () => {
      const row = readRow(this.#database, lease.requestIdentity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: omitting current changed the superseded-evaluation refusal to a lease refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      // Proof: independently omitting epoch, owner, version, expiry and null-expiry checks
      // let the corresponding stale or malformed lease advance to evaluating.
      if (
        row.lease_epoch !== lease.leaseEpoch ||
        row.lease_owner !== lease.workerId ||
        row.version !== lease.version ||
        row.lease_expires_at === null ||
        isExpiredLease(row.lease_expires_at, now)
      ) {
        throw new Error('activation request lease changed');
      }
      // Proof: omitting stage retried evaluation until its obligation PK failed instead of refusing.
      if (row.stage !== 'observed') {
        throw new Error('activation request stage changed');
      }
      const request = storedRequest(row).request;
      // Proof: omitting this reread froze obligations after the pinned bootstrap disappeared.
      readBootstrapConfiguration(this.options.bootstrapPath, this.options.pin);
      // Proof: omitting this authority join froze old-request obligations under a new valid pin.
      if (request.authorityIdentity !== this.options.pin.identity) {
        throw new Error('activation request authority changed');
      }
      const plan = parseOrThrow(EvaluationPlan, this.options.selectObligations(request));
      // Proof: omitting the plan/request binding let another request's obligations enter evaluation.
      if (
        plan.requestIdentity !== request.requestIdentity ||
        plan.policyIdentity !== request.policyIdentity
      ) {
        throw new Error('evaluation obligations differ from request policy');
      }
      const identities = new Set(plan.obligations.map((obligation) => obligation.identity));
      // Proof: removing either kind or duplicate guard let an incomplete/ambiguous plan advance.
      if (
        identities.size !== plan.obligations.length ||
        !plan.obligations.some((obligation) => obligation.kind === 'check') ||
        !plan.obligations.some((obligation) => obligation.kind === 'audit')
      ) {
        throw new Error('evaluation obligations incomplete or duplicated');
      }
      for (const obligation of plan.obligations) {
        this.#database
          .query(
            `INSERT INTO activation_obligation (
            request_identity, obligation_identity, kind, executor_id, protocol_identity,
            command_identity, phase, attempt, state, receipt_identity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pending', NULL)`,
          )
          .run(
            request.requestIdentity,
            obligation.identity,
            obligation.kind,
            obligation.executorId,
            obligation.protocolIdentity,
            obligation.kind === 'check' ? obligation.commandIdentity : null,
            obligation.kind === 'audit' ? obligation.phase : null,
          );
      }
      this.#database
        .query(
          "UPDATE activation_request SET stage = 'evaluating', evaluation_plan_identity = ?, version = version + 1 WHERE request_identity = ?",
        )
        .run(hashCanonical(plan), lease.requestIdentity);
      const advanced = readRow(this.#database, lease.requestIdentity);
      if (advanced === undefined) throw new Error('advanced activation request absent');
      return storedRequest(advanced);
    });
  }

  /** Persists independently authenticated evidence; a local fake verifier cannot establish external provenance. */
  async recordReceipt(lease: RequestLease, receiptBytes: string): Promise<StoredRequest> {
    // Proof: omission sent absent bytes to the verifier and lost the boundary refusal.
    if (typeof receiptBytes !== 'string' || receiptBytes.length === 0) {
      throw new Error('activation receipt bytes absent');
    }
    const authenticate = this.options.authenticateReceipt;
    // Proof: omission changed the missing-verifier refusal into an unmodeled invocation error.
    if (authenticate === undefined) throw new Error('activation receipt verifier absent');
    const receipt = parseOrThrow(AuthenticatedReceipt, await authenticate(receiptBytes));
    // Proof: replacing exact-byte identity let a verifier relabel receipt bytes for another obligation.
    if (receipt.receiptIdentity !== hashBytes(receiptBytes)) {
      throw new Error('authenticated receipt digest differs from exact bytes');
    }
    return transaction(this.#database, () => {
      const now = nowFrom(this.options.clock);
      const row = readRow(this.#database, lease.requestIdentity);
      if (row === undefined) throw new Error('activation request absent');
      // Proof: omitting current changed held-verifier supersession into a later generation refusal.
      if (row.current !== 1) throw new Error('activation request superseded');
      const request = storedRequest(row).request;
      const subject: unknown = this.#database
        .query(
          'SELECT high_water_generation FROM activation_subject WHERE repository_id = ? AND subject_key = ?',
        )
        .get(request.repositoryId, subjectKey(request.subject));
      // Proof: omitting this join accepted a receipt against inconsistent subject high-water history.
      if (
        subject === null ||
        parseOrThrow(type({ high_water_generation: 'number.integer>=0' }), subject)
          .high_water_generation !== request.auditGeneration
      ) {
        throw new Error('activation request generation changed');
      }
      const configuration = readBootstrapConfiguration(
        this.options.bootstrapPath,
        this.options.pin,
      );
      // Proof: bypassing the pin reread let receipt recording continue after the trusted file disappeared.
      // Proof: omitting the old-request authority comparison accepted a second valid bootstrap pin.
      if (
        request.authorityIdentity !== this.options.pin.identity ||
        row.bootstrap_identity !== this.options.pin.identity
      ) {
        throw new Error('activation request authority changed');
      }
      // Proof: issuer omission accepted another journal identity in the mounted receipt owner.
      if (receipt.issuerId !== configuration.journal.issuerId) {
        throw new Error('authenticated receipt issuer differs from pinned journal');
      }
      // Proof: request omission accepted a receipt authenticated for another canonical request.
      if (receipt.requestIdentity !== request.requestIdentity) {
        throw new Error('authenticated receipt request differs from current request');
      }
      const rawObligation: unknown = this.#database
        .query(
          'SELECT * FROM activation_obligation WHERE request_identity = ? AND obligation_identity = ?',
        )
        .get(request.requestIdentity, receipt.obligationIdentity);
      // Proof: omission lost the named refusal for a foreign obligation identity.
      if (rawObligation === null) throw new Error('authenticated receipt obligation absent');
      const obligation = parseOrThrow(StoredObligation, rawObligation);
      // Proof: kind omission changed the explicit kind refusal into a later shape refusal.
      if (receipt.kind !== obligation.kind) {
        throw new Error('authenticated receipt kind differs from frozen obligation');
      }
      // Proof: independently removing executor, protocol, command and phase comparisons
      // accepted receipts with the corresponding wrong frozen-plan binding.
      if (
        receipt.executorId !== obligation.executor_id ||
        receipt.protocolIdentity !== obligation.protocol_identity ||
        (receipt.kind === 'check'
          ? receipt.commandIdentity !== obligation.command_identity
          : receipt.phase !== obligation.phase)
      ) {
        throw new Error('authenticated receipt differs from frozen obligation');
      }
      // Proof: attempt omission accepted a receipt for an unreserved attempt number.
      if (receipt.attempt !== obligation.attempt) {
        throw new Error('authenticated receipt attempt differs from reserved attempt');
      }
      const authenticationBytes = serializeCanonical(receipt);
      const existing: unknown = this.#database
        .query(
          'SELECT * FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ? AND attempt = ?',
        )
        .get(request.requestIdentity, obligation.obligation_identity, receipt.attempt);
      if (existing !== null) {
        const prior = parseOrThrow(StoredAttempt, existing);
        // Proof: omitting the whole immutable comparison replaced a conflicting attempt's refusal.
        if (
          prior.receipt_identity !== receipt.receiptIdentity ||
          prior.receipt_bytes !== receiptBytes ||
          prior.authentication_bytes !== authenticationBytes
        ) {
          throw new Error('authenticated receipt attempt conflicts with immutable evidence');
        }
        return storedRequest(row);
      }
      // Proof: stage omission let a failed request return to evaluating on another receipt.
      if (row.stage !== 'evaluating') throw new Error('activation request is not evaluating');
      // Proof: independent epoch, owner, null-expiry and elapsed-expiry omissions
      // accepted a stale or malformed completion at the receipt owner.
      if (
        row.lease_epoch !== lease.leaseEpoch ||
        row.lease_owner !== lease.workerId ||
        row.lease_expires_at === null ||
        isExpiredLease(row.lease_expires_at, now)
      ) {
        throw new Error('activation request lease changed');
      }
      // Proof: omission accepted a nonpending obligation whose selected attempt was absent.
      if (obligation.state !== 'pending' || obligation.receipt_identity !== null) {
        throw new Error('activation obligation already completed');
      }
      // Proof: cold-order omission admitted informed audit evidence before its cold obligation.
      if (receipt.kind === 'audit' && receipt.phase === 'informed') {
        const cold: unknown = this.#database
          .query(
            "SELECT COUNT(*) AS completed FROM activation_obligation WHERE request_identity = ? AND kind = 'audit' AND phase = 'cold' AND state = 'passed'",
          )
          .get(request.requestIdentity);
        if (parseOrThrow(type({ completed: 'number.integer>=0' }), cold).completed === 0) {
          throw new Error('informed audit requires completed cold audit');
        }
      }
      // Proof: splitting commit immediately after this insert left a second receipt attempt
      // after the verified-stage write failed, while the earlier check remained committed.
      this.#database
        .query(
          `INSERT INTO activation_attempt (
        request_identity, obligation_identity, attempt, receipt_identity,
        receipt_bytes, authentication_bytes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          request.requestIdentity,
          obligation.obligation_identity,
          receipt.attempt,
          receipt.receiptIdentity,
          receiptBytes,
          authenticationBytes,
          receipt.status,
        );
      // Proof: omitting the selected-obligation update left both receipts recorded but never verified.
      this.#database
        .query(
          'UPDATE activation_obligation SET state = ?, receipt_identity = ? WHERE request_identity = ? AND obligation_identity = ?',
        )
        .run(
          receipt.status,
          receipt.receiptIdentity,
          request.requestIdentity,
          obligation.obligation_identity,
        );
      const selectedRows: unknown[] = this.#database
        .query('SELECT * FROM activation_obligation WHERE request_identity = ? ORDER BY rowid')
        .all(request.requestIdentity);
      const selected = selectedRows.map((entry) => parseOrThrow(StoredObligation, entry));
      const frozenObligations = selected.map((entry) => {
        const common = {
          identity: entry.obligation_identity,
          executorId: entry.executor_id,
          protocolIdentity: entry.protocol_identity,
        };
        if (entry.kind === 'check') {
          // Proof: a check row with an audit phase otherwise reconstructs as a valid
          // check and can preserve the frozen-plan digest despite malformed storage.
          if (entry.command_identity === null || entry.phase !== null) {
            throw new Error('stored check obligation malformed');
          }
          return parseOrThrow(EvaluationObligation, {
            ...common,
            kind: 'check',
            commandIdentity: entry.command_identity,
          });
        }
        // Proof: an audit row with a command identity otherwise reconstructs as a
        // valid audit and can preserve the frozen-plan digest despite malformed storage.
        if (entry.command_identity !== null || entry.phase === null) {
          throw new Error('stored audit obligation malformed');
        }
        return parseOrThrow(EvaluationObligation, {
          ...common,
          kind: 'audit',
          phase: entry.phase,
        });
      });
      // Proof: omitting the frozen-plan join let one surviving passed obligation verify
      // after the other required row had disappeared from the durable plan.
      if (
        row.evaluation_plan_identity !==
        hashCanonical({
          requestIdentity: request.requestIdentity,
          policyIdentity: request.policyIdentity,
          obligations: frozenObligations,
        })
      ) {
        throw new Error('authenticated receipts differ from frozen evaluation plan');
      }
      for (const entry of selected) {
        if (entry.state !== 'passed') continue;
        const rawAttempt: unknown = this.#database
          .query(
            'SELECT * FROM activation_attempt WHERE request_identity = ? AND obligation_identity = ? AND attempt = ?',
          )
          .get(request.requestIdentity, entry.obligation_identity, entry.attempt);
        // Proof: deleting the previously selected check attempt still left the check row
        // marked passed and let the later audit verify without this retained-evidence join.
        if (rawAttempt === null) throw new Error('selected receipt evidence absent');
        const saved = parseOrThrow(StoredAttempt, rawAttempt);
        let authenticated: AuthenticatedReceipt;
        try {
          authenticated = parseOrThrow(
            AuthenticatedReceipt,
            JSON.parse(saved.authentication_bytes),
          );
        } catch (cause) {
          throw new Error('selected receipt evidence malformed', { cause });
        }
        // Proof: a schema-valid retained receipt with the wrong executor verified
        // when only this executor binding was removed; the mounted test failed 0/1.
        if (
          entry.receipt_identity === null ||
          saved.receipt_identity !== entry.receipt_identity ||
          saved.request_identity !== request.requestIdentity ||
          saved.obligation_identity !== entry.obligation_identity ||
          saved.attempt !== entry.attempt ||
          saved.status !== 'passed' ||
          hashBytes(saved.receipt_bytes) !== saved.receipt_identity ||
          serializeCanonical(authenticated) !== saved.authentication_bytes ||
          authenticated.receiptIdentity !== saved.receipt_identity ||
          authenticated.issuerId !== configuration.journal.issuerId ||
          authenticated.requestIdentity !== request.requestIdentity ||
          authenticated.obligationIdentity !== entry.obligation_identity ||
          authenticated.attempt !== entry.attempt ||
          authenticated.kind !== entry.kind ||
          authenticated.status !== 'passed' ||
          authenticated.executorId !== entry.executor_id ||
          authenticated.protocolIdentity !== entry.protocol_identity ||
          (authenticated.kind === 'check'
            ? authenticated.commandIdentity !== entry.command_identity
            : authenticated.phase !== entry.phase)
        ) {
          throw new Error('selected receipt evidence differs from frozen obligation');
        }
      }
      // Proof: forcing completeness after only the first receipt advanced before the audit existed.
      const complete = selected.every(
        (entry) => entry.state === 'passed' && entry.receipt_identity !== null,
      );
      // Proof: omitting terminal failure handling left a failed required receipt evaluating.
      const nextStage: RequestStage =
        receipt.status !== 'passed' ? 'failed' : complete ? 'verified' : 'evaluating';
      // Proof: replacing the selected-set digest with an empty-set digest failed the exact identity assertion.
      const evidenceSetIdentity = complete
        ? hashCanonical(
            selected
              .toSorted((left, right) =>
                left.obligation_identity < right.obligation_identity
                  ? -1
                  : left.obligation_identity > right.obligation_identity
                    ? 1
                    : 0,
              )
              .map((entry) => ({
                obligationIdentity: entry.obligation_identity,
                receiptIdentity: entry.receipt_identity,
              })),
          )
        : null;
      const updated = this.#database
        .query(
          'UPDATE activation_request SET stage = ?, evidence_set_identity = ?, version = version + 1 WHERE request_identity = ? AND version = ?',
        )
        .run(nextStage, evidenceSetIdentity, request.requestIdentity, row.version);
      // Proof: omitting this affected-row check returned success when a trigger ignored
      // the verified update; the owner instead rolls back the second receipt atomically.
      if (updated.changes !== 1) throw new Error('activation request version changed');
      const advanced = readRow(this.#database, request.requestIdentity);
      if (advanced === undefined) throw new Error('activation request absent after receipt');
      return storedRequest(advanced);
    });
  }
}

/** Opens the persisted controller state without relying on candidate checkout storage. */
export function openActivationController(
  options: ActivationControllerOptions,
): ActivationController {
  return new ActivationController(options);
}

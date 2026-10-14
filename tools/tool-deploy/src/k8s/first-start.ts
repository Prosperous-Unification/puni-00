import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  assertExportSound,
  assertRestoredMatches,
  parseSqliteReport,
  type SqliteReport,
} from './cutover';
import {
  createCutoverIdentity,
  type CutoverIdentity,
  validateCutoverReplay,
} from './cutover-replay';
import { parseDescriptor, releaseIdentityOf } from './descriptor';
import type { ReleaseEffects } from './execute';
import { parseSourceReceipt, type SourceReceipt } from './first-start-source';
import { sha256Of } from './migration-capture';
import {
  type ClusterIdentity,
  decideLease,
  type FluxUnit,
  K8S_TIERS,
  type K8sTier,
  type ReleaseIdentity,
} from './release';

/** Original restored bytes and immutable cluster objects admitted by this first installation. */
export interface FirstStartRequest {
  environment: 'local' | 'staging' | 'prod';
  identity: CutoverIdentity;
  exported: SqliteReport;
  restored: SqliteReport;
  cluster: ClusterIdentity;
  namespaces: { app: string; backend: string; appUid: string; backendUid: string };
  pvc: { name: string; uid: string; path: string };
  restore: { name: string; uid: string };
  flux: FluxUnit;
}

const PHASES = [
  'requested',
  'admitted',
  'starting',
  'ready',
  'recorded',
  'handed',
  'complete',
] as const;
type Phase = (typeof PHASES)[number];

/** Separate from release journal schema 3; receipt seals the actual stopped-writer observation. */
export interface FirstStartState {
  version: 2;
  transaction: string;
  requestBytes: string;
  requestSha256: string;
  phase: Phase;
  receipt: { bytes: string; sha256: string } | null;
  source: SourceReceipt | null;
}

/** Missing is a new transaction; malformed/unreadable state always throws. */
export interface FirstStartJournal {
  path: string;
  read(): unknown;
  write(state: FirstStartState): void;
}

/** Each effect proves its postcondition or throws; the coordinator decides the order. */
export interface FirstStartEffects extends Pick<
  ReleaseEffects,
  | 'readLease'
  | 'createLease'
  | 'takeoverLease'
  | 'renewLease'
  | 'parkLease'
  | 'releaseLease'
  | 'closeWrites'
  | 'suspendFlux'
  | 'persistRelease'
  | 'fluxSourceRevision'
  | 'resumeFlux'
> {
  /** Read-only target identity/template check before the Lease or any cluster mutation. */
  assertTarget(request: FirstStartRequest): Promise<void>;
  admitSource(request: FirstStartRequest, prior: SourceReceipt | null): Promise<SourceReceipt>;
  resumeSource(request: FirstStartRequest, source: SourceReceipt): Promise<void>;
  stopTiers(request: FirstStartRequest): Promise<void>;
  /** Checks cluster/namespaces/PVC, closed fence, suspension and optional absence of writer Pods. */
  assertSafety(request: FirstStartRequest, stopped: boolean, handed: boolean): Promise<void>;
  /** Requires the named completed restore Job UID, image, PVC mount and its original report. */
  observeRestore(request: FirstStartRequest): Promise<SqliteReport>;
  /** Fresh image-owned read-only observation of actual mounted SQLite; never trusts arrival markers. */
  observePvc(
    request: FirstStartRequest,
    transaction: string,
  ): Promise<{ report: SqliteReport; activation: string }>;
  startTier(tier: K8sTier, image: string): Promise<void>;
  verifyTiers(identity: ReleaseIdentity): Promise<void>;
  currentRelease(): Promise<ReleaseIdentity | null>;
}

function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start state is malformed');
  // Boundary: non-null object shape permits unknown protocol field inspection.
  return raw as Record<string, unknown>;
}

function verifyReport(report: SqliteReport): void {
  parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(report)}`);
  assertExportSound(report);
}

/** Refuses foreign descriptors, missing immutable object identities and unverified restore reports. */
export function assertFirstStartRequest(request: FirstStartRequest): ReleaseIdentity {
  // Proof: malformed operator namespace negative fails when trusted namespace admission is omitted.
  if (request.namespaces.app !== 'wbs' || request.namespaces.backend !== 'wbs-solver')
    throw new Error('first-start namespaces differ from the trusted WBS render');
  if (!['local', 'staging', 'prod'].includes(request.environment))
    throw new Error('first-start trusted render environment is invalid');
  createCutoverIdentity(
    request.identity.descriptorBytes,
    request.identity.descriptorSha256,
    request.identity.oldBackendImage,
    request.identity.backendImage,
  );
  for (const name of [
    request.cluster.context,
    request.cluster.uid,
    request.namespaces.app,
    request.namespaces.backend,
    request.namespaces.appUid,
    request.namespaces.backendUid,
    request.pvc.uid,
    request.restore.uid,
    request.restore.name,
    request.flux.namespace,
    request.flux.kustomization,
    request.flux.gitRepository,
  ]) {
    if (typeof name !== 'string' || name === '')
      throw new Error('first-start requires every immutable target identity');
  }
  if (
    request.pvc.name !== 'wbs-data' ||
    request.pvc.path !== '/data/wbs.sqlite' ||
    request.restored.path !== request.pvc.path ||
    !/^[0-9a-f]{40}$/.test(request.flux.desiredRevision) ||
    !/^[0-9a-f]{40}$/.test(request.flux.previousRevision)
  )
    throw new Error('first-start PVC path or Flux revision is invalid');
  verifyReport(request.exported);
  verifyReport(request.restored);
  assertRestoredMatches(request.exported, request.restored);
  const before = validateCutoverReplay(
    request.exported.replay,
    request.identity,
    request.exported.sha256,
  );
  const after = validateCutoverReplay(
    request.restored.replay,
    request.identity,
    request.exported.sha256,
  );
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('first-start restored replay differs from export');
  return releaseIdentityOf(
    parseDescriptor(JSON.parse(request.identity.descriptorBytes) as unknown),
  );
}

/** Parse external operator input once; every required field is read before creating effects. */
export function parseFirstStartRequest(raw: unknown): FirstStartRequest {
  const fields = requireRecord(raw);
  const text = (source: Record<string, unknown>, name: string): string => {
    const value = source[name];
    if (typeof value !== 'string' || value === '')
      throw new Error(`first-start request lacks ${name}`);
    return value;
  };
  const identity = requireRecord(fields['identity']);
  const cluster = requireRecord(fields['cluster']);
  const namespaces = requireRecord(fields['namespaces']);
  const pvc = requireRecord(fields['pvc']);
  const restore = requireRecord(fields['restore']);
  const flux = requireRecord(fields['flux']);
  const request: FirstStartRequest = {
    environment:
      fields['environment'] === 'local' ||
      fields['environment'] === 'staging' ||
      fields['environment'] === 'prod'
        ? fields['environment']
        : (() => {
            throw new Error('first-start trusted render environment is invalid');
          })(),
    identity: createCutoverIdentity(
      text(identity, 'descriptorBytes'),
      text(identity, 'descriptorSha256'),
      text(identity, 'oldBackendImage'),
      text(identity, 'backendImage'),
    ),
    exported: parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(fields['exported'])}`),
    restored: parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(fields['restored'])}`),
    cluster: { context: text(cluster, 'context'), uid: text(cluster, 'uid') },
    namespaces: {
      app: text(namespaces, 'app'),
      backend: text(namespaces, 'backend'),
      appUid: text(namespaces, 'appUid'),
      backendUid: text(namespaces, 'backendUid'),
    },
    pvc: { name: text(pvc, 'name'), uid: text(pvc, 'uid'), path: text(pvc, 'path') },
    restore: { name: text(restore, 'name'), uid: text(restore, 'uid') },
    flux: {
      namespace: text(flux, 'namespace'),
      kustomization: text(flux, 'kustomization'),
      gitRepository: text(flux, 'gitRepository'),
      desiredRevision: text(flux, 'desiredRevision'),
      previousRevision: text(flux, 'previousRevision'),
    },
  };
  assertFirstStartRequest(request);
  return request;
}

function assertObservation(
  request: FirstStartRequest,
  observation: { report: SqliteReport; activation: string },
): void {
  verifyReport(observation.report);
  // Proof: call omission admitted changed actual main-file bytes in the actual-bytes negative.
  assertRestoredMatches(request.exported, observation.report);
  const actual = validateCutoverReplay(
    observation.report.replay,
    request.identity,
    request.exported.sha256,
  );
  const exported = validateCutoverReplay(
    request.exported.replay,
    request.identity,
    request.exported.sha256,
  );
  // Proof: actual-replay omission admits a changed retained journal inventory in first-start tests.
  if (
    observation.report.path !== request.pvc.path ||
    JSON.stringify(actual) !== JSON.stringify(exported)
  )
    throw new Error('first-start actual PVC replay differs from restore');
  // Proof: disabled-authority omission starts every tier in the enabled-marker refusal test.
  if (observation.activation !== 'DISABLED')
    throw new Error('first-start requires DISABLED step blockage authority');
}

/** Validates sealed disk state before any Lease or cluster mutation, including terminal receipts. */
export function parseFirstStartState(raw: unknown, request: FirstStartRequest): FirstStartState {
  const fields = requireRecord(raw);
  // Proof: request-binding omission allows a changed PVC UID to resume without evidence.
  if (
    fields['version'] !== 2 ||
    typeof fields['transaction'] !== 'string' ||
    !/^first-start-[0-9a-f]{16}$/.test(fields['transaction']) ||
    fields['requestBytes'] !== JSON.stringify(request) ||
    fields['requestSha256'] !== sha256Of(JSON.stringify(request)) ||
    typeof fields['phase'] !== 'string' ||
    !(PHASES as readonly string[]).includes(fields['phase'])
  )
    throw new Error('first-start state belongs to another request or version');
  if (fields['phase'] !== 'requested' || fields['source'] !== null)
    parseSourceReceipt(fields['source'], request);
  if (fields['phase'] !== 'requested' || fields['receipt'] !== null) {
    const receipt = requireRecord(fields['receipt']);
    // Proof: receipt null/digest omission admits corrupted durable admission before scaling.
    if (typeof receipt['bytes'] !== 'string' || receipt['sha256'] !== sha256Of(receipt['bytes']))
      throw new Error('first-start receipt differs from original SHA-256');
    const payload = requireRecord(JSON.parse(receipt['bytes']) as unknown);
    // Proof: each identity omission accepted a resealed foreign transaction/request receipt
    // in the corresponding first-start progress corruption negatives.
    if (
      payload['transaction'] !== fields['transaction'] ||
      payload['requestSha256'] !== fields['requestSha256']
    )
      throw new Error('first-start receipt belongs to another transaction');
    const report = parseSqliteReport(`PUNI_SQLITE_REPORT ${JSON.stringify(payload['report'])}`);
    if (typeof payload['activation'] !== 'string')
      throw new Error('first-start receipt lacks activation');
    assertObservation(request, { report, activation: payload['activation'] });
  }
  // Boundary: protocol fields, phase, request binding and receipt were checked above.
  return fields as unknown as FirstStartState;
}

/** Atomic fsync/rename state, in the protected operator state directory. */
export function firstStartJournal(path: string): FirstStartJournal {
  return {
    path,
    read() {
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
        // Proof: null-file omission treated malformed trusted state as absent in the durable-file test.
        if (parsed === null) throw new Error('first-start state cannot be null');
        return parsed;
      } catch (cause) {
        if (
          typeof cause === 'object' &&
          cause !== null &&
          'code' in cause &&
          cause.code === 'ENOENT'
        )
          return null;
        throw new Error(`first-start state ${path} is unreadable or malformed`, { cause });
      }
    },
    write(state) {
      const pending = join(dirname(path), `.${String(process.pid)}.first-start`);
      const fd = openSync(pending, 'w', 0o600);
      try {
        writeSync(fd, `${JSON.stringify(state)}\n`);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(pending, path);
      const directory = openSync(dirname(path), 'r');
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    },
  };
}

/**
 * Admit and start a first installation under the existing WBS Lease. A retry stops every tier
 * and repeats the actual PVC observation; startup changes to restored bytes refuse recovery.
 * Failures keep the writer fence closed, Flux suspended and Lease parked. Writes stay fenced
 * after successful handoff; traffic opening is a separate attended cutover operation.
 */
export async function startCutover(
  request: FirstStartRequest,
  journal: FirstStartJournal,
  effects: FirstStartEffects,
  heartbeatMs = 3000,
): Promise<FirstStartState> {
  const release = assertFirstStartRequest(request);
  const raw = journal.read();
  let state: FirstStartState =
    raw === null
      ? {
          version: 2,
          transaction: `first-start-${randomBytes(8).toString('hex')}`,
          requestBytes: JSON.stringify(request),
          requestSha256: sha256Of(JSON.stringify(request)),
          phase: 'requested',
          receipt: null,
          source: null,
        }
      : parseFirstStartState(raw, request);
  if (state.phase === 'complete') return state;
  // Proof: target-preflight omission lets the foreign-target negative acquire a Lease and scale.
  await effects.assertTarget(request);
  const holder = `${state.transaction}#${randomBytes(4).toString('hex')}`;
  const observed = await effects.readLease();
  // Proof: omission accepted a parked transaction after its journal disappeared (parked-Lease negative).
  if (raw === null && observed !== null)
    throw new Error(
      'first-start Lease exists without its durable transaction journal; manual recovery required',
    );
  const decision = decideLease(
    observed,
    {
      holder,
      journalTransaction: raw === null ? null : state.transaction,
      journalPath: journal.path,
    },
    Date.now(),
  );
  if (decision.kind === 'wait')
    throw new Error('first-start Lease is still live; retry after its expiry');
  if (decision.kind === 'create') await effects.createLease(holder, journal.path);
  if (decision.kind === 'takeover') {
    if (observed === null) throw new Error('first-start takeover has no observed Lease');
    await effects.takeoverLease(holder, observed.version, journal.path);
  }
  const leaseState: { lost: Error | null } = { lost: null };
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();
  const renew = async (): Promise<void> => {
    if (leaseState.lost !== null)
      throw new Error('first-start Lease renewal failed', { cause: leaseState.lost });
    pending++;
    const next = queue.then(() => effects.renewLease(holder));
    queue = next.then(
      () => {
        pending--;
      },
      (cause: unknown) => {
        pending--;
        leaseState.lost = new Error('first-start Lease renewal failed', { cause });
      },
    );
    await next;
  };
  const heartbeat = setInterval(() => {
    // Proof: removing pending suppression timed out the 1ms heartbeat / 2ms renewal resume test.
    if (pending > 0) return;
    void renew().catch((cause: unknown) => {
      leaseState.lost = new Error('first-start Lease heartbeat failed', { cause });
    });
  }, heartbeatMs);
  const persist = (phase: Phase): void => {
    state = { ...state, phase };
    journal.write(state);
    // Proof: reread omission accepts journal corruption injected after persisted admission.
    state = parseFirstStartState(journal.read(), request);
  };
  try {
    if (raw === null) persist('requested');
    await renew();
    await effects.suspendFlux(request.flux);
    await effects.closeWrites();
    await renew();
    await effects.stopTiers(request);
    await effects.assertSafety(request, true, false);
    await renew();
    state = { ...state, source: await effects.admitSource(request, state.source) };
    persist('requested');
    const restored = await effects.observeRestore(request);
    verifyReport(restored);
    assertRestoredMatches(request.exported, restored);
    // Proof: restore-report equality omission admits a legacy Job log without replay evidence
    // in the restore-evidence negative, even with a matching fresh actual PVC observation.
    if (JSON.stringify(restored) !== JSON.stringify(request.restored))
      throw new Error('first-start restore Job report differs from pinned evidence');
    await renew();
    const actual = await effects.observePvc(request, state.transaction);
    assertObservation(request, actual);
    await renew();
    await effects.assertSafety(request, true, false);
    state = { ...state, source: await effects.admitSource(request, state.source) };
    const bytes = JSON.stringify({
      transaction: state.transaction,
      requestSha256: state.requestSha256,
      ...actual,
    });
    state = { ...state, receipt: { bytes, sha256: sha256Of(bytes) } };
    persist('admitted');
    await renew();
    await effects.assertSafety(request, true, false);
    persist('starting');
    for (const tier of K8S_TIERS) {
      await renew();
      parseFirstStartState(journal.read(), request);
      await effects.assertSafety(request, false, false);
      await effects.startTier(tier, release.images[tier]);
    }
    await renew();
    await effects.verifyTiers(release);
    persist('ready');
    await renew();
    await effects.assertSafety(request, false, false);
    await effects.persistRelease(release);
    // Proof: release readback omission hands Flux a missing release record.
    if (JSON.stringify(await effects.currentRelease()) !== JSON.stringify(release))
      throw new Error('first-start release record readback differs');
    persist('recorded');
    await renew();
    // Proof: source revision omission resumes Flux onto another desired release.
    if (
      !(await effects.fluxSourceRevision(request.flux)).endsWith(
        `sha1:${request.flux.desiredRevision}`,
      )
    )
      throw new Error('first-start Flux source differs from pinned revision');
    await effects.assertSafety(request, false, false);
    if (state.source === null) throw new Error('first-start source receipt is missing');
    await effects.resumeSource(request, state.source);
    await renew();
    await effects.assertSafety(request, false, true);
    await effects.verifyTiers(release);
    if (JSON.stringify(await effects.currentRelease()) !== JSON.stringify(release))
      throw new Error('first-start handoff release record differs');
    persist('handed');
    clearInterval(heartbeat);
    await queue;
    await renew();
    await effects.releaseLease(holder);
    persist('complete');
    return state;
  } catch (cause) {
    clearInterval(heartbeat);
    await queue;
    if (leaseState.lost !== null)
      throw new Error('first-start lost Lease; no further mutations are permitted', {
        cause,
      });
    await renew();
    await effects.suspendFlux(request.flux);
    await effects.closeWrites();
    await effects.parkLease(holder, 'first-start-unresolved');
    throw new Error(
      `first-start unresolved at ${state.phase}; Lease held, writes fenced, Flux suspended; inspect ${journal.path}`,
      { cause },
    );
  } finally {
    clearInterval(heartbeat);
  }
}

import { createHash, randomUUID } from 'node:crypto';
import {
  type BigIntStats,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  readFileSync,
  readSync,
  writeFileSync,
} from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { isSnapshotCleanupUnknown } from '@wbs/store-sqlite/backup';
import { isSqliteCleanupUnknown } from '@wbs/store-sqlite/sqlite-cleanup';

import type { PreparedDependencyActivation } from './complete-dependency-exclusion';
import type {
  ActivationRecordByLabel,
  ActivationRecordLabel,
} from './dependency-activation-records';
import type {
  activateDependencyStores,
  ActivationReadOnlyConnection,
  ActivationReadOnlyDatabase,
} from './dependency-activation-storage';
import type { scanMigrationArtifact } from './dependency-migration-artifact-scanner';
import type { FinalizedParticipantRestorationContext } from './dependency-participant-preparation';
import { openDirectoryFile, renameDirectoryFile } from './directory-file';
import type { RunDocker } from './docker-deadline';
import type { DockerExec } from './docker-exec';
import { edgeStateDirectory } from './edge-admission';
import {
  captureEdgePolicy,
  captureEdgeRecord,
  decodeOrdinaryEdgePolicy,
  type EdgePolicySnapshot,
  type EdgeRecordSnapshot,
  type RestoringEdgePolicy,
  withOrdinaryControllerAdmission,
} from './edge-policy';
import type { EnvLayout } from './env';
import {
  type InitialHandoffArtifactObservation,
  isInitialHandoffCleanupUnknown,
} from './initial-handoff-graph';
import { assertInheritedLock, withCanonicalLock, withExistingCanonicalLock } from './lock';
import { publishRecord, readClosed, readRecord, readString } from './managed-cohort';
import type { RunSolverHost } from './solver-host';
import {
  assertRetainedSolverRestoration,
  type RetainedSolverRestoration,
  solverRestorationReference,
} from './solver-restoration';

/** Reviewed managed-fence scope only; never a complete participant or activation proof. */
export interface DependencyOwnerPlan {
  readonly sha: string;
  readonly layouts: readonly EnvLayout[];
}
export interface DependencyOwnerPublication {
  readonly format: 'dependency-edge-owner';
  readonly version: 1;
  readonly attempt: string;
  readonly plan: DependencyOwnerPlan;
}

/** Decodes the existing publication grammar for solver restoration without reconstructing live authority. */
export function decodeDependencyOwnerPublication(value: unknown): DependencyOwnerPublication {
  // Proof: pending-closed omission admitted extra authority fields through runtime owner-extra; test failed (exit 1).
  const publication = readClosed(value, ['format', 'version', 'attempt', 'plan']);
  const plan = readClosed(publication['plan'], ['sha', 'layouts']);
  const sha = readString(plan['sha']);
  const attempt = readString(publication['attempt']);
  if (
    publication['format'] !== 'dependency-edge-owner' ||
    publication['version'] !== 1 ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(attempt) ||
    !Array.isArray(plan['layouts']) ||
    plan['layouts'].length !== 2
  )
    throw new Error('solver restoration requires exact joint owner publication');
  const layouts: EnvLayout[] = [];
  for (const raw of plan['layouts']) {
    const layout = readClosed(raw, [
      'env',
      'root',
      'network',
      'containerPrefix',
      'sharedEnvPath',
      'oidcEnvPath',
      'stateDir',
      'siteCaddyPath',
      'siteAddress',
    ]);
    const env = layout['env'];
    if ((env !== 'prod' && env !== 'dev') || layouts.some((prior) => prior.env === env))
      throw new Error('solver restoration owner layouts are duplicate or unknown');
    // Proof: coherent reversed pending/intent hashes entered the runtime callback before this publisher-order guard (owner-order test, exit 1).
    if (env !== (layouts.length === 0 ? 'prod' : 'dev'))
      throw new Error('solver restoration owner layouts are not in publisher prod/dev order');
    const paths = ['root', 'sharedEnvPath', 'stateDir', 'siteCaddyPath'] as const;
    for (const key of paths) {
      const path = readString(layout[key]);
      if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
        throw new Error('solver restoration owner path is not canonical');
    }
    const oidcEnvPath = layout['oidcEnvPath'] === null ? null : readString(layout['oidcEnvPath']);
    if (oidcEnvPath !== null && (!isAbsolute(oidcEnvPath) || resolve(oidcEnvPath) !== oidcEnvPath))
      throw new Error('solver restoration owner OIDC path is not canonical');
    layouts.push({
      env,
      root: readString(layout['root']),
      network: readString(layout['network']),
      containerPrefix: readString(layout['containerPrefix']),
      sharedEnvPath: readString(layout['sharedEnvPath']),
      oidcEnvPath,
      stateDir: readString(layout['stateDir']),
      siteCaddyPath: readString(layout['siteCaddyPath']),
      siteAddress: readString(layout['siteAddress']),
    });
  }
  return { format: 'dependency-edge-owner', version: 1, attempt, plan: { sha, layouts } };
}

const identity: unique symbol = Symbol('dependency-owner');
/** Live callback-scoped authority; retained records cannot recreate it. */
export interface DependencyOwner {
  readonly [identity]: true;
}
interface Ownership {
  directory: string;
  publication: string;
  locks: { path: string; descriptor: number }[];
  layouts: readonly EnvLayout[];
  sequence: number;
  sha: string;
  attempt: string;
  state: 'active' | 'closing' | 'unknown';
  preparations: Set<PreparationRecord>;
  composition: PreparationRecord | undefined;
  keeper: PreparationKeeper | undefined;
  runtimeEntries: Set<RuntimeEntry>;
}
interface RuntimeEntry {
  readonly original: Promise<unknown>;
  observer: Promise<void> | undefined;
  outcome: OperationOutcome;
}
const owners = new WeakMap<DependencyOwner, Ownership>();

const preparationIdentity: unique symbol = Symbol('dependency-preparation');
const originalIdentity: unique symbol = Symbol('preparation-original');
const operationIdentity: unique symbol = Symbol('preparation-operation');

/** Opaque original preparation enrolled by the actual owner, never by a serialized packet. */
export interface DependencyPreparation {
  readonly [preparationIdentity]: true;
}
/** One acquired original; a reused numeric descriptor always receives a fresh token. */
export interface PreparationOriginal {
  readonly [originalIdentity]: true;
}
/** One original asynchronous operation, bound before its caller receives its Promise. */
export interface PreparationOperation {
  readonly [operationIdentity]: true;
}
export type PreparationPurpose = 'fenced' | 'restoration' | 'initial-handoff';
export type PreparationBoundary =
  'operation' | 'runtime-finalizer' | 'complete-finalizer' | 'consume' | 'release' | 'owner-return';
export type PreparationOperationKind =
  | 'storage-activation'
  | 'evidence-inspection'
  | 'stores-inspection'
  | 'preparation-consume'
  | 'context-assertion';

type PreparationAcquisition =
  | {
      readonly kind: 'descriptor';
      readonly role:
        | 'anchor-parent'
        | 'anchor-main'
        | 'capture-read'
        | 'backup-read'
        | 'backup-finalizer'
        | 'state'
        | 'evidence';
      readonly descriptor: number;
    }
  | {
      readonly kind: 'database';
      readonly role: 'authority-read' | 'backup-read';
      readonly database: ActivationReadOnlyDatabase;
    }
  | {
      readonly kind: 'connection';
      readonly role: 'authority-read';
      readonly connection: ActivationReadOnlyConnection;
    }
  | {
      readonly kind: 'graph';
      readonly role: 'initial-evidence';
      readonly graph: InitialHandoffArtifactObservation;
    }
  | {
      readonly kind: 'scanner';
      readonly role: 'restoration-artifact';
      readonly scanner: Awaited<ReturnType<typeof scanMigrationArtifact>>;
    };
type PreparationPhase =
  'preparing' | 'runtime-evidence' | 'prepared' | 'consumed' | 'closing' | 'closed' | 'unknown';
type OperationOutcome =
  | { readonly phase: 'starting' }
  | { readonly phase: 'pending' }
  | { readonly phase: 'fulfilled' }
  | { readonly phase: 'rejected'; readonly cause: unknown };
interface OriginalRecord {
  readonly preparation: PreparationRecord;
  readonly acquisition: PreparationAcquisition;
  state: 'open' | 'closing' | 'closed' | 'unknown';
  failure: unknown;
}
interface PreparationOperationRecord {
  readonly preparation: PreparationRecord;
  readonly kind: PreparationOperationKind;
  original: Promise<unknown> | undefined;
  observer: Promise<void> | undefined;
  outcome: OperationOutcome;
}
interface CompositionSettlement {
  original: Promise<unknown> | undefined;
  observer: Promise<void> | undefined;
  outcome: OperationOutcome;
}
interface PreparationKeeper {
  readonly interval: ReturnType<typeof setInterval>;
  readonly pending: Promise<void>;
  reported: boolean;
  reportFailure: unknown;
}
interface PreparationRecord {
  readonly owner: DependencyOwner;
  readonly ownership: Ownership;
  readonly purpose: PreparationPurpose;
  readonly attempt: string;
  readonly pending: string;
  readonly layouts: readonly EnvLayout[];
  readonly deadline: number;
  readonly locks: readonly Ownership['locks'][number][];
  readonly originals: Set<OriginalRecord>;
  readonly operations: Set<PreparationOperationRecord>;
  readonly composition: CompositionSettlement;
  readonly failures: { readonly boundary: PreparationBoundary; readonly cause: unknown }[];
  readonly inherited: unknown[];
  phase: PreparationPhase;
  closeRequested: boolean;
  closeBoundary: PreparationBoundary | undefined;
  runtimeLock: Ownership['locks'][number] | undefined;
  runtimeReleased: boolean;
  runtimeAction: CompositionSettlement | undefined;
  runtimeRefusalSettled: boolean;
  storage: Awaited<ReturnType<typeof activateDependencyStores>> | undefined;
  prepared: PreparedDependencyActivation | undefined;
  context: FinalizedParticipantRestorationContext | undefined;
  projection: CompositionSettlement | undefined;
}
const preparations = new WeakMap<DependencyPreparation, PreparationRecord>();
const originals = new WeakMap<PreparationOriginal, OriginalRecord>();
const operations = new WeakMap<PreparationOperation, PreparationOperationRecord>();
const preparedPreparations = new WeakMap<PreparedDependencyActivation, PreparationRecord>();
const contextPreparations = new WeakMap<
  FinalizedParticipantRestorationContext,
  PreparationRecord
>();

function requirePreparation(preparation: DependencyPreparation): PreparationRecord {
  const record = preparations.get(preparation);
  if (record === undefined) throw new Error('dependency preparation identity absent');
  return record;
}
function assertPreparationLocks(record: PreparationRecord): void {
  for (const lock of record.locks) {
    if (!record.ownership.locks.includes(lock))
      throw new Error('preparation outer lock association differs');
    assertInheritedLock(lock.path, lock.descriptor);
  }
  const runtime = record.runtimeLock;
  if (runtime === undefined) return;
  if (record.runtimeReleased) {
    if (record.ownership.locks.includes(runtime))
      throw new Error('preparation released runtime lock remains entered');
    return;
  }
  if (!record.ownership.locks.includes(runtime))
    throw new Error('preparation entered runtime lock association differs');
  assertInheritedLock(runtime.path, runtime.descriptor);
}
function poisonPreparation(record: PreparationRecord, cause: unknown): void {
  record.inherited.push(cause);
  record.phase = 'unknown';
  record.ownership.state = 'unknown';
}
function isOwnershipUnknown(ownership: Ownership): boolean {
  return ownership.state === 'unknown';
}
function keeperFor(owner: DependencyOwner, ownership: Ownership): PreparationKeeper {
  if (ownership.keeper !== undefined) return ownership.keeper;
  // The referenced callback retains the exact original owner and capsule set; it performs no work.
  const retained = { owner, ownership, preparations: ownership.preparations };
  const interval = setInterval(() => retained, 60000);
  const pending = new Promise<void>(() => {
    // The owner resolves no UNKNOWN cleanup through a timer or caller continuation.
  });
  const keeper: PreparationKeeper = {
    interval,
    pending,
    reported: false,
    reportFailure: undefined,
  };
  ownership.keeper = keeper;
  return keeper;
}
function maybeReleaseComposition(record: PreparationRecord): void {
  if (
    record.ownership.composition === record &&
    (record.composition.outcome.phase === 'fulfilled' ||
      record.composition.outcome.phase === 'rejected') &&
    (record.phase === 'prepared' || record.phase === 'closed')
  )
    record.ownership.composition = undefined;
}
function hasPendingOperations(record: PreparationRecord): boolean {
  return [...record.operations].some(
    (operation) => operation.outcome.phase === 'starting' || operation.outcome.phase === 'pending',
  );
}
function closeOriginal(record: OriginalRecord): void {
  if (record.state !== 'open') throw new Error('preparation original close already attempted');
  record.state = 'closing';
  try {
    const acquisition = record.acquisition;
    switch (acquisition.kind) {
      case 'descriptor':
        closeSync(acquisition.descriptor);
        break;
      case 'database':
        acquisition.database.close();
        break;
      case 'connection':
        acquisition.connection.close();
        break;
      case 'graph':
        acquisition.graph.closeFiles();
        break;
      case 'scanner':
        acquisition.scanner.close();
        break;
    }
    record.state = 'closed';
  } catch (cause) {
    record.failure = cause;
    record.state = 'unknown';
    poisonPreparation(record.preparation, cause);
    throw cause;
  }
}
function drainPreparationCleanup(record: PreparationRecord): 'closed' | 'deferred' {
  if (!record.closeRequested) return 'deferred';
  if (hasPendingOperations(record)) return 'deferred';
  if (
    !record.runtimeRefusalSettled &&
    record.composition.outcome.phase !== 'fulfilled' &&
    record.composition.outcome.phase !== 'rejected'
  )
    return 'deferred';
  for (const original of record.originals) {
    if (original.state !== 'open') continue;
    try {
      closeOriginal(original);
    } catch {
      // The exact original error and sticky UNKNOWN were saved before the next distinct close.
    }
  }
  if (
    record.ownership.state === 'unknown' ||
    [...record.originals].some((original) => original.state === 'unknown')
  ) {
    record.phase = 'unknown';
    return 'deferred';
  }
  record.phase = 'closed';
  maybeReleaseComposition(record);
  return 'closed';
}
function observeSettlement(
  record: PreparationRecord,
  settlement: CompositionSettlement,
  original: Promise<unknown>,
): void {
  if (settlement.outcome.phase !== 'starting' || settlement.original !== undefined)
    throw new Error('preparation original Promise already bound');
  settlement.original = original;
  settlement.outcome = { phase: 'pending' };
  const observer = original.then(
    () => {
      settlement.outcome = { phase: 'fulfilled' };
      drainPreparationCleanup(record);
      maybeReleaseComposition(record);
    },
    (cause: unknown) => {
      settlement.outcome = { phase: 'rejected', cause };
      record.failures.push({ boundary: 'operation', cause });
      drainPreparationCleanup(record);
      maybeReleaseComposition(record);
    },
  );
  settlement.observer = observer;
  void observer.catch((cause: unknown) => {
    poisonPreparation(record, cause);
  });
}
/** Reserves the only unfinished composition from exact live owner publication and locks. */
export function enrollDependencyPreparation(
  owner: DependencyOwner,
  binding: {
    readonly layouts: readonly EnvLayout[];
    readonly deadline: number;
    readonly purpose: PreparationPurpose;
  },
): DependencyPreparation {
  const ownership = owners.get(owner);
  if (ownership?.state !== 'active') throw new Error('dependency owner is not active');
  if (ownership.composition !== undefined)
    throw new Error('dependency preparation composition pending');
  if (
    !Number.isFinite(binding.deadline) ||
    binding.deadline <= performance.now() ||
    JSON.stringify(binding.layouts) !== JSON.stringify(ownership.layouts)
  )
    throw new Error('dependency preparation owner association differs');
  for (const lock of ownership.locks) assertInheritedLock(lock.path, lock.descriptor);
  keeperFor(owner, ownership);
  const record: PreparationRecord = {
    owner,
    ownership,
    purpose: binding.purpose,
    attempt: ownership.attempt,
    pending: ownership.publication,
    layouts: ownership.layouts,
    deadline: binding.deadline,
    locks: [...ownership.locks],
    originals: new Set(),
    operations: new Set(),
    composition: { original: undefined, observer: undefined, outcome: { phase: 'starting' } },
    failures: [],
    inherited: [],
    phase: 'preparing',
    closeRequested: false,
    closeBoundary: undefined,
    runtimeLock: undefined,
    runtimeReleased: false,
    runtimeAction: undefined,
    runtimeRefusalSettled: false,
    storage: undefined,
    prepared: undefined,
    context: undefined,
    projection: undefined,
  };
  const preparation: DependencyPreparation = Object.freeze({
    [preparationIdentity]: true as const,
  });
  preparations.set(preparation, record);
  ownership.preparations.add(record);
  ownership.composition = record;
  return preparation;
}
/** Compares the later genuine publication capture to the earlier private enrollment. */
export function assertPreparationPublication(
  preparation: DependencyPreparation,
  publication: DependencyOwnerPublication,
  pending: string,
): void {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  if (
    publication.attempt !== record.attempt ||
    publication.plan.sha !== record.ownership.sha ||
    JSON.stringify(publication.plan.layouts) !== JSON.stringify(record.layouts) ||
    pending !== record.pending
  )
    throw new Error('dependency preparation publication association differs');
}
/** Refuses copied, foreign, expired, revoked or closed preparation work before observation. */
export function assertDependencyPreparation(
  owner: DependencyOwner,
  preparation: DependencyPreparation,
): void {
  const record = requirePreparation(preparation);
  if (
    record.owner !== owner ||
    owners.get(owner) !== record.ownership ||
    record.ownership.state !== 'active' ||
    record.closeRequested ||
    record.phase === 'closing' ||
    record.phase === 'closed' ||
    record.phase === 'unknown' ||
    performance.now() >= record.deadline
  )
    throw new Error('dependency preparation is not active');
  // Proof: omitting this call failed the preparation missing-throw assertion in
  // "UC2 replaced runtime inode refuses preparation and operation observation" (exit 1; restored exit 0).
  assertPreparationLocks(record);
}
/** Binds the actual async composition body, retaining its original and observer separately. */
export function bindPreparationComposition<T>(
  preparation: DependencyPreparation,
  original: Promise<T>,
): Promise<T> {
  const record = requirePreparation(preparation);
  if (record.ownership.composition !== record)
    throw new Error('dependency composition slot differs');
  observeSettlement(record, record.composition, original);
  return original;
}
/** Retains the actual post-body projection Promise without substituting it for the body. */
export function bindPreparationProjection<T>(
  preparation: DependencyPreparation,
  original: Promise<T>,
): Promise<T> {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  if (record.ownership.composition !== record || record.composition.original === undefined)
    throw new Error('dependency projection composition association differs');
  if (record.projection !== undefined) throw new Error('dependency projection already bound');
  const projection: CompositionSettlement = {
    original: undefined,
    observer: undefined,
    outcome: { phase: 'starting' },
  };
  record.projection = projection;
  observeSettlement(record, projection, original);
  return original;
}
/**
 * Final post-body acceptance for the actual complete projection. The complete caller
 * must await this before returning its packet; this never awaits that calling projection.
 */
export async function assertPreparationCompletion(
  preparation: DependencyPreparation,
): Promise<void> {
  const record = requirePreparation(preparation);
  const body = record.composition;
  if (body.original === undefined || body.observer === undefined) {
    poisonPreparation(record, new Error('preparation composition original missing'));
    await retainUnknownOwner(record.owner, record.ownership);
  }
  await Promise.allSettled([body.original, body.observer]);
  if (record.ownership.state === 'unknown' || record.phase === 'unknown')
    await retainUnknownOwner(record.owner, record.ownership);
  const operationOriginals: Promise<unknown>[] = [];
  for (const operation of record.operations) {
    const original = operation.original;
    const observer = operation.observer;
    if (original === undefined || observer === undefined) {
      poisonPreparation(record, new Error('preparation original operation missing'));
      return retainUnknownOwner(record.owner, record.ownership);
    }
    operationOriginals.push(original, observer);
  }
  await Promise.allSettled(operationOriginals);
  if (record.ownership.state === 'unknown' || record.phase === 'unknown')
    await retainUnknownOwner(record.owner, record.ownership);
  const projection = record.projection;
  if (
    owners.get(record.owner) !== record.ownership ||
    record.ownership.state !== 'active' ||
    body.outcome.phase !== 'fulfilled' ||
    projection?.original === undefined ||
    projection.observer === undefined ||
    record.runtimeLock === undefined ||
    !record.runtimeReleased ||
    record.runtimeAction?.outcome.phase !== 'fulfilled' ||
    record.storage === undefined ||
    record.failures.length !== 0 ||
    [...record.operations].some((operation) => operation.outcome.phase !== 'fulfilled') ||
    performance.now() >= record.deadline
  )
    throw new Error('dependency preparation completion refused');
  assertPreparationLocks(record);
  if (record.purpose === 'fenced') {
    if (
      !record.closeRequested ||
      record.phase !== 'closed' ||
      record.prepared !== undefined ||
      record.context !== undefined ||
      [...record.originals].some((original) => original.state !== 'closed')
    )
      throw new Error('dependency fenced completion cleanup incomplete');
    return;
  }
  const context = record.context;
  const prepared = record.prepared;
  const retained = [...record.originals].filter((original) => original.state === 'open');
  const count = (kind: PreparationAcquisition['kind'], role: string) =>
    retained.filter(
      (original) => original.acquisition.kind === kind && original.acquisition.role === role,
    ).length;
  if (
    record.closeRequested ||
    record.phase !== 'prepared' ||
    context === undefined ||
    prepared === undefined ||
    contextPreparations.get(context) !== record ||
    preparedPreparations.get(prepared) !== record ||
    context.owner !== record.owner ||
    context.storage !== record.storage ||
    count('descriptor', 'state') !== 1 ||
    count('descriptor', 'evidence') !== 1 ||
    count('scanner', 'restoration-artifact') !== 1 ||
    count('graph', 'initial-evidence') !== (record.purpose === 'initial-handoff' ? 1 : 0) ||
    [...record.originals].some((original) => original.state === 'unknown')
  )
    throw new Error('dependency prepared completion association differs');
}

/** Starts fixed original work before the async body acquires or inspects anything. */
export function beginPreparationOperation(
  preparation: DependencyPreparation,
  kind: PreparationOperationKind,
): PreparationOperation {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  if (
    (kind === 'preparation-consume' &&
      (record.phase !== 'prepared' || record.prepared === undefined)) ||
    (kind === 'context-assertion' && (record.phase !== 'consumed' || record.context === undefined))
  )
    throw new Error('prepared operation association absent');
  const operationRecord: PreparationOperationRecord = {
    preparation: record,
    kind,
    original: undefined,
    observer: undefined,
    outcome: { phase: 'starting' },
  };
  const operation: PreparationOperation = Object.freeze({ [operationIdentity]: true as const });
  operations.set(operation, operationRecord);
  record.operations.add(operationRecord);
  return operation;
}
/** Attaches immediate fulfillment and rejection observation, returning the SAME original Promise. */
export function bindPreparationOperation<T>(
  operation: PreparationOperation,
  original: Promise<T>,
): Promise<T> {
  const observed = operations.get(operation);
  if (observed === undefined) throw new Error('preparation operation identity absent');
  if (observed.outcome.phase !== 'starting' || observed.original !== undefined)
    throw new Error('preparation operation already bound');
  observed.original = original;
  observed.outcome = { phase: 'pending' };
  const observer = original.then(
    () => {
      observed.outcome = { phase: 'fulfilled' };
      drainPreparationCleanup(observed.preparation);
    },
    (cause: unknown) => {
      observed.outcome = { phase: 'rejected', cause };
      observed.preparation.failures.push({ boundary: 'operation', cause });
      drainPreparationCleanup(observed.preparation);
    },
  );
  observed.observer = observer;
  void observer.catch((cause: unknown) => {
    poisonPreparation(observed.preparation, cause);
  });
  // Proof: returning a value-preserving .then projection failed the SAME-Promise assertion in
  // "UC2 core retains the exact original operation Promise and defers terminal close" (exit 1; restored exit 0).
  return original;
}
/** Denies further work after owner or capsule revocation; exact original remains retained. */
export function assertPreparationOperation(operation: PreparationOperation): void {
  const observed = operations.get(operation);
  if (observed === undefined) throw new Error('preparation operation identity absent');
  const record = observed.preparation;
  if (
    record.ownership.state !== 'active' ||
    record.closeRequested ||
    record.phase === 'closed' ||
    record.phase === 'unknown' ||
    performance.now() >= record.deadline
  )
    throw new Error('preparation operation is revoked');
  // Proof: omitting only this call failed the operation missing-throw assertion in
  // "UC2 replaced runtime inode refuses preparation and operation observation" (exit 1; restored exit 0).
  assertPreparationLocks(record);
}
/** Retains one real acquired original before the next fallible inspection. */
export function retainPreparationOriginal(
  preparation: DependencyPreparation,
  acquisition: PreparationAcquisition,
): PreparationOriginal {
  const record = requirePreparation(preparation);
  if (record.phase === 'closed') throw new Error('preparation original enrollment after close');
  const original: PreparationOriginal = Object.freeze({ [originalIdentity]: true as const });
  const observed: OriginalRecord = {
    preparation: record,
    acquisition,
    state: 'open',
    failure: undefined,
  };
  originals.set(original, observed);
  record.originals.add(observed);
  return original;
}
/** Attempts the selected original close exactly once with its actual receiver and arguments. */
export function closePreparationOriginal(
  preparation: DependencyPreparation,
  original: PreparationOriginal,
): void {
  const record = requirePreparation(preparation);
  const observed = originals.get(original);
  if (observed?.preparation !== record) throw new Error('preparation original association differs');
  closeOriginal(observed);
}
/** Records the exact operation cause and recognizes only three genuine private UNKNOWN identities. */
export function recordPreparationFailure(
  preparation: DependencyPreparation,
  boundary: PreparationBoundary,
  cause: unknown,
): void {
  const record = requirePreparation(preparation);
  record.failures.push({ boundary, cause });
  if (
    isInitialHandoffCleanupUnknown(cause) ||
    isSqliteCleanupUnknown(cause) ||
    isSnapshotCleanupUnknown(cause)
  )
    poisonPreparation(record, cause);
}
/** Binds the exact actual storage packet before any caller can hide its returned evidence. */
export function bindPreparationStorage(
  preparation: DependencyPreparation,
  storage: Awaited<ReturnType<typeof activateDependencyStores>>,
): void {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  if (
    record.ownership.composition !== record ||
    record.phase !== 'preparing' ||
    record.runtimeLock === undefined ||
    record.runtimeReleased ||
    (record.purpose === 'initial-handoff'
      ? storage.purpose !== 'initial-handoff'
      : storage.purpose !== 'restoration')
  )
    throw new Error('preparation storage runtime association differs');
  if (record.storage !== undefined) throw new Error('preparation storage already bound');
  record.storage = storage;
}
/** Transfers only known-closed transients; live evidence retains owner custody after runtime. */
export function transferPreparationEvidence(preparation: DependencyPreparation): void {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  if (
    record.phase !== 'preparing' ||
    record.ownership.composition !== record ||
    record.storage === undefined ||
    record.runtimeLock === undefined ||
    record.runtimeReleased ||
    hasPendingOperations(record) ||
    [...record.operations].some((operation) => operation.observer === undefined)
  )
    throw new Error('preparation evidence transfer association differs');
  const retained = [...record.originals].filter((original) => original.state === 'open');
  const count = (role: string) =>
    retained.filter(
      (original) =>
        original.acquisition.kind === 'descriptor' && original.acquisition.role === role,
    ).length;
  const graphs = retained.filter((original) => original.acquisition.kind === 'graph').length;
  const scanners = retained.filter((original) => original.acquisition.kind === 'scanner').length;
  if (
    count('state') !== 1 ||
    count('evidence') !== 1 ||
    graphs !== (record.purpose === 'initial-handoff' ? 1 : 0) ||
    scanners !== (record.purpose === 'fenced' ? 0 : 1)
  )
    throw new Error('preparation retained evidence roles differ');
  if (
    [...record.originals].some(
      (original) =>
        original.state !== 'closed' &&
        !(
          original.acquisition.kind === 'graph' ||
          original.acquisition.kind === 'scanner' ||
          (original.acquisition.kind === 'descriptor' &&
            (original.acquisition.role === 'state' || original.acquisition.role === 'evidence'))
        ),
    )
  )
    throw new Error('preparation transient cleanup incomplete');
  record.phase = 'runtime-evidence';
}
/** Retains exact prepared and context identities; a copy cannot substitute for either. */
export function bindPreparedContext(
  preparation: DependencyPreparation,
  prepared: PreparedDependencyActivation,
  context: FinalizedParticipantRestorationContext,
): void {
  const record = requirePreparation(preparation);
  assertDependencyPreparation(record.owner, preparation);
  const scanners = [...record.originals].filter(
    (original) => original.state === 'open' && original.acquisition.kind === 'scanner',
  );
  if (
    scanners.length !== 1 ||
    scanners[0]?.acquisition.kind !== 'scanner' ||
    context.artifact !== scanners[0].acquisition.scanner ||
    record.prepared !== undefined ||
    record.context !== undefined ||
    record.phase !== 'runtime-evidence' ||
    record.purpose === 'fenced' ||
    record.storage === undefined ||
    record.runtimeLock === undefined ||
    !record.runtimeReleased ||
    context.owner !== record.owner ||
    context.storage !== record.storage ||
    context.purpose !== record.purpose ||
    context.attempt !== record.attempt ||
    context.deadline !== record.deadline ||
    context.pending.contents !== record.pending ||
    context.directory !== record.ownership.directory ||
    JSON.stringify([context.layouts.prod, context.layouts.dev]) !== JSON.stringify(record.layouts)
  )
    throw new Error('prepared context association differs');
  if (preparedPreparations.has(prepared) || contextPreparations.has(context))
    throw new Error('prepared context already associated');
  record.prepared = prepared;
  record.context = context;
  preparedPreparations.set(prepared, record);
  contextPreparations.set(context, record);
  record.phase = 'prepared';
  maybeReleaseComposition(record);
}
/** Records the exact prepared/context pair's one-way consume transition. */
export function markPreparationConsumed(
  preparation: DependencyPreparation,
  prepared: PreparedDependencyActivation,
  context: FinalizedParticipantRestorationContext,
): void {
  assertPreparedContextAssociation(preparation, prepared, context);
  const record = requirePreparation(preparation);
  if (record.phase !== 'prepared') throw new Error('preparation already consumed');
  record.phase = 'consumed';
}
/** Resolves only the exact preparation bound to both private prepared and context objects. */
export function assertPreparedContextAssociation(
  preparation: DependencyPreparation,
  prepared: PreparedDependencyActivation,
  context: FinalizedParticipantRestorationContext,
): void {
  const record = requirePreparation(preparation);
  if (preparedPreparations.get(prepared) !== record || contextPreparations.get(context) !== record)
    throw new Error('prepared context association differs');
  assertDependencyPreparation(record.owner, preparation);
}
/** Revokes work synchronously and defers every terminal close while originals are pending. */
export function requestPreparationClose(
  preparation: DependencyPreparation,
  boundary: 'release' | 'consume' | 'operation' | 'owner-return',
): 'closed' | 'deferred' {
  const record = requirePreparation(preparation);
  record.closeRequested = true;
  record.closeBoundary = boundary;
  if (record.phase !== 'closed' && record.phase !== 'unknown') record.phase = 'closing';
  return drainPreparationCleanup(record);
}
/** Releases known originals once; a deferred release never grants further work. */
export function closeDependencyPreparation(
  preparation: DependencyPreparation,
  boundary: 'release' | 'owner-return' | 'operation' | 'runtime-finalizer',
): void {
  const closure = requestPreparationClose(
    preparation,
    boundary === 'runtime-finalizer' ? 'operation' : boundary,
  );
  if (closure === 'deferred') throw new Error('dependency preparation closure deferred');
}
async function joinPreparation(record: PreparationRecord): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const operation of record.operations) {
    if (operation.original === undefined || operation.observer === undefined)
      poisonPreparation(record, new Error('preparation original operation missing'));
    else pending.push(operation.original, operation.observer);
  }
  for (const settlement of [record.composition, record.projection, record.runtimeAction]) {
    if (settlement === undefined) continue;
    if (settlement.original === undefined || settlement.observer === undefined)
      poisonPreparation(record, new Error('preparation composition original missing'));
    else pending.push(settlement.original, settlement.observer);
  }
  await Promise.allSettled(pending);
  drainPreparationCleanup(record);
}
async function retainUnknownOwner(owner: DependencyOwner, ownership: Ownership): Promise<never> {
  const keeper = keeperFor(owner, ownership);
  if (!keeper.reported) {
    keeper.reported = true;
    try {
      writeFileSync(2, 'dependency preparation cleanup outcome unknown; owner retained\n');
    } catch (cause) {
      keeper.reportFailure = cause;
    }
  }
  await keeper.pending;
  throw new Error('retained owner keeper unexpectedly settled');
}

async function requireDirectory(path: string): Promise<void> {
  // Proof: omitted canonical directory guard; noncanonical-layout-root publisher reached callback (exit 1).
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (await realpath(path)) !== path ||
    !(await lstat(path)).isDirectory()
  )
    throw new Error('dependency owner requires canonical existing directory');
  // Proof: without enumeration, execute/write-only state published pending before failing directory sync.
  await readdir(path);
}

/**
 * Acquires edge, optional dev poll/devsync, then prod/dev deploy locks once.
 * Publishes exclusive synced exact plan before invoking the live owner. Every exit
 * expires authority and retains all records; neither success nor failure reopens admission.
 */
export async function withDependencyOwner<T>(
  plan: DependencyOwnerPlan,
  action: (owner: DependencyOwner) => Promise<T>,
  directory = edgeStateDirectory(),
): Promise<T> {
  // Proof: omitted plan guard; invalid-SHA and empty-plan publisher negatives reached callback (exit 1).
  if (!/^[a-f0-9]{40}$/.test(plan.sha) || plan.layouts.length === 0)
    throw new Error('dependency owner requires full SHA and nonempty unique environments');
  const sha = plan.sha;
  const layouts = structuredClone([...plan.layouts]).sort((left, right) =>
    left.env === right.env ? 0 : left.env === 'prod' ? -1 : 1,
  );
  const environments = new Set<string>();
  await requireDirectory(directory);
  for (const layout of layouts) {
    // Proof: omitted uniqueness; distinct-state duplicate-environment publication negative reached callback (exit 1).
    if (environments.has(layout.env))
      throw new Error('dependency owner requires unique environments');
    environments.add(layout.env);
    await requireDirectory(layout.root);
    await requireDirectory(layout.stateDir);
  }
  // Proof: independently omitted edge, dev and deploy paths; real competitor flock assertions failed (exit 1 each).
  const paths = [join(directory, 'edge.lock')];
  const dev = layouts.find((layout) => layout.env === 'dev');
  if (dev !== undefined)
    paths.push(join(dev.stateDir, 'poll.lock'), join(dev.stateDir, 'devsync.lock'));
  paths.push(...layouts.map((layout) => join(layout.stateDir, 'deploy.lock')));
  // Proof: omitted overlap guard; overlapping-environment negative lost its refusal before nested flock (exit 1).
  if (new Set(paths).size !== paths.length) throw new Error('dependency owner lock paths overlap');
  const locks: Ownership['locks'] = [];
  async function acquire(index: number, recheck: () => Promise<void>): Promise<T> {
    const path = paths.at(index);
    if (path !== undefined)
      // Proof: substituting legacy withLock truncates retained foreign symlink evidence before refusal (exit 1).
      return withCanonicalLock(path, async (descriptor) => {
        locks.push({ path, descriptor });
        try {
          return await acquire(index + 1, recheck);
        } finally {
          locks.pop();
        }
      });
    for (const lock of locks) assertInheritedLock(lock.path, lock.descriptor);
    // Proof: omitted admission; retained committed-owner negative reached callback (exit 1).
    await recheck();
    const attempt = randomUUID();
    const publication = `${JSON.stringify({ format: 'dependency-edge-owner', version: 1, attempt, plan: { sha, layouts } })}\n`;
    // Proof: omitted publication; real callback could not read required pending marker (exit 1).
    await publishRecord(join(directory, 'edge-owner.pending'), publication);
    const owner: DependencyOwner = Object.freeze({ [identity]: true as const });
    const ownership: Ownership = {
      directory,
      publication,
      locks,
      layouts,
      sequence: 0,
      sha,
      attempt,
      state: 'active',
      preparations: new Set(),
      composition: undefined,
      keeper: undefined,
      runtimeEntries: new Set(),
    };
    owners.set(owner, ownership);
    let outcome: { readonly value: T } | { readonly failure: unknown };
    try {
      outcome = { value: await action(owner) };
    } catch (cause) {
      outcome = { failure: cause };
    }
    if (ownership.state !== 'unknown') ownership.state = 'closing';
    for (const record of ownership.preparations) {
      record.closeRequested = true;
      record.closeBoundary = 'owner-return';
      if (record.phase !== 'unknown' && record.phase !== 'closed') record.phase = 'closing';
      drainPreparationCleanup(record);
    }
    await Promise.allSettled(
      [...ownership.runtimeEntries].flatMap((entry) =>
        entry.observer === undefined ? [entry.original] : [entry.original, entry.observer],
      ),
    );
    for (const record of ownership.preparations) await joinPreparation(record);
    if (
      ownership.state === 'unknown' ||
      [...ownership.preparations].some((record) => record.phase !== 'closed')
    )
      await retainUnknownOwner(owner, ownership);
    if (ownership.keeper !== undefined) clearInterval(ownership.keeper.interval);
    // Historical pre-UC2/c955 Proof: omitting deletion lost the expired-owner refusal.
    // The current closing state also revokes work; deletion's independent necessity is unproved.
    owners.delete(owner);
    if ('failure' in outcome) throw outcome.failure;
    return outcome.value;
  }
  const edgePath = join(directory, 'edge.lock');
  if (!(await lstat(edgePath)).isFile() || (await realpath(edgePath)) !== edgePath)
    throw new Error(`invalid existing canonical lock: ${edgePath}`);
  return withExistingCanonicalLock(edgePath, async (descriptor) => {
    locks.push({ path: edgePath, descriptor });
    try {
      return await withOrdinaryControllerAdmission(directory, 'legacy', (recheck) =>
        acquire(1, recheck),
      );
    } finally {
      locks.pop();
    }
  });
}

/** Checks live identity, exact selected layout, all kernel descriptions and retained bytes. */
export async function assertDependencyOwner(
  owner: DependencyOwner,
  layout: EnvLayout,
  sha?: string,
): Promise<void> {
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  if (ownership.state !== 'active') throw new Error('dependency owner is not active');
  // Proof: omitted SHA binding; wrong-SHA owner fence reached real fake-Docker cohort work (exit 1).
  if (sha !== undefined && sha !== ownership.sha) throw new Error('dependency owner SHA differs');
  // Proof: omitted layout binding; foreign-layout production Docker negative executed its effect (exit 1).
  if (!ownership.layouts.some((selected) => JSON.stringify(selected) === JSON.stringify(layout)))
    throw new Error('dependency owner does not own layout');
  // Proof: removed FD identity verification; replaced-lock-inode production Docker negative executed its effect (exit 1).
  for (const lock of ownership.locks) assertInheritedLock(lock.path, lock.descriptor);
  // Proof: removed byte equality; changed-pending production Docker negative executed its effect (exit 1).
  if ((await readRecord(join(ownership.directory, 'edge-owner.pending'))) !== ownership.publication)
    throw new Error('dependency owner publication changed');
  // This second read occurs after awaited publication I/O; state may have changed.
  if (owners.get(owner)?.state !== 'active') throw new Error('dependency owner is not active');
}

/** Durable per-boundary intent and observed response; uncertain calls retain intent without readback. */
export function ownerDocker(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
): RunDocker {
  return ownerDockerBoundary(owner, layout, runDocker, false);
}

function ownerDockerBoundary(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
  hashResponse: boolean,
): RunDocker {
  return async (args, signal) => {
    await assertDependencyOwner(owner, layout);
    const ownership = owners.get(owner);
    if (ownership === undefined) throw new Error('dependency owner is not live');
    const prefix = join(
      ownership.directory,
      `edge-owner-${String(++ownership.sequence).padStart(6, '0')}`,
    );
    // Proof: omitted durable intent publication; real boundary test failed ENOENT before the Docker effect (exit 1).
    await publishRecord(
      `${prefix}-intent.json`,
      `${JSON.stringify({ owner: ownership.publication, environment: layout.env, args })}\n`,
    );
    await assertDependencyOwner(owner, layout);
    // Proof: omitted cancellation; cancelled-boundary negative executed its effect (exit 1).
    if (signal?.aborted) throw new Error('dependency owner boundary cancelled');
    const response = await runDocker(args, signal);
    // Proof: omitted immediate readback fence; lost-marker negative published a fabricated successful readback (exit 1).
    await assertDependencyOwner(owner, layout);
    // Proof: retaining raw responses at hashed boundaries leaked PRIVATE_SENTINEL; source private evidence test failed.
    const observation = hashResponse
      ? { responseSha256: createHash('sha256').update(response).digest('hex') }
      : { response };
    await publishRecord(`${prefix}-readback.json`, `${JSON.stringify(observation)}\n`);
    await assertDependencyOwner(owner, layout);
    return response;
  };
}

/** Owner-bound initialized exec session; retains actual DONE/REAPED protocol observations. */
export function ownerDockerExec(
  owner: DependencyOwner,
  layout: EnvLayout,
  execDocker: DockerExec,
): DockerExec {
  return async (args, nonce, consume, signal) => {
    await ownerDocker(owner, layout, async (_command, boundedSignal) => {
      const tokens: string[] = [];
      await execDocker(
        args,
        nonce,
        (token) => {
          // Proof: omitted protocol retention; composed owner acceptance lost DONE/REAPED evidence (exit 1).
          tokens.push(token);
          return consume(token);
        },
        boundedSignal,
      );
      return JSON.stringify({ nonce, tokens });
    })(args, signal);
  };
}

async function joinRuntimeOperations(record: PreparationRecord): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const operation of record.operations) {
    if (operation.original === undefined || operation.observer === undefined)
      poisonPreparation(record, new Error('runtime original operation missing'));
    else pending.push(operation.original, operation.observer);
  }
  await Promise.allSettled(pending);
  if (record.ownership.state === 'unknown') return;
  if ([...record.operations].some((operation) => operation.outcome.phase !== 'fulfilled'))
    throw new Error('preparation runtime operation did not fulfill');
}

/** Retains the exact public runtime-entry Promise before its first awaited owner check. */
export function withOwnerSolverRuntime<T>(
  owner: DependencyOwner,
  layout: EnvLayout,
  action: () => Promise<T>,
): Promise<T> {
  const ownership = owners.get(owner);
  if (ownership?.state !== 'active')
    return Promise.reject(new Error('dependency owner is not live'));
  const original = runOwnerSolverRuntime(owner, ownership, layout, action);
  const entry: RuntimeEntry = {
    original,
    observer: undefined,
    outcome: { phase: 'pending' },
  };
  ownership.runtimeEntries.add(entry);
  const observer = original.then(
    () => {
      entry.outcome = { phase: 'fulfilled' };
    },
    (cause: unknown) => {
      entry.outcome = { phase: 'rejected', cause };
    },
  );
  entry.observer = observer;
  void observer.then(
    () => {
      ownership.runtimeEntries.delete(entry);
    },
    () => {
      ownership.state = 'unknown';
    },
  );
  return original;
}

/** Actual canonical runtime body; every entered path settles before its description can unwind. */
async function runOwnerSolverRuntime<T>(
  owner: DependencyOwner,
  ownership: Ownership,
  layout: EnvLayout,
  action: () => Promise<T>,
): Promise<T> {
  // Historical pre-UC2/c955 entry admission proof covered the original two owner checks.
  await assertDependencyOwner(owner, layout);
  if (owners.get(owner) !== ownership || ownership.state !== 'active')
    throw new Error('dependency runtime owner association changed');
  const preparation = ownership.composition;
  const path = join(ownership.directory, 'solver-runtime.lock');
  let entered: Ownership['locks'][number] | undefined;
  let outcome: { readonly value: T } | { readonly failure: unknown };
  try {
    // Historical pre-UC2/c955 lock-path proof replaced this canonical path in the original wrapper.
    outcome = await withCanonicalLock(path, async (descriptor) => {
      if (ownership.state === 'unknown') await retainUnknownOwner(owner, ownership);
      if (ownership.state !== 'active') throw new Error('dependency runtime owner is closing');
      const lock = { path, descriptor };
      entered = lock;
      ownership.locks.push(lock);
      if (preparation !== undefined && preparation.runtimeLock === undefined)
        preparation.runtimeLock = lock;
      let exitAllowed = false;
      try {
        let outcome: { readonly value: T } | { readonly failure: unknown };
        let actionOriginal: Promise<T> | undefined;
        let actionSettled = false;
        try {
          // Historical pre-UC2/c955 description check preceded the original protected callback.
          await assertDependencyOwner(owner, layout);
          if (
            preparation !== undefined &&
            (ownership.composition !== preparation ||
              preparation.runtimeLock !== lock ||
              preparation.runtimeReleased ||
              preparation.phase !== 'preparing')
          )
            throw new Error('preparation runtime association differs');
          try {
            actionOriginal = action();
          } catch (cause) {
            // A synchronous callback throw returned no Promise; it remains a known refusal.
            actionSettled = true;
            throw cause;
          }
          if (preparation !== undefined) {
            const runtimeAction: CompositionSettlement = {
              original: undefined,
              observer: undefined,
              outcome: { phase: 'starting' },
            };
            if (preparation.runtimeAction !== undefined)
              throw new Error('preparation runtime action already bound');
            preparation.runtimeAction = runtimeAction;
            observeSettlement(preparation, runtimeAction, actionOriginal);
          }
          const returned = await actionOriginal;
          actionSettled = true;
          // Historical pre-UC2/c955 post-check proof covered the returned callback value.
          await assertDependencyOwner(owner, layout);
          if (preparation !== undefined) {
            if (preparation.phase !== 'runtime-evidence')
              throw new Error('preparation runtime evidence transfer absent');
            await joinRuntimeOperations(preparation);
          }
          outcome = { value: returned };
        } catch (cause) {
          outcome = { failure: cause };
        }
        if (preparation !== undefined && 'failure' in outcome) {
          if (actionOriginal !== undefined && !actionSettled) {
            await Promise.allSettled([
              actionOriginal,
              ...(preparation.runtimeAction?.observer === undefined
                ? []
                : [preparation.runtimeAction.observer]),
            ]);
          }
          preparation.failures.push({ boundary: 'runtime-finalizer', cause: outcome.failure });
          preparation.closeRequested = true;
          preparation.closeBoundary = 'runtime-finalizer';
          if (preparation.phase !== 'unknown') preparation.phase = 'closing';
          preparation.runtimeRefusalSettled = true;
          await joinRuntimeOperations(preparation).catch((cause: unknown) => {
            preparation.failures.push({ boundary: 'runtime-finalizer', cause });
          });
          drainPreparationCleanup(preparation);
        }
        if (isOwnershipUnknown(ownership)) await retainUnknownOwner(owner, ownership);
        exitAllowed = true;
        return outcome;
      } finally {
        if (!exitAllowed && (preparation !== undefined || isOwnershipUnknown(ownership)))
          await retainUnknownOwner(owner, ownership);
        ownership.locks.splice(ownership.locks.indexOf(lock), 1);
      }
    });
  } catch (cause) {
    if (preparation !== undefined && entered !== undefined) {
      poisonPreparation(preparation, cause);
      await retainUnknownOwner(owner, ownership);
    }
    throw cause;
  }
  // Only normal canonical return establishes its own finally and close completed.
  if (preparation !== undefined && entered !== undefined) preparation.runtimeReleased = true;
  if ('failure' in outcome) throw outcome.failure;
  return outcome.value;
}

/** Exact trusted UTF-8 config file observation; identities are strings to retain full inode precision. */
export interface OwnedSiteFile {
  path: string;
  device: string;
  inode: string;
  mode: number;
  contents: string;
}

/** Opens without following links and binds exact bytes to an existing canonical regular inode. */
// Proof: replacing this boundary with a following reader admitted the actual symlink-site production negative (exit 1).
export async function captureOwnedSiteFile(path: string): Promise<OwnedSiteFile> {
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || (await realpath(path)) !== path)
    throw new Error('ingress configuration requires canonical regular files');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat({ bigint: true });
    if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino)
      throw new Error('ingress configuration inode changed while opening');
    const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      await file.readFile(),
    );
    const final = await lstat(path, { bigint: true });
    if (final.dev !== opened.dev || final.ino !== opened.ino || !final.isFile())
      throw new Error('ingress configuration inode changed while reading');
    return {
      path,
      device: String(opened.dev),
      inode: String(opened.ino),
      mode: Number(opened.mode & 0o777n),
      contents,
    };
  } finally {
    await file.close();
  }
}

/** Retains private ingress evidence under the exact live owner; never a reconstructed authority. */
export async function retainIngressRecord(
  owner: DependencyOwner,
  layout: EnvLayout,
  label: 'original' | 'intent' | 'complete',
  record: object,
): Promise<{ path: string; contents: string }> {
  await assertDependencyOwner(owner, layout);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const path = join(
    ownership.directory,
    `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-ingress-${label}.json`,
  );
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  await publishRecord(path, contents);
  await assertDependencyOwner(owner, layout);
  return { path, contents };
}

/**
 * Replaces only this owner's selected canonical site file. Retains original bytes
 * and write intent first; exclusive private UUID sibling, file/directory fsync and
 * exact inode/byte readback establish persistence. Failure retains sibling/current
 * files and evidence; never restores an old file or removes owner state.
 */
export async function publishOwnedSiteFile(
  owner: DependencyOwner,
  layout: EnvLayout,
  original: OwnedSiteFile,
  contents: string,
): Promise<OwnedSiteFile> {
  await assertDependencyOwner(owner, layout);
  // Proof: omitted selected path validation; a genuine captured registry file was overwritten (exit 1).
  if (
    original.path !== layout.siteCaddyPath ||
    basename(original.path) !== (layout.env === 'prod' ? 'site.caddy' : 'site-dev.caddy')
  )
    throw new Error('owner site publication path is outside selected scope');

  const parent = dirname(original.path);
  const directory = await open(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parentIdentity = await directory.stat({ bigint: true });
    const namedParent = await lstat(parent, { bigint: true });
    if (
      !parentIdentity.isDirectory() ||
      !namedParent.isDirectory() ||
      parentIdentity.dev !== namedParent.dev ||
      parentIdentity.ino !== namedParent.ino ||
      (await realpath(parent)) !== parent
    )
      throw new Error('owner site publication parent is not canonical');
    // Proof: omitted original equality guards; changed-original publication replaced unknown bytes.
    if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
      throw new Error('owner site original file changed');
    const sibling = `.${basename(original.path)}.dependency-${randomUUID()}`;
    const parentBinding = {
      path: parent,
      device: String(parentIdentity.dev),
      inode: String(parentIdentity.ino),
    };
    // Proof: omitted original/intent publication; actual rename refused absent private durable evidence.
    await retainIngressRecord(owner, layout, 'original', original);
    await retainIngressRecord(owner, layout, 'intent', {
      original,
      contents,
      sibling,
      directory: parentBinding,
    });
    // Both names resolve against this retained directory, never the asynchronously mutable pathname.
    // Proof: following sibling creation overwrote the foreign symlink target in owner-site-publication.test.ts.
    const descriptor = openDirectoryFile(
      directory.fd,
      sibling,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    );
    let published: OwnedSiteFile;
    try {
      // Proof: omitted mode admission; public-mode injection passed secret bytes to the later rename boundary.
      if ((fstatSync(descriptor).mode & 0o777) !== 0o600)
        throw new Error('owner site private creation mode differs');
      writeFileSync(descriptor, contents, 'utf8');
      // Proof: omitted staged fsync; actual rename boundary refused the unsynchronized source.
      fsyncSync(descriptor);
      await assertDependencyOwner(owner, layout);
      if (JSON.stringify(await captureOwnedSiteFile(original.path)) !== JSON.stringify(original))
        throw new Error('owner site original changed before publication');
      const currentParent = await lstat(parent, { bigint: true });
      if (
        currentParent.dev !== parentIdentity.dev ||
        currentParent.ino !== parentIdentity.ino ||
        !currentParent.isDirectory() ||
        (await realpath(parent)) !== parent
      )
        throw new Error('owner site parent changed before publication');
      const created = fstatSync(descriptor, { bigint: true });
      await retainIngressRecord(owner, layout, 'intent', {
        original,
        contents,
        sibling,
        directory: parentBinding,
        created: { device: String(created.dev), inode: String(created.ino) },
      });
      await assertDependencyOwner(owner, layout);
      renameDirectoryFile(directory.fd, sibling, basename(original.path));
      // Proof: omitted directory fsync; successful-publication acceptance lacked its durability observation.
      fsyncSync(directory.fd);
      const readback = openDirectoryFile(
        directory.fd,
        basename(original.path),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        const observed = fstatSync(readback, { bigint: true });
        const retained = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          readFileSync(readback),
        );
        // Proof: omitted identity/byte readback; zero-exit no-op rename returned success.
        if (
          !observed.isFile() ||
          observed.dev !== created.dev ||
          observed.ino !== created.ino ||
          retained !== contents
        )
          throw new Error('owner site publication readback differs');
        published = {
          path: original.path,
          device: String(observed.dev),
          inode: String(observed.ino),
          mode: Number(observed.mode & 0o777n),
          contents: retained,
        };
      } finally {
        closeSync(readback);
      }
      const finalParent = await lstat(parent, { bigint: true });
      if (
        !finalParent.isDirectory() ||
        finalParent.dev !== parentIdentity.dev ||
        finalParent.ino !== parentIdentity.ino ||
        (await realpath(parent)) !== parent
      )
        throw new Error(
          'owner site parent changed after publication; retained directory evidence required',
        );
    } finally {
      closeSync(descriptor);
    }
    await assertDependencyOwner(owner, layout);
    await retainIngressRecord(owner, layout, 'complete', { site: published });
    return published;
  } finally {
    await directory.close();
  }
}

/** Durable host-wide boundary; both selected environments must remain owned before and after effects. */
export function ownerHostCommand(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  runHost: RunSolverHost,
): RunSolverHost {
  return async (command, signal) => {
    await assertDependencyOwner(owner, layouts.prod);
    await assertDependencyOwner(owner, layouts.dev);
    // Proof: raw host-response retention leaked PRIVATE_HOST_SENTINEL in the composed host-private refusal test (exit 1).
    return ownerDockerHashed(owner, layouts.prod, async (_args, boundedSignal) => {
      await assertDependencyOwner(owner, layouts.dev);
      const response = await runHost(command, boundedSignal);
      await assertDependencyOwner(owner, layouts.dev);
      return response;
    })(['solver-host', command.kind], signal);
  };
}

/** Retains solver observations as private numbered owner evidence; bytes from installed executables/config stay out. */
export async function retainSolverRecord(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: 'installed' | 'stop' | 'drained' | 'complete' | 'restore-intent' | 'restore-complete',
  record: object,
): Promise<{ path: string; contents: string }> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const path = join(
    ownership.directory,
    `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-solver-${label}.json`,
  );
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  await publishRecord(path, contents);
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  return { path, contents };
}

/** Reads attribution from the exact pending publication while retaining original live lock authority. */
export async function inspectDependencyOwnerPublication(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
): Promise<DependencyOwnerPublication> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const pending = await captureEdgeRecord(ownership.directory, 'edge-owner.pending', 65536);
  const publication = decodeDependencyOwnerPublication(JSON.parse(pending.contents));
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  return publication;
}

/** Retains fixed-label evidence exclusively and returns its original successful publication snapshot. Consumers must compare current state to this snapshot without rebasing identity; publication never creates a live activation grant. */
export async function retainActivationRecord<Label extends ActivationRecordLabel>(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: Label,
  record: ActivationRecordByLabel[Label],
): Promise<EdgeRecordSnapshot> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const statePath = ownership.directory;
  const name = `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-activation-${label}.json`;
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  const directory = await open(
    ownership.directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parent = await directory.stat({ bigint: true });
    async function assertDirectory() {
      const named = await lstat(statePath, { bigint: true });
      if (
        !parent.isDirectory() ||
        !named.isDirectory() ||
        parent.dev !== named.dev ||
        parent.ino !== named.ino ||
        (await realpath(statePath)) !== statePath
      )
        throw new Error('activation owner evidence parent changed');
    }
    await assertDirectory();
    await publishRecord(`/proc/self/fd/${String(directory.fd)}/${name}`, contents);
    await assertDirectory();
    // Proof: replacing private capture with raw readback admitted mode0644 evidence; public-readback publication negative failed.
    const published = await captureEdgeRecord(statePath, name, 65536);
    if (published.contents !== contents)
      throw new Error('activation owner evidence readback differs');
    await assertDependencyOwner(owner, layouts.prod);
    await assertDependencyOwner(owner, layouts.dev);
    await assertDirectory();
    return published;
  } finally {
    await directory.close();
  }
}

type InitialHandoffRecordLabel =
  | 'handoff-admission'
  | 'handoff-intent'
  | 'exposure-intent'
  | 'exposure-complete'
  | 'handoff-complete';
type InitialHandoffManifestLabel = 'handoff-writers' | 'handoff-source-manifest';

/**
 * Retains a bounded ordinary-owner envelope, including the original pending LF.
 * This byte publication attests live ownership, never the payload's claimed effects.
 * @throws for expired authority, an unknown label, oversized bytes or changed storage.
 */
export async function retainInitialHandoffRecord(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: InitialHandoffRecordLabel,
  record: object,
): Promise<EdgeRecordSnapshot> {
  if (
    ![
      'handoff-admission',
      'handoff-intent',
      'exposure-intent',
      'exposure-complete',
      'handoff-complete',
    ].includes(label)
  )
    throw new Error('unsupported initial handoff record label');
  const ownership = await requireHandoffOwner(owner, layouts);
  const contents = `${JSON.stringify({ owner: ownership.publication, record })}\n`;
  return publishInitialHandoff(owner, layouts, ownership, label, contents, 65536, false);
}

/**
 * Retains exact raw manifest bytes in one of two closed families, without an
 * envelope or newline normalization. Graph/request codecs own semantic admission.
 * @throws for empty/oversized bytes, unknown labels or loss of original authority/identity.
 */
export async function retainInitialHandoffManifest(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  label: InitialHandoffManifestLabel,
  contents: string,
): Promise<EdgeRecordSnapshot> {
  if (!['handoff-writers', 'handoff-source-manifest'].includes(label))
    throw new Error('unsupported initial handoff manifest label');
  const ownership = await requireHandoffOwner(owner, layouts);
  return publishInitialHandoff(
    owner,
    layouts,
    ownership,
    label,
    contents,
    label === 'handoff-writers' ? 262144 : 67108864,
    true,
  );
}

async function requireHandoffOwner(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
): Promise<Ownership> {
  await assertDependencyOwner(owner, layouts.prod);
  await assertDependencyOwner(owner, layouts.dev);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  return ownership;
}

/** Exclusive, synced publication with admission before creation and original-inode readback. */
async function publishInitialHandoff(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  ownership: Ownership,
  label: InitialHandoffRecordLabel | InitialHandoffManifestLabel,
  contents: string,
  maximum: number,
  raw: boolean,
): Promise<EdgeRecordSnapshot> {
  const bytes = Buffer.from(contents, 'utf8');
  if (bytes.length === 0 || bytes.length > maximum)
    throw new Error('initial handoff publication size is outside its family bound');
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== contents)
    throw new Error('initial handoff publication is not exact UTF8');
  if (
    !Number.isSafeInteger(ownership.sequence) ||
    ownership.sequence < 0 ||
    ownership.sequence >= 999999999999
  )
    throw new Error('initial handoff publication sequence is exhausted');
  const name = `edge-owner-${String(++ownership.sequence).padStart(6, '0')}-${label}.json`;
  const statePath = ownership.directory;
  const directory = await open(
    statePath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parent = await directory.stat({ bigint: true });
    async function assertDirectory() {
      const named = await lstat(statePath, { bigint: true });
      const retained = await directory.stat({ bigint: true });
      if (
        !parent.isDirectory() ||
        !named.isDirectory() ||
        !retained.isDirectory() ||
        named.dev !== parent.dev ||
        named.ino !== parent.ino ||
        retained.dev !== parent.dev ||
        retained.ino !== parent.ino ||
        (await realpath(statePath)) !== statePath
      )
        throw new Error('initial handoff evidence parent changed');
    }
    await assertDirectory();
    await requireHandoffOwner(owner, layouts);
    await assertDirectory();
    const descriptor = openDirectoryFile(
      directory.fd,
      name,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
    );
    try {
      const opened = fstatSync(descriptor, { bigint: true });
      if (!opened.isFile() || (opened.mode & 0o777n) !== 0o600n || opened.nlink !== 1n)
        throw new Error(
          'initial handoff created evidence is not private single-link regular storage',
        );
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
      const created = fstatSync(descriptor, { bigint: true });
      fsyncSync(directory.fd);
      await assertDirectory();
      const published = raw
        ? await captureInitialHandoffManifest(directory.fd, statePath, name, maximum, created)
        : await captureEdgeRecord(statePath, name, 65536);
      const final = fstatSync(descriptor, { bigint: true });
      if (
        published.device !== String(created.dev) ||
        published.inode !== String(created.ino) ||
        published.parentDevice !== String(parent.dev) ||
        published.parentInode !== String(parent.ino) ||
        published.mode !== 0o600 ||
        published.contents !== contents ||
        !matchesHandoffFile(final, created) ||
        final.nlink !== 1n
      )
        throw new Error('initial handoff evidence original readback differs');
      await requireHandoffOwner(owner, layouts);
      await assertDirectory();
      return published;
    } finally {
      closeSync(descriptor);
    }
  } finally {
    await directory.close();
  }
}

/** Compares file metadata across the original write and bounded read; never rebases an inode. */
function matchesHandoffFile(observed: BigIntStats, original: BigIntStats): boolean {
  return (
    observed.isFile() &&
    observed.dev === original.dev &&
    observed.ino === original.ino &&
    observed.mode === original.mode &&
    observed.nlink === original.nlink &&
    observed.uid === original.uid &&
    observed.gid === original.gid &&
    observed.size === original.size &&
    observed.mtimeNs === original.mtimeNs &&
    observed.ctimeNs === original.ctimeNs
  );
}

/** Reads only the raw handoff families through the original retained parent, in bounded chunks. */
async function captureInitialHandoffManifest(
  directory: number,
  statePath: string,
  name: string,
  maximum: number,
  created: BigIntStats,
): Promise<EdgeRecordSnapshot> {
  const writers = /^edge-owner-[0-9]{6,12}-handoff-writers\.json$/.test(name);
  const source = /^edge-owner-[0-9]{6,12}-handoff-source-manifest\.json$/.test(name);
  if ((!writers && !source) || maximum !== (writers ? 262144 : 67108864))
    throw new Error('unsupported initial handoff manifest family');
  const parent = fstatSync(directory, { bigint: true });
  const path = join(statePath, name);
  const relative = `/proc/self/fd/${String(directory)}/${name}`;
  const descriptor = openDirectoryFile(
    directory,
    name,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const named = await lstat(relative, { bigint: true });
    if (
      !matchesHandoffFile(opened, created) ||
      !matchesHandoffFile(named, created) ||
      (opened.mode & 0o777n) !== 0o600n ||
      opened.nlink !== 1n ||
      opened.size < 1n ||
      opened.size > BigInt(maximum)
    )
      throw new Error('initial handoff manifest identity, type, mode or size differs');
    const bytes = Buffer.alloc(Number(opened.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(
        descriptor,
        bytes,
        offset,
        Math.min(1048576, bytes.length - offset),
        offset,
      );
      if (count === 0) throw new Error('initial handoff manifest truncated while reading');
      offset += count;
    }
    const final = fstatSync(descriptor, { bigint: true });
    const current = await lstat(relative, { bigint: true });
    const namedParent = await lstat(statePath, { bigint: true });
    const finalParent = fstatSync(directory, { bigint: true });
    if (
      !matchesHandoffFile(final, opened) ||
      !matchesHandoffFile(current, opened) ||
      !namedParent.isDirectory() ||
      !finalParent.isDirectory() ||
      namedParent.dev !== parent.dev ||
      namedParent.ino !== parent.ino ||
      finalParent.dev !== parent.dev ||
      finalParent.ino !== parent.ino ||
      (await realpath(statePath)) !== statePath
    )
      throw new Error('initial handoff manifest file or parent changed while reading');
    return {
      path,
      device: String(opened.dev),
      inode: String(opened.ino),
      parentDevice: String(parent.dev),
      parentInode: String(parent.ino),
      mode: Number(opened.mode & 0o777n),
      contents: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    };
  } finally {
    closeSync(descriptor);
  }
}

/** Binds an effective participant namespace to the directory actually holding this live owner's markers and locks. */
export async function assertDependencyOwnerDirectory(
  owner: DependencyOwner,
  layout: EnvLayout,
  directory: string,
): Promise<void> {
  await assertDependencyOwner(owner, layout);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  if (ownership.directory !== directory)
    throw new Error('dependency owner state namespace differs from effective solver admission');
}

/** Retain only a response hash at credential-bearing Docker inspection boundaries. */
export function ownerDockerHashed(
  owner: DependencyOwner,
  layout: EnvLayout,
  runDocker: RunDocker,
): RunDocker {
  return ownerDockerBoundary(owner, layout, runDocker, true);
}

/** Fixed-path owner-only policy replacement after all exclusion finalizers; never retires retained admission. */
export async function publishRestoringEdgePolicy(
  owner: DependencyOwner,
  original: EdgePolicySnapshot,
  intent: RetainedSolverRestoration,
): Promise<void> {
  const envelope = await assertRetainedSolverRestoration(owner, intent);
  const ownership = owners.get(owner);
  if (ownership === undefined) throw new Error('dependency owner is not live');
  const prod = ownership.layouts.find((layout) => layout.env === 'prod');
  const dev = ownership.layouts.find((layout) => layout.env === 'dev');
  if (prod === undefined || dev === undefined || ownership.layouts.length !== 2)
    throw new Error('restoring policy requires joint prod/dev owner');
  const layouts = { prod, dev };
  const path = join(ownership.directory, 'edge-policy.json');
  const reference = solverRestorationReference(intent);
  // Proof: publication-scope omission lost the exact fixed-path refusal; owner publisher test failed (exit 1).
  if (
    original.path !== path ||
    intent.path !== join(ownership.directory, reference.name) ||
    !/^edge-owner-[0-9]{6,12}-solver-restore-intent\.json$/.test(reference.name) ||
    envelope.owner !== ownership.publication ||
    original.policy.phase !== 'ordinary'
  )
    throw new Error('restoring policy scope or owner binding differs');
  decodeOrdinaryEdgePolicy(original.policy, ownership.directory);
  await assertNoCommittedDependencyOwner(ownership.directory);
  const retained = await captureEdgeRecord(ownership.directory, reference.name, 65536);
  if (retained.contents !== intent.contents) throw new Error('restoration intent bytes changed');
  const policy: RestoringEdgePolicy = {
    format: 'dependency-edge-policy',
    version: 1,
    phase: 'restoring',
    edgeState: ownership.directory,
    ownerPublicationSha256: createHash('sha256').update(ownership.publication).digest('hex'),
    restorationIntent: reference,
  };
  const contents = `${JSON.stringify(policy)}\n`;
  const directory = await open(
    ownership.directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const parent = await directory.stat({ bigint: true });
    const assertOriginal = async () => {
      await assertDependencyOwner(owner, prod);
      await assertDependencyOwner(owner, dev);
      await assertNoCommittedDependencyOwner(ownership.directory);
      // Proof: publication-original omission replaced changed ordinary bytes; changed-original fault test failed (exit 1).
      if (
        JSON.stringify(await captureEdgePolicy(ownership.directory)) !== JSON.stringify(original) ||
        String(parent.dev) !== original.parentDevice ||
        String(parent.ino) !== original.parentInode ||
        JSON.stringify(await captureEdgeRecord(ownership.directory, reference.name, 65536)) !==
          JSON.stringify(retained)
      )
        throw new Error('restoring policy original, parent or intent changed');
    };
    await assertOriginal();
    const sibling = `.edge-policy.json.dependency-${randomUUID()}`;
    await retainSolverRecord(owner, layouts, 'restore-complete', {
      phase: 'policy-publication-intent',
      reference,
      originalSha256: createHash('sha256').update(original.contents).digest('hex'),
      sibling,
    });
    const descriptor = openDirectoryFile(
      directory.fd,
      sibling,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
    );
    try {
      const created = fstatSync(descriptor, { bigint: true });
      // Proof: publication-private omission crossed the public-mode publication boundary; public-mode fault test failed (exit 1).
      if ((created.mode & 0o777n) !== 0o600n)
        throw new Error('restoring policy creation mode is not private');
      writeFileSync(descriptor, contents, 'utf8');
      // Proof: publication-file-sync omission ignored injected fsync failure; file-sync fault test failed (exit 1).
      fsyncSync(descriptor);
      await assertOriginal();
      renameDirectoryFile(directory.fd, sibling, 'edge-policy.json');
      // Proof: publication-directory-sync omission ignored injected fsync failure; directory-sync fault test failed (exit 1).
      fsyncSync(directory.fd);
      const published = await captureEdgePolicy(ownership.directory);
      // Proof: publication-readback omission accepted no-op rename; noop-rename fault test failed (exit 1).
      if (
        published.device !== String(created.dev) ||
        published.inode !== String(created.ino) ||
        published.parentDevice !== String(parent.dev) ||
        published.parentInode !== String(parent.ino) ||
        published.contents !== contents ||
        published.mode !== 0o600
      )
        throw new Error('restoring policy publication readback differs');
    } finally {
      closeSync(descriptor);
    }
    await assertDependencyOwner(owner, prod);
    await assertDependencyOwner(owner, dev);
    await assertNoCommittedDependencyOwner(ownership.directory);
    await retainSolverRecord(owner, layouts, 'restore-complete', {
      phase: 'policy-published',
      reference,
    });
  } finally {
    await directory.close();
  }
}

/** A pending P2a owner never grants a committed owner transition. */
export async function assertNoCommittedDependencyOwner(directory: string): Promise<void> {
  try {
    await lstat(join(directory, 'edge-owner.json'));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  // Proof: committed-marker omission admitted a committed marker; runtime committed test failed (exit 1).
  throw new Error('solver-only restoration refuses a committed dependency owner');
}

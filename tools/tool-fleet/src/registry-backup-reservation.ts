import { createHash, randomUUID } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import { type FileHandle, lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { type } from 'arktype';
import { dlopen } from 'bun:ffi';

import { requireRegistryBackupLockReservation } from './registry-backup-locks';
import type { RegistryBackupSourceObservation } from './registry-backup-source';
import {
  failureHeadroom,
  maximumJournalBytes,
  parseRegistryCommandResponse,
} from './registry-journal';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';
import { completeRegistryOperation } from './registry-operation-completion';

export type RegistryBackupEffectSlot =
  | `repository-${'direct' | 'initial' | 'final' | 'prepare' | 'retention-before' | 'retention-after'}`
  | 'lock-inspection'
  | 'retention-list'
  | 'retention-journal'
  | 'snapshot-create'
  | `${'snapshot' | 'verify' | 'restore'}-${'check' | 'metadata' | 'journal'}`
  | 'restore-registry'
  | 'restore-journal-target'
  | 'exact-lock-delete';

/** A fixed production callsite and its exact target; neither argv nor a caller byte allowance grants an effect. */
export interface RegistryBackupEffect {
  slot: RegistryBackupEffectSlot;
  kind: 'read' | 'lock' | 'snapshot' | 'restore' | 'delete';
  targetSha256: string;
}
export interface RegistryBackupEffectTicket {
  id: string;
}
/** Durable consumption is mandatory independently of physical admission. Terminal execution acknowledges process cleanup, never semantic verification or reclaimed provider space. */
export interface RegistryBackupEffectPort {
  bindPhase(
    request:
      { phase: 'inspection' } | { phase: 'snapshot'; source: RegistryBackupSourceObservation },
  ): Promise<void>;
  consumeEffect(effect: RegistryBackupEffect): Promise<RegistryBackupEffectTicket>;
  settleEffect(ticket: RegistryBackupEffectTicket): Promise<void>;
}

const Hash = type(/^[a-f0-9]{64}$/);
const Identity = type('0 < string <= 256');
const Count = type('number.safe >= 0');
const Positive = type('number.safe > 0');
const Action = type(
  "'backup-preflight'|'backup-snapshot'|'backup-verify'|'backup-restore'|'backup-reconcile'",
);
const Binding = type({
  operationId: Identity,
  tokenSha256: Hash,
  registryId: Identity,
  storageId: Identity,
  repositoryId: Hash,
  configurationSha256: Hash,
  profileSha256: Hash,
  '+': 'reject',
});
const OperationBinding = Binding.omit('tokenSha256');
const Attempt = type({
  id: type(/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{64})$/),
  revision: Positive,
  action: Action,
  '+': 'reject',
});
const StoredAttempt = Attempt.merge({ tokenSha256: Hash });
const Snapshot = type({
  sha256: Hash,
  journalRevision: Positive,
  censusSha256: Hash,
  '+': 'reject',
});
const Slot = type(
  "'repository-direct'|'repository-initial'|'repository-final'|'repository-prepare'|'repository-retention-before'|'repository-retention-after'|'lock-inspection'|'retention-list'|'retention-journal'|'snapshot-create'|'snapshot-check'|'snapshot-metadata'|'snapshot-journal'|'verify-check'|'verify-metadata'|'verify-journal'|'restore-check'|'restore-metadata'|'restore-journal'|'restore-registry'|'restore-journal-target'|'exact-lock-delete'",
);
const Effect = type({
  slot: Slot,
  kind: "'read'|'lock'|'snapshot'|'restore'|'delete'",
  targetSha256: Hash,
  '+': 'reject',
});
// Proof: the actual store accepted a 36-hyphen historical ticket before this UUID grammar was constrained.
const Consumption = Effect.merge({
  id: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  attemptId: Attempt.get('id'),
  revision: Positive,
  action: Action,
  state: "'consumed'|'terminal'",
});
const State = type({
  schemaVersion: '1',
  scope: "'effect-lineage-only'",
  generation: Count,
  binding: OperationBinding.or('null'),
  snapshot: Snapshot.or('null'),
  inspection: 'boolean',
  attempts: StoredAttempt.array().atMostLength(40),
  effects: Consumption.array().atMostLength(1024),
  closedOperationId: Identity.or('null'),
  '+': 'reject',
});
export type RegistryBackupReservation = typeof State.infer;
const Capacity = type({
  usableBytes: Positive,
  allocationUnitBytes: Positive,
  usedBytes: Count,
  totalInodes: Positive,
  usedInodes: Count,
});
const maximumRecordBytes = 1024 ** 2;

/** Fixed sibling on the canonical journal filesystem. Runtime never creates missing state, refunds effects, or infers physical admission. Installed root access is a separate activation proof. */
export function openRegistryBackupReservation(configuration: {
  journalPath: string;
  authorityDescriptor: number;
  authorityUid: number | undefined;
  uid: number | undefined;
  journalMaximumBytes: number;
  binding: typeof Binding.infer;
  attempt: typeof Attempt.infer;
  signal: AbortSignal;
  measure: () => Promise<typeof Capacity.infer>;
  /** Ordinary filesystem fault boundaries; production uses descriptor fsync and atomic rename. */
  sync?: (descriptor: FileHandle) => Promise<void>;
  publish?: (from: string, to: string) => Promise<void>;
  statPath?: (path: string) => Promise<BigIntStats>;
  statFile?: (descriptor: FileHandle) => Promise<BigIntStats>;
  close?: (descriptor: FileHandle) => Promise<void>;
  /** Tests of other boundaries can explicitly model canonical lineage; production always reads the canonical journal. */
  requireLineage?: () => Promise<void>;
}): RegistryBackupEffectPort {
  const binding = Binding.assert(structuredClone(configuration.binding));
  const operationBinding = OperationBinding.assert({
    operationId: binding.operationId,
    registryId: binding.registryId,
    storageId: binding.storageId,
    repositoryId: binding.repositoryId,
    configurationSha256: binding.configurationSha256,
    profileSha256: binding.profileSha256,
  });
  const attempt = Attempt.assert(structuredClone(configuration.attempt));
  const directory = join(dirname(configuration.journalPath), 'backup-effects');
  const path = join(directory, 'state.json');
  const pending = join(directory, 'state.pending');
  const statPath = configuration.statPath ?? ((path: string) => lstat(path, { bigint: true }));
  const statFile =
    configuration.statFile ?? ((descriptor: FileHandle) => descriptor.stat({ bigint: true }));
  const requireStatus = (status: BigIntStats) => {
    for (const field of [
      status.dev,
      status.ino,
      status.uid,
      status.mode,
      status.nlink,
      status.size,
    ]) {
      if (typeof field !== 'bigint' || field < 0n || field > 0xffffffffffffffffn)
        throw new Error('Malformed required backup effect stat');
    }
    return status;
  };
  const closeFile = configuration.close ?? ((descriptor: FileHandle) => descriptor.close());
  const hashText = (text: string) => createHash('sha256').update(text).digest('hex');
  const serializeBinding = (current: typeof OperationBinding.infer) =>
    JSON.stringify([
      current.operationId,
      current.registryId,
      current.storageId,
      current.repositoryId,
      current.configurationSha256,
      current.profileSha256,
    ]);
  const requireLineage =
    configuration.requireLineage ??
    (async () => {
      const descriptor = await open(
        join(configuration.journalPath, 'journal.json'),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      await completeRegistryOperation(
        async () => {
          const status = requireStatus(await descriptor.stat({ bigint: true }));
          const uid = configuration.authorityUid;
          if (
            uid === undefined ||
            !Number.isSafeInteger(uid) ||
            uid < 0 ||
            !status.isFile() ||
            status.uid !== BigInt(uid) ||
            (status.mode & 0o777n) !== 0o600n ||
            status.nlink !== 1n ||
            status.size > BigInt(maximumJournalBytes)
          )
            throw new Error('Untrusted canonical backup lineage file');
          const serialized = await descriptor.readFile('utf8');
          if (Buffer.byteLength(serialized) > maximumJournalBytes)
            throw new Error('Canonical backup lineage exceeds bound');
          const journal = parseRegistryCommandResponse({
            state: JSON.parse(serialized) as unknown,
          }).state;
          const owned = journal.maintenance;
          if (
            journal.schemaVersion !== 4 ||
            owned === null ||
            journal.revision !== attempt.revision ||
            owned.operationId !== binding.operationId ||
            hashText(owned.token) !== binding.tokenSha256 ||
            journal.enrollment.registryId !== binding.registryId ||
            journal.enrollment.storageId !== binding.storageId
          )
            throw new Error('Backup effect differs from current canonical lineage');
          // Proof: recovery-phase removal admitted a normal lock-writing effect; snapshot-phase removal separately admitted snapshot consumption from inspection.
          if (attempt.action === 'backup-reconcile') {
            const evidence = journal.maintenanceEvidence;
            requireRegistryBackupLockReservation(
              evidence?.backupReconciliation,
              evidence?.backupAttempts ?? [],
              owned.operationId,
              binding.configurationSha256,
              journal.revision,
            );
            if (hashText(JSON.stringify(evidence?.backupReconciliation)) !== attempt.id)
              throw new Error('Backup recovery differs from current canonical lineage');
          } else {
            const current = journal.maintenanceEvidence?.backupAttempts.find(
              (entry) => entry.id === attempt.id,
            );
            if (
              current?.state !== 'prepared' ||
              current.action !== attempt.action ||
              current.operationId !== binding.operationId ||
              current.tokenSha256 !== binding.tokenSha256 ||
              current.configurationSha256 !== binding.configurationSha256 ||
              current.journalRevision !== attempt.revision
            )
              throw new Error('Backup attempt differs from current canonical lineage');
          }
        },
        () => descriptor.close(),
      );
    });
  const sync = configuration.sync ?? ((descriptor: FileHandle) => descriptor.sync());
  // Proof: removing the directory predicate admitted a public sidecar through the actual store; source-in-contents dependency mutation separately invalidated snapshot reobservation.
  const assertAuthority = async () => {
    configuration.signal.throwIfAborted();
    await assertRegistryMaintenanceLock(
      configuration.journalPath,
      configuration.authorityDescriptor,
      configuration.authorityUid,
    );
    // Proof: removing this dependency ran a forged newer attempt's child in 'actual canonical recovery rotates token without refilling spent store slots'.
    await requireLineage();
    const uid = configuration.uid;
    if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0)
      throw new Error('Invalid backup effect owner');
    const [parent, contents, status] = (
      await Promise.all([
        statPath(dirname(directory)),
        statPath(configuration.journalPath),
        statPath(directory),
      ])
    ).map(requireStatus);
    // Proof: predicate removal admitted a public sidecar through the actual store; source-in-contents dependency injection separately broke snapshot reobservation.
    if (
      (await realpath(directory)) !== directory ||
      !status.isDirectory() ||
      status.uid !== BigInt(uid) ||
      (status.mode & 0o777n) !== 0o700n ||
      parent.uid !== BigInt(uid) ||
      (parent.mode & 0o022n) !== 0n ||
      status.dev !== contents.dev ||
      parent.dev !== status.dev
    )
      throw new Error('Untrusted backup effect directory');
  };
  // Proof: predicate removal fulfilled 'trusted effect state refuses hardlink without consumption'; its alias is outside the sidecar so entry checks cannot mask nlink validation.
  const requireFile = async (descriptor: FileHandle) => {
    const status = requireStatus(await statFile(descriptor));
    const uid = configuration.uid;
    if (uid === undefined) throw new Error('Missing backup effect owner');
    if (
      !status.isFile() ||
      status.uid !== BigInt(uid) ||
      (status.mode & 0o777n) !== 0o600n ||
      status.nlink !== 1n ||
      status.size > BigInt(maximumRecordBytes)
    )
      throw new Error('Untrusted backup effect file');
    return status;
  };
  const syncDirectory = async () => {
    const descriptor = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    return completeRegistryOperation(
      () => sync(descriptor),
      () => closeFile(descriptor),
    );
  };
  const preserveHeadroom = async () => {
    const measured = Capacity.assert(await configuration.measure());
    const budget = Math.min(
      Positive.assert(configuration.journalMaximumBytes),
      measured.usableBytes,
    );
    const allocation = BigInt(measured.allocationUnitBytes);
    const alignBytes = (bytes: number) =>
      ((BigInt(bytes) + allocation - 1n) / allocation) * allocation;
    // Existing files are in usedBytes; reserve replacement + future failure state and canonical replacement/failure coexistence.
    // Proof: deleting the canonical reserve term let the real maintenance callback consume under modeled pressure; the unchanged canonical failure receipt still writes.
    const required =
      BigInt(measured.usedBytes) +
      2n * alignBytes(maximumRecordBytes) +
      2n * alignBytes(maximumJournalBytes + failureHeadroom) +
      allocation;
    // Proof: removing byte/inode pressure refusal launched actual store children under modeled pressure; counters are not native ENOSPC proof.
    if (
      required * 10n >= BigInt(budget) * 9n ||
      (BigInt(measured.usedInodes) + 6n) * 10n >= BigInt(measured.totalInodes) * 9n
    )
      throw new Error('Insufficient backup effect capacity preserving canonical journal headroom');
  };
  const identifyEffect = (effect: RegistryBackupEffect & { action: typeof Action.infer }) =>
    `${effect.action}:${effect.slot}${effect.slot === 'lock-inspection' || effect.slot === 'exact-lock-delete' ? ':' + effect.targetSha256 : ''}`;
  const readState = async () => {
    const descriptor = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    return completeRegistryOperation(
      async () => {
        await requireFile(descriptor);
        const serialized = await descriptor.readFile('utf8');
        if (Buffer.byteLength(serialized) > maximumRecordBytes)
          throw new Error('Backup effect record exceeds bound');
        // Proof: widening scope fulfilled 'trusted effect state refuses malformed without consumption' through the actual store.
        const state = State.assert(JSON.parse(serialized));
        // Proof: guard removal made 'inconsistent duplicate ticket history refuses before a real child' accept the duplicate history and launch.
        if (
          new Set(state.effects.map(identifyEffect)).size !== state.effects.length ||
          new Set(state.effects.map((effect) => effect.id)).size !== state.effects.length ||
          new Set(state.attempts.map((entry) => entry.id)).size !== state.attempts.length ||
          state.effects.some(
            (effect) =>
              !state.attempts.some(
                (entry) =>
                  entry.id === effect.attemptId &&
                  entry.action === effect.action &&
                  entry.revision === effect.revision,
              ),
          ) ||
          (state.binding === null &&
            (state.inspection ||
              state.snapshot !== null ||
              state.attempts.length > 0 ||
              state.effects.length > 0))
        )
          throw new Error('Inconsistent backup effect state');
        // Proof: predicate removal fulfilled 'operation effect authority refuses changed configurationSha256' and its operation/registry/storage/repository/profile variants.
        if (state.binding !== null && serializeBinding(state.binding) !== serializeBinding(binding))
          throw new Error('Backup operation binding differs from durable authority');
        // Proof: removing stale-revision refusal let an older port run a real child after the newer canonical attempt binding.
        const greatestRevision = Math.max(0, ...state.attempts.map((entry) => entry.revision));
        const prior = state.attempts.find((entry) => entry.id === attempt.id);
        if (
          attempt.revision < greatestRevision ||
          (prior === undefined && greatestRevision >= attempt.revision)
        )
          throw new Error('Backup effect authority is stale');
        // Proof: removing exact-lineage comparison let the actual store accept a changed token on the same attempt.
        if (
          prior !== undefined &&
          JSON.stringify(prior) !== JSON.stringify({ ...attempt, tokenSha256: binding.tokenSha256 })
        )
          throw new Error('Backup attempt binding differs from durable authority');
        return state;
      },
      () => closeFile(descriptor),
    );
  };
  const persistState = async (state: RegistryBackupReservation) => {
    state.generation = Positive.assert(state.generation + 1);
    State.assert(state);
    const serialized = JSON.stringify(state) + '\n';
    if (Buffer.byteLength(serialized) > maximumRecordBytes)
      throw new Error('Backup effect record exceeds bound');
    await preserveHeadroom();
    await assertAuthority();
    const descriptor = await open(
      pending,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    let published = false;
    try {
      await completeRegistryOperation(
        async () => {
          await descriptor.writeFile(serialized, 'utf8');
          await sync(descriptor);
        },
        () => closeFile(descriptor),
      );
      // Proof: skipping only consumed-state publication made 'real child sees durable consumption and terminal execution never refunds it' exit 91 after reading old state.json; file/directory-sync omissions separately defeat their refusal consumers.
      await (configuration.publish ?? rename)(pending, path);
      published = true;
      await syncDirectory();
    } catch (cause) {
      if (!published) {
        try {
          await unlink(pending);
          await syncDirectory();
        } catch (cleanupFailure) {
          throw new AggregateError(
            [cause, cleanupFailure],
            'Backup effect persistence and cleanup failed',
            { cause: cleanupFailure },
          );
        }
      }
      throw cause;
    }
  };
  const updateState = async <T>(
    change: (state: RegistryBackupReservation) => { value: T; changed: boolean },
  ): Promise<T> => {
    await assertAuthority();
    const descriptor = await open(
      join(directory, 'state.lock'),
      constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    return completeRegistryOperation(
      async () => {
        const library = dlopen('libc.so.6', { flock: { args: ['i32', 'i32'], returns: 'i32' } });
        return completeRegistryOperation(
          async () => {
            await requireFile(descriptor);
            // Proof: bypassing this short lock ran a real store child while another description held it, even though both callers shared canonical authority.
            if (library.symbols.flock(descriptor.fd, 2 | 4) !== 0)
              throw new Error('Backup effect state is busy');
            // Never replay while an unpublished replacement or unrecognized authority file remains.
            const names = await import('node:fs/promises').then(({ readdir }) =>
              readdir(directory),
            );
            // Proof: removing unknown-entry refusal allowed the actual store to consume beside an unrecognized state file. A pending exclusive replacement independently prevents publication.
            if (names.some((name) => !['state.json', 'state.lock'].includes(name)))
              throw new Error('Unresolved backup effect replacement or foreign entry');
            // Proof: caching this read recreated unlinked state and launched a child in 'trusted effect state refuses missing without consumption'.
            const state = await readState();
            const changed = change(state);
            if (changed.changed) await persistState(state);
            return changed.value;
          },
          () =>
            Promise.resolve().then(() => {
              library.close();
            }),
        );
      },
      () => closeFile(descriptor),
    );
  };
  const requireAttempt = (state: RegistryBackupReservation) => {
    // Proof: guard removal made 'missing recovery phase budget refuses before a real child despite valid vacant state' create the child marker before later consistency refusal.
    if (state.binding === null || !state.attempts.some((entry) => entry.id === attempt.id))
      throw new Error('Missing trusted backup effect budget binding');
  };
  return {
    bindPhase: (request) =>
      updateState((state) => {
        const previous = JSON.stringify(state);
        state.binding ??= structuredClone(operationBinding);
        if (!state.attempts.some((entry) => entry.id === attempt.id))
          state.attempts.push({ ...structuredClone(attempt), tokenSha256: binding.tokenSha256 });
        if (request.phase === 'inspection') state.inspection = true;
        else {
          const source = request.source;
          type({ scope: "'contents-metadata-only'", xattrScope: "'caller-visible-only'" }).assert(
            source,
          );
          const snapshot = Snapshot.assert({
            sha256: source.sha256,
            journalRevision: source.journalRevision,
            censusSha256: source.censusSha256,
          });
          if (
            attempt.action !== 'backup-snapshot' ||
            source.operationId !== binding.operationId ||
            source.registryId !== binding.registryId ||
            source.storageId !== binding.storageId ||
            source.journalRevision !== attempt.revision ||
            source.journalPath !== configuration.journalPath
          )
            throw new Error('Snapshot phase differs from canonical source binding');
          // Proof: removal let the phase consumer replace the already bound source hash/census.
          if (
            state.snapshot !== null &&
            JSON.stringify(state.snapshot) !== JSON.stringify(snapshot)
          )
            throw new Error('Snapshot source binding differs from durable authority');
          // Proof: removing the source-binding predicate fulfilled 'snapshot phase refuses changed-source rather than replacing its one source binding' and its census equivalent.
          state.snapshot = snapshot;
        }
        return { value: undefined, changed: previous !== JSON.stringify(state) };
      }),
    consumeEffect: (input) =>
      updateState((state) => {
        const effect = Effect.assert(input);
        const kind =
          effect.slot.startsWith('repository-') || effect.slot === 'lock-inspection'
            ? 'read'
            : effect.slot === 'snapshot-create'
              ? 'snapshot'
              : effect.slot === 'exact-lock-delete'
                ? 'delete'
                : effect.slot === 'restore-registry' || effect.slot === 'restore-journal-target'
                  ? 'restore'
                  : 'lock';
        // Proof: removed kind validation let a changed fixed-slot descriptor reach the actual store child.
        if (effect.kind !== kind) throw new Error('Backup effect kind differs from its fixed slot');
        requireAttempt(state);
        // Proof: replay removal fulfilled 'new canonical action attempt cannot refill a spent fixed slot' and launched a second child in 'real child sees durable consumption and terminal execution never refunds it'.
        if (
          state.effects.some(
            (entry) =>
              identifyEffect(entry) === identifyEffect({ ...effect, action: attempt.action }),
          )
        )
          throw new Error('Backup effect replay refused');
        if (attempt.action === 'backup-reconcile' && !['read', 'delete'].includes(effect.kind))
          throw new Error('Backup recovery cannot grant normal lock-writing effects');
        if (
          effect.kind === 'delete' &&
          (attempt.action !== 'backup-reconcile' || effect.slot !== 'exact-lock-delete')
        )
          throw new Error('Backup deletion phase refused');
        // Proof: removal admitted snapshot consumption with only inspection binding.
        if (
          (effect.kind === 'snapshot' &&
            (attempt.action !== 'backup-snapshot' ||
              effect.targetSha256 !== state.snapshot?.sha256 ||
              effect.slot !== 'snapshot-create')) ||
          (effect.kind === 'restore' && attempt.action !== 'backup-restore') ||
          (!state.inspection && attempt.action !== 'backup-reconcile')
        )
          throw new Error('Backup effect phase refused');
        // Proof: removal ran an unused normal store command while an earlier effect remained uncertain.
        if (
          attempt.action !== 'backup-reconcile' &&
          state.effects.some((entry) => entry.state === 'consumed')
        )
          throw new Error('Uncertain prior backup effect requires reconciliation');
        // Proof: uncertainty-guard removal ran a different unused normal command while an earlier consumption remained uncertain.
        const ticket = { id: randomUUID() };
        state.effects.push({
          ...effect,
          ...ticket,
          attemptId: attempt.id,
          revision: attempt.revision,
          action: attempt.action,
          state: 'consumed',
        });
        return { value: ticket, changed: true };
      }),
    settleEffect: (ticket) =>
      updateState((state) => {
        requireAttempt(state);
        const effect = state.effects.find((entry) => entry.id === ticket.id);
        // Proof: removal let a newer action settle an older action consumed ticket.
        if (
          effect?.attemptId !== attempt.id ||
          effect.revision !== attempt.revision ||
          effect.action !== attempt.action ||
          effect.state !== 'consumed'
        )
          throw new Error('Missing exact consumed backup effect ticket');
        // Proof: removing exact settlement validation allowed a newer action to settle an older action's consumed ticket. Terminal means execution only, never semantic snapshot verification or physical release.
        effect.state = 'terminal';
        return { value: undefined, changed: true };
      }),
  };
}

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';

import type { RegistryBackupEffect, RegistryBackupEffectPort } from './registry-backup-reservation';
import {
  observeRegistryBackupSnapshotVersions,
  planRegistryBackupRetention,
  type RegistryBackupRetentionInput,
  type RegistryBackupRetentionPlan,
  requireRegistryBackupRetentionInput,
} from './registry-backup-retention';
import {
  observeRegistryBackupSource,
  RegistryBackupSourceLimits,
  type RegistryBackupSourceObservation,
} from './registry-backup-source';
import {
  assertRegistryMaintenanceLock,
  awaitRegistryBackupChild,
  awaitRegistryBackupMember,
  installMaintenanceReaper,
} from './registry-maintenance-process';
import { RegistryBackupReceipt, RegistryRecoveryPreparation } from './registry-maintenance-state';
import type { RegistryMaintenanceSession } from './registry-managed-journal';
import { readRegistryBytes } from './registry-stream';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
/**
 * Physical-provider authority remains mandatory. Inspection reserves repository/normal-lock
 * effects only; snapshot admission additionally consumes exact stopped-source metadata.
 * Source capacity bounds never represent encoded content or a new physical-byte allowance.
 * Repeated calls validate one operation reservation; they cannot prune or allocate hidden allowances.
 */
export type RegistryBackupAdmission = {
  operationId: string;
  registryMaximumBytes: number;
  journalMaximumBytes: number;
} & ({ phase: 'inspection' } | { phase: 'snapshot'; source: RegistryBackupSourceObservation });
export interface RegistryBackupSource {
  operationId: string;
  registryId: string;
  storageId: string;
  registryPath: string;
  journalPath: string;
  journalRevision: number;
  maximumBytes: number;
  journalMaximumBytes: number;
  censusSha256: string;
}

export type RegistryBackupPreparation = Omit<
  RegistryBackupSource,
  'journalRevision' | 'censusSha256'
>;

/**
 * Fixed execution inputs shared by the launcher and durable effect fingerprint.
 * One S3 SDK attempt preserves Restic's outer retries. Conditional nonempty single-PUT
 * counting is not a complete command, provider, workspace or physical-admission bound.
 */
export function createRegistryBackupProfile(repository: string) {
  return repository.startsWith('s3:')
    ? Object.freeze({
        name: 'restic/s3-single-attempt/locked-commands/v2',
        // Proof: omitting only s3.retries=1 completed the real TLS/store witness with zero outer Save retries instead of two.
        arguments: Object.freeze(['--no-cache', '-o', 's3.retries=1'] as const),
      })
    : Object.freeze({
        name: 'restic/no-cache/locked-commands/v1',
        arguments: Object.freeze(['--no-cache'] as const),
      });
}

/** Pinned encrypted restic storage. Caller owns the common authority and separately verifies bounded source/restore mounts. */
export function createRegistryBackupStore(configuration: {
  signal: AbortSignal;
  authorityUid?: number;
  lifetime?: 'guardian' | 'worker';
  repositoryId?: string;
  binary: string;
  binarySha256: string;
  environment: unknown;
  sourceLimits?: RegistryBackupSourceLimits;
  admit: (request: RegistryBackupAdmission) => Promise<void>;
  effects: RegistryBackupEffectPort;
}) {
  const environment = type({
    RESTIC_REPOSITORY: 'string > 0',
    'RESTIC_PASSWORD_FILE?': 'string > 0',
    'RESTIC_PASSWORD?': 'string > 0',
    'AWS_ACCESS_KEY_ID?': 'string > 0',
    'AWS_SECRET_ACCESS_KEY?': 'string > 0',
    'AWS_DEFAULT_REGION?': 'string > 0',
    'AWS_SESSION_TOKEN?': 'string > 0',
    '+': 'reject',
  })(configuration.environment);
  // Proof: loader-field injection is rejected before launching even an absent configured binary.
  if (environment instanceof type.errors) throw new Error('Malformed backup environment');
  const run = async (
    arguments_: string[],
    directory: string,
    authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'> | undefined,
    effect: RegistryBackupEffect,
    maximum = 16 * 1024 ** 2,
    cycleSignal = configuration.signal,
    beforeLaunch?: () => Promise<void>,
  ): Promise<string> => {
    // Proof: missing authority refuses before even an absent pinned dependency can be launched.
    if (authority === undefined) throw new Error('Missing backup authority session');
    await assertRegistryMaintenanceLock(
      directory,
      authority.authorityDescriptor,
      configuration.authorityUid ?? process.getuid?.(),
    );
    const status = await lstat(configuration.binary);
    if (
      !status.isFile() ||
      hash(await readFile(configuration.binary)) !== configuration.binarySha256
    )
      throw new Error('Restic executable differs from lock');
    cycleSignal.throwIfAborted();
    if (beforeLaunch !== undefined) await beforeLaunch();
    cycleSignal.throwIfAborted();
    // Proof: the store unavailable-authority consumer launched a real child before this mandatory boundary.
    const ticket = await configuration.effects.consumeEffect(effect);
    cycleSignal.throwIfAborted();
    installMaintenanceReaper();
    const profile = createRegistryBackupProfile(environment.RESTIC_REPOSITORY);
    const child = Bun.spawn([configuration.binary, ...profile.arguments, ...arguments_], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdio: ['ignore', 'pipe', 'pipe', authority.authorityDescriptor],
      detached: configuration.lifetime !== 'worker',
    });
    const interrupted = new AbortController();
    const signal = AbortSignal.any([cycleSignal, interrupted.signal, AbortSignal.timeout(3600000)]);
    const lifetime =
      configuration.lifetime === 'worker'
        ? awaitRegistryBackupMember(child, signal)
        : awaitRegistryBackupChild(child, signal);
    const bounded = async (stream: ReadableStream<Uint8Array>, limit: number, label: string) => {
      try {
        return await readRegistryBytes(stream, limit, label);
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    };
    const outcomes = await Promise.allSettled([
      lifetime,
      bounded(child.stdout, maximum, 'Restic stdout'),
      bounded(child.stderr, 65536, 'Restic stderr'),
    ]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    // Boundary: require the indexed subprocess response even when unchecked-index typing assumes it exists.
    const output = outcomes[1] as (typeof outcomes)[1] | undefined;
    if (output?.status !== 'fulfilled' || !(output.value instanceof Uint8Array))
      throw new Error('Missing bounded restic response');
    await configuration.effects.settleEffect(ticket);
    return new TextDecoder().decode(output.value);
  };
  const inspectRepository = async (
    directory: string,
    authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
    cycleSignal = configuration.signal,
    scope:
      | 'direct'
      | 'initial'
      | 'final'
      | 'prepare'
      | 'retention-before'
      | 'retention-after' = 'direct',
  ) =>
    type({ id: /^[a-f0-9]{64}$/ }).assert(
      JSON.parse(
        await run(
          ['--no-lock', 'cat', 'config'],
          directory,
          authority,
          { slot: `repository-${scope}`, kind: 'read', targetSha256: hash('config') },
          4096,
          cycleSignal,
        ),
      ),
    ).id;
  const prepare = async (
    source: RegistryBackupPreparation,
    authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
  ): Promise<void> => {
    await assertRegistryMaintenanceLock(
      source.journalPath,
      authority.authorityDescriptor,
      configuration.authorityUid ?? process.getuid?.(),
    );
    for (const path of [source.registryPath, source.journalPath])
      if (
        !isAbsolute(path) ||
        (await realpath(path)) !== path ||
        !(await lstat(path)).isDirectory()
      )
        throw new Error('Snapshot source is not a canonical contents directory');
    if (
      !Number.isSafeInteger(source.maximumBytes) ||
      source.maximumBytes <= 0 ||
      !Number.isSafeInteger(source.journalMaximumBytes) ||
      source.journalMaximumBytes <= 0 ||
      source.registryPath === source.journalPath
    )
      throw new Error('Invalid independent backup source budgets');
    await configuration.admit({
      phase: 'inspection',
      operationId: source.operationId,
      registryMaximumBytes: source.maximumBytes,
      journalMaximumBytes: source.journalMaximumBytes,
    });
    await configuration.effects.bindPhase({ phase: 'inspection' });
    const repositoryId = await inspectRepository(
      source.journalPath,
      authority,
      configuration.signal,
      'prepare',
    );
    if (configuration.repositoryId !== undefined && repositoryId !== configuration.repositoryId)
      throw new Error('Backup repository differs from immutable configured identity');
  };
  const verify = async (
    input: RegistryBackupReceipt,
    authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
    scope: 'snapshot' | 'verify' | 'restore' = 'verify',
  ): Promise<void> => {
    const receipt = RegistryBackupReceipt.assert(input);
    const execute = (arguments_: string[], stage: 'check' | 'metadata' | 'journal') =>
      run(arguments_, receipt.journalPath, authority, {
        slot: `${scope}-${stage}`,
        kind: 'lock',
        targetSha256: hash(JSON.stringify(receipt)),
      });
    // Proof: native corrupted-pack test fails this command and cannot produce a new verified receipt.
    await execute(['check', '--read-data'], 'check');
    const metadata = type({ paths: 'string[]' }).assert(
      JSON.parse(await execute(['cat', 'snapshot', receipt.snapshotId], 'metadata')),
    );
    if (
      JSON.stringify([...metadata.paths].sort()) !==
      JSON.stringify([receipt.registryPath, receipt.journalPath].sort())
    )
      throw new Error('Backup paths differ from the matching mounted contents pair');
    const journal = await execute(
      ['dump', receipt.snapshotId, join(receipt.journalPath, 'journal.json')],
      'journal',
    );
    if (hash(journal) !== receipt.journalSha256)
      throw new Error('Backup journal differs from the captured authority revision');
  };
  return {
    /** Narrow read-only config inspection; caller supplies the held authority and complete raw lock census. */
    inspectRepository,
    /** Narrow read-only encrypted lock inspection; ID must come from the complete verified raw provider census. */
    inspectLock: async (
      id: string,
      directory: string,
      authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
      view?: { versionId: string; censusSha256: string },
    ) => {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid observed full backup lock identity');
      return run(
        ['--no-lock', 'cat', 'lock', id],
        directory,
        authority,
        { slot: 'lock-inspection', kind: 'read', targetSha256: hash(JSON.stringify({ id, view })) },
        4096,
      );
    },
    /**
     * Read-only retention inspection under held authority. Caller must separately admit
     * normal restic lock writes; inspection never grants backup/prune admission.
     * Complete physical snapshot-version bookends must remain stable through listing
     * and last-verified journal inspection. Cancellation waits for subprocess cleanup.
     */
    async inspectRetention(
      request: RegistryBackupRetentionInput,
      authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
    ): Promise<RegistryBackupRetentionPlan> {
      const input = requireRegistryBackupRetentionInput(request);
      // Proof: removing this prerequisite invoked observation without an immutable identity in the configured-identity consumer.
      if (
        configuration.repositoryId === undefined ||
        !/^[a-f0-9]{64}$/.test(configuration.repositoryId)
      )
        throw new Error('Retention requires immutable configured repository identity');
      // Proof: removing canonical-directory validation invoked external observation through a journal symlink alias.
      if (
        (await realpath(input.journalPath)) !== input.journalPath ||
        !(await lstat(input.journalPath)).isDirectory()
      )
        throw new Error('Retention requires canonical journal authority directory');
      await assertRegistryMaintenanceLock(
        input.journalPath,
        authority.authorityDescriptor,
        configuration.authorityUid ?? process.getuid?.(),
      );
      // Proof: the real 60-second observation consumer cancels; extending this deadline reaches its 65-second failure watchdog.
      const signal = AbortSignal.any([configuration.signal, AbortSignal.timeout(60000)]);
      const observe = async () => {
        signal.throwIfAborted();
        const versions = await input.observeSnapshotVersions(signal);
        signal.throwIfAborted();
        return observeRegistryBackupSnapshotVersions(versions);
      };
      const before = await observe();
      const repositoryId = await inspectRepository(
        input.journalPath,
        authority,
        signal,
        'retention-before',
      );
      // Proof: removing identity equality accepted the foreign configured repository in the production catalogue consumer.
      if (repositoryId !== configuration.repositoryId)
        throw new Error('Backup repository differs from immutable configured identity');
      // Proof: adding no-lock breaks the exact-command production success control; removing the 8 MiB cap accepts oversized valid JSON in the bounded-output consumer.
      const output = await run(
        ['snapshots', '--json'],
        input.journalPath,
        authority,
        { slot: 'retention-list', kind: 'lock', targetSha256: hash(configuration.repositoryId) },
        8 * 1024 ** 2,
        signal,
      );
      const plan = planRegistryBackupRetention(input, repositoryId, output, before);
      if (input.lastVerified !== null) {
        const receipt = input.lastVerified;
        const journal = await run(
          ['dump', receipt.snapshotId, join(receipt.journalPath, 'journal.json')],
          input.journalPath,
          authority,
          { slot: 'retention-journal', kind: 'lock', targetSha256: hash(receipt.snapshotId) },
          16 * 1024 ** 2,
          signal,
        );
        // Proof: separate hash/revision removals admitted mismatching last-verified journal metadata in its production consumer.
        if (
          hash(journal) !== receipt.journalSha256 ||
          type({ revision: 'number.safe >= 0' }).assert(JSON.parse(journal)).revision !==
            receipt.journalRevision
        )
          throw new Error('Last verified journal differs from receipt metadata');
      }
      // Proof: removing either bookend accepted a replaced repository or changed hidden-version metadata in the production consumers.
      if (
        (await inspectRepository(input.journalPath, authority, signal, 'retention-after')) !==
          repositoryId ||
        (await observe()).sha256 !== before.sha256
      )
        throw new Error(
          'Snapshot repository or exact version metadata changed during retention inspection',
        );
      // Proof: the final-bookend authority-loss consumer returned a plan before this recheck.
      await assertRegistryMaintenanceLock(
        input.journalPath,
        authority.authorityDescriptor,
        configuration.authorityUid ?? process.getuid?.(),
      );
      signal.throwIfAborted();
      return plan;
    },
    prepare,
    verify,
    /** Caller must independently establish and retain writer exclusion for both roots through observation, backup and verification. */
    async snapshot(
      request: RegistryBackupSource,
      authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
    ): Promise<RegistryBackupReceipt> {
      const source = Object.freeze({ ...request });
      // Proof: the real pinned-restic consumer created a snapshot before this required-limits guard.
      if (configuration.sourceLimits === undefined)
        throw new Error('Missing explicit backup source limits');
      const sourceLimits = RegistryBackupSourceLimits.assert(
        structuredClone(configuration.sourceLimits),
      );
      Object.freeze(sourceLimits.registry);
      Object.freeze(sourceLimits.journal);
      Object.freeze(sourceLimits);
      await prepare(source, authority);
      const observe = () =>
        observeRegistryBackupSource(
          source,
          sourceLimits,
          authority,
          configuration.signal,
          configuration.authorityUid ?? process.getuid?.(),
        );
      const observation = await observe();
      const expectedSha256 = observation.sha256;
      Object.freeze(observation.registry.identity);
      Object.freeze(observation.journal.identity);
      Object.freeze(observation.registry.uids);
      Object.freeze(observation.registry.gids);
      Object.freeze(observation.journal.uids);
      Object.freeze(observation.journal.gids);
      Object.freeze(observation.registry);
      Object.freeze(observation.journal);
      Object.freeze(observation);
      // Proof: the real snapshot-admission consumer previously created backup content when this phase was absent.
      await configuration.admit({
        phase: 'snapshot',
        operationId: source.operationId,
        registryMaximumBytes: source.maximumBytes,
        journalMaximumBytes: source.journalMaximumBytes,
        source: observation,
      });
      await configuration.effects.bindPhase({ phase: 'snapshot', source: observation });
      const journalSha256 = observation.journalSha256;
      const execute = (arguments_: string[]) =>
        run(
          arguments_,
          source.journalPath,
          authority,
          { slot: 'snapshot-create', kind: 'snapshot', targetSha256: expectedSha256 },
          16 * 1024 ** 2,
          configuration.signal,
          async () => {
            // Proof: same-length source replacement and mutable callback evidence previously reached real backup content.
            if ((await observe()).sha256 !== expectedSha256)
              throw new Error('Backup source changed after snapshot admission');
          },
        );
      const output = await execute([
        'backup',
        '--json',
        // Proof: native restic snapshot hostname was the incidental host before this explicit stable registry grouping.
        '--host',
        source.registryId,
        '--tag',
        `puni-registry-${source.operationId}`,
        '--',
        source.registryPath,
        source.journalPath,
      ]);
      const summaryShape = type({
        message_type: "'summary'",
        snapshot_id: /^[a-f0-9]{64}$/,
        total_bytes_processed: 'number.safe > 0',
      });
      const records: unknown[] = output
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line));
      const summary = summaryShape.assert(records.find((entry) => summaryShape.allows(entry)));
      if (hash(await readFile(join(source.journalPath, 'journal.json'))) !== journalSha256)
        throw new Error('Authority changed during backup');
      const receipt = RegistryBackupReceipt.assert({
        snapshotId: summary.snapshot_id,
        verifiedAt: new Date().toISOString(),
        registryId: source.registryId,
        storageId: source.storageId,
        registryPath: source.registryPath,
        journalPath: source.journalPath,
        journalRevision: source.journalRevision,
        journalSha256,
        censusSha256: source.censusSha256,
        bytes: summary.total_bytes_processed,
      });
      await verify(receipt, authority, 'snapshot');
      return receipt;
    },
    async restore(
      receipt: RegistryBackupReceipt,
      target: { registryPath: string; journalPath: string },
      resume: RegistryRecoveryPreparation | undefined,
      authority: Pick<RegistryMaintenanceSession, 'authorityDescriptor'>,
    ): Promise<void> {
      const execute = (arguments_: string[], slot: 'restore-registry' | 'restore-journal-target') =>
        run(arguments_, receipt.journalPath, authority, {
          slot,
          kind: 'restore',
          targetSha256: hash(JSON.stringify({ receipt, target })),
        });
      await verify(receipt, authority, 'restore');
      if (resume !== undefined) {
        const prepared = RegistryRecoveryPreparation.assert(resume);
        if (
          prepared.snapshotId !== receipt.snapshotId ||
          prepared.registryPath !== target.registryPath ||
          prepared.stagedJournalPath !== target.journalPath ||
          prepared.previousStorageId !== receipt.storageId ||
          prepared.previousRegistryPath !== receipt.registryPath
        )
          throw new Error('Restore resume differs from durable target ownership');
      }
      const paths = [target.registryPath, target.journalPath];
      for (const path of paths) {
        if (
          !isAbsolute(path) ||
          (await realpath(path)) !== path ||
          !(await lstat(path)).isDirectory() ||
          (resume === undefined && (await readdir(path)).length !== 0) ||
          [receipt.registryPath, receipt.journalPath].includes(path)
        )
          throw new Error('Recovery requires new empty canonical bounded contents targets');
      }
      if (paths[0] === paths[1])
        throw new Error('Recovery registry and journal targets must be independent');
      await execute(
        [
          'restore',
          `${receipt.snapshotId}:${receipt.registryPath}`,
          '--target',
          target.registryPath,
          '--verify',
        ],
        'restore-registry',
      );
      await execute(
        [
          'restore',
          `${receipt.snapshotId}:${receipt.journalPath}`,
          '--target',
          target.journalPath,
          '--verify',
        ],
        'restore-journal-target',
      );
      if (hash(await readFile(join(target.journalPath, 'journal.json'))) !== receipt.journalSha256)
        throw new Error('Restored journal differs from verified snapshot');
    },
  };
}

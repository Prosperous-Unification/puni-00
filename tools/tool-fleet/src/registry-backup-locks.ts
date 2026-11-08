import { createHash } from 'node:crypto';

import { type } from 'arktype';

import { RegistryBackupAttempt } from './registry-backup-attempt';
import { observeRegistryBackupStage } from './registry-backup-diagnostics';

const Key = type(/^locks\/[a-f0-9]{64}$/);
const VersionFields = type({ key: Key, versionId: '0 < string <= 1024', visible: 'boolean' });
const Version = VersionFields.merge({
  kind: "'object'",
  sha256: /^[a-f0-9]{64}$/,
  bytes: 'number.safe > 0',
  '+': 'reject',
}).or(VersionFields.merge({ kind: "'delete-marker'", '+': 'reject' }));
export type RegistryBackupLockVersion = typeof Version.infer;
const Uuid = type(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
/** Exact targeted-version receipt returned only after a complete reconciliation and terminal root cleanup. */
export const RegistryBackupLockRecovery = type({
  operationId: '0 < string <= 256',
  configurationSha256: /^[a-f0-9]{64}$/,
  attemptIds: Uuid.array().atLeastLength(1).atMostLength(32),
  removed: Version.array().atMostLength(128),
  censusSha256: /^[a-f0-9]{64}$/,
  '+': 'reject',
});
export type RegistryBackupLockRecovery = typeof RegistryBackupLockRecovery.infer;
/** Pre-effect reservation binds only current pending attempts; paths and version IDs come from the verified provider. */
export const RegistryBackupLockReservation = type({
  operationId: '0 < string <= 256',
  configurationSha256: /^[a-f0-9]{64}$/,
  attemptIds: Uuid.array().atLeastLength(1).atMostLength(32),
  journalRevision: 'number.safe > 0',
  '+': 'reject',
});
const Lock = type({
  time: 'string.date.iso',
  exclusive: 'boolean',
  hostname: '0 < string <= 256',
  username: 'string <= 256',
  pid: 'number.safe > 0',
  'uid?': 'number.safe >= 0',
  'gid?': 'number.safe >= 0',
  '+': 'reject',
});

/**
 * Task9 supplies complete raw visible AND historical lock versions and exact version deletion;
 * a restic list result is insufficient because it skips malformed filenames. Hash every object,
 * including noncurrent ones. Hidden objects/markers are history, not active locks. The fixed
 * read-only inspector may run only cat lock on this provider-observed full ID (ADR0077).
 * removeVersion must revalidate the observed exact version before targeting it; never key-delete.
 */
export interface RegistryBackupLockPorts {
  census(): Promise<RegistryBackupLockVersion[]>;
  inspect(observed: RegistryBackupLockVersion, censusSha256: string): Promise<string>;
  proveStopped(attempt: RegistryBackupAttempt, pid: number): Promise<void>;
  removeVersion(observed: RegistryBackupLockVersion): Promise<void>;
}

const identity = (version: RegistryBackupLockVersion) => `${version.key}:${version.versionId}`;
/** Complete version semantics use total lexical identity order. Locale collation can equate é and e\u0301, and property insertion order cannot identify a new census. */
function canonical(versions: RegistryBackupLockVersion[]): string {
  // Proof: both reordered collation-equivalent version IDs and reordered row fields broke the actual reconciler's unchanged-view bookends before this normalization.
  return JSON.stringify(
    [...versions]
      .sort((left, right) =>
        identity(left) < identity(right) ? -1 : identity(left) > identity(right) ? 1 : 0,
      )
      .map((version) =>
        version.kind === 'object'
          ? {
              key: version.key,
              versionId: version.versionId,
              kind: version.kind,
              sha256: version.sha256,
              bytes: version.bytes,
              visible: version.visible,
            }
          : {
              key: version.key,
              versionId: version.versionId,
              kind: version.kind,
              visible: version.visible,
            },
      ),
  );
}

function validate(input: unknown): RegistryBackupLockVersion[] {
  const versions = Version.array().atMostLength(65536).assert(input);
  if (Buffer.byteLength(JSON.stringify(versions)) > 64 * 1024 ** 2)
    throw new Error('Complete raw backup lock census exceeds configured bound');
  const identities = new Set<string>();
  const visible = new Set<string>();
  for (const version of versions) {
    // Proof: unknown names, wrong ciphertext hashes, duplicate visible/physical versions and missing versions all passed the RED stub.
    if (
      identities.has(identity(version)) ||
      (version.visible && visible.has(version.key)) ||
      (version.kind === 'object' && version.sha256 !== version.key.slice(6))
    )
      throw new Error('Ambiguous or corrupt backup lock version census');
    identities.add(identity(version));
    if (version.visible) visible.add(version.key);
  }
  // Proof: missing-latest reconciliation resolved before this completeness check; removing it reproduces the same acceptance.
  if (new Set(versions.map((version) => version.key)).size !== visible.size)
    throw new Error('Backup lock history lacks its exact visible latest version');
  return versions;
}

/**
 * Under the SAME held canonical authority, reconcile only durable interrupted attempts. Inspect
 * every visible lock and independently exclude its exact origin before the first deletion. Each
 * object name is its ciphertext SHA256: older versions of that name must hash to identical bytes,
 * so they cannot hide a different owner. Reinspect any exposed older version before continuing.
 * Preserve unrelated history/markers, detect any concurrent version/visibility change, and retain
 * the caller's recovery fence on every failure. Time alone never authorizes cleanup.
 */
export async function reconcileRegistryBackupLocks(
  attempts: RegistryBackupAttempt[],
  configurationSha256: string,
  ports: RegistryBackupLockPorts,
): Promise<RegistryBackupLockRecovery> {
  RegistryBackupAttempt.array().atMostLength(32).assert(attempts);
  if (
    !/^[a-f0-9]{64}$/.test(configurationSha256) ||
    attempts.length === 0 ||
    new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length ||
    attempts.some(
      (attempt) =>
        attempt.state !== 'prepared' ||
        attempt.configurationSha256 !== configurationSha256 ||
        attempt.operationId !== attempts[0]?.operationId,
    )
  )
    throw new Error('Missing exact interrupted backup attempt ownership');
  let versions = await observeRegistryBackupStage('raw-census', async () =>
    validate(await ports.census()),
  );
  const attemptIds = attempts.map((attempt) => attempt.id);
  const activeKeys = new Set(
    versions
      .filter((version) => version.visible && version.kind === 'object')
      .map((version) => version.key),
  );
  // Proof: 10,000 valid ordinary historical versions previously exhausted an empty mutation receipt.
  // Preserve/hash all unrelated history; reserve only exact versions this interrupted cleanup could remove.
  const potentialRemovals = versions.filter(
    (version) => activeKeys.has(version.key) && version.kind === 'object',
  );
  if (Buffer.byteLength(JSON.stringify({ attemptIds, removed: potentialRemovals })) > 12000)
    throw new Error('Backup lock recovery receipt exceeds bounded authority evidence');
  const removed: RegistryBackupLockVersion[] = [];
  for (;;) {
    const active = versions.filter((version) => version.visible && version.kind === 'object');
    for (const version of active) {
      const serialized = await observeRegistryBackupStage('ciphertext-inspection', () =>
        ports.inspect(version, createHash('sha256').update(canonical(versions)).digest('hex')),
      );
      if (Buffer.byteLength(serialized) > 4096)
        throw new Error('Backup lock inspection exceeds bound');
      const lock = await observeRegistryBackupStage('lock-schema', () =>
        Lock.assert(JSON.parse(serialized)),
      );
      const attempt = await observeRegistryBackupStage('lock-schema', () => {
        const attempt = attempts.find((attempt) => attempt.utsHostname === lock.hostname);
        // Proof: foreign owner, live origin, unreadable/malformed lock and configuration faults refuse without targeted deletion.
        if (
          attempt === undefined ||
          (lock.uid !== undefined && lock.uid !== 0) ||
          (lock.gid !== undefined && lock.gid !== 0)
        )
          throw new Error('Visible backup lock has no exact durable root owner');
        return attempt;
      });
      await observeRegistryBackupStage('origin-exclusion', () =>
        ports.proveStopped(attempt, lock.pid),
      );
    }
    const confirmed = await observeRegistryBackupStage('post-census', async () =>
      validate(await ports.census()),
    );
    await observeRegistryBackupStage('post-census', () => {
      if (canonical(confirmed) !== canonical(versions))
        throw new Error('Backup lock versions changed during read-only inspection');
    });
    const selected = active.at(0);
    if (selected === undefined) {
      // An attempt may have crashed before it created any lock; its guardian must still be independently absent.
      for (const attempt of attempts)
        await observeRegistryBackupStage('origin-exclusion', () =>
          ports.proveStopped(attempt, attempt.guardian.pid),
        );
      return RegistryBackupLockRecovery.assert({
        operationId: attempts[0]?.operationId,
        configurationSha256,
        attemptIds,
        removed,
        censusSha256: createHash('sha256').update(canonical(confirmed)).digest('hex'),
      });
    }
    await observeRegistryBackupStage('exact-removal', () => ports.removeVersion(selected));
    const after = await observeRegistryBackupStage('post-census', async () =>
      validate(await ports.census()),
    );
    const remaining = versions.filter((version) => identity(version) !== identity(selected));
    const observed = new Map(after.map((version) => [identity(version), version]));
    await observeRegistryBackupStage('post-census', () => {
      if (
        after.length !== remaining.length ||
        remaining.some((previous) => {
          const current = observed.get(identity(previous));
          return (
            current === undefined ||
            JSON.stringify({ ...current, visible: previous.visible }) !==
              JSON.stringify(previous) ||
            (current.visible !== previous.visible && current.key !== selected.key)
          );
        })
      )
        throw new Error('Backup lock version deletion changed unrelated evidence');
    });
    removed.push(selected);
    versions = after;
  }
}

/**
 * Before an effect, require a complete lock-free visible view and immutable repository ID.
 * Reconciliation alone may inspect config while existing locks are present: inspection is the
 * fixed read-only no-lock command, surrounded by complete unchanged raw version observations.
 */
export async function verifyRegistryBackupRepository(
  ports: Pick<RegistryBackupLockPorts, 'census'>,
  repositoryId: string,
  inspect: () => Promise<string>,
  purpose: 'effect' | 'reconciliation' = 'effect',
): Promise<void> {
  const before = await observeRegistryBackupStage('raw-census', async () =>
    validate(await ports.census()),
  );
  // Proof: visible-lock, replacement-repository and concurrent-census negatives resolved before this admission.
  if (
    purpose === 'effect' &&
    before.some((version) => version.visible && version.kind === 'object')
  )
    throw new Error('Visible backup locks require exact interrupted-attempt reconciliation');
  if (!/^[a-f0-9]{64}$/.test(repositoryId) || (await inspect()) !== repositoryId)
    throw new Error('Backup repository differs from immutable configured identity');
  const after = await observeRegistryBackupStage('post-census', async () =>
    validate(await ports.census()),
  );
  if (canonical(after) !== canonical(before))
    throw new Error('Backup repository lock census changed during identity inspection');
}

/** Require the current authority's pre-effect receipt reservation; generic phase advancement cannot authorize provider deletion. */
export function requireRegistryBackupLockReservation(
  reservation: typeof RegistryBackupLockReservation.infer | null | undefined,
  attempts: RegistryBackupAttempt[],
  operationId: string,
  configurationSha256: string,
  journalRevision: number,
): void {
  const pending = attempts.filter((attempt) => attempt.state === 'prepared');
  if (
    reservation === null ||
    reservation === undefined ||
    pending.length === 0 ||
    reservation.operationId !== operationId ||
    reservation.configurationSha256 !== configurationSha256 ||
    reservation.journalRevision !== journalRevision ||
    pending.some(
      (attempt) =>
        attempt.operationId !== operationId || attempt.configurationSha256 !== configurationSha256,
    ) ||
    JSON.stringify(reservation.attemptIds) !== JSON.stringify(pending.map((attempt) => attempt.id))
  )
    throw new Error('Backup lock reconciliation lacks current exact reserved ownership');
}

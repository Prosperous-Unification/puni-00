import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';
import { dlopen } from 'bun:ffi';

import {
  admitPublication,
  type ImageProtection,
  type PublicationReservation,
  type RegistryCapacity,
  type ReleaseBundle,
} from './registry-policy';

const Count = type('number.integer >= 0').narrow(Number.isSafeInteger);
const Positive = Count.narrow((count) => count > 0);
const Identity = type('0 < string <= 256');
const Token = type(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Digest = type(/^sha256:[0-9a-f]{64}$/);
const Timestamp = type('string').narrow(
  (stamp) => Number.isFinite(Date.parse(stamp)) && new Date(stamp).toISOString() === stamp,
);
const Path = Identity.narrow(isAbsolute);
const References = type({ repository: Identity, digest: Digest, '+': 'reject' })
  .array()
  .atLeastLength(1);
const Roots = Digest.array().atLeastLength(1);
const Envelope = type({ bytes: Count, inodes: Count, '+': 'reject' });
const Enrollment = type({
  registryId: Identity,
  storageId: Identity,
  owners: Identity.array().atLeastLength(1),
  registryPath: Path,
  rootPath: Path,
  maximumBytes: Positive,
  journalMaximumBytes: Positive,
  '+': 'reject',
});
const ownership = { operationId: Identity, owner: Identity, token: Token };
const images = { roots: Roots, references: References };
const Protection = type({ ...ownership, ...images, reason: Identity, '+': 'reject' });
const Bundle = type({
  operationId: Identity,
  owner: Identity,
  product: Identity,
  ...images,
  receipt: {
    state: "'promoted'|'completed'|'abandoned'|'unfinished'",
    at: Timestamp,
    '+': 'reject',
  },
  '+': 'reject',
});
const Publication = type({
  ...ownership,
  phase: "'uploading'|'failed'",
  'failure?': 'string <= 1024',
  '+': 'reject',
});
const Phase = type(
  "'acquired'|'reconciled'|'fenced'|'stopped'|'backed-up'|'deleting'|'collected'|'verified'|'restored'|'completed'",
);
const Maintenance = type({
  ...ownership,
  kind: "'backup'|'retirement'|'restore'",
  phase: Phase.or("'failed'"),
  resumePhase: Phase,
  'failure?': 'string <= 1024',
  '+': 'reject',
});
const Reservation = type({ operationId: Identity, bytes: Count, inodes: Count, '+': 'reject' });
const Journal = type({
  schemaVersion: '1',
  enrollment: Enrollment,
  revision: Count,
  updatedAt: Timestamp,
  fenced: 'boolean',
  protections: Protection.array(),
  bundles: Bundle.array(),
  reservations: Reservation.array(),
  publication: Publication.or('null'),
  maintenance: Maintenance.or('null'),
  closedOperations: Identity.array(),
  '+': 'reject',
});
const mutation = { expectedRevision: Count, operationId: Identity, owner: Identity };
const existing = { ...mutation, token: Token };
const Command = type.or(
  { command: "'initialize'", enrollment: Enrollment, '+': 'reject' },
  { command: "'read'", '+': 'reject' },
  { command: "'acquire-protection'", ...mutation, ...images, reason: Identity, '+': 'reject' },
  { command: "'release-protection'", ...existing, reconciled: 'true', '+': 'reject' },
  {
    command: "'reserve-publication'",
    ...mutation,
    ...images,
    product: Identity,
    envelope: Envelope,
    '+': 'reject',
  },
  {
    command: "'finish-publication'",
    ...existing,
    outcome: "'completed'|'promoted'|'abandoned'|'failed'",
    reconciled: 'boolean',
    'failure?': 'string <= 1024',
    '+': 'reject',
  },
  {
    command: "'begin-maintenance'",
    ...mutation,
    kind: "'backup'|'retirement'|'restore'",
    '+': 'reject',
  },
  {
    command: "'advance-maintenance'",
    ...existing,
    phase: Phase.or("'failed'"),
    'failure?': 'string <= 1024',
    '+': 'reject',
  },
  { command: "'recover-maintenance'", ...existing, '+': 'reject' },
);
const JournalCapacity = type({
  usableBytes: Positive,
  allocationUnitBytes: Positive,
  usedBytes: Count,
  totalInodes: Positive,
  usedInodes: Count,
  '+': 'reject',
});

/**
 * Trusted enrollment pins identity and explicit limits; deployment defaults are 50 GiB registry and
 * 1 GiB journal. `journalMaximumBytes` caps the whole capacity domain reported by
 * {@link RegistryJournalPorts.measureJournal}, not one file or directory, so unrelated occupants of
 * that domain count against it. The 1 GiB default expects a dedicated bounded journal filesystem
 * or a future independently verified quota adapter. Enrolling a shared filesystem's whole size is
 * an ordinary smoke-test configuration, never proof of physical isolation; mount, quota and
 * isolation verification are outside this foundation.
 */
export type RegistryEnrollment = typeof Enrollment.infer;
/** Explicit CLI commands carry server-minted operation tokens, never a caller-supplied lock bypass. */
export type RegistryCommand = typeof Command.infer;
/**
 * Complete identity includes exact repository/digest references without pretending to be a live
 * content census. `fenced` is a deliberately sticky write fence, stricter than admission:
 * begin-maintenance, failed maintenance and failed publication receipts set it, and finishing a
 * failed publication as abandoned leaves it set. Only maintenance completion reevaluates it,
 * reopening writes strictly below 70% of effective bytes and of inodes with at least 20 GiB host
 * reserve; exact 70% or a lower reserve stays fenced. Admission up to 90% never clears it, and a
 * backup cannot reduce usage, so integrators above 70% need retirement or external relief first.
 */
export type RegistryJournal = typeof Journal.infer;
export interface RegistryCommandResponse {
  readonly state: RegistryJournal;
  readonly token?: string;
}
/**
 * Measurement adapters run inside the authority; client request capacity claims are rejected.
 * `measureJournal` reports the entire capacity domain containing the journal directory (the whole
 * filesystem for the statfs CLI adapter), and every replacement is admitted against its usage.
 */
export interface RegistryJournalPorts {
  measureJournal: (enrollment: RegistryEnrollment) => Promise<typeof JournalCapacity.infer>;
  measureRegistry: (enrollment: RegistryEnrollment) => Promise<RegistryCapacity>;
  now?: () => string;
  sync?: (descriptor: FileHandle) => Promise<void>;
}

const maximumRequestBytes = 64 * 1024;
const maximumJournalBytes = 16 * 1024 * 1024;
const failureHeadroom = 64 * 1024;

function requireSchema<T>(
  schema: (input: unknown) => T | type.errors,
  input: unknown,
  boundary: string,
): T {
  const parsed = schema(input);
  // Proof: corrupt-state and malformed-command negatives fail when schema validation is bypassed.
  if (parsed instanceof type.errors) throw new Error(`Malformed ${boundary}: ${parsed.summary}`);
  return parsed;
}

async function requireDirectory(directory: string): Promise<void> {
  const status = await lstat(directory);
  // Proof: public-directory command negative fails when directory ownership/mode checks are removed.
  if (!status.isDirectory() || status.uid !== process.getuid?.() || (status.mode & 0o777) !== 0o700)
    throw new Error('Registry journal directory must be owner-only and owned by the current user');
}

async function requireFile(descriptor: FileHandle): Promise<number> {
  const status = await descriptor.stat();
  // Proof: unreadable-state, public-file and symlink command negatives exercise this descriptor boundary.
  if (!status.isFile() || status.uid !== process.getuid?.() || (status.mode & 0o777) !== 0o600)
    throw new Error(
      'Registry journal must be an owner-only regular file owned by the current user',
    );
  return status.size;
}

async function readJournal(path: string): Promise<RegistryJournal> {
  // Proof: missing-state throws ENOENT; removing NOFOLLOW lets the symlink command negative proceed.
  const descriptor = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const size = await requireFile(descriptor);
    // Proof: oversized valid JSON state failed bounds-valid-oversized-command-and-journal-inputs with this bound removed.
    if (size > maximumJournalBytes) throw new Error('Registry journal exceeds read bound');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await descriptor.readFile('utf8'));
    } catch (cause) {
      throw new Error('Malformed registry journal JSON', { cause });
    }
    const journal = requireSchema(Journal, parsed, 'registry journal');
    // Proof: removing read-time invariants failed malformed-trusted-ownership on the read command.
    requireConsistentState(journal);
    return journal;
  } finally {
    await descriptor.close();
  }
}

function requireUnique(identities: readonly string[], boundary: string): void {
  // Proof: duplicate-root and malformed-trusted-ownership negatives fail when uniqueness is bypassed.
  if (new Set(identities).size !== identities.length) throw new Error(`Duplicate ${boundary}`);
}

function requireImages(roots: readonly string[], references: readonly { digest: string }[]): void {
  requireUnique(roots, 'image root');
  // Proof: mismatched-root command negative fails when repository/root agreement is bypassed.
  if (
    roots.some((root) => !references.some((reference) => reference.digest === root)) ||
    references.some((reference) => !roots.includes(reference.digest))
  )
    throw new Error('Image roots and exact repository references disagree');
}

function requireConsistentState(journal: RegistryJournal): void {
  requireUnique(journal.enrollment.owners, 'enrolled owner');
  requireUnique(
    journal.bundles.map((bundle) => bundle.operationId),
    'bundle operation',
  );
  const operations = [
    ...journal.protections,
    ...journal.bundles,
    ...(journal.maintenance === null ? [] : [journal.maintenance]),
    ...journal.closedOperations.map((operationId) => ({ operationId })),
  ];
  requireUnique(
    operations.map((operation) => operation.operationId),
    'operation identity',
  );
  for (const protectedImages of journal.protections)
    requireImages(protectedImages.roots, protectedImages.references);
  for (const bundle of journal.bundles) requireImages(bundle.roots, bundle.references);
  for (const owner of [
    ...journal.bundles,
    ...journal.protections,
    ...(journal.publication === null ? [] : [journal.publication]),
    ...(journal.maintenance === null ? [] : [journal.maintenance]),
  ]) {
    if (!journal.enrollment.owners.includes(owner.owner))
      throw new Error('Unenrolled journal owner');
  }
  if (journal.publication === null) {
    if (
      journal.reservations.length !== 0 ||
      journal.bundles.some((bundle) => bundle.receipt.state === 'unfinished')
    )
      throw new Error('Unowned publication reservation');
  } else if (
    journal.reservations.length !== 1 ||
    journal.reservations[0]?.operationId !== journal.publication.operationId ||
    !journal.bundles.some(
      (bundle) =>
        bundle.operationId === journal.publication?.operationId &&
        bundle.receipt.state === 'unfinished',
    )
  )
    throw new Error('Incomplete publication ownership');
  if (journal.maintenance !== null && journal.publication !== null)
    throw new Error('Overlapping durable operation owners');
  if (journal.maintenance !== null) requireMaintenancePhase(journal.maintenance);
  if ((journal.maintenance !== null || journal.publication?.phase === 'failed') && !journal.fenced)
    throw new Error('Unfenced recovery operation');
}

async function syncDirectory(directory: string, ports: RegistryJournalPorts): Promise<void> {
  const descriptor = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await (ports.sync ?? ((file: FileHandle) => file.sync()))(descriptor);
  } finally {
    await descriptor.close();
  }
}

async function listReplacements(directory: string): Promise<string[]> {
  const replacements: string[] = [];
  for (const name of await readdir(directory)) {
    if (name === 'journal.json' || !name.startsWith('journal.')) continue;
    // Proof: unsafe-replacement name negative refuses an operator file instead of deleting it.
    if (!name.endsWith('.json') || Token(name.slice(8, -5)) instanceof type.errors)
      throw new Error('Unrecognized registry journal replacement name');
    replacements.push(join(directory, name));
  }
  return replacements;
}

async function requireReplacement(path: string): Promise<void> {
  const status = await lstat(path);
  // Proof: unsafe-replacement FIFO/mode/hardlink and injected foreign-UID negatives fail when each guard is removed.
  if (
    !status.isFile() ||
    status.uid !== process.getuid?.() ||
    (status.mode & 0o777) !== 0o600 ||
    status.nlink !== 1
  )
    throw new Error(
      'Registry journal replacement must be a single owner-only regular file owned by the current user',
    );
}

async function reconcileReplacements(
  directory: string,
  ports: RegistryJournalPorts,
): Promise<void> {
  const replacements = await listReplacements(directory);
  // Validate the entire set before deleting anything. The owner-only directory and held kernel
  // lock exclude supported concurrent writers; paths are never followed and canonical state is excluded.
  for (const path of replacements) await requireReplacement(path);
  // Proof: removing orphan unlink failed the crashed-pre-rename replacement recovery command.
  for (const path of replacements) await unlink(path);
  if (replacements.length > 0) await syncDirectory(directory, ports);
}

async function withLock<T>(directory: string, run: () => Promise<T>): Promise<T> {
  await requireDirectory(directory);
  if (process.platform !== 'linux' && process.platform !== 'darwin')
    throw new Error('Registry flock unsupported on this platform');
  const library = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', {
    flock: { args: ['i32', 'i32'], returns: 'i32' },
  });
  // CLOEXEC prevents an unrelated child inheriting authority. The lock inode is never unlinked.
  const descriptor = await open(
    join(directory, 'authority.lock'),
    constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    0o600,
  );
  try {
    await requireFile(descriptor);
    // Proof: interprocess lock holder negative fails when this kernel lock call is bypassed.
    if (library.symbols.flock(descriptor.fd, 2 | 4) !== 0)
      throw new Error('Registry operation authority is busy');
    return await run();
  } finally {
    await descriptor.close();
    library.close();
  }
}

async function persistJournal(
  directory: string,
  journal: RegistryJournal,
  ports: RegistryJournalPorts,
  recovery: boolean,
  initialize: boolean,
): Promise<void> {
  const serialized = `${JSON.stringify(journal)}\n`;
  const replacementBytes = Buffer.byteLength(serialized);
  // Proof: near-limit journal admission failed reserves-failure-growth when this growth reserve was removed.
  if (replacementBytes + (recovery ? 0 : failureHeadroom) > maximumJournalBytes)
    throw new Error('Registry journal exceeds write bound');
  const measured = requireSchema(
    JournalCapacity,
    await ports.measureJournal(journal.enrollment),
    'journal measurement',
  );
  // Deliberate: measured usage covers the whole capacity domain (the whole filesystem for the CLI),
  // so unrelated occupants count against journalMaximumBytes; see RegistryEnrollment.
  const budget = Math.min(journal.enrollment.journalMaximumBytes, measured.usableBytes);
  // Both old and replacement files coexist. Ordinary admission additionally reserves a complete
  // future replacement plus bounded failure growth, so an admitted failure can be persisted.
  const allocation = BigInt(measured.allocationUnitBytes);
  const replacementAllocation =
    ((BigInt(replacementBytes) + allocation - 1n) / allocation) * allocation;
  const neededBytes =
    BigInt(measured.usedBytes) +
    replacementAllocation +
    (recovery ? 0n : replacementAllocation + BigInt(failureHeadroom) + allocation);
  const neededInodes = BigInt(measured.usedInodes) + (recovery ? 1n : 3n);
  // Proof: full-journal replacement negative fails if admission ignores replacement/headroom bytes.
  if (
    neededBytes * (recovery ? 1n : 10n) >= BigInt(budget) * (recovery ? 1n : 9n) ||
    neededInodes * (recovery ? 1n : 10n) >= BigInt(measured.totalInodes) * (recovery ? 1n : 9n)
  )
    throw new Error('Insufficient journal capacity for durable replacement and failure receipt');
  const path = join(directory, 'journal.json');
  const replacement = initialize ? path : join(directory, `journal.${randomUUID()}.json`);
  const descriptor = await open(
    replacement,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  const sync = ports.sync ?? ((file: FileHandle) => file.sync());
  let isPublished = initialize;
  try {
    try {
      await descriptor.writeFile(serialized, 'utf8');
      // Proof: injected fsync failure prevents success and preserves canonical state.
      await sync(descriptor);
    } finally {
      await descriptor.close();
    }
    if (!initialize) {
      await rename(replacement, path);
      isPublished = true;
    }
    // Proof: removing directory sync failed propagates-failed-file-and-directory-fsync.
    await syncDirectory(directory, ports);
  } catch (cause) {
    if (!isPublished) {
      try {
        await requireReplacement(replacement);
        // Proof: removing failed-write unlink failed repeated-fsync-failure file assertions.
        await unlink(replacement);
        await syncDirectory(directory, ports);
      } catch (cleanupFailure) {
        // Proof: real unlink EACCES is preserved with the primary failure; dropping it fails cleanup-failure propagation.
        throw new AggregateError(
          [cause, cleanupFailure],
          'Registry journal write and replacement cleanup failed',
          { cause: cleanupFailure },
        );
      }
    }
    throw cause;
  }
}

function requireOwnership(
  owned: { operationId: string; owner: string; token: string } | null | undefined,
  request: { operationId: string; owner: string; token: string },
): asserts owned is { operationId: string; owner: string; token: string } {
  // Proof: stale-token and foreign-owner command negatives fail when the respective equality is removed.
  if (
    owned?.operationId !== request.operationId ||
    owned.owner !== request.owner ||
    owned.token !== request.token
  )
    throw new Error('Stale operation token or foreign owner');
}

function requireNewOperation(journal: RegistryJournal, operationId: string): void {
  if (
    [
      ...journal.protections,
      ...journal.bundles,
      ...(journal.maintenance === null ? [] : [journal.maintenance]),
    ].some((operation) => operation.operationId === operationId) ||
    journal.closedOperations.includes(operationId)
  )
    throw new Error('Operation identity already exists');
}

function maintenancePhases(kind: 'backup' | 'retirement' | 'restore'): readonly string[] {
  return kind === 'retirement'
    ? [
        'acquired',
        'reconciled',
        'fenced',
        'stopped',
        'backed-up',
        'deleting',
        'collected',
        'verified',
        'restored',
        'completed',
      ]
    : [
        'acquired',
        'reconciled',
        'fenced',
        'stopped',
        'backed-up',
        'verified',
        'restored',
        'completed',
      ];
}

function requireMaintenancePhase(maintenance: NonNullable<RegistryJournal['maintenance']>): void {
  const phases = maintenancePhases(maintenance.kind).slice(0, -1);
  // Proof: corrupted active/failed maintenance command negatives fail when resume reachability is bypassed.
  if (
    !phases.includes(maintenance.resumePhase) ||
    (maintenance.phase === 'failed'
      ? maintenance.failure === undefined || maintenance.failure.length === 0
      : maintenance.phase !== maintenance.resumePhase)
  )
    throw new Error('Invalid trusted maintenance phase and resume phase combination');
}

async function mutateJournal(
  journal: RegistryJournal,
  request: Exclude<RegistryCommand, { command: 'read' | 'initialize' }>,
  ports: RegistryJournalPorts,
): Promise<string | undefined> {
  // Proof: stale-revision command negative fails when this comparison is removed.
  if (request.expectedRevision !== journal.revision) throw new Error('Stale journal revision');
  if (!journal.enrollment.owners.includes(request.owner))
    throw new Error('Unenrolled operation owner');
  const maintenanceCommand =
    request.command === 'advance-maintenance' || request.command === 'recover-maintenance';
  // Proof: maintenance exclusion negative refuses reference changes before any consumer can proceed.
  if (journal.maintenance !== null && !maintenanceCommand)
    throw new Error('Registry maintenance owns the authority');
  const isNew =
    request.command === 'acquire-protection' ||
    request.command === 'reserve-publication' ||
    request.command === 'begin-maintenance';
  if (isNew) requireNewOperation(journal, request.operationId);
  switch (request.command) {
    case 'acquire-protection': {
      requireImages(request.roots, request.references);
      const protection: ImageProtection = {
        owner: request.owner,
        reason: request.reason,
        roots: request.roots,
      };
      const token = randomUUID();
      journal.protections.push({
        ...protection,
        operationId: request.operationId,
        references: request.references,
        token,
      });
      return token;
    }
    case 'release-protection': {
      const index = journal.protections.findIndex(
        (protection) => protection.operationId === request.operationId,
      );
      requireOwnership(journal.protections[index], request);
      journal.protections.splice(index, 1);
      journal.closedOperations.push(request.operationId);
      return undefined;
    }
    case 'reserve-publication': {
      // Deliberate: the sticky fence outranks admission, which alone grants no write authority.
      // Proof: R05 bypassed this guard; `maintenance completion stays fenced at exact seventy
      // percent use or low host reserve` failed with the explicit refusal assertion.
      if (journal.fenced) throw new Error('Registry writes are fenced');
      requireImages(request.roots, request.references);
      const admission = admitPublication({
        capacity: await ports.measureRegistry(journal.enrollment),
        reservations: journal.reservations,
        envelope: request.envelope,
      });
      if (admission.status === 'refused')
        throw new Error(`Publication refused: ${admission.reasons.join(', ')}`);
      const token = randomUUID();
      const reservation: PublicationReservation = {
        operationId: request.operationId,
        ...request.envelope,
      };
      journal.reservations.push(reservation);
      const bundle: ReleaseBundle = {
        operationId: request.operationId,
        product: request.product,
        roots: request.roots,
        receipt: { state: 'unfinished', at: journal.updatedAt },
      };
      journal.bundles.push({ ...bundle, owner: request.owner, references: request.references });
      journal.publication = {
        operationId: request.operationId,
        owner: request.owner,
        token,
        phase: 'uploading',
      };
      return token;
    }
    case 'finish-publication': {
      requireOwnership(journal.publication, request);
      const publication = journal.publication;
      if (request.outcome === 'failed') {
        if (request.failure === undefined || request.failure.length === 0)
          throw new Error('Failure receipt is required');
        publication.phase = 'failed';
        publication.failure = request.failure;
        // Deliberate sticky fence: finishing this failed publication as abandoned leaves it set
        // until maintenance completes below the recovery threshold.
        // Proof: R06 cleared this fence on abandonment; `failed publication fence survives
        // abandonment until maintenance completes` failed on its fence-state assertion.
        journal.fenced = true;
        return undefined;
      }
      // Proof: removing reconciliation failed rejects-invalid-journal-measurements before completion.
      if (!request.reconciled) throw new Error('Publication uploads must be reconciled');
      const bundle = journal.bundles.find(
        (candidate) => candidate.operationId === request.operationId,
      );
      if (bundle === undefined) throw new Error('Missing publication bundle');
      bundle.receipt = { state: request.outcome, at: journal.updatedAt };
      journal.reservations = [];
      journal.publication = null;
      return undefined;
    }
    case 'begin-maintenance': {
      if (journal.publication !== null)
        throw new Error('Unresolved publication owns the authority');
      const token = randomUUID();
      journal.maintenance = {
        operationId: request.operationId,
        owner: request.owner,
        token,
        kind: request.kind,
        phase: 'acquired',
        resumePhase: 'acquired',
      };
      journal.fenced = true;
      return token;
    }
    case 'recover-maintenance': {
      requireOwnership(journal.maintenance, request);
      const maintenance = journal.maintenance;
      maintenance.token = randomUUID();
      maintenance.phase = maintenance.resumePhase;
      delete maintenance.failure;
      return maintenance.token;
    }
    case 'advance-maintenance': {
      requireOwnership(journal.maintenance, request);
      const maintenance = journal.maintenance;
      if (maintenance.phase === 'failed') throw new Error('Maintenance requires recovery');
      if (request.phase === 'failed') {
        if (request.failure === undefined || request.failure.length === 0)
          throw new Error('Failure receipt is required');
        maintenance.resumePhase = maintenance.phase;
        maintenance.phase = 'failed';
        maintenance.failure = request.failure;
        journal.fenced = true;
        return undefined;
      }
      const phases = maintenancePhases(maintenance.kind);
      // Proof: removing sequence validation failed recovers-crashed-maintenance at the skipped verification.
      if (phases[phases.indexOf(maintenance.phase) + 1] !== request.phase)
        throw new Error('Invalid maintenance phase transition');
      maintenance.phase = request.phase;
      maintenance.resumePhase = request.phase;
      if (request.phase === 'completed') {
        // Reuse admission validation at this IO boundary before evaluating the stricter recovery threshold.
        // Deliberate: reopening requires bytes and inodes strictly below 70% plus the 20 GiB host
        // reserve; admission's 90% cutoff alone grants no reopening authority.
        // Proof: R01/R02 weakened exact-70% comparisons and R03 omitted host reserve;
        // `maintenance completion stays fenced at exact seventy percent use or low host reserve`
        // failed. R04 forced fencing; `maintenance completion reopens strictly below seventy
        // percent with adequate host reserve` failed on its reopening assertion.
        const capacity = await ports.measureRegistry(journal.enrollment);
        admitPublication({ capacity, reservations: [], envelope: { bytes: 0, inodes: 0 } });
        journal.fenced =
          BigInt(capacity.usedBytes) * 10n >=
            BigInt(Math.min(capacity.maximumBytes, capacity.usableBytes)) * 7n ||
          BigInt(capacity.usedInodes) * 10n >= BigInt(capacity.totalInodes) * 7n ||
          capacity.rootFreeBytes < 20 * 1024 ** 3;
        journal.closedOperations.push(request.operationId);
        journal.maintenance = null;
      }
      return undefined;
    }
  }
}

/**
 * Run one explicit local command under an owner-only kernel flock, then atomically fsync
 * state before acknowledging. The current UID and owner-controlled directory are the trust boundary.
 * Transport authentication belongs to the invoking operator. Reconciliation and maintenance
 * phases are trusted caller assertions; this module does not verify external physical effects.
 * Missing trusted state throws; only explicit enrollment initializes. Long work retains durable
 * owner/token records, and neither timeouts nor failed receipts release unresolved obligations.
 * Recovery uses admission-reserved replacement headroom. Callers must not start external work
 * until this function succeeds, and must reconcile state after any lost acknowledgement.
 * Valid canonical state authorizes reclaiming owned replacement orphans under the same lock;
 * initialization preserves preexisting replacement evidence instead of adopting or deleting it.
 * Only maintenance completion below the recovery threshold clears the sticky write fence; see
 * {@link RegistryJournal}.
 */
export async function executeRegistryCommand(
  directory: string,
  input: unknown,
  ports: RegistryJournalPorts,
): Promise<RegistryCommandResponse> {
  const encoded = JSON.stringify(input);
  // Proof: oversized valid publication failed bounds-valid-oversized-command-and-journal-inputs with this bound removed.
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > maximumRequestBytes)
    throw new Error('Registry request exceeds read bound');
  const request = requireSchema(Command, input, 'registry command');
  return withLock(directory, async () => {
    if (request.command === 'initialize') {
      // Proof: initialize-with-orphan negative preserves the only possible recovery copy.
      if ((await listReplacements(directory)).length > 0)
        throw new Error(
          'Registry journal replacements require canonical-state recovery before initialize',
        );
      requireUnique(request.enrollment.owners, 'enrolled owner');
      const state = requireSchema(
        Journal,
        {
          schemaVersion: 1,
          enrollment: request.enrollment,
          revision: 0,
          updatedAt: (ports.now ?? (() => new Date().toISOString()))(),
          fenced: false,
          protections: [],
          bundles: [],
          reservations: [],
          publication: null,
          maintenance: null,
          closedOperations: [],
        },
        'initial registry journal',
      );
      await persistJournal(directory, state, ports, false, true);
      return { state };
    }
    const state = await readJournal(join(directory, 'journal.json'));
    await reconcileReplacements(directory, ports);
    if (request.command === 'read') return { state };
    const at = requireSchema(
      Timestamp,
      (ports.now ?? (() => new Date().toISOString()))(),
      'server receipt time',
    );
    // Proof: removing this predicate failed all three chronology reversal commands; lexical ordering failed expanded/negative reversal and advancement commands.
    if (Date.parse(at) < Date.parse(state.updatedAt))
      throw new Error('Server receipt clock moved backwards');
    state.updatedAt = at;
    const token = await mutateJournal(state, request, ports);
    // Proof: exhausted-revision command negative fails if unsafe revisions can be persisted.
    if (!Number.isSafeInteger(state.revision + 1)) throw new Error('Journal revision exhausted');
    state.revision += 1;
    requireConsistentState(state);
    const recovery =
      request.command === 'finish-publication' ||
      request.command === 'advance-maintenance' ||
      request.command === 'recover-maintenance' ||
      request.command === 'release-protection';
    await persistJournal(directory, state, ports, recovery, false);
    return token === undefined ? { state } : { state, token };
  });
}

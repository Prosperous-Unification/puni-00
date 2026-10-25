import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { type FileHandle, lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';
import { dlopen } from 'bun:ffi';

import type { RegistryWritePermit } from './registry-capacity';
import { registryHistorySha256 } from './registry-history';
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
const journalShape = {
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
} as const;
const LegacyJournal = type({ ...journalShape, schemaVersion: '1' });
const Measurement = type({
  at: Timestamp,
  maximumBytes: Positive,
  usableBytes: Positive,
  usedBytes: Count,
  totalInodes: Positive,
  usedInodes: Count,
  rootFreeBytes: Count,
  '+': 'reject',
});
const VersionTwoJournal = type({
  ...journalShape,
  schemaVersion: '2',
  fenceReason: Identity.or('null'),
  maintenanceVerified: 'boolean',
  measurement: Measurement.or('null'),
});
export const EnvironmentHistory = type.or(
  { state: "'first-install'", at: Timestamp, '+': 'reject' },
  {
    state: "'successful'",
    complete: 'true',
    releases: Identity.array().atLeastLength(1),
    '+': 'reject',
  },
);
const Environment = type({
  environment: Identity,
  owner: Identity,
  product: Identity,
  protectionId: Identity,
  enrolledAt: Timestamp,
  genesisAt: Timestamp.or('null'),
  retiredAt: Timestamp.or('null'),
  releases: Identity.array(),
  '+': 'reject',
});
const Consumer = type({
  id: Identity,
  owner: Identity,
  environment: Identity.or('null'),
  kind: "'flux'|'kubernetes'|'compose'|'solver'|'recovery'|'private-product'|'docker-host'",
  source: Path,
  configurationSha256: /^[0-9a-f]{64}$/,
  role: "'consumer'|'history'",
  'hostSourceId?': Identity,
  '+': 'reject',
}).narrow((source) =>
  source.kind === 'docker-host'
    ? source.environment === null && source.role === 'consumer' && source.hostSourceId === undefined
    : source.environment !== null &&
      (source.kind === 'compose' && source.role === 'consumer'
        ? source.hostSourceId !== undefined
        : source.hostSourceId === undefined),
);
const ConsumerReport = type({
  id: Identity,
  source: Path,
  revision: Count,
  sourceRevision: Identity,
  role: "'consumer'|'history'",
  'history?': EnvironmentHistory,
  'historySha256?': /^[a-f0-9]{64}$/,
  references: type({ repository: Identity, digest: Digest, '+': 'reject' }).array(),
  'currentReferences?': type({ repository: Identity, digest: Digest, '+': 'reject' }).array(),
  '+': 'reject',
});
/** Explicit trusted adapter registration; the source points to its installed reader configuration. */
export type RegistryConsumer = typeof Consumer.infer;
export type RegistryConsumerReport = typeof ConsumerReport.infer;
const DeploymentPhase = type("'protected'|'promoted'|'recovery-required'|'reconciled'");
const Deployment = type({
  ...ownership,
  environment: Identity,
  candidate: Identity,
  current: Identity.or('null'),
  recovers: Identity.or('null'),
  reconciledBy: Identity.or('null'),
  inventory: ConsumerReport.array(),
  references: References,
  phase: DeploymentPhase,
  events: type({ phase: DeploymentPhase, at: Timestamp, '+': 'reject' }).array().atLeastLength(1),
  startedAt: Timestamp,
  finishedAt: Timestamp.or('null'),
  '+': 'reject',
});
const Journal = type({
  ...journalShape,
  schemaVersion: '3',
  fenceReason: Identity.or('null'),
  maintenanceVerified: 'boolean',
  measurement: Measurement.or('null'),
  environments: Environment.array(),
  consumers: Consumer.array(),
  deployments: Deployment.array(),
});
const mutation = { expectedRevision: Count, operationId: Identity, owner: Identity };
const existing = { ...mutation, token: Token };
const Command = type.or(
  { command: "'initialize'", enrollment: Enrollment, '+': 'reject' },
  { command: "'read'", '+': 'reject' },
  { command: "'upgrade'", '+': 'reject' },
  { command: "'check-capacity'", '+': 'reject' },
  { command: "'reopen'", ...mutation, '+': 'reject' },
  {
    command: "'enroll-consumers'",
    ...mutation,
    sources: Consumer.array().atLeastLength(1),
    '+': 'reject',
  },
  { command: "'retire-environment'", ...mutation, environment: Identity, '+': 'reject' },
  {
    command: "'enroll-environment'",
    ...mutation,
    environment: Identity,
    product: Identity,
    history: EnvironmentHistory,
    '+': 'reject',
  },
  {
    command: "'begin-deployment'",
    ...mutation,
    environment: Identity,
    candidate: Identity,
    current: Identity.or('null'),
    'recovers?': Identity,
    '+': 'reject',
  },
  {
    command: "'finish-deployment'",
    ...existing,
    outcome: "'promoted'|'recovery-required'|'reconciled'",
    reconciled: 'boolean',
    '+': 'reject',
  },
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
    // Proof: restoring promoted admits raw schema3 stdin beyond the publication-only boundary.
    outcome: "'completed'|'abandoned'|'failed'",
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

/** Trusted enrollment pins identity and explicit limits; deployment defaults are 50 GiB registry and 1 GiB journal. */
export type RegistryEnrollment = typeof Enrollment.infer;
/** Commands are sent on SSH stdin; tokens are server-minted operation capabilities, never CLI flags. */
export type RegistryCommand = typeof Command.infer;
/** Complete identity includes exact repository/digest references without pretending to be a live content census. */
export type RegistryJournal = typeof Journal.infer;
export interface RegistryCommandResponse {
  readonly state: RegistryJournal;
  readonly token?: string;
}
/** Validate the authenticated authority response before a publisher uses its capability or receipt. */
export function parseRegistryCommandResponse(input: unknown): RegistryCommandResponse {
  // Proof: removing response field validation admitted a string revision and a malformed capability.
  const response = type({ state: Journal, 'token?': Token, '+': 'reject' })(input);
  if (response instanceof type.errors) throw new Error('Malformed registry authority response');
  requireConsistentState(response.state);
  return response;
}
/** Measurement adapters run inside the authority; client request capacity claims are rejected. */
export interface RegistryJournalPorts {
  measureJournal: (enrollment: RegistryEnrollment) => Promise<typeof JournalCapacity.infer>;
  measureRegistry: (enrollment: RegistryEnrollment) => Promise<RegistryCapacity>;
  /** Verify every exact image and its complete content before reference protection is acknowledged. */
  verifyImages?: (
    enrollment: RegistryEnrollment,
    references: readonly { repository: string; digest: string }[],
  ) => Promise<void>;
  verifyConsumers?: (sources: readonly RegistryConsumer[], registryId: string) => Promise<void>;
  collectConsumers?: (
    sources: readonly RegistryConsumer[],
    revision: number,
    enrollment: RegistryEnrollment,
  ) => Promise<unknown>;
  now?: () => string;
  sync?: (descriptor: FileHandle) => Promise<void>;
  permit?: RegistryWritePermit;
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

async function readJournal(path: string, upgrade = false): Promise<RegistryJournal> {
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
    // Proof: legacy state is refused by read and admitted only by the explicit fenced upgrade test.
    if (upgrade) {
      const legacy = requireSchema(
        type.or(LegacyJournal, VersionTwoJournal),
        parsed,
        'legacy registry journal',
      );
      const upgraded = {
        ...legacy,
        schemaVersion: 3,
        fenceReason:
          'fenceReason' in legacy ? legacy.fenceReason : legacy.fenced ? 'legacy-recovery' : null,
        maintenanceVerified: 'maintenanceVerified' in legacy ? legacy.maintenanceVerified : false,
        measurement: 'measurement' in legacy ? legacy.measurement : null,
        environments: [],
        consumers: [],
        deployments: [],
      };
      requireConsistentState(requireSchema(Journal, upgraded, 'legacy journal invariants'));
      parsed = {
        ...upgraded,
        fenced: true,
        fenceReason: 'explicit-upgrade',
        maintenanceVerified: false,
      };
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
  if (
    (!journal.fenced && journal.fenceReason !== null) ||
    (journal.fenced && journal.fenceReason === null)
  )
    throw new Error('Inconsistent fence reason');
  requireUnique(
    journal.environments.map((environment) => environment.environment),
    'environment',
  );
  requireUnique(
    journal.deployments.map((deployment) => deployment.operationId),
    'deployment',
  );
  for (const environment of journal.environments) {
    requireUnique(environment.releases, 'environment release');
    if (environment.releases.length === 0 && environment.genesisAt === null)
      throw new Error('Invalid deployment environment first-install genesis');
    if (!journal.enrollment.owners.includes(environment.owner))
      throw new Error('Unenrolled environment owner');
    for (const operationId of environment.releases)
      requireBundle(journal, operationId, environment.product);
    const expected = uniqueReferences(
      environment.releases
        .slice(0, 3)
        .flatMap(
          (operationId) => requireBundle(journal, operationId, environment.product).references,
        ),
    );
    const protectedEnvironment = journal.protections.find(
      (protection) => protection.operationId === environment.protectionId,
    );
    if (
      environment.retiredAt === null &&
      expected.length > 0 &&
      (protectedEnvironment?.owner !== environment.owner ||
        !matchReferences(protectedEnvironment.references, expected))
    )
      // Proof: removing this refusal accepts a missing history root in preserves-recovery-events.
      throw new Error('Incomplete environment image protection');
  }
  for (const deployment of journal.deployments) {
    if (deployment.recovers !== null)
      recoveryChain(journal, deployment.recovers, deployment.environment, deployment.owner);
    if (
      deployment.events[0]?.phase !== 'protected' ||
      deployment.events[0].at !== deployment.startedAt ||
      deployment.events.at(-1)?.phase !== deployment.phase ||
      deployment.events.some(
        (event, index) => index > 0 && event.at < deployment.events[index - 1].at,
      )
    )
      // Proof: removing this refusal accepts corrupted durable events in registry-deployment.test.
      throw new Error('Invalid deployment event history');

    const environment = journal.environments.find(
      (environment) => environment.environment === deployment.environment,
    );
    if (environment?.owner !== deployment.owner) throw new Error('Invalid deployment environment');
    requireBundle(journal, deployment.candidate, environment.product);
    if (deployment.current !== null)
      requireBundle(journal, deployment.current, environment.product);
    const protection = journal.protections.find(
      (protection) => protection.operationId === deployment.operationId,
    );
    if (deployment.phase === 'protected' || deployment.phase === 'recovery-required') {
      if (
        (deployment.recovers === null
          ? (environment.releases.at(0) ?? null)
          : recoveryChain(
              journal,
              deployment.recovers,
              environment.environment,
              deployment.owner,
            )[0].candidate) !== deployment.current ||
        protection?.token !== deployment.token ||
        protection.owner !== deployment.owner ||
        deployment.finishedAt !== null
      )
        throw new Error('Inconsistent active deployment ownership');
      const inherited =
        deployment.recovers === null
          ? []
          : recoveryChain(
              journal,
              deployment.recovers,
              environment.environment,
              deployment.owner,
            ).flatMap((ancestor) => {
              const inherited = journal.protections.find(
                (protection) => protection.operationId === ancestor.operationId,
              );
              if (inherited === undefined)
                throw new Error('Missing unresolved ancestor protection');
              return inherited.references;
            });
      const expected = uniqueReferences(
        [deployment.candidate, ...(deployment.current === null ? [] : [deployment.current])]
          .flatMap(
            (operationId) => requireBundle(journal, operationId, environment.product).references,
          )
          .concat(
            deployment.inventory
              .filter((report) =>
                journal.consumers.some(
                  (source) =>
                    source.id === report.id && source.environment === deployment.environment,
                ),
              )
              .flatMap((report) => report.references),
          ),
      );
      const complete = uniqueReferences([...expected, ...inherited]);
      if (
        !matchReferences(protection.references, complete) ||
        !matchReferences(deployment.references, complete)
      )
        throw new Error('Incomplete deployment image protection');
    } else if (
      protection !== undefined ||
      deployment.finishedAt === null ||
      !journal.closedOperations.includes(deployment.operationId)
    )
      throw new Error('Inconsistent settled deployment evidence');
  }
  requireUnique(
    journal.consumers.map((source) => source.id),
    'consumer source',
  );
  if (journal.consumers.some((source) => !journal.enrollment.owners.includes(source.owner)))
    throw new Error('Unenrolled consumer owner');
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
    if (name.startsWith('permit-')) {
      if (Token(name.slice(7)) instanceof type.errors)
        throw new Error('Unrecognized permit replacement name');
      replacements.push(join(directory, name));
      continue;
    }
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
  reopen = false,
  checkOnly = false,
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
  if (checkOnly) return;
  if (ports.permit !== undefined && !initialize) {
    if (journal.fenced) await ports.permit.revoke();
    else await ports.permit.prepare(serialized, reopen);
  }
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
    if (ports.permit !== undefined && !initialize && !journal.fenced)
      await ports.permit.publish(serialized);
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

function requestOwnership(request: { operationId: string; owner: string }) {
  return { operationId: request.operationId, owner: request.owner };
}

function requireBundle(journal: RegistryJournal, operationId: string, product: string) {
  const bundle = journal.bundles.find((bundle) => bundle.operationId === operationId);
  if (bundle?.product !== product || !['completed', 'promoted'].includes(bundle.receipt.state))
    throw new Error('Missing complete deployment bundle');
  return bundle;
}

function matchReferences(
  left: readonly { repository: string; digest: string }[],
  right: readonly { repository: string; digest: string }[],
) {
  const keys = (references: readonly { repository: string; digest: string }[]) =>
    references.map((reference) => `${reference.repository}@${reference.digest}`).sort();
  return JSON.stringify(keys(left)) === JSON.stringify(keys(right));
}

function uniqueReferences(references: readonly { repository: string; digest: string }[]) {
  return [
    ...new Map(
      references.map((reference) => [`${reference.repository}@${reference.digest}`, reference]),
    ).values(),
  ];
}

async function verifyImages(
  ports: RegistryJournalPorts,
  journal: RegistryJournal,
  references: readonly { repository: string; digest: string }[],
) {
  if (ports.verifyImages === undefined)
    throw new Error('Registry image availability reader is unavailable');
  // Proof: removing native verification admits missing rollback content in registry-deployment.test.
  await ports.verifyImages(journal.enrollment, references);
}

/** Every registered source must report from its configured reader at this authority revision. */
async function collectConsumers(
  journal: RegistryJournal,
  ports: Pick<RegistryJournalPorts, 'verifyConsumers' | 'collectConsumers'>,
) {
  if (ports.verifyConsumers === undefined)
    throw new Error('Installed consumer universe is unavailable');
  await ports.verifyConsumers(journal.consumers, journal.enrollment.registryId);
  if (journal.consumers.length === 0 || ports.collectConsumers === undefined)
    throw new Error('Registry consumer inventory is unavailable');
  const reports = requireSchema(
    ConsumerReport.array(),
    await ports.collectConsumers(journal.consumers, journal.revision, journal.enrollment),
    'consumer inventory',
  );
  requireUnique(
    reports.map((report) => report.id),
    'consumer report',
  );
  if (
    reports.length !== journal.consumers.length ||
    journal.consumers.some(
      (source) =>
        !reports.some(
          (report) =>
            report.id === source.id &&
            report.source === source.source &&
            report.role === source.role &&
            (source.role === 'history'
              ? report.history !== undefined &&
                report.historySha256 !== undefined &&
                report.currentReferences !== undefined
              : report.history === undefined && report.historySha256 === undefined) &&
            report.revision === journal.revision,
        ),
    )
  )
    throw new Error('Incomplete or stale consumer inventory');
  return reports;
}

/** A history ledger cannot certify the absence of actual desired/runtime consumers. */
function requireActualConsumers(
  journal: RegistryJournal,
  environment: string,
  owner: string,
): void {
  const consumers = journal.consumers.filter(
    (source) =>
      source.environment === environment &&
      source.role === 'consumer' &&
      source.kind !== 'recovery',
  );
  if (consumers.length === 0 || consumers.some((source) => source.owner !== owner))
    throw new Error('Environment actual consumer coverage is missing or foreign');
}

/** Source persistence may lag an acknowledged promotion; it must reconcile before new ownership or retirement. */
function requireCurrentHistory(
  journal: RegistryJournal,
  environment: typeof Environment.infer,
  reports: readonly RegistryConsumerReport[],
): void {
  const historians = journal.consumers.filter(
    (source) => source.environment === environment.environment && source.role === 'history',
  );
  if (historians.length === 0) throw new Error('Environment history authority is unavailable');
  for (const source of historians) {
    const report = reports.find((report) => report.id === source.id);
    const history = report?.history;
    // Proof: removing complete-evidence comparison let altered promoted timestamps retire through the real owner reader.
    if (
      source.owner !== environment.owner ||
      history === undefined ||
      report?.historySha256 !==
        registryHistorySha256(
          environment.releases.map((operationId) =>
            requireBundle(journal, operationId, environment.product),
          ),
        ) ||
      (environment.releases.length === 0
        ? history.state !== 'first-install' || history.at !== environment.genesisAt
        : history.state !== 'successful' ||
          JSON.stringify(history.releases) !== JSON.stringify(environment.releases))
    )
      throw new Error('Environment source history differs from acknowledged authority history');
  }
}

function recoveryChain(
  journal: RegistryJournal,
  operationId: string,
  environment: string,
  owner: string,
) {
  const chain: RegistryJournal['deployments'] = [];
  const seen = new Set<string>();
  let next: string | null = operationId;
  while (next !== null) {
    if (seen.has(next)) throw new Error('Cyclic deployment recovery chain');
    seen.add(next);
    const deployment = journal.deployments.find((deployment) => deployment.operationId === next);
    if (deployment?.environment !== environment || deployment.owner !== owner)
      throw new Error('Foreign or missing deployment recovery identity');
    chain.push(deployment);
    next = deployment.recovers;
  }
  return chain;
}

async function mutateJournal(
  journal: RegistryJournal,
  request: Exclude<
    RegistryCommand,
    { command: 'read' | 'initialize' | 'upgrade' | 'check-capacity' }
  >,
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
    request.command === 'begin-maintenance' ||
    request.command === 'enroll-environment' ||
    request.command === 'begin-deployment' ||
    request.command === 'enroll-consumers' ||
    request.command === 'retire-environment';
  if (isNew) requireNewOperation(journal, request.operationId);
  switch (request.command) {
    case 'enroll-consumers': {
      if (ports.verifyConsumers === undefined)
        throw new Error('Installed consumer universe is unavailable');
      await ports.verifyConsumers(request.sources, journal.enrollment.registryId);
      if (journal.consumers.length > 0)
        throw new Error('Registry consumer universe is already enrolled');
      requireUnique(
        request.sources.map((source) => source.id),
        'consumer source',
      );
      if (request.sources.some((source) => !journal.enrollment.owners.includes(source.owner)))
        throw new Error('Unenrolled consumer owner');
      journal.consumers = request.sources;
      journal.closedOperations.push(request.operationId);
      return undefined;
    }
    case 'retire-environment': {
      const reports = await collectConsumers(journal, ports);
      const environment = journal.environments.find(
        (environment) => environment.environment === request.environment,
      );
      if (environment?.owner !== request.owner || environment.retiredAt !== null)
        throw new Error('Missing or foreign environment retirement');
      requireActualConsumers(journal, environment.environment, environment.owner);
      requireCurrentHistory(journal, environment, reports);
      const sources = journal.consumers.filter(
        (source) => source.environment === request.environment,
      );
      if (
        sources.length === 0 ||
        sources.some(
          (source) => reports.find((report) => report.id === source.id)?.references.length !== 0,
        )
      )
        throw new Error('Environment consumer references remain');
      if (
        journal.deployments.some(
          (deployment) =>
            deployment.environment === request.environment &&
            ['protected', 'recovery-required'].includes(deployment.phase),
        )
      )
        throw new Error('Unsettled deployment prevents environment retirement');
      journal.protections = journal.protections.filter(
        (protection) => protection.operationId !== environment.protectionId,
      );
      if (!journal.closedOperations.includes(environment.protectionId))
        journal.closedOperations.push(environment.protectionId);
      journal.closedOperations.push(request.operationId);
      environment.retiredAt = journal.updatedAt;
      return undefined;
    }
    case 'enroll-environment': {
      if (
        journal.environments.some((environment) => environment.environment === request.environment)
      )
        throw new Error('Registry environment already enrolled');
      // Proof: removing this call admitted first-install from a history-only source universe.
      requireActualConsumers(journal, request.environment, request.owner);
      const releases = request.history.state === 'successful' ? request.history.releases : [];
      requireUnique(releases, 'environment release');
      const bundles = releases.map((operationId) =>
        requireBundle(journal, operationId, request.product),
      );
      if (bundles.some((bundle) => bundle.receipt.state !== 'promoted'))
        throw new Error('Environment history requires trusted promoted bundles');
      const inventory = await collectConsumers(journal, ports);
      const historians = journal.consumers.filter(
        (source) => source.environment === request.environment && source.role === 'history',
      );
      if (historians.length === 0) throw new Error('Environment history authority is not enrolled');
      for (const source of historians) {
        const report = inventory.find((report) => report.id === source.id);
        if (
          source.owner !== request.owner ||
          report?.history === undefined ||
          report.currentReferences === undefined ||
          report.historySha256 !== registryHistorySha256(bundles) ||
          JSON.stringify(report.history) !== JSON.stringify(request.history)
        )
          throw new Error('Environment history disagrees with its trusted source');
        const current = bundles.at(0);
        if (
          current === undefined
            ? report.currentReferences.length !== 0
            : !matchReferences(report.currentReferences, current.references)
        )
          throw new Error('Environment history differs from existing release evidence');
      }
      const references = uniqueReferences(
        bundles.slice(0, 3).flatMap((bundle) => bundle.references),
      );
      if (references.length > 0) await verifyImages(ports, journal, references);
      const token = randomUUID();
      journal.environments.push({
        environment: request.environment,
        owner: request.owner,
        product: request.product,
        protectionId: request.operationId,
        enrolledAt: journal.updatedAt,
        genesisAt: request.history.state === 'first-install' ? request.history.at : null,
        retiredAt: null,
        releases,
      });
      if (references.length > 0)
        journal.protections.push({
          operationId: request.operationId,
          owner: request.owner,
          token,
          reason: `environment:${request.environment}`,
          references,
          roots: [...new Set(references.map((reference) => reference.digest))],
        });
      else journal.closedOperations.push(request.operationId);
      return token;
    }
    case 'begin-deployment': {
      const environment = journal.environments.find(
        (environment) =>
          environment.environment === request.environment && environment.retiredAt === null,
      );
      if (environment?.owner !== request.owner)
        throw new Error('Missing or foreign registry environment');
      const ancestry =
        request.recovers === undefined
          ? []
          : recoveryChain(journal, request.recovers, request.environment, request.owner);
      if (request.recovers === undefined) {
        if ((environment.releases.at(0) ?? null) !== request.current)
          throw new Error('Current environment release differs from rollback bundle');
        if (
          journal.deployments.some(
            (deployment) =>
              deployment.environment === request.environment &&
              ['protected', 'recovery-required'].includes(deployment.phase),
          )
        )
          throw new Error('Unsettled environment deployment');
      } else {
        if (
          ancestry[0].phase !== 'recovery-required' ||
          ancestry[0].candidate !== request.current ||
          journal.deployments.some(
            (deployment) =>
              deployment.recovers === request.recovers &&
              ['protected', 'recovery-required'].includes(deployment.phase),
          )
        )
          throw new Error('Stale or concurrent deployment recovery head');
      }
      const bundles = [
        requireBundle(journal, request.candidate, environment.product),
        ...(request.current === null
          ? []
          : [requireBundle(journal, request.current, environment.product)]),
      ];
      const inventory = await collectConsumers(journal, ports);
      requireActualConsumers(journal, environment.environment, environment.owner);
      requireCurrentHistory(journal, environment, inventory);
      const sources = journal.consumers.filter(
        (source) => source.environment === environment.environment,
      );
      if (sources.length === 0) throw new Error('Environment consumer sources are unavailable');
      if (
        request.recovers !== undefined &&
        !inventory.some(
          (report) =>
            sources.some((source) => source.id === report.id) &&
            report.currentReferences !== undefined &&
            matchReferences(report.currentReferences, bundles[1]?.references ?? []),
        )
      )
        throw new Error('Recovery current source observation differs from interrupted candidate');
      const inherited = ancestry.flatMap((ancestor) => {
        const protection = journal.protections.find(
          (protection) => protection.operationId === ancestor.operationId,
        );
        if (protection === undefined) throw new Error('Recovery ancestor protection missing');
        return protection.references;
      });
      const references = uniqueReferences([
        ...bundles.flatMap((bundle) => bundle.references),
        ...inherited,
        ...inventory
          .filter((report) => sources.some((source) => source.id === report.id))
          .flatMap((report) => report.references),
      ]);
      await verifyImages(ports, journal, references);
      const token = randomUUID();
      journal.protections.push({
        operationId: request.operationId,
        owner: request.owner,
        token,
        reason: `deployment:${request.environment}`,
        references,
        roots: [...new Set(references.map((reference) => reference.digest))],
      });
      journal.deployments.push({
        ...requestOwnership(request),
        token,
        environment: request.environment,
        candidate: request.candidate,
        current: request.current,
        recovers: request.recovers ?? null,
        reconciledBy: null,
        inventory,
        references,
        phase: 'protected',
        events: [{ phase: 'protected', at: journal.updatedAt }],
        startedAt: journal.updatedAt,
        finishedAt: null,
      });
      return token;
    }
    case 'finish-deployment': {
      const deployment = journal.deployments.find(
        (deployment) => deployment.operationId === request.operationId,
      );
      requireOwnership(deployment, request);
      if (!['protected', 'recovery-required'].includes(deployment.phase))
        throw new Error('Deployment already settled');
      const environment = journal.environments.find(
        (environment) => environment.environment === deployment.environment,
      );
      if (environment?.owner !== request.owner || environment.retiredAt !== null)
        throw new Error('Missing deployment environment');
      if (request.outcome === 'recovery-required') {
        deployment.events.push({ phase: 'recovery-required', at: journal.updatedAt });
        deployment.phase = 'recovery-required';
        return undefined;
      }
      if (!request.reconciled)
        throw new Error('Deployment completion requires reconciled consumer state');
      const target = request.outcome === 'promoted' ? deployment.candidate : deployment.current;
      if (target !== null) {
        const bundle = requireBundle(journal, target, environment.product);
        await verifyImages(ports, journal, bundle.references);
        if (request.outcome === 'promoted') {
          if (bundle.receipt.state !== 'promoted')
            bundle.receipt = { state: 'promoted', at: journal.updatedAt };
          environment.releases = [
            target,
            ...environment.releases.filter((operationId) => operationId !== target),
          ];
        }
      }
      const references = uniqueReferences(
        environment.releases
          .slice(0, 3)
          .flatMap(
            (operationId) => requireBundle(journal, operationId, environment.product).references,
          ),
      );
      const protectedEnvironment = journal.protections.find(
        (protection) => protection.operationId === environment.protectionId,
      );
      if (references.length > 0) {
        if (protectedEnvironment === undefined) {
          journal.closedOperations = journal.closedOperations.filter(
            (operationId) => operationId !== environment.protectionId,
          );
          journal.protections.push({
            operationId: environment.protectionId,
            owner: environment.owner,
            token: randomUUID(),
            reason: `environment:${environment.environment}`,
            references,
            roots: [...new Set(references.map((reference) => reference.digest))],
          });
        } else {
          protectedEnvironment.references = references;
          protectedEnvironment.roots = [
            ...new Set(references.map((reference) => reference.digest)),
          ];
        }
      }
      if (request.outcome === 'promoted' && deployment.recovers !== null) {
        for (const ancestor of recoveryChain(
          journal,
          deployment.recovers,
          environment.environment,
          request.owner,
        )) {
          if (!['protected', 'recovery-required'].includes(ancestor.phase))
            throw new Error('Recovery ancestor already settled');
          journal.protections = journal.protections.filter(
            (protection) => protection.operationId !== ancestor.operationId,
          );
          journal.closedOperations.push(ancestor.operationId);
          ancestor.phase = 'reconciled';
          ancestor.reconciledBy = deployment.operationId;
          ancestor.finishedAt = journal.updatedAt;
          ancestor.events.push({ phase: 'reconciled', at: journal.updatedAt });
        }
      }
      journal.protections = journal.protections.filter(
        (protection) => protection.operationId !== deployment.operationId,
      );
      journal.closedOperations.push(deployment.operationId);
      deployment.events.push({ phase: request.outcome, at: journal.updatedAt });
      deployment.phase = request.outcome;
      deployment.finishedAt = journal.updatedAt;
      return undefined;
    }
    case 'reopen': {
      if (
        !journal.maintenanceVerified ||
        journal.maintenance !== null ||
        journal.publication !== null
      )
        throw new Error('Reopening requires settled recovery and verified maintenance');
      const capacity = await ports.measureRegistry(journal.enrollment);
      admitPublication({ capacity, reservations: [], envelope: { bytes: 0, inodes: 0 } });
      // Proof: removing low-water refusal fails the completed-maintenance byte/inode/root reopening negatives.
      if (
        BigInt(capacity.usedBytes) * 10n >=
          BigInt(Math.min(capacity.maximumBytes, capacity.usableBytes)) * 7n ||
        BigInt(capacity.usedInodes) * 10n >= BigInt(capacity.totalInodes) * 7n ||
        capacity.rootFreeBytes < 20 * 1024 ** 3
      )
        throw new Error('Reopening requires low water');
      journal.fenced = false;
      journal.fenceReason = null;
      journal.measurement = { at: journal.updatedAt, ...capacity };
      return undefined;
    }
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
      if (
        journal.deployments.some((deployment) => deployment.operationId === request.operationId) ||
        journal.environments.some((environment) => environment.protectionId === request.operationId)
      )
        throw new Error('Environment or deployment protection requires its lifecycle transition');
      const index = journal.protections.findIndex(
        (protection) => protection.operationId === request.operationId,
      );
      requireOwnership(journal.protections[index], request);
      journal.protections.splice(index, 1);
      journal.closedOperations.push(request.operationId);
      return undefined;
    }
    case 'reserve-publication': {
      if (journal.fenced) throw new Error('Registry writes are fenced');
      requireImages(request.roots, request.references);
      const capacity = await ports.measureRegistry(journal.enrollment);
      journal.measurement = { at: journal.updatedAt, ...capacity };
      const admission = admitPublication({
        capacity,
        reservations: journal.reservations,
        envelope: request.envelope,
      });
      if (admission.pressure === 'fenced')
        throw new RegistryMeasurementFailure('Actual registry pressure requires fencing');
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
        journal.fenced = true;
        journal.fenceReason = 'publication-failed';
        journal.maintenanceVerified = false;
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
      journal.fenceReason = journal.fenceReason ?? 'maintenance';
      journal.maintenanceVerified = false;
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
        const capacity = await ports.measureRegistry(journal.enrollment);
        admitPublication({ capacity, reservations: [], envelope: { bytes: 0, inodes: 0 } });
        // Proof: completed maintenance retains the pressure fence until the explicit low-water reopen command.
        journal.fenced = true;
        journal.maintenanceVerified = true;
        journal.measurement = { at: journal.updatedAt, ...capacity };
        journal.closedOperations.push(request.operationId);
        journal.maintenance = null;
      }
      return undefined;
    }
  }
}

function incrementRevision(state: RegistryJournal): void {
  // Proof: exhausted-revision command negative fails if unsafe revisions can be persisted.
  if (!Number.isSafeInteger(state.revision + 1)) throw new Error('Journal revision exhausted');
  state.revision += 1;
}

class RegistryRequestRefusal extends Error {}
class RegistryMeasurementFailure extends Error {}

/**
 * Run one authenticated host command under an owner-only kernel flock, then atomically fsync
 * state before acknowledging. The existing SSH identity/current UID is the transport boundary.
 * Missing trusted state throws; only explicit enrollment initializes. Long work retains durable
 * owner/token records, and neither timeouts nor failed receipts release unresolved obligations.
 * Recovery uses admission-reserved replacement headroom. Callers must not start external work
 * until this function succeeds, and must reconcile state after any lost acknowledgement.
 * Valid canonical state authorizes reclaiming owned replacement orphans under the same lock;
 * initialization preserves preexisting replacement evidence instead of adopting or deleting it.
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
  const nativeMeasure = ports.measureRegistry;
  ports = {
    ...ports,
    measureRegistry: async (enrollment) => {
      try {
        const capacity = await nativeMeasure(enrollment);
        admitPublication({ capacity, reservations: [], envelope: { bytes: 0, inodes: 0 } });
        return capacity;
      } catch (cause) {
        throw new RegistryMeasurementFailure('Registry measurement failed', { cause });
      }
    },
  };
  return withLock(directory, async () => {
    try {
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
            schemaVersion: 3,
            enrollment: request.enrollment,
            revision: 0,
            updatedAt: (ports.now ?? (() => new Date().toISOString()))(),
            fenced: false,
            fenceReason: null,
            maintenanceVerified: false,
            measurement: null,
            protections: [],
            bundles: [],
            reservations: [],
            publication: null,
            maintenance: null,
            closedOperations: [],
            environments: [],
            consumers: [],
            deployments: [],
          },
          'initial registry journal',
        );
        await persistJournal(directory, state, ports, false, true);
        return { state };
      }
      const state = await readJournal(
        join(directory, 'journal.json'),
        request.command === 'upgrade',
      );
      const wasFenced = state.fenced;
      await reconcileReplacements(directory, ports);
      if (request.command === 'read') return { state };
      if (request.command === 'upgrade') {
        incrementRevision(state);
        await persistJournal(directory, state, ports, true, false);
        return { state };
      }
      if (request.command === 'check-capacity') {
        // Proof: removing this independent headroom check lets a ninety-percent journal renew pressure permission.
        await persistJournal(
          directory,
          state,
          { ...ports, permit: undefined },
          false,
          false,
          false,
          true,
        );
        const capacity = await ports.measureRegistry(state.enrollment);
        const admission = admitPublication({
          capacity,
          reservations: [],
          envelope: { bytes: 0, inodes: 0 },
        });
        // Proof: killing the real checker then restarting it preserves the fence in the pinned-container rehearsal.
        const lapsed = ports.permit !== undefined && !(await ports.permit.isFresh());
        if ((admission.pressure === 'fenced' || lapsed) && !state.fenced) {
          const at = requireSchema(
            Timestamp,
            (ports.now ?? (() => new Date().toISOString()))(),
            'pressure receipt time',
          );
          if (at < state.updatedAt) throw new Error('Server receipt clock moved backwards');
          state.updatedAt = at;
          state.measurement = { at, ...capacity };
          state.fenced = true;
          state.fenceReason = lapsed
            ? 'permission-lapsed'
            : admission.status === 'refused'
              ? admission.reasons.join(',')
              : 'pressure';
          state.maintenanceVerified = false;
          incrementRevision(state);
          await persistJournal(directory, state, ports, true, false);
        }
        if (ports.permit !== undefined) {
          if (state.fenced) {
            await ports.permit.revoke();
            await ports.permit.confirmReadonly?.();
          } else {
            const serialized = `${JSON.stringify(state)}\n`;
            await ports.permit.prepare(serialized, false);
            await ports.permit.publish(serialized);
          }
        }
        return { state };
      }
      const at = requireSchema(
        Timestamp,
        (ports.now ?? (() => new Date().toISOString()))(),
        'server receipt time',
      );
      // Proof: removing monotonic receipt time failed clock-reversal command negative.
      if (at < state.updatedAt) throw new Error('Server receipt clock moved backwards');
      state.updatedAt = at;
      let token: string | undefined;
      try {
        token = await mutateJournal(state, request, ports);
      } catch (cause) {
        if (cause instanceof RegistryMeasurementFailure) throw cause;
        throw new RegistryRequestRefusal(
          cause instanceof Error ? cause.message : 'Registry request refused',
          { cause },
        );
      }
      incrementRevision(state);
      requireConsistentState(state);
      const recovery =
        request.command === 'finish-publication' ||
        request.command === 'advance-maintenance' ||
        request.command === 'recover-maintenance' ||
        request.command === 'release-protection';
      await persistJournal(directory, state, ports, recovery, false, request.command === 'reopen');
      if (state.fenced && !wasFenced) await ports.permit?.confirmReadonly?.();
      return token === undefined ? { state } : { state, token };
    } catch (cause) {
      if (!(cause instanceof RegistryRequestRefusal) && ports.permit !== undefined) {
        const failures: unknown[] = [cause];
        try {
          await ports.permit.revoke();
        } catch (failure) {
          failures.push(failure);
        }
        try {
          const failed = await readJournal(join(directory, 'journal.json'));
          if (!failed.fenced) {
            failed.fenced = true;
            failed.fenceReason = 'authority-failure';
            failed.maintenanceVerified = false;
            incrementRevision(failed);
            await persistJournal(directory, failed, { ...ports, permit: undefined }, true, false);
          }
        } catch (failure) {
          failures.push(failure);
        }
        try {
          await ports.permit.confirmReadonly?.();
        } catch (failure) {
          failures.push(new Error('Live fencing is unconfirmed', { cause: failure }));
        }
        throw new AggregateError(
          failures,
          'Registry authority failed; writes remain fenced or fencing is explicitly unconfirmed',
          { cause },
        );
      }
      throw cause;
    }
  });
}

/** Exact root-owned whole-universe enrollment; requests cannot register a convenient subset. */
export function assertConsumerUniverse(
  input: unknown,
  sources: readonly RegistryConsumer[],
  registryId: string,
): void {
  const installed = type({
    schemaVersion: '1',
    registryId: Identity,
    sources: Consumer.array().atLeastLength(1),
    '+': 'reject',
  })(input);
  const canonical = (entries: readonly RegistryConsumer[]) =>
    JSON.stringify(
      [...entries]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((entry) => [
          entry.id,
          entry.owner,
          entry.environment,
          entry.kind,
          entry.source,
          entry.configurationSha256,
          entry.role,
          entry.hostSourceId ?? null,
        ]),
    );
  if (
    installed instanceof type.errors ||
    installed.registryId !== registryId ||
    canonical(installed.sources) !== canonical(sources)
  )
    throw new Error('Registered consumer universe differs from trusted installation');
  for (const source of installed.sources.filter(
    (source) => source.kind === 'compose' && source.role === 'consumer',
  )) {
    if (
      !installed.sources.some(
        (host) =>
          host.id === source.hostSourceId &&
          host.kind === 'docker-host' &&
          host.role === 'consumer' &&
          host.environment === null,
      )
    )
      throw new Error('Compose environment omits registered Docker host census');
  }
  for (const history of installed.sources.filter((source) => source.role === 'history')) {
    if (
      !installed.sources.some(
        (source) =>
          source.environment === history.environment &&
          source.owner === history.owner &&
          source.role === 'consumer' &&
          source.kind !== 'recovery',
      )
    )
      throw new Error('Installed environment omits actual consumer coverage');
  }
}

/** Reconcile every installed source and active environment before read-only retirement planning.
 * History is agreement evidence; every report.references entry remains a consumer/recovery root.
 * Callers must retain the common authority fence and revalidate before executing any plan. */
export async function reconcileRegistryConsumers(
  journal: RegistryJournal,
  ports: Pick<RegistryJournalPorts, 'verifyConsumers' | 'collectConsumers'>,
): Promise<RegistryConsumerReport[]> {
  const reports = await collectConsumers(journal, ports);
  for (const environment of journal.environments.filter(
    (environment) => environment.retiredAt === null,
  )) {
    requireActualConsumers(journal, environment.environment, environment.owner);
    requireCurrentHistory(journal, environment, reports);
    const current = environment.releases.at(0);
    const expected =
      current === undefined ? [] : requireBundle(journal, current, environment.product).references;
    for (const source of journal.consumers.filter(
      (source) => source.environment === environment.environment && source.role === 'history',
    )) {
      const report = reports.find((report) => report.id === source.id);
      // Proof: removing current-reference agreement admitted contradictory history provenance in registry-inventory.test.
      if (
        report?.currentReferences === undefined ||
        !matchReferences(report.currentReferences, expected)
      )
        throw new Error('Environment current evidence differs from acknowledged authority history');
    }
  }
  return reports;
}

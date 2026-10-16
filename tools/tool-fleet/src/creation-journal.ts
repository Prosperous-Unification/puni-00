import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { type } from 'arktype';

const identityFields = {
  labId: /^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/,
  attemptId: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  daemonId: /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/,
};
const IdentitySchema = type({ ...identityFields, '+': 'reject' });
const JournalSchema = type({
  ...identityFields,
  schemaVersion: '1',
  state: "'creating'|'ready'|'failed'",
  '+': 'reject',
});

export type CreationIdentity = typeof IdentitySchema.infer;
export type CreationJournal = CreationIdentity & {
  readonly schemaVersion: 1;
  readonly state: 'creating' | 'ready' | 'failed';
};

/** Validate the complete attempt identity before using it in trusted-state paths. */
export function requireIdentity(input: CreationIdentity): CreationIdentity {
  const identity = IdentitySchema(input);
  // Proof: invalid identity consuming negative and path-escape creation negative fail if bypassed.
  if (identity instanceof type.errors)
    throw new Error(`Invalid creation identity: ${identity.summary}`);
  return identity;
}

/** Require a current-user-owned directory with exact owner-only permissions. */
export async function requireDirectory(directory: string): Promise<void> {
  const status = await lstat(directory);
  // Proof: public-directory negative detects mode refusal; injected directory-UID consuming
  // negative detects removal of only the directory UID comparison (real fixture, isolated process).
  if (
    !status.isDirectory() ||
    status.uid !== process.getuid?.() ||
    (status.mode & 0o777) !== 0o700
  ) {
    throw new Error('Creation journal directory must be owner-only and owned by the current user');
  }
}

/** Synchronize directory ancestry so newly created attempt directories survive with the file. */
export async function syncDirectory(directory: string): Promise<void> {
  for (let current = resolve(directory); ; current = dirname(current)) {
    const descriptor = await open(
      current,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      // Proof: injected directory sync failure prevents the creation callback.
      await descriptor.sync();
    } finally {
      await descriptor.close();
    }
    if (dirname(current) === current) return;
  }
}

async function writeJournal(path: string, journal: CreationJournal): Promise<void> {
  // Proof: occupied-attempt negative fails with ordinary overwrite instead of exclusive create.
  const descriptor = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await descriptor.writeFile(`${JSON.stringify(journal)}\n`, 'utf8');
    // Proof: injected file/directory sync failures prevent the creation callback.
    await descriptor.sync();
  } finally {
    await descriptor.close();
  }
}

/**
 * Exclusively reserve an attempt before creating external resources. Both file and directory
 * are synchronized before returning; a failed reservation never authorizes resource creation.
 * The caller supplies an existing owner-only directory. Existing journals are never adopted.
 */
export async function createCreationAttempt(
  directory: string,
  input: CreationIdentity,
): Promise<void> {
  const identity = requireIdentity(input);
  await requireDirectory(directory);
  await writeJournal(join(directory, `${identity.attemptId}.json`), {
    ...identity,
    schemaVersion: 1,
    state: 'creating',
  });
  await syncDirectory(directory);
}

/**
 * Read trusted attempt state through a nonblocking, non-following descriptor. Missing, unreadable, public,
 * malformed, foreign-owner and mismatched identity state throws, including at deletion entry.
 */
export async function readCreationAttempt(
  directory: string,
  input: CreationIdentity,
): Promise<CreationJournal> {
  const identity = requireIdentity(input);
  await requireDirectory(directory);
  // Proof: symlink consuming negative detects removing O_NOFOLLOW; actual FIFO consuming
  // negative is killed at 2s if O_NONBLOCK is removed, instead of reaching regular-file refusal.
  const descriptor = await open(
    join(directory, `${identity.attemptId}.json`),
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const status = await descriptor.stat();
    // Proof: unreadable/public-mode negatives detect mode refusal; FIFO negative detects removing
    // isFile; injected file-UID consuming negative detects removing only this UID comparison.
    if (!status.isFile() || status.uid !== process.getuid?.() || (status.mode & 0o777) !== 0o600) {
      throw new Error(
        'Creation journal must be an owner-only regular file owned by the current user',
      );
    }
    let input: unknown;
    try {
      input = JSON.parse(await descriptor.readFile('utf8'));
    } catch (cause) {
      throw new Error('Malformed creation journal JSON', { cause });
    }
    const journal = JournalSchema(input);
    // Proof: malformed and extra-field consuming negatives fail with this boundary bypassed.
    if (journal instanceof type.errors)
      throw new Error(`Malformed creation journal: ${journal.summary}`);
    // Proof: wrong-attempt and wrong-daemon consuming negatives fail if identity comparison is removed.
    if (
      journal.labId !== identity.labId ||
      journal.attemptId !== identity.attemptId ||
      journal.daemonId !== identity.daemonId
    ) {
      throw new Error('Creation journal identity does not match this attempt and daemon');
    }
    return journal;
  } finally {
    await descriptor.close();
  }
}

/**
 * Atomically complete or fail one creating attempt under an exclusive per-attempt lock.
 * Terminal attempts cannot change. A crashed writer's lock is deliberately not reclaimed.
 * File synchronization precedes rename; directory synchronization precedes success.
 */
export async function transitionCreationAttempt(
  directory: string,
  input: CreationIdentity,
  state: 'ready' | 'failed',
): Promise<void> {
  const identity = requireIdentity(input);
  await requireDirectory(directory);
  const path = join(directory, `${identity.attemptId}.json`);
  const lock = `${path}.lock`;
  // Proof: concurrent-attempt test's occupied lock refuses without touching either journal.
  await mkdir(lock, { mode: 0o700 });
  try {
    const journal = await readCreationAttempt(directory, identity);
    // Proof: terminal transition negative fails if this state check is removed.
    if (journal.state !== 'creating') throw new Error('Creation journal is terminal');
    const replacement = `${path}.${randomUUID()}`;
    await writeJournal(replacement, { ...journal, state });
    await rename(replacement, path);
    await syncDirectory(directory);
  } finally {
    await rmdir(lock);
  }
}

/**
 * Receipt-consuming lifecycle entry. Phase one validates durable attempt/daemon identity then
 * refuses deletion: this journal is not a creation receipt proving individual Docker objects.
 * No name-based teardown, k3d cleanup, volume deletion or recovery CLI is reachable here.
 */
export async function consumeCreationAttempt(
  directory: string,
  identity: CreationIdentity,
): Promise<never> {
  // Proof: absent and unreadable are distinct consuming negatives; bypassing this read makes both fail.
  await readCreationAttempt(directory, identity);
  // Proof: valid-journal consuming negative requires this explicit phase-one refusal.
  throw new Error(
    'Creation identity executor is disabled; journal alone cannot authorize deletion',
  );
}

/**
 * Run creation only after its durable exclusive reservation. Creation failure records failed
 * state before rethrowing; a journal failure always propagates. This wrapper never attempts cleanup;
 * the external resource inventory remains unknown until it is inspected.
 * This records attempt completion, never resource ownership or deletion authority.
 */
export async function executeCreationAttempt<Created>(
  directory: string,
  identity: CreationIdentity,
  create: () => Promise<Created>,
): Promise<Created> {
  // Proof: occupied-attempt lifecycle negative observes no creation callback if reservation fails.
  await createCreationAttempt(directory, identity);
  let created: Created;
  try {
    created = await create();
  } catch (cause) {
    try {
      await transitionCreationAttempt(directory, identity, 'failed');
    } catch (journalFailure) {
      throw new AggregateError(
        [cause, journalFailure],
        'Creation failed and its journal transition failed',
        { cause: journalFailure },
      );
    }
    throw cause;
  }
  await transitionCreationAttempt(directory, identity, 'ready');
  return created;
}

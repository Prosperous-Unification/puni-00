import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { fchmodSync, fsyncSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { join } from 'node:path';

import {
  type DependencyActivationReceipt,
  parseDependencyReceipt,
} from '@wbs/contracts/dependency-runtime';
import {
  snapshotDatabase,
  snapshotDatabaseBounded,
  verifySnapshot,
  verifySnapshotBounded,
} from '@wbs/store-sqlite/backup';
import {
  activateDependencies,
  inspectDependencyActivation,
} from '@wbs/store-sqlite/cross-project-dependency-activation';
import { openReadOnlyConnection, openReadOnlyDatabase } from '@wbs/store-sqlite/db';
import {
  captureAppliedMigrationSet,
  type MigrationSetCapture,
} from '@wbs/store-sqlite/migration-set';

import type { DatabaseIdentity } from './backend-cohort';
import {
  assertCompleteDependencyExclusion,
  type CompleteDependencyExclusion,
} from './complete-dependency-exclusion';
import { DependencyActivationFailure } from './dependency-activation-failure';
import type {
  ActivationRecordByLabel,
  ActivationRecordLabel,
} from './dependency-activation-records';
import { inspectDormantDependencies } from './dependency-inventory';
import {
  assertDependencyOwner,
  type DependencyOwner,
  retainActivationRecord,
} from './edge-ownership';
import { captureEdgeRecord, type EdgeRecordSnapshot } from './edge-policy';
import type { EnvName } from './env';
import {
  captureInitialHandoffArtifacts,
  type InitialHandoffArtifactObservation,
} from './initial-handoff-graph';
import { assertSame, readRecord } from './managed-cohort';
import { writeNewMigrationCapture } from './migration-capture-file';

/** Weak diagnostic retention only: raw owner/outcomes may be collected when the safe error is discarded; this is not UNKNOWN custody. */
const storageFailures = new WeakMap<DependencyActivationFailure, readonly unknown[]>();
function settleStorage<T>(operation: () => T, cleanups: readonly (() => void)[]): T {
  const failures: unknown[] = [];
  let outcome: { value: T } | undefined;
  try {
    outcome = { value: operation() };
  } catch (cause) {
    failures.push(cause);
  }
  for (const close of cleanups) {
    try {
      close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'private storage outcomes');
  if (outcome === undefined) throw new Error('storage outcome absent');
  return outcome.value;
}
const inode = (stats: { dev: bigint; ino: bigint }) => `${String(stats.dev)}:${String(stats.ino)}`;
/** Retains the canonical parent across census; main descriptors exist only during synchronous storage boundaries. */
export function retainActivationDatabase(binding: DatabaseIdentity) {
  const parentPath = dirname(binding.host);
  const parent = openSync(
    parentPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  let closed = false;
  const accessPath = `/proc/self/fd/${String(parent)}/${basename(binding.host)}`;
  // Proof: removing parent identity admitted a new parent with the SAME main inode; parent-replacement negative failed.
  // Proof: post-finalizer prepared-store parent omission admitted the same original main inode in a replacement parent; lifetime negative missed its rejection.
  function inspectParent() {
    if (
      closed ||
      realpathSync(parentPath) !== parentPath ||
      inode(fstatSync(parent, { bigint: true })) !== binding.directoryIdentity ||
      inode(lstatSync(parentPath, { bigint: true })) !== binding.directoryIdentity
    )
      throw new Error('activation database parent changed');
  }
  // Proof: removing main identity admitted a new SQLite main between boundaries; main-replacement negative failed.
  // Proof: post-finalizer prepared-store main omission admitted a same-byte replacement; lifetime negative missed its rejection.
  function inspectMain(descriptor: number) {
    inspectParent();
    const retained = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(accessPath, { bigint: true });
    if (
      !retained.isFile() ||
      !named.isFile() ||
      inode(retained) !== binding.fileIdentity ||
      inode(named) !== binding.fileIdentity ||
      realpathSync(binding.host) !== binding.host
    )
      throw new Error('activation database main changed');
  }
  function withPath<T>(operation: (path: string) => T): T {
    inspectParent();
    const main = openSync(
      accessPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    return settleStorage(() => {
      inspectMain(main);
      const value = operation(accessPath);
      inspectMain(main);
      return value;
    }, [
      () => {
        closeSync(main);
      },
    ]);
  }
  try {
    withPath(() => undefined);
    return {
      withPath,
      inspect: () => {
        withPath(() => undefined);
      },
      close: () => {
        if (closed) throw new Error('activation database anchor already closed');
        closed = true;
        closeSync(parent);
      },
    };
  } catch (cause) {
    return settleStorage<never>(() => {
      throw cause;
    }, [
      () => {
        closeSync(parent);
      },
    ]);
  }
}
/** Exact retained bytes, never a freshly accepted tampered digest. */
export function hashActivationBytes(contents: string | Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex');
}

/** Real SQLite dispatch only through the original complete live interval. Partial commits are retained on every failure. Selected intent and commit references preserve actual publication order. */
export async function activateDependencyStores(
  owner: DependencyOwner,
  token: CompleteDependencyExclusion,
) {
  const scope = await assertCompleteDependencyExclusion(owner, token);
  const { layouts, request, deadline, attempt, directory, artifactDirectory } = scope;
  const limits = { maxBytes: 1073741824, deadline };
  const isInitial = scope.purpose === 'initial-handoff';
  let raw: InitialHandoffArtifactObservation | undefined;
  let isClosed = false;
  function closeRaw() {
    if (isClosed) throw new Error('activation evidence monitor closed');
    if (raw !== undefined) {
      raw.verifyClosure();
      raw.assertStable();
    }
    checkDeadline();
  }
  /** A failed raw close is UNKNOWN, never retried here; GraphFiles settlement and strong UNKNOWN custody remain separate prerequisites. */
  function closeRawFiles() {
    if (raw === undefined) return;
    try {
      raw.closeFiles();
    } catch (failure) {
      const cleanup = Object.assign(new Error('private raw cleanup unknown'), {
        state: 'unknown-raw-cleanup' as const,
        observation: raw,
        failure,
      });
      Object.freeze(cleanup);
      throw cleanup;
    }
  }
  const verifyBackup = (path: string) =>
    isInitial ? verifySnapshotBounded(path, limits) : verifySnapshot(path);
  function admitBytes(contents: string, maximum: number) {
    if (
      isInitial &&
      (Buffer.byteLength(contents, 'utf8') > maximum ||
        Buffer.from(contents, 'utf8').toString('utf8') !== contents)
    )
      throw new Error('initial preparation publication byte limit exceeded');
    checkDeadline();
  }
  const anchors = new Map<EnvName, Awaited<ReturnType<typeof retainActivationDatabase>>>();
  const captures = new Map<EnvName, MigrationSetCapture>();
  const retained: { path: string; contents: string; identity: string }[] = [];
  const activationRecords: EdgeRecordSnapshot[] = [];
  const evidenceNames = new Set<string>();
  const backups: { path: string; sha256: string; bytes: number; identity: string }[] = [];
  function closeAnchors() {
    const held = [...anchors.values()];
    anchors.clear();
    settleStorage(
      () => undefined,
      held.map((anchored) => anchored.close),
    );
  }
  const committed: { environment: EnvName; receipt: DependencyActivationReceipt }[] = [];
  const commitRecords: { environment: EnvName; reference: { name: string; sha256: string } }[] = [];
  const intentRecords: { environment: EnvName; reference: { name: string; sha256: string } }[] = [];
  let stage = 'initial-storage';
  let environment: EnvName | undefined;
  let evidence: number | undefined;
  let state: number | undefined;
  const checkDeadline = () => {
    if (performance.now() >= deadline) throw new Error('activation deadline exceeded');
  };
  const evidencePath = join(directory, `dependency-activation-${attempt}`);
  function inspectEvidence() {
    if (
      evidence === undefined ||
      state === undefined ||
      realpathSync(directory) !== directory ||
      realpathSync(evidencePath) !== evidencePath
    )
      throw new Error('activation evidence directory changed');
    const parent = fstatSync(state, { bigint: true });
    const namedParent = lstatSync(directory, { bigint: true });
    const held = fstatSync(evidence, { bigint: true });
    const named = lstatSync(evidencePath, { bigint: true });
    if (
      inode(parent) !== inode(namedParent) ||
      !held.isDirectory() ||
      (held.mode & 0o7777n) !== 0o700n ||
      inode(held) !== inode(named)
    )
      throw new Error('activation evidence identity differs');
    assertSame(
      [...evidenceNames].sort(),
      readdirSync(`/proc/self/fd/${String(evidence)}`).sort(),
      'activation fixed evidence children',
    );
  }
  function readCapture(path: string, expectedIdentity: string): string | Promise<string> {
    if (!isInitial) return readRecord(path);
    inspectEvidence();
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    return settleStorage(() => {
      const original = fstatSync(descriptor, { bigint: true });
      const identity = (stats: typeof original) =>
        [
          stats.dev,
          stats.ino,
          stats.mode,
          stats.nlink,
          stats.size,
          stats.mtimeNs,
          stats.ctimeNs,
        ].join(':');
      function inspect() {
        checkDeadline();
        inspectEvidence();
        const current = fstatSync(descriptor, { bigint: true });
        const named = lstatSync(path, { bigint: true });
        if (
          !current.isFile() ||
          (current.mode & 0o444n) === 0n ||
          inode(current) !== expectedIdentity ||
          identity(current) !== identity(original) ||
          identity(named) !== identity(original)
        )
          throw new Error('initial capture original identity changed');
        if (current.size > 4194304n) throw new Error('initial capture byte limit exceeded');
      }
      inspect();
      const bytes = Buffer.alloc(Number(original.size));
      let offset = 0;
      while (offset < bytes.length) {
        inspect();
        const count = readSync(
          descriptor,
          bytes,
          offset,
          Math.min(1048576, bytes.length - offset),
          offset,
        );
        inspect();
        if (count === 0) throw new Error('initial capture short read');
        offset += count;
      }
      if (readSync(descriptor, Buffer.alloc(1), 0, 1, offset) !== 0)
        throw new Error('initial capture byte count changed');
      inspect();
      const contents = bytes.toString('utf8');
      if (!Buffer.from(contents, 'utf8').equals(bytes))
        throw new Error('initial capture UTF-8 changed');
      return contents;
    }, [
      () => {
        closeSync(descriptor);
      },
    ]);
  }
  function anchor(env: EnvName) {
    const anchored = anchors.get(env);
    if (anchored === undefined) throw new Error('activation database anchor missing');
    return anchored;
  }
  function original(env: EnvName) {
    const captured = captures.get(env);
    if (captured === undefined) throw new Error('activation capture missing');
    return captured;
  }
  function inspectLedger(env: EnvName) {
    checkDeadline();
    const captured = original(env);
    const actual = anchor(env).withPath((path) =>
      captureAppliedMigrationSet(path, artifactDirectory, {
        target: captured.target,
        attempt: captured.attempt,
        candidate: captured.candidate,
      }),
    );
    assertSame(captured, actual, 'activation complete migration ledger');
    checkDeadline();
  }
  function inspectAuthority(env: EnvName, receipt?: DependencyActivationReceipt) {
    checkDeadline();
    anchor(env).withPath((path) => {
      if (receipt === undefined) {
        const database = openReadOnlyDatabase(path);
        settleStorage(
          () => inspectDormantDependencies(database),
          [
            () => {
              database.close();
            },
          ],
        );
      } else {
        const connection = openReadOnlyConnection(path);
        settleStorage(() => {
          assertSame(
            { state: 'ENABLED', receipt },
            inspectDependencyActivation(connection.db),
            'independent activation authority',
          );
        }, [
          () => {
            connection.close();
          },
        ]);
      }
    });
    checkDeadline();
  }
  async function inspectActivationRecord(publication: EdgeRecordSnapshot) {
    closeRaw();
    const named = lstatSync(publication.path, { bigint: true });
    if (!named.isFile() || (named.mode & 0o7777n) !== 0o600n)
      throw new Error('retained activation publication is not private');
    // Proof: rebasing the returned capture snapshot accepted a same-byte replacement; the production return-boundary negative lost its required refusal (exit 1).
    assertSame(
      publication,
      await captureEdgeRecord(directory, basename(publication.path), 65536),
      'original activation publication snapshot',
    );
    closeRaw();
  }
  async function inspectPublications() {
    inspectEvidence();
    for (const publication of activationRecords) await inspectActivationRecord(publication);
    for (const publication of retained) {
      const named = lstatSync(publication.path, { bigint: true });
      if (!named.isFile() || (named.mode & 0o7777n) !== 0o600n)
        throw new Error('retained activation publication is not private');
      assertSame(
        publication.identity,
        inode(lstatSync(publication.path, { bigint: true })),
        'retained activation evidence inode',
      );
      assertSame(
        publication.contents,
        await readCapture(publication.path, publication.identity),
        'retained activation evidence',
      );
    }
    for (const backup of backups) {
      inspectEvidence();
      const descriptor = openSync(
        `/proc/self/fd/${String(evidence)}/${basename(backup.path)}`,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      settleStorage(() => {
        const before = fstatSync(descriptor, { bigint: true });
        if (
          !before.isFile() ||
          (before.mode & 0o7777n) !== 0o600n ||
          inode(before) !== backup.identity
        )
          throw new Error('retained backup identity differs');
        if (isInitial) {
          const verified = verifyBackup(backup.path);
          if (
            verified.bytes !== backup.bytes ||
            verified.sha256 !== backup.sha256 ||
            inode(lstatSync(backup.path, { bigint: true })) !== backup.identity
          )
            throw new Error('retained bounded backup bytes differ');
        } else {
          const bytes = readFileSync(descriptor);
          if (
            bytes.length !== backup.bytes ||
            hashActivationBytes(bytes) !== backup.sha256 ||
            inode(fstatSync(descriptor, { bigint: true })) !== backup.identity
          )
            throw new Error('retained backup bytes differ');
        }
      }, [
        () => {
          closeSync(descriptor);
        },
      ]);
    }
    inspectEvidence();
    closeRaw();
  }
  async function inspectRetained() {
    await inspectPublications();
    for (const anchored of anchors.values()) anchored.inspect();
    await assertCompleteDependencyExclusion(owner, token);
    await inspectPublications();
    checkDeadline();
  }
  const reference = (publication: { path: string; contents: string }) => ({
    name: basename(publication.path),
    sha256: hashActivationBytes(publication.contents),
  });
  async function retain<Label extends ActivationRecordLabel>(
    label: Label,
    record: ActivationRecordByLabel[Label],
  ) {
    const expected = `${JSON.stringify({ owner: scope.pending, record })}\n`;
    admitBytes(expected, 65536);
    closeRaw();
    const publication = await retainActivationRecord(owner, layouts, label, record);
    if (isInitial)
      assertSame(expected, publication.contents, 'preadmitted activation envelope bytes');
    closeRaw();
    activationRecords.push(publication);
    await inspectActivationRecord(publication);
    return reference(publication);
  }
  try {
    for (const env of ['prod', 'dev'] as const) {
      environment = env;
      const binding = scope.databases[env];
      anchors.set(env, retainActivationDatabase(binding));
      inspectAuthority(env);
      scope.authority.set(env, 'DISABLED');
      const identity = JSON.stringify({
        environment: env,
        host: binding.host,
        directoryIdentity: binding.directoryIdentity,
        fileIdentity: binding.fileIdentity,
      });
      const image = env === 'prod' ? request.prod.backend.image : request.source.runtimeReference;
      const capture = anchor(env).withPath((path) =>
        captureAppliedMigrationSet(path, artifactDirectory, {
          target: identity,
          attempt: `${attempt}:${env}`,
          candidate: image,
        }),
      );
      checkDeadline();
      if (capture.applied.length === 0 || capture.pending.length !== 0)
        throw new Error('activation requires complete installed migration ledger');
      assertSame(
        scope.migrations.migrations.map(({ name, hash }) => ({ name, hash })),
        capture.applied,
        'artifact complete applied ledger',
      );
      captures.set(env, capture);
    }
    assertSame(
      original('prod').applied,
      original('dev').applied,
      'joint installed migration ledger',
    );
    stage = 'allocate-evidence';
    state = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (inode(fstatSync(state, { bigint: true })) !== scope.stateDirectoryIdentity)
      throw new Error('activation state directory identity changed');
    mkdirSync(`/proc/self/fd/${String(state)}/dependency-activation-${attempt}`, { mode: 0o700 });
    fsyncSync(state);
    evidence = openSync(
      evidencePath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    inspectEvidence();
    const prepared = new Map<
      EnvName,
      {
        capture: { name: string; sha256: string };
        backup: { name: string; sha256: string };
        snapshot: ReturnType<typeof verifySnapshot>;
      }
    >();
    for (const env of request.activate) {
      environment = env;
      stage = 'capture';
      await inspectRetained();
      const capture = original(env);
      const contents = `${JSON.stringify(capture)}\n`;
      admitBytes(contents, 4194304);
      const path = `${evidencePath}/${env}.capture.json`;
      await writeNewMigrationCapture(
        `/proc/self/fd/${String(evidence)}/${env}.capture.json`,
        contents,
      );
      evidenceNames.add(`${env}.capture.json`);
      inspectEvidence();
      const captureIdentity = inode(lstatSync(path, { bigint: true }));
      assertSame(
        contents,
        await readCapture(`/proc/self/fd/${String(evidence)}/${env}.capture.json`, captureIdentity),
        'activation capture publication',
      );
      retained.push({ path, contents, identity: captureIdentity });
      const captureReference = {
        name: `${env}.capture.json`,
        sha256: hashActivationBytes(contents),
      };
      await retain('capture', {
        format: 'dependency-activation-capture',
        version: 1,
        environment: env,
        databaseIdentity: capture.target,
        capture: captureReference,
      });
      stage = 'backup';
      await inspectRetained();
      const backupPath = `${evidencePath}/${env}.before.sqlite`;
      const backupAccess = `/proc/self/fd/${String(evidence)}/${env}.before.sqlite`;
      const snapshot = anchor(env).withPath((sourcePath) =>
        isInitial
          ? snapshotDatabaseBounded(sourcePath, backupAccess, limits)
          : snapshotDatabase(sourcePath, backupAccess),
      );
      checkDeadline();
      evidenceNames.add(`${env}.before.sqlite`);
      inspectEvidence();
      const backup = openSync(
        backupAccess,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const backupIdentity = settleStorage(() => {
        const observed = fstatSync(backup, { bigint: true });
        if (!observed.isFile()) throw new Error('activation backup is not a regular file');
        fchmodSync(backup, 0o600);
        fsyncSync(backup);
        return inode(observed);
      }, [
        () => {
          closeSync(backup);
        },
      ]);
      fsyncSync(evidence);
      const verified = verifyBackup(backupAccess);
      checkDeadline();
      assertSame(snapshot, verified, 'activation verified backup');
      // Proof: removing this full capture admitted an integrity-valid backup with unchanged names and a changed hash; real backup-ledger negative failed.
      const backupCapture = captureAppliedMigrationSet(backupAccess, artifactDirectory, {
        target: capture.target,
        attempt: capture.attempt,
        candidate: capture.candidate,
      });
      checkDeadline();
      assertSame(capture, backupCapture, 'activation backup complete ledger');
      const copied = openReadOnlyDatabase(backupAccess);
      settleStorage(
        () => inspectDormantDependencies(copied),
        [
          () => {
            copied.close();
          },
        ],
      );
      checkDeadline();
      backups.push({
        path: backupPath,
        sha256: verified.sha256,
        bytes: verified.bytes,
        identity: backupIdentity,
      });
      const backupReference = await retain('backup', {
        format: 'dependency-activation-backup',
        version: 1,
        environment: env,
        databaseIdentity: capture.target,
        snapshot: {
          name: `${env}.before.sqlite`,
          sha256: verified.sha256,
          bytes: verified.bytes,
          migrations: verified.migrations,
        },
        captureSha256: captureReference.sha256,
      });
      prepared.set(env, { capture: captureReference, backup: backupReference, snapshot: verified });
      inspectLedger(env);
      await inspectRetained();
    }
    if (isInitial) {
      stage = 'initial-raw-observation';
      raw = captureInitialHandoffArtifacts(
        {
          edgeState: directory,
          owner: scope.pending,
          activation: request,
          databases: (['prod', 'dev'] as const).map((environment) => ({
            environment,
            ...scope.databases[environment],
          })),
          selected: request.activate.map((environment) => {
            const preparation = prepared.get(environment);
            if (preparation === undefined) throw new Error('initial selected preparation absent');
            return {
              environment,
              capture: preparation.capture,
              backup: {
                name: `${environment}.before.sqlite`,
                sha256: preparation.snapshot.sha256,
                bytes: preparation.snapshot.bytes,
                migrations: preparation.snapshot.migrations,
              },
            };
          }),
        },
        deadline,
      );
      closeRaw();
    }
    stage = 'participants';
    const participantRecord = await retain('participants', scope.participants);
    for (const env of request.activate) {
      environment = env;
      const capture = original(env);
      const preparation = prepared.get(env);
      if (preparation === undefined) throw new Error('activation backup preparation missing');
      const receipt = parseDependencyReceipt({
        protocol: 'wbs-dependency-activation',
        version: 1,
        activationId: `${attempt}:${env}`,
        databaseIdentity: capture.target,
        candidateImage: capture.candidate,
        rollbackImage: capture.candidate,
        participantProofSha256: participantRecord.sha256,
        migrationCaptureSha256: preparation.capture.sha256,
        activatedAt: Date.now(),
      });
      stage = 'intent';
      const intentRecord = await retain('intent', {
        format: 'dependency-activation-intent',
        version: 1,
        environment: env,
        receipt,
        participantRecord,
        capture: preparation.capture,
        backup: preparation.backup,
        migrationManifestSha256: request.migrations.manifestSha256,
      });
      intentRecords.push({ environment: env, reference: intentRecord });
      await inspectRetained();
      assertSame(
        preparation.snapshot,
        verifyBackup(preparation.snapshot.path),
        'retained activation backup',
      );
      inspectLedger(env);
      inspectAuthority(env);
      closeRaw();
      stage = 'dispatch-uncertain';
      scope.authority.set(env, 'dispatch-uncertain');
      const authority = anchor(env).withPath((path) =>
        activateDependencies(path, artifactDirectory, receipt),
      );
      checkDeadline();
      assertSame({ state: 'ENABLED', receipt }, authority, 'atomic activation response');
      stage = 'independent-readback';
      // Proof: omitting this new connection admitted real post-commit receipt corruption; receipt readback mutation failed.
      inspectAuthority(env, receipt);
      // Proof: omitting this full recapture admitted real post-commit ledger corruption; ledger readback mutation failed.
      inspectLedger(env);
      await inspectRetained();
      scope.authority.set(env, receipt);
      scope.committed.set(env, receipt);
      const committedRecord = await retain('committed', {
        format: 'dependency-activation-committed',
        version: 1,
        environment: env,
        receipt,
        captureSha256: preparation.capture.sha256,
        migrationManifestSha256: request.migrations.manifestSha256,
      });
      commitRecords.push({ environment: env, reference: committedRecord });
      committed.push({ environment: env, receipt });
    }
    stage = 'final-readback';
    for (const env of ['prod', 'dev'] as const) {
      environment = env;
      const expected = scope.authority.get(env);
      if (expected === 'DISABLED') inspectAuthority(env);
      else if (typeof expected === 'object') inspectAuthority(env, expected);
      else throw new Error('activation authority is unverified or uncertain');
      inspectLedger(env);
    }
    await inspectRetained();
    const expected = new Map<
      EnvName,
      | { readonly state: 'DISABLED' }
      | { readonly state: 'ENABLED'; readonly receipt: DependencyActivationReceipt }
    >();
    for (const env of ['prod', 'dev'] as const) {
      const enabled = committed.find((entry) => entry.environment === env);
      if (request.activate.includes(env) && enabled === undefined)
        throw new Error('selected activation receipt absent');
      expected.set(
        env,
        enabled === undefined
          ? { state: 'DISABLED' }
          : { state: 'ENABLED', receipt: structuredClone(enabled.receipt) },
      );
    }
    const inspectStores = async () => {
      try {
        await assertDependencyOwner(owner, layouts.prod, request.owner.sha);
        await assertDependencyOwner(owner, layouts.dev, request.owner.sha);
        closeRaw();
        for (const env of ['prod', 'dev'] as const) {
          const authority = expected.get(env);
          const captured = original(env);
          if (authority === undefined) throw new Error('expected store authority absent');
          const anchored = retainActivationDatabase(scope.databases[env]);
          settleStorage(() => {
            anchored.withPath((path) => {
              if (authority.state === 'ENABLED') {
                const connection = openReadOnlyConnection(path);
                settleStorage(() => {
                  assertSame(
                    authority,
                    inspectDependencyActivation(connection.db),
                    'restoration exact activation receipt',
                  );
                }, [
                  () => {
                    // Proof: omitting this close exposed real SQLite/main/WAL/SHM descriptors at the next awaited owner boundary; prepared-store lifetime test failed its empty-FD assertion.
                    connection.close();
                  },
                ]);
              } else {
                const database = openReadOnlyDatabase(path);
                settleStorage(() => {
                  // Proof: omitting this post-finalizer check admitted a nonselected ENABLED marker; prepared-store lifetime negative missed its rejection.
                  inspectDormantDependencies(database);
                }, [
                  () => {
                    database.close();
                  },
                ]);
              }
              const current = captureAppliedMigrationSet(path, artifactDirectory, {
                target: captured.target,
                attempt: captured.attempt,
                candidate: captured.candidate,
              });
              // Proof: omitting this comparison admitted a deleted valid migration row after finalizers; prepared-store lifetime negative missed its rejection.
              assertSame(captured, current, 'restoration complete migration ledger');
            });
          }, [
            () => {
              anchored.close();
            },
          ]);
          checkDeadline();
        }
        await assertDependencyOwner(owner, layouts.prod, request.owner.sha);
        await assertDependencyOwner(owner, layouts.dev, request.owner.sha);
        closeRaw();
      } catch (cause) {
        const failure = new DependencyActivationFailure(
          attempt,
          'restoration-store-readback',
          undefined,
          scope.committed,
        );
        storageFailures.set(failure, [cause]);
        throw failure;
      }
    };
    closeRaw();
    const preparation =
      raw === undefined
        ? { purpose: 'restoration' as const }
        : {
            purpose: 'initial-handoff' as const,
            artifacts: raw.contents,
            records: Object.freeze(
              activationRecords.map((publication) => Object.freeze({ ...publication })),
            ),
          };
    const packet = {
      ...preparation,
      receipts: committed,
      participantRecord,
      commitRecords,
      intentRecords,
      stores: Object.freeze({ inspect: inspectStores }),
      evidence: {
        inspect: inspectPublications,
        assertStable: closeRaw,
        close: () => {
          if (evidence === undefined || state === undefined)
            throw new Error('activation evidence monitor closed');
          const descriptions = [evidence, state];
          evidence = undefined;
          state = undefined;
          isClosed = true;
          const failures: unknown[] = [];
          for (const close of [
            closeRawFiles,
            ...descriptions.map((descriptor) => () => {
              closeSync(descriptor);
            }),
          ]) {
            try {
              close();
            } catch (cause) {
              failures.push(cause);
            }
          }
          if (failures.length > 0) {
            const failure = new DependencyActivationFailure(
              attempt,
              'evidence-cleanup',
              undefined,
              scope.committed,
            );
            storageFailures.set(failure, [...failures, raw]);
            throw failure;
          }
        },
      },
    };
    stage = 'anchor-finalizers';
    closeAnchors();
    closeRaw();
    return packet;
  } catch (cause) {
    // Private SQL/config/transport causes never escape; durable commits remain monotone.
    const publicFailure = new DependencyActivationFailure(
      attempt,
      stage,
      environment,
      scope.committed,
    );
    // Successful transfer already drained anchors; only failure still owns these descriptions.
    const cleanups: (() => void)[] = [closeAnchors, closeRawFiles];
    isClosed = true;
    if (evidence !== undefined) {
      const descriptor = evidence;
      evidence = undefined;
      cleanups.push(() => {
        closeSync(descriptor);
      });
    }
    if (state !== undefined) {
      const descriptor = state;
      state = undefined;
      cleanups.push(() => {
        closeSync(descriptor);
      });
    }
    const failures: unknown[] = [];
    for (const close of cleanups) {
      try {
        close();
      } catch (cleanupFailure) {
        failures.push(cleanupFailure);
      }
    }
    storageFailures.set(publicFailure, [cause, ...failures, raw]);
    throw publicFailure;
  }
}

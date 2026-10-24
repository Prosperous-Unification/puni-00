import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { fchmodSync, fsyncSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { join } from 'node:path';

import {
  type DependencyActivationReceipt,
  parseDependencyReceipt,
} from '@wbs/contracts/dependency-runtime';
import { snapshotDatabase, verifySnapshot } from '@wbs/store-sqlite/backup';
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
import type { EnvName } from './env';
import { assertSame, readRecord } from './managed-cohort';
import { writeNewMigrationCapture } from './migration-capture-file';

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
    try {
      inspectMain(main);
      const value = operation(accessPath);
      inspectMain(main);
      return value;
    } finally {
      closeSync(main);
    }
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
    closeSync(parent);
    throw cause;
  }
}
/** Exact retained bytes, never a freshly accepted tampered digest. */
export function hashActivationBytes(contents: string | Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex');
}

/** Real SQLite dispatch only through the original complete live interval. Partial commits are retained on every failure. */
export async function activateDependencyStores(
  owner: DependencyOwner,
  token: CompleteDependencyExclusion,
) {
  const scope = await assertCompleteDependencyExclusion(owner, token);
  const { layouts, request, deadline, attempt, directory, artifactDirectory } = scope;
  const anchors = new Map<EnvName, Awaited<ReturnType<typeof retainActivationDatabase>>>();
  const captures = new Map<EnvName, MigrationSetCapture>();
  const retained: { path: string; contents: string; identity: string }[] = [];
  const evidenceNames = new Set<string>();
  const backups: { path: string; sha256: string; bytes: number; identity: string }[] = [];
  let retainedEvidence = false;
  const committed: { environment: EnvName; receipt: DependencyActivationReceipt }[] = [];
  const commitRecords: { environment: EnvName; reference: { name: string; sha256: string } }[] = [];
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
        try {
          inspectDormantDependencies(database);
        } finally {
          database.close();
        }
      } else {
        const connection = openReadOnlyConnection(path);
        try {
          assertSame(
            { state: 'ENABLED', receipt },
            inspectDependencyActivation(connection.db),
            'independent activation authority',
          );
        } finally {
          connection.close();
        }
      }
    });
    checkDeadline();
  }
  async function inspectPublications() {
    inspectEvidence();
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
        await readRecord(publication.path),
        'retained activation evidence',
      );
    }
    for (const backup of backups) {
      inspectEvidence();
      const descriptor = openSync(
        `/proc/self/fd/${String(evidence)}/${basename(backup.path)}`,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const before = fstatSync(descriptor, { bigint: true });
        if (
          !before.isFile() ||
          (before.mode & 0o7777n) !== 0o600n ||
          inode(before) !== backup.identity
        )
          throw new Error('retained backup identity differs');
        const bytes = readFileSync(descriptor);
        if (
          bytes.length !== backup.bytes ||
          hashActivationBytes(bytes) !== backup.sha256 ||
          inode(fstatSync(descriptor, { bigint: true })) !== backup.identity
        )
          throw new Error('retained backup bytes differ');
      } finally {
        closeSync(descriptor);
      }
    }
    inspectEvidence();
    checkDeadline();
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
    const publication = await retainActivationRecord(owner, layouts, label, record);
    retained.push({
      ...publication,
      identity: inode(lstatSync(publication.path, { bigint: true })),
    });
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
      const path = `${evidencePath}/${env}.capture.json`;
      await writeNewMigrationCapture(
        `/proc/self/fd/${String(evidence)}/${env}.capture.json`,
        contents,
      );
      evidenceNames.add(`${env}.capture.json`);
      inspectEvidence();
      assertSame(
        contents,
        await readRecord(`/proc/self/fd/${String(evidence)}/${env}.capture.json`),
        'activation capture publication',
      );
      retained.push({ path, contents, identity: inode(lstatSync(path, { bigint: true })) });
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
        snapshotDatabase(sourcePath, backupAccess),
      );
      checkDeadline();
      evidenceNames.add(`${env}.before.sqlite`);
      inspectEvidence();
      const backup = openSync(
        backupAccess,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let backupIdentity: string;
      try {
        const observed = fstatSync(backup, { bigint: true });
        if (!observed.isFile()) throw new Error('activation backup is not a regular file');
        backupIdentity = inode(observed);
        fchmodSync(backup, 0o600);
        fsyncSync(backup);
      } finally {
        closeSync(backup);
      }
      fsyncSync(evidence);
      const verified = verifySnapshot(backupAccess);
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
      try {
        inspectDormantDependencies(copied);
      } finally {
        copied.close();
      }
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
      await retain('intent', {
        format: 'dependency-activation-intent',
        version: 1,
        environment: env,
        receipt,
        participantRecord,
        capture: preparation.capture,
        backup: preparation.backup,
        migrationManifestSha256: request.migrations.manifestSha256,
      });
      await inspectRetained();
      assertSame(
        preparation.snapshot,
        verifySnapshot(preparation.snapshot.path),
        'retained activation backup',
      );
      inspectLedger(env);
      inspectAuthority(env);
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
        checkDeadline();
        for (const env of ['prod', 'dev'] as const) {
          const authority = expected.get(env);
          const captured = original(env);
          if (authority === undefined) throw new Error('expected store authority absent');
          const anchored = retainActivationDatabase(scope.databases[env]);
          try {
            anchored.withPath((path) => {
              if (authority.state === 'ENABLED') {
                const connection = openReadOnlyConnection(path);
                try {
                  assertSame(
                    authority,
                    inspectDependencyActivation(connection.db),
                    'restoration exact activation receipt',
                  );
                } finally {
                  // Proof: omitting this close exposed real SQLite/main/WAL/SHM descriptors at the next awaited owner boundary; prepared-store lifetime test failed its empty-FD assertion.
                  connection.close();
                }
              } else {
                const database = openReadOnlyDatabase(path);
                try {
                  // Proof: omitting this post-finalizer check admitted a nonselected ENABLED marker; prepared-store lifetime negative missed its rejection.
                  inspectDormantDependencies(database);
                } finally {
                  database.close();
                }
              }
              const current = captureAppliedMigrationSet(path, artifactDirectory, {
                target: captured.target,
                attempt: captured.attempt,
                candidate: captured.candidate,
              });
              // Proof: omitting this comparison admitted a deleted valid migration row after finalizers; prepared-store lifetime negative missed its rejection.
              assertSame(captured, current, 'restoration complete migration ledger');
            });
          } finally {
            anchored.close();
          }
          checkDeadline();
        }
        await assertDependencyOwner(owner, layouts.prod, request.owner.sha);
        await assertDependencyOwner(owner, layouts.dev, request.owner.sha);
      } catch {
        throw new DependencyActivationFailure(
          attempt,
          'restoration-store-readback',
          undefined,
          scope.committed,
        );
      }
    };
    retainedEvidence = true;
    return {
      receipts: committed,
      participantRecord,
      commitRecords,
      stores: Object.freeze({ inspect: inspectStores }),
      evidence: {
        inspect: inspectPublications,
        close: () => {
          if (evidence === undefined || state === undefined)
            throw new Error('activation evidence monitor closed');
          closeSync(evidence);
          closeSync(state);
          evidence = undefined;
          state = undefined;
        },
      },
    };
  } catch {
    // Private SQL/config/transport causes never escape; durable intent and prior committed stores remain monotone.
    throw new DependencyActivationFailure(attempt, stage, environment, scope.committed);
  } finally {
    for (const anchored of anchors.values()) anchored.close();
    if (!retainedEvidence) {
      if (evidence !== undefined) closeSync(evidence);
      if (state !== undefined) closeSync(state);
    }
  }
}

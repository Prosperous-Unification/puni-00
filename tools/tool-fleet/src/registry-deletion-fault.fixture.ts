import { constants } from 'node:fs';
import { appendFile, lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';

import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { executeRegistryHostAction } from './registry-maintenance-actions';

/**
 * Fixed private unsafe-GC witness. Real root dispatch still admits collection before the exact
 * pinned child argv gains the forbidden flag. Native PID and terminal status are observed;
 * admission/spawn/nonzero failures never establish the required successful unsafe collection.
 */
export async function collectRegistryUnsafeFixture(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  // Proof: unsafe dispatch root/action/topology removals accept each forbidden modeled caller.
  if (
    process.getuid?.() !== 0 ||
    input.request.action !== 'collect' ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-unsafe-gc\0'
  )
    throw new Error('Unsafe collection requires exact private fixture');
  const spawn = Bun.spawn;
  let started = false;
  let pid: number | null = null;
  let owned: Pick<Bun.Subprocess, 'exitCode' | 'exited'> | undefined;
  // Boundary: the native overloaded call is forwarded unchanged except the one fixed GC argv;
  // options, returned child and all unrelated child effects retain their actual identities.
  Bun.spawn = ((...arguments_: unknown[]) => {
    const command = arguments_[0];
    if (
      Array.isArray(command) &&
      command[0] === input.installed.distribution.path &&
      command[1] === 'garbage-collect'
    ) {
      // Proof: duplicate/config removals accept a second or differently configured actual-call substitute.
      if (
        started ||
        command.length !== 3 ||
        command[2] !== input.installed.deletionConfiguration.path
      )
        throw new Error('Unsafe fixture refuses another GC command');
      // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
      const child = Reflect.apply(spawn, Bun, [
        [command[0], command[1], '--delete-untagged', command[2]],
        ...arguments_.slice(1),
      ]) as ReturnType<typeof spawn>;
      // Proof: GC PID removal accepts zero; fixture observes only a returned native child capability.
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
        throw new Error('Unsafe fixture lacks actual GC child identity');
      pid = child.pid;
      started = true;
      owned = child;
      return child;
    }
    // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
    return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
  }) as typeof Bun.spawn;
  let receipt: string | undefined;
  let failure: { cause: unknown } | undefined;
  try {
    receipt = await executeRegistryHostAction(input);
  } catch (cause) {
    failure = { cause };
  } finally {
    Bun.spawn = spawn;
  }
  try {
    // Proof: a genuinely pending exited promise refuses within50ms; removing this guard leaves observation pending. The no-child test requires the exact refusal and null receipt; an unsafe optional-chain rewrite fails it.
    const exitCode =
      owned === undefined ? null : owned.exitCode === null ? null : await owned.exited;
    await appendFile(
      '/root/task8-fixture/deletion-fault.log',
      JSON.stringify({ unsafeGc: { started, pid, exitCode } }) + '\n',
      { mode: 0o600 },
    );
    if (failure !== undefined) throw failure.cause;
    // Proof: success-guard removal accepts absent child and nonzero GC; spawn restoration is separately removed.
    // Boundary: the captured native spawn updates started while its dispatcher is awaited.
    if (!(started as boolean) || exitCode !== 0 || receipt === undefined)
      throw new Error('Unsafe GC did not complete successfully');
    return receipt;
  } catch (cause) {
    if (failure !== undefined && cause !== failure.cause)
      // Proof: reporter-preservation removal loses the original modeled admission failure.
      throw new AggregateError(
        [failure.cause, cause],
        'Unsafe GC dispatch and observation failed',
        { cause: cause },
      );
    throw cause;
  }
}

/** Exact owned post-unlink tag failure is injected only after the real isolated server is ready. Pinned Distribution creates0600 under the ordinary guard umask077 and0644 under022; only those original modes are admitted, required unchanged at ready, and restored exactly after actual server/group termination. */
export async function failRegistryTagCleanupFixture(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  let stage: RegistryTagFailureStage = 'caller';
  let metadata: RegistryTagLinkObservation | null = null;
  let firstFailure: { stage: RegistryTagFailureStage; cause: unknown } | undefined;
  try {
    if (
      process.getuid?.() !== 0 ||
      input.request.action !== 'serve-deletion' ||
      ![
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-cleanup\0',
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-tag-recovery\0',
        // Proof (required-positive dependency): removing this exact mode makes registry-tag-cleanup.test.ts refuse the authorized restore prelude; no broader topology admission is claimed.
        '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-restore-kill\0',
      ].includes(await readFile('/proc/1/cmdline', 'utf8'))
    )
      throw new Error('Tag fault requires exact private fixture');
    // Proof: tag backup/plan/pending removals reach injection without the required durable lineage.
    stage = 'backup';
    // Boundary: retain refusal for a missing external fixture journal field despite the declared parsed shape.
    const evidence = input.journal.maintenanceEvidence as
      typeof input.journal.maintenanceEvidence | undefined;
    const backup = evidence?.backup;
    const storage = input.installed.ordinary;
    if (
      evidence === null ||
      evidence === undefined ||
      backup === null ||
      backup === undefined ||
      evidence.operationId !== input.request.operationId ||
      input.journal.maintenance?.phase !== 'deleting' ||
      backup.registryId !== input.journal.enrollment.registryId ||
      backup.storageId !== storage.storageId ||
      backup.registryPath !== storage.path ||
      backup.journalPath !== input.installed.journalPath ||
      input.journal.enrollment.registryPath !== storage.path ||
      input.journal.enrollment.storageId !== storage.storageId
    )
      throw new Error('Tag fault lacks matching durable backup');
    stage = 'pending';
    const deletion = evidence.deletions.at(0);
    if (
      evidence.deletions.length !== 1 ||
      deletion?.state !== 'pending' ||
      deletion.repository !== 'retained/expired' ||
      deletion.tags.length !== 1 ||
      deletion.tags[0] !== 'expired' ||
      !/^sha256:[a-f0-9]{64}$/.test(deletion.digest) ||
      evidence.plan === null
    )
      throw new Error('Tag fault lacks exact pending deletion');
    stage = 'plan';
    const plan = type({
      retireRevisions: type({ repository: 'string', digest: 'string' }).array().exactlyLength(1),
    }).assert(JSON.parse(evidence.plan));
    if (
      plan.retireRevisions[0]?.repository !== deletion.repository ||
      plan.retireRevisions[0]?.digest !== deletion.digest
    )
      throw new Error('Tag fault differs from durable plan');
    const manifests = join(
      storage.path,
      'docker/registry/v2/repositories/retained/expired/_manifests',
    );
    const path = join(manifests, 'tags/expired/current/link');
    const revision = join(manifests, 'revisions/sha256', deletion.digest.slice(7), 'link');
    stage = 'open';
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let injected = false;
    let receipt: string | undefined;
    let failure: { cause: unknown } | undefined;
    let completion: { state: 'verified'; receipt: string } | { state: 'failed'; cause: unknown };
    try {
      // Proof: owner/bytes removals lose the required pre-ready refusal and reach later partial-unlink refusal, not success.
      stage = 'metadata';
      const before = await file.stat();
      // Proof: pinned Distribution022/077 produces0644/0600; the old644-only fixture rejects the actual0600 file case, and removing this safe-mode condition admits0666.
      const originalMode = before.mode & 0o7777;
      metadata = {
        regular: before.isFile(),
        uid59001: before.uid === 59001,
        gid59001: before.gid === 59001,
        singleLink: before.nlink === 1,
        digestSize: before.size === 71,
        mode: before.mode & 0o7777,
      };
      if (
        !before.isFile() ||
        before.uid !== 59001 ||
        before.gid !== 59001 ||
        before.nlink !== 1 ||
        (originalMode !== 0o600 && originalMode !== 0o644) ||
        before.size !== 71
      )
        throw new Error('Tag fault requires exact owned link metadata');
      stage = 'bytes';
      const bytes = Buffer.alloc(72);
      const read = await file.read(bytes, 0, bytes.length, 0);
      if (
        read.bytesRead !== 71 ||
        bytes.subarray(0, 71).toString('ascii') !== deletion.digest ||
        (await readFile(revision, 'utf8')) !== deletion.digest
      )
        throw new Error('Tag fault requires original revision and tag bytes');
      const ready = input.ready;
      const spawn = Bun.spawn;
      let server: Pick<Bun.Subprocess, 'pid' | 'exitCode' | 'signalCode'> | undefined;
      let termination: { code: number; signal: NodeJS.Signals | null } | undefined;
      // Boundary: capture only the actual fixed native server child; all other calls and options are forwarded unchanged.
      Bun.spawn = ((...arguments_: unknown[]) => {
        const command = arguments_[0];
        if (
          Array.isArray(command) &&
          command[0] === input.installed.distribution.path &&
          command[1] === 'serve'
        ) {
          const options = type({ uid: '59001', gid: '59001', detached: 'true' }).assert(
            arguments_[1],
          );
          if (
            server !== undefined ||
            command.length !== 3 ||
            command[2] !== input.installed.deletionConfiguration.path ||
            // Boundary: the parsed literal type must not erase this independent fixed-launch precondition.
            !(options.detached as boolean)
          )
            throw new Error('Tag fault server launch differs');
          // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
          const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
          if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
            throw new Error('Tag fault server PID is invalid');
          server = child;
          void child.exited.then((code: number) => {
            termination = { code, signal: child.signalCode };
          });
          return child;
        }
        // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
        return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
      }) as typeof Bun.spawn;
      try {
        stage = 'dispatch';
        receipt = await executeRegistryHostAction({
          ...input,
          ready: async (message) => {
            stage = 'ready-server';
            if (
              server === undefined ||
              termination !== undefined ||
              server.exitCode !== null ||
              server.signalCode !== null
            )
              throw new Error('Tag fault server is not live');
            // Proof: UID removal accepts modeled root server; inode removal reaches ready with the replaced link still0644.
            stage = 'ready-owner';
            const status = await readFile('/proc/' + String(server.pid) + '/status', 'utf8');
            if (
              !/^Uid:\s+59001\s+59001\s+59001\s+59001$/m.test(status) ||
              !/^Gid:\s+59001\s+59001\s+59001\s+59001$/m.test(status) ||
              // Boundary: native child status getters and the exit callback can change during the awaited proc read.
              (server.exitCode as number | null) !== null ||
              (server.signalCode as NodeJS.Signals | null) !== null ||
              (termination as { code: number; signal: NodeJS.Signals | null } | undefined) !==
                undefined
            )
              throw new Error('Tag fault requires actual UID59001 server');
            // Proof: removing exact mode comparison admits a0600-to0644 drift between capture and ready.
            stage = 'ready-link';
            const current = await lstat(path);
            if (
              injected ||
              current.dev !== before.dev ||
              current.ino !== before.ino ||
              current.nlink !== 1 ||
              (current.mode & 0o7777) !== originalMode ||
              current.size !== before.size
            )
              throw new Error('Tag fault link changed before ready');
            stage = 'inject';
            await file.chmod(0);
            injected = true;
            stage = 'ready-publish';
            await ready(message);
            stage = 'dispatch';
          },
        });
      } catch (cause) {
        failure = { cause };
        // Proof (fixture diagnostic): removing this capture reports cleanup/postconditions instead of the actual dispatch or ready failure.
        firstFailure ??= { stage, cause };
      } finally {
        Bun.spawn = spawn;
      }
      stage = 'post-observation';
      let revisionAbsent = false,
        tagUnchanged = false;
      // Proof: signaled real Bun child exited137 with exitCode null; modeled unconfirmed-child removal wrongly certifies completion.
      const serverTerminal = termination !== undefined;
      let groupAbsent = false;
      let observationFailure: { cause: unknown } | undefined;
      try {
        if (server !== undefined) {
          try {
            process.kill(-server.pid, 0);
          } catch (cause) {
            if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
            groupAbsent = true;
          }
        }
        // Proof: live-group/EPERM removals accept uncertain cleanup; exact-group observation never treats unknown errno as absence.
        // Boundary: the ready callback updates injected during the awaited dispatcher.
        if ((injected as boolean) && (!serverTerminal || !groupAbsent))
          throw new Error('Tag fault server cleanup is unconfirmed');
        // Boundary: the ready callback updates this boolean before post-dispatch observation.
        if (injected as boolean) {
          try {
            await lstat(revision);
          } catch (cause) {
            if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
              throw cause;
            revisionAbsent = true;
          }
          const current = await lstat(path);
          const after = await file.stat();
          const read = await file.read(bytes, 0, bytes.length, 0);
          tagUnchanged =
            current.dev === before.dev &&
            current.ino === before.ino &&
            current.nlink === 1 &&
            after.uid === 59001 &&
            after.gid === 59001 &&
            (after.mode & 0o7777) === 0 &&
            after.size === 71 &&
            read.bytesRead === 71 &&
            bytes.subarray(0, 71).toString('ascii') === deletion.digest;
        }
      } catch (cause) {
        observationFailure = { cause };
        // Proof (fixture diagnostic): removal loses post-observation for unconfirmed/live/access failures.
        firstFailure ??= { stage, cause };
      }
      // A dispatcher cleanup error is not terminal proof: leave000 until the actual child and exact group are absent.
      // Proof: independently removing terminal/group restore gates changes owned link000 to0644 while cleanup is unconfirmed.
      // Boundary: the callback-updated boolean still participates in both terminal/group restore gates.
      const mayRestore = (injected as boolean) && serverTerminal && groupAbsent;
      stage = 'restore';
      let restoredMode: number | null = null;
      if (mayRestore) {
        await file.chmod(originalMode);
        // Proof: removed mode observation accepts no-op/widening restoration; deleting chmod or forcing0644 fails the actual-file600 positive.
        restoredMode = (await file.stat()).mode & 0o7777;
        if (restoredMode !== originalMode)
          throw new Error('Tag link mode restoration is unconfirmed');
      }
      stage = 'report';
      await appendFile(
        '/root/task8-fixture/deletion-fault.log',
        JSON.stringify({
          tagCleanup: {
            injected,
            revisionAbsent,
            tagUnchanged,
            modeRestored: mayRestore,
            originalMode,
            restoredMode,
            serverPid: server?.pid ?? null,
            serverTerminal,
            serverExitCode: termination?.code ?? null,
            serverSignal: termination?.signal ?? null,
            groupAbsent,
          },
        }) + '\n',
        { mode: 0o600 },
      );
      stage = 'postconditions';
      if (observationFailure !== undefined) throw observationFailure.cause;
      if (failure !== undefined) throw failure.cause;
      // Proof: partial-state removal accepts no ready injection or no unlink; byte/ENOENT guards have separate changed/access witnesses.
      // Boundary: ready owns the true assignment; retain its post-dispatch boolean domain.
      if (!(injected as boolean) || !revisionAbsent || !tagUnchanged || receipt === undefined)
        throw new Error('Tag cleanup fault lacks actual partial unlink');
      completion = { state: 'verified', receipt };
    } catch (cause) {
      // Proof: reporter/restore/close removals lose the original dispatch failure; all such errors remain failures.
      // Proof (fixture diagnostic): removal lets descriptor close overwrite metadata, report, restore and postcondition failures.
      firstFailure ??= { stage, cause };
      const preserved =
        failure !== undefined && cause !== failure.cause
          ? new AggregateError([failure.cause, cause], 'Tag dispatch and observation failed')
          : cause;
      completion = { state: 'failed', cause: preserved };
    }
    try {
      // Proof (fixture diagnostic): removing this assignment mislabels an otherwise successful dispatch followed by close failure.
      if (firstFailure === undefined) stage = 'close';
      await file.close();
    } catch (cause) {
      // Proof: omitting this aggregation loses the exact original dispatch failure in the existing close case.
      if (completion.state === 'failed')
        throw new AggregateError(
          [completion.cause, cause],
          'Tag observation and descriptor cleanup failed',
          { cause: cause },
        );
      throw cause;
    }
    // Proof: omitting this rethrow certifies the existing dispatch refusal as a completed observation.
    if (completion.state === 'failed') throw completion.cause;
    return completion.receipt;
  } catch (cause) {
    // Proof (fixture diagnostic): omitted association loses the stage; injected filesystem reporting violates all three forbidden-topology no-I/O assertions.
    if (cause instanceof Error)
      tagFailures.set(cause, {
        stage: firstFailure?.stage ?? stage,
        metadata,
        cause: firstFailure?.cause ?? cause,
      });
    throw cause;
  }
}

type RegistryTagFailureStage =
  | 'caller'
  | 'backup'
  | 'pending'
  | 'plan'
  | 'open'
  | 'metadata'
  | 'bytes'
  | 'dispatch'
  | 'ready-server'
  | 'ready-owner'
  | 'ready-link'
  | 'inject'
  | 'ready-publish'
  | 'post-observation'
  | 'restore'
  | 'report'
  | 'postconditions'
  | 'close';
interface RegistryTagLinkObservation {
  regular: boolean;
  uid59001: boolean;
  gid59001: boolean;
  singleLink: boolean;
  digestSize: boolean;
  mode: number;
}
const tagFailures = new WeakMap<
  Error,
  { stage: RegistryTagFailureStage; metadata: RegistryTagLinkObservation | null; cause: unknown }
>();

/** Trusted root fixture export reads only fixed stage, already-observed link metadata and bounded numeric error clues; topology refusal performs no diagnostic filesystem I/O. */
export function describeRegistryTagFailure(cause: unknown) {
  const failure = cause instanceof Error ? tagFailures.get(cause) : undefined;
  if (failure === undefined) return null;
  // Proof (fixture diagnostic): missing metadata delivery and raw private-text reflection fail the exact observation assertions.
  return {
    stage: failure.stage,
    metadata: failure.metadata,
    ...describeRegistryGuardObservationFailure(failure.cause),
  };
}

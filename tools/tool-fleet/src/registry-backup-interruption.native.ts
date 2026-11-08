import { createHash } from 'node:crypto';
import { closeSync, constants, openSync } from 'node:fs';
import { open, readdir, readFile, readlink, stat, writeFile } from 'node:fs/promises';

import { type } from 'arktype';
import { dlopen, read as memory } from 'bun:ffi';

import { readRegistryBackupGuardian, type RegistryBackupGuardian } from './registry-backup-attempt';
import { requireRegistryBackupTerminal } from './registry-backup-terminal.fixture';
import { describeRegistryGuardObservationFailure } from './registry-guard-observation.fixture';
import { prepareRegistryHostFixture } from './registry-maintenance-host.fixture';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournalPorts,
} from './registry-managed-journal';
import { observeRegistryPopulationOutput } from './registry-population-diagnostics.fixture';

export interface RegistryBackupFaultProcess {
  pid: number;
  startTicks: string;
  parent: number;
  group: number;
  command: string;
}

/** Exact private-fixture process comparison before signaling an already observed owned backup; never a request-selected PID authority. */
export function requireRegistryBackupFaultProcess(
  observed: RegistryBackupFaultProcess,
  expected: RegistryBackupFaultProcess,
): void {
  // Proof (fixture comparison): removing each PID/start/parent/group/command predicate admits its changed identity in registry-backup-interruption.test.ts.
  if (
    observed.pid !== expected.pid ||
    observed.startTicks !== expected.startTicks ||
    observed.parent !== expected.parent ||
    observed.group !== expected.group ||
    observed.command !== expected.command
  )
    throw new Error('Exact owned backup process identity changed');
}

/** Kernel pending SIGINT observation on a stopped owned restic; absent/malformed status is not evidence of pending delivery. */
export function hasRegistryBackupInterrupt(status: string): boolean {
  const state = /^State:[ \t]+([A-Zt])[ \t]/m.exec(status);
  const pending = /^SigPnd:[ \t]+([a-f0-9]{16})$/m.exec(status);
  const shared = /^ShdPnd:[ \t]+([a-f0-9]{16})$/m.exec(status);
  if (state?.[1] !== 'T' || pending?.[1] === undefined || shared?.[1] === undefined)
    throw new Error('Stopped backup signal state is unproved');
  return ((BigInt('0x' + pending[1]) | BigInt('0x' + shared[1])) & 2n) !== 0n;
}

const faultHome = '/root/task8-fixture';
const faultJournal = '/var/lib/puni-registry/journal/contents';
const faultBundle = '/usr/local/libexec/puni-registry-maintenance/proof.js';
export type RegistryBackupInterruption = 'owner-eof' | 'guardian-eof' | 'deadline';

interface BackupEffect {
  guardian: RegistryBackupFaultProcess;
  worker: RegistryBackupFaultProcess;
  restic: RegistryBackupFaultProcess;
  lockId: string;
  attemptId: string;
}

type BackupObservationRole =
  | 'prepared-guardian'
  | 'marker-worker'
  | 'candidate-child'
  | 'signal-target'
  | 'descriptor-worker'
  | 'orphan-worker'
  | 'selected-guardian'
  | 'pre-kill-guardian';

async function observeBackupProcess(
  pid: number,
  role: BackupObservationRole,
): Promise<RegistryBackupGuardian> {
  // Proof (fixture diagnostic): last-input/UID/GID/enum/predicate/readlink removals change exact observations; original/logger-error removals lose required errors in registry-backup-process-observation.test.ts.
  let uidRoot: boolean | null = null,
    gidRoot: boolean | null = null,
    live: boolean | null = null;
  let state: string | null = null;
  try {
    return await readRegistryBackupGuardian(pid, async (path) => {
      const text = ['/proc/self/ns/pid', '/proc/self'].includes(path)
        ? await readlink(path)
        : await readFile(path, 'utf8');
      if (path === `/proc/${String(pid)}/status`) {
        uidRoot = /^Uid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(text);
        gidRoot = /^Gid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(text);
      } else if (path === `/proc/${String(pid)}/stat`) {
        const observed = text
          .slice(text.lastIndexOf(') ') + 2)
          .trim()
          .split(/\s+/)
          .at(0);
        live = ['R', 'S', 'D', 'T', 't', 'I'].includes(observed ?? '');
        state =
          observed !== undefined && ['R', 'S', 'D', 'T', 't', 'I', 'Z', 'X', 'x'].includes(observed)
            ? observed
            : 'other';
      }
      return text;
    });
  } catch (cause) {
    // Proof (whole-module modeled proc): dropping Error admission reports a forged non-Error refusal in the opaque process-reader case.
    if (cause instanceof Error && cause.message === 'Guardian is not a live current root process') {
      try {
        console.log(
          JSON.stringify({ backupProcessObservation: { role, uidRoot, gidRoot, live, state } }),
        );
      } catch (observationFailure) {
        throw new AggregateError([cause, observationFailure], 'Fixed process observation failed', {
          cause: observationFailure,
        });
      }
    }
    throw cause;
  }
}

/** Observe the exact root process twice around stat/argv reads; changed identity or start ticks refuses the private fixture observation. */
export async function readFaultProcess(
  pid: number,
  role: BackupObservationRole,
): Promise<RegistryBackupFaultProcess> {
  const before = await observeBackupProcess(pid, role);
  const [serialized, command] = await Promise.all([
    readFile(`/proc/${String(pid)}/stat`, 'utf8'),
    readFile(`/proc/${String(pid)}/cmdline`, 'utf8'),
  ]);
  const fields = serialized
    .slice(serialized.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/);
  const after = await observeBackupProcess(pid, role);
  // Proof (whole-module modeled proc): identity-gap and stat-gap each fail when their own comparison term is removed from the process snapshot guard.
  if (JSON.stringify(before) !== JSON.stringify(after) || fields[19] !== after.startTicks)
    throw new Error('Owned backup changed during process observation');
  return {
    pid,
    startTicks: after.startTicks,
    parent: Number(fields[1]),
    group: Number(fields[2]),
    command,
  };
}

/** Select one prepared guardian, exact worker and pinned restic command with a matching ciphertext lock before any fixture signal. ENOENT converges within the existing owner/deadline bound; ambiguous or changed state refuses. */
export async function findBackupEffect(isOwnerFinished: () => boolean): Promise<BackupEffect> {
  const deadline = performance.now() + 90000;
  for (;;) {
    if (isOwnerFinished() || performance.now() >= deadline)
      throw new Error('Actual backup effect boundary was not reached');
    const journal = parseRegistryCommandResponse({
      state: JSON.parse(await readFile(faultJournal + '/journal.json', 'utf8')),
    } satisfies { state: unknown }).state;
    if (journal.schemaVersion !== 4) throw new Error('Backup fault requires schema4 journal');
    const attempts =
      journal.maintenanceEvidence?.backupAttempts.filter(
        (attempt) => attempt.action === 'backup-snapshot' && attempt.state === 'prepared',
      ) ?? [];
    if (attempts.length > 1) throw new Error('Ambiguous prepared backup snapshot');
    const attempt = attempts.at(0);
    if (attempt !== undefined) {
      try {
        const guardian = await readFaultProcess(attempt.guardian.pid, 'prepared-guardian');
        requireRegistryBackupFaultProcess(guardian, {
          ...guardian,
          startTicks: attempt.guardian.startTicks,
          command: process.execPath + '\0/usr/local/libexec/puni-registry-maintenance/host.js\0',
        });
        const workers: RegistryBackupFaultProcess[] = [];
        for (const name of await readdir(faultHome + '/workers')) {
          if (!/^[1-9][0-9]*\.json$/.test(name)) continue;
          const marker = type({
            pid: 'number.safe > 0',
            parent: 'number.safe > 0',
            startTicks: /^[1-9][0-9]*$/,
            '+': 'reject',
          }).assert(JSON.parse(await readFile(faultHome + '/workers/' + name, 'utf8')));
          if (marker.parent !== guardian.pid) continue;
          const worker = await readFaultProcess(marker.pid, 'marker-worker');
          requireRegistryBackupFaultProcess(worker, {
            ...worker,
            parent: guardian.pid,
            group: worker.pid,
            startTicks: marker.startTicks,
            command:
              process.execPath +
              '\0/usr/local/libexec/puni-registry-maintenance/backup-worker.js\0',
          });
          workers.push(worker);
        }
        if (workers.length > 1) throw new Error('Ambiguous owned backup worker');
        const worker = workers.at(0);
        if (worker !== undefined) {
          const children = new Set<number>();
          for (const thread of await readdir(`/proc/${String(worker.pid)}/task`)) {
            const observed = (
              await readFile(`/proc/${String(worker.pid)}/task/${thread}/children`, 'utf8')
            ).trim();
            if (observed !== '' && !/^[1-9][0-9]*( [1-9][0-9]*)*$/.test(observed))
              throw new Error('Malformed worker child census');
            if (observed !== '') for (const pid of observed.split(' ')) children.add(Number(pid));
          }
          const expected = [
            '/root/.puni/tools/restic-0.19.1',
            '--no-cache',
            'backup',
            '--json',
            '--host',
            journal.enrollment.registryId,
            '--tag',
            'puni-registry-' + attempt.operationId,
            '--',
            journal.enrollment.registryPath,
            faultJournal,
            '',
          ].join('\0');
          const members: RegistryBackupFaultProcess[] = [];
          for (const pid of children) {
            const command = await readFile(`/proc/${String(pid)}/cmdline`, 'utf8');
            // Proof: selector oversize removal loses this explicit byte-bound refusal and reaches the later effect-loop refusal.
            if (Buffer.byteLength(command) > 4096)
              throw new Error('Backup candidate command exceeds bound');
            // Proof: removing exact preselection makes the actual selector reject an unrelated zombie before reaching the live backup. Nonmatches prove no process absence.
            if (command !== expected) continue;
            const member = await readFaultProcess(pid, 'candidate-child');
            requireRegistryBackupFaultProcess(member, {
              ...member,
              parent: worker.pid,
              group: worker.pid,
              // Proof: selector changed-command resolves incorrectly when this fresh argv comparison is removed.
              command: expected,
            });
            members.push(member);
          }
          if (members.length > 1) throw new Error('Ambiguous exact restic backup member');
          const restic = members.at(0);
          const locks = (await readdir(faultHome + '/repository/locks')).filter((name) =>
            /^[a-f0-9]{64}$/.test(name),
          );
          if (locks.length > 1) throw new Error('Ambiguous actual backup lock');
          const lockId = locks.at(0);
          if (
            restic !== undefined &&
            lockId !== undefined &&
            createHash('sha256')
              .update(await readFile(faultHome + '/repository/locks/' + lockId))
              .digest('hex') === lockId
          )
            return { guardian, worker, restic, lockId, attemptId: attempt.id };
        }
      } catch (cause) {
        // Proof: selector missing-once fails when this existing ENOENT convergence is removed. A startup child may terminate before selection; missing tasks never authorize a signal.
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    }
    await Bun.sleep(10);
  }
}

async function signalBackupProcess(
  processIdentity: RegistryBackupFaultProcess,
  signal: 'SIGSTOP' | 'SIGCONT' | 'SIGKILL',
) {
  requireRegistryBackupFaultProcess(
    await readFaultProcess(processIdentity.pid, 'signal-target'),
    processIdentity,
  );
  process.kill(processIdentity.pid, signal);
}

async function requireWorkerDescriptor(worker: RegistryBackupFaultProcess): Promise<void> {
  requireRegistryBackupFaultProcess(
    await readFaultProcess(worker.pid, 'descriptor-worker'),
    worker,
  );
  const [canonical, inherited, information] = await Promise.all([
    stat(faultJournal + '/authority.lock'),
    stat(`/proc/${String(worker.pid)}/fd/3`),
    readFile(`/proc/${String(worker.pid)}/fdinfo/3`, 'utf8'),
  ]);
  if (
    canonical.dev !== inherited.dev ||
    canonical.ino !== inherited.ino ||
    !/^lock:.*FLOCK\s+ADVISORY\s+WRITE\s/m.test(information)
  )
    throw new Error('Actual worker lacks canonical held descriptor');
}

/** Reap only the previously observed worker identity; ECHILD still requires independent proc and group absence. Unexpected errno or a surviving group refuses, and the native handle always closes. */
export async function reapBackupWorker(worker: RegistryBackupFaultProcess): Promise<void> {
  const native = dlopen('libc.so.6', {
    waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' },
    __errno_location: { args: [], returns: 'ptr' },
  });
  try {
    const deadline = performance.now() + 10000;
    for (;;) {
      let serialized: string;
      try {
        serialized = await readFile(`/proc/${String(worker.pid)}/stat`, 'utf8');
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') break;
        throw cause;
      }
      const fields = serialized
        .slice(serialized.lastIndexOf(') ') + 2)
        .trim()
        .split(/\s+/);
      if (fields[19] !== worker.startTicks) throw new Error('Worker PID reused before exact reap');
      const waited = native.symbols.waitpid(worker.pid, null, 1);
      if (waited === -1) {
        const address = native.symbols.__errno_location();
        // Proof (whole-module modeled fixture): removing errno refusal accepts EINVAL; ECHILD still requires independent proc/group absence.
        if (address === null || memory.i32(address) !== 10)
          throw new Error('Exact worker waitpid failed unexpectedly');
        // ECHILD is only a nonchild observation; the next proc read and final group check must still independently establish absence.
      }
      if (performance.now() >= deadline) throw new Error('Exact orphan backup worker not reaped');
      await Bun.sleep(5);
    }
    let absent = false;
    try {
      process.kill(-worker.group, 0);
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') absent = true;
      else throw cause;
    }
    if (!absent) throw new Error('Owned backup process group remains');
  } finally {
    native.close();
  }
}

/** Signal only fresh exact owned processes in the asserted private PID1 fixture. SIGSTOP holds a real backup at its ciphertext-lock boundary; the production guardian/worker decide cancellation and cleanup. */
export async function interruptRegistryBackup(
  mode: RegistryBackupInterruption,
  owner: Pick<Bun.Subprocess, 'pid' | 'kill'> & { startTicks: string },
  isOwnerFinished: () => boolean,
  probe: () => Promise<void>,
): Promise<{
  pid: number;
  parent: number;
  startTicks: string;
  lockId: string;
  attemptId: string;
  resticPid: number;
  mode: RegistryBackupInterruption;
  elapsedMilliseconds: number;
}> {
  if (process.pid !== 1 || process.getuid?.() !== 0)
    throw new Error('Backup interruption requires private root PID1');
  const effect = await findBackupEffect(isOwnerFinished);
  // Proof (extracted fixture caller): bypassing either selected/pre-kill guardian observation reaches the modeled unobserved kill instead of its injected exact refusal.
  const state = await observeBackupProcess(effect.guardian.pid, 'selected-guardian');
  const verifyOwner = async () => {
    // Boundary: the exact owner batch must retain its missing-field refusal despite unchecked array-index types.
    const [status, serialized, command] = (await Promise.all(
      ['status', 'stat', 'cmdline'].map((name) =>
        readFile(`/proc/${String(owner.pid)}/${name}`, 'utf8'),
      ),
    )) as readonly (string | undefined)[];
    if (status === undefined || serialized === undefined || command === undefined)
      throw new Error('Missing exact owner observation');
    requireRegistryBackupOwner(status, serialized, command, owner.pid, owner.startTicks);
  };
  await verifyOwner();
  await writeFile(
    '/etc/puni/registry-backup-fault.json',
    JSON.stringify({ worker: effect.worker.pid, startTicks: effect.worker.startTicks }),
    { mode: 0o644, flag: 'wx' },
  );
  await signalBackupProcess(effect.restic, 'SIGSTOP');
  const stoppedDeadline = performance.now() + 2000;
  for (;;) {
    const tasks = await readdir(`/proc/${String(effect.restic.pid)}/task`);
    const statuses = await Promise.all(
      tasks.map((tid) => readFile(`/proc/${String(effect.restic.pid)}/task/${tid}/status`, 'utf8')),
    );
    if (statuses.length > 0 && statuses.every((status) => /^State:\s+T\b/m.test(status))) break;
    if (performance.now() >= stoppedDeadline)
      throw new Error('Owned restic did not stop completely');
    await Bun.sleep(5);
  }
  await requireWorkerDescriptor(effect.worker);
  const started = performance.now();
  if (mode === 'owner-eof') {
    await verifyOwner();
    owner.kill('SIGKILL');
  } else if (mode === 'guardian-eof') {
    if (
      JSON.stringify(await observeBackupProcess(effect.guardian.pid, 'pre-kill-guardian')) !==
      JSON.stringify(state)
    )
      throw new Error('Guardian identity changed before kill');
    await signalBackupProcess(effect.guardian, 'SIGKILL');
  }
  if (mode === 'deadline') await probe();
  const interruptDeadline = performance.now() + (mode === 'deadline' ? 130000 : 4000);
  for (;;) {
    if (
      hasRegistryBackupInterrupt(
        await readFile(`/proc/${String(effect.restic.pid)}/status`, 'utf8'),
      )
    )
      break;
    if (performance.now() >= interruptDeadline) {
      if (mode !== 'deadline') throw new Error('Owned restic pending SIGINT was not observed');
      const missing = new Error('Root maintenance deadline did not interrupt owned backup');
      try {
        // Proof (extracted rescue): removing both owner checks or any guardian/worker/restic route loses its modeled identity refusal.
        await verifyOwner();
        for (const identity of [effect.guardian, effect.worker, effect.restic])
          requireRegistryBackupFaultProcess(
            await readFaultProcess(identity.pid, 'signal-target'),
            identity,
          );
        // Proof: removing this second held-FD check loses the injected descriptor refusal.
        await requireWorkerDescriptor(effect.worker);
        // Proof: removing this fresh state/pending check admits modeled running or newly interrupted effects.
        if (
          hasRegistryBackupInterrupt(
            await readFile(`/proc/${String(effect.restic.pid)}/status`, 'utf8'),
          )
        )
          throw new Error('Pending interrupt appeared before deadline rescue');
        // Proof: byte-bound/schema removals admit their oversized-valid/extra-field records in the extracted rescue.
        const snapshotFailures = async () => {
          const text = await readFile(faultHome + '/failure.log', 'utf8');
          if (Buffer.byteLength(text) > 4096)
            throw new Error('Deadline rescue failure evidence exceeds bound');
          if (text === '') return [];
          return text
            .trim()
            .split('\n')
            .map((line) =>
              type({
                action: 'string',
                ownSignalAborted: 'boolean',
                rootDeadline: 'boolean',
                ownerCancellation: 'boolean',
                other: 'boolean',
                '+': 'reject',
              }).assert(JSON.parse(line)),
            )
            .filter((failure) => failure.action === 'backup-snapshot');
        };
        // Proof: removing this precondition accepts an already-failed snapshot as a missing-deadline witness.
        if ((await snapshotFailures()).length !== 0)
          throw new Error('Snapshot already failed before deadline rescue');
        console.log(
          JSON.stringify({
            backupDeadlineRescue: {
              stage: 'before-rescue',
              pendingSIGINT: false,
              rootDeadlineObserved: false,
              ownedIdentitiesFresh: true,
              workerHeldCanonicalDescriptor: true,
              elapsedMilliseconds: Math.round(performance.now() - started),
            },
          }),
        );
        await verifyOwner();
        owner.kill('SIGTERM');
        // Proof: removing awaited reaping loses its injected cleanup failure; no group-absence claim follows a failed reap.
        await reapBackupWorker(effect.worker);
        // Proof: owner-terminal removal admits a live owner; timeout removal reaches the explicit modeled loop rescue instead of this 2s refusal.
        const terminalDeadline = performance.now() + 2000;
        let failures;
        for (;;) {
          failures = await snapshotFailures();
          if (isOwnerFinished() && failures.length > 0) break;
          if (performance.now() >= terminalDeadline)
            throw new Error('Deadline rescue owner or failure evidence did not terminate');
          await Bun.sleep(5);
        }
        // Proof: independent count/aborted/root-deadline/owner-cancel/other removals each accept their invalid cancellation evidence.
        if (
          failures.length !== 1 ||
          !failures[0]?.ownSignalAborted ||
          failures[0].rootDeadline ||
          !failures[0].ownerCancellation ||
          failures[0].other
        )
          throw new Error('Deadline rescue was not exact owner cancellation');
        console.log(
          JSON.stringify({
            backupDeadlineRescue: {
              stage: 'after-rescue',
              ownerTerminal: true,
              exactGroupAbsent: true,
              rootDeadline: false,
              ownerCancellation: true,
              elapsedMilliseconds: Math.round(performance.now() - started),
            },
          }),
        );
      } catch (cause) {
        // Proof: dropping aggregation loses the original missing-deadline error on reporter failure.
        throw new AggregateError([missing, cause], 'Root deadline witness or owned rescue failed', {
          cause: cause,
        });
      }
      throw missing;
    }
    await Bun.sleep(5);
  }
  if (mode !== 'deadline') {
    const ownerDeadline = performance.now() + 2000;
    while (!isOwnerFinished()) {
      if (performance.now() >= ownerDeadline)
        throw new Error('Exact interrupted owner did not terminate');
      await Bun.sleep(5);
    }
    if (mode === 'guardian-eof') {
      try {
        await readFile(`/proc/${String(effect.guardian.pid)}/stat`, 'utf8');
        throw new Error('Exact root guardian still present before orphan-only contention');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    }
    const holder =
      mode === 'guardian-eof'
        ? requireRegistryBackupOrphan(
            await readFaultProcess(effect.worker.pid, 'orphan-worker'),
            effect.worker,
          )
        : effect.worker;
    await requireWorkerDescriptor(holder);
    await probe();
  }
  if (mode === 'owner-eof') await signalBackupProcess(effect.restic, 'SIGCONT');
  await reapBackupWorker(effect.worker);
  console.log(
    JSON.stringify({
      backupFault: {
        mode,
        pendingSIGINT: true,
        workerHeldCanonicalDescriptor: true,
        exactGroupAbsent: true,
        elapsedMilliseconds: Math.round(performance.now() - started),
      },
    }),
  );
  return {
    pid: effect.worker.pid,
    parent: effect.guardian.pid,
    startTicks: effect.worker.startTicks,
    lockId: effect.lockId,
    attemptId: effect.attemptId,
    resticPid: effect.restic.pid,
    mode,
    elapsedMilliseconds: Math.round(performance.now() - started),
  };
}

/** Two time-point contender proof, not a continuously sampled exclusion interval. The acquire callback executes inside the actual canonical authority lock. Only this offline T2 omits the optional ordinary-supervisor permit port; it does not prove ordinary CLI/permission behavior. */
export async function contendRegistryBackup(
  mode: 'probe' | 'acquire',
  ports: RegistryJournalPorts,
): Promise<void> {
  const expected = type({
    worker: 'number.safe > 0',
    startTicks: /^[1-9][0-9]*$/,
    '+': 'reject',
  }).assert(JSON.parse(await readFile('/etc/puni/registry-backup-fault.json', 'utf8')));
  if (mode === 'probe') {
    const descriptor = openSync(faultJournal + '/authority.lock', 'r+');
    const native = dlopen('libc.so.6', {
      flock: { args: ['i32', 'i32'], returns: 'i32' },
      __errno_location: { args: [], returns: 'ptr' },
    });
    try {
      const code = native.symbols.flock(descriptor, 2 | 4);
      const address = native.symbols.__errno_location();
      if (code !== -1 || address === null || memory.i32(address) !== 11)
        throw new Error('Actual backup authority was not contended');
    } finally {
      closeSync(descriptor);
      native.close();
    }
    console.log('backup-authority-contended');
    return;
  }
  // Boundary: The canonical journal callback records acquisition while its command is awaited.
  let acquired = false as boolean;
  const current = await executeRegistryCommand(
    faultJournal,
    { command: 'check-capacity' },
    {
      ...ports,
      // Proof (actual fixture caller): removing this offline-only omission invokes the absent ordinary supervisor and fails the real journal admission test.
      permit: undefined,
      measureJournal: async (enrollment) => {
        let absent = false;
        try {
          process.kill(-expected.worker, 0);
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') absent = true;
          else if (!(cause instanceof Error && 'code' in cause && cause.code === 'EPERM'))
            throw cause;
        }
        if (!absent) throw new Error('Authority acquired with owned backup group remaining');
        acquired = true;
        return ports.measureJournal(enrollment);
      },
    },
  );
  if (!acquired || !current.state.fenced)
    throw new Error('Missing fenced acquired authority observation');
  console.log('backup-authority-acquired-after-group-absence');
}

/** Read the fixed root-owned terminal receipt with no-follow/nonblocking open, validated metadata and a 4096-byte growth bound. Missing/unreadable input throws; every acquired descriptor closes. */
export async function readTerminalFile(): Promise<string> {
  const descriptor = await open(
    faultHome + '/restic-terminal.log',
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    // Proof (whole-module modeled reader): each type/UID/GID/link/mode/size/growth removal admits its modeled bad descriptor; ENOENT/EACCES/EIO propagate and acquired descriptors close.
    const metadata = await descriptor.stat();
    if (
      !metadata.isFile() ||
      metadata.uid !== 0 ||
      metadata.gid !== 0 ||
      metadata.nlink !== 1 ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size > 4096
    )
      throw new Error('Invalid fixed terminal receipt file');
    const contents = await descriptor.readFile('utf8');
    if (Buffer.byteLength(contents) > 4096)
      throw new Error('Fixed terminal receipt grew beyond bound');
    return contents;
  } finally {
    await descriptor.close();
  }
}

type FaultOwnerRun = (
  mode: string,
  fault?: RegistryBackupInterruption,
) => Promise<{
  code: number;
  stdout: string;
  stderr: string;
  worker?: {
    pid: number;
    parent: number;
    startTicks: string;
    lockId: string;
    attemptId?: string;
    resticPid?: number;
    mode?: RegistryBackupInterruption;
    elapsedMilliseconds?: number;
  };
}>;

/** Separate bounded root fixtures exercise real backup lifecycle faults; K8s/readers/local provider ports and the offline T2 ordinary-supervisor permit port are substituted. Deadline case intentionally has no baseline/retry, preserving the unchanged180s workload cap. */
export async function proveRegistryBackupInterruption(
  mode: RegistryBackupInterruption,
  run: FaultOwnerRun,
): Promise<void> {
  let stage: 'setup' | 'baseline' | 'interrupt' | 'terminal' | 'retry' = 'setup';
  try {
    await prepareRegistryHostFixture();
    await writeFile(faultHome + '/admission', 'fixture', { mode: 0o600 });
    await writeFile(faultHome + '/restic-terminal.log', '', { mode: 0o600, flag: 'wx' });
    const invoke = async (
      command: 'initialize' | 'backup' | 'backup-contender-acquire' | 'backup-interruption',
      expected: string,
    ) => {
      const completed = await run(command);
      if (completed.code !== 0 || completed.stdout.trim() !== expected) {
        // Proof (whole caller invoke): removing parsed observation loses bounded flags; dropping aggregation loses the original stage failure when reporting fails.
        const failure = new Error('Backup interruption owner stage failed');
        try {
          console.log(
            JSON.stringify({
              backupOwnerFailure: {
                command,
                observed: observeRegistryPopulationOutput(completed.stderr),
              },
            }),
          );
        } catch (cause) {
          throw new AggregateError([failure, cause], 'Backup owner failure observation failed', {
            cause: cause,
          });
        }
        throw failure;
      }
    };
    const readJournal = async () => {
      const journal = parseRegistryCommandResponse({
        state: JSON.parse(await readFile(faultJournal + '/journal.json', 'utf8')),
      } satisfies { state: unknown }).state;
      if (journal.schemaVersion !== 4) throw new Error('Backup fixture requires schema4');
      return journal;
    };
    await invoke('initialize', 'initialized');
    stage = 'baseline';
    if (mode !== 'deadline') await invoke('backup', 'verified-native-backup');
    const before = await readJournal();
    const beforeTerminal = await readTerminalFile();
    if ((mode === 'deadline') !== (before.lastVerifiedBackup === null))
      throw new Error('Unexpected prior verified backup boundary');
    stage = 'interrupt';
    const interrupted = await run('backup-interruption', mode);
    const fault = interrupted.worker;
    if (
      interrupted.code !== (mode === 'owner-eof' ? 137 : 1) ||
      fault?.mode !== mode ||
      fault.attemptId === undefined ||
      fault.resticPid === undefined
    )
      throw new Error('Actual interrupted backup did not reach exact fault');
    stage = 'terminal';
    const after = await readJournal();
    if (
      // Boundary: readJournal narrows to schema4; retain the independent post-owner schema check in this fixture.
      (after.schemaVersion as number) !== 4 ||
      !after.fenced ||
      after.maintenance?.operationId !== 'native-interrupted-backup' ||
      !['stopped', 'failed'].includes(after.maintenance.phase) ||
      JSON.stringify(after.lastVerifiedBackup) !== JSON.stringify(before.lastVerifiedBackup) ||
      after.maintenanceEvidence?.backup !== null ||
      !after.maintenanceEvidence.backupAttempts.some(
        (attempt) => attempt.id === fault.attemptId && attempt.state === 'prepared',
      )
    )
      throw new Error('Interrupted backup lost durable ownership/fence/previous verified snapshot');
    await invoke('backup-contender-acquire', 'backup-authority-acquired-after-group-absence');
    const locks = await readdir(faultHome + '/repository/locks');
    if (mode === 'owner-eof') {
      requireRegistryBackupTerminal(
        await readTerminalFile(),
        beforeTerminal,
        fault.pid,
        fault.resticPid,
        130,
      );
      if (locks.length !== 0) throw new Error('Graceful real restic interruption retained a lock');
    } else {
      if (locks.length !== 1 || locks[0] !== fault.lockId)
        throw new Error('Forced backup did not preserve exact lock');
      if (mode === 'guardian-eof')
        requireRegistryBackupTerminal(
          await readTerminalFile(),
          beforeTerminal,
          fault.pid,
          fault.resticPid,
          137,
        );
    }
    if (mode === 'deadline') {
      const failures = (await readFile(faultHome + '/failure.log', 'utf8'))
        .trim()
        .split('\n')
        .map((line) =>
          type({
            action: 'string',
            ownSignalAborted: 'boolean',
            rootDeadline: 'boolean',
            ownerCancellation: 'boolean',
            other: 'boolean',
            '+': 'reject',
          }).assert(JSON.parse(line)),
        );
      const own = failures.filter((failure) => failure.action === 'backup-snapshot');
      if (
        own.length !== 1 ||
        !own[0]?.rootDeadline ||
        !own[0].ownSignalAborted ||
        own[0].ownerCancellation ||
        fault.elapsedMilliseconds === undefined ||
        fault.elapsedMilliseconds < 110000 ||
        fault.elapsedMilliseconds > 135000
      )
        throw new Error('Actual root deadline was not independently observed');
    } else {
      stage = 'retry';
      await invoke('backup-interruption', 'verified-native-backup');
      const recovered = await readJournal();
      const reconciled = recovered.maintenanceEvidence?.backupReconciliations.find((receipt) =>
        receipt.attemptIds.includes(fault.attemptId ?? ''),
      );
      if (
        // Boundary: retain the independent schema check after the externally dispatched recovery.
        (recovered.schemaVersion as number) !== 4 ||
        recovered.maintenance !== null ||
        !recovered.fenced ||
        recovered.lastVerifiedBackup === null ||
        recovered.lastVerifiedBackup.snapshotId === before.lastVerifiedBackup?.snapshotId ||
        reconciled === undefined ||
        (mode === 'guardian-eof' &&
          !reconciled.removed.some((version) => version.key === 'locks/' + fault.lockId)) ||
        (mode === 'owner-eof' && reconciled.removed.length !== 0) ||
        recovered.maintenanceEvidence?.backupAttempts.some(
          (attempt) => attempt.state === 'prepared',
        ) ||
        (await readdir(faultHome + '/repository/locks')).length !== 0
      )
        throw new Error('Interrupted attempt was not reconciled before fresh verified retry');
    }
    console.log(
      JSON.stringify({
        proof: 'actual-backup-interruption',
        mode,
        controlledResticExit: mode === 'owner-eof' ? 130 : mode === 'guardian-eof' ? 137 : null,
        priorVerifiedBackupPreserved: true,
        authorityContendedThenAcquiredAfterGroupAbsence: true,
        exactLockReconciledBeforeRetry: mode !== 'deadline',
        rootDeadlineBeforeOwnerCancellation: mode === 'deadline',
        synthetic:
          'Kubernetes/readers/local provider admission; offline T2 ordinary-supervisor permit omitted (not ordinary CLI/permission proof); signal fault targets exact owned processes',
      }),
    );
  } catch (cause) {
    try {
      console.log(
        JSON.stringify({
          backupInterruptionFailure: {
            mode,
            stage,
            ...describeRegistryGuardObservationFailure(cause),
          },
        }),
      );
    } catch (observationFailure) {
      // Proof: a reporter failing at both inner and outer diagnostics lost the nested stage/refusal pair in registry-backup-contender.test.ts before this boundary.
      throw new AggregateError(
        [cause, observationFailure],
        'Backup interruption failure observation failed',
        { cause: observationFailure },
      );
    }
    throw cause;
  }
}

/** After the exact guardian and owner have terminated, only PID1 adoption is a valid worker-parent transition. */
export function requireRegistryBackupOrphan(
  observed: RegistryBackupFaultProcess,
  original: RegistryBackupFaultProcess,
): RegistryBackupFaultProcess {
  // Proof (fixture comparison): replacing required PID1 adoption with the observed parent accepts a foreign parent in registry-backup-interruption.test.ts.
  requireRegistryBackupFaultProcess(observed, { ...original, parent: 1 });
  return observed;
}

/** Bind the owned Popen's start ticks to its exact nonroot authority process immediately before a fault. */
export function requireRegistryBackupOwner(
  status: string,
  serialized: string,
  command: string,
  pid: number,
  startTicks: string,
): void {
  const fields = serialized
    .slice(serialized.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/);
  if (
    // Proof (fixture proc text): removing each PID/start/UID/GID/argv check admits its independently changed owner identity.
    !serialized.startsWith(String(pid) + ' (') ||
    fields[19] !== startTicks ||
    !/^Uid:[ \t]+59001[ \t]+59001[ \t]+59001[ \t]+59001$/m.test(status) ||
    !/^Gid:[ \t]+59001[ \t]+59001[ \t]+59001[ \t]+59001$/m.test(status) ||
    command !== process.execPath + '\0' + faultBundle + '\0backup-interruption\0'
  )
    throw new Error('Owned authority process identity changed before fault');
}

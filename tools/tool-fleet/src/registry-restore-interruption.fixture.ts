import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readSync,
  writeSync,
} from 'node:fs';
import { appendFile, readFile, readlink } from 'node:fs/promises';

import { type } from 'arktype';

/** Same operation and verified snapshot/targets across fresh workers; PID and nonce belong to each attempt separately. */
export interface RegistryRestoreFaultLineage {
  operationId: string;
  snapshotId: string;
  registryPath: string;
  journalPath: string;
  targetRegistryPath: string;
  targetJournalPath: string;
}

/** Private one-shot fault state. A consumed record retains the old killed worker, not the identity of a later retry worker. Missing or unreadable state never means consumed. */
export function inspectRegistryRestoreFault(expected: RegistryRestoreFaultLineage) {
  // Proof: removing root admission accepts the modeled non-root caller.
  if (process.getuid?.() !== 0 || process.getgid?.() !== 0)
    throw new Error('Restore fault state requires root');
  const path = '/root/task8-fixture/restore-interruption.json';
  // Proof: removing O_NOFOLLOW opens a real owned symlink target before later refusal.
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let failure: { cause: unknown } | undefined;
  try {
    const before = fstatSync(descriptor);
    // Proof: metadata-guard removal accepts the modeled wrong owner on an actual owned descriptor.
    if (
      !before.isFile() ||
      before.uid !== 0 ||
      before.gid !== 0 ||
      before.nlink !== 1 ||
      (before.mode & 0o7777) !== 0o600
    )
      throw new Error('Unsafe restore fault state metadata');
    const bytes = Buffer.alloc(4097);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    const after = fstatSync(descriptor);
    const current = lstatSync(path);
    // Proof: removing this check accepts a valid 4097-byte record or a pathname replaced during the actual read.
    if (
      length !== before.size ||
      length > 4096 ||
      [after, current].some(
        (status) =>
          !status.isFile() ||
          status.dev !== before.dev ||
          status.ino !== before.ino ||
          status.mode !== before.mode ||
          status.uid !== before.uid ||
          status.gid !== before.gid ||
          status.nlink !== before.nlink ||
          status.size !== before.size ||
          status.mtimeMs !== before.mtimeMs ||
          status.ctimeMs !== before.ctimeMs,
      )
    )
      throw new Error('Restore fault state changed while reading');
    const serialized = bytes.subarray(0, length).toString('utf8');
    // Proof: replacing schema validation with JSON parsing admits unknown one-shot state.
    const record = type({
      operationId: '0 < string <= 256',
      snapshotId: /^[a-f0-9]{64}$/,
      registryPath: "'/var/lib/puni-registry/registry/contents'",
      journalPath: "'/var/lib/puni-registry/journal/contents'",
      targetRegistryPath: "'/var/lib/puni-registry/recovery/registry/contents'",
      targetJournalPath: "'/var/lib/puni-registry/recovery/journal/contents'",

      state: "'armed'",
      '+': 'reject',
    })
      .or({
        operationId: '0 < string <= 256',
        snapshotId: /^[a-f0-9]{64}$/,
        registryPath: "'/var/lib/puni-registry/registry/contents'",
        journalPath: "'/var/lib/puni-registry/journal/contents'",
        targetRegistryPath: "'/var/lib/puni-registry/recovery/registry/contents'",
        targetJournalPath: "'/var/lib/puni-registry/recovery/journal/contents'",

        state: "'consumed'",
        terminal: {
          worker: 'number.safe > 0',
          pid: 'number.safe > 0',
          startTicks: /^[1-9][0-9]{0,19}$/,
          group: 'number.safe > 0',
          exitCode: '137',
          signal: "'SIGKILL'",
          '+': 'reject',
        },
        '+': 'reject',
      })
      .assert(JSON.parse(serialized));
    // Proof: lineage-guard removal admits a record whose source differs from the admitted authority.
    if (
      record.operationId !== expected.operationId ||
      record.snapshotId !== expected.snapshotId ||
      record.registryPath !== expected.registryPath ||
      record.journalPath !== expected.journalPath ||
      record.targetRegistryPath !== expected.targetRegistryPath ||
      record.targetJournalPath !== expected.targetJournalPath
    )
      throw new Error('Restore fault state belongs to another operation, snapshot or target');
    // Proof: historical-member guard removal admits a consumed record with the child as group leader.
    if (
      record.state === 'consumed' &&
      (record.terminal.group !== record.terminal.worker ||
        record.terminal.pid === record.terminal.worker)
    )
      throw new Error('Restore fault terminal is not a worker group member');
    return { ...record, dev: before.dev, ino: before.ino, serialized };
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    try {
      // Proof: removing this read close leaks the owned descriptor until the independent test rescue.
      closeSync(descriptor);
    } catch (closeFailure) {
      // Boundary: descriptor-close failure must refuse even when the read/write would otherwise return successfully.
      // eslint-disable-next-line no-unsafe-finally
      if (failure === undefined) throw closeFailure;
      // Proof: replacing read aggregation with the close error loses the original read failure.
      // Boundary: the primary read error remains cause; the caught close failure is retained in errors.
      // Boundary: the required close failure must remain loud while preserving the primary error.
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        [failure.cause, closeFailure],
        'Restore fault read and close failed',
        // eslint-disable-next-line preserve-caught-error
        { cause: failure.cause },
      );
    }
  }
}

/** Consume only the inspected armed state after the exact current worker observed a killed member. The marker is not itself evidence of group absence; the root controller proves that separately before retry. */
export function consumeRegistryRestoreFault(
  expected: RegistryRestoreFaultLineage,
  before: ReturnType<typeof inspectRegistryRestoreFault>,
  terminal: {
    worker: number;
    pid: number;
    startTicks: string;
    group: number;
    exitCode: number;
    signal: string | null;
  },
): void {
  // Proof: terminal-schema removal writes a consumed record with zero start ticks before later readback refusal.
  const observed = type({
    worker: 'number.safe > 0',
    pid: 'number.safe > 0',
    startTicks: /^[1-9][0-9]{0,19}$/,
    group: 'number.safe > 0',
    exitCode: '137',
    signal: "'SIGKILL'",
    '+': 'reject',
  }).assert(terminal);
  // Proof: current-member guard removal writes foreign worker lineage before later readback refusal.
  if (
    observed.worker !== process.pid ||
    observed.group !== observed.worker ||
    observed.pid === observed.worker
  )
    throw new Error('Restore fault consumption requires the current worker member');
  const current = inspectRegistryRestoreFault(expected);
  // Proof: armed-identity guard removal consumes a replacement inode instead of the inspected one.
  if (
    current.state !== 'armed' ||
    before.state !== 'armed' ||
    current.dev !== before.dev ||
    current.ino !== before.ino ||
    current.serialized !== before.serialized
  )
    throw new Error('Restore fault armed state changed before consumption');
  const descriptor = openSync(
    '/root/task8-fixture/restore-interruption.json',
    constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let failure: { cause: unknown } | undefined;
  try {
    const status = fstatSync(descriptor);
    // Proof: descriptor-identity removal overwrites a substituted armed file before final refusal.
    if (
      !status.isFile() ||
      status.dev !== current.dev ||
      status.ino !== current.ino ||
      status.uid !== 0 ||
      status.gid !== 0 ||
      status.nlink !== 1 ||
      (status.mode & 0o7777) !== 0o600 ||
      status.size !== Buffer.byteLength(current.serialized)
    )
      throw new Error('Restore fault writable descriptor differs');
    const original = Buffer.alloc(status.size + 1);
    const length = readSync(descriptor, original, 0, original.length, 0);
    // Proof: byte-comparison removal overwrites state changed between descriptor admission and write.
    if (
      length !== status.size ||
      original.subarray(0, length).toString('utf8') !== current.serialized
    )
      throw new Error('Restore fault bytes changed before consumption');
    const bytes = Buffer.from(
      JSON.stringify({ ...expected, state: 'consumed', terminal: observed }) + '\n',
    );
    // Proof: return-count removal accepts an injected zero count even though the modeled write persisted bytes.
    if (writeSync(descriptor, bytes, 0, bytes.length, 0) !== bytes.length)
      throw new Error('Incomplete restore fault consumption write');
    // Proof: deleting truncation leaves stale padding and makes the valid consume operation fail readback.
    ftruncateSync(descriptor, bytes.length);
    // Proof: omitting fsync bypasses the injected sync failure and wrongly returns success.
    fsyncSync(descriptor);
    const consumed = inspectRegistryRestoreFault(expected);
    // Proof: removing readback comparison accepts a valid persisted record naming another killed PID.
    if (
      consumed.dev !== current.dev ||
      consumed.ino !== current.ino ||
      consumed.serialized !== bytes.toString('utf8')
    )
      throw new Error('Restore fault consumption was not persisted');
  } catch (cause) {
    failure = { cause };
    throw cause;
  } finally {
    try {
      closeSync(descriptor);
    } catch (closeFailure) {
      // Boundary: descriptor-close failure must refuse even when the read/write would otherwise return successfully.
      // eslint-disable-next-line no-unsafe-finally
      if (failure === undefined) throw closeFailure;
      // Proof: replacing write aggregation with the close error loses the original write failure.
      // Boundary: the primary write error remains cause; the caught close failure is retained in errors.
      // Boundary: the required close failure must remain loud while preserving the primary error.
      // eslint-disable-next-line no-unsafe-finally
      throw new AggregateError(
        [failure.cause, closeFailure],
        'Restore fault write and close failed',
        // eslint-disable-next-line preserve-caught-error
        { cause: failure.cause },
      );
    }
  }
}

/** Fixed private worker hook. The admitted canonical source/targets remain authoritative. Consumed state permits a fresh attempt, while the controller separately proves the old worker/group absent before retry. No partial extraction is implied by stopping a newly returned child. */
export async function interruptRegistryRestoreFixture(input: {
  run: () => Promise<string>;
  current: () => RegistryRestoreFaultLineage;
}): Promise<string> {
  // Proof: root guard removal launches the modeled restore for a non-root caller.
  if (
    process.getuid?.() !== 0 ||
    process.getgid?.() !== 0 ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-restore-kill\0'
  )
    throw new Error('Restore interruption requires exact private root worker');
  const binary = '/root/.puni/tools/restic-0.19.1';
  const spawn = Bun.spawn;
  let observed:
    | Promise<
        | {
            ok: true;
            terminal: {
              worker: number;
              pid: number;
              startTicks: string;
              group: number;
              exitCode: number;
              signal: 'SIGKILL';
            };
          }
        | { ok: false; cause: unknown }
      >
    | undefined;
  // Boundary: the fixed fixture forwards all native options and the identical returned capability; only the exact admitted restore command receives signals.
  Bun.spawn = ((...arguments_: unknown[]) => {
    const command = arguments_[0];
    if (
      !Array.isArray(command) ||
      command[0] !== binary ||
      command[1] !== '--no-cache' ||
      command[2] !== 'restore'
    )
      // Boundary: native overload and arguments are unchanged.
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
    const expected = input.current();
    const registry =
      command[3] === expected.snapshotId + ':' + expected.registryPath &&
      command[5] === expected.targetRegistryPath;
    const journal =
      command[3] === expected.snapshotId + ':' + expected.journalPath &&
      command[5] === expected.targetJournalPath;
    // Proof: command guard removal forwards a different target even with consumed state.
    if (
      command.length !== 7 ||
      command[4] !== '--target' ||
      command[6] !== '--verify' ||
      (!registry && !journal)
    )
      throw new Error('Restore interruption command differs from admitted lineage');
    // Proof: substituting assumed armed state for this required read launches despite missing control state.
    const previous = inspectRegistryRestoreFault(expected);
    // Proof: removing this forwarding branch refuses a valid fresh-worker two-command retry.
    if (previous.state === 'consumed')
      // Boundary: historical consumed state forwards the exact native restore call without replacing its capability.
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
    // Proof: removing first-command/one-shot admission launches a journal-first or second armed restore.
    if (!registry || observed !== undefined)
      throw new Error('Restore interruption requires one first registry restore');
    // Boundary: the saved native spawn returns the only subprocess capability this fixture may signal.
    const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
    // Proof: PID guard removal signals an invalid modeled capability.
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || child.pid === process.pid)
      throw new Error('Invalid owned restore member PID');
    const capture = async () => {
      const terminalState: { confirmed: boolean; failure?: { cause: unknown } } = {
        confirmed: false,
      };
      void child.exited.then(
        () => {
          terminalState.confirmed = true;
        },
        (cause: unknown) => {
          terminalState.failure = { cause };
        },
      );
      try {
        // Proof: omitting STOP loses that signal and reaches the independent modeled stop-loop rescue.
        child.kill('SIGSTOP');
        const path = `/proc/${String(child.pid)}`;
        const readIdentity = async () => {
          const text = await readFile(path + '/stat', 'utf8');
          const boundary = text.lastIndexOf(') ');
          // Proof: stat guard removal requests consumption for oversized or wrong-PID observations.
          if (
            Buffer.byteLength(text) > 65536 ||
            !text.startsWith(String(child.pid) + ' (') ||
            boundary < 3
          )
            throw new Error('Malformed owned restore process identity');
          const fields = text
            .slice(boundary + 2)
            .trim()
            .split(/\s+/);
          const startTicks = fields.at(19);
          // Proof: lineage removal requests consumption for wrong parent/group or invalid start ticks.
          if (
            startTicks === undefined ||
            !/^[1-9][0-9]*$/.test(startTicks) ||
            Number(fields[1]) !== process.pid ||
            Number(fields[2]) !== process.pid
          )
            throw new Error('Owned restore process lineage differs');
          return { state: fields[0], startTicks, group: Number(fields[2]) };
        };
        const deadline = Date.now() + 1000;
        let identity = await readIdentity();
        while (identity.state !== 'T') {
          if (terminalState.failure !== undefined) throw terminalState.failure.cause;
          // Proof: deadline removal reaches explicit modeled sleep rescue instead of the bounded stop refusal.
          if (terminalState.confirmed || identity.state === 'Z' || Date.now() >= deadline)
            throw new Error('Owned restore did not reach stopped state');
          await Bun.sleep(10);
          identity = await readIdentity();
        }
        const [serialized, credentials, executable] = await Promise.all([
          readFile(path + '/cmdline', 'utf8'),
          readFile(path + '/status', 'utf8'),
          readlink(path + '/exe'),
        ]);
        // Proof: credentials/argv/executable/size guard removal requests consumption for each modeled mismatch.
        if (
          Buffer.byteLength(serialized) > 65536 ||
          Buffer.byteLength(credentials) > 65536 ||
          serialized !== command.join('\0') + '\0' ||
          executable !== binary ||
          !/^Uid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(credentials) ||
          !/^Gid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(credentials)
        )
          throw new Error('Stopped restore executable or credentials differ');
        const current = await readIdentity();
        if (terminalState.failure !== undefined) throw terminalState.failure.cause;
        // Proof: final identity removal certifies changed start or sends KILL after modeled natural exit.
        if (
          terminalState.confirmed ||
          current.state !== 'T' ||
          current.startTicks !== identity.startTicks ||
          current.group !== identity.group
        )
          throw new Error('Stopped restore identity changed before kill');
        // Proof: omitting KILL loses its signal before the independent modeled terminal rescue.
        child.kill('SIGKILL');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const exitCode = await Promise.race([
            child.exited,
            // Proof: deleting the timer for pending modeled exit loses the required second rescue KILL.
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => {
                reject(new Error('Owned restore terminal observation timed out'));
              }, 5000);
            }),
          ]);
          // Proof: terminal guard removal requests consumption after observed exit zero or a different signal.
          if (exitCode !== 137 || child.signalCode !== 'SIGKILL')
            throw new Error('Owned restore did not terminate by SIGKILL');
          const terminal = {
            worker: process.pid,
            pid: child.pid,
            startTicks: identity.startTicks,
            group: identity.group,
            exitCode,
            signal: 'SIGKILL' as const,
          };
          // Proof: removing consumption omits the required one-shot transition while the hook otherwise returns its normal refusal.
          consumeRegistryRestoreFault(expected, previous, terminal);
          return { ok: true as const, terminal };
        } finally {
          clearTimeout(timer);
        }
      } catch (cause) {
        try {
          // Proof: incorrectly treating rejected exit observation as confirmed terminal suppresses this rescue.
          if (!terminalState.confirmed) child.kill('SIGKILL');
        } catch (cleanupFailure) {
          // Proof: replacing rescue aggregation with the signal error loses the original observation cause.
          // Boundary: the observed failure remains primary; the caught rescue error is retained in AggregateError.errors.
          throw new AggregateError(
            [cause, cleanupFailure],
            'Owned restore observation and rescue failed',
            // Boundary: retain the original failure as cause and the caught cleanup failure in errors.
            // eslint-disable-next-line preserve-caught-error
            { cause },
          );
        }
        throw cause;
      }
    };
    observed = capture().catch((cause: unknown) => ({ ok: false as const, cause }));
    return child;
  }) as typeof Bun.spawn;
  let outcome: { ok: true; receipt: string } | { ok: false; cause: unknown };
  try {
    outcome = { ok: true, receipt: await input.run() };
  } catch (cause) {
    outcome = { ok: false, cause };
  } finally {
    // Proof: removing restoration leaves the modeled native spawn replaced after worker refusal.
    Bun.spawn = spawn;
  }
  if (observed === undefined) {
    if (!outcome.ok) throw outcome.cause;
    return outcome.receipt;
  }
  try {
    const observation = await observed;
    // Proof: removing required observation refusal writes an empty terminal receipt after failed identity checks.
    if (!observation.ok) throw observation.cause;
    await appendFile(
      '/root/task8-fixture/restore-interruption.log',
      JSON.stringify({ restoreInterruption: observation.terminal }) + '\n',
      { mode: 0o600 },
    );
    // Proof: removing this controlled refusal propagates undefined instead of an Error for unexpected dispatch success.
    if (outcome.ok) throw new Error('Killed restore unexpectedly completed dispatch');
  } catch (cause) {
    // Proof: replacing report aggregation with the reporter error loses the original worker failure.
    if (!outcome.ok && cause !== outcome.cause)
      // Boundary: original worker failure remains primary, with the caught required observation failure retained in errors.
      throw new AggregateError(
        [outcome.cause, cause],
        'Restore dispatch and interruption observation failed',
        // eslint-disable-next-line preserve-caught-error
        { cause: outcome.cause },
      );
    throw cause;
  }
  throw outcome.cause;
}

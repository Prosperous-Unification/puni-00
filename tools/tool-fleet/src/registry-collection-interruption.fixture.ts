import { appendFile, readFile, readlink } from 'node:fs/promises';

import { executeRegistryHostAction } from './registry-maintenance-actions';

/**
 * Fixed private GC interruption after unchanged production admission. Only the returned native
 * child is stopped; exact stopped executable/argv/credentials/start/parent/group are required
 * before SIGKILL becomes evidence. A fast natural exit is not an interruption witness. The
 * production owner retains responsibility for terminal/group cleanup and its original failure.
 */
export async function interruptRegistryCollectionFixture(
  input: Parameters<typeof executeRegistryHostAction>[0],
): Promise<string> {
  // Proof: extracted-caller root/action/PID1 removals spawn the forbidden modeled child.
  if (
    process.getuid?.() !== 0 ||
    input.request.action !== 'collect' ||
    (await readFile('/proc/1/cmdline', 'utf8')) !==
      '/usr/local/libexec/puni-registry-authority/bun\0/usr/local/libexec/puni-registry-maintenance/proof.js\0prove-gc-kill\0'
  )
    throw new Error('Collection interruption requires exact private fixture');
  const spawn = Bun.spawn;
  let observed:
    | Promise<
        | {
            ok: true;
            pid: number;
            startTicks: string;
            group: number;
            exitCode: number;
            signal: 'SIGKILL';
          }
        | { ok: false; cause: unknown }
      >
    | undefined;
  // Boundary: this private fixed caller forwards native options and the identical returned capability; only the exact installed GC command receives an owned signal.
  Bun.spawn = ((...arguments_: unknown[]) => {
    const command = arguments_[0];
    if (
      !Array.isArray(command) ||
      command[0] !== input.installed.distribution.path ||
      command[1] !== 'garbage-collect'
    )
      // Boundary: unchanged arguments invoke the saved native overload and return its subprocess capability.
      return Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
    // Proof: duplicate/configuration removals allow a second spawn or a false interruption receipt.
    if (
      observed !== undefined ||
      command.length !== 3 ||
      command[2] !== input.installed.deletionConfiguration.path
    )
      throw new Error('Collection interruption refuses another GC command');
    // Boundary: Reflect invokes the saved native spawn overload with its original arguments and returns that native subprocess capability.
    const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof Bun.spawn>;
    // Proof: PID-check removal signals the invalid returned capability in the modeled caller.
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
      throw new Error('Invalid owned GC child PID');
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
        child.kill('SIGSTOP');
        const path = `/proc/${String(child.pid)}`;
        const readIdentity = async () => {
          const text = await readFile(path + '/stat', 'utf8');
          const boundary = text.lastIndexOf(') ');
          // Proof: oversized stat and wrong-PID removals produce false interruption receipts.
          if (
            Buffer.byteLength(text) > 65536 ||
            !text.startsWith(String(child.pid) + ' (') ||
            boundary < 3
          )
            throw new Error('Malformed owned GC process identity');
          const fields = text
            .slice(boundary + 2)
            .trim()
            .split(/\s+/);
          const startTicks = fields.at(19);
          // Proof: parent/start lineage removals accept unrelated or malformed modeled identities.
          if (
            startTicks === undefined ||
            !/^[1-9][0-9]*$/.test(startTicks) ||
            Number(fields[1]) !== process.pid ||
            Number(fields[2]) !== child.pid
          )
            throw new Error('Owned GC process lineage differs');
          return { state: fields[0], startTicks, group: Number(fields[2]) };
        };
        const deadline = Date.now() + 1000;
        let identity = await readIdentity();
        while (identity.state !== 'T') {
          if (terminalState.failure !== undefined) throw terminalState.failure.cause;
          // Proof: removing the stop deadline reaches the independent modeled sleep rescue instead of bounded refusal.
          if (terminalState.confirmed || identity.state === 'Z' || Date.now() >= deadline)
            throw new Error('Owned GC did not reach stopped state');
          await Bun.sleep(10);
          identity = await readIdentity();
        }
        const [serialized, credentials, executable] = await Promise.all([
          readFile(path + '/cmdline', 'utf8'),
          readFile(path + '/status', 'utf8'),
          readlink(path + '/exe'),
        ]);
        // Proof: status-bound/executable/UID/GID removals emit false receipts for the corresponding modeled faults.
        if (
          Buffer.byteLength(serialized) > 65536 ||
          Buffer.byteLength(credentials) > 65536 ||
          serialized !== command.join('\0') + '\0' ||
          executable !== input.installed.distribution.path ||
          !/^Uid:[ \t]+59001[ \t]+59001[ \t]+59001[ \t]+59001$/m.test(credentials) ||
          !/^Gid:[ \t]+59001[ \t]+59001[ \t]+59001[ \t]+59001$/m.test(credentials)
        )
          throw new Error('Stopped GC executable or credentials differ');
        const current = await readIdentity();
        if (terminalState.failure !== undefined) throw terminalState.failure.cause;
        // Proof: final start/state comparison removals certify a changed modeled child.
        if (
          terminalState.confirmed ||
          current.state !== 'T' ||
          current.startTicks !== identity.startTicks ||
          current.group !== identity.group
        )
          throw new Error('Stopped GC identity changed before kill');
        child.kill('SIGKILL');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const exitCode = await Promise.race([
            child.exited,
            // Proof: deleting this timer with pending modeled exit loses the rescue SIGKILL before an independent modeled terminal rescue.
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(() => {
                reject(new Error('Owned GC terminal observation timed out'));
              }, 5000);
            }),
          ]);
          // Proof: terminal-check removal emits a successful interruption receipt for observed exit code zero.
          if (exitCode !== 137 || child.signalCode !== 'SIGKILL')
            throw new Error('Owned GC did not terminate by SIGKILL');
          return {
            ok: true as const,
            pid: child.pid,
            startTicks: identity.startTicks,
            group: identity.group,
            exitCode,
            signal: 'SIGKILL' as const,
          };
        } finally {
          clearTimeout(timer);
        }
      } catch (cause) {
        try {
          // Proof: treating rejected exit observation as terminal suppresses the required modeled rescue signal.
          if (!terminalState.confirmed) child.kill('SIGKILL');
        } catch (cleanupFailure) {
          // Proof: rescue-aggregation removal loses the original observation failure alongside the thrown signal error.
          // Boundary: the observed failure remains primary; the caught rescue error is retained in AggregateError.errors.
          throw new AggregateError(
            [cause, cleanupFailure],
            'Owned GC observation and rescue failed',
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
  let failure: { cause: unknown } | undefined;
  try {
    await executeRegistryHostAction(input);
  } catch (cause) {
    failure = { cause };
  } finally {
    // Proof: removing restoration leaves the substituted spawn installed after dispatch refusal.
    Bun.spawn = spawn;
  }
  try {
    if (observed === undefined) throw new Error('No actual GC interruption was observed');
    const terminal = await observed;
    if (!terminal.ok) throw terminal.cause;
    let groupAbsent = false;
    try {
      process.kill(-terminal.group, 0);
    } catch (cause) {
      // Proof: errno/type removals wrongly certify group absence for EPERM or a non-Error object.
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')) throw cause;
      groupAbsent = true;
    }
    // Proof: group-absence removal emits a receipt while the modeled group remains live.
    if (!groupAbsent) throw new Error('Interrupted GC group cleanup is unconfirmed');
    await appendFile(
      '/root/task8-fixture/collection-interruption.log',
      JSON.stringify({
        collectionInterruption: {
          pid: terminal.pid,
          startTicks: terminal.startTicks,
          group: terminal.group,
          exitCode: terminal.exitCode,
          signal: terminal.signal,
          groupAbsent,
        },
      }) + '\n',
      { mode: 0o600 },
    );
    if (failure === undefined) throw new Error('Killed GC unexpectedly completed dispatch');
  } catch (cause) {
    // Proof: reporter-aggregation removal loses the original dispatch cause when receipt writing fails.
    if (failure !== undefined && cause !== failure.cause)
      // Boundary: the dispatch failure stays primary; the caught observation error is also retained in AggregateError.errors.
      throw new AggregateError(
        [failure.cause, cause],
        'GC dispatch and interruption observation failed',
        // Boundary: retain the original dispatch cause and the caught observation failure in errors.
        // eslint-disable-next-line preserve-caught-error
        { cause: failure.cause },
      );
    throw cause;
  }
  throw failure.cause;
}

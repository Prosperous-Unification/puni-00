import { appendFile } from 'node:fs/promises';

import { type } from 'arktype';

/** Exact current restic terminal suffix; older baseline receipts remain unchanged. */
export function requireRegistryBackupTerminal(
  contents: string,
  before: string,
  worker: number,
  pid: number,
  exitCode: 130 | 137,
): void {
  // Proof (fixture parser): bound/prefix removals admit valid oversized JSON or a changed baseline; count/schema and identity/outcome removals admit extra records or foreign terminals in registry-backup-interruption.test.ts.
  if (Buffer.byteLength(contents) > 4096 || !contents.startsWith(before))
    throw new Error('Owned terminal receipt prefix/bound differs');
  // Boundary: unchecked index typing assumes a suffix entry; the parser must still refuse a missing record.
  const suffix: (string | undefined)[] = contents.slice(before.length).split('\n');
  if (suffix.length !== 2 || suffix[1] !== '' || suffix[0] === undefined || suffix[0] === '')
    throw new Error('Expected exactly one owned terminal receipt');
  const terminal = type({
    worker: 'number.safe > 0',
    pid: 'number.safe > 0',
    exitCode: 'number.safe >= 0',
    signal: "null|'SIGINT'|'SIGKILL'",
    '+': 'reject',
  }).assert(JSON.parse(suffix[0]));
  if (
    terminal.worker !== worker ||
    terminal.pid !== pid ||
    terminal.exitCode !== exitCode ||
    (exitCode === 137 && terminal.signal !== 'SIGKILL') ||
    (exitCode === 130 && terminal.signal !== null)
  )
    throw new Error('Owned terminal receipt identifies another effect or outcome');
}

/** Fixed owned restic observation; actual effects and returned child capabilities are unchanged. The closed backup action starts at most one backup command; inspection/verification children pass through unobserved. */
export async function observeRegistryBackupTerminal(run: () => Promise<string>): Promise<string> {
  const spawn = Bun.spawn;
  const terminals: Promise<{ ok: true } | { ok: false; cause: unknown }>[] = [];
  // Boundary: the fixture forwards the native overloaded spawn and exact child unchanged, observing only the pinned backup command; caller request bytes never select this hook.
  Bun.spawn = ((...arguments_: unknown[]) => {
    // Boundary: captured Bun.spawn guarantees the returned Subprocess; Reflect.apply erases its overload type. Stdio stays opaque.
    const child = Reflect.apply(spawn, Bun, arguments_) as ReturnType<typeof spawn>;
    const command = arguments_[0];
    if (
      Array.isArray(command) &&
      command[0] === '/root/.puni/tools/restic-0.19.1' &&
      command[1] === '--no-cache' &&
      command[2] === 'backup'
    ) {
      // Proof (fixture spawn model): PID/exit/signal removals accept invalid child outcomes; await/required-observation removals settle early or swallow a failed receipt write in registry-backup-terminal.test.ts.
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
        throw new Error('Invalid owned restic child');
      terminals.push(
        child.exited
          .then(async (exitCode: number) => {
            const signal = child.signalCode;
            if (
              !Number.isSafeInteger(exitCode) ||
              exitCode < 0 ||
              exitCode > 255 ||
              ![null, 'SIGINT', 'SIGKILL'].includes(signal)
            )
              throw new Error('Invalid owned restic terminal');
            await appendFile(
              '/root/task8-fixture/restic-terminal.log',
              JSON.stringify({ worker: process.pid, pid: child.pid, exitCode, signal }) + '\n',
              { mode: 0o600 },
            );
          })
          .then(
            () => ({ ok: true as const }),
            (cause: unknown) => ({ ok: false as const, cause }),
          ),
      );
    }
    return child;
  }) as typeof Bun.spawn;
  try {
    const outcome = await run().then(
      (receipt) => ({ ok: true as const, receipt }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
    const observations = await Promise.all(terminals);
    const failures = observations.filter((observation) => !observation.ok);
    if (failures.length > 0)
      throw new AggregateError(
        [...(outcome.ok ? [] : [outcome.cause]), ...failures.map((failure) => failure.cause)],
        'Required owned restic observation failed',
      );
    if (!outcome.ok) throw outcome.cause;
    return outcome.receipt;
  } finally {
    Bun.spawn = spawn;
  }
}
